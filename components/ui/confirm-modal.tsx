"use client";

import { Loader2 } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ConfirmModalProps = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  secondaryActionLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  secondaryActionDestructive?: boolean;
  loading?: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  onSecondaryAction?: () => void;
  onCancel: () => void;
};

function ConfirmModal({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  secondaryActionLabel,
  cancelLabel = "Cancel",
  destructive = false,
  secondaryActionDestructive = false,
  loading = false,
  onOpenChange,
  onConfirm,
  onSecondaryAction,
  onCancel,
}: ConfirmModalProps) {
  const hasSecondaryAction = typeof secondaryActionLabel === "string" && secondaryActionLabel.trim().length > 0 && typeof onSecondaryAction === "function";

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel
            asChild
            onClick={() => {
              if (!loading) {
                onCancel();
              }
            }}
          >
            <button
              type="button"
              className={cn(buttonVariants({ variant: "outline" }))}
              disabled={loading}
            >
              {cancelLabel}
            </button>
          </AlertDialogCancel>
          {hasSecondaryAction ? (
            <AlertDialogAction
              asChild
              onClick={(event) => {
                if (loading) {
                  event.preventDefault();
                  return;
                }

                onSecondaryAction();
              }}
            >
              <button
                type="button"
                className={cn(buttonVariants({ variant: secondaryActionDestructive ? "destructive" : "secondary" }))}
                disabled={loading}
              >
                <span>{secondaryActionLabel}</span>
              </button>
            </AlertDialogAction>
          ) : null}
          <AlertDialogAction
            asChild
            onClick={(event) => {
              if (loading) {
                event.preventDefault();
                return;
              }

              onConfirm();
            }}
          >
            <button
              type="button"
              className={cn(buttonVariants({ variant: destructive ? "destructive" : "default" }))}
              disabled={loading}
            >
              {loading ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : null}
              <span>{confirmLabel}</span>
            </button>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export { ConfirmModal };
export type { ConfirmModalProps };
