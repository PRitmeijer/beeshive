/**
 * Read a dump written by scripts/export-content.ts back into whatever database
 * Payload is currently pointed at.
 *
 * This is the second half of the SQLite -> PostgreSQL move, and it works the
 * same way round: everything goes through the Local API, so it does not care
 * what the tables look like underneath, only what the collections say. Point
 * DATABASE_URI at the new database, let Payload build the schema, then:
 *
 *   npx tsx scripts/import-content.ts [content-export.json] [--wipe]
 *
 * It is written to be run against an empty database. Run twice without --wipe
 * and you get every document twice, because there is nothing in a dumped
 * document that reliably identifies it again once the ids have moved.
 */
import { getPayload } from "payload";
import type { Field } from "payload";
import config from "../src/payload.config";
import crypto from "crypto";
import fs from "fs";
import path from "path";

const args = process.argv.slice(2);
const wipe = args.includes("--wipe");
const input = args.find((a) => !a.startsWith("--")) || path.resolve("content-export.json");

/**
 * Payload's own bookkeeping. The locks and preferences describe admin sessions
 * that no longer exist, and payload-migrations is the new database's record of
 * its own schema — importing the old one would tell Payload that migrations it
 * has never run are already applied, which is the one way to make a fresh
 * install unrepairable.
 */
const INTERNAL = new Set([
  "payload-locked-documents",
  "payload-preferences",
  "payload-migrations",
]);

/**
 * Written by Payload, not by an editor: they are recomputed on create, and
 * feeding the old values back in either fails or lies. The upload fields in
 * particular describe files at paths that only existed on the old host.
 */
const GENERATED = new Set([
  "id",
  "createdAt",
  "updatedAt",
  "url",
  "thumbnailURL",
  "sizes",
  "filename",
  "mimeType",
  "filesize",
  "width",
  "height",
  "password",
  "salt",
  "hash",
  "resetPasswordToken",
  "resetPasswordExpiration",
  "loginAttempts",
  "lockUntil",
  "sessions",
]);

/** Where export-content.ts leaves the files that belong to the media docs. */
const mediaDir = path.resolve("media");

type Doc = Record<string, any>;

/**
 * Old id -> new id, per collection.
 *
 * Nothing here asks to keep the original ids, and that is a deliberate
 * decision rather than an oversight. A collection whose `id` is a custom text
 * field would keep them for free, because the id is then part of the data. On
 * this adapter it is a serial column, and asking anyway is actively harmful:
 * Payload lets the sequence assign the row's real id but uses the *requested*
 * one for the rows it writes into the side tables — the locale tables, arrays,
 * hasMany selects — so a menu item with a dietary label fails on
 * `menu_items_dietary_parent_fk`, and one without a side table quietly ends up
 * with an id nothing else agrees on. Six of ten menu items imported that way
 * before this was traced.
 *
 * So ids are reassigned, and this map is what keeps the documents connected:
 * every relationship and upload value in the dump still points at the old
 * number, and `remapRelations` rewrites it. Any URL that named a document by
 * id — nothing on this site does, the public pages use slugs — would need
 * updating by hand.
 */
const idMap: Record<string, Map<string | number, string | number>> = {};

function mapId(collection: string, oldId: string | number | null | undefined) {
  if (oldId === null || oldId === undefined) return undefined;
  return idMap[collection]?.get(oldId);
}

/**
 * Everything the editor owns, deep-copied. The copy matters: the remapping
 * below rewrites nested objects in place, and without it a second pass over
 * the same document would be working on values the first pass had already
 * changed.
 */
function strip(doc: Doc): Doc {
  return structuredClone(
    Object.fromEntries(Object.entries(doc).filter(([k]) => !GENERATED.has(k))),
  );
}

/**
 * Which other collections a collection points at, so that the targets can be
 * created first and the ids are known by the time anything refers to them.
 *
 * Without this, menu items are created before the menu categories they belong
 * to. Postgres rejects the foreign key outright — SQLite did not, which is
 * part of why nobody noticed the ordering mattered — and a required
 * relationship cannot simply be left out and filled in afterwards, because
 * Payload validates it on create.
 */
