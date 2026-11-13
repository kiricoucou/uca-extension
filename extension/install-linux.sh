#!/usr/bin/env bash
# ----------------------------------------------------------------------------------------------------------------
#  Installateur Linux de l'extension « Emploi du temps UCA » (non officielle) : Chrome / Chromium / Brave / Edge et Firefox.
#
#  - AUCUN sudo, aucun droit administrateur : tout est écrit dans ton dossier personnel ($HOME).
#  - Télécharge la dernière version sur https://kiricoucou.github.io/uca-extension/ (HTTPS), rien d'autre.
#  - Demande avant chaque étape (explorateur de fichiers si zenity / kdialog / yad est présent, sinon le terminal).
#  - Ne touche à tes données (Odin, notes...) jamais : elles vivent dans le navigateur, pas dans ces fichiers.
#
#  Usage :  bash install-linux.sh            (interactif)
#           bash install-linux.sh --yes      (réponses par défaut, sans question)
#           bash install-linux.sh --help
#  Variables : UCA_DIR=<dossier>  UCA_BROWSERS=chrome|firefox|both  UCA_YES=1  UCA_NO_OPEN=1 (n'ouvre rien)
# ----------------------------------------------------------------------------------------------------------------
set -u

BASE_URL="${UCA_BASE_URL:-https://kiricoucou.github.io/uca-extension/extension}"   # UCA_BASE_URL : réservé aux tests locaux
ZIP_CHROME="uca-extension-chrome.zip"
ZIP_FIREFOX="uca-extension-firefox.zip"
GECKO_ID="uca-connecteur@site-emploi-du-temps.local"
DEFAULT_DIR="$HOME/MyUCA"   # pas dans un dossier caché ni dans ~/.local, ~/.config : Chrome refuse ces dossiers pour la mise à jour automatique
YES="${UCA_YES:-0}"
NO_OPEN="${UCA_NO_OPEN:-0}"
TMP=""

for a in "$@"; do
  case "$a" in
    --yes|-y) YES=1 ;;
    --help|-h) sed -n '2,15p' "$0" | sed 's/^# \{0,2\}//'; exit 0 ;;
  esac
done

cleanup() { [ -n "$TMP" ] && [ -d "$TMP" ] && rm -rf "$TMP"; }
trap cleanup EXIT

if [ "$(id -u)" = "0" ]; then
  echo "Ne lance pas ce script avec sudo / en root : il n'en a pas besoin et écrirait dans le mauvais dossier."; exit 1
fi

say()  { printf '%s\n' "$*"; }
step() { printf '\n== %s\n' "$*"; }
warn() { printf '! %s\n' "$*" >&2; }

# ---------------------------------------------------------------- boîtes de dialogue (explorateur) ou terminal
GUI=""
if [ -n "${DISPLAY:-}${WAYLAND_DISPLAY:-}" ] && [ "$YES" != "1" ]; then
  for g in zenity kdialog yad; do command -v "$g" >/dev/null 2>&1 && { GUI="$g"; break; }; done
fi

ask_yes_no() {   # ask_yes_no "question" [défaut o|n]  -> 0 = oui
  local q="$1" def="${2:-o}"
  [ "$YES" = "1" ] && { [ "$def" = "o" ]; return; }
  case "$GUI" in
    zenity) zenity --question --width=460 --title="Extension UCA" --text="$q" 2>/dev/null; return ;;
    yad)    yad --question --width=460 --title="Extension UCA" --text="$q" 2>/dev/null; return ;;
    kdialog) kdialog --title "Extension UCA" --yesno "$q" 2>/dev/null; return ;;
  esac
  local hint="[O/n]"; [ "$def" = "n" ] && hint="[o/N]"
  local r; read -r -p "$q $hint " r || r=""
  case "${r:-$def}" in o|O|oui|OUI|y|Y|yes) return 0 ;; *) return 1 ;; esac
}

choose_dir() {   # choose_dir "titre" "défaut"  -> écrit le dossier choisi sur stdout
  local title="$1" def="$2" out=""
  mkdir -p "$def" 2>/dev/null
  if [ "$YES" = "1" ]; then printf '%s' "$def"; return; fi
  case "$GUI" in
    zenity) out="$(zenity --file-selection --directory --filename="$def/" --title="$title" 2>/dev/null)" ;;
    yad)    out="$(yad --file --directory --filename="$def/" --title="$title" 2>/dev/null)" ;;
    kdialog) out="$(kdialog --getexistingdirectory "$def" --title "$title" 2>/dev/null)" ;;
    *) read -r -e -p "$title [$def] : " out || out="" ;;
  esac
  printf '%s' "${out:-$def}"
}

