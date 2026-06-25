import type { ReactNode } from "react";

import { cn } from "@/src/lib/utils";

type PageHeaderProps = {
  /** Page title. Usually a string, but any node is allowed. */
  title: ReactNode;
  /**
   * Supporting copy under the title. A string is wrapped in the standard
   * muted paragraph; pass a node for richer content (e.g. a branch + copy
   * button, or a progress counter).
   */
  description?: ReactNode;
  /** Optional leading icon, rendered to the left of the title block. */
  icon?: ReactNode;
  /** Buttons / controls rendered on the trailing edge of the header. */
  actions?: ReactNode;
  className?: string;
};

/**
 * Shared page header chrome — a bordered card with a title, optional
 * description/icon, and a trailing actions slot. Every page renders its
 * header through this so they stay visually consistent.
 */
export function PageHeader({
  title,
  description,
  icon,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <header
      className={cn(
        "flex flex-wrap items-start justify-between gap-3 rounded-lg border bg-card p-4",
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        {icon ? (
          <span className="flex shrink-0 items-center text-muted-foreground">
            {icon}
          </span>
        ) : null}
        <div className="min-w-0 space-y-1">
          <h1 className="min-w-0 truncate text-xl font-semibold tracking-tight">
            {title}
          </h1>
          {typeof description === "string" ? (
            <p className="text-sm text-muted-foreground">{description}</p>
          ) : (
            description ?? null
          )}
        </div>
      </div>
      {actions ? (
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </header>
  );
}
