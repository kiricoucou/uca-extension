"""Pilote de mise à jour installé une seule fois, puis lancé par « Appliquer la mise à jour » (lien uca-maj:).

Windows : installation réelle dans un LOCALAPPDATA et une clé de registre d'essai (jamais le vrai enregistrement uca-maj),
lancement par la commande enregistrée comme le fait Windows, liens piégés, désinstallation.
Linux : même chose avec un HOME d'essai (bash). Extension : première fois = un téléchargement, ensuite = lancement direct.
Nécessite le réseau (les pilotes téléchargent le ZIP publié sur GitHub Pages).

Usage : python -I -X utf8 tests/pilote.py
"""
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).resolve().parent))
from harness import launch  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
TEST_KEY = r"HKCU:\Software\MyUCA-essai-pilote"
BAD_LINKS = ['uca-maj:chrome" /force "C:\\x', "uca-maj:$(calc)", "uca-maj:chrome&calc", "uca-maj:chrome/../../x", "uca-maj:", "-Command calc", "uca-maj:safari"]
results = []


def check(name, ok, detail=""):
    results.append(bool(ok))
    print(("PASS " if ok else "FAIL ") + name + (f" — {detail}" if detail and not ok else ""))


def old_extension(folder):
    folder.mkdir(parents=True, exist_ok=True)
    m = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))
    m["version"] = "1.0.0"
    (folder / "manifest.json").write_text(json.dumps(m), encoding="utf-8")


def version(folder):
    return json.loads((folder / "manifest.json").read_text(encoding="utf-8"))["version"]


def sh(cmd, env, timeout=240):
    return subprocess.run(cmd, env=env, capture_output=True, stdin=subprocess.DEVNULL, text=True, encoding="utf-8", errors="replace", timeout=timeout)


def ps(code, env=None):
    return sh(["powershell", "-NoProfile", "-Command", code], env or dict(os.environ)).stdout.strip()


def windows():
    if os.name != "nt":
        print("ignoré : partie Windows")
        return
    real_before = ps(r"(Get-ItemProperty 'HKCU:\Software\Classes\uca-maj\shell\open\command' -ErrorAction SilentlyContinue).'(default)'")
    tmp = Path(tempfile.mkdtemp(prefix="uca-pilote-"))
    env = dict(os.environ, MYUCA_NOPAUSE="1", MYUCA_NOLAUNCH="1", MYUCA_REGKEY=TEST_KEY, LOCALAPPDATA=str(tmp / "local data"), APPDATA=str(tmp / "roaming"))
    try:
        ext = tmp / "mon extension"
        old_extension(ext)
        dl = tmp / "Downloads"
        dl.mkdir()
        bat = dl / "maj-extension.bat"
        shutil.copy(ROOT / "extension" / "maj-extension.bat", bat)
        r = sh(["cmd", "/c", str(bat), str(ext)], env)
        check("Windows : 1er lancement, mise à jour et message d'installation du pilote", r.returncode == 0 and "Pilote installe" in r.stdout and version(ext) != "1.0.0", (r.stdout + r.stderr)[-500:])
        pilot = tmp / "local data" / "MyUCA"  # espace dans le chemin : cas réel
        check("Windows : une seule copie du pilote dans un dossier fixe", (pilot / "maj-extension.bat").read_bytes() == bat.read_bytes() and (pilot / "lancer.ps1").exists())
        command = ps(f"(Get-ItemProperty '{TEST_KEY}\\shell\\open\\command').'(default)'")
        proto = ps(f"(Get-ItemProperty '{TEST_KEY}').PSObject.Properties.Name -contains 'URL Protocol'")
        check("Windows : lien uca-maj: enregistré (utilisateur courant seulement)", proto == "True" and "lancer.ps1" in command and "-File" in command and command.endswith('"%1"'), command)
        shutil.rmtree(dl)  # le fichier téléchargé ne sert plus

        def open_link(link, extra=None):
            # reproduit Windows : %1 remplacé par le lien dans la commande enregistrée, sans interpréteur de commandes
            return subprocess.run(command.replace("%1", link), env=dict(env, **(extra or {})), capture_output=True, stdin=subprocess.DEVNULL, text=True, encoding="utf-8", errors="replace", timeout=240)

        for link, expected in (("uca-maj:chrome", "[/browser chrome]"), ("uca-maj://edge/", "[/browser edge]"), ("uca-maj:firefox", "[/browser firefox]")):
            out = open_link(link, {"MYUCA_DRYRUN": "1"}).stdout.strip()
            check(f"Windows : {link} -> {expected}", out == expected, out)
        ident = "abcdefghijklmnopabcdefghijklmnop"
        out = open_link("uca-maj:chrome/" + ident, {"MYUCA_DRYRUN": "1"}).stdout.strip()
        check("Windows : le lien transmet l'identifiant de l'extension (32 lettres a-p)", out == "[/browser chrome /id " + ident + "]", out)
        out = open_link("uca-maj:chrome/" + ident[:-1] + "z", {"MYUCA_DRYRUN": "1"}).stdout.strip()
        check("Windows : identifiant de forme incorrecte : rien n'est transmis", out == "[]", out)
        outs = {link: open_link(link, {"MYUCA_DRYRUN": "1"}).stdout.strip() for link in BAD_LINKS}
        check("Windows : un lien piégé ne transmet rien (et aucun lien ne peut demander le mode sans fenêtre)", all(o == "[]" for o in outs.values()), str(outs))
        old_extension(ext)
        # MYUCA_AUTO : remplace ici le clic sur « Valider » dans les fenêtres que le pilote affiche en vrai.
        r = open_link("uca-maj:chrome", {"MYUCA_AUTO": "1", "MYUCA_NOPAUSE": "1"})
        check("Windows : lancement par le lien, sans fichier téléchargé : extension mise à jour", r.returncode == 0 and version(ext) != "1.0.0", (r.stdout + r.stderr)[-500:])
        r = sh(["cmd", "/c", str(pilot / "maj-extension.bat"), "/desinstaller"], env)
        gone = ps(f"Test-Path '{TEST_KEY}'")
        check("Windows : /desinstaller retire le lien et le lanceur", r.returncode == 0 and gone == "False" and not (pilot / "lancer.ps1").exists(), r.stdout[-300:])
    finally:
        ps(f"Remove-Item '{TEST_KEY}' -Recurse -Force -ErrorAction SilentlyContinue")
        shutil.rmtree(tmp, ignore_errors=True)
    real_after = ps(r"(Get-ItemProperty 'HKCU:\Software\Classes\uca-maj\shell\open\command' -ErrorAction SilentlyContinue).'(default)'")
    check("Windows : le vrai enregistrement de ce PC n'a pas été touché", real_before == real_after)


