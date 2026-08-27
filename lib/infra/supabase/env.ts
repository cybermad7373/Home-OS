/**
 * Environment access, in one place, so that a missing variable fails with a
 * sentence instead of `undefined` three layers down.
 *
 * SEC-02: the service-role key is read only by `requireServiceRoleKey`, which is
 * never imported from a client component.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing environment variable ${name}. Copy .env.example to .env.local and fill it in.`,
    );
  }
  return value;
}

export function supabaseUrl(): string {
  return required("NEXT_PUBLIC_SUPABASE_URL");
}

export function supabaseAnonKey(): string {
  return required("NEXT_PUBLIC_SUPABASE_ANON_KEY");
}

export function requireServiceRoleKey(): string {
  return required("SUPABASE_SERVICE_ROLE_KEY");
}

export function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}
