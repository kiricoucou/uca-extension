"""Vérifie le scénario exact rapporté par l'utilisateur : depuis l'app web (PWA, servie comme sur
GitHub Pages, PAS chrome-extension://), avec la vraie extension installée dans le même navigateur
(pont content-bridge.js / core/env.js réel, pas simulé), cliquer « Synchroniser » doit ouvrir une
vraie fenêtre de connexion CAS quand la session est expirée — exactement comme depuis l'extension
seule (voir tests/cas_login_window.py). Si ce test passe, le mécanisme bout en bout fonctionne et
un éventuel « pas de fenêtre » constaté par l'utilisateur vient de l'extension absente/inactive
dans le navigateur utilisé pour l'app, pas d'un bug de code.

Sécurité réseau : même protection que cas_login_window.py (host-resolver-rules + certificat
jetable local) — odin.iut.uca.fr et ent.uca.fr ne sont jamais contactés pour de vrai.

Usage : python -I -X utf8 tests/cas_login_window_app.py
"""
import socket
import ssl
import subprocess
import sys
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).resolve().parent))
from fixtures import seed  # noqa: E402
from harness import ROOT as REPO  # noqa: E402

OUT = REPO / "tests" / ".out"
results = []


def check(name, ok, detail=""):
    ok = bool(ok)
    results.append(ok)
    print(("PASS " if ok else "FAIL ") + name + (f" — {detail}" if detail and not ok else ""))


FAKE_CAS_HTML = """<!doctype html><html><head><meta charset="utf-8"><title>Connexion (page de test, pas le vrai CAS)</title>
</head><body><h2>CAS — Connexion (simulation de test, scénario app)</h2></body></html>"""


class FakeOdinCas(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def do_GET(self):
        if self.path.startswith("/etudiants") or self.path.startswith("/portail") or self.path.startswith("/warmup"):
            if "warmup" in self.path:
                self.send_response(200); self.send_header("Content-Type", "text/plain"); self.end_headers(); self.wfile.write(b"ok"); return
            self.send_response(302)
            self.send_header("Location", "https://ent.uca.fr/cas/login?service=x")
            self.end_headers()
            return
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.end_headers()
        self.wfile.write(FAKE_CAS_HTML.encode("utf-8"))


def free_port():
    s = socket.socket(); s.bind(("127.0.0.1", 0)); port = s.getsockname()[1]; s.close(); return port


def make_cert(tmp):
    key = tmp / "key.pem"; crt = tmp / "cert.pem"
    subprocess.run(
        ["openssl", "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", str(key), "-out", str(crt),
         "-days", "1", "-subj", "/CN=test-local", "-addext",
         "subjectAltName=DNS:ent.uca.fr,DNS:odin.iut.uca.fr"],
        check=True, capture_output=True,
    )
    return key, crt


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp_s:
        tmp = Path(tmp_s)
        key, crt = make_cert(tmp)
        fake_port = free_port()
        httpd = ThreadingHTTPServer(("127.0.0.1", fake_port), FakeOdinCas)
        ctxssl = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        ctxssl.load_cert_chain(str(crt), str(key))
        httpd.socket = ctxssl.wrap_socket(httpd.socket, server_side=True)
        threading.Thread(target=httpd.serve_forever, daemon=True).start()

        # Sert le dépôt lui-même sur 127.0.0.1 (dans les "matches" de content_scripts, comme
        # tests/bridge.py) pour que content-bridge.js s'injecte réellement sur cette "app".
        app_port = free_port()
        app_server = subprocess.Popen(
            [sys.executable, "-m", "http.server", str(app_port), "--bind", "127.0.0.1", "--directory", str(REPO)],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

        rule = f"MAP odin.iut.uca.fr:443 127.0.0.1:{fake_port},MAP ent.uca.fr:443 127.0.0.1:{fake_port}"
        import time; time.sleep(1)
        try:
            with sync_playwright() as p:
                ctx = p.chromium.launch_persistent_context(
                    tempfile.mkdtemp(), headless=False,
                    args=["--headless=new", f"--disable-extensions-except={REPO}", f"--load-extension={REPO}",
                          f"--host-resolver-rules={rule}", "--ignore-certificate-errors"],
                    viewport={"width": 390, "height": 844},
                )
                sw = ctx.service_workers[0] if ctx.service_workers else ctx.wait_for_event("serviceworker")

                warm = ctx.new_page()
                for host in ("https://odin.iut.uca.fr/warmup", "https://ent.uca.fr/warmup"):
                    try:
                        warm.goto(host, timeout=8000)
                    except Exception:
                        pass
                warm.close()

                base = f"http://127.0.0.1:{app_port}/"
                data = seed(); data["uca_design"] = "anime"

                page = ctx.new_page()
                page.on("pageerror", lambda e: print("PAGEERROR", e))
                # Premier chargement : installe le shim chrome.* hors extension (core/env.js). On y
                # dépose les données de test dans SON stockage (localStorage, pas celui de
                # l'extension — deux origines distinctes), puis on recharge pour qu'elles soient lues.
                page.goto(base + "designs/anime/agenda.html")
                page.wait_for_timeout(600)
                page.evaluate("(d) => new Promise(r => chrome.storage.local.set(d, r))", data)
                page.goto(base + "designs/anime/agenda.html")
                page.wait_for_timeout(1200)

                ready = page.evaluate("() => window.UCA_APP && window.UCA_APP.extensionReady")
                check("extension détectée par l'app (vrai content-bridge.js)", ready is True, str(ready))

                page.locator("#menuBtn").wait_for(state="visible", timeout=15000)
                page.locator("#menuBtn").click()
                page.wait_for_timeout(300)
                label = page.locator("#mobileMenu .msync").inner_text()
                check("bouton « Synchroniser » (pas « Importer ») : extension détectée", "Synchroniser" in label, label)

                with ctx.expect_page(timeout=20000) as new_page_info:
                    page.locator("#mobileMenu .msync").click()
                login_page = new_page_info.value
                login_page.wait_for_load_state()

                check("une fenêtre de connexion CAS s'est ouverte depuis l'app (bout en bout)", True)
                check("elle pointe vers CAS (ent.uca.fr)", "ent.uca.fr" in login_page.url, login_page.url)

                login_page.screenshot(path=str(OUT / "cas_login_window_app.png"))

                try:
                    sw.evaluate("() => chrome.runtime.sendMessage({ type: 'UCA_LOGIN_DONE' })")
                except Exception:
                    pass
                page.wait_for_timeout(300)
                login_page.close()
                page.close()
                ctx.close()
        finally:
            app_server.terminate()
        httpd.shutdown()

    print(f"\n{sum(results)}/{len(results)} vérifications OK")
    print(f"Capture : {OUT / 'cas_login_window_app.png'}")
    sys.exit(0 if all(results) else 1)


if __name__ == "__main__":
    main()
