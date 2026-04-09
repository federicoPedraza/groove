import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

import { SummaryViewerModal } from "@/src/components/pages/dashboard/summary-viewer-modal";
import type { SummaryRecord } from "@/src/lib/ipc";

vi.mock("react-markdown", () => ({
  default: ({ children }: { children: string }) => (
    <div data-testid="markdown">{children}</div>
  ),
}));

function buildSummary(overrides: Partial<SummaryRecord> = {}): SummaryRecord {
  return {
    worktreeIds: ["wt-1"],
    createdAt: "2025-01-15T10:30:00Z",
    summary: "Detailed summary content here.",
    oneLiner: "Quick one-liner.",
    ...overrides,
  };
}

function renderModal(
  overrides: Partial<Parameters<typeof SummaryViewerModal>[0]> = {},
) {
  const props = {
    summaries: [buildSummary()],
    initialIndex: 0,
    open: true,
    onClose: vi.fn(),
    ...overrides,
  };
  render(<SummaryViewerModal {...props} />);
  return props;
}

describe("SummaryViewerModal", () => {
  beforeEach(() => {
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  it("renders the modal title", () => {
    renderModal();
    expect(screen.getByText("Summary")).toBeTruthy();
  });

  it("renders the dialog when open", () => {
    renderModal();
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("renders the one-liner text", () => {
    renderModal();
    expect(screen.getByText("Quick one-liner.")).toBeTruthy();
  });

  it("shows fallback text when oneLiner is missing", () => {
    renderModal({ summaries: [buildSummary({ oneLiner: undefined })] });
    expect(screen.getByText("No one liner provided.")).toBeTruthy();
  });

  it("does not show navigation buttons for a single summary", () => {
    renderModal({ summaries: [buildSummary()] });
    expect(screen.queryByLabelText("Previous summary")).toBeNull();
    expect(screen.queryByLabelText("Next summary")).toBeNull();
  });

  it("shows navigation buttons for multiple summaries", () => {
    renderModal({
      summaries: [buildSummary(), buildSummary({ oneLiner: "Second" })],
      initialIndex: 0,
    });
    expect(screen.getByLabelText("Previous summary")).toBeTruthy();
    expect(screen.getByLabelText("Next summary")).toBeTruthy();
    expect(screen.getByText("1/2")).toBeTruthy();
  });

  it("disables previous button on first summary", () => {
    renderModal({
      summaries: [buildSummary(), buildSummary({ oneLiner: "Second" })],
      initialIndex: 0,
    });
    expect(
      (screen.getByLabelText("Previous summary") as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(
      (screen.getByLabelText("Next summary") as HTMLButtonElement).disabled,
    ).toBe(false);
  });

  it("disables next button on last summary", () => {
    renderModal({
      summaries: [buildSummary(), buildSummary({ oneLiner: "Second" })],
      initialIndex: 1,
    });
    expect(
      (screen.getByLabelText("Next summary") as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(
      (screen.getByLabelText("Previous summary") as HTMLButtonElement).disabled,
    ).toBe(false);
  });

  it("navigates to next summary", () => {
    renderModal({
      summaries: [
        buildSummary({ oneLiner: "First" }),
        buildSummary({ oneLiner: "Second" }),
      ],
      initialIndex: 0,
    });
    expect(screen.getByText("First")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Next summary"));
    expect(screen.getByText("Second")).toBeTruthy();
    expect(screen.getByText("2/2")).toBeTruthy();
  });

  it("navigates to previous summary", () => {
    renderModal({
      summaries: [
        buildSummary({ oneLiner: "First" }),
        buildSummary({ oneLiner: "Second" }),
      ],
      initialIndex: 1,
    });
    expect(screen.getByText("Second")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Previous summary"));
    expect(screen.getByText("First")).toBeTruthy();
  });

  it("expands content section when clicked", () => {
    renderModal();
    expect(screen.queryByTestId("markdown")).toBeNull();
    fireEvent.click(screen.getByText("Content"));
    expect(screen.getByTestId("markdown")).toBeTruthy();
    expect(screen.getByTestId("markdown").textContent).toBe(
      "Detailed summary content here.",
    );
  });

  it("collapses content section when clicked again", () => {
    renderModal();
    fireEvent.click(screen.getByText("Content"));
    expect(screen.getByTestId("markdown")).toBeTruthy();
    fireEvent.click(screen.getByText("Content"));
    expect(screen.queryByTestId("markdown")).toBeNull();
  });

  it("resets content expanded state when navigating summaries", () => {
    renderModal({
      summaries: [
        buildSummary({ oneLiner: "First", summary: "Summary A" }),
        buildSummary({ oneLiner: "Second", summary: "Summary B" }),
      ],
      initialIndex: 0,
    });
    fireEvent.click(screen.getByText("Content"));
    expect(screen.getByTestId("markdown")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Next summary"));
    expect(screen.queryByTestId("markdown")).toBeNull();
  });

  it("copies one-liner to clipboard and shows check icon", async () => {
    vi.useFakeTimers();
    renderModal();
    const copyButtons = screen.getAllByLabelText("Copy to clipboard");
    fireEvent.click(copyButtons[0]);
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      "Quick one-liner.",
    );
    // Wait for the clipboard promise to resolve and state update
    await vi.advanceTimersByTimeAsync(0);
    // The copied state should now be true, showing the Check icon
    const button = screen.getAllByLabelText("Copy to clipboard")[0];
    const checkIcon = button.querySelector(".text-emerald-700");
    expect(checkIcon).toBeTruthy();
    vi.useRealTimers();
  });

  it("copies content to clipboard when expanded", () => {
    renderModal();
    fireEvent.click(screen.getByText("Content"));
    const copyButtons = screen.getAllByLabelText("Copy to clipboard");
    fireEvent.click(copyButtons[1]);
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      "Detailed summary content here.",
    );
  });

  it("does not render create new summary button when callback is not provided", () => {
    renderModal();
    expect(screen.queryByText("Create new summary")).toBeNull();
  });

  it("renders create new summary button when callback is provided", () => {
    renderModal({ onCreateNewSummary: vi.fn() });
    expect(screen.getByText("Create new summary")).toBeTruthy();
  });

  it("calls onCreateNewSummary when button is clicked", () => {
    const onCreateNewSummary = vi.fn();
    renderModal({ onCreateNewSummary });
    fireEvent.click(screen.getByText("Create new summary"));
    expect(onCreateNewSummary).toHaveBeenCalledOnce();
  });

  it("shows 'Summarizing...' when isCreatePending is true", () => {
    renderModal({ onCreateNewSummary: vi.fn(), isCreatePending: true });
    expect(screen.getByText("Summarizing...")).toBeTruthy();
  });

  it("disables create button when isCreatePending is true", () => {
    renderModal({ onCreateNewSummary: vi.fn(), isCreatePending: true });
    const button = screen.getByText("Summarizing...").closest("button");
    expect((button as HTMLButtonElement).disabled).toBe(true);
  });

  it("calls onClose when dialog is dismissed", () => {
    const onClose = vi.fn();
    renderModal({ onClose });
    // The dialog's close button (X) triggers onOpenChange(false), which calls onClose
    const closeButton = screen.getByRole("button", { name: "Close" });
    fireEvent.click(closeButton);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("handles null summary gracefully (empty summaries array)", () => {
    renderModal({ summaries: [], initialIndex: 0 });
    expect(screen.getByText("No one liner provided.")).toBeTruthy();
  });

  it("renders empty content for null summary when expanded", () => {
    renderModal({ summaries: [], initialIndex: 0 });
    fireEvent.click(screen.getByText("Content"));
    expect(screen.getByTestId("markdown").textContent).toBe("");
  });
});
