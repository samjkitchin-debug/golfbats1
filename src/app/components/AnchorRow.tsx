"use client";

/**
 * Anchor row — label/line plus optional action (line-as-button, chevron).
 * Non-composite: text and chevrons only. No instrument bodies, no expand/collapse state.
 * See: docs/canon/v1.md "Anchor vs Instrument", ANCHOR-01.
 */

export type AnchorRowProps = {
  /** Primary text (label or preview line). */
  text: string;
  /** Wrap text in a button. */
  showLineAsButton?: boolean;
  onLineClick?: () => void;
  /** Show chevron button. */
  showChevron?: boolean;
  chevronDirection?: "up" | "down";
  onChevronClick?: () => void;
  chevronAriaLabel?: string;
  /** Anchors are non-composite; no children. */
  children?: never;
};

export default function AnchorRow({
  text,
  showLineAsButton = false,
  onLineClick,
  showChevron = false,
  chevronDirection = "down",
  onChevronClick,
  chevronAriaLabel,
}: AnchorRowProps) {
  const lineNode = showLineAsButton && onLineClick ? (
    <button
      type="button"
      onClick={onLineClick}
      className="text-left hover:opacity-80 cursor-pointer"
    >
      {text}
    </button>
  ) : (
    <span>{text}</span>
  );

  if (!showChevron) {
    return (
      <div className="text-sm text-foreground font-medium">
        {lineNode}
      </div>
    );
  }

  const pathD = chevronDirection === "up"
    ? "M5 15l7-7 7 7"
    : "M19 9l-7 7-7-7";

  return (
    <div className="w-full text-sm text-foreground font-medium flex items-center justify-between gap-3">
      <span>{lineNode}</span>
      {onChevronClick && (
        <button
          type="button"
          onClick={onChevronClick}
          className="h-9 w-9 shrink-0 grid place-items-center rounded relative z-10 pointer-events-auto hover:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-foreground/40"
          aria-label={chevronAriaLabel ?? undefined}
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={pathD} />
          </svg>
        </button>
      )}
    </div>
  );
}