choose_option() {   # choose_option "question" -> écrit chrome|firefox|both
  [ -n "${UCA_BROWSERS:-}" ] && { printf '%s' "$UCA_BROWSERS"; return; }
  [ "$YES" = "1" ] && { printf 'both'; return; }
  local r=""
  case "$GUI" in
    zenity) r="$(zenity --list --radiolist --width=460 --height=300 --title="Extension UCA" --text="Pour quel navigateur ?" --column="" --column="id" --column="Navigateur" --hide-column=2 --print-column=2 TRUE both "Chrome / Chromium / Brave / Edge et Firefox" FALSE chrome "Chrome, Chromium, Brave, Edge" FALSE firefox "Firefox" 2>/dev/null)" ;;
    kdialog) r="$(kdialog --title "Extension UCA" --menu "Pour quel navigateur ?" both "Chrome-like et Firefox" chrome "Chrome, Chromium, Brave, Edge" firefox "Firefox" 2>/dev/null)" ;;
    *) printf '\nPour quel navigateur ?\n  1) Chrome / Chromium / Brave / Edge\n  2) Firefox\n  3) Les deux\n' >&2; read -r -p "Choix [3] : " r || r=""
       case "${r:-3}" in 1) r=chrome ;; 2) r=firefox ;; *) r=both ;; esac ;;
  esac
  printf '%s' "${r:-both}"
}

