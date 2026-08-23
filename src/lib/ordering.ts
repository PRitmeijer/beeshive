import type { CollectionBeforeChangeHook } from "payload";

/**
 * "Volgorde" that fills itself in, and ties that never happen.
 *
 * The four ordered collections all had `defaultValue: 0`, which meant every
 * new dish, category or photograph arrived carrying the same number as the
 * last one somebody forgot to set. Two rows tied on the sort key is not a
 * cosmetic problem: the database is free to return tied rows in any order it
 * likes, and it does — so the item was in the list, in the right place, and
 * then in a different place on the next page load. It reads exactly like the
 * thing did not save.
 *
 * So nothing defaults to 0 any more. A new row with no number gets the end of
 * the list, which is where anybody adding something expects it to land, and
 * where they can see it to move it.
 *
 * STEPS OF TEN, on purpose. Slotting a dish between 30 and 40 is typing 35;
 * with steps of one it is renumbering every dish below it, which is how an
 * ordering scheme stops being used at all.
 */
const STEP = 10;

export function assignNextOrder(
  slug: "menu-items" | "menu-categories" | "gallery-images" | "gallery-categories",
): CollectionBeforeChangeHook {
  return async ({ data, operation, req }) => {
    // Only on the way in. An edit that clears the box is somebody deliberately
    // emptying it, and quietly putting a number back would be the field
    // arguing with the person typing in it.
    if (operation !== "create") return data;
    if (typeof data.order === "number") return data;

    try {
      const res = await req.payload.find({
        collection: slug,
        sort: "-order",
        limit: 1,
        depth: 0,
        // The hook runs as whoever is saving; reading one number to add to it
        // is not a decision their permissions should be able to break.
        overrideAccess: true,
      });
      const highest = (res.docs[0] as { order?: number | null } | undefined)
        ?.order;
      data.order = (typeof highest === "number" ? highest : 0) + STEP;
    } catch {
      // A first row, or a database having a bad moment. Ten is a fine start
      // and leaves room above it either way.
      data.order = STEP;
    }

    return data;
  };
}
