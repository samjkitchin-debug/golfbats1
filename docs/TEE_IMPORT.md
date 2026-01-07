# Tee Data Import

Since the RapidAPI Golf Course Finder doesn't provide tee data (colors, lengths, slope, rating), you have two options for adding tee information:

## Option 1: CSV Import (Bulk Import)

Use the CSV import script to bulk import tee data from a spreadsheet.

### CSV Format

Create a CSV file with the following columns:

- `course_name` - Name of the course (must match exactly or be similar to the course name in the database)
- `tee_label` - Tee color/label (e.g., "Black", "White", "Red", "Yellow", "Blue")
- `meters` - Total length in meters (integer)
- `par` - Par for the course (integer, typically 70-73 for 18 holes)
- `slope` - Slope rating (integer, typically 113-155)
- `rating` - Course rating (decimal, optional)

### Example CSV

See `docs/tee-import-template.csv` for a template.

```csv
course_name,tee_label,meters,par,slope,rating
Batam Hill Golf Resort,Black,6500,72,130,72.5
Batam Hill Golf Resort,White,6100,72,125,70.2
Batam Hill Golf Resort,Yellow,5800,72,120,69.0
Batam Hill Golf Resort,Red,5500,72,115,68.0
```

### Usage

1. Create your CSV file following the format above
2. Test with dry run:
   ```bash
   npx tsx scripts/import-tees-from-csv.ts path/to/your/tees.csv --dryRun
   ```
3. Import for real:
   ```bash
   npx tsx scripts/import-tees-from-csv.ts path/to/your/tees.csv
   ```

### Features

- **Idempotent**: Running the import multiple times will update existing tees (matches by course name and tee label)
- **Course Matching**: Automatically matches course names (case-insensitive, partial matching)
- **Dry Run Mode**: Test your CSV before importing
- **Error Handling**: Reports which courses/tees failed and why

### Notes

- Course names must match the course name in the database (or be similar enough for fuzzy matching)
- If a tee with the same label already exists for a course, it will be updated
- The `rating` column is optional (can be left blank)

## Option 2: Manual Entry via Admin Interface

Use the admin interface at `/admin/courses` to manually add tees one by one:

1. Go to `/admin/courses`
2. Click "Edit" on the course you want to add tees to
3. Fill in the "Add Tee" form (Label, Meters, Par, Slope)
4. Click "Add" to add each tee
5. Click "Save" when done

This is useful for:
- Adding one or two tees quickly
- Correcting existing tee data
- Adding tees as you discover the information

## Finding Tee Data

Tee data is typically available from:
- Course websites
- Golf course scorecards
- Golf course rating systems (e.g., USGA, R&A)
- Golf booking platforms

