/**
 * Clear the English fields that are only a Dutch echo.
 *
 * `localization.fallback` is on in src/payload.config.ts, so an untranslated
 * English field reads back as Dutch. That is the right thing for a visitor and
 * a trap for anything that writes: a partial update reads the document first,
 * keeps what it finds for the fields the patch does not mention, and stores
 * those Dutch sentences in the English rows as if an editor had typed them.
 * scripts/seed-en.ts did exactly that when it set one opening-hours note, and
 * from then on the English site served a Dutch hero, a Dutch newsletter block
 * and a Dutch About intro. The write side is fixed there and in
 * scripts/import-content.ts (`fallbackLocale: false`); this repairs a database
 * it already happened to.
 *
 * What it does: read every global once per locale with the fallback switched
 * off, and for every localised field whose English value is byte-for-byte the
 * Dutch one, write null into the English rows. Empty is what "not translated"
 * is supposed to look like — getSiteSettings() in src/lib/payload.ts then
 * serves the English default for that field, and the "Vertalingen" panel in
 * the admin starts counting the field as missing again, which it is.
 *
 * Dry run unless you pass --apply:
 *
 *   npx tsx scripts/clear-en-echo.ts                    # show what it would do
 *   npx tsx scripts/clear-en-echo.ts --apply
 *   npx tsx scripts/clear-en-echo.ts --apply --skip=heroTitle
 *
 * --skip is there because "identical" is not always "untranslated". The name of
 * the restaurant is the same sentence in both languages, and clearing it would
 * replace an owner's `De Bee's|Hive` with the stock default. The dry run prints
 * what each field would fall back to, so the choice can be made by looking.
 *
 * Collections are left alone on purpose. A menu item called "Bruschetta" in
 * both languages is translated, not echoed, and there is no way to tell the two
 * apart from here; the admin's copy-to-locale button and the "Vertalingen"
 * panel are the tools for those.
 */
import { getPayload } from "payload";
import config from "@payload-config";
import type { Field } from "payload";

// No schema push, the way scripts/backfill-nl-locale.ts does it. This script
// only rewrites rows, so it has no business altering a table — and a push
// leaves the `dev` row in `payload_migrations` that stops the production
// container dead (README.md, "The `dev` row"). This is a repair somebody will
// eventually run against the live database; it must not leave that behind.
process.env.PAYLOAD_MIGRATING = "true";

const apply = process.argv.includes("--apply");
const skip = new Set(
  process.argv
    .filter((arg) => arg.startsWith("--skip="))
    .flatMap((arg) => arg.slice("--skip=".length).split(","))
    .map((name) => name.trim())
    .filter(Boolean),
);

/**
 * The localised fields of one global, by name.
 *
 * Unnamed tabs and rows hold their fields inline, so they are walked through
 * rather than descended into: `SiteSettings` is one `tabs` field and every
 * setting lives under it. Named groups, arrays and blocks are skipped — their
 * rows would have to be rewritten whole to clear one subfield, which is a
 * bigger and more destructive operation than this script should be doing on
 * its own.
 */
function localizedFieldNames(fields: Field[]): string[] {
  const found: string[] = [];
  for (const field of fields) {
    if (field.type === "tabs") {
      for (const tab of field.tabs) {
        if ("name" in tab && tab.name) continue;
        found.push(...localizedFieldNames(tab.fields));
      }
      continue;
    }
    if (field.type === "row" || field.type === "collapsible") {
      found.push(...localizedFieldNames(field.fields));
      continue;
    }
    if (!("name" in field) || !field.name) continue;
    if (field.type === "group" || field.type === "array" || field.type === "blocks") {
      continue;
    }
    if ((field as { localized?: boolean }).localized) found.push(field.name);
  }
  return found;
}

/** One line of the dry run, short enough to read a column of. */
function preview(value: unknown): string {
  if (value === null || value === undefined) return "(leeg)";
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text.length > 70 ? `${text.slice(0, 67)}...` : text;
}

async function main() {
  const payload = await getPayload({ config });
  let cleared = 0;

  for (const global of payload.config.globals) {
    const names = localizedFieldNames(global.fields);
    if (!names.length) continue;

    // `fallbackLocale: false` on both reads, or the English one hands back the
    // Dutch text this script exists to find and every field looks translated.
    const [nl, en] = (await Promise.all([
      payload.findGlobal({
        slug: global.slug as never,
        locale: "nl",
        fallbackLocale: false,
        depth: 0,
        overrideAccess: true,
      }),
      payload.findGlobal({
        slug: global.slug as never,
        locale: "en",
        fallbackLocale: false,
        depth: 0,
        overrideAccess: true,
      }),
    ])) as unknown as Record<string, unknown>[];

    const patch: Record<string, null> = {};
    const kept: string[] = [];

    for (const name of names) {
      const dutch = nl[name];
      const english = en[name];
      if (dutch === null || dutch === undefined || dutch === "") continue;
      if (JSON.stringify(dutch) !== JSON.stringify(english)) continue;
      if (skip.has(name)) {
        kept.push(name);
        continue;
      }
      patch[name] = null;
    }

    console.log(`\n${global.slug}`);
    for (const name of kept) console.log(`  keep   ${name}  (--skip)`);
    for (const name of Object.keys(patch)) {
      console.log(`  clear  ${name}  = ${preview(nl[name])}`);
    }
    if (!Object.keys(patch).length && !kept.length) {
      console.log("  nothing to do");
      continue;
    }
    if (!Object.keys(patch).length) continue;

    if (!apply) {
      console.log(
        `  ${Object.keys(patch).length} field(s) would be cleared; re-run with --apply`,
      );
      continue;
    }

    await payload.updateGlobal({
      slug: global.slug as never,
      locale: "en",
      fallbackLocale: false,
      data: patch as never,
      overrideAccess: true,
    });
    cleared += Object.keys(patch).length;
    console.log(`  cleared ${Object.keys(patch).length} field(s)`);
  }

  if (apply) {
    console.log(
      `\n${cleared} English field(s) cleared. The English site now serves the` +
        " defaults from src/lib/payload.ts for those, until somebody translates" +
        " them in the admin.",
    );
  } else {
    console.log("\nDry run — nothing was written.");
  }
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
