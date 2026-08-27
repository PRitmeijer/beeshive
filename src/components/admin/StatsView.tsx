import React from "react";
import { redirect } from "next/navigation";
import type { AdminViewProps, ServerProps } from "payload";
import { DefaultTemplate } from "@payloadcms/next/templates";
import { Gutter, SetStepNav } from "@payloadcms/ui";
import {
  getUmamiStats,
  isRange,
  type UmamiPropertyValue,
  type UmamiRange,
  type UmamiResult,
} from "@/lib/umamiServer";
import styles from "./stats.module.scss";

/**
 * /admin/statistieken — the page the settings and the documentation have been
 * promising all along.
 *
 * src/lib/umamiServer.ts has been ready this whole time. Six hundred lines of
 * it: credential precedence, a login that renews its own token, per-report
 * failure isolation written after a real incident, and a distinct Dutch
 * sentence for each distinct thing that can be wrong. Not one of those
 * sentences had ever been shown to a human being, because nothing in the admin
 * called any of it. The Statistieken tab told the owners "daarmee haalt dit
 * paneel de cijfers weer op" and there was no paneel. docs/analytics.md
 * described "a panel the owners keep open". This is that panel, finally.
 *
 * It renders on the server and ships no browser code at all. That is a change
 * from what the old comments assumed — they described something that polled —
 * and it is the better trade here for three reasons. The figures are already a
 * minute stale by design, so live updating would be a spinner in front of a
 * cache. The failure sentences are the most important thing on the page and a
 * server render puts them in the first paint rather than after a fetch that
 * itself has to be authenticated. And this file may hold only one component:
 * the chrome below needs the Payload instance, which means a server component,
 * and a client half would have to live in a second file. Changing the period
 * is an ordinary link, exactly as the agenda changes its week.
 *
 * The two Payload 3.88 facts that make every custom view look more elaborate
 * than it is, repeated here rather than cross-referenced because forgetting
 * either one is silent:
 *
 * A custom view gets no template. getViewFromConfig leaves `templateType`
 * undefined for anything under `admin.components.views`, so a view that does
 * not render DefaultTemplate itself arrives as a bare page with no navigation
 * and no way back.
 *
 * And a custom view is a *public* route as far as initPage is concerned (see
 * isCustomAdminView in @payloadcms/next): Payload will not bounce an anonymous
 * visitor to the login screen the way it does for a collection. The guard
 * below is the only thing that does.
 *
 * On the styling: the site's Tailwind is not loaded in the admin and must not
 * be. stats.module.scss opens with the whole argument.
 *
 * On the order of the page, which is the part that took the thinking. Two
 * people who run a café read this standing up, and they read from the top
 * until it stops being about them. So the plain numbers come first, because
 * that is what "how are we doing" means and they already know how to read it.
 * The booking funnel comes second, because it is the only thing here that
 * answers a question they have actually asked out loud — where people give up,
 * and whether the telephone is worse, in both cases only as far as Umami can
 * honestly be asked; the notes on FUNNEL_STEPS and on deviceSplitIsIgnored
 * below are about the two places where it cannot, and what the page does about
 * them instead of guessing. The refusals come third, because a
 * refusal is the one figure on this page that turns into a decision: slotFull
 * clustered in large parties booking the same day is a capacity setting to
 * change on Monday, not a statistic. Everything after that is background.
 */

/* ------------------------------------------------------------- vocabulary -- */

const PERIODS: { range: UmamiRange; label: string }[] = [
  { range: "today", label: "Vandaag" },
  { range: "7d", label: "7 dagen" },
  { range: "30d", label: "30 dagen" },
  { range: "year", label: "Dit jaar" },
];

const PERIOD_TITLES: Record<UmamiRange, string> = {
  today: "Vandaag",
  "7d": "De afgelopen 7 dagen",
  "30d": "De afgelopen 30 dagen",
  year: "Dit jaar",
};

/**
 * The bucket size the graph came back in. umamiServer.ts decides this for
 * itself and does not hand it out, so it is restated here — but only ever to
 * choose a label. If the two ever drift apart the bars stay right and their
 * captions go wrong, which is the harmless half of the mistake.
 */
const UNITS: Record<UmamiRange, "hour" | "day" | "month"> = {
  today: "hour",
  "7d": "day",
  "30d": "day",
  year: "month",
};

