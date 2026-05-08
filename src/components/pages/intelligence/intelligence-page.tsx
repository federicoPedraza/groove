"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { Link } from "react-router-dom";
import {
  Copy,
  FilePlus2,
  Loader2,
  PawPrint,
  PencilRuler,
  Pencil,
  Play,
  Save,
} from "lucide-react";

import { DoctrineSection } from "@/src/components/pages/intelligence/doctrine-section";
import { DoctrineTable } from "@/src/components/pages/intelligence/doctrine-table";
import { DoubleScroll } from "@/src/components/pages/intelligence/double-scroll";
import { IntelligenceQueryChips } from "@/src/components/pages/intelligence/intelligence-query-chips";
import { IntelligenceQueryForm } from "@/src/components/pages/intelligence/intelligence-query-form";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/src/components/ui/popover";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/src/components/ui/table";
import {
  intelligenceQueryDelete,
  intelligenceQueryList,
  intelligenceQuerySave,
  motherduckQuery,
} from "@/src/lib/ipc";
import type {
  IntelligenceQueryRecord,
  MotherduckQueryResponse,
} from "@/src/lib/ipc";
import {
  getMotherduckStoreSnapshot,
  refreshMotherduckStatus,
  subscribeToMotherduckStore,
} from "@/src/lib/motherduck-store";
import { toast } from "@/src/lib/toast";
import { cn } from "@/src/lib/utils";

const DEFAULT_ROW_LIMIT = 1000;
const ROW_LIMIT_MIN = 1;
const ROW_LIMIT_MAX = 10_000;

