/**
 * LAN QR Dialog
 *
 * Dialog component displaying a QR code for mobile device connection.
 */

import { QRCodeSVG } from "qrcode.react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

interface LanQRDialogProps {
  open: boolean;
  onClose: () => void;
  url: string | null;
}

export function LanQRDialog({ open, onClose, url }: LanQRDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Scan to Connect</DialogTitle>
          <DialogDescription>
            Scan this QR code with your mobile device to connect to Night Shift
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col items-center gap-4 py-6">
          {url ? (
            <>
              <div className="rounded-lg bg-white p-4">
                <QRCodeSVG
                  value={url}
                  size={200}
                  level="M"
                  includeMargin={false}
                />
              </div>
              <p className="text-center text-xs text-muted-foreground">
                Point your camera at the QR code or manually enter the URL below
              </p>
              <code className="max-w-full break-all rounded border border-border bg-muted/50 px-3 py-2 text-center font-mono text-xs text-muted-foreground">
                {url}
              </code>
            </>
          ) : (
            <p className="text-muted-foreground">LAN access not available</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
