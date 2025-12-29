/**
 * LAN QR Dialog
 *
 * Dialog component displaying a QR code for mobile device connection.
 */

import { QRCodeSVG } from "qrcode.react";
import {
  Modal,
  ModalBody,
  ModalContent,
  ModalDescription,
  ModalHeader,
  ModalTitle,
} from "@/components/ui/modal";

interface LanQRDialogProps {
  open: boolean;
  onClose: () => void;
  url: string | null;
  title?: string;
  description?: string;
}

export function LanQRDialog({
  open,
  onClose,
  url,
  title = "Scan to Connect",
  description = "Scan this QR code with your mobile device to connect to Night Shift",
}: LanQRDialogProps) {
  return (
    <Modal open={open} onOpenChange={onClose}>
      <ModalContent className="sm:max-w-md">
        <ModalHeader>
          <ModalTitle>{title}</ModalTitle>
          <ModalDescription>{description}</ModalDescription>
        </ModalHeader>
        <ModalBody className="flex flex-col items-center gap-4 py-2">
          {url ? (
            <>
              <div className="bg-white p-4">
                <QRCodeSVG value={url} size={200} level="M" includeMargin={false} />
              </div>
              <p className="text-center text-xs text-muted-foreground">
                Point your camera at the QR code or manually enter the URL below
              </p>
              <code className="max-w-full break-all border border-border bg-muted/50 px-3 py-2 text-center font-mono text-xs text-muted-foreground">
                {url}
              </code>
            </>
          ) : (
            <p className="text-muted-foreground">LAN access not available</p>
          )}
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}
