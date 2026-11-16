@echo off
setlocal EnableExtensions
chcp 65001 >nul
title Mise a jour de l'extension My UCA
rem ----------------------------------------------------------------------------------------------
rem  Met a jour l'extension "My UCA" (Chrome, Edge, Brave, Vivaldi, Firefox) chargee en mode developpeur.
rem  1. Il retrouve tout seul le dossier de l'extension dans ton navigateur (ou le dossier memorise, ou celui du script).
rem  2. Il te le montre : "Ouvrir le dossier" pour verifier, puis "Valider".
rem  3. Il cherche une version plus recente et, s'il y en a une, met l'extension a jour tout seul.
rem  - Aucun droit administrateur : tout se passe dans ton profil et dans le dossier de l'extension.
rem  - Telecharge le ZIP officiel sur https://kiricoucou.github.io/uca-extension/ (HTTPS), rien d'autre.
rem  - Ne touche pas a tes donnees : elles sont dans le navigateur, pas dans ce dossier.
rem  Usage : double-clic  |  maj-extension.bat "C:\chemin\dossier"  |  maj-extension.bat /force (reinstalle meme a jour)
rem ----------------------------------------------------------------------------------------------
set "SELFBAT=%~f0"
set "MYUCA_SELFDIR=%~dp0"
set "MYUCA_URL=https://kiricoucou.github.io/uca-extension/extension/uca-extension-chrome.zip"
set "MYUCA_URL_FF=https://kiricoucou.github.io/uca-extension/extension/uca-extension-firefox.zip"
set "MYUCA_FORCE=0"
set "MYUCA_ARGDEST="
set "MYUCA_CFG=%LOCALAPPDATA%\MyUCA\dossier-extension.txt"

:args
if "%~1"=="" goto :argsdone
if /i "%~1"=="/force" (set "MYUCA_FORCE=1") else (set "MYUCA_ARGDEST=%~1")
shift
goto :args
:argsdone

echo.
echo Recherche de l'extension My UCA...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$s=[IO.File]::ReadAllText($env:SELFBAT); $i=$s.IndexOf([string][char]10+'#PS-START'); Invoke-Expression $s.Substring($i)"
set "RC=%ERRORLEVEL%"
if "%RC%"=="0" goto :ok
if "%RC%"=="10" goto :okff
if "%RC%"=="3" goto :cancel
if "%RC%"=="2" goto :nodest
goto :fail

:ok
echo.
echo Pour appliquer la mise a jour : dans chrome://extensions, clique sur "Recharger" (fleche ronde)
echo sur la carte de l'extension. Elle se recharge aussi toute seule a la prochaine verification.
if not defined MYUCA_NOPAUSE (
  choice /c ON /n /t 15 /d N /m "Ouvrir chrome://extensions maintenant ? (O/N) "
  if errorlevel 2 goto :end
  start "" chrome "chrome://extensions" 2>nul || start "" msedge "edge://extensions" 2>nul
)
goto :end

:okff
echo.
echo Pour appliquer la mise a jour : dans Firefox, ouvre about:debugging#/runtime/this-firefox
echo et clique sur "Recharger" sur la carte de l'extension ^(ou clique sur le bouton de mise a jour de l'extension^).
goto :end

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
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$auto = ($env:MYUCA_NOPAUSE -eq '1' -or $env:MYUCA_AUTO -eq '1')
$GECKO = 'uca-connecteur@site-emploi-du-temps.local'
$cands = New-Object System.Collections.ArrayList

