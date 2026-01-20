import React from "react";

type InlineInstrumentSectionProps = {
  id?: string;
  title: string;
  helper?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  showDivider?: boolean;
  className?: string;
  status?: "todo" | "done";
  density?: "normal" | "compact";
};

export default function InlineInstrumentSection({
  id,
  title,
  helper,
  right,
  children,
  showDivider = false,
  className = "",
  status,
  density = "normal",
}: InlineInstrumentSectionProps) {
  // Add scroll margin if id is provided for scroll targeting
  const scrollMarginClass = id ? "scroll-mt-24" : "";
  const wrapperClasses = `${scrollMarginClass} ${className}`.trim();

  // Compute right-side node: right prop takes precedence, else show check icon if done
  const rightNode = right ? (
    right
  ) : status === "done" ? (
    <svg
      className="h-4 w-4 text-[rgb(var(--brand-green))]"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4.5 12.75l6 6 9-13.5"
      />
    </svg>
  ) : null;

  // Compact density: single padded block with gap-based spacing
  if (density === "compact") {
    return (
      <div id={id} className={wrapperClasses || undefined}>
        {/* Content block with padding */}
        <div className="py-3">
          <div className="flex flex-col gap-1">
            {/* Header row: title + optional right action */}
            {(title || rightNode) && (
              <div className="flex items-center justify-between gap-3">
                {title && (
                  <div className="text-sm font-semibold text-foreground">{title}</div>
                )}
                {rightNode && <div className="shrink-0">{rightNode}</div>}
              </div>
            )}

            {/* Helper text line (optional) */}
            {helper && (
              <div className="text-xs text-muted">{helper}</div>
            )}

            {/* Body content */}
            <div>{children}</div>
          </div>
          {/* Spacer before divider */}
          {showDivider && <div className="h-1" />}
        </div>

        {/* Divider (optional) */}
        {showDivider && (
          <div className="border-t border-border" />
        )}
      </div>
    );
  }

  // Normal density: single padded block with gap-based spacing
  return (
    <div id={id} className={wrapperClasses || undefined}>
      {/* Content block with padding */}
      <div className="py-6">
        <div className="flex flex-col gap-3">
          {/* Header row: title + optional right action */}
          {(title || rightNode) && (
            <div className="flex items-center justify-between gap-3">
              {title && (
                <div className="text-sm font-semibold text-foreground">{title}</div>
              )}
              {rightNode && <div className="shrink-0">{rightNode}</div>}
            </div>
          )}

          {/* Helper text line (optional) */}
          {helper && (
            <div className="text-xs text-muted">{helper}</div>
          )}

          {/* Body content */}
          <div>{children}</div>
        </div>
      </div>

      {/* Divider (optional) */}
      {showDivider && (
        <div className="border-t border-border" />
      )}
    </div>
  );
}
