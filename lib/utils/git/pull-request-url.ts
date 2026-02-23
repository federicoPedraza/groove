type ParsedRemote = {
  host: string;
  owner: string;
  repository: string;
  repositoryUrl: string;
};

function parseRemote(remoteUrl: string): ParsedRemote | null {
  const trimmed = remoteUrl.trim();
  if (!trimmed) {
    return null;
  }

  const scpMatch = trimmed.match(/^git@([^:]+):(.+)$/);
  if (scpMatch) {
    return parseHostAndPath(scpMatch[1], scpMatch[2]);
  }

  try {
    const parsed = new URL(trimmed);
    const path = parsed.pathname.replace(/^\/+/, "");
    return parseHostAndPath(parsed.hostname, path);
  } catch {
    return null;
  }
}

function parseHostAndPath(host: string, path: string): ParsedRemote | null {
  const normalizedPath = path.replace(/\/+$/, "").replace(/\.git$/, "");
  const segments = normalizedPath.split("/").filter(Boolean);
  if (segments.length < 2) {
    return null;
  }

  const owner = segments[0];
  const repository = segments[1];
  const repositoryUrl = `https://${host}/${owner}/${repository}`;
  return {
    host: host.toLowerCase(),
    owner,
    repository,
    repositoryUrl,
  };
}

export function buildCreatePrUrl(repositoryRemoteUrl: string | null | undefined, branchName: string | null | undefined): string | null {
  if (!repositoryRemoteUrl) {
    return null;
  }

  const parsed = parseRemote(repositoryRemoteUrl);
  if (!parsed) {
    return null;
  }

  const normalizedBranch = branchName?.trim();
  if (parsed.host === "github.com" && normalizedBranch) {
    return `${parsed.repositoryUrl}/compare/${encodeURIComponent(normalizedBranch)}?expand=1`;
  }

  return parsed.repositoryUrl;
}