# ---------------------------------------------------------------- outils : téléchargement, décompression
fetch() {   # fetch url fichier
  local proto="--proto =https --tlsv1.2" wproto="--https-only"
  [ -n "${UCA_BASE_URL:-}" ] && { proto=""; wproto=""; }
  # shellcheck disable=SC2086
  if command -v curl >/dev/null 2>&1; then curl -fsSL $proto --retry 2 -o "$2" "$1"
  elif command -v wget >/dev/null 2>&1; then wget -q $wproto -O "$2" "$1"
  else warn "Il faut curl ou wget (installe-en un avec ton gestionnaire de paquets)."; return 127; fi
}
unzip_to() {   # unzip_to fichier.zip dossier
  mkdir -p "$2"
  if command -v unzip >/dev/null 2>&1; then unzip -q -o "$1" -d "$2"
  elif command -v bsdtar >/dev/null 2>&1; then bsdtar -xf "$1" -C "$2"
  elif command -v python3 >/dev/null 2>&1; then python3 -c 'import sys,zipfile; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])' "$1" "$2"
  elif command -v python >/dev/null 2>&1; then python -c 'import sys,zipfile; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])' "$1" "$2"
  else warn "Il faut unzip (ou python3) pour décompresser."; return 127; fi
}
json_version() { sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$1" | head -n1; }

download_package() {   # download_package nom.zip dossier_destination  -> installe/maj, affiche la version
  local zip="$1" dest="$2" old="" new=""
  [ -z "$TMP" ] && TMP="$(mktemp -d)"
  say "Téléchargement de la dernière version ($zip)..."
  fetch "$BASE_URL/$zip?t=$(date +%s)" "$TMP/$zip" || { warn "Téléchargement impossible (connexion ? $BASE_URL/$zip)."; return 1; }
  local x="$TMP/x-${zip%.zip}"; rm -rf "$x"
  unzip_to "$TMP/$zip" "$x" || return 1
  [ -f "$x/manifest.json" ] || { warn "Paquet invalide : pas de manifest.json."; return 1; }
  grep -q 'UCA' "$x/manifest.json" || { warn "Paquet inattendu (nom sans « UCA ») : abandon."; return 1; }
  [ -f "$dest/manifest.json" ] && old="$(json_version "$dest/manifest.json")"
  new="$(json_version "$x/manifest.json")"
  mkdir -p "$dest" || { warn "Impossible de créer $dest"; return 1; }
  cp -a "$x/." "$dest/" || { warn "Copie impossible vers $dest"; return 1; }
  find "$dest" \( -name desktop.ini -o -name Thumbs.db -o -name .DS_Store \) -type f -delete 2>/dev/null   # Chrome refuse ces fichiers dans un dossier d'extension
  if [ -n "$old" ] && [ "$old" != "$new" ]; then say "OK : $old -> $new dans $dest"; else say "OK : version $new dans $dest"; fi
  INSTALLED_VERSION="$new"
  return 0
}

open_url() {   # open_url binaire url [url2...]  (la page de remerciement s'ouvre en second onglet)
  [ "$NO_OPEN" = "1" ] && return 0
  nohup "$1" "${@:2}" >/dev/null 2>&1 &
}
THANKS_URL="${BASE_URL%/extension}/merci.html"

# Barre de progression : fenêtre zenity si disponible, sinon barre dans le terminal.
PROG_FD=""
prog_start() {
  [ "$YES" = "1" ] && return 0
  if [ "$GUI" = "zenity" ]; then
    exec 3> >(zenity --progress --no-cancel --auto-close --width=460 --title="Extension UCA" --text="Préparation..." --percentage=0 2>/dev/null) && PROG_FD=3
  fi
}
prog() {   # prog pourcentage texte
  if [ -n "$PROG_FD" ]; then printf '%s\n# %s\n' "$1" "$2" >&3 2>/dev/null
  else
    local w=40 f i s=""; f=$(( $1 * w / 100 ))
    for ((i = 0; i < w; i++)); do [ $i -lt $f ] && s="$s#" || s="$s-"; done
    printf '\r\033[K[%s] %3d%%  %s' "$s" "$1" "$2"
    [ "$1" -ge 100 ] && printf '\n'
  fi
  return 0
}
prog_end() { [ -n "$PROG_FD" ] && { exec 3>&-; PROG_FD=""; }; }

# Ferme les navigateurs choisis : demande d'abord à l'utilisateur de les fermer, puis kill de ceux qui restent.
close_browsers() {   # close_browsers motif_pgrep ...
  local p running=0
  for p in "$@"; do pgrep -u "$(id -u)" -x "$p" >/dev/null 2>&1 && running=1; done
  [ "$running" = 0 ] && return 0
  ask_yes_no "Ferme correctement tes navigateurs (enregistre ton travail) puis clique Oui. Ceux qui resteront ouverts seront fermés de force. Continuer ?" o || return 1
  local i; for i in 1 2 3 4 5 6 7 8 9 10; do
    running=0; for p in "$@"; do pgrep -u "$(id -u)" -x "$p" >/dev/null 2>&1 && running=1; done
    [ "$running" = 0 ] && return 0; sleep 0.5
  done
  for p in "$@"; do pkill -u "$(id -u)" -x "$p" 2>/dev/null; done
  sleep 2
}
copy_clip() {   # copie dans le presse-papiers si possible
  if command -v wl-copy >/dev/null 2>&1; then printf '%s' "$1" | wl-copy 2>/dev/null && return 0
  elif command -v xclip >/dev/null 2>&1; then printf '%s' "$1" | xclip -selection clipboard 2>/dev/null && return 0
  elif command -v xsel >/dev/null 2>&1; then printf '%s' "$1" | xsel -b 2>/dev/null && return 0; fi
  return 1
}

# ---------------------------------------------------------------- Chrome / Chromium / Brave / Edge
chrome_ext_id() {   # chrome_ext_id /chemin/absolu  -> identifiant que Chrome / Chromium donne à ce dossier
  local h=""
  if command -v sha256sum >/dev/null 2>&1; then h="$(printf '%s' "$1" | sha256sum | cut -c1-32)"
  elif command -v shasum >/dev/null 2>&1; then h="$(printf '%s' "$1" | shasum -a 256 | cut -c1-32)"
  elif command -v openssl >/dev/null 2>&1; then h="$(printf '%s' "$1" | openssl dgst -sha256 | sed 's/^.* //' | cut -c1-32)"
  else return 1; fi
  printf '%s' "$h" | tr '0-9a-f' 'a-p'
}
install_chrome() {
  step "Chrome / Chromium / Brave / Edge"
  say "Le dossier choisi sera celui que le navigateur lit : ne le supprime pas et ne le déplace pas ensuite."
  local dir; dir="$(choose_dir "Dossier d'installation de l'extension" "${UCA_DIR:-$DEFAULT_DIR/chrome}")"
  download_package "$ZIP_CHROME" "$dir" || return 1
  RESULT_PATHS="${RESULT_PATHS:-}$dir
"
  local bin="" b
  for b in google-chrome google-chrome-stable chromium chromium-browser brave-browser microsoft-edge microsoft-edge-stable vivaldi; do
    command -v "$b" >/dev/null 2>&1 && { bin="$b"; break; }
  done
  say ""
  say "Dernière étape (obligatoire, c'est une règle de Chrome : une extension hors magasin se charge à la main, une seule fois) :"
  say "  1. Active « Mode développeur » en haut à droite de la page chrome://extensions"
  say "  2. Clique « Charger l'extension non empaquetée » et choisis :  $dir"
  copy_clip "$dir" && say "  (le chemin est déjà dans ton presse-papiers : colle-le dans la fenêtre avec Ctrl+L)"
  if [ -n "$bin" ] && ask_yes_no "Ouvrir $bin sur chrome://extensions (et la page de remerciement) maintenant ?" o; then open_url "$bin" "chrome://extensions" "$THANKS_URL"; fi
  if command -v xdg-open >/dev/null 2>&1 && [ "$NO_OPEN" != "1" ] && ask_yes_no "Ouvrir le dossier dans ton explorateur de fichiers ?" n; then xdg-open "$dir" >/dev/null 2>&1 & fi
  say "Mises à jour : relance ce script, ou clique « Recharger » dans chrome://extensions après avoir remplacé le dossier."
  # Fin : ouvre la page de l'extension (le calendrier des cours, avec le bouton pour te connecter à Odin) quand elle est chargée.
  local real id; real="$(cd "$dir" 2>/dev/null && pwd -P)"; id="$(chrome_ext_id "$real" 2>/dev/null)"
  if [ -n "$bin" ] && [ -n "$id" ] && [ "$YES" != "1" ]; then
    say ""
    if ask_yes_no "Extension chargée dans $bin ? J'ouvre sa page pour te connecter (l'icône puzzle > épingle pour la garder visible)." o; then
      open_url "$bin" "chrome-extension://$id/designs/studio/agenda.html" "$THANKS_URL"
      say "Calendrier des cours ouvert : clique « Importer » pour te connecter à Odin (le bouton « Design » change de design en un clic). Si rien ne s'ouvre, l'extension n'est pas encore chargée."
    fi
  elif [ -n "$id" ]; then
    say "Page de l'extension une fois chargée : chrome-extension://$id/designs/studio/agenda.html"
  fi
}

# ---------------------------------------------------------------- Firefox
firefox_bin() {
  local b
  for b in firefox firefox-developer-edition firefox-esr firefox-nightly firefox-beta; do
    command -v "$b" >/dev/null 2>&1 && { printf '%s' "$b"; return 0; }
  done
  for b in "$HOME/.local/share/flatpak/exports/bin/org.mozilla.firefox" /var/lib/flatpak/exports/bin/org.mozilla.firefox; do
    [ -x "$b" ] && { printf '%s' "$b"; return 0; }
  done
  return 1
}
firefox_profile_root() {
  local d
  for d in "$HOME/.mozilla/firefox" "$HOME/snap/firefox/common/.mozilla/firefox" "$HOME/.var/app/org.mozilla.firefox/.mozilla/firefox"; do
    [ -f "$d/profiles.ini" ] && { printf '%s' "$d"; return 0; }
  done
  return 1
}
firefox_default_profile() {   # firefox_default_profile racine -> chemin du profil par défaut
  local root="$1" ini="$1/profiles.ini" path="" rel=1
  # 1) section [Install...] : Default=chemin  2) sinon [Profile...] avec Default=1
  path="$(awk -F= '/^\[Install/{i=1;next} /^\[/{i=0} i&&$1=="Default"{print $2; exit}' "$ini")"
  if [ -n "$path" ]; then
    [ -d "$root/$path" ] && { printf '%s' "$root/$path"; return 0; }
    [ -d "$path" ] && { printf '%s' "$path"; return 0; }
  fi
  awk -F= -v root="$root" '
    /^\[Profile/ { if (p != "" && d == 1) { print (r == 0 ? p : root "/" p); found = 1; exit } p = ""; d = 0; r = 1; next }
    $1 == "Path" { p = $2 } $1 == "IsRelative" { r = $2 } $1 == "Default" { d = $2 }
    END { if (!found && p != "" && d == 1) print (r == 0 ? p : root "/" p) }' "$ini"
}
firefox_running() { pgrep -u "$(id -u)" -x "firefox|firefox-bin|firefox-esr|firefox-developer-edition|.firefox-wrapped" >/dev/null 2>&1 ; }

install_firefox() {
  step "Firefox"
  local bin; bin="$(firefox_bin)" || { warn "Firefox introuvable (ni dans le PATH ni en Flatpak). Étape ignorée."; return 1; }
  local ver edition="release"
  ver="$("$bin" --version 2>/dev/null | head -n1)"
  case "$bin $ver" in
    *developer*|*Developer*) edition="developer" ;;
    *nightly*|*Nightly*) edition="nightly" ;;
    *esr*|*ESR*) edition="esr" ;;
  esac
  say "Trouvé : ${ver:-Firefox} ($bin), édition : $edition"

  local root profile
  root="$(firefox_profile_root)" || { warn "Aucun profil Firefox trouvé (lance Firefox une fois, puis relance ce script)."; return 1; }
  profile="$(firefox_default_profile "$root")"
  [ -n "$profile" ] && [ -d "$profile" ] || { warn "Profil par défaut introuvable dans $root/profiles.ini."; return 1; }
  say "Profil : $profile"

  # Vérification « mode développeur » : Firefox n'accepte une extension non signée que si xpinstall.signatures.required est
  # à false, et seules les éditions Developer, Nightly et ESR non marquées le respectent.
  local sig="vrai (signature exigée)"
  grep -qs 'user_pref("xpinstall.signatures.required", *false)' "$profile/user.js" "$profile/prefs.js" && sig="faux (extensions non signées acceptées)"
  say "Signatures exigées (xpinstall.signatures.required) : $sig"

  local permanent=0
  [ "$edition" != "release" ] && permanent=1
  if [ "$permanent" = "0" ]; then
    say ""
    say "Cette édition de Firefox (version « release ») refuse une extension non signée de façon permanente : c'est une protection de Mozilla,"
    say "pas un réglage que ce script peut ou doit contourner. Deux possibilités :"
    say "  - installer Firefox Developer Edition / Nightly / ESR (sans sudo : archive officielle à décompresser), puis relancer ce script ;"
    say "  - charger l'extension en temporaire (à refaire à chaque démarrage de Firefox), ce que je prépare maintenant."
  fi

  ask_yes_no "Installer l'extension sur Firefox (profil : $(basename "$profile")) ?" o || { say "Firefox : ignoré à ta demande."; return 0; }

  local dir="${UCA_DIR:-$DEFAULT_DIR}/firefox"
  [ "$YES" != "1" ] && dir="$(choose_dir "Dossier de l'extension Firefox" "$dir")"
  download_package "$ZIP_FIREFOX" "$dir" || return 1
  RESULT_PATHS="${RESULT_PATHS:-}$dir
