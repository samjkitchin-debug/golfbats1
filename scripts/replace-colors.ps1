# PowerShell script to replace color classes in all TypeScript/TSX files
# This is a helper script - we'll do manual replacements for better control

$files = Get-ChildItem -Path "src" -Recurse -Include *.tsx,*.ts -File

# Pass 1: Global replacements
$replacements = @{
    "bg-white" = "bg-surface"
    "text-gray-900" = "text-foreground"
    "text-gray-800" = "text-foreground"
    "text-gray-700" = "text-foreground"
    "text-gray-600" = "text-muted"
    "text-gray-500" = "text-muted"
    "text-gray-400" = "text-muted"
    "border-gray-200" = "border-border"
    "border-gray-300" = "border-border"
    "hover:bg-gray-50" = "hover:bg-background"
    "bg-gray-50" = "bg-background"
    "bg-gray-100" = "bg-background"
    "bg-gray-900" = "bg-foreground"
    "bg-slate-50" = "bg-background"
    "text-slate-900" = "text-foreground"
    "text-slate-600" = "text-muted"
    "border-slate-200" = "border-border"
}

Write-Host "Color replacement script - run manually for each file as needed"
