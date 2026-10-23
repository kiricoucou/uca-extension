"""Image de partage du site (aperçu des liens : Discord, messageries, réseaux) : app/icons/og-image.png, 1200x630.
Dessinée localement depuis un petit gabarit HTML ; l'icône vient de app/icons/icon-512.png.
Usage : python -I -X utf8 tests/gen_og.py
"""
import base64
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
icon = base64.b64encode((ROOT / "app" / "icons" / "icon-512.png").read_bytes()).decode()
PAGE = f"""<!doctype html><meta charset="utf-8"><style>
*{{box-sizing:border-box}}body{{margin:0;width:1200px;height:630px;font-family:"Segoe UI",system-ui,sans-serif;color:#fff;
background:radial-gradient(1000px 520px at 85% 0%,#2f7cf6 0%,transparent 60%),linear-gradient(135deg,#0b2f73,#0b57d0);display:flex;align-items:center;padding:0 84px;gap:64px}}
.logo{{width:260px;height:260px;border-radius:64px;box-shadow:0 24px 60px rgba(0,0,0,.35);flex:none}}
h1{{font-size:76px;line-height:1.04;margin:0 0 18px;letter-spacing:-.02em}}
p{{font-size:34px;line-height:1.3;margin:0 0 28px;opacity:.92}}
.chips{{display:flex;gap:14px;flex-wrap:wrap}}
.chip{{font-size:26px;font-weight:600;padding:10px 22px;border-radius:999px;background:rgba(255,255,255,.16);border:1px solid rgba(255,255,255,.3)}}
.tag{{position:absolute;right:56px;bottom:40px;font-size:24px;opacity:.8}}
</style><img class="logo" src="data:image/png;base64,{icon}" alt="">
<div><h1>Emploi du temps UCA</h1><p>Ton emploi du temps d'Odin, tes notes et tes devoirs, lisibles partout.</p>
<div class="chips"><span class="chip">Extension</span><span class="chip">App téléphone</span><span class="chip">Agenda en ligne</span></div></div>
<div class="tag">Projet étudiant non officiel · aucune donnée envoyée</div>"""

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 1200, "height": 630})
    pg.set_content(PAGE)
    pg.wait_for_timeout(300)
    pg.screenshot(path=str(ROOT / "app" / "icons" / "og-image.png"))
    b.close()
print("app/icons/og-image.png (1200x630)")
