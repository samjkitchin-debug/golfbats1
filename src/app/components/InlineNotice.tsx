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
}: {
  title: string;
  body?: string;
  variant?: Variant;
  className?: string;
}) {
  return (
    <div className={`rounded-xl border px-3 py-2 ${variantClasses[variant]} ${className}`}>
      <div className="text-sm font-medium">{title}</div>
      {body ? <div className="text-sm text-muted mt-0.5">{body}</div> : null}
    </div>
  );
}
