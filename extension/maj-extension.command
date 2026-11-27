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

# Version du pilote : à monter à chaque changement de ce script (elle figure dans le nom du fichier téléchargé).
PILOT_VERSION="2.4"
printf 'Pilote de mise à jour My UCA, version %s\n' "$PILOT_VERSION"

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

ORIG_ARGS=("$@")
BROWSER=""; WANT_VER=""; ARG_OS=""
while [ $# -gt 0 ]; do
  case "$1" in
    --force|-f|/force) FORCE=1 ;;
    --yes|-y) YES=1 ;;
    --desinstaller) UNINSTALL=1 ;;
    --browser) BROWSER="$(printf '%s' "${2:-}" | tr 'A-Z' 'a-z')"; shift ;;
    --version) WANT_VER="${2:-}"; shift ;;
    --id) EXT_ID="${2:-}"; shift ;;
    --os) ARG_OS="${2:-}"; shift ;;
    --help|-h) sed -n '2,15p' "$SELF" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) ARGDEST="$1" ;;
  esac
  shift
done

say()  { printf '%s\n' "$*"; }
warn() { printf '! %s\n' "$*" >&2; }
have() { command -v "$1" >/dev/null 2>&1; }
vnum() { printf '%s' "$1" | awk -F. '{ printf "%d%06d%06d%06d", 0, $1, $2, $3 }'; }

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
  # ancienne édition de test (numérotation à part) : jamais mise à jour
  grep -qi 'MOODLE (test)' "$p/manifest.json" 2>/dev/null && return
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

# Dossier chargé par le navigateur pour CETTE extension (identifiant donné par l'extension) : la certitude.
find_by_id() {
  [[ "${1:-}" =~ ^[a-p]{32}$ ]] || return 1
  local base f p
  if [ "$OS" = "Darwin" ]; then base="$HOME/Library/Application Support"; else base="$HOME/.config"; fi
  while IFS= read -r f; do
    p="$(tr -d '\n' < "$f" | grep -o "\"$1\"[[:space:]]*:[[:space:]]*{.\{0,8000\}" | head -n1 | grep -o '"path"[[:space:]]*:[[:space:]]*"/[^"]*"' | head -n1 | sed 's/^"path"[[:space:]]*:[[:space:]]*"//; s/"$//')"
    if [ -n "$p" ] && is_ext_dir "$p"; then printf '%s' "$p"; return 0; fi
  done < <(find "$base" -maxdepth 5 \( -name "Preferences" -o -name "Secure Preferences" \) -type f 2>/dev/null)
  return 1
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

latest_version() {
  have curl || return 0
  curl -fsSL -m 20 "${UCA_URL_MANIFEST:-https://kiricoucou.github.io/uca-extension/manifest.json}" 2>/dev/null | sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([0-9.]*\)".*/\1/p' | head -n1
}
confirm() {   # -> CHOSEN ; code 3 = annulé
  LATEST="$(latest_version)"
  [ -n "$LATEST" ] || LATEST="(la dernière publiée)"
  choose_index || return 3
  local i="$IDX" out rc txt
  while :; do
    case "$GUI" in
      osa)
        txt="Version qui va être installée : $LATEST

Je l’ai retrouvé dans ton navigateur :

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
        txt="<big><b>Version qui va être installée : $LATEST</b></big>\n\nJe l'ai retrouvé dans ton navigateur :\n\n<b>${CPATH[$i]}</b>\n(${CORIGIN[$i]}, version $(manifest_version "${CPATH[$i]}"))\n\nClique sur « Ouvrir le dossier » pour vérifier que c'est le bon, puis sur « Valider » : je cherche une nouvelle version et je mets l'extension à jour toute seule."
        out="$(zenity --question --title="Mise à jour de l'extension My UCA" --width=560 --text="$txt" --ok-label="Valider" --cancel-label="Annuler" --extra-button="Ouvrir le dossier" --extra-button="Autre dossier…" 2>/dev/null)"; rc=$?
        case "$out" in
          "Ouvrir le dossier") open_dir "${CPATH[$i]}"; continue ;;
          "Autre dossier…") pick_dir && return 0; continue ;;
        esac
        [ "$rc" -eq 0 ] && { CHOSEN="${CPATH[$i]}"; return 0; }
        return 3 ;;
      kdialog)
        kdialog --title "Mise à jour de l'extension My UCA" --yes-label "Valider" --no-label "Ouvrir le dossier" --cancel-label "Annuler" --yesnocancel "Version qui va être installée : $LATEST\n\nJe l'ai retrouvé dans ton navigateur :\n\n${CPATH[$i]}\n(${CORIGIN[$i]}, version $(manifest_version "${CPATH[$i]}"))\n\n« Ouvrir le dossier » pour vérifier, puis « Valider »." 2>/dev/null; rc=$?
        case "$rc" in 0) CHOSEN="${CPATH[$i]}"; return 0 ;; 1) open_dir "${CPATH[$i]}"; continue ;; *) return 3 ;; esac ;;
      *)
        say ""; say "Version qui va être installée : $LATEST"; say "C'est bien le dossier de ton extension ?"; say "  $(describe "$i" | tr '\n' ' ')"
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

