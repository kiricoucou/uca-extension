"""Lancement de Chromium avec l'extension chargée (Playwright)."""
import json
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def designs():
    return json.loads((ROOT / "designs" / "designs.json").read_text(encoding="utf-8"))


def launch(p, **kw):
    ctx = p.chromium.launch_persistent_context(
        tempfile.mkdtemp(), headless=False,
        args=["--headless=new", f"--disable-extensions-except={ROOT}", f"--load-extension={ROOT}"], **kw)
    sw = ctx.service_workers[0] if ctx.service_workers else ctx.wait_for_event("serviceworker")
    return ctx, sw, "chrome-extension://" + sw.url.split("/")[2]
