@echo off
setlocal EnableExtensions
chcp 65001 >nul
title Mise a jour de l'extension My UCA
rem ----------------------------------------------------------------------------------------------
rem  Met a jour le dossier de l'extension Chrome / Edge "My UCA" (charge en mode developpeur).
rem  - Aucun droit administrateur : tout se passe dans ton profil et dans le dossier de l'extension.
rem  - Telecharge le ZIP officiel sur https://kiricoucou.github.io/uca-extension/ (HTTPS), rien d'autre.
rem  - Ne touche pas a tes donnees : elles sont dans Chrome, pas dans ce dossier.
rem  Usage : double-clic (a placer dans le dossier de l'extension) ou  maj-extension.bat "C:\chemin\dossier"
rem          maj-extension.bat /force   pour reinstaller meme si la version est deja la derniere.
rem ----------------------------------------------------------------------------------------------
set "SELFBAT=%~f0"
set "SELFDIR=%~dp0"
set "MYUCA_URL=https://kiricoucou.github.io/uca-extension/extension/uca-extension-chrome.zip"
set "MYUCA_FORCE=0"
set "DEST="
set "ARGDEST="
set "CFG=%LOCALAPPDATA%\MyUCA\dossier-extension.txt"

:args
if "%~1"=="" goto :argsdone
if /i "%~1"=="/force" (set "MYUCA_FORCE=1") else (set "DEST=%~1" & set "ARGDEST=1")
shift
goto :args
:argsdone

if not defined DEST if exist "%SELFDIR%manifest.json" set "DEST=%SELFDIR%"
if not defined DEST if exist "%CFG%" set /p DEST=<"%CFG%"
if defined ARGDEST (
  if not exist "%DEST:"=%\manifest.json" goto :nodest
)
if defined DEST if not exist "%DEST%\manifest.json" set "DEST="
if not defined DEST (
  echo.
  echo Dossier de l'extension ^(celui choisi dans chrome://extensions, avec "Charger l'extension non empaquetee"^) :
  set /p "DEST=Chemin : "
)
if not defined DEST goto :nodest
set "DEST=%DEST:"=%"
if "%DEST:~-1%"=="\" set "DEST=%DEST:~0,-1%"
if not exist "%DEST%\manifest.json" goto :nodest

if not exist "%LOCALAPPDATA%\MyUCA" mkdir "%LOCALAPPDATA%\MyUCA" >nul 2>&1
>"%CFG%" echo %DEST%

echo.
echo Dossier : %DEST%
echo Telechargement de la derniere version...
set "MYUCA_DEST=%DEST%"
rem Dossier Firefox (manifest avec "browser_specific_settings") : on telecharge le paquet Firefox, pas celui de Chrome.
set "ISFF="
findstr /c:"browser_specific_settings" "%DEST%\manifest.json" >nul 2>&1 && set "ISFF=1"
if defined ISFF set "MYUCA_URL=https://kiricoucou.github.io/uca-extension/extension/uca-extension-firefox.zip"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$s=[IO.File]::ReadAllText($env:SELFBAT); $i=$s.IndexOf([string][char]10+'#PS-START'); Invoke-Expression $s.Substring($i)"
set "RC=%ERRORLEVEL%"
if not "%RC%"=="0" goto :fail
if defined ISFF (
  echo.
  echo Pour appliquer la mise a jour : dans Firefox, ouvre about:debugging#/runtime/this-firefox
  echo et clique sur "Recharger" sur la carte de l'extension ^(ou clique sur le bouton de mise a jour de l'extension^).
  goto :end
)
echo.
echo Pour appliquer la mise a jour : dans chrome://extensions, clique sur "Recharger" (fleche ronde)
echo sur la carte de l'extension. Elle se recharge aussi toute seule a la prochaine verification.
if not defined MYUCA_NOPAUSE (
  choice /c ON /n /t 15 /d N /m "Ouvrir chrome://extensions maintenant ? (O/N) "
  if errorlevel 2 goto :end
  start "" chrome "chrome://extensions" 2>nul || start "" msedge "edge://extensions" 2>nul
)
goto :end

:nodest
echo.
echo Dossier de l'extension introuvable (pas de manifest.json). Relance avec le bon dossier :
echo   maj-extension.bat "C:\chemin\vers\le\dossier"
set "RC=2"
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
try {
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  $dest = $env:MYUCA_DEST
  $tmp = Join-Path $env:TEMP ('myuca-' + [guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Path $tmp | Out-Null
  $zip = Join-Path $tmp 'ext.zip'
  Invoke-WebRequest -Uri ($env:MYUCA_URL + '?t=' + [DateTime]::UtcNow.Ticks) -OutFile $zip -UseBasicParsing -TimeoutSec 60
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
  exit 0
} catch {
  Write-Host ("Erreur : " + $_.Exception.Message)
  exit 1
}