# ---------------------------------------------------------------- pilote installé : une seule copie, lancée par le lien uca-maj:
if [ "$OS" = "Darwin" ]; then PILOT_DIR="$CFGDIR/pilote"; else PILOT_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/MyUCA"; fi
DESKTOP_FILE="${XDG_DATA_HOME:-$HOME/.local/share}/applications/uca-maj.desktop"
write_launcher() {   # n'importe quel site peut ouvrir un lien uca-maj: ; seul un nom de navigateur de la liste en est tiré
  cat > "$PILOT_DIR/lancer.sh" <<'LAUNCH'
#!/usr/bin/env bash
DIR="$(cd "$(dirname "$0")" && pwd)"
re='^uca-maj:(//)?(chrome|edge|brave|vivaldi|chromium|firefox)(/([a-p]{32}))?/?$'
# Sans --yes : le pilote montre ses fenêtres (dossier trouvé, « Valider »).
args=()
if [[ "${1:-}" =~ $re ]]; then args=(--browser "${BASH_REMATCH[2]}"); [ -n "${BASH_REMATCH[4]}" ] && args+=(--id "${BASH_REMATCH[4]}"); fi
if [ "${UCA_DRYRUN:-0}" = "1" ]; then printf '[%s]\n' "${args[*]}"; exit 0; fi
bash "$DIR/maj-extension.sh" "${args[@]}"
printf '\nEntrée pour fermer (fermeture automatique dans 20 s). '; read -r -t 20 _ || true
LAUNCH
  chmod +x "$PILOT_DIR/lancer.sh"
}
install_pilot() {
  [ "${UCA_NOINSTALL:-0}" = "1" ] && return 0
  mkdir -p "$PILOT_DIR" || return 0
  [ "$SELF" -ef "$PILOT_DIR/maj-extension.sh" ] || cp "$SELF" "$PILOT_DIR/maj-extension.sh" || return 0
  write_launcher
  if [ "$OS" = "Darwin" ]; then
    have osacompile || return 0
    local app="$PILOT_DIR/Pilote My UCA.app" src="$PILOT_DIR/pilote.applescript" plist
    printf '%s\n' 'on open location u' \
      "  tell application \"Terminal\" to do script \"bash \" & quoted form of \"$PILOT_DIR/lancer.sh\" & \" \" & quoted form of u" \
      '  tell application "Terminal" to activate' 'end open location' > "$src"
    rm -rf "$app"; osacompile -o "$app" "$src" >/dev/null 2>&1 || return 0
    plist="$app/Contents/Info.plist"
    plutil -insert CFBundleURLTypes -json '[{"CFBundleURLName":"Pilote My UCA","CFBundleURLSchemes":["uca-maj"]}]' "$plist" >/dev/null 2>&1 || return 0
    /System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f "$app" >/dev/null 2>&1
  else
    mkdir -p "$(dirname "$DESKTOP_FILE")" || return 0
    printf '%s\n' '[Desktop Entry]' 'Type=Application' 'Name=Pilote de mise à jour My UCA' "Exec=\"$PILOT_DIR/lancer.sh\" %u" 'Terminal=true' 'NoDisplay=true' 'MimeType=x-scheme-handler/uca-maj;' > "$DESKTOP_FILE"
    have xdg-mime && xdg-mime default uca-maj.desktop x-scheme-handler/uca-maj >/dev/null 2>&1
    have update-desktop-database && update-desktop-database "$(dirname "$DESKTOP_FILE")" >/dev/null 2>&1
  fi
  say "Pilote installé : les prochaines fois, clique sur « Télécharger et appliquer la mise à jour » dans l'extension, rien à télécharger."
  say "(Tu peux supprimer le fichier téléchargé. Désinstaller : bash maj-extension.sh --desinstaller)"
}
if [ "${UNINSTALL:-0}" = "1" ]; then
  rm -f "$DESKTOP_FILE" "$PILOT_DIR/lancer.sh" "$PILOT_DIR/maj-extension.sh" "$PILOT_DIR/pilote.applescript"
  [ "$OS" = "Darwin" ] && rm -rf "$PILOT_DIR/Pilote My UCA.app"
  say "Pilote désinstallé."; exit 0
