# GolfCourseAPI Ingestion Guide

## Prerequisites

1. **Environment Variables** (set in `.env.local` or Vercel):
   - `SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `GOLFCOURSE_API_KEY`

2. **Database Migration**:
   Run the migration first:
   ```sql
   -- Execute in Supabase SQL Editor:
   -- docs/migrations/add-tee-holes-and-rating.sql
   ```

3. **Dependencies**:
   ```bash
   npm install @supabase/supabase-js
   npm install -D tsx  # For running TypeScript scripts
   ```

## Important API Limitations

**GolfCourseAPI does NOT support:**
- Country-based filtering (no `?country=XX` parameter)
- Pagination (all results returned in one call)

**What it DOES support:**
- Name-based search (`/v1/search?search_query=...`)
- Course details by ID (`/v1/courses/{id}`)

**Ingestion Strategy:**
The script searches by country name (e.g., "Australia") and filters results client-side by checking the `location.country` field. This means:
- Some courses may be missed if country name doesn't match exactly
- You may get courses from other countries that match the search term
- Results are filtered to match the target country code

## Usage

### Test API Connection First

Before running full ingestion, verify the API supports required features:

```bash
npx tsx scripts/ingest-golfcourseapi.ts --countries=AU --limitPerCountry=1 --dryRun
```

This will:
- Test country filtering support
- Test pagination support
- Process one course in dry-run mode (no database writes)

**If the API does NOT support country filtering**, the script will exit with an error and show the actual API response structure. You'll need to update `src/app/lib/providers/golfCourseApi.ts` to match the real API.

### Full Ingestion

Ingest all courses for specified countries:

```bash
npx tsx scripts/ingest-golfcourseapi.ts --countries=AU,SG,MY,TH,ID,JP
```

### Limited Ingestion (Testing)

Process only a few courses per country:

```bash
npx tsx scripts/ingest-golfcourseapi.ts --countries=AU,SG --limitPerCountry=5
```

### Dry Run (No Database Writes)

Test the ingestion without writing to database:

```bash
npx tsx scripts/ingest-golfcourseapi.ts --countries=AU --limitPerCountry=10 --dryRun
```

### Resume from Specific Point

If ingestion is interrupted, resume from a specific country/page:

```bash
npx tsx scripts/ingest-golfcourseapi.ts --countries=AU,SG,MY,TH,ID,JP --resumeFromCountry=SG --resumeFromPage=3
```

### Refresh Single Course

Update a specific course by provider ID:

```bash
npx tsx scripts/ingest-golfcourseapi.ts --refreshCourse=course-id-123
```

## Rate Limiting

The script includes:
- 250-500ms delay between requests
- Automatic backoff on 429/5xx errors
- Retry logic (up to 3 attempts)

## Idempotency

The script is idempotent:
- Uses `provider_course_map` to track imported courses
- Upserts courses/tees/holes (won't create duplicates)
- Safe to run multiple times

## Error Handling

- Missing hole data: Logged as warning, continues
- Missing tee data: Logged as warning, continues
- API errors: Logged, continues to next course
- Database errors: Logged, continues to next course

## Output

The script logs:
- Progress per country/page
- Success/failure per course
- Warnings for missing data
- Final summary

## Troubleshooting

### "Found 0 courses" after search

This can happen if:
1. The country name search doesn't match any courses in the API
2. The client-side filtering is too strict

**Solutions:**
- Try searching with more specific terms (e.g., "Singapore golf" instead of just "Singapore")
- Check the raw API response by temporarily disabling filtering in the script
- Use `--refreshCourse=<id>` to import specific courses by ID if you know them

### No results for a specific country

The API may not have comprehensive coverage for all countries. Try:
1. Searching with alternative terms (e.g., city names)
2. Checking if courses exist by searching the API directly
3. Using a manual course ID list if available

### "Failed to get club_id"

Ensure:
- `clubs` table has at least one row
- `SUPABASE_SERVICE_ROLE_KEY` has proper permissions

### Rate Limit Errors

If you see 429 errors:
- Increase delays in script (modify `delay()` calls)
- Use `--limitPerCountry` to process in smaller batches
- Run during off-peak hours

