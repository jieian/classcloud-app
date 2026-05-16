# ClassCloud App — Developer Setup Script
# Run once after cloning: .\setup.ps1

$ErrorActionPreference = "Stop"

function Write-Step { param($msg) Write-Host "`n>> $msg" -ForegroundColor Cyan }
function Write-OK   { param($msg) Write-Host "   OK  $msg" -ForegroundColor Green }
function Write-Warn { param($msg) Write-Host "   WARN  $msg" -ForegroundColor Yellow }
function Write-Fail { param($msg) Write-Host "   FAIL  $msg" -ForegroundColor Red }

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  ClassCloud App — Developer Setup" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

# ── 1. Node.js ──────────────────────────────────────────────────────────────
Write-Step "Checking Node.js..."
try {
    $nodeVersion = node --version 2>$null
    $major = [int]($nodeVersion -replace "v(\d+)\..*", '$1')
    if ($major -lt 18) {
        Write-Fail "Node.js $nodeVersion found, but version 18 or higher is required."
        Write-Host "   Download from: https://nodejs.org" -ForegroundColor Yellow
        exit 1
    }
    Write-OK "Node.js $nodeVersion"
} catch {
    Write-Fail "Node.js is not installed."
    Write-Host "   Download from: https://nodejs.org" -ForegroundColor Yellow
    exit 1
}

# ── 2. npm ───────────────────────────────────────────────────────────────────
Write-Step "Checking npm..."
try {
    $npmVersion = npm --version 2>$null
    Write-OK "npm $npmVersion"
} catch {
    Write-Fail "npm is not available. Reinstall Node.js."
    exit 1
}

# ── 3. .env.local ────────────────────────────────────────────────────────────
Write-Step "Checking environment file..."
if (Test-Path ".env.local") {
    Write-OK ".env.local found."
} else {
    Write-Warn ".env.local not found. Ask the project owner for the file before running the dev server."
}

# ── 4. npm install ───────────────────────────────────────────────────────────
Write-Step "Installing npm dependencies..."
npm install
if ($LASTEXITCODE -ne 0) {
    Write-Fail "npm install failed. Check the error above."
    exit 1
}
Write-OK "Dependencies installed."

# ── Done ─────────────────────────────────────────────────────────────────────
Write-Host "`n========================================" -ForegroundColor Green
Write-Host "  Setup complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor White
Write-Host "  1. Make sure you have .env.local from the project owner." -ForegroundColor White
Write-Host "  2. Run: npm run dev" -ForegroundColor White
Write-Host "  3. Open: http://localhost:3000" -ForegroundColor White
Write-Host ""
