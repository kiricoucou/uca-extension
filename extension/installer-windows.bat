@echo off
setlocal EnableExtensions
chcp 65001 >nul
title Installateur My UCA (cmd)
rem ----------------------------------------------------------------------------------------------
rem  Installateur graphique de l'extension My UCA pour Windows (Chrome, Edge, Brave, Vivaldi, Firefox).
rem  - Double-clique ce fichier : une fenetre s'ouvre (dossier, navigateurs, barre de progression).
rem  - Aucun droit administrateur : tout est ecrit dans ton profil.
rem  - Telecharge la derniere version sur https://kiricoucou.github.io/uca-extension/ (HTTPS), rien d'autre.
rem  - Tes donnees (Odin, notes...) ne sont jamais touchees : elles vivent dans le navigateur.
rem ----------------------------------------------------------------------------------------------
set "SELFBAT=%~f0"
if not defined MYUCA_URL set "MYUCA_URL=https://kiricoucou.github.io/uca-extension"
powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -Command "$s=[IO.File]::ReadAllText($env:SELFBAT,[Text.Encoding]::UTF8); $i=$s.IndexOf([string][char]10+'#PS-START'); Invoke-Expression $s.Substring($i)"
exit /b %ERRORLEVEL%

#PS-START
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()

$Base = $env:MYUCA_URL.TrimEnd('/')
# Crochets de test (MYUCA_AUTO=1 : sans fenetre ni dialogue ; MYUCA_NOLAUNCH=1 : ne lance aucun navigateur ; MYUCA_FFPROFILE / MYUCA_FFEDITION).
$MB = New-Object PSObject
$MB | Add-Member -MemberType ScriptMethod -Name Show -Value { param($a, $b, $c, $d) if ($env:MYUCA_AUTO -eq '1') { return }; if ($b) { [System.Windows.Forms.MessageBox]::Show($a, $b, $c, $d) } else { [System.Windows.Forms.MessageBox]::Show($a) } }
function Launch($exe, $argList) {
  if ($env:MYUCA_NOLAUNCH -eq '1') { Say ('(test) lancement ignore : ' + $exe + ' ' + ($argList -join ' ')); return }
  Start-Process $exe -ArgumentList $argList
}
$Blue = [System.Drawing.Color]::FromArgb(0,105,164)
$Sky  = [System.Drawing.Color]::FromArgb(61,155,233)
$Font = New-Object System.Drawing.Font('Segoe UI', 10)
$FontH = New-Object System.Drawing.Font('Segoe UI Semibold', 17)

