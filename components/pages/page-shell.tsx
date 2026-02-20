import type { ReactNode } from "react";

import { AppNavigation } from "@/components/app-navigation";

type PageShellProps = {
  children: ReactNode;
};

export function PageShell({ children }: PageShellProps) {
  return (
    <main className="min-h-screen w-full p-4 md:p-6">
      <div className="mx-auto flex w-full max-w-7xl gap-4">
        <AppNavigation />
        <div className="min-w-0 flex-1 space-y-4">{children}</div>
      </div>
    </main>
  );
}
