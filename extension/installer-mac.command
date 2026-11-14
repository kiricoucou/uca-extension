#!/usr/bin/env bash
# ----------------------------------------------------------------------------------------------------------------
#  Installateur macOS de l'extension My UCA (Chrome, Edge, Brave, Vivaldi, Firefox) : lance-le depuis le Terminal :  bash ~/Downloads/installer-mac.command
#  (double-clic possible après  chmod +x installer-mac.command ; un fichier téléchargé n'est pas exécutable par défaut.)
#
#  - AUCUN sudo : tout est ecrit dans ton dossier personnel.
#  - Telecharge la derniere version sur https://kiricoucou.github.io/uca-extension/ (HTTPS), rien d'autre.
#  - Fenetres macOS pour les choix (dossier d'installation, dossier de telechargement, navigateurs), barre de progression.
#  - Tes donnees (Odin, notes...) ne sont jamais touchees : elles vivent dans le navigateur.
#  Variables : UCA_YES=1 (reponses par defaut)  UCA_NO_OPEN=1 (n'ouvre rien)  UCA_BASE_URL=... (tests)
# ----------------------------------------------------------------------------------------------------------------
set -u
BASE_URL="${UCA_BASE_URL:-https://kiricoucou.github.io/uca-extension}"
YES="${UCA_YES:-0}"; NO_OPEN="${UCA_NO_OPEN:-0}"
GECKO_ID="uca-connecteur@site-emploi-du-temps.local"
PROTO="--proto =https --tlsv1.2"; [ -n "${UCA_BASE_URL:-}" ] && PROTO=""   # UCA_BASE_URL : tests locaux uniquement
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
[ "$(id -u)" = "0" ] && { echo "Ne lance pas ce script avec sudo."; exit 1; }
[ "${UCA_FAKE_OS:-$(uname -s)}" = "Darwin" ] || { echo "Ce fichier est pour macOS. Sous Linux : install-linux.sh"; exit 1; }

BLUE=$'\033[38;2;61;155;233m'; BOLD=$'\033[1m'; RST=$'\033[0m'
say() { printf '%s\n' "$*"; }
warn() { printf '! %s\n' "$*" >&2; }
bar() {   # bar pourcentage texte
  local p="$1" t="$2" w=40 f i s=""
  f=$((p * w / 100)); for ((i = 0; i < w; i++)); do [ $i -lt $f ] && s="$s#" || s="$s-"; done
  printf '\r\033[K%s[%s]%s %3d%%  %s' "$BLUE" "$s" "$RST" "$p" "$t"
  [ "$p" -ge 100 ] && printf '\n'
  return 0
}
osa() { osascript "$@" 2>/dev/null; }

clear 2>/dev/null
printf '%s%s My UCA : installation de l'"'"'extension%s\n   Emploi du temps, notes et absences UCA. Gratuit, non officiel.\n\n' "$BOLD" "$BLUE" "$RST"

# ---------------------------------------------------------------- 1) dossier d'installation, 2) dossier de telechargement
DEF_DIR="$HOME/Desktop"   # Bureau : hors ~/Library, que Chrome refuse pour la mise à jour automatique ; les sous-dossiers extension_uca_<navigateur> y sont créés
DEF_DL="$HOME/Downloads"
mkdir -p "$DEF_DIR" 2>/dev/null
if [ "$YES" = "1" ]; then INST="$DEF_DIR"; DLDIR="$DEF_DL"
else
  INST="$(osa -e 'POSIX path of (choose folder with prompt "1/2 - Où installer l'"'"'extension ? (ce dossier doit rester en place)" default location (POSIX file "'"$HOME"'"))')"
  INST="${INST%/}"; [ -z "$INST" ] && INST="$DEF_DIR"
  DLDIR="$(osa -e 'POSIX path of (choose folder with prompt "2/2 - Où télécharger les fichiers (ZIP) ?" default location (POSIX file "'"$DEF_DL"'"))')"
  DLDIR="${DLDIR%/}"; [ -z "$DLDIR" ] && DLDIR="$DEF_DL"
fi
mkdir -p "$INST" "$DLDIR" || { warn "Dossiers inutilisables."; exit 1; }
say "Installation : $INST"; say "Téléchargements : $DLDIR"

# ---------------------------------------------------------------- 3) derniere version
VERSION="$(curl -fsSL $PROTO "$BASE_URL/manifest.json?t=$(date +%s)" 2>/dev/null | sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n1)"
[ -z "$VERSION" ] && { warn "Site injoignable : vérifie ta connexion."; exit 1; }
say "Dernière version : $VERSION"

# ---------------------------------------------------------------- 4) navigateurs detectes
IDS=(chrome edge brave vivaldi firefox firefox)
NAMES=("Google Chrome" "Microsoft Edge" "Brave Browser" "Vivaldi" "Firefox" "Firefox Developer Edition")
KINDS=(chromium chromium chromium chromium firefox firefox)
FOUND=()
for i in "${!NAMES[@]}"; do
  for d in "/Applications" "$HOME/Applications"; do [ -d "$d/${NAMES[$i]}.app" ] && { FOUND+=("$i"); break; }; done
