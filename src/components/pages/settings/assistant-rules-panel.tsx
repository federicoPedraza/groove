"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, X } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import {
  assistantRuleAdd,
  assistantRuleRemove,
  assistantRulesList,
  type AssistantRule,
  type AssistantRuleScope,
  type AssistantRulesListResponse,
} from "@/src/lib/ipc";

const SCOPES: AssistantRuleScope[] = ["project", "global"];

const SCOPE_META: Record<
  AssistantRuleScope,
  { title: string; describe: (workspace: string | null) => string }
> = {
  project: {
    title: "Project rules",
    describe: (workspace) =>
      workspace
        ? `Apply to the active workspace (${workspace}).`
        : "No workspace open — open one to add project rules.",
  },
  global: {
    title: "Global rules",
    describe: () => "Apply across every workspace on this device.",
  },
};

export function AssistantRulesPanel() {
  const [data, setData] = useState<AssistantRulesListResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<AssistantRuleScope, string>>({
    project: "",
    global: "",
  });
  const [busyScope, setBusyScope] = useState<AssistantRuleScope | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setData(await assistantRulesList());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleAdd = useCallback(
    async (scope: AssistantRuleScope) => {
      const text = drafts[scope].trim();
      if (!text) return;
      setBusyScope(scope);
      setError(null);
      try {
        const result = await assistantRuleAdd(scope, text);
        setData(result);
        if (result.error) setError(result.error);
        else setDrafts((prev) => ({ ...prev, [scope]: "" }));
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusyScope(null);
      }
    },
    [drafts],
  );

  const handleRemove = useCallback(
    async (scope: AssistantRuleScope, id: string) => {
      setBusyScope(scope);
      setError(null);
      try {
        const result = await assistantRuleRemove(scope, id);
        setData(result);
        if (result.error) setError(result.error);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusyScope(null);
      }
    },
    [],
  );

  const projectWorkspace = data?.projectWorkspace ?? null;

  const rulesFor = (scope: AssistantRuleScope): AssistantRule[] =>
    scope === "project" ? (data?.project ?? []) : (data?.global ?? []);

  return (
    <div className="space-y-4 rounded-md border px-3 py-3">
      <div>
        <h3 className="text-sm font-medium text-foreground">Assistant rules</h3>
        <p className="text-xs text-muted-foreground">
          Memories the assistant follows when driving Groove over MCP. The
          assistant can also manage these itself via the add_assistant_rule /
          remove_assistant_rule tools.
        </p>
      </div>

      {error && <p className="text-xs text-red-700">{error}</p>}

      {loading && !data ? (
        <p className="text-xs text-muted-foreground">Loading rules…</p>
      ) : (
        SCOPES.map((scope) => {
          const rules = rulesFor(scope);
          const disabled = scope === "project" && !projectWorkspace;
          return (
            <section key={scope} className="space-y-2">
              <div>
                <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {SCOPE_META[scope].title}
                </h4>
                <p className="text-xs text-muted-foreground">
                  {SCOPE_META[scope].describe(projectWorkspace)}
                </p>
              </div>

              {rules.length > 0 ? (
                <ul className="space-y-1">
                  {rules.map((rule) => (
                    <li
                      key={rule.id}
                      className="flex items-start gap-2 rounded-md border px-2 py-1.5"
                    >
                      <span className="flex-1 break-words text-xs">
                        {rule.text}
                      </span>
                      <button
                        type="button"
                        aria-label="Remove rule"
                        disabled={busyScope === scope}
                        onClick={() => void handleRemove(scope, rule.id)}
                        className="shrink-0 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
                      >
                        <X aria-hidden="true" className="size-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-muted-foreground">
                  No {scope} rules yet.
                </p>
              )}

              <div className="flex items-center gap-2">
                <Input
                  value={drafts[scope]}
                  disabled={disabled || busyScope === scope}
                  placeholder={
                    disabled
                      ? "Open a workspace to add project rules"
                      : `Add a ${scope} rule…`
                  }
                  onChange={(event) =>
                    setDrafts((prev) => ({
                      ...prev,
                      [scope]: event.target.value,
                    }))
                  }
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void handleAdd(scope);
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={
                    disabled || busyScope === scope || !drafts[scope].trim()
                  }
                  onClick={() => void handleAdd(scope)}
                >
                  {busyScope === scope ? (
                    <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                  ) : (
                    <Plus aria-hidden="true" className="size-4" />
                  )}
                  <span>Add</span>
                </Button>
              </div>
            </section>
          );
        })
      )}
    </div>
  );
}