export function IntelligencePage() {
  const motherduckSnapshot = useSyncExternalStore(
    subscribeToMotherduckStore,
    getMotherduckStoreSnapshot,
    getMotherduckStoreSnapshot,
  );

  const [sql, setSql] = useState("SELECT current_database(), current_user;");
  const [rowLimitText, setRowLimitText] = useState<string>(
    String(DEFAULT_ROW_LIMIT),
  );
  const [lastRunRowLimit, setLastRunRowLimit] = useState<number>(
    DEFAULT_ROW_LIMIT,
  );
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<MotherduckQueryResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const rowLimitParsed = useMemo<{ value: number | null; error: string | null }>(
    () => {
      const trimmed = rowLimitText.trim();
      if (trimmed.length === 0) {
        return { value: null, error: "Required." };
      }
      if (!/^\d+$/.test(trimmed)) {
        return { value: null, error: "Whole numbers only." };
      }
      const parsed = Number(trimmed);
      if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
        return { value: null, error: "Invalid number." };
      }
      if (parsed < ROW_LIMIT_MIN) {
        return { value: null, error: `Min ${ROW_LIMIT_MIN}.` };
      }
      if (parsed > ROW_LIMIT_MAX) {
        return {
          value: null,
          error: `Max ${ROW_LIMIT_MAX.toLocaleString()}.`,
        };
      }
      return { value: parsed, error: null };
    },
    [rowLimitText],
  );

  const [queries, setQueries] = useState<IntelligenceQueryRecord[]>([]);
  const [editingQueryId, setEditingQueryId] = useState<string | null>(null);
  const [isSaveOpen, setIsSaveOpen] = useState(false);
  const [isSavingQuery, setIsSavingQuery] = useState(false);
  const [isDeletingQuery, setIsDeletingQuery] = useState(false);

  const copyCellValue = useCallback((value: string) => {
    if (typeof navigator.clipboard?.writeText !== "function") {
      toast.error("Clipboard not available.");
      return;
    }
    void navigator.clipboard
      .writeText(value)
      .then(() => toast.success("Cell copied to clipboard."))
      .catch(() => toast.error("Failed to copy cell."));
  }, []);

  useEffect(() => {
    void refreshMotherduckStatus();
  }, []);

  useEffect(() => {
    let cancelled = false;
    void intelligenceQueryList()
      .then((response) => {
        if (cancelled) return;
        if (response.ok) {
          setQueries(response.queries);
        }
      })
      .catch(() => {
        // Silent — chips simply stay empty.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const editingQuery = useMemo(
    () =>
      editingQueryId
        ? (queries.find((q) => q.id === editingQueryId) ?? null)
        : null,
    [queries, editingQueryId],
  );

  const runQuery = useCallback(async () => {
    const trimmed = sql.trim();
    if (!trimmed) {
      setErrorMessage("Enter a SQL statement to run.");
      return;
    }
    if (rowLimitParsed.value === null) {
      setErrorMessage(
        `Row limit: ${rowLimitParsed.error ?? "invalid value."}`,
      );
      return;
    }

    setIsRunning(true);
    setErrorMessage(null);
    const rowLimit = rowLimitParsed.value;
    setLastRunRowLimit(rowLimit);

    try {
      const response = await motherduckQuery({
        sql: trimmed,
        rowLimit,
      });
      setResult(response);
      if (!response.ok && response.error) {
        setErrorMessage(response.error);
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Query failed.";
      setErrorMessage(message);
      setResult(null);
    } finally {
      setIsRunning(false);
    }
  }, [sql, rowLimitParsed]);

  const handleSqlKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      void runQuery();
    }
  };

  const handleSelectQuery = useCallback(
    (record: IntelligenceQueryRecord) => {
      if (record.id === editingQueryId) {
        setEditingQueryId(null);
        return;
      }
      setSql(record.sql);
      setEditingQueryId(record.id);
    },
    [editingQueryId],
  );

  const handleNewQuery = useCallback(() => {
    setEditingQueryId(null);
    setSql("");
  }, []);

  const handleSubmitSave = useCallback(
    async (input: { name: string; color: string; icon: string }) => {
      const trimmedSql = sql.trim();
      if (!trimmedSql) {
        toast.error("SQL cannot be empty.");
        return;
      }
      setIsSavingQuery(true);
      try {
        const response = await intelligenceQuerySave({
          id: editingQueryId,
          name: input.name,
          sql: trimmedSql,
          color: input.color,
          icon: input.icon,
        });
        if (response.ok) {
          setQueries(response.queries);
          if (response.savedId) {
            setEditingQueryId(response.savedId);
          }
          setIsSaveOpen(false);
          toast.success(editingQueryId ? "Query updated." : "Query saved.");
        } else {
          toast.error(response.error ?? "Failed to save query.");
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to save query.";
        toast.error(message);
      } finally {
        setIsSavingQuery(false);
      }
    },
    [editingQueryId, sql],
  );

  const handleDeleteQuery = useCallback(async () => {
    if (!editingQueryId) return;
    setIsDeletingQuery(true);
    try {
      const response = await intelligenceQueryDelete({ id: editingQueryId });
      if (response.ok) {
        setQueries(response.queries);
        setEditingQueryId(null);
        setIsSaveOpen(false);
        toast.success("Query deleted.");
      } else {
        toast.error(response.error ?? "Failed to delete query.");
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to delete query.";
      toast.error(message);
    } finally {
      setIsDeletingQuery(false);
    }
  }, [editingQueryId]);

  const motherduckUnconfigured =
    motherduckSnapshot.hasLoadedOnce && !motherduckSnapshot.tokenPresent;

  if (motherduckUnconfigured) {
    return (
      <section className="mx-auto w-full max-w-6xl space-y-4 p-4 md:p-6">
        <header className="flex items-center gap-3">
          <PencilRuler aria-hidden="true" className="size-6" />
          <div>
            <h1 className="text-lg font-semibold">Intelligence</h1>
            <p className="text-sm text-muted-foreground">
              Run prompts and queries against your MotherDuck workspace.
            </p>
          </div>
        </header>
        <div className="rounded-md border border-dashed bg-muted/30 px-4 py-6 text-sm">
          <p className="font-medium">MotherDuck is not configured.</p>
          <p className="mt-1 text-muted-foreground">
            Add a bearer token in{" "}
            <Link
              to="/settings"
              className="font-medium underline underline-offset-2 hover:text-foreground"
            >
              Stronghold → Integrations → MotherDuck
            </Link>{" "}
            to start querying.
          </p>
        </div>
        <DoctrineSection />
        <DoctrineTable />
      </section>
    );
  }

  const sqlIsEmpty = sql.trim().length === 0;
  const isEditing = editingQuery !== null;

  return (
    <section className="mx-auto w-full max-w-6xl space-y-4 p-4 md:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <PencilRuler aria-hidden="true" className="size-6" />
          <div>
            <h1 className="text-lg font-semibold">Intelligence</h1>
            <p className="text-sm text-muted-foreground">
              {motherduckSnapshot.defaultDatabase
                ? `Connected via md:${motherduckSnapshot.defaultDatabase}`
                : "Connected via md: (no default database)"}
            </p>
          </div>
        </div>
      </header>

      <div className="space-y-3 rounded-md border bg-card p-3">
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-muted-foreground">
              Saved queries
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 gap-1 px-2 text-xs"
              onClick={handleNewQuery}
              disabled={isRunning}
            >
              <FilePlus2 aria-hidden="true" className="size-3.5" />
              <span>New</span>
            </Button>
          </div>
          <IntelligenceQueryChips
            queries={queries}
            activeId={editingQueryId}
            onSelect={handleSelectQuery}
          />
        </div>

        <div className="space-y-2">
          <label
            htmlFor="intelligence-sql"
            className="text-xs font-medium text-muted-foreground"
          >
            SQL (Cmd/Ctrl + Enter to run)
          </label>
          <textarea
            id="intelligence-sql"
            className="min-h-48 max-h-[70vh] w-full resize-y rounded-md border bg-background p-2 font-mono text-sm shadow-sm outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
            value={sql}
            spellCheck={false}
            onChange={(event) => setSql(event.target.value)}
            onKeyDown={handleSqlKeyDown}
            disabled={isRunning}
            placeholder="SELECT * FROM tickets WHERE status = 'open' LIMIT 10;"
          />
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="flex flex-col gap-1">
              <label
                htmlFor="intelligence-row-limit"
                className="flex items-center gap-2 text-xs text-muted-foreground"
              >
                Row limit
                <Input
                  id="intelligence-row-limit"
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  spellCheck={false}
                  value={rowLimitText}
                  disabled={isRunning}
                  aria-invalid={rowLimitParsed.error !== null}
                  aria-describedby={
                    rowLimitParsed.error
                      ? "intelligence-row-limit-error"
                      : undefined
                  }
                  className={cn(
                    "h-8 w-16 tabular-nums",
                    rowLimitParsed.error &&
                      "border-destructive focus-visible:border-destructive focus-visible:ring-destructive/30",
                  )}
                  onChange={(event) => {
                    const next = event.target.value;
                    // Allow only digits while typing — empty string is OK so
                    // the user can backspace before re-entering.
                    if (/^\d*$/.test(next)) {
                      setRowLimitText(next);
                    }
                  }}
                  onBlur={() => {
                    // Normalize on blur when valid (e.g. strip leading zeros).
                    if (rowLimitParsed.value !== null) {
                      setRowLimitText(String(rowLimitParsed.value));
                    }
                  }}
                />
              </label>
              {rowLimitParsed.error ? (
                <span
                  id="intelligence-row-limit-error"
                  className="text-xs text-destructive"
                >
                  {rowLimitParsed.error}
                </span>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={isRunning || sqlIsEmpty}
                onClick={() => setIsSaveOpen(true)}
              >
                {isEditing ? (
                  <Pencil aria-hidden="true" className="size-4" />
                ) : (
                  <Save aria-hidden="true" className="size-4" />
                )}
                <span>{isEditing ? "Edit" : "Save"}</span>
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={
                  isRunning || sqlIsEmpty || rowLimitParsed.error !== null
                }
                onClick={() => void runQuery()}
              >
                {isRunning ? (
                  <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                ) : (
                  <Play aria-hidden="true" className="size-4" />
                )}
                <span>{isRunning ? "Running…" : "Run query"}</span>
              </Button>
            </div>
          </div>
        </div>
      </div>

      <IntelligenceQueryForm
        open={isSaveOpen}
        onOpenChange={setIsSaveOpen}
        sql={sql}
        reference={editingQuery}
        isSaving={isSavingQuery}
        isDeleting={isDeletingQuery}
        onSubmit={handleSubmitSave}
        onDelete={editingQuery ? handleDeleteQuery : undefined}
      />

      {errorMessage && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {errorMessage}
        </div>
      )}

      {result?.ok && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span>
                {result.rowCount} row{result.rowCount === 1 ? "" : "s"}
                {result.truncated
                  ? ` (truncated at ${lastRunRowLimit.toLocaleString()})`
                  : ""}
              </span>
              {typeof result.latencyMs === "number" && (
                <span>{result.latencyMs} ms</span>
              )}
            </div>
            {result.rows.length > 0 ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  // Reserved — wired up in a future change.
                }}
              >
                <PawPrint aria-hidden="true" className="size-4" />
                <span>Start hunt</span>
              </Button>
            ) : null}
          </div>
          <div className="flex min-h-[240px] flex-col overflow-hidden rounded-md border">
            {result.columns.length > 0 ? (
              <DoubleScroll
                className="flex-1"
                viewportClassName="[&_[data-slot=table-container]]:overflow-x-visible"
              >
                <div className="[&_table]:border-collapse [&_th]:border-r [&_th]:border-border [&_td]:border-r [&_td]:border-border [&_tr>th:last-child]:border-r-0 [&_tr>td:last-child]:border-r-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {result.columns.map((column, columnIndex) => (
                          <TableHead
                            key={`${column}-${columnIndex}`}
                            className="max-w-[240px] truncate"
                            title={column || `column_${columnIndex}`}
                          >
                            {column || `column_${columnIndex}`}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {result.rows.length === 0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={result.columns.length}
                            className="h-48 text-center align-middle text-sm text-muted-foreground"
                          >
                            No results.
                          </TableCell>
                        </TableRow>
                      ) : (
                        result.rows.map((row, rowIndex) => (
                          <TableRow key={rowIndex}>
                            {row.map((cell, cellIndex) => {
                              const columnLabel =
                                result.columns[cellIndex] ??
                                `column_${cellIndex}`;
                              return (
                                <TableCell
                                  key={cellIndex}
                                  className="p-0 align-top"
                                >
                                  <Popover>
                                    <PopoverTrigger asChild>
                                      <button
                                        type="button"
                                        className="block w-full max-w-[240px] truncate px-2 py-2 text-left font-mono text-xs hover:bg-muted/40 focus-visible:bg-muted/60 focus-visible:outline-none"
                                      >
                                        {cell.length > 0 ? (
                                          cell
                                        ) : (
                                          <span className="text-muted-foreground">
                                            —
                                          </span>
                                        )}
                                      </button>
                                    </PopoverTrigger>
                                    <PopoverContent
                                      align="start"
                                      className="w-96 max-w-[90vw] space-y-2 p-3"
                                    >
                                      <div className="flex items-center gap-2">
                                        <span className="flex-1 truncate font-mono text-xs font-semibold">
                                          {columnLabel}
                                        </span>
                                        <Button
                                          type="button"
                                          variant="outline"
                                          size="sm"
                                          className="h-7 w-7 p-0"
                                          onClick={() => copyCellValue(cell)}
                                          aria-label="Copy cell value"
                                        >
                                          <Copy
                                            aria-hidden="true"
                                            className="size-3.5"
                                          />
                                        </Button>
                                      </div>
                                      <pre className="max-h-[60vh] min-h-12 overflow-auto whitespace-pre-wrap break-words rounded-sm border bg-muted/30 p-2 font-mono text-xs">
                                        {cell}
                                      </pre>
                                    </PopoverContent>
                                  </Popover>
                                </TableCell>
                              );
                            })}
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </DoubleScroll>
            ) : (
              <div className="flex flex-1 items-center justify-center px-3 py-12 text-center text-sm text-muted-foreground">
                Query returned no columns.
              </div>
            )}
          </div>
        </div>
      )}

      <DoctrineSection />
      <DoctrineTable />
    </section>
  );
}
