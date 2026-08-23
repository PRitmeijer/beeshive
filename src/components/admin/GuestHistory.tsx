import React from "react";
import type { Payload, UIFieldServerProps } from "payload";
import { historyFor, type GuestVisitHistory, type HistorySubject } from "@/lib/guestHistory";

/**
 * "Eerste bezoek" or "Welkom terug", in the sidebar of a reservation.
 *
 * This is the one line the owners read before they walk to the door. Its whole
 * job is to be true at a glance: colour and shape carry the answer, the words
 * underneath carry the detail, and nowhere does it round a doubt off into a
 * confident sentence.
 *
 * It is a **server** component, which is the important decision in this file.
 * Payload 3.10 renders `admin.components.Field` on the server while it builds
 * the form state of a document, and hands a server component the document
 * itself along with a live `Payload` instance (see `ServerComponentProps` in
 * node_modules/payload/dist/admin/forms/Field.d.ts, and the `'Field' in
 * fieldConfig.admin.components` branch of
 * node_modules/@payloadcms/ui/dist/forms/fieldSchemasToFormState/renderField.js
 * which passes them through `RenderServerComponent`). So the lookup can simply
 * be awaited here. A client component would have needed an HTTP endpoint that
 * answers "has this e-mail address eaten here before" to anyone who can reach
 * it, guarded by a check somebody has to remember to write; the endpoint that
 * does not exist cannot be left unguarded. src/lib/guestHistory.ts says the
 * same thing at more length and names this file as one of its two doors.
 *
 * The cost of the shape is that the query runs again every time Payload
 * rebuilds the form state — which is on save and, debounced, while somebody
 * types. That is one small indexed-ish read against a table of a few thousand
 * rows on a page that is already doing more work than that, and the
 * alternative is caching a claim about a person that goes stale in the middle
 * of the evening.
 *
 * Everything is styled with Payload's own custom properties and nothing else,
 * for the reason src/components/admin/agenda.module.scss opens with: the
 * site's Tailwind is not loaded in the admin, so a utility class here renders
 * as nothing — and renders as nothing only in production, where the class is
 * purged. Inline styles rather than a module of its own, following
 * BackupPanel.tsx, because this is thirty lines of box and does not warrant a
 * second file.
 *
 * Registered from the field itself:
 *
 *     {
 *       name: "guestHistory",
 *       type: "ui",
 *       admin: {
 *         position: "sidebar",
 *         components: { Field: "@/components/admin/GuestHistory#GuestHistory" },
 *       },
 *     }
 */

type GuestHistoryProps = Pick<UIFieldServerProps, "data" | "id" | "payload">;

/** The four things this can be looking at, which are four different statements. */
type Verdict =
  | { kind: "first" }
  | { kind: "returning"; history: GuestVisitHistory }
  | { kind: "nothingToMatch" }
  | { kind: "unavailable" };

export const GuestHistory = async ({ data, id, payload }: GuestHistoryProps) => {
  /**
   * A document that has not been saved yet has no history to have, and no id
   * to exclude itself by. Rendering "eerste bezoek" here would be a guess
   * dressed as a fact — the owners are usually halfway through typing the
   * e-mail address at that point — so the sidebar simply stays quiet until
   * there is something to answer about.
   */
  if (id === undefined || id === null || id === "") return null;

  const verdict = await decide(
    {
      id,
      email: typeof data?.email === "string" ? data.email : null,
      phone: typeof data?.phone === "string" ? data.phone : null,
      date: typeof data?.date === "string" ? data.date : null,
    },
    payload,
  );

  if (verdict.kind === "nothingToMatch") {
    return (
      <Panel accent="var(--theme-elevation-400)" tint="var(--theme-elevation-50)">
        <Heading dot="var(--theme-elevation-400)">Niets om op te zoeken</Heading>
        <Line>
          Bij deze aanvraag staat geen e-mailadres en geen telefoonnummer, dus we
          kunnen niet nagaan of deze gast hier eerder is geweest. Dat is iets
          anders dan een eerste bezoek.
        </Line>
      </Panel>
    );
  }

  if (verdict.kind === "unavailable") {
    return (
      <Panel accent="var(--theme-elevation-400)" tint="var(--theme-elevation-50)">
        <Heading dot="var(--theme-elevation-400)">Even niet op te zoeken</Heading>
        <Line>
          De eerdere reserveringen konden nu niet gelezen worden. Ververs de
          pagina; blijft het staan, laat er dan naar kijken.
        </Line>
      </Panel>
    );
  }

  if (verdict.kind === "first") {
    return (
      <Panel accent="var(--theme-warning-400)" tint="var(--theme-warning-50)">
        <Heading dot="var(--theme-warning-400)">Eerste bezoek</Heading>
        <Line>Leg het concept even uit.</Line>
      </Panel>
    );
  }

  const { history } = verdict;

  return (
    <Panel accent="var(--theme-success-500)" tint="var(--theme-success-50)">
      <Heading dot="var(--theme-success-500)">Welkom terug</Heading>
      <Line>
        <strong>{history.priorVisits + 1}e bezoek.</strong>{" "}
        {history.lastVisit
          ? `De vorige keer was ${inDutch(history.lastVisit)}.`
          : null}
      </Line>
      {history.firstVisit && history.priorVisits > 1 ? (
        <Line muted>Komt hier sinds {inDutch(history.firstVisit)}.</Line>
      ) : null}
      {history.matchedOn === "phone" ? (
        /*
         * Said quietly, but said. A match on the number is the weaker of the
         * two — a household shares a telephone where it does not share an
         * inbox — so when this badge is wrong, this is almost always the line
         * that explains why, and the owners should be able to find it without
         * asking anybody.
         */
        <Line muted>Herkend aan het telefoonnummer, niet aan het e-mailadres.</Line>
      ) : null}
    </Panel>
  );
};

