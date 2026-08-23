import React from "react";
import { redirect } from "next/navigation";
import type { AdminViewProps, ServerProps } from "payload";
import { DefaultTemplate } from "@payloadcms/next/templates";
import { Gutter, SetStepNav } from "@payloadcms/ui";
import { todayInAmsterdam } from "@/lib/openingHours";
import { AgendaDay } from "./AgendaDay";
import { AgendaWeek } from "./AgendaWeek";
import { AgendaMonth } from "./AgendaMonth";
import styles from "./agenda.module.scss";

/**
 * The agenda: one page in the admin that answers "what happens when".
 *
 * The owners had three separate lists — the reservations, the events, and the
 * afwijkende dagen — and no way to hold them against each other. Whether they
 * could close the Monday depended on all three, so closing a Monday meant
 * opening three tabs and trusting your memory. This puts them on one grid, at
 * three zoom levels, and lets the calendar itself write the exception that
 * shuts the day.
 *
 * It is a server component for a reason that is easy to trip over. Payload 3.10
 * only wraps *its own* views in the admin chrome: getViewFromConfig leaves
 * `templateType` undefined for anything registered under
 * `admin.components.views`, so a custom view that does not render
 * DefaultTemplate itself comes out as a bare page with no navigation, no
 * header and no way back. And a client component cannot render it — the
 * template takes the Payload instance as a prop. Hence the split: this file
 * builds the chrome and works out which days are being asked about, and the
 * three mode components under it are browser code that fetches
 * /api/admin/agenda and draws the result.
 *
 * The second trap in the same area: initPage treats every custom admin view as
 * a public route (see isCustomAdminView in @payloadcms/next), so Payload does
 * *not* bounce an anonymous visitor to the login screen the way it does for a
 * collection. Nothing but the guard below stands between a stranger and a page
 * of guests' names, which is why it is the first thing that happens here and
 * why the endpoint repeats the check for itself.
 *
 * All the date arithmetic lives on this side, at midday UTC, exactly as
 * src/lib/schedule.ts does it — midday is far enough from either edge that no
 * timezone offset and no daylight saving jump can push a date onto its
 * neighbour. Today is resolved here too and handed down as a string: reading
 * the clock while rendering is how a page ends up disagreeing with itself about
 * which day it is.
 */

const MODES = ["day", "week", "month"] as const;
type Mode = (typeof MODES)[number];

const MODE_LABELS: Record<Mode, string> = {
  day: "Dag",
  week: "Week",
  month: "Maand",
};

const DAY_MS = 86_400_000;

/** Midday UTC for a date string; see the note above about why midday. */
const at = (isoDate: string) => new Date(`${isoDate}T12:00:00.000Z`);
const iso = (date: Date) => date.toISOString().slice(0, 10);

const shift = (isoDate: string, days: number) =>
  iso(new Date(at(isoDate).getTime() + days * DAY_MS));

/** Monday is the first column, because a Dutch week starts there. */
function mondayOf(isoDate: string): string {
  const weekday = (at(isoDate).getUTCDay() + 6) % 7;
  return shift(isoDate, -weekday);
}

const firstOfMonth = (isoDate: string) => `${isoDate.slice(0, 7)}-01`;

function lastOfMonth(isoDate: string): string {
  const d = at(firstOfMonth(isoDate));
  // Day zero of the following month is the last day of this one, which is the
  // only way to say "the 28th, 29th, 30th or 31st" without a table.
  return iso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0, 12)));
}

function addMonths(isoDate: string, delta: number): string {
  const d = at(firstOfMonth(isoDate));
  return iso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + delta, 1, 12)));
}

