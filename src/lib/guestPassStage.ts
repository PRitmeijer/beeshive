import type { GuestPassView } from "@/lib/guestPass";

/**
 * Which of its three faces the guest page is wearing.
 *
 * This lives in a module of its own, and the reason is the boundary rather than
 * tidiness. It began life in @/lib/guestPass beside the rest of the guest-pass
 * logic, which is where it reads most naturally — and that module calls
 * `getPayload()`, so it imports the Payload config, which imports nodemailer,
 * which imports `fs` and `net`. None of that matters while a client component
 * only takes a *type* from it, because a type import is erased before anything
 * is bundled. The moment one takes a function, the whole chain comes with it
 * and the build stops with "Module not found: Can't resolve 'fs'".
 *
 * `npx tsc --noEmit` is perfectly happy with that import, and so is `npm test`;
 * only a real production build says a word. So the rule is worth stating rather
 * than rediscovering: anything the guest page's client component calls at
 * runtime has to come from a module that reaches no further than types. This
 * one imports a type and nothing else, exactly as @/lib/openingHours imports
 * nothing at all for the same reason.
 *
 * Why it is a function rather than a line inside the component. It is the one
 * decision on that page that must never be got wrong, and inside the JSX it was
 * a boolean no test could reach: changing `isPast && !cancelled` to plain
 * `isPast` broke nothing in a suite of nearly nine hundred tests, while quietly
 * thanking every cancelled party whose date had gone by for a visit they had
 * rung up to call off.
 *
 * The order is the whole content. Cancelled beats past, always: a table that
 * was called off and whose evening has since been and gone is cancelled, not
 * attended, and the two produce opposite sentences.
 */
export type GuestPassStage = "upcoming" | "cancelled" | "thanking";

export function passStage(
  view: GuestPassView,
  isPast: boolean,
): GuestPassStage {
  if (view.status === "geannuleerd") return "cancelled";
  return isPast ? "thanking" : "upcoming";
}