function relationTargets(fields: Field[], found = new Set<string>()): Set<string> {
  for (const field of fields) {
    if (field.type === "relationship" || field.type === "upload") {
      for (const target of Array.isArray(field.relationTo) ? field.relationTo : [field.relationTo]) {
        found.add(target as string);
      }
    }
    if ("fields" in field && Array.isArray(field.fields)) relationTargets(field.fields, found);
    if (field.type === "tabs") for (const tab of field.tabs) relationTargets(tab.fields, found);
    if (field.type === "blocks") for (const block of field.blocks) relationTargets(block.fields, found);
  }
  return found;
}

/**
 * Config order, rearranged so that a collection comes after everything it
 * points at. A cycle — two collections that refer to each other — cannot be
 * resolved this way and is left in config order; the second pass exists for
 * exactly that case.
 */
function inDependencyOrder<T extends { slug: string; fields: Field[] }>(collections: T[]): T[] {
  const remaining = [...collections];
  const done = new Set<string>();
  const ordered: T[] = [];

  while (remaining.length) {
    const index = remaining.findIndex((c) =>
      [...relationTargets(c.fields)].every(
        (target) => target === c.slug || done.has(target) || !collections.some((x) => x.slug === target),
      ),
    );
    const next = index === -1 ? remaining.shift()! : remaining.splice(index, 1)[0];
    done.add(next.slug);
    ordered.push(next);
  }

  return ordered;
}

/**
 * Walk a document alongside the field definitions that produced it and rewrite
 * every relationship and upload value through the id map.
 *
 * It has to be driven by the config rather than by the data: in a JSON dump a
 * relationship is a bare number, and nothing about the number 3 says whether
 * it is a media id or the number of courses on a set menu.
 *
 * `unresolved` collects the fields whose target has not been created yet. The
 * caller drops those from the first write — a foreign key pointing at a row
 * that does not exist yet is rejected by Postgres, unlike SQLite, which was
 * happy to store it — and comes back for them in the second pass.
 */
function remapRelations(fields: Field[], data: Doc, unresolved: string[]): Doc {
  // Mutated in place rather than copied, so that a relationship dropped inside
  // an unnamed row or collapsible is dropped from the document the caller is
  // holding. `strip` has already made the deep copy this is safe on.
  const out: Doc = data;

  for (const field of fields) {
    // Rows, collapsibles and unnamed tabs hold fields without nesting the data.
    if (!("name" in field) || !field.name) {
      if ("fields" in field && Array.isArray(field.fields)) {
        remapRelations(field.fields, out, unresolved);
      }
      if (field.type === "tabs") {
        for (const tab of field.tabs) {
          if ("name" in tab && tab.name) {
            if (out[tab.name] && typeof out[tab.name] === "object") {
              out[tab.name] = remapRelations(tab.fields, out[tab.name], unresolved);
            }
          } else {
            remapRelations(tab.fields, out, unresolved);
          }
        }
      }
      continue;
    }

    const name = field.name;
    const value = out[name];
    if (value === undefined || value === null) continue;

    if (field.type === "relationship" || field.type === "upload") {
      const targets = Array.isArray(field.relationTo)
        ? field.relationTo
        : [field.relationTo];

      const one = (v: any) => {
        // Polymorphic relationships carry their own collection name.
        if (v && typeof v === "object" && "relationTo" in v) {
          const mapped = mapId(v.relationTo, v.value);
          if (mapped === undefined) {
            unresolved.push(name);
            return undefined;
          }
          return { relationTo: v.relationTo, value: mapped };
        }
        const raw = v && typeof v === "object" && "id" in v ? v.id : v;
        for (const target of targets) {
          const mapped = mapId(target as string, raw);
          if (mapped !== undefined) return mapped;
        }
        unresolved.push(name);
        return undefined;
      };

      if (Array.isArray(value)) {
        const mapped = value.map(one).filter((v) => v !== undefined);
        out[name] = mapped;
      } else {
        const mapped = one(value);
        if (mapped === undefined) delete out[name];
        else out[name] = mapped;
      }
      continue;
    }

    if (field.type === "array" && Array.isArray(value)) {
      out[name] = value.map((row) =>
        remapRelations(field.fields, { ...row, id: undefined }, unresolved),
      );
      continue;
    }

    if (field.type === "group" && typeof value === "object") {
      out[name] = remapRelations(field.fields, value, unresolved);
      continue;
    }

    if (field.type === "blocks" && Array.isArray(value)) {
      out[name] = value.map((row) => {
        const block = field.blocks.find((b) => b.slug === row.blockType);
        return block
          ? remapRelations(block.fields, { ...row, id: undefined }, unresolved)
          : row;
      });
      continue;
    }
  }

  return out;
}

