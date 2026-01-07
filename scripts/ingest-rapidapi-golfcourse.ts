/**
 * RapidAPI Golf Course Finder Ingestion Script
 * 
 * Uses coordinate-based search to find courses in target countries.
 * 
 * Usage:
 *   npx tsx scripts/ingest-rapidapi-golfcourse.ts --countries=AU,SG,MY,TH,ID,JP
 *   npx tsx scripts/ingest-rapidapi-golfcourse.ts --countries=SG --limitPerCountry=10 --dryRun
 */

import { readFileSync, existsSync } from "fs";
import { join } from "path";

function loadEnvFile(filePath: string) {
  if (!existsSync(filePath)) return;
  const envFile = readFileSync(filePath, "utf-8");
  for (const line of envFile.split("\n")) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#")) {
      const match = trimmed.match(/^([^=]+)=(.*)$/);
      if (match) {
        const key = match[1].trim();
        let value = match[2].trim();
        if ((value.startsWith('"') && value.endsWith('"')) || 
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    }
  }
}

loadEnvFile(join(process.cwd(), ".env.local"));
loadEnvFile(join(process.cwd(), ".env"));

// Verify env var is loaded before importing provider
if (!process.env.RAPIDAPI_GOLF_COURSE_FINDER_KEY) {
  console.error("ERROR: RAPIDAPI_GOLF_COURSE_FINDER_KEY not found in environment");
  console.error("Please ensure it's set in .env.local");
  process.exit(1);
}

import { createClient } from "@supabase/supabase-js";
import { searchCoursesByCoordinates, getCourseDetails, testApiConnection } from "../src/app/lib/providers/rapidApiGolfCourseFinder";

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Major city coordinates for each country (latitude, longitude)
const countryCoordinates: Record<string, Array<{ name: string; lat: number; lon: number; radius: number }>> = {
  AU: [
    { name: "Sydney", lat: -33.8688, lon: 151.2093, radius: 50 },
    { name: "Melbourne", lat: -37.8136, lon: 144.9631, radius: 50 },
    { name: "Brisbane", lat: -27.4698, lon: 153.0251, radius: 50 },
    { name: "Perth", lat: -31.9505, lon: 115.8605, radius: 50 },
    { name: "Adelaide", lat: -34.9285, lon: 138.6007, radius: 50 },
  ],
  SG: [
    { name: "Singapore", lat: 1.3521, lon: 103.8198, radius: 30 }, // Small country
  ],
  MY: [
    { name: "Kuala Lumpur", lat: 3.1390, lon: 101.6869, radius: 50 },
    { name: "Penang", lat: 5.4164, lon: 100.3327, radius: 50 },
    { name: "Johor Bahru", lat: 1.4927, lon: 103.7414, radius: 50 },
  ],
  TH: [
    { name: "Bangkok", lat: 13.7563, lon: 100.5018, radius: 50 },
    { name: "Phuket", lat: 7.8804, lon: 98.3923, radius: 50 },
    { name: "Pattaya", lat: 12.9236, lon: 100.8825, radius: 50 },
  ],
  ID: [
    { name: "Batam", lat: 1.0456, lon: 104.0305, radius: 50 }, // Increased radius to 50 miles for better coverage
  ],
  JP: [
    { name: "Tokyo", lat: 35.6762, lon: 139.6503, radius: 50 },
    { name: "Osaka", lat: 34.6937, lon: 135.5023, radius: 50 },
    { name: "Yokohama", lat: 35.4437, lon: 139.6380, radius: 50 },
  ],
};

async function getClubId(): Promise<string> {
  const { data, error } = await supabase
    .from("clubs")
    .select("id")
    .limit(1)
    .single();

  if (error || !data) {
    throw new Error(`Failed to get club_id: ${error?.message || "No clubs found"}`);
  }

  return data.id;
}

function parseArgs() {
  const args = process.argv.slice(2);
  const config: {
    countries?: string[];
    limitPerCountry?: number;
    dryRun: boolean;
  } = {
    dryRun: false,
  };

  for (const arg of args) {
    if (arg.startsWith("--countries=")) {
      config.countries = arg.split("=")[1].split(",").map((c) => c.trim().toUpperCase());
    } else if (arg.startsWith("--limitPerCountry=")) {
      config.limitPerCountry = parseInt(arg.split("=")[1], 10);
    } else if (arg === "--dryRun") {
      config.dryRun = true;
    }
  }

  return config;
}

