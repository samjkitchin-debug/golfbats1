"use client";

import type { GameDayInstrumentRenderProps } from "./gamedayInstrumentTypes";

type SetupCourseTeeBodyProps = GameDayInstrumentRenderProps & {
  gameDayData: any;
  courses: any[];
  updatingCourse: boolean;
  updatingTee: boolean;
  handleCourseSelect: (courseId: string) => Promise<void>;
  handleTeeSelect: (teeId: string) => Promise<void>;
  coursePack: any | null;
  coursePackError: string | null;
};

/**
 * Setup Course & Tee Instrument Body
 * 
 * Displays course selection, tee selection, and coursePack summary.
 */
export function SetupCourseTeeBody({
  ctx,
  gameDayData,
  courses,
  updatingCourse,
  updatingTee,
  handleCourseSelect,
  handleTeeSelect,
  coursePack,
}: SetupCourseTeeBodyProps) {
  // Course selection block (if no course selected)
  const courseSelectionBlock = !gameDayData.courseId && ctx.state === "pre_round" ? (
    <div className="rounded-lg border border-border bg-muted/30 p-4">
      <div className="text-sm font-medium text-foreground mb-2">Select course</div>
      <p className="text-xs text-muted mb-3">Choose a course before scoring</p>
      <select
        className="w-full rounded-lg border border-border bg-surface px-4 py-2 text-sm text-foreground"
        disabled={updatingCourse}
        onChange={async (e) => {
          const courseId = e.target.value;
          if (courseId) {
            await handleCourseSelect(courseId);
          }
        }}
      >
        <option value="">Select a course</option>
        {courses.map((course) => (
          <option key={course.id} value={course.id}>
            {course.name} {course.location ? `- ${course.location}` : ""}
          </option>
        ))}
      </select>
      {updatingCourse && (
        <p className="text-xs text-muted mt-2">Updating course…</p>
      )}
    </div>
  ) : null;

  // Course pack summary (when loaded)
  const coursePackSummary = coursePack && ctx.state !== "in_play" ? (
    <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-2">
      <div className="text-sm font-medium text-foreground">{coursePack.course.name}</div>
      <div className="text-xs text-muted">
        {coursePack.tee.label} · Par {coursePack.tee.par} · Slope {coursePack.tee.slope}
        {coursePack.tee.rating !== null && ` · Rating ${coursePack.tee.rating}`}
      </div>
      <div className="text-xs text-muted">{coursePack.holes.length} holes loaded</div>
    </div>
  ) : null;

  // Course selected - show course name and tee selection
  const courseSelectedBlock = gameDayData.courseId && ctx.state !== "in_play" ? (
    <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
      <div>
        <div className="text-sm font-medium text-foreground mb-1">
          {(() => {
            const selectedCourse = courses.find((c: any) => c.id === gameDayData.courseId);
            return selectedCourse?.name || "Course selected";
          })()}
        </div>
      </div>

      {/* Tee selection */}
      {!gameDayData.teeId ? (
        <div>
          <div className="text-sm font-medium text-foreground mb-2">Tee not selected</div>
          <p className="text-xs text-muted mb-3">Set a tee before scoring can begin.</p>
          <select
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground"
            disabled={updatingTee}
            onChange={(e) => {
              const teeId = e.target.value;
              if (teeId) {
                handleTeeSelect(teeId);
              }
            }}
          >
            <option value="">Select a tee</option>
            {(() => {
              const selectedCourse = courses.find((c: any) => c.id === gameDayData.courseId);
              const tees = selectedCourse?.tees ?? [];
              return tees.map((tee: any) => (
                <option key={tee.id} value={tee.id}>
                  {tee.label}
                  {tee.par && ` · Par ${tee.par}`}
                  {tee.slope && ` · Slope ${tee.slope}`}
                  {tee.meters && ` · ${tee.meters}m`}
                </option>
              ));
            })()}
          </select>
          {updatingTee && (
            <p className="text-xs text-muted mt-2">Updating tee…</p>
          )}
        </div>
      ) : (
        <div>
          <div className="text-sm font-medium text-foreground mb-1">Tee</div>
          <div className="text-xs text-muted">
            {(() => {
              const selectedCourse = courses.find((c: any) => c.id === gameDayData.courseId);
              const selectedTee = selectedCourse?.tees.find((t: any) => t.id === gameDayData.teeId);
              return selectedTee?.label || "Tee selected";
            })()}
          </div>
        </div>
      )}
    </div>
  ) : null;

  return (
    <div className="space-y-4">
      {courseSelectionBlock}
      {coursePackSummary}
      {courseSelectedBlock}
    </div>
  );
}