async function main() {
  if (!fs.existsSync(input)) {
    console.error(`No such file: ${input}`);
    process.exit(1);
  }

  const dump = JSON.parse(fs.readFileSync(input, "utf8"));
  const payload = await getPayload({ config });

  console.log(`Importing ${input}`);
  console.log(`  exported at ${dump.exportedAt || "unknown"}`);
  console.log(`  database    ${process.env.DATABASE_URI || "(config default)"}`);

  if (wipe) {
    console.warn(
      "\n  !!  --wipe: every existing document in each imported collection is\n" +
        "  !!  deleted first. On a database that is already live this throws away\n" +
        "  !!  reservations, contact messages and subscribers that are not in the\n" +
        "  !!  dump. Ctrl-C now if that is not what you meant.\n",
    );
  }

  const missingFiles: string[] = [];
  const resetPasswords: string[] = [];
  const summary: { collection: string; created: number; failed: number }[] = [];
  const pending: {
    collection: string;
    newId: string | number;
    nl: Doc;
    en: Doc;
  }[] = [];

  // Phase one: create everything, in config order, with the relations that can
  // already be resolved. Collections that reference something defined further
  // down the config (a gallery image and its category) come back in phase two.
  for (const collection of inDependencyOrder(payload.config.collections)) {
    const slug = collection.slug;
    if (INTERNAL.has(slug)) continue;

    const perLocale = dump.collections?.[slug];
    if (!perLocale) {
      console.log(`  ${slug}: not in the dump, skipped`);
      continue;
    }

    idMap[slug] = new Map();

    if (wipe) {
      const deleted = await payload.delete({
        collection: slug as never,
        where: { id: { exists: true } },
        overrideAccess: true,
      });
      console.log(`  ${slug}: wiped ${deleted.docs.length} documents`);
    }

    const nlDocs: Doc[] = perLocale.nl || [];
    const enById = new Map<string | number, Doc>(
      (perLocale.en || []).map((d: Doc) => [d.id, d]),
    );

    let created = 0;
    let failed = 0;

    for (const source of nlDocs) {
      const unresolved: string[] = [];
      const data = remapRelations(collection.fields, strip(source), unresolved);

      // Users carry a password hash, and the Local API only accepts a
      // plaintext password — there is no way to re-import a hash through it.
      // Everyone gets a random one and has to use "forgot password", which is
      // safer than a shared placeholder that somebody forgets to change.
      if (collection.auth) {
        data.password = crypto.randomBytes(24).toString("base64url");
        if (source.email) resetPasswords.push(String(source.email));
      }

      // Media documents name a file rather than containing one. Re-upload it
      // from ./media if it is still there; Payload regenerates the sizes and
      // writes to disk or to R2 depending on how this run is configured.
      //
      // If the file is gone there is nothing to be done: Payload refuses to
      // create a document in an upload collection without one ("No files were
      // uploaded"), so the create below fails and the document is named in the
      // warning at the end rather than half-imported.
      const filename = source.filename as string | undefined;
      let filePath: string | undefined;
      if (collection.upload && filename) {
        const candidate = path.join(mediaDir, filename);
        if (fs.existsSync(candidate)) filePath = candidate;
        else missingFiles.push(`${slug}/${filename}`);
      }

      try {
        // The collection slug is a runtime string, so the Local API's generics
        // resolve to `never` and the returned document has no usable type.
        const doc = (await payload.create({
          collection: slug as never,
          locale: "nl",
          data: data as never,
          ...(filePath ? { filePath } : {}),
          overrideAccess: true,
          // Nobody is signing up here: these accounts already existed, and a
          // "confirm your address" mail to the owners in the middle of a
          // migration is confusing at best.
          disableVerificationEmail: true,
        })) as { id: string | number };
        idMap[slug].set(source.id, doc.id);
        created++;

        const en = enById.get(source.id);
        pending.push({
          collection: slug,
          newId: doc.id,
          nl: unresolved.length ? strip(source) : {},
          en: en ? strip(en) : {},
        });
      } catch (error) {
        failed++;
        const reason = error instanceof Error ? error.message : String(error);
        console.warn(`  ${slug}#${source.id}: ${reason}`);
      }
    }

    summary.push({ collection: slug, created, failed });
    console.log(`  ${slug}: ${created} created${failed ? `, ${failed} failed` : ""}`);
  }

  // Phase two: the relations that were not resolvable yet, and then the English
  // values on top of the Dutch document — same id, second locale, which is how
  // export-content.ts dumped them.
  console.log("\nSecond pass: relations and English values");
  let updated = 0;
  for (const item of pending) {
    const collection = payload.config.collections.find(
      (c) => c.slug === item.collection,
    );
    if (!collection) continue;

    const still: string[] = [];
    try {
      if (Object.keys(item.nl).length) {
        await payload.update({
          collection: item.collection as never,
          id: item.newId,
          locale: "nl",
          data: remapRelations(collection.fields, item.nl, still) as never,
          overrideAccess: true,
        });
      }
      if (Object.keys(item.en).length) {
        await payload.update({
          collection: item.collection as never,
          id: item.newId,
          locale: "en",
          data: remapRelations(collection.fields, item.en, still) as never,
          overrideAccess: true,
        });
        updated++;
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      console.warn(`  ${item.collection}#${item.newId}: ${reason}`);
    }
    if (still.length) {
      console.warn(
        `  ${item.collection}#${item.newId}: dropped links to documents that are not in the dump (${[...new Set(still)].join(", ")})`,
      );
    }
  }

  // Globals have no ids to preserve, so they are simply written twice.
  console.log("\nGlobals");
  for (const global of payload.config.globals) {
    const perLocale = dump.globals?.[global.slug];
    if (!perLocale) {
      console.log(`  ${global.slug}: not in the dump, skipped`);
      continue;
    }
    for (const locale of ["nl", "en"] as const) {
      const source = perLocale[locale];
      if (!source) continue;
      const still: string[] = [];
      await payload.updateGlobal({
        slug: global.slug as never,
        locale,
        data: remapRelations(global.fields, strip(source), still) as never,
        overrideAccess: true,
      });
    }
    console.log(`  ${global.slug}: ok`);
  }

  const width = Math.max(...summary.map((s) => s.collection.length), 12);
  console.log("\n" + "collection".padEnd(width) + "  created  failed");
  console.log("-".repeat(width + 17));
  for (const row of summary) {
    console.log(
      row.collection.padEnd(width) +
        String(row.created).padStart(9) +
        String(row.failed).padStart(8),
    );
  }
  console.log(`\n${updated} documents given their English values.`);

  if (missingFiles.length) {
    console.warn(
      `\n${missingFiles.length} media documents had no file in ./media and could not be imported:`,
    );
    for (const f of missingFiles) console.warn(`  ${f}`);
    console.warn(
      "Copy the old media directory to ./media and run the import again on an empty database, or re-upload these by hand in /admin. Anything that pointed at them lost the link.",
    );
  }

  if (resetPasswords.length) {
    console.warn(
      "\nPassword hashes cannot be imported. These accounts exist with a random password and must use 'Wachtwoord vergeten' before anyone can log in:",
    );
    for (const email of resetPasswords) console.warn(`  ${email}`);
  }

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
