@echo off
setlocal EnableExtensions
chcp 65001 >nul
title Chrome vierge (profil temporaire)
rem ----------------------------------------------------------------------------------------------
rem  Ouvre Chrome avec un profil TEMPORAIRE, tout neuf : sans nom, sans compte, sans aucune extension
rem  (pas de McAfee, NordVPN, Google Drive/Docs hors connexion : chrome://extensions est vide).
rem  - Ton vrai Chrome n'est pas touche : c'est une instance a part, qui peut tourner en meme temps.
rem  - Tu peux ensuite charger une extension a la main (mode developpeur) : rien n'est bloque.
rem  - Quand tu fermes cette fenetre Chrome, le profil temporaire est supprime : il ne reste rien.
rem  Usage : double-clic.   chrome-vierge.bat "https://exemple.fr"   pour ouvrir une autre page au depart.
rem ----------------------------------------------------------------------------------------------

set "SYS=%SystemRoot%\System32"
set "URL=%~1"
if not defined URL set "URL=chrome://extensions"

rem --- Chrome : variable CHROME_EXE (tests), sinon registre, sinon emplacements habituels
set "CHROME="
if defined CHROME_EXE if exist "%CHROME_EXE%" set "CHROME=%CHROME_EXE%"
if not defined CHROME for /f "usebackq delims=" %%P in (`powershell -NoProfile -Command "foreach($k in 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe','HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe','HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe'){ if(Test-Path $k){ $v=(Get-ItemProperty $k).'(default)'; if($v -and (Test-Path $v)){ $v; break } } }"`) do if not defined CHROME set "CHROME=%%P"
if not defined CHROME if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set "CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not defined CHROME if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" set "CHROME=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not defined CHROME if exist "%LocalAppData%\Google\Chrome\Application\chrome.exe" set "CHROME=%LocalAppData%\Google\Chrome\Application\chrome.exe"
if not defined CHROME (
  echo Chrome est introuvable sur cet ordinateur.
  pause
  exit /b 1
)

rem --- dossier de profil unique, cree dans le dossier temporaire de l'utilisateur
set "PROFIL=%TEMP%\chrome-vierge-%RANDOM%%RANDOM%"
if exist "%PROFIL%" (
  echo Dossier de profil deja present, relance le fichier.
  pause
  exit /b 1
)
mkdir "%PROFIL%" || (
  echo Impossible de creer le profil temporaire.
  pause
  exit /b 1
)

echo Chrome vierge : profil temporaire %PROFIL%
echo Ferme la fenetre Chrome pour terminer (le profil sera supprime).

rem --- --disable-default-apps : retire aussi les extensions installees "pour toute la machine" (McAfee, NordVPN, Google Drive...)
rem --- le reste evite les fenetres d'accueil, la connexion Google et la synchronisation
start "" /wait "%CHROME%" --user-data-dir="%PROFIL%" --disable-default-apps --no-first-run --no-default-browser-check --disable-sync --disable-features=Translate,SigninInterceptBubble --disable-signin-promo --password-store=basic "%URL%"

rem --- nettoyage : on ne supprime QUE le dossier cree ci-dessus (garde-fou : il doit s'appeler chrome-vierge-*)
if exist "%PROFIL%" (
  echo "%PROFIL%" | "%SYS%\find.exe" /i "\chrome-vierge-" >nul && rmdir /s /q "%PROFIL%" 2>nul
)
if exist "%PROFIL%" (
  rem Chrome termine encore ses processus : nouvel essai apres 3 secondes
  "%SYS%\timeout.exe" /t 3 /nobreak >nul
  echo "%PROFIL%" | "%SYS%\find.exe" /i "\chrome-vierge-" >nul && rmdir /s /q "%PROFIL%" 2>nul
)
exit /b 0
