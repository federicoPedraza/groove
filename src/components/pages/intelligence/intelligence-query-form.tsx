"use client";

import { useEffect, useState } from "react";
import { Loader2, Trash2 } from "lucide-react";

import {
  DEFAULT_INTELLIGENCE_QUERY_COLOR,
  DEFAULT_INTELLIGENCE_QUERY_ICON,
  INTELLIGENCE_QUERY_COLORS,
  INTELLIGENCE_QUERY_ICONS,
} from "@/src/components/pages/intelligence/intelligence-query-options";
import { Button } from "@/src/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import { Input } from "@/src/components/ui/input";
import { cn } from "@/src/lib/utils";
import type { IntelligenceQueryRecord } from "@/src/lib/ipc";

type IntelligenceQueryFormProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sql: string;
  reference: IntelligenceQueryRecord | null;
  isSaving: boolean;
  isDeleting: boolean;
  onSubmit: (input: {
    name: string;
    color: string;
    icon: string;
  }) => Promise<void> | void;
  onDelete?: () => Promise<void> | void;
};

export function IntelligenceQueryForm({
  open,
  onOpenChange,
  sql,
  reference,
  isSaving,
  isDeleting,
  onSubmit,
  onDelete,
}: IntelligenceQueryFormProps) {
  const [name, setName] = useState("");
  const [color, setColor] = useState<string>(DEFAULT_INTELLIGENCE_QUERY_COLOR);
  const [icon, setIcon] = useState<string>(DEFAULT_INTELLIGENCE_QUERY_ICON);

  useEffect(() => {
    if (!open) return;
    if (reference) {
      setName(reference.name);
      setColor(reference.color);
      setIcon(reference.icon);
    } else {
      setName("");
      setColor(DEFAULT_INTELLIGENCE_QUERY_COLOR);
      setIcon(DEFAULT_INTELLIGENCE_QUERY_ICON);
    }
  }, [open, reference]);

  const trimmedName = name.trim();
  const trimmedSql = sql.trim();
  const canSubmit =
    trimmedName.length > 0 && trimmedSql.length > 0 && !isSaving && !isDeleting;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{reference ? "Edit query" : "Save query"}</DialogTitle>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!canSubmit) return;
            void onSubmit({
              name: trimmedName,
              color,
              icon,
            });
          }}
        >
          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">
              Name
            </span>
            <Input
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Get my tickets"
              maxLength={80}
              disabled={isSaving || isDeleting}
            />
          </label>

          <div className="space-y-1">
            <span className="text-xs font-medium text-muted-foreground">
              Color
            </span>
            <div className="flex flex-wrap gap-1.5">
              {INTELLIGENCE_QUERY_COLORS.map((option) => {
                const selected = option.id === color;
                return (
                  <button
                    key={option.id}
                    type="button"
                    aria-label={option.label}
                    aria-pressed={selected}
                    onClick={() => setColor(option.id)}
                    disabled={isSaving || isDeleting}
                    className={cn(
                      "size-7 rounded-full border-2 transition-colors disabled:opacity-50",
                      option.swatchClasses,
                      selected
                        ? "ring-2 ring-foreground/70 ring-offset-2 ring-offset-background"
                        : "hover:opacity-90",
                    )}
                  />
                );
              })}
            </div>
          </div>

          <div className="space-y-1">
            <span className="text-xs font-medium text-muted-foreground">
              Icon
            </span>
            <div className="grid grid-cols-6 gap-1.5">
              {INTELLIGENCE_QUERY_ICONS.map((option) => {
                const selected = option.id === icon;
                const Icon = option.Icon;
                return (
                  <button
                    key={option.id}
                    type="button"
                    aria-label={option.label}
                    aria-pressed={selected}
                    title={option.label}
                    onClick={() => setIcon(option.id)}
                    disabled={isSaving || isDeleting}
                    className={cn(
                      "flex size-9 items-center justify-center rounded-md border transition-colors disabled:opacity-50",
                      selected
                        ? "border-foreground bg-foreground/10 text-foreground"
                        : "border-border text-muted-foreground hover:border-foreground/50 hover:text-foreground",
                    )}
                  >
                    <Icon aria-hidden="true" className="size-4" />
                  </button>
                );
              })}
            </div>
          </div>

          <DialogFooter className="gap-2 sm:justify-between">
            {reference && onDelete ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isSaving || isDeleting}
                onClick={() => {
                  void onDelete();
                }}
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                {isDeleting ? (
                  <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                ) : (
                  <Trash2 aria-hidden="true" className="size-4" />
                )}
                <span>Delete</span>
              </Button>
            ) : (
              <span />
            )}
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={isSaving || isDeleting}
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={!canSubmit}>
                {isSaving ? (
                  <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                ) : null}
                <span>{reference ? "Update" : "Save"}</span>
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
