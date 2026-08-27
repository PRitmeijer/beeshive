import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The one rule in this flow that a refactor could undo without anybody
 * noticing: no identity field before availability has been proved.
 *
 * Every booking system in the research draws that boundary, without exception,
 * and here it is drawn twice. On /reserveren it is a route, which the router
 * enforces. Inside the phone sheet — the surface carrying most of this café's
 * traffic — it is progressive disclosure, which nothing enforces at all: the
 * details screen is a component, and a well-meaning tidy-up that lifted it into
 * the accordion "so the state is in one place" would put a name field back on
 * the first screen and pass tsc, eslint and every other test in this suite.
 *
 * So the guard is structural rather than behavioural, and it is a guard on the
 * import graph: the availability screen and everything it reaches must not
 * contain a field that asks who anybody is. Read as text because there is no
 * DOM in this suite and adding one to assert the absence of an element would be
 * a browser, a renderer and a testing library for a single assertion.
 *
 * If this fails, the fix is never to relax the assertion. It is to put the
 * field back where it belongs.
 */

const ROOT = "src/components/booking";

/** The availability screen, and every one of our own modules it reaches. */
const SCREEN_ONE = [
  `${ROOT}/WhenAccordion.tsx`,
  `${ROOT}/PartyBand.tsx`,
  `${ROOT}/DateBand.tsx`,
  `${ROOT}/TimeBand.tsx`,
  `${ROOT}/MonthGrid.tsx`,
  `${ROOT}/DayChip.tsx`,
  `${ROOT}/BandSummary.tsx`,
];

const read = (path: string) => readFileSync(path, "utf8");

/** What a field asking who somebody is looks like, in six spellings. */
const IDENTITY = [
  /type="email"/,
  /type="tel"/,
  /autoComplete="name"/,
  /autoComplete="email"/,
  /autoComplete="tel"/,
  /<textarea/,
];

describe("the availability screen", () => {
  it.each(SCREEN_ONE)("%s asks nobody who they are", (path) => {
    const source = read(path);
    for (const shape of IDENTITY) {
      expect(shape.test(source), `${path} matches ${String(shape)}`).toBe(false);
    }
  });

  it.each(SCREEN_ONE)("%s does not reach the details screen", (path) => {
    const source = read(path);
    expect(source).not.toMatch(/from "@\/components\/booking\/GuestDetails"/);
    expect(source).not.toMatch(/from "@\/lib\/rememberMe"/);
  });

  it("keeps the accordion out of the details screen's business entirely", () => {
    // The flow above them is the only thing that knows about both, and it is
    // the only place the boundary is crossed — one `router.push` on the page
    // surface, one `pushState` in the sheet.
    const accordion = read(`${ROOT}/WhenAccordion.tsx`);
    expect(accordion).not.toMatch(/api\/reserve/);
  });
});

describe("the availability screen's own bundle", () => {
  it("takes only pure modules and types across the client boundary", () => {
    // The other half of why the flow logic lives in src/lib/bookingFlow.ts. A
    // client component that takes a VALUE from a module which reads the CMS
    // drags the Payload config and nodemailer into the browser bundle, and the
    // production build dies on "Can't resolve fs" — while tsc and this whole
    // suite go on passing, which is exactly how it got shipped last time.
    const flow = read("src/lib/bookingFlow.ts");
    const imports = [...flow.matchAll(/from "([^"]+)"/g)].map((m) => m[1]);
    expect(imports).toEqual(["@/lib/openingHours"]);
  });

  it("keeps the privacy taxonomy importing nothing whatsoever", () => {
    const telemetry = read("src/lib/bookingTelemetry.ts");
    expect(telemetry).not.toMatch(/^import /m);
  });
});
