import { Loader2 } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";

type ProcessActionButtonProps = {
  pending: boolean;
  label: string;
  icon: ReactNode;
  onClick: () => void;
  className?: string;
};

export function ProcessActionButton({ pending, label, icon, onClick, className }: ProcessActionButtonProps) {
  return (
    <Button type="button" size="sm" variant="secondary" onClick={onClick} disabled={pending} className={className}>
      {pending ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : icon}
      <span>{label}</span>
    </Button>
  );
}
