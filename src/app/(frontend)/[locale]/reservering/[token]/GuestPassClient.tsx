"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { LogoSvg } from "@/components/LogoSvg";
import { ShareActions } from "@/components/ShareActions";
import { Sheet } from "@/components/Sheet";
import { TornEdge } from "@/components/TornEdge";
import { WelcomeBlock } from "@/components/WelcomeBlock";
import type { SocialLink } from "@/components/SocialMarks";
import { getDict } from "@/i18n/dictionaries";
import { localeHref, type Locale } from "@/i18n/config";
/*
 * From @/lib/guestPassStage and NOT from @/lib/guestPass, which is the same
 * function and a different bundle. @/lib/guestPass reaches Payload, and Payload
 * reaches nodemailer, and nodemailer reaches `fs` — so a value taken from there
 * by this client component stops the production build outright. Types are fine
 * either way, because they are erased; functions are not. Neither tsc nor the
 * test suite notices, which is why this is written down here.
 */
import { passStage } from "@/lib/guestPassStage";
import type { GuestResponseView, GuestPassView } from "@/lib/guestPass";
import { EVENTS, track } from "@/lib/umami";

/**
 * The guest pass as the party reads it.
 *
 * Almost every visit to this page starts with a tap inside WhatsApp, on a
 * phone, in a hallway, while putting a coat on. So it is one column all the
 * way down, in the order somebody actually wants it: what and when, then into
 * the calendar, then how to get there, then pass it on, and only at the bottom
 * the optional business of saying what you do not eat.
 *
 * That order holds while there is still an evening to come. Once it has been
 * and gone the same page turns into a thank-you: the booking somebody already
 * knows about drops to a demoted line further down, the thanks and the offer
 * of a review take the top of the sheet, and everything that only makes sense
 * beforehand — the calendar, the map, the directions, the button that sends
 * the link on to nine more people — is simply not drawn. Nobody navigates
 * here; they left the tab open and found it again.
 *
 * There is no motion in here at all. Everything else on the site fades its
 * sections in, but this one is read once, quickly, on a connection that is
 * whatever the pub's wifi is doing, and an animation between the reader and
 * the address is not a kindness. It also keeps the page clear of
 * useReducedMotion(), which is null until hydration and is the usual way a
 * component like this ends up rendering differently on the two sides.
 *
 * Nothing sensitive can reach this file: it is typed against GuestPassView,
 * which is what src/lib/guestPass.ts lets through, and that shape has no
 * e-mail address, no phone number, no notes and no surname in it to render
 * even by accident.
 */

// Must stay in step with `bg-paper-deep` in tailwind.config.ts: a torn edge is
// the incoming section's fill painted into the outgoing one.
const PAPER_DEEP = "#E8E2D4";
const LIP_LIGHT = "rgba(255,255,255,0.5)";
/** `hive-700`, the heading ink. The logo defaults to cream, for dark grounds. */
const HEADING_INK = "#422810";

interface Props {
  locale: Locale;
  /** From the URL, not from the document: the page never echoes the secret. */
  token: string;
  view: GuestPassView;
  /** Decided on the server, against the café's own clock. */
  isPast: boolean;
  /**
   * The café's Google listing, and "" far more often than not. Whether this
   * party may be asked for a review at all is settled on the server by
   * `reviewAskUrl` in @/lib/guestPass — the evening has to be over, the
   * booking has to have been confirmed, and the owners have to have filled the
   * field in — so "" here means say nothing about reviews, not merely that
   * there is no link to hand.
   */
  reviewUrl: string;
  shareUrl: string;
  siteName: string;
  addressLines: string[];
  phone: string;
  mapsGoogleUrl: string;
  mapsAppleUrl: string;
  /** Site Instellingen → Contact. Empty means no map is drawn. */
  mapEmbedUrl: string;
  mapTitle: string;
  /** The welcome under the header: Site Instellingen → Over ons. */
  welcomeText: string;
  welcomeImageUrl: string;
  welcomeImageAlt: string;
  /**
   * Site Instellingen → Contact, as marks for the row at the foot. The Google
   * listing is normally among them and is deliberately not when `reviewUrl` is
   * set: the ask above has already offered that exact link, and the page said
   * it once on purpose. Decided on the server, in page.tsx, because that is
   * where both halves of the pair are already in hand. May be empty.
   */
  socials: SocialLink[];
  dietaryOptions: string[];
  drinkOptions: string[];
  formEnabled: boolean;
  /** <AddToCalendar>, rendered on the server so @/lib/ics stays off the wire. */
  calendar: ReactNode;
}

