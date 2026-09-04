/** Confirm dialog for destructive, irreversible actions (overwrite the initial
 * condition, terminate an inference session). Built on Sheet; Cancel holds the
 * initial focus, the destructive button sits on the right. Keeps the
 * `confirm-dialog` / `confirm-cancel` / `confirm-ok` test ids. Owners hold it
 * mounted for the exit with `useDelayedUnmount(open, SHEET_EXIT_MS)`. */
import { Sheet } from "./Sheet";

export interface ConfirmDialogProps {
  text: string;
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm(): void;
  onCancel(): void;
  /** Default true; `false` runs the Sheet exit while the owner keeps it mounted. */
  open?: boolean;
}

export function ConfirmDialog({
  text,
  title = "Confirm",
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
  open = true,
}: ConfirmDialogProps) {
  return (
    <Sheet
      title={title}
      open={open}
      width={400}
      hostTestId="confirm-dialog"
      testId="confirm-dialog-panel"
      onRequestClose={onCancel}
      footerStart={
        <button
          type="button"
          className="btn-secondary"
          onClick={onCancel}
          data-testid="confirm-cancel"
          data-autofocus
        >
          {cancelLabel}
        </button>
      }
      footer={
        <button
          type="button"
          className="btn-destructive"
          onClick={onConfirm}
          data-testid="confirm-ok"
        >
          {confirmLabel}
        </button>
      }
    >
      <p className="text-body" style={{ margin: 0 }}>
        {text}
      </p>
    </Sheet>
  );
}
