"""Vérifie, avec la VRAIE extension (Playwright, pas de simulation), que la fenêtre de connexion
CAS s'ouvre réellement quand la session est expirée et que l'utilisateur clique « Synchroniser ».

Sécurité : odin.iut.uca.fr et ent.uca.fr ne doivent JAMAIS être contactés pour de vrai pendant ce
test (c'est le serveur de production de l'université). ctx.route() seul ne suffit pas : il laisse
passer la requête de document principal d'un nouvel onglet avant de s'attacher (constaté : du vrai
trafic est parti vers ent.uca.fr lors de la mise au point de ce test). On utilise donc
--host-resolver-rules de Chromium, qui réécrit la résolution DNS AVANT toute tentative de connexion
réseau (aucune requête ne peut sortir vers le vrai serveur, par construction, pas par course), vers
un petit serveur HTTPS local (certificat auto-signé jetable, --ignore-certificate-errors pour cette
instance de test uniquement).

Capture d'écran dans tests/.out/cas_login_window.png pour relecture visuelle.
Usage : python -I -X utf8 tests/cas_login_window.py
"""
import socket
import ssl
import subprocess
import sys
import tempfile
import threading
import time
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


# Odin (page EDT) sans session : sert une redirection vers la fausse page CAS, comme le ferait un
# vrai service CAS. Tout le reste de ent.uca.fr sert une page de connexion factice reconnaissable.
FAKE_CAS_HTML = """<!doctype html><html><head><meta charset="utf-8"><title>Connexion (page de test, pas le vrai CAS)</title>
<style>body{font-family:sans-serif;background:#0b2e4f;color:#fff;display:flex;align-items:center;
justify-content:center;height:100vh;margin:0}
.card{background:#fff;color:#111;padding:28px 32px;border-radius:10px;max-width:380px;text-align:center}
input{display:block;width:100%;margin:8px 0;padding:8px;box-sizing:border-box}
button{padding:8px 18px;background:#0b57d0;color:#fff;border:none;border-radius:6px;cursor:pointer}
</style></head><body><div class="card"><h2>CAS — Connexion (simulation de test)</h2>
<p>Fausse page CAS servie localement par le test ; ni DNS ni réseau ne sortent vers le vrai ent.uca.fr
(host-resolver-rules de Chromium réécrit la résolution du nom avant toute connexion).</p>
<input placeholder="Identifiant"><input type="password" placeholder="Mot de passe">
<button id="go">Se connecter</button></div></body></html>"""


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def do_GET(self):
        if self.path.startswith("/etudiants") or self.path.startswith("/portail"):
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
        port = free_port()
        httpd = ThreadingHTTPServer(("127.0.0.1", port), Handler)
        ctxssl = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        ctxssl.load_cert_chain(str(crt), str(key))
        httpd.socket = ctxssl.wrap_socket(httpd.socket, server_side=True)
        threading.Thread(target=httpd.serve_forever, daemon=True).start()

        rule = f"MAP odin.iut.uca.fr:443 127.0.0.1:{port},MAP ent.uca.fr:443 127.0.0.1:{port}"
        with sync_playwright() as p:
            ctx = p.chromium.launch_persistent_context(
                tempfile.mkdtemp(), headless=False,
                args=["--headless=new", f"--disable-extensions-except={REPO}", f"--load-extension={REPO}",
                      f"--host-resolver-rules={rule}", "--ignore-certificate-errors"],
                viewport={"width": 390, "height": 844},
            )
            sw = ctx.service_workers[0] if ctx.service_workers else ctx.wait_for_event("serviceworker")
            base = "chrome-extension://" + sw.url.split("/")[2]

            # Préchauffe la pile réseau locale (cert/connexion) avant le vrai scénario : évite une
            # course observée au point au point une fois sur deux sans elle.
            warm = ctx.new_page()
            for host in ("https://odin.iut.uca.fr/warmup", "https://ent.uca.fr/warmup"):
                try:
                    warm.goto(host, timeout=8000)
                except Exception:
                    pass
            warm.close()

            data = seed(); data["uca_design"] = "anime"
            sw.evaluate("(d) => chrome.storage.local.set(d)", data)

            page = ctx.new_page()
            page.goto(f"{base}/designs/anime/agenda.html")
            page.wait_for_timeout(800)
            page.locator("#menuBtn").click()
            page.wait_for_timeout(300)

            with ctx.expect_page(timeout=20000) as new_page_info:
                page.locator("#mobileMenu .msync").click()
            login_page = new_page_info.value
            login_page.wait_for_load_state()

            check("une fenêtre de connexion s'est ouverte au clic sur Synchroniser (session expirée)", True)
            check("elle pointe vers CAS (ent.uca.fr)", "ent.uca.fr" in login_page.url, login_page.url)
            check("le contenu de la page de connexion (locale, test) est affiché",
                  "page de test" in login_page.title(), login_page.title())

            login_page.screenshot(path=str(OUT / "cas_login_window.png"))

            # "J'y suis" : débloque l'attente côté background, sinon le verrou de synchro reste pris
            # jusqu'à LOGIN_WAIT_MS (15 min).
            sw.evaluate("() => chrome.runtime.sendMessage({ type: 'UCA_LOGIN_DONE' })")
            page.wait_for_timeout(300)

            login_page.close()
            page.close()
            ctx.close()
        httpd.shutdown()

    print(f"\n{sum(results)}/{len(results)} vérifications OK")
    print(f"Capture : {OUT / 'cas_login_window.png'}")
    sys.exit(0 if all(results) else 1)


if __name__ == "__main__":
    main()
