/**
 * GolfCourseAPI Provider Adapter
 * 
 * NOTE: This adapter assumes GolfCourseAPI supports:
 * - Country-based search with pagination
 * - Course detail endpoints that return tee and hole data
 * 
 * If the API does NOT support these features, this code will fail at runtime
 * and you should report the actual API structure before proceeding.
 */

const API_BASE_URL = "https://api.golfcourseapi.com/v1";

function getApiKey(): string {
  const key = process.env.GOLFCOURSE_API_KEY;
  if (!key) {
    throw new Error("GOLFCOURSE_API_KEY environment variable is required");
  }
  return key;
}

export type GolfCourseApiCourse = {
  id: number; // provider_course_id (integer)
  club_name: string;
  course_name: string;
  location?: {
    address?: string;
    city?: string;
    state?: string;
    country?: string;
    latitude?: number;
    longitude?: number;
  };
};

export type GolfCourseApiTee = {
  tee_name: string;
  course_rating?: number;
  slope_rating?: number;
  bogey_rating?: number;
  total_yards?: number;
  total_meters?: number;
  number_of_holes?: number;
  par_total?: number;
  front_course_rating?: number;
  front_slope_rating?: number;
  front_bogey_rating?: number;
  back_course_rating?: number;
  back_slope_rating?: number;
  back_bogey_rating?: number;
  holes?: GolfCourseApiHole[];
};

export type GolfCourseApiHole = {
  par: number;
  yardage: number;
  handicap: number; // This is stroke index
};

export type GolfCourseApiCourseDetails = {
  id: number;
  club_name: string;
  course_name: string;
  location?: {
    address?: string;
    city?: string;
    state?: string;
    country?: string;
    latitude?: number;
    longitude?: number;
  };
  tees: {
    female?: GolfCourseApiTee[];
    male?: GolfCourseApiTee[];
  };
};

/**
 * Search courses by query string
 * 
 * NOTE: GolfCourseAPI does NOT support country filtering or pagination.
 * This function searches by course/club name. To filter by country, you must:
 * 1. Search with country name in query, OR
 * 2. Get all results and filter client-side
 */
export async function searchCourses(
  searchQuery: string,
  page?: number // Not supported by API, kept for compatibility
): Promise<{ courses: GolfCourseApiCourse[]; hasMore: boolean; totalPages?: number }> {
  const url = new URL(`${API_BASE_URL}/search`);
  url.searchParams.set("search_query", searchQuery);

  const response = await fetch(url.toString(), {
    headers: {
      "Authorization": `Key ${getApiKey()}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(
      `GolfCourseAPI search failed: ${response.status} ${response.statusText}. ` +
      `Response: ${errorText}. URL: ${url.toString()}`
    );
  }

  const data = await response.json();
  
  // API returns: { courses: [...] }
  const courses = data.courses || [];
  
  // API does NOT support pagination - all results returned in one call
  return {
    courses: courses as GolfCourseApiCourse[],
    hasMore: false, // No pagination support
    totalPages: 1,
  };
}

/**
 * Get detailed course information including tees and holes
 * 
 * Course ID must be an integer (not string)
 */
export async function getCourseDetails(
  providerCourseId: number | string
): Promise<GolfCourseApiCourseDetails> {
  // Ensure ID is treated as integer
  const courseId = typeof providerCourseId === "string" ? parseInt(providerCourseId, 10) : providerCourseId;
  const url = `${API_BASE_URL}/courses/${courseId}`;

  const response = await fetch(url, {
    headers: {
      "Authorization": `Key ${getApiKey()}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    if (response.status === 404) {
      throw new Error(`Course ${providerCourseId} not found. Response: ${errorText}`);
    }
    throw new Error(
      `GolfCourseAPI details failed: ${response.status} ${response.statusText}. ` +
      `Response: ${errorText}. URL: ${url}`
    );
  }

  const data = await response.json();
  
  // API returns: { id, club_name, course_name, location: {...}, tees: { female: [...], male: [...] } }
  // Combine male and female tees into a single array
  const allTees: GolfCourseApiTee[] = [
    ...(data.tees?.male || []),
    ...(data.tees?.female || []),
  ];
  
  return {
    id: data.id,
    club_name: data.club_name,
    course_name: data.course_name,
    location: data.location,
    tees: {
      male: data.tees?.male || [],
      female: data.tees?.female || [],
    },
  };
}

/**
 * Test API connectivity
 * 
 * NOTE: GolfCourseAPI does NOT support country filtering or pagination.
 * Search is by course/club name only.
 */
export async function testApiConnection(): Promise<{
  supportsCountryFilter: boolean;
  supportsPagination: boolean;
  sampleResponse: any;
}> {
  try {
    // Try a basic search to verify API works
    const testResult = await searchCourses("golf");
    return {
      supportsCountryFilter: false, // API only supports name-based search
      supportsPagination: false, // API returns all results in one call
      sampleResponse: testResult,
    };
  } catch (error: any) {
    return {
      supportsCountryFilter: false,
      supportsPagination: false,
      sampleResponse: { error: error.message },
    };
  }
}

