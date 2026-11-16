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
#  Commande complète (celle que l'extension te propose) :
#    bash maj-extension.sh --browser firefox --os linux --version 1.2.3 --yes [/chemin/du/dossier]
#    --browser : chrome | edge | brave | vivaldi | chromium | firefox (limite la recherche à ce navigateur, puis l'ouvre sur la nouvelle version)
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

BROWSER=""; WANT_VER=""; ARG_OS=""
while [ $# -gt 0 ]; do
  case "$1" in
    --force|-f|/force) FORCE=1 ;;
    --yes|-y) YES=1 ;;
    --browser) BROWSER="$(printf '%s' "${2:-}" | tr 'A-Z' 'a-z')"; shift ;;
    --version) WANT_VER="${2:-}"; shift ;;
    --os) ARG_OS="${2:-}"; shift ;;
    --help|-h) sed -n '2,15p' "$SELF" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) ARGDEST="$1" ;;
  esac
  shift
done

say()  { printf '%s\n' "$*"; }
warn() { printf '! %s\n' "$*" >&2; }
have() { command -v "$1" >/dev/null 2>&1; }

# ---------------------------------------------------------------- reconnaître le dossier de l'extension
manifest_version() { sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$1/manifest.json" 2>/dev/null | head -n1; }
is_ext_dir() { [ -f "$1/manifest.json" ] && grep -q '"name"[[:space:]]*:[[:space:]]*"[^"]*UCA' "$1/manifest.json" 2>/dev/null; }
is_firefox_dir() { grep -q 'browser_specific_settings' "$1/manifest.json" 2>/dev/null; }

CPATH=(); CORIGIN=(); CBROWS=()
browser_of() { local n="${1%%,*}"; case "$n" in Chrome|Edge|Brave|Vivaldi|Chromium|Firefox) printf '%s' "$n" ;; esac; }
leaf_browser() {   # extension_uca_chrome / _edge / _firefox ... -> nom du navigateur
  local leaf; leaf="$(basename "$1" | tr 'A-Z' 'a-z')"
  case "$leaf" in extension_uca_chrome) printf Chrome ;; extension_uca_edge) printf Edge ;; extension_uca_brave) printf Brave ;; extension_uca_vivaldi) printf Vivaldi ;; extension_uca_chromium) printf Chromium ;; extension_uca_firefox) printf Firefox ;; esac
}
names_for() {   # $1 dossier  $2 = 1 si Firefox -> « Chrome, Edge »
  local i out="" lb
  for i in "${!CPATH[@]}"; do [ "${CPATH[$i]}" = "$1" ] && out="${CBROWS[$i]}"; done
  lb="$(leaf_browser "$1")"
  case ", $out," in *", $lb,"*) ;; *) [ -n "$lb" ] && out="${out:+$out, }$lb" ;; esac
  if [ -z "$out" ]; then if [ "$2" = "1" ]; then out="Firefox"; else out="Chrome / Edge / Brave"; fi; fi
  printf '%s' "$out"
}
add_cand() {
  local p="${1%/}" o="$2" i
  [ -z "$p" ] && return
  [ "${#p}" -gt 1 ] || return
  local bn; bn="$(browser_of "$o")"
  for i in "${!CPATH[@]}"; do
    if [ "${CPATH[$i]}" = "$p" ]; then
      case ", ${CBROWS[$i]}," in *", $bn,"*) ;; *) [ -n "$bn" ] && CBROWS[$i]="${CBROWS[$i]:+${CBROWS[$i]}, }$bn" ;; esac
      return
    fi
  done
  is_ext_dir "$p" && { CPATH+=("$p"); CORIGIN+=("$o"); CBROWS+=("$bn"); }
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

