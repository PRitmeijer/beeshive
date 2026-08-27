import { buildConfig } from "payload";
import type { CollectionSlug, Field } from "payload";
import { postgresAdapter } from "@payloadcms/db-postgres";
import { s3Storage } from "@payloadcms/storage-s3";
import { seoPlugin } from "@payloadcms/plugin-seo";
import { nodemailerAdapter } from "@payloadcms/email-nodemailer";
import { lexicalEditor } from "@payloadcms/richtext-lexical";
import sharp from "sharp";
import path from "path";
import { fileURLToPath } from "url";
import { connect } from "node:net";

import { Users } from "./collections/Users";
import { Media } from "./collections/Media";
import { BlogPosts } from "./collections/BlogPosts";
import { Events } from "./collections/Events";
import { GalleryImages } from "./collections/GalleryImages";
import { GalleryCategories } from "./collections/GalleryCategories";
import { MenuItems } from "./collections/MenuItems";
import { MenuCategories } from "./collections/MenuCategories";
import { Notifications } from "./collections/Notifications";
import { MailingList } from "./collections/MailingList";
import { Reservations } from "./collections/Reservations";
import { ContactMessages } from "./collections/ContactMessages";
import { OpeningExceptions } from "./collections/OpeningExceptions";
import { SiteSettings } from "./globals/SiteSettings";
import { migrations } from "./migrations";

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);

/**
 * `next build` runs with NODE_ENV=production, so every "are we in production"
 * check in this file has to exclude it or the build inherits behaviour meant
 * for a running server. It does not need a signing key, and it must not touch
 * the schema: the pages read the CMS while they prerender, so anything Payload
 * does on connect happens inside a static worker with no terminal attached.
 */
const isBuild = process.env.NEXT_PHASE === "phase-production-build";
const isProduction = process.env.NODE_ENV === "production" && !isBuild;

/**
 * Admin sessions are signed with this. A committed fallback would let anyone
 * who can read the repository forge one, so production has to fail loudly
 * instead of booting insecurely. Local development keeps a fixed throwaway so
 * nobody has to configure anything to run the site.
 */
function payloadSecret() {
  const fromEnv = process.env.PAYLOAD_SECRET;
  if (fromEnv) return fromEnv;
  if (isProduction) {
    throw new Error(
      "PAYLOAD_SECRET is niet gezet. Zet die environment-variabele voordat je deployt.",
    );
  }
  return "dev-only-insecure-secret";
}

/**
 * Cloudflare R2 is optional, and deliberately so.
 *
 * With the four variables set, uploads go to the bucket and the container
 * keeps no files of its own; without them the site writes to
 * `MEDIA_DIR`/`./media` exactly as it always has. That is what lets someone
 * clone the repository, run `npm run dev` and upload a photograph without an
 * account at Cloudflare, and it is why this check is a function of the
 * environment rather than of NODE_ENV: a staging container without a bucket
 * should degrade to disk rather than fail every upload.
 *
 * Media.ts has to know the same answer — a collection that keeps
 * `disableLocalStorage` off while the bucket is on would have Payload look for
 * files on a disk that no longer holds them. It repeats these two lines rather
 * than importing them, because this file already imports Media and the cycle
 * would resolve to `undefined` at exactly the wrong moment.
 */
/** Trailing slash trimmed once here so the joins below cannot double it. */
const r2PublicUrl = process.env.R2_PUBLIC_URL?.replace(/\/$/, "");

export function isR2Configured(): boolean {
  return Boolean(
    process.env.R2_BUCKET &&
      process.env.R2_ENDPOINT &&
      process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY,
  );
}

/**
 * Outgoing mail.
 *
 * Configured only when SMTP_HOST is set. Left unset, Payload keeps its own
 * default, which writes every message to the console — which is what you want
 * on a laptop, and is why /api/reserve treats a failed send as a warning
 * rather than as a failed booking.
 *
 * SMTP_SECURE is inferred from the port unless it is given: 465 is implicit
 * TLS, 587 upgrades with STARTTLS.
 */
