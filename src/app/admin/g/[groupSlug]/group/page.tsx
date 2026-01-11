"use client";

import { useEffect, useMemo, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { getCountryOptions } from "../../../../lib/countryCodes";
import { useGroup } from "../GroupContext";

type GroupData = {
  id: string;
  name: string;
  slug: string;
  visibility: "private" | "discoverable";
  description: string | null;
  base_country: string | null;
  base_city: string | null;
};

type FormData = {
  name: string;
  visibility: "private" | "discoverable";
  description: string;
  base_country: string;
  base_city: string;
};

type FormErrors = {
  name?: string;
  description?: string;
  base_country?: string;
  base_city?: string;
};

export default function GroupSettingsPage() {
  const group = useGroup();
  const groupId = group.id;

  const supabase = useMemo(() => {
    return createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }, []);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [groupData, setGroupData] = useState<GroupData | null>(null);
  const [availableCities, setAvailableCities] = useState<string[]>([]);
  const [citySearchQuery, setCitySearchQuery] = useState("");
  const [showCityCustomInput, setShowCityCustomInput] = useState(false);

  // Form state
  const [formData, setFormData] = useState<FormData>({
    name: "",
    visibility: "private",
    description: "",
    base_country: "",
    base_city: "",
  });

  // Track original values to determine if form is dirty
  const [originalData, setOriginalData] = useState<FormData | null>(null);

  // Load group data
  useEffect(() => {
    if (!groupId) return;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const { data, error: fetchError } = await supabase
          .from("groups")
          .select("id, name, slug, visibility, description, base_country, base_city")
          .eq("id", groupId)
          .eq("is_active", true)
          .maybeSingle();

        if (fetchError) {
          setError(fetchError.message);
          setLoading(false);
          return;
        }

        if (!data) {
          setError("Group not found.");
          setLoading(false);
          return;
        }

        setGroupData(data as GroupData);
        const initialFormData: FormData = {
          name: data.name || "",
          visibility: (data.visibility as "private" | "discoverable") || "private",
          description: data.description || "",
          base_country: data.base_country || "",
          base_city: data.base_city || "",
        };
        setFormData(initialFormData);
        setOriginalData(initialFormData);

        // Load cities for selected country if discoverable
        if (initialFormData.visibility === "discoverable" && initialFormData.base_country) {
          await loadCitiesForCountry(initialFormData.base_country);
        }
      } catch (err: unknown) {
        console.error("Error loading group:", err);
        setError(err instanceof Error ? err.message : "Failed to load group data.");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [supabase, groupId]);

  // Load cities when country changes (only if discoverable)
  useEffect(() => {
    if (formData.visibility === "discoverable" && formData.base_country) {
      loadCitiesForCountry(formData.base_country);
    } else {
      setAvailableCities([]);
      if (formData.visibility === "private") {
        setFormData((prev) => ({ ...prev, base_country: "", base_city: "" }));
      }
    }
  }, [formData.base_country, formData.visibility]);

  async function loadCitiesForCountry(countryCode: string) {
    try {
      const { data, error: citiesError } = await supabase
        .from("groups")
        .select("base_city")
        .eq("base_country", countryCode.toUpperCase())
        .not("base_city", "is", null)
        .neq("base_city", "");

      if (citiesError) {
        console.warn("Failed to load cities:", citiesError);
        return;
      }

      // Get unique cities, trim and filter empty
      const cities = Array.from(
        new Set(
          (data || [])
            .map((g) => g.base_city?.trim())
            .filter((c): c is string => !!c && c.length > 0)
        )
      ).sort();

      setAvailableCities(cities);
    } catch (err) {
      console.warn("Error loading cities:", err);
    }
  }

  // Validation
  const validate = (): FormErrors => {
    const errors: FormErrors = {};

    // Name: required, trim, 2-60 chars
    const trimmedName = formData.name.trim();
    if (!trimmedName) {
      errors.name = "Group name is required.";
    } else if (trimmedName.length < 2) {
      errors.name = "Group name must be at least 2 characters.";
    } else if (trimmedName.length > 60) {
      errors.name = "Group name must be no more than 60 characters.";
    }

    // Description: trim, <= 280 chars
    const trimmedDescription = formData.description.trim();
    if (trimmedDescription.length > 280) {
      errors.description = "Description must be no more than 280 characters.";
    }

    // If discoverable, country and city are required
    if (formData.visibility === "discoverable") {
      if (!formData.base_country) {
        errors.base_country = "Country is required for discoverable groups.";
      } else if (!/^[A-Z]{2}$/.test(formData.base_country)) {
        errors.base_country = "Country must be a valid 2-letter code.";
      }

      const trimmedCity = formData.base_city.trim();
      if (!trimmedCity) {
        errors.base_city = "City is required for discoverable groups.";
      } else if (trimmedCity.length > 60) {
        errors.base_city = "City must be no more than 60 characters.";
      }

      // Description should be required for discoverable groups (to keep public directory clean)
      if (!trimmedDescription) {
        errors.description = "Description is required for discoverable groups.";
      }
    }

    return errors;
  };

  const errors = useMemo(() => validate(), [formData]);

  // Check if form is dirty
  const isDirty = useMemo(() => {
    if (!originalData) return false;
    return (
      formData.name !== originalData.name ||
      formData.visibility !== originalData.visibility ||
      formData.description !== originalData.description ||
      formData.base_country !== originalData.base_country ||
      formData.base_city !== originalData.base_city
    );
  }, [formData, originalData]);

  // Check if form is valid
  const isValid = useMemo(() => {
    return Object.keys(errors).length === 0;
  }, [errors]);

  // Save handler
  async function handleSave() {
    if (!isDirty || !isValid || !groupId) return;

    setSaving(true);
    setError(null);
    setSuccess(false);

    try {
      const updateData: Partial<GroupData> = {
        name: formData.name.trim(),
        visibility: formData.visibility,
        description: formData.description.trim() || null,
        base_country: formData.visibility === "discoverable" ? formData.base_country.toUpperCase() : null,
        base_city: formData.visibility === "discoverable" ? formData.base_city.trim() : null,
      };

      const { error: updateError } = await supabase
        .from("groups")
        .update(updateData)
        .eq("id", groupId);

      if (updateError) {
        // Map DB constraint errors to human-readable messages
        let errorMessage = updateError.message;
        if (errorMessage.includes("groups_visibility_check")) {
          errorMessage = "Visibility must be either 'private' or 'discoverable'.";
        } else if (errorMessage.includes("groups_base_country_check")) {
          errorMessage = "Country must be a valid 2-letter uppercase code (e.g., SG, MY, ID).";
        } else if (errorMessage.includes("groups_base_city_check")) {
          errorMessage = "City must be between 1 and 60 characters.";
        } else if (errorMessage.includes("groups_description_check")) {
          errorMessage = "Description must be no more than 280 characters.";
        }
        throw new Error(errorMessage);
      }

      // Update original data to mark form as clean
      setOriginalData({ ...formData });
      setSuccess(true);

      // Clear success message after 3 seconds
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save group settings.");
    } finally {
      setSaving(false);
    }
  }

  // Copy slug to clipboard
  async function copySlug() {
    if (!groupData?.slug) return;
    try {
      await navigator.clipboard.writeText(groupData.slug);
      // You could show a toast here if you had a toast system
    } catch (err) {
      console.error("Failed to copy slug:", err);
    }
  }

  const filteredCities = useMemo(() => {
    if (!citySearchQuery.trim()) return availableCities;
    const query = citySearchQuery.toLowerCase();
    return availableCities.filter((city) => city.toLowerCase().includes(query));
  }, [availableCities, citySearchQuery]);

  const countryOptions = getCountryOptions();

  if (loading) {
    return (
      <div className="rounded-xl border bg-surface p-6 text-center text-sm text-foreground">
        Loading…
      </div>
    );
  }

  if (!groupData) {
    return (
      <div className="rounded-xl border border-border bg-surface p-6 text-center text-sm text-foreground">
        {error || "Group not found."}
      </div>
    );
  }

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Group</h1>
        <p className="mt-1 text-sm text-muted">
          Manage your group's name, visibility and public listing details.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-border bg-surface p-4 text-sm text-foreground">
          {error}
        </div>
      )}

      {success && (
        <div className="rounded-xl border border-brand-green bg-brand-green/10 p-4 text-sm text-brand-green">
          Settings saved successfully.
        </div>
      )}

      {/* A) Identity Section */}
      <section className="rounded-xl border bg-surface p-6 shadow-sm">
        <h2 className="mb-4 text-base font-semibold text-foreground">Identity</h2>

        <div className="space-y-4">
          {/* Group Name */}
          <div>
            <label htmlFor="group-name" className="block text-sm font-medium text-foreground mb-1">
              Group name
            </label>
            <input
              id="group-name"
              type="text"
              value={formData.name}
              onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
              className={`w-full rounded-lg border px-4 py-2 text-sm focus:outline-none ${
                errors.name ? "border-red-500" : "border-border focus:border-foreground"
              }`}
              maxLength={60}
            />
            {errors.name && (
              <p className="mt-1 text-xs text-red-500">{errors.name}</p>
            )}
          </div>

          {/* Slug / Join Code (Read-only) */}
          <div>
            <label htmlFor="group-slug" className="block text-sm font-medium text-foreground mb-1">
              Join code
            </label>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <input
                  id="group-slug"
                  type="text"
                  value={groupData.slug}
                  readOnly
                  className="w-full rounded-lg border border-border bg-background px-4 py-2 pr-10 text-sm text-muted cursor-not-allowed"
                />
                <svg
                  className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                  />
                </svg>
              </div>
              <button
                type="button"
                onClick={copySlug}
                className="rounded-lg border border-border bg-surface px-4 py-2 text-sm text-foreground hover:bg-background"
              >
                Copy
              </button>
            </div>
            <p className="mt-1 text-xs text-muted">
              Permanent identifier — can't be changed after creation.
            </p>
          </div>
        </div>
      </section>

      {/* B) Visibility Section */}
      <section className="rounded-xl border bg-surface p-6 shadow-sm">
        <h2 className="mb-4 text-base font-semibold text-foreground">Visibility</h2>

        <div className="space-y-3">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setFormData((prev) => ({ ...prev, visibility: "private" }))}
              className={`flex-1 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors ${
                formData.visibility === "private"
                  ? "border-foreground bg-foreground text-white"
                  : "border-border bg-surface text-foreground hover:bg-background"
              }`}
            >
              Private
            </button>
            <button
              type="button"
              onClick={() => setFormData((prev) => ({ ...prev, visibility: "discoverable" }))}
              className={`flex-1 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors ${
                formData.visibility === "discoverable"
                  ? "border-foreground bg-foreground text-white"
                  : "border-border bg-surface text-foreground hover:bg-background"
              }`}
            >
              Discoverable
            </button>
          </div>

          <p className="text-xs text-muted">
            Discoverable groups can be found in search, but still require admin approval.
          </p>
        </div>
      </section>

      {/* C) Public Profile Section */}
      {formData.visibility === "discoverable" && (
        <section className="rounded-xl border bg-surface p-6 shadow-sm">
          <h2 className="mb-4 text-base font-semibold text-foreground">Public profile</h2>

          <div className="space-y-4">
            {/* Description */}
            <div>
              <label htmlFor="description" className="block text-sm font-medium text-foreground mb-1">
                Description
              </label>
              <textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
                rows={4}
                maxLength={280}
                className={`w-full rounded-lg border px-4 py-2 text-sm focus:outline-none resize-none ${
                  errors.description ? "border-red-500" : "border-border focus:border-foreground"
                }`}
                placeholder="Describe your group..."
              />
              <div className="mt-1 flex items-center justify-between">
                {errors.description && (
                  <p className="text-xs text-red-500">{errors.description}</p>
                )}
                {!errors.description && <div />}
                <p className="text-xs text-muted">
                  {formData.description.length}/280
                </p>
              </div>
            </div>

            {/* Location: Country and City in two columns on desktop */}
            <div className="grid gap-4 md:grid-cols-2">
              {/* Country */}
              <div>
                <label htmlFor="country" className="block text-sm font-medium text-foreground mb-1">
                  Country <span className="text-red-500">*</span>
                </label>
                <select
                  id="country"
                  value={formData.base_country}
                  onChange={(e) => {
                    setFormData((prev) => ({
                      ...prev,
                      base_country: e.target.value,
                      base_city: "", // Clear city when country changes
                    }));
                    setCitySearchQuery("");
                    setShowCityCustomInput(false);
                  }}
                  className={`w-full rounded-lg border px-4 py-2 text-sm focus:outline-none ${
                    errors.base_country ? "border-red-500" : "border-border focus:border-foreground"
                  }`}
                >
                  <option value="">Select a country</option>
                  {countryOptions.map((opt) => (
                    <option key={opt.code} value={opt.code}>
                      {opt.name}
                    </option>
                  ))}
                </select>
                {errors.base_country && (
                  <p className="mt-1 text-xs text-red-500">{errors.base_country}</p>
                )}
              </div>

              {/* City */}
              {formData.base_country && (
                <div>
                <label htmlFor="city" className="block text-sm font-medium text-foreground mb-1">
                  City <span className="text-red-500">*</span>
                </label>
                {!showCityCustomInput ? (
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <input
                          type="text"
                          value={citySearchQuery}
                          onChange={(e) => setCitySearchQuery(e.target.value)}
                          placeholder="Search cities..."
                          className="w-full rounded-lg border border-border px-4 py-2 text-sm focus:border-foreground focus:outline-none"
                        />
                        {citySearchQuery && (
                          <button
                            type="button"
                            onClick={() => setCitySearchQuery("")}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-foreground"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                      <select
                        id="city"
                        value={formData.base_city}
                        onChange={(e) => setFormData((prev) => ({ ...prev, base_city: e.target.value }))}
                        className={`flex-1 rounded-lg border px-4 py-2 text-sm focus:outline-none ${
                          errors.base_city ? "border-red-500" : "border-border focus:border-foreground"
                        }`}
                      >
                        <option value="">Select a city</option>
                        {filteredCities.map((city) => (
                          <option key={city} value={city}>
                            {city}
                          </option>
                        ))}
                      </select>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setShowCityCustomInput(true);
                        setCitySearchQuery("");
                        setFormData((prev) => ({ ...prev, base_city: "" }));
                      }}
                      className="text-xs text-muted hover:text-foreground underline"
                    >
                      Add custom city
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <input
                      id="city"
                      type="text"
                      value={formData.base_city}
                      onChange={(e) => setFormData((prev) => ({ ...prev, base_city: e.target.value }))}
                      placeholder="Enter city name"
                      maxLength={60}
                      className={`w-full rounded-lg border px-4 py-2 text-sm focus:outline-none ${
                        errors.base_city ? "border-red-500" : "border-border focus:border-foreground"
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setShowCityCustomInput(false);
                        setFormData((prev) => ({ ...prev, base_city: "" }));
                      }}
                      className="text-xs text-muted hover:text-foreground underline"
                    >
                      Select from existing cities
                    </button>
                  </div>
                )}
                  {errors.base_city && (
                    <p className="mt-1 text-xs text-red-500">{errors.base_city}</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* D) Save Button */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleSave}
          disabled={!isDirty || !isValid || saving}
          className="rounded-lg bg-brand-green px-6 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
      </div>
    </div>
  );
}
