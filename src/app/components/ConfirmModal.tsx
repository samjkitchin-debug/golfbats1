"use client";

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmVariant?: "primary" | "danger";
}

export function ConfirmModal({
  isOpen,
  title,
  message,
  confirmLabel = "Yes",
  cancelLabel = "No",
  onConfirm,
  onCancel,
  confirmVariant = "primary",
}: ConfirmModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/50 p-4">
      <div className="w-full max-w-md rounded-xl bg-surface border border-border p-6">
        <h3 className="mb-2 text-lg font-semibold text-foreground">{title}</h3>
        <p className="mb-6 text-sm text-muted">{message}</p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground hover:bg-background"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium ${
              confirmVariant === "danger"
                ? "bg-muted text-foreground hover:bg-muted/80"
                : "btn-primary hover:opacity-90"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}



