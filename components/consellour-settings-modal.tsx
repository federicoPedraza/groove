"use client";

import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Dropdown } from "@/components/ui/dropdown";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { ConsellourSettings } from "@/src/lib/ipc";

const MODEL_OPTIONS = [
  "gpt-5.3-codex",
  "gpt-5.1",
  "gpt-4.1",
  "gpt-4o-mini",
] as const;

const REASONING_OPTIONS = ["low", "medium", "high"] as const;

type ConsellourSettingsModalProps = {
  open: boolean;
  settings: ConsellourSettings | null;
  savePending: boolean;
  errorMessage: string | null;
  onOpenChange: (open: boolean) => void;
  onSave: (payload: { openaiApiKey?: string; model: string; reasoningLevel: "low" | "medium" | "high" }) => void;
};

export function ConsellourSettingsModal({
  open,
  settings,
  savePending,
  errorMessage,
  onOpenChange,
  onSave,
}: ConsellourSettingsModalProps) {
  const [openAiKeyDraft, setOpenAiKeyDraft] = useState("");
  const [modelDraft, setModelDraft] = useState("gpt-5.3-codex");
  const [reasoningDraft, setReasoningDraft] = useState<"low" | "medium" | "high">("medium");
  const isOpenAiKeyConfigured = Boolean(settings?.openaiApiKey);

  useEffect(() => {
    if (!open) {
      return;
    }
    setOpenAiKeyDraft("");
    setModelDraft(settings?.model ?? "gpt-5.3-codex");
    setReasoningDraft(settings?.reasoningLevel ?? "medium");
  }, [open, settings?.model, settings?.reasoningLevel]);

  const modelOptions = useMemo(
    () => MODEL_OPTIONS.map((value) => ({ value, label: value })),
    [],
  );
  const reasoningOptions = useMemo(
    () => REASONING_OPTIONS.map((value) => ({ value, label: value })),
    [],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (savePending) {
              return;
            }

            const trimmedKey = openAiKeyDraft.trim();
            onSave({
              openaiApiKey: trimmedKey.length > 0 ? trimmedKey : undefined,
              model: modelDraft,
              reasoningLevel: reasoningDraft,
            });
          }}
        >
          <DialogHeader>
            <DialogTitle>Consellour settings</DialogTitle>
            <DialogDescription>
              Update workspace-scoped OpenAI settings for Consellour. Leave key blank to keep the current key.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <label htmlFor="consellour-openai-key" className="text-sm font-medium">Replace OpenAI key</label>
            <div className="flex w-full">
              <Input
                id="consellour-openai-key"
                type="password"
                value={openAiKeyDraft}
                onChange={(event) => {
                  setOpenAiKeyDraft(event.target.value);
                }}
                placeholder="sk-proj-..."
                autoComplete="off"
                disabled={savePending}
                className="rounded-r-none border-r-0"
              />
              <div
                className={`inline-flex shrink-0 items-center justify-center rounded-l-none rounded-r-md border border-input px-3 ${
                  isOpenAiKeyConfigured ? "bg-primary/20" : "bg-primary/10"
                } ${savePending ? "opacity-60" : "opacity-100"}`}
              >
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        aria-label={isOpenAiKeyConfigured ? "Connected" : "Not connected"}
                        className="relative h-3 w-3 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                      >
                        {isOpenAiKeyConfigured ? <span className="absolute inset-0 rounded-full bg-primary/20 animate-ping" /> : null}
                        <span
                          className={`relative z-10 block h-full w-full rounded-full ${
                            isOpenAiKeyConfigured ? "bg-primary/90" : "bg-primary/40"
                          }`}
                        />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>{isOpenAiKeyConfigured ? "Connected" : "Not connected"}</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Model</label>
            <Dropdown
              ariaLabel="Consellour model"
              options={modelOptions}
              value={modelDraft}
              placeholder="Select model"
              onValueChange={(value) => {
                setModelDraft(value);
              }}
              disabled={savePending}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Reasoning level</label>
            <Dropdown
              ariaLabel="Consellour reasoning level"
              options={reasoningOptions}
              value={reasoningDraft}
              placeholder="Select reasoning level"
              onValueChange={(value) => {
                if (value === "low" || value === "medium" || value === "high") {
                  setReasoningDraft(value);
                }
              }}
              disabled={savePending}
            />
          </div>

          {errorMessage ? <p className="text-xs text-destructive">{errorMessage}</p> : null}

          <DialogFooter>
            <Button type="button" variant="outline" disabled={savePending} onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={savePending}>Save</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
