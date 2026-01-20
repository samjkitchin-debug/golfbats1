"use client";

import Link from "next/link";
import type { GameDayInstrumentRenderProps } from "./gamedayInstrumentTypes";

type RoundControlsBodyProps = GameDayInstrumentRenderProps & {
  gameDayData: any;
  closingRound: boolean;
  publishingRound: boolean;
  handleCloseRound: () => Promise<void>;
  handlePublishRound: () => Promise<void>;
};

/**
 * Round Controls Instrument Body
 * 
 * Displays close round and publish controls, plus published status.
 */
export function RoundControlsBody({
  ctx,
  policy,
  gameDayData,
  closingRound,
  publishingRound,
  handleCloseRound,
  handlePublishRound,
}: RoundControlsBodyProps) {
  // Close round button (when in_play or review, if policy allows)
  const closeRoundButton =
    (ctx.state === "in_play" || ctx.state === "review") && policy.canCloseRound ? (
      <div className="rounded-lg border border-border bg-muted/30 p-4">
        <button
          onClick={() => {
            if (confirm("Are you sure you want to close the round? This will end scoring.")) {
              handleCloseRound();
            }
          }}
          disabled={closingRound}
          className="w-full rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground hover:bg-muted/50 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {closingRound ? "Closing…" : "Close round"}
        </button>
      </div>
    ) : null;

  // Publish results button (when review state, if policy allows)
  const publishButton =
    ctx.state === "review" && policy.canPublishRound ? (
      <div className="rounded-lg border border-border bg-muted/30 p-4">
        <button
          onClick={handlePublishRound}
          disabled={publishingRound}
          className="w-full rounded-lg btn-primary px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {publishingRound ? "Publishing…" : "Publish results"}
        </button>
      </div>
    ) : null;

  // Published status (when published)
  const publishedStatus =
    ctx.state === "published" ? (
      <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium text-foreground">Published</div>
            {gameDayData.gameday?.publishedAt && (
              <div className="text-xs text-muted mt-1">
                {new Date(gameDayData.gameday.publishedAt).toLocaleDateString("en-GB", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </div>
            )}
          </div>
        </div>
        <Link
          href={`/results/${gameDayData.roundId}`}
          className="block w-full rounded-lg btn-ghost px-4 py-2 text-sm font-medium text-center hover:opacity-80"
        >
          View results
        </Link>
      </div>
    ) : null;

  // Only render if any control is available
  if (!closeRoundButton && !publishButton && !publishedStatus) {
    return null;
  }

  return (
    <div className="space-y-4">
      {closeRoundButton}
      {publishButton}
      {publishedStatus}
    </div>
  );
}
