/**
 * GolfCourseAPI Ingestion Script
 * 
 * Ingests course data from GolfCourseAPI into Supabase for specified countries.
 * 
 * Usage:
 *   npx tsx scripts/ingest-golfcourseapi.ts --countries=AU,SG,MY,TH,ID,JP
 *   npx tsx scripts/ingest-golfcourseapi.ts --countries=AU --limitPerCountry=10 --dryRun
 *   npx tsx scripts/ingest-golfcourseapi.ts --resumeFromCountry=SG --resumeFromPage=3
 *   npx tsx scripts/ingest-golfcourseapi.ts --refreshCourse=course-id-123
 */

// Load environment variables from .env.local
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
        // Remove quotes if present
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

// Try .env.local first, then .env
loadEnvFile(join(process.cwd(), ".env.local"));
loadEnvFile(join(process.cwd(), ".env"));

import { createClient } from "@supabase/supabase-js";
import { searchCourses, getCourseDetails, testApiConnection } from "../src/app/lib/providers/golfCourseApi";

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const GOLFCOURSE_API_KEY = process.env.GOLFCOURSE_API_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables are required");
}

if (!GOLFCOURSE_API_KEY) {
  throw new Error("GOLFCOURSE_API_KEY environment variable is required");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Get club_id (assuming single club for now)
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

// Parse CLI arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const config: {
    countries?: string[];
    limitPerCountry?: number;
    dryRun: boolean;
    resumeFromCountry?: string;
    resumeFromPage?: number;
    refreshCourse?: string;
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
    } else if (arg.startsWith("--resumeFromCountry=")) {
      config.resumeFromCountry = arg.split("=")[1].toUpperCase();
    } else if (arg.startsWith("--resumeFromPage=")) {
      config.resumeFromPage = parseInt(arg.split("=")[1], 10);
    } else if (arg.startsWith("--refreshCourse=")) {
      config.refreshCourse = arg.split("=")[1];
    }
  }

  return config;
}

// Rate limiting helper
async function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Backoff on rate limit errors
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

// Upsert course with provider mapping
async function upsertCourse(
  clubId: string,
  providerCourseId: string,
  name: string,
  country?: string,
  dryRun = false
): Promise<string> {
  // Check if mapping exists
  const { data: existingMapping } = await supabase
    .from("provider_course_map")
    .select("course_id")
    .eq("provider", "golfcourseapi")
    .eq("provider_course_id", providerCourseId)
    .single();

  if (existingMapping) {
    return existingMapping.course_id;
  }

  // Create new course
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
      provider: "golfcourseapi",
      provider_course_id: providerCourseId,
      course_id: courseId,
    });

    if (mappingError) {
      throw new Error(`Failed to create mapping: ${mappingError.message}`);
    }
  }

  return courseId;
}

// Upsert tee
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
    // Check if tee exists
    const { data: existing } = await supabase
      .from("tees")
      .select("id")
      .eq("course_id", courseId)
      .eq("label", teeData.label)
      .single();

    if (existing) {
      // Update existing tee
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

    // Create new tee
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

  return crypto.randomUUID(); // Dummy ID for dry run
}

