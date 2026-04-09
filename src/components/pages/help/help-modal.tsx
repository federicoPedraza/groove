import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";

type HelpModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function HelpModal({ open, onOpenChange }: HelpModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Help</DialogTitle>
        </DialogHeader>
        <div className="flex items-center justify-center">
          <img
            src="/nohelp.jpg"
            alt="No help available"
            className="max-h-[50vh] rounded-lg object-contain"
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
