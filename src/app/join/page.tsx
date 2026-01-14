"use client";

import Link from "next/link";
import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";

export default function JoinPage() {
  const router = useRouter();
  
  // All state hooks at the top
  const [slug, setSlug] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "done" | "error">("idle");
  const [message, setMessage] = useState<string>("");
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [isProfileComplete, setIsProfileComplete] = useState<boolean | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

  // All useMemo hooks before any early returns
  const supabase = useMemo(() => {
    return createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }, []);

  // All useEffect hooks before any early returns
  useEffect(() => {
    async function checkAuthAndProfile() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          setIsAuthenticated(false);
          setIsProfileComplete(false);
          setLoadingProfile(false);
          router.push("/login?next=/join");
          return;
        }

        setIsAuthenticated(true);

        // Check profile completeness
        const { data: memberData } = await supabase
          .from("members")
          .select("full_name,display_name,nationality")
          .eq("id", user.id)
          .maybeSingle();

        const complete = !!(memberData?.full_name && memberData?.display_name && memberData?.nationality);
        setIsProfileComplete(complete);
      } catch (error) {
        console.warn("Failed to check profile:", error);
        setIsProfileComplete(false);
      } finally {
        setLoadingProfile(false);
      }
    }
    checkAuthAndProfile();
  }, [supabase, router]);

  async function submit() {
    setStatus("submitting");
    setMessage("");

    const normalizedSlug = slug.trim().toLowerCase();

    if (!normalizedSlug) {
      setStatus("error");
      setMessage("Please enter a group code.");
      return;
    }

    try {
      const res = await fetch("/api/groups/join", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slug: normalizedSlug }),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        // Handle error responses
        if (json.error === "not_authenticated") {
          router.push("/login?next=/join");
          return;
        }
        if (json.error === "group_not_found") {
          setStatus("error");
          setMessage("Group code not found.");
          return;
        }
        if (json.error === "group_inactive") {
          setStatus("error");
          setMessage("This group is inactive.");
          return;
        }
        // Generic error
        setStatus("error");
        setMessage(json.error || "Failed to request access.");
        return;
      }

      // Handle success responses
      if (json.status === "requested") {
        setStatus("done");
        setMessage("Request sent. Waiting for approval.");
        return;
      }

      if (json.status === "already_pending") {
        setStatus("done");
        setMessage("Request already sent.");
        return;
      }

      if (json.status === "already_approved") {
        // User is already a member - redirect to home
        router.push("/");
        return;
      }

      // Fallback
      setStatus("error");
      setMessage("Unexpected response. Please try again.");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Failed to request access.");
    }
  }

  // Handler for back button
  function handleBack() {
    if (window.history.length > 1) {
      router.back();
    } else {
      router.push("/");
    }
  }

  // Conditional rendering after all hooks
  if (loadingProfile || isAuthenticated === null) {
    return (
      <div className="mx-auto w-full max-w-md px-4 py-8">
        <p className="text-sm text-muted">Loading…</p>
      </div>
    );
  }

  if (!isProfileComplete) {
    // Profile incomplete - show friendly message card
    return (
      <div className="mx-auto w-full max-w-md px-4 py-8">
        {/* Back button */}
        <button
          onClick={handleBack}
          className="mb-4 text-sm text-muted hover:text-foreground flex items-center gap-1"
        >
          ← Back
        </button>

        {/* Profile incomplete message */}
        <div className="rounded-xl border-2 border-border bg-surface p-6 text-center">
          <h1 className="text-xl font-semibold text-foreground">Complete your profile first</h1>
          <p className="mt-2 text-sm text-muted">
            Add your details so group members recognise you.
          </p>
          <Link
            href="/me/edit?required=true"
            className="mt-4 block w-full rounded-lg btn-primary px-4 py-3 text-sm font-semibold text-white hover:opacity-90"
          >
            Complete profile
          </Link>
          <Link
            href="/"
            className="mt-3 block w-full rounded-lg border border-border bg-surface px-4 py-3 text-sm font-semibold text-foreground hover:bg-background"
          >
            Back
          </Link>
        </div>
      </div>
    );
  }

  // Profile complete - show join form
  return (
    <div className="mx-auto w-full max-w-md px-4 py-8">
      {/* Back button */}
      <button
        onClick={handleBack}
        className="mb-4 text-sm text-muted hover:text-foreground flex items-center gap-1"
      >
        ← Back
      </button>

      <h1 className="text-xl font-semibold">Join a group</h1>
      <p className="mt-2 text-sm text-muted">
        Enter the group code (slug). Your request will be submitted for approval.
      </p>

      <label className="mt-6 block text-sm font-medium">Group code</label>
      <input
        className="mt-2 w-full rounded-lg border px-3 py-2"
        value={slug}
        onChange={(e) => setSlug(e.target.value)}
        placeholder="e.g. golfbats"
        disabled={status === "submitting"}
        autoFocus
      />

      <button
        className="mt-4 w-full rounded-lg btn-primary px-4 py-2 text-white disabled:opacity-50"
        onClick={submit}
        disabled={status === "submitting"}
      >
        {status === "submitting" ? "Submitting..." : "Request access"}
      </button>

      {message && (
        <p
          className={`mt-4 text-sm ${
            status === "error" ? "text-foreground" : status === "done" ? "text-brand-green" : "text-muted"
          }`}
        >
          {message}
        </p>
      )}
    </div>
  );
}
