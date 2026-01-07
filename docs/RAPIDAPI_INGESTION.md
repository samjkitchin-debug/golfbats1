# RapidAPI Golf Course Finder Ingestion Guide

## Overview

The RapidAPI Golf Course Finder API provides coordinate-based search for golf courses. It has excellent coverage for Singapore, Malaysia, Indonesia, and other Asian countries.

## API Details

**Provider**: RapidAPI Golf Course Finder  
**Base URL**: `https://golf-course-finder.p.rapidapi.com`  
**Endpoint**: `/api/golf-clubs/`  
**Authentication**: `X-RapidAPI-Key` header

## Environment Variables

Add to `.env.local`:
```
RAPIDAPI_GOLF_COURSE_FINDER_KEY=your_api_key_here
```

## API Query Format

**Endpoint**: `GET /api/golf-clubs/`

**Query Parameters**:
- `latitude` (required, string): Latitude coordinate
- `longitude` (required, string): Longitude coordinate  
- `miles` (optional, string): Search radius in miles (default: 10)
- `kilometers` (optional, string): Search radius in kilometers (alternative to miles)

**Headers**:
```
X-RapidAPI-Key: your_api_key
X-RapidAPI-Host: golf-course-finder.p.rapidapi.com
Content-Type: application/json
```

**Example Request**:
```
GET https://golf-course-finder.p.rapidapi.com/api/golf-clubs/?latitude=1.3521&longitude=103.8198&miles=30
Headers:
  X-RapidAPI-Key: your_key
  X-RapidAPI-Host: golf-course-finder.p.rapidapi.com
```

## Response Structure

The API returns an array of club objects. Each club can have multiple `golf_courses`:

```json
[
  {
    "club_name": "Singapore Island Country Club",
    "place_id": "ChIJ...",  // Unique identifier
    "address": "...",
    "city": "Singapore",
    "state": "...",
    "country": "Singapore",
    "latitude": 1.3521,
    "longitude": 103.8198,
    "golf_courses": [
      {
        "course_name": "Island Course",
        "holes": 18,
        "par": 72,
        "course_type": "Parkland",
        ...
      }
    ]
  }
]
```

**Note**: The API does NOT provide detailed tee/hole data (yardages, stroke indexes, etc.). Only basic course information (name, par, holes count) is available.

**TODO**: Tee and hole data (meters, par, slope, stroke_index) still needs to be added. Options:
- Find another API source that provides this data
- Manually enter tee/hole data for courses
- Use a different data provider for tee/hole details

## Usage

### Ingest Courses

```bash
# Ingest all courses for specific countries
npx tsx scripts/ingest-rapidapi-golfcourse.ts --countries=SG,ID,MY

# Limit per country (for testing)
npx tsx scripts/ingest-rapidapi-golfcourse.ts --countries=SG --limitPerCountry=10

# Dry run (no database writes)
npx tsx scripts/ingest-rapidapi-golfcourse.ts --countries=SG --dryRun
```

### Supported Countries

The script includes coordinate searches for:
- **SG** (Singapore): Singapore city
- **MY** (Malaysia): Kuala Lumpur, Penang, Johor Bahru
- **TH** (Thailand): Bangkok, Phuket, Pattaya
- **ID** (Indonesia): Jakarta, Bali, Batam
- **JP** (Japan): Tokyo, Osaka, Yokohama
- **AU** (Australia): Sydney, Melbourne, Brisbane, Perth, Adelaide

### Adding More Locations

Edit `scripts/ingest-rapidapi-golfcourse.ts` and add coordinates to the `countryCoordinates` object:

```typescript
const countryCoordinates: Record<string, Array<{ name: string; lat: number; lon: number; radius: number }>> = {
  SG: [
    { name: "Singapore", lat: 1.3521, lon: 103.8198, radius: 30 },
    // Add more cities/regions here
  ],
  // ...
};
```

## Data Mapping

- **Provider ID**: Uses `place_id` from API (unique per club)
- **Course Name**: `{club_name} - {course_name}` (if multiple courses) or just `{club_name}`
- **Location**: Stored in `courses.location` as country name
- **Tees/Holes**: Not available in this API - would need separate data source

## Rate Limiting

The script includes:
- 300ms delay between requests
- Automatic retry with exponential backoff on 429/5xx errors
- Rate limit handling

## Idempotency

The script is idempotent:
- Uses `provider_course_map` to track imported courses
- Won't create duplicate courses
- Safe to run multiple times

## Results

**Coverage** (as of latest ingestion):
- Singapore: 32 courses (17 clubs)
- Malaysia: 158 courses (89 clubs)
- Indonesia: 69 courses (45 clubs)

**Total**: 259 courses from RapidAPI

## Quick Reference

**To ingest more courses in the future:**

```bash
# Ingest specific countries
npx tsx scripts/ingest-rapidapi-golfcourse.ts --countries=SG,ID,MY

# Add more cities/regions by editing countryCoordinates in the script
```

**API Query Example:**
```bash
curl --request GET \
  --url 'https://golf-course-finder.p.rapidapi.com/api/golf-clubs/?latitude=1.3521&longitude=103.8198&miles=30' \
  --header 'X-RapidAPI-Key: your_key' \
  --header 'X-RapidAPI-Host: golf-course-finder.p.rapidapi.com'
```

**To delete courses by country:**
- Use the SQL migration: `docs/migrations/delete-australia-courses.sql`
- Modify the WHERE clause for different countries

