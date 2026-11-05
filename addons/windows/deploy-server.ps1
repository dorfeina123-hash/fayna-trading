# העלאת השרת של Fayna (סנכרון עסקאות והוצאות מ-Gmail) ל-Firebase. דורש Git ו-Node.js.
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
# Gmail expenses: three server secrets. The first two are copied once from Google Cloud,
# the third is a random encryption key generated here. Existing secrets are kept.
function HasSecret($n) { npx --yes firebase-tools@13 functions:secrets:access $n --project fayna-trading *> $null; return ($LASTEXITCODE -eq 0) }
function SetSecret($n, $v) { $f = [IO.Path]::GetTempFileName(); [IO.File]::WriteAllText($f, $v); npx --yes firebase-tools@13 functions:secrets:set $n --data-file $f --project fayna-trading --force | Out-Null; Remove-Item $f }
if (-not (HasSecret 'GMAIL_CLIENT_ID') -or -not (HasSecret 'GMAIL_CLIENT_SECRET')) {
  Say ''
  Say 'הגדרה חד-פעמית לסנכרון הוצאות מ-Gmail:' 'Cyan'
  Say '1. נפתח עכשיו עמוד Credentials של Google Cloud.'
  Say '2. לחץ על Web client (auto created by Google Service).'
  Say '3. תחת Authorized JavaScript origins הוסף: https://dorfeina123-hash.github.io ולחץ Save.'
  Say '4. העתק מאותו עמוד את Client ID ואת Client secret והדבק כאן.'
  Start-Process 'https://console.cloud.google.com/apis/credentials?project=fayna-trading'
  $cid = Read-Host 'הדבק Client ID'
  $sec = Read-Host 'הדבק Client secret'
  if ($cid -and $sec) { SetSecret 'GMAIL_CLIENT_ID' $cid.Trim(); SetSecret 'GMAIL_CLIENT_SECRET' $sec.Trim() }
}
if (-not (HasSecret 'GMAIL_TOKEN_KEY')) {
  $b = New-Object byte[] 32; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
  SetSecret 'GMAIL_TOKEN_KEY' ([Convert]::ToBase64String($b))
}
Say 'מעלה את חוקי מסד הנתונים ואת השרת...'
npx --yes firebase-tools@13 deploy --only "firestore:rules,functions:billing:syncIngest,functions:billing:gmailAuth" --project fayna-trading
$c = $LASTEXITCODE; Pop-Location
if ($c -ne 0) { Say 'ההעלאה נכשלה. צלם את המסך ושלח לי.' 'Red'; Done $false }
Say 'השרת עלה בהצלחה.' 'Green'
Done $true
