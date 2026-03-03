"use client";

import { Check, ChevronLeft, ChevronRight, Search, Square } from "lucide-react";
import { useEffect, useMemo, useState, type KeyboardEvent } from "react";

import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { toShortcutDisplayLabel } from "@/src/lib/shortcuts";

export type ActionLauncherButtonItem = {
  id: string;
  type: "button";
  label: string;
  description?: string;
  shortcutKeyHint?: string;
  closeOnRun?: boolean;
  isSelected?: boolean;
  run: () => void | Promise<void>;
};

export type ActionLauncherCheckboxOption = {
  id: string;
  label: string;
  description?: string;
  checked: boolean;
};

export type ActionLauncherCheckboxMultipleItem = {
  id: string;
  type: "checkbox-multiple-input";
  label: string;
  description?: string;
  options: ActionLauncherCheckboxOption[];
  onToggle: (optionId: string) => void;
};

export type ActionLauncherDropdownItem = {
  id: string;
  type: "dropdown";
  label: string;
  description?: string;
  items: ActionLauncherItem[];
};

export type ActionLauncherItem =
  | ActionLauncherButtonItem
  | ActionLauncherCheckboxMultipleItem
  | ActionLauncherDropdownItem;

type ActionLauncherProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  items: ActionLauncherItem[];
};

type ActionLauncherLevel = {
  id: string;
  title: string;
  items: ActionLauncherItem[];
};

const ACTION_ROW_BASE_CLASS =
  "mx-2 my-1 flex w-[calc(100%-1rem)] items-center justify-between rounded-md border px-2 py-2 text-left transition-colors";
const ACTION_ROW_HOVER_CLASS = "border-transparent hover:border-border hover:bg-accent/60";
const ACTION_ROW_HIGHLIGHTED_CLASS = "border-border bg-accent text-foreground ring-1 ring-border/70";

function filterItems(items: ActionLauncherItem[], query: string): ActionLauncherItem[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return items;
  }

  return items.filter((item) => {
    const haystack = [item.label, item.description].filter(Boolean).join(" ").toLowerCase();
    return haystack.includes(normalizedQuery);
  });
}

