import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DirectoryBehindIndicator } from "@/components/pages/dashboard/directory-behind-indicator";
import { TooltipProvider } from "@/components/ui/tooltip";

describe("DirectoryBehindIndicator", () => {
  it("renders the behind text when sidebar is expanded", () => {
    render(
      <DirectoryBehindIndicator
        collapsed={false}
        status={{
          behindCount: 4,
          branchName: "feature/indicator",
        }}
      />,
    );

    expect(screen.getByText("4 commits behind feature/indicator")).toBeTruthy();
    expect(screen.getByLabelText("4 commits behind feature/indicator")).toBeTruthy();
  });

  it("renders icon-only state with accessible label when collapsed", () => {
    render(
      <TooltipProvider>
        <DirectoryBehindIndicator
          collapsed
          status={{
            behindCount: 2,
            branchName: "main",
          }}
        />
      </TooltipProvider>,
    );

    expect(screen.getByLabelText("2 commits behind main")).toBeTruthy();
    expect(screen.queryByText("2 commits behind main")).toBeNull();
  });
});
