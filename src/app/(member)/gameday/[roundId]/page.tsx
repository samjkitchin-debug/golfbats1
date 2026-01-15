"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { loadCourses, type Course, loadCoursePack, type CoursePack } from "../../../lib/courseActions";
import Link from "next/link";
import {
  gamedayHole,
  gamedayLanding,
  tripFlightsApi,
  tripFlightStartHoleApi,
  gamedayFlightStartApi,
} from "../../../lib/routes";
import { apiJson } from "../../../lib/apiClient";
import {
  validateFlightsList,
  validateFlightStart,
} from "../../../lib/apiContracts";

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

type FlightSlot = {
  id: string;
  memberId: string;
  memberName: string;
  slotPosition: number;
  isLocked: boolean;
};

type FlightExecutionStatus = "not_started" | "in_progress" | "finished";

type Flight = {
  id: string;
  flightNumber: number;
  executionStatus: FlightExecutionStatus;
  startedAt: string | null;
  finishedAt: string | null;
  startHole: number;
  slots: FlightSlot[];
  isMember: boolean;
};

export default function GameDayPage() {
  const router = useRouter();
  const params = useParams<{ roundId: string }>();
  const searchParams = useSearchParams();
  const roundId = params.roundId;

  const [gameDayData, setGameDayData] = useState<GameDayData | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [coursePack, setCoursePack] = useState<CoursePack | null>(null);
  const [coursePackError, setCoursePackError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [currentMemberId, setCurrentMemberId] = useState<string | null>(null);
  const [canEditStartHole, setCanEditStartHole] = useState(false);
  const [flights, setFlights] = useState<Flight[]>([]);
  const [startingFlightId, setStartingFlightId] = useState<string | null>(null);
  const [updatingCourse, setUpdatingCourse] = useState(false);
  const [updatingTee, setUpdatingTee] = useState(false);
  const [managingParticipants, setManagingParticipants] = useState(false);
  const [startingRound, setStartingRound] = useState(false);
  const [savingScore, setSavingScore] = useState(false);
  const [closingRound, setClosingRound] = useState(false);
  const [publishingRound, setPublishingRound] = useState(false);
  
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
        setActiveGroupId(bootstrap.activeGroupId);
        const memberId: string | null = bootstrap.member?.id || null;
        setCurrentMemberId(memberId);

        // Derive permissions for editing flight start holes
        const isHost = Boolean(bootstrap.isTripHost);
        const isGroupAdmin = Boolean(bootstrap.isGroupAdmin);
        setCanEditStartHole(isHost || isGroupAdmin);

        if (!roundId) {
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
          if (gameDay.ok) {
            setGameDayData(gameDay);
            
            // Initialize start settings from gameDay data
            if (gameDay.gameday?.startHole) {
              setStartHole(gameDay.gameday.startHole);
            }
            if (gameDay.gameday?.holesToPlay) {
              setHolesToPlay(gameDay.gameday.holesToPlay as 9 | 18);
            }
            
            // Conditionally load course pack only if tee_id exists
            if (gameDay.teeId) {
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

            // Load flights for this trip (if any)
            try {
              const flightsJson = await apiJson<unknown>(tripFlightsApi(gameDay.roundId));
              const validated = validateFlightsList(flightsJson);
              const rawFlights = validated.flights;
              const flightsForMember: Flight[] = rawFlights.map((f: any) => {
                const slots: FlightSlot[] = Array.isArray(f.slots) ? f.slots : [];
                const isMember =
                  !!memberId && slots.some((s) => s.memberId === memberId);
                const execStatus: FlightExecutionStatus =
                  f.executionStatus === "in_progress" ||
                  f.executionStatus === "finished"
                    ? f.executionStatus
                    : "not_started";
                return {
                  id: f.id,
                  flightNumber: f.flightNumber,
                  executionStatus: execStatus,
                  startedAt: f.startedAt ?? null,
                  finishedAt: f.finishedAt ?? null,
                  startHole: f.startHole ?? 1,
                  slots,
                  isMember,
                };
              });
              setFlights(flightsForMember);
            } catch (flightsError) {
              console.error("Failed to load flights for GameDay:", flightsError);
              setFlights([]);
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
        throw new Error(error.error || "Failed to update course");
      }

      // Reload GameDay data
      const res = await fetch(`/api/gameday/${roundId}`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        if (data.ok) {
          setGameDayData(data);
          // Reload course pack if tee_id exists
          if (data.teeId) {
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
        throw new Error(error.error || "Failed to update tee");
      }

      // Reload GameDay data
      const res = await fetch(`/api/gameday/${roundId}`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        if (data.ok) {
          setGameDayData(data);
          // Reload course pack if tee_id exists
          if (data.teeId) {
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
        throw new Error(error.error || "Failed to add participant");
      }

      // Reload GameDay data
      const gameDayRes = await fetch(`/api/gameday/${roundId}`, { credentials: "include" });
      if (gameDayRes.ok) {
        const data = await gameDayRes.json();
        if (data.ok) {
          setGameDayData(data);
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
        throw new Error(error.error || "Failed to remove participant");
      }

      // Reload GameDay data
      const gameDayRes = await fetch(`/api/gameday/${roundId}`, { credentials: "include" });
      if (gameDayRes.ok) {
        const data = await gameDayRes.json();
        if (data.ok) {
          setGameDayData(data);
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
        throw new Error(error.error || "Failed to start round");
      }

      // Reload GameDay data
      const gameDayRes = await fetch(`/api/gameday/${roundId}`, { credentials: "include" });
      if (gameDayRes.ok) {
        const data = await gameDayRes.json();
        if (data.ok) {
          setGameDayData(data);
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
        throw new Error(error.error || "Failed to save score");
      }

      const result = await res.json();
      if (result.ok && result.applied > 0) {
        alert("Score saved!");
        // Reset form and reload GameDay data to update cursor
        setStrokes(0);
        const gameDayRes = await fetch(`/api/gameday/${roundId}`, { credentials: "include" });
        if (gameDayRes.ok) {
          const data = await gameDayRes.json();
          if (data.ok) {
            setGameDayData(data);
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
        throw new Error(error.error || "Failed to save scores");
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
          if (data.ok) {
            setGameDayData(data);
            
            // Auto-advance to next hole after delay (600ms)
            const updatedHoleIndex = data.gameday?.currentHoleIndex ?? currentHoleIndexVal;
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
        throw new Error(error.error || "Failed to close round");
      }

      // Reload GameDay data
      const gameDayRes = await fetch(`/api/gameday/${roundId}`, { credentials: "include" });
      if (gameDayRes.ok) {
        const data = await gameDayRes.json();
        if (data.ok) {
          setGameDayData(data);
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
        throw new Error(error.error || "Failed to publish results");
      }

      // Reload GameDay data
      const gameDayRes = await fetch(`/api/gameday/${roundId}`, { credentials: "include" });
      if (gameDayRes.ok) {
        const data = await gameDayRes.json();
        if (data.ok) {
          setGameDayData(data);
        }
      }
    } catch (error) {
      console.error("Failed to publish results:", error);
      alert(error instanceof Error ? error.message : "Failed to publish results");
    } finally {
      setPublishingRound(false);
    }
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

  if (!gameDayData) {
    return (
      <div className="container mx-auto max-w-2xl px-4 py-8">
        <div className="rounded-xl border border-border bg-surface p-8 text-center">
          <p className="text-sm text-muted">Round not found</p>
          <Link href="/" className="mt-4 inline-block text-sm text-brand-green hover:underline">
            Go home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-2xl px-4 py-8">
      {/* Remove header/logo section when in_progress - scoring surface is the hero */}
      {gameDayData.gameday && gameDayData.gameday.state !== "in_progress" && (
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-foreground">In play</h1>
          <p className="mt-2 text-sm text-muted">
            {(() => {
              const course = gameDayData.courseId
                ? courses.find((c) => c.id === gameDayData.courseId)
                : null;
              return course?.name || "Round";
            })()}
          </p>
        </div>
      )}

      {gameDayData.gameday && gameDayData.gameday.state !== "in_progress" && (
      <div className="rounded-xl border border-border bg-surface p-6 space-y-4">
        <div>
          <div className="text-sm text-muted mb-1">Round #{gameDayData.roundId}</div>
          <div className="text-sm text-muted">
            Status: <span className="capitalize">{gameDayData.status.replace("_", " ")}</span>
          </div>
        </div>

        {/* Flights list (execution per flight) */}
        {flights.length > 0 && (
          <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
            <div className="text-sm font-medium text-foreground mb-1">Flights</div>
            <div className="space-y-2">
              {flights.map((flight) => {
                const statusLabel =
                  flight.executionStatus === "in_progress"
                    ? "In progress"
                    : flight.executionStatus === "finished"
                    ? "Finished"
                    : "Not started";

                const statusColor =
                  flight.executionStatus === "in_progress"
                    ? "chip-success"
                    : flight.executionStatus === "finished"
                    ? "bg-muted/30 text-foreground"
                    : "bg-amber-soft text-foreground";

                const memberNames = flight.slots.map((s) => s.memberName).join(", ");

                const handleFlightNavigate = (effectiveHole: number) => {
                  const hole = Math.min(Math.max(effectiveHole, 1), 18);
                  const url =
                    hole && Number.isFinite(hole)
                      ? gamedayHole(roundId, hole)
                      : gamedayLanding(roundId);
                  router.push(url);
                };

                const handleFlightStart = async () => {
                  if (!flight.isMember) return;
                  if (!roundId) return;
                  setStartingFlightId(flight.id);
                  try {
                    try {
                      const data = await apiJson(gamedayFlightStartApi(), {
                        method: "POST",
                        body: JSON.stringify({ flightId: flight.id }),
                      });
                      validateFlightStart(data);
                    } catch (error) {
                      // If 409 flight_finished, still refresh GameDay data
                      if (error instanceof Error && error.message.includes("409")) {
                        try {
                          const res = await fetch(gamedayFlightStartApi(), {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            credentials: "include",
                            body: JSON.stringify({ flightId: flight.id }),
                          });
                          if (res.status === 409) {
                            const data = await res.json().catch(() => ({}));
                            if (data.reason === "flight_finished") {
                              // Flight already finished; just refresh GameDay data
                              const gameDayRes = await fetch(`/api/gameday/${roundId}`, {
                                credentials: "include",
                              });
                              if (gameDayRes.ok) {
                                const gameDay = await gameDayRes.json();
                                if (gameDay.ok) {
                                  setGameDayData(gameDay);
                                }
                              }
                              return;
                            }
                          }
                        } catch {
                          // Fall through to error handling
                        }
                      }
                      throw error;
                    }

                    // Refresh GameDay + flights after starting
                    const [gameDayRes, flightsJson] = await Promise.all([
                      fetch(`/api/gameday/${roundId}`, { credentials: "include" }),
                      apiJson<unknown>(tripFlightsApi(gameDayData.roundId)),
                    ]);

                    if (gameDayRes.ok) {
                      const gameDay = await gameDayRes.json();
                      if (gameDay.ok) {
                        setGameDayData(gameDay);
                      }
                    }

                    const validated = validateFlightsList(flightsJson);
                    const rawFlights = validated.flights;
                    const memberId = currentMemberId;
                    const updatedFlights: Flight[] = rawFlights.map((f: any) => {
                      const slots: FlightSlot[] = Array.isArray(f.slots) ? f.slots : [];
                      const isMember =
                        !!memberId && slots.some((s) => s.memberId === memberId);
                      const execStatus: FlightExecutionStatus =
                        f.executionStatus === "in_progress" ||
                        f.executionStatus === "finished"
                          ? f.executionStatus
                          : "not_started";
                      return {
                        id: f.id,
                        flightNumber: f.flightNumber,
                        executionStatus: execStatus,
                        startedAt: f.startedAt ?? null,
                        finishedAt: f.finishedAt ?? null,
                        startHole: f.startHole ?? 1,
                        slots,
                        isMember,
                      };
                    });
                    setFlights(updatedFlights);

                    // Determine hole to navigate to: use last known hole if available, else flight.startHole
                    let holeToUse = flight.startHole ?? 1;
                    try {
                      const lastHoleKey = `gameday:last:${roundId}`;
                      const raw = typeof window !== "undefined" ? localStorage.getItem(lastHoleKey) : null;
                      if (raw) {
                        const parsed = JSON.parse(raw);
                        if (
                          parsed &&
                          typeof parsed.holeNumber === "number" &&
                          parsed.holeNumber >= 1 &&
                          parsed.holeNumber <= 18
                        ) {
                          holeToUse = parsed.holeNumber;
                        }
                      }
                    } catch {
                      // Ignore localStorage errors
                    }

                    handleFlightNavigate(holeToUse);
                  } catch (error) {
                    console.error("Failed to start flight:", error);
                    alert(
                      error instanceof Error
                        ? error.message
                        : "Failed to start flight. Please try again."
                    );
                  } finally {
                    setStartingFlightId(null);
                  }
                };

                const handleFlightResume = () => {
                  if (!flight.isMember) return;
                  // Determine last known hole, else default to flight.startHole
                  let holeToUse = flight.startHole ?? 1;
                  try {
                    const lastHoleKey = `gameday:last:${roundId}`;
                    const raw = typeof window !== "undefined" ? localStorage.getItem(lastHoleKey) : null;
                    if (raw) {
                      const parsed = JSON.parse(raw);
                      if (
                        parsed &&
                        typeof parsed.holeNumber === "number" &&
                        parsed.holeNumber >= 1 &&
                        parsed.holeNumber <= 18
                      ) {
                        holeToUse = parsed.holeNumber;
                      }
                    }
                  } catch {
                    // Ignore localStorage errors
                  }
                  handleFlightNavigate(holeToUse);
                };

                const isStartingThisFlight = startingFlightId === flight.id;

                return (
                  <div
                    key={flight.id}
                    className="flex items-center justify-between rounded-md border border-border bg-surface px-3 py-2"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground">
                          Flight {flight.flightNumber}
                        </span>
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${statusColor}`}
                        >
                          {statusLabel}
                        </span>
                      </div>
                      {memberNames && (
                        <div className="text-xs text-muted">
                          {flight.isMember ? "Your flight: " : "Players: "}
                          {memberNames}
                        </div>
                      )}

                      {/* Start hole display / editor */}
                      {canEditStartHole && flight.executionStatus !== "finished" ? (
                        <div className="flex items-center gap-2 text-xs text-muted">
                          <span>Start hole</span>
                          <select
                            value={flight.startHole}
                            onChange={async (e) => {
                              const newHole = parseInt(e.target.value, 10);
                              if (Number.isNaN(newHole)) return;

                              const prevHole = flight.startHole;

                              // Optimistic update
                              setFlights((prev) =>
                                prev.map((f) =>
                                  f.id === flight.id ? { ...f, startHole: newHole } : f
                                )
                              );

                              try {
                                const res = await fetch(
                                  tripFlightStartHoleApi(gameDayData.roundId, flight.id),
                                  {
                                    method: "PATCH",
                                    headers: { "Content-Type": "application/json" },
                                    credentials: "include",
                                    body: JSON.stringify({ startHole: newHole }),
                                  }
                                );

                                if (!res.ok) {
                                  // Revert on error
                                  setFlights((prev) =>
                                    prev.map((f) =>
                                      f.id === flight.id ? { ...f, startHole: prevHole } : f
                                    )
                                  );
                                  alert("Couldn't update start hole");
                                }
                              } catch (error) {
                                console.error("Failed to update start hole:", error);
                                // Revert on error
                                setFlights((prev) =>
                                  prev.map((f) =>
                                    f.id === flight.id ? { ...f, startHole: prevHole } : f
                                  )
                                );
                                alert("Couldn't update start hole");
                              }
                            }}
                            className="rounded border border-border bg-surface px-2 py-1 text-xs text-foreground"
                          >
                            {Array.from({ length: 18 }, (_, i) => i + 1).map((hole) => (
                              <option key={hole} value={hole}>
                                {hole}
                              </option>
                            ))}
                          </select>
                        </div>
                      ) : (
                        <div className="text-xs text-muted">
                          Start hole {flight.startHole}
                        </div>
                      )}
                    </div>

                    {/* CTA for flights where the current member is assigned */}
                    {flight.isMember ? (
                      flight.executionStatus === "not_started" ? (
                        <button
                          type="button"
                          onClick={handleFlightStart}
                          disabled={isStartingThisFlight}
                          className="ml-3 rounded-lg btn-anticipation px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isStartingThisFlight ? "Starting…" : "Start scoring"}
                        </button>
                      ) : flight.executionStatus === "in_progress" ? (
                        <button
                          type="button"
                          onClick={handleFlightResume}
                          className="ml-3 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-background"
                        >
                          Resume
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled
                          className="ml-3 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-muted cursor-not-allowed"
                        >
                          View
                        </button>
                      )
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Course pack summary (if loaded) - only show when not in_progress */}
        {coursePack && gameDayData.gameday && (gameDayData.gameday.state as string) !== "in_progress" && (
          <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-2">
            <div className="text-sm font-medium text-foreground">{coursePack.course.name}</div>
            <div className="text-xs text-muted">
              {coursePack.tee.label} · Par {coursePack.tee.par} · Slope {coursePack.tee.slope}
              {coursePack.tee.rating !== null && ` · Rating ${coursePack.tee.rating}`}
            </div>
            <div className="text-xs text-muted">{coursePack.holes.length} holes loaded</div>
          </div>
        )}

        {/* Course selected - show course name - only show when not in_progress */}
        {gameDayData.courseId && gameDayData.gameday && (gameDayData.gameday.state as string) !== "in_progress" && (
          <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
            <div>
              <div className="text-sm font-medium text-foreground mb-1">
                {(() => {
                  const selectedCourse = courses.find((c) => c.id === gameDayData.courseId);
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
                    const selectedCourse = courses.find((c) => c.id === gameDayData.courseId);
                    const tees = selectedCourse?.tees ?? [];
                    return tees.map((tee) => (
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
                    const selectedCourse = courses.find((c) => c.id === gameDayData.courseId);
                    const selectedTee = selectedCourse?.tees.find((t) => t.id === gameDayData.teeId);
                    return selectedTee?.label || "Tee selected";
                  })()}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Round setup and Start round button - only show when not in_progress */}
        {gameDayData.teeId && gameDayData.gameday?.state === "not_started" && (
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
                          ? "btn-anticipation text-white border-brand-amber"
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
                          ? "btn-anticipation text-white border-brand-amber"
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
                  className="w-full rounded-lg btn-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {startingRound ? "Starting…" : "Start round"}
            </button>
          </div>
        )}
      </div>
      )}

        {/* Premium scoring UI (when in_progress) */}
        {gameDayData.gameday?.state === "in_progress" && (() => {
          const startHoleVal = gameDayData.gameday?.startHole ?? 1;
          const holesToPlayVal = (gameDayData.gameday?.holesToPlay ?? 18) as 9 | 18;
          const currentHoleIndexVal = gameDayData.gameday?.currentHoleIndex ?? 0;
          const playOrder = buildPlayOrder(startHoleVal, holesToPlayVal);
          const currentHoleNumber = playOrder[currentHoleIndexVal] ?? playOrder[0] ?? 1;
          
          const canGoPrev = currentHoleIndexVal > 0;
          const canGoNext = currentHoleIndexVal < playOrder.length - 1;
          
          // Get current hole info from coursePack
          const currentHoleInfo = coursePack?.holes.find((h) => h.holeNumber === currentHoleNumber);
          const holePar = currentHoleInfo?.par ?? null;
          const holeSI = currentHoleInfo?.strokeIndex ?? null;
          const teeLabel = coursePack?.tee.label ?? null;
          const courseName = coursePack?.course.name ?? null;
          
          // Get next hole info
          const nextHoleIndex = currentHoleIndexVal + 1;
          const nextHoleNumber = nextHoleIndex < playOrder.length ? playOrder[nextHoleIndex] : null;
          const nextHoleInfo = nextHoleNumber ? coursePack?.holes.find((h) => h.holeNumber === nextHoleNumber) : null;
          const nextHolePar = nextHoleInfo?.par ?? null;
          
          // Compute my totals
          const myTotals = computeMyTotals(playOrder, currentHoleIndexVal, coursePack);
          const myToParSigned = myTotals.toPar === null 
            ? "—" 
            : myTotals.toPar === 0 
              ? "E" 
              : myTotals.toPar > 0 
                ? `+${myTotals.toPar}` 
                : `${myTotals.toPar}`;
          
          // Check if there are changes or existing scores to confirm
          const hasChanges = gameDayData.participants.some((p) => {
            const draft = draftScores[p.id];
            const saved = savedScores[p.id]?.[currentHoleNumber];
            return draft !== null && draft !== saved;
          });
          const hasExistingScores = gameDayData.participants.some((p) => {
            return savedScores[p.id]?.[currentHoleNumber] !== undefined;
          });
          const canConfirm = hasChanges || hasExistingScores;
          
          return (
            <>
              {/* In-Round HUD */}
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

              {/* Quick-tap scorecard strip */}
              <div className="space-y-4 mb-6">
                {gameDayData.participants.map((participant) => {
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
                                  ? "bg-brand-green text-white"
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
                                  ? "bg-brand-green text-white"
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
                      className="text-sm font-medium text-brand-green hover:underline"
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
                  className="w-full rounded-lg btn-anticipation px-4 py-3 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
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
                      const newIndex = currentHoleIndexVal - 1;
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
                          if (data.ok) {
                            setGameDayData(data);
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
                      const newIndex = currentHoleIndexVal + 1;
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
                          if (data.ok) {
                            setGameDayData(data);
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
        })()}

        {/* Publish results CTA (when closed) */}
        {gameDayData.gameday?.state === "closed" && (
          <div className="rounded-lg border border-border bg-muted/30 p-4">
            <button
              onClick={handlePublishRound}
              disabled={publishingRound}
                  className="w-full rounded-lg btn-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {publishingRound ? "Publishing…" : "Publish results"}
            </button>
          </div>
        )}

        {/* Published state (when published) */}
        {gameDayData.gameday?.state === "published" && (
          <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-foreground">Published</div>
                {gameDayData.gameday.publishedAt && (
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
        )}

        {!gameDayData.courseId && (
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
        )}

        {gameDayData.courseId && gameDayData.gameday && (gameDayData.gameday.state as string) !== "in_progress" && (
          <div>
            <div className="text-sm text-muted mb-1">Course</div>
            <div className="text-sm text-foreground">
              {courses.find((c) => c.id === gameDayData.courseId)?.name || "Course selected"}
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
              className="mt-2 text-xs text-brand-green hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
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
}