# Dossier sans manifest.json : on cherche l'extension dedans (sous-dossiers), puis a cote (dossiers freres), puis au-dessus.
search_below() {   # $1 = racine, $2 = profondeur max -> imprime le premier dossier trouvé
  local root="$1" max="$2" d
  while IFS= read -r d; do
    [ -z "$d" ] && continue
    if is_ext_dir "$d"; then printf '%s' "$d"; return 0; fi
  done < <(find "$root" -mindepth 1 -maxdepth "$max" -type d \( -name .git -o -name node_modules \) -prune -o -type d -print 2>/dev/null | awk '{ n = gsub("/", "/"); print n "\t" $0 }' | sort -n | cut -f2-)
  return 1
}
resolve_dir() {   # imprime le dossier de l'extension le plus proche de $1 (ou $1 s'il n'y a rien)
  local d="${1%/}" r parent up
  [ -d "$d" ] || { printf '%s' "$1"; return 0; }
  if is_ext_dir "$d"; then printf '%s' "$d"; return 0; fi
  if r="$(search_below "$d" 4)"; then warn "Le manifest.json était dans un sous-dossier : $r" >&2; printf '%s' "$r"; return 0; fi
  parent="$(dirname "$d")"
  for up in 1 2; do
    [ "$parent" = "/" ] || [ "$parent" = "." ] && break
    if is_ext_dir "$parent"; then warn "Le manifest.json était dans le dossier du dessus : $parent" >&2; printf '%s' "$parent"; return 0; fi
    if r="$(search_below "$parent" 3)"; then warn "Extension trouvée à côté : $r" >&2; printf '%s' "$r"; return 0; fi
    parent="$(dirname "$parent")"
  done
  printf '%s' "$1"
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
  p="$(resolve_dir "$p")"
  if is_ext_dir "$p"; then CHOSEN="$p"; return 0; fi
  warn "Ce dossier ne contient pas l'extension My UCA (pas de manifest.json) : $p"
  return 1
}

limit_to_browser() {   # --browser donné : on ne garde que les dossiers trouvés dans ce navigateur (s'il y en a)
  [ -z "$BROWSER" ] && return 0
  local label i np=() no=() nb=()
  case "$BROWSER" in chrome) label="Chrome" ;; edge) label="Edge" ;; brave) label="Brave" ;; vivaldi) label="Vivaldi" ;; chromium) label="Chromium" ;; firefox) label="Firefox" ;; *) return 0 ;; esac
  for i in "${!CPATH[@]}"; do case "${CORIGIN[$i]}, ${CBROWS[$i]}" in "$label"*|*"$label"*) np+=("${CPATH[$i]}"); no+=("${CORIGIN[$i]}"); nb+=("${CBROWS[$i]}") ;; esac; done
  [ "${#np[@]}" -eq 0 ] && return 0
  CPATH=("${np[@]}"); CORIGIN=("${no[@]}"); CBROWS=("${nb[@]}")
}

open_in_browser() {   # ouvre le navigateur demandé sur la page qui lance l'agenda de l'extension
  [ "${UCA_NOLAUNCH:-0}" = "1" ] && return 0
  [ -z "$BROWSER" ] && return 0
  local url="https://kiricoucou.github.io/uca-extension/merci.html?v=${NEW:-$WANT_VER}&open=1" app="" cmd="" c
  if [ "$OS" = "Darwin" ]; then
    case "$BROWSER" in chrome) app="Google Chrome" ;; edge) app="Microsoft Edge" ;; brave) app="Brave Browser" ;; vivaldi) app="Vivaldi" ;; chromium) app="Chromium" ;; firefox) app="Firefox" ;; esac
    [ -n "$app" ] && open -a "$app" "$url" 2>/dev/null && say "$app s'ouvre sur la nouvelle version de l'extension."
    return 0
  fi
  case "$BROWSER" in
    chrome) cmd="google-chrome google-chrome-stable chromium chromium-browser" ;; edge) cmd="microsoft-edge microsoft-edge-stable" ;;
    brave) cmd="brave-browser brave" ;; vivaldi) cmd="vivaldi vivaldi-stable" ;; chromium) cmd="chromium chromium-browser" ;; firefox) cmd="firefox" ;;
  esac
  for c in $cmd; do
    if have "$c"; then nohup "$c" "$url" >/dev/null 2>&1 & say "$c s'ouvre sur la nouvelle version de l'extension."; return 0; fi
  done
  say "Navigateur « $BROWSER » introuvable : ouvre-le toi-même, l'extension est à jour."
}

