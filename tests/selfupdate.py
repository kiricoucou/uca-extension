"""Mise à jour automatique de l'extension (dossier autorisé une fois) : téléchargement du ZIP, écriture dans le dossier
(manifest.json en dernier), rechargement ; refus des chemins hors dossier ; bouton du verrou « Télécharger et appliquer ».
Le dossier est simulé par OPFS (même interface FileSystemDirectoryHandle que showDirectoryPicker).

Usage : python -I -X utf8 tests/selfupdate.py
"""
import base64
import io
import json
import sys
import time
import zipfile
from pathlib import Path
from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).resolve().parent))
from harness import ROOT, launch  # noqa: E402

results = []


def check(name, ok, detail=""):
    results.append(bool(ok))
    print(("PASS " if ok else "FAIL ") + name + (f" — {detail}" if detail and not ok else ""))


STUB = """() => {
  globalThis.__real = globalThis.__real || globalThis.fetch;
  globalThis.fetch = (u, o) => String(u).includes('raw.githubusercontent.com') && String(u).endsWith('manifest.json') || String(u).includes('raw.githubusercontent.com/kiricoucou/uca-extension/main/manifest.json')
    ? Promise.resolve(new Response(JSON.stringify({ version: '99.0.0' }), { status: 200 })) : globalThis.__real(u, o);
  chrome.tabs.create = async () => ({});
}"""

RUN = """async ([b64, mode]) => {
  const bin = atob(b64), a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
  const SU = window.UCA_SELFUPDATE;
  const root = await navigator.storage.getDirectory();
  if (mode === 'prepare') {
    try { await root.removeEntry('ext', { recursive: true }); } catch (e) {}
    const dir = await root.getDirectoryHandle('ext', { create: true });
    const w = await (await dir.getFileHandle('manifest.json', { create: true })).createWritable();
    await w.write(JSON.stringify({ name: 'Emploi du temps UCA (test)', version: '1.0.0' })); await w.close();
    const p = await (await dir.getFileHandle('fichier-perso.txt', { create: true })).createWritable(); await p.write('à garder'); await p.close();
    return 'ok';
  }
  const dir = await root.getDirectoryHandle('ext');
  const progress = [];
  const v = await SU.run({ interactive: mode === 'interactive', pick: async () => dir, getPackage: async () => a.buffer, onProgress: (n, t, l) => progress.push([n, t]) });
  async function has(path) { try { let d = dir; const parts = path.split('/'); const f = parts.pop(); for (const p of parts) d = await d.getDirectoryHandle(p); await d.getFileHandle(f); return true; } catch (e) { return false; } }
  const man = JSON.parse(await (await (await dir.getFileHandle('manifest.json')).getFile()).text());
  const perso = await (await (await dir.getFileHandle('fichier-perso.txt')).getFile()).text();
  return { v, manifest: man.version, perso, background: await has('background.js'), core: await has('core/selfupdate.js'), designs: await has('designs/studio/agenda.html'), bat: await has('maj-extension.bat'),
           last: progress.length ? progress[progress.length - 1] : null, saved: await SU.hasFolder() };
}"""


