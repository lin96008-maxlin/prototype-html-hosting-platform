"use client";

import { useEffect, useRef } from "react";
import { CheckCircle2 } from "lucide-react";

export function SuccessMessage({
  message,
  onClose,
}: {
  message: string;
  onClose: () => void;
}) {
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => onCloseRef.current(), 3000);
    return () => window.clearTimeout(timer);
  }, [message]);

  if (!message) return null;
  return (
    <div className="toast-stack" role="status" aria-live="polite">
      <div className="toast">
        <CheckCircle2 className="toast-success-icon" size={18} />
        <span>{message}</span>
      </div>
    </div>
  );
}