describe() { printf '%s\n(%s, version %s)' "${CPATH[$1]}" "${CBROWS[$1]:-${CORIGIN[$1]}}" "$(manifest_version "${CPATH[$1]}")"; }

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
  add_cand "$(resolve_dir "$ARGDEST")" "dossier indiqué"
  [ "${#CPATH[@]}" -eq 0 ] && { say ""; say "Dossier de l'extension introuvable (pas de manifest.json) : $ARGDEST"; say "  bash maj-extension.sh /chemin/vers/le/dossier"; end; exit 2; }
  DEST="${CPATH[0]}"
else
  [ -f "$CFG" ] && add_cand "$(head -n1 "$CFG")" "dossier utilisé la dernière fois"
  add_cand "$SELFDIR" "dossier de ce script"
  find_in_browsers
  limit_to_browser
  if [ "${#CPATH[@]}" -eq 0 ]; then
    say "Je n'ai pas retrouvé l'extension automatiquement."
    [ "$YES" = "1" ] && { say "Dossier de l'extension introuvable : relance avec le chemin du dossier en argument."; exit 2; }
    pick_dir || { say "Annulé : rien n'a été modifié."; end; exit 3; }
    DEST="$CHOSEN"
  elif [ "$YES" = "1" ]; then
    DEST="${CPATH[0]}"; say "Dossier détecté : $DEST  ($(names_for "$DEST" "$(is_firefox_dir "$DEST" && echo 1 || echo 0)"))"
  else
    confirm; rc=$?
    [ "$rc" -ne 0 ] && { say ""; say "Annulé : rien n'a été modifié."; end; exit 3; }
    DEST="$CHOSEN"
  fi
fi
mkdir -p "$CFGDIR" 2>/dev/null && printf '%s\n' "$DEST" > "$CFG"

# ---------------------------------------------------------------- 2) y a-t-il une nouvelle version ? 3) mise à jour
TMP="$(mktemp -d 2>/dev/null || { mkdir -p "/tmp/myuca.$$" && echo "/tmp/myuca.$$"; })"
vnum() { printf '%s' "$1" | awk -F. '{ printf "%d%06d%06d%06d", 0, $1, $2, $3 }'; }
fetch_pkg() {   # $1 = 1 pour Firefox -> PKGDIR = dossier du paquet décompressé (téléchargé une seule fois par type)
  local ff="$1" url="$URL_CHROME" sub="xc" q=""
  [ "$ff" = "1" ] && { url="$URL_FF"; sub="xf"; }
  if [ -f "$TMP/$sub/manifest.json" ]; then PKGDIR="$TMP/$sub"; return 0; fi
  say "Recherche de la dernière version ($([ "$ff" = "1" ] && echo Firefox || echo 'Chrome / Edge / Brave'))..."
  case "$url" in https://*) q="?t=$(date +%s)" ;; esac
  if have curl; then curl -fsSL --max-time 90 "$url$q" -o "$TMP/$sub.zip" || { say "Erreur : téléchargement impossible (connexion ?). Rien n'a été modifié."; return 1; }
  elif have wget; then wget -q -O "$TMP/$sub.zip" "$url$q" || { say "Erreur : téléchargement impossible (connexion ?). Rien n'a été modifié."; return 1; }
  else say "Erreur : ni curl ni wget n'est installé."; return 1; fi
  mkdir -p "$TMP/$sub"
  if have unzip; then unzip -q -o "$TMP/$sub.zip" -d "$TMP/$sub" || { say "Erreur : ZIP illisible."; return 1; }
  elif have python3; then python3 -c 'import sys,zipfile; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])' "$TMP/$sub.zip" "$TMP/$sub" || { say "Erreur : ZIP illisible."; return 1; }
  else say "Erreur : « unzip » n'est pas installé (sudo apt install unzip)."; return 1; fi
  [ -f "$TMP/$sub/manifest.json" ] || { say "Erreur : ZIP invalide (pas de manifest.json)."; return 1; }
  is_ext_dir "$TMP/$sub" || { say "Erreur : ZIP inattendu (le nom ne contient pas « UCA »)."; return 1; }
  PKGDIR="$TMP/$sub"
}