function emailAdapter() {
  const host = process.env.SMTP_HOST;
  if (!host) return undefined;

  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  return nodemailerAdapter({
    defaultFromName: process.env.EMAIL_FROM_NAME || "De Bee's Hive",
    defaultFromAddress: process.env.EMAIL_FROM || "no-reply@debeeshive.nl",
    transportOptions: {
      host,
      port,
      secure: process.env.SMTP_SECURE
        ? process.env.SMTP_SECURE === "true"
        : port === 465,
      ...(user ? { auth: { user, pass } } : {}),
    },
  });
}

/**
 * Where a document of each SEO-managed collection lives on the public site.
 *
 * The generated canonical URL is only ever as right as this map, so it is the
 * one place to change when a route is renamed. Note that the Dutch site keeps
 * the bare path and English lives under /en (see src/i18n/config.ts), which is
 * why the locale the editor is currently in is folded into the URL below.
 */
const publicPathByCollection: Record<string, string> = {
  "blog-posts": "blog",
  // Matches the hint on the Events collection's slug field: "het deel van de
  // URL na /evenementen/". If that page is ever moved, both have to move.
  events: "evenementen",
};

/**
 * The SEO plugin's "generate" buttons.
 *
 * They fill the fields once, from the document in front of the editor; the
 * owners can then overwrite anything. Everything here is therefore a starting
 * suggestion in plain Dutch rather than a rule — the titles are written to sit
 * under Google's ~60 character cut-off with the site name still attached, and
 * the descriptions are trimmed to something close to 160.
 */
const titleSuffix = " | De Bee's Hive";

function trimTo(value: string, max: number) {
  const clean = value.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  // Cut on a word boundary rather than mid-word: a description ending in
  // "seizoensgroe…" reads like a bug to the owners, who will then retype it.
  return `${clean.slice(0, max - 1).replace(/\s\S*$/, "")}…`;
}

/**
 * The SEO plugin's own fields, in Dutch, and with one of them un-localised.
 *
 * Two things about what the plugin ships are wrong for this site.
 *
 * The first is the language. Everything else in this admin is written for two
 * people who run a restaurant, in their language; "Meta Image / Maximum upload
 * file size: 12MB" is neither. The labels and descriptions below say the same
 * things in Dutch, and say them in terms of what the owners will actually see:
 * the line under a link when somebody shares the page.
 *
 * The second is `meta.image`, and it is the more important of the two. The
 * plugin declares it `localized: true` — see MetaImageField in
 * node_modules/@payloadcms/plugin-seo — which is defensible for a title and a
 * description, and simply wrong for an upload. A localised field stores one
 * value per language, so choosing a photograph means choosing it on the Dutch
 * tab, saving, switching to English, choosing the same photograph again and
 * saving again. That is the complaint that started this: "I add media, need to
 * save it, then go to english tab, click it again, and save it again." A share
 * image is a photograph, not a sentence; one serves both languages.
 *
 * Doing this costs nothing right now and would cost a data migration later.
 * Un-localising a field moves its values from a `_locales` side table into a
 * column on the parent, and Drizzle will drop the side-table column it can no
 * longer account for — so on a database that already holds SEO images, the
 * Dutch values have to be copied across first. This repository has not
 * generated its initial PostgreSQL migration yet, and the production content
 * arrives through scripts/import-content.ts rather than through the old
 * schema, so at this exact moment there is nothing to migrate. Anyone changing
 * this again after the first migration ships does owe that copy step.
 */
/*
 * Payload 3.88 split the old single `UploadField` into a polymorphic member
 * (`relationTo` is a list of collections) and a single member (`relationTo` is
 * one collection), and the two disagree about the type of `admin.sortOptions`.
 * Payload exports the equivalent pair for relationship fields by name but not
 * this one, so the two halves are recovered from the `Field` union here.
 */
type UploadFieldMember = Extract<Field, { type: "upload" }>;
type PolymorphicUploadFieldMember = Extract<
  UploadFieldMember,
  { relationTo: readonly unknown[] }
>;

const isPolymorphicUpload = (
  field: UploadFieldMember,
): field is PolymorphicUploadFieldMember => Array.isArray(field.relationTo);

