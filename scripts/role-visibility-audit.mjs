import fs from "fs";
import path from "path";

const ROOT = process.cwd();
const SRC_DIR = path.join(ROOT, "src");

function walk(dir) {
  const out = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...walk(p));
    else if (ent.isFile() && (p.endsWith(".ts") || p.endsWith(".tsx") || p.endsWith(".js") || p.endsWith(".mjs"))) out.push(p);
  }
  return out;
}

function removeComments(text) {
  // Remove single-line comments (// ...)
  text = text.replace(/\/\/.*$/gm, "");
  // Remove multi-line comments (/* ... */)
  text = text.replace(/\/\*[\s\S]*?\*\//g, "");
  return text;
}

const files = walk(SRC_DIR);
let failures = 0;

for (const file of files) {
  const text = fs.readFileSync(file, "utf8");
  const textWithoutComments = removeComments(text);
  
  // Rule 1: "Set meet details" or "Add meet details" must be gated by permission helpers
  if (text.includes("Set meet details") || text.includes("Add meet details")) {
    const hasPermissionCheck = 
      textWithoutComments.includes("canEditMeetDetails(") ||
      textWithoutComments.includes("canEditTrip(") ||
      textWithoutComments.includes("isTripHost(");
    
    if (!hasPermissionCheck) {
      console.error(`${file}: "Set meet details" or "Add meet details" found without permission check (canEditMeetDetails/canEditTrip/isTripHost)`);
      failures++;
    }
  }
  
  // Rule 2: "Meet details needed" only allowed in src/app/(member)/page.tsx
  if (text.includes("Meet details needed")) {
    const normalizedPath = path.normalize(file).replace(/\\/g, "/");
    if (!normalizedPath.includes("src/app/(member)/page.tsx")) {
      console.error(`${file}: "Meet details needed" found outside src/app/(member)/page.tsx`);
      failures++;
    }
  }
  
  // Rule 3A: auth-id mismatch - .from("members") with .eq("id", alongside auth user.id signals
  const hasFromMembers = text.includes('.from("members")') || text.includes(".from('members')");
  const hasEqId = text.includes('.eq("id",') || text.includes(".eq('id',");
  const hasAuthUserIdSignal = 
    text.includes('user.id') ||
    text.includes('session.user.id') ||
    text.includes('authUser.id') ||
    text.includes('supabase.auth.getUser') ||
    text.includes('getUser(');
  
  if (hasFromMembers && hasEqId && hasAuthUserIdSignal) {
    console.error(`${file}: Rule 3A violation - Found .from("members") with .eq("id",) alongside auth user.id signals - suspicious: auth id used with members.id (should use member_id)`);
    failures++;
  }
  
  // Rule 3B: member-id mismatch - .from("members") with .eq("user_id", alongside member-id signals
  const hasEqUserId = text.includes('.eq("user_id",') || text.includes(".eq('user_id',");
  const hasMemberIdSignal = 
    (text.includes('currentMemberId') || text.includes('memberId') || text.includes('member.id')) &&
    !text.includes('user.id'); // Exclude if it's user.id (that would be auth, not member)
  
  if (hasFromMembers && hasEqUserId && hasMemberIdSignal) {
    console.error(`${file}: Rule 3B violation - Found .from("members") with .eq("user_id",) alongside member-id signals - suspicious: member id used with members.user_id (should use members.id or member_id)`);
    failures++;
  }
}

if (failures > 0) {
  console.error(`Role visibility audit failed: ${failures} issue(s).`);
  process.exit(1);
}

console.log("Role visibility audit passed.");