/**
 * Which of the four statements this booking is.
 *
 * Kept out of the component so the branch that says "we do not know" is a
 * value like any other, decided once, instead of a `try` wrapped around half a
 * render.
 */
async function decide(subject: HistorySubject, payload: Payload): Promise<Verdict> {
  /**
   * "We have nothing to compare on" and "we compared and found nothing" are
   * different sentences, and the second one is the one that gets a regular
   * greeted as a stranger. A row with neither an address nor a number — a
   * walk-in the owners typed in by hand, most likely — gets told the truth
   * about itself instead.
   */
  if (!subject.email?.trim() && !subject.phone?.trim()) {
    return { kind: "nothingToMatch" };
  }

  try {
    const history = await historyFor(subject, payload);
    return history.isFirstTime ? { kind: "first" } : { kind: "returning", history };
  } catch (error) {
    // guestHistory throws rather than answering "eerste bezoek" out of an
    // empty result set, precisely so this branch exists and can say that it
    // does not know.
    console.error("guest history lookup failed", error);
    return { kind: "unavailable" };
  }
}

/* ------------------------------------------------------------------ pieces */

/**
 * The box. A tinted background and a thick edge down one side, so which of the
 * three states this is can be read from across the room and without reading:
 * amber and demanding attention for a guest who needs the introduction, blue
 * and settled for one who does not, grey for the two cases where the honest
 * answer is that we do not know.
 */
const Panel: React.FC<{
  accent: string;
  children: React.ReactNode;
  tint: string;
}> = ({ accent, children, tint }) => (
  <div
    style={{
      background: tint,
      borderInlineStart: `3px solid ${accent}`,
      borderRadius: "var(--style-radius-s, 3px)",
      marginBottom: "var(--base, 1rem)",
      padding: "0.6rem 0.75rem",
    }}
  >
    {children}
  </div>
);

const Heading: React.FC<{ children: React.ReactNode; dot: string }> = ({
  children,
  dot,
}) => (
  <div
    style={{
      alignItems: "center",
      color: "var(--theme-elevation-800)",
      display: "flex",
      fontWeight: 600,
      gap: "0.45rem",
      lineHeight: 1.3,
    }}
  >
    <span
      aria-hidden="true"
      style={{
        background: dot,
        borderRadius: "50%",
        display: "inline-block",
        flex: "0 0 auto",
        height: "0.5rem",
        width: "0.5rem",
      }}
    />
    {children}
  </div>
);

const Line: React.FC<{ children: React.ReactNode; muted?: boolean }> = ({
  children,
  muted,
}) => (
  <p
    style={{
      color: muted ? "var(--theme-elevation-600)" : "var(--theme-elevation-700)",
      lineHeight: 1.45,
      margin: "0.25rem 0 0",
    }}
  >
    {children}
  </p>
);

/**
 * "3 juli 2027".
 *
 * Written out rather than left as 2027-07-03, because this is read aloud as
 * often as it is read: "u was hier in juli" is a sentence, a hyphenated date is
 * a lookup. The day comes out of the database as a plain YYYY-MM-DD, which
 * `Date` reads as midnight UTC — an hour or two behind Amsterdam, never enough
 * to fall into the previous day, but the time zone is named anyway so nobody
 * has to work that out again.
 */
function inDutch(day: string): string {
  const when = new Date(`${day}T12:00:00.000Z`);
  if (Number.isNaN(when.getTime())) return day;
  return new Intl.DateTimeFormat("nl-NL", {
    day: "numeric",
    month: "long",
    timeZone: "Europe/Amsterdam",
    year: "numeric",
  }).format(when);
}