function dutchify(field: Field): Field {
  // Narrowed on `type` rather than on `name` alone. `Field` is a discriminated
  // union, and spreading a value still typed as the whole union loses the
  // discriminant — TypeScript then has to prove the rebuilt `admin` object is
  // valid for an array field and a blocks field too, which it is not. Matching
  // the type first collapses the union to one member and the spread is exact.
  //
  // For `upload` that is no longer the whole story. Payload 3.88 split the old
  // single `UploadField` in two, so `type === "upload"` narrows to two members
  // rather than one, and they disagree about `admin.sortOptions`: keyed by
  // collection when `relationTo` is a list, a bare string when it is one slug.
  // Spreading `field.admin` across that union widens `sortOptions` to the union
  // of both, which fits neither member, so the upload branch below narrows a
  // second time through `isPolymorphicUpload`.
  if (field.type === "text" && field.name === "title") {
    return {
      ...field,
      label: "Titel in Google",
      admin: {
        ...field.admin,
        description:
          "De blauwe regel in de zoekresultaten. Rond de 60 tekens; langer wordt afgekapt. Laat leeg om de titel van de pagina zelf te gebruiken.",
      },
    };
  }

  if (field.type === "textarea" && field.name === "description") {
    return {
      ...field,
      label: "Omschrijving in Google",
      admin: {
        ...field.admin,
        description:
          "De twee regels onder de titel, in Google en in een gedeelde link. Rond de 160 tekens.",
      },
    };
  }

  if (field.type === "upload" && field.name === "image") {
    const label = "Afbeelding bij delen";
    const description =
      "De foto die verschijnt als iemand deze pagina deelt op WhatsApp, Facebook of LinkedIn. Eén foto voor beide talen. Je hoeft hem niet apart in het Engels te kiezen. Liefst liggend; hij wordt automatisch bijgesneden naar 1200 bij 630 pixels.";

    // The two arms are identical apart from which member of the upload union
    // `field` is known to be inside them, and that knowledge is what makes
    // `...field.admin` a spread of one concrete shape instead of two. The
    // narrowing has to go through `isPolymorphicUpload` rather than a bare
    // `Array.isArray(field.relationTo)`: narrowing a whole object by a check
    // on one of its properties only works when that property is a literal
    // discriminant, and `CollectionSlug[]` is not one, so the inline form
    // narrows `relationTo` alone and leaves `field.admin` the union it was.
    //
    // plugin-seo declares this field with a single `relationTo`, so only the
    // second arm runs today. It is written out anyway instead of asserting the
    // result, because an assertion would go on compiling if that ever changed.
    return isPolymorphicUpload(field)
      ? {
          ...field,
          label,
          // The whole point of this override; see the note above.
          localized: false,
          admin: { ...field.admin, description },
        }
      : {
          ...field,
          label,
          // The whole point of this override; see the note above.
          localized: false,
          admin: { ...field.admin, description },
        };
  }

  return field;
}

/**
 * The one place the connection string is decided, so both guards below agree.
 *
 * The fallback is a convenience for `npm run dev` on a laptop, where the
 * compose file publishes Postgres on 5433 and nobody should need a .env to get
 * going. It is deliberately NOT applied during `next build`: inside the Docker
 * builder there is no database on localhost, and reaching for one there costs a
 * minute of connection attempts before the build dies naming a port the
 * operator never configured. A build with no DATABASE_URI is a build that was
 * meant to run without a database, and it says so below rather than guessing.
 */
const databaseURI = isBuild
  ? process.env.DATABASE_URI || ""
  : process.env.DATABASE_URI ||
    "postgresql://beeshive:beeshive@localhost:5433/beeshive";

/**
 * Whether that URI names a database on this machine.
 *
 * Only used to decide whether the dev-time schema push is allowed to run. The
 * test is deliberately conservative — anything it cannot recognise counts as
 * remote — because the cost of the two mistakes is not symmetric. A false
 * "remote" means a developer sees a warning and adds one variable; a false
 * "local" means drizzle quietly alters a production table.
 */
function looksLikeALocalDatabase(uri: string): boolean {
  try {
    const host = new URL(uri).hostname.toLowerCase();
    return (
      host === "" ||
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "::1" ||
      host === "[::1]" ||
      host === "host.docker.internal" ||
      host.endsWith(".localhost")
    );
  } catch {
    return false;
  }
}

/**
 * The dev push, and why it is not simply `!isProduction`.
 *
 * `npm run dev` against the production database is what puts the `dev` row in
 * `payload_migrations` in the first place, and that row is the whole of the
 * fault ops/preflight.mjs exists to stop: it makes the production container
 * halt on a prompt no container can answer, after which the site serves the
 * pages built into its image forever and looks healthy doing it. The push is
 * also free to ALTER or DROP a column on its own judgement while it is there.
 *
 * So the push is allowed against a database on this machine and refused
 * against anything else. Ordinary local development is untouched — the default
 * above and every `localhost` URI pass — and the refusal is a warning plus a
 * named way through rather than a wall, because the developer who genuinely
 * has a database on another host is not the person this is protecting.
 */
