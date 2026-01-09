"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "../lib/supabaseBrowser";

export default function JoinPage() {
  const [slug, setSlug] = useState("golfbats");
  const [status, setStatus] = useState<"idle" | "submitting" | "done" | "error">("idle");
  const [message, setMessage] = useState<string>("");
  const router = useRouter();

  async function submit() {
    setStatus("submitting");
    setMessage("");

    const supabase = createSupabaseBrowserClient();

    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
      router.push("/login");
      return;
    }

    // Lookup group by slug
    const { data: group, error: groupErr } = await supabase
      .from("groups")
      .select("id, slug, name")
      .eq("slug", slug.trim().toLowerCase())
      .single();

    if (groupErr || !group) {
      setStatus("error");
      setMessage("Group not found. Check the code/slug.");
      return;
    }

    // Request membership (RLS should enforce: self, pending, member)
    const { error: insErr } = await supabase.from("group_members").insert({
      group_id: group.id,
      user_id: auth.user.id,
      role: "member",
      status: "pending",
    });

    if (insErr) {
      // If they already requested, this may be a unique violation. You can soften the UX later.
      setStatus("error");
      setMessage(insErr.message);
      return;
    }

    setStatus("done");
    setMessage("Request sent. An admin needs to approve you.");
  }

  return (
    <div className="mx-auto w-full max-w-md px-4 py-8">
      <h1 className="text-xl font-semibold">Join a group</h1>
      <p className="mt-2 text-sm text-gray-600">
        Enter the group code (slug). Your request will be submitted for approval.
      </p>

      <label className="mt-6 block text-sm font-medium">Group code</label>
      <input
        className="mt-2 w-full rounded-lg border px-3 py-2"
        value={slug}
        onChange={(e) => setSlug(e.target.value)}
        placeholder="e.g. golfbats"
      />

      <button
        className="mt-4 w-full rounded-lg bg-black px-4 py-2 text-white disabled:opacity-50"
        onClick={submit}
        disabled={status === "submitting"}
      >
        {status === "submitting" ? "Submitting..." : "Request access"}
      </button>

      {message ? <p className="mt-4 text-sm">{message}</p> : null}
    </div>
  );
}
