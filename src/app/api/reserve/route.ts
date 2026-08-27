import { NextResponse } from "next/server";
import { getPayloadClient, getSiteSettings } from "@/lib/payload";
import {
  rateLimit,
  rateLimitAll,
  rateLimitIdentity,
  readJsonBody,
} from "@/lib/apiGuard";
import type { ReservationError } from "@/lib/reservationErrors";
import { canSeat } from "@/lib/capacity";
import { resolveLocale } from "@/i18n/config";
import { guestPassUrl } from "@/lib/guestPass";
import { loadSchedule } from "@/lib/schedule";
import { AUTO_CONFIRM, effectiveConfirmationMode } from "@/lib/reservationMail";
import {
  isBookable,
  isOnGrid,
  nowMinutesInAmsterdam,
  resolveBookingRules,
  slotsFor,
  todayInAmsterdam,
  weekIsEmpty,
} from "@/lib/openingHours";

/**
 * Public endpoint for reservation requests.
 *
 * Everything is validated here, on the server: the browser form is a
 * convenience, not a gate. The document is assembled field by field on
 * purpose, never spread from the request body, so a caller cannot smuggle in
 * `status`, `source` or any other field the form has no business setting.
 *
 * Refusals answer with a code from src/lib/reservationErrors.ts rather than a
 * sentence. The site is bilingual, and a Dutch sentence is not something the
 * English page can do anything sensible with.
 *
 * Two things it deliberately no longer does. It does not read the seven weekly
 * CMS rows itself — src/lib/schedule.ts does, and folds the repeating rules and
 * the one-off exceptions in, so a table on the last Sunday of the month is
 * accepted and one on a closed Boxing Day is not. And it does not send the
 * mail: the row is created with `emailStatus` "pending" and the collection's
 * own afterChange hook takes it from there (see src/lib/outboundEmail.ts), so a
 * mail server having a bad afternoon can no longer fail a booking that is
 * already safely stored.
 *
 * Two more habits worth knowing about before changing anything here. The
 * throttle counts bookings rather than attempts — a guest who mistypes an
 * e-mail address, is refused for want of seats and then dithers past the lead
 * time has made three requests and nought bookings, and the old arrangement
 * locked them out for ten minutes on the fourth try. And a request identical
 * to one stored moments ago is answered with that booking rather than written
 * a second time, because on a phone in a basement the lost thing is usually
 * the answer, not the booking. Both are spelled out where they happen.
 *
 * And one thing it does that it did not. A request that is stored answers with
 * the guest pass link beside `ok`, because the person who booked is the only
 * one who can put that link in front of the party — and until this endpoint
 * handed it over they were the one person never given it: the owners had it in
 * their notification mail, and the guest had a thank-you and nothing else.
 * The guest's own confirmation carries the link as well now, but only in the
 * modes that send one at all, and in the default mode only once somebody has
 * pressed Bevestigd — so the screen they are already looking at is still the
 * one place it reaches every guest, whatever the owners have set.
 */

const MAX = {
  name: 120,
  email: 200,
  phone: 40,
  time: 10,
  notes: 2000,
};

/** Used whenever the CMS number is missing or nonsense. */
const FALLBACK = {
  durationMinutes: 120,
};

/**
 * The three throttles, and what each is actually protecting.
 *
 * `ATTEMPTS` is the flood guard: it stands in front of the body reader, counts
 * every request whatever becomes of it, and is set high enough that no real
 * guest can reach it. It used to be the only one, set at five, which meant a
 * guest correcting a typo, being told twice that their time was full and then
 * booking successfully had spent their whole budget on one table — and the
 * sixth request, the one moving that table half an hour later, was refused
 * with "je hebt net al een aanvraag gestuurd".
 *
 * `BOOKINGS` and `PER_EMAIL` are counted at the write, so nothing a guest gets
 * wrong costs them anything. The address is the second key because the first
 * one is weak here: Dutch mobile puts thousands of subscribers behind one
 * carrier NAT address, so an IP bucket sized for a household is shared by a
 * town, while an address is what a booking is confirmed on and cannot be
 * rotated without giving us a different one to ring.
 */
