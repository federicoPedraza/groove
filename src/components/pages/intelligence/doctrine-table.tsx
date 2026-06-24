"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BookOpen,
  Check,
  ChevronRight,
  Copy,
  Loader2,
} from "lucide-react";
import Markdown from "react-markdown";

import {
  DELETED_STATUS_CLASSES,
  READY_STATUS_CLASSES,
  SOFT_GREEN_BUTTON_CLASSES,
} from "@/src/components/pages/barracks/constants";
import {
  publishDoctrines,
  subscribeDoctrines,
} from "@/src/components/pages/intelligence/doctrine-events";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/src/components/ui/collapsible";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/src/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import { doctrineList, doctrineSetActive } from "@/src/lib/ipc";
import type { DoctrineRecord } from "@/src/lib/ipc";
import { toast } from "@/src/lib/toast";

const NUMBER_FORMAT = new Intl.NumberFormat();

function formatDate(value: string): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function findActive(doctrines: DoctrineRecord[]): DoctrineRecord | null {
  return doctrines.find((d) => d.state === "ready") ?? null;
}

export function DoctrineTable() {
  const [doctrines, setDoctrines] = useState<DoctrineRecord[]>([]);
  const [pendingSetActiveId, setPendingSetActiveId] = useState<string | null>(
    null,
  );
  const [pendingCopyId, setPendingCopyId] = useState<string | null>(null);
  const [activePreviewOpen, setActivePreviewOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void doctrineList()
      .then((response) => {
        if (cancelled) return;
        if (response.ok) {
          setDoctrines(response.doctrines);
        }
      })
      .catch(() => {
        // Silent — table simply stays empty.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => subscribeDoctrines(setDoctrines), []);

  const activeDoctrine = useMemo(() => findActive(doctrines), [doctrines]);

  const handleSetActive = useCallback(async (id: string) => {
    setPendingSetActiveId(id);
    try {
      const response = await doctrineSetActive({ id });
      if (response.ok) {
        setDoctrines(response.doctrines);
        publishDoctrines(response.doctrines);
      } else {
        toast.error(response.error ?? "Failed to set active doctrine.");
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to set active doctrine.";
      toast.error(message);
    } finally {
      setPendingSetActiveId(null);
    }
  }, []);

  const copyDoctrineRow = useCallback((doctrine: DoctrineRecord) => {
    if (typeof navigator.clipboard?.writeText !== "function") {
      toast.error("Clipboard not available.");
      return;
    }
    setPendingCopyId(doctrine.id);
    void navigator.clipboard
      .writeText(doctrine.result)
      .then(() => toast.success("Markdown copied to clipboard."))
      .catch(() => toast.error("Failed to copy markdown."))
      .finally(() => {
        setTimeout(() => setPendingCopyId(null), 200);
      });
  }, []);

  return (
    <div
      role="region"
      aria-label="Stored doctrines table"
      className="rounded-lg border bg-card"
    >
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Stored doctrines
        </h3>
        <span className="ml-auto text-xs text-muted-foreground">
          {NUMBER_FORMAT.format(doctrines.length)}{" "}
          {doctrines.length === 1 ? "entry" : "entries"}
        </span>
      </div>

      {doctrines.length === 0 ? (
        <p className="px-3 py-6 text-center text-sm text-muted-foreground">
          No doctrines yet. Generate a report and run step 2 to create one.
        </p>
      ) : (
        <TooltipProvider delayDuration={200}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Input tokens</TableHead>
                <TableHead className="text-right">Output tokens</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {doctrines.map((doctrine) => {
                const isReady = doctrine.state === "ready";
                const isPendingSet = pendingSetActiveId === doctrine.id;
                const isPendingCopy = pendingCopyId === doctrine.id;
                return (
                  <TableRow key={doctrine.id}>
                    <TableCell>
                      <div className="flex items-center gap-2 px-2 py-1">
                        <span className="min-w-0 flex-1 truncate">
                          {formatDate(doctrine.createdAt)}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge variant="outline" className="tabular-nums">
                        {NUMBER_FORMAT.format(doctrine.inputTokens)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge variant="outline" className="tabular-nums">
                        {NUMBER_FORMAT.format(doctrine.outputTokens)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={
                          isReady
                            ? `gap-1 ${READY_STATUS_CLASSES}`
                            : `gap-1 ${DELETED_STATUS_CLASSES}`
                        }
                      >
                        {isReady ? (
                          <Check aria-hidden="true" className="size-3" />
                        ) : null}
                        {isReady ? "Ready" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                              disabled={isPendingCopy}
                              onClick={() => copyDoctrineRow(doctrine)}
                              aria-label="Copy doctrine markdown"
                            >
                              {isPendingCopy ? (
                                <Loader2
                                  aria-hidden="true"
                                  className="size-4 animate-spin"
                                />
                              ) : (
                                <Copy aria-hidden="true" className="size-4" />
                              )}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Copy markdown</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className={`h-8 w-8 p-0 ${SOFT_GREEN_BUTTON_CLASSES}`}
                              disabled={isReady || isPendingSet}
                              onClick={() => void handleSetActive(doctrine.id)}
                              aria-label={
                                isReady
                                  ? "This doctrine is the current preview"
                                  : "Set as current doctrine preview"
                              }
                            >
                              {isPendingSet ? (
                                <Loader2
                                  aria-hidden="true"
                                  className="size-4 animate-spin"
                                />
                              ) : (
                                <BookOpen
                                  aria-hidden="true"
                                  className="size-4"
                                />
                              )}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            {isReady ? "Current preview" : "Set as preview"}
                          </TooltipContent>
                        </Tooltip>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TooltipProvider>
      )}

      {activeDoctrine ? (
        <Collapsible
          open={activePreviewOpen}
          onOpenChange={setActivePreviewOpen}
        >
          <CollapsibleTrigger className="group flex w-full items-center gap-2 border-t px-3 py-2 text-left text-xs text-muted-foreground hover:text-foreground">
            <ChevronRight
              aria-hidden="true"
              className="size-3.5 transition-transform group-data-[state=open]:rotate-90"
            />
            <span className="font-medium">Doctrine preview</span>
            <span className="font-mono">
              · {formatDate(activeDoctrine.createdAt)}
            </span>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="space-y-3 px-3 pb-3 pt-1">
              {activeDoctrine.instructions ? (
                <div className="rounded-md border border-dashed bg-muted/20 p-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Extra instructions
                  </p>
                  <p className="mt-1 whitespace-pre-wrap font-mono text-xs">
                    {activeDoctrine.instructions}
                  </p>
                </div>
              ) : null}
              <div className="prose prose-sm dark:prose-invert max-h-[480px] max-w-none overflow-auto break-words">
                <Markdown>{activeDoctrine.result}</Markdown>
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>
      ) : null}
    </div>
  );
}
