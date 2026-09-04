/**
 * A no-op stand-in for the `server-only` package, for the test runner alone.
 *
 * `import "server-only"` is a build-time guard: Next resolves it through the
 * `react-server` condition to an empty module on the server and to a module
 * that throws in a client bundle, so a server module imported from a
 * `"use client"` file fails the build instead of failing quietly at runtime.
 *
 * Vitest resolves neither condition — the package is a transitive dependency of
 * Next rather than a direct one, so Node cannot find it at all — and the guard
 * would turn every unit test of a guarded module into an import error. Aliased
 * here, in `vitest.config.ts`, so the guard protects the build and costs the
 * suite nothing.
 */
export {};
