/**
 * Dump every document in the CMS to one JSON file, per locale.
 *
 * Run this against whatever database Payload is currently pointed at. It is
 * how the SQLite content crosses over to PostgreSQL: the export happens
 * through the Local API, so it does not care what the tables look like
 * underneath, only what the collections say.
 *
 *   npx tsx scripts/export-content.ts [outfile]
 */
import { getPayload } from "payload";
import config from "../src/payload.config";
import fs from "fs";
import path from "path";

const out = process.argv[2] || path.resolve("content-export.json");

async function main() {
  const payload = await getPayload({ config });
  const locales = ["nl", "en"] as const;

  const dump: Record<string, unknown> = { exportedAt: new Date().toISOString() };

  const collections: Record<string, unknown> = {};
  for (const c of payload.config.collections) {
    const slug = c.slug;
    const perLocale: Record<string, unknown[]> = {};
    for (const locale of locales) {
      const res = await payload.find({
        collection: slug as never,
        locale,
        fallbackLocale: null as never,
        limit: 10000,
        depth: 0,
        pagination: false,
        overrideAccess: true,
      });
      perLocale[locale] = res.docs;
    }
    collections[slug] = perLocale;
    console.log(`  ${slug}: ${perLocale.nl.length} docs`);
  }
  dump.collections = collections;

  const globals: Record<string, unknown> = {};
  for (const g of payload.config.globals) {
    const perLocale: Record<string, unknown> = {};
    for (const locale of locales) {
      perLocale[locale] = await payload.findGlobal({
        slug: g.slug as never,
        locale,
        fallbackLocale: null as never,
        depth: 0,
        overrideAccess: true,
      });
    }
    globals[g.slug] = perLocale;
    console.log(`  global ${g.slug}: ok`);
  }
  dump.globals = globals;

  fs.writeFileSync(out, JSON.stringify(dump, null, 2));
  console.log(`\nWritten to ${out}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