def main():
    zpath = ROOT / "extension" / "uca-extension-chrome.zip"
    zbytes = zpath.read_bytes()
    want = json.loads(zipfile.ZipFile(io.BytesIO(zbytes)).read("manifest.json"))["version"]
    b64 = base64.b64encode(zbytes).decode()
    evil = io.BytesIO()
    with zipfile.ZipFile(evil, "w") as z:
        z.writestr("manifest.json", json.dumps({"name": "UCA", "version": "9.9.9"})); z.writestr("../evil.txt", "x")
    evil64 = base64.b64encode(evil.getvalue()).decode()
    nouca = io.BytesIO()
    with zipfile.ZipFile(nouca, "w") as z:
        z.writestr("manifest.json", json.dumps({"name": "Autre chose", "version": "9.9.9"}))
    nouca64 = base64.b64encode(nouca.getvalue()).decode()

    with sync_playwright() as p:
        ctx, sw, base = launch(p, viewport={"width": 1200, "height": 800})
        try:
            sw.evaluate(STUB)
            page = ctx.new_page(); errors = []
            page.on("pageerror", lambda e: errors.append(str(e)))
            page.goto(f"{base}/settings.html"); page.wait_for_timeout(900)
            check("selfupdate chargé et pris en charge par le navigateur", page.evaluate("() => !!window.UCA_SELFUPDATE && UCA_SELFUPDATE.supported(true)"))
            page.evaluate(RUN, [b64, "prepare"])
            r = page.evaluate(RUN, [b64, "interactive"])
            check("1re mise à jour (choix du dossier) : version appliquée = version du ZIP", r["v"] == want and r["manifest"] == want, str(r))
            check("fichiers nouveaux écrits (code, core/, designs/studio/, script .bat)", r["background"] and r["core"] and r["designs"] and r["bat"], str(r))
            check("fichier personnel du dossier conservé", r["perso"] == "à garder")
            check("progression jusqu'au dernier fichier", r["last"] and r["last"][0] == r["last"][1], str(r["last"]))
            check("dossier mémorisé pour les fois suivantes", r["saved"] is True)
            page.evaluate(RUN, [b64, "prepare"])
            page.evaluate("async () => { const root = await navigator.storage.getDirectory(); await UCA_SELFUPDATE.forget(); }")
            page.evaluate(RUN, [b64, "interactive"])
            page.evaluate(RUN, [b64, "prepare"])
            # mode silencieux (sans clic) : utilise le dossier mémorisé si l'autorisation est encore là
            page.evaluate("async () => { const root = await navigator.storage.getDirectory(); const d = await root.getDirectoryHandle('ext'); const { UCA_SELFUPDATE: S } = window; await (async () => { const db = await new Promise((res) => { const q = indexedDB.open('uca_selfupdate', 1); q.onsuccess = () => res(q.result); }); await new Promise((res) => { const t = db.transaction('kv', 'readwrite'); t.objectStore('kv').put(d, 'dir'); t.oncomplete = res; }); })(); }")
            r2 = page.evaluate(RUN, [b64, "silent"])
            check("mise à jour silencieuse (sans clic) quand le dossier est déjà autorisé", r2["v"] == want and r2["manifest"] == want, str(r2))
            # sécurité
            bad = page.evaluate("""async (b64) => { const bin = atob(b64), a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
              const root = await navigator.storage.getDirectory(); const dir = await root.getDirectoryHandle('ext');
              try { await UCA_SELFUPDATE.applyZip(dir, a.buffer); return 'écrit'; } catch (e) { return String(e.message); } }""", evil64)
            check("ZIP avec un chemin « ../ » refusé avant toute écriture", "suspect" in bad, bad)
            bad2 = page.evaluate("""async (b64) => { const bin = atob(b64), a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
              const root = await navigator.storage.getDirectory(); const dir = await root.getDirectoryHandle('ext');
              try { await UCA_SELFUPDATE.applyZip(dir, a.buffer); return 'écrit'; } catch (e) { return String(e.message); } }""", nouca64)
            check("paquet qui n'est pas l'extension UCA refusé", "UCA" in bad2, bad2)
            check("ZIP illisible refusé", "ZIP" in page.evaluate("async () => { try { await UCA_SELFUPDATE.readZip(new Uint8Array(100).buffer); return ''; } catch (e) { return e.message; } }"))
            check("aucune erreur JavaScript", not errors, "; ".join(errors)[:200])
            page.evaluate("() => UCA_SELFUPDATE.forget()")
            page.close()

            # le bouton du verrou télécharge et applique (sans ouvrir de lien)
            sw.evaluate("() => checkForUpdate()"); time.sleep(0.8)
            time.sleep(1.5); sw.evaluate(STUB); sw.evaluate("() => checkForUpdate()"); time.sleep(0.8)
            page = ctx.new_page(); page.goto(f"{base}/settings.html"); page.wait_for_timeout(1200)
            check("verrou affiché avec le bouton « Télécharger et appliquer »", "Télécharger et appliquer" in page.evaluate("() => (document.getElementById('ucaUpdateGate') || { innerText: '' }).innerText"))
            page.evaluate("""() => { window.__calls = []; window.__reloaded = false; UCA_SELFUPDATE.run = async (o) => { window.__calls.push(!!o.interactive); o.onProgress && o.onProgress(3, 10, 'x'); return '99.0.0'; }; chrome.runtime.reload = () => { window.__reloaded = true; }; }""")
            page.locator("#ucaUpdateGate button", has_text="Télécharger et appliquer").click(); page.wait_for_timeout(1200)
            st = page.evaluate("() => [window.__calls, window.__reloaded, document.getElementById('ucaGateStatus').innerText]")
            check("clic : lance la mise à jour (interactive), pas l'ouverture d'un lien", st[0] == [True], str(st))
            check("après succès : message puis rechargement de l'extension", "Mise à jour installée" in st[2] and st[1] is True, str(st))
            page.close()
        finally:
            ctx.close()
    ok = sum(results)
    print(f"\n{ok}/{len(results)} vérifications OK")
    sys.exit(0 if ok == len(results) else 1)


if __name__ == "__main__":
    main()