function devPushAllowed(): boolean {
  if (looksLikeALocalDatabase(databaseURI)) return true;

  const host = (() => {
    try {
      return new URL(databaseURI).host;
    } catch {
      return "(unparseable DATABASE_URI)";
    }
  })();

  if (process.env.ALLOW_REMOTE_SCHEMA_PUSH === "true") {
    console.warn(
      `\n  payload: schema push ENABLED against ${host} by ALLOW_REMOTE_SCHEMA_PUSH.\n` +
        `  Drizzle may alter or drop columns there without asking, and this run\n` +
        `  will leave a 'dev' row in payload_migrations that stops a production\n` +
        `  container dead. See README.md, "The \`dev\` row".\n`,
    );
    return true;
  }

  console.warn(
    `\n  payload: schema push REFUSED. DATABASE_URI points at ${host}, which is\n` +
      `  not a database on this machine.\n\n` +
      `  The push rewrites the schema from the collections and answers to nobody\n` +
      `  about how — and it leaves a 'dev' row in payload_migrations that makes a\n` +
      `  production container halt on a prompt nothing can answer, serving the\n` +
      `  pages baked into its image while compose calls it healthy.\n\n` +
      `  Collection changes will not reach that database this run. Point\n` +
      `  DATABASE_URI at a local copy, or write a migration and run\n` +
      `  \`npm run migrate\`. If you really do mean to push there, set\n` +
      `  ALLOW_REMOTE_SCHEMA_PUSH=true.\n`,
  );
  return false;
}

/**
 * The second belt against the prompt that stops a deployment dead.
 *
 * `prodMigrations` is applied on connect, and @payloadcms/drizzle's `migrate`
 * opens with an interactive `prompts()` question whenever it finds a row in
 * `payload_migrations` with batch -1 — the marker left by any run that pushed
 * the schema. In a container nothing answers it: the promise never settles,
 * `getPayload()` never resolves, and the server sits there serving prerendered
 * HTML and taking no bookings. ops/preflight.mjs is the first belt and refuses
 * to start the container at all; this is what catches the run that skipped it
 * — PREFLIGHT=off, a bare `node server.js`, `npm start` on a laptop.
 *
 * There is no supported flag for this. `migrate` in payload 3.88.0 takes
 * `{ migrations }` and nothing else (payload/dist/database/types.d.ts) and
 * reads no environment variable; `forceAcceptWarning` exists, but only on
 * `migrateFresh` and `createMigration`, neither of which is on this path. So
 * the adapter's own `migrate` is wrapped instead.
 *
 * It only intervenes when there is no terminal, which is exactly the condition
 * that makes the prompt fatal. Run `npm run migrate` in a real shell and
 * Payload asks its question as it always has and you answer it; run anything
 * without a TTY and this refuses first, loudly, in one line.
 */
/**
 * Let `next build` finish when there is no database to prerender against.
 *
 * The adapter's own `connect` ends its failure path by giving up on the whole
 * process (node_modules/@payloadcms/db-postgres/dist/connect.js). That is right
 * for a server — a site that cannot reach its database should not pretend to be
 * up — but during a build it takes the static worker down with it, and it does
 * so before any page code runs. Every frontend page wraps its CMS read in a
 * try/catch so that an unreachable CMS costs placeholder copy rather than a
 * failed build; none of that can help, because the failure happens while the
 * adapter is still connecting, upstream of every catch.
 *
 * Payload 3.88 changed how that giving-up is spelled — `connect` now throws
 * `Error: cannot connect to Postgres: …` where it used to call
 * `process.exit(1)` — which changes what an operator sees in the log but not
 * the reason this wrapper exists. A throw out of `connect` fails the build just
 * as fatally, and just as far above the page-level try/catch.
 *
 * Which made `docker compose build` fail on a clean machine, since the builder
 * is not on the network the `postgres` service lives on and there is nothing on
 * localhost either.
 *
 * So during the build phase only, the connection is probed first, and if
 * nothing answers the adapter is stood up without one: schema assembled, pool
 * constructed but never dialled, drizzle bound to it, initialisation resolved.
 * Queries then fail one by one where the pages already expect them to, and the
 * build produces the fallback content it was always designed to fall back to.
 *
 * The cost is stated out loud in the warning, because it is real and somebody
 * will otherwise wonder why the site went live advertising the wrong opening
 * hours: the HTML in the image is built from src/lib/payload.ts's defaults, and
 * stays that way until ops/warm-up.sh walks the URLs after start. Point
 * BUILD_DATABASE_URI at a reachable database and none of this happens.
 *
 * Runtime is untouched. `isBuild` is false there, this wrapper returns the
 * adapter unchanged, and a dead database is as loud as it ever was.
 */
