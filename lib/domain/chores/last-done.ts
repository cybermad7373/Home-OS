/**
 * CH-12 — the last-completed figure. Pure merge of a template list with the
 * per-template rows read from `v_template_last_done`; the confirmed-only,
 * null-for-never-done contract lives in that view, not here.
 */
export interface TemplateLastDoneRow {
  template_id: string;
  last_done_at: string | null;
  last_done_by: string | null;
  last_done_by_name: string | null;
}

export interface TemplateLastDone {
  last_done_at: string | null;
  last_done_by: string | null;
  last_done_by_name: string | null;
}

export function indexTemplateLastDone(rows: TemplateLastDoneRow[]): Map<string, TemplateLastDone> {
  const index = new Map<string, TemplateLastDone>();
  for (const row of rows) {
    index.set(row.template_id, {
      last_done_at: row.last_done_at,
      last_done_by: row.last_done_by,
      last_done_by_name: row.last_done_by_name,
    });
  }
  return index;
}

const NEVER_DONE: TemplateLastDone = {
  last_done_at: null,
  last_done_by: null,
  last_done_by_name: null,
};

export function lastDoneFor(
  templateId: string,
  index: Map<string, TemplateLastDone>,
): TemplateLastDone {
  return index.get(templateId) ?? NEVER_DONE;
}

export function mergeTemplateLastDone<T extends { id: string }>(
  templates: T[],
  rows: TemplateLastDoneRow[],
): (T & TemplateLastDone)[] {
  const index = indexTemplateLastDone(rows);
  return templates.map((template) => ({ ...template, ...lastDoneFor(template.id, index) }));
}

export type LastDoneLabel =
  | { kind: "pending" }
  | { kind: "done"; lastDoneAt: string; lastDoneByName: string }
  | { kind: "never" };

/**
 * S-09: a card whose own instance is still awaiting confirmation reads
 * "pending" rather than an older confirmed date it would otherwise fall back
 * to — the freshest thing that happened to this template is the tap the
 * caller is looking at, not last week's.
 */
export function formatLastDoneLabel(args: {
  /** Omitted where there is no single instance to be pending — a template list. */
  instanceStatus?: string;
  lastDoneAt: string | null;
  lastDoneByName: string | null;
}): LastDoneLabel {
  if (args.instanceStatus === "done_pending") return { kind: "pending" };
  if (args.lastDoneAt && args.lastDoneByName) {
    return { kind: "done", lastDoneAt: args.lastDoneAt, lastDoneByName: args.lastDoneByName };
  }
  return { kind: "never" };
}