# cibles : le dossier choisi + les dossiers des autres navigateurs rangés à côté (extension_uca_chrome / _edge / _firefox...)
TARGETS=("$DEST")
if [ -z "$ARGDEST" ] && [ -z "$BROWSER" ]; then
  par="$(dirname "$DEST")"
  for sd in "$par"/*/; do
    sd="${sd%/}"
    [ "$sd" = "$DEST" ] && continue
    if [ -n "$(leaf_browser "$sd")" ] && is_ext_dir "$sd"; then TARGETS+=("$sd"); say "Autre navigateur détecté : $sd"; fi
  done
  d_ff=0; is_firefox_dir "$DEST" && d_ff=1
  have_other=0; for t in "${TARGETS[@]}"; do f2=0; is_firefox_dir "$t" && f2=1; [ "$f2" != "$d_ff" ] && have_other=1; done
  if [ "$have_other" = "0" ]; then
    for i in "${!CPATH[@]}"; do f2=0; is_firefox_dir "${CPATH[$i]}" && f2=1; [ "$f2" != "$d_ff" ] && { TARGETS+=("${CPATH[$i]}"); say "Autre navigateur détecté : ${CPATH[$i]}"; break; }; done
  fi
fi
ANY_FF=0; CH_NAMES=""; FIRSTVER=""; NEW=""
for T in "${TARGETS[@]}"; do
  ff=0; is_firefox_dir "$T" && ff=1
  fetch_pkg "$ff" || { end; exit 1; }
  names="$(names_for "$T" "$ff")"
  OLD="$(manifest_version "$T")"; NEW="$(manifest_version "$PKGDIR")"
  say ""; say "Dossier : $T  ($names)"
  say "Version installee : $OLD   Derniere version : $NEW"
  if [ "$(vnum "$NEW")" -le "$(vnum "$OLD")" ] && [ "$FORCE" != "1" ]; then
    say "Déjà à jour (utilise --force pour réinstaller quand même)."
  else
    rm -f "$PKGDIR"/maj-extension.*   # le script en cours n'est jamais écrasé
    cp -R "$PKGDIR/." "$T/" || { say "Erreur : copie impossible. Ferme les fichiers ouverts puis réessaie. L'ancienne version est toujours en place."; end; exit 1; }
    find "$T" \( -name desktop.ini -o -name Thumbs.db -o -name .DS_Store \) -type f -delete 2>/dev/null
    say "OK : $OLD -> $NEW"
  fi
  if [ "$ff" = "1" ]; then ANY_FF=1; else CH_NAMES="${CH_NAMES:+$CH_NAMES, }$names"; fi
  [ -z "$FIRSTVER" ] && FIRSTVER="$(manifest_version "$T")"
done
if [ -n "$WANT_VER" ] && [ "$FIRSTVER" != "$WANT_VER" ]; then say "Remarque : la version attendue était $WANT_VER, le dossier contient maintenant $FIRSTVER."; fi
say ""
if [ -n "$CH_NAMES" ]; then
  say "Pour appliquer la mise à jour : dans chrome://extensions (edge://extensions, brave://extensions), clique sur « Recharger »"
  say "(flèche ronde) sur la carte de l'extension. Elle se recharge aussi toute seule à la prochaine vérification."
fi
if [ "$ANY_FF" = "1" ]; then
  say "Firefox : ouvre about:debugging#/runtime/this-firefox et clique sur « Recharger » sur la carte de l'extension."
fi
open_in_browser
end
exit 0
