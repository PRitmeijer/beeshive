"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useConfig } from "@payloadcms/ui";
import { timeToMinutes } from "@/lib/openingHours";
import styles from "./agenda.module.scss";

/**
 * The day view, and the pieces the week and the month borrow from it.
 *
 * Three views draw the same three things — an opening band, a reservation, an
 * evening that is on — at three sizes, so they are written once here, in the
 * view that shows them at full size, and imported by the other two. That is
 * also why the shapes the endpoint answers with live in this file rather than
 * next to it: a Next route handler may export nothing but its verbs, so the
 * wire contract is declared beside its main reader and imported back into
 * src/app/api/admin/agenda/route.ts with a type-only import, which compiles
 * away to nothing.
 *
 * Everything here runs in the browser. It has to: the owners open this on a
 * phone and want to see a booking that came in while they were reading, and
 * the "Vandaag" panel is worth refreshing without a page load. The server view
 * around it (AgendaView.tsx) resolves today's date and hands it down as a
 * string, because `new Date()` while rendering is how a page ends up disagreeing
 * with itself about which day it is.
 *
 * The colours are Payload's own CSS variables rather than the website's
 * Tailwind palette, which is not loaded in the admin at all. That is what keeps
 * this thing legible when the owners flip the panel into dark mode.
 */

/* -------------------------------------------------------------- the wire -- */

/** What the doors do on one date, and the row that says so, if there is one. */
export interface AgendaOpening {
  date: string;
  closed: boolean;
  /** As typed when no range could be read out of it ("vanaf 17:00"). */
  hours: string;
  note: string | null;
  source: "week" | "recurring" | "exception";
  /** The opening-exceptions document behind this day, when one exists. */
  exceptionId: string | null;
}

/**
 * Whether the guest behind a booking has reserved here before.
 *
 * A copy of GuestReservationHistory in src/lib/guestHistory.ts rather than an
 * import of it, for the same reason the rest of this section exists: everything
 * below runs in the browser, and that module is server code that talks to
 * Payload. The shapes are structurally identical, so the route assigns one to
 * the other and the compiler holds the two honest.
 *
 * `null` means the question could not be asked — a row with no e-mail address
 * and no telephone number to recognise anyone by. That is not the same as a
 * first reservation and must never be drawn as one.
 */
export interface AgendaGuestHistory {
  /** Bookings before this one, so 0 is a guest reserving here for the first time. */
  priorReservations: number;
  isFirstReservation: boolean;
  firstReservation: string | null;
  lastReservation: string | null;
  /** How they were recognised; a telephone number is the weaker of the two. */
  matchedOn: "email" | "phone" | null;
}

export interface AgendaReservation {
  id: string;
  date: string;
  time: string;
  name: string;
  guests: number;
  status: string;
  notes: string | null;
  phone: string | null;
  history: AgendaGuestHistory | null;
}

export interface AgendaEvent {
  /** The occurrence, which for a repeating evening is not the document. */
  id: string;
  docId: string;
  date: string;
  time: string | null;
  endTime: string | null;
  title: string;
  allDay: boolean;
  recurring: boolean;
  category: string | null;
  status: string;
  location: string | null;
}

export interface AgendaStats {
  date: string;
  /** Tables sitting down that day, cancellations left out. */
  tables: number;
  covers: number;
  cancelled: number;
  /** Requests that came in on that day, whenever they are for. */
  newReservations: number;
  contacts: number;
  subscribers: number;
  visitors: number | null;
  pageviews: number | null;
  /** Why there are no visitor figures, when there are none. */
  analyticsNote: string | null;
}

export interface AgendaResponse {
  from: string;
  to: string;
  today: string;
  days: AgendaOpening[];
  reservations: AgendaReservation[];
  events: AgendaEvent[];
  stats: AgendaStats | null;
}

/** What AgendaView hands each of the three modes. */
export interface AgendaModeProps {
  from: string;
  to: string;
  /** The day the owner is looking at; for the month, its first day. */
  date: string;
  today: string;
}

/* ------------------------------------------------------------- fetching -- */

const ENDPOINT = "/api/admin/agenda";

interface AgendaState {
  data: AgendaResponse | null;
  error: string | null;
  loading: boolean;
  reload: () => void;
}

/**
 * One window of the agenda, kept fresh.
 *
 * The previous answer stays on screen while the next one is fetched, so paging
 * from one week to the next does not blank the page; only the very first load
 * has nothing to show and says so. Errors replace nothing either — a phone
 * that lost its signal in the kitchen should keep showing the covers it already
 * had, with a line underneath explaining why the numbers stopped moving.
 */
