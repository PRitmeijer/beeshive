import React from "react";
import type { ServerProps } from "payload";
import { todayInAmsterdam } from "@/lib/openingHours";

/**
 * "Vanaf vandaag" en "Alle aanvragen", vlak boven de tabel met reserveringen.
 *
 * The owners asked for a way to see everything that is still to come. The
 * agenda at /admin/agenda already shows a day, a week or a month, and it does
 * that better than a table ever will — three zoom levels, the events and the
 * afwijkende dagen on the same grid, the guest-history badge behind each name.
 * But it is windowed and stepped, so there is nowhere in this admin that says
 * "everything from today onwards". A party of twelve booked for December is
 * invisible in August until somebody pages forward four months, and nobody
 * pages forward on the off-chance. This is that one missing view, and it is
 * the collection list they already know rather than a fourth calendar.
 *
 * The short way to say it: the agenda is the calendar, the list is the work
 * that still has to be done.
 *
 * It is two links and a sentence, and it is deliberately not more. Vandaag and
 * Deze week would be a worse copy of the agenda three inches from the table,
 * and it would teach the owners that there are two places to look for
 * Thursday.
 *
 * WHY THIS IS A URL AND NOT admin.baseListFilter
 *
 * Payload has a collection-level `baseListFilter` that would default this list
 * to the future in four lines. As of 3.88 it is deprecated in favour of
 * `baseFilter`, which takes precedence when both are set and which deliberately
 * reaches beyond the List View — internal link relationships in the Lexical
 * editor, among others. That widening makes the objection below stronger, not
 * weaker, so neither property is used here.
 *
 * It is the wrong tool, for three reasons, any
 * one of which is disqualifying. It never reaches the browser — it sits in
 * Payload's own ServerOnlyCollectionAdminProperties — so nothing on screen
 * would say the list is only part of itself: the owners would see forty rows,
 * a footer reading "1-10 of 40", and no way on earth to discover that three
 * hundred more exist. It is AND-ed onto the query, so a user can only ever
 * narrow it further and an escape hatch cannot be built. And "select all" in
 * this admin rebuilds its own query from the URL alone, so under a filter the
 * owners could not see, select-all-then-delete would act on rows that were
 * never on screen.
 *
 * A where clause in the URL has none of that. It is visible, the Back button
 * undoes it, and — because it is written in the or/and shape that
 * ListControls.validateWhereQuery recognises — Payload opens its own Filters
 * panel on arrival and draws the condition with a minus button beside it. The
 * filter announces itself and offers its own removal, and nothing here had to
 * be built to make that happen.
 *
 * It also cannot get stuck. Payload only ever writes `limit` and `sort` into a
 * user's preferences, never a `where`, so a filtered list does not outlive a
 * click: the sidebar link leads back to the whole list, and so does closing
 * the tab.
 *
 * One thing worth knowing before reading that Filters panel: it speaks
 * English. This config declares no `i18n`, so Payload falls back to { en } and
 * the condition reads "Datum · is greater than or equal to · Aug 24, 2026".
 * That is the existing state of this admin rather than something this file
 * introduced, but it is why the sentence below exists at all, and it is why
 * the link carries exactly one condition — a second, unlabelled clause hanging
 * off a Dutch label and spelled out only in English somewhere the owners may
 * never open is how a tool stops being trusted.
 *
 * Cancelled reservations stay in the list. The pill says "vanaf vandaag" and
 * that is all it does. A row that vanishes the moment you set it to
 * Geannuleerd is how somebody comes to believe they deleted a booking, and a
 * cancellation about tonight is still information about tonight when the guest
 * rings back to check. The agenda made the same call: it shows a cancelled
 * table and only leaves it out of the counts.
 *
 * A server component, with no "use client". That half is load-bearing rather
 * than stylistic: RenderServerComponent hands over `payload` and `searchParams`
 * only to a component that passes isReactServerComponentOrFunction, and on
 * Payload 3.88 that helper is exactly one test — a function whose `$$typeof` is
 * not React's client-reference symbol. Adding "use client" here turns this into
 * a client ref, and it would then compile, render, and silently receive neither
 * prop.
 *
 * The declaration is also a named `function`, but on 3.88 that is style and not
 * a requirement. Earlier versions of the same helper rejected anonymous
 * functions outright, so the name mattered; that clause is gone.
 *
 * Registered in Reservations.admin.components.beforeListTable, and like every
 * other custom component here it also has to appear in
 * src/app/(payload)/admin/importMap.js — `npm run generate:importmap` writes
 * it. A missing entry fails silently: the path does not resolve, the slot
 * renders null, and the list looks entirely normal with no pills on it. Check
 * the page, not the console.
 */

const LIST_PATH = "/collections/reservations";

/**
 * The one condition, as a single string, so the href that sets the filter and
 * the check that lights the pill are built from the same bytes and cannot
 * drift apart.
 *
 * The or/and nesting is not decoration. ListControls only auto-opens the
 * Filters panel for a `where` that validateWhereQuery accepts, and it accepts
 * this shape and not the flat `where[date][...]` one — so those few extra
 * characters are the difference between a filter that shows itself and one
 * that hides.
 */
const FILTER_KEY = "where[or][0][and][0][date][greater_than_equal]";

