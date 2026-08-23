/**
 * Check that an import actually landed: re-export the database and compare it,
 * field by field and locale by locale, against the dump it was imported from.
 *
 *   npx tsx scripts/verify-import.ts [content-export.json]
 *
 * This exists because the failure it is looking for is a silent one. When a
 * localized array loses a locale the document still has the right number of
 * rows, the site still renders — off its hard-coded defaults — and the only
 * symptom is an owner editing the opening hours and seeing nothing change. A
 * migration that cannot be seen to have worked has not been shown to work, so
 * the last step of moving this site's content is running this and reading the
 * output.
 *
 * It writes nothing. The comparison happens in memory, against a fresh
 * `dumpContent` from scripts/export-content.ts, so a verification run cannot
 * leave a second copy of the guest data lying about the working tree.
 */
import { getPayload } from "payload";
import type { Field, Payload } from "payload";
import config from "../src/payload.config";
import fs from "fs";
import path from "path";

import { dumpContent } from "./export-content";
import type { Dump } from "./export-content";

const reference = process.argv[2] || path.resolve("content-export.json");

/** Payload's own bookkeeping, which import-content.ts deliberately leaves out. */
const INTERNAL = new Set([
  "payload-locked-documents",
  "payload-preferences",
  "payload-migrations",
]);

/**
 * Values that are expected to differ, and are not evidence of anything.
 *
 * Ids come from a Postgres sequence and were never going to survive; the
 * timestamps are set on write; the upload fields describe a file that has been
 * re-uploaded and reprocessed, so its size, its derived sizes and its URL all
 * belong to the new host. `filename` is left in on purpose — that is the one
 * upload value the import can and must carry over, and a media document that
 * came back with a different filename is a broken link somewhere.
 */
const EXPECTED_TO_DIFFER = new Set([
  "id",
  "createdAt",
  "updatedAt",
  "url",
  "thumbnailURL",
  "sizes",
  "mimeType",
  "filesize",
  "width",
  "height",
  "focalX",
  "focalY",
  "password",
  "salt",
  "hash",
  "resetPasswordToken",
  "resetPasswordExpiration",
  "loginAttempts",
  "lockUntil",
  "sessions",
  "globalType",
  "_status",
]);

type Doc = Record<string, any>;

/**
 * Something a human can recognise a document by, and which survives the move
 * where the id does not. Slugs come first because that is what the public
 * pages use; the fallbacks descend towards "the fifth one in the list", which
 * is weak but is still better than comparing document number 5 against
 * document number 12.
 */
function docKey(doc: Doc, index: number): string {
  for (const field of ["slug", "email", "filename", "title", "name", "label"]) {
    const value = doc?.[field];
    if (typeof value === "string" && value) return `${field}=${value}`;
  }
  return `#${index}`;
}

/**
 * collection -> old id -> key, for both dumps, so that a relationship pointing
 * at document 7 in one and document 23 in the other can be compared as the
 * thing it points at rather than as a number. Built off the Dutch list because
 * documents are not per-locale; only their fields are.
 */
function keyIndex(dump: Dump): Record<string, Map<string | number, string>> {
  const index: Record<string, Map<string | number, string>> = {};
  for (const [slug, perLocale] of Object.entries(dump.collections || {})) {
    const map = new Map<string | number, string>();
    (perLocale.nl || []).forEach((d, i) => map.set((d as Doc).id, docKey(d as Doc, i)));
    index[slug] = map;
  }
  return index;
}

/**
 * Rewrite a document into the form the two dumps can be held against each
 * other in: relationships as the key of what they point at, array and block
 * rows without their ids, and everything Payload regenerates left out.
 *
 * Config-driven, like `remapRelations` and `spliceRowIds` in
 * import-content.ts and for the same reason — a bare number in a JSON dump
 * does not say whether it is a relationship or a seat count.
 *
 * A dump older than the schema is a normal thing to be importing, which makes
 * both directions of "the config and the dump disagree" worth reporting and
 * neither worth failing on. `unknown` collects what the dump has and the
 * config does not, which nothing compared; `absent` collects what the config
 * has and the dump does not, where the database is holding the field's own
 * default and there was never anything to preserve. Only the reference dump is
 * asked for either.
 */
