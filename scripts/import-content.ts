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
 *
 * Every document is written once per locale, and the second write is the
 * delicate one: see `spliceRowIds` for what has to happen in between and what
 * it cost the last time it did not.
 */
import { getPayload } from "payload";
import type { Field } from "payload";
import config from "../src/payload.config";
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";

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

/**
 * Where the old site's uploaded files are, for the media documents to be
 * re-created from.
 *
 * The default is the same ./media the site itself uploads into, which is
 * convenient and also the one thing that can go wrong here — see
 * `stageUpload`. MEDIA_IMPORT_DIR points this somewhere else when the old
 * files arrive in a directory of their own, which is the tidier way to do it.
 */
const mediaDir = path.resolve(process.env.MEDIA_IMPORT_DIR || "media");

/**
 * Payload's own upload directory for a collection, when it is still writing to
 * disk. With R2 configured the plugin turns local storage off and the files go
 * to the bucket, so there is no directory to collide with and this is
 * undefined.
 */
function uploadDir(collection: { upload?: unknown }): string | undefined {
  const upload = collection.upload as
    | { staticDir?: string; disableLocalStorage?: boolean }
    | undefined
    | boolean;
  if (!upload || typeof upload !== "object") return undefined;
  if (upload.disableLocalStorage) return undefined;
  return upload.staticDir ? path.resolve(upload.staticDir) : undefined;
}

/** Rename, or copy and delete when the two paths are on different filesystems. */
function moveFile(from: string, to: string) {
  try {
    fs.renameSync(from, to);
  } catch {
    fs.copyFileSync(from, to);
    fs.unlinkSync(from);
  }
}

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
 * The shape of an update that empties a global's lists and drops its links:
 * every array and blocks field set to [], every relationship and upload to
 * null.
 *
 * Two things want this, and both of them are --wipe. The first is that a media
 * document cannot be deleted while the homepage still names it — the row lives
 * in the global's own table, Postgres refuses the delete on the foreign key,
 * and the aborted transaction takes the rest of the wipe down with it. The
 * second is subtler: the globals are rewritten from the dump at the end of the
 * run, and an update only touches the fields it is given, so an array the dump
 * has no key for keeps whatever rows the database already held. Re-run an
 * import against a schema the dump predates and those rows are still there,
 * looking exactly like content somebody meant to import.
 *
 * Plain fields are left alone. One the dump does not mention keeps its old
 * value, which is a smaller hazard than clearing a required field out from
 * under Payload's validation and failing the wipe over it.
 */
