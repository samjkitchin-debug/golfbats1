# Bulk color replacement script for token migration
# Processes all .tsx and .ts files in src/app

$files = Get-ChildItem -Path "src/app" -Recurse -Include *.tsx,*.ts -File | Where-Object { $_.FullName -notmatch "node_modules|\.next" }

$replacements = @{
    # Pass 1: Global replacements
    "bg-white" = "bg-surface"
    "text-gray-900" = "text-foreground"
    "text-gray-800" = "text-foreground"
    "text-gray-700" = "text-foreground"
    "text-gray-600" = "text-muted"
    "text-gray-500" = "text-muted"
    "text-gray-400" = "text-muted"
    "border-gray-200" = "border-border"
    "border-gray-300" = "border-border"
    "border-gray-400" = "border-border"
    "border-gray-900" = "border-foreground"
    "hover:bg-gray-50" = "hover:bg-background"
    "bg-gray-50" = "bg-background"
    "bg-gray-100" = "bg-background"
    "bg-gray-200" = "bg-background"
    "bg-gray-300" = "bg-border"
    "bg-gray-400" = "bg-border"
    "bg-gray-900" = "bg-foreground"
    "bg-slate-50" = "bg-background"
    "text-slate-900" = "text-foreground"
    "text-slate-600" = "text-muted"
    "border-slate-200" = "border-border"
    "ring-gray-400" = "ring-border"
}

$processed = 0
foreach ($file in $files) {
    $content = Get-Content $file.FullName -Raw
    $original = $content
    $modified = $false
    
    foreach ($pattern in $replacements.Keys) {
        if ($content -match $pattern) {
            $content = $content -replace $pattern, $replacements[$pattern]
            $modified = $true
        }
    }
    
    if ($modified) {
        Set-Content -Path $file.FullName -Value $content -NoNewline
        $processed++
        Write-Host "Processed: $($file.Name)"
    }
}

Write-Host "Processed $processed files"
