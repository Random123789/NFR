param(
    [string]$PythonCommand = "py -3.12",
    [string]$DatabaseName = "nfr",
    [string]$MysqlUser = "root"
)

$ErrorActionPreference = "Stop"

Write-Host "Creating virtual environment..."
Invoke-Expression "$PythonCommand -m venv .venv"

Write-Host "Activating virtual environment..."
. .\.venv\Scripts\Activate.ps1

Write-Host "Installing Python dependencies..."
python -m pip install --upgrade pip
python -m pip install -r requirements.txt

Write-Host "Applying schema..."
Get-Content .\sql\schema.sql | mysql -u $MysqlUser -p $DatabaseName

Write-Host "Applying seed data..."
Get-Content .\sql\seed.sql | mysql -u $MysqlUser -p $DatabaseName

Write-Host "Setup complete. Start the backend with: python main.py"
