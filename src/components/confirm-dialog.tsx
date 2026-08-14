"use client";

import { useEffect, useId, useRef } from "react";
import { AlertTriangle, X } from "lucide-react";

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "确认删除",
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    cancelRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previousFocus?.focus();
    };
  }, [onCancel, open]);

  if (!open) return null;

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onCancel()}>
      <section className="modal confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId}>
        <header className="modal-header">
          <h2 className="modal-title" id={titleId}>确认操作</h2>
          <button className="icon-button" type="button" title="关闭" aria-label="关闭" onClick={onCancel}><X size={18} /></button>
        </header>
        <div className="modal-body confirm-dialog-body">
          <span className="confirm-dialog-icon"><AlertTriangle size={22} /></span>
          <div><h3>{title}</h3><p id={descriptionId}>{description}</p></div>
        </div>
        <footer className="modal-footer">
          <button className="ui-button" type="button" ref={cancelRef} onClick={onCancel}>取消</button>
          <button className="ui-button ui-button-danger-solid" type="button" onClick={onConfirm}>{confirmLabel}</button>
        </footer>
      </section>
    </div>
  );
}
