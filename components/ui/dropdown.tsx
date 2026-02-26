"use client";

import type { ReactNode } from "react";
import { Check, ChevronDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export type DropdownOption = {
  value: string;
  label: string;
  valueLabel?: string;
  icon?: ReactNode;
  disabled?: boolean;
};

type DropdownProps = {
  ariaLabel: string;
  options: DropdownOption[];
  value: string | null;
  placeholder: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
  align?: "start" | "center" | "end";
  className?: string;
  triggerClassName?: string;
  contentClassName?: string;
  emptyLabel?: string;
  triggerIcon?: ReactNode;
  hideChevron?: boolean;
  triggerTooltip?: ReactNode;
  menuHeader?: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

export function Dropdown({
  ariaLabel,
  options,
  value,
  placeholder,
  onValueChange,
  disabled = false,
  align = "start",
  className,
  triggerClassName,
  contentClassName,
  emptyLabel = "No options available.",
  triggerIcon,
  hideChevron = false,
  triggerTooltip,
  menuHeader,
  open,
  onOpenChange,
}: DropdownProps) {
  const selectedOption = value ? options.find((option) => option.value === value) ?? null : null;
  const triggerLabel = selectedOption ? selectedOption.label : placeholder;
  const isIconOnlyTrigger = Boolean(triggerIcon) && hideChevron && triggerLabel.length === 0;

  const triggerButton = (
    <Button
      type="button"
      variant="outline"
      disabled={disabled}
      className={cn("w-full gap-2", isIconOnlyTrigger ? "justify-center" : "justify-between", triggerClassName)}
      aria-label={ariaLabel}
    >
      <span className={cn("flex min-w-0 items-center", isIconOnlyTrigger ? "" : "gap-2", className)}>
        {triggerIcon ? <span aria-hidden="true" className="shrink-0 text-muted-foreground">{triggerIcon}</span> : null}
        {!isIconOnlyTrigger ? <span className="truncate">{triggerLabel}</span> : null}
      </span>
      {!hideChevron ? <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" /> : null}
    </Button>
  );

  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      {triggerTooltip ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>{triggerButton}</DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>{triggerTooltip}</TooltipContent>
        </Tooltip>
      ) : (
        <DropdownMenuTrigger asChild>{triggerButton}</DropdownMenuTrigger>
      )}

      <DropdownMenuContent align={align} className={cn("w-80 max-w-[calc(100vw-2rem)]", contentClassName)}>
        {menuHeader}
        {options.length === 0 ? (
          <p className="px-2 py-1.5 text-sm text-muted-foreground">{emptyLabel}</p>
        ) : (
          options.map((option) => {
            const isSelected = selectedOption?.value === option.value;

            return (
              <DropdownMenuItem
                key={option.value}
                disabled={option.disabled}
                onSelect={() => {
                  onValueChange(option.value);
                }}
                title={option.valueLabel ?? option.label}
                className="min-w-0"
              >
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  {option.icon ? <span aria-hidden="true" className="shrink-0 text-muted-foreground">{option.icon}</span> : null}
                  <div className="min-w-0">
                    <p className="truncate">{option.label}</p>
                    {option.valueLabel ? <p className="truncate text-xs text-muted-foreground">{option.valueLabel}</p> : null}
                  </div>
                </div>
                {isSelected ? <Check aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" /> : null}
              </DropdownMenuItem>
            );
          })
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