function surviveABuildWithoutADatabase(
  adapterObj: ReturnType<typeof postgresAdapter>,
): ReturnType<typeof postgresAdapter> {
  if (!isBuild) return adapterObj;

  return {
    ...adapterObj,
    init: (args) => {
      const adapter = adapterObj.init(args);
      const connect = adapter.connect?.bind(adapter);

      adapter.connect = async (options) => {
        if (databaseURI && (await databaseAnswers(databaseURI))) {
          return connect?.(options);
        }

        console.warn(
          `\n  payload: building without a database.\n\n` +
            `  ${
              databaseURI
                ? `Nothing answered at ${safeHost(databaseURI)}.`
                : "No DATABASE_URI was given to the build."
            }\n` +
            `  The pages that read the CMS will be prerendered from the fallback\n` +
            `  copy in src/lib/payload.ts, so the image ships stock opening hours\n` +
            `  and stock menu text until something asks for those URLs again.\n` +
            `  ops/warm-up.sh does that on start; see DEPLOY.md.\n\n` +
            `  To prerender the real thing instead, build with BUILD_DATABASE_URI\n` +
            `  pointing at a database this builder can reach.\n`,
        );

        // Release whatever is waiting on initialisation. No pool and no drizzle
        // client: there is nothing to point them at, and leaving them unset is
        // what makes the first query throw somewhere a page can catch it rather
        // than hang. Extensions, push and migrations are all skipped simply by
        // never calling the real connect.
        //
        // The `schema` assignment is belt and braces as of Payload 3.88 rather
        // than the substitute it once was. The adapter used to assemble that
        // field at the top of `connect`, which this replaces and so had to redo;
        // it now assembles it in `init` (@payloadcms/drizzle/dist/postgres/init.js),
        // and Payload awaits `db.init()` before `db.connect()`, so by this point
        // the field is already correct and this writes the same object again.
        // Left in place deliberately: it is cheap, it keeps this branch honest
        // if that assembly ever moves back, and removing it would make the
        // no-database build depend on ordering it does not control.
        const self = adapter as unknown as Record<string, unknown>;
        self.schema = {
          pgSchema: self.pgSchema,
          ...(self.tables as object),
          ...(self.relations as object),
          ...(self.enums as object),
        };
        (self.resolveInitializing as (() => void) | undefined)?.();
      };

      return adapter;
    },
  };
}

/** The host in a connection string, or the string itself if it will not parse. */
function safeHost(uri: string): string {
  try {
    const { hostname, port } = new URL(uri);
    return port ? `${hostname}:${port}` : hostname;
  } catch {
    return uri;
  }
}

/**
 * Whether anything is listening on the other end, answered quickly.
 *
 * A bare TCP connect rather than a Postgres handshake, because the only
 * question being asked is "is there a server here at all" and this runs on the
 * build's critical path. Two seconds: a real database accepts a socket in
 * milliseconds, and one that is not there costs the full timeout exactly once.
 *
 * A server that accepts the socket and then refuses to authenticate is treated
 * as present, and the real connect is called, and it fails the way it always
 * did. That is deliberate: bad credentials are a mistake worth stopping for,
 * while no database at all is the case this whole wrapper exists to survive.
 */
function databaseAnswers(uri: string): Promise<boolean> {
  let host: string;
  let port: number;
  try {
    const parsed = new URL(uri);
    host = parsed.hostname;
    port = Number(parsed.port || 5432);
  } catch {
    return Promise.resolve(false);
  }
  if (!host) return Promise.resolve(false);

  return new Promise((resolve) => {
    const socket = connect({ host, port });
    const settle = (answer: boolean) => {
      socket.destroy();
      resolve(answer);
    };
    socket.setTimeout(2000);
    socket.once("connect", () => settle(true));
    socket.once("timeout", () => settle(false));
    socket.once("error", () => settle(false));
  });
}

