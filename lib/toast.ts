import { toast as sonnerToast } from "sonner";

import { getIsCommandHistoryPanelOpen } from "@/lib/command-history-panel-state";

export type ToastId = ReturnType<typeof sonnerToast>;
export type ToastMessage = Parameters<typeof sonnerToast>[0];
export type ToastOptions = NonNullable<Parameters<typeof sonnerToast>[1]>;
export type ToastApi = typeof sonnerToast;

const SUPPRESSED_TOAST_ID = "" as ToastId;
const PASSTHROUGH_METHODS = new Set<string>(["dismiss"]);

export const toast: ToastApi = new Proxy(sonnerToast as ToastApi, {
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
