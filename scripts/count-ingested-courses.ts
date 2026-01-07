// Count how many courses we've ingested
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { createClient } from "@supabase/supabase-js";

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

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function count() {
  console.log("Counting ingested courses...\n");
  
  // Count courses
  const { count: courseCount, error: courseError } = await supabase
    .from("courses")
    .select("*", { count: "exact", head: true });
  
  if (courseError) {
    console.error("Error counting courses:", courseError);
  } else {
    console.log("Total courses: " + courseCount);
  }
  
  // Count tees
  const { count: teeCount, error: teeError } = await supabase
    .from("tees")
    .select("*", { count: "exact", head: true });
  
  if (teeError) {
    console.error("Error counting tees:", teeError);
  } else {
    console.log("Total tees: " + teeCount);
  }
  
  // Count tee_holes
  const { count: holeCount, error: holeError } = await supabase
    .from("tee_holes")
    .select("*", { count: "exact", head: true });
  
  if (holeError) {
    console.error("Error counting tee_holes:", holeError);
  } else {
    console.log("Total tee_holes: " + holeCount);
  }
  
  // Count provider mappings
  const { count: mapCount, error: mapError } = await supabase
    .from("provider_course_map")
    .select("*", { count: "exact", head: true });
  
  if (mapError) {
    console.error("Error counting provider_course_map:", mapError);
  } else {
    console.log("Total provider_course_map entries: " + mapCount);
  }
  
  // Show breakdown by provider
  const { data: providerData, error: providerError } = await supabase
    .from("provider_course_map")
    .select("provider");
  
  if (!providerError && providerData) {
    const providerCounts: Record<string, number> = {};
    providerData.forEach(row => {
      providerCounts[row.provider] = (providerCounts[row.provider] || 0) + 1;
    });
    
    console.log("\nBreakdown by provider:");
    for (const [provider, count] of Object.entries(providerCounts)) {
      console.log("  " + provider + ": " + count);
    }
  }
  
  // Show breakdown by country (from courses.location)
  const { data: courseData, error: countryError } = await supabase
    .from("courses")
    .select("location");
  
  if (!countryError && courseData) {
    const countryCounts: Record<string, number> = {};
    courseData.forEach(row => {
      const country = row.location || "Unknown";
      countryCounts[country] = (countryCounts[country] || 0) + 1;
    });
    
    console.log("\nBreakdown by country:");
    for (const [country, count] of Object.entries(countryCounts).sort((a, b) => b[1] - a[1])) {
      console.log("  " + country + ": " + count);
    }
  }
}

count().catch(console.error);