function refuseToPromptWithoutATerminal(
  adapterObj: ReturnType<typeof postgresAdapter>,
): ReturnType<typeof postgresAdapter> {
  return {
    ...adapterObj,
    init: (args) => {
      const adapter = adapterObj.init(args);
      const migrate = adapter.migrate.bind(adapter);

      adapter.migrate = async (migrateArgs) => {
        if (!process.stdin.isTTY && adapter.pool) {
          // Two statements, because Postgres parses a whole statement before it
          // runs any of it: naming payload_migrations inside a CASE fails just
          // as hard on a fresh database as naming it on its own.
          const { rows: table } = await adapter.pool.query(
            "select to_regclass('payload_migrations') is not null as present",
          );
          if (table[0]?.present) {
            const { rows: markers } = await adapter.pool.query(
              "select name from payload_migrations where batch = -1",
            );
            if (markers.length > 0) {
              // Keyed on the batch rather than the name, because that is what
              // @payloadcms/drizzle keys on.
              console.error(
                `\n  payload: deze database draagt een dev-push-markering ` +
                  `(payload_migrations, batch -1).\n\n` +
                  `  Payload zou hier op een vraag op de terminal blijven staan, en er is\n` +
                  `  geen terminal. De site zou dan draaien zonder de CMS ooit te bereiken:\n` +
                  `  elke pagina 200, geen enkele boeking. Daarom stopt dit proces nu.\n\n` +
                  `  Draai node ops/preflight.mjs voor de volledige uitleg en de twee\n` +
                  `  uitwegen, of zie DEPLOY.md.\n`,
              );
              // Exiting rather than throwing, deliberately. As of Payload 3.88
              // the adapter throws on an unreachable database where it used to
              // exit, so this is no longer an echo of what it does; a throw
              // from here would surface as a migration error and could be
              // caught and logged on the way past. Under compose the exit is a
              // restart, with the reason in the log, rather than a container
              // that is up and useless.
              process.exit(1);
            }
          }
        }

        return migrate(migrateArgs);
      };

      return adapter;
    },
  };
}

