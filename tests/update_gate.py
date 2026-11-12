"""Mise à jour obligatoire : une extension périmée est verrouillée (popup, agenda, paramètres, choix du design, 4 designs),
la fenêtre ne se ferme ni avec Échap, ni en la supprimant, ni en quittant la page puis en revenant ; plus aucune synchro ;
tout se débloque quand la version installée est à jour.

Usage : python -I -X utf8 tests/update_gate.py
"""
import sys
import time
from pathlib import Path
from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).resolve().parent))
from harness import designs, launch  # noqa: E402

results = []


def check(name, ok, detail=""):
    results.append(bool(ok))
    print(("PASS " if ok else "FAIL ") + name + (f" — {detail}" if detail and not ok else ""))


STUB = """() => {
  globalThis.__remote = '99.0.0';
  globalThis.__realFetch = globalThis.__realFetch || globalThis.fetch;
  globalThis.fetch = (u, o) => String(u).includes('raw.githubusercontent.com')
    ? Promise.resolve(new Response(JSON.stringify({ version: globalThis.__remote }), { status: 200 }))
    : globalThis.__realFetch(u, o);
  chrome.tabs.create = async () => ({});
}"""


def gate_visible(page):
    return page.evaluate("() => { const g = document.getElementById('ucaUpdateGate'); if (!g) return false; const r = g.getBoundingClientRect(); return r.width >= innerWidth - 1 && r.height >= innerHeight - 1 && getComputedStyle(g).display !== 'none'; }")


def main():
    with sync_playwright() as p:
        ctx, sw, base = launch(p, viewport={"width": 1200, "height": 800})
        try:
            sw.evaluate(STUB)
            time.sleep(2.0); sw.evaluate(STUB); sw.evaluate("() => checkForUpdate()"); sw_wait(ctx)
            cur = sw.evaluate("() => chrome.runtime.getManifest().version")
            d = sw.evaluate("() => chrome.storage.local.get(['uca_latest_version','uca_update_available'])")
            check("version distante simulée (99.0.0) enregistrée", d.get("uca_latest_version") == "99.0.0" and d.get("uca_update_available") is True, str(d))
            pages = [f"{dd['folder']}/{n}.html" for dd in designs() for n in ("popup", "agenda")] + ["settings.html", "choose.html"]
            for path in pages:
                page = ctx.new_page(); errors = []
                page.on("pageerror", lambda e: errors.append(str(e)))
                page.goto(f"{base}/{path}"); page.wait_for_timeout(1200)
                check(f"{path} : fenêtre de mise à jour plein écran", gate_visible(page))
                check(f"{path} : le reste de la page est inerte", page.evaluate("() => [...document.body.children].filter(c => c.id !== 'ucaUpdateGate' && c.tagName !== 'SCRIPT').every(c => c.inert)"))
                page.keyboard.press("Escape"); page.wait_for_timeout(200)
                check(f"{path} : Échap ne la ferme pas", gate_visible(page))
                page.evaluate("() => document.getElementById('ucaUpdateGate').remove()"); page.wait_for_timeout(400)
                check(f"{path} : supprimée du DOM, elle revient", gate_visible(page))
                page.close()
                # on quitte la page puis on revient : la demande est toujours là (nouvelle page, même état)
                page = ctx.new_page(); page.goto(f"{base}/{path}"); page.wait_for_timeout(1000)
                check(f"{path} : en revenant, la demande est toujours là", gate_visible(page))
                check(f"{path} : aucune erreur JavaScript", not errors, "; ".join(errors)[:200])
                page.close()
            # échec réseau : le verrou reste (la dernière version connue n'est jamais effacée)
            sw.evaluate("() => { globalThis.fetch = (u, o) => String(u).includes('raw.githubusercontent.com') ? Promise.reject(new Error('hors ligne')) : globalThis.__realFetch(u, o); }")
            sw.evaluate("() => checkForUpdate()"); sw_wait(ctx)
            page = ctx.new_page(); page.goto(f"{base}/settings.html"); page.wait_for_timeout(1000)
            check("hors ligne : le verrou reste", gate_visible(page))
            page.close()
            # plus aucune synchro tant que périmée
            page = ctx.new_page(); page.goto(f"{base}/settings.html"); page.wait_for_timeout(500)
            got = page.evaluate("""() => new Promise((res) => {
              chrome.runtime.onMessage.addListener((m) => { if (m && m.type === 'UCA_SYNC_RESULT') res(m); });
              chrome.runtime.sendMessage({ type: 'UCA_SYNC_REQUEST', mode: 'resync' });
              setTimeout(() => res(null), 4000);
            })""")
            check("synchro refusée tant que l'extension est périmée", got and got.get("ok") is False and "Mise à jour obligatoire" in (got.get("error") or ""), str(got))
            page.close()
            # à jour : tout est débloqué
            sw.evaluate("() => { globalThis.__remote = chrome.runtime.getManifest().version; globalThis.fetch = (u, o) => String(u).includes('raw.githubusercontent.com') ? Promise.resolve(new Response(JSON.stringify({ version: globalThis.__remote }), { status: 200 })) : globalThis.__realFetch(u, o); }")
            sw.evaluate("() => checkForUpdate()"); sw_wait(ctx)
            page = ctx.new_page(); page.goto(f"{base}/settings.html"); page.wait_for_timeout(1000)
            check("version à jour : plus de verrou", not gate_visible(page) and page.evaluate("() => ![...document.body.children].some(c => c.inert)"))
            page.close()
        finally:
            ctx.close()
    ok = sum(results)
    print(f"\n{ok}/{len(results)} vérifications OK")
    sys.exit(0 if ok == len(results) else 1)


def sw_wait(ctx):
    time.sleep(0.8)


if __name__ == "__main__":
    main()