async function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelay = 500
): Promise<T> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      if (error.message?.includes("429") || error.message?.includes("5")) {
        const delayMs = baseDelay * Math.pow(2, attempt);
        console.warn(`Rate limited, backing off for ${delayMs}ms...`);
        await delay(delayMs);
        continue;
      }
      throw error;
    }
  }
  throw new Error("Max retries exceeded");
}

async function upsertCourse(
  clubId: string,
  providerCourseId: string | number,
  name: string,
  country?: string,
  dryRun = false
): Promise<string> {
  const { data: existingMapping } = await supabase
    .from("provider_course_map")
    .select("course_id")
    .eq("provider", "rapidapi-golf-course-finder")
    .eq("provider_course_id", String(providerCourseId))
    .single();

  if (existingMapping) {
    return existingMapping.course_id;
  }

  const courseId = crypto.randomUUID();
  
  if (!dryRun) {
    const { error: courseError } = await supabase.from("courses").insert({
      id: courseId,
      club_id: clubId,
      name: name.trim(),
      location: country || null,
    });

    if (courseError) {
      throw new Error(`Failed to create course: ${courseError.message}`);
    }

    const { error: mappingError } = await supabase.from("provider_course_map").insert({
      provider: "rapidapi-golf-course-finder",
      provider_course_id: String(providerCourseId),
      course_id: courseId,
    });

    if (mappingError) {
      throw new Error(`Failed to create mapping: ${mappingError.message}`);
    }
  }

  return courseId;
}