/** What this browser last sent, so a second visit offers an edit, not a copy. */
interface Remembered {
  /**
   * The endpoint's proof that this phone wrote one of the rows: a signature
   * over that row, handed back in the POST response and stored nowhere else.
   * Never the row's own id — those run consecutively, so holding one would be
   * a licence to edit the answer next to it. See `responseEditKey` in
   * src/lib/guestPass.ts.
   */
  responseKey: string | null;
  name: string;
  dietary: string[];
  drinks: string[];
  note: string;
}

const EMPTY: Remembered = {
  responseKey: null,
  name: "",
  dietary: [],
  drinks: [],
  note: "",
};

/** Same letterpress rule as every other field on the site. */
const fieldClass =
  "mt-2 block w-full rounded-none border-0 border-b border-hive-700/25 bg-transparent " +
  "px-0 py-3 font-body text-hive-700 placeholder:text-hive-300/70 outline-none " +
  "transition-colors duration-300 ease-settle " +
  "focus:border-honey-400 focus:shadow-[inset_0_-2px_0_0_#B4735E]";

/**
 * A ticked box, drawn rather than the browser's own. The real input is still
 * there and still focusable — it is only moved out of sight, so the keyboard
 * and the screen reader get the checkbox they expect while the page gets a
 * mark in the same ink as everything else.
 */
function PickList({
  legend,
  hint,
  options,
  picked,
  onToggle,
}: {
  legend: string;
  hint: string;
  options: string[];
  picked: string[];
  onToggle: (option: string) => void;
}) {
  return (
    <fieldset>
      <legend className="label">{legend}</legend>
      <p className="mt-2 text-sm text-hive-400">{hint}</p>
      <ul className="mt-4 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
        {options.map((option) => (
          <li key={option}>
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={picked.includes(option)}
                onChange={() => onToggle(option)}
                className="peer sr-only"
              />
              <span
                aria-hidden="true"
                className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-[2px]
                           border border-hive-700/25 transition-colors duration-200 ease-settle
                           peer-checked:border-clay-500 peer-checked:bg-clay-500
                           peer-checked:[&_svg]:opacity-100
                           peer-focus-visible:ring-2 peer-focus-visible:ring-honey-400"
              >
                <svg
                  viewBox="0 0 12 12"
                  width="11"
                  height="11"
                  fill="none"
                  stroke="#F1ECE1"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  focusable="false"
                  className="opacity-0 transition-opacity duration-200"
                >
                  <path d="M2 6.3 L4.7 9 L10 3.2" />
                </svg>
              </span>
              <span className="text-[0.95rem] leading-snug text-hive-600">
                {option}
              </span>
            </label>
          </li>
        ))}
      </ul>
    </fieldset>
  );
}

