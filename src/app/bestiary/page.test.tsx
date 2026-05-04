import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import BestiaryPage from "@/src/app/bestiary/page";
import {
  AppLayoutContext,
  EMPTY_OPTIONS,
  type AppLayoutContextValue,
} from "@/src/components/pages/use-app-layout";
import { getBugDefinition } from "@/src/lib/bestiary/definitions";
import {
  clearWorkspaceContextStore,
  publishWorkspaceContext,
} from "@/src/lib/workspace-store";
import type {
  WorkspaceContextResponse,
  WorkspaceMeta,
} from "@/src/lib/ipc";

const APP_LAYOUT_CONTEXT_VALUE: AppLayoutContextValue = {
  setOptions: () => {
    void EMPTY_OPTIONS;
  },
};

function renderBestiary() {
  return render(
    <AppLayoutContext.Provider value={APP_LAYOUT_CONTEXT_VALUE}>
      <BestiaryPage />
    </AppLayoutContext.Provider>,
  );
}

function makeWorkspaceMeta(
  overrides: Partial<WorkspaceMeta> = {},
): WorkspaceMeta {
  return {
    version: 1,
    rootName: "groove",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
    ...overrides,
  };
}

function publishMeta(meta: WorkspaceMeta): void {
  const response: WorkspaceContextResponse = {
    ok: true,
    rows: [],
    workspaceMeta: meta,
  };
  publishWorkspaceContext(response);
}

describe("BestiaryPage", () => {
  afterEach(() => {
    clearWorkspaceContextStore();
  });

  it("shows empty-workspace fallback when no workspace is open", () => {
    renderBestiary();
    expect(
      screen.getByText("Open a workspace to view its bestiary."),
    ).toBeTruthy();
  });

  it("renders four kingdom sections with their headers", () => {
    publishMeta(makeWorkspaceMeta({ knownBugs: [] }));
    renderBestiary();

    expect(
      screen.getByRole("heading", { level: 2, name: "Veilwood" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("heading", { level: 2, name: "Emberforge" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("heading", { level: 2, name: "Tidehollow" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("heading", { level: 2, name: "Voidspire" }),
    ).toBeTruthy();
  });

  it("places known bugs under the section matching their kingdom", () => {
    publishMeta(makeWorkspaceMeta({ knownBugs: ["Omen", "Skarn", "Pyx"] }));
    renderBestiary();

    expect(screen.getByText("3 / 100 discovered")).toBeTruthy();

    const veilwoodList = screen.getByRole("list", { name: "Veilwood bugs" });
    expect(
      within(veilwoodList).getByRole("button", {
        name: "Open details for Omen",
      }),
    ).toBeTruthy();
    expect(
      within(veilwoodList).getByRole("button", {
        name: "Open details for Skarn",
      }),
    ).toBeTruthy();
    expect(
      within(veilwoodList).getAllByLabelText("Undiscovered bug"),
    ).toHaveLength(23);

    const voidspireList = screen.getByRole("list", { name: "Voidspire bugs" });
    expect(
      within(voidspireList).getByRole("button", {
        name: "Open details for Pyx",
      }),
    ).toBeTruthy();
    expect(
      within(voidspireList).getAllByLabelText("Undiscovered bug"),
    ).toHaveLength(24);

    expect(
      within(screen.getByRole("list", { name: "Emberforge bugs" })).getAllByLabelText(
        "Undiscovered bug",
      ),
    ).toHaveLength(25);
    expect(
      within(screen.getByRole("list", { name: "Tidehollow bugs" })).getAllByLabelText(
        "Undiscovered bug",
      ),
    ).toHaveLength(25);
  });

  it("renders 25 hidden silhouettes per kingdom when no bugs are known yet", () => {
    publishMeta(makeWorkspaceMeta({ knownBugs: [] }));
    renderBestiary();

    expect(screen.getByText("0 / 100 discovered")).toBeTruthy();
    for (const label of [
      "Veilwood bugs",
      "Emberforge bugs",
      "Tidehollow bugs",
      "Voidspire bugs",
    ]) {
      const list = screen.getByRole("list", { name: label });
      expect(within(list).getAllByLabelText("Undiscovered bug")).toHaveLength(
        25,
      );
    }
  });

  it("opens the detail modal when a known bug is clicked and closes it via the close button", () => {
    publishMeta(makeWorkspaceMeta({ knownBugs: ["Omen"] }));
    renderBestiary();

    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.click(
      screen.getByRole("button", { name: "Open details for Omen" }),
    );

    const dialog = screen.getByRole("dialog");
    const definition = getBugDefinition("Omen");
    if (!definition) {
      throw new Error("Test fixture: Omen must exist in BUG_DEFINITIONS");
    }
    expect(within(dialog).getByText("Omen")).toBeTruthy();
    expect(within(dialog).getByText("Veilwood")).toBeTruthy();
    expect(within(dialog).getByText(definition.description)).toBeTruthy();
    expect(within(dialog).getByText(definition.history)).toBeTruthy();

    fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