export default buildConfig({
  admin: {
    user: Users.slug,
    meta: {
      titleSuffix,
    },
    /**
     * The agenda at /admin/agenda.
     *
     * Reserveringen, evenementen and afwijkende dagen are three collections
     * and were three lists; the question the owners actually ask — "wat
     * gebeurt er donderdag" — needs all three at once, so there is one page
     * that puts them on a calendar. src/components/admin/AgendaView.tsx has
     * the details, including the two things about Payload 3.88 that make it
     * look more elaborate than it is: a custom view has to render the admin
     * chrome itself, and Payload does not treat one as a page that requires a
     * login, so the view guards itself.
     *
     * `beforeNavLinks` rather than `afterNavLinks` because this sits above the
     * collections rather than beside them: it is the first thing to open in
     * the morning, not an afterthought under Instellingen.
     *
     * Both entries have to exist in src/app/(payload)/admin/importMap.js as
     * well — that file is generated (`npm run generate:importmap`) and is what
     * turns these strings into real imports.
     */
    components: {
      beforeNavLinks: ["@/components/admin/AgendaView#AgendaNavLink"],
      /**
       * Below the collections rather than above them: the statistics and the
       * backup page are things you open when you are wondering or worried, not
       * every morning, and the translation counter is a nudge rather than a
       * destination.
       */
      afterNavLinks: [
        "@/components/admin/StatsView#StatsNavLink",
        "@/components/admin/BackupsView#BackupsNavLink",
        "@/components/admin/LocaleAssist#LocaleAssist",
      ],
      views: {
        agenda: {
          Component: "@/components/admin/AgendaView#AgendaView",
          path: "/agenda",
          // Only /admin/agenda itself; without this a prefix match would also
          // swallow anything below it, and nothing below it exists.
          exact: true,
          meta: {
            title: "Agenda",
          },
        },
        /**
         * The backups at /admin/backups. Same two Payload 3.88 facts as the
         * agenda: the view renders the admin chrome itself and guards its own
         * login, because a registered custom view is a public route as far as
         * Payload is concerned. See src/components/admin/BackupsView.tsx and
         * docs/backups.md.
         */
        backups: {
          Component: "@/components/admin/BackupsView#BackupsView",
          path: "/backups",
          exact: true,
          meta: {
            title: "Backups",
          },
        },
        /**
         * The figures at /admin/statistieken. Same two Payload 3.88 facts
         * again, and one piece of history worth recording here rather than
         * only in the component: src/lib/umamiServer.ts, the Statistieken tab
         * in Instellingen and docs/analytics.md all described this page for a
         * long time before anything registered it, so the owners were being
         * told about a panel that did not exist and the module's eight Dutch
         * failure sentences had never been shown to anyone. See
         * src/components/admin/StatsView.tsx.
         */
        statistieken: {
          Component: "@/components/admin/StatsView#StatsView",
          path: "/statistieken",
          exact: true,
          meta: {
            title: "Statistieken",
          },
        },
      },
    },
  },
  collections: [
    Users,
    Media,
    BlogPosts,
    Events,
    GalleryImages,
    GalleryCategories,
    MenuItems,
    MenuCategories,
    Notifications,
    MailingList,
    Reservations,
    ContactMessages,
    OpeningExceptions,
  ],
  globals: [SiteSettings],
  // Dutch is the source language and the fallback: an English field left empty
  // in the admin serves its Dutch value rather than a hole in the page.
  localization: {
    locales: [
      { label: "Nederlands", code: "nl" },
      { label: "English", code: "en" },
    ],
    defaultLocale: "nl",
    fallback: true,
  },
  plugins: [
    /**
     * Search-engine metadata for the two collections that have public detail
     * pages of their own.
     *
     * The plugin adds a `meta` group to each of them — meta.title,
     * meta.description, meta.image and (in this version) meta.keywords — and
     * with `tabbedUI` it moves the collection's own fields into a "Content"
     * tab and puts these behind an "SEO" tab beside it. That is a schema
     * change on both collections, so it needs a migration like any other.
     *
     * Every generated field is localised, which is the whole point: the Dutch
     * and the English page each carry their own title and description, and the
     * generate buttons read the document in the locale the editor is looking
     * at. `generateURL` folds the locale into the path for the same reason.
     */
    seoPlugin({
      collections: ["blog-posts", "events"] as CollectionSlug[],
      uploadsCollection: "media",
      tabbedUI: true,
      fields: ({ defaultFields }) => defaultFields.map(dutchify),
      generateTitle: ({ doc }) => {
        const title = (doc as { title?: string })?.title || "";
        if (!title) return "De Bee's Hive";
        return `${trimTo(title, 60 - titleSuffix.length)}${titleSuffix}`;
      },
      generateDescription: ({ doc }) => {
        const d = doc as { excerpt?: string; summary?: string; intro?: string };
        // Events are another agent's collection and may spell their short text
        // differently; take whichever of the usual three is filled rather than
        // hard-coding one field name and generating empty descriptions.
        const source = d?.excerpt || d?.summary || d?.intro || "";
        return source ? trimTo(source, 160) : "";
      },
      generateImage: ({ doc }) => {
        // Whatever the page already shows at the top is the right share image;
        // the plugin stores a media id, and Media generates a 1200x630 `og`
        // size for exactly this.
        const d = doc as { featuredImage?: unknown; image?: unknown };
        const image = d?.featuredImage ?? d?.image;
        if (!image) return "";
        if (typeof image === "object" && image !== null && "id" in image) {
          return String((image as { id: unknown }).id);
        }
        return String(image);
      },
      generateURL: ({ doc, collectionSlug, locale }) => {
        const base = process.env.NEXT_PUBLIC_SITE_URL || "https://debeeshive.nl";
        const segment = publicPathByCollection[collectionSlug || ""] || "";
        const slug = (doc as { slug?: string })?.slug || "";
        const prefix = locale && locale !== "nl" ? `/${locale}` : "";
        return [base.replace(/\/$/, ""), prefix, segment && `/${segment}`, slug && `/${slug}`]
          .filter(Boolean)
          .join("");
      },
    }),
    /**
     * Uploads on Cloudflare R2, when there is an R2 to talk to.
     *
     * R2 speaks the S3 API, with two deviations the AWS SDK has to be told
     * about explicitly:
     *
     *   - `region: "auto"`. R2 buckets are not in a region — Cloudflare places
     *     the data itself — but the SDK refuses to sign a request without a
     *     region string, and any real AWS region name here ends up in the
     *     signature and is rejected. "auto" is the value Cloudflare documents.
     *   - `forcePathStyle: true`. The SDK's default is virtual-hosted style,
     *     `https://<bucket>.<endpoint>/<key>`, which for the R2 endpoint
     *     `https://<account>.r2.cloudflarestorage.com` produces a hostname
     *     that does not resolve. Path style keeps the bucket in the path,
     *     which is what the R2 endpoint expects.
     *
     * `enabled` is what makes the whole thing optional: with the plugin
     * disabled Payload falls back to its own local disk handling and nothing
     * else in the config has to change. Files are served to visitors from
     * R2_PUBLIC_URL (a custom domain or the bucket's public r2.dev address),
     * which is a Media/collection concern rather than the client's.
     */
    s3Storage({
      enabled: isR2Configured(),
      collections: {
        media: r2PublicUrl
          ? {
              // With a public address on the bucket — a custom domain, or the
              // r2.dev subdomain — visitors fetch the file straight from
              // Cloudflare. Without one, `media: true` leaves the URLs on
              // /api/media/file/..., which still works: Payload fetches the
              // object from R2 and streams it. That is one Node request per
              // photograph, on a server that has better things to do, so set
              // R2_PUBLIC_URL if the bucket is public.
              //
              // `disablePayloadAccessControl` has to go with it. Payload only
              // hands out the generated URL once it has stopped insisting on
              // serving the file through its own access-checked route, and
              // media in this CMS is public by definition — everything in it
              // is on a page anyone can load.
              disablePayloadAccessControl: true,
              generateFileURL: ({ filename, prefix }) =>
                [r2PublicUrl, prefix, filename].filter(Boolean).join("/"),
            }
          : true,
      },
      bucket: process.env.R2_BUCKET || "",
      config: {
        endpoint: process.env.R2_ENDPOINT || "",
        region: "auto",
        forcePathStyle: true,
        credentials: {
          accessKeyId: process.env.R2_ACCESS_KEY_ID || "",
          secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || "",
        },
      },
    }),
  ],
  editor: lexicalEditor(),
  email: emailAdapter(),
  secret: payloadSecret(),
  typescript: {
    outputFile: path.resolve(dirname, "payload-types.ts"),
  },
  db: surviveABuildWithoutADatabase(
    refuseToPromptWithoutATerminal(
      postgresAdapter({
      pool: {
        connectionString: databaseURI,
      },
      // Development may keep pushing the schema straight from the collections,
      // which is what makes local iteration quick. Production must not. Postgres
      // is kinder about this than SQLite was — it ALTERs a table rather than
      // rebuilding it — but the dangerous case is unchanged: drizzle compares the
      // collections to the live tables and will DROP a column it can no longer
      // account for, which is precisely what a field newly marked
      // `localized: true` looks like, its values not yet copied into the
      // `_locales` side table. It also decides on its own when a change needs a
      // destructive rewrite, and answers to nobody about it.
      //
      // Nor against a database that is not on this machine, whatever NODE_ENV
      // says: see devPushAllowed(). The `&&` short-circuit is what keeps its
      // warning out of production and out of the build.
      push: !isProduction && !isBuild && devPushAllowed(),
      migrationDir: path.resolve(dirname, "migrations"),
      // Production is driven by src/migrations instead, applied on connect. The
      // container is a standalone Next build with no Payload CLI in it, so there
      // is nowhere to run `payload migrate` from; importing the list here bundles
      // it with the server and Payload runs anything outstanding itself.
      //
      // Never during `next build`. Payload connects once per static worker there,
      // and against a database that was built by dev push it stops to ask on
      // stdin whether to migrate anyway. Nothing can answer, the worker sits at
      // "Collecting page data" until the 60 second export timeout fires three
      // times, and the build dies without ever naming the prompt as the cause.
        ...(isBuild ? {} : { prodMigrations: migrations }),
      }),
    ),
  ),
  sharp,
  upload: {
    limits: {
      fileSize: 10000000, // 10MB
    },
  },
});
