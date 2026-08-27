import type { ReactNode } from "react";

/**
 * Every list has an explicit empty state: an icon, one line of explanation, and
 * the action that resolves it. Never a bare "No data".
 */
export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon?: ReactNode;
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-[14px] border border-dashed border-border px-6 py-10 text-center">
      {icon ? <div className="text-text-subtle">{icon}</div> : null}
      <p className="heading-text">{title}</p>
      <p className="caption-text max-w-[36ch] text-text-muted">{body}</p>
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
