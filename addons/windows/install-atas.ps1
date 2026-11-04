# התקנת Fayna Sync ל-ATAS: בונה את התוסף מול ATAS שמותקן אצלך ומעתיק אותו לתיקיית האינדיקטורים.
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
function Say($t, $c = 'White') { Write-Host $t -ForegroundColor $c }
function Done($ok) { Write-Host ''; Read-Host 'לחץ Enter לסגירה' | Out-Null; if ($ok) { exit 0 } else { exit 1 } }

Say 'Fayna Sync — התקנה ל-ATAS' 'Cyan'
$atas = 'C:\Program Files (x86)\ATAS Platform'
if (-not (Test-Path "$atas\ATAS.Indicators.dll")) { Say "לא מצאתי את ATAS בתיקייה $atas" 'Red'; Done $false }

$sdks = (& dotnet --list-sdks 2>$null) -join "`n"
if ($sdks -notmatch '(^|\n)10\.') { Say 'חסר .NET 10 SDK. מורידים מ- https://dotnet.microsoft.com/download/dotnet/10.0 ומריצים שוב.' 'Red'; Done $false }

$running = Get-Process | Where-Object { $_.ProcessName -like 'ATAS*' }
if ($running) {
  Say 'ATAS פתוח כרגע. סגור אותו (שמור את סביבת העבודה), ואז לחץ Enter.' 'Yellow'
  Read-Host | Out-Null
  if (Get-Process | Where-Object { $_.ProcessName -like 'ATAS*' }) { Say 'ATAS עדיין פתוח. סגור אותו והרץ שוב.' 'Red'; Done $false }
}

Say 'בונה את התוסף...'
Push-Location "$here\src\atas"
& dotnet build -c Release -nologo -v q "-p:AtasDir=$atas"
$code = $LASTEXITCODE
Pop-Location
if ($code -ne 0) { Say 'הבנייה נכשלה. צלם את המסך ושלח לי.' 'Red'; Done $false }
$dll = Get-ChildItem "$here\src\atas\bin\Release" -Recurse -Filter 'FaynaSync.Atas.dll' | Select-Object -First 1
if (-not $dll) { Say 'לא נמצא הקובץ שנבנה.' 'Red'; Done $false }

$docs = [Environment]::GetFolderPath('MyDocuments')
$targets = @("$env:APPDATA\ATAS X\Indicators", "$env:APPDATA\ATAS\Indicators", "$docs\ATAS\Indicators")
$dest = $null
foreach ($t in $targets) { if (Test-Path (Split-Path $t -Parent)) { $dest = $t; break } }
if (-not $dest) { $dest = $targets[0] }
New-Item -ItemType Directory -Force -Path $dest | Out-Null
Copy-Item $dll.FullName -Destination $dest -Force
Say "התוסף הותקן ב: $dest" 'Green'
Say ''
Say 'מה עכשיו:'
Say '1. פתח את ATAS.'
Say '2. בגרף כלשהו: Indicators ← חפש Fayna Sync ← הוסף.'
Say '3. בהגדרות האינדיקטור הדבק את מפתח החיבור מפיינה (הגדרות ← חיבורים).'
Done $true
