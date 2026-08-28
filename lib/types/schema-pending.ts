/**
 * The schema delta that `npm run gen:types` has not seen yet.
 *
 * `lib/types/supabase.ts` is generated from a migrated database. Migrations
 * 047-057 are now applied to the local database, so the generated types cover
 * all tables, enums, and functions. This file is now a minimal shim that just
 * re-exports the generated types for the few items that need slight adjustments
 * or that the generated file doesn't express perfectly (e.g., `JoinRequestStatus`).
 *
 * **When a future migration adds new schema objects, add them here until the
 * next `npm run gen:types` run.**
 */

import type { Database as Generated } from "./supabase";

type Public = Generated["public"];
type GeneratedTables = Public["Tables"];
type GeneratedEnums = Public["Enums"];
type GeneratedFunctions = Public["Functions"];

// ---------------------------------------------------------------------------
// Enums — all now generated; keep only the JoinRequestStatus which is a
// subset of the generated enum but used as a standalone type in the app.
// ---------------------------------------------------------------------------

export type JoinRequestStatus = "requested" | "accepted" | "declined" | "withdrawn";

// ---------------------------------------------------------------------------
// Tables — all now generated. The generated types use `home_type` for the
// houses table (renamed from `household_type` in 049) and include all new
// governance/absence tables. No overlay needed.
// ---------------------------------------------------------------------------

// Re-export the generated tables as PendingTables
export type PendingTables = GeneratedTables;

// ---------------------------------------------------------------------------
// Functions — all now generated. The generated signatures match what the app
// expects. No overlay needed.
// ---------------------------------------------------------------------------

export type PendingFunctions = GeneratedFunctions;

// ---------------------------------------------------------------------------
// Enums — all now generated. Re-export the generated enums.
// ---------------------------------------------------------------------------

export type PendingEnums = GeneratedEnums;