export function UpcomingFilter({ payload, searchParams }: Partial<ServerProps>) {
  const adminRoute = payload?.config?.routes?.admin || "/admin";
  const listRoute = `${adminRoute}${LIST_PATH}`;

  /*
   * Today, read on the server in the café's own timezone while the page
   * renders — never in the browser, which may be a laptop in another country
   * or one that was left open overnight. This is the same discipline
   * AgendaView.tsx applies for the same reason.
   *
   * A tab left open across midnight does serve yesterday's link, and that is
   * accepted rather than fixed: it fails in the only direction that is safe,
   * showing one day that has already been rather than hiding one that has not,
   * and any navigation re-renders it.
   */
  const today = todayInAmsterdam();

  /*
   * The bare date rather than an explicit T00:00:00.000Z: Payload runs
   * `new Date(value).toISOString()` over it on the way into the query, so the
   * two are byte-identical SQL, and this one stays readable in the address
   * bar. It is also the same reading of a stored date the agenda endpoint uses
   * when it takes .slice(0, 10), which is what keeps the two from ever
   * disagreeing about what day a booking is on.
   *
   * That the boundary lands on today and not yesterday rests on every row's
   * date sitting at exactly midday UTC. Two writers guarantee it — /api/reserve
   * writes `${date}T12:00:00.000Z` by hand, and Payload's own dayOnly picker
   * normalises a typed date to the same instant — which leaves twelve hours of
   * slack either side. Nothing enforces it, though. A bulk import writing a
   * plain midnight, or a switch to dayAndTime, would put a row at 22:00Z the
   * evening before and this filter would read it as yesterday. If you are that
   * person, this paragraph is your warning.
   *
   * The bound is on the date and never on the time. A table at 19:00 stays in
   * the list all evening, which is exactly when the owners are looking at it.
   *
   * sort=date rides in the query string instead of becoming the collection's
   * defaultSort, because soonest-first is right for this list and wrong for the
   * unfiltered one: that one is an inbox, and a new request has to land on top
   * of it. Do NOT ever reach for sort=date,time to break the ties within a day.
   * The URL sort has to be a string, Payload does not split it on commas, so it
   * would look for a column literally named "date,time", throw, be swallowed by
   * a bare catch, and leave the query with no ORDER BY at all — at which point
   * paging quietly starts duplicating and dropping rows. "Tijd" in the columns
   * is the honest mitigation; a time-ordered evening lives in the agenda.
   */
  const upcomingHref = `${listRoute}?sort=date&${FILTER_KEY}=${today}`;

  /*
   * Read the filter off the where itself, and match the value as well as the
   * key, rather than inventing a marker parameter.
   *
   * Two reasons. Anything that is not limit, page, search, sort or where is
   * thrown away the first time the owner pages or sorts — Payload rebuilds the
   * URL from those five keys and nothing else — so a `?filter=aankomend` would
   * go quiet while the list stayed filtered, leaving the pills saying one thing
   * and the table another. And matching the value means the pill stops claiming
   * to be lit the moment somebody builds a filter of their own in the panel,
   * which is precisely when it must not claim anything.
   *
   * Next hands searchParams over flat and already decoded, so the nesting is
   * still sitting in the key here rather than parsed into an object.
   */
  const params = (searchParams ?? {}) as Record<
    string,
    string | string[] | undefined
  >;
  const filtered = params[FILTER_KEY] === today;
  const hasOwnFilter =
    !filtered && Object.keys(params).some((key) => key.startsWith("where["));

  // Payload's own pill classes, which are already on the page: the site's
  // Tailwind is not loaded in the admin, and a utility class here would render
  // as nothing — and only in production, where it is purged.
  const pill = (active: boolean) =>
    `pill pill--style-${active ? "dark" : "light"} pill--has-link pill--has-action`;

  return (
    <div
      style={{
        alignItems: "baseline",
        display: "flex",
        flexWrap: "wrap",
        gap: "0.5rem 0.75rem",
        margin: "0 0 var(--base)",
      }}
    >
      {/*
        Plain anchors, and they have to stay plain anchors. Payload's filter
        builder seeds itself from the URL once, when it mounts, and nothing
        syncs it the other way afterwards. Swap these for next/link or for
        Payload's own <Pill to=...> "for speed" and the navigation becomes soft:
        the Filters panel goes on showing the previous filter, and the next
        thing typed into it writes that stale condition back over ours. A full
        page load is the fix, and it costs nothing on an admin page behind a
        login.
      */}
      <a className={pill(filtered)} href={upcomingHref}>
        <span className="pill__label">Vanaf vandaag</span>
      </a>
      <a className={pill(!filtered && !hasOwnFilter)} href={listRoute}>
        <span className="pill__label">Alle aanvragen</span>
      </a>

      {/*
        Only while the filter is on. An unfiltered list is complete and has
        nothing to warn about, and a notice that is always there is a notice
        nobody reads.

        This slot is drawn above both the table and Payload's own "no results"
        block, which is the whole reason for choosing it: on an empty filtered
        list the owners read the lit pill, then this sentence, and only then
        "No Reserveringsaanvragen found" — so they cannot come away thinking
        there are no reservations when there are only past ones.
      */}
      {filtered ? (
        <span
          style={{
            color: "var(--theme-elevation-500)",
            fontSize: "0.85rem",
            lineHeight: 1.4,
          }}
        >
          Je ziet nu alleen aanvragen voor vandaag en later. Klik op{" "}
          <strong>Alle aanvragen</strong> voor de volledige lijst, ook de datums
          die al geweest zijn.
        </span>
      ) : null}
    </div>
  );
}
