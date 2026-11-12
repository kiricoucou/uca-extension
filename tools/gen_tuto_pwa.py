"""Tutoriel « application sur téléphone » (PWA) : captures réelles de l'application dans un navigateur en émulation téléphone (Playwright,
sans toucher à l'écran), posées dans un cadre de téléphone, avec annotations. Les étapes qui montrent l'interface propre au navigateur du
téléphone (menu ⋮, fenêtre « Installer », écran d'accueil Android) ne peuvent pas être capturées sans téléphone : ce sont des illustrations
fidèles, signalées comme telles dans le texte de l'étape.

  python -I -X utf8 tools/gen_tuto_pwa.py
"""
import http.server
import json
import socketserver
import sys
import tempfile
import threading
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "tests"))
from PIL import Image, ImageDraw, ImageFont  # noqa: E402
from playwright.sync_api import sync_playwright  # noqa: E402
from tuto_lib import ROOT, annotate  # noqa: E402

IMG = ROOT / "aide-install" / "img"
STEPS = ROOT / "aide-install" / "steps.json"
PORT = 8794
socketserver.ThreadingTCPServer.allow_reuse_address = True
socketserver.ThreadingTCPServer.daemon_threads = True
BASE = f"http://localhost:{PORT}/"
W, H, DSF = 412, 915, 2
CANVAS = (1280, 900)
RAW = Path(tempfile.mkdtemp(prefix="tuto-pwa-"))
steps = []


def log(*a):
    print(*a, flush=True)


def font(size, bold=True):
    for f in ("segoeuib.ttf" if bold else "segoeui.ttf", "arialbd.ttf"):
        try:
            return ImageFont.truetype(f, size)
        except OSError:
            continue
    return ImageFont.load_default()


