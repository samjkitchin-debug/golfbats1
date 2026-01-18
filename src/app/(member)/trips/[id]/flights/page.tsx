"use client";

// This is a temporary implementation that reuses sandbox logic
// TODO: Connect to real trip data and Supabase persistence

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";

// Import types and functions from sandbox (temporary - will be refactored)
// For now, we'll copy the essential logic inline

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

  return flights;
}

function recomputeFromRemainder(
  flights: Flight[],
  expectedTotal: number,
  displacedPlayers: Player[]
): Flight[] {
  // Collect all players from non-manual flights
  const manualFlights = flights.filter((f) => f.isManual);
  const manualPlayerIds = new Set<string>();
  manualFlights.forEach((f) => {
    f.players.forEach((p) => manualPlayerIds.add(p.id));
  });

  const remainingPlayers: Player[] = [];
  flights.forEach((flight) => {
    if (!flight.isManual) {
      flight.players.forEach((p) => remainingPlayers.push(p));
    }
  });

  // Add displaced players back to the pool
  remainingPlayers.push(...displacedPlayers);

  // Pre-recompute validation
  const allPlayerIdsBefore = new Set<string>();
  manualFlights.forEach((f) => {
    f.players.forEach((p) => allPlayerIdsBefore.add(p.id));
  });
  remainingPlayers.forEach((p) => allPlayerIdsBefore.add(p.id));
  displacedPlayers.forEach((p) => allPlayerIdsBefore.add(p.id));

  if (allPlayerIdsBefore.size !== expectedTotal) {
    console.error(`[Sandbox] Pre-recompute validation failed: expected ${expectedTotal} unique players, found ${allPlayerIdsBefore.size}`);
    const missingIds: string[] = [];
    for (let i = 0; i < expectedTotal; i++) {
      const expectedId = `player-${i}`;
      if (!allPlayerIdsBefore.has(expectedId)) {
        missingIds.push(expectedId);
      }
    }
    if (missingIds.length > 0) {
      console.error(`[Sandbox] Missing player IDs:`, missingIds);
    }
  }

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
  if (totalAfter !== expectedTotal) {
    console.error(`[Sandbox] Post-recompute validation failed: expected ${expectedTotal} players, found ${totalAfter}`, {
      stage: "post-recompute",
      expected: expectedTotal,
      actual: totalAfter,
      manualCount: manualFlights.length,
    });
    
    // Find missing IDs
    const missingIds: string[] = [];
    for (let i = 0; i < expectedTotal; i++) {
      const expectedId = `player-${i}`;
      if (!allPlayerIdsAfter.has(expectedId)) {
        missingIds.push(expectedId);
      }
    }
    if (missingIds.length > 0) {
      console.error(`[Sandbox] Missing player IDs after recompute:`, missingIds);
    }
    
    // Find duplicate IDs
    const idCounts: Record<string, number> = {};
    result.forEach((flight) => {
      flight.players.forEach((p) => {
        idCounts[p.id] = (idCounts[p.id] || 0) + 1;
      });
    });
    const duplicates = Object.entries(idCounts).filter(([_, count]) => count > 1);
    if (duplicates.length > 0) {
      console.error(`[Sandbox] Duplicate player IDs after recompute:`, duplicates);
    }
  }

  return result;
}

