import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import { Toaster } from "@/components/ui/sonner";
import { App } from "@/src/App";
import { applyThemeToDom } from "@/src/lib/theme";
import { getThemeMode, globalSettingsGet, subscribeToGlobalSettings } from "@/src/lib/ipc";
import "@/app/globals.css";

const disableStrictModeForPerf = import.meta.env.DEV && import.meta.env.VITE_DISABLE_STRICT_MODE === "true";

const appTree = (
  <BrowserRouter>
    <App />
    <Toaster />
  </BrowserRouter>
);

async function renderApp(): Promise<void> {
  applyThemeToDom(getThemeMode());

  try {
    await globalSettingsGet();
  } catch {
    // no-op; global defaults are already in memory
  }

  applyThemeToDom(getThemeMode());
  subscribeToGlobalSettings(() => {
    applyThemeToDom(getThemeMode());
  });

  createRoot(document.getElementById("root")!).render(disableStrictModeForPerf ? appTree : <StrictMode>{appTree}</StrictMode>);
}

void renderApp();
