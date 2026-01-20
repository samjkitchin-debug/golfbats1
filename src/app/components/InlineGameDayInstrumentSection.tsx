"use client";

import React from "react";

type InlineGameDayInstrumentSectionProps = {
  id?: string;
  title: string;
  helper?: string;
  rightAction?: React.ReactNode;
  children: React.ReactNode;
  density?: "normal" | "compact";
  className?: string;
  showDivider?: boolean;
};

export default function InlineGameDayInstrumentSection({
  id,
  title,
  helper,
  rightAction,
  children,
  density = "normal",
  className = "",
  showDivider = false,
}: InlineGameDayInstrumentSectionProps) {
  // Add scroll margin if id is provided for scroll targeting
  const scrollMarginClass = id ? "scroll-mt-24" : "";
  const wrapperClasses = `${scrollMarginClass} ${className}`.trim();

  // Normal density: single padded block with gap-based spacing
  if (density === "normal") {
    return (
      <div id={id} className={wrapperClasses || undefined}>
        {/* Content block with padding */}
        <div className="py-6">
          <div className="flex flex-col gap-3">
            {/* Header row: title + optional right action */}
            {(title || rightAction) && (
              <div className="flex items-center justify-between gap-3">
                {title && (
                  <div className="text-sm font-semibold text-foreground">{title}</div>
                )}
                {rightAction && <div className="shrink-0">{rightAction}</div>}
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

  // Compact density: single padded block with gap-based spacing
  return (
    <div id={id} className={wrapperClasses || undefined}>
      {/* Content block with padding */}
      <div className="py-3">
        <div className="flex flex-col gap-1">
          {/* Header row: title + optional right action */}
          {(title || rightAction) && (
            <div className="flex items-center justify-between gap-3">
              {title && (
                <div className="text-sm font-semibold text-foreground">{title}</div>
              )}
              {rightAction && <div className="shrink-0">{rightAction}</div>}
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