export function ActionLauncher({ open, onOpenChange, title, items }: ActionLauncherProps) {
  const [query, setQuery] = useState("");
  const [stack, setStack] = useState<ActionLauncherLevel[]>([{ id: "root", title, items }]);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setStack([{ id: "root", title, items }]);
      return;
    }

    setStack((current) => {
      if (current.length === 1) {
        return [{ id: "root", title, items }];
      }
      return current;
    });
  }, [items, open, title]);

  const activeLevel = stack[stack.length - 1];
  const visibleItems = useMemo(() => filterItems(activeLevel.items, query), [activeLevel.items, query]);

  useEffect(() => {
    if (!open || visibleItems.length === 0) {
      setHighlightedIndex(-1);
      return;
    }

    setHighlightedIndex(0);
  }, [open, visibleItems]);

  const runItem = (item: ActionLauncherItem): void => {
    if (item.type === "checkbox-multiple-input") {
      setQuery("");
      const nestedItems: ActionLauncherItem[] = item.options.map((option) => ({
        id: `${item.id}:${option.id}`,
        type: "button",
        label: option.label,
        description: option.description,
        run: () => {
          item.onToggle(option.id);
        },
        closeOnRun: false,
        isSelected: option.checked,
      }));
      setStack((current) => [...current, { id: item.id, title: item.label, items: nestedItems }]);
      return;
    }

    if (item.type === "dropdown") {
      setQuery("");
      setStack((current) => [...current, { id: item.id, title: item.label, items: item.items }]);
      return;
    }

    const result = item.run();
    if (item.closeOnRun !== false) {
      void Promise.resolve(result).finally(() => {
        onOpenChange(false);
      });
      return;
    }

    setStack((current) => {
      const next = [...current];
      const lastLevel = next[next.length - 1];
      next[next.length - 1] = {
        ...lastLevel,
        items: lastLevel.items.map((candidate) => {
          if (candidate.type !== "button" || candidate.id !== item.id) {
            return candidate;
          }
          return {
            ...candidate,
            isSelected: !candidate.isSelected,
          };
        }),
      };
      return next;
    });
  };

  const onInputKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (visibleItems.length === 0) {
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlightedIndex((current) => {
        if (current < 0) {
          return 0;
        }
        return (current + 1) % visibleItems.length;
      });
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlightedIndex((current) => {
        if (current < 0) {
          return visibleItems.length - 1;
        }
        return (current - 1 + visibleItems.length) % visibleItems.length;
      });
      return;
    }

    if (event.key === "Enter" && highlightedIndex >= 0) {
      event.preventDefault();
      runItem(visibleItems[highlightedIndex]);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="top-20 left-1/2 max-h-[min(78vh,36rem)] w-[min(42rem,calc(100%-2rem))] translate-x-[-50%] translate-y-0 gap-3 overflow-hidden p-0 sm:top-24">
        <div className="border-b px-4 py-3">
          <DialogTitle className="text-base">{activeLevel.title}</DialogTitle>
          <p className="text-xs text-muted-foreground">Type to filter, then run actions with Enter.</p>
        </div>

        <div className="px-4">
          <div className="relative">
            <Search aria-hidden="true" className="pointer-events-none absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              value={query}
              onKeyDown={onInputKeyDown}
              onChange={(event) => {
                setQuery(event.target.value);
              }}
              placeholder="Search actions..."
              className="h-9 pl-8"
            />
          </div>
        </div>

        <div className="overflow-y-auto px-2 pb-3">
          {stack.length > 1 ? (
            <button
              type="button"
              className="mx-2 mb-1 flex w-[calc(100%-1rem)] items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-muted/70 hover:text-foreground"
              onClick={() => {
                setQuery("");
                setStack((current) => current.slice(0, -1));
              }}
            >
              <ChevronLeft aria-hidden="true" className="size-4" />
              Back
            </button>
          ) : null}

          {visibleItems.length === 0 ? (
            <p className="px-4 py-5 text-sm text-muted-foreground">No actions match this search.</p>
          ) : (
            visibleItems.map((item, index) => {
              const isHighlighted = index === highlightedIndex;

              if (item.type === "checkbox-multiple-input") {
                return (
                  <button
                    key={item.id}
                    type="button"
                    data-highlighted={isHighlighted ? "true" : undefined}
                    aria-selected={isHighlighted}
                    className={cn(
                      ACTION_ROW_BASE_CLASS,
                      isHighlighted ? ACTION_ROW_HIGHLIGHTED_CLASS : ACTION_ROW_HOVER_CLASS,
                    )}
                    onMouseEnter={() => {
                      setHighlightedIndex(index);
                    }}
                    onClick={() => {
                      runItem(item);
                    }}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{item.label}</span>
                      {item.description ? <span className="block truncate text-xs text-muted-foreground">{item.description}</span> : null}
                    </span>
                    <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
                  </button>
                );
              }

              if (item.type === "dropdown") {
                return (
                  <button
                    key={item.id}
                    type="button"
                    data-highlighted={isHighlighted ? "true" : undefined}
                    aria-selected={isHighlighted}
                    className={cn(
                      ACTION_ROW_BASE_CLASS,
                      isHighlighted ? ACTION_ROW_HIGHLIGHTED_CLASS : ACTION_ROW_HOVER_CLASS,
                    )}
                    onMouseEnter={() => {
                      setHighlightedIndex(index);
                    }}
                    onClick={() => {
                      runItem(item);
                    }}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{item.label}</span>
                      {item.description ? <span className="block truncate text-xs text-muted-foreground">{item.description}</span> : null}
                    </span>
                    <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
                  </button>
                );
              }

              return (
                <button
                  key={item.id}
                  type="button"
                  data-highlighted={isHighlighted ? "true" : undefined}
                  aria-selected={isHighlighted}
                  className={cn(
                    ACTION_ROW_BASE_CLASS,
                    item.isSelected ? "bg-emerald-500/5" : "",
                    isHighlighted ? ACTION_ROW_HIGHLIGHTED_CLASS : ACTION_ROW_HOVER_CLASS,
                  )}
                  onClick={() => {
                    runItem(item);
                  }}
                  onMouseEnter={() => {
                    setHighlightedIndex(index);
                  }}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{item.label}</span>
                    {item.description ? <span className="block truncate text-xs text-muted-foreground">{item.description}</span> : null}
                  </span>
                  {item.shortcutKeyHint ? (
                    item.shortcutKeyHint === "Selected" ? (
                      <span className="inline-flex items-center gap-1 rounded-sm border border-emerald-700/20 bg-emerald-500/10 px-1.5 py-0.5 text-[11px] text-emerald-700">
                        <Check aria-hidden="true" className="size-3" />
                        {item.shortcutKeyHint}
                      </span>
                    ) : (
                      <span className="rounded-sm border bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                        {toShortcutDisplayLabel(item.shortcutKeyHint)}
                      </span>
                    )
                  ) : item.isSelected ? (
                    <span className="inline-flex items-center gap-1 rounded-sm border border-emerald-700/20 bg-emerald-500/10 px-1.5 py-0.5 text-[11px] text-emerald-700">
                      <Check aria-hidden="true" className="size-3" />
                      Selected
                    </span>
                  ) : item.id.includes(":") ? (
                    <Square aria-hidden="true" className="size-3.5 text-muted-foreground" />
                  ) : null}
                </button>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
