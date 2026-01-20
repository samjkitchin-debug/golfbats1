"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { loadCourses, type Course, loadCoursePack, type CoursePack } from "../../../lib/courseActions";
import Link from "next/link";
import { InlineNotice } from "@/app/components/InlineNotice";
import { isLegacyNumericId, safeParseUUID } from "@/app/lib/invariants";
import { resolveGameDayContext } from "../../../lib/domain/gameday/resolveGameDayContext";
import { buildGameDayPolicy } from "../../../lib/domain/gameday/gamedayPolicy";
import { gamedayRegistry } from "../../../lib/domain/gameday/instruments/gamedayRegistry";
import type { GameDayInstrumentKey } from "../../../lib/domain/gameday/gamedayTypes";
import InlineGameDayInstrumentSection from "../../../components/InlineGameDayInstrumentSection";
import type { FlightsSnapshot } from "../../../lib/domain/flights/flightsTypes";

// Helper to extract error message from API responses (handles both old and new formats)
function extractErrorMessage(errorResponse: any): string {
  if (typeof errorResponse === "string") return errorResponse;
  if (errorResponse?.errorMessage) return errorResponse.errorMessage;
  if (errorResponse?.error?.message) return errorResponse.error.message;
  if (typeof errorResponse?.error === "string") return errorResponse.error;
  return "An error occurred";
}
import {
  gamedayHole,
  gamedayLanding,
} from "../../../lib/routes";

type GameDayData = {
  roundId: number;
  participants: Array<{ id: string; displayName: string }>;
  courseId: string | null;
  teeId: string | null;
  groupId: string | null;
  status: "not_started" | "in_progress" | "finished";
  gameday?: {
    state: "not_started" | "in_progress" | "ready_to_close" | "closed" | "published";
    lockedCourseId?: string | null;
    lockedTeeId?: string | null;
    startedAt?: string | null;
    closedAt?: string | null;
    publishedAt?: string | null;
    startHole?: number;
    holesToPlay?: number;
    currentHoleIndex?: number;
  };
};