/**
 * The stages of a booking, in the order somebody walks them.
 *
 * The keys are the `step` property values src/lib/umami.ts sends, copied
 * letter for letter. They carry their own numeric prefix, so nothing here
 * sorts anything: the funnel is in this order because this list is, and the
 * prefix is what stops the two from disagreeing silently.
 *
 * What the numbers beside them are is worth being blunt about, because this
 * column was headed "Mensen" for a while and that was not true. /event-data
 * counts event rows and de-duplicates nothing by session, and
 * `reservation_step` fires once per mounted flow — the telephone sheet builds
 * it inside a conditional, so closing the sheet and opening it again is a fresh
 * flow and a second "1_opened". Somebody who taps the reserveerknop, glances
 * at the times, closes the sheet and comes back twice is three of that first
 * row on their own, and the owners would have read the drop below it as people
 * giving up rather than as one person browsing. So the column says Keer, the
 * intro says what a keer is, and the legend says that reopening counts again.
 * Counting people properly means sending each step once per session from the
 * browser, which is a change in src/components/booking/useFunnel.ts and not
 * here; until somebody makes it, the honest column heading is the fix.
 *
 * These six are not the six this panel drew before the booking flow was
 * rebuilt. The party size arrives already answered at two, so the second thing
 * that happens to anybody is a day being chosen, and there is now a screen
 * between the time and the button — which is exactly the boundary the owners'
 * question is about, so it is a rung rather than a gap.
 *
 * There is no old series to reconcile with, and that is not a figure of speech:
 * no custom event ever reached Umami before August 2026, because the tracker's
 * global was shadowed by an element id. So the `RENAMED_STEPS` key that used to
 * be named here, and the old Dutch labels that used to sit in the table below,
 * are both gone — they described a past that is empty. `extraSteps` still
 * catches anything Umami returns that is not in this list, so a value nobody
 * planned for lands at the foot of the funnel rather than vanishing.
 */
const FUNNEL_STEPS: { key: string; label: string }[] = [
  { key: "1_opened", label: "Reserveren geopend" },
  { key: "2_date_picked", label: "Dag gekozen" },
  { key: "3_time_picked", label: "Tijd gekozen" },
  { key: "4_details_shown", label: "Bij de gegevens" },
  { key: "5_submit_attempted", label: "Op Reserveren gedrukt" },
  { key: "6_confirmed", label: "Reservering rond" },
];

/**
 * Plain Dutch for every value the site can send, in one place.
 *
 * A value with no entry here is printed exactly as it arrived rather than
 * skipped. That matters more than the tidiness: the browser half of this
 * system is edited by other people on other days, and a new refusal code or a
 * new exit reason must show up on this page as an unfamiliar word the owners
 * can ask about, never as a row that quietly is not there.
 */
