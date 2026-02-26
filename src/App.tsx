import { Navigate, Route, Routes } from "react-router-dom";

import Home from "@/app/page";
import DiagnosticsPage from "@/app/diagnostics/page";
import SettingsPage from "@/app/settings/page";
import WorktreesPage from "@/app/worktrees/page";
import WorktreeDetailPage from "@/app/worktrees/worktree-detail-page";
import { CommandHistoryPanel } from "@/components/command-history-panel";

export function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/worktrees" element={<WorktreesPage />} />
        <Route path="/worktrees/:worktree" element={<WorktreeDetailPage />} />
        <Route path="/diagnostics" element={<DiagnosticsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <CommandHistoryPanel />
    </>
  );
}
