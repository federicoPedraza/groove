"use client";

import { useEffect, useState } from "react";

import { Button } from "@/src/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import { Input } from "@/src/components/ui/input";
import {
  motherduckClearToken,
  motherduckSetToken,
  motherduckTest,
} from "@/src/lib/ipc";

type MotherduckSettingsModalProps = {
  open: boolean;
  tokenPresent: boolean;
  defaultDatabase: string | null;
  onOpenChange: (open: boolean) => void;
  onSettingsSaved: (message: string) => void;
};

export function MotherduckSettingsModal({
  open,
  tokenPresent,
  defaultDatabase: initialDefaultDatabase,
  onOpenChange,
  onSettingsSaved,
}: MotherduckSettingsModalProps) {
  const [token, setToken] = useState("");
  const [defaultDatabase, setDefaultDatabase] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [testMessage, setTestMessage] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setToken("");
      setDefaultDatabase(initialDefaultDatabase ?? "");
      setErrorMessage(null);
      setTestMessage(null);
    }
  }, [open, initialDefaultDatabase]);

  const tokenAlreadyConfigured = tokenPresent;

  const handleSave = async (): Promise<void> => {
    const trimmedToken = token.trim();
    if (!trimmedToken) {
      setErrorMessage("Bearer token cannot be empty.");
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);
    setTestMessage(null);

    try {
      const response = await motherduckSetToken({
        token: trimmedToken,
        defaultDatabase: defaultDatabase.trim() || null,
      });

      if (!response.ok) {
        setErrorMessage(response.error ?? "Failed to save MotherDuck token.");
        return;
      }

      onSettingsSaved("MotherDuck token saved.");
      onOpenChange(false);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to save token.";
      setErrorMessage(message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleTest = async (): Promise<void> => {
    setIsTesting(true);
    setTestMessage(null);
    setErrorMessage(null);

    try {
      const response = await motherduckTest();
      if (!response.ok) {
        setErrorMessage(response.error ?? "MotherDuck test failed.");
        return;
      }
      const latency =
        typeof response.latencyMs === "number"
          ? ` (${response.latencyMs} ms)`
          : "";
      setTestMessage(
        `Connected as ${response.currentUser ?? "unknown user"} to ${
          response.currentDatabase ?? "unknown db"
        }${latency}.`,
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "MotherDuck test threw an error.";
      setErrorMessage(message);
    } finally {
      setIsTesting(false);
    }
  };

  const handleClear = async (): Promise<void> => {
    setIsClearing(true);
    setErrorMessage(null);
    setTestMessage(null);

    try {
      const response = await motherduckClearToken();
      if (!response.ok) {
        setErrorMessage(response.error ?? "Failed to clear MotherDuck token.");
        return;
      }
      onSettingsSaved("MotherDuck token cleared.");
      onOpenChange(false);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to clear MotherDuck token.";
      setErrorMessage(message);
    } finally {
      setIsClearing(false);
    }
  };

  const isBusy = isSaving || isTesting || isClearing;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] w-[calc(100vw-2rem)] flex-col sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>MotherDuck settings</DialogTitle>
          <DialogDescription>
            Connect this workspace to MotherDuck. The bearer token is stored at{" "}
            <code>.groove/motherduck.json</code> (gitignored). The first
            connection requires internet access so DuckDB can install the
            MotherDuck extension.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 overflow-y-auto py-2">
          <div className="space-y-2">
            <label
              htmlFor="motherduck-token"
              className="text-sm font-medium text-foreground"
            >
              Bearer token
            </label>
            <Input
              id="motherduck-token"
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder={
                tokenAlreadyConfigured
                  ? "Enter a new token to replace the existing one"
                  : "Paste your MotherDuck token"
              }
              value={token}
              disabled={isBusy}
              onChange={(event) => {
                setToken(event.target.value);
              }}
            />
            <p className="text-xs text-muted-foreground">
              {tokenAlreadyConfigured
                ? "A token is already saved. Saving will overwrite it."
                : "Generate a token at app.motherduck.com under Settings → Access Tokens."}
            </p>
          </div>

          <div className="space-y-2">
            <label
              htmlFor="motherduck-default-database"
              className="text-sm font-medium text-foreground"
            >
              Default database{" "}
              <span className="text-xs text-muted-foreground">(optional)</span>
            </label>
            <Input
              id="motherduck-default-database"
              type="text"
              autoComplete="off"
              spellCheck={false}
              placeholder="e.g. my_db (defaults to none)"
              value={defaultDatabase}
              disabled={isBusy}
              onChange={(event) => {
                setDefaultDatabase(event.target.value);
              }}
            />
            <p className="text-xs text-muted-foreground">
              Used as the suffix in <code>md:&lt;name&gt;</code> when running
              queries.
            </p>
          </div>
        </div>

        {testMessage && (
          <p className="text-xs text-green-800">{testMessage}</p>
        )}
        {errorMessage && (
          <p className="text-xs text-destructive">{errorMessage}</p>
        )}

        <DialogFooter className="flex-wrap gap-2 sm:justify-between">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isBusy || !tokenAlreadyConfigured}
              onClick={() => {
                void handleTest();
              }}
            >
              Test connection
            </Button>
            {tokenAlreadyConfigured && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isBusy}
                onClick={() => {
                  void handleClear();
                }}
              >
                Clear token
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isBusy}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={isBusy || token.trim().length === 0}
              onClick={() => {
                void handleSave();
              }}
            >
              {isSaving ? "Saving…" : "Save"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
