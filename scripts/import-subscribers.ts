/**
 * Import the old site's newsletter subscribers into the mailing list.
 *
 * The previous site kept them in a MySQL table called `subscriptions` on
 * IONOS shared hosting. That database is only reachable from inside IONOS's
 * own network — `database-*.webspace-host.com` does not resolve anywhere else
 * — so there is no way to read it directly from here. Export it to CSV from
 * phpMyAdmin in the IONOS control panel instead, and feed the file to this:
 *
 *   npx tsx scripts/import-subscribers.ts subscriptions.csv
 *   npx tsx scripts/import-subscribers.ts subscriptions.csv --dry-run
 *
 * Start with --dry-run. It reads the file, reports exactly what it would do,
 * and writes nothing.
 *
 * The CSV needs a header row with an `email` column. Anything called `name`,
 * `subscribed_at`, `created_at` or `date` is used if present; every other
 * column is ignored, so a plain "export the whole table" dump is fine.
 *
 * Running it twice is safe: an address already on the list is left exactly as
 * it is rather than duplicated or overwritten.
 */
import { readFileSync } from "fs";
import { getPayload } from "payload";
import config from "@payload-config";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const path = args.find((a) => !a.startsWith("--"));

if (!path) {
  console.error(
    "usage: npx tsx scripts/import-subscribers.ts <export.csv> [--dry-run]",
  );
  process.exit(1);
}

/**
 * A CSV reader that handles quoted fields and embedded commas, newlines and
 * doubled quotes. Small, but the alternative is a split(",") that mangles any
 * row with a comma in it, which is precisely the row you would not notice.
 */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  // Strip a UTF-8 BOM: phpMyAdmin can prepend one, and it would otherwise
  // become part of the first header name.
  const src = text.replace(/^﻿/, "");

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      // A trailing newline should not produce a row of one empty string.
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  row.push(field);
  if (row.length > 1 || row[0] !== "") rows.push(row);
  return rows;
}

/** Whatever the old table called it, as long as it is recognisable. */
function pick(headers: string[], names: string[]): number {
  return headers.findIndex((h) => names.includes(h.trim().toLowerCase()));
}

async function main() {
  const rows = parseCsv(readFileSync(path!, "utf-8"));
  if (rows.length < 2) {
    console.error("Nothing to import: the file has no rows under its header.");
    process.exit(1);
  }

  const headers = rows[0];
  const iEmail = pick(headers, ["email", "e-mail", "emailadres", "mail"]);
  const iName = pick(headers, ["name", "naam"]);
  const iDate = pick(headers, [
    "subscribed_at",
    "subscribedat",
    "created_at",
    "createdat",
    "date",
    "datum",
  ]);

  if (iEmail === -1) {
    console.error(
      `No email column found. Headers were: ${headers.join(", ")}`,
    );
    process.exit(1);
  }

  const payload = await getPayload({ config });

  let added = 0;
  let already = 0;
  let skipped = 0;

  // De-duplicate within the file itself before touching the database: the old
  // table has no unique index on email, so the same address may appear twice.
  const seen = new Set<string>();

  for (const row of rows.slice(1)) {
    const email = (row[iEmail] || "").trim().toLowerCase();
    if (!email || !EMAIL.test(email)) {
      if (email) console.warn(`  skipped, not an address: ${email}`);
      skipped++;
      continue;
    }
    if (seen.has(email)) {
      skipped++;
      continue;
    }
    seen.add(email);

    const existing = await payload.find({
      collection: "mailing-list",
      where: { email: { equals: email } },
      limit: 1,
    });
    if (existing.docs.length > 0) {
      already++;
      continue;
    }

    const name = iName === -1 ? "" : (row[iName] || "").trim();
    const rawDate = iDate === -1 ? "" : (row[iDate] || "").trim();
    const parsed = rawDate ? new Date(rawDate.replace(" ", "T")) : null;
    const subscribedAt =
      parsed && !Number.isNaN(parsed.getTime())
        ? parsed.toISOString()
        : new Date().toISOString();

    if (dryRun) {
      console.log(`  would add ${email}${name ? ` (${name})` : ""}`);
    } else {
      await payload.create({
        collection: "mailing-list",
        data: {
          email,
          name: name || undefined,
          subscribedAt,
          active: true,
          notes: "Overgenomen van de vorige website",
        },
      });
    }
    added++;
  }

  console.log(
    `\n${dryRun ? "[dry run] " : ""}${added} ${dryRun ? "to add" : "added"}, ` +
      `${already} already on the list, ${skipped} skipped.`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
