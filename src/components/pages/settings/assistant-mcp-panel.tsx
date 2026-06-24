"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Loader2, Plug, RefreshCw, X } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import {
  assistantConnectTransport,
  assistantValidateMcp,
  type AssistantValidateResponse,
} from "@/src/lib/ipc";

const FALLBACK_ENDPOINT = "http://127.0.0.1:4923/mcp";

function StatusRow({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li className="flex items-center gap-2 text-xs">
      {ok ? (
        <Check aria-hidden="true" className="size-3.5 shrink-0 text-green-600" />
      ) : (
        <X aria-hidden="true" className="size-3.5 shrink-0 text-red-600" />
      )}
      <span className={ok ? "text-foreground" : "text-muted-foreground"}>
        {label}
      </span>
    </li>
  );
}

export function AssistantMcpPanel() {
  const [validation, setValidation] =
    useState<AssistantValidateResponse | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectMessage, setConnectMessage] = useState<string | null>(null);
  const [connectError, setConnectError] = useState<string | null>(null);

  const runValidation = useCallback(async () => {
    setIsValidating(true);
    try {
      setValidation(await assistantValidateMcp());
    } catch (error) {
      setValidation(null);
      setConnectError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsValidating(false);
    }
  }, []);

  useEffect(() => {
    void runValidation();
  }, [runValidation]);

  const handleConnect = useCallback(async () => {
    setIsConnecting(true);
    setConnectMessage(null);
    setConnectError(null);
    try {
      const result = await assistantConnectTransport();
      if (result.ok) {
        setConnectMessage(result.message ?? "Connected.");
      } else {
        setConnectError(result.error ?? "Failed to connect the transport.");
      }
    } catch (error) {
      setConnectError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsConnecting(false);
      void runValidation();
    }
  }, [runValidation]);

  const endpoint = validation?.endpoint ?? FALLBACK_ENDPOINT;

  return (
    <div className="space-y-3 rounded-md border px-3 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-medium text-foreground">
            Claude Code MCP transport
          </h3>
          <p className="text-xs text-muted-foreground">
            Expose Groove&apos;s worktree tools to Claude Code over its local
            MCP endpoint, registered at user scope.
          </p>
          <p className="mt-1 truncate font-mono text-xs text-muted-foreground">
            {endpoint}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isConnecting}
            onClick={() => void handleConnect()}
          >
            {isConnecting ? (
              <Loader2 aria-hidden="true" className="size-4 animate-spin" />
            ) : (
              <Plug aria-hidden="true" className="size-4" />
            )}
            <span>Connect the transport</span>
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isValidating}
            onClick={() => void runValidation()}
          >
            {isValidating ? (
              <Loader2 aria-hidden="true" className="size-4 animate-spin" />
            ) : (
              <RefreshCw aria-hidden="true" className="size-4" />
            )}
            <span>Validate</span>
          </Button>
        </div>
      </div>

      {connectMessage && <p className="text-xs text-green-700">{connectMessage}</p>}
      {connectError && <p className="text-xs text-red-700">{connectError}</p>}

      <div className="rounded-md bg-muted/40 px-3 py-2">
        {isValidating && !validation ? (
          <p className="text-xs text-muted-foreground">Checking connection…</p>
        ) : validation ? (
          <>
            <ul className="space-y-1">
              <StatusRow
                ok={validation.serverRunning}
                label="Groove MCP server is running"
              />
              <StatusRow
                ok={validation.registeredInClaude}
                label="Registered in Claude Code"
              />
              <StatusRow
                ok={validation.claudeConnectionOk}
                label="Claude Code connects successfully"
              />
            </ul>
            {validation.details && (
              <p className="mt-2 truncate font-mono text-[11px] text-muted-foreground">
                {validation.details}
              </p>
            )}
            {validation.error && (
              <p className="mt-2 text-xs text-muted-foreground">
                {validation.error}
              </p>
            )}
          </>
        ) : (
          <p className="text-xs text-muted-foreground">
            Connection status unavailable.
          </p>
        )}
      </div>
    </div>
  );
}