function Get-ExtInfo([string]$dir) {
  try {
    $m = Join-Path $dir 'manifest.json'
    if (-not (Test-Path -LiteralPath $m)) { return $null }
    $j = Get-Content -LiteralPath $m -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($j.name -match 'UCA') { return $j }
  } catch { }
  return $null
}
function Add-Cand([string]$dir, [string]$origin) {
  if (-not $dir) { return }
  $d = $dir.Trim().Trim('"')
  if ($d.Length -gt 3) { $d = $d.TrimEnd('\') }
  if (-not $d) { return }
  foreach ($c in $cands) { if ($c.Path -ieq $d) { return } }
  $j = Get-ExtInfo $d
  if ($j) { [void]$cands.Add([pscustomobject]@{ Path = $d; Origin = $origin; Version = [string]$j.version; Firefox = [bool]$j.browser_specific_settings }) }
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
function Pick-Folder {
  Add-Type -AssemblyName System.Windows.Forms
  $d = New-Object System.Windows.Forms.FolderBrowserDialog
  $d.Description = "Choisis le dossier de l'extension (celui qui contient manifest.json)"
  if ($d.ShowDialog() -eq 'OK') { return $d.SelectedPath }
  return $null
}
function Show-Confirm {
  Add-Type -AssemblyName System.Windows.Forms
  Add-Type -AssemblyName System.Drawing
  [System.Windows.Forms.Application]::EnableVisualStyles()
  $f = New-Object System.Windows.Forms.Form
  $f.Text = "Mise à jour de l'extension My UCA"
  $f.StartPosition = 'CenterScreen'; $f.ClientSize = New-Object System.Drawing.Size(640, 300)
  $f.FormBorderStyle = 'FixedDialog'; $f.MaximizeBox = $false; $f.MinimizeBox = $false; $f.TopMost = $true
  $f.Font = New-Object System.Drawing.Font('Segoe UI', 10)
  $t = New-Object System.Windows.Forms.Label
  $t.Text = "C'est bien le dossier de ton extension ?"; $t.Font = New-Object System.Drawing.Font('Segoe UI Semibold', 14)
  $t.Location = New-Object System.Drawing.Point(20, 16); $t.Size = New-Object System.Drawing.Size(600, 30)
  $s = New-Object System.Windows.Forms.Label
  $s.Text = "Je l'ai retrouvé dans ton navigateur. Clique sur « Ouvrir le dossier » pour vérifier que c'est le bon, puis sur « Valider » : je cherche une nouvelle version et je mets l'extension à jour toute seule."
  $s.Location = New-Object System.Drawing.Point(20, 52); $s.Size = New-Object System.Drawing.Size(600, 56)
  $list = New-Object System.Windows.Forms.ListBox
  $list.Location = New-Object System.Drawing.Point(20, 116); $list.Size = New-Object System.Drawing.Size(600, 110); $list.HorizontalScrollBar = $true
  foreach ($c in $cands) { [void]$list.Items.Add($c.Path + '   (' + $c.Origin + ', version ' + $c.Version + ')') }
  $list.SelectedIndex = 0
  $bo = New-Object System.Windows.Forms.Button; $bo.Text = 'Ouvrir le dossier'; $bo.Location = New-Object System.Drawing.Point(20, 246); $bo.Size = New-Object System.Drawing.Size(150, 38)
  $bu = New-Object System.Windows.Forms.Button; $bu.Text = 'Autre dossier…'; $bu.Location = New-Object System.Drawing.Point(180, 246); $bu.Size = New-Object System.Drawing.Size(130, 38)
  $bc = New-Object System.Windows.Forms.Button; $bc.Text = 'Annuler'; $bc.Location = New-Object System.Drawing.Point(400, 246); $bc.Size = New-Object System.Drawing.Size(100, 38)
  $bv = New-Object System.Windows.Forms.Button; $bv.Text = 'Valider'; $bv.Location = New-Object System.Drawing.Point(510, 246); $bv.Size = New-Object System.Drawing.Size(110, 38); $bv.Font = New-Object System.Drawing.Font('Segoe UI Semibold', 10)
  $global:uca_chosen = $null
  $bo.Add_Click({ Start-Process explorer.exe -ArgumentList ('"' + $cands[$list.SelectedIndex].Path + '"') })
  $bv.Add_Click({ $global:uca_chosen = $cands[$list.SelectedIndex].Path; $f.Close() })
  $bc.Add_Click({ $global:uca_chosen = $null; $f.Close() })
  $bu.Add_Click({
    $p = Pick-Folder
    if ($p) { if (Get-ExtInfo $p) { $global:uca_chosen = $p; $f.Close() } else { [void][System.Windows.Forms.MessageBox]::Show("Ce dossier ne contient pas l'extension My UCA (pas de manifest.json). Choisis le dossier chargé dans chrome://extensions.", 'My UCA') } }
  })
  $f.AcceptButton = $bv; $f.CancelButton = $bc
  $f.Controls.AddRange(@($t, $s, $list, $bo, $bu, $bc, $bv))
  [void]$f.ShowDialog()
  return $global:uca_chosen
}

try {
  $dest = $null
  if ($env:MYUCA_ARGDEST) {
    # dossier donné explicitement : pas de recherche ni de confirmation
    Add-Cand $env:MYUCA_ARGDEST 'dossier indiqué'
    if ($cands.Count -eq 0) { exit 2 }
    $dest = $cands[0].Path
  } else {
    if ($env:MYUCA_CFG -and (Test-Path -LiteralPath $env:MYUCA_CFG)) { Add-Cand ((Get-Content -LiteralPath $env:MYUCA_CFG -Raw).Trim()) 'dossier utilisé la dernière fois' }
    Add-Cand $env:MYUCA_SELFDIR 'dossier de ce script'
    Find-InBrowsers
    if ($cands.Count -eq 0) {
      Write-Host "Je n'ai pas retrouve l'extension automatiquement."
      if ($auto) { exit 2 }
      $p = Pick-Folder
      if (-not $p) { exit 3 }
      Add-Cand $p 'dossier choisi'
      if ($cands.Count -eq 0) { exit 2 }
      $dest = $cands[0].Path
    } elseif ($auto) {
      $dest = $cands[0].Path
      Write-Host ("Dossier detecte : " + $dest + "  (" + $cands[0].Origin + ")")
    } else {
      Write-Host ("Dossier(s) detecte(s) : " + $cands.Count + " - confirme dans la fenetre.")
      $dest = Show-Confirm
      if (-not $dest) { exit 3 }
    }
  }

  # memorise le dossier pour la prochaine fois
  if ($env:MYUCA_CFG) { New-Item -ItemType Directory -Force -Path (Split-Path $env:MYUCA_CFG -Parent) | Out-Null; Set-Content -LiteralPath $env:MYUCA_CFG -Value $dest -Encoding ASCII }

  $isFirefox = [bool](Get-ExtInfo $dest).browser_specific_settings
  $url = if ($isFirefox) { $env:MYUCA_URL_FF } else { $env:MYUCA_URL }
  Write-Host ""
  Write-Host ("Dossier : " + $dest)
  Write-Host "Recherche de la derniere version..."
  $tmp = Join-Path $env:TEMP ('myuca-' + [guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Path $tmp | Out-Null
  $zip = Join-Path $tmp 'ext.zip'
  Invoke-WebRequest -Uri ($url + '?t=' + [DateTime]::UtcNow.Ticks) -OutFile $zip -UseBasicParsing -TimeoutSec 60
  $x = Join-Path $tmp 'x'
  Expand-Archive -Path $zip -DestinationPath $x -Force
  $newManifest = Join-Path $x 'manifest.json'
  if (-not (Test-Path $newManifest)) { throw "ZIP invalide : pas de manifest.json" }
  $new = (Get-Content $newManifest -Raw -Encoding UTF8 | ConvertFrom-Json)
  if ($new.name -notmatch 'UCA') { throw "ZIP inattendu (nom : $($new.name))" }
  $old = (Get-Content (Join-Path $dest 'manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json)
  Write-Host ("Version installee : " + $old.version + "   Derniere version : " + $new.version)
  if ([version]$new.version -le [version]$old.version -and $env:MYUCA_FORCE -ne '1') {
    Write-Host "Deja a jour (utilise /force pour reinstaller quand meme)."
  } else {
    robocopy $x $dest /E /XF 'maj-extension.bat' /NFL /NDL /NJH /NJS /NP | Out-Null
    if ($LASTEXITCODE -ge 8) { throw "copie impossible (robocopy $LASTEXITCODE) : ferme les fichiers ouverts puis reessaie" }
    Get-ChildItem -Path $dest -Recurse -Force -Include 'desktop.ini','Thumbs.db','.DS_Store' -ErrorAction SilentlyContinue | ForEach-Object { try { $_.Attributes = 'Normal'; Remove-Item $_.FullName -Force } catch {} }
    Write-Host ("OK : " + $old.version + " -> " + $new.version)
  }
  Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
  if ($isFirefox) { exit 10 }
  exit 0
} catch {
  Write-Host ("Erreur : " + $_.Exception.Message)
  exit 1
}
