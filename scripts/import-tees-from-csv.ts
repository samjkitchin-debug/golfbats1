/**
 * Import tee data from CSV file
 * 
 * CSV format:
 *   course_name,tee_label,meters,par,slope,rating
 *   Batam Hill Golf Resort,Black,6500,72,130,72.5
 *   Batam Hill Golf Resort,White,6100,72,125,70.2
 *   Batam Hill Golf Resort,Red,5500,72,115,68.0
 * 
 * Usage:
 *   npx tsx scripts/import-tees-from-csv.ts path/to/tees.csv
 *   npx tsx scripts/import-tees-from-csv.ts path/to/tees.csv --dryRun
 */

import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { parse } from "csv-parse/sync";

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

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

interface TeeRow {
  course_name: string;
  tee_label: string;
  meters: number;
  par: number;
  slope: number;
  rating?: number;
}

function parseArgs() {
  const args = process.argv.slice(2);
  const csvFile = args.find(arg => !arg.startsWith("--"));
  const dryRun = args.includes("--dryRun");
  
  return { csvFile, dryRun };
}

async function findCourseByName(courseName: string): Promise<{ id: string; name: string } | null> {
  const { data, error } = await supabase
    .from("courses")
    .select("id, name")
    .ilike("name", `%${courseName}%`)
    .limit(1)
    .single();
  
  if (error || !data) {
    return null;
  }
  
  return { id: data.id, name: data.name };
}

async function upsertTee(
  courseId: string,
  teeData: { label: string; meters: number; par: number; slope: number; rating?: number },
  dryRun = false
): Promise<string> {
  // Check if tee already exists
  const { data: existing } = await supabase
    .from("tees")
    .select("id")
    .eq("course_id", courseId)
    .eq("label", teeData.label)
    .single();

  if (existing) {
    // Update existing tee
    if (!dryRun) {
      const { error } = await supabase
        .from("tees")
        .update({
          meters: teeData.meters,
          par: teeData.par,
          slope: teeData.slope,
          rating: teeData.rating || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id);
      
      if (error) {
        throw new Error(`Failed to update tee: ${error.message}`);
      }
    }
    return existing.id;
  } else {
    // Create new tee
    const teeId = crypto.randomUUID();
    
    if (!dryRun) {
      const { error } = await supabase.from("tees").insert({
        id: teeId,
        course_id: courseId,
        label: teeData.label.trim(),
        meters: teeData.meters,
        par: teeData.par,
        slope: teeData.slope,
        rating: teeData.rating || null,
      });
      
      if (error) {
        throw new Error(`Failed to create tee: ${error.message}`);
      }
    }
    
    return teeId;
  }
}

async function main() {
  const { csvFile, dryRun } = parseArgs();
  
  if (!csvFile) {
    console.error("ERROR: Please provide a CSV file path");
    console.error("Usage: npx tsx scripts/import-tees-from-csv.ts path/to/tees.csv [--dryRun]");
    process.exit(1);
  }
  
  const csvPath = join(process.cwd(), csvFile);
  
  if (!existsSync(csvPath)) {
    console.error(`ERROR: CSV file not found: ${csvPath}`);
    process.exit(1);
  }
  
  console.log("Tee Import Script");
  console.log("=================");
  console.log(`CSV File: ${csvFile}`);
  console.log(`Dry Run: ${dryRun}`);
  console.log("");
  
  // Read and parse CSV
  const csvContent = readFileSync(csvPath, "utf-8");
  const records: TeeRow[] = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    cast: (value, context) => {
      if (context.column === "meters" || context.column === "par" || context.column === "slope") {
        const num = parseInt(value, 10);
        if (isNaN(num)) throw new Error(`Invalid number in column ${context.column}: ${value}`);
        return num;
      }
      if (context.column === "rating") {
        if (!value || value === "") return undefined;
        const num = parseFloat(value);
        if (isNaN(num)) throw new Error(`Invalid rating: ${value}`);
        return num;
      }
      return value;
    },
  });
  
  console.log(`Found ${records.length} tee rows in CSV\n`);
  
  // Group by course for reporting
  const courseStats: Record<string, { found: boolean; courseId?: string; courseName?: string; tees: number }> = {};
  
  let successCount = 0;
  let errorCount = 0;
  
  for (const row of records) {
    const courseName = row.course_name.trim();
    
    if (!courseStats[courseName]) {
      courseStats[courseName] = { found: false, tees: 0 };
    }
    
    try {
      // Find course
      let course = courseStats[courseName].courseId 
        ? { id: courseStats[courseName].courseId!, name: courseStats[courseName].courseName! }
        : await findCourseByName(courseName);
      
      if (!course) {
        console.error(`✗ Course not found: "${courseName}" (Tee: ${row.tee_label})`);
        errorCount++;
        continue;
      }
      
      // Update stats
      if (!courseStats[courseName].found) {
        courseStats[courseName].found = true;
        courseStats[courseName].courseId = course.id;
        courseStats[courseName].courseName = course.name;
      }
      
      // Upsert tee
      const teeId = await upsertTee(
        course.id,
        {
          label: row.tee_label,
          meters: row.meters,
          par: row.par,
          slope: row.slope,
          rating: row.rating,
        },
        dryRun
      );
      
      courseStats[courseName].tees++;
      successCount++;
      
      if (dryRun) {
        console.log(`✓ [DRY RUN] Would import: ${course.name} - ${row.tee_label} (${row.meters}m, Par ${row.par}, Slope ${row.slope})`);
      } else {
        console.log(`✓ Imported: ${course.name} - ${row.tee_label} (${row.meters}m, Par ${row.par}, Slope ${row.slope})`);
      }
    } catch (error: any) {
      console.error(`✗ Error processing ${courseName} - ${row.tee_label}: ${error.message}`);
      errorCount++;
    }
  }
  
  console.log("\n" + "=".repeat(50));
  console.log("Summary");
  console.log("=".repeat(50));
  console.log(`Total rows: ${records.length}`);
  console.log(`Successful: ${successCount}`);
  console.log(`Errors: ${errorCount}`);
  console.log(`\nCourses processed: ${Object.keys(courseStats).length}`);
  
  for (const [courseName, stats] of Object.entries(courseStats)) {
    if (stats.found) {
      console.log(`  ${stats.courseName}: ${stats.tees} tee${stats.tees !== 1 ? 's' : ''}`);
    }
  }
  
  if (dryRun) {
    console.log("\n[DRY RUN] No data was imported. Run without --dryRun to import.");
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});

