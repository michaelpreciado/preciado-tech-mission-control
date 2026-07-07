@echo off
REM ═══════════════════════════════════════════════════════════════
REM F.R.I.D.A.Y. — Framework for Running Intelligent Deployed Agents
REM One-command startup for Windows.
REM Usage: start.bat [--demo]
REM ═══════════════════════════════════════════════════════════════
setlocal
cd /d "%~dp0"
if "%PORT%"=="" set PORT=4175

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js ^>= 22 is required — install it from https://nodejs.org
  exit /b 1
)

if not exist node_modules (
  echo [F.R.I.D.A.Y.] installing dependencies...
  call npm install --no-audit --no-fund || exit /b 1
)

if "%1"=="--demo" (
  echo [F.R.I.D.A.Y.] seeding demo data...
  node scripts\seed-demo.mjs || exit /b 1
)

if not exist .next (
  echo [F.R.I.D.A.Y.] building...
  call npm run build || exit /b 1
)

set URL=http://localhost:%PORT%/
if not exist data\config.json set URL=http://localhost:%PORT%/setup

echo [F.R.I.D.A.Y.] starting on port %PORT% — %URL%
start "" "%URL%"
npx next start -H 0.0.0.0 -p %PORT%
