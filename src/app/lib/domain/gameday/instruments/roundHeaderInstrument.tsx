"use client";

import type { GameDayInstrumentRenderProps } from "./gamedayInstrumentTypes";

type RoundHeaderBodyProps = GameDayInstrumentRenderProps & {
  gameDayData: any;
  courses: any[];
};

/**
 * Round Header Instrument Body
 * 
 * Displays the top header/framing section for GameDay.
 */
export function RoundHeaderBody({ ctx, gameDayData, courses }: RoundHeaderBodyProps) {
  // Only show header when not in_progress
  if (ctx.state === "in_play") {
    return null;
  }

  // Derive course name from context snapshot or fallback
  const courseName = ctx.snapshot.coursePack?.course?.name || 
                     (ctx.round.courseId
                       ? courses.find((c) => c.id === ctx.round.courseId)?.name
                       : null) || 
                     "Round";

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">In play</h1>
        <p className="mt-2 text-sm text-muted">
          {courseName}
        </p>
      </div>
    </>
  );
}
