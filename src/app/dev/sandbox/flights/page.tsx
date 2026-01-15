"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";

type Player = {
  id: string;
  name: string;
  handicap: number;
  quartile: number;
};

type Flight = {
  id: string;
  index: number;
  players: Player[];
  isManual: boolean;
};

// Simple LCG PRNG
class PRNG {
  private seed: number;

  constructor(seed: number) {
    this.seed = seed;
  }

  next(): number {
    this.seed = (this.seed * 1664525 + 1013904223) % 2 ** 32;
    return this.seed / 2 ** 32;
  }

  nextInt(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  nextFloat(min: number, max: number): number {
    return this.next() * (max - min) + min;
  }
}

const firstNames = [
  "Alex", "Jordan", "Sam", "Taylor", "Casey", "Morgan", "Riley", "Avery",
  "Cameron", "Dakota", "Quinn", "Sage", "River", "Phoenix", "Blake", "Hayden",
  "Jamie", "Reese", "Rowan", "Skyler", "Finley", "Emery", "Drew", "Kai",
  "Noah", "Liam", "Emma", "Olivia", "James", "William", "Benjamin", "Henry",
  "Charlotte", "Amelia", "Sophia", "Isabella", "Mason", "Ethan", "Lucas", "Alexander"
];

const lastNames = [
  "Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis",
  "Rodriguez", "Martinez", "Hernandez", "Lopez", "Wilson", "Anderson", "Thomas", "Taylor",
  "Moore", "Jackson", "Martin", "Lee", "Thompson", "White", "Harris", "Sanchez",
  "Clark", "Ramirez", "Lewis", "Robinson", "Walker", "Young", "Allen", "King",
  "Wright", "Scott", "Torres", "Nguyen", "Hill", "Flores", "Green", "Adams"
];

function generatePlayers(seed: number, count: number): Player[] {
  const rng = new PRNG(seed);
  const players: Player[] = [];

  for (let i = 0; i < count; i++) {
    const firstName = firstNames[rng.nextInt(0, firstNames.length - 1)];
    const lastName = lastNames[rng.nextInt(0, lastNames.length - 1)];
    const name = `${firstName} ${lastName}`;

    // Generate handicap with 3 clusters covering 1.0-36.0
    const cluster = rng.nextInt(0, 2);
    let handicap: number;
    
    // Approximate gaussian using sum of uniforms
    const u1 = rng.next();
    const u2 = rng.next();
    const u3 = rng.next();
    const u4 = rng.next();
    const u5 = rng.next();
    const u6 = rng.next();
    const g = (u1 + u2 + u3 + u4 + u5 + u6) - 3; // roughly normal-ish, centered at 0
    
    if (cluster === 0) {
      // Low handicap cluster: mean ~7, spread ~4 (range ~1-15)
      handicap = 7 + g * 4;
    } else if (cluster === 1) {
      // Mid handicap cluster: mean ~16, spread ~5 (range ~6-26)
      handicap = 16 + g * 5;
    } else {
      // High handicap cluster: mean ~27, spread ~6 (range ~15-36)
      handicap = 27 + g * 6;
    }

    // Clamp to [1, 36] and round to 1 decimal
    handicap = Math.max(1.0, Math.min(36.0, handicap));
    handicap = Math.round(handicap * 10) / 10;

    players.push({
      id: `player-${i}`,
      name,
      handicap,
      quartile: 0, // Will be set during quartile calculation
    });
  }

  // Sort by handicap ascending
  players.sort((a, b) => a.handicap - b.handicap);

  // Assign quartiles
  const quartileSize = Math.ceil(players.length / 4);
  players.forEach((player, index) => {
    player.quartile = Math.floor(index / quartileSize) + 1;
  });

  return players;
}

// Quartile-based flight generation (packed to 4s)
function quartileDealAndPack(players: Player[]): Flight[] {
  if (players.length === 0) return [];

  // Re-sort and re-assign quartiles for the remaining players
  const sorted = [...players].sort((a, b) => a.handicap - b.handicap);
  const quartileSize = Math.ceil(sorted.length / 4);
  sorted.forEach((player, index) => {
    player.quartile = Math.floor(index / quartileSize) + 1;
  });

  // Split into quartiles
  const quartiles: Player[][] = [[], [], [], []];
  sorted.forEach((player) => {
    quartiles[player.quartile - 1].push(player);
  });

  const flights: Flight[] = [];
  const maxFlightSize = 4;
  let flightIndex = 0;
  let quartileIndices = [0, 0, 0, 0];

  // Pack flights to 4s: fill each flight fully before creating next
  while (true) {
    const flight: Flight = {
      id: `flight-auto-${flightIndex}`,
      index: flightIndex,
      players: [],
      isManual: false,
    };

    // Add one from each quartile if available, until flight is full
    let addedAny = false;
    while (flight.players.length < maxFlightSize) {
      let addedThisRound = false;
      for (let q = 0; q < 4; q++) {
        if (quartileIndices[q] < quartiles[q].length && flight.players.length < maxFlightSize) {
          flight.players.push(quartiles[q][quartileIndices[q]]);
          quartileIndices[q]++;
          addedAny = true;
          addedThisRound = true;
        }
      }
      if (!addedThisRound) break; // No more players available
    }

    if (flight.players.length > 0) {
      flights.push(flight);
      flightIndex++;
    }

    // Check if all distributed
    if (!addedAny || quartileIndices.every((idx, q) => idx >= quartiles[q].length)) {
      break;
    }
  }

  return flights;
}

// Post-process to ensure no automatic flight is smaller than 3 players
function enforceMinAutoFlightSize(flights: Flight[]): Flight[] {
  if (flights.length === 0) return flights;
  
  // Find the last automatic flight
  let lastAutoFlight: Flight | null = null;
  let lastAutoIndex = -1;
  
  for (let i = flights.length - 1; i >= 0; i--) {
    if (!flights[i].isManual) {
      lastAutoFlight = flights[i];
      lastAutoIndex = i;
      break;
    }
  }
  
  if (!lastAutoFlight) {
    // No automatic flights to process
    return flights;
  }
  
  const lastSize = lastAutoFlight.players.length;
  
  // Only fix if last auto flight is size 1 or 2
  if (lastSize >= 3) return flights;
  
  // Calculate how many players we need to move
  const needed = 3 - lastSize; // 1 if lastSize=2, 2 if lastSize=1
  
  // Step 1: Try to find a previous automatic flight that can donate while staying >= 3
  let donorFlight: Flight | null = null;
  let donorIndex = -1;
  
  for (let i = lastAutoIndex - 1; i >= 0; i--) {
    if (!flights[i].isManual) {
      const candidateSize = flights[i].players.length;
      if (candidateSize - needed >= 3) {
        // This automatic flight can donate while staying >= 3
        donorFlight = flights[i];
        donorIndex = i;
        break;
      }
    }
  }
  
  // Step 2: If no suitable automatic donor found, look for ANY flight (manual or automatic)
  // Prefer size 4 flights, but accept any flight that can donate while staying >= 3
  if (!donorFlight) {
    let bestDonor: Flight | null = null;
    let bestDonorIndex = -1;
    let bestSize = 0;
    
    for (let i = lastAutoIndex - 1; i >= 0; i--) {
      const candidateSize = flights[i].players.length;
      // Must be able to donate while staying >= 3
      if (candidateSize - needed >= 3) {
        // Prefer size 4 flights, but accept any suitable flight
        if (!bestDonor || candidateSize === 4 || (bestSize !== 4 && candidateSize > bestSize)) {
          bestDonor = flights[i];
          bestDonorIndex = i;
          bestSize = candidateSize;
          // If we found a size 4, that's perfect - stop searching
          if (candidateSize === 4) {
            break;
          }
        }
      }
    }
    
    donorFlight = bestDonor;
    donorIndex = bestDonorIndex;
  }
  
  if (!donorFlight) {
    // No suitable donor found - cannot fix without breaking constraints
    return flights;
  }
  
  // Move players from donor to last flight
  // Note: We do NOT change donor.isManual status - if it was manual, it stays manual
  const playersToMove = donorFlight.players.splice(-needed, needed);
  lastAutoFlight.players.push(...playersToMove);
  
  return flights;
}

function generateFlights(players: Player[], seed: number): Flight[] {
  const flights = quartileDealAndPack(players);
  // Enforce minimum auto flight size of 3
  enforceMinAutoFlightSize(flights);

  // Force ugly edge case: ensure final flight has 2-3 players OR multiple from same quartile
  const lastFlight = flights[flights.length - 1];
  if (lastFlight && lastFlight.players.length >= 4) {
    // Move one player from last flight to second-to-last if possible
    if (flights.length >= 2) {
      const secondLast = flights[flights.length - 2];
      if (secondLast.players.length < 4) {
        const moved = lastFlight.players.pop()!;
        secondLast.players.push(moved);
      }
    }
  }

  // Also ensure at least one flight has 2+ players from same quartile
  let hasSameQuartile = false;
  for (const flight of flights) {
    const quartileCounts: Record<number, number> = {};
    flight.players.forEach((p) => {
      quartileCounts[p.quartile] = (quartileCounts[p.quartile] || 0) + 1;
    });
    if (Object.values(quartileCounts).some((count) => count >= 2)) {
      hasSameQuartile = true;
      break;
    }
  }

  if (!hasSameQuartile && flights.length >= 2) {
    // Swap two players from different flights to create same-quartile situation
    const flight1 = flights[0];
    const flight2 = flights[1];
    if (flight1.players.length > 0 && flight2.players.length > 0) {
      const p1 = flight1.players[0];
      const sameQuartilePlayer = flight2.players.find((p) => p.quartile === p1.quartile);
      if (sameQuartilePlayer && flight1.players.length < 4) {
        const index = flight2.players.indexOf(sameQuartilePlayer);
        flight2.players.splice(index, 1);
        flight1.players.push(sameQuartilePlayer);
      }
    }
  }

  // Ensure all flights start as automated (not manual)
  // No pre-touch edits - start with 0 Edited flights
  flights.forEach((flight) => {
    flight.isManual = false;
  });

  return flights;
}

// Full remainder recompute: freeze manual flights, rebuild automated from remaining players
function recomputeFromRemainder(flights: Flight[], seededN: number, displacedPlayers: Player[] = []): Flight[] {
  // Pre-recompute validation: collect all player IDs (including displaced players)
  const allPlayerIdsBefore = new Set<string>();
  flights.forEach((flight) => {
    flight.players.forEach((p) => {
      if (allPlayerIdsBefore.has(p.id)) {
        console.error(`[Sandbox] Pre-recompute: Duplicate player ID ${p.id}`);
      }
      allPlayerIdsBefore.add(p.id);
    });
  });
  // Include displaced players in the count
  displacedPlayers.forEach((p) => {
    if (allPlayerIdsBefore.has(p.id)) {
      console.error(`[Sandbox] Pre-recompute: Displaced player ${p.id} already in flights`);
    }
    allPlayerIdsBefore.add(p.id);
  });
  const totalBefore = allPlayerIdsBefore.size;
  if (totalBefore !== seededN) {
    console.error(`[Sandbox] Pre-recompute player count mismatch: ${totalBefore} !== ${seededN}`, {
      stage: "pre-recompute",
      expected: seededN,
      actual: totalBefore,
      inFlights: flights.reduce((sum, f) => sum + f.players.length, 0),
      displaced: displacedPlayers.length,
      allIds: Array.from(allPlayerIdsBefore).sort(),
    });
  }

  // Identify manual flights and collect their player IDs
  const manualFlights: Flight[] = [];
  const manualPlayerIds = new Set<string>();
  
  flights.forEach((flight) => {
    if (flight.isManual) {
      manualFlights.push(flight);
      flight.players.forEach((p) => manualPlayerIds.add(p.id));
    }
  });

  // Collect all remaining players (not in manual flights) + displaced players
  const remainingPlayers: Player[] = [...displacedPlayers];
  flights.forEach((flight) => {
    if (!flight.isManual) {
      flight.players.forEach((player) => {
        if (!manualPlayerIds.has(player.id)) {
          remainingPlayers.push(player);
        }
      });
    }
  });

  // Validate remaining players
  const remainingIds = new Set(remainingPlayers.map((p) => p.id));
  if (remainingIds.size !== remainingPlayers.length) {
    console.error(`[Sandbox] Duplicate players in remaining pool`);
  }
  const expectedRemaining = seededN - manualPlayerIds.size;
  if (remainingPlayers.length !== expectedRemaining) {
    console.error(`[Sandbox] Remaining players count mismatch: ${remainingPlayers.length} !== ${expectedRemaining}`, {
      stage: "remaining-pool",
      expected: expectedRemaining,
      actual: remainingPlayers.length,
      manualCount: manualPlayerIds.size,
    });
  }

  // Rebuild automated flights from remaining players
  // IMPORTANT: quartileDealAndPack creates flights with isManual = false (never sets isManual = true)
  const newAutoFlights = quartileDealAndPack(remainingPlayers);
  // Enforce minimum auto flight size of 3
  enforceMinAutoFlightSize(newAutoFlights);

  // Stitch: preserve manual flights in place, replace auto flight slots
  const result: Flight[] = [];
  let autoFlightIndex = 0;
  let globalIndex = 0;

  // First pass: preserve manual flights in their positions
  flights.forEach((flight) => {
    if (flight.isManual) {
      result.push({
        ...flight,
        index: globalIndex++,
      });
    } else {
      // This is an auto flight slot - replace with rebuilt auto flight if available
      if (autoFlightIndex < newAutoFlights.length) {
        // Preserve the original flight's ID to avoid duplicate keys
        result.push({
          ...newAutoFlights[autoFlightIndex],
          id: flight.id, // Preserve original ID
          index: globalIndex++,
        });
        autoFlightIndex++;
      }
      // If no more auto flights, skip this slot (will be removed)
    }
  });

  // Append any additional auto flights if we have more than original auto slots
  // Generate unique IDs for new flights
  let newFlightIdCounter = 0;
  while (autoFlightIndex < newAutoFlights.length) {
    // Generate a unique ID that doesn't conflict with existing flights
    let newId = `flight-auto-${Date.now()}-${newFlightIdCounter++}`;
    // Ensure it's unique by checking against existing IDs
    while (flights.some((f) => f.id === newId) || result.some((f) => f.id === newId)) {
      newId = `flight-auto-${Date.now()}-${newFlightIdCounter++}`;
    }
    result.push({
      ...newAutoFlights[autoFlightIndex],
      id: newId,
      index: globalIndex++,
    });
    autoFlightIndex++;
  }

  // Dev-only guard: verify recomputeFromRemainder never sets isManual on new flights
  const manualFlightsBefore = flights.filter((f) => f.isManual).length;
  const manualFlightsAfter = result.filter((f) => f.isManual).length;
  if (manualFlightsAfter > manualFlightsBefore) {
    console.warn(`[Sandbox] recomputeFromRemainder created manual flights! Before: ${manualFlightsBefore}, After: ${manualFlightsAfter}`);
  }

  // Post-recompute validation
  const allPlayerIdsAfter = new Set<string>();
  result.forEach((flight) => {
    flight.players.forEach((p) => {
      if (allPlayerIdsAfter.has(p.id)) {
        console.error(`[Sandbox] Post-recompute: Duplicate player ID ${p.id}`);
      }
      allPlayerIdsAfter.add(p.id);
    });
  });
  const totalAfter = allPlayerIdsAfter.size;
  if (totalAfter !== seededN) {
    console.error(`[Sandbox] Post-recompute player count mismatch: ${totalAfter} !== ${seededN}`, {
      stage: "post-recompute",
      expected: seededN,
      actual: totalAfter,
      inFlights: result.reduce((sum, f) => sum + f.players.length, 0),
      allIds: Array.from(allPlayerIdsAfter).sort(),
      missingIds: Array.from(allPlayerIdsBefore).filter((id) => !allPlayerIdsAfter.has(id)),
      extraIds: Array.from(allPlayerIdsAfter).filter((id) => !allPlayerIdsBefore.has(id)),
    });
  }

  // Check automated partial flights: should be at most one at the end
  const autoFlights = result.filter((f) => !f.isManual);
  const partialAutoFlights = autoFlights.filter((f) => f.players.length < 4);
  if (partialAutoFlights.length > 1) {
    console.warn(`[Sandbox] Multiple partial automated flights: ${partialAutoFlights.length}`);
  }

  return result;
}

export default function FlightsSandboxPage() {
  const router = useRouter();
  const [seed, setSeed] = useState<number>(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("DFI_SANDBOX_SEED");
      if (stored) return parseInt(stored, 10);
    }
    return Date.now();
  });
  const [playerCount, setPlayerCount] = useState<number>(0);
  const [flights, setFlights] = useState<Flight[]>([]);
  const [dragging, setDragging] = useState(false);
  const [displacedPlayerName, setDisplacedPlayerName] = useState<string | null>(null);
  const [draggedPlayerId, setDraggedPlayerId] = useState<string | null>(null);
  const [dragSource, setDragSource] = useState<{ flightId: string; playerIndex: number } | null>(null);
  const [pointerDragState, setPointerDragState] = useState<{
    playerId: string;
    flightId: string;
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
    pointerType: string;
  } | null>(null);
  const [pointerOverTarget, setPointerOverTarget] = useState<string | null>(null);
  const dragArmedRef = useRef<boolean>(false);
  const overTargetRef = useRef<{ type: "player" | "empty"; flightId: string; playerId?: string; slotIndex?: number } | null>(null);
  const dragRef = useRef<{ playerId: string; flightId: string; playerIndex: number; pointerId: number } | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showExportMessage, setShowExportMessage] = useState(false);
  const [isRecomputing, setIsRecomputing] = useState(false);
  const [recentDrop, setRecentDrop] = useState<null | { flightId: string; playerId?: string; ts: number }>(null);
  const isFirstRender = useRef(true);

  // Initialize sandbox
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("DFI_SANDBOX_SEED", String(seed));
    }

    // Reset first-render flag on seed change (reload)
    isFirstRender.current = true;

    const rng = new PRNG(seed);
    const count = rng.nextInt(50, 70);
    setPlayerCount(count);

    const players = generatePlayers(seed, count);
    const initialFlights = generateFlights(players, seed);
    setFlights(initialFlights);
  }, [seed]);

  // Auto-clear recentDrop animation after ~200ms
  useEffect(() => {
    if (recentDrop?.ts) {
      const timeout = setTimeout(() => {
        setRecentDrop(null);
      }, 200);
      return () => clearTimeout(timeout);
    }
  }, [recentDrop?.ts]);

  const handleReload = useCallback(() => {
    // Generate new seed and reload
    const newSeed = Date.now();
    setSeed(newSeed);
  }, []);

  // Place handler removed - no longer needed with displacement model

  // Drop handler - must be defined before pointer handlers
  const handleDrop = useCallback(
    (targetPlayerId: string, targetFlightId: string, override?: { draggedPlayerId: string; sourceFlightId: string; sourceIndex: number; targetFlightId: string; targetPlayerId: string } | null) => {
      console.log("[DROP] handleDrop entry", {
        draggedPlayerId: override?.draggedPlayerId ?? draggedPlayerId,
        sourceFlightId: override?.sourceFlightId ?? dragSource?.flightId,
        sourceIndex: override?.sourceIndex ?? dragSource?.playerIndex,
        targetFlightId: override?.targetFlightId ?? targetFlightId,
        targetPlayerId: override?.targetPlayerId ?? targetPlayerId,
      });

      // Use override values if provided, otherwise use closure state
      const activeTargetFlightId = override?.targetFlightId ?? targetFlightId;
      const activeTargetPlayerId = override?.targetPlayerId ?? targetPlayerId;
      const activeDraggedPlayerId = override?.draggedPlayerId ?? draggedPlayerId;
      const activeSourceFlightId = override?.sourceFlightId ?? dragSource?.flightId;
      const activeSourceIndex = override?.sourceIndex ?? dragSource?.playerIndex;

      // Detect empty slot drop (targetPlayerId is empty string)
      const isEmptySlotDrop = !activeTargetPlayerId || activeTargetPlayerId === "";

      // Validate all required IDs are present (targetPlayerId not required for empty slot)
      if (!activeDraggedPlayerId || !activeSourceFlightId || activeSourceIndex === undefined || !activeTargetFlightId || (!isEmptySlotDrop && !activeTargetPlayerId)) {
        console.log("[DROP] abort: missing ids", {
          draggedPlayerId: activeDraggedPlayerId,
          sourceFlightId: activeSourceFlightId,
          sourceIndex: activeSourceIndex,
          targetFlightId: activeTargetFlightId,
          targetPlayerId: activeTargetPlayerId,
          isEmptySlotDrop,
        });
        // State will be cleared by finalizeDropFromRefs
        return;
      }

      // Validate drop target first (before any mutations)
      const targetFlight = flights.find((f) => f.id === activeTargetFlightId);
      if (!targetFlight) {
        console.log("[DROP] abort: target flight not found", { targetFlightId: activeTargetFlightId });
        // State will be cleared by finalizeDropFromRefs
        return;
      }

      // For empty slot drops, validate target flight is manual and has space
      if (isEmptySlotDrop) {
        if (!targetFlight.isManual) {
          console.log("[DROP] abort: empty slot drop on non-manual flight", { targetFlightId: activeTargetFlightId });
          // State will be cleared by finalizeDropFromRefs
          return;
        }
        if (targetFlight.players.length >= 4) {
          console.log("[DROP] abort: empty slot drop on full flight", { targetFlightId: activeTargetFlightId, playerCount: targetFlight.players.length });
          // State will be cleared by finalizeDropFromRefs
          return;
        }
      } else {
        // For player swaps, validate target player exists
        const targetPlayerIndex = targetFlight.players.findIndex((p) => p.id === activeTargetPlayerId);
        if (targetPlayerIndex === -1) {
          console.log("[DROP] abort: target player not in target", { targetPlayerId: activeTargetPlayerId, targetFlightId: activeTargetFlightId });
          // State will be cleared by finalizeDropFromRefs
          return;
        }

        // Prevent self-drop
        if (activeSourceFlightId === activeTargetFlightId && activeDraggedPlayerId === activeTargetPlayerId) {
          console.log("[DROP] abort: self drop", { sourceFlightId: activeSourceFlightId, targetFlightId: activeTargetFlightId, playerId: activeDraggedPlayerId });
          // State will be cleared by finalizeDropFromRefs
          return;
        }
      }

      // Now we have a valid drop target - proceed with mutations
      const newFlights = flights.map((f) => ({
        ...f,
        players: [...f.players],
      }));

      // Find source flight and validate
      const sourceFlight = newFlights.find((f) => f.id === activeSourceFlightId);
      if (!sourceFlight) {
        console.log("[DROP] abort: source flight not found", { sourceFlightId: activeSourceFlightId });
        // State will be cleared by finalizeDropFromRefs
        return;
      }

      // Validate source player still exists at expected index
      if (sourceFlight.players[activeSourceIndex]?.id !== activeDraggedPlayerId) {
        console.log("[DROP] abort: dragged player not in source", {
          expectedId: activeDraggedPlayerId,
          expectedIndex: activeSourceIndex,
          actualId: sourceFlight.players[activeSourceIndex]?.id,
          sourceFlightId: activeSourceFlightId,
        });
        // State will be cleared by finalizeDropFromRefs
        return;
      }

      console.log("[DROP] applying mutation", { isEmptySlotDrop });

      // All validations passed - perform mutation
      const draggedPlayer = sourceFlight.players[activeSourceIndex];
      const updatedTargetFlight = newFlights.find((f) => f.id === activeTargetFlightId)!;
      
      // Remove dragged player from source (only after confirming valid drop)
      sourceFlight.players.splice(activeSourceIndex, 1);
      // Source flight does NOT become manual

      if (isEmptySlotDrop) {
        // Empty slot insert: append to target flight (no swap, no displaced player)
        updatedTargetFlight.players.push(draggedPlayer);
        // Ensure target flight is manual (should already be, but defensive)
        updatedTargetFlight.isManual = true;
        
        // Recompute automated flights from remainder (no displaced players)
        setIsRecomputing(true);
        const recomputed = recomputeFromRemainder(newFlights, playerCount, []);
        setFlights(recomputed);
        setIsRecomputing(false);
        
        // Trigger success feedback animation
        setRecentDrop({ flightId: activeTargetFlightId, playerId: activeDraggedPlayerId, ts: Date.now() });
        
        const totalInFlights = recomputed.reduce((sum, f) => sum + f.players.length, 0);
        const missing = playerCount - totalInFlights;
        console.log("[DROP] recompute done (empty slot)", { flightsCount: recomputed.length, missing });
      } else {
        // Player swap: perform displacement swap
        const targetPlayerIndex = updatedTargetFlight.players.findIndex((p) => p.id === activeTargetPlayerId);
        
        // Get the displaced player (B) before any mutations
        const displacedPlayer = updatedTargetFlight.players[targetPlayerIndex];
        
        // Remove displaced player (B) from destination first
        updatedTargetFlight.players.splice(targetPlayerIndex, 1);
        
        // Insert dragged player (A) at the same index in destination
        updatedTargetFlight.players.splice(targetPlayerIndex, 0, draggedPlayer);
        
        // Only destination flight becomes manual
        updatedTargetFlight.isManual = true;

        // Show transient message for displaced player
        setDisplacedPlayerName(displacedPlayer.name);
        setTimeout(() => setDisplacedPlayerName(null), 2000);
        
        // Immediately recompute automated flights from remainder (includes displaced B)
        setIsRecomputing(true);
        const recomputed = recomputeFromRemainder(newFlights, playerCount, [displacedPlayer]);
        setFlights(recomputed);
        setIsRecomputing(false);
        
        // Trigger success feedback animation
        setRecentDrop({ flightId: activeTargetFlightId, playerId: activeDraggedPlayerId, ts: Date.now() });
        
        const totalInFlights = recomputed.reduce((sum, f) => sum + f.players.length, 0);
        const missing = playerCount - totalInFlights;
        console.log("[DROP] recompute done (swap)", { flightsCount: recomputed.length, missing });
      }
      // Note: drag state is cleared by finalizeDropFromRefs, not here
    },
    [draggedPlayerId, dragSource, flights, playerCount]
  );

  // Clear drag state and refs
  const clearDragState = useCallback(() => {
    dragArmedRef.current = false;
    dragRef.current = null;
    overTargetRef.current = null;
    setPointerDragState(null);
    setPointerOverTarget(null);
    setDragging(false);
    setDraggedPlayerId(null);
    setDragSource(null);
  }, []);

  // Finalize drop using refs (avoids stale state)
  const finalizeDropFromRefs = useCallback((clientX: number, clientY: number) => {
    const latestDrag = dragRef.current;
    const latestTarget = overTargetRef.current;
    
    console.log("[DROP] finalize start", { drag: latestDrag, over: latestTarget, x: clientX, y: clientY });
    
    if (!latestDrag) {
      clearDragState();
      return;
    }

    // Final hit-test as backstop if latestTarget is null
    let target: { type: "player" | "empty"; flightId: string; playerId?: string; slotIndex?: number } | null = latestTarget;
    let finalHitTestKey: string | null = null;
    if (!target) {
      const elementBelow = document.elementFromPoint(clientX, clientY);
      if (elementBelow) {
        const rowEl = elementBelow.closest('[data-drop-target]') as HTMLElement | null;
        const targetKey = rowEl?.getAttribute('data-drop-target') ?? null;
        finalHitTestKey = targetKey;
        if (targetKey) {
          const parts = targetKey.split('|');
          if (parts.length === 2) {
            // Normal player drop target
            const targetFlightId = parts[0];
            const targetPlayerId = parts[1];
            // Prevent self-drop
            if (targetFlightId !== latestDrag.flightId || targetPlayerId !== latestDrag.playerId) {
              target = { type: "player", flightId: targetFlightId, playerId: targetPlayerId };
            }
          } else if (parts.length === 3 && parts[1] === "__EMPTY__") {
            // Empty slot drop target
            const targetFlightId = parts[0];
            const slotIndex = parseInt(parts[2], 10);
            if (!isNaN(slotIndex)) {
              target = { type: "empty", flightId: targetFlightId, slotIndex };
            }
          }
        }
      }
      console.log("[DROP] final hit-test", { key: finalHitTestKey, resolvedTarget: target });
    }

    // If we have a valid drop target, perform the drop
    if (target) {
      // Verify the player still exists at the expected index
      const sourceFlight = flights.find((f) => f.id === latestDrag.flightId);
      if (sourceFlight && sourceFlight.players[latestDrag.playerIndex]?.id === latestDrag.playerId) {
        if (target.type === "player") {
          console.log("[DROP] calling handleDrop (player swap)", {
            draggedPlayerId: latestDrag.playerId,
            sourceFlightId: latestDrag.flightId,
            sourceIndex: latestDrag.playerIndex,
            targetFlightId: target.flightId,
            targetPlayerId: target.playerId,
          });
          // Call handleDrop with override values from refs (all 5 values explicitly)
          handleDrop(target.playerId!, target.flightId, {
            draggedPlayerId: latestDrag.playerId,
            sourceFlightId: latestDrag.flightId,
            sourceIndex: latestDrag.playerIndex,
            targetFlightId: target.flightId,
            targetPlayerId: target.playerId!,
          });
        } else {
          // Empty slot insert
          console.log("[DROP] calling handleDrop (empty slot)", {
            draggedPlayerId: latestDrag.playerId,
            sourceFlightId: latestDrag.flightId,
            sourceIndex: latestDrag.playerIndex,
            targetFlightId: target.flightId,
            slotIndex: target.slotIndex,
          });
          handleDrop("", target.flightId, {
            draggedPlayerId: latestDrag.playerId,
            sourceFlightId: latestDrag.flightId,
            sourceIndex: latestDrag.playerIndex,
            targetFlightId: target.flightId,
            targetPlayerId: "", // Empty string signals empty slot
          });
        }
        clearDragState();
        return;
      }
    }

    // No valid target - cancel
    console.log("[DROP] no valid target - cancel");
    clearDragState();
  }, [flights, handleDrop, clearDragState]);

  // Pointer-based drag handlers (mobile-compatible)
  const handlePointerDown = useCallback((e: React.PointerEvent, playerId: string, flightId: string) => {
    // Only handle primary pointer (left mouse button or touch)
    if (e.button !== undefined && e.button !== 0) return;
    
    e.stopPropagation();
    
    const sourceFlight = flights.find((f) => f.id === flightId);
    if (!sourceFlight) return;
    
    const playerIndex = sourceFlight.players.findIndex((p) => p.id === playerId);
    if (playerIndex === -1) return;

    // Set pointer capture for this element
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    
    const pointerType = e.pointerType;
    const startX = e.clientX;
    const startY = e.clientY;
    
    setPointerDragState({
      playerId,
      flightId,
      startX,
      startY,
      currentX: startX,
      currentY: startY,
      pointerType,
    });
    
    // Start dragging immediately for all pointer types
    e.preventDefault(); // Prevent text selection (mouse) and scroll (touch)
    dragArmedRef.current = true;
    setDragging(true);
    setDraggedPlayerId(playerId);
    setDragSource({ flightId, playerIndex });
    dragRef.current = { playerId, flightId, playerIndex, pointerId: e.pointerId };
  }, [flights]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!pointerDragState || !dragArmedRef.current) return;
    
    // Update current position
    setPointerDragState((prev) => prev ? {
      ...prev,
      currentX: e.clientX,
      currentY: e.clientY,
    } : null);
    
    // Prevent scrolling and do hit-testing
    e.preventDefault();
    
    // Find drop target via hit testing using closest()
    const elementBelow = document.elementFromPoint(e.clientX, e.clientY);
    if (elementBelow) {
      const rowEl = elementBelow.closest('[data-drop-target]') as HTMLElement | null;
      const targetKey = rowEl?.getAttribute('data-drop-target') ?? null;
      
      // Parse target key and ignore self-target
      if (targetKey) {
        const parts = targetKey.split('|');
        if (parts.length === 2) {
          // Normal player drop target
          const targetFlightId = parts[0];
          const targetPlayerId = parts[1];
          // Prevent self-drop
          if (targetFlightId !== pointerDragState.flightId || targetPlayerId !== pointerDragState.playerId) {
            setPointerOverTarget(targetKey);
            overTargetRef.current = { type: "player", flightId: targetFlightId, playerId: targetPlayerId };
          } else {
            setPointerOverTarget(null);
            overTargetRef.current = null;
          }
        } else if (parts.length === 3 && parts[1] === "__EMPTY__") {
          // Empty slot drop target: flightId|__EMPTY__|slotIndex
          const targetFlightId = parts[0];
          const slotIndex = parseInt(parts[2], 10);
          if (!isNaN(slotIndex)) {
            setPointerOverTarget(targetKey);
            overTargetRef.current = { type: "empty", flightId: targetFlightId, slotIndex };
          } else {
            setPointerOverTarget(null);
            overTargetRef.current = null;
          }
        } else {
          setPointerOverTarget(null);
          overTargetRef.current = null;
        }
      } else {
        setPointerOverTarget(null);
        overTargetRef.current = null;
      }
    } else {
      setPointerOverTarget(null);
      overTargetRef.current = null;
    }
  }, [pointerDragState]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (!pointerDragState) return;
    
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    
    // Use refs to avoid stale state
    finalizeDropFromRefs(e.clientX, e.clientY);
  }, [finalizeDropFromRefs]);

  const handlePointerCancel = useCallback((e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    
    // Cancel drag - no mutations
    clearDragState();
  }, [clearDragState]);


  const handleReset = useCallback(() => {
    // Regenerate flights (clears all manual flags)
    const players = generatePlayers(seed, playerCount);
    const resetFlights = generateFlights(players, seed);
    setFlights(resetFlights);
    setShowResetConfirm(false);
  }, [seed, playerCount]);

  const handleBack = useCallback(() => {
    router.back();
  }, [router]);

  const canReset = !dragging && !isRecomputing;

  // Calculate handicap range and edited flights count
  const handicapRange = useMemo(() => {
    if (flights.length === 0) return { min: 0, max: 0 };
    const allHandicaps = flights.flatMap((f) => f.players.map((p) => p.handicap));
    if (allHandicaps.length === 0) return { min: 0, max: 0 };
    return {
      min: Math.min(...allHandicaps),
      max: Math.max(...allHandicaps),
    };
  }, [flights]);

  const editedFlightsCount = useMemo(() => {
    return flights.filter((f) => f.isManual).length;
  }, [flights]);

  // Player count invariant check (dev-only)
  const playerCountStatus = useMemo(() => {
    const totalInFlights = flights.reduce((sum, f) => sum + f.players.length, 0);
    const missing = playerCount - totalInFlights;
    
    return {
      inFlights: totalInFlights,
      total: totalInFlights,
      expected: playerCount,
      missing,
      isValid: missing === 0,
    };
  }, [flights, playerCount]);

  // Invariant assertion after every state change
  useEffect(() => {
    if (playerCountStatus.missing !== 0) {
      console.error(`[Sandbox] Player count mismatch!`, {
        expected: playerCountStatus.expected,
        inFlights: playerCountStatus.inFlights,
        total: playerCountStatus.total,
        missing: playerCountStatus.missing,
      });
      
      // Dump all player IDs to find missing ones
      const allPlayerIds = new Set<string>();
      flights.forEach((flight) => {
        flight.players.forEach((p) => allPlayerIds.add(p.id));
      });
      console.error(`[Sandbox] Current player IDs:`, Array.from(allPlayerIds).sort());
      
      // Check for duplicates
      const idCounts: Record<string, number> = {};
      flights.forEach((flight) => {
        flight.players.forEach((p) => {
          idCounts[p.id] = (idCounts[p.id] || 0) + 1;
        });
      });
      const duplicates = Object.entries(idCounts).filter(([_, count]) => count > 1);
      if (duplicates.length > 0) {
        console.error(`[Sandbox] Duplicate player IDs:`, duplicates);
      }
    }
  }, [playerCountStatus, flights]);

  // First-render check: should start with 0 edited flights on initial load
  useEffect(() => {
    if (isFirstRender.current && flights.length > 0) {
      const manualFlights = flights.filter((f) => f.isManual);
      if (manualFlights.length !== 0) {
        console.warn(`[Sandbox] Expected 0 edited flights on initial load, found ${manualFlights.length}`, {
          manualFlightIds: manualFlights.map((f) => f.id),
          allFlightIds: flights.map((f) => ({ id: f.id, isManual: f.isManual })),
        });
      }
      isFirstRender.current = false;
    }
  }, [flights]);

  // Prevent scroll during armed touch drags
  useEffect(() => {
    if (dragging && dragArmedRef.current && pointerDragState?.pointerType !== "mouse") {
      const prevent = (ev: Event) => {
        ev.preventDefault();
      };
      const preventWheel = (ev: Event) => {
        ev.preventDefault();
      };
      
      window.addEventListener("touchmove", prevent, { passive: false });
      window.addEventListener("wheel", preventWheel, { passive: false });
      
      return () => {
        window.removeEventListener("touchmove", prevent);
        window.removeEventListener("wheel", preventWheel);
      };
    }
  }, [dragging, pointerDragState]);

  // Capture window pointerup/cancel while dragging (ensures drop works even if pointerup doesn't hit element)
  useEffect(() => {
    if (!dragging) return;

    const onUp = (e: PointerEvent) => {
      finalizeDropFromRefs(e.clientX, e.clientY);
    };

    const onCancel = () => {
      clearDragState();
    };

    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);

    return () => {
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
    };
  }, [dragging, finalizeDropFromRefs, clearDragState]);

  const [showDiagnostics, setShowDiagnostics] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      {/* Compact sticky top bar */}
      <div className="sticky top-0 z-20 border-b border-border bg-surface">
        <div className="flex items-center justify-between px-4 h-14">
          <button
            onClick={handleBack}
            className="text-sm text-secondary hover:text-foreground"
          >
            ← Back
          </button>
          <h1 className="text-base font-semibold text-foreground">Sandbox · Flights</h1>
          <button
            onClick={handleReload}
            className="text-sm text-secondary hover:text-foreground font-medium"
          >
            Reload
          </button>
        </div>
      </div>

      {/* Collapsible diagnostics strip */}
      <div className="sticky top-14 z-10 border-b border-border bg-surface">
        <div className="px-4 py-2">
          {!showDiagnostics ? (
            <div className="flex items-center justify-between">
              <div className="text-xs text-secondary whitespace-nowrap overflow-hidden text-ellipsis">
                Players {playerCount} · Edited {editedFlightsCount}
              </div>
              <button
                onClick={() => setShowDiagnostics(true)}
                className="text-xs text-secondary hover:text-foreground font-medium ml-2 flex-shrink-0"
              >
                Details
              </button>
            </div>
          ) : (
            <div className="space-y-1">
              <div className="text-xs text-secondary">
                Players: {playerCount}
              </div>
              <div className="text-xs text-secondary">
                Hcp: {handicapRange.min.toFixed(1)}–{handicapRange.max.toFixed(1)}
              </div>
              <div className="text-xs text-secondary">
                Edited flights: {editedFlightsCount}
              </div>
              <div className="text-xs text-secondary">
                In flights: {playerCountStatus.inFlights}/{playerCountStatus.expected}
              </div>
              {playerCountStatus.missing !== 0 && (
                <div 
                  className="text-xs font-semibold"
                  style={{ color: "var(--color-danger)" }}
                >
                  Missing: {playerCountStatus.missing}
                </div>
              )}
              <button
                onClick={() => setShowDiagnostics(false)}
                className="text-xs text-secondary hover:text-foreground font-medium mt-1"
              >
                Hide details
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Transient displacement message */}
      {displacedPlayerName && (
        <div 
          className="sticky z-10 border-b border-border bg-surface/95 px-4 py-2"
          style={{ top: showDiagnostics ? '200px' : '96px' }}
        >
          <div className="text-xs text-secondary text-center">
            {displacedPlayerName} moved back into the pool
          </div>
        </div>
      )}

      {/* Flights list */}
      <div className="px-4 pt-4 pb-24 space-y-4">
        {flights.map((flight) => {
          const isRecentDropFlight = recentDrop?.flightId === flight.id;
          return (
            <div
              key={flight.id}
              className={`rounded-lg border p-4 transition-transform duration-150 ${
                flight.isManual
                  ? "border-foreground/30 bg-foreground/2"
                  : "border-border bg-surface"
              } ${isRecentDropFlight ? "scale-[0.99]" : ""}`}
            >
            <div className="mb-3">
              <h2 className="text-sm font-semibold text-foreground">
                Flight {flight.index + 1}
                {flight.isManual && (
                  <span className="ml-2 text-xs font-normal text-secondary">· Edited</span>
                )}
              </h2>
            </div>
            <div className="space-y-2">
              {flight.players.map((player) => {
                const dropTargetKey = `${flight.id}|${player.id}`;
                const isDragging = draggedPlayerId === player.id;
                const isOverTarget = pointerOverTarget === dropTargetKey;
                const isActiveDrag = dragging && pointerDragState && draggedPlayerId === player.id;
                const isRecentDropPlayer = recentDrop?.playerId === player.id;
                const dx = isActiveDrag ? (pointerDragState.currentX - pointerDragState.startX) : 0;
                const dy = isActiveDrag ? (pointerDragState.currentY - pointerDragState.startY) : 0;
                
                return (
                  <div
                    key={player.id}
                    data-drop-target={dropTargetKey}
                    onPointerDown={(e) => {
                      if (e.pointerType !== "mouse") return;
                      handlePointerDown(e, player.id, flight.id);
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
                      handlePointerCancel(e);
                    }}
                    style={{
                      transform: isActiveDrag ? `translate3d(${dx}px, ${dy}px, 0) scale(0.98)` : undefined,
                      zIndex: isActiveDrag ? 50 : undefined,
                      position: isActiveDrag ? "relative" : undefined,
                      pointerEvents: isActiveDrag ? "none" : "auto",
                    }}
                    className={`flex items-center gap-3 rounded-md border border-border bg-background px-3 py-2 transition-all select-none ${
                      isActiveDrag ? "shadow-lg cursor-grabbing" : isDragging ? "opacity-50 cursor-grabbing" : isOverTarget ? "bg-background/50 ring-2 ring-foreground/30 cursor-grab" : isRecentDropPlayer ? "bg-black/5 transition-colors duration-200" : "hover:bg-background/30 cursor-grab"
                    }`}
                  >
                    <button
                      type="button"
                      aria-label="Drag player"
                      onPointerDown={(e) => {
                        if (e.pointerType === "mouse") return; // Mouse drags from row, not handle
                        handlePointerDown(e, player.id, flight.id);
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
                        handlePointerCancel(e);
                      }}
                      style={{
                        touchAction: "none",
                      }}
                      className={`text-secondary text-xs select-none hover:text-foreground focus:outline-none focus:ring-2 focus:ring-foreground/30 rounded px-1 -ml-1 ${
                        isDragging ? "cursor-grabbing" : "cursor-grab"
                      }`}
                    >
                      ≡
                    </button>
                    <div className="flex-1">
                      <div className="text-sm font-medium text-foreground">{player.name}</div>
                      <div className="text-xs text-secondary">HCP {player.handicap}</div>
                    </div>
                  </div>
                );
              })}
              {/* Vacant slots for manual flights with < 4 players */}
              {flight.isManual && flight.players.length < 4 && (() => {
                const vacantCount = 4 - flight.players.length;
                return Array.from({ length: vacantCount }, (_, slotIndex) => {
                  const dropTargetKey = `${flight.id}|__EMPTY__|${slotIndex}`;
                  const isOverTarget = pointerOverTarget === dropTargetKey;
                  
                  return (
                    <div
                      key={`vacant-${slotIndex}`}
                      data-drop-target={dropTargetKey}
                      className={`flex items-center gap-3 rounded-md border border-dashed border-border/40 bg-background/20 px-3 py-2 transition-all select-none ${
                        isOverTarget ? "bg-background/50 ring-2 ring-foreground/30" : "hover:bg-background/30"
                      }`}
                    >
                      <div className="flex-1">
                        <div className="text-sm font-normal text-secondary/70">Vacant slot</div>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          </div>
          );
        })}
      </div>

      {/* Reset section - inline confirmation */}
      <div className="px-5 py-4 border-t border-border">
        {showResetConfirm ? (
          <div className="space-y-3">
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-1">
                Reset all flights to automatic quartiles?
              </h3>
              <p className="text-xs text-secondary">
                This will remove all manual edits. You can rearrange again afterwards.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleReset}
                className="rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-medium text-foreground hover:bg-background"
              >
                Reset flights
              </button>
              <button
                onClick={() => setShowResetConfirm(false)}
                className="rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-medium text-secondary hover:bg-background"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowResetConfirm(true)}
            disabled={!canReset}
            className={`text-xs font-medium underline ${
              canReset
                ? "text-secondary hover:text-foreground"
                : "text-secondary/50 cursor-not-allowed no-underline"
            }`}
          >
            Reset to quartiles
          </button>
        )}
      </div>

      {/* Export button */}
      <div className="sticky bottom-0 border-t border-border bg-surface px-5 py-4">
        {(isRecomputing || playerCountStatus.missing !== 0) && (
          <div className="text-xs text-secondary mb-2 text-center">
            {isRecomputing
              ? "Updating flights…"
              : playerCountStatus.missing !== 0
              ? "Player count mismatch detected"
              : ""}
          </div>
        )}
        <button
          onClick={() => setShowExportMessage(true)}
          disabled={isRecomputing || playerCountStatus.missing !== 0}
          className="w-full rounded-lg btn-primary px-4 py-3 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Export details
        </button>
      </div>

      {/* Export message */}
      {showExportMessage && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/50 p-4">
          <div className="w-full max-w-md rounded-t-xl border-t border-border bg-surface p-6">
            <h3 className="text-sm font-semibold text-foreground mb-2">
              Sandbox: export is disabled.
            </h3>
            <p className="text-xs text-secondary mb-4">
              This is a development sandbox. Export functionality is not available here.
            </p>
            <button
              onClick={() => setShowExportMessage(false)}
              className="w-full rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground hover:bg-background"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Test checklist */}
      <div className="px-5 py-6 border-t border-border">
        <h3 className="text-xs font-semibold text-foreground mb-3 uppercase tracking-wide">
          Sandbox checklist
        </h3>
        <ul className="space-y-1.5 text-xs text-secondary">
          <li>• Does the displaced player message appear?</li>
          <li>• Do autos settle immediately after a drop?</li>
          <li>• Does canceling a drag keep the player in place?</li>
          <li>• Can you complete a swap chain A→B→C easily?</li>
          <li>• Is Reset hard to trigger accidentally?</li>
          <li>• Do incomplete flights feel normal (not error)?</li>
        </ul>
      </div>
    </div>
  );
}