async function upsertTee(
  courseId: string,
  teeData: {
    label: string;
    totalMeters?: number;
    totalPar?: number;
    slope?: number;
    rating?: number;
  },
  dryRun = false
): Promise<string> {
  if (!dryRun) {
    const { data: existing } = await supabase
      .from("tees")
      .select("id")
      .eq("course_id", courseId)
      .eq("label", teeData.label)
      .single();

    if (existing) {
      const { error } = await supabase
        .from("tees")
        .update({
          meters: teeData.totalMeters || null,
          par: teeData.totalPar || null,
          slope: teeData.slope || null,
          rating: teeData.rating || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id);

      if (error) {
        throw new Error(`Failed to update tee: ${error.message}`);
      }

      return existing.id;
    }

    const teeId = crypto.randomUUID();
    const { error } = await supabase.from("tees").insert({
      id: teeId,
      course_id: courseId,
      label: teeData.label,
      meters: teeData.totalMeters || null,
      par: teeData.totalPar || null,
      slope: teeData.slope || null,
      rating: teeData.rating || null,
    });

    if (error) {
      throw new Error(`Failed to create tee: ${error.message}`);
    }

    return teeId;
  }

  return crypto.randomUUID();
}

async function upsertTeeHoles(
  teeId: string,
  holes: Array<{ hole_number: number; par?: number; meters?: number; stroke_index?: number }>,
  dryRun = false
) {
  if (dryRun || holes.length === 0) {
    return;
  }

  await supabase.from("tee_holes").delete().eq("tee_id", teeId);

  const holesToInsert = holes
    .filter((h) => h.hole_number >= 1 && h.hole_number <= 18)
    .map((h) => ({
      tee_id: teeId,
      hole_number: h.hole_number,
      par: h.par || null,
      meters: h.meters || null,
      stroke_index: h.stroke_index || null,
    }));

  if (holesToInsert.length > 0) {
    const { error } = await supabase.from("tee_holes").insert(holesToInsert);
    if (error) {
      throw new Error(`Failed to insert holes: ${error.message}`);
    }
  }
}

async function processClub(
  clubId: string,
  club: any, // RapidApiGolfClub
  dryRun = false
): Promise<{ success: boolean; errors: string[]; coursesCreated: number }> {
  const errors: string[] = [];
  let coursesCreated = 0;

  try {
    // Each club can have multiple golf_courses
    const golfCourses = club.golf_courses || [];
    
    if (golfCourses.length === 0) {
      // If no courses listed, create one entry for the club itself
      const courseName = club.club_name || "Unknown Club";
      const country = club.country || null;
      
      const courseId = await upsertCourse(
        clubId,
        club.place_id,
        courseName,
        country,
        dryRun
      );
      
      coursesCreated = 1;
    } else {
      // Create a course entry for each golf_course within the club
      for (const golfCourse of golfCourses) {
        const courseName = `${club.club_name}${golfCourse.course_name ? ` - ${golfCourse.course_name}` : ""}`;
        const country = club.country || null;
        
        // Use place_id + course_name as unique identifier
        const uniqueId = `${club.place_id}-${golfCourse.course_name || "default"}`;
        
        const courseId = await upsertCourse(
          clubId,
          uniqueId,
          courseName,
          country,
          dryRun
        );
        
        // TODO: Process tees and holes from golfCourse data
        // The API doesn't seem to provide tee/hole details in this response
        // We may need a separate endpoint or the data isn't available
        
        coursesCreated++;
      }
    }

    return { success: true, errors, coursesCreated };
  } catch (error: any) {
    return { success: false, errors: [error.message || String(error)], coursesCreated: 0 };
  }
}

async function main() {
  const config = parseArgs();

  console.log("RapidAPI Golf Course Finder Ingestion Script");
  console.log("=============================================");
  console.log("Config:", JSON.stringify(config, null, 2));
  console.log("");

  console.log("Testing API connection...");
  try {
    const apiTest = await testApiConnection();
    if (!apiTest.works) {
      console.error("ERROR: Failed to connect to RapidAPI Golf Course Finder");
      console.error("Error:", apiTest.error);
      process.exit(1);
    }
    console.log("✓ API connection successful");
    console.log(`  Sample results: ${apiTest.sampleResponse?.courses?.length || 0} courses found`);
    console.log("");
  } catch (error: any) {
    console.error("ERROR: Failed to connect to RapidAPI Golf Course Finder");
    console.error(error.message);
    process.exit(1);
  }

  const countries = config.countries || ["AU", "SG", "MY", "TH", "ID", "JP"];
  const clubId = await getClubId();

  let processedCount = 0;

  for (const countryCode of countries) {
    const coordinates = countryCoordinates[countryCode] || [];
    
    if (coordinates.length === 0) {
      console.log(`\n⚠ No coordinates configured for ${countryCode}`);
      continue;
    }

    console.log(`\nProcessing country: ${countryCode}`);
    
    const allClubs: any[] = [];
    const seenPlaceIds = new Set<string>();

    for (const coord of coordinates) {
      try {
        console.log(`  Searching near ${coord.name} (${coord.lat}, ${coord.lon}, ${coord.radius}mi)...`);
        const searchResult = await fetchWithRetry(() => 
          searchCoursesByCoordinates(coord.lat, coord.lon, coord.radius)
        );
        await delay(300);

        console.log(`    Found ${searchResult.courses.length} clubs`);

        for (const club of searchResult.courses) {
          const placeId = club.place_id;
          if (placeId && !seenPlaceIds.has(placeId)) {
            seenPlaceIds.add(placeId);
            allClubs.push(club);
          }
        }
      } catch (error: any) {
        console.error(`    ✗ Error: ${error.message}`);
      }
    }

    console.log(`  Total unique clubs found: ${allClubs.length}`);

    // Filter by country
    const countryNameMap: Record<string, string[]> = {
      AU: ["australia"],
      SG: ["singapore"],
      MY: ["malaysia"],
      TH: ["thailand"],
      ID: ["indonesia"],
      JP: ["japan"],
    };
    const expectedNames = countryNameMap[countryCode] || [];
    
    const filteredClubs = allClubs.filter((club) => {
      if (!club.country) return true; // Include if no country data
      const countryLower = club.country.toLowerCase();
      return expectedNames.some(name => countryLower.includes(name));
    });

    console.log(`  Filtered to ${filteredClubs.length} clubs for ${countryCode}`);

    if (filteredClubs.length > 0) {
      console.log(`  Sample results (first 5):`);
      filteredClubs.slice(0, 5).forEach((club, i) => {
        const courseCount = club.golf_courses?.length || 0;
        console.log(`    ${i + 1}. ${club.club_name} (${courseCount} course${courseCount !== 1 ? 's' : ''}, Country: ${club.country || "N/A"})`);
      });
    }

    let processed = 0;
    for (const club of filteredClubs) {
      if (config.limitPerCountry && processed >= config.limitPerCountry) {
        break;
      }

      console.log(`    Processing: ${club.club_name} (${club.golf_courses?.length || 0} course${(club.golf_courses?.length || 0) !== 1 ? 's' : ''})`);
      
      const result = await processClub(clubId, club, config.dryRun);
      
      if (result.success) {
        processed += result.coursesCreated;
        processedCount += result.coursesCreated;
        if (result.errors.length > 0) {
          console.log(`      ⚠ Warnings: ${result.errors.join(", ")}`);
        }
      } else {
        console.log(`      ✗ Failed: ${result.errors.join(", ")}`);
      }

      await delay(300);
    }

    console.log(`  ✓ Completed ${countryCode}: ${processed} courses processed`);
  }

  console.log(`\n✓ Total courses processed: ${processedCount}`);
  console.log("\n✓ Ingestion complete");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});

