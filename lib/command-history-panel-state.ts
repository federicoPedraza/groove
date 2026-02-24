import { toast as sonnerToast } from "sonner";

let isCommandHistoryPanelOpen = false;

export function getIsCommandHistoryPanelOpen(): boolean {
  return isCommandHistoryPanelOpen;
}

export function setIsCommandHistoryPanelOpen(isOpen: boolean): void {
  if (isCommandHistoryPanelOpen === isOpen) {
    return;
  }

  isCommandHistoryPanelOpen = isOpen;
  if (isOpen) {
    sonnerToast.dismiss();
  }
}
