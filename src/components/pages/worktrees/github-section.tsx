"use client";

import {
  Copy,
  ExternalLink,
  GitBranch,
  GitPullRequest,
  Link2,
  MessageSquare,
  Plus,
  RefreshCw,
  SquareTerminal,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/src/components/ui/popover";
import { SearchDropdown } from "@/src/components/ui/search-dropdown";
import {
  ghPrCreateWeb,
  ghPrList,
  ghPrView,
  ghRepoDefaultBranch,
  gitAheadBehind,
  gitCurrentBranch,
  gitHasUpstream,
  gitListBranches,
  gitPush,
  groovePrAttach,
  groovePrDetach,
  openExternalUrl,
} from "@/src/lib/ipc";
import type {
  GhPrDetail,
  GhPrSummary,
  PullRequestRecord,
  WorkspaceMeta,
} from "@/src/lib/ipc";
import {
  resolvePrStatusIcon,
  resolvePrStatusLabel,
  useGrooveBusiness,
  type PrStatusKey,
} from "@/src/lib/groove-business";
import { toast } from "@/src/lib/toast";
import { cn } from "@/src/lib/utils";

type GitHubSectionProps = {
  worktreePath: string;
  worktree: string;
  rootName: string;
  knownWorktrees: string[];
  workspaceMeta?: WorkspaceMeta;
  pullRequests: PullRequestRecord[];
  /** Whether the section is currently visible; drives the initial fetch. */
  active: boolean;
  /** Open a PR as a "fake terminal" inspector pane in the worktree detail. */
  onOpenPrInspector: (record: PullRequestRecord) => void;
};

type PrDetailState = {
  loading?: boolean;
  pr?: GhPrDetail;
  error?: string;
};

function prStatusKey(detail: GhPrDetail): PrStatusKey {
  const state = detail.state.toUpperCase();
  if (state === "MERGED") return "merged";
  if (state === "CLOSED") return "closed";
  if (detail.isDraft) return "draft";
  return "open";
}

const PR_STATUS_CLASSNAME: Record<PrStatusKey, string> = {
  merged:
    "border-transparent bg-violet-500/15 text-violet-700 dark:text-violet-300",
  closed:
    "border-transparent bg-rose-500/15 text-rose-700 dark:text-rose-300",
  draft: "border-border text-muted-foreground",
  open: "border-transparent bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
};

// Colored status pill. Gamified label + icon in "groove" mode; plain GitHub
// wording (no icon) in "business" mode.
function PrStatusBadge({ detail }: { detail: GhPrDetail }) {
  const { mode } = useGrooveBusiness();
  const key = prStatusKey(detail);
  const label = resolvePrStatusLabel(key, mode);
  const Icon = resolvePrStatusIcon(key, mode);
  return (
    <Badge className={cn("shrink-0", PR_STATUS_CLASSNAME[key])}>
      {Icon ? <Icon aria-hidden="true" /> : null}
      {label}
    </Badge>
  );
}

function formatReviewDecision(value: string | undefined): string | null {
  switch ((value ?? "").toUpperCase()) {
    case "APPROVED":
      return "Approved";
    case "CHANGES_REQUESTED":
      return "Changes requested";
    case "REVIEW_REQUIRED":
      return "Review required";
    default:
      return null;
  }
}

export function GitHubSection({
  worktreePath,
  worktree,
  rootName,
  knownWorktrees,
  workspaceMeta,
  pullRequests,
  active,
  onOpenPrInspector,
}: GitHubSectionProps) {
  const [branch, setBranch] = useState<string | null>(null);
  const [ahead, setAhead] = useState(0);
  const [hasUpstream, setHasUpstream] = useState<boolean | null>(null);
  const [branches, setBranches] = useState<string[]>([]);
  const [baseBranch, setBaseBranch] = useState<string>("");
  const [baseTouched, setBaseTouched] = useState(false);
  const [discovered, setDiscovered] = useState<GhPrSummary[]>([]);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [prDetails, setPrDetails] = useState<Record<string, PrDetailState>>({});

  const [isPushing, setIsPushing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [pasteUrl, setPasteUrl] = useState("");
  const [busyUrl, setBusyUrl] = useState<string | null>(null);
  const [attachOpen, setAttachOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const attachedUrls = useMemo(
    () => pullRequests.map((pr) => pr.url),
    [pullRequests],
  );
  const attachedUrlsKey = attachedUrls.join("|");
  const attachedSet = useMemo(() => new Set(attachedUrls), [attachedUrls]);

  const prCommandBase = useMemo(
    () => ({ rootName, knownWorktrees, workspaceMeta, worktree }),
    [knownWorktrees, rootName, workspaceMeta, worktree],
  );

  const branchOptions = useMemo(
    () =>
      branches.map((name) => ({
        value: name,
        label: name,
        icon: <GitBranch aria-hidden="true" className="size-4" />,
      })),
    [branches],
  );

  const loadOverview = useCallback(async () => {
    if (!worktreePath) return;
    setOverviewLoading(true);
    setError(null);
    try {
      const [branchRes, aheadRes, upstreamRes, defaultRes, branchesRes, listRes] =
        await Promise.all([
          gitCurrentBranch({ path: worktreePath }),
          gitAheadBehind({ path: worktreePath }),
          gitHasUpstream({ path: worktreePath }),
          ghRepoDefaultBranch({ worktreePath }),
          gitListBranches({ path: worktreePath }),
          ghPrList({ worktreePath }),
        ]);

      setBranch(branchRes.ok ? (branchRes.branch ?? null) : null);
      setAhead(aheadRes.ok ? aheadRes.ahead : 0);
      setHasUpstream(upstreamRes.ok ? upstreamRes.value : null);
      setBranches(branchesRes.ok ? branchesRes.branches : []);
      if (!baseTouched && defaultRes.ok && defaultRes.defaultBranch) {
        setBaseBranch(defaultRes.defaultBranch);
      }
      setDiscovered(listRes.ok ? listRes.prs : []);
      if (!listRes.ok && listRes.error) {
        setError(listRes.error);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setOverviewLoading(false);
    }
  }, [baseTouched, worktreePath]);

  const loadPrDetails = useCallback(async () => {
    if (!worktreePath || attachedUrls.length === 0) {
      setPrDetails({});
      return;
    }
    setPrDetails((prev) => {
      const next: Record<string, PrDetailState> = {};
      for (const url of attachedUrls) {
        next[url] = prev[url] ?? { loading: true };
      }
      return next;
    });
    await Promise.all(
      attachedUrls.map(async (url) => {
        try {
          const res = await ghPrView({ worktreePath, selector: url });
          setPrDetails((prev) => ({
            ...prev,
            [url]:
              res.ok && res.pr
                ? { pr: res.pr }
                : { error: res.error ?? "Failed to load PR." },
          }));
        } catch (caught) {
          setPrDetails((prev) => ({
            ...prev,
            [url]: {
              error: caught instanceof Error ? caught.message : String(caught),
            },
          }));
        }
      }),
    );
    // attachedUrls is captured via attachedUrlsKey in the effect deps below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attachedUrlsKey, worktreePath]);

  useEffect(() => {
    if (active) void loadOverview();
  }, [active, loadOverview]);

  useEffect(() => {
    if (active) void loadPrDetails();
  }, [active, loadPrDetails]);

  const refreshAll = useCallback(() => {
    void loadOverview();
    void loadPrDetails();
  }, [loadOverview, loadPrDetails]);

  const handlePush = useCallback(async () => {
    if (!worktreePath || isPushing) return;
    setIsPushing(true);
    try {
      const result = await gitPush({
        path: worktreePath,
        setUpstream: true,
        branch: branch ?? undefined,
      });
      if (result.ok) {
        toast.success("Pushed.");
        void loadOverview();
      } else {
        toast.error(result.error ?? "Push failed.");
      }
    } catch {
      toast.error("Push request failed.");
    } finally {
      setIsPushing(false);
    }
  }, [branch, isPushing, loadOverview, worktreePath]);

  const handleCreatePr = useCallback(async (): Promise<boolean> => {
    if (!worktreePath || !baseBranch || isCreating) return false;
    setIsCreating(true);
    try {
      const result = await ghPrCreateWeb({ worktreePath, base: baseBranch });
      if (result.ok) {
        toast.success("Opened PR creation in your browser.");
        // Give the user a moment to open it, then re-discover.
        window.setTimeout(() => {
          void loadOverview();
        }, 1500);
        return true;
      }
      toast.error(result.error ?? "Could not open PR creation.");
      return false;
    } catch {
      toast.error("Create PR request failed.");
      return false;
    } finally {
      setIsCreating(false);
    }
  }, [baseBranch, isCreating, loadOverview, worktreePath]);

  const handleAttach = useCallback(
    async (url: string, summary?: GhPrSummary): Promise<boolean> => {
      const trimmed = url.trim();
      if (!trimmed || busyUrl) return false;
      setBusyUrl(trimmed);
      try {
        const result = await groovePrAttach({
          ...prCommandBase,
          url: trimmed,
          title: summary?.title,
        });
        if (!result.ok) {
          toast.error(result.error ?? "Failed to attach PR.");
          return false;
        }
        toast.success("PR attached.");
        setPasteUrl("");
        void loadPrDetails();
        return true;
      } catch {
        toast.error("Attach request failed.");
        return false;
      } finally {
        setBusyUrl(null);
      }
    },
    [busyUrl, loadPrDetails, prCommandBase],
  );

  const handleDetach = useCallback(
    async (url: string) => {
      if (busyUrl) return;
      setBusyUrl(url);
      try {
        const result = await groovePrDetach({ ...prCommandBase, url });
        if (!result.ok) {
          toast.error(result.error ?? "Failed to detach PR.");
          return;
        }
        toast.success("PR detached.");
      } catch {
        toast.error("Detach request failed.");
      } finally {
        setBusyUrl(null);
      }
    },
    [busyUrl, prCommandBase],
  );

  const copyLink = useCallback((url: string) => {
    void navigator.clipboard?.writeText(url).then(
      () => toast.success("Link copied."),
      () => toast.error("Could not copy link."),
    );
  }, []);

  const undiscovered = discovered.filter((pr) => !attachedSet.has(pr.url));
  const hasAttached = pullRequests.length > 0;

  const renderAttachForm = (onSuccess?: () => void) => (
    <div className="space-y-2">
      <p className="text-xs font-medium text-foreground">Attach a PR</p>
      <div className="flex items-center gap-2">
        <Input
          className="h-8 text-xs"
          placeholder="Paste PR URL…"
          value={pasteUrl}
          onChange={(event) => {
            setPasteUrl(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void handleAttach(pasteUrl).then((ok) => {
                if (ok) onSuccess?.();
              });
            }
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="size-8 shrink-0 p-0"
          disabled={pasteUrl.trim() === "" || busyUrl !== null}
          onClick={() => {
            void handleAttach(pasteUrl).then((ok) => {
              if (ok) onSuccess?.();
            });
          }}
          aria-label="Attach pasted PR"
        >
          <Plus aria-hidden="true" className="size-4" />
        </Button>
      </div>
    </div>
  );

  const renderCreatePrForm = (onSuccess?: () => void) => (
    <div className="space-y-2">
      <div className="space-y-1">
        <span className="block text-xs text-muted-foreground">Base branch</span>
        <SearchDropdown
          ariaLabel="Select base branch"
          searchAriaLabel="Search existing branches"
          options={branchOptions}
          value={baseBranch === "" ? null : baseBranch}
          placeholder={
            overviewLoading ? "Loading branches…" : "Select a branch"
          }
          searchPlaceholder="Filter branches"
          requireQuery
          requireQueryLabel="Type to search branches."
          onValueChange={(nextValue) => {
            setBaseTouched(true);
            setBaseBranch(nextValue);
          }}
          disabled={overviewLoading || branches.length === 0}
        />
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-full"
        disabled={isCreating || !worktreePath || baseBranch === ""}
        onClick={() => {
          void handleCreatePr().then((ok) => {
            if (ok) onSuccess?.();
          });
        }}
      >
        <GitPullRequest aria-hidden="true" className="size-4" />
        <span>{isCreating ? "Opening…" : "Create PR"}</span>
      </Button>
    </div>
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center justify-between gap-2 border-b px-3 py-2">
        <h2 className="truncate text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          GitHub
        </h2>
        <div className="flex items-center gap-1">
          <Popover open={attachOpen} onOpenChange={setAttachOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="size-6 p-0"
                disabled={!worktreePath}
                aria-label="Attach a PR"
                title="Attach a PR (paste URL)"
              >
                <Link2 aria-hidden="true" className="size-3.5" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72">
              {renderAttachForm(() => {
                setAttachOpen(false);
              })}
            </PopoverContent>
          </Popover>

          {hasAttached ? (
            <Popover open={createOpen} onOpenChange={setCreateOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="size-6 p-0"
                  disabled={!worktreePath}
                  aria-label="Create a PR"
                  title="Create a PR"
                >
                  <GitPullRequest aria-hidden="true" className="size-3.5" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-72">
                {renderCreatePrForm(() => {
                  setCreateOpen(false);
                })}
              </PopoverContent>
            </Popover>
          ) : null}

          <Button
            variant="ghost"
            size="sm"
            className="size-6 p-0"
            onClick={refreshAll}
            disabled={overviewLoading || !worktreePath}
            aria-label="Refresh GitHub"
          >
            <RefreshCw
              aria-hidden="true"
              className={cn("size-3.5", overviewLoading && "animate-spin")}
            />
          </Button>
        </div>
      </header>

      <div className="min-h-0 flex-1 space-y-4 overflow-auto p-3">
        {error && <p className="text-xs text-destructive">{error}</p>}

        {/* Branch + push */}
        <section className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="min-w-0 truncate text-xs text-muted-foreground">
              Branch{" "}
              <span className="font-medium text-foreground">
                {branch ?? "—"}
              </span>
            </span>
            <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
              {hasUpstream === false
                ? "no upstream"
                : `${ahead} to push`}
            </span>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full"
            disabled={
              isPushing ||
              !worktreePath ||
              (hasUpstream === true && ahead === 0)
            }
            onClick={() => {
              void handlePush();
            }}
          >
            <UploadCloud aria-hidden="true" className="size-4" />
            <span>
              {isPushing
                ? "Pushing…"
                : hasUpstream === false
                  ? "Publish branch"
                  : ahead > 0
                    ? `Push ${ahead} commit${ahead === 1 ? "" : "s"}`
                    : "Nothing to push"}
            </span>
          </Button>
        </section>

        {/* Create PR — primary in the body until the first PR is attached;
            afterwards it moves to the header popover. */}
        {!hasAttached ? (
          <section className="space-y-2 border-t border-border pt-3">
            {renderCreatePrForm()}
          </section>
        ) : null}

        {/* PRs discovered for this branch but not yet attached */}
        {undiscovered.length > 0 ? (
          <section className="space-y-1 border-t border-border pt-3">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Found for this branch
            </p>
            <ul className="divide-y divide-border rounded-md border">
              {undiscovered.map((pr) => (
                <li
                  key={pr.url}
                  className="flex items-center justify-between gap-2 px-2 py-1.5"
                >
                  <span className="min-w-0 truncate text-xs" title={pr.title}>
                    <span className="text-muted-foreground">#{pr.number}</span>{" "}
                    {pr.title}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 shrink-0 px-2 text-xs"
                    disabled={busyUrl !== null}
                    onClick={() => {
                      void handleAttach(pr.url, pr);
                    }}
                  >
                    Attach
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {/* Attached PRs */}
        <section className="space-y-2 border-t border-border pt-3">
          <h3 className="text-xs font-medium text-foreground">
            Attached PRs
            {pullRequests.length > 0 ? ` (${pullRequests.length})` : ""}
          </h3>
          {pullRequests.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No PRs attached yet.
            </p>
          ) : (
            <ul className="space-y-2">
              {pullRequests.map((pr) => (
                <AttachedPrRow
                  key={pr.url}
                  record={pr}
                  detail={prDetails[pr.url]}
                  busy={busyUrl === pr.url}
                  onInspect={() => {
                    onOpenPrInspector(pr);
                  }}
                  onCopy={() => {
                    copyLink(pr.url);
                  }}
                  onOpen={() => {
                    void openExternalUrl(pr.url);
                  }}
                  onDetach={() => {
                    void handleDetach(pr.url);
                  }}
                />
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

type AttachedPrRowProps = {
  record: PullRequestRecord;
  detail: PrDetailState | undefined;
  busy: boolean;
  onInspect: () => void;
  onCopy: () => void;
  onOpen: () => void;
  onDetach: () => void;
};

function AttachedPrRow({
  record,
  detail,
  busy,
  onInspect,
  onCopy,
  onOpen,
  onDetach,
}: AttachedPrRowProps) {
  const pr = detail?.pr;
  const title = pr?.title ?? record.title ?? "Pull request";
  const review = pr ? formatReviewDecision(pr.reviewDecision) : null;
  const comments = pr?.comments ?? [];

  return (
    <li className="rounded-md border">
      <div className="flex items-center gap-1.5 px-2 py-1.5">
        <span className="min-w-0 flex-1 truncate text-xs" title={title}>
          {title}
        </span>
        {pr ? (
          <PrStatusBadge detail={pr} />
        ) : detail?.loading ? (
          <RefreshCw
            aria-hidden="true"
            className="size-3 shrink-0 animate-spin text-muted-foreground"
          />
        ) : null}
      </div>

      <div className="flex items-center gap-1 border-t px-1 py-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="size-6 p-0"
          onClick={onInspect}
          aria-label="Open PR inspector"
          title="Open PR inspector"
        >
          <SquareTerminal aria-hidden="true" className="size-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="size-6 p-0"
          onClick={onCopy}
          aria-label="Copy PR link"
        >
          <Copy aria-hidden="true" className="size-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="size-6 p-0"
          onClick={onOpen}
          aria-label="Open PR in browser"
        >
          <ExternalLink aria-hidden="true" className="size-3.5" />
        </Button>
        <span className="flex flex-1 items-center gap-1 text-[10px] text-muted-foreground">
          <span className="font-medium text-foreground">#{record.number}</span>
          <MessageSquare aria-hidden="true" className="ml-1 size-3" />
          {comments.length}
          {review ? <span className="ml-1">· {review}</span> : null}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="size-6 p-0 text-muted-foreground hover:text-destructive"
          disabled={busy}
          onClick={onDetach}
          aria-label="Detach PR"
        >
          <Trash2 aria-hidden="true" className="size-3.5" />
        </Button>
      </div>
    </li>
  );
}