export function useAgenda(from: string, to: string): AgendaState {
  const [data, setData] = React.useState<AgendaResponse | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [nonce, setNonce] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    setLoading(true);

    fetch(`${ENDPOINT}?from=${from}&to=${to}`, {
      // The session cookie is what authorises this; without it the endpoint
      // rightly refuses to name a single guest.
      credentials: "include",
      signal: controller.signal,
      headers: { accept: "application/json" },
    })
      .then(async (res) => {
        const body = await res.json().catch(() => null);
        if (cancelled) return;
        if (!res.ok) {
          setError(
            (body as { error?: string } | null)?.error ||
              "De agenda kon niet worden geladen.",
          );
          return;
        }
        setError(null);
        setData(body as AgendaResponse);
      })
      .catch((err) => {
        if (cancelled || err?.name === "AbortError") return;
        setError("Geen verbinding. De agenda kon niet worden bijgewerkt.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [from, to, nonce]);

  const reload = React.useCallback(() => setNonce((n) => n + 1), []);
  return { data, error, loading, reload };
}

/* ------------------------------------------------------------- fragments -- */

export function Loading({ what }: { what: string }) {
  return <p className={styles.state}>{what} wordt geladen…</p>;
}

export function ErrorLine({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <p className={`${styles.state} ${styles.stateError}`}>
      {message}{" "}
      <button className={styles.linkButton} onClick={onRetry} type="button">
        Opnieuw proberen
      </button>
    </p>
  );
}

const NL_DAY = new Intl.DateTimeFormat("nl-NL", {
  timeZone: "UTC",
  weekday: "long",
  day: "numeric",
  month: "long",
});

const NL_SHORT = new Intl.DateTimeFormat("nl-NL", {
  timeZone: "UTC",
  weekday: "short",
  day: "numeric",
  month: "short",
});

/**
 * A date read as a date and nothing else.
 *
 * The string is anchored at midday UTC and then formatted *in* UTC, which is
 * the whole trick: it can never be dragged onto the day before by a browser
 * that happens to be somewhere else, and the owners' phones travel.
 */
function at(isoDate: string): Date {
  return new Date(`${isoDate}T12:00:00.000Z`);
}

export function longDate(isoDate: string): string {
  return NL_DAY.format(at(isoDate));
}

export function shortDate(isoDate: string): string {
  return NL_SHORT.format(at(isoDate));
}

/** Sunday is 0 in JavaScript and last in a Dutch week; this fixes that. */
export function weekdayIndexOf(isoDate: string): number {
  return (at(isoDate).getUTCDay() + 6) % 7;
}

export const WEEKDAY_LABELS = ["ma", "di", "wo", "do", "vr", "za", "zo"];

const STATUS_LABELS: Record<string, string> = {
  nieuw: "Nieuw",
  gebeld: "Gebeld",
  bevestigd: "Bevestigd",
  geannuleerd: "Geannuleerd",
};

export function statusLabel(status: string): string {
  return STATUS_LABELS[status] || status;
}

/** In time order, with an unreadable time sorted to the end rather than lost. */
export function byTime<T extends { time?: string | null }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const am = timeToMinutes(a.time || "") ?? 10_000;
    const bm = timeToMinutes(b.time || "") ?? 10_000;
    return am - bm;
  });
}

export function coversOf(rows: AgendaReservation[]): number {
  return rows
    .filter((r) => r.status !== "geannuleerd")
    .reduce((total, r) => total + (r.guests || 0), 0);
}

/* ------------------------------------------------------- have we met? -- */

/**
 * How the agenda says "these people have not booked here before".
 *
 * The owners asked for one thing above all others: to know, before they walk
 * to a table, whether that table needs the story — what De Bee's Hive is, how
 * the evening works, that the kitchen closes at nine — or whether these are the
 * neighbours from the Amsterdamsestraatweg who have been coming since 2023 and
 * would rather be greeted than briefed.
 *
 * What the mark reports is the reservation and only the reservation, in those
 * words. Walking in without ringing first is how half of Zuilen eats here, and
 * none of it reaches the database, so "eerste bezoek" would be a claim about
 * the evening while "eerste reservering" is a claim about the row. It is also
 * a statement rather than an errand: the count is put on the screen, and what
 * to say at the table stays the owners' judgement.
 *
 * Every view shows the same fact in the same words, at the length it has room
 * for: "Eerste reservering" and "4e reservering" where there is a line, "1e"
 * and "4e" where there is only a column, and the whole sentence in the title
 * everywhere. The mark is never colour alone — an owner reading this on a
 * phone at the kitchen door in July gets the number and the word first, the
 * amber second.
 *
 * A booking with no history attached (nothing to recognise the guest by) shows
 * nothing at all. Silence is the only honest mark for a question we could not
 * ask; drawing such a row as a first reservation would send someone off to
 * explain the concept to a regular.
 */

