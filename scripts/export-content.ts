/**
 * Dump every document in the CMS to one JSON file, per locale.
 *
 * Run this against whatever database Payload is currently pointed at. It is
 * how the SQLite content crosses over to PostgreSQL: the export happens
 * through the Local API, so it does not care what the tables look like
 * underneath, only what the collections say.
 *
 *   npx tsx scripts/export-content.ts [outfile]
 *
 * `dumpContent` is exported because scripts/verify-import.ts needs the same
 * dump in memory to compare an import against. Reading it back off disk would
 * work equally well; sharing the function is what guarantees the verifier is
 * looking at the export this script would have written and not at something
 * that has drifted from it.
 */
import { getPayload } from "payload";
import type { Payload } from "payload";
import config from "../src/payload.config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const locales = ["nl", "en"] as const;

export type Dump = {
  exportedAt: string;
  collections: Record<string, Record<string, unknown[]>>;
  globals: Record<string, Record<string, unknown>>;
};

/**
 * `fallbackLocale: null` is the whole reason this reads once per locale: with
 * the fallback left on, an untranslated English field comes back holding the
 * Dutch text and the dump can no longer tell "translated to the same words"
 * from "never translated". `depth: 0` keeps relationships as ids, which is
 * what import-content.ts remaps.
 */
export async function dumpContent(
  payload: Payload,
  log: (line: string) => void = () => {},
): Promise<Dump> {
  const collections: Record<string, Record<string, unknown[]>> = {};
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
    log(`  ${slug}: ${perLocale.nl.length} docs`);
  }

  const globals: Record<string, Record<string, unknown>> = {};
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
    log(`  global ${g.slug}: ok`);
  }

  return { exportedAt: new Date().toISOString(), collections, globals };
}

async function main() {
  const out = process.argv[2] || path.resolve("content-export.json");
  const payload = await getPayload({ config });
  const dump = await dumpContent(payload, (line) => console.log(line));

  fs.writeFileSync(out, JSON.stringify(dump, null, 2));
  console.log(`\nWritten to ${out}`);
  process.exit(0);
}

// Only when this file is the thing that was run. Importing it — which the
// verifier does — must not start an export as a side effect.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
