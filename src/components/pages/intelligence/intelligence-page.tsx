"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { Link } from "react-router-dom";
import { Loader2, PencilRuler, Play } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/src/components/ui/table";
import { motherduckQuery } from "@/src/lib/ipc";
import type { MotherduckQueryResponse } from "@/src/lib/ipc";
import {
  getMotherduckStoreSnapshot,
  refreshMotherduckStatus,
  subscribeToMotherduckStore,
} from "@/src/lib/motherduck-store";

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
  const [rowLimit, setRowLimit] = useState<number>(DEFAULT_ROW_LIMIT);
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<MotherduckQueryResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    void refreshMotherduckStatus();
  }, []);

  const runQuery = useCallback(async () => {
    const trimmed = sql.trim();
    if (!trimmed) {
      setErrorMessage("Enter a SQL statement to run.");
      return;
    }

    setIsRunning(true);
    setErrorMessage(null);

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
  }, [sql, rowLimit]);

  const handleSqlKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      void runQuery();
    }
  };

  if (motherduckSnapshot.hasLoadedOnce && !motherduckSnapshot.tokenPresent) {
    return (
      <section className="mx-auto w-full max-w-4xl space-y-4 p-4 md:p-6">
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
      </section>
    );
  }

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

      <div className="space-y-2 rounded-md border bg-card p-3">
        <label
          htmlFor="intelligence-sql"
          className="text-xs font-medium text-muted-foreground"
        >
          SQL (Cmd/Ctrl + Enter to run)
        </label>
        <textarea
          id="intelligence-sql"
          className="min-h-32 w-full resize-y rounded-md border bg-background p-2 font-mono text-sm shadow-sm outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
          value={sql}
          spellCheck={false}
          onChange={(event) => setSql(event.target.value)}
          onKeyDown={handleSqlKeyDown}
          disabled={isRunning}
          placeholder="SELECT * FROM my_table LIMIT 10;"
        />
        <div className="flex flex-wrap items-end justify-between gap-3">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            Row limit
            <Input
              type="number"
              min={ROW_LIMIT_MIN}
              max={ROW_LIMIT_MAX}
              value={rowLimit}
              disabled={isRunning}
              className="h-8 w-24"
              onChange={(event) => {
                const next = Number(event.target.value);
                if (Number.isFinite(next)) {
                  setRowLimit(
                    Math.min(
                      ROW_LIMIT_MAX,
                      Math.max(ROW_LIMIT_MIN, Math.floor(next)),
                    ),
                  );
                }
              }}
            />
          </label>
          <Button
            type="button"
            size="sm"
            disabled={isRunning || sql.trim().length === 0}
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

      {errorMessage && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {errorMessage}
        </div>
      )}

      {result?.ok && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>
              {result.rowCount} row{result.rowCount === 1 ? "" : "s"}
              {result.truncated ? ` (truncated at ${rowLimit})` : ""}
            </span>
            {typeof result.latencyMs === "number" && (
              <span>{result.latencyMs} ms</span>
            )}
          </div>
          {result.columns.length > 0 ? (
            <div className="overflow-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    {result.columns.map((column, columnIndex) => (
                      <TableHead key={`${column}-${columnIndex}`}>
                        {column || `column_${columnIndex}`}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.rows.map((row, rowIndex) => (
                    <TableRow key={rowIndex}>
                      {row.map((cell, cellIndex) => (
                        <TableCell
                          key={cellIndex}
                          className="font-mono text-xs"
                        >
                          {cell}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
              Query returned no columns.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
