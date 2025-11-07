import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

interface DisclaimerModalProps {
  onAgree: () => void;
  onDisagree: () => void;
}

export const DisclaimerModal = ({ onAgree, onDisagree }: DisclaimerModalProps) => {
  const [open, setOpen] = useState(true);

  const handleAgree = () => {
    setOpen(false);
    onAgree();
  };

  const handleDisagree = () => {
    onDisagree();
  };

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <AlertTriangle className="h-6 w-6 text-warning" />
            <DialogTitle className="text-2xl">Legal Disclaimer</DialogTitle>
          </div>
          <DialogDescription className="text-base leading-relaxed pt-4 space-y-4">
            <p>
              By clicking 'Agree', you acknowledge that you have read, understood, and agree to be bound by these terms.
            </p>
            <p>
              You agree that the developer <strong>(Spike Wright)</strong> shall not be held liable for any damages, data loss, or other issues arising from the use of this software, to the fullest extent permitted under the laws of England and Wales.
            </p>
            <p className="text-destructive font-medium">
              If you do not agree to these terms, click 'Disagree' to exit the application.
            </p>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={handleDisagree} className="w-full sm:w-auto">
            Disagree
          </Button>
          <Button onClick={handleAgree} className="w-full sm:w-auto">
            Agree
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
