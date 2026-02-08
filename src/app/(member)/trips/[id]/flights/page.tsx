"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter, useParams } from "next/navigation";

type Slot = {
  id: string;
  memberId: string;
  memberName: string;
  handicapSnapshot: number | null;
  slotPosition: number;
  isLocked: boolean;
};

type Flight = {
  id: string;
  flightNumber: number;
  slots: Slot[];
};

export default function FlightsEditorPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const tripId = params?.id ?? "";

  const [flights, setFlights] = useState<Flight[]>([]);
  const [originalFlights, setOriginalFlights] = useState<Flight[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [dragSource, setDragSource] = useState<{ flightId: string; slotIndex: number } | null>(null);
  const [pointerDragState, setPointerDragState] = useState<{
    flightId: string;
    slotIndex: number;
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
    pointerType: string;
  } | null>(null);
  const [pointerOverTarget, setPointerOverTarget] = useState<string | null>(null);
  const dragArmedRef = useRef(false);
  const overTargetRef = useRef<{ flightId: string; slotIndex: number } | null>(null);
  const dragRef = useRef<{ flightId: string; slotIndex: number; pointerId: number } | null>(null);

  useEffect(() => {
    if (!tripId) return;
    setLoading(true);
    setLoadError(null);
    fetch(`/api/trips/${tripId}/flights`)
      .then((res) => {
        if (!res.ok) return res.json().then((j) => Promise.reject(j?.error ?? "Failed to fetch flights."));
        return res.json();
      })
      .then((data: { flights: Flight[] }) => {
        setFlights(data.flights ?? []);
        setOriginalFlights(data.flights ?? []);
      })
      .catch((err: string) => {
        setLoadError(typeof err === "string" ? err : "Failed to fetch flights.");
      })
      .finally(() => setLoading(false));
  }, [tripId]);

  const handleBack = useCallback(() => {
    router.back();
  }, [router]);

  const swapSlots = useCallback(
    (sourceFlightId: string, sourceSlotIndex: number, targetFlightId: string, targetSlotIndex: number) => {
      const sourceFlight = flights.find((f) => f.id === sourceFlightId);
      const targetFlight = flights.find((f) => f.id === targetFlightId);
      if (!sourceFlight || !targetFlight) return;
      const sourceSlot = sourceFlight.slots[sourceSlotIndex];
      const targetSlot = targetFlight.slots[targetSlotIndex];
      if (!sourceSlot || !targetSlot) return;
      if (sourceFlightId === targetFlightId && sourceSlotIndex === targetSlotIndex) return;

      setFlights((prev) =>
        prev.map((f) => {
          if (f.id === sourceFlightId && f.id === targetFlightId) {
            const slots = [...f.slots];
            [slots[sourceSlotIndex], slots[targetSlotIndex]] = [
              { ...targetSlot, id: sourceSlot.id, slotPosition: sourceSlot.slotPosition },
              { ...sourceSlot, id: targetSlot.id, slotPosition: targetSlot.slotPosition },
            ];
            return { ...f, slots };
          }
          if (f.id === sourceFlightId) {
            const slots = [...f.slots];
            slots[sourceSlotIndex] = { ...targetSlot, id: sourceSlot.id, slotPosition: sourceSlot.slotPosition };
            return { ...f, slots };
          }
          if (f.id === targetFlightId) {
            const slots = [...f.slots];
            slots[targetSlotIndex] = { ...sourceSlot, id: targetSlot.id, slotPosition: targetSlot.slotPosition };
            return { ...f, slots };
          }
          return f;
        })
      );
    },
    [flights]
  );

  const handleDrop = useCallback(
    (targetFlightId: string, targetSlotIndex: number) => {
      const curr = dragRef.current;
      const source = dragSource ?? (curr ? { flightId: curr.flightId, slotIndex: curr.slotIndex } : null);
      if (!source) return;
      const sourceFlight = flights.find((f) => f.id === source.flightId);
      const targetFlight = flights.find((f) => f.id === targetFlightId);
      if (!sourceFlight || !targetFlight) return;
      const sourceSlot = sourceFlight.slots[source.slotIndex];
      const targetSlot = targetFlight.slots[targetSlotIndex];
      if (!sourceSlot || !targetSlot) return;
      if (sourceSlot.isLocked || targetSlot.isLocked) return;
      if (source.flightId === targetFlightId && source.slotIndex === targetSlotIndex) return;
      swapSlots(source.flightId, source.slotIndex, targetFlightId, targetSlotIndex);
    },
    [flights, dragSource, swapSlots]
  );

  const clearDragState = useCallback(() => {
    dragArmedRef.current = false;
    dragRef.current = null;
    overTargetRef.current = null;
    setPointerDragState(null);
    setPointerOverTarget(null);
    setDragging(false);
    setDragSource(null);
  }, []);

  const finalizeDropFromRefs = useCallback(
    (clientX: number, clientY: number) => {
      const latestDrag = dragRef.current;
      const latestTarget = overTargetRef.current;

      if (!latestDrag) {
        clearDragState();
        return;
      }

      let target: { flightId: string; slotIndex: number } | null = latestTarget;
      if (!target) {
        const elementBelow = document.elementFromPoint(clientX, clientY);
        const rowEl = elementBelow?.closest("[data-drop-target]") as HTMLElement | null;
        const targetKey = rowEl?.getAttribute("data-drop-target") ?? null;
        if (targetKey) {
          const parts = targetKey.split("|");
          if (parts.length === 3) {
            const targetFlightId = parts[0];
            const targetSlotIndex = parseInt(parts[2], 10);
            if (!isNaN(targetSlotIndex) && (targetFlightId !== latestDrag.flightId || targetSlotIndex !== latestDrag.slotIndex)) {
              target = { flightId: targetFlightId, slotIndex: targetSlotIndex };
            }
          }
        }
      }

      if (target) {
        const targetFlight = flights.find((f) => f.id === target.flightId);
        const targetSlot = targetFlight?.slots[target.slotIndex];
        if (!targetSlot?.isLocked) {
          handleDrop(target.flightId, target.slotIndex);
        }
      }
      clearDragState();
    },
    [flights, handleDrop, clearDragState]
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent, flightId: string, slotIndex: number, isLocked: boolean) => {
      if (e.button !== undefined && e.button !== 0) return;
      if (isLocked) return;
      e.stopPropagation();
      const f = flights.find((x) => x.id === flightId);
      if (!f || !f.slots[slotIndex]) return;
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      setPointerDragState({
        flightId,
        slotIndex,
        startX: e.clientX,
        startY: e.clientY,
        currentX: e.clientX,
        currentY: e.clientY,
        pointerType: e.pointerType,
      });
      e.preventDefault();
      dragArmedRef.current = true;
      setDragging(true);
      setDragSource({ flightId, slotIndex });
      dragRef.current = { flightId, slotIndex, pointerId: e.pointerId };
    },
    [flights]
  );

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!pointerDragState || !dragArmedRef.current) return;
    setPointerDragState((prev) =>
      prev ? { ...prev, currentX: e.clientX, currentY: e.clientY } : null
    );
    e.preventDefault();
    const elementBelow = document.elementFromPoint(e.clientX, e.clientY);
    const rowEl = elementBelow?.closest("[data-drop-target]") as HTMLElement | null;
    const targetKey = rowEl?.getAttribute("data-drop-target") ?? null;
    if (targetKey) {
      const parts = targetKey.split("|");
      if (parts.length === 3) {
        const targetFlightId = parts[0];
        const targetSlotIndex = parseInt(parts[2], 10);
        if (
          !isNaN(targetSlotIndex) &&
          (targetFlightId !== pointerDragState.flightId || targetSlotIndex !== pointerDragState.slotIndex)
        ) {
          setPointerOverTarget(targetKey);
          overTargetRef.current = { flightId: targetFlightId, slotIndex: targetSlotIndex };
          return;
        }
      }
    }
    setPointerOverTarget(null);
    overTargetRef.current = null;
  }, [pointerDragState]);

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!pointerDragState) return;
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      finalizeDropFromRefs(e.clientX, e.clientY);
    },
    [pointerDragState, finalizeDropFromRefs]
  );

  const handlePointerCancel = useCallback(() => {
    clearDragState();
  }, [clearDragState]);

  const handleSave = useCallback(() => {
    if (!tripId) return;
    const updates: Array<{ slotId: string; memberId: string; slotPosition: number; isLocked: boolean }> = [];
    const origBySlotId = new Map<string, Slot>();
    originalFlights.forEach((f) => f.slots.forEach((s) => origBySlotId.set(s.id, s)));
    flights.forEach((f) => {
      f.slots.forEach((s) => {
        const orig = origBySlotId.get(s.id);
        if (!orig) return;
        if (orig.memberId !== s.memberId || orig.slotPosition !== s.slotPosition || orig.isLocked !== s.isLocked) {
          updates.push({ slotId: s.id, memberId: s.memberId, slotPosition: s.slotPosition, isLocked: s.isLocked });
        }
      });
    });
    if (updates.length === 0) return;
    setSaveError(null);
    setSaving(true);
    fetch(`/api/trips/${tripId}/flights`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ updates }),
    })
      .then((res) => {
        if (!res.ok) return res.json().then((j) => Promise.reject(j?.error ?? "Failed to update flights."));
        return res.json();
      })
      .then(() => {
        setOriginalFlights(flights);
      })
      .catch((err: string) => {
        setSaveError(typeof err === "string" ? err : "Failed to update flights.");
      })
      .finally(() => setSaving(false));
  }, [tripId, flights, originalFlights]);

  useEffect(() => {
    if (dragging && dragArmedRef.current && pointerDragState?.pointerType !== "mouse") {
      const prevent = (ev: Event) => ev.preventDefault();
      window.addEventListener("touchmove", prevent, { passive: false });
      window.addEventListener("wheel", prevent, { passive: false });
      return () => {
        window.removeEventListener("touchmove", prevent);
        window.removeEventListener("wheel", prevent);
      };
    }
  }, [dragging, pointerDragState]);

  useEffect(() => {
    if (!dragging) return;
    const onUp = (e: PointerEvent) => finalizeDropFromRefs(e.clientX, e.clientY);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", clearDragState);
    return () => {
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", clearDragState);
    };
  }, [dragging, finalizeDropFromRefs, clearDragState]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="sticky top-0 z-20 border-b border-border bg-surface">
          <div className="flex items-center justify-between px-4 h-14">
            <button onClick={handleBack} className="text-sm text-secondary hover:text-foreground">
              ← Back
            </button>
            <h1 className="text-base font-semibold text-foreground">Flights</h1>
            <div className="w-12" />
          </div>
        </div>
        <div className="px-4 py-8 text-sm text-secondary text-center">Loading flights…</div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="min-h-screen bg-background">
        <div className="sticky top-0 z-20 border-b border-border bg-surface">
          <div className="flex items-center justify-between px-4 h-14">
            <button onClick={handleBack} className="text-sm text-secondary hover:text-foreground">
              ← Back
            </button>
            <h1 className="text-base font-semibold text-foreground">Flights</h1>
            <div className="w-12" />
          </div>
        </div>
        <div className="px-4 py-4 text-sm text-destructive">{loadError}</div>
      </div>
    );
  }

  const hasChanges =
    JSON.stringify(flights.map((f) => f.slots.map((s) => ({ id: s.id, memberId: s.memberId, slotPosition: s.slotPosition, isLocked: s.isLocked })))) !==
    JSON.stringify(originalFlights.map((f) => f.slots.map((s) => ({ id: s.id, memberId: s.memberId, slotPosition: s.slotPosition, isLocked: s.isLocked }))));

  return (
    <div className="min-h-screen bg-background">
      <div className="sticky top-0 z-20 border-b border-border bg-surface">
        <div className="flex items-center justify-between px-4 h-14">
          <button onClick={handleBack} className="text-sm text-secondary hover:text-foreground">
            ← Back
          </button>
          <h1 className="text-base font-semibold text-foreground">Flights</h1>
          <div className="w-12" />
        </div>
      </div>

      <div className="px-4 py-3 border-b border-border bg-surface">
        <div className="text-sm font-medium text-foreground mb-1">Drag players to adjust flights.</div>
        <div className="text-xs text-secondary">Drag onto another player to swap positions.</div>
      </div>

      <div className="px-4 pt-4 pb-24 space-y-4">
        {flights.map((flight) => (
          <div key={flight.id} className="rounded-lg border border-border bg-surface p-4">
            <div className="mb-3">
              <h2 className="text-sm font-semibold text-foreground">Flight {flight.flightNumber}</h2>
            </div>
            <div className="space-y-2">
              {flight.slots.map((slot, slotIndex) => {
                const dropTargetKey = `${flight.id}|${slot.id}|${slotIndex}`;
                const isDraggingThis = dragSource?.flightId === flight.id && dragSource?.slotIndex === slotIndex;
                const isOverTarget = !slot.isLocked && pointerOverTarget === dropTargetKey;
                const isActiveDrag = dragging && pointerDragState?.flightId === flight.id && pointerDragState?.slotIndex === slotIndex;
                const dx = isActiveDrag && pointerDragState ? pointerDragState.currentX - pointerDragState.startX : 0;
                const dy = isActiveDrag && pointerDragState ? pointerDragState.currentY - pointerDragState.startY : 0;
                const canDrag = !slot.isLocked;

                return (
                  <div
                    key={slot.id}
                    data-drop-target={dropTargetKey}
                    onPointerDown={(e) => {
                      if (e.pointerType !== "mouse") return;
                      handlePointerDown(e, flight.id, slotIndex, slot.isLocked);
                    }}
                    onPointerMove={(e) => {
                      if (e.pointerType !== "mouse") return;
                      handlePointerMove(e);
                    }}
                    onPointerUp={(e) => {
                      if (e.pointerType !== "mouse") return;
                      handlePointerUp(e);
                    }}
                    onPointerCancel={(e) => {
                      if (e.pointerType !== "mouse") return;
                      handlePointerCancel();
                    }}
                    style={{
                      transform: isActiveDrag ? `translate3d(${dx}px, ${dy}px, 0) scale(0.98)` : undefined,
                      zIndex: isActiveDrag ? 50 : undefined,
                      position: isActiveDrag ? "relative" : undefined,
                      pointerEvents: isActiveDrag ? "none" : "auto",
                    }}
                    className={`flex items-center gap-3 rounded-md border border-border bg-background px-3 py-2 transition-all select-none ${
                      !canDrag ? "opacity-90" : isActiveDrag ? "shadow-lg cursor-grabbing" : isDraggingThis ? "opacity-50 cursor-grabbing" : isOverTarget ? "bg-background/50 ring-2 ring-foreground/30 cursor-grab" : "hover:bg-background/30 cursor-grab"
                    }`}
                  >
                    {canDrag ? (
                      <button
                        type="button"
                        aria-label="Drag player"
                        onPointerDown={(e) => {
                          if (e.pointerType === "mouse") return;
                          handlePointerDown(e, flight.id, slotIndex, slot.isLocked);
                        }}
                        onPointerMove={(e) => {
                          if (e.pointerType === "mouse") return;
                          handlePointerMove(e);
                        }}
                        onPointerUp={(e) => {
                          if (e.pointerType === "mouse") return;
                          handlePointerUp(e);
                        }}
                        onPointerCancel={(e) => {
                          if (e.pointerType === "mouse") return;
                          handlePointerCancel();
                        }}
                        style={{ touchAction: "none" }}
                        className={`text-secondary text-xs select-none hover:text-foreground focus:outline-none focus:ring-2 focus:ring-foreground/30 rounded px-1 -ml-1 ${isDraggingThis ? "cursor-grabbing" : "cursor-grab"}`}
                      >
                        ≡
                      </button>
                    ) : (
                      <span className="text-secondary/70 text-xs w-5 flex-shrink-0" aria-hidden>⊟</span>
                    )}
                    <div className="flex-1">
                      <div className="text-sm font-medium text-foreground">{slot.memberName}</div>
                      <div className="flex items-center gap-2 flex-wrap">
                        {slot.handicapSnapshot != null && <span className="text-xs text-secondary">HCP {slot.handicapSnapshot}</span>}
                        {slot.isLocked && <span className="text-xs text-secondary/70">Locked</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="sticky bottom-0 border-t border-border bg-surface px-5 py-4">
        {saveError && <div className="text-xs text-destructive mb-2 text-center">{saveError}</div>}
        <button
          onClick={handleSave}
          disabled={saving || !hasChanges}
          className={`w-full rounded-lg btn-primary px-4 py-3 text-sm font-medium ${saving || !hasChanges ? "opacity-50 cursor-not-allowed" : ""}`}
        >
          {saving ? "Saving…" : "Save flights"}
        </button>
      </div>
    </div>
  );
}
