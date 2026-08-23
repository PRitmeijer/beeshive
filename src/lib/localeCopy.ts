import type { Field, Payload, TypedUser } from "payload";
import type { CollectionSlug, GlobalSlug, TypedLocale } from "payload";

/**
 * Copying one locale's text into another, in one pass, from the server.
 *
 * The complaint this exists for is worth restating precisely, because the
 * obvious reading of it is wrong. "I add media, I have to save it, then go to
 * the English tab, click it again, and save it again" sounds like the admin
 * making two saves out of one, and it is tempting to go looking for a bug. It
 * is not a bug. A field marked `localized: true` in Payload has one row per
 * locale in a `_locales` side table, and there is genuinely no value stored for
 * English until something writes one; the editor is the only thing that knows
 * what that value should be, so Payload asks, once per locale. Everything that
 * is *not* localized — the uploaded file itself, a date, a checkbox, a number —
 * is a single shared column and is written once, whichever locale you happen to
 * have open.
 *
 * So the two-save dance is real work for real fields, and the only honest way
 * to remove it is to do the second save for the editor rather than to pretend
 * it is unnecessary. That is all this file is: read the document twice, once
 * per locale, with the fallback switched off so an empty English field reads as
 * empty instead of quietly reading back its Dutch value, work out which fields
 * are localized, and write the source's values into the target in a single
 * update.
 *
 * The fallback is the subtle part. `localization.fallback` is on in
 * src/payload.config.ts, which is what makes an untranslated site look finished
 * — the English page serves the Dutch sentence rather than a hole. It also
 * means that a normal read of the English document hands back Dutch text for
 * every field nobody has translated, and a copy built from that would consider
 * every field already filled and do nothing at all. Both reads therefore pass
 * `fallbackLocale: false`.
 *
 * By default only fields that are empty in the target are filled. Somebody
 * translating the menu one item at a time must be able to press this without
 * losing the afternoon's work, so overwriting is a separate, deliberate choice
 * the caller has to make.
 */

/**
 * Locale codes arrive here as plain strings — out of a request body, out of the
 * admin's URL — and Payload's generated types narrow them to the two codes the
 * config declares. `configuredLocales` is what actually decides whether a code
 * is real; this only tells the compiler that the check has happened.
 */
function asLocale(code: string): TypedLocale {
  return code as TypedLocale;
}

/**
 * The failures this file checks for itself, as opposed to the ones Payload
 * raises when it refuses a write. The route tells them apart to decide whether
 * the message can be shown to the owners as it is — everything thrown as a
 * `LocaleCopyError` is already written in Dutch and already means something to
 * somebody who is not a programmer.
 */
export class LocaleCopyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LocaleCopyError";
  }
}

/** Which locale is being read from and which is being written to. */
export interface LocaleCopyArgs {
  payload: Payload;
  /** Whose permissions the read and the write run under. Never omitted. */
  user: TypedUser;
  /** Exactly one of these two, with `id` alongside `collection`. */
  collection?: string;
  global?: string;
  id?: number | string;
  from: string;
  to: string;
  /** Off by default: fill only what is empty, destroy nothing. */
  overwrite?: boolean;
}

export interface LocaleCopyResult {
  /** Dotted paths that were actually written, for the confirmation message. */
  filled: string[];
  /** Localized paths that were left alone because the target already had text. */
  kept: string[];
}

/**
 * The shape of the thing we are walking.
 *
 * Payload's sanitized field tree is a list of `Field`s where only some carry a
 * `name`, and the ones that do not are pure presentation:
 *
 *     text | textarea | richText | ...   a named leaf; may be localized
 *     group                              a named object: { [name]: { ...fields } }
 *     array                              a named list of rows, each { id, ...fields }
 *     blocks                             a named list of rows, each { id, blockType, ...block.fields }
 *     tabs                               a list of tabs; a *named* tab nests like a group,
 *                                        an unnamed one is flat and its fields live on the parent
 *     row | collapsible                  layout only, always flat
 *     ui | join                          not data at all
 *
 * `localized` can sit on any named field, leaf or container. On a container it
 * makes the *entire subtree* per-locale — a localized array stores its rows
 * separately for Dutch and English — so the walk stops there and copies the
 * whole value. On a non-localized container the rows themselves are shared
 * between the locales and only the localized fields inside them differ, so the
 * walk continues and rows are matched up by their id.
 */
