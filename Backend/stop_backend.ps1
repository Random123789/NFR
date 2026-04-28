$listenerIds = @(
  Get-NetTCPConnection -LocalPort 4000 -State Listen -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -Unique
)

if ($listenerIds.Count -eq 0) {
  Write-Host "No backend listener found on port 4000."
  exit 0
}

foreach ($procId in $listenerIds) {
  Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
}

Write-Host "Stopped backend process ID(s): $($listenerIds -join ', ')"