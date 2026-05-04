"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { RefreshCw, Settings2 } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import {
  getMotherduckStoreSnapshot,
  refreshMotherduckStatus,
  subscribeToMotherduckStore,
} from "@/src/lib/motherduck-store";

import { MotherduckSettingsModal } from "./motherduck-settings-modal";

type MotherduckIntegrationPanelProps = {
  workspaceRoot: string | null;
};

export function MotherduckIntegrationPanel({
  workspaceRoot,
}: MotherduckIntegrationPanelProps) {
  const motherduckSnapshot = useSyncExternalStore(
    subscribeToMotherduckStore,
    getMotherduckStoreSnapshot,
    getMotherduckStoreSnapshot,
  );

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!workspaceRoot) {
      return;
    }
    void refreshMotherduckStatus();
  }, [workspaceRoot]);

  const tokenPresent = motherduckSnapshot.tokenPresent;
  const description = workspaceRoot
    ? tokenPresent
      ? `Token configured${
          motherduckSnapshot.defaultDatabase
            ? ` · default DB: ${motherduckSnapshot.defaultDatabase}`
            : ""
        }`
      : "No bearer token configured for this workspace."
    : "Open a workspace to configure MotherDuck.";

  return (
    <div className="space-y-3 rounded-md border px-3 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-medium text-foreground">MotherDuck</h3>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!workspaceRoot || motherduckSnapshot.isLoading}
            onClick={() => {
              void refreshMotherduckStatus();
            }}
          >
            <RefreshCw aria-hidden="true" className="size-4" />
            <span>Refresh</span>
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!workspaceRoot}
            onClick={() => {
              setStatusMessage(null);
              setErrorMessage(null);
              setIsModalOpen(true);
            }}
          >
            <Settings2 aria-hidden="true" className="size-4" />
            <span>Settings</span>
          </Button>
        </div>
      </div>

      {statusMessage && (
        <p className="text-xs text-green-800">{statusMessage}</p>
      )}
      {errorMessage && (
        <p className="text-xs text-destructive">{errorMessage}</p>
      )}

      <MotherduckSettingsModal
        open={isModalOpen}
        tokenPresent={tokenPresent}
        defaultDatabase={motherduckSnapshot.defaultDatabase}
        onOpenChange={(open) => {
          setIsModalOpen(open);
        }}
        onSettingsSaved={(message) => {
          setStatusMessage(message);
          void refreshMotherduckStatus();
        }}
      />
    </div>
  );
}