const NL_LONG = new Intl.DateTimeFormat("nl-NL", {
  timeZone: "UTC",
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

const NL_DAY_MONTH = new Intl.DateTimeFormat("nl-NL", {
  timeZone: "UTC",
  day: "numeric",
  month: "long",
});

const NL_FULL = new Intl.DateTimeFormat("nl-NL", {
  timeZone: "UTC",
  day: "numeric",
  month: "long",
  year: "numeric",
});

const NL_MONTH = new Intl.DateTimeFormat("nl-NL", {
  timeZone: "UTC",
  month: "long",
  year: "numeric",
});

const isIsoDate = (value: unknown): value is string =>
  typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);

/** The one window each mode is about, and what to call it. */
function windowFor(mode: Mode, date: string) {
  if (mode === "day") {
    return { from: date, to: date, title: NL_LONG.format(at(date)) };
  }
  if (mode === "month") {
    const from = mondayOf(firstOfMonth(date));
    const to = shift(mondayOf(lastOfMonth(date)), 6);
    return { from, to, title: NL_MONTH.format(at(firstOfMonth(date))) };
  }
  const from = mondayOf(date);
  const to = shift(from, 6);
  return {
    from,
    to,
    title: `${NL_DAY_MONTH.format(at(from))} – ${NL_FULL.format(at(to))}`,
  };
}

/** One step back or forward, in whatever unit the current mode counts in. */
function step(mode: Mode, date: string, direction: -1 | 1): string {
  if (mode === "day") return shift(date, direction);
  if (mode === "week") return shift(date, direction * 7);
  return addMonths(date, direction);
}

export function AgendaView({ initPageResult, params, searchParams }: AdminViewProps) {
  const { permissions, req, visibleEntities } = initPageResult;
  const adminRoute = req.payload.config.routes.admin || "/admin";
  const agendaRoute = `${adminRoute}/agenda`;

  if (!req.user || !permissions?.canAccessAdmin) {
    const loginRoute = req.payload.config.admin.routes.login || "/login";
    redirect(
      `${adminRoute}${loginRoute}?redirect=${encodeURIComponent(agendaRoute)}`,
    );
  }

  const today = todayInAmsterdam();
  const modeParam = searchParams?.mode;
  const dateParam = searchParams?.date;
  const mode: Mode = MODES.includes(modeParam as Mode) ? (modeParam as Mode) : "week";
  const date = isIsoDate(dateParam) ? dateParam : today;

  const { from, to, title } = windowFor(mode, date);
  const href = (nextMode: Mode, nextDate: string) =>
    `${agendaRoute}?mode=${nextMode}&date=${nextDate}`;

  return (
    <DefaultTemplate
      className="agenda-view"
      i18n={req.i18n}
      locale={initPageResult.locale}
      params={params}
      payload={req.payload}
      permissions={permissions}
      searchParams={searchParams}
      user={req.user}
      // Copied field by field rather than passed straight through, for the same
      // reason @payloadcms/next does it: React 19 freezes the object and
      // handing the template the original one throws on assignment.
      visibleEntities={{
        collections: visibleEntities?.collections,
        globals: visibleEntities?.globals,
      }}
    >
      <SetStepNav nav={[{ label: "Agenda" }]} />
      <Gutter className={styles.agenda}>
        <header className={styles.toolbar}>
          <div className={styles.modes}>
            {MODES.map((m) => (
              <a
                aria-current={m === mode ? "page" : undefined}
                className={[styles.mode, m === mode ? styles.modeActive : ""]
                  .filter(Boolean)
                  .join(" ")}
                href={href(m, date)}
                key={m}
              >
                {MODE_LABELS[m]}
              </a>
            ))}
          </div>

          <h1 className={styles.title}>{title}</h1>

          <nav className={styles.steps} aria-label="Andere periode">
            <a
              className={styles.step}
              href={href(mode, step(mode, date, -1))}
              title="Vorige"
            >
              ‹
            </a>
            <a className={styles.step} href={href(mode, today)}>
              Vandaag
            </a>
            <a
              className={styles.step}
              href={href(mode, step(mode, date, 1))}
              title="Volgende"
            >
              ›
            </a>
          </nav>
        </header>

        {mode === "day" ? (
          <AgendaDay date={date} from={from} to={to} today={today} />
        ) : null}
        {mode === "week" ? (
          <AgendaWeek date={date} from={from} to={to} today={today} />
        ) : null}
        {mode === "month" ? (
          <AgendaMonth date={date} from={from} to={to} today={today} />
        ) : null}

        <p className={styles.legend}>
          Klik op de openingstijden van een dag om die dag te sluiten of aan te
          passen, op een reservering om de aanvraag te openen, en op een
          evenement om het te bewerken. Achter een naam staat de hoeveelste
          reservering het is: <strong>Eerste reservering</strong> (in de week
          alleen <strong>1e</strong>) betekent dat deze gast niet eerder heeft
          gereserveerd. Zonder reservering langsgeweest zijn zien we niet.
        </p>
      </Gutter>
    </DefaultTemplate>
  );
}

/**
 * The way in, at the top of the navigation.
 *
 * A plain link rather than something clever: this renders on the server beside
 * Payload's own nav links and borrows their classes, so it inherits their
 * spacing, their hover and their dark mode without a line of CSS. It has no
 * "active" state for the same reason — knowing that would mean shipping a
 * client component to draw one word.
 */
export function AgendaNavLink({ payload }: Partial<ServerProps>) {
  const adminRoute = payload?.config?.routes?.admin || "/admin";
  return (
    <a className="nav__link" href={`${adminRoute}/agenda`} id="nav-agenda">
      <span className="nav__link-label">Agenda</span>
    </a>
  );
}
