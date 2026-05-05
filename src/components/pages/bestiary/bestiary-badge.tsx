import { Bug } from "lucide-react";

import { Badge, badgeVariants } from "@/src/components/ui/badge";
import { BUG_BADGE_CLASSES } from "@/src/components/pages/barracks/worktree-unit";
import { cn } from "@/src/lib/utils";

const BUG_BADGE_HIDDEN_CLASSES =
  "border-muted bg-muted/40 text-muted-foreground/60 [&>svg]:text-muted-foreground/60 dark:border-muted dark:bg-muted/40 dark:text-muted-foreground/60 dark:[&>svg]:text-muted-foreground/60";

const BUG_BADGE_INTERACTIVE_CLASSES =
  "cursor-pointer hover:brightness-110 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

type BestiaryBadgeProps =
  | { mode: "known"; name: string; onClick?: () => void }
  | { mode: "hidden" };

export function BestiaryBadge(props: BestiaryBadgeProps) {
  if (props.mode === "known") {
    if (props.onClick) {
      const handleClick = props.onClick;
      return (
        <button
          type="button"
          className={cn(
            badgeVariants({ variant: "outline" }),
            BUG_BADGE_CLASSES,
            BUG_BADGE_INTERACTIVE_CLASSES,
            "[&>svg]:size-4",
          )}
          onClick={handleClick}
          title={props.name}
          aria-label={`Open details for ${props.name}`}
        >
          <Bug aria-hidden="true" />
          <span>{props.name}</span>
        </button>
      );
    }

    return (
      <Badge
        variant="outline"
        className={cn(BUG_BADGE_CLASSES, "[&>svg]:size-4")}
        title={props.name}
      >
        <Bug aria-hidden="true" />
        <span>{props.name}</span>
      </Badge>
    );
  }

  return (
    <Badge
      variant="outline"
      className={cn(BUG_BADGE_HIDDEN_CLASSES, "[&>svg]:size-4")}
      title="Undiscovered"
      aria-label="Undiscovered bug"
    >
      <Bug aria-hidden="true" />
      <span>? ? ?</span>
    </Badge>
  );
}