def linux():
    bash = shutil.which("bash") if os.name != "nt" else r"C:\Program Files\Git\bin\bash.exe"
    if not bash or not Path(bash).exists():
        print("ignoré : bash introuvable")
        return
    tmp = Path(tempfile.mkdtemp(prefix="uca-pilote-sh-"))

    def posix(p):
        s = str(p).replace("\\", "/")
        return "/" + s[0].lower() + s[2:] if os.name == "nt" else s

    env = dict(os.environ, UCA_FAKE_OS="Linux", UCA_NOLAUNCH="1", HOME=posix(tmp / "home"), XDG_CONFIG_HOME=posix(tmp / "home" / ".config"), XDG_DATA_HOME=posix(tmp / "home" / ".local" / "share"))
    try:
        ext = tmp / "mon extension"
        old_extension(ext)
        script = tmp / "maj-extension.sh"
        shutil.copy(ROOT / "extension" / "maj-extension.sh", script)
        r = sh([bash, posix(script), "--yes", posix(ext)], env)
        pilot = tmp / "home" / ".local" / "share" / "MyUCA"
        desktop = tmp / "home" / ".local" / "share" / "applications" / "uca-maj.desktop"
        check("Linux : 1er lancement, mise à jour et pilote installé", r.returncode == 0 and version(ext) != "1.0.0" and (pilot / "maj-extension.sh").exists(), (r.stdout + r.stderr)[-500:])
        d = desktop.read_text(encoding="utf-8") if desktop.exists() else ""
        check("Linux : lien uca-maj: déclaré (fichier .desktop de l'utilisateur)", "x-scheme-handler/uca-maj" in d and "lancer.sh" in d, d)

        def dry(link):
            return sh([bash, posix(pilot / "lancer.sh"), link], dict(env, UCA_DRYRUN="1")).stdout.strip()

        check("Linux : uca-maj:brave -> --browser brave, avec fenêtres", dry("uca-maj:brave") == "[--browser brave]", dry("uca-maj:brave"))
        outs = {link: dry(link) for link in BAD_LINKS}
        check("Linux : un lien piégé ne transmet rien", all(o == "[]" for o in outs.values()), str(outs))
        r = sh([bash, posix(pilot / "maj-extension.sh"), "--desinstaller"], env)
        check("Linux : --desinstaller retire le pilote", r.returncode == 0 and not desktop.exists() and not (pilot / "lancer.sh").exists(), r.stdout[-300:])
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


