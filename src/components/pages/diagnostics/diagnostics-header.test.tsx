import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DiagnosticsHeader } from "@/src/components/pages/diagnostics/diagnostics-header";

describe("DiagnosticsHeader", () => {
  let onLoadMostConsumingPrograms: ReturnType<typeof vi.fn>;
  let onCleanAll: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onLoadMostConsumingPrograms = vi.fn();
    onCleanAll = vi.fn();
  });

  it("renders heading and description", () => {
    render(
      <DiagnosticsHeader
        isLoadingMostConsumingPrograms={false}
        isCleaningAllDevServers={false}
        onLoadMostConsumingPrograms={onLoadMostConsumingPrograms}
        onCleanAll={onCleanAll}
      />,
    );

    expect(screen.getByText("Diagnostics")).toBeInTheDocument();
    expect(
      screen.getByText(/Inspect and stop local processes/),
    ).toBeInTheDocument();
  });

  it("renders the load top processes button and calls handler on click", () => {
    render(
      <DiagnosticsHeader
        isLoadingMostConsumingPrograms={false}
        isCleaningAllDevServers={false}
        onLoadMostConsumingPrograms={onLoadMostConsumingPrograms}
        onCleanAll={onCleanAll}
      />,
    );

    const loadButton = screen.getByRole("button", {
      name: /load top processes/i,
    });
    expect(loadButton).not.toBeDisabled();

    fireEvent.click(loadButton);
    expect(onLoadMostConsumingPrograms).toHaveBeenCalledTimes(1);
  });

  it("disables load button when loading", () => {
    render(
      <DiagnosticsHeader
        isLoadingMostConsumingPrograms={true}
        isCleaningAllDevServers={false}
        onLoadMostConsumingPrograms={onLoadMostConsumingPrograms}
        onCleanAll={onCleanAll}
      />,
    );

    const loadButton = screen.getByRole("button", {
      name: /load top processes/i,
    });
    expect(loadButton).toBeDisabled();
  });

  it("renders the clean all button and calls handler on click", () => {
    render(
      <DiagnosticsHeader
        isLoadingMostConsumingPrograms={false}
        isCleaningAllDevServers={false}
        onLoadMostConsumingPrograms={onLoadMostConsumingPrograms}
        onCleanAll={onCleanAll}
      />,
    );

    const cleanButton = screen.getByRole("button", {
      name: /clean all processes/i,
    });
    expect(cleanButton).not.toBeDisabled();

    fireEvent.click(cleanButton);
    expect(onCleanAll).toHaveBeenCalledTimes(1);
  });

  it("disables clean all button and shows cleaning label when cleaning", () => {
    render(
      <DiagnosticsHeader
        isLoadingMostConsumingPrograms={false}
        isCleaningAllDevServers={true}
        onLoadMostConsumingPrograms={onLoadMostConsumingPrograms}
        onCleanAll={onCleanAll}
      />,
    );

    const cleanButton = screen.getByRole("button", {
      name: /cleaning all processes/i,
    });
    expect(cleanButton).toBeDisabled();
  });
});
