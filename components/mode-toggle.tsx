"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type ModeToggleProps = {
  compact?: boolean;
  className?: string;
};

const themes = [
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
  { value: "system", label: "System", Icon: Monitor },
] as const;

function ModeToggle({ compact = false, className }: ModeToggleProps) {
  const { theme, setTheme } = useTheme();
  const activeTheme = theme ?? "system";

  return (
    <TooltipProvider>
      <div
        className={cn(
          "rounded-md border bg-muted/40 p-1",
          compact
            ? "grid grid-rows-3 place-items-center gap-1"
            : "grid grid-cols-3 place-items-center gap-1",
          className,
        )}
        role="radiogroup"
        aria-label="Theme"
      >
        {themes.map(({ value, label, Icon }) => {
          const isActive = activeTheme === value;

          return (
            <Tooltip key={value}>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  size="sm"
                  variant={isActive ? "secondary" : "ghost"}
                  className={cn(
                    "h-8 w-8 p-0",
                    isActive
                      ? "text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                  onClick={() => {
                    setTheme(value);
                  }}
                  role="radio"
                  aria-checked={isActive}
                  aria-label={label}
                >
                  <Icon aria-hidden="true" className="size-4" />
                  <span className="sr-only">{label}</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent
                className={cn(
                  compact ? "hidden md:block" : "block",
                )}
              >
                {label}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
}

export { ModeToggle };
