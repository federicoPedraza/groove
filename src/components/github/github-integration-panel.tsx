"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Check,
  ExternalLink,
  Github,
  KeyRound,
  LogIn,
  RefreshCw,
} from "lucide-react";

import { Badge } from "@/src/components/ui/badge";
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
  ghAuthLogin,
  ghAuthLogout,
  ghAuthStatus,
  ghAuthSwitch,
  ghSshOverview,
  ghSshSetIdentity,
  openExternalUrl,
  type GhAccount,
  type GhAuthStatusResponse,
  type GhSshIdentity,
  type GhSshOverviewResponse,
} from "@/src/lib/ipc";

const GH_INSTALL_URL = "https://cli.github.com";
const GH_TOKEN_URL =
  "https://github.com/settings/tokens/new?scopes=repo,read:org,gist&description=Groove";

type BusyAction =
  | { kind: "switch" | "logout"; user: string }
  | { kind: "ssh"; user: string }
  | null;

type GitHubIntegrationPanelProps = {
  workspaceRoot: string | null;
};

export function GitHubIntegrationPanel({
  workspaceRoot,
}: GitHubIntegrationPanelProps) {
  const [status, setStatus] = useState<GhAuthStatusResponse | null>(null);
  const [ssh, setSsh] = useState<GhSshOverviewResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<BusyAction>(null);

  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [token, setToken] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [statusResult, sshResult] = await Promise.all([
        ghAuthStatus(),
        ghSshOverview({ workspaceRoot: workspaceRoot ?? undefined }),
      ]);
      setStatus(statusResult);
      setSsh(sshResult);
      if (!statusResult.ok && statusResult.error) {
        setError(statusResult.error);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setIsLoading(false);
    }
  }, [workspaceRoot]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleSshSwitch = useCallback(
    async (alias: string) => {
      if (!workspaceRoot) {
        setError("Open a workspace before switching its SSH identity.");
        return;
      }
      setBusy({ kind: "ssh", user: alias });
      setError(null);
      try {
        const result = await ghSshSetIdentity({ workspaceRoot, alias });
        if (!result.ok) {
          setError(result.error ?? "Failed to switch SSH identity.");
          return;
        }
        await refresh();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : String(caught));
      } finally {
        setBusy(null);
      }
    },
    [refresh, workspaceRoot],
  );

  const handleSwitch = useCallback(
    async (user: string) => {
      setBusy({ kind: "switch", user });
      setError(null);
      try {
        const result = await ghAuthSwitch({ user });
        if (!result.ok) {
          setError(result.error ?? "Failed to switch account.");
          return;
        }
        await refresh();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : String(caught));
      } finally {
        setBusy(null);
      }
    },
    [refresh],
  );

  const handleLogout = useCallback(
    async (user: string) => {
      setBusy({ kind: "logout", user });
      setError(null);
      try {
        const result = await ghAuthLogout({ user });
        if (!result.ok) {
          setError(result.error ?? "Failed to sign out.");
          return;
        }
        await refresh();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : String(caught));
      } finally {
        setBusy(null);
      }
    },
    [refresh],
  );

  const handleLogin = useCallback(async () => {
    const trimmed = token.trim();
    if (!trimmed) {
      setLoginError("Paste a GitHub token to continue.");
      return;
    }
    setIsLoggingIn(true);
    setLoginError(null);
    try {
      const result = await ghAuthLogin({ token: trimmed });
      if (!result.ok) {
        setLoginError(result.error ?? "Login failed.");
        return;
      }
      setToken("");
      setIsLoginOpen(false);
      await refresh();
    } catch (caught) {
      setLoginError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setIsLoggingIn(false);
    }
  }, [refresh, token]);

  const installed = status?.installed ?? false;
  const accounts = status?.accounts ?? [];

  return (
    <div className="space-y-3 rounded-md border px-3 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Github aria-hidden="true" className="size-4 text-foreground" />
          <div>
            <h3 className="text-sm font-medium text-foreground">GitHub</h3>
            <p className="text-xs text-muted-foreground">
              Sign in and switch the active GitHub CLI (gh) account.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={isLoading}
            onClick={() => {
              void refresh();
            }}
          >
            <RefreshCw
              aria-hidden="true"
              className={isLoading ? "size-4 animate-spin" : "size-4"}
            />
            <span className="sr-only">Refresh GitHub status</span>
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!installed}
            onClick={() => {
              setToken("");
              setLoginError(null);
              setIsLoginOpen(true);
            }}
          >
            <LogIn aria-hidden="true" className="size-4" />
            <span>Log in</span>
          </Button>
        </div>
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      {isLoading && !status ? (
        <p className="text-xs text-muted-foreground">Checking GitHub CLI…</p>
      ) : !installed ? (
        <div className="space-y-2 text-xs text-muted-foreground">
          <p>GitHub CLI (gh) is not installed or not on your PATH.</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              void openExternalUrl(GH_INSTALL_URL);
            }}
          >
            <ExternalLink aria-hidden="true" className="size-4" />
            <span>Install GitHub CLI</span>
          </Button>
        </div>
      ) : accounts.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No GitHub accounts are signed in. Use “Log in” to add one.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {accounts.map((account) => (
            <GitHubAccountRow
              key={account.login}
              account={account}
              busy={busy}
              onSwitch={handleSwitch}
              onLogout={handleLogout}
            />
          ))}
        </ul>
      )}

      <GitHubSshSection
        ssh={ssh}
        busy={busy}
        hasWorkspace={workspaceRoot !== null}
        onSwitch={handleSshSwitch}
      />

      <Dialog open={isLoginOpen} onOpenChange={setIsLoginOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Log in to GitHub</DialogTitle>
            <DialogDescription>
              Generate a personal access token on GitHub, then paste it here.
              The token is handed to gh and never stored by Groove.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                void openExternalUrl(GH_TOKEN_URL);
              }}
            >
              <ExternalLink aria-hidden="true" className="size-4" />
              <span>Create a token on GitHub</span>
            </Button>

            <Input
              type="password"
              autoComplete="off"
              placeholder="ghp_… or github_pat_…"
              value={token}
              onChange={(event) => {
                setToken(event.target.value);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void handleLogin();
                }
              }}
            />

            {loginError && (
              <p className="text-xs text-destructive">{loginError}</p>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setIsLoginOpen(false);
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={isLoggingIn || token.trim().length === 0}
              onClick={() => {
                void handleLogin();
              }}
            >
              {isLoggingIn ? "Signing in…" : "Log in"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

type GitHubAccountRowProps = {
  account: GhAccount;
  busy: BusyAction;
  onSwitch: (user: string) => void;
  onLogout: (user: string) => void;
};

function GitHubAccountRow({
  account,
  busy,
  onSwitch,
  onLogout,
}: GitHubAccountRowProps) {
  const isSwitching =
    busy?.kind === "switch" && busy.user === account.login;
  const isLoggingOut =
    busy?.kind === "logout" && busy.user === account.login;
  const isBusy = busy !== null;

  return (
    <li className="flex flex-wrap items-center justify-between gap-2 py-2 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-foreground">
          {account.login}
        </span>
        {account.active && (
          <Badge variant="secondary">
            <Check aria-hidden="true" className="size-3" />
            Active
          </Badge>
        )}
        {account.protocol && (
          <Badge variant="outline">{account.protocol}</Badge>
        )}
      </div>
      <div className="flex items-center gap-2">
        {!account.active && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isBusy}
            onClick={() => {
              onSwitch(account.login);
            }}
          >
            {isSwitching ? "Switching…" : "Switch"}
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={isBusy}
          onClick={() => {
            onLogout(account.login);
          }}
        >
          {isLoggingOut ? "Signing out…" : "Sign out"}
        </Button>
      </div>
    </li>
  );
}

type GitHubSshSectionProps = {
  ssh: GhSshOverviewResponse | null;
  busy: BusyAction;
  hasWorkspace: boolean;
  onSwitch: (alias: string) => void;
};

function GitHubSshSection({
  ssh,
  busy,
  hasWorkspace,
  onSwitch,
}: GitHubSshSectionProps) {
  if (!ssh) {
    return null;
  }

  const { identities, origin } = ssh;

  return (
    <div className="space-y-2 border-t border-border pt-3">
      <div className="flex items-center gap-2">
        <KeyRound aria-hidden="true" className="size-4 text-muted-foreground" />
        <h4 className="text-sm font-medium text-foreground">SSH identities</h4>
      </div>
      <p className="text-xs text-muted-foreground">
        Git push/pull uses the SSH key chosen by the active repo&apos;s remote
        host. Switching rewrites this workspace&apos;s <code>origin</code>.
      </p>

      {origin && (
        <p className="text-xs text-muted-foreground">
          Active remote:{" "}
          <code className="text-foreground">{origin.url}</code>
        </p>
      )}

      {!ssh.configFound ? (
        <p className="text-xs text-muted-foreground">
          No <code>~/.ssh/config</code> found.
        </p>
      ) : identities.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No github.com host aliases found in <code>~/.ssh/config</code>.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {identities.map((identity) => (
            <GitHubSshRow
              key={identity.alias}
              identity={identity}
              isCurrent={origin?.matchedAlias === identity.alias}
              busy={busy}
              hasWorkspace={hasWorkspace}
              onSwitch={onSwitch}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

type GitHubSshRowProps = {
  identity: GhSshIdentity;
  isCurrent: boolean;
  busy: BusyAction;
  hasWorkspace: boolean;
  onSwitch: (alias: string) => void;
};

function GitHubSshRow({
  identity,
  isCurrent,
  busy,
  hasWorkspace,
  onSwitch,
}: GitHubSshRowProps) {
  const isSwitching = busy?.kind === "ssh" && busy.user === identity.alias;
  const isBusy = busy !== null;

  return (
    <li className="flex flex-wrap items-center justify-between gap-2 py-2 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-foreground">
          {identity.alias}
        </span>
        {identity.username ? (
          <Badge variant="outline">{identity.username}</Badge>
        ) : (
          <Badge variant="outline">{identity.authState}</Badge>
        )}
        {isCurrent && (
          <Badge variant="secondary">
            <Check aria-hidden="true" className="size-3" />
            Current
          </Badge>
        )}
      </div>
      {!isCurrent && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isBusy || !hasWorkspace}
          title={
            hasWorkspace ? undefined : "Open a workspace to switch its remote"
          }
          onClick={() => {
            onSwitch(identity.alias);
          }}
        >
          {isSwitching ? "Switching…" : "Use"}
        </Button>
      )}
    </li>
  );
}
