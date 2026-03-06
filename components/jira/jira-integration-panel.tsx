"use client";

import { useState } from "react";
import { Loader2, Plug, RefreshCw, Unplug } from "lucide-react";

import { JiraSettingsModal } from "@/components/jira/jira-settings-modal";
import { Button } from "@/components/ui/button";
import type { JiraSettings } from "@/src/lib/ipc";

type JiraIntegrationPanelProps = {
  title: string;
  settings: JiraSettings | null;
  connected: boolean;
  statusMessage: string | null;
  errorMessage: string | null;
  syncPending: boolean;
  connectPending: boolean;
  disconnectPending: boolean;
  disabled?: boolean;
  onConnect: (payload: {
    siteUrl: string;
    email: string;
    apiToken: string;
    defaultProjectKey?: string;
    jql?: string;
    syncEnabled: boolean;
    syncOpenIssuesOnly: boolean;
  }) => void;
  onDisconnect: () => void;
  onSyncNow: () => void;
};

export function JiraIntegrationPanel({
  title,
  settings,
  connected,
  statusMessage,
  errorMessage,
  syncPending,
  connectPending,
  disconnectPending,
  disabled,
  onConnect,
  onDisconnect,
  onSyncNow,
}: JiraIntegrationPanelProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  return (
    <div className="space-y-3 rounded-md border px-3 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-medium text-foreground">{title}</h3>
          <p className="text-xs text-muted-foreground">Workspace-scoped Jira Cloud sync via email + API token.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled || syncPending || !connected}
            onClick={onSyncNow}
          >
            {syncPending ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <RefreshCw aria-hidden="true" className="size-4" />}
            <span>Sync now</span>
          </Button>
          {!connected ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled || connectPending}
              onClick={() => {
                setModalError(null);
                setIsModalOpen(true);
              }}
            >
              <Plug aria-hidden="true" className="size-4" />
              <span>Connect</span>
            </Button>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={disabled || connectPending}
                onClick={() => {
                  setModalError(null);
                  setIsModalOpen(true);
                }}
              >
                <Plug aria-hidden="true" className="size-4" />
                <span>Settings</span>
              </Button>
              <Button type="button" variant="outline" size="sm" disabled={disabled || disconnectPending} onClick={onDisconnect}>
                <Unplug aria-hidden="true" className="size-4" />
                <span>Disconnect</span>
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="space-y-1 text-xs text-muted-foreground">
        <p>Status: {connected ? "Connected" : "Not connected"}</p>
        {settings?.siteUrl ? <p>Site: {settings.siteUrl}</p> : null}
        {settings?.accountEmail ? <p>Email: {settings.accountEmail}</p> : null}
        {settings?.defaultProjectKey ? <p>Default project: {settings.defaultProjectKey}</p> : null}
        {settings?.lastSyncAt ? <p>Last sync: {new Date(settings.lastSyncAt).toLocaleString()}</p> : null}
      </div>

      {statusMessage ? <p className="text-xs text-green-800">{statusMessage}</p> : null}
      {errorMessage ? <p className="text-xs text-destructive">{errorMessage}</p> : null}

      <JiraSettingsModal
        open={isModalOpen}
        settings={settings}
        savePending={connectPending}
        errorMessage={modalError}
        onOpenChange={(open) => {
          if (!connectPending) {
            setIsModalOpen(open);
          }
        }}
        onConnect={(payload) => {
          setModalError(null);
          onConnect(payload);
          setIsModalOpen(false);
        }}
      />
    </div>
  );
}
