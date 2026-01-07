/**
 * RapidAPI Golf Course Finder Provider Adapter
 * 
 * This API uses coordinate-based search (latitude/longitude + radius in miles)
 */

// RapidAPI endpoints - try common patterns
const API_BASE_URL = "https://golf-course-finder.p.rapidapi.com";
const RAPIDAPI_HOST = "golf-course-finder.p.rapidapi.com";

function getApiKey(): string {
  const key = process.env.RAPIDAPI_GOLF_COURSE_FINDER_KEY;
  if (!key) {
    throw new Error("RAPIDAPI_GOLF_COURSE_FINDER_KEY environment variable is required");
  }
  return key;
}

export type RapidApiGolfClub = {
  club_name: string;
  place_id: string; // This is the unique identifier
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  postal_code?: string;
  phone?: string;
  website?: string;
  latitude?: number;
  longitude?: number;
  number_of_holes?: number;
  golf_courses?: Array<{
    course_name: string;
    holes: number;
    par: number;
    course_type?: string;
    course_architect?: string;
    weekday_price?: string;
    weekend_price?: string;
    twilight_price?: string;
    currency?: string;
  }>;
  // Amenities and other fields
  [key: string]: any;
};

export type RapidApiGolfCourseDetails = RapidApiGolfClub; // Same structure for now

/**
 * Search courses by coordinates (latitude/longitude) within a radius
 * 
 * @param latitude - Latitude coordinate (required)
 * @param longitude - Longitude coordinate (required)
 * @param miles - Search radius in miles (optional, default: 50)
 * @param kilometers - Search radius in kilometers (optional, alternative to miles)
 */
export async function searchCoursesByCoordinates(
  latitude: number,
  longitude: number,
  miles?: number,
  kilometers?: number
): Promise<{ courses: RapidApiGolfClub[] }> {
  // The endpoint is /api/golf-clubs/ (from the actual API response)
  const url = new URL(`${API_BASE_URL}/api/golf-clubs/`);
  url.searchParams.set("latitude", String(latitude));
  url.searchParams.set("longitude", String(longitude));
  
  if (kilometers !== undefined) {
    url.searchParams.set("kilometers", String(kilometers));
  } else if (miles !== undefined) {
    url.searchParams.set("miles", String(miles));
  } else {
    // Default to 50 miles if neither specified
    url.searchParams.set("miles", "50");
  }

  const response = await fetch(url.toString(), {
    headers: {
      "X-RapidAPI-Key": getApiKey(),
      "X-RapidAPI-Host": RAPIDAPI_HOST,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(
      `RapidAPI Golf Course Finder search failed: ${response.status} ${response.statusText}. ` +
      `Response: ${errorText}. URL: ${url.toString()}`
    );
  }

  const data = await response.json();
  
  // API returns a direct array of club objects
  const clubs: RapidApiGolfClub[] = Array.isArray(data) ? data : [];
  
  return {
    courses: clubs, // We'll treat clubs as "courses" for now
  };
}

/**
 * Get detailed course information by place_id
 * Note: The API may not have a separate details endpoint.
 * For now, we'll search by coordinates and filter by place_id.
 */
export async function getCourseDetails(
  providerCourseId: string | number
): Promise<RapidApiGolfCourseDetails> {
  // The API might not have a direct details endpoint
  // We'll need to search and find by place_id
  // For now, throw an error suggesting to use search instead
  throw new Error(
    "Direct course details lookup not available. " +
    "Use searchCoursesByCoordinates and filter by place_id instead."
  );
}

/**
 * Test API connectivity
 */
export async function testApiConnection(): Promise<{
  works: boolean;
  sampleResponse: any;
  error?: string;
}> {
  try {
    // Test with a known location (Singapore coordinates)
    const testResult = await searchCoursesByCoordinates(1.3521, 103.8198, 10);
    return {
      works: true,
      sampleResponse: testResult,
    };
  } catch (error: any) {
    return {
      works: false,
      sampleResponse: null,
      error: error.message,
    };
  }
}

