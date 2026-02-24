import { toast as sonnerToast } from "sonner";

import { getIsCommandHistoryPanelOpen } from "@/lib/command-history-panel-state";

const SUPPRESSED_TOAST_ID = "" as ReturnType<typeof sonnerToast>;
const PASSTHROUGH_METHODS = new Set<string>(["dismiss"]);

export const toast: typeof sonnerToast = new Proxy(sonnerToast as typeof sonnerToast, {
  apply(target, thisArg, argArray) {
    if (getIsCommandHistoryPanelOpen()) {
      return SUPPRESSED_TOAST_ID;
    }

    return Reflect.apply(target, thisArg, argArray);
  },
  get(target, property, receiver) {
    const value = Reflect.get(target, property, receiver);
    if (typeof value !== "function" || PASSTHROUGH_METHODS.has(String(property))) {
      return value;
    }

    return (...args: unknown[]) => {
      if (getIsCommandHistoryPanelOpen()) {
        return SUPPRESSED_TOAST_ID;
      }

      return Reflect.apply(value, target, args);
    };
  },
});
