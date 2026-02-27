"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { JiraSettings } from "@/src/lib/ipc";

type JiraSettingsModalProps = {
  open: boolean;
  settings: JiraSettings | null;
  savePending: boolean;
  errorMessage: string | null;
  onOpenChange: (open: boolean) => void;
  onConnect: (payload: {
    siteUrl: string;
    email: string;
    apiToken: string;
    defaultProjectKey?: string;
    jql?: string;
    syncEnabled: boolean;
    syncOpenIssuesOnly: boolean;
  }) => void;
};

export function JiraSettingsModal({
  open,
  settings,
  savePending,
  errorMessage,
  onOpenChange,
  onConnect,
}: JiraSettingsModalProps) {
  const [siteUrl, setSiteUrl] = useState("");
  const [email, setEmail] = useState("");
  const [apiToken, setApiToken] = useState("");
  const [defaultProjectKey, setDefaultProjectKey] = useState("");
  const [jql, setJql] = useState("assignee = currentUser() ORDER BY updated DESC");
  const [syncEnabled, setSyncEnabled] = useState(true);
  const [syncOpenIssuesOnly, setSyncOpenIssuesOnly] = useState(true);

  useEffect(() => {
    if (!open) {
      return;
    }

    setSiteUrl(settings?.siteUrl ?? "");
    setEmail(settings?.accountEmail ?? "");
    setApiToken("");
    setDefaultProjectKey(settings?.defaultProjectKey ?? "");
    setJql(settings?.jql ?? "assignee = currentUser() ORDER BY updated DESC");
    setSyncEnabled(settings?.syncEnabled ?? true);
    setSyncOpenIssuesOnly(settings?.syncOpenIssuesOnly ?? true);
  }, [open, settings]);

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

            onConnect({
              siteUrl: siteUrl.trim(),
              email: email.trim(),
              apiToken: apiToken.trim(),
              defaultProjectKey: defaultProjectKey.trim() || undefined,
              jql: jql.trim() || undefined,
              syncEnabled,
              syncOpenIssuesOnly,
            });
          }}
        >
          <DialogHeader>
            <DialogTitle>Jira integration</DialogTitle>
            <DialogDescription>
              Connect this workspace to Jira Cloud using your Atlassian account email and API token. The token is stored in your OS keychain.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <label htmlFor="jira-site-url" className="text-sm font-medium">Site URL</label>
            <Input
              id="jira-site-url"
              value={siteUrl}
              onChange={(event) => setSiteUrl(event.target.value)}
              placeholder="https://your-org.atlassian.net"
              disabled={savePending}
              autoComplete="off"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="jira-email" className="text-sm font-medium">Account email</label>
            <Input
              id="jira-email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="name@company.com"
              disabled={savePending}
              autoComplete="off"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="jira-api-token" className="text-sm font-medium">API token</label>
            <Input
              id="jira-api-token"
              type="password"
              value={apiToken}
              onChange={(event) => setApiToken(event.target.value)}
              placeholder="Paste Jira API token"
              disabled={savePending}
              autoComplete="off"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="jira-default-project" className="text-sm font-medium">Default project key (optional)</label>
            <Input
              id="jira-default-project"
              value={defaultProjectKey}
              onChange={(event) => setDefaultProjectKey(event.target.value)}
              placeholder="ENG"
              disabled={savePending}
              autoComplete="off"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="jira-jql" className="text-sm font-medium">JQL for sync</label>
            <Input
              id="jira-jql"
              value={jql}
              onChange={(event) => setJql(event.target.value)}
              placeholder="assignee = currentUser() ORDER BY updated DESC"
              disabled={savePending}
              autoComplete="off"
            />
          </div>

          <label className="flex items-center justify-between gap-3 rounded-md border border-dashed px-3 py-2 text-sm text-foreground">
            <span className="inline-flex min-w-0 items-center gap-2">
              <Checkbox checked={syncEnabled} disabled={savePending} onCheckedChange={(checked) => setSyncEnabled(checked === true)} />
              <span>Enable Jira sync</span>
            </span>
          </label>

          <label className="flex items-center justify-between gap-3 rounded-md border border-dashed px-3 py-2 text-sm text-foreground">
            <span className="inline-flex min-w-0 items-center gap-2">
              <Checkbox
                checked={syncOpenIssuesOnly}
                disabled={savePending}
                onCheckedChange={(checked) => setSyncOpenIssuesOnly(checked === true)}
              />
              <span>Prefer open issues only</span>
            </span>
          </label>

          {errorMessage ? <p className="text-xs text-destructive">{errorMessage}</p> : null}

          <DialogFooter>
            <Button type="button" variant="outline" disabled={savePending} onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={savePending}>Connect</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
