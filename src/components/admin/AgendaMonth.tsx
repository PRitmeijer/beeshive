"use client";

import React from "react";
import {
  coversOf,
  DayBand,
  ErrorLine,
  firstReservationsOf,
  Loading,
  useAdminRoutes,
  useAgenda,
  WEEKDAY_LABELS,
  type AgendaModeProps,
} from "./AgendaDay";
import styles from "./agenda.module.scss";

/**
 * The whole month, at a glance.
 *
 * A month cell is too small to be read, so it is deliberately not written to
 * be: it carries the day number, the band, one number for the tables and one
 * for the covers, and a title per evening that is on. Anything more turns the
 * grid into a wall of grey text that nobody scans. The day number is a link
 * into the day view, which is where the detail belongs.
 *
 * The window it is given always starts on the Monday of the week the first
 * falls in and ends on the Sunday of the week the last does, so the grid is
 * whole weeks; the days on either end that belong to a neighbouring month are
 * dimmed rather than left out, because a Monday hole at the top of a calendar
 * reads as a bug.
 *
 * That is also why the guests who have not booked here before are counted
 * rather than marked. The day and the week put a "1e reservering" on the
 * booking itself, which is the right thing where you can read a name beside
 * it; forty
 * cells of little badges would be a rash, and nobody plans a month around one
 * table anyway. What a month is good for is noticing that the last two weeks
 * brought hardly any new faces, or that the Thursday after the quiz night
 * brought six — so the cell carries one number and the day view has the names.
 */
export function AgendaMonth({ from, to, date, today }: AgendaModeProps) {
  const { data, error, loading, reload } = useAgenda(from, to);
  const { admin } = useAdminRoutes();
  const month = date.slice(0, 7);

  if (!data) {
    if (loading) return <Loading what="De maand" />;
    if (error) return <ErrorLine message={error} onRetry={reload} />;
    return <p className={styles.state}>Niets gevonden voor deze maand.</p>;
  }

  return (
    <div>
      {error ? <ErrorLine message={error} onRetry={reload} /> : null}

      <div className={styles.monthScroll}>
        <div className={styles.monthHead} aria-hidden="true">
          {WEEKDAY_LABELS.map((label) => (
            <span className={styles.monthHeadCell} key={label}>
              {label}
            </span>
          ))}
        </div>

        <div className={styles.month}>
          {data.days.map((day) => {
            const reservations = data.reservations.filter(
              (r) => r.date === day.date && r.status !== "geannuleerd",
            );
            const events = data.events.filter((e) => e.date === day.date);
            const covers = coversOf(reservations);
            const firstReservations = firstReservationsOf(reservations);

            return (
              <div
                className={[
                  styles.monthCell,
                  day.closed ? styles.dayClosed : "",
                  day.date === today ? styles.dayToday : "",
                  day.date.slice(0, 7) === month ? "" : styles.dayOutside,
                ]
                  .filter(Boolean)
                  .join(" ")}
                key={day.date}
              >
                <a
                  className={styles.monthNumber}
                  href={`${admin}/agenda?mode=day&date=${day.date}`}
                  title="Dagoverzicht openen"
                >
                  {Number(day.date.slice(8, 10))}
                </a>

                <DayBand compact day={day} onChanged={reload} />

                {reservations.length > 0 ? (
                  <p className={styles.monthCount}>
                    {reservations.length}× · {covers}p
                  </p>
                ) : null}

                {firstReservations > 0 ? (
                  <p
                    className={styles.monthFirst}
                    title={
                      firstReservations === 1
                        ? "Eén tafel reserveert hier voor het eerst; open de dag voor de naam."
                        : `${firstReservations} tafels reserveren hier voor het eerst; open de dag voor de namen.`
                    }
                  >
                    {firstReservations}× 1e reservering
                  </p>
                ) : null}

                {events.map((e) => (
                  <p className={styles.monthEvent} key={e.id} title={e.title}>
                    <span className={styles.eventDot} aria-hidden="true" />
                    {e.title}
                  </p>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
