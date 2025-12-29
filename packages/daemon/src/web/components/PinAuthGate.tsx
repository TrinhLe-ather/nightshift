import { useState, useRef, useEffect, type KeyboardEvent, type ClipboardEvent } from "react";
import { useLanAuthStore } from "@/web/stores/lanAuthStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Moon } from "@/components/ui/icons";

const PIN_LENGTH = 4;

export function PinAuthGate() {
  const needsAuth = useLanAuthStore((state) => state.needsAuth);
  const [digits, setDigits] = useState<string[]>(Array(PIN_LENGTH).fill(""));
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Focus first input when gate opens
  useEffect(() => {
    if (needsAuth) {
      inputRefs.current[0]?.focus();
    }
  }, [needsAuth]);

  if (!needsAuth) return null;

  const pin = digits.join("");
  const isComplete = pin.length === PIN_LENGTH;

  const handleDigitChange = (index: number, value: string) => {
    // Only allow numeric input
    const digit = value.replace(/\D/g, "").slice(-1);
    const newDigits = [...digits];
    newDigits[index] = digit;
    setDigits(newDigits);
    setError(null);

    // Move to next input if digit entered
    if (digit && index < PIN_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const paste = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, PIN_LENGTH);
    if (paste) {
      const newDigits = [...digits];
      paste.split("").forEach((char, i) => {
        newDigits[i] = char;
      });
      setDigits(newDigits);
      setError(null);

      // Focus last filled or submit button
      if (paste.length === PIN_LENGTH) {
        inputRefs.current[PIN_LENGTH - 1]?.blur();
      } else {
        inputRefs.current[paste.length]?.focus();
      }
    }
  };

  const handleSubmit = () => {
    if (!isComplete) return;

    setIsSubmitting(true);
    // Navigate to /auth with PIN - server will validate and set cookie
    window.location.href = `${window.location.origin}/auth?pin=${pin}`;
  };

  return (
    <div className="fixed inset-0 z-100 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-background ring-border w-full max-w-xs p-6 ring-1">
        <div className="mb-4 flex flex-col items-center text-center gap-2">
          <Moon className="size-10 text-primary" />
          <h1 className="text-sm font-medium">Night Shift</h1>
          <p className="text-muted-foreground mt-1 text-xs">
            Enter the 4-digit PIN shown on the daemon console.
          </p>
        </div>

        <div className="mb-4 flex justify-center gap-2">
          {digits.map((digit, index) => (
            <Input
              key={index}
              ref={(el) => {
                inputRefs.current[index] = el;
              }}
              type="text"
              inputMode="numeric"
              pattern="[0-9]"
              maxLength={1}
              value={digit}
              onChange={(e) => handleDigitChange(index, e.target.value)}
              onKeyDown={(e) => handleKeyDown(index, e)}
              onPaste={handlePaste}
              className="h-12 w-12 text-center text-lg font-semibold"
              autoFocus={index === 0}
            />
          ))}
        </div>

        {error && (
          <div className="bg-destructive/10 text-destructive mb-4 p-2 text-center text-xs">
            {error}
          </div>
        )}

        <Button onClick={handleSubmit} disabled={!isComplete || isSubmitting} className="w-full">
          {isSubmitting ? "Connecting..." : "Connect"}
        </Button>
      </div>
    </div>
  );
}
