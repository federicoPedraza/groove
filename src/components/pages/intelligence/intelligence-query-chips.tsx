"use client";

import {
  getIntelligenceQueryColor,
  getIntelligenceQueryIcon,
} from "@/src/components/pages/intelligence/intelligence-query-options";
import { cn } from "@/src/lib/utils";
import type { IntelligenceQueryRecord } from "@/src/lib/ipc";

type IntelligenceQueryChipsProps = {
  queries: IntelligenceQueryRecord[];
  activeId: string | null;
  onSelect: (record: IntelligenceQueryRecord) => void;
};

export function IntelligenceQueryChips({
  queries,
  activeId,
  onSelect,
}: IntelligenceQueryChipsProps) {
  if (queries.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        No saved queries yet. Save one to reuse it later.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {queries.map((query) => {
        const color = getIntelligenceQueryColor(query.color);
        const iconOption = getIntelligenceQueryIcon(query.icon);
        const Icon = iconOption.Icon;
        const isActive = query.id === activeId;
        return (
          <button
            key={query.id}
            type="button"
            onClick={() => onSelect(query)}
            aria-pressed={isActive}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
              color.badgeClasses,
              isActive
                ? "ring-2 ring-foreground/70 ring-offset-2 ring-offset-background"
                : "hover:opacity-90",
            )}
          >
            <Icon aria-hidden="true" className="size-3.5" />
            <span className="truncate">{query.name}</span>
          </button>
        );
      })}
    </div>
  );
}