done
[ "${#FOUND[@]}" -eq 0 ] && { warn "Aucun navigateur compatible détecté."; exit 1; }
SEL=()
if [ "$YES" = "1" ]; then SEL=("${FOUND[@]}")
else
  LIST=""; for i in "${FOUND[@]}"; do LIST="$LIST\"${NAMES[$i]}\", "; done; LIST="${LIST%, }"
  CH="$(osa -e 'set r to choose from list {'"$LIST"'} with title "My UCA" with prompt "Choisis les navigateurs (un ou plusieurs) :" default items {'"$LIST"'} with multiple selections allowed
if r is false then return ""
set AppleScript'"'"'s text item delimiters to "|"
return r as text')"
  [ -z "$CH" ] && { say "Annulé."; exit 0; }
  IFS='|' read -r -a PICK <<< "$CH"
  for n in "${PICK[@]}"; do for i in "${FOUND[@]}"; do [ "${NAMES[$i]}" = "$n" ] && SEL+=("$i"); done; done
fi
NEED_C=0; NEED_F=0
for i in "${SEL[@]}"; do [ "${KINDS[$i]}" = "chromium" ] && NEED_C=1 || NEED_F=1; done

# ---------------------------------------------------------------- 5) telechargement et fichiers
dl_pkg() {   # dl_pkg nom.zip dossier p0 p1
  bar "$3" "Téléchargement $1"
  curl -fsSL $PROTO --retry 2 -o "$DLDIR/$1" "$BASE_URL/extension/$1?t=$(date +%s)" || { echo; warn "Téléchargement impossible ($1)."; return 1; }
  bar "$(( ($3 + $4) / 2 ))" "Décompression $1"
  local x="$TMP/x-${1%.zip}"; rm -rf "$x"; mkdir -p "$x"
  /usr/bin/unzip -q -o "$DLDIR/$1" -d "$x" || return 1
  [ -f "$x/manifest.json" ] && grep -q 'UCA' "$x/manifest.json" || { warn "Paquet invalide."; return 1; }
  mkdir -p "$2" && cp -R "$x/." "$2/" || return 1
  find "$2" \( -name desktop.ini -o -name Thumbs.db -o -name .DS_Store \) -type f -delete 2>/dev/null   # Chrome refuse ces fichiers dans un dossier d'extension
  bar "$4" "Installé dans $2"
}
DIR_C="$INST/extension_uca_chrome"; DIR_F="$INST/extension_uca_firefox"
bar 5 "Préparation"
[ "$NEED_C" = "1" ] && { dl_pkg uca-extension-chrome.zip "$DIR_C" 8 40 || exit 1; }
[ "$NEED_F" = "1" ] && { dl_pkg uca-extension-firefox.zip "$DIR_F" 45 70 || exit 1; }

# ---------------------------------------------------------------- 6) fermeture des navigateurs
running() { pgrep -x "$1" >/dev/null 2>&1; }
proc_of() { case "$1" in "Google Chrome") echo "Google Chrome" ;; "Microsoft Edge") echo "Microsoft Edge" ;; "Brave Browser") echo "Brave Browser" ;; *) echo "$1" ;; esac; }
bar 75 "Fermeture des navigateurs"
OPEN_NOW=(); for i in "${SEL[@]}"; do running "$(proc_of "${NAMES[$i]}")" && OPEN_NOW+=("${NAMES[$i]}"); done
if [ "${#OPEN_NOW[@]}" -gt 0 ]; then
  printf '\n'
  [ "$YES" != "1" ] && osa -e 'display dialog "Ferme correctement : '"${OPEN_NOW[*]}"'\n(enregistre ton travail). Clique sur OK : s'"'"'il en reste d'"'"'ouverts, ils seront fermés de force." buttons {"OK"} default button "OK" with title "My UCA"' >/dev/null
  for n in "${OPEN_NOW[@]}"; do osa -e "tell application \"$n\" to quit" >/dev/null; done
  for _ in $(seq 1 20); do still=0; for n in "${OPEN_NOW[@]}"; do running "$(proc_of "$n")" && still=1; done; [ "$still" = 0 ] && break; sleep 0.5; done
  for n in "${OPEN_NOW[@]}"; do running "$(proc_of "$n")" && pkill -x "$(proc_of "$n")" 2>/dev/null; done
  sleep 2
fi

