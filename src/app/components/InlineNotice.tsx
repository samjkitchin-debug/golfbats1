import React from "react";

type Variant = "info" | "warning" | "danger";

const variantClasses: Record<Variant, string> = {
  info: "border-border bg-surface text-foreground",
  warning: "border-warning/30 bg-surface text-foreground",
  danger: "border-danger/30 bg-surface text-foreground",
};

export function InlineNotice({
  title,
  body,
  variant = "info",
  className = "",
  onDismiss,
  dismissLabel = "Dismiss",
}: {
  title: string;
  body?: string;
  variant?: Variant;
  className?: string;
  onDismiss?: () => void;
  dismissLabel?: string;
}) {
  if (onDismiss) {
    return (
      <div className={`rounded-lg border border-border bg-surface p-4 ${className}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <div className="text-sm font-semibold text-foreground mb-1">{title}</div>
            {body ? <div className="text-sm text-muted">{body}</div> : null}
          </div>
          <button
            type="button"
            onClick={onDismiss}
            className="text-sm text-muted hover:text-foreground underline shrink-0"
          >
            {dismissLabel}
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className={`rounded-xl border px-3 py-2 ${variantClasses[variant]} ${className}`}>
      <div className="text-sm font-medium">{title}</div>
      {body ? <div className="text-sm text-muted mt-0.5">{body}</div> : null}
    </div>
  );
}
