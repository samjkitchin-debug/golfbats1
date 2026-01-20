"use client";

import type { GameDayInstrumentRenderProps } from "./gamedayInstrumentTypes";

type SetupRoundBodyProps = GameDayInstrumentRenderProps & {
  gameDayData: any;
  startHole: number;
  setStartHole: (hole: number) => void;
  holesToPlay: 9 | 18;
  setHolesToPlay: (holes: 9 | 18) => void;
  handleStartRound: () => Promise<void>;
  startingRound: boolean;
};

/**
 * Setup Round Instrument Body
 * 
 * Displays start hole selector, holes to play buttons, and Start round button.
 */
export function SetupRoundBody({
  ctx,
  gameDayData,
  startHole,
  setStartHole,
  holesToPlay,
  setHolesToPlay,
  handleStartRound,
  startingRound,
}: SetupRoundBodyProps) {
  // Only show when pre_round and teeId is set
  if (ctx.state !== "pre_round" || !gameDayData.teeId) {
    return null;
  }

  return (
    <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-4">
      <div>
        <div className="text-sm font-medium text-foreground mb-3">Round setup</div>
        
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-muted mb-1">Start hole</label>
            <select
              value={startHole}
              onChange={(e) => setStartHole(parseInt(e.target.value, 10))}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground"
            >
              {Array.from({ length: 18 }, (_, i) => i + 1).map((hole) => (
                <option key={hole} value={hole}>
                  Hole {hole}
                </option>
              ))}
            </select>
          </div>
          
          <div>
            <label className="block text-xs text-muted mb-2">Holes to play</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setHolesToPlay(9)}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${
                  holesToPlay === 9
                    ? "btn-anticipation border-warning/30"
                    : "border-border bg-surface text-foreground hover:bg-muted/50"
                }`}
              >
                9
              </button>
              <button
                type="button"
                onClick={() => setHolesToPlay(18)}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${
                  holesToPlay === 18
                    ? "btn-anticipation border-warning/30"
                    : "border-border bg-surface text-foreground hover:bg-muted/50"
                }`}
              >
                18
              </button>
            </div>
          </div>
        </div>
      </div>
      
      <button
        onClick={handleStartRound}
        disabled={startingRound}
        className="w-full rounded-lg btn-primary px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {startingRound ? "Starting…" : "Start round"}
      </button>
    </div>
  );
}