function normalize(
  fields: Field[],
  data: Doc,
  index: Record<string, Map<string | number, string>>,
  path: string,
  unknown: string[],
  absent: string[] = [],
): Doc {
  const out: Doc = {};
  if (!data || typeof data !== "object") return out;

  const known = new Set<string>();

  const walk = (fieldList: Field[], target: Doc, source: Doc, prefix: string) => {
    for (const field of fieldList) {
      if (!("name" in field) || !field.name) {
        if ("fields" in field && Array.isArray(field.fields)) {
          walk(field.fields, target, source, prefix);
        }
        if (field.type === "tabs") {
          for (const tab of field.tabs) {
            if ("name" in tab && tab.name) {
              known.add(tab.name);
              target[tab.name] = normalize(
                tab.fields,
                source[tab.name],
                index,
                `${prefix}${tab.name}.`,
                unknown,
                absent,
              );
            } else {
              walk(tab.fields, target, source, prefix);
            }
          }
        }
        continue;
      }

      const name = field.name;
      known.add(name);
      if (EXPECTED_TO_DIFFER.has(name)) continue;

      const value = source[name];

      // A group is a level, not a value. Compared as one it reads as a
      // difference the moment the two sides spell the empty case differently —
      // an absent `meta` against a `meta` of nothing but nulls — so both sides
      // are always descended into and the leaves do the talking.
      if (field.type === "group") {
        target[name] = normalize(
          field.fields,
          value && typeof value === "object" ? value : {},
          index,
          `${prefix}${name}.`,
          unknown,
          absent,
        );
        continue;
      }

      // A field the dump has no key for at all cannot have lost anything: it
      // was added to the config after the dump was taken, and whatever the
      // database holds is that field's own default.
      if (!(name in source)) absent.push(`${prefix}${name}`);

      // Missing and null are the same absence as far as a round trip goes:
      // Payload writes a column it was not given as null either way.
      if (value === undefined || value === null) {
        target[name] = null;
        continue;
      }

      if (field.type === "relationship" || field.type === "upload") {
        const targets = Array.isArray(field.relationTo) ? field.relationTo : [field.relationTo];
        const one = (v: any): unknown => {
          if (v && typeof v === "object" && "relationTo" in v) {
            return `${v.relationTo}:${index[v.relationTo]?.get(v.value) ?? `?${v.value}`}`;
          }
          const raw = v && typeof v === "object" && "id" in v ? v.id : v;
          for (const t of targets) {
            const key = index[t as string]?.get(raw);
            if (key !== undefined) return `${t}:${key}`;
          }
          return `?:${raw}`;
        };
        target[name] = Array.isArray(value) ? value.map(one) : one(value);
        continue;
      }

      if (field.type === "array" && Array.isArray(value)) {
        target[name] = value.map((row, i) =>
          normalize(field.fields, row, index, `${prefix}${name}[${i}].`, unknown, absent),
        );
        continue;
      }

      if (field.type === "blocks" && Array.isArray(value)) {
        target[name] = value.map((row, i) => {
          const block = field.blocks.find((b) => b.slug === row?.blockType);
          const rowOut = block
            ? normalize(block.fields, row, index, `${prefix}${name}[${i}].`, unknown, absent)
            : { ...row, id: undefined };
          return { blockType: row?.blockType, ...rowOut };
        });
        continue;
      }

      target[name] = value;
    }
  };

  walk(fields, out, data, path);

  for (const key of Object.keys(data)) {
    if (known.has(key) || EXPECTED_TO_DIFFER.has(key)) continue;
    unknown.push(`${path}${key}`);
  }

  return out;
}

/** Every leaf where the two differ, named by the path that leads to it. */
function diff(before: unknown, after: unknown, path: string, found: string[]): void {
  if (Array.isArray(before) || Array.isArray(after)) {
    const a = Array.isArray(before) ? before : [];
    const b = Array.isArray(after) ? after : [];
    if (a.length !== b.length) {
      found.push(`${path}: ${a.length} rows in the dump, ${b.length} imported`);
    }
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      diff(a[i], b[i], `${path}[${i}]`, found);
    }
    return;
  }

  if (before && after && typeof before === "object" && typeof after === "object") {
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    for (const key of keys) {
      diff((before as Doc)[key], (after as Doc)[key], path ? `${path}.${key}` : key, found);
    }
    return;
  }

  const a = before === undefined ? null : before;
  const b = after === undefined ? null : after;
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    found.push(`${path}: ${JSON.stringify(a)} -> ${JSON.stringify(b)}`);
  }
}

