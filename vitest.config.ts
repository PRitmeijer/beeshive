import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * The test runner for the booking system.
 *
 * There was none for the first year of this codebase, which is the whole
 * reason this file exists. The opening-hours parser reads a line a human typed
 * into a CMS, the seat counter decides whether a Saturday is sold out, and
 * /api/reserve answers with one of twenty-four refusal codes — three pieces of
 * arithmetic that go wrong in ways nobody notices until a guest is standing in
 * the doorway. None of it can be checked by opening the site: the interesting
 * cases are a holiday line typed in July, the last Sunday of a five-Sunday
 * month, and the night the clocks go forward.
 *
 * Everything below exists so that a test can be written about any of that
 * without a database, without a Payload instance and without a browser.
 */

const src = fileURLToPath(new URL("./src", import.meta.url));

export default defineConfig({
  /**
   * The alias table, written out by hand rather than read out of
   * tsconfig.json by a plugin. It is two lines that have not changed since the
   * repository was created, and a plugin to save writing them would be a third
   * dependency whose version has to track Vite's. The real cost is stated
   * rather than hidden: if a third alias ever appears in tsconfig.json, this
   * is the file that has to be told about it, and the way you will find out is
   * an import that cannot resolve.
   *
   * `@payload-config` is listed even though no test may ever cause it to be
   * evaluated. Resolving a specifier and running the module behind it are
   * different things — Vitest resolves in order to register a mock — and a
   * specifier it cannot resolve is an error even when nothing will ever run.
   */
  resolve: {
    alias: [
      { find: /^@\/(.*)$/, replacement: `${src}/$1` },
      { find: "@payload-config", replacement: `${src}/payload.config.ts` },
    ],
  },

  test: {
    /**
     * Node, not jsdom.
     *
     * Everything worth testing here runs on the server: the parsers import
     * nothing, the schedule and the seat count read the CMS, and the route
     * handlers are handed a `Request`, which Node 22 has natively. The single
     * exception is src/lib/rememberMe.ts, which talks to localStorage; its
     * test opens with a `@vitest-environment jsdom` docblock, which is why
     * jsdom is a devDependency at all. A docblock in the one file that needs a
     * browser rather than a glob in here, because a rule in this file is a
     * rule you find out about only after a test has behaved strangely.
     */
    environment: "node",

    /**
     * Tests live outside src/ on purpose. src/ is the deployed surface — what
     * the Dockerfile copies and what `next build` walks — so co-located
     * *.test.ts files would be dead weight in the image and one more thing
     * every glob in the repository has to remember to exclude. This tree
     * mirrors src/ one directory deep, so tests/lib/capacity.math.test.ts is
     * obviously about src/lib/capacity.ts.
     */
    include: ["tests/**/*.test.ts"],

    /**
     * The environment every test starts in.
     *
     * TZ is the one that matters. Nothing in the booking path reads the
     * process timezone on purpose — `nowMinutesInAmsterdam()` and
     * `todayInAmsterdam()` hand `timeZone: "Europe/Amsterdam"` to Intl, and
     * every piece of date arithmetic is done at midday UTC — but the owners'
     * laptop is in Europe/Amsterdam and a server is not. Pinning UTC here is
     * what makes a date test that only passes in the café's own timezone fail
     * on the laptop that wrote it, instead of passing there and failing on a
     * Sunday in March somewhere else. tests/support/time.ts leans on this: it
     * runs a handful of assertions again under two absurd timezones to prove
     * the difference cannot matter.
     *
     * DATABASE_URI points at a port nothing listens on. It is a tripwire, not
     * configuration: no test may reach a real Postgres, and the failure when
     * somebody forgets a mock should be an immediate connection refusal rather
     * than a suite quietly reading and writing the developer's dev database.
     *
     * PAYLOAD_SECRET is fixed because src/lib/guestPass.ts derives the guest
     * response edit key from it with HMAC-SHA256, and assertions about a key
     * derived from a random secret cannot be written. TRUSTED_PROXY_HOPS is
     * fixed because src/lib/apiGuard.ts reads it once at module load, so a
     * test depending on the ambient value is a test that fails on somebody
     * else's machine.
     */
    env: {
      TZ: "UTC",
      DATABASE_URI: "postgres://tests:tests@127.0.0.1:1/must-not-connect",
      PAYLOAD_SECRET: "test-only-secret-do-not-use-anywhere",
      NEXT_PUBLIC_SITE_URL: "https://debeeshive.nl",
      TRUSTED_PROXY_HOPS: "1",
    },

    /**
     * Spies, mocks and stubbed env vars are put back between tests rather than
     * at the end of a file. Both rate limiters in src/lib/apiGuard.ts keep
     * their counters in module scope, and a suite where the order of the files
     * changes the result is worse than no suite at all.
     */
    clearMocks: true,
    restoreMocks: true,
    unstubEnvs: true,

    /**
     * Coverage is a map of what has been thought about, not a target to hit.
     * There is deliberately no threshold: the number one would enforce is
     * satisfied by tests that assert nothing, and this suite is meant to catch
     * a regression rather than to have a high number next to it.
     */
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/lib/**", "src/app/api/**", "src/i18n/config.ts"],
      exclude: ["src/lib/payload.ts", "src/lib/umamiServer.ts"],
    },
  },
});
