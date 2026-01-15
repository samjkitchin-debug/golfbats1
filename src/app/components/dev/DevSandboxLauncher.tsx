"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

function DevSandboxLauncherContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Always start with false to avoid hydration mismatch
  // Check localStorage only in useEffect after mount
  const [isEnabled, setIsEnabled] = useState(false);

  useEffect(() => {
    // Check URL param first
    if (searchParams?.get("devSandbox") === "1") {
      if (typeof window !== "undefined") {
        localStorage.setItem("DFI_DEV_SANDBOX", "1");
        setIsEnabled(true);
        return;
      }
    }

    // Then check localStorage in case it was set elsewhere
    if (typeof window !== "undefined") {
      const flag = localStorage.getItem("DFI_DEV_SANDBOX");
      if (flag === "1") {
        setIsEnabled(true);
      }
    }
  }, [searchParams]);

  // Button removed - flights editor is now accessible via trip page
  return null;
}

export default function DevSandboxLauncher() {
  // Only render in development (check both server and client)
  const isDev = 
    (typeof process !== "undefined" && process.env.NODE_ENV === "development") ||
    (typeof window !== "undefined" && window.location.hostname === "localhost");

  if (!isDev) {
    return null;
  }

  return (
    <Suspense fallback={null}>
      <DevSandboxLauncherContent />
    </Suspense>
  );
}