def frame(shot_path, out_png, ribbon=None):
    """Pose la capture (824x1830) dans un cadre de téléphone sur un fond clair ; renvoie l'origine (x, y) et l'échelle de l'écran dans le canvas."""
    scr = Image.open(shot_path).convert("RGB")
    ph_h = CANVAS[1] - 50
    sc = (ph_h - 36) / scr.height
    scr = scr.resize((round(scr.width * sc), round(scr.height * sc)), Image.LANCZOS)
    pw, ph = scr.width + 36, scr.height + 36
    bg = Image.new("RGB", CANVAS, (232, 243, 252))
    d = ImageDraw.Draw(bg)
    for i in range(CANVAS[1]):
        c = int(232 + (250 - 232) * i / CANVAS[1])
        d.line((0, i, CANVAS[0], i), fill=(c, 243 + (i * 8 // CANVAS[1]), 252))
    x0, y0 = (CANVAS[0] - pw) // 2, 25
    d.rounded_rectangle((x0 + 6, y0 + 10, x0 + pw + 6, y0 + ph + 10), radius=54, fill=(190, 205, 220))
    d.rounded_rectangle((x0, y0, x0 + pw, y0 + ph), radius=52, fill=(20, 22, 28))
    mask = Image.new("L", scr.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, scr.width, scr.height), radius=36, fill=255)
    bg.paste(scr, (x0 + 18, y0 + 18), mask)
    d.rounded_rectangle((x0 + pw // 2 - 46, y0 + 8, x0 + pw // 2 + 46, y0 + 22), radius=7, fill=(8, 9, 12))
    if ribbon:
        f = font(20)
        tw = d.textlength(ribbon, font=f)
        d.rounded_rectangle((24, 24, 24 + tw + 28, 24 + 40), radius=10, fill=(255, 244, 214), outline=(200, 140, 20), width=2)
        d.text((38, 31), ribbon, fill=(120, 80, 0), font=f)
    bg.save(out_png)
    return x0 + 18, y0 + 18, sc


class Phone:
    def __init__(self, p):
        self.browser = p.chromium.launch()
        self.ctx = self.browser.new_context(viewport={"width": W, "height": H}, device_scale_factor=DSF, is_mobile=True, has_touch=True, locale="fr-FR",
                                            user_agent="Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36")
        self.page = self.ctx.new_page()

    def box(self, selector):
        b = self.page.locator(selector).first.bounding_box()
        return b

    def snap(self, name, marks=(), ribbon=None):
        """marks : [("box", sélecteur ou (x, y, w, h) en px CSS), ("num", n, sélecteur)] -> annotées dans l'image finale."""
        raw = RAW / f"{name}.png"
        self.page.screenshot(path=str(raw))
        framed = RAW / f"{name}-f.png"
        ox, oy, sc = frame(raw, framed, ribbon)

        def to_canvas(b):
            return (ox + b["x"] * DSF * sc, oy + b["y"] * DSF * sc, b["width"] * DSF * sc, b["height"] * DSF * sc)
        ms = []
        n = 0
        for m in marks:
            b = m[1] if isinstance(m[1], dict) else self.box(m[1])
            if not b:
                continue
            x, y, w, h = to_canvas(b)
            ms.append({"box": (x, y, w, h)})
            n += 1
            ms.append({"num": (x - 6, y - 6, m[2] if len(m) > 2 else n)})
        annotate(framed, IMG / f"{name}.webp", ms, max_w=1280)
        log("  image", name)


def step(n, title, what, why, img):
    log("étape", n, title)
    steps.append({"n": n, "title": title, "what": what, "why": why, "img": f"aide-install/img/{img}.webp"})


def mock(p, html, name, sels=(), ribbon="Illustration : écran du navigateur du téléphone"):
    """Rend une maquette HTML (interface du navigateur / du téléphone) dans le même cadre."""
    b = p.chromium.launch()
    pg = b.new_context(viewport={"width": W, "height": H}, device_scale_factor=DSF).new_page()
    pg.set_content(html)
    raw = RAW / f"{name}.png"
    pg.screenshot(path=str(raw))
    boxes = [pg.locator(s).first.bounding_box() for s in sels]
    b.close()
    framed = RAW / f"{name}-f.png"
    ox, oy, sc = frame(raw, framed, ribbon)
    return framed, (ox, oy, sc), boxes


def marks_for(ox, oy, sc, boxes):
    out = []
    for i, bx in enumerate(boxes, 1):
        x, y, w, h = ox + bx["x"] * DSF * sc, oy + bx["y"] * DSF * sc, bx["width"] * DSF * sc, bx["height"] * DSF * sc
        out += [{"box": (x, y, w, h)}, {"num": (x - 6, y - 6, i)}]
    return out


BASE_CSS = "<style>*{box-sizing:border-box}body{margin:0;width:412px;height:915px;font-family:Roboto,'Segoe UI',system-ui,sans-serif;position:relative;overflow:hidden}.sb{display:flex;justify-content:space-between;padding:10px 18px;font-size:13px;font-weight:600}</style>"


def main():
    IMG.mkdir(parents=True, exist_ok=True)
    handler = lambda *a, **k: http.server.SimpleHTTPRequestHandler(*a, directory=str(ROOT), **k)  # noqa: E731
    handler.log_message = lambda *a, **k: None
    srv = socketserver.ThreadingTCPServer(("127.0.0.1", PORT), handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    with sync_playwright() as p:
        ph = Phone(p)
        pg = ph.page
        # 1 : accueil du site
        pg.goto(BASE + "index.html"); pg.wait_for_timeout(1500)
        ph.snap("pwa-01", [("box", ".hero .btns a.btn.primary")])
        step(1, "Ouvre le site sur ton téléphone", "Dans Chrome (Android) ou Safari (iPhone), ouvre kiricoucou.github.io/uca-extension. Le gros bouton bleu « Ouvrir l'agenda en ligne » mène à l'application.", "L'application est une page web : rien à télécharger dans un magasin d'applications.", "pwa-01")
        # 2 : bouton installer l'app
        ph.snap("pwa-02", [("box", ".hero .btns a[href*='install']")] if pg.locator(".hero .btns a[href*='install']").count() else [("box", ".hero .btns a.btn >> nth=1")])
        step(2, "Appuie sur « Installer l'app »", "Sur la page d'accueil, appuie sur « Installer l'app » : un guide adapté à ton téléphone s'ouvre.", "Il te montre les étapes exactes pour ton navigateur (Android ou iPhone).", "pwa-02")
        # 3 : le guide d'installation
        pg.goto(BASE + "app/install.html"); pg.wait_for_timeout(1500)
        ph.snap("pwa-03", [])
        step(3, "Lis le guide d'installation", "Le guide explique comment ajouter l'application à l'écran d'accueil. Les étapes suivantes montrent le chemin sur Android avec Chrome ; sur iPhone, c'est le bouton Partager de Safari puis « Sur l'écran d'accueil ».", "Une fois ajoutée, l'application s'ouvre en plein écran, comme une vraie application.", "pwa-03")
        # 4 : menu de Chrome (illustration)
        html = BASE_CSS + """<body style='background:#fff'><div class='sb'><span>9:41</span><span>5G ▮▮▮ 86%</span></div>
        <div style='height:56px;border-bottom:1px solid #ddd;display:flex;align-items:center;padding:0 12px;gap:10px'><div style='flex:1;background:#f1f3f4;border-radius:22px;padding:10px 16px;font-size:15px'>🔒 kiricoucou.github.io</div><div id='dots' style='font-size:26px;width:40px;text-align:center'>⋮</div></div>
        <div style='padding:24px;color:#555'>Page du site…</div>
        <div style='position:absolute;top:100px;right:10px;width:250px;background:#fff;border-radius:12px;box-shadow:0 6px 24px rgba(0,0,0,.3);padding:8px 0;font-size:16px'>
        <div style='padding:12px 18px'>Nouvel onglet</div><div style='padding:12px 18px'>Historique</div><div style='padding:12px 18px'>Téléchargements</div>
        <div id='inst' style='padding:12px 18px;background:#e8f0fe;font-weight:600'>Installer l'application</div><div style='padding:12px 18px'>Partager…</div><div style='padding:12px 18px'>Paramètres</div></div></body>"""
        framed, (ox, oy, sc), bx = mock(p, html, "pwa-04", sels=["#dots", "#inst"])
        annotate(framed, IMG / "pwa-04.webp", marks_for(ox, oy, sc, bx))
        step(4, "Ouvre le menu ⋮ puis « Installer l'application »", "Appuie sur les trois points ⋮ en haut à droite de Chrome, puis sur « Installer l'application » (parfois « Ajouter à l'écran d'accueil »). Image d'illustration : l'aspect exact dépend de ta version d'Android.", "Cette commande transforme le site en application avec sa propre icône.", "pwa-04")
        # 5 : confirmation (illustration)
        html = BASE_CSS + """<body style='background:rgba(0,0,0,.45)'><div style='position:absolute;left:0;right:0;bottom:0;background:#fff;border-radius:24px 24px 0 0;padding:26px 22px 30px'>
        <div style='display:flex;gap:14px;align-items:center'><div style='width:56px;height:56px;border-radius:14px;background:#0069a4;color:#fff;display:grid;place-items:center;font-weight:800;font-size:18px'>UCA</div>
        <div><div style='font-size:20px;font-weight:700'>Installer l'application ?</div><div style='color:#666;font-size:14px'>My UCA · kiricoucou.github.io</div></div></div>
        <div style='display:flex;justify-content:flex-end;gap:12px;margin-top:26px'><div style='padding:12px 20px;color:#0b57d0;font-weight:600'>Annuler</div><div id='ok' style='padding:12px 24px;background:#0b57d0;color:#fff;border-radius:22px;font-weight:600'>Installer</div></div></div></body>"""
        framed, (ox, oy, sc), bx = mock(p, html, "pwa-05", sels=["#ok"])
        annotate(framed, IMG / "pwa-05.webp", marks_for(ox, oy, sc, bx))
        step(5, "Confirme avec « Installer »", "Une fenêtre te demande de confirmer : appuie sur « Installer ». Image d'illustration.", "L'application est ajoutée en quelques secondes, sans téléchargement lourd.", "pwa-05")
        # 6 : écran d'accueil (illustration)
        html = BASE_CSS + """<body style='background:linear-gradient(160deg,#1e3a5f,#4a7fb5)'><div class='sb' style='color:#fff'><span>9:41</span><span>5G ▮▮▮ 86%</span></div>
        <div style='display:grid;grid-template-columns:repeat(4,1fr);gap:26px 8px;padding:40px 14px;color:#fff;text-align:center;font-size:12px'>
        <div><div style='width:58px;height:58px;margin:0 auto 6px;border-radius:16px;background:#34a853'></div>Messages</div><div><div style='width:58px;height:58px;margin:0 auto 6px;border-radius:16px;background:#ea4335'></div>Photos</div><div><div style='width:58px;height:58px;margin:0 auto 6px;border-radius:16px;background:#fbbc04'></div>Notes</div><div><div style='width:58px;height:58px;margin:0 auto 6px;border-radius:16px;background:#8e24aa'></div>Musique</div>
        <div id='ic'><div style='width:58px;height:58px;margin:0 auto 6px;border-radius:16px;background:#fff;color:#0069a4;display:grid;place-items:center;font-weight:800'>UCA</div>My UCA</div></div></body>"""
        framed, (ox, oy, sc), bx = mock(p, html, "pwa-06", sels=["#ic"], ribbon="Illustration : écran d'accueil du téléphone")
        annotate(framed, IMG / "pwa-06.webp", marks_for(ox, oy, sc, bx))
        step(6, "Retrouve l'icône My UCA", "L'icône « My UCA » apparaît sur ton écran d'accueil (ou dans la liste de tes applications). Appuie dessus pour lancer l'application. Image d'illustration.", "Un seul appui pour ouvrir ton emploi du temps, comme n'importe quelle application.", "pwa-06")
        # 7 : première ouverture = import
        pg.goto(BASE + "app/import.html"); pg.wait_for_timeout(1500)
        ph.snap("pwa-07", [])
        step(7, "Au premier lancement : importe tes données", "L'application s'ouvre sur l'écran d'import : elle est vide au départ, car le site ne lit jamais Odin à ta place. Tes données viennent de l'extension sur ordinateur.", "Tes notes et ton emploi du temps restent uniquement sur ton téléphone : aucun serveur.", "pwa-07")
        # 8 : les moyens d'import
        ph.snap("pwa-08", [("box", "text=Scanner le code animé"), ("box", "text=Importer un fichier"), ("box", "text=Coller un lien")])
        step(8, "Choisis comment importer", "Trois moyens : scanner le QR animé affiché par l'extension, coller le lien chiffré, ou ouvrir le fichier d'export. Sur ordinateur, dans l'extension : bouton « Liens » puis « Envoyer vers le téléphone ».", "Le QR animé fonctionne même hors connexion : rien n'est envoyé sur Internet.", "pwa-08")
        # 9 : import d'un fichier de démonstration
        sys.path.insert(0, str(ROOT / "tests"))
        from fixtures import seed  # noqa: E402
        data = seed(); data["uca_design"] = "studio"
        f = Path(tempfile.mkdtemp()) / "agenda.ucasync"
        f.write_text(json.dumps({"format": "uca-sync", "version": 1, "exportedAt": "2026-10-20T08:00:00.000Z", "data": data}), encoding="utf-8")
        pg.goto(BASE + "app/import.html"); pg.wait_for_timeout(1000)
        pg.set_input_files("#fileInput", str(f)); pg.wait_for_url("**/app/shell.html*", timeout=10000); pg.wait_for_timeout(1800)
        ph.snap("pwa-09", [("box", "#bottomNav")])
        step(9, "Tes données arrivent", "Dès que l'import est fini, l'application s'ouvre sur l'Accueil : statut des services UCA, notifications, raccourcis. La barre du bas donne accès à Études, Agenda, Lieux et Compte. (Données de démonstration.)", "Tu as maintenant ton emploi du temps et tes notes dans la poche, sans ouvrir l'ordinateur.", "pwa-09")
        # 10 : agenda
        pg.click("#bottomNav button[data-tab=agenda]"); pg.wait_for_timeout(2500)
        ph.snap("pwa-10", [])
        step(10, "Ouvre l'agenda", "L'onglet « Agenda » affiche ton emploi du temps : jour, 3 jours, semaine, mois. Appuie sur un cours pour voir la salle, l'enseignant et les horaires.", "Tu sais où aller en un coup d'œil, avec les changements de salle et les annulations signalés.", "pwa-10")
        # 11 : études
        pg.click("#bottomNav button[data-tab=etudes]"); pg.wait_for_timeout(1500)
        ph.snap("pwa-11", [])
        step(11, "Consulte tes études", "L'onglet « Études » regroupe tes notes, tes absences et ta scolarité. Les notes récentes sont en couleur.", "Tu suis ta moyenne sans te reconnecter à Odin.", "pwa-11")
        # 12 : lieux
        pg.click("#bottomNav button[data-tab=lieux]"); pg.wait_for_timeout(1500)
        ph.snap("pwa-12", [])
        step(12, "Trouve les lieux du campus", "L'onglet « Lieux » liste les restaurants U, bibliothèques et services, avec la carte du campus.", "Pratique à la rentrée pour trouver une salle ou un resto.", "pwa-12")
        # 13 : compte
        pg.click("#bottomNav button[data-tab=compte]"); pg.wait_for_timeout(1500)
        pg.evaluate("document.querySelector('[data-act=sendFrames]')?.scrollIntoView({block: 'center'})"); pg.wait_for_timeout(500)
        ph.snap("pwa-13", [("box", "[data-act=sendFrames]")] if pg.locator("[data-act=sendFrames]").count() else [])
        step(13, "Garde la main sur tes données", "L'onglet « Compte » rappelle que tes données restent sur cet appareil. Tu peux les envoyer vers un autre appareil (QR animé), ouvrir les préférences ou tout effacer.", "C'est ici que tu règles les notifications et que tu supprimes tes données si tu changes de téléphone.", "pwa-13")
        # 14 : menu du site
        pg.click("#menuBtn"); pg.wait_for_timeout(700)
        ph.snap("pwa-14", [])
        step(14, "Passe du clair au sombre", "Le bouton menu en haut ouvre le menu du site : retour à l'accueil, aide, don, et le choix du thème clair, sombre ou automatique (soleil et lune).", "Tu règles l'apparence selon ta préférence ou la luminosité.", "pwa-14")
        ph.browser.close()
    srv.shutdown()
    data = json.loads(STEPS.read_text(encoding="utf-8")) if STEPS.exists() else {}
    data["pwa"] = {"title": "Installer l'application sur ton téléphone (PWA)", "intro": "L'application s'installe depuis le navigateur du téléphone, sans magasin d'applications. Les captures de l'application sont réelles ; les écrans propres à Android (menu du navigateur, écran d'accueil) sont des illustrations. Compte environ 2 minutes.", "steps": steps}
    STEPS.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    log(len(steps), "étapes")


if __name__ == "__main__":
    main()
