"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { gamedayHole } from "../../lib/routes";

export type ActiveGameDay = {
  tripId: string;
  groupId: string;
  state: string;
  label: string;
  updatedAt: string;
};

export type ActiveCoordination = {
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

export type ActiveGameDayInfo = {
  roundId: string | null;
  currentHoleIndex: number | null;
  roundName: string | null;
  courseName: string | null;
  route: string | null;
};

// Hook to get active GameDay info for use in Home page
export function useActiveGameDay(): ActiveGameDayInfo | null {
  const [active, setActive] = useState<ActiveGameDay | null>(null);
  const [holeNumber, setHoleNumber] = useState<number>(1);

  const fetchActive = async () => {
    try {
      // Always fetch fresh, bypass cache
      const gamedayRes = await fetch("/api/gameday/active", { 
        credentials: "include",
        cache: "no-store"
      });
      
      if (gamedayRes.ok) {
        const gamedayData = await gamedayRes.json();
        if (gamedayData.active?.tripId) {
          setActive(gamedayData.active);

          // Read hole number from localStorage (convenience only, not for showing chip)
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

      // /api/gameday/active returned null - clear state and persisted keys
      setActive(null);
      
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
    } catch (error) {
      console.error("Failed to fetch active gameday:", error);
      setActive(null);
    }
  };

  useEffect(() => {
    fetchActive();
    
    // Refetch on visibility change (page gains focus)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchActive();
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  if (active?.tripId) {
    return {
      roundId: active.tripId,
      currentHoleIndex: holeNumber - 1, // Convert to 0-based index
      roundName: active.label,
      courseName: null,
      route: null, // Will be constructed from roundId
    };
  }

  return null;
}

export default function ActiveGameDayChip() {
  const router = useRouter();
  const pathname = usePathname();
  const [active, setActive] = useState<ActiveGameDay | null>(null);
  const [holeNumber, setHoleNumber] = useState<number>(1);

  // Hide chip if already on a GameDay page
  const isOnGameDayPage = pathname?.startsWith("/gameday/") ?? false;

  const fetchActive = async () => {
    try {
      // Always fetch fresh, bypass cache
      const gamedayRes = await fetch("/api/gameday/active", { 
        credentials: "include",
        cache: "no-store"
      });
      
      if (gamedayRes.ok) {
        const gamedayData = await gamedayRes.json();
        if (gamedayData.active?.tripId) {
          setActive(gamedayData.active);

          // Read hole number from localStorage (convenience only, not for showing chip)
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

      // /api/gameday/active returned null - clear state and persisted keys
      setActive(null);
      
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
    } catch (error) {
      console.error("Failed to fetch active gameday:", error);
      setActive(null);
    }
  };

  useEffect(() => {
    fetchActive();
    
    // Refetch on visibility change (page gains focus)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchActive();
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // Only render chip when /api/gameday/active returns active.tripId
  if (!active?.tripId || isOnGameDayPage) {
    return null;
  }

  const handleClick = () => {
    // Set intent tracking for GameDay mode
    if (typeof window !== 'undefined') {
      localStorage.setItem('dayforeit:last_mode', 'gameday');
    }
    
    // Navigate using active.tripId from /api/gameday/active
    router.push(gamedayHole(active.tripId, holeNumber));
  };

  // Chip text based on active GameDay
  const chipText = `🏌️ Return to GameDay — ${active.label} • Hole ${holeNumber}`;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-10 pointer-events-none">
      <div className="mx-auto max-w-md px-4 pb-16 pointer-events-none">
        <button
          onClick={handleClick}
          className="w-full px-4 py-2 btn-anticipation text-sm font-medium rounded-t-lg shadow-lg hover:opacity-90 transition-opacity text-left pointer-events-auto"
        >
          {chipText}
        </button>
      </div>
    </div>
  );
}
