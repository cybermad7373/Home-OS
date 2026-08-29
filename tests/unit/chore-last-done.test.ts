import { describe, expect, it } from "vitest";
import {
  formatLastDoneLabel,
  mergeTemplateLastDone,
  type TemplateLastDoneRow,
} from "@/lib/domain/chores/last-done";

/**
 * CH-12: every template carries when it was last actually completed and by
 * whom. The merge is a pure lookup by template id — the database side (RLS,
 * confirmed-only, null for never-done) is proved against a real Postgres in
 * tests/integration/chore-lifecycle.test.ts.
 */
describe("mergeTemplateLastDone", () => {
  const templates = [
    { id: "t1", name: "Cook dinner" },
    { id: "t2", name: "Mop common area" },
  ];

  it("attaches the matching row's last-done figure to its template", () => {
    const rows: TemplateLastDoneRow[] = [
      { template_id: "t1", last_done_at: "2026-08-20T18:00:00Z", last_done_by: "m1", last_done_by_name: "Arun" },
    ];

    const merged = mergeTemplateLastDone(templates, rows);

    expect(merged.find((t) => t.id === "t1")).toMatchObject({
      last_done_at: "2026-08-20T18:00:00Z",
      last_done_by: "m1",
      last_done_by_name: "Arun",
    });
  });

  it("a template with no row reads null, never a creation date", () => {
    const merged = mergeTemplateLastDone(templates, []);

    expect(merged.find((t) => t.id === "t2")).toMatchObject({
      last_done_at: null,
      last_done_by: null,
      last_done_by_name: null,
    });
  });
});

/**
 * S-09: a card whose own instance is still done_pending reads "pending", never
 * an older confirmed date it would otherwise fall back to — and a template
 * with no confirmed completion ever reads "never completed", never a blank
 * line or a creation date.
 */
describe("formatLastDoneLabel", () => {
  it("a card still awaiting confirmation reads pending, not an older date", () => {
    expect(
      formatLastDoneLabel({
        instanceStatus: "done_pending",
        lastDoneAt: "2026-08-20T18:00:00Z",
        lastDoneByName: "Arun",
      }),
    ).toEqual({ kind: "pending" });
  });

  it("a confirmed completion reads done, with who and when", () => {
    expect(
      formatLastDoneLabel({
        instanceStatus: "confirmed",
        lastDoneAt: "2026-08-20T18:00:00Z",
        lastDoneByName: "Arun",
      }),
    ).toEqual({ kind: "done", lastDoneAt: "2026-08-20T18:00:00Z", lastDoneByName: "Arun" });
  });

  it("a template never confirmed done reads never completed", () => {
    expect(
      formatLastDoneLabel({ instanceStatus: "assigned", lastDoneAt: null, lastDoneByName: null }),
    ).toEqual({ kind: "never" });
  });
});
