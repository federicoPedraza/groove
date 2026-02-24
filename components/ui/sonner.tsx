"use client";

import { CheckCircle2, Info, LoaderCircle, TriangleAlert, XCircle } from "lucide-react";
import type { ComponentProps } from "react";
import { Toaster as Sonner } from "sonner";

import { cn } from "@/lib/utils";

type ToasterProps = ComponentProps<typeof Sonner>;

function Toaster(props: ToasterProps) {
  return (
    <Sonner
      position="bottom-left"
      closeButton
      expand={false}
      visibleToasts={3}
      offset={{ bottom: 68, left: 16, right: 16 }}
      mobileOffset={{ bottom: 68, left: 12, right: 12 }}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast: cn(
            "rounded-md border bg-card px-3 py-2 shadow-sm",
            "flex min-h-0 w-[23rem] max-w-[calc(100vw-2rem)] items-start gap-2",
          ),
          content: "grid min-w-0 flex-1 gap-0.5",
          icon: "mt-0.5 shrink-0",
          title: "text-xs font-medium text-foreground/90",
          description: "line-clamp-2 text-[11px] text-muted-foreground",
          closeButton:
            "ml-1 inline-flex size-5 items-center justify-center rounded border border-border/70 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
          success: "border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950",
          error: "border-rose-200 bg-rose-50 dark:border-rose-800 dark:bg-rose-950",
          info: "border-sky-200 bg-sky-50 dark:border-sky-800 dark:bg-sky-950",
          warning: "border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950",
          loading: "border-sky-200 bg-sky-50 dark:border-sky-800 dark:bg-sky-950",
          default: "border-border/80",
        },
      }}
      icons={{
        success: <CheckCircle2 className="size-3.5 text-emerald-700" aria-hidden="true" />,
        error: <XCircle className="size-3.5 text-rose-700" aria-hidden="true" />,
        info: <Info className="size-3.5 text-sky-700" aria-hidden="true" />,
        warning: <TriangleAlert className="size-3.5 text-amber-700" aria-hidden="true" />,
        loading: <LoaderCircle className="size-3.5 animate-spin text-sky-700" aria-hidden="true" />,
      }}
      {...props}
    />
  );
}

export { Toaster };
