"use client";

import React from "react";
import {
  byTime,
  coversOf,
  DayBand,
  ErrorLine,
  EventLine,
  Loading,
  ReservationLine,
  shortDate,
  useAdminRoutes,
  useAgenda,
  type AgendaModeProps,
} from "./AgendaDay";
import styles from "./agenda.module.scss";

/**
 * Seven days beside each other: the view the agenda opens on.
 *
 * The week is the default because it is the unit the owners plan in. A month
 * tells them whether they are busy; a day tells them what to do this evening;
 * the week is where they notice that Thursday has three tables and a quiz
 * booked into the same corner.
 *
 * On a phone the seven columns become seven blocks stacked under each other,
 * which is the only honest thing a week can do at that width — the grid lives
 * in agenda.module.scss and collapses there rather than here.
 *
 * The bookings are drawn compact, which is also what shrinks the "have we met"
 * mark from "Eerste bezoek" to a bare "1e": a column this narrow has room for
 * a number and nothing else, and the sentence waits in the tooltip. Nothing in
 * this file arranges that — ReservationLine carries it, exactly as it carries
 * the time and the covers, so the three views can never drift apart on what a
 * first-time guest looks like.
 */
export function AgendaWeek({ from, to, today }: AgendaModeProps) {
  const { data, error, loading, reload } = useAgenda(from, to);
  const { admin } = useAdminRoutes();

  if (!data) {
    if (loading) return <Loading what="De week" />;
    if (error) return <ErrorLine message={error} onRetry={reload} />;
    return <p className={styles.state}>Niets gevonden voor deze week.</p>;
  }

  return (
    <div>
      {error ? <ErrorLine message={error} onRetry={reload} /> : null}
      <div className={styles.week}>
        {data.days.map((day) => {
          const reservations = byTime(
            data.reservations.filter((r) => r.date === day.date),
          );
          const events = byTime(data.events.filter((e) => e.date === day.date));
          const booked = reservations.filter((r) => r.status !== "geannuleerd");
          const covers = coversOf(reservations);

          return (
            <section
              className={[
                styles.weekCol,
                day.closed ? styles.dayClosed : "",
                day.date === today ? styles.dayToday : "",
              ]
                .filter(Boolean)
                .join(" ")}
              key={day.date}
            >
              <h3 className={styles.weekColHead}>
                <a
                  href={`${admin}/agenda?mode=day&date=${day.date}`}
                  title="Dagoverzicht openen"
                >
                  {shortDate(day.date)}
                </a>
                {booked.length > 0 ? (
                  <span className={styles.weekColCount}>
                    {booked.length}× · {covers}p
                  </span>
                ) : null}
              </h3>

              <DayBand compact day={day} onChanged={reload} />

              {events.map((e) => (
                <EventLine compact event={e} key={e.id} />
              ))}

              {reservations.length === 0 ? (
                <p className={styles.stateSmall}>Geen tafels</p>
              ) : (
                <ul className={styles.list}>
                  {reservations.map((r) => (
                    <li key={r.id}>
                      <ReservationLine compact reservation={r} />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