type FieldTree = Field[];

/** Values Payload writes for "nothing here", plus the shapes that mean it. */
function isEmptyValue(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") {
    // A Lexical document is never literally empty: an untouched editor still
    // serialises a root with one empty paragraph in it. Judge it by whether it
    // holds any text, not by whether it holds any nodes.
    if ("root" in (value as Record<string, unknown>)) {
      return !lexicalHasText((value as { root: unknown }).root);
    }
    // A group whose every leaf is empty counts as empty, so that copying into
    // a half-built group still fills it.
    return Object.entries(value as Record<string, unknown>).every(
      ([key, inner]) => key === "id" || isEmptyValue(inner),
    );
  }
  // Numbers, booleans and dates are shared rather than localized in this CMS,
  // but if one ever becomes localized, `0` and `false` are real values.
  return false;
}

/** Depth-first search for a non-blank `text` property anywhere in a Lexical node. */
function lexicalHasText(node: unknown): boolean {
  if (!node || typeof node !== "object") return false;
  const record = node as Record<string, unknown>;
  if (typeof record.text === "string" && record.text.trim() !== "") return true;
  const children = record.children;
  if (Array.isArray(children)) {
    return children.some((child) => lexicalHasText(child));
  }
  return false;
}

/** Fields that hold no data of their own and are never worth descending into. */
function isDataField(field: Field): boolean {
  return field.type !== "ui" && field.type !== "join";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asRows(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map(asRecord) : [];
}

/**
 * The patch builder.
 *
 * It returns a plain object shaped like the slice of the document it was given,
 * holding only what has to be written. Two rules keep it safe to hand straight
 * to `update`:
 *
 *   - a *leaf* appears in the patch only when it is actually being changed, so
 *     an untouched field is never mentioned and cannot be clobbered;
 *   - a *container* that contains any change is rebuilt whole, out of the
 *     target's own values with the copied leaves substituted in. That costs a
 *     few no-op writes of shared columns, and buys not having to know whether
 *     Payload merges a partial array or replaces it. It replaces it, and a
 *     patch built the other way would silently delete every row the copy did
 *     not happen to touch.
 */
function buildPatch(
  fields: FieldTree,
  source: Record<string, unknown>,
  target: Record<string, unknown>,
  overwrite: boolean,
  prefix: string,
  result: LocaleCopyResult,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};

  for (const field of fields) {
    if (!isDataField(field)) continue;

    // Layout wrappers hold no path of their own; their children sit on the
    // same object as their parent's do.
    if (field.type === "row" || field.type === "collapsible") {
      Object.assign(
        patch,
        buildPatch(field.fields, source, target, overwrite, prefix, result),
      );
      continue;
    }

    if (field.type === "tabs") {
      for (const tab of field.tabs) {
        if ("name" in tab && tab.name) {
          const path = `${prefix}${tab.name}`;
          const nested = buildPatch(
            tab.fields,
            asRecord(source[tab.name]),
            asRecord(target[tab.name]),
            overwrite,
            `${path}.`,
            result,
          );
          if (Object.keys(nested).length > 0) {
            patch[tab.name] = { ...asRecord(target[tab.name]), ...nested };
          }
        } else {
          Object.assign(
            patch,
            buildPatch(tab.fields, source, target, overwrite, prefix, result),
          );
        }
      }
      continue;
    }

    if (!("name" in field) || !field.name) continue;
    const name = field.name;
    const path = `${prefix}${name}`;

    // `id`, `createdAt` and `updatedAt` are Payload's own and are never copied;
    // neither is a password or anything else the auth strategy manages.
    if (name === "id" || name === "createdAt" || name === "updatedAt") continue;

    // A localized container is stored per locale in its entirety, so there is
    // nothing to descend into: the whole subtree is the value.
    if ("localized" in field && field.localized) {
      const incoming = source[name];
      const existing = target[name];
      if (isEmptyValue(incoming)) continue;
      if (!overwrite && !isEmptyValue(existing)) {
        result.kept.push(path);
        continue;
      }
      patch[name] = incoming;
      result.filled.push(path);
      continue;
    }

    if (field.type === "group") {
      const nested = buildPatch(
        field.fields,
        asRecord(source[name]),
        asRecord(target[name]),
        overwrite,
        `${path}.`,
        result,
      );
      if (Object.keys(nested).length > 0) {
        patch[name] = { ...asRecord(target[name]), ...nested };
      }
      continue;
    }

    if (field.type === "array" || field.type === "blocks") {
      const sourceRows = asRows(source[name]);
      const targetRows = asRows(target[name]);
      // The rows of a non-localized array are one shared set — the same rows,
      // with the same ids, seen from both locales — so pairing them by id is
      // exact rather than a guess. The index is only a fallback for a row that
      // has not been saved yet and therefore has no id.
      const byId = new Map(
        sourceRows
          .filter((row) => row.id !== undefined && row.id !== null)
          .map((row) => [String(row.id), row]),
      );

      let changed = false;
      const rows = targetRows.map((targetRow, index) => {
        const sourceRow =
          (targetRow.id !== undefined && targetRow.id !== null
            ? byId.get(String(targetRow.id))
            : undefined) ?? sourceRows[index];
        if (!sourceRow) return targetRow;

        const rowFields =
          field.type === "array"
            ? field.fields
            : (field.blocks.find(
                (block) => block.slug === targetRow.blockType,
              )?.fields ?? []);

        const nested = buildPatch(
          rowFields,
          sourceRow,
          targetRow,
          overwrite,
          `${path}[${index}].`,
          result,
        );
        if (Object.keys(nested).length === 0) return targetRow;
        changed = true;
        return { ...targetRow, ...nested };
      });

      if (changed) patch[name] = rows;
      continue;
    }

    // Anything left is a non-localized leaf: one shared column, already correct
    // in both locales by construction. Touching it would be pure risk.
  }

  return patch;
}

