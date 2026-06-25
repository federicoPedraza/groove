"use client";

import { useCallback, useState } from "react";
import {
  BrainCircuit,
  ChevronRight,
  Copy,
  Loader2,
  ScrollText,
  Sparkles,
} from "lucide-react";

import { publishDoctrines } from "@/src/components/pages/intelligence/doctrine-events";
import { Button } from "@/src/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/src/components/ui/collapsible";
import {
  doctrineGenerateReport,
  doctrineGenerateResult,
} from "@/src/lib/ipc";
import type { DoctrineReportResponse } from "@/src/lib/ipc";
import { toast } from "@/src/lib/toast";

const NUMBER_FORMAT = new Intl.NumberFormat();

function formatDate(value: string): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export function DoctrineSection() {
  const [isRunningReport, setIsRunningReport] = useState(false);
  const [report, setReport] = useState<DoctrineReportResponse | null>(null);
  const [reportError, setReportError] = useState<string | null>(null);

  const [isGeneratingResult, setIsGeneratingResult] = useState(false);
  const [resultError, setResultError] = useState<string | null>(null);
  const [instructions, setInstructions] = useState("");

  const runReport = useCallback(async () => {
    setIsRunningReport(true);
    setReportError(null);

    try {
      const response = await doctrineGenerateReport();
      setReport(response);
      if (!response.ok && response.error) {
        setReportError(response.error);
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Doctrine report failed.";
      setReportError(message);
      setReport(null);
    } finally {
      setIsRunningReport(false);
    }
  }, []);

  const runResult = useCallback(async () => {
    if (!report?.ok || !report.reportText) {
      toast.error("Generate a doctrine report first.");
      return;
    }
    setIsGeneratingResult(true);
    setResultError(null);

    try {
      const trimmedInstructions = instructions.trim();
      const response = await doctrineGenerateResult({
        reportText: report.reportText,
        instructions: trimmedInstructions.length > 0 ? trimmedInstructions : null,
      });
      if (response.ok) {
        publishDoctrines(response.doctrines);
        toast.success("Doctrine result generated.");
      } else {
        setResultError(response.error ?? "Doctrine result failed.");
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Doctrine result failed.";
      setResultError(message);
    } finally {
      setIsGeneratingResult(false);
    }
  }, [report, instructions]);

  const copyReport = useCallback(() => {
    if (!report?.reportText) return;
    if (typeof navigator.clipboard?.writeText !== "function") {
      toast.error("Clipboard not available.");
      return;
    }
    void navigator.clipboard
      .writeText(report.reportText)
      .then(() => toast.success("Report copied to clipboard."))
      .catch(() => toast.error("Failed to copy report."));
  }, [report]);

  return (
    <div className="space-y-2 rounded-md border bg-card p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <ScrollText
            aria-hidden="true"
            className="mt-0.5 size-4 text-muted-foreground"
          />
          <div>
            <h2 className="text-sm font-semibold">Doctrine</h2>
            <p className="text-xs text-muted-foreground">
              Build a report from up to 15 worktrees that have a Claude conversation
              and at least one summary. Step 1 of 2.
            </p>
          </div>
        </div>
        <Button
          type="button"
          size="sm"
          disabled={isRunningReport}
          onClick={() => void runReport()}
        >
          {isRunningReport ? (
            <Loader2 aria-hidden="true" className="size-4 animate-spin" />
          ) : (
            <Sparkles aria-hidden="true" className="size-4" />
          )}
          <span>{isRunningReport ? "Generating…" : "Generate report"}</span>
        </Button>
      </div>

      {reportError && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {reportError}
        </div>
      )}

      {report?.ok && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
            <span>
              {NUMBER_FORMAT.format(report.worktreesQualified)} qualified /{" "}
              {NUMBER_FORMAT.format(report.worktreesScanned)} scanned ·{" "}
              {NUMBER_FORMAT.format(report.inputTokens)} input tokens
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={copyReport}
              disabled={!report.reportText}
            >
              <Copy aria-hidden="true" className="size-3.5" />
              <span>Copy report</span>
            </Button>
          </div>

          {report.cases.length === 0 ? (
            <p className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
              No worktrees qualified. A worktree needs a Claude conversation and at
              least one summary to be included.
            </p>
          ) : (
            <>
              <div className="space-y-2 rounded-md border border-dashed bg-muted/20 px-3 py-2">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="text-xs text-muted-foreground">
                    Step 2 — analyze the report with Claude. This spawns a
                    non-interactive <code className="font-mono">claude -p</code>{" "}
                    session and stores the result in{" "}
                    <code className="font-mono">.groove/doctrines.json</code>.
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="default"
                    disabled={isGeneratingResult}
                    onClick={() => void runResult()}
                  >
                    {isGeneratingResult ? (
                      <Loader2
                        aria-hidden="true"
                        className="size-4 animate-spin"
                      />
                    ) : (
                      <BrainCircuit aria-hidden="true" className="size-4" />
                    )}
                    <span>
                      {isGeneratingResult
                        ? "Analyzing…"
                        : "Generate doctrine result"}
                    </span>
                  </Button>
                </div>
                <label
                  htmlFor="doctrine-extra-instructions"
                  className="block space-y-1"
                >
                  <span className="text-xs font-medium text-muted-foreground">
                    Extra instructions (optional)
                  </span>
                  <textarea
                    id="doctrine-extra-instructions"
                    value={instructions}
                    onChange={(event) => setInstructions(event.target.value)}
                    disabled={isGeneratingResult}
                    rows={3}
                    placeholder="Focus on bug patterns, ignore work older than 7 days, etc."
                    className="min-h-16 w-full resize-y rounded-2xs border bg-background p-2 font-mono text-xs shadow-sm outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                  />
                </label>
              </div>

              {resultError && (
                <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                  {resultError}
                </div>
              )}

              <ul className="space-y-2">
                {report.cases.map((doctrineCase, index) => (
                  <li
                    key={`${doctrineCase.branch}-${index}`}
                    className="rounded-md border bg-background"
                  >
                    <Collapsible>
                      <CollapsibleTrigger className="group flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted/40">
                        <ChevronRight
                          aria-hidden="true"
                          className="size-3.5 text-muted-foreground transition-transform group-data-[state=open]:rotate-90"
                        />
                        <span className="font-mono text-xs">
                          {doctrineCase.branch}
                        </span>
                        <span className="ml-auto text-xs text-muted-foreground">
                          {formatDate(doctrineCase.date)} ·{" "}
                          {doctrineCase.prompts.length} prompt
                          {doctrineCase.prompts.length === 1 ? "" : "s"}
                        </span>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="space-y-3 border-t px-3 py-2 text-sm">
                        {doctrineCase.summary && (
                          <div>
                            <p className="text-xs font-medium text-muted-foreground">
                              Summary
                            </p>
                            <p className="mt-1 whitespace-pre-wrap text-sm">
                              {doctrineCase.summary}
                            </p>
                          </div>
                        )}
                        <div>
                          <p className="text-xs font-medium text-muted-foreground">
                            Prompts
                          </p>
                          <ol className="mt-1 list-decimal space-y-1 pl-5">
                            {doctrineCase.prompts.map((prompt, promptIndex) => (
                              <li
                                key={promptIndex}
                                className="whitespace-pre-wrap break-words text-xs"
                              >
                                {prompt}
                              </li>
                            ))}
                          </ol>
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}