function globalWipe(fields: Field[]): Doc {
  const out: Doc = {};

  for (const field of fields) {
    if (!("name" in field) || !field.name) {
      if ("fields" in field && Array.isArray(field.fields)) {
        Object.assign(out, globalWipe(field.fields));
      }
      if (field.type === "tabs") {
        for (const tab of field.tabs) {
          if ("name" in tab && tab.name) {
            const nested = globalWipe(tab.fields);
            if (Object.keys(nested).length) out[tab.name] = nested;
          } else {
            Object.assign(out, globalWipe(tab.fields));
          }
        }
      }
      continue;
    }

    if (field.type === "relationship" || field.type === "upload") {
      out[field.name] = null;
      continue;
    }

    if (field.type === "array" || field.type === "blocks") {
      out[field.name] = [];
      continue;
    }

    if (field.type === "group") {
      const nested = globalWipe(field.fields);
      if (Object.keys(nested).length) out[field.name] = nested;
    }
  }

  return out;
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

/**
 * Give the next locale's data the row ids Payload assigned to the first one.
 *
 * Array and block rows live in tables of their own, and the row id is the only
 * thing tying the two locales' values to the same row. The dump's ids came out
 * of SQLite and mean nothing in a fresh database, so `strip` and
 * `remapRelations` drop them and the first locale is written without any.
 *
 * That leaves the second locale with no way to say "this is the same Monday".
 * Sent id-less, Payload reads it as an entirely new list: it deletes the rows
 * it created a moment ago and inserts fresh ones carrying only the second
 * locale's values, and the first locale's text goes with them. It is silent,
 * and it took the Dutch opening hours once already — seven rows in
 * site_settings_opening_hours_locales, every one of them 'en', while the site
 * quietly served the hard-coded defaults in src/lib/payload.ts and nobody
 * could work out why editing the hours did nothing.
 *
 * So the document is read back between the two writes and the real ids are
 * spliced in here, by position. Position is the only thing the two locales are
 * guaranteed to share: a row is not localized, only its fields are, so both
 * locales are describing one list in one order.
 *
 * The walk is driven by the config for the same reason `remapRelations` is —
 * nothing about a JSON array says whether it came from an array field, a
 * blocks field or a hasMany select — and it follows that function's shape on
 * purpose, down to how rows, collapsibles and unnamed tabs hold fields without
 * nesting the data. `notes` collects the mismatches worth telling the operator
 * about; none of them stop the import.
 */
export function spliceRowIds(
  fields: Field[],
  saved: Doc,
  next: Doc,
  path: string,
  notes: string[],
): void {
  if (!saved || !next || typeof saved !== "object" || typeof next !== "object") return;

  for (const field of fields) {
    if (!("name" in field) || !field.name) {
      if ("fields" in field && Array.isArray(field.fields)) {
        spliceRowIds(field.fields, saved, next, path, notes);
      }
      if (field.type === "tabs") {
        for (const tab of field.tabs) {
          if ("name" in tab && tab.name) {
            spliceRowIds(tab.fields, saved[tab.name], next[tab.name], `${path}${tab.name}.`, notes);
          } else {
            spliceRowIds(tab.fields, saved, next, path, notes);
          }
        }
      }
      continue;
    }

    const name = field.name;

    // Groups have no id of their own; they are only a level to descend
    // through on the way to an array that does.
    if (field.type === "group") {
      spliceRowIds(field.fields, saved[name], next[name], `${path}${name}.`, notes);
      continue;
    }

    if (field.type !== "array" && field.type !== "blocks") continue;

    const savedRows = saved[name];
    const nextRows = next[name];
    if (!Array.isArray(savedRows) || !Array.isArray(nextRows)) continue;

    for (let i = 0; i < nextRows.length && i < savedRows.length; i++) {
      const savedRow = savedRows[i];
      const nextRow = nextRows[i];
      if (!savedRow || !nextRow || typeof nextRow !== "object") continue;

      if (field.type === "blocks") {
        // Two different block types in the same position are not the same row
        // however much the positions line up, and handing Payload one block's
        // id with another block's fields corrupts the document rather than
        // failing. Leave the row without an id: it costs this locale's link to
        // the row it should have had, which is recoverable by hand, where the
        // alternative is not.
        if (savedRow.blockType !== nextRow.blockType) {
          notes.push(
            `${path}${name}[${i}]: block type differs between locales `
              + `(${savedRow.blockType} / ${nextRow.blockType}), left unmatched`,
          );
          continue;
        }
        nextRow.id = savedRow.id;
        const block = field.blocks.find((b) => b.slug === nextRow.blockType);
        if (block) {
          spliceRowIds(block.fields, savedRow, nextRow, `${path}${name}[${i}].`, notes);
        }
        continue;
      }

      nextRow.id = savedRow.id;
      spliceRowIds(field.fields, savedRow, nextRow, `${path}${name}[${i}].`, notes);
    }

    // Rows the next locale does not mention. They cannot simply be left out:
    // Payload takes the array it is given as the whole array, and the rows are
    // shared between the locales, so an English list that stops after five
    // days would take Saturday and Sunday off the Dutch site as well. Each
    // missing row is appended carrying nothing but its id, which is enough for
    // Payload to recognise it and keep it.
    //
    // What Payload then stores for this locale is its own business: with the
    // fallback on it copies the first locale's text across, so the English
    // Saturday reads "Zaterdag" until somebody translates it. Untranslated and
    // visibly so is the right way to fail here — the alternative was losing
    // the day.
    for (let i = nextRows.length; i < savedRows.length; i++) {
      const savedRow = savedRows[i];
      if (!savedRow) continue;
      nextRows.push(
        field.type === "blocks"
          ? { id: savedRow.id, blockType: savedRow.blockType }
          : { id: savedRow.id },
      );
    }

    if (nextRows.length !== savedRows.length) {
      // The other direction: more rows here than the first locale created.
      // Those arrive without an id and Payload creates them, which is right —
      // worth a line so that a dump the two locales disagree about is visible
      // rather than merely absorbed.
      notes.push(
        `${path}${name}: ${nextRows.length} rows against ${savedRows.length} in the first locale`,
      );
    }
  }
}

/**
 * The document as Payload actually stored it, which is the only place the row
 * ids exist. `depth: 0` leaves relationships as bare ids: nothing here reads
 * them and populating them would fetch documents for no reason.
 */
async function readBack(
  payload: Awaited<ReturnType<typeof getPayload>>,
  collection: string,
  id: string | number,
): Promise<Doc> {
  return (await payload.findByID({
    collection: collection as never,
    id,
    locale: "nl",
    depth: 0,
    overrideAccess: true,
  })) as Doc;
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

  // Emptying happens in one pass of its own, before anything is created, and
  // it covers every collection rather than only the ones the dump mentions: a
  // dump taken before a collection existed would otherwise leave that
  // collection's old rows behind and make a "clean" import anything but.
  // Reverse dependency order, so that the documents pointing at something go
  // before the something they point at.
  if (wipe) {
    // The globals go first, or rather their lists and their links do: see
    // `globalWipe`. Then the collections, each delete on its own so that one
    // that will not go does not take the rest of the pass with it.
    for (const global of payload.config.globals) {
      const detach = globalWipe(global.fields);
      if (!Object.keys(detach).length) continue;
      try {
        await payload.updateGlobal({
          slug: global.slug as never,
          data: detach as never,
          overrideAccess: true,
        });
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        console.warn(`  ${global.slug}: could not be emptied before the wipe: ${reason}`);
      }
    }

    for (const collection of inDependencyOrder(payload.config.collections).reverse()) {
      if (INTERNAL.has(collection.slug)) continue;
      try {
        const deleted = await payload.delete({
          collection: collection.slug as never,
          where: { id: { exists: true } },
          overrideAccess: true,
        });
        if (deleted.docs.length) {
          console.log(`  ${collection.slug}: wiped ${deleted.docs.length} documents`);
        }
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        console.warn(`  ${collection.slug}: could not be wiped: ${reason}`);
      }
    }
  }

  // Somewhere to hold an upload for the moment between taking it out of the
  // media directory and Payload writing it back, and nothing else.
  const stagingDir = fs.mkdtempSync(path.join(os.tmpdir(), "beeshive-import-"));

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
      let staged: { from: string; to: string } | undefined;
      if (collection.upload && filename) {
        const candidate = path.join(mediaDir, filename);
        if (fs.existsSync(candidate)) {
          // The old files usually sit in the very directory Payload is about
          // to write this upload into, because ./media is both where the last
          // install kept them and where this one will. Handed a file whose
          // name is already taken in its own upload directory, Payload does
          // not overwrite: it saves the document as Lm08h01-1.svg and says
          // nothing. Every media document comes out renamed that way, the
          // dump and the database stop agreeing about what the file is
          // called, and a second run renames them again.
          //
          // So when the two directories are the same the file is moved aside
          // first, which frees the name, and Payload puts it back under it.
          // Nothing is lost if the create then fails — the file goes back
          // where it was, below.
          const destination = uploadDir(collection);
          if (destination && destination === path.resolve(mediaDir)) {
            const to = path.join(stagingDir, filename);
            moveFile(candidate, to);
            staged = { from: candidate, to };
            filePath = to;
          } else {
            filePath = candidate;
          }
        } else {
          missingFiles.push(`${slug}/${filename}`);
        }
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
        // Put the file back before anything else, so that fixing whatever went
        // wrong and running the import again finds the media directory as it
        // was rather than one file short.
        if (staged && fs.existsSync(staged.to)) moveFile(staged.to, staged.from);
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
    const notes: string[] = [];
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
        const en = remapRelations(collection.fields, item.en, still);
        // Read back after the Dutch update rather than before it. That update
        // sends the whole document again, so Payload throws its array rows
        // away and makes new ones; ids read any earlier are already stale by
        // the time the English write needs them.
        spliceRowIds(
          collection.fields,
          await readBack(payload, item.collection, item.newId),
          en,
          "",
          notes,
        );
        await payload.update({
          collection: item.collection as never,
          id: item.newId,
          locale: "en",
          data: en as never,
          overrideAccess: true,
        });
        updated++;
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      console.warn(`  ${item.collection}#${item.newId}: ${reason}`);
    }
    for (const note of notes) {
      console.warn(`  ${item.collection}#${item.newId}: ${note}`);
    }
    if (still.length) {
      console.warn(
        `  ${item.collection}#${item.newId}: dropped links to documents that are not in the dump (${[...new Set(still)].join(", ")})`,
      );
    }
  }

  // A global has no id of its own to preserve, but its array rows do, and
  // those are what site_settings_opening_hours is made of. So each locale
  // after the first is handed the ids the write before it created. With two
  // languages that is one read-back; the loop is shaped for a third rather
  // than assuming there will never be one.
  console.log("\nGlobals");
  for (const global of payload.config.globals) {
    const perLocale = dump.globals?.[global.slug];
    if (!perLocale) {
      console.log(`  ${global.slug}: not in the dump, skipped`);
      continue;
    }

    const still: string[] = [];
    const notes: string[] = [];
    let saved: Doc | undefined;

    for (const locale of ["nl", "en"] as const) {
      const source = perLocale[locale];
      if (!source) continue;
      const data = remapRelations(global.fields, strip(source), still);
      if (saved) spliceRowIds(global.fields, saved, data, "", notes);
      await payload.updateGlobal({
        slug: global.slug as never,
        locale,
        data: data as never,
        overrideAccess: true,
      });
      saved = (await payload.findGlobal({
        slug: global.slug as never,
        locale,
        depth: 0,
        overrideAccess: true,
      })) as Doc;
    }

    console.log(`  ${global.slug}: ok`);
    for (const note of notes) console.warn(`  ${global.slug}: ${note}`);
    if (still.length) {
      console.warn(
        `  ${global.slug}: dropped links to documents that are not in the dump (${[...new Set(still)].join(", ")})`,
      );
    }
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

  fs.rmSync(stagingDir, { recursive: true, force: true });

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

// Only when this file is the thing that was run, so that a test can import
// `spliceRowIds` without starting an import against whatever DATABASE_URI
// happens to be set to.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
