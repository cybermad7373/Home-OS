import type { ReactNode } from "react";

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <header className="mb-4 flex items-start justify-between gap-3">
      <div>
        <h1 className="title-text">{title}</h1>
        {subtitle ? <p className="caption-text text-text-muted">{subtitle}</p> : null}
      </div>
      {action}
    </header>
  );
}