const NL_DATE = new Intl.DateTimeFormat("nl-NL", {
  timeZone: "UTC",
  day: "numeric",
  month: "long",
  year: "numeric",
});

const isIsoDate = (value: string | null): value is string =>
  typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);

/** 1e, 2e, 3e…: which booking this is, counted from the guest's first. */
export function reservationOrdinal(history: AgendaGuestHistory): string {
  return `${Math.max(0, history.priorReservations) + 1}e`;
}

/** The whole thing in words, for the title of a mark that has no room for it. */
export function reservationSentence(history: AgendaGuestHistory): string {
  if (history.isFirstReservation) {
    return "Eerste reservering.";
  }
  const parts = [`${reservationOrdinal(history)} reservering`];
  if (isIsoDate(history.lastReservation)) {
    parts.push(`vorige was op ${NL_DATE.format(at(history.lastReservation))}`);
  }
  // Two people can share a telephone number and a household often does, so a
  // match on the number is worth flagging as the softer kind of certainty.
  if (history.matchedOn === "phone") {
    parts.push("herkend aan het telefoonnummer");
  }
  return `${parts.join(" · ")}.`;
}

/** Tables booking here for the first time, cancellations left out. */
export function firstReservationsOf(rows: AgendaReservation[]): number {
  return rows.filter(
    (r) => r.status !== "geannuleerd" && r.history?.isFirstReservation,
  ).length;
}

/**
 * The mark itself: a word in the day, two characters in a week.
 *
 * It sits inside the reservation link rather than beside it, so the whole row
 * stays one tap target on a phone; the title is therefore the link's own
 * tooltip and the sentence reads as part of the booking.
 */
export function GuestMark({
  history,
  compact = false,
}: {
  history: AgendaGuestHistory | null;
  compact?: boolean;
}) {
  if (!history) return null;
  // The compact form is deliberately the same "1e/4e" for both states: the
  // number *is* the answer, and a week column has room for nothing else.
  const label = compact
    ? reservationOrdinal(history)
    : history.isFirstReservation
      ? "Eerste reservering"
      : `${reservationOrdinal(history)} reservering`;

  return (
    <span
      className={[
        styles.guest,
        history.isFirstReservation ? styles.guestFirst : styles.guestReturning,
      ].join(" ")}
      title={reservationSentence(history)}
    >
      {label}
    </span>
  );
}

/** Where a document lives in the admin. */
export function useAdminRoutes() {
  const { config } = useConfig();
  return {
    admin: config?.routes?.admin || "/admin",
    api: `${config?.serverURL || ""}${config?.routes?.api || "/api"}`,
  };
}

/* ----------------------------------------------------------------- band -- */

/**
 * The opening hours of one day, and the way to change them.
 *
 * This is the part that makes the calendar worth having. A day that already
 * has an afwijkende dag behind it opens that document; a day that has not gets
 * one written for it here and then opens it, because Payload 3.88 has no way
 * to hand initial values to a create form through the URL — the owners would
 * otherwise land on an empty form and have to find the date again themselves,
 * which is exactly the friction that kept them from closing a day in the first
 * place.
 *
 * It asks first. A band is a large tap target in a month grid, and "gesloten"
 * written by a stray thumb is a day of turned-away guests.
 */