async function main() {
  if (!fs.existsSync(reference)) {
    console.error(`No such file: ${reference}`);
    process.exit(1);
  }

  const before: Dump = JSON.parse(fs.readFileSync(reference, "utf8"));
  const payload: Payload = await getPayload({ config });
  const after = await dumpContent(payload);

  console.log(`Verifying against ${reference}`);
  console.log(`  exported at ${before.exportedAt || "unknown"}`);
  console.log(`  database    ${process.env.DATABASE_URI || "(config default)"}\n`);

  const beforeIndex = keyIndex(before);
  const afterIndex = keyIndex(after);
  const locales = ["nl", "en"] as const;

  let problems = 0;
  const unknownPaths = new Set<string>();
  const addedPaths = new Set<string>();

  /**
   * Split what the comparison found into things that went wrong and things
   * that were never in the dump to begin with. A field the config gained after
   * the dump was taken shows up as null turning into its default, which looks
   * exactly like a difference and is exactly not one.
   */
  const sort = (found: string[], absent: string[], scope: string, into: string[], label: string) => {
    for (const line of found) {
      const at = line.slice(0, line.indexOf(":"));
      if (absent.includes(at)) addedPaths.add(`${scope}.${at}`);
      else into.push(`  ${label}${line}`);
    }
  };

  for (const collection of payload.config.collections) {
    const slug = collection.slug;
    if (INTERNAL.has(slug)) continue;
    const source = before.collections?.[slug];
    if (!source) continue;

    const lines: string[] = [];

    for (const locale of locales) {
      const beforeDocs = (source[locale] || []) as Doc[];
      const afterDocs = ((after.collections?.[slug]?.[locale] || []) as Doc[]);

      // Matched on the key rather than on position: the import creates
      // documents in dependency order, not dump order, so the two lists are
      // not guaranteed to line up.
      const afterByKey = new Map<string, Doc>();
      afterDocs.forEach((d, i) => afterByKey.set(docKey(d, i), d));

      for (let i = 0; i < beforeDocs.length; i++) {
        const key = docKey(beforeDocs[i], i);
        const match = afterByKey.get(key);
        if (!match) {
          lines.push(`  ${locale} ${key}: not imported`);
          continue;
        }
        afterByKey.delete(key);
        const unknown: string[] = [];
        const absent: string[] = [];
        const found: string[] = [];
        diff(
          normalize(collection.fields, beforeDocs[i], beforeIndex, "", unknown, absent),
          normalize(collection.fields, match, afterIndex, "", []),
          "",
          found,
        );
        for (const u of unknown) unknownPaths.add(`${slug}.${u}`);
        sort(found, absent, slug, lines, `${locale} ${key}: `);
      }

      for (const key of afterByKey.keys()) {
        lines.push(`  ${locale} ${key}: in the database but not in the dump`);
      }
    }

    problems += lines.length;
    console.log(`${slug}: ${lines.length ? `${lines.length} differences` : "clean"}`);
    for (const line of lines) console.log(line);
  }

  for (const global of payload.config.globals) {
    const slug = global.slug;
    const source = before.globals?.[slug];
    if (!source) continue;

    const lines: string[] = [];
    for (const locale of locales) {
      const unknown: string[] = [];
      const absent: string[] = [];
      const found: string[] = [];
      diff(
        normalize(global.fields, source[locale] as Doc, beforeIndex, "", unknown, absent),
        normalize(global.fields, after.globals?.[slug]?.[locale] as Doc, afterIndex, "", []),
        "",
        found,
      );
      for (const u of unknown) unknownPaths.add(`${slug}.${u}`);
      sort(found, absent, slug, lines, `${locale} `);
    }

    problems += lines.length;
    console.log(`global ${slug}: ${lines.length ? `${lines.length} differences` : "clean"}`);
    for (const line of lines) console.log(line);
  }

  if (addedPaths.size) {
    console.log(
      `\n${addedPaths.size} fields exist in the config but not in the dump, and hold `
        + "their default value. Nothing was lost there — there was nothing in the dump "
        + "to lose — but if one of these should have carried content across, the dump is "
        + "older than you thought:",
    );
    for (const at of [...addedPaths].sort()) console.log(`  ${at}`);
  }

  if (unknownPaths.size) {
    console.log(
      `\n${unknownPaths.size} values in the dump belong to no field in the current config `
        + "and were not compared. That is what a dump taken before a schema change looks "
        + "like, and it is only a problem if you recognise something on this list as "
        + "content somebody still wants:",
    );
    for (const p of [...unknownPaths].sort()) console.log(`  ${p}`);
  }

  console.log(
    problems
      ? `\n${problems} differences. The import did not round-trip.`
      : "\nEverything in the dump came back out of the database unchanged.",
  );
  process.exit(problems ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
