import { pushToast, dismissToast, type ToastType } from "@/src/lib/toast-store";

export type ToastId = string;
export type ToastOptions = { description?: string; command?: string };
export type ToastMessage = string;

type ToastMethodFn = (message: string, options?: ToastOptions) => ToastId;

export interface ToastApi {
  (message: string, options?: ToastOptions): ToastId;
  success: ToastMethodFn;
  error: ToastMethodFn;
  info: ToastMethodFn;
  warning: ToastMethodFn;
  loading: ToastMethodFn;
  dismiss: (id: string) => void;
}

function createMethod(type: ToastType): ToastMethodFn {
  return (message: string, options?: ToastOptions) =>
    pushToast(type, message, {
      description: options?.description,
      command: options?.command,
    });
}

export const toast: ToastApi = Object.assign(
  (message: string, options?: ToastOptions): ToastId =>
    pushToast("default", message, {
      description: options?.description,
      command: options?.command,
    }),
  {
    success: createMethod("success"),
    error: createMethod("error"),
    info: createMethod("info"),
    warning: createMethod("warning"),
    loading: createMethod("loading"),
    dismiss: dismissToast,
  },
);
