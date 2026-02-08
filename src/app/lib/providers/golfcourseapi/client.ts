/**
 * GolfCourseAPI server-side client wrapper
 *
 * MUST run server-side only (API key must never reach client).
 * Uses GOLFCOURSE_API_KEY from env.
 *
 * Available endpoints (no bulk-list):
 * - GET /v1/healthcheck
 * - GET /v1/search?search_query=...
 * - GET /v1/courses/{id}
 */

import "server-only";

import {
  searchCourses as apiSearchCourses,
  getCourseDetails as apiGetCourseDetails,
  type GolfCourseApiCourse,
  type GolfCourseApiCourseDetails,
} from "../golfCourseApi";

const API_BASE_URL = "https://api.golfcourseapi.com/v1";

function getApiKey(): string {
  const key = process.env.GOLFCOURSE_API_KEY;
  if (!key) {
    throw new Error("GOLFCOURSE_API_KEY environment variable is required");
  }
  return key;
}

export type GolfCourseApiError = {
  status: number;
  message: string;
  bodySnippet?: string;
};

/** Typed error with status and response snippet */
export class GolfCourseApiClientError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly bodySnippet?: string
  ) {
    super(message);
    this.name = "GolfCourseApiClientError";
  }
}

/**
 * Healthcheck endpoint.
 * Returns 200 if API is reachable.
 */
export async function getHealthcheck(): Promise<{ ok: boolean }> {
  const url = `${API_BASE_URL}/healthcheck`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Key ${getApiKey()}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new GolfCourseApiClientError(
      `GolfCourseAPI healthcheck failed: ${response.status} ${response.statusText}`,
      response.status,
      body.slice(0, 200)
    );
  }

  return { ok: true };
}

/**
 * Search courses by query.
 * API does NOT support bulk-list; discovery is via search only.
 */
export async function searchCourses(
  searchQuery: string
): Promise<{ courses: GolfCourseApiCourse[] }> {
  const result = await apiSearchCourses(searchQuery);
  return { courses: result.courses };
}

/**
 * Get full course details by ID (including tees and holes).
 * ID can be number or string.
 */
export async function getCourseById(
  id: string | number
): Promise<GolfCourseApiCourseDetails> {
  return apiGetCourseDetails(id);
}