export function GuestPassClient({
  locale,
  token,
  view,
  isPast,
  reviewUrl,
  shareUrl,
  siteName,
  addressLines,
  phone,
  mapsGoogleUrl,
  mapsAppleUrl,
  mapEmbedUrl,
  mapTitle,
  welcomeText,
  welcomeImageUrl,
  welcomeImageAlt,
  socials,
  dietaryOptions,
  drinkOptions,
  formEnabled,
  calendar,
}: Props) {
  const dict = getDict(locale);
  const t = dict.guestPass;

  /**
   * The stage, and nothing whatever beside it.
   *
   * The token is the one thing this page has that nothing else does, and it is
   * exactly the thing that must never leave it — a token in an analytics
   * property is the reservation handed to a third party. Nothing else here is
   * sendable either: the form below collects what people cannot eat and a free
   * text note, and the party is a handful of named guests on one evening, so
   * even the number of companions is close enough to identifying that it is
   * deliberately not counted. The stage is the whole measurement.
   */
  useEffect(() => {
    track(EVENTS.guestPassStep, { step: "opened" });
  }, []);

  const [responses, setResponses] = useState<GuestResponseView[]>(
    view.responses,
  );
  const [remembered, setRemembered] = useState<Remembered | null>(null);
  const [draft, setDraft] = useState<Remembered>(EMPTY);
  const [editing, setEditing] = useState(false);
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">(
    "idle",
  );
  const [error, setError] = useState(t.error);

  /**
   * Which of these phones has already answered is a fact about the phone, not
   * about the reservation, so it lives in localStorage rather than on the
   * document. Read after mount and never during render: the server has no
   * localStorage, and a value that appears out of one mid-render is precisely
   * the sort of thing that hydrates into a mismatch.
   */
  const storageKey = `beeshive:guest-pass:${token}`;
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<Remembered>;
      if (typeof parsed?.name !== "string" || !parsed.name) return;
      const saved: Remembered = {
        // Anything stored by an older version of this page held the row id
        // under another name; it is not read, so that guest is offered a fresh
        // line rather than an edit. One retyped answer, once.
        responseKey:
          typeof parsed.responseKey === "string" ? parsed.responseKey : null,
        name: parsed.name,
        dietary: Array.isArray(parsed.dietary) ? parsed.dietary : [],
        drinks: Array.isArray(parsed.drinks) ? parsed.drinks : [],
        note: typeof parsed.note === "string" ? parsed.note : "",
      };
      setRemembered(saved);
      setDraft(saved);
    } catch {
      // Private browsing throws on localStorage. Forgetting is a fine outcome:
      // the worst that happens is the guest is asked their name again.
    }
  }, [storageKey]);

  /**
   * "Zaterdag 12 september 2026", written out of the dictionary rather than
   * through Intl, so the server and the browser produce the same string to the
   * character. The year is always there: this is a single evening being read
   * out of a chat message, with nothing around it to date it.
   */
  const dateParts = (
    iso: string,
  ): { weekday: string; day: string; month: string; year: string } | null => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
    const d = new Date(`${iso}T12:00:00.000Z`);
    return {
      weekday: dict.weekdays[(d.getUTCDay() + 6) % 7],
      day: String(d.getUTCDate()),
      month: dict.months[d.getUTCMonth()],
      year: String(d.getUTCFullYear()),
    };
  };

  const when = dateParts(view.date);

  const toggle = (key: "dietary" | "drinks") => (option: string) =>
    setDraft((prev) => ({
      ...prev,
      [key]: prev[key].includes(option)
        ? prev[key].filter((item) => item !== option)
        : [...prev[key], option],
    }));

  /** The endpoint answers with a code, so the wording comes from here. */
  const messageFrom = (data: unknown): string => {
    const code =
      data && typeof data === "object"
        ? (data as { error?: unknown }).error
        : undefined;
    if (code === "full") return t.full;
    if (code === "nameRequired") return t.nameRequired;
    return t.error;
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!draft.name.trim()) {
      setError(t.nameRequired);
      setStatus("error");
      return;
    }
    setStatus("sending");
    try {
      const res = await fetch("/api/guest-pass", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          responseKey: draft.responseKey ?? undefined,
          name: draft.name,
          dietary: draft.dietary,
          drinks: draft.drinks,
          note: draft.note,
        }),
      });
      const data = (await res.json().catch(() => null)) as {
        responseKey?: string | null;
        responses?: GuestResponseView[];
      } | null;

      if (!res.ok) {
        track(EVENTS.guestPassStep, { step: "companion_failed" });
        setError(messageFrom(data));
        setStatus("error");
        return;
      }

      const saved: Remembered = {
        ...draft,
        name: draft.name.trim(),
        responseKey: data?.responseKey ?? draft.responseKey ?? null,
      };
      setResponses(data?.responses ?? responses);
      setRemembered(saved);
      setDraft(saved);
      setEditing(false);
      setStatus("sent");
      // The one thing this whole feature was built for: somebody who was
      // forwarded the link filled it in. Until this event existed the guest
      // pass could have been entirely inert — nobody sharing, nobody joining —
      // and the figures would have looked identical to it working perfectly.
      track(EVENTS.guestPassStep, { step: "companion_joined" });
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(saved));
      } catch {
        // See above: forgetting only costs the guest a retyped name.
      }
    } catch {
      track(EVENTS.guestPassStep, { step: "companion_failed" });
      setError(t.error);
      setStatus("error");
    }
  };

  /**
   * The page after the fact.
   *
   * Somebody left this tab open in a coat pocket and has opened it again on
   * the tram home, or a fortnight later. Until now that reader got the booking
   * they already know about with one italic line above it saying the evening
   * had gone, which is a page that has not noticed what it is for any more. So
   * once the evening is over the thanks becomes the page and the booking is
   * demoted underneath it.
   *
   * A cancelled row wins, and that ordering is the single most important thing
   * in this file. Thanking a party for a visit they rang up to call off is the
   * worst sentence this page could produce, and the way it would happen is
   * somebody later writing `isPast ? thanks : cancelled ? ...` without
   * thinking about the row that is both.
   *
   * So it is no longer decided here. `passStage()` in @/lib/guestPassStage is the
   * same three lines with one difference that matters: it can be tested, and
   * it is. Written inline, this was a boolean nobody could reach — flipping it
   * to plain `isPast` broke not one test in a suite of eight hundred, while
   * quietly thanking every cancelled party whose date had gone by.
   */
  const stage = passStage(view, isPast);
  const thanking = stage === "thanking";
  const notice = stage === "cancelled" ? t.cancelledNotice : null;
  // An evening that is over or called off is not asking anyone anything, and
  // "upcoming" is the one stage that is neither. Read off the stage rather
  // than worked out again from the status and the clock: this used to be its
  // own `view.status === "geannuleerd"` a few lines up, which is precisely the
  // second copy of the decision that `passStage()` exists to prevent. The
  // endpoint refuses these too; this only keeps the page honest about it.
  const canJoin = formEnabled && stage === "upcoming";
  /**
   * The form opens on a tap, never on arrival.
   *
   * Expanded by default it was the tallest thing on the page — a name, two
   * lists of tickboxes and a text area — sitting between somebody and the
   * booking they opened the link for, on the phone, in a hallway. Most of the
   * party have nothing to declare and should not have to scroll past the
   * question; the ones who do are looking for it and will find a button.
   */
  const showForm = canJoin && editing;

  // First names only, on both sides, so this is a match on what is shown.
  const myFirstName = (remembered?.name ?? "").trim().split(/\s+/)[0] ?? "";
  const mineIndex = myFirstName
    ? responses.findIndex(
        (r) => r.name.toLowerCase() === myFirstName.toLowerCase(),
      )
    : -1;

  return (
    <>
      {/* ===== The sheet itself ===== */}
      <section className="relative overflow-hidden bg-paper">
        <div className="mx-auto w-full max-w-2xl px-6 pb-16 pt-28 md:px-10 md:pt-32">
          <LogoSvg
            width={150}
            height={87}
            fill={HEADING_INK}
            className="-ml-1"
          />
          <p className="label mt-8">{t.heading}</p>
          <div className="rule-ink my-4 w-14" aria-hidden="true" />
          {thanking ? (
            <>
              <h1 className="heading-lg text-hive-800">{t.pastHeading}</h1>
              <p className="mt-6 max-w-prose font-display text-lg leading-relaxed text-hive-600">
                {t.pastNotice} {t.pastWelcomeBack}
              </p>

              {/* ===== The review ask =====
                  Under the thanks, on the same sheet, and never anywhere else:
                  it is a thing you say at the door on the way out, not a
                  banner. The owners asked for it "if they liked it" and that
                  hedge is in the copy rather than in a condition — the other
                  answer is given somewhere to go, so a guest who did not enjoy
                  it is not being handed a form to fill in about it. Whether
                  there is anything here at all was decided on the server. */}
              {reviewUrl ? (
                <div className="mt-10">
                  <div className="rule-ink w-10" aria-hidden="true" />
                  <h2 className="label mt-6">{t.reviewHeading}</h2>
                  <p className="mt-3 max-w-prose leading-relaxed text-hive-500">
                    {t.reviewAsk}
                  </p>
                  <a
                    href={reviewUrl}
                    onClick={() =>
                      track(EVENTS.outboundClicked, {
                        kind: "google_listing",
                        surface: "guest_pass",
                      })
                    }
                    target="_blank"
                    /* `noreferrer` is doing real work here, unlike the habit
                       it usually is. This page's address contains the guest
                       token, and the token is a credential rather than an
                       identifier: whoever holds it can open the booking.
                       Without this attribute the tap hands Google a Referer
                       header, and what a browser puts in it is up to the
                       browser — the URL the guest was invited to follow a
                       link from, token and all, sitting in a third party's
                       logs. `noopener` is the ordinary precaution beside it. */
                    rel="noopener noreferrer"
                    className="ink-link mt-4 inline-block"
                  >
                    {t.reviewLink}
                  </a>
                </div>
              ) : null}
            </>
          ) : (
            <>
              <h1 className="heading-lg text-hive-800">
                {t.subheading(view.firstName)}
              </h1>
              {notice ? (
                <p className="mt-6 max-w-prose font-display text-[0.95rem] italic leading-relaxed text-clay-600">
                  {notice}
                </p>
              ) : null}
            </>
          )}
        </div>
        <TornEdge
          color={PAPER_DEEP}
          lip={LIP_LIGHT}
          variant={0}
          className="absolute inset-x-0 bottom-0 z-20"
        />
      </section>

      <section className="section-padding relative overflow-hidden bg-paper-deep">
        <div className="mx-auto max-w-2xl space-y-12">
          {/* ===== When, where, how many ===== */}
          <Sheet tone="paper" edge="soft">
            <div className="px-6 py-10 md:px-10 md:py-12">
              {/* ===== The evening, once it is behind them =====
                  Demoted rather than dropped. People do look back at what they
                  booked, and at what the party passed on, so the sheet stays —
                  but set as one line of ordinary prose instead of as the front
                  of an invitation, and without the calendar, which is the one
                  thing on this page that can only be wanted beforehand. The
                  heading says outright which of the two this is, so nobody
                  reads a date in the past as a date to turn up on. */}
              {when && thanking ? (
                <div className="pb-7">
                  <p className="label">{t.pastDetailsHeading}</p>
                  <p className="mt-4 font-display figures-old text-2xl leading-snug text-hive-600">
                    {when.weekday} {when.day} {when.month} {when.year}
                    {view.time ? (
                      <>
                        <span className="text-hive-300"> · </span>
                        {view.time}
                      </>
                    ) : null}
                  </p>
                </div>
              ) : null}

              {/* ===== The evening, given the room it deserves =====
                  For most of the party this page is the first thing they ever
                  see of the place: a link tapped inside a chat, on a phone, on
                  the way to somewhere else. So the one fact they came for is
                  set like the front of an invitation rather than filed as the
                  first row of a list. The day and the month carry the sheet,
                  the hour answers them in the honey ink, and the weekday and
                  year sit underneath at reading size, where somebody checking
                  a diary goes looking. */}
              {when && !thanking ? (
                <div className="pb-7">
                  <p className="label">{t.whenLabel}</p>
                  <div className="mt-4 flex flex-wrap items-baseline gap-x-7 gap-y-2">
                    <p className="heading-xl figures-old text-hive-800">
                      {when.day} {when.month}
                    </p>
                    {view.time ? (
                      <p className="font-display figures-old text-3xl font-medium
                                    leading-none text-honey-600 md:text-4xl">
                        {view.time}
                      </p>
                    ) : null}
                  </div>
                  {/* Weekday and year are the two things a person checks
                      against a diary, and they are not the same fact — a
                      middot keeps them from reading as one odd phrase. */}
                  <p className="mt-4 font-display text-lg text-hive-500">
                    {when.weekday} <span className="text-hive-300">·</span>{" "}
                    {when.year}
                  </p>

                  {/* The calendar belongs to the date, not to a block of its
                      own further down. Somebody reading "12 september 19:00"
                      is at that exact moment deciding whether they will
                      remember it, and the answer to that thought should be
                      under their thumb rather than two scrolls away. */}
                  <div className="mt-7">{calendar}</div>
                </div>
              ) : null}

              <div
                className={when ? "rule-ink w-full" : "hidden"}
                aria-hidden="true"
              />

              <dl className="mt-8 space-y-6">
                <div>
                  <dt className="label">{t.whereLabel}</dt>
                  <dd className="mt-2">
                    <span className="menu-name">{siteName}</span>
                    <address className="menu-desc not-italic">
                      {addressLines.map((line) => (
                        <span key={line} className="block">
                          {line}
                        </span>
                      ))}
                    </address>

                    {/* The map and the way to it, under the address itself.
                        "Zuilen, Utrecht" answers where; this answers how, and
                        the two were a page apart for no reason other than that
                        they arrived as separate ideas. Same embed and the same
                        sepia as /contact, so the one rectangle on the page
                        that is not ours reads the same in both places. */}
                    {/* The map goes with the journey, so it goes when the
                        journey has been made. What stays is the address
                        itself, which is what somebody looking back at their
                        own booking is reading. */}
                    {mapEmbedUrl && !thanking ? (
                      <div className="mt-5 overflow-hidden rounded-[2px] border border-hive-700/15">
                        <iframe
                          src={mapEmbedUrl}
                          width="100%"
                          height="170"
                          style={{
                            border: 0,
                            filter: "sepia(0.22) saturate(0.85) contrast(0.96)",
                          }}
                          loading="lazy"
                          /* `no-referrer`, where the identical embed on
                             /contact can live with the browser's default. The
                             request this frame makes is cross-origin to
                             Google and the referrer it would carry is this
                             page's own URL — which is to say the guest token.
                             The Referrer-Policy header on this route says the
                             same thing, but an element's own attribute wins
                             over the header, so the attribute has to agree
                             with it rather than quietly undo it. */
                          referrerPolicy="no-referrer"
                          title={mapTitle}
                          className="block w-full"
                        />
                      </div>
                    ) : null}

                    <div className="mt-4 flex flex-wrap items-center gap-x-7 gap-y-2">
                      {!thanking ? (
                        <>
                          <a
                            href={mapsGoogleUrl}
                            onClick={() =>
                              track(EVENTS.outboundClicked, {
                                kind: "directions",
                                target: "google",
                                surface: "guest_pass",
                              })
                            }
                            target="_blank"
                            rel="noopener noreferrer"
                            className="ink-link"
                          >
                            {t.directionsGoogle}
                          </a>
                          <a
                            href={mapsAppleUrl}
                            onClick={() =>
                              track(EVENTS.outboundClicked, {
                                kind: "directions",
                                target: "apple",
                                surface: "guest_pass",
                              })
                            }
                            target="_blank"
                            rel="noopener noreferrer"
                            className="ink-link"
                          >
                            {t.directionsApple}
                          </a>
                        </>
                      ) : null}
                      {phone ? (
                        <a
                          href={`tel:${phone.replace(/\s/g, "")}`}
                          onClick={() =>
                            track(EVENTS.outboundClicked, {
                              kind: "phone",
                              surface: "guest_pass",
                            })
                          }
                          className="ink-link"
                        >
                          {t.callUs}
                        </a>
                      ) : null}
                    </div>
                  </dd>
                </div>

                <div className="rule-ink w-full" aria-hidden="true" />

                {/* Three one-line facts, set as a group rather than on the
                    same rhythm as the blocks above. They are read together —
                    how many of us, is it confirmed, whose name is it under —
                    and 28 points of air between each was the page pretending
                    they were three separate subjects. */}
                <div className="space-y-3">
                  <div className="menu-row">
                    <dt className="label self-center">{t.guestsLabel}</dt>
                    <dd className="menu-price figures-old">
                      {view.guests === null
                        ? t.guestsUnknown
                        : t.guestsValue(view.guests)}
                    </dd>
                  </div>

                  <div className="menu-row">
                    <dt className="label self-center">{t.statusLabel}</dt>
                    <dd className="menu-price">{t.status[view.status]}</dd>
                  </div>

                  <div className="menu-row">
                    <dt className="label self-center">{t.nameLabel}</dt>
                    <dd className="menu-price">{view.firstName}</dd>
                  </div>
                </div>
              </dl>

              {/* Outside the <dl> on purpose. Everything above is a field with
                  a value, read at a glance; this is a sentence somebody wrote
                  by hand, so it gets the display face, the width of a line of
                  prose and its own rule above it, and it reads as the house
                  saying something rather than as one more row of data. When
                  there is no note there is nothing here at all — not a heading
                  over an empty space. */}
              {view.houseNote ? (
                <div className="mt-9">
                  <div className="rule-ink w-full" aria-hidden="true" />
                  <h2 className="label mt-7">{t.houseNoteLabel}</h2>
                  <p className="mt-3 max-w-prose whitespace-pre-line font-display
                                text-[1.05rem] italic leading-relaxed text-hive-600">
                    {view.houseNote}
                  </p>
                </div>
              ) : null}
            </div>
          </Sheet>

          {/* ===== Passing it on =====
              Only while there is something to pass on. "Stuur deze link door,
              dan kan iedereen zijn wensen doorgeven" is an instruction that
              has quietly expired, and a WhatsApp button under it is an
              invitation to send a dozen people to a page about an evening that
              already happened. */}
          {!thanking ? (
            <div>
              <h2 className="label">{t.shareHeading}</h2>
              <div className="rule-ink mt-3 w-10" aria-hidden="true" />
              <p className="mt-4 leading-relaxed text-hive-500">
                {t.shareHint}
              </p>
              <ShareActions
                url={shareUrl}
                context="guest_pass"
                message={t.whatsAppMessage(siteName, shareUrl)}
                copyLabel={t.copyLink}
                copiedLabel={t.copied}
                whatsAppLabel={t.shareWhatsApp}
                className="mt-5"
              />
            </div>
          ) : null}

          {/* ===== Are you coming too? ===== */}
          {canJoin ? (
            <div>
              <h2 className="label">{t.joinHeading}</h2>
              <div className="rule-ink mt-3 w-10" aria-hidden="true" />

              {showForm ? (
                <form onSubmit={handleSubmit} className="mt-5 space-y-8">
                  <p className="leading-relaxed text-hive-500">{t.joinHint}</p>

                  <div>
                    <label htmlFor="guest-name" className="label block">
                      {t.yourName}
                    </label>
                    <input
                      id="guest-name"
                      name="name"
                      type="text"
                      required
                      maxLength={60}
                      autoComplete="given-name"
                      value={draft.name}
                      onChange={(e) =>
                        setDraft((prev) => ({ ...prev, name: e.target.value }))
                      }
                      className={fieldClass}
                    />
                  </div>

                  {/* An empty list in the CMS is the owners saying "do not ask
                      this", so the whole block goes rather than an empty one
                      being drawn. */}
                  {dietaryOptions.length > 0 ? (
                    <PickList
                      legend={t.dietaryHeading}
                      hint={t.dietaryHint}
                      options={dietaryOptions}
                      picked={draft.dietary}
                      onToggle={toggle("dietary")}
                    />
                  ) : null}

                  {drinkOptions.length > 0 ? (
                    <PickList
                      legend={t.drinksHeading}
                      hint={t.drinksHint}
                      options={drinkOptions}
                      picked={draft.drinks}
                      onToggle={toggle("drinks")}
                    />
                  ) : null}

                  {/* The line nobody could pick off a list.
                      Always here, unlike the two lists above, which appear
                      only when the owners have written options: an allergy the
                      kitchen never thought of is exactly the thing that has
                      nowhere else to go, so this cannot depend on a setting
                      somebody forgot to fill in. */}
                  <div>
                    <label htmlFor="guest-note" className="label block">
                      {t.noteHeading}
                    </label>
                    <p className="mt-2 text-sm text-hive-400">{t.noteHint}</p>
                    <textarea
                      id="guest-note"
                      name="note"
                      rows={3}
                      maxLength={300}
                      value={draft.note}
                      onChange={(e) =>
                        setDraft((prev) => ({ ...prev, note: e.target.value }))
                      }
                      placeholder={t.notePlaceholder}
                      className={`${fieldClass} resize-none`}
                    />
                  </div>

                  <div className="flex flex-wrap items-center gap-4 pt-1">
                    <button
                      type="submit"
                      disabled={status === "sending"}
                      className="btn-primary disabled:opacity-50"
                    >
                      {status === "sending"
                        ? t.submitting
                        : remembered
                          ? t.update
                          : t.submit}
                    </button>
                    {editing ? (
                      <button
                        type="button"
                        onClick={() => {
                          setDraft(remembered ?? EMPTY);
                          setEditing(false);
                          setStatus("idle");
                        }}
                        className="ink-link text-sm"
                      >
                        {t.editCancel}
                      </button>
                    ) : null}
                  </div>

                  {status === "error" ? (
                    <p role="alert" className="text-sm text-clay-600">
                      {error}
                    </p>
                  ) : null}
                </form>
              ) : !remembered ? (
                <div className="mt-5">
                  <p className="leading-relaxed text-hive-500">{t.joinHint}</p>
                  <button
                    type="button"
                    onClick={() => setEditing(true)}
                    className="btn-secondary mt-5"
                  >
                    {t.openForm}
                  </button>
                </div>
              ) : (
                <div className="mt-5" role="status">
                  <p className="font-display text-xl text-hive-700">
                    {status === "sent" ? t.thanks : t.alreadyJoined}
                  </p>
                  <p className="mt-2 max-w-prose leading-relaxed text-hive-500">
                    {t.thanksBody}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(true);
                      setStatus("idle");
                    }}
                    className="ink-link mt-4 text-sm"
                  >
                    {t.edit}
                  </button>
                </div>
              )}
            </div>
          ) : null}

          {/* ===== What the party has passed on =====
              Only once somebody has. An empty list under a heading is a
              question nobody answered yet, and on a pass that has just been
              opened for the first time that is every single time — a whole
              block of page spent saying nothing happened. The person who has
              just answered still sees their own line, because `responses` has
              it by then. */}
          {responses.length > 0 ? (
          <div>
            <h2 className="label">
              {thanking ? t.attendingPast : t.attending}
            </h2>
            <div className="rule-ink mt-3 w-10" aria-hidden="true" />
            {(
              <ul className="mt-5 space-y-5">
                {responses.map((response, index) => {
                  const picks = [...response.dietary, ...response.drinks];
                  return (
                    <li key={`${response.name}-${index}`}>
                      <p className="menu-name">
                        {response.name}
                        {index === mineIndex ? (
                          <span className="ml-2 font-body text-[0.7rem] uppercase tracking-label text-honey-600">
                            {t.you}
                          </span>
                        ) : null}
                      </p>
                      {/* Always a line under the name, even when nothing was
                          ticked: a bare name in a list of answers reads as a
                          row that failed to load rather than as somebody who
                          simply eats everything. */}
                      {/* "geen wensen doorgegeven" is only true when they
                          ticked nothing AND wrote nothing. Somebody who typed
                          an allergy has passed plenty on, and saying otherwise
                          directly above their own sentence reads as a bug. */}
                      {picks.length > 0 || !response.note ? (
                        <p className="menu-desc">
                          {picks.length > 0
                            ? picks.join(" · ")
                            : t.nothingPicked}
                        </p>
                      ) : null}
                      {/* Their own words get the display face, the way the
                          house note does: it is a sentence somebody wrote,
                          not another field with a value. */}
                      {response.note ? (
                        <p className="mt-1 max-w-prose font-display text-[0.95rem] italic
                                      leading-relaxed text-hive-500">
                          {response.note}
                        </p>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          ) : null}

          {/* ===== Who they have just been booked in with =====
              At the foot rather than under the header. Most of the party got
              here from a chat message and have never met the place, so the
              introduction earns its spot — but not above the booking they
              opened the link for. Whoever has read this far has already found
              the date, the address and the calendar. */}
          {welcomeText || welcomeImageUrl ? (
            <div>
              <div className="rule-ink w-full" aria-hidden="true" />
              <div className="mt-10">
                <WelcomeBlock
                  heading={t.welcomeHeading}
                  /* The ordinary line offers "or read what guests wrote about
                     us", and on a thanked pass the mark it was pointing at —
                     the Google listing — is the one `socials` has just had
                     taken out of it. A hint that promises a destination the
                     row below it no longer shows is a small lie, so the
                     follow-only sheet gets the follow-only line. */
                  followHint={reviewUrl ? t.followOnlyHint : t.followHint}
                  text={welcomeText}
                  imageUrl={welcomeImageUrl}
                  imageAlt={welcomeImageAlt}
                  links={socials}
                  ctaHref={localeHref(locale, "/kaart")}
                  ctaLabel={t.seeMenu}
                />
              </div>
            </div>
          ) : null}

          <p className="text-sm italic leading-snug text-hive-400">
            {t.privacyNote}
          </p>
        </div>
      </section>
    </>
  );
}
