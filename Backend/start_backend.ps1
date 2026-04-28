Set-Location $PSScriptRoot

if (Test-Path ".\\.venv\\Scripts\\python.exe") {
  & ".\\.venv\\Scripts\\python.exe" "main.py"
  exit $LASTEXITCODE
}

Write-Host "Virtual environment not found at .venv. Create it first:" -ForegroundColor Yellow
Write-Host "  python -m venv .venv" -ForegroundColor Yellow
Write-Host "  .\\.venv\\Scripts\\Activate.ps1" -ForegroundColor Yellow
Write-Host "  pip install -r requirements.txt" -ForegroundColor Yellow
exit 1