"

  if [ "$permanent" = "1" ]; then
    if firefox_running; then
      say "Firefox est ouvert : ferme-le complètement pour que le profil soit modifié sans risque."
      local tries=0
      while firefox_running && [ "$tries" -lt 60 ]; do
        [ "$YES" = "1" ] && { warn "Firefox ouvert en mode --yes : je ne modifie pas le profil. Ferme Firefox et relance."; return 1; }
        ask_yes_no "Firefox est-il fermé maintenant ? (je ne le ferme jamais à ta place)" o || { say "Firefox : installation reportée."; return 0; }
        tries=$((tries + 1)); sleep 1
      done
    fi
    ask_yes_no "J'ajoute deux réglages au profil (user.js, sauvegarde faite) : accepter les extensions non signées et ne pas les désactiver ?" o \
      || { say "Réglages refusés : installation permanente impossible, bascule en mode temporaire."; permanent=0; }
  fi

  if [ "$permanent" = "1" ]; then
    local uj="$profile/user.js"
    [ -f "$uj" ] && cp -p "$uj" "$uj.uca-sauvegarde-$(date +%Y%m%d-%H%M%S)"
    grep -qs 'xpinstall.signatures.required' "$uj" || printf '%s\n' 'user_pref("xpinstall.signatures.required", false);' >> "$uj"
    grep -qs 'extensions.autoDisableScopes' "$uj" || printf '%s\n' 'user_pref("extensions.autoDisableScopes", 0);' >> "$uj"
    mkdir -p "$profile/extensions"
    cp -f "$TMP/$ZIP_FIREFOX" "$profile/extensions/$GECKO_ID.xpi" || { warn "Copie du .xpi impossible."; return 1; }
    say "Installé : $profile/extensions/$GECKO_ID.xpi"
    say "Ouvre Firefox : l'extension est active (menu Extensions). Mise à jour : relance ce script."
    say "L'icône « Emploi du temps UCA » est épinglée dans la barre d'outils et listée dans le menu Extensions (puzzle) de Firefox."
    if ask_yes_no "Lancer Firefox maintenant ? La page de l'extension s'ouvre toute seule au premier démarrage pour te connecter." o; then
      open_url "$bin" "$THANKS_URL"
    fi
  else
    say ""
    say "Chargement temporaire : dans Firefox, page about:debugging#/runtime/this-firefox"
    say "  -> « Charger un module complémentaire temporaire… » -> choisis le fichier :  $dir/manifest.json"
    copy_clip "$dir/manifest.json" && say "  (chemin copié dans le presse-papiers : Ctrl+L dans la fenêtre pour le coller)"
    ask_yes_no "Ouvrir about:debugging maintenant ? Une fois chargée, la page de l'extension s'ouvre pour te connecter." o && open_url "$bin" "about:debugging#/runtime/this-firefox" "$THANKS_URL"
  fi
  return 0
}

