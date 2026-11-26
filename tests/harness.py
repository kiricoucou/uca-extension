"""Lancement de Chromium avec l'extension chargée (Playwright)."""
import json
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


# Jamais de contact avec les vrais serveurs depuis un test (les sondes de statut de settings.html les visent).
NO_REAL_SERVERS = "--host-resolver-rules=" + ",".join(f"MAP {h} ~NOTFOUND" for h in ("ent.uca.fr", "odin.iut.uca.fr", "moodle.uca.fr", "mail.uca.fr"))


def designs():
    return json.loads((ROOT / "designs" / "designs.json").read_text(encoding="utf-8"))


def launch(p, ext=None, **kw):
    """ext : dossier de l'extension à charger (par défaut le dépôt ; tests/store.py y met le paquet des magasins)."""
    ext = ext or ROOT
    ctx = p.chromium.launch_persistent_context(
        tempfile.mkdtemp(), headless=False,
        args=["--headless=new", NO_REAL_SERVERS, f"--disable-extensions-except={ext}", f"--load-extension={ext}"], **kw)
    sw = ctx.service_workers[0] if ctx.service_workers else ctx.wait_for_event("serviceworker")
    # Le pont (content-bridge.js) est inerte hors site officiel sans ce drapeau (sécurité) : les tests tournent sur 127.0.0.1.
    sw.evaluate("() => chrome.storage.local.set({ uca_dev_bridge: true, uca_usage: { v: 'both', at: 1 } })")   # la question « Odin / Moodle ? » de la première connexion ne gêne pas les tests (voir tests/usage_question.py)
    return ctx, sw, "chrome-extension://" + sw.url.split("/")[2]
