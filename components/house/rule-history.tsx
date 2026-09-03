import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { RuleFieldChange } from "@/lib/domain/rules/diff";
import { formatDate, formatDateTime } from "@/lib/utils/date";

/**
 * S-42 — a rule's history.
 *
 * RL-07 asks six questions of every version and this screen answers all six:
 * who changed it, when, from what, to what, why, and who acknowledged it.
 *
 * **The original text of every version is shown verbatim**, because that is
 * what the Home actually agreed to. The structured fields are one reading of
 * it; the paragraph is the thing itself, and a history that showed only the
 * parse would be a history of what the software understood rather than of what
 * the people decided.
 */

export interface HistoryVersion {
  id: string;
  versionNo: number;
  originalText: string;
  title: string;
  changeReason: string | null;
  createdByName: string;
  createdAt: string;
  activatedAt: string | null;
  supersededAt: string | null;
  startsOn: string | null;
  endsOn: string | null;
}

export interface HistoryEntry {
  version: HistoryVersion;
  changes: RuleFieldChange[];
  responses: { memberId: string; memberName: string; response: string; at: string }[];
}

const RESPONSE_VERB: Record<string, string> = {
  approve: "approved",
  acknowledge: "acknowledged",
  reject: "rejected",
};

export function RuleHistory({
  entries,
  timezone,
}: {
  entries: HistoryEntry[];
  timezone: string;
}) {
  return (
    <ol className="flex flex-col gap-3">
      {entries.map((entry) => {
        const version = entry.version;
        const inForce = version.activatedAt !== null && version.supersededAt === null;

        return (
          <li key={version.id}>
            <Card>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium">Version {version.versionNo}</p>
                  <p className="caption-text text-text-muted">
                    {version.createdByName} ·{" "}
                    {formatDateTime(version.createdAt, timezone)}
                  </p>
                </div>
                <Badge tone={inForce ? "success" : version.activatedAt ? "neutral" : "warning"}>
                  {inForce
                    ? "In force"
                    : version.activatedAt
                      ? "Replaced"
                      : "Never took effect"}
                </Badge>
              </div>

              {version.activatedAt ? (
                <p className="caption-text mt-1 text-text-muted">
                  In force from {formatDate(version.activatedAt.slice(0, 10), timezone)}
                  {version.supersededAt
                    ? ` until ${formatDate(version.supersededAt.slice(0, 10), timezone)}`
                    : ""}
                  {version.endsOn ? ` · ends ${formatDate(version.endsOn, timezone)}` : ""}
                </p>
              ) : null}

              {/* RL-09. Verbatim, every version, forever. */}
              <blockquote className="mt-3 rounded-[var(--radius-sm)] bg-surface-2 p-3 text-[14px]">
                {version.originalText}
              </blockquote>

              {version.changeReason ? (
                <p className="caption-text mt-2 text-text-muted">
                  Why: {version.changeReason}
                </p>
              ) : null}

              {entry.changes.length > 0 ? (
                <div className="mt-3">
                  <p className="label-text mb-1">What changed</p>
                  <ul className="flex flex-col gap-1 text-[13px]">
                    {entry.changes.map((change) => (
                      <li key={change.field} className="flex flex-wrap gap-x-2">
                        <span className="text-text-muted">{change.label}:</span>
                        <span className="text-text-muted line-through">
                          {change.before ?? "nothing"}
                        </span>
                        <span aria-hidden>·</span>
                        <span>{change.after ?? "nothing"}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="caption-text mt-3 text-text-muted">
                  {version.versionNo === 1
                    ? "The first version. This is the rule, not a change to one."
                    : "Nothing about the rule itself changed in this version."}
                </p>
              )}

              {entry.responses.length > 0 ? (
                <div className="mt-3">
                  <p className="label-text mb-1">Who answered</p>
                  <ul className="flex flex-col gap-1 text-[13px]">
                    {entry.responses.map((response) => (
                      <li key={`${response.memberId}:${response.at}`}>
                        <span>{response.memberName}</span>{" "}
                        <span className="text-text-muted">
                          {RESPONSE_VERB[response.response] ?? response.response} ·{" "}
                          {formatDateTime(response.at, timezone)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </Card>
          </li>
        );
      })}
    </ol>
  );
}
