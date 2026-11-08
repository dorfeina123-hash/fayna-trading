# הפעלת סליקה דרך Grow לשרת של Fayna. מריצים רק כשמוכנים לגבות. דורש Git ו-Node.js.
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
function Say($t, $c = 'White') { Write-Host $t -ForegroundColor $c }
function Done($ok) { Write-Host ''; Read-Host 'לחץ Enter לסגירה' | Out-Null; if ($ok) { exit 0 } else { exit 1 } }
Say 'Fayna — הפעלת סליקה (Grow)' 'Cyan'
foreach ($cmd in 'git','node','npm') { if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) { Say "חסר $cmd במחשב." 'Red'; Done $false } }
$repo = "$here\repo"
if (Test-Path "$repo\.git") { git -C $repo pull --quiet } else { git clone --quiet https://github.com/dorfeina123-hash/fayna-trading.git $repo }
if ($LASTEXITCODE -ne 0) { Say 'ההורדה מ-GitHub נכשלה.' 'Red'; Done $false }
Push-Location "$repo\functions"; npm install --no-audit --no-fund; $c = $LASTEXITCODE; Pop-Location
if ($c -ne 0) { Say 'התקנת הרכיבים נכשלה.' 'Red'; Done $false }
Push-Location $repo
Say 'נפתח דפדפן להתחברות ל-Firebase עם החשבון שלך...' 'Yellow'
npx --yes firebase-tools@13 login
function HasSecret($n) { npx --yes firebase-tools@13 functions:secrets:access $n --project fayna-trading *> $null; return ($LASTEXITCODE -eq 0) }
function SetSecret($n, $v) { $f = [IO.Path]::GetTempFileName(); [IO.File]::WriteAllText($f, $v); npx --yes firebase-tools@13 functions:secrets:set $n --data-file $f --project fayna-trading --force | Out-Null; Remove-Item $f }
Say ''
Say 'צריך שני פרטים מ-Grow (מקבלים מהתמיכה של Grow, apisupport@grow.business):' 'Cyan'
Say '1. userId של העסק'
Say '2. pageCode של דף תשלום ששומר טוקן (saveCardToken)'
Say 'וגם לבקש מהם להפעיל עדכוני שרת (Server-to-Server) לחשבון.'
$mode = Read-Host 'סביבה: הקלד sandbox לבדיקה או production לגבייה אמיתית'
if ($mode -ne 'production') { $mode = 'sandbox' }
$uid = Read-Host 'הדבק userId'
$page = Read-Host 'הדבק pageCode'
if (-not $uid -or -not $page) { Say 'חסרים פרטים. לא בוצע שינוי.' 'Red'; Pop-Location; Done $false }
SetSecret 'GROW_USER_ID' $uid.Trim(); SetSecret 'GROW_PAGE_CODE' $page.Trim()
foreach ($k in @('GROW_NOTIFY_KEY','BILLING_TOKEN_KEY')) { if (-not (HasSecret $k)) {
  $b = New-Object byte[] 32; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
  $v = [Convert]::ToBase64String($b); if ($k -eq 'GROW_NOTIFY_KEY') { $v = $v -replace '[+/=]', '' }
  SetSecret $k $v
} }
$envText = "FAYNA_BILLING_LIVE=true`nGROW_ENV=$mode`nGROW_NOTIFY_URL=https://us-central1-fayna-trading.cloudfunctions.net/growNotify`n"
[IO.File]::WriteAllText("$repo\functions\.env", $envText)
Say 'מעלה את שרת הסליקה...'
npx --yes firebase-tools@13 deploy --only "firestore:rules,functions:billing:billingApi,functions:billing:growNotify,functions:billing:billingRenewals" --project fayna-trading
$c = $LASTEXITCODE; Pop-Location
if ($c -ne 0) { Say 'ההעלאה נכשלה. צלם את המסך ושלח לי.' 'Red'; Done $false }
Say "שרת הסליקה עלה ($mode). תכתוב לי, ואני מדליק את כפתורי המנוי באתר אחרי בדיקת רכישה אחת." 'Green'
Done $true