/** The stanza of validation that has to happen before anything is read. */
function resolveTarget(payload: Payload, args: LocaleCopyArgs) {
  const { collection, global } = args;
  if (collection && global) {
    throw new LocaleCopyError("Geef een collectie of een global, niet allebei.");
  }

  if (collection) {
    const config = payload.config.collections.find((c) => c.slug === collection);
    if (!config) throw new LocaleCopyError(`Onbekende collectie: ${collection}`);
    if (args.id === undefined || args.id === null || args.id === "") {
      throw new LocaleCopyError("Geen document opgegeven.");
    }
    return { kind: "collection" as const, config };
  }

  if (global) {
    const config = payload.config.globals.find((g) => g.slug === global);
    if (!config) throw new LocaleCopyError(`Onbekende instellingenpagina: ${global}`);
    return { kind: "global" as const, config };
  }

  throw new LocaleCopyError("Geen document opgegeven.");
}

/** Codes the config actually declares, so nothing else can reach the database. */
export function configuredLocales(payload: Payload): string[] {
  const localization = payload.config.localization;
  if (!localization) return [];
  return localization.locales.map((locale) => locale.code);
}

export async function copyLocale(args: LocaleCopyArgs): Promise<LocaleCopyResult> {
  const { payload, user, from, to, overwrite = false } = args;

  const locales = configuredLocales(payload);
  if (!locales.includes(from) || !locales.includes(to)) {
    throw new LocaleCopyError("Onbekende taal.");
  }
  if (from === to) {
    throw new LocaleCopyError("Bron- en doeltaal zijn hetzelfde.");
  }

  const target = resolveTarget(payload, args);
  const result: LocaleCopyResult = { filled: [], kept: [] };

  // `depth: 0` keeps every relationship and upload as a bare id. A populated
  // document would put whole media records into the patch, and Payload would
  // then try to write them back as if they were new documents.
  const read = async (locale: string) => {
    if (target.kind === "collection") {
      return (await payload.findByID({
        collection: target.config.slug as CollectionSlug,
        id: args.id as number | string,
        locale: asLocale(locale),
        fallbackLocale: false,
        depth: 0,
        user,
        overrideAccess: false,
      })) as unknown as Record<string, unknown>;
    }
    return (await payload.findGlobal({
      slug: target.config.slug as GlobalSlug,
      locale: asLocale(locale),
      fallbackLocale: false,
      depth: 0,
      user,
      overrideAccess: false,
    })) as unknown as Record<string, unknown>;
  };

  const [sourceDoc, targetDoc] = await Promise.all([read(from), read(to)]);

  const patch = buildPatch(
    target.config.fields,
    sourceDoc,
    targetDoc,
    overwrite,
    "",
    result,
  );

  if (Object.keys(patch).length === 0) return result;

  // Written as the logged-in user with access control on, so this endpoint can
  // never do more than the person pressing the button could do by hand.
  if (target.kind === "collection") {
    await payload.update({
      collection: target.config.slug as CollectionSlug,
      id: args.id as number | string,
      locale: asLocale(to),
      fallbackLocale: false,
      data: patch,
      depth: 0,
      user,
      overrideAccess: false,
    });
  } else {
    await payload.updateGlobal({
      slug: target.config.slug as GlobalSlug,
      locale: asLocale(to),
      fallbackLocale: false,
      data: patch,
      depth: 0,
      user,
      overrideAccess: false,
    });
  }

  return result;
}

