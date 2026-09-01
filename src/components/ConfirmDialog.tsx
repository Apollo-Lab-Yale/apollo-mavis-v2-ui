/** Minimal confirm dialog (destructive actions). */
export interface ConfirmDialogProps {
  text: string;
  confirmLabel?: string;
  onConfirm(): void;
  onCancel(): void;
}

export function ConfirmDialog({
  text,
  confirmLabel = "Confirm",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <div className="modal-backdrop" data-testid="confirm-dialog">
      <div className="modal" role="dialog" aria-modal="true">
        <div>{text}</div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={onCancel} data-testid="confirm-cancel">
            Cancel
          </button>
          <button className="btn-danger" onClick={onConfirm} data-testid="confirm-ok">
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
