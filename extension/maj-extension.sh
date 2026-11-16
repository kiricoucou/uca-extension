#!/usr/bin/env bash
# Met à jour l'extension « My UCA » (Chrome, Chromium, Edge, Brave, Vivaldi, Firefox) chargée en mode développeur.
# Linux : maj-extension.sh        macOS : maj-extension.command (même script, se lance par double-clic)
#
#  1. Il retrouve tout seul le dossier de l'extension dans ton navigateur (ou le dossier mémorisé, ou celui du script).
#  2. Il te le montre : « Ouvrir le dossier » pour vérifier que c'est le bon, puis « Valider ».
#  3. Il cherche une version plus récente et, s'il y en a une, met l'extension à jour tout seul.
#
#  - Aucun droit administrateur (pas de sudo) : tout se passe dans ton dossier personnel et dans celui de l'extension.
#  - Il télécharge le ZIP officiel sur https://kiricoucou.github.io/uca-extension/ (HTTPS), rien d'autre.
#  - Il ne touche pas à tes données : elles sont dans le navigateur, pas dans ce dossier.
#  Usage : bash maj-extension.sh  |  bash maj-extension.sh /chemin/du/dossier  |  --force (réinstalle même à jour)  |  --yes (sans fenêtre)
# (pas de « set -u » : bash 3.2 de macOS refuse les tableaux vides)

URL_CHROME="${UCA_URL_CHROME:-https://kiricoucou.github.io/uca-extension/extension/uca-extension-chrome.zip}"
URL_FF="${UCA_URL_FF:-https://kiricoucou.github.io/uca-extension/extension/uca-extension-firefox.zip}"
GECKO="uca-connecteur@site-emploi-du-temps.local"
OS="${UCA_FAKE_OS:-$(uname -s)}"
YES="${UCA_YES:-0}"
FORCE=0
ARGDEST=""
SELF="${BASH_SOURCE[0]:-$0}"
SELFDIR="$(cd "$(dirname "$SELF")" 2>/dev/null && pwd)"
if [ "$OS" = "Darwin" ]; then CFGDIR="$HOME/Library/Application Support/MyUCA"; else CFGDIR="${XDG_CONFIG_HOME:-$HOME/.config}/MyUCA"; fi
CFG="$CFGDIR/dossier-extension.txt"

for a in "$@"; do
  case "$a" in
    --force|-f|/force) FORCE=1 ;;
    --yes|-y) YES=1 ;;
    --help|-h) sed -n '2,13p' "$SELF" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) ARGDEST="$a" ;;
  esac
done

say()  { printf '%s\n' "$*"; }
warn() { printf '! %s\n' "$*" >&2; }
have() { command -v "$1" >/dev/null 2>&1; }

