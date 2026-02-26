import { Loader2, OctagonX } from "lucide-react";

import { SOFT_RED_BUTTON_CLASSES } from "@/components/pages/diagnostics/constants";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type EmergencyCardProps = {
  isKillingAllNonWorktreeOpencode: boolean;
  onKillAllNonWorktreeOpencode: () => void;
};

export function EmergencyCard({ isKillingAllNonWorktreeOpencode, onKillAllNonWorktreeOpencode }: EmergencyCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Emergency</CardTitle>
        <CardDescription>
          Kill all OpenCode processes that are not worktree-related. This is intended for stuck global sessions only.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button
          type="button"
          variant="outline"
          className={SOFT_RED_BUTTON_CLASSES}
          onClick={onKillAllNonWorktreeOpencode}
          disabled={isKillingAllNonWorktreeOpencode}
        >
          {isKillingAllNonWorktreeOpencode ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <OctagonX aria-hidden="true" className="size-4" />}
          <span>Kill non-worktree OpenCode</span>
        </Button>
      </CardContent>
    </Card>
  );
}
