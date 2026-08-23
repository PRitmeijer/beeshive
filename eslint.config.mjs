import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";

/**
 * ESLint 9 reads flat config and nothing else, and `eslint-config-next` at
 * 15.1 is still written in the old shareable shape — an object with `extends`
 * in it, which flat config has no idea what to do with. FlatCompat is the
 * bridge Next's own documentation points at for exactly this pair of versions:
 * it loads the legacy config and hands back flat config objects.
 *
 * Before this file existed, `next lint` dropped into its interactive
 * "Strict / Base / Cancel" setup prompt — which hangs forever in a pipeline
 * with no terminal attached — and `next build` printed "No ESLint
 * configuration detected" and linted nothing at all.
 *
 * `@eslint/eslintrc` arrives on its own as one of ESLint's dependencies, but
 * it is named in devDependencies anyway: a package we import by name and do
 * not declare is a package that vanishes the day ESLint stops needing it.
 */
const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

const config = [
  {
    /**
     * Two of these are build output; the other two are generated files that
     * happen to be committed. `src/payload-types.ts` is written by
     * `npm run generate:types` and `importMap.js` by
     * `npm run generate:importmap`, both wholesale, so a complaint about
     * either is a complaint about a generator we do not control and cannot
     * act on without losing it at the next regeneration.
     */
    ignores: [
      ".next/**",
      "node_modules/**",
      "src/payload-types.ts",
      "src/app/(payload)/admin/importMap.js",
    ],
  },
  ...compat.extends("next/core-web-vitals"),
  {
    rules: {
      /**
       * Off deliberately, and not as a way of avoiding the work.
       *
       * The rule's advice is to reach for `next/image`. This site uses it
       * nowhere — `grep -rn "next/image" src/` is empty — and that is a
       * decision rather than an oversight. Every remaining <img> renders a
       * photograph out of the CMS, which Payload has already re-encoded to
       * WebP at four sizes on upload and which Cloudflare is already serving
       * from R2. Routing those through /_next/image would mean this small
       * server fetching, decoding and re-encoding pictures a CDN had finished
       * with, for no gain the visitor can see. Two of the call sites carried a
       * hand-written eslint-disable for this exact rule long before anything
       * ever ran ESLint here, which is the same judgement written down twice.
       *
       * The cost of turning it off is that a genuinely careless <img> — one
       * with no width and height, reflowing the page as it lands — no longer
       * gets caught here. That is worth saying out loud so the next person
       * knows what this line bought and what it did not.
       */
      "@next/next/no-img-element": "off",
    },
  },
  {
    // A config file's whole job is to be a default export. Naming the object
    // first would satisfy the rule and tell a reader nothing.
    files: ["*.config.mjs", "*.config.js"],
    rules: { "import/no-anonymous-default-export": "off" },
  },
];

export default config;
