"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { gamedayHole, gamedayStartApi, coordinationActiveApi } from "../../lib/routes";
import {
  apiJson,
  validateCoordinationActiveResponse,
  validateGamedayStartResponse,
} from "../../lib/apiClient";

type ActiveGameDay = {
  tripId: string;
  groupId: string;
  state: string;
  label: string;
  updatedAt: string;
};

type ActiveCoordination = {
  tripId: string;
  tripLegacyId: number | null;
  groupId: string;
  label: string;
  effectiveStatus: 'today' | 'in_progress';
  resume: {
    route: string;
  };
  updatedAt: string;
};

type CoordinationActiveResponse = {
  active: ActiveCoordination | null;
};

export default function ActiveGameDayChip() {
  const router = useRouter();
  const pathname = usePathname();
  const [active, setActive] = useState<ActiveGameDay | null>(null);
  const [activeCoordination, setActiveCoordination] = useState<ActiveCoordination | null>(null);
  const [holeNumber, setHoleNumber] = useState<number>(1);
  const [lastFetch, setLastFetch] = useState<number>(0);
  const [startingGameDay, setStartingGameDay] = useState(false);

  // Hide chip if already on a GameDay page
  const isOnGameDayPage = pathname?.startsWith("/gameday/") ?? false;

  useEffect(() => {
    // Simple cache: fetch at most once every 5 seconds
    const now = Date.now();
    if (now - lastFetch < 5000 && (active || activeCoordination)) {
      return;
    }

    async function fetchActive() {
      try {
        // First, try the existing /api/gameday/active endpoint
        const gamedayRes = await fetch("/api/gameday/active", { credentials: "include" });
        if (gamedayRes.ok) {
          const gamedayData = await gamedayRes.json();
          if (gamedayData.active) {
            setActive(gamedayData.active);
            setActiveCoordination(null);
            setLastFetch(now);

            // Read hole number from localStorage
            const lastHoleKey = `gameday:last:${gamedayData.active.tripId}`;
            const lastHoleData = localStorage.getItem(lastHoleKey);
            if (lastHoleData) {
              try {
                const parsed = JSON.parse(lastHoleData);
                if (parsed.holeNumber && typeof parsed.holeNumber === "number") {
                  setHoleNumber(parsed.holeNumber);
                }
              } catch {
                // Invalid JSON, use default
              }
            }
            return;
          }
        }

        // If /api/gameday/active returns null, try /api/coordination/active as fallback
        try {
          const coordinationData = await apiJson<CoordinationActiveResponse>(coordinationActiveApi());
          validateCoordinationActiveResponse(coordinationData);
          if (coordinationData.active) {
            setActive(null);
            setActiveCoordination(coordinationData.active);
            setLastFetch(now);

            // Read hole number from localStorage (use tripId or tripLegacyId)
            const tripIdForStorage = coordinationData.active.tripLegacyId 
              ? String(coordinationData.active.tripLegacyId)
              : coordinationData.active.tripId;
            const lastHoleKey = `gameday:last:${tripIdForStorage}`;
            const lastHoleData = localStorage.getItem(lastHoleKey);
            if (lastHoleData) {
              try {
                const parsed = JSON.parse(lastHoleData);
                if (parsed.holeNumber && typeof parsed.holeNumber === "number") {
                  setHoleNumber(parsed.holeNumber);
                }
              } catch {
                // Invalid JSON, use default
              }
            }
            return;
          }
        } catch (error) {
          console.error("Failed to fetch coordination active:", error);
        }

        // Both endpoints returned null
        setActive(null);
        setActiveCoordination(null);
      } catch (error) {
        console.error("Failed to fetch active gameday:", error);
        setActive(null);
        setActiveCoordination(null);
      }
    }

    fetchActive();
  }, [active, activeCoordination, lastFetch]);

  // Determine which active item to show (prioritize gameday/active)
  const displayActive = active || activeCoordination;

  if (!displayActive || isOnGameDayPage) {
    return null;
  }

  const handleClick = async () => {
    if (active) {
      // Use existing GameDay active route (no start call needed - already in progress)
      router.push(gamedayHole(active.tripId, holeNumber));
    } else if (activeCoordination) {
      // For coordination fallback: call start before navigating
      if (startingGameDay) return;
      setStartingGameDay(true);
      try {
        try {
          const data = await apiJson(gamedayStartApi(), {
            method: "POST",
            body: JSON.stringify({ tripId: activeCoordination.tripId }),
          });
          validateGamedayStartResponse(data);
          // Navigate after successful start
          const routeWithHole = activeCoordination.resume.route + (holeNumber > 1 ? `?hole=${holeNumber}` : '');
          router.push(routeWithHole);
        } catch (error) {
          // If 409 already_published, still navigate (read-only viewing may exist)
          if (error instanceof Error && error.message.includes("409")) {
            try {
              const res = await fetch(gamedayStartApi(), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ tripId: activeCoordination.tripId }),
              });
              if (res.status === 409) {
                const data = await res.json();
                if (data.reason === 'already_published') {
                  const routeWithHole = activeCoordination.resume.route + (holeNumber > 1 ? `?hole=${holeNumber}` : '');
                  router.push(routeWithHole);
                  return;
                }
              }
            } catch {
              // Fall through to navigate anyway
            }
          }
          // Still navigate on error (user can try again on GameDay page)
          const routeWithHole = activeCoordination.resume.route + (holeNumber > 1 ? `?hole=${holeNumber}` : '');
          router.push(routeWithHole);
        }
      } catch (error) {
        console.error("Failed to start GameDay:", error);
        // Still navigate on error (user can try again on GameDay page)
        const routeWithHole = activeCoordination.resume.route + (holeNumber > 1 ? `?hole=${holeNumber}` : '');
        router.push(routeWithHole);
      } finally {
        setStartingGameDay(false);
      }
    }
  };

  // Determine chip text based on source
  let chipText: string;
  if (active) {
    chipText = `🏌️ Return to GameDay — ${active.label} • Hole ${holeNumber}`;
  } else if (activeCoordination) {
    if (activeCoordination.effectiveStatus === 'in_progress') {
      chipText = `🏌️ Round in progress — Resume`;
    } else {
      chipText = `🏌️ GameDay is ready`;
    }
  } else {
    return null;
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-10 pointer-events-none">
      <div className="mx-auto max-w-md px-4 pb-16 pointer-events-auto">
        <button
          onClick={handleClick}
          disabled={startingGameDay}
          className="w-full px-4 py-2 bg-brand-green text-white text-sm font-medium rounded-t-lg shadow-lg hover:opacity-90 transition-opacity text-left disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {startingGameDay ? 'Starting…' : chipText}
        </button>
      </div>
    </div>
  );
}
