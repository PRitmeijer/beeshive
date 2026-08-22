/**
 * One-off data migration for the day localization was switched on.
 *
 * Turning `localized: true` on an existing field moves its column out of the
 * main table and into a `_locales` side table, which SQLite cannot do in
 * place: the push drops the column and everything in it. Payload notices and
 * asks for confirmation on stdin, which a dev server started without a
 * terminal can never answer.
 *
 * So the change is made deliberately instead. Take a dump of the values first:
 *
 *   sqlite3 database.db ... (see the companion dump, any JSON with the shape
 *   below will do)
 *
 * then run this with the dev server stopped:
 *
 *   npx tsx scripts/backfill-nl-locale.ts <dump.json>
 *
 * It applies the schema push without the prompt and writes every value back
 * into the Dutch locale. Running it twice is safe: the schema is already
 * correct the second time and the same Dutch values are simply rewritten.
 */
import { readFileSync } from "fs";
import { getPayload } from "payload";
import config from "@payload-config";

// Keep Payload from running its own interactive push during init; the push is
// applied by hand further down.
process.env.PAYLOAD_MIGRATING = "true";

type Row = Record<string, any>;

interface Dump {
  site_settings: Row[];
  opening_hours: Row[];
  features: Row[];
  values: Row[];
  menu_categories: Row[];
  menu_items: Row[];
  notifications: Row[];
  media: Row[];
}

const dumpPath = process.argv[2];
if (!dumpPath) {
  console.error("usage: npx tsx scripts/backfill-nl-locale.ts <dump.json>");
  process.exit(1);
}

const dump: Dump = JSON.parse(readFileSync(dumpPath, "utf-8"));

/** Empty strings and nulls are left to the field default. */
const text = (v: unknown) =>
  typeof v === "string" && v !== "" ? v : undefined;

async function main() {
  const payload = await getPayload({ config });
  const adapter = payload.db as any;

  // ---- apply the schema push, no prompt ----------------------------------
  const { pushSchema } = adapter.requireDrizzleKit();
  const { apply, hasDataLoss, warnings } = await pushSchema(
    adapter.schema,
    adapter.drizzle,
    adapter.schemaName ? [adapter.schemaName] : undefined,
    adapter.tablesFilter,
  );
  console.log(`push: ${warnings.length} warnings, dataLoss=${hasDataLoss}`);
  await apply();

  // ---- write the Dutch values back ---------------------------------------
  const locale = "nl" as const;
  const s = dump.site_settings[0];

  if (s) {
    await payload.updateGlobal({
      slug: "site-settings",
      locale,
      data: {
        tagline: text(s.tagline),
        description: text(s.description),
        heroTitle: text(s.hero_title),
        heroSubtitle: text(s.hero_subtitle),
        introTitle: text(s.intro_title),
        introText: text(s.intro_text),
        quote: text(s.quote),
        quoteAttribution: text(s.quote_attribution),
        newsletterTitle: text(s.newsletter_title),
        newsletterText: text(s.newsletter_text),
        aboutIntro: text(s.about_intro),
        aboutQuote: text(s.about_quote),
        footerTagline: text(s.footer_tagline),
        openingHours: dump.opening_hours.map((h) => ({
          id: String(h.id),
          day: String(h.day ?? ""),
          hours: String(h.hours ?? ""),
        })),
        features: dump.features.map((f) => ({
          id: String(f.id),
          icon: String(f.icon ?? ""),
          title: String(f.title ?? ""),
          text: String(f.text ?? ""),
        })),
        values: dump.values.map((v) => ({
          id: String(v.id),
          icon: String(v.icon ?? ""),
          title: String(v.title ?? ""),
          text: String(v.text ?? ""),
        })),
      } as any,
    });
    console.log("site-settings restored");
  }

  for (const c of dump.menu_categories) {
    await payload.update({
      collection: "menu-categories",
      id: c.id,
      locale,
      data: { name: String(c.name ?? ""), description: text(c.description) } as any,
    });
  }
  console.log(`menu-categories restored: ${dump.menu_categories.length}`);

  for (const i of dump.menu_items) {
    await payload.update({
      collection: "menu-items",
      id: i.id,
      locale,
      data: {
        name: String(i.name ?? ""),
        description: text(i.description),
        allergens: text(i.allergens),
      } as any,
    });
  }
  console.log(`menu-items restored: ${dump.menu_items.length}`);

  for (const n of dump.notifications) {
    await payload.update({
      collection: "notifications",
      id: n.id,
      locale,
      data: { title: String(n.title ?? ""), message: String(n.message ?? "") } as any,
    });
  }
  console.log(`notifications restored: ${dump.notifications.length}`);

  for (const m of dump.media) {
    await payload.update({
      collection: "media",
      id: m.id,
      locale,
      data: { alt: String(m.alt ?? ""), caption: text(m.caption) } as any,
    });
  }
  console.log(`media restored: ${dump.media.length}`);

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