const LIMIT = {
  ATTEMPTS: 60,
  BOOKINGS: 10,
  PER_EMAIL: 5,
};

/**
 * How long an identical request is read as the same booking rather than a
 * second one. Long enough to cover a guest pressing the button again after a
 * lost answer and a slow retry behind it, short enough that a table genuinely
 * asked for twice in an evening — the same party, the same hour, booked once
 * and then again after a phone call — is still two rows.
 */
const DUPLICATE_WINDOW_MINUTES = 10;

const fail = (code: ReservationError, status = 400) =>
  NextResponse.json({ error: code }, { status });

/**
 * A refusal that carries the number it was measured against.
 *
 * Two of the sentences in the guest's dictionary name a limit — the horizon in
 * days, the largest party — and both limits live in the CMS, so a form holding
 * a stale copy of them would otherwise print a number this endpoint is not
 * using. The copy on the sheet said "kies een datum binnen een jaar" while the
 * endpoint refused anything past ninety days, which sent guests off to try
 * other dates inside the year and be refused all over again.
 */
const failWith = (
  code: ReservationError,
  extra: Record<string, number>,
  status = 400,
) => NextResponse.json({ error: code, ...extra }, { status });

/** Trims and caps; anything that is not a string becomes an empty string. */
function str(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max + 1) : "";
}