fi

# ---------------------------------------------------------------- l'outil se met à jour lui-même ; une version périmée est BLOQUÉE
PILOT_SOURCE="${UCA_PILOT_URL:-https://kiricoucou.github.io/uca-extension/extension/maj-extension.sh}"
PILOT_PAGE="https://kiricoucou.github.io/uca-extension/mise-a-jour.html"
pilot_public() {
  cat <<'PEM'
-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAonKu45jPQjfHM+Cd9QAj
IvEnRkG3SJP1W88Ok0OLyWR7K7DlwVxBPxz1WhEeKrNWyVVf5blUe4+4iiU9gLVD
o55T+k8oVp3x14sblS09oN7QE/dTKeGS3GfKF0oTYZAcAwlj6BQadjfyAhf98rim
Ddt8EdyCGzEO5+yyxVsCwIkBlzvbCPAZvzQWioIzY4hhuYGaYGNpqTnGWnb2BjGO
WCsgEGJLFqWknSvkdHEmh+jZQBzGYGmXhetAeJHe4yAw5SaTsi92P9FwFJ46C1+I
CnVI/7QnpBYp6pDJ93biCpOoiyICRTcnhTDKtV2gc3REw1paQAauM03nyHGo8b33
UQIDAQAB
-----END PUBLIC KEY-----
PEM
}
blocked() {   # fenêtre (si possible) puis arrêt : rien n'est modifié
  say "OUTIL BLOQUÉ : $1"
  say "Dernière version : $PILOT_PAGE"
  if [ "$YES" != "1" ]; then
    if [ "$OS" = "Darwin" ] && have osascript; then osascript -e 'on run argv' -e 'display dialog (item 1 of argv) with title "Mise à jour de My UCA" buttons {"Fermer"} with icon stop' -e 'end run' "Cet outil est bloqué. $1 Dernière version : $PILOT_PAGE" >/dev/null 2>&1
    elif have zenity; then zenity --error --width=520 --title="Mise à jour de My UCA" --text="Cet outil est bloqué.\n\n$1\n\nDernière version : $PILOT_PAGE" 2>/dev/null
    elif have kdialog; then kdialog --title "Mise à jour de My UCA" --error "Cet outil est bloqué. $1 $PILOT_PAGE" 2>/dev/null; fi
  fi
  exit 5
}
confirm_latest_pilot() {
  local dir published hash new ext
  have curl || blocked "Impossible de vérifier la version de l'outil (curl absent)."
  dir="$(mktemp -d)" || blocked "Impossible de créer un dossier temporaire."
  curl -fsSL -m 30 "$PILOT_SOURCE" -o "$dir/new" 2>/dev/null || { rm -rf "$dir"; blocked "Impossible de vérifier que cet outil est à jour (connexion Internet ?)."; }
  published="$(sed -n 's/^PILOT_VERSION="\([0-9.]*\)".*/\1/p' "$dir/new" | head -n1)"
  # un pilote Windows publié à cette adresse (essais) porte le numéro sous l'autre forme
  [ -n "$published" ] || { rm -rf "$dir"; blocked "La version publiée de l'outil est illisible."; }
  if [ "$(vnum "$published")" -le "$(vnum "$PILOT_VERSION")" ]; then rm -rf "$dir"; return 0; fi
  say "Nouvelle version de l'outil : $published. La version $PILOT_VERSION est périmée."
  [ "${UCA_UPDATED_TO:-}" = "$published" ] && { rm -rf "$dir"; blocked "La version $published reste introuvable après téléchargement."; }
  have openssl || { rm -rf "$dir"; blocked "La version $published est disponible, mais openssl manque pour vérifier sa signature."; }
  curl -fsSL -m 30 "$PILOT_SOURCE.sig" -o "$dir/sig64" 2>/dev/null || { rm -rf "$dir"; blocked "La signature de la version $published est introuvable."; }
  hash="$(tr -d '\r' < "$dir/new" | openssl dgst -sha256 -r | cut -d' ' -f1)"
  printf 'UCA-PILOT-V1:%s' "$hash" > "$dir/message"
  pilot_public > "$dir/public.pem"
  tr -d '\r\n' < "$dir/sig64" | openssl base64 -d -A > "$dir/sig" 2>/dev/null
  openssl dgst -sha256 -verify "$dir/public.pem" -signature "$dir/sig" "$dir/message" >/dev/null 2>&1 || { rm -rf "$dir"; blocked "La version $published téléchargée n'a pas la signature du projet : elle n'est pas exécutée."; }
  ext="${SELF##*.}"; [ "$ext" = "command" ] || ext="sh"
  new="$SELFDIR/maj-extension-v$published.$ext"
  local replace=0 d="$SELFDIR"
  case "$(basename "$SELF")" in maj-extension*) replace=1 ;; esac
  while [ -n "$d" ] && [ "$d" != "/" ] && [ "$d" != "." ]; do [ -e "$d/.git" ] && replace=0; d="$(dirname "$d")"; done
  { [ "$replace" = "1" ] && tr -d '\r' < "$dir/new" > "$new" 2>/dev/null; } || { new="$dir/maj-extension-v$published.$ext"; tr -d '\r' < "$dir/new" > "$new"; replace=0; }
  chmod +x "$new"
  if [ "$replace" = "1" ] && [ "$new" != "$SELF" ]; then rm -f "$SELF"; say "Ancien outil supprimé : $SELF"; fi
  say "Lancement de l'outil $published..."
  UCA_UPDATED_TO="$published" exec bash "$new" "${ORIG_ARGS[@]}"
}
[ "${UNINSTALL:-0}" = "1" ] || confirm_latest_pilot

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
  MINE=""
  [ -n "${EXT_ID:-}" ] && MINE="$(find_by_id "$EXT_ID")"
  if [ -n "$MINE" ]; then
    add_cand "$MINE" "extension qui demande la mise à jour, profil du navigateur"
    say "Dossier de ton extension, lu dans la configuration du navigateur."
  else
    # Les dossiers chargés par les navigateurs passent AVANT la mémoire.
    find_in_browsers
    limit_to_browser
    # La mémoire et le dossier du script ne servent que si aucun navigateur ne charge l'extension.
    if [ "${#CPATH[@]}" -eq 0 ]; then
      [ -f "$CFG" ] && add_cand "$(head -n1 "$CFG")" "dossier utilisé la dernière fois"
      add_cand "$SELFDIR" "dossier de ce script"
    fi
  fi
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
install_pilot

