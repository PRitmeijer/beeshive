/**
 * @vitest-environment jsdom
 */

import { createElement, act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useFunnel, type Funnel } from "@/components/booking/useFunnel";
import { EVENTS, STEPS } from "@/lib/umami";

/**
 * The two ends of the funnel that cannot be checked by reading the code.
 *
 * Everything else about `useFunnel` is arithmetic on strings and is covered by
 * tests/lib/bookingFlow.steps.test.ts. These two are about *when* the hook
 * speaks, and both of them were wrong in the same silent way: nothing threw,
 * nothing failed a build, no sentence on the site changed, and the chart in the
 * admin went on looking exactly as plausible as it always had while the number
 * underneath it was meaningless.
 *
 * The first is the top rung. `1_opened` was in the vocabulary, it was the
 * default `from`, the abandonment beacon carried it, and the panel drew a row
 * headed "Reserveren geopend" — and no call site ever sent it. Every conversion
 * rate the redesign exists to move was therefore a division by nought. A test
 * that reads the source for a call would pass the day somebody moved the call
 * behind a condition that never holds, so this one mounts the hook and watches
 * the wire.
 *
 * The second is the step backwards. An unmount is not a departure: "Wijzigen"
 * on the details screen is a real link back to /reserveren, and following it
 * reported an abandonment about somebody who was mid-booking and about to
 * finish. That one guest was counted both as a loss and as a conversion.
 *
 * This is the only test in the suite that renders React, which is why it opens
 * with a jsdom docblock rather than the whole suite being moved into a browser
 * environment it has no use for. A hook is the smallest thing that can be
 * mounted, and mounting it is the only way to observe a mount effect.
 */

/** Every event `track()` managed to put on the wire, in order. */
let sent: { event: string; data: Record<string, unknown> }[] = [];

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  sent = [];
  // The real Umami script hangs exactly this off the window and nothing else;
  // src/lib/umami.ts holds events back until it appears, so a stub that is
  // already there is also what keeps this test free of the ten-second queue.
  (window as unknown as { umami: unknown }).umami = {
    track: (event: string, data: Record<string, unknown>) => {
      sent.push({ event, data });
    },
  };
  // React 19 refuses to run `act` outside an environment that has declared
  // itself one, and says so on stderr rather than failing, which is how a suite
  // ends up green and asserting nothing.
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
    .IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  delete (window as unknown as { umami?: unknown }).umami;
});

/** The rung of every `reservation_step` sent so far, in order. */
const steps = () =>
  sent
    .filter((one) => one.event === EVENTS.reservationStep)
    .map((one) => one.data.step);

const abandonments = () =>
  sent.filter((one) => one.event === EVENTS.reservationAbandoned);

/**
 * Mount the hook on its own and hand the funnel back, so a test can drive it
 * the way the accordion and the details screen do.
 */
function mount(options: Parameters<typeof useFunnel>[0]): { funnel: Funnel } {
  const handle: { funnel: Funnel } = { funnel: null as unknown as Funnel };
  function Probe({ children }: { children?: ReactNode }) {
    handle.funnel = useFunnel(options);
    return createElement("div", null, children);
  }
  act(() => {
    root.render(
      createElement(
        Probe,
        null,
        // A link back into the flow, exactly as the details screen's
        // "Wijzigen" is, so the click a test dispatches is a click on the real
        // shape of thing rather than on a synthetic event. The bubble-phase
        // `preventDefault` is what a Next <Link> does too — it takes the
        // navigation over from the browser — and it is the reason the hook's
        // own listener has to be a capture one to see the click at all.
        createElement(
          "a",
          {
            href: "/reserveren?n=2",
            id: "back",
            onClick: (event: { preventDefault: () => void }) =>
              event.preventDefault(),
          },
          "Wijzigen",
        ),
        createElement(
          "a",
          {
            href: "/kaart",
            id: "away",
            onClick: (event: { preventDefault: () => void }) =>
              event.preventDefault(),
          },
          "Kaart",
        ),
      ),
    );
  });
  return handle;
}