SPY = """() => {
  window.__links = []; window.__downloads = [];
  const real = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    if (String(this.href).startsWith('uca-maj:')) { window.__links.push(this.href); return; }
    if (this.download) { window.__downloads.push(this.download); return; }
    return real.call(this);
  };
  const f = window.fetch.bind(window);
  window.__disk = null;
  window.fetch = (u, o) => {
    if (String(u).includes('kiricoucou.github.io')) return Promise.resolve(new Response('pilote'));
    if (window.__disk && String(u).endsWith('manifest.json')) return Promise.resolve(new Response(JSON.stringify({ version: window.__disk })));
    return f(u, o);
  };
}"""


def extension():
    with sync_playwright() as p:
        ctx, sw, base = launch(p, viewport={"width": 1200, "height": 900})
        errors = []
        try:
            page = ctx.new_page()
            page.on("pageerror", lambda e: errors.append(str(e)))
            page.goto(f"{base}/settings.html")
            page.wait_for_timeout(2500)
            sw.evaluate("() => { globalThis.fetch = () => Promise.reject(new Error('hors ligne')); }")
            sw.evaluate("() => chrome.storage.local.remove(['uca_pilot_ok', 'uca_pilot_pending'])")
            sw.evaluate("() => chrome.storage.local.set({ uca_latest_version: '99.0.0', uca_update_available: true })")
            page.wait_for_selector("#ucaGateApply")

            def get(key):
                return sw.evaluate("(k) => chrome.storage.local.get(k).then(d => d[k] === undefined ? null : d[k])", key)

            page.evaluate(SPY)
            page.click("#ucaGateApply")
            page.wait_for_timeout(1200)
            n = page.evaluate("() => [window.__downloads, window.__links]")
            check("extension, 1re fois : un seul fichier téléchargé, aucun lancement", len(n[0]) == 1 and n[0][0].startswith("maj-extension.") and not n[1], str(n))
            check("extension : version avant téléchargement mémorisée", get("uca_pilot_pending") is not None)

            sw.evaluate("() => chrome.storage.local.set({ uca_pilot_ok: true })")
            page.reload()
            page.wait_for_selector("#ucaGateApply")
            page.evaluate(SPY)
            for _ in range(3):
                page.click("#ucaGateApply")
                page.wait_for_timeout(500)
            n = page.evaluate("() => [window.__downloads, window.__links]")
            check("extension, pilote installé : lancé par uca-maj:<navigateur>, aucun téléchargement (3 clics)", not n[0] and len(n[1]) == 3 and n[1][0].split("/")[0] in ("uca-maj:chrome", "uca-maj:edge") and len(n[1][0].split("/")[1]) == 32, str(n))
            check("extension : lien de secours « Réinstaller le pilote »", "Réinstaller le pilote" in page.inner_text("#ucaUpdateGate"))
            page.click("text=Réinstaller le pilote")
            page.wait_for_timeout(900)
            n = page.evaluate("() => window.__downloads")
            check("extension : réinstaller télécharge une fois et oublie l'ancien état", len(n) == 1 and get("uca_pilot_ok") is None, str(n))

            # la version sur le disque avance (pilote terminé) : détectée et extension rechargée
            sw.evaluate("() => chrome.storage.local.set({ uca_pilot_ok: true })")
            page.evaluate("() => { window.__reloaded = 0; chrome.runtime.reload = () => { window.__reloaded++; }; }")
            page.click("#ucaGateApply")
            page.wait_for_timeout(500)
            page.evaluate("() => { window.__disk = '99.0.0'; }")
            page.wait_for_function("() => window.__reloaded > 0", timeout=12000)
            check("extension : nouvelle version détectée sur le disque, rechargement automatique", "Mise à jour détectée (99.0.0)" in page.inner_text("#ucaUpdateGate"))
            page.evaluate("() => { window.__links.length = 0; window.__reloaded = 0; }")
            page.click("#ucaGateApply")
            page.wait_for_timeout(600)
            check("extension : fichiers déjà à jour : recharge directement, sans lancer le pilote", page.evaluate("() => window.__reloaded > 0 && window.__links.length === 0"))

            # après une vraie mise à jour : le pilote téléchargé est considéré comme installé
            sw.evaluate("() => chrome.storage.local.remove('uca_pilot_ok')")
            sw.evaluate("() => chrome.storage.local.set({ uca_pilot_pending: '0.0.1' })")
            page.reload()
            page.wait_for_timeout(1500)
            check("extension : version avancée après téléchargement : pilote noté comme installé", get("uca_pilot_ok") is True and get("uca_pilot_pending") is None)
            check("extension : aucune erreur JavaScript", not errors, "; ".join(errors)[:200])
        finally:
            ctx.close()


def main():
    windows()
    linux()
    extension()
    print(f"\n{sum(results)}/{len(results)} vérifications OK")
    sys.exit(0 if all(results) else 1)


if __name__ == "__main__":
    main()
