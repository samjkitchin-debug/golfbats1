"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function StartPage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "success_pending" | "success_approved" | "error">("idle");
  const [message, setMessage] = useState("");

  function extractSlugFromInput(input: string): string {
    const trimmed = input.trim().toLowerCase();
    if (!trimmed) return "";
    const codeMatch = trimmed.match(/[?&]code=([a-z0-9-]+)/);
    if (codeMatch) return codeMatch[1];
    if (trimmed.includes("/join")) {
      const u = new URL(trimmed.startsWith("http") ? trimmed : `https://x${trimmed}`);
      return u.searchParams.get("code") || trimmed.replace(/^.*\/join\??/, "").replace(/^code=/, "") || trimmed;
    }
    return trimmed.replace(/^.*code=/, "").trim() || trimmed;
  }

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    setStatus("submitting");
    setMessage("");
    const slug = extractSlugFromInput(code);
    if (!slug) {
      setStatus("error");
      setMessage("Please enter an invite code or link.");
      return;
    }
    try {
      const res = await fetch("/api/groups/join", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ code: slug }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err = json?.error || "Failed to join.";
        if (res.status === 404) setMessage("Group not found. Check the code and try again.");
        else if (res.status === 403) setMessage("That group is not accepting new members.");
        else setMessage(err);
        setStatus("error");
        return;
      }
      const statusVal = json.status;
      if (statusVal === "requested" || statusVal === "already_pending") {
        setStatus("success_pending");
        return;
      }
      if (statusVal === "already_approved") {
        router.replace("/");
        return;
      }
      router.replace("/");
    } catch {
      setMessage("Something went wrong. Please try again.");
      setStatus("error");
    }
  }

  return (
    <div className="mx-auto w-full max-w-md space-y-8 pt-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Join a group</h1>
        <p className="mt-1 text-sm text-muted">You need a group to access trips and members.</p>
      </div>

      <form onSubmit={handleJoin} className="space-y-4">
        <div>
          <label htmlFor="code" className="sr-only">
            Invite code or link
          </label>
          <input
            id="code"
            type="text"
            placeholder="Enter invite code or link"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            disabled={status === "submitting"}
            className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-foreground placeholder:text-muted outline-none focus:ring-2 focus:ring-border disabled:opacity-70"
            autoComplete="off"
          />
        </div>
        <button
          type="submit"
          disabled={status === "submitting"}
          className="w-full rounded-lg px-4 py-2.5 text-sm font-medium btn-primary disabled:opacity-70"
        >
          {status === "submitting" ? "Joining…" : "Join"}
        </button>
      </form>

      {status === "error" && message && (
        <div className="rounded-lg border border-border bg-surface px-4 py-3 text-sm text-danger" role="alert">
          {message}
        </div>
      )}

      {status === "success_pending" && (
        <div className="rounded-lg border border-border bg-surface px-4 py-4 space-y-3">
          <p className="text-sm text-foreground">Request sent. An admin will approve you.</p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => { setStatus("idle"); setMessage(""); setCode(""); }}
              className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-medium text-foreground hover:bg-surface-2"
            >
              Back to start
            </button>
            <Link
              href="/login"
              className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-medium text-foreground hover:bg-surface-2"
            >
              Switch account
            </Link>
          </div>
        </div>
      )}

      <div className="border-t border-border pt-6">
        <p className="text-sm text-muted mb-3">Or create your own group</p>
        <Link
          href="/groups/create"
          className="block w-full rounded-lg border border-border bg-surface px-4 py-2.5 text-sm font-medium text-foreground hover:bg-surface-2 text-center"
        >
          Create a group
        </Link>
      </div>
    </div>
  );
}