# ---------------------------------------------------------------- 7) installation dans chaque navigateur
THANKS="$BASE_URL/merci.html?v=$VERSION"
GUIDED=""
firefox_profile() {
  local root="$HOME/Library/Application Support/Firefox" ini p
  ini="$root/profiles.ini"; [ -f "$ini" ] || return 1
  p="$(awk -F= '/^\[Install/{i=1;next} /^\[/{i=0} i&&$1=="Default"{print $2; exit}' "$ini")"
  [ -n "$p" ] && [ -d "$root/$p" ] && { printf '%s' "$root/$p"; return 0; }
  return 1
}
n=0; total="${#SEL[@]}"
for i in "${SEL[@]}"; do
  n=$((n + 1)); bar $((75 + 24 * n / total)) "Ouverture de ${NAMES[$i]}"
  name="${NAMES[$i]}"
  if [ "${KINDS[$i]}" = "chromium" ]; then
    app_ver="$(defaults read "/Applications/$name.app/Contents/Info" CFBundleShortVersionString 2>/dev/null | cut -d. -f1)"
    if [ "${IDS[$i]}" = "chrome" ] && [ "${app_ver:-0}" -ge 137 ] 2>/dev/null; then
      [ "$NO_OPEN" != "1" ] && open -a "$name" --args "chrome://extensions" "$THANKS"
      GUIDED="$GUIDED Chrome"
    else
      [ "$NO_OPEN" != "1" ] && open -n -a "$name" --args --disable-features=DisableLoadExtensionCommandLineSwitch --load-extension="$DIR_C" "$THANKS"
      GUIDED="$GUIDED $name"
    fi
  else
    prof="$(firefox_profile)"; ed="release"; [ "$name" = "Firefox Developer Edition" ] && ed="dev"
    if [ "$ed" = "dev" ] && [ -n "$prof" ]; then
      uj="$prof/user.js"; [ -f "$uj" ] && cp -p "$uj" "$uj.uca-sauvegarde-$(date +%Y%m%d-%H%M%S)"
      grep -qs 'xpinstall.signatures.required' "$uj" || printf '%s\n' 'user_pref("xpinstall.signatures.required", false);' >> "$uj"
      grep -qs 'extensions.autoDisableScopes' "$uj" || printf '%s\n' 'user_pref("extensions.autoDisableScopes", 0);' >> "$uj"
      mkdir -p "$prof/extensions" && cp -f "$DLDIR/uca-extension-firefox.zip" "$prof/extensions/$GECKO_ID.xpi"
      [ "$NO_OPEN" != "1" ] && open -a "$name" --args "$THANKS"
    else
      [ "$NO_OPEN" != "1" ] && open -a "$name" --args "about:debugging#/runtime/this-firefox" "$THANKS"
      GUIDED="$GUIDED Firefox"
    fi
  fi
done
bar 100 "Terminé !"
printf '\nL'"'"'extension %s est installée dans %s.\nLa page de connexion de l'"'"'extension (ou le guide) et la page de remerciement s'"'"'ouvrent dans tes navigateurs.\n' "$VERSION" "$INST"
if [ -n "$GUIDED" ]; then
  printf '%s' "$DIR_C" | pbcopy 2>/dev/null
  MSG="Dernière étape manuelle (règle du navigateur, impossible à contourner sans droits admin) :\n\nChrome / Firefox standard : page chrome://extensions > Mode développeur > Charger l'extension non empaquetée > Cmd+Maj+G, colle le chemin (déjà copié) : $DIR_C\nFirefox : about:debugging > Charger un module temporaire > $DIR_F/manifest.json.\n\nEdge, Brave, Vivaldi : l'extension est chargée pour cette session ; pour la garder à chaque lancement, fais l'étape ci-dessus une fois."
  [ "$YES" != "1" ] && osa -e 'display dialog "'"$MSG"'" buttons {"OK"} default button "OK" with title "My UCA : dernière étape"' >/dev/null
fi
# Où l'extension a été installée : chemin copiable / ouvrable, remarque sur les dossiers cachés (Library est masqué sur Mac)
OPEN_PATH="$INST"; [ "$NEED_C" = "1" ] && OPEN_PATH="$DIR_C"
printf '\nDossier de l'"'"'extension : %s\n(Dossier introuvable ? Library est masqué : dans le Finder, Cmd+Maj+. affiche les éléments masqués ; ou menu Aller > Aller au dossier, puis colle le chemin.)\n' "$OPEN_PATH"
if [ "$YES" != "1" ]; then
  CHOICE="$(osa -e 'button returned of (display dialog "Dossier de l'"'"'extension :\n'"$OPEN_PATH"'\n\nIntrouvable ? Library est masqué : dans le Finder, Cmd+Maj+. affiche les éléments masqués." buttons {"Fermer", "Copier le chemin", "Ouvrir le dossier"} default button "Ouvrir le dossier" with title "My UCA")')"
  case "$CHOICE" in
    "Ouvrir le dossier") [ "$NO_OPEN" != "1" ] && open -R "$OPEN_PATH" 2>/dev/null || open "$OPEN_PATH" 2>/dev/null ;;
    "Copier le chemin") printf '%s' "$OPEN_PATH" | pbcopy 2>/dev/null ;;
  esac
fi
exit 0
