import { Navigate, Route, Routes } from "react-router-dom";

import Home from "@/app/page";
import DiagnosticsPage from "@/app/diagnostics/page";
import SettingsPage from "@/app/settings/page";

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/diagnostics" element={<DiagnosticsPage />} />
      <Route path="/settings" element={<SettingsPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