/** A CMS number that is actually a number, or the fallback. */
function count(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export async function POST(request: Request) {
  if (!rateLimit(request, "reserve", LIMIT.ATTEMPTS)) {
    return fail("rateLimited", 429);
  }

  const read = await readJsonBody(request);
  if (!read.ok) {
    return fail(read.status === 413 ? "tooLarge" : "badRequest", read.status);
  }
  const input = read.data;

  try {
    // Honeypot: a field no human ever sees, let alone fills in. Answer 200 so
    // a bot cannot tell a swallowed submission from a stored one.
    //
    // Word for word what it has always been, and deliberately without the guest
    // pass link the answer below carries. Nothing was written here, so there is
    // no token to build one from, and minting one anyway would be worse in both
    // directions: a real link would hand a spam robot a live page belonging to
    // nobody, and a fabricated one would advertise an address that answers with
    // "this link no longer works". The link's absence is a difference a patient
    // bot could measure, but only by sending a booking in earnest first — which
    // is a booking the owners have to deal with either way, and precisely what
    // the honeypot was never able to stop.
    if (str(input.website, 200)) {
      return NextResponse.json({ ok: true });
    }

    const settings = await getSiteSettings();

    // The owners can take the form out of service — a long closure, a kitchen
    // rebuild — and while it is off nothing is accepted, however the request
    // got here.
    if (settings.reservationsEnabled === false) {
      return fail("reservationsClosed", 503);
    }

    // The lead time, the horizon and the largest party, sanitised once and in
    // the same way the reserveren page and /api/availability sanitise them.
    // They were three separate readings of the same three fields, and they
    // disagreed: the form offered ninety days where this accepted whatever the
    // CMS said, and a party size above thirty passed every check here only to
    // be thrown out by the collection as a 500. `resolveBookingRules` clamps
    // to what the collection will actually store.
    const rules = resolveBookingRules(settings);

    const name = str(input.name, MAX.name);
    const email = str(input.email, MAX.email);
    const phone = str(input.phone, MAX.phone);
    const date = str(input.date, 10);
    const time = str(input.time, MAX.time);
    // There was a `const occasion` here, read out of the body for the sake of
    // browser bundles cached from before the form stopped asking. The column is
    // gone now — it was never filled in by a single guest — so an old bundle's
    // extra field is simply ignored, which is a better answer than the refusal
    // it used to be able to earn: nothing about a booking depended on it.
    const notes = str(input.notes, MAX.notes);

    if (!name) return fail("nameRequired");
    if (name.length > MAX.name) return fail("nameTooLong");

    // The phone number is how the café confirms a table, so it is no longer
    // optional — which is also why nothing asks the guest to ring up about a
    // large party any more.
    if (!phone) return fail("phoneRequired");
    if (phone.length > MAX.phone) return fail("phoneTooLong");

    if (!email) return fail("emailRequired");
    if (email.length > MAX.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return fail("emailInvalid");
    }
    if (notes.length > MAX.notes) return fail("notesTooLong");

    // Guests: a whole number, and no larger than the party the owners are
    // willing to take through a form. Bigger than that is a conversation, and
    // the number lives in the CMS so they can change their minds about it
    // without a deploy.
    const guestsRaw = input.guests;
    const guests =
      typeof guestsRaw === "number"
        ? guestsRaw
        : typeof guestsRaw === "string" && guestsRaw.trim() !== ""
          ? Number(guestsRaw)
          : NaN;
    if (!Number.isInteger(guests) || guests < 1 || guests > rules.maxPartySize) {
      return failWith("guestsInvalid", { max: rules.maxPartySize });
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return fail("dateRequired");
    const parsed = new Date(`${date}T12:00:00.000Z`);
    if (Number.isNaN(parsed.getTime())) return fail("dateInvalid");
    // Round trip check, so 2026-02-31 is caught instead of rolling into March.
    if (parsed.toISOString().slice(0, 10) !== date) {
      return fail("dateInvalid");
    }
    const today = todayInAmsterdam();
    if (date < today) {
      return fail("datePast");
    }
    // The same horizon the date picker draws. It used to be a year here and
    // ninety days there, which meant a request the form could never produce
    // was accepted anyway — and a booking that far out is a diary entry
    // nobody will remember making.
    const horizon = new Date(
      new Date(`${today}T12:00:00.000Z`).getTime() +
        rules.horizonDays * 86_400_000,
    );
    if (date > horizon.toISOString().slice(0, 10)) {
      return failWith("dateTooFar", { days: rules.horizonDays });
    }

    // The grid the owners set, refused here rather than left to the schedule
    // check below. `isBookable` walks the same grid, but that call sits behind
    // `enforce`, which is false whenever the seven weekly CMS rows are empty or
    // unreadable — the state the comment a few lines down deliberately lets
    // through so the owners can sort it out on the phone. On that one path a
    // hand-rolled "19:07" walked past every check in this file, reached
    // `payload.create`, and was thrown out by the `time` field's own validate
    // as a ValidationError that the catch at the bottom could only turn into
    // "Er ging iets mis aan onze kant" — a 500 for the guest and a stack trace
    // for the owners, over a typo in a time. A guest who asks for a time we do
    // not take now gets a sentence about the time, on every path.
    //
    // It was a literal `^([01]\d|2[0-3]):(00|30)$` here until the sittings
    // became a CMS setting, at which point a second spelling of the grid was a
    // second thing to remember to change: the form would have offered 19:15
    // and this line would have refused it. `isOnGrid` is the one place the
    // arithmetic lives, and it is handed the same number the form was.
    if (!isOnGrid(time, rules.slotMinutes)) return fail("timeInvalid");

    // The form only offers days and times the café is actually open for, but
    // the form is a convenience and not a gate: the same schedule is resolved
    // here — week, repeating rules and exceptions together — so a hand-rolled
    // request cannot book a table on a Tuesday when the doors are shut, and a
    // day the owners opened by hand is accepted like any other.
    const { input: schedule, days } = await loadSchedule(date, date, undefined, settings);
    const day = days[0];

    // An empty week is a CMS nobody has filled in yet, not a café that never
    // opens. Enforcing hours nobody typed would refuse every request, so when
    // there is nothing to enforce and no rule or exception spoke about this
    // day, the request is taken and the owners sort it out on the phone.
    const enforce = !(weekIsEmpty(schedule.week) && day?.source === "week");

    // Today is measured against the clock as well: a table an hour from now is
    // a phone call, and one this morning is not a booking at all.
    const notBefore =
      date === today ? nowMinutesInAmsterdam() + rules.leadMinutes : -1;

    if (enforce && day) {
      if (day.closed || day.ranges.length === 0) return fail("dayClosed");
      // Both calls carry the gap before closing as well as the grid, because
      // the form that produced this time laid its own sittings out with both.
      // Hand this one sixty while the owners have set ninety and the endpoint
      // accepts a table the form never offered; hand it the other way round and
      // it refuses one the guest was just shown, which is the same 500-shaped
      // afternoon this file has had before.
      if (
        !isBookable(
          day.ranges,
          time,
          -1,
          rules.slotMinutes,
          rules.lastSittingMinutes,
        )
      ) {
        return fail("timeOutsideHours");
      }
      if (
        !isBookable(
          day.ranges,
          time,
          notBefore,
          rules.slotMinutes,
          rules.lastSittingMinutes,
        )
      ) {
        return fail("timePassed");
      }
    }

    // Which language the form was filled in in. It does two jobs now: the link
    // handed back below is the one this guest can read, and the value is stored
    // on the row, because by the time the confirmation is written the request
    // that knew the answer is long gone.
    //
    // Still not trusted — anything that is not one of the two becomes Dutch —
    // but the cost of that fallback has gone up since it was written. It used
    // to be a missing /en on a page that would have been offered in Dutch
    // anyway; it is now also a Dutch confirmation mail to an English party. The
    // owners can correct it on the row before they confirm, which is the whole
    // reason that field is editable rather than read-only.
    const locale = resolveLocale(str(input.locale, 8));

    const payload = await getPayloadClient();

    /**
     * The link to the table's own page, for whichever row this request ends up
     * being about — the one it writes, or the one it turns out to be a repeat
     * of. Both answers have to carry it, or a guest whose first answer went
     * missing would press the button again and get a success screen with the
     * share block torn off it.
     *
     * The token was minted by the collection's own beforeChange hook, which is
     * why it is read off the document rather than invented here: there is one
     * place a token comes from, and it is not this one. Nothing else about the
     * row is echoed back — the browser being answered typed the rest of it.
     *
     * The switch in Site Instellingen decides whether the link is handed over
     * at all. With the guest pass off, /api/guest-pass refuses every companion's
     * answer and the page stops asking for one, so pressing the address on a
     * guest at the moment they are most likely to forward it would be sending a
     * whole party to something the owners have quietly withdrawn. The field is
     * then absent rather than null, and the form reads absent as "say nothing",
     * which leaves the success screen exactly as it was before any of this.
     */
    const accepted = (guestToken: unknown) => {
      const token = typeof guestToken === "string" ? guestToken : "";
      const pass =
        settings.guestPassEnabled && token ? guestPassUrl(locale, token) : null;
      return NextResponse.json(
        pass ? { ok: true, guestPassUrl: pass } : { ok: true },
      );
    };

    /**
     * The same booking, sent twice.
     *
     * A phone on 4G in the café's basement submits at 19:58, the row is
     * written, the owners' notification is queued, and the answer is lost on
     * the way back. The form shows "er ging iets mis aan onze kant", the button
     * comes back to life, and the guest presses it again — which used to leave
     * Sanne with two tables for eight on Saturday at eight, the owners with two
     * notification mails and two entries in the agenda, and sixteen of forty
     * seats taken by one party of eight. So a request that matches a booking
     * made in the last few minutes is answered with that booking.
     *
     * Deliberately in front of the seat count rather than behind it, because
     * the first request's own seats are already in the room: for a party that
     * nearly fills the place, checking the chairs first would answer the second
     * press with "dat tijdstip is helaas vol" — about a table they have got.
     *
     * The day is matched as a whole rather than by the exact stored instant, so
     * a row an owner typed in by hand at midnight counts too. The party size is
     * not matched at all: the same address at the same table at the same hour
     * is one booking whether they said six or eight, and two rows an hour apart
     * in the agenda is precisely the mess this is here to prevent.
     *
     * A lookup that fails is not allowed to fail the booking — the same
     * judgement src/lib/capacity.ts makes about an unreadable day. The worst it
     * costs is the duplicate this was meant to catch.
     */
    const since = new Date(
      Date.now() - DUPLICATE_WINDOW_MINUTES * 60_000,
    ).toISOString();
    const twin = await payload
      .find({
        collection: "reservations",
        overrideAccess: true,
        depth: 0,
        limit: 1,
        sort: "-createdAt",
        select: { guestToken: true },
        where: {
          and: [
            { email: { equals: email } },
            { date: { greater_than_equal: `${date}T00:00:00.000Z` } },
            { date: { less_than_equal: `${date}T23:59:59.999Z` } },
            { time: { equals: time } },
            { status: { not_equals: "geannuleerd" } },
            { createdAt: { greater_than: since } },
          ],
        },
      })
      .then((res) => res.docs[0] ?? null)
      .catch((error) => {
        console.error("duplicate check unavailable, writing anyway", error);
        return null;
      });
    if (twin) return accepted(twin.guestToken);

    // Seats. Everything above this line is about whether the café is open;
    // this is about whether there is anywhere to sit once it is.
    //
    // Read now and written a few lines below, with nothing holding the room
    // still in between. Two browsers asking for the last four seats within the
    // same fifty milliseconds both find four free and both get a table, and
    // the room is booked to forty-four of forty. That is accepted rather than
    // fixed, and it is worth saying why: at this café's volume it needs two
    // strangers submitting inside the same tenth of a second, the duplicate
    // guard above already closes the version of it that actually happens — the
    // same guest pressing twice — and the honest fix is a transaction at an
    // isolation level Payload does not expose, not a second read that would
    // merely narrow the window while looking like a cure. If it ever does
    // happen the owners find two bookings in the agenda and ring one of them,
    // which is the same afternoon they would have had before any of this
    // counting existed.
    const capacity = Number(settings.reservationCapacity);
    if (Number.isFinite(capacity) && capacity > 0 && day) {
      const seated = await canSeat(date, time, guests, {
        capacity,
        durationMinutes: count(
          settings.reservationDurationMinutes,
          FALLBACK.durationMinutes,
        ),
        // Judged against everything the day could still offer, so "this
        // sitting is taken" and "the whole day is gone" stay different
        // answers — one is solved by another time, the other is not.
        slots: slotsFor(
          day.ranges,
          notBefore,
          rules.slotMinutes,
          rules.lastSittingMinutes,
        ),
        slotMinutes: rules.slotMinutes,
      });
      if (!seated.ok) return fail(seated.reason, 409);
    }

    /**
     * Past every refusal, so this is a booking rather than an attempt — and
     * the only place the two tighter throttles are counted. Everything a guest
     * can get wrong is behind them: a mistyped address, a sitting that filled
     * while the form was open, a time that slipped past the lead cutoff. None
     * of it costs them a booking any more, which is the whole point.
     *
     * The address is lower-cased for the key alone, so Anne@… and anne@… land
     * in one bucket. It is not what gets stored: the row keeps the address
     * exactly as the guest wrote it.
     *
     * Both buckets go in one call because they used to be asked one after the
     * other with `||`, and passing a bucket is what records in it. A guest
     * already at their per-e-mail limit had therefore spent one of the ten
     * address slots before the e-mail bucket refused them — on that attempt and
     * on every further one, so ten refusals of a single guest also emptied the
     * address bucket for everybody else behind the same carrier NAT, and the
     * promise above was untrue for exactly the requests that got this far.
     * `rateLimitAll` asks both before answering either and records only when
     * both have room.
     */
    if (
      !rateLimitAll([
        {
          identity: rateLimitIdentity(request),
          bucket: "reserve:booking",
          limit: LIMIT.BOOKINGS,
        },
        {
          identity: email.toLowerCase(),
          bucket: "reserve:email",
          limit: LIMIT.PER_EMAIL,
        },
      ])
    ) {
      return fail("rateLimited", 429);
    }

    /*
     * Whether the café is taking this booking on the spot or waiting for a
     * person, as the owners set it in Site Instellingen. Read from the settings
     * this request has already fetched, because deciding it here is the point:
     * the hook that would otherwise have to answer the same question would be
     * asking the CMS on every single write to the collection.
     *
     * "approval" and "off" both leave everything below exactly as it has always
     * been written, which is what makes this safe to deploy: the default
     * changes nobody's Tuesday.
     */
    const auto =
      effectiveConfirmationMode(settings) === "auto";

    /*
     * The owners are told by the collection's own afterChange hook rather than
     * from here (see src/lib/outboundEmail.ts). The row is created with
     * emailStatus "pending", the hook sends the message and writes the outcome
     * back onto the row, and a failed send is then a retry the owners can do
     * from the admin. Sending from this route as well would mail every request
     * twice, which is precisely what moving the send out of it was meant to
     * end. That much is the same in all three modes: a table booked without
     * anybody looking at it is more worth telling the owners about, not less.
     *
     * The language is stored now rather than only echoed back in the answer.
     * It used to be resolved here, spent on the guest pass link and then thrown
     * away, so every row arrived as Nederlands: an English party who booked
     * through the English page got a Dutch confirmation with a Dutch link
     * unless an owner remembered to change the field before pressing Bevestigd
     * — and the whole reason that field is on the row is that the request which
     * knew the answer is long gone by then.
     *
     * And the auto branch, which is the only thing the mode changes here. The
     * row is created already at Bevestigd and with the guest's own
     * confirmation armed at "pending", so the delivery engine picks it up on
     * the same write it picks the owners' notification up on: one send path and
     * not two. Status and mail have to move together — the confirmation opens
     * "Het is rond", and the shared guest page it links to renders the status,
     * so a row still reading Nieuw would contradict the mail in the hands of
     * the party reading both. Accepting on the spot is only safe because the
     * seat count above has already run, so this cannot overbook the room; it
     * only removes the pause in which a human would have looked.
     *
     * The context flag is what lets the status through at all. The `status`
     * field's own beforeChange hook stores "nieuw" on every create whatever was
     * submitted, and that hook is the last thing standing between a public form
     * and a booking that declares itself confirmed — field-level access is
     * bypassed by the local API, which is how this route writes. So it is not
     * being loosened generally: it honours this one flag, set only by a caller
     * that has read the mode out of the CMS itself. See AUTO_CONFIRM in
     * src/lib/reservationMail.ts, which is where that reasoning is written out.
     */
    const created = await payload.create({
      collection: "reservations",
      data: {
        name,
        email,
        phone,
        // Stored at midday UTC: a dayOnly field must not slide to the day
        // before or after when it is rendered in another timezone.
        date: parsed.toISOString(),
        time,
        guests,
        notes: notes || undefined,
        // Never read from the request. A request starts as "nieuw" unless the
        // owners have said the café accepts automatically, and that is decided
        // from the CMS a few lines up, never by anything the form sent.
        status: auto ? "bevestigd" : "nieuw",
        source: "website",
        emailStatus: "pending",
        locale,
        ...(auto ? { confirmationEmailStatus: "pending" as const } : {}),
      },
      ...(auto ? { context: { [AUTO_CONFIRM]: true } } : {}),
    });

    return accepted(created.guestToken);
  } catch (error) {
    console.error("reservation request failed", error);
    return fail("server", 500);
  }
}
