// Delete all Australia courses from database
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

async function deleteAustraliaCourses() {
  console.log("Deleting Australia courses...\n");
  
  // First, count how many we have
  const { count: courseCount } = await supabase
    .from("courses")
    .select("*", { count: "exact", head: true })
    .eq("location", "Australia");
  
  console.log(`Found ${courseCount} courses with location = 'Australia'`);
  
  if (courseCount === 0) {
    console.log("No Australia courses to delete.");
    return;
  }
  
  // Get course IDs
  const { data: courses, error: fetchError } = await supabase
    .from("courses")
    .select("id")
    .eq("location", "Australia");
  
  if (fetchError) {
    throw new Error(`Failed to fetch courses: ${fetchError.message}`);
  }
  
  if (!courses || courses.length === 0) {
    console.log("No courses found.");
    return;
  }
  
  const courseIds = courses.map(c => c.id);
  console.log(`Found ${courseIds.length} courses to delete`);
  
  // Delete provider mappings first (foreign key constraint)
  console.log("\nDeleting provider mappings...");
  const { error: mapError, count: deletedMappings } = await supabase
    .from("provider_course_map")
    .delete()
    .in("course_id", courseIds);
  
  if (mapError) {
    throw new Error(`Failed to delete mappings: ${mapError.message}`);
  }
  console.log(`✓ Deleted provider mappings`);
  
  // Delete courses
  console.log("\nDeleting courses...");
  const { error: courseError } = await supabase
    .from("courses")
    .delete()
    .eq("location", "Australia");
  
  if (courseError) {
    throw new Error(`Failed to delete courses: ${courseError.message}`);
  }
  
  console.log(`✓ Deleted ${courseIds.length} Australia courses`);
  console.log("\n✓ Deletion complete");
}

deleteAustraliaCourses().catch(console.error);