export function DayBand({
  day,
  compact = false,
  onChanged,
}: {
  day: AgendaOpening;
  compact?: boolean;
  onChanged?: () => void;
}) {
  const router = useRouter();
  const { admin, api } = useAdminRoutes();
  const [busy, setBusy] = React.useState(false);
  const [failed, setFailed] = React.useState(false);

  const label = day.closed ? "Gesloten" : day.hours || "Open";
  const className = [
    styles.band,
    day.closed ? styles.bandClosed : styles.bandOpen,
    day.source !== "week" ? styles.bandSpecial : "",
    compact ? styles.bandCompact : "",
  ]
    .filter(Boolean)
    .join(" ");

  if (day.exceptionId) {
    return (
      <a
        className={className}
        href={`${admin}/collections/opening-exceptions/${day.exceptionId}`}
        title={day.note ? `${day.note} · afwijkende dag openen` : "Afwijkende dag openen"}
      >
        <span className={styles.bandLabel}>{label}</span>
        {day.note && !compact ? (
          <span className={styles.bandNote}>{day.note}</span>
        ) : null}
      </a>
    );
  }

  async function close() {
    if (busy) return;
    // A day the weekly schedule already shuts does not need shutting; what the
    // owners want there is a row to hang a reason or different hours on, and
    // the question says so rather than pretending otherwise.
    const question = day.closed
      ? `Een afwijkende dag maken voor ${longDate(day.date)}?\n\nDaarmee kun je er een toelichting of andere openingstijden bij zetten.`
      : `Deze dag als gesloten zetten: ${longDate(day.date)}?\n\nEr wordt een afwijkende dag aangemaakt die je daarna meteen kunt aanvullen.`;
    if (!window.confirm(question)) return;

    setBusy(true);
    setFailed(false);
    try {
      const res = await fetch(`${api}/opening-exceptions`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          // Midday UTC, the same anchor the collection's own hook would move
          // it to; sending it already correct keeps the row identical to one
          // typed by hand.
          date: `${day.date}T12:00:00.000Z`,
          closed: true,
          showOnSite: true,
        }),
      });
      const body = (await res.json().catch(() => null)) as {
        doc?: { id?: unknown };
      } | null;
      if (!res.ok || !body?.doc?.id) {
        setFailed(true);
        return;
      }
      onChanged?.();
      router.push(`${admin}/collections/opening-exceptions/${body.doc.id}`);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      className={className}
      disabled={busy}
      onClick={close}
      title={day.closed ? "Afwijkende dag maken voor deze dag" : "Deze dag sluiten"}
      type="button"
    >
      <span className={styles.bandLabel}>{busy ? "Bezig…" : label}</span>
      {failed ? (
        <span className={styles.bandNote}>Sluiten lukte niet</span>
      ) : day.note && !compact ? (
        <span className={styles.bandNote}>{day.note}</span>
      ) : null}
    </button>
  );
}

/* --------------------------------------------------------------- rows -- */

export function ReservationLine({
  reservation,
  compact = false,
}: {
  reservation: AgendaReservation;
  compact?: boolean;
}) {
  const { admin } = useAdminRoutes();
  const cancelled = reservation.status === "geannuleerd";
  return (
    <a
      className={[
        styles.res,
        styles[`status_${reservation.status}`] || "",
        cancelled ? styles.resCancelled : "",
      ]
        .filter(Boolean)
        .join(" ")}
      href={`${admin}/collections/reservations/${reservation.id}`}
    >
      <span className={styles.resTime}>{reservation.time || "?"}</span>
      {/* Name and mark are wrapped together so the mark stays *against* the
          name however long it is — a badge that floats off at the right edge
          of a wide panel stops being something about this guest — while the
          covers and the status keep their own column on the right. */}
      <span className={styles.resWho}>
        <span className={styles.resName}>{reservation.name}</span>
        <GuestMark compact={compact} history={reservation.history} />
      </span>
      <span className={styles.resGuests}>{reservation.guests}p</span>
      {!compact ? (
        <span className={styles.resStatus}>{statusLabel(reservation.status)}</span>
      ) : null}
    </a>
  );
}

export function EventLine({
  event,
  compact = false,
}: {
  event: AgendaEvent;
  compact?: boolean;
}) {
  const { admin } = useAdminRoutes();
  return (
    <a
      className={[styles.event, compact ? styles.eventCompact : ""]
        .filter(Boolean)
        .join(" ")}
      href={`${admin}/collections/events/${event.docId}`}
      title={event.title}
    >
      <span className={styles.eventDot} aria-hidden="true" />
      <span className={styles.eventTime}>
        {event.allDay ? "Hele dag" : event.time}
      </span>
      <span className={styles.eventTitle}>{event.title}</span>
      {!compact && event.status !== "published" ? (
        <span className={styles.tag}>Concept</span>
      ) : null}
      {!compact && event.recurring ? (
        <span className={styles.tag}>Herhaalt</span>
      ) : null}
    </a>
  );
}

/* ----------------------------------------------------------- the day -- */