# ---------------------------------------------------------------- programme principal
step "Extension « Emploi du temps UCA » : installation sans sudo"
say "Source : $BASE_URL (HTTPS). Rien n'est envoyé : seuls des fichiers sont téléchargés."
command -v curl >/dev/null 2>&1 || command -v wget >/dev/null 2>&1 || { warn "Installe curl ou wget d'abord."; exit 1; }
[ -n "$GUI" ] && say "Boîtes de dialogue : $GUI" || say "Mode terminal (pas de zenity/kdialog/yad détecté, ou --yes)."

CHOICE="$(choose_option)"
FAIL=0
prog_start; prog 5 "Préparation"
case "$CHOICE" in
  chrome)  close_browsers chrome chromium brave msedge vivaldi-bin ;;
  firefox) close_browsers firefox firefox-bin ;;
  *)       close_browsers chrome chromium brave msedge vivaldi-bin firefox firefox-bin ;;
esac
prog 15 "Téléchargement et installation"
case "$CHOICE" in
  chrome)  install_chrome  || FAIL=1 ;;
  firefox) install_firefox || FAIL=1 ;;
  *)       install_chrome  || FAIL=1; install_firefox || FAIL=1 ;;
esac

prog 100 "Terminé"; prog_end
# Où l'extension a été installée : chemin affiché, copiable, ouvrable dans le gestionnaire de fichiers
if [ -n "${RESULT_PATHS:-}" ]; then
  step "Dossier de l'extension"
  printf '%s' "$RESULT_PATHS" | while IFS= read -r p; do [ -n "$p" ] && say "  $p"; done
  say "Dossier introuvable ? Il peut être masqué (~/.local/share est caché) : dans le gestionnaire de fichiers, Ctrl+H affiche les éléments masqués."
  FIRST_PATH="$(printf '%s' "$RESULT_PATHS" | head -n1)"
  [ -n "$FIRST_PATH" ] && copy_clip "$FIRST_PATH" && say "(le chemin du premier dossier est copié dans le presse-papiers)"
  if command -v xdg-open >/dev/null 2>&1 && [ "$NO_OPEN" != "1" ] && [ "$YES" != "1" ] && [ -n "$FIRST_PATH" ] && ask_yes_no "Ouvrir ce dossier dans ton gestionnaire de fichiers ?" o; then xdg-open "$FIRST_PATH" >/dev/null 2>&1 & fi
fi

step "Terminé"
[ "$FAIL" = "0" ] && say "Tout s'est bien passé. L'extension est prête : ouvre-la depuis la barre d'outils du navigateur." || say "Certaines étapes ont échoué : lis les messages ci-dessus, rien n'a été cassé."
exit "$FAIL"
