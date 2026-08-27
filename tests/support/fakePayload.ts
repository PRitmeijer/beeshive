/**
 * An in-memory stand-in for the Payload client, backed by plain arrays.
 *
 * It exists because of one line in src/lib/payload.ts:
 *
 *     export const getPayloadClient = () => getPayload({ config });
 *
 * and one line above it, `import config from "@payload-config"`. Merely
 * importing src/lib/capacity.ts, src/lib/schedule.ts or any of the three route
 * handlers evaluates that config — every collection, the Postgres adapter, the
 * S3 storage plugin, the Lexical editor and the mail transport — before a
 * single test has run. So the module is replaced wholesale by a `vi.mock`
 * factory, and this is what the factory hands back.
 *
 * The important decision here is that it *honours the where clauses these
 * modules really send* rather than returning everything it holds. Three of
 * them carry the behaviour being tested:
 *
 *   status: { not_equals: "geannuleerd" }   cancelled tables give their seats
 *                                           back — the single most important
 *                                           rule in src/lib/capacity.ts
 *   date:   { greater_than_equal, … }       the window a whole date picker is
 *                                           drawn from, in one query
 *   guestToken: { equals }                  the guest pass's only lookup, and
 *                                           the reason it is not walkable
 *
 * A fake that ignored those would make the tests about them pass while
 * asserting nothing, which is worse than not writing them.
 *
 * Every call is also recorded, because several of the promises this codebase
 * makes are promises about the query rather than about the answer: capacity.ts
 * says one query for a whole window, guestHistory.ts says one query for a
 * whole screenful, guestPass.ts says limit 1 and never a lookup by id. Those
 * are assertions about `fake.calls.find`, and they are only writable if
 * somebody keeps the record.
 */

/** A stored row. Deliberately loose: these stand in for CMS documents. */
export type Row = Record<string, any>;

export type FakeMethod = "find" | "create" | "update" | "findGlobal";

export interface FakePayloadOptions {
  reservations?: Row[];
  /** Rows of the `opening-exceptions` collection. */
  exceptions?: Row[];
  /** Globals by slug; only `site-settings` is ever asked for. */
  globals?: Record<string, Row>;
  /**
   * Which methods should reject instead of answering. Three modules have a
   * deliberate and *different* policy about a database that will not answer —
   * capacity.ts counts nothing and lets the booking through, schedule.ts
   * serves the plain week, guestHistory.ts lets the error out rather than
   * telling a regular of four years that this is their first visit — and each
   * of those needs a test that makes the read fail.
   */
  throwOn?: FakeMethod[];
}

export interface FindCall {
  collection: string;
  where?: Row;
  limit?: number;
  sort?: string;
  depth?: number;
  pagination?: boolean;
  overrideAccess?: boolean;
  select?: Row;
  locale?: string;
}

export interface CreateCall {
  collection: string;
  data: Row;
  context?: Row;
}

export interface UpdateCall {
  collection: string;
  id: string | number;
  data: Row;
  context?: Row;
  overrideAccess?: boolean;
  depth?: number;
}

export interface FakePayload {
  find(args: Row): Promise<{ docs: Row[]; totalDocs: number }>;
  create(args: Row): Promise<Row>;
  update(args: Row): Promise<Row>;
  findGlobal(args: Row): Promise<Row>;
  /** Everything that was asked, in the order it was asked. */
  calls: {
    find: FindCall[];
    create: CreateCall[];
    update: UpdateCall[];
    findGlobal: Row[];
  };
  /** The live array behind one collection, for seeding and for asserting. */
  rows(collection: string): Row[];
}

/** The operators these modules actually send. Anything else is a mistake. */
const OPERATORS = [
  "equals",
  "not_equals",
  "greater_than",
  "greater_than_equal",
  "less_than",
  "less_than_equal",
  "in",
  "like",
] as const;

function compare(value: unknown, operator: string, wanted: unknown): boolean {
  switch (operator) {
    case "equals":
      return String(value ?? "") === String(wanted ?? "");
    case "not_equals":
      return String(value ?? "") !== String(wanted ?? "");
    // The date bounds are ISO strings on both sides, and a string comparison
    // over ISO-8601 is the same ordering Postgres gives a timestamp, which is
    // the whole reason the code stores them that way.
    case "greater_than":
      return String(value ?? "") > String(wanted);
    case "greater_than_equal":
      return String(value ?? "") >= String(wanted);
    case "less_than":
      return String(value ?? "") < String(wanted);
    case "less_than_equal":
      return String(value ?? "") <= String(wanted);
    case "in":
      return (Array.isArray(wanted) ? wanted : []).some(
        (w) => String(w) === String(value ?? ""),
      );
    case "like":
      return String(value ?? "").includes(String(wanted));
    default:
      throw new Error(`fakePayload does not implement the "${operator}" operator`);
  }
}