# ---------------------------------------------------------------- 2) y a-t-il une nouvelle version ? 3) mise à jour
TMP="$(mktemp -d 2>/dev/null || { mkdir -p "/tmp/myuca.$$" && echo "/tmp/myuca.$$"; })"
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
    SAVE="$CFGDIR/sauvegardes/$(date +%Y%m%d-%H%M%S)-$(basename "$T")-$OLD"
    ( cd "$PKGDIR" && find . -type f ) | while IFS= read -r f; do
      if [ -f "$T/$f" ] && ! cmp -s "$T/$f" "$PKGDIR/$f"; then mkdir -p "$SAVE/$(dirname "$f")" && cp -p "$T/$f" "$SAVE/$f"; fi
    done
    [ -d "$SAVE" ] && say "Copie de sécurité des fichiers remplacés : $SAVE"
    cp -R "$PKGDIR/." "$T/" || { say "Erreur : copie impossible. Ferme les fichiers ouverts puis réessaie. L'ancienne version est toujours en place."; end; exit 1; }
    find "$T" \( -name desktop.ini -o -name Thumbs.db -o -name .DS_Store \) -type f -delete 2>/dev/null
    [ "$(manifest_version "$T")" = "$NEW" ] || { say "Erreur : le dossier est resté en version $(manifest_version "$T") au lieu de $NEW."; end; exit 1; }
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
