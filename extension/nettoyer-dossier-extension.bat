@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul
title Nettoyer le dossier de l'extension My UCA
rem ----------------------------------------------------------------------------------------------
rem  Corrige l'erreur de Chrome :
rem    "Cannot load extension with file or directory name desktop.ini. The filename is illegal."
rem  Windows ajoute parfois un fichier cache desktop.ini (ou Thumbs.db) dans un dossier, et Chrome refuse
rem  alors de le charger comme extension. Ce script supprime ces fichiers dans le dossier de l'extension.
rem  - Aucun droit administrateur. Il ne touche a rien d'autre (seuls desktop.ini, Thumbs.db, .DS_Store).
rem  Usage : double-clic (a placer dans le dossier de l'extension), ou glisser le dossier sur ce fichier,
rem          ou  nettoyer-dossier-extension.bat "C:\chemin\vers\le\dossier"
rem ----------------------------------------------------------------------------------------------

set "DEST=%~1"
if not defined DEST if exist "%~dp0manifest.json" set "DEST=%~dp0"
if not defined DEST if exist "%LOCALAPPDATA%\MyUCA\dossier-extension.txt" set /p DEST=<"%LOCALAPPDATA%\MyUCA\dossier-extension.txt"
if not defined DEST (
  echo.
  echo Dossier de l'extension ^(celui qui contient manifest.json^) :
  set /p "DEST=Chemin : "
)
if not defined DEST goto :nodest
set "DEST=%DEST:"=%"
if "%DEST:~-1%"=="\" set "DEST=%DEST:~0,-1%"
if not exist "%DEST%\manifest.json" goto :nodest

echo.
echo Dossier : %DEST%
set /a N=0
for %%X in (desktop.ini Thumbs.db .DS_Store) do (
  for /r "%DEST%" %%F in (%%X) do (
    if exist "%%F" (
      attrib -s -h -r "%%F" >nul 2>&1
      del /f /q "%%F" >nul 2>&1
      if not exist "%%F" (
        set /a N+=1
        echo   supprime : %%F
      ) else (
        echo   IMPOSSIBLE a supprimer : %%F
      )
    )
  )
)
echo.
if !N! EQU 0 (echo Aucun fichier a supprimer : le dossier est deja propre.) else (echo !N! fichier^(s^) supprime^(s^).)
echo.
echo Dans chrome://extensions : clique sur "Charger l'extension non empaquetee" et choisis a nouveau ce dossier
echo ^(ou "Recharger" sur la carte de l'extension si elle y figure deja^).
echo.
pause
exit /b 0

:nodest
echo.
echo Dossier de l'extension introuvable ^(pas de manifest.json^). Relance avec le bon dossier :
echo   nettoyer-dossier-extension.bat "C:\chemin\vers\le\dossier"
echo.
pause
exit /b 2