# ---------------------------------------------------------------- reconnaître le dossier de l'extension
manifest_version() { sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$1/manifest.json" 2>/dev/null | head -n1; }
is_ext_dir() { [ -f "$1/manifest.json" ] && grep -q '"name"[[:space:]]*:[[:space:]]*"[^"]*UCA' "$1/manifest.json" 2>/dev/null; }
is_firefox_dir() { grep -q 'browser_specific_settings' "$1/manifest.json" 2>/dev/null; }

CPATH=(); CORIGIN=()
add_cand() {
  local p="${1%/}" o="$2" i
  [ -z "$p" ] && return
  [ "${#p}" -gt 1 ] || return
  for i in "${!CPATH[@]}"; do [ "${CPATH[$i]}" = "$p" ] && return; done
  is_ext_dir "$p" && { CPATH+=("$p"); CORIGIN+=("$o"); }
}

find_in_browsers() {
  local roots=() ffroots=() r name root prof f p
  if [ "$OS" = "Darwin" ]; then
    local AS="$HOME/Library/Application Support"
    roots=("Chrome|$AS/Google/Chrome" "Chromium|$AS/Chromium" "Brave|$AS/BraveSoftware/Brave-Browser" "Edge|$AS/Microsoft Edge" "Vivaldi|$AS/Vivaldi")
    ffroots=("$AS/Firefox/Profiles")
  else
    roots=("Chrome|$HOME/.config/google-chrome" "Chromium|$HOME/.config/chromium" "Brave|$HOME/.config/BraveSoftware/Brave-Browser" "Edge|$HOME/.config/microsoft-edge" "Vivaldi|$HOME/.config/vivaldi"
           "Chromium (snap)|$HOME/snap/chromium/common/chromium" "Chrome (Flatpak)|$HOME/.var/app/com.google.Chrome/config/google-chrome" "Brave (Flatpak)|$HOME/.var/app/com.brave.Browser/config/BraveSoftware/Brave-Browser")
    ffroots=("$HOME/.mozilla/firefox" "$HOME/snap/firefox/common/.mozilla/firefox" "$HOME/.var/app/org.mozilla.firefox/.mozilla/firefox")
  fi
  for r in "${roots[@]}"; do
    name="${r%%|*}"; root="${r#*|}"
    [ -d "$root" ] || continue
    for prof in "$root"/Default "$root"/Profile\ *; do
      [ -d "$prof" ] || continue
      for f in "Secure Preferences" "Preferences"; do
        [ -f "$prof/$f" ] || continue
        # extensions chargées depuis un dossier : "path":"/chemin/absolu"
        grep -o '"path"[[:space:]]*:[[:space:]]*"/[^"]*"' "$prof/$f" 2>/dev/null | sed 's/^"path"[[:space:]]*:[[:space:]]*"//; s/"$//' | while IFS= read -r p; do printf '%s\t%s\n' "$p" "$name, profil $(basename "$prof")"; done
      done
    done
  done > "$TMPCAND" 2>/dev/null
  for root in "${ffroots[@]}"; do
    [ -d "$root" ] || continue
    for prof in "$root"/*/; do
      f="${prof}extensions.json"
      [ -f "$f" ] || continue
      # extensions.json : un objet par module ; on isole celui de My UCA puis on lit son chemin (espaces tolérés)
      p="$(sed 's/{[[:space:]]*"id"/\n&/g' "$f" | grep -F "$GECKO" | grep -o '"path"[[:space:]]*:[[:space:]]*"[^"]*"' | head -n1 | sed 's/^"path"[[:space:]]*:[[:space:]]*"//; s/"$//')"
      [ -n "$p" ] && { [ -f "$p" ] && p="$(dirname "$p")"; printf '%s\tFirefox, profil %s\n' "$p" "$(basename "$prof")" >> "$TMPCAND"; }
    done
  done
  local path origin
  while IFS=$'\t' read -r path origin; do add_cand "$path" "$origin"; done < "$TMPCAND"
}

# ---------------------------------------------------------------- fenêtres (zenity / kdialog / terminal, ou osascript sur Mac)
GUI=""
if [ "$YES" != "1" ]; then
  if [ "$OS" = "Darwin" ]; then have osascript && GUI="osa"
  elif [ -n "${DISPLAY:-}${WAYLAND_DISPLAY:-}" ]; then
    if have zenity; then GUI="zenity"; elif have kdialog; then GUI="kdialog"; fi
  fi
fi
CHOSEN=""

open_dir() {
  if [ "$OS" = "Darwin" ]; then open "$1" 2>/dev/null
  elif have xdg-open; then xdg-open "$1" >/dev/null 2>&1 &
  elif have gio; then gio open "$1" >/dev/null 2>&1 &
  else say "Dossier : $1"; fi
}

pick_dir() {   # demande un dossier, vérifie que c'est bien l'extension -> CHOSEN
  local p=""
  case "$GUI" in
    osa) p="$(osascript -e 'POSIX path of (choose folder with prompt "Choisis le dossier de l’extension (celui qui contient manifest.json)")' 2>/dev/null)" ;;
    zenity) p="$(zenity --file-selection --directory --title="Dossier de l'extension My UCA" 2>/dev/null)" ;;
    kdialog) p="$(kdialog --getexistingdirectory "$HOME" --title "Dossier de l'extension My UCA" 2>/dev/null)" ;;
    *) printf "Chemin du dossier de l'extension (celui qui contient manifest.json) : "; read -r p || p="" ;;
  esac
  p="${p%$'\r'}"   # saisie terminée par un retour chariot (Windows)
  [ -z "$p" ] && return 1
  p="${p%/}"
  if is_ext_dir "$p"; then CHOSEN="$p"; return 0; fi
  warn "Ce dossier ne contient pas l'extension My UCA (pas de manifest.json) : $p"
  return 1
}

describe() { printf '%s\n(%s, version %s)' "${CPATH[$1]}" "${CORIGIN[$1]}" "$(manifest_version "${CPATH[$1]}")"; }

choose_index() {   # plusieurs dossiers trouvés : lequel ? -> IDX
  IDX=0
  [ "${#CPATH[@]}" -le 1 ] && return 0
  local i lst=()
  for i in "${!CPATH[@]}"; do lst+=("$((i+1)). ${CPATH[$i]}  (${CORIGIN[$i]})"); done
  case "$GUI" in
    zenity) local s; s="$(zenity --list --title="Plusieurs dossiers trouvés" --text="Quel dossier veux-tu mettre à jour ?" --column="Dossier" "${lst[@]}" --width=640 --height=300 2>/dev/null)" || return 1; IDX=$(( ${s%%.*} - 1 )) ;;
    osa) local s; s="$(osascript -e 'on run argv' -e 'choose from list argv with prompt "Plusieurs dossiers trouvés : lequel mettre à jour ?" default items {item 1 of argv}' -e 'end run' "${lst[@]}" 2>/dev/null)"; [ -z "$s" ] || [ "$s" = "false" ] && return 1; IDX=$(( ${s%%.*} - 1 )) ;;
    *) say "Plusieurs dossiers trouvés :"; printf '  %s\n' "${lst[@]}"; local n; printf "Numéro du dossier à mettre à jour : "; read -r n || return 1; n="${n%$'\r'}"; IDX=$(( n - 1 )) ;;
  esac
  [ "$IDX" -ge 0 ] && [ "$IDX" -lt "${#CPATH[@]}" ]
}

confirm() {   # -> CHOSEN ; code 3 = annulé
  choose_index || return 3
  local i="$IDX" out rc txt
  while :; do
    case "$GUI" in
      osa)
        txt="Je l’ai retrouvé dans ton navigateur :

$(describe "$i")

Clique sur « Ouvrir le dossier » pour vérifier que c’est le bon, puis sur « Valider » : je cherche une nouvelle version et je mets l’extension à jour toute seule."
        out="$(osascript -e 'on run argv' -e 'display dialog (item 1 of argv) with title "Mise à jour de l’extension My UCA" buttons {"Autre dossier…", "Ouvrir le dossier", "Valider"} default button "Valider" with icon note' -e 'end run' "$txt" 2>/dev/null)" || return 3
        case "$out" in
          *"Ouvrir le dossier"*) open_dir "${CPATH[$i]}"; continue ;;
          *"Autre dossier"*) pick_dir && return 0; continue ;;
          *Valider*) CHOSEN="${CPATH[$i]}"; return 0 ;;
          *) return 3 ;;
        esac ;;
      zenity)
        txt="Je l'ai retrouvé dans ton navigateur :\n\n<b>${CPATH[$i]}</b>\n(${CORIGIN[$i]}, version $(manifest_version "${CPATH[$i]}"))\n\nClique sur « Ouvrir le dossier » pour vérifier que c'est le bon, puis sur « Valider » : je cherche une nouvelle version et je mets l'extension à jour toute seule."
        out="$(zenity --question --title="Mise à jour de l'extension My UCA" --width=560 --text="$txt" --ok-label="Valider" --cancel-label="Annuler" --extra-button="Ouvrir le dossier" --extra-button="Autre dossier…" 2>/dev/null)"; rc=$?
        case "$out" in
          "Ouvrir le dossier") open_dir "${CPATH[$i]}"; continue ;;
          "Autre dossier…") pick_dir && return 0; continue ;;
        esac
        [ "$rc" -eq 0 ] && { CHOSEN="${CPATH[$i]}"; return 0; }
        return 3 ;;
      kdialog)
        kdialog --title "Mise à jour de l'extension My UCA" --yes-label "Valider" --no-label "Ouvrir le dossier" --cancel-label "Annuler" --yesnocancel "Je l'ai retrouvé dans ton navigateur :\n\n${CPATH[$i]}\n(${CORIGIN[$i]}, version $(manifest_version "${CPATH[$i]}"))\n\n« Ouvrir le dossier » pour vérifier, puis « Valider »." 2>/dev/null; rc=$?
        case "$rc" in 0) CHOSEN="${CPATH[$i]}"; return 0 ;; 1) open_dir "${CPATH[$i]}"; continue ;; *) return 3 ;; esac ;;
      *)
        say ""; say "C'est bien le dossier de ton extension ?"; say "  $(describe "$i" | tr '\n' ' ')"
        printf '  [V] Valider   [O] Ouvrir le dossier   [A] Autre dossier   [Q] Quitter : '
        read -r out || return 3
        out="${out%$'\r'}"
        case "$out" in
          [Vv]*|"") CHOSEN="${CPATH[$i]}"; return 0 ;;
          [Oo]*) open_dir "${CPATH[$i]}"; continue ;;
          [Aa]*) pick_dir && return 0; continue ;;
          *) return 3 ;;
        esac ;;
    esac
  done
}

# ---------------------------------------------------------------- 1) quel dossier ?
TMPCAND="$(mktemp 2>/dev/null || echo "/tmp/myuca-cand.$$")"
TMP=""
cleanup() { rm -f "$TMPCAND"; [ -n "$TMP" ] && [ -d "$TMP" ] && rm -rf "$TMP"; }
trap cleanup EXIT

end() {   # ferme proprement quand le script a été lancé par double-clic (macOS)
  if [ "$YES" != "1" ] && [ -t 0 ] && [ "$OS" = "Darwin" ]; then printf '\nAppuie sur Entrée pour fermer cette fenêtre. '; read -r _ || true; fi
}

say ""; say "Recherche de l'extension My UCA..."
DEST=""
if [ -n "$ARGDEST" ]; then
  add_cand "$ARGDEST" "dossier indiqué"
  [ "${#CPATH[@]}" -eq 0 ] && { say ""; say "Dossier de l'extension introuvable (pas de manifest.json) : $ARGDEST"; say "  bash maj-extension.sh /chemin/vers/le/dossier"; end; exit 2; }
  DEST="${CPATH[0]}"
else
  [ -f "$CFG" ] && add_cand "$(head -n1 "$CFG")" "dossier utilisé la dernière fois"
  add_cand "$SELFDIR" "dossier de ce script"
  find_in_browsers
  if [ "${#CPATH[@]}" -eq 0 ]; then
    say "Je n'ai pas retrouvé l'extension automatiquement."
    [ "$YES" = "1" ] && { say "Dossier de l'extension introuvable : relance avec le chemin du dossier en argument."; exit 2; }
    pick_dir || { say "Annulé : rien n'a été modifié."; end; exit 3; }
    DEST="$CHOSEN"
  elif [ "$YES" = "1" ]; then
    DEST="${CPATH[0]}"; say "Dossier détecté : $DEST  (${CORIGIN[0]})"
  else
    confirm; rc=$?
    [ "$rc" -ne 0 ] && { say ""; say "Annulé : rien n'a été modifié."; end; exit 3; }
    DEST="$CHOSEN"
  fi
fi
mkdir -p "$CFGDIR" 2>/dev/null && printf '%s\n' "$DEST" > "$CFG"

# ---------------------------------------------------------------- 2) y a-t-il une nouvelle version ? 3) mise à jour
IS_FF=0; is_firefox_dir "$DEST" && IS_FF=1
URL="$URL_CHROME"; [ "$IS_FF" = "1" ] && URL="$URL_FF"
say ""; say "Dossier : $DEST"; say "Recherche de la dernière version..."
TMP="$(mktemp -d 2>/dev/null || { mkdir -p "/tmp/myuca.$$" && echo "/tmp/myuca.$$"; })"
Q=""; case "$URL" in https://*) Q="?t=$(date +%s)" ;; esac
if have curl; then curl -fsSL --max-time 90 "$URL$Q" -o "$TMP/ext.zip" || { say "Erreur : téléchargement impossible (connexion ?). Rien n'a été modifié."; end; exit 1; }
elif have wget; then wget -q -O "$TMP/ext.zip" "$URL$Q" || { say "Erreur : téléchargement impossible (connexion ?). Rien n'a été modifié."; end; exit 1; }
else say "Erreur : ni curl ni wget n'est installé."; end; exit 1; fi
mkdir -p "$TMP/x"
if have unzip; then unzip -q -o "$TMP/ext.zip" -d "$TMP/x" || { say "Erreur : ZIP illisible."; end; exit 1; }
elif have python3; then python3 -c 'import sys,zipfile; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])' "$TMP/ext.zip" "$TMP/x" || { say "Erreur : ZIP illisible."; end; exit 1; }
else say "Erreur : « unzip » n'est pas installé (sudo apt install unzip)."; end; exit 1; fi
[ -f "$TMP/x/manifest.json" ] || { say "Erreur : ZIP invalide (pas de manifest.json)."; end; exit 1; }
is_ext_dir "$TMP/x" || { say "Erreur : ZIP inattendu (le nom ne contient pas « UCA »)."; end; exit 1; }
OLD="$(manifest_version "$DEST")"; NEW="$(manifest_version "$TMP/x")"
vnum() { printf '%s' "$1" | awk -F. '{ printf "%d%06d%06d%06d", 0, $1, $2, $3 }'; }
say "Version installee : $OLD   Derniere version : $NEW"
if [ "$(vnum "$NEW")" -le "$(vnum "$OLD")" ] && [ "$FORCE" != "1" ]; then
  say "Déjà à jour (utilise --force pour réinstaller quand même)."
else
  rm -f "$TMP"/x/maj-extension.*   # le script en cours n'est jamais écrasé
  cp -R "$TMP/x/." "$DEST/" || { say "Erreur : copie impossible. Ferme les fichiers ouverts puis réessaie. L'ancienne version est toujours en place."; end; exit 1; }
  find "$DEST" \( -name desktop.ini -o -name Thumbs.db -o -name .DS_Store \) -type f -delete 2>/dev/null
  say "OK : $OLD -> $NEW"
fi
say ""
if [ "$IS_FF" = "1" ]; then
  say "Pour appliquer la mise à jour : dans Firefox, ouvre about:debugging#/runtime/this-firefox"
  say "et clique sur « Recharger » sur la carte de l'extension."
else
  say "Pour appliquer la mise à jour : dans chrome://extensions (edge://extensions, brave://extensions), clique sur « Recharger »"
  say "(flèche ronde) sur la carte de l'extension. Elle se recharge aussi toute seule à la prochaine vérification."
fi
end
exit 0
