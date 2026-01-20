"use client";

import type { GameDayInstrumentRenderProps } from "./gamedayInstrumentTypes";

type InPlayHudBodyProps = GameDayInstrumentRenderProps & {
  gameDayData: any;
  currentMemberId: string | null;
  savedScores: Record<string, Record<number, number>>;
  draftScores: Record<string, number | null>;
  computeMyTotals: (
    playOrder: number[],
    currentHoleIndex: number,
    coursePack: any | null
  ) => { strokesTotal: number | null; toPar: number | null };
};

/**
 * In-Play HUD Instrument Body
 * 
 * Displays Hole context, Today/To par totals, and Next hole line.
 */
export function InPlayHudBody({
  ctx,
  currentMemberId,
  savedScores,
  draftScores,
  computeMyTotals,
}: InPlayHudBodyProps) {
  // Use ctx.snapshot for playOrder, currentHoleNumber, nextHoleNumber
  const { playOrder, currentHoleNumber, nextHoleNumber, coursePack } = ctx.snapshot;

  // Get current hole index from round (used by computeMyTotals)
  const currentHoleIndex = ctx.round.gameday?.currentHoleIndex ?? playOrder.indexOf(currentHoleNumber);

  // Get current hole info from coursePack
  const currentHoleInfo = coursePack?.holes.find((h: any) => h.holeNumber === currentHoleNumber);
  const holePar = currentHoleInfo?.par ?? null;
  const holeSI = currentHoleInfo?.strokeIndex ?? null;
  const teeLabel = coursePack?.tee.label ?? null;
  const courseName = coursePack?.course.name ?? null;

  // Get next hole info
  const nextHoleInfo = nextHoleNumber ? coursePack?.holes.find((h: any) => h.holeNumber === nextHoleNumber) : null;
  const nextHolePar = nextHoleInfo?.par ?? null;

  // Compute my totals using passed function
  const myTotals = computeMyTotals(playOrder, currentHoleIndex, coursePack);
  const myToParSigned = myTotals.toPar === null 
    ? "—" 
    : myTotals.toPar === 0 
      ? "E" 
      : myTotals.toPar > 0 
        ? `+${myTotals.toPar}` 
        : `${myTotals.toPar}`;

  return (
    <div className="mb-6 space-y-3">
      {/* Top row: Hole context + Player snapshot */}
      <div className="flex items-start justify-between gap-4">
        {/* Left: Hole context */}
        <div className="flex-1">
          <div className="text-2xl font-bold text-foreground">Hole {currentHoleNumber}</div>
          <div className="text-xs text-muted mt-1">
            {holePar !== null ? `Par ${holePar}` : "Par —"}
            {holeSI !== null && ` • Handicap Index ${holeSI}`}
            {teeLabel && ` • ${teeLabel}`}
            {courseName && teeLabel && ` • ${courseName}`}
            {courseName && !teeLabel && ` • Course: ${courseName}`}
          </div>
        </div>
        
        {/* Right: Player snapshot */}
        <div className="text-right">
          <div className="text-sm text-muted">Today: {myTotals.strokesTotal ?? "—"}</div>
          <div className={`text-2xl font-bold mt-1 text-foreground`}>
            To par: {myToParSigned}
          </div>
        </div>
      </div>
      
      {/* Next hole line */}
      <div className="text-xs text-muted">
        {nextHoleNumber ? (
          <>Next: Hole {nextHoleNumber}{nextHolePar !== null ? ` (Par ${nextHolePar})` : ""}</>
        ) : (
          <>Next: Finish</>
        )}
      </div>
    </div>
  );
}