// Upsert tee holes
async function upsertTeeHoles(
  teeId: string,
  holes: Array<{ hole_number: number; par?: number; meters?: number; stroke_index?: number }>,
  dryRun = false
) {
  if (dryRun || holes.length === 0) {
    return;
  }

  // Delete existing holes for this tee
  await supabase.from("tee_holes").delete().eq("tee_id", teeId);

  // Insert new holes
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

// Process a single course
async function processCourse(
  clubId: string,
  providerCourseId: number | string,
  dryRun = false
): Promise<{ success: boolean; errors: string[] }> {
  const errors: string[] = [];

  try {
    const details = await fetchWithRetry(() => getCourseDetails(providerCourseId));
    await delay(250); // Rate limit

    const courseName = `${details.club_name}${details.course_name ? ` - ${details.course_name}` : ""}`;
    const country = details.location?.country || undefined;

    const courseId = await upsertCourse(
      clubId,
      String(details.id), // Store as string in provider_course_map
      courseName,
      country,
      dryRun
    );

    // Combine male and female tees
    const allTees = [
      ...(details.tees.male || []),
      ...(details.tees.female || []),
    ];

    if (allTees.length === 0) {
      errors.push(`No tees found for ${courseName}`);
      return { success: true, errors }; // Continue despite missing tees
    }

    for (const tee of allTees) {
      try {
        const teeId = await upsertTee(
          courseId,
          {
            label: tee.tee_name,
            totalMeters: tee.total_meters || (tee.total_yards ? Math.round(tee.total_yards * 0.9144) : undefined),
            totalPar: tee.par_total,
            slope: tee.slope_rating,
            rating: tee.course_rating,
          },
          dryRun
        );

        if (tee.holes && tee.holes.length > 0) {
          // Convert API hole format to our format
          const holesForDb = tee.holes.map((hole, index) => ({
            hole_number: index + 1,
            par: hole.par,
            meters: hole.yardage ? Math.round(hole.yardage * 0.9144) : undefined,
            stroke_index: hole.handicap,
          }));
          await upsertTeeHoles(teeId, holesForDb, dryRun);
        } else {
          errors.push(`No holes found for ${courseName} - ${tee.tee_name}`);
        }
      } catch (teeError: any) {
        errors.push(`Tee ${tee.tee_name}: ${teeError.message}`);
      }
    }

    return { success: true, errors };
  } catch (error: any) {
    return { success: false, errors: [error.message || String(error)] };
  }
}

// Main ingestion function
async function main() {
  const config = parseArgs();

  console.log("GolfCourseAPI Ingestion Script");
  console.log("================================");
  console.log("Config:", JSON.stringify(config, null, 2));
  console.log("");

  // Test API connection first
  console.log("Testing API connection...");
  try {
    const apiTest = await testApiConnection();
    console.log("✓ API connection successful");
    console.log(`  - Country filtering: ${apiTest.supportsCountryFilter} (API uses name-based search)`);
    console.log(`  - Pagination: ${apiTest.supportsPagination} (API returns all results at once)`);
    console.log(`  - Sample results: ${apiTest.sampleResponse?.courses?.length || 0} courses found`);
    console.log("");
    console.log("NOTE: GolfCourseAPI does NOT support country filtering or pagination.");
    console.log("      We will search by country name and filter results client-side.");
    console.log("");
  } catch (error: any) {
    console.error("ERROR: Failed to connect to GolfCourseAPI");
    console.error(error.message);
    process.exit(1);
  }

  if (config.refreshCourse) {
    // Refresh single course
    const clubId = await getClubId();
    console.log(`Refreshing course: ${config.refreshCourse}`);
    const result = await processCourse(clubId, config.refreshCourse, config.dryRun);
    console.log(result.success ? "✓ Success" : "✗ Failed");
    if (result.errors.length > 0) {
      console.log("Warnings:", result.errors);
    }
    return;
  }

  // Bulk ingestion
  // Map country codes to search terms (use city names and country names)
  // The API search works better with city names than country names
  const countrySearchTerms: Record<string, string[]> = {
    AU: ["sydney", "melbourne", "brisbane", "perth", "adelaide", "australia"],
    SG: ["singapore", "sentosa", "marina bay"],
    MY: ["kuala lumpur", "malaysia", "penang"],
    TH: ["bangkok", "phuket", "thailand", "pattaya"],
    ID: ["jakarta", "bali", "batam", "nongsapura", "indonesia"],
    JP: ["tokyo", "osaka", "japan", "yokohama"],
  };

  const countries = config.countries || ["AU", "SG", "MY", "TH", "ID", "JP"];
  const clubId = await getClubId();

  let shouldResume = !!config.resumeFromCountry;
  let processedCount = 0;

  for (const countryCode of countries) {
    if (shouldResume && countryCode !== config.resumeFromCountry) {
      continue;
    }
    if (countryCode === config.resumeFromCountry) {
      shouldResume = false;
    }

    const searchTerms = countrySearchTerms[countryCode] || [countryCode];
    const countryName = searchTerms[0] || countryCode;
    console.log(`\nProcessing country: ${countryCode} (search terms: ${searchTerms.join(", ")})`);

    try {
      // Try multiple search terms and combine results
      const allCourses: Array<{ id: number; club_name: string; course_name: string; location?: any }> = [];
      const seenIds = new Set<number>();

      for (const searchTerm of searchTerms) {
        console.log(`  Searching for: "${searchTerm}"...`);
        const searchResult = await fetchWithRetry(() => searchCourses(searchTerm));
        await delay(250);

        console.log(`    Found ${searchResult.courses.length} results`);
        
        // Add unique courses (by ID)
        for (const course of searchResult.courses) {
          if (!seenIds.has(course.id)) {
            seenIds.add(course.id);
            allCourses.push(course);
          }
        }
      }

      console.log(`  Total unique courses found: ${allCourses.length}`);

      // Debug: Show sample of raw results
      if (allCourses.length > 0) {
        console.log(`  Sample results (showing first 5):`);
        allCourses.slice(0, 5).forEach((c, i) => {
          const loc = c.location || {};
          console.log(`    ${i + 1}. ${c.club_name}${c.course_name ? ` - ${c.course_name}` : ''}`);
          console.log(`       Location: ${loc.city || 'N/A'}, ${loc.state || 'N/A'}, ${loc.country || 'N/A'}`);
          if (loc.address) console.log(`       Address: ${loc.address.substring(0, 80)}`);
        });
      }

      // Filter results by country using ALL available location fields
      // The API search is name-based, so we need to check multiple fields
      const filteredCourses = allCourses.filter((course) => {
        const loc = course.location || {};
        const country = (loc.country || "").toLowerCase();
        const state = (loc.state || "").toLowerCase();
        const city = (loc.city || "").toLowerCase();
        const address = (loc.address || "").toLowerCase();
        const clubName = (course.club_name || "").toLowerCase();
        const courseName = (course.course_name || "").toLowerCase();
        
        const countryCodeLower = countryCode.toLowerCase();
        
        // Check country field first (most reliable)
        // API uses full country names like "Australia", "United States", "Republic of Korea", etc.
        const countryNameMap: Record<string, string[]> = {
          AU: ["australia"],
          SG: ["singapore", "republic of singapore"],
          MY: ["malaysia"],
          TH: ["thailand"],
          ID: ["indonesia", "republic of indonesia"],
          JP: ["japan"],
        };
        const expectedCountryNames = countryNameMap[countryCode] || [];
        
        // Check if any expected country name appears in the country field
        for (const expectedName of expectedCountryNames) {
          if (country.includes(expectedName)) {
            return true;
          }
        }
        
        // Also check country code as fallback
        if (country.includes(countryCodeLower)) {
          return true;
        }
        
        // Check if country code appears in state/city/address
        if (state.includes(countryCodeLower) || 
            city.includes(countryCodeLower) || 
            address.includes(countryCodeLower)) {
          return true;
        }
        
        // Check if any expected country name appears in address
        for (const expectedName of expectedCountryNames) {
          if (address.includes(expectedName)) {
            return true;
          }
        }
        
        // Last resort: check if country code appears in club/course name
        // (less reliable, but some courses might have country in name)
        if (clubName.includes(countryCodeLower) || courseName.includes(countryCodeLower)) {
          return true;
        }
        
        return false;
      });

      console.log(`  Found ${filteredCourses.length} courses (${allCourses.length} total, filtered to ${countryCode})`);

      let processed = 0;
      for (const course of filteredCourses) {
        if (config.limitPerCountry && processed >= config.limitPerCountry) {
          break;
        }

        const courseName = `${course.club_name}${course.course_name ? ` - ${course.course_name}` : ""}`;
        console.log(`    Processing: ${courseName} (ID: ${course.id})`);
        const result = await processCourse(clubId, course.id, config.dryRun);
        
        if (result.success) {
          processed++;
          processedCount++;
          if (result.errors.length > 0) {
            console.log(`      ⚠ Warnings: ${result.errors.join(", ")}`);
          }
        } else {
          console.log(`      ✗ Failed: ${result.errors.join(", ")}`);
        }

        await delay(300); // Rate limit between courses
      }

      console.log(`  ✓ Completed ${countryCode}: ${processed} courses processed`);
    } catch (error: any) {
      console.error(`  ✗ Error processing ${countryCode}: ${error.message}`);
    }
  }

  console.log(`\n✓ Total courses processed: ${processedCount}`);

  console.log("\n✓ Ingestion complete");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});

