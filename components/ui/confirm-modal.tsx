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
  cancelLabel?: string;
  destructive?: boolean;
  loading?: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  onCancel: () => void;
};

function ConfirmModal({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  loading = false,
  onOpenChange,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
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
