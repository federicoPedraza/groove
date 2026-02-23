import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import { Toaster } from "@/components/ui/sonner";
import { App } from "@/src/App";
import { applyThemeToDom, resolveStoredTheme } from "@/src/lib/theme";
import "@/app/globals.css";

const disableStrictModeForPerf = import.meta.env.DEV && import.meta.env.VITE_DISABLE_STRICT_MODE === "true";

applyThemeToDom(resolveStoredTheme());

const appTree = (
  <BrowserRouter>
    <App />
    <Toaster richColors closeButton />
  </BrowserRouter>
);

createRoot(document.getElementById("root")!).render(disableStrictModeForPerf ? appTree : <StrictMode>{appTree}</StrictMode>);
