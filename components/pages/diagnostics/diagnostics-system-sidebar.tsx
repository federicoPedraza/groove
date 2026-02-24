import { RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Sidebar, SidebarContent, SidebarHeader } from "@/components/ui/sidebar";
import type { DiagnosticsSystemOverview } from "@/src/lib/ipc";

type DiagnosticsSystemSidebarProps = {
  collapsed: boolean;
  overview: DiagnosticsSystemOverview | null;
  isLoading: boolean;
  errorMessage: string | null;
  onRefresh: () => void;
};

type MetricRowProps = {
  label: string;
  value: number | null;
  labelClassName: string;
  colorClassName: string;
  trackClassName: string;
};

type CollapsedMetricItemProps = {
  label: string;
  value: number | null;
  labelClassName: string;
};

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

function formatIntegerPercent(value: number): string {
  return `${Math.round(value)}%`;
}

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value < 0) {
    return "Unavailable";
  }

  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = value;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  const precision = size >= 100 || unitIndex === 0 ? 0 : 1;
  return `${size.toFixed(precision)} ${units[unitIndex]}`;
}

function MetricRow({ label, value, labelClassName, colorClassName, trackClassName }: MetricRowProps) {
  const clampedValue = typeof value === "number" ? Math.max(0, Math.min(100, value)) : null;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className={`font-medium ${labelClassName}`}>{label}</span>
        <span className="text-muted-foreground">{clampedValue == null ? "Unavailable" : formatPercent(clampedValue)}</span>
      </div>
      <div className={`h-2 overflow-hidden rounded-full ${trackClassName}`}>
        <div
          className={`h-full rounded-full transition-[width] duration-300 ${colorClassName}`}
          style={{ width: `${clampedValue ?? 0}%` }}
          role="progressbar"
          aria-label={`${label} usage`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={clampedValue ?? 0}
        />
      </div>
    </div>
  );
}

function CollapsedMetricItem({ label, value, labelClassName }: CollapsedMetricItemProps) {
  const clampedValue = typeof value === "number" ? Math.max(0, Math.min(100, value)) : null;

  return (
    <div className="px-2 py-1.5 text-center">
      <p className={`text-[10px] font-semibold uppercase tracking-wide ${labelClassName}`}>{label}</p>
      <p className="text-xs font-medium text-foreground">{clampedValue == null ? "N/A" : formatIntegerPercent(clampedValue)}</p>
    </div>
  );
}

export function DiagnosticsSystemSidebar({ collapsed, overview, isLoading, errorMessage, onRefresh }: DiagnosticsSystemSidebarProps) {
  const hostnameLabel = overview?.hostname?.trim() || "Unavailable";
  const platformLabel = overview?.platform || "unknown";
  const cpuCoresLabel = overview?.cpuCores == null ? "Unavailable" : String(overview.cpuCores);
  const ramLabel =
    overview?.ramUsedBytes == null || overview.ramTotalBytes == null
      ? "Unavailable"
      : `${formatBytes(overview.ramUsedBytes)} / ${formatBytes(overview.ramTotalBytes)}`;
  const swapLabel =
    overview?.swapUsedBytes == null || overview.swapTotalBytes == null
      ? "Unavailable"
      : `${formatBytes(overview.swapUsedBytes)} / ${formatBytes(overview.swapTotalBytes)}`;
  const diskLabel =
    overview?.diskUsedBytes == null || overview.diskTotalBytes == null
      ? "Unavailable"
      : `${formatBytes(overview.diskUsedBytes)} / ${formatBytes(overview.diskTotalBytes)}`;

  return (
    <Sidebar collapsed={collapsed}>
      <SidebarHeader>
        {collapsed ? (
          <h2 className="text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">Sys</h2>
        ) : (
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">System</h2>
            <Button type="button" size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={onRefresh} disabled={isLoading} aria-label="Refresh system diagnostics">
              <RefreshCw aria-hidden="true" className={`size-3.5 ${isLoading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        )}
      </SidebarHeader>
      <SidebarContent className="space-y-3">
        {collapsed ? (
          <div className="space-y-2 pt-1">
            <CollapsedMetricItem label="CPU" value={overview?.cpuUsagePercent ?? null} labelClassName="text-amber-500" />
            <CollapsedMetricItem label="RAM" value={overview?.ramUsagePercent ?? null} labelClassName="text-blue-500" />
            <CollapsedMetricItem label="Swap" value={overview?.swapUsagePercent ?? null} labelClassName="text-rose-500" />
            <CollapsedMetricItem label="Disk" value={overview?.diskUsagePercent ?? null} labelClassName="text-emerald-500" />
          </div>
        ) : (
          <>
            <div className="space-y-2 rounded-md border bg-muted/20 p-2.5">
              <MetricRow label="CPU" value={overview?.cpuUsagePercent ?? null} labelClassName="text-muted-foreground" colorClassName="bg-amber-500" trackClassName="bg-amber-500/20" />
              <MetricRow label="RAM" value={overview?.ramUsagePercent ?? null} labelClassName="text-muted-foreground" colorClassName="bg-blue-500" trackClassName="bg-blue-500/20" />
              <MetricRow label="Swap" value={overview?.swapUsagePercent ?? null} labelClassName="text-muted-foreground" colorClassName="bg-rose-500" trackClassName="bg-rose-500/20" />
              <MetricRow label="Disk" value={overview?.diskUsagePercent ?? null} labelClassName="text-muted-foreground" colorClassName="bg-emerald-500" trackClassName="bg-emerald-500/20" />
            </div>

            <div className="space-y-2 rounded-md border bg-muted/10 p-2.5 text-xs">
              <p className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Hostname</span>
                <span className="max-w-[9rem] truncate font-medium" title={hostnameLabel}>{hostnameLabel}</span>
              </p>
              <p className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Platform</span>
                <span className="font-medium">{platformLabel}</span>
              </p>
              <p className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">CPU cores</span>
                <span className="font-medium">{cpuCoresLabel}</span>
              </p>
              <p className="space-y-0.5">
                <span className="block text-muted-foreground">RAM used</span>
                <span className="block truncate font-medium" title={ramLabel}>{ramLabel}</span>
              </p>
              <p className="space-y-0.5">
                <span className="block text-muted-foreground">Swap used</span>
                <span className="block truncate font-medium" title={swapLabel}>{swapLabel}</span>
              </p>
              <p className="space-y-0.5">
                <span className="block text-muted-foreground">Disk used</span>
                <span className="block truncate font-medium" title={diskLabel}>{diskLabel}</span>
              </p>
            </div>

            {errorMessage && (
              <p className="rounded-md border border-destructive/40 bg-destructive/10 px-2.5 py-2 text-xs text-destructive">{errorMessage}</p>
            )}
          </>
        )}
      </SidebarContent>
    </Sidebar>
  );
}
