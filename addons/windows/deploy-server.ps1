# העלאת השרת של Fayna Sync ל-Firebase (פעם אחת). דורש Git ו-Node.js.
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
function Say($t, $c = 'White') { Write-Host $t -ForegroundColor $c }
function Done($ok) { Write-Host ''; Read-Host 'לחץ Enter לסגירה' | Out-Null; if ($ok) { exit 0 } else { exit 1 } }
Say 'Fayna Sync — העלאת השרת' 'Cyan'
foreach ($cmd in 'git','node','npm') { if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) { Say "חסר $cmd במחשב." 'Red'; Done $false } }
$repo = "$here\repo"
if (Test-Path "$repo\.git") { git -C $repo pull --quiet } else { git clone --quiet https://github.com/dorfeina123-hash/fayna-trading.git $repo }
if ($LASTEXITCODE -ne 0) { Say 'ההורדה מ-GitHub נכשלה.' 'Red'; Done $false }
Push-Location "$repo\functions"; npm install --no-audit --no-fund; $c = $LASTEXITCODE; Pop-Location
if ($c -ne 0) { Say 'התקנת הרכיבים נכשלה.' 'Red'; Done $false }
Push-Location $repo
Say 'נפתח דפדפן להתחברות ל-Firebase עם החשבון שלך...' 'Yellow'
npx --yes firebase-tools@13 login
Say 'מעלה את חוקי מסד הנתונים ואת השרת...'
npx --yes firebase-tools@13 deploy --only "firestore:rules,functions:billing:syncIngest" --project fayna-trading
$c = $LASTEXITCODE; Pop-Location
if ($c -ne 0) { Say 'ההעלאה נכשלה. צלם את המסך ושלח לי.' 'Red'; Done $false }
Say 'השרת עלה בהצלחה.' 'Green'
Done $true
