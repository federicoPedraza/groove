import { useEffect, useMemo, useRef, useState } from "react";

import { ghBranchBehind } from "@/src/lib/ipc";

const BRANCH_BEHIND_CACHE_TTL_MS = 20_000;
const BRANCH_BEHIND_REFRESH_INTERVAL_MS = 60_000;

type CachedDirectoryBehindStatus = {
  at: number;
  status: DirectoryBehindStatus | null;
};

export type DirectoryBehindStatus = {
  behindCount: number;
  branchName: string;
};

const branchBehindCache = new Map<string, CachedDirectoryBehindStatus>();
const branchBehindInFlight = new Map<string, Promise<DirectoryBehindStatus | null>>();

function buildStatusFromResponse(response: Awaited<ReturnType<typeof ghBranchBehind>>): DirectoryBehindStatus | null {
  if (!response.ok || !response.hasUpstream || !response.branch) {
    return null;
  }

  if (!Number.isFinite(response.behind) || response.behind <= 0) {
    return null;
  }

  return {
    behindCount: response.behind,
    branchName: response.branch,
  };
}

async function loadDirectoryBehindStatus(workspaceRoot: string, force = false): Promise<DirectoryBehindStatus | null> {
  const cacheKey = workspaceRoot;
  const now = Date.now();
  const cached = branchBehindCache.get(cacheKey);

  if (!force && cached && now - cached.at < BRANCH_BEHIND_CACHE_TTL_MS) {
    return cached.status;
  }

  const inFlight = branchBehindInFlight.get(cacheKey);
  if (inFlight) {
    return inFlight;
  }

  const request = (async () => {
    try {
      const response = await ghBranchBehind({ path: workspaceRoot });
      const status = buildStatusFromResponse(response);
      branchBehindCache.set(cacheKey, {
        at: Date.now(),
        status,
      });
      return status;
    } catch {
      branchBehindCache.set(cacheKey, {
        at: Date.now(),
        status: null,
      });
      return null;
    } finally {
      branchBehindInFlight.delete(cacheKey);
    }
  })();

  branchBehindInFlight.set(cacheKey, request);
  return request;
}

export function useDirectoryBehindStatus(workspaceRoot: string | null): DirectoryBehindStatus | null {
  const [status, setStatus] = useState<DirectoryBehindStatus | null>(null);
  const refreshTimeoutRef = useRef<number | null>(null);

  const normalizedWorkspaceRoot = useMemo(() => {
    const nextValue = workspaceRoot?.trim();
    return nextValue && nextValue.length > 0 ? nextValue : null;
  }, [workspaceRoot]);

  useEffect(() => {
    if (!normalizedWorkspaceRoot) {
      setStatus(null);
      if (refreshTimeoutRef.current !== null) {
        window.clearInterval(refreshTimeoutRef.current);
        refreshTimeoutRef.current = null;
      }
      return;
    }

    let cancelled = false;

    const refresh = async (): Promise<void> => {
      const nextStatus = await loadDirectoryBehindStatus(normalizedWorkspaceRoot);
      if (!cancelled) {
        setStatus(nextStatus);
      }
    };

    void refresh();

    refreshTimeoutRef.current = window.setInterval(() => {
      void refresh();
    }, BRANCH_BEHIND_REFRESH_INTERVAL_MS);

    return () => {
      cancelled = true;
      if (refreshTimeoutRef.current !== null) {
        window.clearInterval(refreshTimeoutRef.current);
        refreshTimeoutRef.current = null;
      }
    };
  }, [normalizedWorkspaceRoot]);

  return status;
}