export function AgendaDay({ date, from, to, today }: AgendaModeProps) {
  const { data, error, loading, reload } = useAgenda(from, to);

  if (!data) {
    if (loading) return <Loading what="De dag" />;
    if (error) return <ErrorLine message={error} onRetry={reload} />;
    return <p className={styles.state}>Niets gevonden voor deze dag.</p>;
  }

  const day = data.days.find((d) => d.date === date) || null;
  const reservations = byTime(data.reservations.filter((r) => r.date === date));
  const events = byTime(data.events.filter((e) => e.date === date));
  const covers = coversOf(reservations);
  const booked = reservations.filter((r) => r.status !== "geannuleerd");
  const firstReservations = firstReservationsOf(reservations);

  return (
    <div className={styles.day}>
      {error ? <ErrorLine message={error} onRetry={reload} /> : null}

      <div className={styles.dayHead}>
        <h2 className={styles.dayTitle}>
          {longDate(date)}
          {date === today ? <span className={styles.tag}>vandaag</span> : null}
        </h2>
        {day ? <DayBand day={day} onChanged={reload} /> : null}
      </div>

      <div className={styles.dayColumns}>
        <section className={styles.panel}>
          <h3 className={styles.panelTitle}>
            Reserveringen{" "}
            <span className={styles.panelCount}>
              {booked.length} {booked.length === 1 ? "tafel" : "tafels"} · {covers}{" "}
              {covers === 1 ? "gast" : "gasten"}
            </span>
            {firstReservations > 0 ? (
              <span className={styles.panelFirst}>
                {firstReservations === 1
                  ? "1 eerste reservering"
                  : `${firstReservations} eerste reserveringen`}
              </span>
            ) : null}
          </h3>
          {reservations.length === 0 ? (
            <p className={styles.state}>Nog geen reserveringen voor deze dag.</p>
          ) : (
            <ul className={styles.list}>
              {reservations.map((r) => (
                <li key={r.id}>
                  <ReservationLine reservation={r} />
                  {/* The mark beside the name is two words wide; this is the
                      same fact with room to be read, because the day view is
                      the one they read standing up, ten minutes before the
                      first table sits down. It says what the calendar knows and
                      nothing about what to do with it. */}
                  {r.history?.isFirstReservation && r.status !== "geannuleerd" ? (
                    <p className={styles.resHint}>
                      Heeft niet eerder gereserveerd.
                    </p>
                  ) : null}
                  {r.notes ? <p className={styles.resNotes}>{r.notes}</p> : null}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={styles.panel}>
          <h3 className={styles.panelTitle}>Wat er te doen is</h3>
          {events.length === 0 ? (
            <p className={styles.state}>Er staat niets gepland.</p>
          ) : (
            <ul className={styles.list}>
              {events.map((e) => (
                <li key={e.id}>
                  <EventLine event={e} />
                  {e.location ? (
                    <p className={styles.resNotes}>{e.location}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <StatsPanel stats={data.stats} isToday={date === today} />
    </div>
  );
}

/**
 * "Vandaag", the panel nobody strictly needs.
 *
 * It answers the question the owners actually ask each other at the end of a
 * shift — how many tables, how many people, did anybody write to us — and it
 * puts the website's visitors next to those numbers because that is the only
 * place the two ever get compared. Anything Umami cannot tell us is a sentence
 * rather than a zero: a nought under "bezoekers" would read as a very bad day
 * instead of as a missing API key.
 */
function StatsPanel({
  stats,
  isToday,
}: {
  stats: AgendaStats | null;
  isToday: boolean;
}) {
  if (!stats) return null;
  return (
    <section className={styles.panel}>
      <h3 className={styles.panelTitle}>
        {isToday ? "Vandaag" : "Op deze dag"}
      </h3>
      <div className={styles.stats}>
        <Stat label="Tafels" value={stats.tables} />
        <Stat label="Gasten" value={stats.covers} />
        <Stat label="Aanvragen binnengekomen" value={stats.newReservations} />
        <Stat label="Berichten via het contactformulier" value={stats.contacts} />
        <Stat label="Aanmeldingen nieuwsbrief" value={stats.subscribers} />
        {stats.cancelled > 0 ? (
          <Stat label="Geannuleerd" value={stats.cancelled} />
        ) : null}
        {stats.visitors !== null ? (
          <Stat label="Bezoekers op de site" value={stats.visitors} />
        ) : null}
        {stats.pageviews !== null ? (
          <Stat label="Bekeken pagina's" value={stats.pageviews} />
        ) : null}
      </div>
      {stats.analyticsNote ? (
        <p className={styles.state}>{stats.analyticsNote}</p>
      ) : null}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className={styles.stat}>
      <span className={styles.statValue}>{value}</span>
      <span className={styles.statLabel}>{label}</span>
    </div>
  );
}