/**
 * How much of a collection is still untranslated.
 *
 * The nav panel wants a number per collection rather than a list of documents,
 * and it wants it cheaply, so this reads at most `limit` documents per locale
 * and counts the ones where at least one localized field is filled in the
 * source and empty in the target. It is deliberately the same walk as the copy
 * above, run with `overwrite: false` and the write skipped — a count produced
 * by different code from the thing it counts would drift within a month.
 */
export interface MissingTranslations {
  slug: string;
  label: string;
  missing: number;
  scanned: boolean;
}

export async function countMissingTranslations(
  payload: Payload,
  user: TypedUser,
  from: string,
  to: string,
  // A hard ceiling rather than every document: this runs on every admin page
  // load, and a count that is "at least 200" is as useful to whoever has to do
  // the translating as an exact one.
  limit = 200,
): Promise<MissingTranslations[]> {
  const out: MissingTranslations[] = [];

  for (const collection of payload.config.collections) {
    // Only collections that hold translatable text are worth a line in the nav;
    // users, reservations and contact messages have none and would sit there at
    // zero forever.
    const hasLocalized = treeHasLocalized(collection.fields);
    if (!hasLocalized) continue;

    try {
      const [sourceDocs, targetDocs] = await Promise.all([
        payload.find({
          collection: collection.slug as CollectionSlug,
          locale: asLocale(from),
          fallbackLocale: false,
          depth: 0,
          limit,
          user,
          overrideAccess: false,
        }),
        payload.find({
          collection: collection.slug as CollectionSlug,
          locale: asLocale(to),
          fallbackLocale: false,
          depth: 0,
          limit,
          user,
          overrideAccess: false,
        }),
      ]);

      const targetById = new Map(
        targetDocs.docs.map((doc) => [
          String((doc as { id: unknown }).id),
          doc as unknown as Record<string, unknown>,
        ]),
      );

      let missing = 0;
      for (const doc of sourceDocs.docs) {
        const source = doc as unknown as Record<string, unknown>;
        const targetDoc = targetById.get(String(source.id));
        if (!targetDoc) continue;
        const probe: LocaleCopyResult = { filled: [], kept: [] };
        buildPatch(collection.fields, source, targetDoc, false, "", probe);
        if (probe.filled.length > 0) missing += 1;
      }

      out.push({
        slug: collection.slug,
        label:
          typeof collection.labels?.plural === "string"
            ? collection.labels.plural
            : collection.slug,
        missing,
        scanned: true,
      });
    } catch {
      // A collection this user may not read is simply not reported, rather
      // than turning the whole panel into an error.
      out.push({
        slug: collection.slug,
        label: collection.slug,
        missing: 0,
        scanned: false,
      });
    }
  }

  return out;
}

/** Whether anything anywhere under these fields is marked `localized`. */
function treeHasLocalized(fields: FieldTree): boolean {
  return fields.some((field) => {
    if (!isDataField(field)) return false;
    if ("localized" in field && field.localized) return true;
    if (field.type === "tabs") {
      return field.tabs.some((tab) => treeHasLocalized(tab.fields));
    }
    if ("fields" in field && Array.isArray(field.fields)) {
      return treeHasLocalized(field.fields);
    }
    if (field.type === "blocks") {
      return field.blocks.some((block) => treeHasLocalized(block.fields));
    }
    return false;
  });
}
