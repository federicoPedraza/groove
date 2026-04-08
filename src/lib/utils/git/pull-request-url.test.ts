import { describe, it, expect } from "vitest";

import { buildCreatePrUrl } from "@/src/lib/utils/git/pull-request-url";

describe("buildCreatePrUrl", () => {
  it("returns null when repositoryRemoteUrl is null", () => {
    expect(buildCreatePrUrl(null, "main")).toBeNull();
  });

  it("returns null when repositoryRemoteUrl is undefined", () => {
    expect(buildCreatePrUrl(undefined, "main")).toBeNull();
  });

  it("returns null when repositoryRemoteUrl is empty string", () => {
    expect(buildCreatePrUrl("", "main")).toBeNull();
  });

  it("returns null for whitespace-only remote URL", () => {
    expect(buildCreatePrUrl("   ", "main")).toBeNull();
  });

  it("returns null for an unparseable remote URL", () => {
    expect(buildCreatePrUrl("not-a-url", "main")).toBeNull();
  });

  it("builds GitHub compare URL for SSH remote with branch", () => {
    const url = buildCreatePrUrl("git@github.com:owner/repo.git", "feature/new-thing");
    expect(url).toBe("https://github.com/owner/repo/compare/feature%2Fnew-thing?expand=1");
  });

  it("builds GitHub compare URL for HTTPS remote with branch", () => {
    const url = buildCreatePrUrl("https://github.com/owner/repo.git", "my-branch");
    expect(url).toBe("https://github.com/owner/repo/compare/my-branch?expand=1");
  });

  it("returns repository URL when branchName is null on GitHub", () => {
    const url = buildCreatePrUrl("git@github.com:owner/repo.git", null);
    expect(url).toBe("https://github.com/owner/repo");
  });

  it("returns repository URL when branchName is undefined on GitHub", () => {
    const url = buildCreatePrUrl("git@github.com:owner/repo.git", undefined);
    expect(url).toBe("https://github.com/owner/repo");
  });

  it("returns repository URL when branchName is empty/whitespace on GitHub", () => {
    const url = buildCreatePrUrl("git@github.com:owner/repo.git", "   ");
    expect(url).toBe("https://github.com/owner/repo");
  });

  it("returns repository URL for non-GitHub hosts", () => {
    const url = buildCreatePrUrl("git@gitlab.com:owner/repo.git", "feature-branch");
    expect(url).toBe("https://gitlab.com/owner/repo");
  });

  it("handles HTTPS remote without .git suffix", () => {
    const url = buildCreatePrUrl("https://github.com/owner/repo", "branch");
    expect(url).toBe("https://github.com/owner/repo/compare/branch?expand=1");
  });

  it("handles SSH remote with trailing slash", () => {
    const url = buildCreatePrUrl("git@github.com:owner/repo.git/", "branch");
    expect(url).toBe("https://github.com/owner/repo/compare/branch?expand=1");
  });

  it("returns null for SSH URL with insufficient path segments", () => {
    const url = buildCreatePrUrl("git@github.com:onlyone", "branch");
    expect(url).toBeNull();
  });

  it("returns null for HTTPS URL with insufficient path segments", () => {
    const url = buildCreatePrUrl("https://github.com/onlyone", "branch");
    expect(url).toBeNull();
  });
});