const LABELS: Record<string, string> = {
  // The refusal codes from src/lib/reservationErrors.ts, plus the two the
  // browser adds when the request never got an answer at all.
  rateLimited: "Te snel achter elkaar geprobeerd",
  badRequest: "Formulier kwam onleesbaar binnen",
  tooLarge: "Bericht was te lang",
  nameRequired: "Naam niet ingevuld",
  nameTooLong: "Naam te lang",
  phoneRequired: "Telefoonnummer niet ingevuld",
  emailRequired: "E-mailadres niet ingevuld",
  emailInvalid: "E-mailadres klopte niet",
  phoneTooLong: "Telefoonnummer te lang",
  notesTooLong: "Opmerking te lang",
  guestsInvalid: "Aantal personen klopte niet",
  dateRequired: "Geen datum gekozen",
  dateInvalid: "Datum klopte niet",
  datePast: "Datum lag in het verleden",
  dateTooFar: "Datum lag te ver vooruit",
  timeInvalid: "Tijd klopte niet",
  dayClosed: "Die dag zijn we dicht",
  timeOutsideHours: "Buiten de openingstijden",
  timePassed: "Dat tijdstip was al voorbij",
  reservationsClosed: "Online reserveren stond uit",
  slotFull: "Dat tijdstip zat vol",
  dayFull: "Die dag zat vol",
  server: "Er ging iets mis bij ons",
  network: "De verbinding brak af",
  parse: "Ons antwoord kwam beschadigd aan",

  // How big the party was. Bands, never the exact number; docs/analytics.md
  // says why.
  "1-2": "1 tot 2 personen",
  "3-4": "3 tot 4 personen",
  "5-6": "5 tot 6 personen",
  "7-10": "7 tot 10 personen",
  "11+": "11 personen of meer",

  // How far ahead they were booking. The first band covers two evenings rather
  // than naming today on its own, and that is a privacy rule and not a rounding
  // choice: Umami writes down the day it recorded the event, so a band naming
  // one exact offset from that day is the booked evening in two pieces. The
  // wording is the owners' own, copied from the sentence under Instellingen →
  // Statistieken that promises them what is measured.
  "0-1_days": "Vandaag of morgen",
  "2-6_days": "2 tot 6 dagen vooruit",
  "1-2_weeks": "1 tot 2 weken vooruit",
  "2_weeks_plus": "Meer dan 2 weken vooruit",

  // How somebody left the form without finishing.
  sheet_closed: "Venster weer dichtgedaan",
  navigated_away: "Naar een andere pagina",
  page_hidden: "Weggeklikt of scherm uit",

  // The field the browser refused to submit on.
  name: "Naam",
  email: "E-mailadres",
  phone: "Telefoon",
  guests: "Aantal personen",
  date: "Datum",
  time: "Tijd",

  // What the beschikbaarheid check answered when somebody picked a day.
  slots_free: "Er was gewoon plek",
  some_full: "Een paar tijden waren vol",
  day_full: "De hele dag zat vol",
  day_closed: "Die dag was er niets te kiezen",
  refused: "Onze eigen server gaf een fout",

  // Which of our own buttons brought them to the form.
  mobile_fab: "Zwevende knop op de telefoon",
  mobile_external: "Extern reserveersysteem",
  nav: "Menubalk",
  nav_sheet: "Menu op de telefoon",

  // The funnel steps, so an abandonment list reads the same as the funnel.
  "1_opened": "Reserveren geopend",
  "2_date_picked": "Dag gekozen",
  "3_time_picked": "Tijd gekozen",
  "4_details_shown": "Bij de gegevens",
  "5_submit_attempted": "Op Reserveren gedrukt",
  "6_confirmed": "Reservering rond",

  // Welke van de twee vragen aan de beschikbaarheid werd gesteld.
  window: "Welke dagen er open zijn",
  day: "Welke tijden er vrij zijn op één dag",
  days_free: "Er waren dagen vrij",
  all_closed: "Geen enkele dag vrij",
};

/* ---------------------------------------------------------------- shaping -- */

const nl = new Intl.NumberFormat("nl-NL");
const num = (value: number) => nl.format(Math.round(value));

/** Whole percents; null when there is no denominator worth dividing by. */
function share(part: number, whole: number): null | number {
  return whole > 0 ? Math.round((part / whole) * 100) : null;
}

function duration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "—";
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60);
  return minutes > 0 ? `${minutes} min ${rest} s` : `${rest} s`;
}

/** A property's values as a lookup, so a step can be asked for by name. */
function byValue(rows: null | UmamiPropertyValue[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of rows ?? []) {
    map.set(row.value, (map.get(row.value) ?? 0) + row.count);
  }
  return map;
}

const sum = (rows: null | UmamiPropertyValue[]) =>
  (rows ?? []).reduce((total, row) => total + row.count, 0);

/** Two breakdowns holding the same values with the same counts. */
function sameCounts(
  left: UmamiPropertyValue[],
  right: UmamiPropertyValue[],
): boolean {
  const a = byValue(left);
  const b = byValue(right);
  if (a.size !== b.size) return false;
  for (const [value, count] of a) {
    if (b.get(value) !== count) return false;
  }
  return true;
}