export default function GameDayPage() {
  const router = useRouter();
  const params = useParams<{ roundId: string }>();
  const searchParams = useSearchParams();
  const roundId = params.roundId;
  
  // Validate roundId at the top
  const isValidRoundId = roundId && (isLegacyNumericId(roundId) || safeParseUUID(roundId) !== null);

  const [gameDayData, setGameDayData] = useState<GameDayData | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [coursePack, setCoursePack] = useState<CoursePack | null>(null);
  const [coursePackError, setCoursePackError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [currentMemberId, setCurrentMemberId] = useState<string | null>(null);
  const [canEditStartHole, setCanEditStartHole] = useState(false);
  const [updatingCourse, setUpdatingCourse] = useState(false);
  const [updatingTee, setUpdatingTee] = useState(false);
  const [managingParticipants, setManagingParticipants] = useState(false);
  const [startingRound, setStartingRound] = useState(false);
  const [savingScore, setSavingScore] = useState(false);
  const [closingRound, setClosingRound] = useState(false);
  const [publishingRound, setPublishingRound] = useState(false);
  const [bootstrapData, setBootstrapData] = useState<any>(null);
  
  // Round setup state (for "Not Started")
  const [startHole, setStartHole] = useState<number>(1);
  const [holesToPlay, setHolesToPlay] = useState<9 | 18>(18);
  
  // Score entry state (legacy - kept for compatibility)
  const [selectedParticipant, setSelectedParticipant] = useState<string>("");
  const [selectedHole, setSelectedHole] = useState<number>(1);
  const [strokes, setStrokes] = useState<number>(0);
  
  // Premium scoring state
  const [draftScores, setDraftScores] = useState<Record<string, number | null>>({});
  const [savedScores, setSavedScores] = useState<Record<string, Record<number, number>>>({}); // memberId -> holeNumber -> strokes
  const [isSavingHole, setIsSavingHole] = useState(false);
  const [toast, setToast] = useState<{ message: string; visible: boolean }>({ message: "", visible: false });
  const [undoState, setUndoState] = useState<{ holeNumber: number; snapshot: Record<string, number | null> } | null>(null);
  const [expandedScoreRows, setExpandedScoreRows] = useState<Set<string>>(new Set()); // memberId -> expanded
  
  // Flights snapshot state
  const [flightsSnapshot, setFlightsSnapshot] = useState<FlightsSnapshot | null>(null);

  // Build play order helper
  function buildPlayOrder(startHole: number, holesToPlay: 9 | 18): number[] {
    const order: number[] = [];
    let current = startHole;
    for (let i = 0; i < holesToPlay; i++) {
      order.push(current);
      current = current >= 18 ? 1 : current + 1;
    }
    return order;
  }

  // Initialize hole number from query param
  useEffect(() => {
    if (!roundId) return;

    const holeParam = searchParams.get("hole");
    if (holeParam) {
      const holeNum = parseInt(holeParam, 10);
      if (!isNaN(holeNum) && holeNum >= 1 && holeNum <= 18) {
        setSelectedHole(holeNum);
        // Save to localStorage
        localStorage.setItem(
          `gameday:last:${roundId}`,
          JSON.stringify({ holeNumber: holeNum, at: Date.now() })
        );
      }
    }
  }, [roundId, searchParams]);

  // Sync selectedHole to currentHoleIndex when in_progress
  useEffect(() => {
    if (!gameDayData || !gameDayData.gameday || gameDayData.gameday.state !== "in_progress") return;

    const startHoleVal = gameDayData.gameday.startHole ?? 1;
    const holesToPlayVal = (gameDayData.gameday.holesToPlay ?? 18) as 9 | 18;
    const currentHoleIndexVal = gameDayData.gameday.currentHoleIndex ?? 0;
    const playOrder = buildPlayOrder(startHoleVal, holesToPlayVal);
    const currentHoleNumber = playOrder[currentHoleIndexVal] ?? playOrder[0] ?? 1;
    
    // Update to match current hole from cursor
    setSelectedHole(currentHoleNumber);
  }, [gameDayData?.gameday?.currentHoleIndex, gameDayData?.gameday?.startHole, gameDayData?.gameday?.holesToPlay, gameDayData?.gameday?.state]);

  // Save hole number to localStorage when selectedHole changes (but not during in-progress cursor updates)
  useEffect(() => {
    if (!roundId || selectedHole < 1 || selectedHole > 18) return;
    if (gameDayData?.gameday?.state === "in_progress") {
      // Don't save to localStorage during in-progress - cursor is the source of truth
      return;
    }

    const lastHoleKey = `gameday:last:${roundId}`;
    localStorage.setItem(
      lastHoleKey,
      JSON.stringify({ holeNumber: selectedHole, at: Date.now() })
    );
  }, [roundId, selectedHole, gameDayData]);

  useEffect(() => {
    document.title = "DayForeIt - GameDay";
  }, []);

  // REMOVED: unsafe redirect to /trips/${roundId} - causes cascades

  // Load GameDay data using dedicated API
  useEffect(() => {
    async function loadData() {
      try {
        const bootstrapRes = await fetch("/api/me/bootstrap", { credentials: "include" });
        if (!bootstrapRes.ok) {
          if (bootstrapRes.status === 401) {
            router.replace("/login");
            return;
          }
          throw new Error("Failed to load bootstrap data");
        }
        const bootstrap = await bootstrapRes.json();
        setBootstrapData(bootstrap);
        setActiveGroupId(bootstrap.activeGroupId);
        const memberId: string | null = bootstrap.member?.id || null;
        setCurrentMemberId(memberId);

        // Derive permissions for editing round start hole
        const isHost = Boolean(bootstrap.isTripHost);
        const isGroupAdmin = Boolean(bootstrap.isGroupAdmin);
        setCanEditStartHole(isHost || isGroupAdmin);

        if (!roundId || !isValidRoundId) {
          setLoading(false);
          return;
        }

        // Load GameDay data and courses in parallel
        const [gameDayRes, coursesData] = await Promise.all([
          fetch(`/api/gameday/${roundId}`, { credentials: "include" }),
          loadCourses(),
        ]);

        if (!gameDayRes.ok) {
          if (gameDayRes.status === 404) {
            setGameDayData(null);
          } else {
            throw new Error("Failed to load GameDay data");
          }
        } else {
          const gameDay = await gameDayRes.json();
          if (gameDay.ok && gameDay.data) {
            // Extract data from jsonOk wrapper
            const gameDayData = gameDay.data;
            setGameDayData(gameDayData);
            
            // Initialize start settings from gameDay data
            if (gameDayData.gameday?.startHole) {
              setStartHole(gameDayData.gameday.startHole);
            }
            if (gameDayData.gameday?.holesToPlay) {
              setHolesToPlay(gameDayData.gameday.holesToPlay as 9 | 18);
            }
            
            // Conditionally load course pack only if tee_id exists
            if (gameDayData.teeId) {
              const pack = await loadCoursePack(roundId);
              if (pack) {
                setCoursePack(pack);
                setCoursePackError(null);
              } else {
                setCoursePackError("Failed to load course data");
              }
            } else {
              setCoursePack(null);
              setCoursePackError(null);
            }

            // Load flights snapshot for pre-round micro-fix
            try {
              const snapshotRes = await fetch(`/api/gameday/${roundId}/flights/snapshot`, {
                credentials: "include",
              });
              if (snapshotRes.ok) {
                const snapshotData = await snapshotRes.json();
                if (snapshotData.ok && snapshotData.snapshot) {
                  setFlightsSnapshot(snapshotData.snapshot);
                }
              }
            } catch (snapshotError) {
              console.error("Failed to load flights snapshot:", snapshotError);
              setFlightsSnapshot(null);
            }
          } else {
            setGameDayData(null);
          }
        }

        setCourses(coursesData);
      } catch (error) {
        console.error("Failed to load data:", error);
        setGameDayData(null);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [roundId, router]);

  // Fetch saved scores when gameDayData changes
  useEffect(() => {
    async function fetchSavedScores() {
      if (!roundId || !gameDayData?.participants.length) return;
      
      try {
        const res = await fetch(`/api/gameday/${roundId}/scorecard`, { credentials: "include" });
        if (res.ok) {
          const data = await res.json();
          if (data.ok && data.scores) {
            // Organize scores by memberId -> holeNumber -> strokes
            const organized: Record<string, Record<number, number>> = {};
            for (const score of data.scores) {
              if (!organized[score.memberId]) {
                organized[score.memberId] = {};
              }
              organized[score.memberId][score.holeNumber] = score.strokes;
            }
            setSavedScores(organized);
          }
        }
      } catch (error) {
        console.error("Failed to fetch saved scores:", error);
      }
    }
    
    fetchSavedScores();
  }, [roundId, gameDayData?.participants]);

  // Initialize draftScores when current hole changes
  useEffect(() => {
    if (!gameDayData?.participants.length || !gameDayData.gameday) return;
    
    const startHoleVal = gameDayData.gameday.startHole ?? 1;
    const holesToPlayVal = (gameDayData.gameday.holesToPlay ?? 18) as 9 | 18;
    const currentHoleIndexVal = gameDayData.gameday.currentHoleIndex ?? 0;
    const playOrder = buildPlayOrder(startHoleVal, holesToPlayVal);
    const currentHoleNumber = playOrder[currentHoleIndexVal] ?? playOrder[0] ?? 1;
    
    // Initialize draftScores for current hole from saved scores
    const draft: Record<string, number | null> = {};
    for (const participant of gameDayData.participants) {
      draft[participant.id] = savedScores[participant.id]?.[currentHoleNumber] ?? null;
    }
    setDraftScores(draft);
    setSelectedHole(currentHoleNumber);
  }, [gameDayData?.gameday?.currentHoleIndex, gameDayData?.gameday?.startHole, gameDayData?.gameday?.holesToPlay, gameDayData?.participants, savedScores]);

  async function handleCourseSelect(courseId: string) {
    if (!activeGroupId || !roundId || !courseId) return;

    setUpdatingCourse(true);
    try {
      // Update trip via API
      const updateRes = await fetch("/api/trips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          id: parseInt(roundId, 10),
          groupId: activeGroupId,
          trip: { courseId },
        }),
      });

      if (!updateRes.ok) {
        const error = await updateRes.json();
        throw new Error(extractErrorMessage(error));
      }

      // Reload GameDay data
      const res = await fetch(`/api/gameday/${roundId}`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        if (data.ok && data.data) {
          setGameDayData(data.data);
          // Reload course pack if tee_id exists
          if (data.data.teeId) {
            const pack = await loadCoursePack(roundId);
            if (pack) {
              setCoursePack(pack);
              setCoursePackError(null);
            }
          } else {
            setCoursePack(null);
            setCoursePackError(null);
          }
        }
      }
    } catch (error) {
      console.error("Failed to update course:", error);
      alert(error instanceof Error ? error.message : "Failed to update course. Please try again.");
    } finally {
      setUpdatingCourse(false);
    }
  }

  async function handleTeeSelect(teeId: string) {
    if (!gameDayData?.groupId || !roundId || !teeId) return;

    setUpdatingTee(true);
    try {
      // Update trip via API
      const updateRes = await fetch("/api/trips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          id: parseInt(roundId, 10),
          groupId: gameDayData.groupId,
          trip: { teeId },
        }),
      });

      if (!updateRes.ok) {
        const error = await updateRes.json();
        throw new Error(extractErrorMessage(error));
      }

      // Reload GameDay data
      const res = await fetch(`/api/gameday/${roundId}`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        if (data.ok && data.data) {
          setGameDayData(data.data);
          // Reload course pack if tee_id exists
          if (data.data.teeId) {
            const pack = await loadCoursePack(roundId);
            if (pack) {
              setCoursePack(pack);
              setCoursePackError(null);
            }
          } else {
            setCoursePack(null);
            setCoursePackError(null);
          }
        }
      }
    } catch (error) {
      console.error("Failed to update tee:", error);
      alert(error instanceof Error ? error.message : "Failed to update tee. Please try again.");
    } finally {
      setUpdatingTee(false);
    }
  }

  async function handleAddParticipant(memberId: string) {
    if (!roundId) return;

    setManagingParticipants(true);
    try {
      const res = await fetch(`/api/gameday/${roundId}/participants`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action: "add", memberId }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(extractErrorMessage(error));
      }

      // Reload GameDay data
      const gameDayRes = await fetch(`/api/gameday/${roundId}`, { credentials: "include" });
      if (gameDayRes.ok) {
        const data = await gameDayRes.json();
        if (data.ok && data.data) {
          setGameDayData(data.data);
        }
      }
    } catch (error) {
      console.error("Failed to add participant:", error);
      alert(error instanceof Error ? error.message : "Failed to add participant");
    } finally {
      setManagingParticipants(false);
    }
  }

  async function handleRemoveParticipant(memberId: string) {
    if (!roundId) return;

    setManagingParticipants(true);
    try {
      const res = await fetch(`/api/gameday/${roundId}/participants`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action: "remove", memberId }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(extractErrorMessage(error));
      }

      // Reload GameDay data
      const gameDayRes = await fetch(`/api/gameday/${roundId}`, { credentials: "include" });
      if (gameDayRes.ok) {
        const data = await gameDayRes.json();
        if (data.ok && data.data) {
          setGameDayData(data.data);
        }
      }
    } catch (error) {
      console.error("Failed to remove participant:", error);
      alert(error instanceof Error ? error.message : "Failed to remove participant");
    } finally {
      setManagingParticipants(false);
    }
  }

  async function handleStartRound() {
    if (!roundId) return;

    setStartingRound(true);
    try {
      const res = await fetch(`/api/gameday/${roundId}/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          startHole,
          holesToPlay,
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(extractErrorMessage(error));
      }

      // Reload GameDay data
      const gameDayRes = await fetch(`/api/gameday/${roundId}`, { credentials: "include" });
      if (gameDayRes.ok) {
        const data = await gameDayRes.json();
        if (data.ok && data.data) {
          setGameDayData(data.data);
        }
      }
    } catch (error) {
      console.error("Failed to start round:", error);
      alert(error instanceof Error ? error.message : "Failed to start round");
    } finally {
      setStartingRound(false);
    }
  }

  // Legacy handleSaveScore (kept for backward compatibility)
  async function handleSaveScore(holeNumberOverride?: number) {
    const holeToUse = holeNumberOverride ?? selectedHole;
    if (!roundId || !selectedParticipant || holeToUse < 1 || holeToUse > 18) return;

    setSavingScore(true);
    try {
      const clientUpdatedAt = new Date().toISOString();
      
      // Use current hole index from gameDayData for cursor update
      const currentHoleIndex = gameDayData?.gameday?.currentHoleIndex ?? 0;
      
      const res = await fetch(`/api/gameday/${roundId}/scorecard`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          updates: [
            {
              memberId: selectedParticipant,
              holeNumber: holeToUse,
              strokes: strokes,
              clientUpdatedAt: clientUpdatedAt,
            },
          ],
          cursor: { currentHoleIndex },
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(extractErrorMessage(error));
      }

      const result = await res.json();
      if (result.ok && result.applied > 0) {
        alert("Score saved!");
        // Reset form and reload GameDay data to update cursor
        setStrokes(0);
        const gameDayRes = await fetch(`/api/gameday/${roundId}`, { credentials: "include" });
        if (gameDayRes.ok) {
          const data = await gameDayRes.json();
          if (data.ok && data.data) {
            setGameDayData(data.data);
          }
        }
      } else {
        alert("Score not saved (may be stale)");
      }
    } catch (error) {
      console.error("Failed to save score:", error);
      alert(error instanceof Error ? error.message : "Failed to save score");
    } finally {
      setSavingScore(false);
    }
  }

  // Premium scoring: confirm hole (saves all players at once)
  async function handleConfirmHole() {
    if (!roundId || !gameDayData?.participants.length) return;
    
    const startHoleVal = gameDayData.gameday?.startHole ?? 1;
    const holesToPlayVal = (gameDayData.gameday?.holesToPlay ?? 18) as 9 | 18;
    const currentHoleIndexVal = gameDayData.gameday?.currentHoleIndex ?? 0;
    const playOrder = buildPlayOrder(startHoleVal, holesToPlayVal);
    const currentHoleNumber = playOrder[currentHoleIndexVal] ?? playOrder[0] ?? 1;
    
    // Check if there are any changes or existing scores to confirm
    const hasChanges = gameDayData.participants.some((p) => {
      const draft = draftScores[p.id];
      const saved = savedScores[p.id]?.[currentHoleNumber];
      return draft !== null && draft !== saved;
    });
    const hasExistingScores = gameDayData.participants.some((p) => {
      return savedScores[p.id]?.[currentHoleNumber] !== undefined;
    });
    
    if (!hasChanges && !hasExistingScores) return; // Nothing to save
    
    setIsSavingHole(true);
    const snapshot = { ...draftScores }; // Save snapshot for undo
    
    try {
      const clientUpdatedAt = new Date().toISOString();
      const updates = gameDayData.participants
        .filter((p) => draftScores[p.id] !== null && draftScores[p.id] !== undefined)
        .map((p) => ({
          memberId: p.id,
          holeNumber: currentHoleNumber,
          strokes: draftScores[p.id]!,
          clientUpdatedAt,
        }));
      
      if (updates.length === 0) {
        setIsSavingHole(false);
        return;
      }
      
      const res = await fetch(`/api/gameday/${roundId}/scorecard`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          updates,
          cursor: { currentHoleIndex: currentHoleIndexVal },
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(extractErrorMessage(error));
      }

      const result = await res.json();
      if (result.ok && result.applied > 0) {
        // Update savedScores state
        const updatedSaved = { ...savedScores };
        for (const update of updates) {
          if (!updatedSaved[update.memberId]) {
            updatedSaved[update.memberId] = {};
          }
          updatedSaved[update.memberId][update.holeNumber] = update.strokes;
        }
        setSavedScores(updatedSaved);
        
        // Show toast
        setToast({ message: `Hole ${currentHoleNumber} locked in.`, visible: true });
        setTimeout(() => setToast({ message: "", visible: false }), 1200);
        
        // Set undo state
        setUndoState({ holeNumber: currentHoleNumber, snapshot });
        setTimeout(() => setUndoState(null), 8000);
        
        // Reload GameDay data to sync cursor
        const gameDayRes = await fetch(`/api/gameday/${roundId}`, { credentials: "include" });
        if (gameDayRes.ok) {
          const data = await gameDayRes.json();
          if (data.ok && data.data) {
            setGameDayData(data.data);
            
            // Auto-advance to next hole after delay (600ms)
            const updatedHoleIndex = data.data.gameday?.currentHoleIndex ?? currentHoleIndexVal;
            const canGoNext = updatedHoleIndex < playOrder.length - 1;
            if (canGoNext) {
              setTimeout(() => {
                const newIndex = updatedHoleIndex + 1;
                const newHole = playOrder[newIndex];
                router.push(gamedayHole(roundId, newHole));
                setSelectedHole(newHole);
              }, 600);
            }
          }
        }
      } else {
        throw new Error("Scores not saved (may be stale)");
      }
    } catch (error) {
      console.error("Failed to save scores:", error);
      setToast({ 
        message: error instanceof Error ? error.message : "Failed to save scores", 
        visible: true 
      });
      setTimeout(() => setToast({ message: "", visible: false }), 3000);
    } finally {
      setIsSavingHole(false);
    }
  }

  // Handle undo
  function handleUndo() {
    if (!undoState) return;
    
    const { holeNumber, snapshot } = undoState;
    const startHoleVal = gameDayData?.gameday?.startHole ?? 1;
    const holesToPlayVal = (gameDayData?.gameday?.holesToPlay ?? 18) as 9 | 18;
    const playOrder = buildPlayOrder(startHoleVal, holesToPlayVal);
    const currentHoleIndexVal = gameDayData?.gameday?.currentHoleIndex ?? 0;
    const currentHoleNumber = playOrder[currentHoleIndexVal] ?? playOrder[0] ?? 1;
    
    // If we're on the next hole due to auto-advance, navigate back
    if (currentHoleNumber !== holeNumber && roundId) {
      router.push(gamedayHole(roundId, holeNumber));
      setSelectedHole(holeNumber);
    }
    
    // Restore snapshot
    setDraftScores(snapshot);
    setUndoState(null);
    setToast({ message: "", visible: false });
  }

  // Compute running totals for current member
  function computeMyTotals(
    playOrder: number[],
    currentHoleIndex: number,
    coursePack: CoursePack | null
  ): { strokesTotal: number | null; toPar: number | null } {
    if (!currentMemberId || !coursePack) {
      return { strokesTotal: null, toPar: null };
    }

    let strokesTotal = 0;
    let parTotal = 0;
    let hasAllScores = true;

    // Sum scores and par for holes 1..currentHole
    for (let i = 0; i <= currentHoleIndex && i < playOrder.length; i++) {
      const holeNum = playOrder[i];
      const holeInfo = coursePack.holes.find((h) => h.holeNumber === holeNum);
      
      if (holeInfo && holeInfo.par !== null && holeInfo.par !== undefined) {
        parTotal += holeInfo.par;
      }

      const savedScore = savedScores[currentMemberId]?.[holeNum];
      if (savedScore !== undefined && savedScore !== null) {
        strokesTotal += savedScore;
      } else {
        // Check if current hole has draft score
        if (i === currentHoleIndex) {
          const draftScore = draftScores[currentMemberId];
          if (draftScore !== null && draftScore !== undefined) {
            strokesTotal += draftScore;
          } else {
            hasAllScores = false;
          }
        } else {
          hasAllScores = false;
        }
      }
    }

    if (!hasAllScores) {
      return { strokesTotal: null, toPar: null };
    }

    const toPar = strokesTotal - parTotal;
    return { strokesTotal, toPar };
  }

  async function handleCloseRound() {
    if (!roundId) return;

    setClosingRound(true);
    try {
      const res = await fetch(`/api/gameday/${roundId}/close`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(extractErrorMessage(error));
      }

      // Reload GameDay data
      const gameDayRes = await fetch(`/api/gameday/${roundId}`, { credentials: "include" });
      if (gameDayRes.ok) {
        const data = await gameDayRes.json();
        if (data.ok && data.data) {
          setGameDayData(data.data);
        }
      }
    } catch (error) {
      console.error("Failed to close round:", error);
      alert(error instanceof Error ? error.message : "Failed to close round");
    } finally {
      setClosingRound(false);
    }
  }

  async function handlePublishRound() {
    if (!roundId) return;

    setPublishingRound(true);
    try {
      const res = await fetch(`/api/gameday/${roundId}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(extractErrorMessage(error));
      }

      // Reload GameDay data
      const gameDayRes = await fetch(`/api/gameday/${roundId}`, { credentials: "include" });
      if (gameDayRes.ok) {
        const data = await gameDayRes.json();
        if (data.ok && data.data) {
          setGameDayData(data.data);
        }
      }
    } catch (error) {
      console.error("Failed to publish results:", error);
      alert(error instanceof Error ? error.message : "Failed to publish results");
    } finally {
      setPublishingRound(false);
    }
  }

  // Self-heal: clear persisted active-round keys when round is unavailable
  useEffect(() => {
    if (!isValidRoundId || (!loading && !gameDayData)) {
      // Clear any persisted active-round keys
      if (typeof window !== 'undefined') {
        const keysToRemove: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && (key.startsWith('gameday:last:') || key === 'dayforeit:last_mode')) {
            keysToRemove.push(key);
          }
        }
        keysToRemove.forEach(key => localStorage.removeItem(key));
      }
    }
  }, [isValidRoundId, loading, gameDayData]);

  // Show invalid roundId or not found state
  if (!isValidRoundId || (!loading && !gameDayData)) {
    return (
      <div className="p-4">
        <InlineNotice
          variant="warning"
          title="Round unavailable"
          body="We couldn't open this round. It may have ended, or the link is incorrect."
        />
        <div className="mt-3">
          <Link className="rounded-lg btn-ghost px-4 py-2 text-sm font-medium inline-block" href="/trips">Back to trips</Link>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="container mx-auto max-w-2xl px-4 py-8">
        <div className="rounded-xl border border-border bg-surface p-8 text-center">
          <p className="text-sm text-muted">Loading…</p>
        </div>
      </div>
    );
  }

  // Self-heal: clear persisted active-round keys when gameDayData is null
  useEffect(() => {
    if (!loading && !gameDayData) {
      // Clear any persisted active-round keys
      if (typeof window !== 'undefined') {
        const keysToRemove: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && (key.startsWith('gameday:last:') || key === 'dayforeit:last_mode')) {
            keysToRemove.push(key);
          }
        }
        keysToRemove.forEach(key => localStorage.removeItem(key));
      }
    }
  }, [loading, gameDayData]);

  if (!gameDayData) {
    return (
      <div className="p-4">
        <InlineNotice
          variant="warning"
          title="Round unavailable"
          body="We couldn't open this round. It may have ended, or the link is incorrect."
        />
        <div className="mt-3">
          <Link className="btn-ghost" href="/trips">Back to trips</Link>
        </div>
      </div>
    );
  }

  // Build GameDay context and policy
  const ctx = useMemo(() => {
    if (!gameDayData) return null;
    return resolveGameDayContext({
      round: gameDayData,
      coursePack,
    });
  }, [gameDayData, coursePack]);

  const policy = useMemo(() => {
    if (!ctx || !bootstrapData) return null;
    return buildGameDayPolicy(ctx, bootstrapData);
  }, [ctx, bootstrapData]);

  // Reload flights snapshot
  async function reloadFlightsSnapshot() {
    if (!roundId) return;
    try {
      const snapshotRes = await fetch(`/api/gameday/${roundId}/flights/snapshot`, {
        credentials: "include",
      });
      if (snapshotRes.ok) {
        const snapshotData = await snapshotRes.json();
        if (snapshotData.ok && snapshotData.snapshot) {
          setFlightsSnapshot(snapshotData.snapshot);
        }
      } else {
        setFlightsSnapshot(null);
      }
    } catch (error) {
      console.error("Failed to reload flights snapshot:", error);
      setFlightsSnapshot(null);
    }
  }

  // Open micro-fix (POST to microfix API)
  async function openMicroFix(payload: {
    action: "MOVE_ME" | "ADD_TO_MY_FLIGHT" | "REMOVE_FROM_MY_FLIGHT" | "UNDO";
    targetMemberId?: string;
    toFlightId?: string;
    memberId?: string;
  }): Promise<{
    ok: boolean;
    undo?: { memberId: string; toFlightId: string };
    snapshot?: FlightsSnapshot;
    error?: string;
  }> {
    if (!roundId) {
      return { ok: false, error: "No round ID" };
    }

    try {
      const res = await fetch(`/api/gameday/${roundId}/flights/microfix`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        return {
          ok: false,
          error: typeof data.error === "string" ? data.error : "Failed to update flights",
        };
      }

      return {
        ok: true,
        undo: data.undo,
        snapshot: data.snapshot,
      };
    } catch (error) {
      console.error("Failed to call micro-fix API:", error);
      return {
        ok: false,
        error: error instanceof Error ? error.message : "An error occurred",
      };
    }
  }

  // Define ordered instrument keys
  const gameDayKeys: GameDayInstrumentKey[] = [
    "round_header",
    "setup_course_tee",
    "setup_round",
    "flight_check",
    "in_play_hud",
    "score_entry_premium",
    "round_controls",
    "legacy_rest",
  ];

  // Helper to render an instrument
  function renderInstrument(key: GameDayInstrumentKey) {
    if (!ctx || !policy) return null;
    const def = gamedayRegistry[key];
    if (!def || !def.isAvailable(ctx)) return null;

    const renderProps = {
      ctx,
      policy,
      // Pass through all existing state/handlers for legacy_rest
      gameDayData,
      courses,
      coursePack,
      coursePackError,
      loading,
      activeGroupId,
      currentMemberId,
      canEditStartHole,
      updatingCourse,
      updatingTee,
      managingParticipants,
      startingRound,
      savingScore,
      closingRound,
      publishingRound,
      startHole,
      setStartHole,
      holesToPlay,
      setHolesToPlay,
      selectedParticipant,
      setSelectedParticipant,
      selectedHole,
      setSelectedHole,
      strokes,
      setStrokes,
      draftScores,
      setDraftScores,
      savedScores,
      setSavedScores,
      isSavingHole,
      setIsSavingHole,
      toast,
      setToast,
      undoState,
      setUndoState,
      expandedScoreRows,
      setExpandedScoreRows,
      router,
      roundId,
      searchParams,
      handleCourseSelect,
      handleTeeSelect,
      handleStartRound,
      handleRemoveParticipant,
      handleAddParticipant,
      computeMyTotals,
      handleConfirmHole,
      handleUndo,
      handleCloseRound,
      handlePublishRound,
      setGameDayData,
      flightsSnapshot,
      reloadFlightsSnapshot,
      openMicroFix,
    };

    return (
      <InlineGameDayInstrumentSection
        key={key}
        title={def.title}
        helper={def.helper}
        rightAction={def.RightAction ? <def.RightAction {...renderProps} /> : undefined}
        showDivider={false}
      >
        <def.RenderBody {...renderProps} />
      </InlineGameDayInstrumentSection>
    );
  }

  // Wrap existing JSX in renderLegacy function for legacy_rest instrument
  const renderLegacy = () => {
    return (
      <div className="container mx-auto max-w-2xl px-4 py-8">
      {gameDayData.gameday && gameDayData.gameday.state !== "in_progress" && (
      <div className="rounded-xl border border-border bg-surface p-6 space-y-4">
        <div>
          <div className="text-sm text-muted mb-1">Round #{gameDayData.roundId}</div>
          <div className="text-sm text-muted">
            Status: <span className="capitalize">{gameDayData.status.replace("_", " ")}</span>
          </div>
        </div>

      </div>
      )}

        {gameDayData.gameday && (gameDayData.gameday.state as string) !== "in_progress" && (
        <>
        <div>
          <div className="text-sm text-muted mb-2">Participants</div>
          {gameDayData.participants.length === 0 ? (
            <div className="text-sm text-muted">No participants yet</div>
          ) : (
            <div className="space-y-2">
              {gameDayData.participants.map((p) => (
                <div key={p.id} className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-3 py-2">
                  <span className="text-sm text-foreground">{p.displayName}</span>
                  {currentMemberId && (currentMemberId === p.id || true) && (
                    <button
                      onClick={() => handleRemoveParticipant(p.id)}
                      disabled={managingParticipants}
                      className="text-xs text-muted hover:text-foreground disabled:opacity-50"
                    >
                      Remove
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
          {currentMemberId && (
            <button
              onClick={() => handleAddParticipant(currentMemberId)}
              disabled={managingParticipants || gameDayData.participants.some((p) => p.id === currentMemberId)}
              className="mt-2 text-xs text-anticipation hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {gameDayData.participants.some((p) => p.id === currentMemberId) ? "You're in" : "Add yourself"}
            </button>
          )}
        </div>

        <div className="pt-4 border-t border-border">
          <Link
            href={`/trips/${gameDayData.roundId}`}
            className="block w-full rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground hover:bg-muted/50 text-center"
          >
            Back to trip
          </Link>
        </div>
        </>
        )}
      </div>
    );
  };

  // Render instruments via registry
  if (!ctx || !policy) {
    // Fallback: render legacy if context/policy not ready
    return renderLegacy();
  }

  return (
    <div className="container mx-auto max-w-2xl px-4 py-8">
      {gameDayKeys.map((key) => {
        if (key === "legacy_rest") {
          // Pass renderLegacy to legacy_rest instrument
          const def = gamedayRegistry[key];
          if (!def || !def.isAvailable(ctx)) return null;
          const renderProps = {
            ctx,
            policy,
            renderLegacy,
          };
          return (
            <InlineGameDayInstrumentSection
              key={key}
              title={def.title}
              helper={def.helper}
              rightAction={def.RightAction ? <def.RightAction {...renderProps} /> : undefined}
              showDivider={false}
            >
              <def.RenderBody {...renderProps} />
            </InlineGameDayInstrumentSection>
          );
        }
        return renderInstrument(key);
      })}
    </div>
  );
}
