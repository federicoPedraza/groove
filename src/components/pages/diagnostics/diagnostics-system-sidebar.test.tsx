import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DiagnosticsSystemSidebar } from "@/src/components/pages/diagnostics/diagnostics-system-sidebar";
import type { DiagnosticsSystemOverview } from "@/src/lib/ipc";

const FULL_OVERVIEW: DiagnosticsSystemOverview = {
  cpuUsagePercent: 42.5,
  cpuCores: 8,
  ramTotalBytes: 16 * 1024 * 1024 * 1024,
  ramUsedBytes: 8 * 1024 * 1024 * 1024,
  ramUsagePercent: 55,
  swapTotalBytes: 4 * 1024 * 1024 * 1024,
  swapUsedBytes: 1 * 1024 * 1024 * 1024,
  swapUsagePercent: 25,
  diskTotalBytes: 500 * 1024 * 1024 * 1024,
  diskUsedBytes: 250 * 1024 * 1024 * 1024,
  diskUsagePercent: 70,
  platform: "linux",
  hostname: "test-host",
};

describe("DiagnosticsSystemSidebar", () => {
  let onRefresh: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onRefresh = vi.fn();
  });

  describe("expanded view", () => {
    it("renders system heading and refresh button", () => {
      render(
        <DiagnosticsSystemSidebar
          collapsed={false}
          overview={FULL_OVERVIEW}
          isLoading={false}
          errorMessage={null}
          onRefresh={onRefresh}
        />,
      );

      expect(screen.getByText("System")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /refresh system diagnostics/i })).toBeInTheDocument();
    });

    it("calls onRefresh when refresh button is clicked", () => {
      render(
        <DiagnosticsSystemSidebar
          collapsed={false}
          overview={FULL_OVERVIEW}
          isLoading={false}
          errorMessage={null}
          onRefresh={onRefresh}
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: /refresh system diagnostics/i }));
      expect(onRefresh).toHaveBeenCalledTimes(1);
    });

    it("disables refresh button when loading", () => {
      render(
        <DiagnosticsSystemSidebar
          collapsed={false}
          overview={FULL_OVERVIEW}
          isLoading={true}
          errorMessage={null}
          onRefresh={onRefresh}
        />,
      );

      expect(screen.getByRole("button", { name: /refresh system diagnostics/i })).toBeDisabled();
    });

    it("renders metric progress bars for CPU, RAM, Swap, and Disk", () => {
      render(
        <DiagnosticsSystemSidebar
          collapsed={false}
          overview={FULL_OVERVIEW}
          isLoading={false}
          errorMessage={null}
          onRefresh={onRefresh}
        />,
      );

      const progressBars = screen.getAllByRole("progressbar");
      expect(progressBars).toHaveLength(4);

      const cpuBar = screen.getByRole("progressbar", { name: "CPU usage" });
      expect(cpuBar).toHaveAttribute("aria-valuenow", "42.5");

      const ramBar = screen.getByRole("progressbar", { name: "RAM usage" });
      expect(ramBar).toHaveAttribute("aria-valuenow", "55");

      const swapBar = screen.getByRole("progressbar", { name: "Swap usage" });
      expect(swapBar).toHaveAttribute("aria-valuenow", "25");

      const diskBar = screen.getByRole("progressbar", { name: "Disk usage" });
      expect(diskBar).toHaveAttribute("aria-valuenow", "70");
    });

    it("displays system information labels", () => {
      render(
        <DiagnosticsSystemSidebar
          collapsed={false}
          overview={FULL_OVERVIEW}
          isLoading={false}
          errorMessage={null}
          onRefresh={onRefresh}
        />,
      );

      expect(screen.getByText("test-host")).toBeInTheDocument();
      expect(screen.getByText("linux")).toBeInTheDocument();
      expect(screen.getByText("8")).toBeInTheDocument();
    });

    it("shows Unavailable when overview is null", () => {
      render(
        <DiagnosticsSystemSidebar
          collapsed={false}
          overview={null}
          isLoading={false}
          errorMessage={null}
          onRefresh={onRefresh}
        />,
      );

      const unavailableElements = screen.getAllByText("Unavailable");
      expect(unavailableElements.length).toBeGreaterThanOrEqual(4);
    });

    it("displays error message when provided", () => {
      render(
        <DiagnosticsSystemSidebar
          collapsed={false}
          overview={null}
          isLoading={false}
          errorMessage="Connection failed"
          onRefresh={onRefresh}
        />,
      );

      expect(screen.getByText("Connection failed")).toBeInTheDocument();
    });

    it("does not display error message when null", () => {
      render(
        <DiagnosticsSystemSidebar
          collapsed={false}
          overview={FULL_OVERVIEW}
          isLoading={false}
          errorMessage={null}
          onRefresh={onRefresh}
        />,
      );

      expect(screen.queryByText("Connection failed")).not.toBeInTheDocument();
    });

    it("shows Unavailable for hostname when overview hostname is empty", () => {
      const overviewWithEmptyHostname: DiagnosticsSystemOverview = {
        ...FULL_OVERVIEW,
        hostname: "  ",
      };
      render(
        <DiagnosticsSystemSidebar
          collapsed={false}
          overview={overviewWithEmptyHostname}
          isLoading={false}
          errorMessage={null}
          onRefresh={onRefresh}
        />,
      );

      const unavailableElements = screen.getAllByText("Unavailable");
      expect(unavailableElements.length).toBeGreaterThanOrEqual(1);
    });

    it("clamps metric values between 0 and 100", () => {
      const overviewWithExtremes: DiagnosticsSystemOverview = {
        ...FULL_OVERVIEW,
        cpuUsagePercent: 150,
        ramUsagePercent: -10,
      };
      render(
        <DiagnosticsSystemSidebar
          collapsed={false}
          overview={overviewWithExtremes}
          isLoading={false}
          errorMessage={null}
          onRefresh={onRefresh}
        />,
      );

      const cpuBar = screen.getByRole("progressbar", { name: "CPU usage" });
      expect(cpuBar).toHaveAttribute("aria-valuenow", "100");

      const ramBar = screen.getByRole("progressbar", { name: "RAM usage" });
      expect(ramBar).toHaveAttribute("aria-valuenow", "0");
    });

    it("handles partial overview with missing ram/swap/disk bytes", () => {
      const partialOverview: DiagnosticsSystemOverview = {
        cpuUsagePercent: 30,
        platform: "macos",
      };
      render(
        <DiagnosticsSystemSidebar
          collapsed={false}
          overview={partialOverview}
          isLoading={false}
          errorMessage={null}
          onRefresh={onRefresh}
        />,
      );

      expect(screen.getByText("macos")).toBeInTheDocument();
      const unavailableElements = screen.getAllByText("Unavailable");
      expect(unavailableElements.length).toBeGreaterThanOrEqual(3);
    });

    it("shows formatPercent values for metric rows", () => {
      render(
        <DiagnosticsSystemSidebar
          collapsed={false}
          overview={FULL_OVERVIEW}
          isLoading={false}
          errorMessage={null}
          onRefresh={onRefresh}
        />,
      );

      expect(screen.getByText("42.5%")).toBeInTheDocument();
      expect(screen.getByText("55.0%")).toBeInTheDocument();
      expect(screen.getByText("25.0%")).toBeInTheDocument();
      expect(screen.getByText("70.0%")).toBeInTheDocument();
    });

    it("renders byte labels for RAM, Swap, and Disk", () => {
      render(
        <DiagnosticsSystemSidebar
          collapsed={false}
          overview={FULL_OVERVIEW}
          isLoading={false}
          errorMessage={null}
          onRefresh={onRefresh}
        />,
      );

      expect(screen.getByTitle("8.0 GB / 16.0 GB")).toBeInTheDocument();
      expect(screen.getByTitle("1.0 GB / 4.0 GB")).toBeInTheDocument();
      expect(screen.getByTitle("250 GB / 500 GB")).toBeInTheDocument();
    });

    it("handles zero-byte values in formatBytes", () => {
      const overviewWithZeros: DiagnosticsSystemOverview = {
        ...FULL_OVERVIEW,
        ramUsedBytes: 0,
        ramTotalBytes: 0,
      };
      render(
        <DiagnosticsSystemSidebar
          collapsed={false}
          overview={overviewWithZeros}
          isLoading={false}
          errorMessage={null}
          onRefresh={onRefresh}
        />,
      );

      expect(screen.getByTitle("0 B / 0 B")).toBeInTheDocument();
    });

    it("handles negative byte values in formatBytes", () => {
      const overviewWithNegative: DiagnosticsSystemOverview = {
        ...FULL_OVERVIEW,
        ramUsedBytes: -1,
        ramTotalBytes: 1024,
      };
      render(
        <DiagnosticsSystemSidebar
          collapsed={false}
          overview={overviewWithNegative}
          isLoading={false}
          errorMessage={null}
          onRefresh={onRefresh}
        />,
      );

      expect(screen.getByTitle("Unavailable / 1.0 KB")).toBeInTheDocument();
    });

    it("handles NaN byte values in formatBytes", () => {
      const overviewWithNaN: DiagnosticsSystemOverview = {
        ...FULL_OVERVIEW,
        diskUsedBytes: NaN,
        diskTotalBytes: 1024 * 1024,
      };
      render(
        <DiagnosticsSystemSidebar
          collapsed={false}
          overview={overviewWithNaN}
          isLoading={false}
          errorMessage={null}
          onRefresh={onRefresh}
        />,
      );

      expect(screen.getByTitle("Unavailable / 1.0 MB")).toBeInTheDocument();
    });

    it("handles large byte values reaching TB unit", () => {
      const overviewWithTB: DiagnosticsSystemOverview = {
        ...FULL_OVERVIEW,
        diskUsedBytes: 2 * 1024 * 1024 * 1024 * 1024,
        diskTotalBytes: 4 * 1024 * 1024 * 1024 * 1024,
      };
      render(
        <DiagnosticsSystemSidebar
          collapsed={false}
          overview={overviewWithTB}
          isLoading={false}
          errorMessage={null}
          onRefresh={onRefresh}
        />,
      );

      expect(screen.getByTitle("2.0 TB / 4.0 TB")).toBeInTheDocument();
    });

    it("formats bytes >= 100 with 0 decimal precision", () => {
      const overviewWithLargeKB: DiagnosticsSystemOverview = {
        ...FULL_OVERVIEW,
        swapUsedBytes: 200 * 1024,
        swapTotalBytes: 300 * 1024,
      };
      render(
        <DiagnosticsSystemSidebar
          collapsed={false}
          overview={overviewWithLargeKB}
          isLoading={false}
          errorMessage={null}
          onRefresh={onRefresh}
        />,
      );

      expect(screen.getByTitle("200 KB / 300 KB")).toBeInTheDocument();
    });

    it("shows unknown for platform when not provided", () => {
      render(
        <DiagnosticsSystemSidebar
          collapsed={false}
          overview={{ platform: "" } as DiagnosticsSystemOverview}
          isLoading={false}
          errorMessage={null}
          onRefresh={onRefresh}
        />,
      );

      expect(screen.getByText("unknown")).toBeInTheDocument();
    });
  });

  describe("collapsed view", () => {
    it("renders Sys heading instead of System", () => {
      render(
        <DiagnosticsSystemSidebar
          collapsed={true}
          overview={FULL_OVERVIEW}
          isLoading={false}
          errorMessage={null}
          onRefresh={onRefresh}
        />,
      );

      expect(screen.getByText("Sys")).toBeInTheDocument();
      expect(screen.queryByText("System")).not.toBeInTheDocument();
    });

    it("renders collapsed metric items with integer percentages", () => {
      render(
        <DiagnosticsSystemSidebar
          collapsed={true}
          overview={FULL_OVERVIEW}
          isLoading={false}
          errorMessage={null}
          onRefresh={onRefresh}
        />,
      );

      expect(screen.getByText("CPU")).toBeInTheDocument();
      expect(screen.getByText("RAM")).toBeInTheDocument();
      expect(screen.getByText("Swap")).toBeInTheDocument();
      expect(screen.getByText("Disk")).toBeInTheDocument();
      expect(screen.getByText("43%")).toBeInTheDocument();
      expect(screen.getByText("55%")).toBeInTheDocument();
      expect(screen.getByText("25%")).toBeInTheDocument();
      expect(screen.getByText("70%")).toBeInTheDocument();
    });

    it("shows N/A when overview is null in collapsed view", () => {
      render(
        <DiagnosticsSystemSidebar
          collapsed={true}
          overview={null}
          isLoading={false}
          errorMessage={null}
          onRefresh={onRefresh}
        />,
      );

      const naElements = screen.getAllByText("N/A");
      expect(naElements).toHaveLength(4);
    });

    it("does not render refresh button in collapsed view", () => {
      render(
        <DiagnosticsSystemSidebar
          collapsed={true}
          overview={FULL_OVERVIEW}
          isLoading={false}
          errorMessage={null}
          onRefresh={onRefresh}
        />,
      );

      expect(screen.queryByRole("button", { name: /refresh system diagnostics/i })).not.toBeInTheDocument();
    });

    it("clamps collapsed metric values", () => {
      const overviewClamped: DiagnosticsSystemOverview = {
        ...FULL_OVERVIEW,
        cpuUsagePercent: -5,
        ramUsagePercent: 200,
      };
      render(
        <DiagnosticsSystemSidebar
          collapsed={true}
          overview={overviewClamped}
          isLoading={false}
          errorMessage={null}
          onRefresh={onRefresh}
        />,
      );

      expect(screen.getByText("0%")).toBeInTheDocument();
      expect(screen.getByText("100%")).toBeInTheDocument();
    });
  });
});
