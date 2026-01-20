"use client";

import { useState, useEffect } from "react";
import type { GameDayInstrumentRenderProps } from "./gamedayInstrumentTypes";
import type { FlightsSnapshot } from "../../flights/flightsTypes";

type FlightCheckBodyProps = GameDayInstrumentRenderProps & {
  currentMemberId: string;
  snapshot: FlightsSnapshot | null;
  reloadFlightsSnapshot: () => Promise<void>;
  openMicroFix: (payload: {
    action: "MOVE_ME" | "ADD_TO_MY_FLIGHT" | "REMOVE_FROM_MY_FLIGHT" | "UNDO";
    targetMemberId?: string;
    toFlightId?: string;
    memberId?: string;
  }) => Promise<{
    ok: boolean;
    undo?: { memberId: string; toFlightId: string };
    snapshot?: FlightsSnapshot;
    error?: string;
  }>;
};

/**
 * Flight Check Instrument Body
 * 
 * Pre-round flights micro-fix interface for GameDay.
 */
export function FlightCheckBody({
  ctx,
  currentMemberId,
  snapshot,
  reloadFlightsSnapshot,
  openMicroFix,
}: FlightCheckBodyProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isViewOnly, setIsViewOnly] = useState(false);
  const [undoPayload, setUndoPayload] = useState<{
    memberId: string;
    toFlightId: string;
  } | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Auto-dismiss undo after 60s
  useEffect(() => {
    if (undoPayload) {
      const timer = setTimeout(() => {
        setUndoPayload(null);
      }, 60000);
      return () => clearTimeout(timer);
    }
  }, [undoPayload]);

  // Auto-dismiss toast after 3s
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => {
        setToast(null);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // Determine my flight
  const myFlightId = snapshot?.memberToFlightId[currentMemberId] || null;
  const myFlight = myFlightId
    ? snapshot?.flights.find((f) => f.flightId === myFlightId)
    : null;

  // Check for issues
  const hasIssues =
    snapshot &&
    (snapshot.issues.length > 0 || snapshot.unassigned.length > 0);

  const handleUndo = async () => {
    if (!undoPayload) return;

    const result = await openMicroFix({
      action: "UNDO",
      memberId: undoPayload.memberId,
      toFlightId: undoPayload.toFlightId,
    });

    if (result.ok) {
      setUndoPayload(null);
      setToast("Undone");
      await reloadFlightsSnapshot();
    }
  };

  const handleMicroFix = async (payload: {
    action: "MOVE_ME" | "ADD_TO_MY_FLIGHT" | "REMOVE_FROM_MY_FLIGHT";
    targetMemberId?: string;
    toFlightId?: string;
  }) => {
    const result = await openMicroFix(payload);

    if (result.ok) {
      setIsModalOpen(false);
      if (result.undo) {
        setUndoPayload(result.undo);
        setToast("Updated — Undo");
      } else {
        setToast("Updated");
      }
      // Use snapshot from response if available, otherwise reload
      if (result.snapshot) {
        // Update via parent's reload function - it will handle state update
        await reloadFlightsSnapshot();
      } else {
        await reloadFlightsSnapshot();
      }
    } else if (result.error) {
      setToast(result.error);
    }
  };

  // Loading state
  if (!snapshot) {
    return (
      <div className="text-sm text-muted">
        <p>Loading flights…</p>
      </div>
    );
  }

  // Not in any flight
  if (!myFlight) {
    return (
      <div className="space-y-3">
        <div className="text-sm text-muted">You're not assigned to a flight.</div>
        <button
          onClick={() => {
            setIsViewOnly(false);
            setIsModalOpen(true);
          }}
          className="rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground hover:bg-muted/50"
        >
          Fix
        </button>
      </div>
    );
  }

  return (
    <>
      {/* Toast */}
      {toast && (
        <div className="mb-3 rounded-lg border border-border bg-muted/30 px-4 py-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-foreground">{toast}</span>
            {undoPayload && (
              <button
                onClick={handleUndo}
                className="text-sm font-medium text-anticipation hover:underline"
              >
                Undo
              </button>
            )}
          </div>
        </div>
      )}

      {/* Your group */}
      <div className="space-y-2">
        <div className="text-sm font-medium text-foreground">Your group</div>
        {myFlight.members.length === 0 ? (
          <div className="text-sm text-muted">No members</div>
        ) : (
          <div className="space-y-1">
            {myFlight.members.map((member) => (
              <div key={member.memberId} className="text-sm text-foreground">
                {member.displayName}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Warning line if issues */}
      {hasIssues && (
        <div className="mt-2 text-xs text-warning">
          Something looks off — fix it now.
        </div>
      )}

      {/* Action buttons */}
      <div className="mt-4 flex gap-2">
        <button
          onClick={() => {
            setIsViewOnly(false);
            setIsModalOpen(true);
          }}
          className="rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground hover:bg-muted/50"
        >
          Fix
        </button>
        <button
          onClick={() => {
            setIsViewOnly(true);
            setIsModalOpen(true);
          }}
          className="rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground hover:bg-muted/50"
        >
          View all
        </button>
      </div>

      {/* Modal */}
      {isModalOpen && (
        <FlightMicroFixModal
          snapshot={snapshot}
          myFlightId={myFlightId}
          currentMemberId={currentMemberId}
          isViewOnly={isViewOnly}
          onClose={() => setIsModalOpen(false)}
          onMicroFix={handleMicroFix}
        />
      )}
    </>
  );
}

/**
 * Flight Micro-Fix Modal
 */
function FlightMicroFixModal({
  snapshot,
  myFlightId,
  currentMemberId,
  isViewOnly,
  onClose,
  onMicroFix,
}: {
  snapshot: FlightsSnapshot;
  myFlightId: string | null;
  currentMemberId: string;
  isViewOnly: boolean;
  onClose: () => void;
  onMicroFix: (payload: {
    action: "MOVE_ME" | "ADD_TO_MY_FLIGHT" | "REMOVE_FROM_MY_FLIGHT";
    targetMemberId?: string;
    toFlightId?: string;
  }) => Promise<void>;
}) {
  const [selectedToFlightId, setSelectedToFlightId] = useState<string>("");

  // Filter out unassigned flight from move-to options
  const availableFlights = snapshot.flights.filter(
    (f) => !f.isUnassigned && f.flightId !== myFlightId
  );

  // Get members not in my flight (for adding)
  const membersNotInMyFlight = snapshot.flights
    .flatMap((f) => f.members)
    .filter((m) => {
      const memberFlightId = snapshot.memberToFlightId[m.memberId];
      return memberFlightId !== myFlightId;
    });

  // Get my flight members (excluding self for removal)
  const myFlight = myFlightId
    ? snapshot.flights.find((f) => f.flightId === myFlightId)
    : null;
  const myFlightMembersExcludingMe =
    myFlight?.members.filter((m) => m.memberId !== currentMemberId) || [];

  const handleMoveMe = async () => {
    if (!selectedToFlightId) return;
    await onMicroFix({
      action: "MOVE_ME",
      toFlightId: selectedToFlightId,
    });
  };

  const handleAddToMyFlight = async (memberId: string) => {
    await onMicroFix({
      action: "ADD_TO_MY_FLIGHT",
      targetMemberId: memberId,
    });
  };

  const handleRemoveFromMyFlight = async (memberId: string) => {
    await onMicroFix({
      action: "REMOVE_FROM_MY_FLIGHT",
      targetMemberId: memberId,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/50 p-4">
      <div className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-xl bg-surface border border-border p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-foreground">Fix flights</h3>
          <button
            onClick={onClose}
            className="text-muted hover:text-foreground"
          >
            ✕
          </button>
        </div>

        <div className="space-y-6">
          {/* Section 1: I'm in the wrong group */}
          {!isViewOnly && (
            <section>
              <div className="mb-3 text-sm font-medium text-foreground">
                I'm in the wrong group
              </div>
              <select
                value={selectedToFlightId}
                onChange={(e) => setSelectedToFlightId(e.target.value)}
                className="mb-3 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground"
              >
                <option value="">Select a flight</option>
                {availableFlights.map((flight) => (
                  <option key={flight.flightId} value={flight.flightId}>
                    Flight {flight.flightNumber} ({flight.members.map((m) => m.displayName).join(", ")})
                  </option>
                ))}
              </select>
              <button
                onClick={handleMoveMe}
                disabled={!selectedToFlightId}
                className="w-full rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground hover:bg-muted/50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Move me
              </button>
            </section>
          )}

          {/* Section 2: Add someone to my group */}
          {!isViewOnly && (
            <section>
              <div className="mb-3 text-sm font-medium text-foreground">
                Add someone to my group
              </div>
              <div className="mb-3 space-y-2">
                {/* Unassigned first */}
                {snapshot.unassigned.length > 0 && (
                  <div>
                    <div className="mb-1 text-xs text-muted">Unassigned</div>
                    {snapshot.unassigned.map((member) => (
                      <button
                        key={member.memberId}
                        onClick={() => handleAddToMyFlight(member.memberId)}
                        className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-left text-sm text-foreground hover:bg-muted/50"
                      >
                        {member.displayName}
                      </button>
                    ))}
                  </div>
                )}
                {/* Other members */}
                {membersNotInMyFlight.length > 0 && (
                  <div>
                    <div className="mb-1 text-xs text-muted">Other members</div>
                    {membersNotInMyFlight.map((member) => (
                      <button
                        key={member.memberId}
                        onClick={() => handleAddToMyFlight(member.memberId)}
                        className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-left text-sm text-foreground hover:bg-muted/50"
                      >
                        {member.displayName}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Section 3: Mark not here */}
          {!isViewOnly && (
            <section>
              <div className="mb-3 text-sm font-medium text-foreground">
                Mark not here
              </div>
              <div className="space-y-2">
                {myFlightMembersExcludingMe.length === 0 ? (
                  <div className="text-sm text-muted">No other members in your group</div>
                ) : (
                  myFlightMembersExcludingMe.map((member) => (
                    <button
                      key={member.memberId}
                      onClick={() => handleRemoveFromMyFlight(member.memberId)}
                      className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-left text-sm text-foreground hover:bg-muted/50"
                    >
                      {member.displayName}
                    </button>
                  ))
                )}
              </div>
            </section>
          )}

          {/* View all (read-only) */}
          {isViewOnly && (
            <section>
              <div className="mb-3 text-sm font-medium text-foreground">
                All flights
              </div>
              <div className="space-y-4">
                {snapshot.flights.map((flight) => (
                  <div key={flight.flightId}>
                    <div className="mb-2 text-sm font-medium text-foreground">
                      {flight.isUnassigned
                        ? "Unassigned"
                        : `Flight ${flight.flightNumber}`}
                    </div>
                    <div className="space-y-1">
                      {flight.members.length === 0 ? (
                        <div className="text-sm text-muted">No members</div>
                      ) : (
                        flight.members.map((member) => (
                          <div key={member.memberId} className="text-sm text-foreground">
                            {member.displayName}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
