"use client";

import React from "react";
import type { GameDayInstrumentRenderProps } from "./gamedayInstrumentTypes";

type ScoreEntryPremiumBodyProps = GameDayInstrumentRenderProps & {
  gameDayData: any;
  coursePack: any | null;
  draftScores: Record<string, number | null>;
  setDraftScores: (updater: (prev: Record<string, number | null>) => Record<string, number | null>) => void;
  savedScores: Record<string, Record<number, number>>;
  setSavedScores: React.Dispatch<React.SetStateAction<Record<string, Record<number, number>>>>;
  expandedScoreRows: Set<string>;
  setExpandedScoreRows: React.Dispatch<React.SetStateAction<Set<string>>>;
  isSavingHole: boolean;
  setIsSavingHole: (value: boolean) => void;
  toast: { message: string; visible: boolean };
  setToast: (value: { message: string; visible: boolean }) => void;
  undoState: { holeNumber: number; snapshot: Record<string, number | null> } | null;
  setUndoState: (value: { holeNumber: number; snapshot: Record<string, number | null> } | null) => void;
  handleConfirmHole: () => Promise<void>;
  handleUndo: () => void;
  handleCloseRound: () => Promise<void>;
  closingRound: boolean;
  roundId: string | undefined;
  setGameDayData: (value: any) => void;
  setSelectedHole: (value: number) => void;
};

/**
 * Score Entry Premium Instrument Body
 * 
 * Displays quick-tap scorecard, confirm button, navigation, and undo functionality.
 */
