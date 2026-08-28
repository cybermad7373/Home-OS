import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // The Supabase CLI writes a bundled copy of the Edge Function runtime here
    // while the local stack is up. It is gitignored, it is minified, and it is
    // not ours — linting it produces two hundred findings about single-letter
    // variables in somebody else's generated file and buries the real ones.
    "supabase/.temp/**",
  ]),
]);

export default eslintConfig;
