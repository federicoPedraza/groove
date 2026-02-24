import { Loader2 } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type ProcessActionButtonProps = {
  pending: boolean;
  label: string;
  icon: ReactNode;
  onClick: () => void;
  className?: string;
  variant?: "default" | "secondary" | "destructive" | "outline" | "ghost";
  iconOnly?: boolean;
  title?: string;
  tooltip?: string;
};

export function ProcessActionButton({ pending, label, icon, onClick, className, variant = "secondary", iconOnly = false, title, tooltip }: ProcessActionButtonProps) {
  const actionLabel = pending ? `${label} in progress` : label;
  const button = (
    <Button
      type="button"
      size="sm"
      variant={variant}
      onClick={onClick}
      disabled={pending}
      className={cn(iconOnly ? "h-8 w-8 p-0" : undefined, className)}
      aria-label={actionLabel}
      title={title}
    >
      {pending ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : icon}
      {!iconOnly && <span>{label}</span>}
    </Button>
  );

  if (!tooltip) {
    return button;
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>{button}</TooltipTrigger>
        <TooltipContent>{tooltip}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