# ---------------------------------------------------------------- detection des navigateurs
function Get-AppPath($exe) {
  foreach ($root in 'HKLM:','HKCU:') {
    foreach ($sub in 'SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths','SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\App Paths') {
      $k = "$root\$sub\$exe"
      if (Test-Path $k) { $v = (Get-ItemProperty $k).'(default)'; if ($v -and (Test-Path $v)) { return $v } }
    }
  }
  return $null
}
function Find-Browsers {
  $defs = @(
    @{ id='chrome';  name='Google Chrome';  exe='chrome.exe';  proc='chrome';  kind='chromium'; fall=@("$env:ProgramFiles\Google\Chrome\Application\chrome.exe","${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe","$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe") },
    @{ id='edge';    name='Microsoft Edge'; exe='msedge.exe';  proc='msedge';  kind='chromium'; fall=@("${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe","$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe") },
    @{ id='brave';   name='Brave';          exe='brave.exe';   proc='brave';   kind='chromium'; fall=@("$env:ProgramFiles\BraveSoftware\Brave-Browser\Application\brave.exe","$env:LOCALAPPDATA\BraveSoftware\Brave-Browser\Application\brave.exe") },
    @{ id='vivaldi'; name='Vivaldi';        exe='vivaldi.exe'; proc='vivaldi'; kind='chromium'; fall=@("$env:LOCALAPPDATA\Vivaldi\Application\vivaldi.exe","$env:ProgramFiles\Vivaldi\Application\vivaldi.exe") },
    @{ id='firefox'; name='Mozilla Firefox';exe='firefox.exe'; proc='firefox'; kind='firefox';  fall=@("$env:ProgramFiles\Mozilla Firefox\firefox.exe","${env:ProgramFiles(x86)}\Mozilla Firefox\firefox.exe","$env:ProgramFiles\Firefox Developer Edition\firefox.exe","$env:ProgramFiles\Firefox Nightly\firefox.exe") }
  )
  $out = @()
  foreach ($d in $defs) {
    $p = Get-AppPath $d.exe
    if (-not $p) { foreach ($f in $d.fall) { if ($f -and (Test-Path $f)) { $p = $f; break } } }
    if ($p) {
      $v = ''; try { $v = (Get-Item $p).VersionInfo.ProductVersion } catch {}
      $d.path = $p; $d.version = $v; $out += [pscustomobject]$d
    }
  }
  return $out
}
function Get-FirefoxEdition($exePath) {
  if ($env:MYUCA_FFEDITION) { return $env:MYUCA_FFEDITION }
  $dir = Split-Path $exePath
  $cp = Join-Path $dir 'defaults\pref\channel-prefs.js'
  if (Test-Path $cp) {
    $t = Get-Content $cp -Raw
    if ($t -match 'app\.update\.channel",\s*"(\w+)"') { return $Matches[1] }
  }
  if ($exePath -match 'Developer|Nightly') { return 'aurora' }
  return 'release'
}
function Get-FirefoxProfile {
  if ($env:MYUCA_FFPROFILE) { return $env:MYUCA_FFPROFILE }
  $root = Join-Path $env:APPDATA 'Mozilla\Firefox'
  $ini = Join-Path $root 'profiles.ini'
  if (-not (Test-Path $ini)) { return $null }
  $path = $null; $inInstall = $false; $rel = '1'; $cur = @{}; $profiles = @()
  foreach ($l in (Get-Content $ini)) {
    if ($l -match '^\[Install') { $inInstall = $true; continue }
    if ($l -match '^\[Profile') { $inInstall = $false; if ($cur.Count) { $profiles += ,$cur }; $cur = @{}; continue }
    if ($l -match '^\[') { $inInstall = $false; continue }
    if ($inInstall -and $l -match '^Default=(.+)$' -and -not $path) { $path = $Matches[1] }
    elseif ($l -match '^(\w+)=(.*)$') { $cur[$Matches[1]] = $Matches[2] }
  }
  if ($cur.Count) { $profiles += ,$cur }
  if ($path) { $full = if ($path -match '^[A-Za-z]:') { $path } else { Join-Path $root ($path -replace '/','\') }; if (Test-Path $full) { return $full } }
  foreach ($p in $profiles) { if ($p['Default'] -eq '1' -and $p['Path']) { $full = if ($p['IsRelative'] -eq '0') { $p['Path'] } else { Join-Path $root ($p['Path'] -replace '/','\') }; if (Test-Path $full) { return $full } } }
  return $null
}

# ---------------------------------------------------------------- fenetre
$form = New-Object System.Windows.Forms.Form
$form.Text = 'Installateur My UCA'
$form.ClientSize = New-Object System.Drawing.Size(640, 470)
$form.StartPosition = 'CenterScreen'
$form.FormBorderStyle = 'FixedDialog'; $form.MaximizeBox = $false
$form.Font = $Font; $form.BackColor = [System.Drawing.Color]::White

$head = New-Object System.Windows.Forms.Panel
$head.Dock = 'Top'; $head.Height = 78; $head.BackColor = $Blue
$title = New-Object System.Windows.Forms.Label
$title.Text = 'My UCA : installation de l''extension'; $title.ForeColor = [System.Drawing.Color]::White; $title.Font = $FontH
$title.AutoSize = $true; $title.Location = New-Object System.Drawing.Point(22, 14)
$sub = New-Object System.Windows.Forms.Label
$sub.Text = 'Emploi du temps, notes et absences UCA. Gratuit, non officiel.'; $sub.ForeColor = [System.Drawing.Color]::FromArgb(220,238,252)
$sub.AutoSize = $true; $sub.Location = New-Object System.Drawing.Point(24, 48)
$head.Controls.AddRange(@($title, $sub))
$form.Controls.Add($head)

function New-Page { $p = New-Object System.Windows.Forms.Panel; $p.Location = New-Object System.Drawing.Point(0, 78); $p.Size = New-Object System.Drawing.Size(640, 330); $p.Visible = $false; $form.Controls.Add($p); return $p }
function New-Label($parent, $text, $x, $y, $w = 590, $h = 24, $bold = $false) {
  $l = New-Object System.Windows.Forms.Label; $l.Text = $text; $l.Location = New-Object System.Drawing.Point($x, $y); $l.Size = New-Object System.Drawing.Size($w, $h)
  if ($bold) { $l.Font = New-Object System.Drawing.Font('Segoe UI Semibold', 10) }
  $parent.Controls.Add($l); return $l
}
function New-DirRow($parent, $y, $labelText, $default) {
  New-Label $parent $labelText 24 $y 590 22 $true | Out-Null
  $t = New-Object System.Windows.Forms.TextBox; $t.Text = $default; $t.Location = New-Object System.Drawing.Point(24, ($y + 26)); $t.Size = New-Object System.Drawing.Size(480, 26)
  $b = New-Object System.Windows.Forms.Button; $b.Text = 'Parcourir...'; $b.Location = New-Object System.Drawing.Point(512, ($y + 24)); $b.Size = New-Object System.Drawing.Size(100, 30)
  $b.Add_Click({ $fb = New-Object System.Windows.Forms.FolderBrowserDialog; $fb.SelectedPath = $t.Text; if ($fb.ShowDialog() -eq 'OK') { $t.Text = $fb.SelectedPath } }.GetNewClosure())
  $parent.Controls.AddRange(@($t, $b)); return $t
}

# Page 1 : dossiers
$p1 = New-Page
New-Label $p1 'Bienvenue ! Cet assistant installe l''extension sans droits administrateur.' 24 14 | Out-Null
$tbInstall = New-DirRow $p1 52  '1. Ou installer l''extension (ce dossier doit rester en place) :' (Join-Path $env:LOCALAPPDATA 'MyUCA\extension')
$tbDl      = New-DirRow $p1 126 '2. Ou telecharger les fichiers (ZIP) :' (Join-Path $env:USERPROFILE 'Downloads')
New-Label $p1 '3. La derniere version est recuperee automatiquement sur le site.' 24 206 | Out-Null
$lblVer = New-Label $p1 'Version disponible : verification...' 24 232
$lblVer.ForeColor = $Blue

# Page 2 : navigateurs
$p2 = New-Page
New-Label $p2 'Choisis les navigateurs (un seul, deux, ou tous) :' 24 14 400 24 $true | Out-Null
$clb = New-Object System.Windows.Forms.CheckedListBox
$clb.Location = New-Object System.Drawing.Point(24, 46); $clb.Size = New-Object System.Drawing.Size(588, 130); $clb.CheckOnClick = $true; $clb.BorderStyle = 'FixedSingle'
$p2.Controls.Add($clb)
$note = New-Object System.Windows.Forms.Label
$note.Location = New-Object System.Drawing.Point(24, 186); $note.Size = New-Object System.Drawing.Size(588, 130)
$note.Text = "Ferme tes navigateurs choisis : l'assistant te le demandera a l'etape suivante (sans droits administrateur, il ne peut pas les fermer a ta place sans ton accord).`r`nChrome recent (v137+) refuse le chargement automatique : il sera ouvert sur la page des extensions et le dossier sera copie, il te restera 2 clics (mode developpeur, Charger l'extension non empaquetee)."
$p2.Controls.Add($note)

# Page 3 : progression
$p3 = New-Page
$lblStep = New-Label $p3 'Preparation...' 24 14 590 24 $true
$bar = New-Object System.Windows.Forms.ProgressBar
$bar.Location = New-Object System.Drawing.Point(24, 46); $bar.Size = New-Object System.Drawing.Size(588, 26); $bar.Minimum = 0; $bar.Maximum = 100; $bar.Style = 'Continuous'
$p3.Controls.Add($bar)
$log = New-Object System.Windows.Forms.TextBox
$log.Location = New-Object System.Drawing.Point(24, 86); $log.Size = New-Object System.Drawing.Size(588, 230); $log.Multiline = $true; $log.ReadOnly = $true; $log.ScrollBars = 'Vertical'; $log.BackColor = [System.Drawing.Color]::FromArgb(244,249,254)
$p3.Controls.Add($log)

$btnNext = New-Object System.Windows.Forms.Button
$btnNext.Text = 'Suivant'; $btnNext.Location = New-Object System.Drawing.Point(502, 420); $btnNext.Size = New-Object System.Drawing.Size(116, 36)
$btnNext.BackColor = $Blue; $btnNext.ForeColor = [System.Drawing.Color]::White; $btnNext.FlatStyle = 'Flat'; $btnNext.FlatAppearance.BorderSize = 0
$btnBack = New-Object System.Windows.Forms.Button
$btnBack.Text = 'Retour'; $btnBack.Location = New-Object System.Drawing.Point(380, 420); $btnBack.Size = New-Object System.Drawing.Size(110, 36); $btnBack.Visible = $false
$btnCancel = New-Object System.Windows.Forms.Button
$btnCancel.Text = 'Quitter'; $btnCancel.Location = New-Object System.Drawing.Point(24, 420); $btnCancel.Size = New-Object System.Drawing.Size(100, 36)
$btnCancel.Add_Click({ $form.Close() })
$form.Controls.AddRange(@($btnNext, $btnBack, $btnCancel))

function Say($t) { $log.AppendText($t + "`r`n"); [System.Windows.Forms.Application]::DoEvents() }
function Prog($v, $txt) { $bar.Value = [Math]::Max(0, [Math]::Min(100, [int]$v)); if ($txt) { $lblStep.Text = $txt }; [System.Windows.Forms.Application]::DoEvents() }

$script:browsers = @(Find-Browsers)
$script:latest = $null
foreach ($b in $script:browsers) { [void]$clb.Items.Add(("{0}   (v{1})" -f $b.name, $b.version), $true) }
if ($script:browsers.Count -eq 0) { [void]$clb.Items.Add('Aucun navigateur detecte (Chrome, Edge, Brave, Vivaldi, Firefox)', $false) }

# ---------------------------------------------------------------- telechargement / installation
function Get-File($url, $dest, $from, $to) {
  # Flux lu par morceaux dans le fil de l'interface : la fenetre reste vivante et la barre avance (pas de gestionnaire d'evenement : sans runspace il plante).
  $req = [System.Net.HttpWebRequest]::Create($url); $req.Timeout = 30000; $req.UserAgent = 'MyUCA-installer'
  $resp = $req.GetResponse(); $len = $resp.ContentLength
  $in = $resp.GetResponseStream(); $out = [System.IO.File]::Create($dest)
  try {
    $buf = New-Object byte[] 65536; $got = 0
    while (($n = $in.Read($buf, 0, $buf.Length)) -gt 0) {
      $out.Write($buf, 0, $n); $got += $n
      if ($len -gt 0) { Prog ($from + ($to - $from) * $got / $len) $null } else { [System.Windows.Forms.Application]::DoEvents() }
    }
  } finally { $out.Close(); $in.Close(); $resp.Close() }
  Prog $to $null
}
function Expand-Pkg($zip, $dest) {
  $tmp = Join-Path $env:TEMP ('myuca-' + [guid]::NewGuid().ToString('N'))
  Expand-Archive -Path $zip -DestinationPath $tmp -Force
  $m = Join-Path $tmp 'manifest.json'
  if (-not (Test-Path $m)) { throw 'ZIP invalide : pas de manifest.json' }
  if ((Get-Content $m -Raw -Encoding UTF8 | ConvertFrom-Json).name -notmatch 'UCA') { throw 'ZIP inattendu (nom sans UCA)' }
  New-Item -ItemType Directory -Path $dest -Force | Out-Null
  Copy-Item -Path (Join-Path $tmp '*') -Destination $dest -Recurse -Force
  Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
}
function Stop-Browsers($sel) {
  if ($env:MYUCA_AUTO -eq '1') { return }
  $names = $sel | ForEach-Object { $_.proc } | Select-Object -Unique
  $running = { Get-Process -Name $names -ErrorAction SilentlyContinue }
  if (-not (& $running)) { return }
  $list = ($sel | Where-Object { Get-Process -Name $_.proc -ErrorAction SilentlyContinue } | ForEach-Object { $_.name }) -join ', '
  [void]$MB.Show("Ferme correctement : $list`r`n(enregistre ton travail, puis ferme toutes les fenetres).`r`nClique sur OK une fois fait : s'il en reste d'ouverts, ils seront fermes de force.", 'My UCA', 'OK', 'Information')
  for ($i = 0; $i -lt 20 -and (& $running); $i++) { Start-Sleep -Milliseconds 500; [System.Windows.Forms.Application]::DoEvents() }
  if ($env:MYUCA_NOKILL -eq '1') { Say 'Navigateurs laisses ouverts (mode test).'; return }
  if (& $running) { Say 'Fermeture forcee des navigateurs restants...'; & $running | Stop-Process -Force -ErrorAction SilentlyContinue; Start-Sleep -Seconds 2 }
}
function New-Shortcut($name, $exe, $lnkArgs) {
  try {
    $desk = [Environment]::GetFolderPath('Desktop'); $lnk = Join-Path $desk ($name + '.lnk')
    $sh = New-Object -ComObject WScript.Shell; $s = $sh.CreateShortcut($lnk); $s.TargetPath = $exe; $s.Arguments = $lnkArgs; $s.IconLocation = "$exe,0"; $s.Save(); return $lnk
  } catch { return $null }
}

function Run-Install {
  $btnNext.Enabled = $false; $btnBack.Enabled = $false; $btnCancel.Enabled = $false
  try {
    $instDir = $tbInstall.Text.Trim(); $dlDir = $tbDl.Text.Trim()
    $sel = @(); for ($i = 0; $i -lt $clb.Items.Count; $i++) { if ($clb.GetItemChecked($i) -and $script:browsers.Count -gt $i) { $sel += $script:browsers[$i] } }
    if ($sel.Count -eq 0) { throw 'Aucun navigateur choisi.' }
    foreach ($d in $instDir, $dlDir) { New-Item -ItemType Directory -Path $d -Force | Out-Null }
    $stamp = [DateTime]::UtcNow.Ticks
    $needChromium = @($sel | Where-Object { $_.kind -eq 'chromium' }).Count -gt 0
    $needFirefox  = @($sel | Where-Object { $_.kind -eq 'firefox' }).Count -gt 0
    Prog 3 'Recherche de la derniere version...'
    Say ('Derniere version : ' + $script:latest)
    $zc = Join-Path $dlDir 'uca-extension-chrome.zip'; $zf = Join-Path $dlDir 'uca-extension-firefox.zip'
    $dirC = Join-Path $instDir 'chrome'; $dirF = Join-Path $instDir 'firefox'
    if ($needChromium) { Prog 8 'Telechargement (Chrome, Edge, Brave...)'; Say 'Telechargement du paquet Chrome / Edge / Brave...'; Get-File "$Base/extension/uca-extension-chrome.zip?t=$stamp" $zc 8 40; Prog 42 'Installation des fichiers'; Expand-Pkg $zc $dirC; Say ('Fichiers installes dans ' + $dirC) }
    if ($needFirefox)  { Prog 44 'Telechargement (Firefox)'; Say 'Telechargement du paquet Firefox...'; Get-File "$Base/extension/uca-extension-firefox.zip?t=$stamp" $zf 44 70; Prog 72 'Installation des fichiers'; Expand-Pkg $zf $dirF; Say ('Fichiers installes dans ' + $dirF) }
    # dossier memorise pour maj-extension.bat
    if ($needChromium) { $cfg = $(if ($env:MYUCA_CFGDIR) { $env:MYUCA_CFGDIR } else { Join-Path $env:LOCALAPPDATA 'MyUCA' }); New-Item -ItemType Directory -Path $cfg -Force | Out-Null; Set-Content -Path (Join-Path $cfg 'dossier-extension.txt') -Value $dirC -Encoding ASCII }

    Prog 74 'Fermeture des navigateurs'
    if ($env:MYUCA_PAUSE_PAGE3) { Start-Sleep -Milliseconds ([int]$env:MYUCA_PAUSE_PAGE3) }
    Stop-Browsers $sel

    $thanks = "$Base/merci.html?v=$($script:latest)"
    $manual = @()
    $step = 0
    foreach ($b in $sel) {
      $step++; Prog (76 + 20 * $step / $sel.Count) ('Ouverture de ' + $b.name)
      if ($b.kind -eq 'chromium') {
        $major = 0; try { $major = [int]($b.version.Split('.')[0]) } catch {}
        if ($b.id -eq 'chrome' -and $major -ge 137) {
          Say ($b.name + ' : chargement automatique bloque par Chrome, mode guide.')
          Launch $b.path @('chrome://extensions', $thanks)
          $manual += $b
        } else {
          $argLoad = "--disable-features=DisableLoadExtensionCommandLineSwitch --load-extension=`"$dirC`""
          Launch $b.path ($argLoad + " `"$thanks`"")
          $lnk = $(if ($env:MYUCA_NOLAUNCH -eq '1') { $null } else { New-Shortcut ($b.name + ' (My UCA)') $b.path $argLoad })
          Say ($b.name + ' : extension chargee. ' + $(if ($lnk) { 'Raccourci cree sur le Bureau pour la retrouver a chaque lancement.' } else { '' }))
          $manual += $b
        }
      } else {
        $edition = Get-FirefoxEdition $b.path
        $prof = Get-FirefoxProfile
        if ($edition -ne 'release' -and $prof) {
          $uj = Join-Path $prof 'user.js'
          if (Test-Path $uj) { Copy-Item $uj ($uj + '.uca-sauvegarde-' + (Get-Date -Format 'yyyyMMdd-HHmmss')) }
          $cur = if (Test-Path $uj) { Get-Content $uj -Raw } else { '' }
          if ($cur -notmatch 'xpinstall\.signatures\.required') { Add-Content $uj 'user_pref("xpinstall.signatures.required", false);' }
          if ($cur -notmatch 'extensions\.autoDisableScopes') { Add-Content $uj 'user_pref("extensions.autoDisableScopes", 0);' }
          $ed = Join-Path $prof 'extensions'; New-Item -ItemType Directory -Path $ed -Force | Out-Null
          Copy-Item $zf (Join-Path $ed 'uca-connecteur@site-emploi-du-temps.local.xpi') -Force
          Say 'Firefox : extension installee dans ton profil (permanente).'
          Launch $b.path $thanks
        } else {
          Say 'Firefox (version standard) : refuse les extensions non signees de facon permanente, chargement temporaire guide.'
          Launch $b.path @('about:debugging#/runtime/this-firefox', $thanks)
          $manual += $b
        }
      }
    }
    Prog 100 'Termine !'
    Say ''
    Say 'Installation terminee. La page de connexion de l''extension et la page de remerciement s''ouvrent dans tes navigateurs.'
    $guided = @($manual | Where-Object { $_.id -eq 'chrome' -or $_.kind -eq 'firefox' })
    if ($guided.Count -gt 0) {
      try { Set-Clipboard -Value $(if (@($guided | Where-Object { $_.kind -eq 'firefox' }).Count -gt 0 -and -not ($guided | Where-Object { $_.id -eq 'chrome' })) { Join-Path $dirF 'manifest.json' } else { $dirC }) } catch {}
      $msg = 'Il reste une etape manuelle (regle du navigateur, pas de contournement possible sans admin) :' + "`r`n`r`n"
      if ($guided | Where-Object { $_.id -eq 'chrome' }) { $msg += "Chrome : page chrome://extensions > active Mode developpeur > Charger l'extension non empaquetee > colle le chemin (Ctrl+V, deja copie) : $dirC`r`n`r`n" }
      if ($guided | Where-Object { $_.kind -eq 'firefox' }) { $msg += "Firefox : page about:debugging > Charger un module complementaire temporaire > choisis $dirF\manifest.json (a refaire a chaque demarrage ; Firefox Developer Edition l'installe de facon permanente).`r`n" }
      [void]$MB.Show($msg, 'My UCA : derniere etape', 'OK', 'Information')
    }
    $btnNext.Text = 'Fermer'; $btnNext.Enabled = $true; $script:done = $true
  } catch {
    Say ('ERREUR : ' + $_.Exception.Message)
    Say 'Rien n''a ete casse. Tu peux reessayer.'
    $lblStep.Text = 'Echec'; $btnBack.Enabled = $true; $btnNext.Enabled = $false
  }
  $btnCancel.Enabled = $true
}

$script:page = 1; $script:done = $false
function Show-Page($n) {
  $script:page = $n
  $p1.Visible = ($n -eq 1); $p2.Visible = ($n -eq 2); $p3.Visible = ($n -eq 3)
  $btnBack.Visible = ($n -eq 2 -or $n -eq 3)
  $btnNext.Text = $(if ($n -eq 2) { 'Installer' } else { 'Suivant' })
}
$btnBack.Add_Click({ Show-Page ($script:page - 1) })
$btnNext.Add_Click({
  if ($script:done) { $form.Close(); return }
  if ($script:page -eq 1) {
    if (-not $tbInstall.Text.Trim() -or -not $tbDl.Text.Trim()) { [void]$MB.Show('Choisis les deux dossiers.'); return }
    Show-Page 2
  } elseif ($script:page -eq 2) {
    if ($script:browsers.Count -eq 0) { [void]$MB.Show('Aucun navigateur compatible detecte.'); return }
    if ($clb.CheckedItems.Count -eq 0) { [void]$MB.Show('Coche au moins un navigateur.'); return }
    if (-not $script:latest) { [void]$MB.Show('Impossible de joindre le site : verifie ta connexion.'); return }
    Show-Page 3; Run-Install
  }
})

$form.Add_Shown({
  $form.Activate()
  try {
    $m = Invoke-RestMethod -Uri ("$Base/manifest.json?t=" + [DateTime]::UtcNow.Ticks) -TimeoutSec 20
    $script:latest = $m.version; $lblVer.Text = 'Version disponible : ' + $m.version
  } catch { $lblVer.Text = 'Impossible de joindre le site (connexion ?).'; $lblVer.ForeColor = [System.Drawing.Color]::FromArgb(165,14,14) }
})
Show-Page 1
if ($env:MYUCA_SELFTEST -eq '1') { Write-Host 'selftest ok'; exit 0 }
if ($env:MYUCA_AUTO -eq '1') {
  $tbInstall.Text = $env:MYUCA_INSTALL; $tbDl.Text = $env:MYUCA_DL
  $m = Invoke-RestMethod -Uri ("$Base/manifest.json?t=" + [DateTime]::UtcNow.Ticks) -TimeoutSec 20; $script:latest = $m.version
  $want = @(($env:MYUCA_BROWSERS -split ',') | Where-Object { $_ })
  for ($i = 0; $i -lt $script:browsers.Count; $i++) { $clb.SetItemChecked($i, ($want -contains $script:browsers[$i].id)) }
  Run-Install
  Write-Host $log.Text
  if ($lblStep.Text -eq 'Termine !') { Write-Host 'AUTO OK'; exit 0 } else { Write-Host 'AUTO ECHEC'; exit 1 }
}
[void]$form.ShowDialog()
exit 0
