import { Profiler, type ReactNode } from "react";

import { profilingEnabled, record } from "@/src/lib/profiling";

type ProfiledRegionProps = {
  id: string;
  children: ReactNode;
};

/**
 * Wraps a subtree in a React `<Profiler>` when profiling is enabled, recording
 * each commit's actual render duration under `react:<id>:<phase>`. A plain
 * passthrough otherwise, so there is zero overhead when disabled. See
 * `./profiling` for how to enable profiling and read the summary.
 */
export function ProfiledRegion({ id, children }: ProfiledRegionProps) {
  if (!profilingEnabled) {
    return <>{children}</>;
  }
  return (
    <Profiler
      id={id}
      onRender={(_id, phase, actualDuration) => {
        record(`react:${id}:${phase}`, actualDuration);
      }}
    >
      {children}
    </Profiler>
  );
}
