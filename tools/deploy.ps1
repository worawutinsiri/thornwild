# Deploys the static site to the local IIS folder (site "thornwild").
# Usage:  powershell -ExecutionPolicy Bypass -File tools\deploy.ps1 [-Dest C:\inetpub\thornwild]
param([string]$Dest = 'C:\inetpub\thornwild')

$src = Split-Path -Parent $PSScriptRoot
New-Item -ItemType Directory -Force -Path $Dest | Out-Null
Copy-Item -Path "$src\index.html", "$src\web.config" -Destination $Dest -Force
# /MIR keeps css/ and js/ identical to the repo (removes files deleted here)
robocopy "$src\css" "$Dest\css" /MIR /NJH /NJS /NDL /NC /NS /NP | Out-Null
if ($LASTEXITCODE -ge 8) { throw "robocopy css failed ($LASTEXITCODE)" }
robocopy "$src\js" "$Dest\js" /MIR /NJH /NJS /NDL /NC /NS /NP | Out-Null
if ($LASTEXITCODE -ge 8) { throw "robocopy js failed ($LASTEXITCODE)" }
Get-ChildItem -Recurse -File $Dest | Select-Object @{n='file';e={$_.FullName.Substring($Dest.Length+1)}}, @{n='modified';e={$_.LastWriteTime.ToString('HH:mm:ss')}} | Format-Table -AutoSize
Write-Host "Deployed to $Dest"
