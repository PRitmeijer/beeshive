import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { RENAMED_STEPS, STEPS, type ReservationStep } from "@/lib/umami";

/**
 * The funnel's vocabulary, and the two things about it that are load-bearing.
 *
 * The first is the numeric prefix. It is not decoration: `useFunnel` decides
 * how far a guest got with a plain string comparison — `if (name >
 * lastStep.current)` — and the panel in the admin relies on Umami returning a
 * property's values in alphabetical order and getting funnel order for free.
 * Both of those are silent if a prefix is ever wrong. Nothing crashes; the
 * abandonment figures simply start reporting the wrong rung, and the chart in
 * front of the owners goes on looking exactly as plausible as before.
 *
 * The second is the rename itself. These six are not the six the old form sent
 * — the party size arrives already answered, so the second thing that happens
 * is a date being chosen, and there is now a screen between the time and the
 * button. `RENAMED_STEPS` is the key between the old series and the new one,
 * and it has to stay complete: docs/analytics.md is written from it and the
 * Dutch labels in the admin panel are keyed on the values below.
 */

const ORDER: ReservationStep[] = [
  STEPS.opened,
  STEPS.datePicked,
  STEPS.timePicked,
  STEPS.detailsShown,
  STEPS.submitAttempted,
  STEPS.confirmed,
];

describe("the step vocabulary", () => {
  it("is six rungs and no more", () => {
    expect(Object.values(STEPS)).toHaveLength(6);
    expect(new Set(Object.values(STEPS)).size).toBe(6);
  });

  it("numbers them 1 to 6, in the order somebody walks them", () => {
    expect(ORDER.map((step) => step.slice(0, 2))).toEqual([
      "1_",
      "2_",
      "3_",
      "4_",
      "5_",
      "6_",
    ]);
  });

  it("sorts into funnel order as plain strings, which is what the code leans on", () => {
    expect([...ORDER].sort()).toEqual(ORDER);
  });

  it("puts the screen boundary between the time and the button", () => {
    // The one rung the old funnel could not have had. A pile-up here is the
    // single most actionable thing the owners can be shown: it means the
    // details screen is where people are quitting, which is the one place a
    // field-level change would be worth making.
    expect(STEPS.detailsShown).toBe("4_details_shown");
    expect(STEPS.timePicked < STEPS.detailsShown).toBe(true);
    expect(STEPS.detailsShown < STEPS.submitAttempted).toBe(true);
  });
});

describe("the remap from the old funnel", () => {
  it("accounts for every rung the old form sent", () => {
    expect(Object.keys(RENAMED_STEPS).sort()).toEqual([
      "1_opened",
      "2_field_touched",
      "3_date_picked",
      "4_time_picked",
      "5_submit_attempted",
      "6_confirmed",
    ]);
  });

  it("carries the four rungs that still mean the same thing", () => {
    expect(RENAMED_STEPS["1_opened"]).toBe(STEPS.opened);
    expect(RENAMED_STEPS["3_date_picked"]).toBe(STEPS.datePicked);
    expect(RENAMED_STEPS["4_time_picked"]).toBe(STEPS.timePicked);
    expect(RENAMED_STEPS["5_submit_attempted"]).toBe(STEPS.submitAttempted);
    expect(RENAMED_STEPS["6_confirmed"]).toBe(STEPS.confirmed);
  });

  it("refuses to pretend 2_field_touched became anything", () => {
    // The stage it measured — a keystroke before anything had been chosen — no
    // longer exists anywhere in the flow, because there is no field on screen
    // until an evening has been settled. Pointing it at the new second rung
    // would be claiming a continuity that is not there, and somebody would
    // draw a line through the deploy date and believe it.
    expect(RENAMED_STEPS["2_field_touched"]).toBeNull();
  });

  it("points every old rung at a rung that still exists", () => {
    const live = new Set<string>(Object.values(STEPS));
    for (const [was, is] of Object.entries(RENAMED_STEPS)) {
      if (is === null) continue;
      expect(live.has(is), `${was} points at a stage nobody sends`).toBe(true);
    }
  });
});

describe("the two places the vocabulary is read back", () => {
  /**
   * A step renamed in one file and not the other is a step that silently drops
   * out of the owners' chart: the panel prints an unfamiliar value verbatim
   * rather than crashing, and the funnel list is keyed on these strings. Both
   * files are read as text rather than imported, because one of them is a
   * Payload admin component that pulls in the whole CMS.
   */
  const source = (path: string) => readFileSync(path, "utf8");

  it("has every step in the admin panel's funnel list and label table", () => {
    const view = source("src/components/admin/StatsView.tsx");
    for (const step of ORDER) {
      // Twice: once in FUNNEL_STEPS, which is the chart, and once in LABELS,
      // which is what the abandonment list reads.
      expect(
        view.split(`"${step}"`).length - 1,
        `${step} is missing from StatsView`,
      ).toBeGreaterThanOrEqual(2);
    }
  });

  it("has every step written down in docs/analytics.md", () => {
    const docs = source("docs/analytics.md");
    for (const step of ORDER) {
      expect(docs.includes(step), `${step} is undocumented`).toBe(true);
    }
  });
});