function matches(row: Row, where: Row | undefined): boolean {
  if (!where) return true;
  return Object.entries(where).every(([key, clause]) => {
    if (key === "and") {
      return (clause as Row[]).every((sub) => matches(row, sub));
    }
    if (key === "or") {
      return (clause as Row[]).some((sub) => matches(row, sub));
    }
    return Object.entries(clause as Row).every(([operator, wanted]) => {
      if (!(OPERATORS as readonly string[]).includes(operator)) {
        throw new Error(`fakePayload does not implement the "${operator}" operator`);
      }
      return compare(row[key], operator, wanted);
    });
  });
}

function sortRows(rows: Row[], sort: string | undefined): Row[] {
  if (!sort) return rows;
  const descending = sort.startsWith("-");
  const field = descending ? sort.slice(1) : sort;
  return [...rows].sort((a, b) => {
    const left = String(a[field] ?? "");
    const right = String(b[field] ?? "");
    if (left === right) return 0;
    return (left < right ? -1 : 1) * (descending ? -1 : 1);
  });
}

/**
 * A token of exactly the shape src/lib/guestToken.ts mints and
 * src/lib/guestPass.ts insists on, but countable rather than random, so a test
 * can say which one it means. Twenty-two base64url characters, no padding.
 */
const fakeToken = (n: number) => `tok${String(n).padStart(19, "0")}`;

export function makeFakePayload(options: FakePayloadOptions = {}): FakePayload {
  const collections: Record<string, Row[]> = {
    reservations: [...(options.reservations ?? [])],
    "opening-exceptions": [...(options.exceptions ?? [])],
  };
  const globals: Record<string, Row> = { ...(options.globals ?? {}) };
  const throwOn = new Set(options.throwOn ?? []);

  const calls: FakePayload["calls"] = {
    find: [],
    create: [],
    update: [],
    findGlobal: [],
  };

  let nextId = 1000;
  for (const rows of Object.values(collections)) {
    for (const row of rows) {
      if (typeof row.id === "number" && row.id >= nextId) nextId = row.id + 1;
    }
  }

  const rowsOf = (collection: string): Row[] => {
    if (!collections[collection]) collections[collection] = [];
    return collections[collection];
  };

  const refuse = (method: FakeMethod) => {
    if (throwOn.has(method)) {
      throw new Error(`fakePayload: ${method} was asked to fail`);
    }
  };

  return {
    rows: rowsOf,
    calls,

    async find(args: Row) {
      calls.find.push(args as FindCall);
      refuse("find");
      const all = rowsOf(String(args.collection)).filter((row) =>
        matches(row, args.where as Row | undefined),
      );
      const sorted = sortRows(all, args.sort as string | undefined);
      // `pagination: false` means "all of them"; a limit is still a limit,
      // which is how MAX_ROWS in guestHistory.ts and limit 1 in guestPass.ts
      // both behave against the real thing.
      const limited =
        typeof args.limit === "number" && args.limit > 0
          ? sorted.slice(0, args.limit)
          : sorted;
      return { docs: limited.map((row) => ({ ...row })), totalDocs: all.length };
    },

    async create(args: Row) {
      calls.create.push(args as CreateCall);
      refuse("create");
      const now = new Date().toISOString();
      const row: Row = {
        id: nextId,
        // Minted by the collection's own beforeChange hook against the real
        // thing, never by the caller — which is why /api/reserve reads the
        // token back off the created document instead of inventing one.
        guestToken: fakeToken(nextId),
        createdAt: now,
        updatedAt: now,
        ...(args.data as Row),
      };
      nextId += 1;
      rowsOf(String(args.collection)).push(row);
      return { ...row };
    },

    async update(args: Row) {
      calls.update.push(args as UpdateCall);
      refuse("update");
      const rows = rowsOf(String(args.collection));
      const index = rows.findIndex((row) => String(row.id) === String(args.id));
      if (index === -1) throw new Error(`fakePayload: no row ${String(args.id)}`);
      const data = { ...(args.data as Row) };
      // Payload gives every array row an id on the way in, and the guest pass
      // endpoint reads those ids back off the answer to derive the edit key.
      if (Array.isArray(data.guestResponses)) {
        data.guestResponses = data.guestResponses.map((row: Row, i: number) => ({
          ...row,
          id: row.id ?? `row-${String(i)}`,
        }));
      }
      rows[index] = { ...rows[index], ...data, updatedAt: new Date().toISOString() };
      return { ...rows[index] };
    },

    async findGlobal(args: Row) {
      calls.findGlobal.push(args);
      refuse("findGlobal");
      return { ...(globals[String(args.slug)] ?? {}) };
    },
  };
}
