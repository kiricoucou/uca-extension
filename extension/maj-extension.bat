@echo off
setlocal EnableExtensions
chcp 65001 >nul
rem  Version du pilote : a monter a chaque changement de ce script (elle figure dans le nom du fichier telecharge).
set "MYUCA_PILOT_VERSION=2.4"
title Mise a jour de l'extension My UCA - pilote %MYUCA_PILOT_VERSION%
rem ----------------------------------------------------------------------------------------------
rem  Met a jour l'extension "My UCA" (Chrome, Edge, Brave, Vivaldi, Firefox) chargee en mode developpeur.
rem  1. Il retrouve tout seul le dossier de l'extension dans ton navigateur (ou le dossier memorise, ou celui du script).
rem  2. Il te le montre : "Ouvrir le dossier" pour verifier, puis "Valider".
rem  3. Il cherche une version plus recente et, s'il y en a une, met l'extension a jour tout seul.
rem  - Aucun droit administrateur : tout se passe dans ton profil et dans le dossier de l'extension.
rem  - Telecharge le ZIP officiel sur https://kiricoucou.github.io/uca-extension/ (HTTPS), rien d'autre.
rem  - Ne touche pas a tes donnees : elles sont dans le navigateur, pas dans ce dossier.
rem  Commande complete (celle que l'extension propose) :
rem    maj-extension.bat /browser firefox /os windows /version 1.2.3 /yes "C:\chemin\dossier"
rem    /browser : chrome | edge | brave | vivaldi | chromium | firefox (limite la recherche a ce navigateur, puis l'ouvre sur la nouvelle version)
rem  Usage : double-clic  |  maj-extension.bat "C:\chemin\dossier"  |  maj-extension.bat /force (reinstalle meme a jour)
rem ----------------------------------------------------------------------------------------------
set "SELFBAT=%~f0"
set "MYUCA_RAWARGS=%*"
set "MYUCA_SELFDIR=%~dp0"
set "MYUCA_URL=https://kiricoucou.github.io/uca-extension/extension/uca-extension-chrome.zip"
set "MYUCA_URL_FF=https://kiricoucou.github.io/uca-extension/extension/uca-extension-firefox.zip"
set "MYUCA_FORCE=0"
set "MYUCA_ARGDEST="
set "MYUCA_CFG=%LOCALAPPDATA%\MyUCA\dossier-extension.txt"

:args
if "%~1"=="" goto :argsdone
if /i "%~1"=="/desinstaller" (set "MYUCA_UNINSTALL=1" & shift & goto :args)
if /i "%~1"=="/force" (set "MYUCA_FORCE=1" & shift & goto :args)
if /i "%~1"=="/yes" (set "MYUCA_AUTO=1" & set "MYUCA_NOPAUSE=1" & shift & goto :args)
if /i "%~1"=="/browser" (set "MYUCA_BROWSER=%~2" & shift & shift & goto :args)
if /i "%~1"=="/id" (set "MYUCA_ID=%~2" & shift & shift & goto :args)
if /i "%~1"=="/version" (set "MYUCA_VERSION=%~2" & shift & shift & goto :args)
if /i "%~1"=="/os" (shift & shift & goto :args)
set "MYUCA_ARGDEST=%~1"
shift
goto :args
:argsdone

rem  Mode normal (double-clic ou bouton de l'extension) : tout se passe dans des fenetres, sans terminal.
rem  Les modes automatiques (/yes) gardent la console.
if defined MYUCA_AUTO goto :console
if defined MYUCA_NOPAUSE if not defined MYUCA_SHOTDIR goto :console
set "MYUCA_GUI=1"
if defined MYUCA_SHOTDIR if not defined MYUCA_HEADLESS goto :guihere
start "" "%SystemRoot%\System32\conhost.exe" --headless powershell -NoProfile -STA -WindowStyle Hidden -ExecutionPolicy Bypass -Command "$s=[IO.File]::ReadAllText($env:SELFBAT); $i=$s.IndexOf([string][char]10+'#PS-START'); Invoke-Expression $s.Substring($i)"
exit /b 0
:guihere
powershell -NoProfile -STA -ExecutionPolicy Bypass -Command "$s=[IO.File]::ReadAllText($env:SELFBAT); $i=$s.IndexOf([string][char]10+'#PS-START'); Invoke-Expression $s.Substring($i)"
exit /b %ERRORLEVEL%

:console
echo.
echo Pilote de mise a jour My UCA, version %MYUCA_PILOT_VERSION%
echo Recherche de l'extension My UCA...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$s=[IO.File]::ReadAllText($env:SELFBAT); $i=$s.IndexOf([string][char]10+'#PS-START'); Invoke-Expression $s.Substring($i)"
set "RC=%ERRORLEVEL%"
if "%RC%"=="0" goto :ok
if "%RC%"=="10" goto :ok
if "%RC%"=="11" goto :ok
if "%RC%"=="3" goto :cancel
if "%RC%"=="5" goto :blocked
if "%RC%"=="2" goto :nodest
goto :fail

:ok
:okff
goto :end

:blocked
echo.
echo Cet outil de mise a jour est bloque : telecharge la derniere version sur https://kiricoucou.github.io/uca-extension/mise-a-jour.html
if not defined MYUCA_NOPAUSE pause
exit /b 5

:cancel
echo.
echo Annule : rien n'a ete modifie.
goto :end

:nodest
echo.
echo Dossier de l'extension introuvable (pas de manifest.json). Relance avec le bon dossier :
echo   maj-extension.bat "C:\chemin\vers\le\dossier"
goto :fail

:fail
echo.
echo La mise a jour a echoue (code %RC%). Rien n'a ete casse : l'ancienne version est toujours en place.
if not defined MYUCA_NOPAUSE pause
exit /b %RC%

:end
if not defined MYUCA_NOPAUSE pause
exit /b 0

#PS-START
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'   # sans barre de progression : le telechargement est bien plus rapide dans PowerShell 5
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$auto = ($env:MYUCA_NOPAUSE -eq '1' -or $env:MYUCA_AUTO -eq '1')
$GECKO = 'uca-connecteur@site-emploi-du-temps.local'
$cands = New-Object System.Collections.ArrayList
$script:obsolete = New-Object System.Collections.ArrayList   # anciennes editions de test : signalees, jamais mises a jour
$script:log = New-Object System.Collections.ArrayList
$script:results = New-Object System.Collections.ArrayList
$script:backups = New-Object System.Collections.ArrayList
$script:progress = $null
$script:openChoices = @()
$script:downloadPage = ''
$GUI = ($env:MYUCA_GUI -eq '1')
if ($GUI) {
  Add-Type -AssemblyName System.Windows.Forms
  Add-Type -AssemblyName System.Drawing
  [System.Windows.Forms.Application]::EnableVisualStyles()
}

function New-Window([string]$title, [int]$w, [int]$h) {
  $f = New-Object System.Windows.Forms.Form
  $f.Text = $title; $f.StartPosition = 'CenterScreen'; $f.ClientSize = New-Object System.Drawing.Size($w, $h)
  $f.FormBorderStyle = 'FixedDialog'; $f.MaximizeBox = $false; $f.TopMost = $true
  $f.Font = New-Object System.Drawing.Font('Segoe UI', 10); $f.BackColor = [System.Drawing.Color]::White
  return $f
}
function New-Text([string]$text, [int]$x, [int]$y, [int]$w, [int]$h, [float]$size = 10, [bool]$bold = $false) {
  $l = New-Object System.Windows.Forms.Label
  $l.Text = $text; $l.Location = New-Object System.Drawing.Point($x, $y); $l.Size = New-Object System.Drawing.Size($w, $h)
  $l.Font = New-Object System.Drawing.Font($(if ($bold) { 'Segoe UI Semibold' } else { 'Segoe UI' }), $size)
  return $l
}
function New-Button([string]$text, [int]$x, [int]$y, [int]$w) {
  $b = New-Object System.Windows.Forms.Button
  $b.Text = $text; $b.Location = New-Object System.Drawing.Point($x, $y); $b.Size = New-Object System.Drawing.Size($w, 38)
  return $b
}
# Essais automatiques seulement (MYUCA_SHOTDIR) : photographie la fenetre puis appuie sur son bouton principal.
function Save-Shot($form, [string]$name) {
  if (-not $env:MYUCA_SHOTDIR) { return }
  $bmp = New-Object System.Drawing.Bitmap($form.Width, $form.Height)
  $form.DrawToBitmap($bmp, (New-Object System.Drawing.Rectangle(0, 0, $form.Width, $form.Height)))
  $bmp.Save((Join-Path $env:MYUCA_SHOTDIR ($name + '.png'))); $bmp.Dispose()
}
function Use-AutoTest($form, $button, [string]$name) {
  if (-not $env:MYUCA_SHOTDIR) { return }
  $timer = New-Object System.Windows.Forms.Timer; $timer.Interval = 900
  $timer.Add_Tick({ $timer.Stop(); Save-Shot $form $name; $button.PerformClick() }.GetNewClosure())
  $form.Add_Shown({ $timer.Start() }.GetNewClosure())
}

function Show-Progress {
  if (-not $GUI -or $script:progress) { return }
  $f = New-Window 'Mise à jour de My UCA' 620 190
  $f.ControlBox = $false
  $title = New-Text 'Mise à jour en cours…' 24 20 570 32 14 $true
  $bar = New-Object System.Windows.Forms.ProgressBar; $bar.Style = 'Marquee'; $bar.MarqueeAnimationSpeed = 25
  $bar.Location = New-Object System.Drawing.Point(24, 66); $bar.Size = New-Object System.Drawing.Size(572, 18)
  $line = New-Text '' 24 100 572 70 10
  $f.Controls.AddRange(@($title, $bar, $line))
  $script:progress = [pscustomobject]@{ Form = $f; Title = $title; Line = $line }
  $f.Show(); [System.Windows.Forms.Application]::DoEvents()
}
function Close-Progress { if ($script:progress) { $script:progress.Form.Close(); $script:progress.Form.Dispose(); $script:progress = $null } }
if ($GUI) {
  # En mode fenetres, ce que le pilote « ecrit » va dans la fenetre de progression et dans le detail du resultat.
  function Write-Host {
    $text = ($args -join ' ').Trim()
    if (-not $text) { return }
    [void]$script:log.Add($text)
    if ($script:progress) { $script:progress.Line.Text = $text; [System.Windows.Forms.Application]::DoEvents() }
  }
}

# ---------------- « Ouvrir la page des extensions »
# Les navigateurs ignorent une adresse interne (chrome://…, about:…) passee en ligne de commande : on ouvre une nouvelle
# fenetre puis on y colle l'adresse. Les touches ne sont envoyees QUE si le navigateur demande est bien au premier plan.
$BROWSERS = @{
  'Chrome'   = @{ Proc = 'chrome';  Page = 'chrome://extensions';  Args = @('--new-window'); Rels = @('Google\Chrome\Application\chrome.exe') }
  'Chromium' = @{ Proc = 'chrome';  Page = 'chrome://extensions';  Args = @('--new-window'); Rels = @('Chromium\Application\chrome.exe') }
  'Edge'     = @{ Proc = 'msedge';  Page = 'edge://extensions';    Args = @('--new-window'); Rels = @('Microsoft\Edge\Application\msedge.exe') }
  'Brave'    = @{ Proc = 'brave';   Page = 'brave://extensions';   Args = @('--new-window'); Rels = @('BraveSoftware\Brave-Browser\Application\brave.exe') }
  'Vivaldi'  = @{ Proc = 'vivaldi'; Page = 'vivaldi://extensions'; Args = @('--new-window'); Rels = @('Vivaldi\Application\vivaldi.exe') }
  'Firefox'  = @{ Proc = 'firefox'; Page = 'about:debugging#/runtime/this-firefox'; Args = @('-new-window', 'about:blank'); Rels = @('Mozilla Firefox\firefox.exe') }
}
function Find-BrowserExe([string]$name) {
  foreach ($base in @($env:ProgramFiles, ${env:ProgramFiles(x86)}, $env:LOCALAPPDATA)) {
    foreach ($rel in $BROWSERS[$name].Rels) { if ($base) { $c = Join-Path $base $rel; if (Test-Path -LiteralPath $c) { return $c } } }
  }
  return $null
}
function Get-Foreground {
  if (-not ('MyUca.Win' -as [type])) {
    Add-Type -Namespace MyUca -Name Win -MemberDefinition '[DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow(); [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint id); [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, System.Text.StringBuilder s, int n); [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h); [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c); [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h); [DllImport("user32.dll")] public static extern void keybd_event(byte k, byte s, uint f, UIntPtr e);'
  }
  $h = [MyUca.Win]::GetForegroundWindow(); [uint32]$id = 0
  [void][MyUca.Win]::GetWindowThreadProcessId($h, [ref]$id)
  $sb = New-Object System.Text.StringBuilder 512; [void][MyUca.Win]::GetWindowText($h, $sb, 512)
  $p = Get-Process -Id $id -ErrorAction SilentlyContinue
  return [pscustomobject]@{ Proc = $(if ($p) { $p.ProcessName } else { '' }); Title = $sb.ToString() }
}
# Windows n'autorise pas toujours la fenetre d'un navigateur deja lance a passer devant : on le demande explicitement
# (la touche Alt, seule, leve ce blocage).
function Set-BrowserFront([string]$proc, [bool]$restore = $false) {
  $w = Get-Process -Name $proc -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
  if (-not $w) { return }
  [MyUca.Win]::keybd_event(0x12, 0, 0, [UIntPtr]::Zero); [MyUca.Win]::keybd_event(0x12, 0, 2, [UIntPtr]::Zero)
  # Dernier recours : reduire puis restaurer la fenetre la fait passer devant.
  if ($restore) { [void][MyUca.Win]::ShowWindow($w.MainWindowHandle, 6) }
  if ($restore -or [MyUca.Win]::IsIconic($w.MainWindowHandle)) { [void][MyUca.Win]::ShowWindow($w.MainWindowHandle, 9) }
  [void][MyUca.Win]::SetForegroundWindow($w.MainWindowHandle)
}
# -> 'ouverte' (page affichee), 'envoyee' (adresse saisie, titre non reconnu), 'copiee' (a coller soi-meme), 'absent'
function Open-ExtensionsPage([string]$name) {
  $b = $BROWSERS[$name]; if (-not $b) { return 'absent' }
  $exe = Find-BrowserExe $name; if (-not $exe) { return 'absent' }
  Add-Type -AssemblyName System.Windows.Forms
  try { [System.Windows.Forms.Clipboard]::SetText($b.Page) } catch { }
  try { Start-Process -FilePath $exe -ArgumentList $b.Args } catch { return 'copiee' }
  $ready = $false
  foreach ($i in 1..40) {
    Start-Sleep -Milliseconds 250; [System.Windows.Forms.Application]::DoEvents()
    if ((Get-Foreground).Proc -ieq $b.Proc) { $ready = $true; break }
    if ($i % 6 -eq 0) { Set-BrowserFront $b.Proc -restore ($i -ge 12) }
  }
  if (-not $ready) { return 'copiee' }
  Start-Sleep -Milliseconds 900
  foreach ($keys in @('^t', '^v', '{ENTER}')) {
    if ((Get-Foreground).Proc -ine $b.Proc) { return 'copiee' }
    [System.Windows.Forms.SendKeys]::SendWait($keys); Start-Sleep -Milliseconds 350
  }
  foreach ($i in 1..16) {
    Start-Sleep -Milliseconds 250
    $f = Get-Foreground
    if ($f.Proc -ieq $b.Proc -and $f.Title -match '(?i)extension|debugg|d.bogage') { return 'ouverte' }
  }
  return 'envoyee'
}
# Navigateurs a proposer : ceux du dossier mis a jour (ou celui qui a demande la mise a jour), s'ils sont installes.
function Get-OpenChoices([string[]]$names) {
  $out = @()
  $asked = Browser-Label
  if ($asked) { $out = @($asked) }
  else { foreach ($n in $names) { foreach ($part in ($n -split '\s*[,/]\s*')) { if ($BROWSERS.ContainsKey($part)) { $out += $part } } } }
  return @($out | Select-Object -Unique | Where-Object { Find-BrowserExe $_ } | Select-Object -First 3)
}

function Show-Result([string]$kind, [string]$title, [string]$message) {
  if (-not $GUI) { return }
  Close-Progress
  $f = New-Window 'Mise à jour de My UCA' 660 440
  $color = switch ($kind) { 'ok' { [System.Drawing.Color]::FromArgb(22, 120, 75) } 'error' { [System.Drawing.Color]::FromArgb(180, 40, 45) } default { [System.Drawing.Color]::FromArgb(30, 80, 160) } }
  $t = New-Text $title 24 18 610 64 15 $true; $t.ForeColor = $color
  $m = New-Text $message 24 88 610 250 10
  $detail = New-Object System.Windows.Forms.TextBox
  $detail.Multiline = $true; $detail.ReadOnly = $true; $detail.ScrollBars = 'Vertical'; $detail.Visible = $false
  $detail.Location = New-Object System.Drawing.Point(24, 88); $detail.Size = New-Object System.Drawing.Size(610, 270)
  $detail.Text = ($script:log -join "`r`n")
  $more = New-Button 'Voir le détail' 24 380 130
  $more.Add_Click({ $detail.Visible = -not $detail.Visible; $m.Visible = -not $detail.Visible; $more.Text = $(if ($detail.Visible) { 'Masquer le détail' } else { 'Voir le détail' }) }.GetNewClosure())
  $close = New-Button 'Fermer' 514 380 120
  $close.Add_Click({ $f.Close() }.GetNewClosure())
  $f.Controls.AddRange(@($t, $m, $detail, $more, $close))
  $f.AcceptButton = $close
  if ($script:downloadPage) {
    $page = New-Button 'Ouvrir la page de téléchargement' 170 380 330
    $url = $script:downloadPage
    $page.Add_Click({ Start-Process $url }.GetNewClosure())
    $f.Controls.Add($page); $f.AcceptButton = $page
  }
  if ($kind -ne 'error' -and $script:openChoices.Count) {
    $hint = New-Text '' 24 340 610 34 9
    $hint.ForeColor = [System.Drawing.Color]::FromArgb(110, 80, 10)
    $x = 170; $width = [int](330 / $script:openChoices.Count) - 6
    $first = $null
    foreach ($name in $script:openChoices) {
      $label = if ($script:openChoices.Count -eq 1) { "Ouvrir la page des extensions ($name)" } else { "Ouvrir dans $name" }
      $open = New-Button $label $x 380 $width
      $browser = $name; $form = $f; $note = $hint
      $open.Add_Click({
        $form.TopMost = $false
        $state = Open-ExtensionsPage $browser
        $note.Text = switch ($state) {
          'ouverte' { "Page des extensions ouverte dans $browser : clique sur la flèche ronde « Recharger » de My UCA." }
          'envoyee' { "Adresse envoyée à $browser. Si la page ne s'affiche pas : Ctrl+L, Ctrl+V, puis Entrée." }
          'absent'  { "$browser introuvable sur cet ordinateur." }
          default   { "Adresse copiée : dans $browser, Ctrl+L, Ctrl+V, puis Entrée." }
        }
      }.GetNewClosure())
      $f.Controls.Add($open); if (-not $first) { $first = $open }
      $x += $width + 6
    }
    $f.Controls.Add($hint); $hint.BringToFront()
    $f.AcceptButton = $first
  }
  Use-AutoTest $f $close ('resultat-' + $kind)
  [void]$f.ShowDialog()
}
# ---------------- l'outil se met a jour lui-meme, et une version perimee est BLOQUEE
# Rien n'est execute sans signature valable de la cle du projet (la meme que pour le paquet de l'extension).
$PILOT_PUBLIC = '<RSAKeyValue><Modulus>onKu45jPQjfHM+Cd9QAjIvEnRkG3SJP1W88Ok0OLyWR7K7DlwVxBPxz1WhEeKrNWyVVf5blUe4+4iiU9gLVDo55T+k8oVp3x14sblS09oN7QE/dTKeGS3GfKF0oTYZAcAwlj6BQadjfyAhf98rimDdt8EdyCGzEO5+yyxVsCwIkBlzvbCPAZvzQWioIzY4hhuYGaYGNpqTnGWnb2BjGOWCsgEGJLFqWknSvkdHEmh+jZQBzGYGmXhetAeJHe4yAw5SaTsi92P9FwFJ46C1+ICnVI/7QnpBYp6pDJ93biCpOoiyICRTcnhTDKtV2gc3REw1paQAauM03nyHGo8b33UQ==</Modulus><Exponent>AQAB</Exponent></RSAKeyValue>'
$PILOT_SOURCE = if ($env:MYUCA_PILOT_URL) { $env:MYUCA_PILOT_URL } else { 'https://kiricoucou.github.io/uca-extension/extension/maj-extension.bat' }
$PILOT_PAGE = 'https://kiricoucou.github.io/uca-extension/mise-a-jour.html'
function Get-Bytes([string]$url) {
  $f = [IO.Path]::GetTempFileName()
  try { Invoke-WebRequest -Uri ($url + '?t=' + [DateTime]::UtcNow.Ticks) -OutFile $f -UseBasicParsing -TimeoutSec 30; return ,([IO.File]::ReadAllBytes($f)) }
  finally { Remove-Item -LiteralPath $f -Force -ErrorAction SilentlyContinue }
}
function Test-PilotSignature([byte[]]$bytes, [string]$signature) {
  try {
    $lf = [byte[]]($bytes | Where-Object { $_ -ne 13 })
    $sha = [Security.Cryptography.SHA256]::Create()
    $hex = -join ($sha.ComputeHash($lf) | ForEach-Object { $_.ToString('x2') })
    $rsa = New-Object System.Security.Cryptography.RSACryptoServiceProvider
    $rsa.FromXmlString($PILOT_PUBLIC)
    return $rsa.VerifyData([Text.Encoding]::ASCII.GetBytes('UCA-PILOT-V1:' + $hex), [Security.Cryptography.CryptoConfig]::MapNameToOID('SHA256'), [Convert]::FromBase64String($signature.Trim()))
  } catch { return $false }
}
function Test-InGit([string]$path) {
  $d = Split-Path $path -Parent
  while ($d) { if (Test-Path -LiteralPath (Join-Path $d '.git')) { return $true }; $d = Split-Path $d -Parent }
  return $false
}
function Stop-Blocked([string]$reason) {
  Write-Host ("OUTIL BLOQUE : " + $reason)
  $script:downloadPage = $PILOT_PAGE
  Show-Result 'error' ("Cet outil (version " + $env:MYUCA_PILOT_VERSION + ") est bloqué") ($reason + "`r`n`r`nRien n'a été modifié sur ton ordinateur.`r`nDernière version : " + $PILOT_PAGE)
  exit 5
}
# Revient seulement si cet outil est la derniere version ; sinon le remplace (et s'arrete) ou le bloque (et s'arrete).
function Confirm-LatestPilot {
  $own = [version]$env:MYUCA_PILOT_VERSION
  Write-Host ("Verification de la version de l'outil (" + $own + ")...")
  try { $bytes = Get-Bytes $PILOT_SOURCE } catch { Stop-Blocked "Impossible de vérifier que cet outil est à jour (connexion Internet ?). Réessaie une fois connecté." }
  $m = [regex]::Match([Text.Encoding]::UTF8.GetString($bytes), 'MYUCA_PILOT_VERSION=(\d+(?:\.\d+){1,3})"')
  if (-not $m.Success) { Stop-Blocked "La version publiée de l'outil est illisible : par prudence, rien n'est lancé." }
  $published = $m.Groups[1].Value
  if ([version]$published -le $own) { return }
  Write-Host ("Nouvelle version de l'outil : " + $published + ". La version " + $own + " est perimee.")
  if ($env:MYUCA_UPDATED_TO -eq $published) { Stop-Blocked ("La version " + $published + " reste introuvable après téléchargement.") }
  try { $signature = [Text.Encoding]::ASCII.GetString((Get-Bytes ($PILOT_SOURCE + '.sig'))) } catch { Stop-Blocked ("La version " + $published + " est disponible mais sa signature n'a pas pu être téléchargée.") }
  if (-not (Test-PilotSignature $bytes $signature)) { Stop-Blocked ("La version " + $published + " téléchargée n'a pas la signature du projet : elle n'est pas exécutée.") }
  $code = ([Text.Encoding]::UTF8.GetString($bytes) -replace "`r", '') -replace "`n", "`r`n"
  $installed = Join-Path $PILOT_DIR 'maj-extension.bat'
  $mine = $env:SELFBAT
  $isInstalled = ($mine -ieq $installed)
  $canReplace = ((Split-Path $mine -Leaf) -match '(?i)^maj-extension.*\.bat$') -and -not (Test-InGit $mine)
  if ($isInstalled -and $GUI) { $new = $installed }
  elseif ($canReplace -and -not $isInstalled) { $new = Join-Path (Split-Path $mine -Parent) ('maj-extension-v' + $published + '.bat') }
  else { $new = Join-Path $env:TEMP ('maj-extension-v' + $published + '.bat') }
  try { [IO.File]::WriteAllText($new, $code, (New-Object Text.UTF8Encoding $false)) }
  catch { $new = Join-Path $env:TEMP ('maj-extension-v' + $published + '.bat'); [IO.File]::WriteAllText($new, $code, (New-Object Text.UTF8Encoding $false)) }
  # L'ancien fichier est supprime. En mode console, la fenetre noire le lit encore : suppression quelques secondes apres.
  if ($canReplace -and -not $isInstalled -and ($mine -ine $new)) {
    if ($GUI) { Remove-Item -LiteralPath $mine -Force -ErrorAction SilentlyContinue }
    else { Start-Process -FilePath $env:ComSpec -ArgumentList ('/c ping -n 5 127.0.0.1 >nul & del /f /q "' + $mine + '"') -WindowStyle Hidden }
    Write-Host ("Ancien outil supprime : " + $mine)
  }
  Write-Host ("Lancement de l'outil " + $published + "...")
  $env:MYUCA_UPDATED_TO = $published
  $line = '/c ""' + $new + '" ' + $env:MYUCA_RAWARGS + '"'
  Close-Progress
  if ($GUI) { Start-Process -FilePath $env:ComSpec -ArgumentList $line -WindowStyle Hidden; exit 0 }
  $child = Start-Process -FilePath $env:ComSpec -ArgumentList $line -NoNewWindow -Wait -PassThru
  exit $child.ExitCode
}

# Garde une copie des fichiers qui vont etre remplaces (seulement ceux qui changent). Les 5 dernieres sont conservees.
function Save-Backup([string]$source, [string]$target, [string]$version) {
  $root = Join-Path $env:LOCALAPPDATA 'MyUCA\sauvegardes'
  $dir = Join-Path $root ((Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + (Split-Path $target -Leaf) + '-' + $version)
  $count = 0
  $base = (Get-Item -LiteralPath $source).FullName.TrimEnd('\')
  foreach ($n in (Get-ChildItem -LiteralPath $base -Recurse -File -Force)) {
    $rel = $n.FullName.Substring($base.Length + 1)
    $old = Join-Path $target $rel
    if (-not (Test-Path -LiteralPath $old -PathType Leaf)) { continue }
    if ((Get-FileHash -LiteralPath $old).Hash -eq (Get-FileHash -LiteralPath $n.FullName).Hash) { continue }
    $copy = Join-Path $dir $rel
    New-Item -ItemType Directory -Force -Path (Split-Path $copy -Parent) | Out-Null
    Copy-Item -LiteralPath $old -Destination $copy -Force
    $count++
  }
  if ($count) {
    [void]$script:backups.Add($dir)
    Write-Host ("Copie de securite des " + $count + " fichiers remplaces : " + $dir)
    Get-ChildItem -LiteralPath $root -Directory -ErrorAction SilentlyContinue | Sort-Object Name -Descending | Select-Object -Skip 5 | ForEach-Object { Remove-Item -LiteralPath $_.FullName -Recurse -Force -ErrorAction SilentlyContinue }
  }
}

function Get-ExtInfo([string]$dir) {
  try {
    $m = Join-Path $dir 'manifest.json'
    if (-not (Test-Path -LiteralPath $m)) { return $null }
    $j = Get-Content -LiteralPath $m -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($j.name -match 'UCA') { return $j }
  } catch { }
  return $null
}
# Si le dossier donne n'a pas de manifest.json, on cherche l'extension dedans (sous-dossiers), puis a cote (dossiers freres), puis au-dessus.
function Search-Below([string]$root, [int]$maxDepth) {
  $level = @($root)
  for ($i = 0; $i -lt $maxDepth; $i++) {
    $next = @()
    foreach ($d in $level) {
      foreach ($c in (Get-ChildItem -LiteralPath $d -Directory -ErrorAction SilentlyContinue | Where-Object { $_.Name -notmatch '^(\.git|node_modules|\$RECYCLE\.BIN)$' })) {
        if (Get-ExtInfo $c.FullName) { return $c.FullName }
        $next += $c.FullName
      }
    }
    $level = $next
    if ($level.Count -eq 0) { break }
  }
  return $null
}
function Resolve-ExtDir([string]$dir) {
  if (-not $dir) { return $dir }
  $d = $dir.Trim().Trim('"')
  if ($d.Length -gt 3) { $d = $d.TrimEnd('\') }
  if (-not (Test-Path -LiteralPath $d -PathType Container)) { return $dir }
  if (Get-ExtInfo $d) { return $d }
  $r = Search-Below $d 4
  if ($r) { Write-Host ("Le manifest.json etait dans un sous-dossier : " + $r); return $r }
  $parent = Split-Path $d -Parent
  for ($up = 0; $up -lt 2 -and $parent; $up++) {
    if (Get-ExtInfo $parent) { Write-Host ("Le manifest.json etait dans le dossier du dessus : " + $parent); return $parent }
    $r = Search-Below $parent 3
    if ($r) { Write-Host ("Extension trouvee a cote : " + $r); return $r }
    $parent = Split-Path $parent -Parent
  }
  return $dir
}
$KNOWN = @('Chrome', 'Edge', 'Brave', 'Vivaldi', 'Chromium', 'Firefox')
function Browser-From([string]$origin) { $n = ($origin -split ',')[0].Trim(); if ($KNOWN -contains $n) { return $n }; return $null }
function Leaf-Browser([string]$path) { $leaf = (Split-Path $path -Leaf).ToLower(); foreach ($k in $KNOWN) { if ($leaf -match ('^extension_uca_' + $k.ToLower() + '$')) { return $k } }; return $null }
function Names-For([string]$path, [bool]$ff) {
  $n = New-Object System.Collections.ArrayList
  foreach ($c in $cands) { if ($c.Path -ieq $path) { foreach ($b in $c.Browsers) { if (-not ($n -contains $b)) { [void]$n.Add($b) } } } }
  $lb = Leaf-Browser $path
  if ($lb -and -not ($n -contains $lb)) { [void]$n.Add($lb) }
  if ($n.Count -eq 0) { if ($ff) { [void]$n.Add('Firefox') } else { [void]$n.Add('Chrome / Edge / Brave') } }
  return ($n -join ', ')
}
function Add-Cand([string]$dir, [string]$origin) {
  if (-not $dir) { return }
  $d = $dir.Trim().Trim('"')
  if ($d.Length -gt 3) { $d = $d.TrimEnd('\') }
  if (-not $d) { return }
  $bn = Browser-From $origin
  foreach ($c in $cands) { if ($c.Path -ieq $d) { if ($bn -and -not ($c.Browsers -contains $bn)) { [void]$c.Browsers.Add($bn) }; return } }
  $j = Get-ExtInfo $d
  if ($j -and $j.name -match '(?i)MOODLE\s*\(test\)') {
    if (-not (@($script:obsolete | Where-Object { $_.Path -ieq $d }).Count)) { [void]$script:obsolete.Add([pscustomobject]@{ Path = $d; Version = [string]$j.version; Name = [string]$j.name }) }
    return
  }
  if ($j) { $bl = New-Object System.Collections.ArrayList; if ($bn) { [void]$bl.Add($bn) }; [void]$cands.Add([pscustomobject]@{ Path = $d; Origin = $origin; Version = [string]$j.version; Firefox = [bool]$j.browser_specific_settings; Browsers = $bl }) }
}
function Find-InBrowsers {
  $la = $env:LOCALAPPDATA
  $roots = @(@('Chrome', "$la\Google\Chrome\User Data"), @('Edge', "$la\Microsoft\Edge\User Data"), @('Brave', "$la\BraveSoftware\Brave-Browser\User Data"), @('Vivaldi', "$la\Vivaldi\User Data"), @('Chromium', "$la\Chromium\User Data"))
  foreach ($r in $roots) {
    if (-not (Test-Path -LiteralPath $r[1])) { continue }
    foreach ($prof in (Get-ChildItem -LiteralPath $r[1] -Directory -ErrorAction SilentlyContinue | Where-Object { $_.Name -match '^(Default|Profile \d+)$' })) {
      foreach ($f in @('Secure Preferences', 'Preferences')) {
        $p = Join-Path $prof.FullName $f
        if (-not (Test-Path -LiteralPath $p)) { continue }
        try { $raw = [IO.File]::ReadAllText($p) } catch { continue }
        # extensions chargees depuis un dossier : "path":"C:\\dossier" (antislash doubles dans le JSON)
        foreach ($m in [regex]::Matches($raw, '"path"\s*:\s*"([A-Za-z]:\\\\[^"]*)"')) { Add-Cand ($m.Groups[1].Value -replace '\\\\', '\') ($r[0] + ', profil ' + $prof.Name) }
      }
    }
  }
  $ff = Join-Path $env:APPDATA 'Mozilla\Firefox\Profiles'
  if (Test-Path -LiteralPath $ff) {
    foreach ($prof in (Get-ChildItem -LiteralPath $ff -Directory -ErrorAction SilentlyContinue)) {
      $p = Join-Path $prof.FullName 'extensions.json'
      if (-not (Test-Path -LiteralPath $p)) { continue }
      try {
        $j = Get-Content -LiteralPath $p -Raw -Encoding UTF8 | ConvertFrom-Json
        foreach ($a in $j.addons) { if ($a.id -eq $GECKO -and $a.path) { $d = [string]$a.path; if ((Test-Path -LiteralPath $d -PathType Leaf)) { $d = Split-Path $d -Parent }; Add-Cand $d ('Firefox, profil ' + $prof.Name) } }
      } catch { }
    }
  }
}
# Dossier chargé par le navigateur pour CETTE extension (identifiant donné par l'extension) : la certitude, pas une supposition.
function Find-ById([string]$id) {
  if ($id -cnotmatch '^[a-p]{32}$') { return $null }
  $la = $env:LOCALAPPDATA
  $roots = @(@('Chrome', "$la\Google\Chrome\User Data"), @('Edge', "$la\Microsoft\Edge\User Data"), @('Brave', "$la\BraveSoftware\Brave-Browser\User Data"), @('Vivaldi', "$la\Vivaldi\User Data"), @('Chromium', "$la\Chromium\User Data"))
  $label = Browser-Label
  if ($label) { $roots = @($roots | Sort-Object { if ($_[0] -eq $label) { 0 } else { 1 } }) }
  foreach ($r in $roots) {
    if (-not (Test-Path -LiteralPath $r[1])) { continue }
    foreach ($prof in (Get-ChildItem -LiteralPath $r[1] -Directory -ErrorAction SilentlyContinue | Where-Object { $_.Name -match '^(Default|Profile \d+)$' })) {
      foreach ($f in @('Secure Preferences', 'Preferences')) {
        $p = Join-Path $prof.FullName $f
        if (-not (Test-Path -LiteralPath $p)) { continue }
        try { $raw = [IO.File]::ReadAllText($p) } catch { continue }
        foreach ($m in [regex]::Matches($raw, '"' + $id + '"\s*:\s*\{')) {
          # fin de l'objet de cette extension : accolades comptees hors des chaines
          $depth = 0; $inText = $false; $start = $m.Index + $m.Length - 1; $end = -1
          for ($k = $start; $k -lt $raw.Length -and ($k - $start) -lt 400000; $k++) {
            $ch = $raw[$k]
            if ($inText) { if ($ch -eq '\') { $k++ } elseif ($ch -eq '"') { $inText = $false } }
            elseif ($ch -eq '"') { $inText = $true }
            elseif ($ch -eq '{') { $depth++ }
            elseif ($ch -eq '}') { $depth--; if ($depth -eq 0) { $end = $k; break } }
          }
          if ($end -lt 0) { continue }
          $pm = [regex]::Match($raw.Substring($start, $end - $start + 1), '"path"\s*:\s*"([A-Za-z]:\\\\[^"]*)"')
          if ($pm.Success) {
            $dir = $pm.Groups[1].Value -replace '\\\\', '\'
            if (Get-ExtInfo $dir) { return [pscustomobject]@{ Path = $dir; Origin = ($r[0] + ', profil ' + $prof.Name) } }
          }
        }
      }
    }
  }
  return $null
}
function Browser-Label { switch ($env:MYUCA_BROWSER) { 'chrome' { 'Chrome' } 'edge' { 'Edge' } 'brave' { 'Brave' } 'vivaldi' { 'Vivaldi' } 'chromium' { 'Chromium' } 'firefox' { 'Firefox' } default { '' } } }
function Limit-ToBrowser {
  $l = Browser-Label
  if (-not $l) { return }
  $keep = @($cands | Where-Object { ($_.Browsers -contains $l) -or ($_.Origin -like ($l + '*')) })
  if ($keep.Count -gt 0) { $cands.Clear(); foreach ($k in $keep) { [void]$cands.Add($k) } }
}
function Open-InBrowser([string]$ver) {
  if ($env:MYUCA_NOLAUNCH -eq '1') { return }
  $l = Browser-Label
  if (-not $l) { return }
  $exe = switch ($env:MYUCA_BROWSER) { 'chrome' { 'chrome.exe' } 'edge' { 'msedge.exe' } 'brave' { 'brave.exe' } 'vivaldi' { 'vivaldi.exe' } 'chromium' { 'chrome.exe' } 'firefox' { 'firefox.exe' } }
  $path = $null
  $rels = switch ($env:MYUCA_BROWSER) { 'chrome' { @('Google\Chrome\Application\chrome.exe') } 'chromium' { @('Chromium\Application\chrome.exe') } 'edge' { @('Microsoft\Edge\Application\msedge.exe') } 'brave' { @('BraveSoftware\Brave-Browser\Application\brave.exe') } 'vivaldi' { @('Vivaldi\Application\vivaldi.exe') } 'firefox' { @('Mozilla Firefox\firefox.exe') } }
  foreach ($base in @($env:ProgramFiles, ${env:ProgramFiles(x86)}, $env:LOCALAPPDATA)) { foreach ($rel in $rels) { if ($base) { $c = Join-Path $base $rel; if (Test-Path -LiteralPath $c) { $path = $c; break } } }; if ($path) { break } }
  $url = 'https://kiricoucou.github.io/uca-extension/merci.html?v=' + $ver + '&open=1'
  try { if (-not $path) { throw 'introuvable' }; Start-Process -FilePath $path -ArgumentList $url; Write-Host ($l + " s'ouvre sur la nouvelle version de l'extension.") } catch { Write-Host ("Ouvre " + $l + " toi-meme : l'extension est a jour.") }
}
# Pilote installe : une seule copie dans %LOCALAPPDATA%\MyUCA, lancee par le lien uca-maj: (aucun droit administrateur).
$PILOT_KEY = if ($env:MYUCA_REGKEY) { $env:MYUCA_REGKEY } else { 'HKCU:\Software\Classes\uca-maj' }
$PILOT_DIR = Join-Path $env:LOCALAPPDATA 'MyUCA'
# N'importe quel site peut ouvrir un lien uca-maj: ; rien de ce lien n'est execute ni transmis, sauf un nom de navigateur de la liste.
$LAUNCHER = @'
$u = [string]($args -join ' ')
$b = ''; $i = ''
# Seules deux choses sont tirees du lien, de forme fixe : un navigateur de la liste et l'identifiant d'une extension (32 lettres a-p).
if ($u -match '^uca-maj:(//)?(chrome|edge|brave|vivaldi|chromium|firefox)(/([a-p]{32}))?/?$') { $b = $Matches[2].ToLower(); if ($Matches[4]) { $i = $Matches[4].ToLower() } }
# Sans /yes : le pilote montre ses fenetres (dossier trouve, « Valider ») et attend avant de se fermer.
$p = @(); if ($b) { $p = @('/browser', $b) }; if ($i) { $p += @('/id', $i) }
if ($env:MYUCA_DRYRUN -eq '1') { Write-Output (('[' + ($p -join ' ') + ']')); exit 0 }
& (Join-Path $PSScriptRoot 'maj-extension.bat') @p
'@
function Install-Pilot {
  if ($env:MYUCA_NOINSTALL -eq '1') { return }
  try {
    New-Item -ItemType Directory -Force -Path $PILOT_DIR | Out-Null
    $target = Join-Path $PILOT_DIR 'maj-extension.bat'
    if ($env:SELFBAT -ine $target) { Copy-Item -LiteralPath $env:SELFBAT -Destination $target -Force }
    $launch = Join-Path $PILOT_DIR 'lancer.ps1'
    Set-Content -LiteralPath $launch -Value $LAUNCHER -Encoding ASCII
    $ps = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
    $cmd = '"' + $ps + '" -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + $launch + '" "%1"'
    New-Item -Path "$PILOT_KEY\shell\open\command" -Force | Out-Null
    Set-Item -Path $PILOT_KEY -Value 'URL:Pilote de mise a jour My UCA'
    New-ItemProperty -Path $PILOT_KEY -Name 'URL Protocol' -Value '' -PropertyType String -Force | Out-Null
    Set-Item -Path "$PILOT_KEY\shell\open\command" -Value $cmd
    Write-Host "Pilote installe : les prochaines fois, clique sur ""Telecharger et appliquer la mise a jour"" dans l'extension, rien a telecharger."
    Write-Host "(Tu peux supprimer le fichier telecharge. Desinstaller : maj-extension.bat /desinstaller)"
  } catch { Write-Host ("Pilote non installe (" + $_.Exception.Message + ") : la mise a jour continue.") }
}
function Uninstall-Pilot {
  Remove-Item -Path $PILOT_KEY -Recurse -Force -ErrorAction SilentlyContinue
  foreach ($f in 'lancer.ps1', 'maj-extension.bat') { $x = Join-Path $PILOT_DIR $f; if ($env:SELFBAT -ine $x) { Remove-Item -LiteralPath $x -Force -ErrorAction SilentlyContinue } }
  Write-Host "Pilote desinstalle."
}
function Pick-Folder {
  Add-Type -AssemblyName System.Windows.Forms
  $d = New-Object System.Windows.Forms.FolderBrowserDialog
  $d.Description = "Choisis le dossier de l'extension (celui qui contient manifest.json)"
  if ($d.ShowDialog() -eq 'OK') { return (Resolve-ExtDir $d.SelectedPath) }
  return $null
}
function Show-Confirm([string]$latest) {
  $f = New-Window 'Mise à jour de My UCA' 700 440
  $f.MinimizeBox = $false
  $t = New-Text ("Version qui va être installée : " + $latest) 24 18 650 34 16 $true
  $t.ForeColor = [System.Drawing.Color]::FromArgb(11, 87, 208)
  $one = ($cands.Count -eq 1)
  $s = New-Text $(if ($one) { "Voici ton extension, retrouvée dans ton navigateur. Clique sur « Mettre à jour »." } else { "Plusieurs dossiers sont chargés par tes navigateurs : choisis celui à mettre à jour." }) 24 58 650 26 10
  $list = New-Object System.Windows.Forms.ListBox
  $list.Location = New-Object System.Drawing.Point(24, 92); $list.Size = New-Object System.Drawing.Size(652, 74); $list.HorizontalScrollBar = $true; $list.IntegralHeight = $false
  foreach ($c in $cands) {
    $who = if ($c.Browsers.Count) { $c.Browsers -join ', ' } else { $c.Origin }
    [void]$list.Items.Add($who + '  -  version installée ' + $c.Version + '   :   ' + $c.Path)
  }
  $list.SelectedIndex = 0
  $info = New-Text '' 24 176 652 86 11 $true
  $note = New-Text '' 24 264 652 62 9
  $note.ForeColor = [System.Drawing.Color]::FromArgb(110, 80, 10)
  if ($script:obsolete.Count) { $note.Text = "Non mise à jour : l'ancienne « Édition Moodle » de test (version " + $script:obsolete[0].Version + ", numérotation à part). Tu peux la retirer dans chrome://extensions." }
  $tool = New-Text ("Outil de mise à jour (pilote) " + $env:MYUCA_PILOT_VERSION + " : ce numéro est celui de l'outil, pas celui de l'extension.") 24 336 652 24 9
  $tool.ForeColor = [System.Drawing.Color]::Gray
  $bo = New-Button 'Ouvrir le dossier' 24 378 150
  $bu = New-Button 'Autre dossier…' 184 378 130
  $bc = New-Button 'Annuler' 410 378 100
  $bv = New-Button 'Mettre à jour' 520 378 156; $bv.Font = New-Object System.Drawing.Font('Segoe UI Semibold', 10)
  $refresh = {
    $c = $cands[$list.SelectedIndex]
    $newer = $true; try { $newer = ([version]$latest -gt [version]$c.Version) } catch { }
    if ($newer) { $info.Text = "Installée : " + $c.Version + "   →   Nouvelle : " + $latest + "`r`n" + $c.Path; $bv.Text = 'Mettre à jour' }
    else { $info.Text = "Ce dossier est déjà en version " + $c.Version + " (dernière publiée : " + $latest + ").`r`n" + $c.Path; $bv.Text = 'Vérifier' }
  }.GetNewClosure()
  $list.Add_SelectedIndexChanged($refresh); & $refresh
  $global:uca_chosen = $null
  $bo.Add_Click({ Start-Process explorer.exe -ArgumentList ('"' + $cands[$list.SelectedIndex].Path + '"') })
  $bv.Add_Click({ $global:uca_chosen = $cands[$list.SelectedIndex].Path; $f.Close() })
  $bc.Add_Click({ $global:uca_chosen = $null; $f.Close() })
  $bu.Add_Click({
    $p = Pick-Folder
    if ($p) { if (Get-ExtInfo $p) { $global:uca_chosen = $p; $f.Close() } else { [void][System.Windows.Forms.MessageBox]::Show("Ce dossier ne contient pas l'extension My UCA (pas de manifest.json). Choisis le dossier chargé dans chrome://extensions.", 'My UCA') } }
  })
  $f.AcceptButton = $bv; $f.CancelButton = $bc
  $f.Controls.AddRange(@($t, $s, $list, $info, $note, $tool, $bo, $bu, $bc, $bv))
  Use-AutoTest $f $(if ($env:MYUCA_SHOTCANCEL -eq '1') { $bc } else { $bv }) 'choix'
  [void]$f.ShowDialog()
  return $global:uca_chosen
}

try {
  # Essai : seulement le bouton « Ouvrir la page des extensions », sans rien mettre a jour.
  if ($env:MYUCA_OPENTEST) { Write-Output ("ouverture " + $env:MYUCA_OPENTEST + " : " + (Open-ExtensionsPage $env:MYUCA_OPENTEST)); exit 0 }
  if ($env:MYUCA_UNINSTALL -ne '1') { Show-Progress; Confirm-LatestPilot; Close-Progress }
  if ($env:MYUCA_UNINSTALL -eq '1') { Uninstall-Pilot; Show-Result 'info' 'Pilote désinstallé' "Le bouton de l'extension ne pourra plus ouvrir l'outil tant que tu ne le relances pas."; exit 0 }
  $tmp = Join-Path $env:TEMP ('myuca-' + [guid]::NewGuid().ToString('N'))
  $pk = @{}
  function Get-Pkg([bool]$ff) {
    $key = if ($ff) { 'ff' } else { 'ch' }
    if ($pk.ContainsKey($key)) { return $pk[$key] }
    if (-not (Test-Path $tmp)) { New-Item -ItemType Directory -Path $tmp | Out-Null }
    $url = if ($ff) { $env:MYUCA_URL_FF } else { $env:MYUCA_URL }
    Write-Host ("Recherche de la derniere version (" + $(if ($ff) { 'Firefox' } else { 'Chrome / Edge / Brave' }) + ")...")
    $zip = Join-Path $tmp ($key + '.zip')
    Invoke-WebRequest -Uri ($url + '?t=' + [DateTime]::UtcNow.Ticks) -OutFile $zip -UseBasicParsing -TimeoutSec 60
    $x = Join-Path $tmp ('x' + $key)
    Expand-Archive -Path $zip -DestinationPath $x -Force
    $nm = Join-Path $x 'manifest.json'
    if (-not (Test-Path $nm)) { throw "ZIP invalide : pas de manifest.json" }
    $nw = (Get-Content $nm -Raw -Encoding UTF8 | ConvertFrom-Json)
    if ($nw.name -notmatch 'UCA') { throw "ZIP inattendu (nom : $($nw.name))" }
    $pk[$key] = $x
    return $x
  }
  $dest = $null
  if ($env:MYUCA_ARGDEST) {
    # dossier donné explicitement : pas de recherche ni de confirmation
    Add-Cand (Resolve-ExtDir $env:MYUCA_ARGDEST) 'dossier indiqué'
    if ($cands.Count -eq 0) { Show-Result 'error' 'Extension introuvable' ("Pas d'extension My UCA à mettre à jour dans : " + $env:MYUCA_ARGDEST); exit 2 }
    $dest = $cands[0].Path
  } else {
    $mine = if ($env:MYUCA_ID) { Find-ById $env:MYUCA_ID } else { $null }
    if ($mine) {
      Add-Cand $mine.Path $mine.Origin
      Write-Host ("Dossier de ton extension, lu dans la configuration du navigateur (" + $mine.Origin + ").")
    } else {
      # Les dossiers que les navigateurs chargent passent AVANT la memoire : sinon on mettrait a jour un dossier que
      # personne ne charge, et l'extension resterait a l'ancienne version.
      Find-InBrowsers
      Limit-ToBrowser
      # La memoire et le dossier du script ne servent QUE si aucun navigateur ne charge l'extension : sinon ils
      # ajouteraient des dossiers fantomes a la liste.
      if ($cands.Count -eq 0) {
        if ($env:MYUCA_CFG -and (Test-Path -LiteralPath $env:MYUCA_CFG)) { Add-Cand ((Get-Content -LiteralPath $env:MYUCA_CFG -Raw).Trim()) 'dossier utilisé la dernière fois' }
        Add-Cand $env:MYUCA_SELFDIR 'dossier de ce script'
      }
    }
    if ($cands.Count -eq 0) {
      Write-Host "Je n'ai pas retrouve l'extension automatiquement."
      if ($auto) { exit 2 }
      if ($GUI) { [void][System.Windows.Forms.MessageBox]::Show("Je n'ai pas retrouvé l'extension toute seule. Choisis son dossier (celui affiché dans chrome://extensions, « Details »).", 'Mise a jour de My UCA') }
      $p = Pick-Folder
      if (-not $p) { exit 3 }
      Add-Cand $p 'dossier choisi'
      if ($cands.Count -eq 0) { Show-Result 'error' 'Extension introuvable' "Ce dossier ne contient pas l'extension My UCA (pas de manifest.json)."; exit 2 }
      $dest = $cands[0].Path
    } elseif ($auto) {
      $dest = $cands[0].Path
      Write-Host ("Dossier detecte : " + $dest + "  (" + (Names-For $dest ([bool](Get-ExtInfo $dest).browser_specific_settings)) + ")")
    } else {
      Write-Host ("Dossier(s) detecte(s) : " + $cands.Count + " - confirme dans la fenetre.")
      Show-Progress
      $latest = [string](Get-Content (Join-Path (Get-Pkg $cands[0].Firefox) 'manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json).version
      Close-Progress
      $dest = Show-Confirm $latest
      if (-not $dest) { exit 3 }
    }
  }

  # Ce dossier est-il charge par un navigateur ? Sinon on le dira clairement a la fin.
  $loadedDest = $false
  foreach ($c in $cands) { if ($c.Path -ieq $dest -and ($c.Browsers.Count -gt 0 -or $c.Origin -like '*profil*')) { $loadedDest = $true } }

  # memorise le dossier pour la prochaine fois
  if ($env:MYUCA_CFG) { New-Item -ItemType Directory -Force -Path (Split-Path $env:MYUCA_CFG -Parent) | Out-Null; Set-Content -LiteralPath $env:MYUCA_CFG -Value $dest -Encoding ASCII }

  Show-Progress
  Install-Pilot

  # cibles : le dossier choisi + les dossiers des autres navigateurs rangés a cote (extension_uca_chrome / _edge / _firefox...)
  $targets = New-Object System.Collections.ArrayList
  [void]$targets.Add($dest)
  if (-not $env:MYUCA_ARGDEST -and -not $env:MYUCA_BROWSER) {
    $par = Split-Path $dest -Parent
    if ($par) {
      foreach ($sd in (Get-ChildItem -LiteralPath $par -Directory -ErrorAction SilentlyContinue)) {
        if ($sd.FullName -ieq $dest) { continue }
        if ((Leaf-Browser $sd.FullName) -and (Get-ExtInfo $sd.FullName)) { [void]$targets.Add($sd.FullName); Write-Host ("Autre navigateur detecte : " + $sd.FullName) }
      }
    }
    $destFF = [bool](Get-ExtInfo $dest).browser_specific_settings
    $haveOther = $false; foreach ($t in $targets) { if ([bool](Get-ExtInfo $t).browser_specific_settings -ne $destFF) { $haveOther = $true } }
    if (-not $haveOther) { foreach ($c in $cands) { if ($c.Firefox -ne $destFF -and $targets -notcontains $c.Path) { [void]$targets.Add($c.Path); Write-Host ("Autre navigateur detecte : " + $c.Path); break } } }
  }
  $anyFF = $false; $chNames = @(); $first = $true; $firstVersion = $null
  foreach ($t in $targets) {
    $ff = [bool](Get-ExtInfo $t).browser_specific_settings
    $x = Get-Pkg $ff
    $new = (Get-Content (Join-Path $x 'manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json)
    $old = (Get-Content (Join-Path $t 'manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json)
    $names = Names-For $t $ff
    Write-Host ""
    Write-Host ("Dossier : " + $t + "  (" + $names + ")")
    Write-Host ("Version installee : " + $old.version + "   Derniere version : " + $new.version)
    if ([version]$new.version -le [version]$old.version -and $env:MYUCA_FORCE -ne '1') {
      Write-Host "Deja a jour (utilise /force pour reinstaller quand meme)."
      [void]$script:results.Add(("Déjà à jour : version " + $old.version + "  (" + $names + ")`r`n" + $t))
    } else {
      Save-Backup $x $t $old.version
      robocopy $x $t /E /XF 'maj-extension.bat' /NFL /NDL /NJH /NJS /NP | Out-Null
      if ($LASTEXITCODE -ge 8) { throw "copie impossible (robocopy $LASTEXITCODE) : ferme les fichiers ouverts puis reessaie" }
      Get-ChildItem -Path $t -Recurse -Force -Include 'desktop.ini','Thumbs.db','.DS_Store' -ErrorAction SilentlyContinue | ForEach-Object { try { $_.Attributes = 'Normal'; Remove-Item $_.FullName -Force } catch {} }
      # On relit le disque : on n'annonce une reussite que si la version a vraiment change.
      $now = [string](Get-ExtInfo $t).version
      if ($now -ne [string]$new.version) { throw ("le dossier est reste en version " + $now + " au lieu de " + $new.version) }
      Write-Host ("OK : " + $old.version + " -> " + $new.version)
      [void]$script:results.Add(("Mise à jour : " + $old.version + "  ->  " + $new.version + "  (" + $names + ")`r`n" + $t))
      $script:changed = $true
    }
    if ($ff) { $anyFF = $true } else { $chNames += ($names -split ', ') }
    if ($first) { $firstVersion = (Get-ExtInfo $t).version; $first = $false }
  }
  Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
  if ($env:MYUCA_VERSION -and $firstVersion -ne $env:MYUCA_VERSION) { Write-Host ("Remarque : la version attendue etait " + $env:MYUCA_VERSION + ", le dossier contient maintenant " + $firstVersion + ".") }
  if ($loadedDest) { Open-InBrowser $firstVersion }
  else {
    Write-Host ""
    Write-Host ("ATTENTION : je n'ai pas trouve ce dossier parmi ceux que tes navigateurs chargent : " + $dest)
    Write-Host "Si ton extension reste a l'ancienne version, ouvre chrome://extensions, ""Details"", et compare le dossier affiche."
  }
  Write-Host ""
  $opens = @()
  if ($chNames.Count -gt 0) {
    Write-Host "Pour appliquer la mise a jour : dans chrome://extensions (edge://extensions, brave://extensions), clique sur ""Recharger"" (fleche ronde)"
    Write-Host "sur la carte de l'extension. Elle se recharge aussi toute seule a la prochaine verification."
    foreach ($n in ($chNames | Select-Object -Unique)) { switch -Wildcard ($n) { 'Edge' { $opens += ,@('msedge', 'edge://extensions') } 'Brave' { $opens += ,@('brave', 'brave://extensions') } 'Vivaldi' { $opens += ,@('vivaldi', 'vivaldi://extensions') } 'Chromium' { $opens += ,@('chrome', 'chrome://extensions') } 'Chrome*' { $opens += ,@('chrome', 'chrome://extensions') } } }
  }
  if ($anyFF) {
    Write-Host "Firefox : ouvre about:debugging#/runtime/this-firefox et clique sur ""Recharger"" sur la carte de l'extension."
  }
  if ($GUI) {
    $openNames = @($chNames); if ($anyFF) { $openNames += 'Firefox' }
    $script:openChoices = @(Get-OpenChoices $openNames)
    $text = ($script:results -join "`r`n`r`n")
    if ($script:changed) { $text += "`r`n`r`nDernière étape : dans chrome://extensions, clique sur la flèche ronde « Recharger » de My UCA (sinon l'extension le fait toute seule à sa prochaine vérification)." }
    if ($script:backups.Count) { $text += "`r`n`r`nCopie de sécurité des anciens fichiers : " + ($script:backups -join ', ') }
    if (-not $loadedDest) { $text += "`r`n`r`nATTENTION : aucun navigateur ne charge ce dossier. Compare avec le dossier affiché dans chrome://extensions, « Détails »." }
    if ($script:changed) { Show-Result 'ok' ("Extension mise à jour en version " + $firstVersion) $text }
    else { Show-Result 'info' ("Aucun changement : tu es déjà en version " + $firstVersion) $text }
  }
  if ($anyFF -and $chNames.Count -gt 0) { exit 11 }
  if ($anyFF) { exit 10 }
  exit 0
} catch {
  Write-Host ("Erreur : " + $_.Exception.Message)
  Show-Result 'error' 'La mise à jour a échoué' ($_.Exception.Message + "`r`n`r`nSi une copie de sécurité a été faite, elle est indiquée dans « Voir le détail ».")
  exit 1
}