/**
 * Whether the telephone-versus-computer split is a split at all, or the same
 * total printed three times.
 *
 * The `device` filter those breakdowns are asked with is an Umami 3 feature.
 * Every 2.x builds that query's filter by hand out of the window, the event
 * name and the property name, never looks at `device`, and answers 200 with
 * the unfiltered rows — so the telephone column, the tablet column and the
 * total come back as one and the same number and get drawn as though they were
 * a breakdown. The note in src/lib/umamiServer.ts has the versions. That is
 * worse than having no split: this section exists because the owners wanted to
 * know whether the telephone is where bookings die, and a chart answering
 * "exactly as often as everywhere else" would send them looking in a place
 * where there is nothing to find.
 *
 * No single answer says which Umami it came from, so the tell has to be the
 * three answers together. A session is a telephone or a tablet and never both,
 * so a funnel where the phone-filtered breakdown and the tablet-filtered one
 * are each identical to the unfiltered one — and not empty — is not a fact
 * about this café's visitors; it is a filter that was thrown away. One
 * matching breakdown would prove nothing at all, since a quiet week where
 * every booking really did happen on a phone looks exactly like that.
 *
 * This needs the funnel to have something in it, which is also why the failure
 * table's telephone column hides behind this same flag rather than testing
 * itself: with only a mobile variant to compare against, "they were all on
 * phones" and "the filter was ignored" are the same two lists.
 */
function deviceSplitIsIgnored(
  total: null | UmamiPropertyValue[],
  phone: null | UmamiPropertyValue[],
  tablet: null | UmamiPropertyValue[],
): boolean {
  if (total === null || phone === null || tablet === null) return false;
  if (total.length === 0) return false;
  return sameCounts(total, phone) && sameCounts(total, tablet);
}

const NL_DAY = new Intl.DateTimeFormat("nl-NL", {
  timeZone: "UTC",
  weekday: "short",
  day: "numeric",
});

const NL_MONTH = new Intl.DateTimeFormat("nl-NL", {
  timeZone: "UTC",
  month: "short",
});

/**
 * A caption for one bar of the graph.
 *
 * Umami hands these back already converted into Amsterdam time, as text with
 * no offset on it. Turning that text into a Date and formatting it would put
 * the offset back on and slide a midnight bucket onto the day before, so the
 * date is split up as a string and only ever rebuilt at midday UTC — the same
 * trick the agenda and src/lib/schedule.ts use, and for the same reason: midday
 * is far enough from either edge that no daylight-saving jump can reach it.
 */
function bucketLabel(raw: string, unit: "hour" | "day" | "month"): string {
  const [datePart = "", timePart = ""] = raw.trim().replace("T", " ").split(" ");
  if (unit === "hour") return `${timePart.slice(0, 2)}u`;
  const at = new Date(`${datePart}T12:00:00.000Z`);
  if (Number.isNaN(at.getTime())) return raw;
  return unit === "month" ? NL_MONTH.format(at) : NL_DAY.format(at);
}

/* ------------------------------------------------------------------ parts -- */

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.tile}>
      <span className={styles.tileValue}>{value}</span>
      <span className={styles.tileLabel}>{label}</span>
    </div>
  );
}

/**
 * One property, drawn as a list with a bar behind each count.
 *
 * The three states it can be in are all real and all say something different.
 * `null` is Umami declining the request — an install without the event-data
 * endpoints, or an endpoint that has moved again — and is a thing for a
 * developer. An empty list is Umami answering that nothing of the kind has
 * happened, which is the ordinary state of a brand new measurement and reads
 * as good news half the time. And a list is a list.
 */