export function ScoreEntryPremiumBody({
  ctx,
  gameDayData,
  coursePack,
  draftScores,
  setDraftScores,
  savedScores,
  expandedScoreRows,
  setExpandedScoreRows,
  isSavingHole,
  toast,
  undoState,
  handleConfirmHole,
  handleUndo,
  handleCloseRound,
  closingRound,
  roundId,
  setGameDayData,
  setSelectedHole,
}: ScoreEntryPremiumBodyProps) {
  // Use ctx.snapshot for hole data
  const { playOrder, currentHoleNumber, nextHoleNumber } = ctx.snapshot;
  const currentHoleIndex = ctx.round.gameday?.currentHoleIndex ?? 0;

  const canGoPrev = currentHoleIndex > 0;
  const canGoNext = currentHoleIndex < playOrder.length - 1;

  // Get current hole info from coursePack
  const currentHoleInfo = coursePack?.holes.find((h: any) => h.holeNumber === currentHoleNumber);
  const holePar = currentHoleInfo?.par ?? null;

  // Check if there are changes or existing scores to confirm
  const hasChanges = gameDayData.participants.some((p: any) => {
    const draft = draftScores[p.id];
    const saved = savedScores[p.id]?.[currentHoleNumber];
    return draft !== null && draft !== saved;
  });
  const hasExistingScores = gameDayData.participants.some((p: any) => {
    return savedScores[p.id]?.[currentHoleNumber] !== undefined;
  });
  const canConfirm = hasChanges || hasExistingScores;

  return (
    <>
      {/* Quick-tap scorecard strip */}
      <div className="space-y-4 mb-6">
        {gameDayData.participants.map((participant: any) => {
          const currentScore = draftScores[participant.id] ?? null;
          const isExpanded = expandedScoreRows.has(participant.id);
          const defaultPar = holePar ?? 4;
          const scoreRange = [
            Math.max(1, defaultPar - 1),
            defaultPar,
            defaultPar + 1,
            defaultPar + 2,
            defaultPar + 3,
          ];
          
          return (
            <div key={participant.id} className="space-y-2">
              {/* Player name + quick-tap pills */}
              <div className="flex items-center gap-3">
                <div className="flex-shrink-0 w-20 text-sm font-medium text-foreground truncate">
                  {participant.displayName}
                </div>
                
                <div className="flex-1 flex items-center gap-2 flex-wrap">
                  {scoreRange.map((score) => (
                    <button
                      key={score}
                      type="button"
                      onClick={() => {
                        setDraftScores((prev) => ({
                          ...prev,
                          [participant.id]: score,
                        }));
                      }}
                      className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                        currentScore === score
                          ? "bg-anticipation text-anticipation-fg"
                          : "bg-surface border border-border text-foreground hover:bg-muted/50"
                      }`}
                    >
                      {score}
                    </button>
                  ))}
                  
                  <button
                    type="button"
                    onClick={() => {
                      setExpandedScoreRows((prev) => {
                        const next = new Set(prev);
                        if (isExpanded) {
                          next.delete(participant.id);
                        } else {
                          next.add(participant.id);
                        }
                        return next;
                      });
                    }}
                    className="px-3 py-2 rounded-lg text-sm font-medium bg-surface border border-border text-foreground hover:bg-muted/50"
                  >
                    {isExpanded ? "Less" : "More"}
                  </button>
                </div>
              </div>
              
              {/* Expanded row with full 1..12 options */}
              {isExpanded && (
                <div className="flex items-center gap-2 flex-wrap pl-20">
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((score) => (
                    <button
                      key={score}
                      type="button"
                      onClick={() => {
                        setDraftScores((prev) => ({
                          ...prev,
                          [participant.id]: score,
                        }));
                      }}
                      className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                        currentScore === score
                          ? "bg-anticipation text-anticipation-fg"
                          : "bg-surface border border-border text-foreground hover:bg-muted/50"
                      }`}
                    >
                      {score}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Toast / Undo */}
      {(toast.visible || undoState) && (
        <div className="mb-4 flex items-center justify-between rounded-lg border border-border bg-muted/30 px-4 py-3">
          <span className="text-sm text-foreground">{toast.message}</span>
          {undoState && (
            <button
              type="button"
              onClick={handleUndo}
              className="text-sm font-medium text-anticipation hover:underline"
            >
              Undo
            </button>
          )}
        </div>
      )}

      {/* Sticky bottom: Confirm hole button */}
      <div className="sticky bottom-0 bg-surface border-t border-border -mx-4 px-4 py-4 pb-4">
        <button
          type="button"
          onClick={handleConfirmHole}
          disabled={isSavingHole || !canConfirm}
          className="w-full rounded-lg btn-anticipation px-4 py-3 text-sm font-semibold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSavingHole 
            ? "Saving…" 
            : currentHoleNumber === 18 && !canGoNext
              ? "Finish round"
              : "Confirm hole"}
        </button>
      </div>

      {/* Secondary: Prev/Next and Close */}
      <div className="mt-6 space-y-3">
        {/* Prev/Next navigation */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={async () => {
              if (!canGoPrev || !roundId) return;
              const newIndex = currentHoleIndex - 1;
              const newHole = playOrder[newIndex];
              
              try {
                await fetch(`/api/gameday/${roundId}/scorecard`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  credentials: "include",
                  body: JSON.stringify({ cursor: { currentHoleIndex: newIndex } }),
                });
                const res = await fetch(`/api/gameday/${roundId}`, { credentials: "include" });
                if (res.ok) {
                  const data = await res.json();
                  if (data.ok && data.data) {
                    setGameDayData(data.data);
                    setSelectedHole(newHole);
                  }
                }
              } catch (error) {
                console.error("Failed to update hole cursor:", error);
              }
            }}
            disabled={!canGoPrev}
            className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium text-foreground hover:bg-muted/50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            ← Prev
          </button>
          <button
            type="button"
            onClick={async () => {
              if (!canGoNext || !roundId) return;
              const newIndex = currentHoleIndex + 1;
              const newHole = playOrder[newIndex];
              
              try {
                await fetch(`/api/gameday/${roundId}/scorecard`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  credentials: "include",
                  body: JSON.stringify({ cursor: { currentHoleIndex: newIndex } }),
                });
                const res = await fetch(`/api/gameday/${roundId}`, { credentials: "include" });
                if (res.ok) {
                  const data = await res.json();
                  if (data.ok && data.data) {
                    setGameDayData(data.data);
                    setSelectedHole(newHole);
                  }
                }
              } catch (error) {
                console.error("Failed to update hole cursor:", error);
              }
            }}
            disabled={!canGoNext}
            className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium text-foreground hover:bg-muted/50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Next →
          </button>
        </div>

        {/* Close scorecard (secondary) */}
        <button
          type="button"
          onClick={() => {
            if (confirm("Are you sure you want to close the scorecard? This will end scoring for this round.")) {
              handleCloseRound();
            }
          }}
          disabled={closingRound}
          className="w-full rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground hover:bg-muted/50 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {closingRound ? "Closing…" : "Close scorecard"}
        </button>
      </div>
    </>
  );
}
