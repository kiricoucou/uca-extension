@echo off
setlocal EnableExtensions
chcp 65001 >nul
rem  Version du pilote : a monter a chaque changement de ce script (elle figure dans le nom du fichier telecharge).
set "MYUCA_PILOT_VERSION=2.1"
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

echo.
echo Pilote de mise a jour My UCA, version %MYUCA_PILOT_VERSION%
echo Recherche de l'extension My UCA...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$s=[IO.File]::ReadAllText($env:SELFBAT); $i=$s.IndexOf([string][char]10+'#PS-START'); Invoke-Expression $s.Substring($i)"
set "RC=%ERRORLEVEL%"
if "%RC%"=="0" goto :ok
if "%RC%"=="10" goto :ok
if "%RC%"=="11" goto :ok
if "%RC%"=="3" goto :cancel
if "%RC%"=="2" goto :nodest
goto :fail

:ok
:okff
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
$ProgressPreference = 'SilentlyContinue'   # sans barre de progression : le telechargement est bien plus rapide dans PowerShell 5
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
    $cmd = '"' + $ps + '" -NoProfile -ExecutionPolicy Bypass -File "' + $launch + '" "%1"'
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
  foreach ($c in $cands) { [void]$list.Items.Add($(if ($c.Browsers.Count) { ($c.Browsers -join ', ') } else { $c.Origin }) + ' : ' + $c.Path + '   (version ' + $c.Version + ')') }
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
  if ($env:MYUCA_UNINSTALL -eq '1') { Uninstall-Pilot; exit 0 }
  $dest = $null
  if ($env:MYUCA_ARGDEST) {
    # dossier donné explicitement : pas de recherche ni de confirmation
    Add-Cand (Resolve-ExtDir $env:MYUCA_ARGDEST) 'dossier indiqué'
    if ($cands.Count -eq 0) { exit 2 }
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
      $loadedCount = $cands.Count
      if ($env:MYUCA_CFG -and (Test-Path -LiteralPath $env:MYUCA_CFG)) { Add-Cand ((Get-Content -LiteralPath $env:MYUCA_CFG -Raw).Trim()) 'dossier utilisé la dernière fois' }
      Add-Cand $env:MYUCA_SELFDIR 'dossier de ce script'
      if ($loadedCount -gt 1) { Write-Host "Plusieurs dossiers sont charges par tes navigateurs : verifie que c'est le bon avant de valider." }
    }
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
      Write-Host ("Dossier detecte : " + $dest + "  (" + (Names-For $dest ([bool](Get-ExtInfo $dest).browser_specific_settings)) + ")")
    } else {
      Write-Host ("Dossier(s) detecte(s) : " + $cands.Count + " - confirme dans la fenetre.")
      $dest = Show-Confirm
      if (-not $dest) { exit 3 }
    }
  }

  # Dossier de developpement (git) : on n'y ecrit jamais sans accord, des modifications pourraient etre perdues.
  if ((Test-Path -LiteralPath (Join-Path $dest '.git')) -and $env:MYUCA_FORCE -ne '1') {
    $warn = "Le dossier $dest est un dossier de developpement (git). La mise a jour remplacerait ses fichiers et peut faire perdre des modifications non enregistrees."
    Write-Host ("ATTENTION : " + $warn)
    if ($auto) { Write-Host "Rien n'a ete modifie. Ajoute /force pour ecrire quand meme."; exit 3 }
    $answer = Read-Host "Ecrire quand meme dans ce dossier ? Tape OUI pour confirmer"
    if ($answer -cne 'OUI') { exit 3 }
  }
  # Ce dossier est-il charge par un navigateur ? Sinon on le dira clairement a la fin.
  $loadedDest = $false
  foreach ($c in $cands) { if ($c.Path -ieq $dest -and ($c.Browsers.Count -gt 0 -or $c.Origin -like '*profil*')) { $loadedDest = $true } }

  # memorise le dossier pour la prochaine fois
  if ($env:MYUCA_CFG) { New-Item -ItemType Directory -Force -Path (Split-Path $env:MYUCA_CFG -Parent) | Out-Null; Set-Content -LiteralPath $env:MYUCA_CFG -Value $dest -Encoding ASCII }

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
  $tmp = Join-Path $env:TEMP ('myuca-' + [guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Path $tmp | Out-Null
  $pk = @{}
  function Get-Pkg([bool]$ff) {
    $key = if ($ff) { 'ff' } else { 'ch' }
    if ($pk.ContainsKey($key)) { return $pk[$key] }
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
    } else {
      robocopy $x $t /E /XF 'maj-extension.bat' /NFL /NDL /NJH /NJS /NP | Out-Null
      if ($LASTEXITCODE -ge 8) { throw "copie impossible (robocopy $LASTEXITCODE) : ferme les fichiers ouverts puis reessaie" }
      Get-ChildItem -Path $t -Recurse -Force -Include 'desktop.ini','Thumbs.db','.DS_Store' -ErrorAction SilentlyContinue | ForEach-Object { try { $_.Attributes = 'Normal'; Remove-Item $_.FullName -Force } catch {} }
      Write-Host ("OK : " + $old.version + " -> " + $new.version)
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
  if ($opens.Count -gt 0 -and -not $auto) {
    $ans = Read-Host ("Ouvrir la page des extensions maintenant ? (O/N)")
    if ($ans -match '^[oOyY]') { foreach ($o in $opens) { try { Start-Process $o[0] $o[1] } catch { } } }
  }
  if ($anyFF -and $chNames.Count -gt 0) { exit 11 }
  if ($anyFF) { exit 10 }
  exit 0
} catch {
  Write-Host ("Erreur : " + $_.Exception.Message)
  exit 1
}