export default function FlightsEditorPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const tripId = params?.id;

  // TODO: Load real trip data and attendees
  // For now, use sandbox-style generated data
  const [seed] = useState(() => Date.now());
  const [playerCount] = useState(57); // TODO: Use actual confirmed attendees count
  const [flights, setFlights] = useState<Flight[]>([]);
  const [dragging, setDragging] = useState(false);
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
  const [isRecomputing, setIsRecomputing] = useState(false);
  const [recentDrop, setRecentDrop] = useState<null | { flightId: string; playerId?: string; ts: number }>(null);
  const isFirstRender = useRef(true);
  const [displacedPlayerName, setDisplacedPlayerName] = useState<string | null>(null);

  // Initialize flights
  useEffect(() => {
    const rng = new PRNG(seed);
    const count = playerCount;
    const players = generatePlayers(seed, count);
    const initialFlights = generateFlights(players, seed);
    setFlights(initialFlights);
  }, [seed, playerCount]);

  // Auto-clear recentDrop animation after ~200ms
  useEffect(() => {
    if (recentDrop?.ts) {
      const timeout = setTimeout(() => {
        setRecentDrop(null);
      }, 200);
      return () => clearTimeout(timeout);
    }
  }, [recentDrop?.ts]);

  // Drop handler
  const handleDrop = useCallback(
    (targetPlayerId: string, targetFlightId: string, override?: { draggedPlayerId: string; sourceFlightId: string; sourceIndex: number; targetFlightId: string; targetPlayerId: string } | null) => {
      const activeTargetFlightId = override?.targetFlightId ?? targetFlightId;
      const activeTargetPlayerId = override?.targetPlayerId ?? targetPlayerId;
      const activeDraggedPlayerId = override?.draggedPlayerId ?? draggedPlayerId;
      const activeSourceFlightId = override?.sourceFlightId ?? dragSource?.flightId;
      const activeSourceIndex = override?.sourceIndex ?? dragSource?.playerIndex;

      const isEmptySlotDrop = !activeTargetPlayerId || activeTargetPlayerId === "";

      if (!activeDraggedPlayerId || !activeSourceFlightId || activeSourceIndex === undefined || !activeTargetFlightId || (!isEmptySlotDrop && !activeTargetPlayerId)) {
        return;
      }

      const targetFlight = flights.find((f) => f.id === activeTargetFlightId);
      if (!targetFlight) {
        return;
      }

      if (isEmptySlotDrop) {
        if (!targetFlight.isManual) {
          return;
        }
        if (targetFlight.players.length >= 4) {
          return;
        }
      } else {
        const targetPlayerIndex = targetFlight.players.findIndex((p) => p.id === activeTargetPlayerId);
        if (targetPlayerIndex === -1) {
          return;
        }
        if (activeSourceFlightId === activeTargetFlightId && activeDraggedPlayerId === activeTargetPlayerId) {
          return;
        }
      }

      const newFlights = flights.map((f) => ({
        ...f,
        players: [...f.players],
      }));

      const sourceFlight = newFlights.find((f) => f.id === activeSourceFlightId);
      if (!sourceFlight) {
        return;
      }

      if (sourceFlight.players[activeSourceIndex]?.id !== activeDraggedPlayerId) {
        return;
      }

      const draggedPlayer = sourceFlight.players[activeSourceIndex];
      const updatedTargetFlight = newFlights.find((f) => f.id === activeTargetFlightId)!;
      
      sourceFlight.players.splice(activeSourceIndex, 1);

      if (isEmptySlotDrop) {
        updatedTargetFlight.players.push(draggedPlayer);
        updatedTargetFlight.isManual = true;
        
        setIsRecomputing(true);
        const recomputed = recomputeFromRemainder(newFlights, playerCount, []);
        setFlights(recomputed);
        setIsRecomputing(false);
        
        setRecentDrop({ flightId: activeTargetFlightId, playerId: activeDraggedPlayerId, ts: Date.now() });
      } else {
        const targetPlayerIndex = updatedTargetFlight.players.findIndex((p) => p.id === activeTargetPlayerId);
        const displacedPlayer = updatedTargetFlight.players[targetPlayerIndex];
        
        updatedTargetFlight.players.splice(targetPlayerIndex, 1);
        updatedTargetFlight.players.splice(targetPlayerIndex, 0, draggedPlayer);
        updatedTargetFlight.isManual = true;

        setDisplacedPlayerName(displacedPlayer.name);
        setTimeout(() => setDisplacedPlayerName(null), 2000);
        
        setIsRecomputing(true);
        const recomputed = recomputeFromRemainder(newFlights, playerCount, [displacedPlayer]);
        setFlights(recomputed);
        setIsRecomputing(false);
        
        setRecentDrop({ flightId: activeTargetFlightId, playerId: activeDraggedPlayerId, ts: Date.now() });
      }
    },
    [draggedPlayerId, dragSource, flights, playerCount]
  );

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

  const finalizeDropFromRefs = useCallback((clientX: number, clientY: number) => {
    const latestDrag = dragRef.current;
    const latestTarget = overTargetRef.current;
    
    if (!latestDrag) {
      clearDragState();
      return;
    }

    let target: { type: "player" | "empty"; flightId: string; playerId?: string; slotIndex?: number } | null = latestTarget;
    if (!target) {
      const elementBelow = document.elementFromPoint(clientX, clientY);
      if (elementBelow) {
        const rowEl = elementBelow.closest('[data-drop-target]') as HTMLElement | null;
        const targetKey = rowEl?.getAttribute('data-drop-target') ?? null;
        if (targetKey) {
          const parts = targetKey.split('|');
          if (parts.length === 2) {
            const targetFlightId = parts[0];
            const targetPlayerId = parts[1];
            if (targetFlightId !== latestDrag.flightId || targetPlayerId !== latestDrag.playerId) {
              target = { type: "player", flightId: targetFlightId, playerId: targetPlayerId };
            }
          } else if (parts.length === 3 && parts[1] === "__EMPTY__") {
            const targetFlightId = parts[0];
            const slotIndex = parseInt(parts[2], 10);
            if (!isNaN(slotIndex)) {
              target = { type: "empty", flightId: targetFlightId, slotIndex };
            }
          }
        }
      }
    }

    if (target) {
      const sourceFlight = flights.find((f) => f.id === latestDrag.flightId);
      if (sourceFlight && sourceFlight.players[latestDrag.playerIndex]?.id === latestDrag.playerId) {
        if (target.type === "player") {
          handleDrop(target.playerId!, target.flightId, {
            draggedPlayerId: latestDrag.playerId,
            sourceFlightId: latestDrag.flightId,
            sourceIndex: latestDrag.playerIndex,
            targetFlightId: target.flightId,
            targetPlayerId: target.playerId!,
          });
        } else {
          handleDrop("", target.flightId, {
            draggedPlayerId: latestDrag.playerId,
            sourceFlightId: latestDrag.flightId,
            sourceIndex: latestDrag.playerIndex,
            targetFlightId: target.flightId,
            targetPlayerId: "",
          });
        }
        clearDragState();
        return;
      }
    }

    clearDragState();
  }, [flights, handleDrop, clearDragState]);

  const handlePointerDown = useCallback((e: React.PointerEvent, playerId: string, flightId: string) => {
    if (e.button !== undefined && e.button !== 0) return;
    
    e.stopPropagation();
    
    const sourceFlight = flights.find((f) => f.id === flightId);
    if (!sourceFlight) return;
    
    const playerIndex = sourceFlight.players.findIndex((p) => p.id === playerId);
    if (playerIndex === -1) return;

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
    
    e.preventDefault();
    dragArmedRef.current = true;
    setDragging(true);
    setDraggedPlayerId(playerId);
    setDragSource({ flightId, playerIndex });
    dragRef.current = { playerId, flightId, playerIndex, pointerId: e.pointerId };
  }, [flights]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!pointerDragState || !dragArmedRef.current) return;
    
    setPointerDragState((prev) => prev ? {
      ...prev,
      currentX: e.clientX,
      currentY: e.clientY,
    } : null);
    
    e.preventDefault();
    
    const elementBelow = document.elementFromPoint(e.clientX, e.clientY);
    if (elementBelow) {
      const rowEl = elementBelow.closest('[data-drop-target]') as HTMLElement | null;
      const targetKey = rowEl?.getAttribute('data-drop-target') ?? null;
      
      if (targetKey) {
        const parts = targetKey.split('|');
        if (parts.length === 2) {
          const targetFlightId = parts[0];
          const targetPlayerId = parts[1];
          if (targetFlightId !== pointerDragState.flightId || targetPlayerId !== pointerDragState.playerId) {
            setPointerOverTarget(targetKey);
            overTargetRef.current = { type: "player", flightId: targetFlightId, playerId: targetPlayerId };
          } else {
            setPointerOverTarget(null);
            overTargetRef.current = null;
          }
        } else if (parts.length === 3 && parts[1] === "__EMPTY__") {
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
    
    finalizeDropFromRefs(e.clientX, e.clientY);
  }, [finalizeDropFromRefs]);

  const handlePointerCancel = useCallback((e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    
    clearDragState();
  }, [clearDragState]);

  const handleReset = useCallback(() => {
    const players = generatePlayers(seed, playerCount);
    const resetFlights = generateFlights(players, seed);
    setFlights(resetFlights);
    setShowResetConfirm(false);
  }, [seed, playerCount]);

  const handleBack = useCallback(() => {
    router.back();
  }, [router]);

  const canReset = !dragging && !isRecomputing;

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
          <h1 className="text-base font-semibold text-foreground">Flights</h1>
          <div className="w-12" /> {/* Spacer for centering */}
        </div>
      </div>

      {/* Frozen instructions */}
      <div className="px-4 py-3 border-b border-border bg-surface">
        <div className="text-sm font-medium text-foreground mb-1">
          Drag players to adjust flights.
        </div>
        <div className="text-xs text-secondary">
          Flights start balanced by handicap. Any flight you edit is kept as-is.
        </div>
        <div className="text-xs text-secondary/70 mt-1">
          Drag onto a player to swap, or into an empty slot to complete a flight.
        </div>
      </div>

      {/* Transient displacement message */}
      {displacedPlayerName && (
        <div className="sticky z-10 border-b border-border bg-surface/95 px-4 py-2" style={{ top: '56px' }}>
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
                        isActiveDrag ? "shadow-lg cursor-grabbing" : isDragging ? "opacity-50 cursor-grabbing" : isOverTarget ? "bg-background/50 ring-2 ring-foreground/30 cursor-grab" : isRecentDropPlayer ? "bg-surface transition-colors duration-200" : "hover:bg-background/30 cursor-grab"
                      }`}
                    >
                      <button
                        type="button"
                        aria-label="Drag player"
                        onPointerDown={(e) => {
                          if (e.pointerType === "mouse") return;
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
          disabled={true}
          className="w-full rounded-lg btn-primary px-4 py-3 text-sm font-medium opacity-50 cursor-not-allowed"
        >
          Export (coming soon)
        </button>
      </div>
    </div>
  );
}
