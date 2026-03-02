import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import * as Sentry from "@sentry/react";

import { App } from "@/src/App";
import { applyThemeToDom } from "@/src/lib/theme";
import { getGlobalSettingsSnapshot, getThemeMode, globalSettingsGet, subscribeToGlobalSettings } from "@/src/lib/ipc";
import "@/app/globals.css";

const SENTRY_DSN = "https://44bc6cff7295f7123a4bceaaa0b6e525@o4510958851063808.ingest.us.sentry.io/4510958860238848";
const SENTRY_TRACES_SAMPLE_RATE = import.meta.env.DEV ? 1.0 : 0.2;

let isSentryInitialized = false;
let isTelemetryEnabled = getGlobalSettingsSnapshot().telemetryEnabled;

function refreshTelemetryEnabledState(): void {
  isTelemetryEnabled = getGlobalSettingsSnapshot().telemetryEnabled;
}

function initSentryIfTelemetryEnabled(): void {
  if (isSentryInitialized) {
    return;
  }

  if (!isTelemetryEnabled) {
    return;
  }

  Sentry.init({
    dsn: SENTRY_DSN,
    release: import.meta.env.VITE_SENTRY_RELEASE ?? `groove-frontend@${import.meta.env.MODE}`,
    environment: import.meta.env.MODE,
    integrations: [Sentry.browserTracingIntegration()],
    beforeSend: (event) => (isTelemetryEnabled ? event : null),
    beforeBreadcrumb: (breadcrumb) => (isTelemetryEnabled ? breadcrumb : null),
    beforeSendTransaction: (event) => (isTelemetryEnabled ? event : null),
    tracesSampler: () => (isTelemetryEnabled ? SENTRY_TRACES_SAMPLE_RATE : 0),
    tracePropagationTargets: ["localhost", /^\//],
  });
  isSentryInitialized = true;
}

const disableStrictModeForPerf = import.meta.env.DEV && import.meta.env.VITE_DISABLE_STRICT_MODE === "true";

const appTree = (
  <BrowserRouter>
    <App />
  </BrowserRouter>
);

async function renderApp(): Promise<void> {
  applyThemeToDom(getThemeMode());

  try {
    await globalSettingsGet();
  } catch {
    // no-op; global defaults are already in memory
  }

  refreshTelemetryEnabledState();
  initSentryIfTelemetryEnabled();

  applyThemeToDom(getThemeMode());
  subscribeToGlobalSettings(() => {
    refreshTelemetryEnabledState();
    initSentryIfTelemetryEnabled();
    applyThemeToDom(getThemeMode());
  });

  createRoot(document.getElementById("root")!).render(disableStrictModeForPerf ? appTree : <StrictMode>{appTree}</StrictMode>);
}

void renderApp();