describe("the top rung of the funnel", () => {
  it("reports 1_opened as soon as the flow is in front of somebody", () => {
    mount({ surface: "page", entry: "direct" });
    expect(steps()).toEqual([STEPS.opened]);
  });

  it("says which surface and which button it opened on", () => {
    mount({ surface: "sheet", entry: "mobile_fab" });
    const [first] = sent;
    expect(first.data).toMatchObject({
      step: STEPS.opened,
      surface: "sheet",
      entry: "mobile_fab",
    });
  });

  it("opens once per journey, not once per stage the guest reaches", () => {
    const { funnel } = mount({ surface: "sheet", entry: "nav_sheet" });
    act(() => {
      funnel.step(STEPS.datePicked, { via: "chip" });
      funnel.step(STEPS.timePicked);
      // The details screen reports itself on mount, and on the phone it is a
      // child of the still-mounted accordion; backing out and going forward
      // again must not re-open the journey.
      funnel.step(STEPS.detailsShown);
      funnel.step(STEPS.detailsShown);
    });
    expect(steps()).toEqual([
      STEPS.opened,
      STEPS.datePicked,
      STEPS.timePicked,
      STEPS.detailsShown,
    ]);
  });

  it("opens the journey again when somebody books a second table", () => {
    const { funnel } = mount({ surface: "sheet", entry: "mobile_fab" });
    act(() => {
      funnel.step(STEPS.datePicked);
      funnel.finish();
      funnel.reset();
    });
    expect(steps()).toEqual([STEPS.opened, STEPS.datePicked, STEPS.opened]);
  });

  it("starts the details route where the accordion left off, not at the top", () => {
    // Otherwise the rung would be counted twice for one guest: once by the
    // accordion that really did open the flow, once by the route it handed to.
    mount({ surface: "page", entry: "direct", from: STEPS.detailsShown });
    expect(steps()).toEqual([STEPS.detailsShown]);
  });
});

describe("leaving, and moving about inside", () => {
  it("reports an abandonment with the furthest rung reached", () => {
    const { funnel } = mount({ surface: "sheet", entry: "mobile_fab" });
    act(() => funnel.step(STEPS.timePicked));
    act(() => root.render(null));
    expect(abandonments()).toHaveLength(1);
    expect(abandonments()[0].data).toMatchObject({
      last_step: STEPS.timePicked,
      exit: "sheet_closed",
    });
  });

  it("TRAP: a step back to /reserveren is not somebody leaving", () => {
    // "Wijzigen" on the details screen. It is a real link and following it
    // unmounts the funnel, which is indistinguishable from a departure unless
    // somebody asks where the click was going. The guest who presses it is
    // mid-booking; counting them as a loss and then, minutes later, as a
    // conversion makes the funnel read worst exactly where it should read best.
    const { funnel } = mount({
      surface: "page",
      entry: "direct",
      from: STEPS.detailsShown,
    });
    act(() => funnel.step(STEPS.detailsShown));
    act(() => {
      container.querySelector<HTMLAnchorElement>("#back")!.dispatchEvent(
        new window.MouseEvent("click", { bubbles: true, cancelable: true }),
      );
    });
    act(() => root.render(null));
    expect(abandonments()).toEqual([]);
  });

  it("still reports somebody who clicks through to another page", () => {
    const { funnel } = mount({ surface: "page", entry: "direct" });
    act(() => funnel.step(STEPS.datePicked));
    act(() => {
      container.querySelector<HTMLAnchorElement>("#away")!.dispatchEvent(
        new window.MouseEvent("click", { bubbles: true, cancelable: true }),
      );
    });
    act(() => root.render(null));
    expect(abandonments()).toHaveLength(1);
    expect(abandonments()[0].data).toMatchObject({
      last_step: STEPS.datePicked,
      exit: "navigated_away",
    });
  });

  it("still reports a ⌘-click on the back link, which opens a tab and leaves this one", () => {
    // The page the guest is looking at does not change, so if the flow is torn
    // down after one of these it is for some other reason and they really have
    // gone.
    const { funnel } = mount({
      surface: "page",
      entry: "direct",
      from: STEPS.detailsShown,
    });
    act(() => funnel.step(STEPS.detailsShown));
    act(() => {
      container.querySelector<HTMLAnchorElement>("#back")!.dispatchEvent(
        new window.MouseEvent("click", {
          bubbles: true,
          cancelable: true,
          metaKey: true,
        }),
      );
    });
    act(() => root.render(null));
    expect(abandonments()).toHaveLength(1);
  });

  it("never reports a booking that was accepted", () => {
    const { funnel } = mount({ surface: "sheet", entry: "mobile_fab" });
    act(() => {
      funnel.step(STEPS.confirmed);
      funnel.finish();
    });
    act(() => root.render(null));
    expect(abandonments()).toEqual([]);
  });

  it("never reports the hand-off from the accordion to the details route", () => {
    const { funnel } = mount({ surface: "page", entry: "direct" });
    act(() => {
      funnel.step(STEPS.timePicked);
      funnel.handOff();
    });
    act(() => root.render(null));
    expect(abandonments()).toEqual([]);
  });
});