function Breakdown({
  hint,
  rows,
  title,
}: {
  hint?: string;
  rows: null | UmamiPropertyValue[];
  title: string;
}) {
  const top = Math.max(0, ...(rows ?? []).map((row) => row.count));
  return (
    <section className={styles.card}>
      <h3 className={styles.cardTitle}>{title}</h3>
      {hint ? <p className={styles.cardHint}>{hint}</p> : null}
      {rows === null ? (
        <p className={styles.missing}>
          Umami geeft deze uitsplitsing niet terug. Laat dit even nakijken.
        </p>
      ) : rows.length === 0 ? (
        <p className={styles.empty}>Hier is in deze periode niets van gemeten.</p>
      ) : (
        <table className={styles.table}>
          <tbody>
            {rows.map((row) => (
              <tr key={row.value}>
                <td className={LABELS[row.value] ? styles.label : styles.labelRaw}>
                  {LABELS[row.value] ?? row.value}
                </td>
                <td className={styles.meterCell}>
                  <div className={styles.meter}>
                    <div
                      className={styles.meterFillQuiet}
                      style={{ width: `${top > 0 ? (row.count / top) * 100 : 0}%` }}
                    />
                  </div>
                </td>
                <td className={styles.num}>{num(row.count)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------- page -- */

function Figures({
  deviceSplitBroken,
  stats,
}: {
  deviceSplitBroken: boolean;
  stats: Extract<UmamiResult, { configured: true }>;
}) {
  const b = stats.breakdowns;
  const unit = UNITS[stats.range];

  const steps = byValue(b.funnelSteps);
  const stepsPhone = byValue(b.funnelStepsPhone);
  const stepsTablet = byValue(b.funnelStepsTablet);
  const stopped = byValue(b.abandonedAtStep);

  /**
   * Anything the browser sent that this file has never heard of, kept and
   * shown at the bottom of the funnel rather than dropped. A stage added on
   * the other side of the system should look unfamiliar here, not invisible.
   */
  const extraSteps = [...steps.keys()]
    .filter((key) => !FUNNEL_STEPS.some((step) => step.key === key))
    .sort()
    .map((key) => ({ key, label: LABELS[key] ?? key, known: key in LABELS }));

  const rows = [...FUNNEL_STEPS, ...extraSteps];
  const opened = steps.get(FUNNEL_STEPS[0].key) ?? 0;
  const tallest = Math.max(0, ...rows.map((row) => steps.get(row.key) ?? 0));
  const funnelMeasured = b.funnelSteps !== null && b.funnelSteps.length > 0;

  const busiest = Math.max(
    0,
    ...stats.series.map((point) => Math.max(point.visitors, point.pageviews)),
  );
  const topPageMax = Math.max(0, ...stats.topPages.map((page) => page.count));

  const failures = b.failureReasons;
  const failuresPhone = byValue(b.failureReasonsPhone);
  const failureTotal = sum(failures);
  const failureTop = Math.max(0, ...(failures ?? []).map((row) => row.count));

  return (
    <>
      <div className={styles.tiles}>
        <Tile label="Bezoekers" value={num(stats.visitors)} />
        <Tile label="Bekeken pagina's" value={num(stats.pageviews)} />
        <Tile label="Bezoeken" value={num(stats.visits)} />
        <Tile label="Gemiddeld gebleven" value={duration(stats.avgSeconds)} />
        <Tile
          label="Meteen weer weg"
          value={stats.visits > 0 ? `${stats.bounceRate}%` : "—"}
        />
      </div>

      {stats.pageviews === 0 ? (
        <p className={styles.empty}>
          In deze periode is er nog niets gemeten. Dat kan kloppen — kies
          hierboven een langere periode — en anders staat het meten uit bij
          Instellingen → Statistieken.
        </p>
      ) : null}

      {stats.series.length > 0 ? (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Bezoek per {unit === "hour" ? "uur" : unit === "month" ? "maand" : "dag"}</h2>
          <p className={styles.sectionIntro}>
            Elke balk is het aantal bekeken pagina&apos;s.
          </p>
          <div className={styles.chart}>
            {stats.series.map((point) => (
              <div
                className={styles.chartColumn}
                key={point.date}
                title={`${bucketLabel(point.date, unit)}: ${num(point.pageviews)} pagina's, ${num(point.visitors)} bezoekers`}
              >
                <div
                  className={styles.chartBar}
                  style={{
                    height: `${busiest > 0 ? Math.max(1, (point.pageviews / busiest) * 100) : 1}%`,
                  }}
                />
              </div>
            ))}
          </div>
          {stats.series.length <= 14 ? (
            <div className={styles.chartLabels}>
              {stats.series.map((point) => (
                <span className={styles.chartLabel} key={point.date}>
                  {bucketLabel(point.date, unit)}
                </span>
              ))}
            </div>
          ) : (
            <p className={styles.chartRange}>
              {bucketLabel(stats.series[0].date, unit)} tot en met{" "}
              {bucketLabel(stats.series[stats.series.length - 1].date, unit)}
            </p>
          )}
        </section>
      ) : null}

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>De weg naar een reservering</h2>
        <p className={styles.sectionIntro}>
          Hoe vaak elke stap van het reserveerformulier gehaald is. Dit telt
          keren en geen mensen: wie het formulier sluit en opnieuw opent, telt
          opnieuw mee bij &quot;Formulier geopend&quot;. Elke regel is een stap
          verder, en wat er tussen twee regels wegvalt, is waar het is blijven
          steken — de laatste kolom telt dat.
        </p>
        {!funnelMeasured ? (
          b.funnelSteps === null ? (
            <p className={styles.missing}>
              Umami geeft de stappen van het formulier niet terug. De cijfers
              worden wel bijgehouden; ze zijn hier alleen niet op te halen.
              Laat dit even nakijken.
            </p>
          ) : (
            <p className={styles.empty}>
              Er is in deze periode nog niemand aan het formulier begonnen.
            </p>
          )
        ) : (
          <>
            {deviceSplitBroken ? (
              <p className={styles.missing}>
                Deze Umami splitst de stappen niet uit per apparaat: op de vraag
                &quot;alleen telefoons&quot; geeft hij gewoon alles terug. De
                kolommen Telefoon, Tablet en Computer blijven daarom weg, want
                ze zouden drie keer hetzelfde getal laten zien. De rest van deze
                tabel klopt wel. Laat dit even nakijken.
              </p>
            ) : null}
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Stap</th>
                  <th scope="col" />
                  <th className={styles.num} scope="col">Keer</th>
                  <th className={styles.num} scope="col">Waarvan</th>
                  {deviceSplitBroken ? null : (
                    <>
                      <th className={styles.num} scope="col">Telefoon</th>
                      <th className={styles.num} scope="col">Tablet</th>
                      <th className={styles.num} scope="col">Computer</th>
                    </>
                  )}
                  <th className={styles.num} scope="col">Hier gestopt</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => {
                  const count = steps.get(row.key) ?? 0;
                  const phone = stepsPhone.get(row.key) ?? 0;
                  const tablet = stepsTablet.get(row.key) ?? 0;
                  // Everything Umami did not call a telephone or a tablet. Taking
                  // the remainder rather than asking for "desktop" is deliberate;
                  // the note in umamiServer.ts explains what Umami means by that
                  // word and why asking for it would under-report.
                  const desktop = Math.max(0, count - phone - tablet);
                  const pct = share(count, opened);
                  return (
                    <tr key={row.key}>
                      <td
                        className={
                          "known" in row && !row.known ? styles.labelRaw : styles.label
                        }
                      >
                        <span className={styles.stepIndex}>{index + 1}</span>
                        {row.label}
                      </td>
                      <td className={styles.meterCell}>
                        <div className={styles.meter}>
                          <div
                            className={styles.meterFill}
                            style={{
                              width: `${tallest > 0 ? (count / tallest) * 100 : 0}%`,
                            }}
                          />
                        </div>
                      </td>
                      <td className={styles.num}>{num(count)}</td>
                      <td className={styles.numQuiet}>
                        {pct === null ? "—" : `${pct}%`}
                      </td>
                      {deviceSplitBroken ? null : (
                        <>
                          <td className={styles.numQuiet}>{num(phone)}</td>
                          <td className={styles.numQuiet}>{num(tablet)}</td>
                          <td className={styles.numQuiet}>{num(desktop)}</td>
                        </>
                      )}
                      <td className={styles.numLost}>
                        {stopped.get(row.key) ? num(stopped.get(row.key) ?? 0) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </>
        )}
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Waarom reserveringen niet doorgingen</h2>
        <p className={styles.sectionIntro}>
          Dit zijn de keren dat iemand op Reserveren drukte en het niet lukte.{" "}
          {deviceSplitBroken ? null : (
            <>De kolom Telefoon zegt hoeveel daarvan op een telefoon gebeurden.{" "}</>
          )}
          De twee kaartjes eronder gaan over dezelfde mislukkingen, van een
          andere kant bekeken: hoe groot het gezelschap was en hoe ver vooruit
          ze wilden reserveren.
        </p>
        {failures === null ? (
          <p className={styles.missing}>
            Umami geeft de redenen niet terug. Laat dit even nakijken.
          </p>
        ) : failures.length === 0 ? (
          <p className={styles.empty}>
            Er is in deze periode geen enkele reservering misgegaan.
          </p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Reden</th>
                <th scope="col" />
                <th className={styles.num} scope="col">Keer</th>
                <th className={styles.num} scope="col">Aandeel</th>
                {deviceSplitBroken ? null : (
                  <th className={styles.num} scope="col">Op telefoon</th>
                )}
              </tr>
            </thead>
            <tbody>
              {failures.map((row) => {
                const pct = share(row.count, failureTotal);
                return (
                  <tr key={row.value}>
                    <td className={LABELS[row.value] ? styles.label : styles.labelRaw}>
                      {LABELS[row.value] ?? row.value}
                    </td>
                    <td className={styles.meterCell}>
                      <div className={styles.meter}>
                        <div
                          className={styles.meterFill}
                          style={{
                            width: `${failureTop > 0 ? (row.count / failureTop) * 100 : 0}%`,
                          }}
                        />
                      </div>
                    </td>
                    <td className={styles.num}>{num(row.count)}</td>
                    <td className={styles.numQuiet}>
                      {pct === null ? "—" : `${pct}%`}
                    </td>
                    {deviceSplitBroken ? null : (
                      <td className={styles.numQuiet}>
                        {num(failuresPhone.get(row.value) ?? 0)}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      <section className={styles.section}>
        <div className={styles.cards}>
          <Breakdown
            hint="Van de reserveringen die niet doorgingen."
            rows={b.failurePartySize}
            title="Hoe groot het gezelschap was"
          />
          <Breakdown
            hint="Van de reserveringen die niet doorgingen."
            rows={b.failureLeadTime}
            title="Hoe ver vooruit ze wilden"
          />
          <Breakdown
            hint="De knop deed niets omdat dit veld nog leeg of fout was. Gebeurt dit vaak bij één veld, dan is dat veld onduidelijk."
            rows={b.blockedFields}
            title="Waar het formulier op vastliep"
          />
          <Breakdown
            hint="Wat we antwoordden toen iemand een datum koos. Een volle dag is goed nieuws; een fout is dat niet."
            rows={b.availabilityOutcome}
            title="Toen ze een datum kozen"
          />
          <Breakdown
            hint="Waar op de site ze op Reserveren drukten."
            rows={b.reserveButtonSource}
            title="Via welke knop"
          />
          <Breakdown
            hint="Hoe mensen het formulier verlieten zonder te reserveren."
            rows={b.abandonedHow}
            title="Hoe ze weggingen"
          />
        </div>
      </section>

      {stats.topPages.length > 0 ? (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Meest bekeken pagina&apos;s</h2>
          <p className={styles.sectionIntro}>
            Engelse pagina&apos;s beginnen met <code>/en</code>; de Nederlandse
            staan zonder voorvoegsel.
          </p>
          <table className={styles.table}>
            <tbody>
              {stats.topPages.map((page) => (
                <tr key={page.url}>
                  <td className={styles.labelRaw}>{page.url}</td>
                  <td className={styles.meterCell}>
                    <div className={styles.meter}>
                      <div
                        className={styles.meterFillQuiet}
                        style={{
                          width: `${topPageMax > 0 ? (page.count / topPageMax) * 100 : 0}%`,
                        }}
                      />
                    </div>
                  </td>
                  <td className={styles.num}>{num(page.count)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      {stats.events.length > 0 ? (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Alles wat geteld is</h2>
          <p className={styles.sectionIntro}>
            De ruwe tellingen, voor de volledigheid. Alles hierboven komt
            hiervandaan.
          </p>
          <table className={styles.table}>
            <tbody>
              {stats.events.map((event) => (
                <tr key={event.name}>
                  <td className={styles.labelRaw}>{event.name}</td>
                  <td className={styles.num}>{num(event.count)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}
    </>
  );
}

export async function StatsView({
  initPageResult,
  params,
  searchParams,
}: AdminViewProps) {
  const { permissions, req, visibleEntities } = initPageResult;
  const adminRoute = req.payload.config.routes.admin || "/admin";
  const statsRoute = `${adminRoute}/statistieken`;

  if (!req.user || !permissions?.canAccessAdmin) {
    const loginRoute = req.payload.config.admin.routes.login || "/login";
    redirect(
      `${adminRoute}${loginRoute}?redirect=${encodeURIComponent(statsRoute)}`,
    );
  }

  const periodParam = searchParams?.periode;
  const range: UmamiRange = isRange(periodParam) ? periodParam : "7d";
  const stats = await getUmamiStats(range, "all");
  // Worked out once, up here, because the funnel table, the refusals table and
  // the legend all have to tell the same story about the device columns.
  const deviceSplitBroken =
    stats.configured
    && deviceSplitIsIgnored(
      stats.breakdowns.funnelSteps,
      stats.breakdowns.funnelStepsPhone,
      stats.breakdowns.funnelStepsTablet,
    );

  return (
    <DefaultTemplate
      className="stats-view"
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
      <SetStepNav nav={[{ label: "Statistieken" }]} />
      <Gutter className={styles.stats}>
        <header className={styles.toolbar}>
          <h1 className={styles.title}>{PERIOD_TITLES[range]}</h1>
          <nav aria-label="Andere periode" className={styles.periods}>
            {PERIODS.map((period) => (
              <a
                aria-current={period.range === range ? "page" : undefined}
                className={[
                  styles.period,
                  period.range === range ? styles.periodActive : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                href={`${statsRoute}?periode=${period.range}`}
                key={period.range}
              >
                {period.label}
              </a>
            ))}
          </nav>
        </header>

        {stats.configured ? (
          <Figures deviceSplitBroken={deviceSplitBroken} stats={stats} />
        ) : (
          <div className={styles.notice}>
            {/*
              Word for word as src/lib/umamiServer.ts wrote it, and never
              wrapped in anything that interprets it. That module keeps these
              sentences apart on purpose — an expired key, an unknown website
              id, an account that may not read this site — because each one is
              a different thing to go and do, and until this page existed not
              one of them had ever been read by anybody.
            */}
            <p className={styles.noticeReason}>{stats.reason}</p>
            <p className={styles.noticeHelp}>
              De cijfers komen uit Umami, een los programma dat de bezoeken
              telt. Wat daarvoor ingevuld moet zijn, staat bij{" "}
              <a href={`${adminRoute}/globals/site-settings`}>
                Instellingen → Statistieken
              </a>
              :
            </p>
            <ul className={styles.noticeList}>
              <li>
                <strong>Bezoekcijfers bijhouden</strong> moet aan staan.
              </li>
              <li>
                <strong>Website-ID</strong> is het lange nummer met streepjes
                dat Umami bij de website toont.
              </li>
              <li>
                <strong>Adres van Umami</strong> is waar Umami draait, zonder
                dat kunnen de cijfers hier niet opgehaald worden.
              </li>
              <li>
                De <strong>inloggegevens</strong> staan op de server en niet in
                dit scherm. Klopt hierboven iets over inloggen of over een
                sleutel, dan is dat iets om na te laten kijken.
              </li>
            </ul>
          </div>
        )}

        <div className={styles.legend}>
          <p>
            Deze cijfers gaan over het gedrag op de site, nooit over een
            persoon. Er worden geen namen, e-mailadressen, telefoonnummers of
            opmerkingen geteld, en ook niet voor hoeveel personen of voor welke
            avond een reservering was — alleen een grove groep, zoals &quot;3
            tot 4 personen&quot;.
          </p>
          <p>
            De weg naar een reservering telt keren en geen mensen. Wie het
            formulier dichtdoet en later weer opent, telt daar opnieuw mee — één
            iemand die twee keer komt kijken, staat er dus als twee.
          </p>
          {deviceSplitBroken ? (
            <p>
              Deze Umami kan niet per apparaat uitsplitsen. De kolommen
              Telefoon, Tablet en Computer staan er daarom niet bij; alle andere
              cijfers op deze pagina kloppen gewoon.
            </p>
          ) : (
            <p>
              Telefoon en tablet zijn wat Umami aan het apparaat herkent;
              &quot;computer&quot; is al het overige. Iemand die begint op de
              telefoon en eindigt op de laptop telt dus in beide kolommen mee.
            </p>
          )}
          <p>
            De cijfers worden een minuut lang bewaard, dus vlak na elkaar
            herladen laat hetzelfde zien. Wat hier staat, is ook rechtstreeks in
            Umami zelf te bekijken.
          </p>
        </div>
      </Gutter>
    </DefaultTemplate>
  );
}

/**
 * The way in, at the bottom of the navigation.
 *
 * A plain link rather than something clever: this renders on the server beside
 * Payload's own nav links and borrows their classes, so it inherits their
 * spacing, their hover and their dark mode without a line of CSS.
 *
 * `afterNavLinks`, under the collections, for the same reason Backups is
 * there. The agenda is opened every morning; this is opened when somebody is
 * wondering about something, which is a different kind of visit.
 */
export function StatsNavLink({ payload }: Partial<ServerProps>) {
  const adminRoute = payload?.config?.routes?.admin || "/admin";
  return (
    <a className="nav__link" href={`${adminRoute}/statistieken`} id="nav-statistieken">
      <span className="nav__link-label">Statistieken</span>
    </a>
  );
}
