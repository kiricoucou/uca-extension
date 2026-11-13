"""Génère le tutoriel d'installation en images (captures RÉELLES plein écran, annotées) : aide-install/img/*.webp + aide-install/steps.json,
puis la page installation.html (rendu étape par étape).

  python -I -X utf8 tools/gen_tuto.py zip          # installation par le ZIP (Chrome, mode développeur)
  python -I -X utf8 tools/gen_tuto.py installateur # installateur Windows (.bat)
  python -I -X utf8 tools/gen_tuto.py pwa          # application web (PWA) sur téléphone
  python -I -X utf8 tools/gen_tuto.py page         # regénère seulement installation.html depuis steps.json

Windows uniquement (vrai Chrome, vrai Explorateur, vraies boîtes de dialogue). Les chemins affichés sont dans C:\\MyUCA : aucun nom d'utilisateur
n'apparaît. La barre des tâches est rognée et le volet de navigation de l'Explorateur est flouté."""
import json
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from PIL import Image, ImageFilter  # noqa: E402
from tuto_lib import ROOT, Chrome, annotate, click_screen, launch_on_desktop, move_mouse, ps, sendkeys, set_expect, wincap  # noqa: E402

SITE = "https://kiricoucou.github.io/uca-extension/"
BASE = Path(r"C:\MyUCA")
DL = BASE / "Téléchargements"
EXT = BASE / "extension"
IMG = ROOT / "aide-install" / "img"
RAW = Path(os.environ.get("TEMP", ".")) / "tuto-raw"
STEPS = ROOT / "aide-install" / "steps.json"
TASKBAR = 84   # pixels rognés en bas de l'écran (barre des tâches : applications épinglées de l'utilisateur)


def log(*a):
    print(*a, flush=True)


def uia(name="", title="", pid=0, pids="", typ="", all_=False):
    a = ["-File", str(ROOT / "tools" / "uia.ps1")]
    if name:
        a += ["-Name", name]
    if title:
        a += ["-Title", title]
    if pid:
        a += ["-ProcessId", str(pid)]
    if pids:
        a += ["-Pids", str(pids)]
    if typ:
        a += ["-Type", typ]
    if all_:
        a += ["-All"]
    out = ps(*a, check=False)
    if not out:
        return None
    first = out.splitlines()[0].split("|")[0]
    return tuple(int(v) for v in first.split(","))


def close_explorer():
    ps("-Command", "$s = New-Object -ComObject Shell.Application; foreach ($w in @($s.Windows())) { try { if ($w.LocationURL -match 'MyUCA') { $w.Quit() } } catch {} }", check=False)
    time.sleep(0.8)


def open_explorer(path, select=None):
    cmd = f'explorer.exe /select,"{select}"' if select else f'explorer.exe "{path}"'
    launch_on_desktop(cmd)
    time.sleep(2.5)


def full(raw, title="", pid=0):
    """Capture plein écran (Chrome ou Explorateur au premier plan). Deux passages : le premier maximise et met au premier plan, le second capture une fois les animations finies."""
    wincap(raw, pid=pid, title=title, full=True, maximize=True)
    time.sleep(1.2)
    if title:
        set_expect(title)
    return wincap(raw, pid=pid, title=title, full=True, maximize=True)


def finish(raw, name, marks, blur=None, crop_bottom=TASKBAR, crop=None):
    """Rogne la barre des tâches, floute des zones (x, y, w, h), dessine les annotations (coordonnées de l'image brute), enregistre le WebP."""
    im = Image.open(raw).convert("RGB")
    im = im.crop((0, 0, im.width, im.height - crop_bottom))
    for (x, y, w, h) in (blur or []):
        reg = im.crop((x, y, x + w, y + h)).filter(ImageFilter.GaussianBlur(14))
        im.paste(reg, (x, y))
    if crop:   # zoom sur une zone (x, y, w, h) : les annotations (repère de l'image brute) sont décalées
        cx, cy, cw, ch = crop
        marks = [shift(m, -cx, -cy) for m in marks]
        im = im.crop((cx, cy, cx + cw, cy + ch))
    tmp = RAW / (name + "-c.png")
    im.save(tmp)
    size = annotate(tmp, IMG / f"{name}.webp", marks)
    log("  image", name, size)


def shift(m, dx, dy):
    o = {}
    for k, v in m.items():
        o[k] = (v[0] + dx, v[1] + dy) + tuple(v[2:])
    return o


def rect_of(title="", pid=0):
    a = ["-File", str(ROOT / "tools" / "wincap.ps1"), "-Info"]
    if title:
        a += ["-Title", title]
    if pid:
        a += ["-ProcessId", str(pid)]
    return tuple(int(v) for v in ps(*a).split(",")[-4:])


def confirm_folder(title_re):
    """Valide la fenêtre de choix de dossier : Entrée (ouvre le dossier saisi), puis clic sur « Sélectionner un dossier » tant qu'elle reste ouverte."""
    sendkeys("{ENTER}"); time.sleep(1.8)
    for _ in range(4):
        try:
            rect_of(title=title_re)
        except Exception:
            return
        btn = uia("Sélectionner un dossier|Select Folder", title=title_re, typ="Button")
        if btn:
            click_screen(btn[0] + btn[2] // 2, btn[1] + btn[3] // 2)
        time.sleep(2)


CLEAN_JS = """() => { const m = document.querySelector('extensions-manager'); if (!m) return; const l = m.shadowRoot.querySelector('extensions-item-list'); if (!l) return;
  l.shadowRoot.querySelectorAll('extensions-item').forEach(i => { if (!/UCA/i.test(i.shadowRoot.textContent)) i.remove(); }); }"""


def clean_ext(page):
    try:
        page.evaluate(CLEAN_JS)
    except Exception:
        pass


def box(b, pad=0):
    return {"box": (b[0] - pad, b[1] - pad, b[2] + 2 * pad, b[3] + 2 * pad)}


def num(b, n, side="tl"):
    x, y, w, h = b
    return {"num": (x - 18, y - 18, n)} if side == "tl" else {"num": (x + w + 18, y - 18, n)}


EXPLORER_NAV = [(0, 232, 285, 940)]   # volet de navigation (dossiers personnels) flouté


def save_steps(flow, title, intro, steps):
    data = json.loads(STEPS.read_text(encoding="utf-8")) if STEPS.exists() else {}
    data[flow] = {"title": title, "intro": intro, "steps": steps}
    STEPS.parent.mkdir(parents=True, exist_ok=True)
    STEPS.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")


# ============================================================================================================== ZIP
def flow_zip():
    RAW.mkdir(parents=True, exist_ok=True); IMG.mkdir(parents=True, exist_ok=True)
    close_explorer()
    shutil.rmtree(DL, ignore_errors=True); shutil.rmtree(EXT, ignore_errors=True); DL.mkdir(parents=True)
    steps = []

    def step(n, title, what, why, img):
        steps.append({"n": n, "title": title, "what": what, "why": why, "img": f"aide-install/img/{img}.webp"})

    c = Chrome(os.environ["TEMP"] + r"\udd-zip", 9411, DL)
    try:
        # 1 : accueil du site
        c.page.goto(SITE); c.page.wait_for_timeout(2500)
        c.page.evaluate("document.querySelector('.hero a[href=\"extension/\"]').scrollIntoView({block:'center'})"); c.page.wait_for_timeout(600)
        raw = RAW / "z01.png"; c.shot(raw)
        b = c.box('.hero a[href="extension/"]')
        finish(raw, "zip-01", [box(b, 8), num(b, 1)] if b else [])
        step(1, "Ouvre le site", "Dans Chrome, ouvre kiricoucou.github.io/uca-extension. C'est la page d'accueil du projet.", "Tu télécharges l'extension depuis la source officielle du projet, jamais depuis un site tiers.", "zip-01")

        # 2 : page extension
        c.page.goto(SITE + "extension/"); c.page.wait_for_timeout(2500)
        raw = RAW / "z02.png"; c.shot(raw)
        b = c.box("#dlTop")
        finish(raw, "zip-02", [box(b, 8), num(b, 1)])
        step(2, "Clique sur « Télécharger le ZIP »", "Sur la page « Extension », le gros bouton bleu télécharge le fichier uca-extension-chrome.zip (environ 2,6 Mo).", "Le ZIP contient uniquement le code de l'extension : aucune donnée personnelle.", "zip-02")

        # 3 : le téléchargement (vraie bulle de Chrome ouverte)
        c.click_real("#dlTop")
        for _ in range(25):
            time.sleep(1)
            if (DL / "uca-extension-chrome.zip").exists() and not list(DL.glob("*.crdownload")):
                break
        time.sleep(1)
        dlb = uia("Téléchargements|Downloads", pids=c.pids_str(), typ="Button")
        if dlb:
            click_screen(dlb[0] + dlb[2] // 2, dlb[1] + dlb[3] // 2); time.sleep(1.5)
        raw = RAW / "z03.png"; c.shot(raw)
        finish(raw, "zip-03", [box(dlb, 8), num(dlb, 2)] if dlb else [])
        step(3, "Le fichier se télécharge", "Chrome affiche l'icône de téléchargement en haut à droite : clique dessus pour voir la liste. Tu y vois uca-extension-chrome.zip avec sa taille (environ 2,6 Mo) et « OK » quand c'est terminé.", "Tu vérifies que le téléchargement est bien terminé avant de continuer.", "zip-03")

        # 4 : le ZIP dans l'Explorateur
        open_explorer(DL, select=str(DL / "uca-extension-chrome.zip"))
        raw = RAW / "z04.png"; full(raw, title="Téléchargements")
        item = uia("uca-extension-chrome.zip", title="Téléchargements", typ="ListItem")
        finish(raw, "zip-04", [box(item, 4), num(item, 1)] if item else [], blur=EXPLORER_NAV)
        step(4, "Retrouve le ZIP dans ton dossier", "Ouvre l'Explorateur de fichiers, puis le dossier Téléchargements : tu y vois uca-extension-chrome.zip. Clique une fois dessus pour le sélectionner.", "Windows doit décompresser le fichier : Chrome ne peut pas charger une extension directement depuis un ZIP.", "zip-04")

        # 5 : « Extraire tout »
        ex = uia("Extraire tout", title="Téléchargements", typ="Button")
        move_mouse(ex[0] + ex[2] // 2, ex[1] + ex[3] // 2); time.sleep(1.2)
        raw = RAW / "z05.png"; full(raw, title="Téléchargements")
        finish(raw, "zip-05", [box(ex, 6), num(ex, 2)], blur=EXPLORER_NAV)
        step(5, "Clique sur « Extraire tout »", "Le ZIP étant sélectionné, le bouton « Extraire tout » apparaît dans la barre d'outils de l'Explorateur. Clique dessus.", "Cette commande décompresse le ZIP dans un vrai dossier.", "zip-05")

        # 6 : fenêtre d'extraction, chemin choisi
        click_screen(ex[0] + ex[2] // 2, ex[1] + ex[3] // 2); time.sleep(2.5)
        set_expect("^Extraire les dossiers")
        sendkeys("{HOME}+{END}" + str(EXT))
        time.sleep(0.8)
        raw = RAW / "z06.png"; full(raw, title="^Extraire les dossiers")
        ed = uia("MyUCA|extension", title="^Extraire les dossiers")
        dr = rect_of(title="^Extraire les dossiers")
        finish(raw, "zip-06", ([box(ed, 8), num(ed, 3)] if ed else []), crop=(max(0, dr[0] - 30), max(0, dr[1] - 30), min(2560 - max(0, dr[0] - 30), dr[2] + 60), min(1516 - max(0, dr[1] - 30), dr[3] + 60)))
        step(6, "Choisis où extraire", "Dans la fenêtre « Extraire les dossiers compressés », tape (ou choisis avec « Parcourir ») le dossier où l'extension doit vivre, par exemple C:\\MyUCA\\extension. Garde « Afficher les dossiers extraits » coché.", "Ce dossier devra rester en place : Chrome le lit à chaque démarrage. Choisis un endroit où tu ne le supprimeras pas.", "zip-06")
        ext_btn = uia("^Extraire$", title="^Extraire les dossiers", typ="Button")
        if ext_btn:
            click_screen(ext_btn[0] + ext_btn[2] // 2, ext_btn[1] + ext_btn[3] // 2)
        else:
            sendkeys("{ENTER}")
        time.sleep(3)
        if not (EXT / "manifest.json").exists():
            import zipfile
            with zipfile.ZipFile(DL / "uca-extension-chrome.zip", "r") as zf:
                zf.extractall(EXT)

        # 7 : le dossier extrait
        open_explorer(EXT, select=str(EXT / "manifest.json"))
        time.sleep(1.5)
        raw = RAW / "z07.png"; full(raw, title="extension")
        mf = uia("manifest.json", title="extension", typ="ListItem")
        finish(raw, "zip-07", [box(mf, 4), num(mf, 4)] if mf else [], blur=EXPLORER_NAV)
        step(7, "Vérifie le dossier extrait", "Le dossier s'ouvre : tu dois voir directement un fichier manifest.json, avec les dossiers core, designs, icons… À ce niveau-là, c'est le bon dossier.", "Si tu ne vois qu'un seul sous-dossier au lieu de manifest.json, ouvre-le : il faudra choisir ce sous-dossier à l'étape 11.", "zip-07")
        close_explorer()

        # 8 : chrome://extensions
        c.foreground()
        c.page.goto("chrome://extensions"); c.page.wait_for_timeout(2000)
        clean_ext(c.page)
        raw = RAW / "z08.png"; c.shot(raw)
        finish(raw, "zip-08", [])
        step(8, "Ouvre la page des extensions", "Dans Chrome, tape chrome://extensions dans la barre d'adresse (ou menu ⋮ > Extensions > Gérer les extensions).", "C'est la page où Chrome liste toutes les extensions et où on peut en charger une à la main.", "zip-08")

        # 9 : mode développeur
        def shadow_box(js_path):
            js = "() => { const m = document.querySelector('extensions-manager'); const t = m.shadowRoot.querySelector('extensions-toolbar'); const e = " + js_path + "; if (!e) return null; const r = e.getBoundingClientRect(); const d = devicePixelRatio; return [(screenX + r.left) * d, (screenY + (outerHeight - innerHeight) + r.top) * d, r.width * d, r.height * d]; }"
            v = c.page.evaluate(js)
            return tuple(round(x) for x in v) if v else None
        c.foreground()
        dev = shadow_box("t.shadowRoot.querySelector('#devMode')")
        if dev:
            click_screen(dev[0] + dev[2] // 2, dev[1] + dev[3] // 2); time.sleep(1.2)
        clean_ext(c.page)
        raw = RAW / "z09.png"; c.shot(raw)
        dev = shadow_box("t.shadowRoot.querySelector('#devMode')")
        finish(raw, "zip-09", [box(dev, 8), num(dev, 1)] if dev else [])
        step(9, "Active le « Mode développeur »", "En haut à droite de la page, clique sur l'interrupteur « Mode développeur » : il devient bleu.", "Sans ce mode, Chrome refuse de charger une extension qui ne vient pas du Chrome Web Store.", "zip-09")

        # 10 : les trois nouveaux boutons
        lu = shadow_box("t.shadowRoot.querySelector('#loadUnpacked')")
        clean_ext(c.page)
        raw = RAW / "z10.png"; c.shot(raw)
        finish(raw, "zip-10", [box(lu, 8), num(lu, 2)] if lu else [])
        step(10, "Repère « Charger l'extension non empaquetée »", "Une barre apparaît sous le titre avec trois boutons. Celui qu'il te faut est le premier : « Charger l'extension non empaquetée ».", "« Non empaquetée » veut dire : un simple dossier, celui que tu viens d'extraire.", "zip-10")

        # 11 : la fenêtre de choix du dossier
        c.foreground()
        if lu:
            click_screen(lu[0] + lu[2] // 2, lu[1] + lu[3] // 2); time.sleep(3)
        title_re = "Sélectionner|dossier|extension|Choisir"
        raw = RAW / "z11.png"; full(raw, title=title_re)
        dr = rect_of(title=title_re)
        finish(raw, "zip-11", [], blur=[(dr[0], dr[1] + int(dr[3] * 0.48), int(dr[2] * 0.2), int(dr[3] * 0.5))], crop=(max(0, dr[0] - 40), max(0, dr[1] - 40), min(2560, dr[2] + 80), min(1516, dr[3] + 80)))
        step(11, "Choisis le dossier de l'extension", "Une fenêtre de l'Explorateur s'ouvre. Va jusqu'au dossier extrait (celui qui contient manifest.json), par exemple C:\\MyUCA\\extension.", "C'est ce dossier que Chrome va lire : il doit contenir directement le fichier manifest.json.", "zip-11")

        # 12 : le chemin saisi, avant validation
        set_expect(title_re)
        sendkeys(str(EXT)); time.sleep(1)
        raw = RAW / "z12.png"; full(raw, title=title_re)
        dr = rect_of(title=title_re)
        sel = uia("Sélectionner un dossier|Select Folder", title=title_re, typ="Button")
        finish(raw, "zip-12", [box(sel, 8), num(sel, 3)] if sel else [], blur=[(dr[0], dr[1] + int(dr[3] * 0.48), int(dr[2] * 0.2), int(dr[3] * 0.5))], crop=(max(0, dr[0] - 40), max(0, dr[1] - 40), min(2560, dr[2] + 80), min(1516, dr[3] + 80)))
        step(12, "Valide avec « Sélectionner un dossier »", "Le chemin du dossier est saisi : clique sur « Sélectionner un dossier » (ou appuie sur Entrée).", "Chrome charge alors l'extension depuis ce dossier, sans rien installer ailleurs.", "zip-12")
        confirm_folder(title_re); time.sleep(3)

        # 13 : la page d'accueil de l'extension s'ouvre toute seule
        welcome = None
        for _ in range(12):
            tabs = [p for p in c.ctx.pages]
            welcome = next((p for p in tabs if "choose.html" in p.url), None)
            if welcome:
                break
            time.sleep(0.5)
        if welcome:
            welcome.bring_to_front(); welcome.wait_for_timeout(1800)
            c.page = welcome
        raw = RAW / "z13.png"; c.shot(raw)
        finish(raw, "zip-13", [])
        step(13, "La page de bienvenue s'ouvre toute seule", "Dès que l'extension est chargée, Chrome ouvre un nouvel onglet : c'est la page « Choisis ton design » de l'extension. Elle te prouve que l'installation a réussi.", "Tu choisis l'apparence de l'agenda (5 designs, mêmes fonctions) puis tu te connectes à Odin avec « Synchroniser ».", "zip-13")

        # 14 : la carte de l'extension dans chrome://extensions
        c.page.goto("chrome://extensions"); c.page.wait_for_timeout(1800)
        c.foreground()
        clean_ext(c.page)
        find_card = """() => { const m = document.querySelector('extensions-manager'); const l = m ? m.shadowRoot.querySelector('extensions-item-list') : null; return l ? [...l.shadowRoot.querySelectorAll('extensions-item')].find(i => /UCA/i.test(i.shadowRoot.textContent)) : null; }"""
        c.page.evaluate("() => { const f = " + find_card + "; const it = f(); if (it) it.scrollIntoView({block: 'center'}); }")
        time.sleep(1)
        card = c.page.evaluate("() => { const f = " + find_card + "; const it = f(); if (!it) return null; const r = it.getBoundingClientRect(), d = devicePixelRatio; return [(screenX + r.left) * d, (screenY + (outerHeight - innerHeight) + r.top) * d, r.width * d, r.height * d]; }")
        raw = RAW / "z14.png"; c.shot(raw)
        card = tuple(round(x) for x in card) if card else None
        finish(raw, "zip-14", [box(card, 6), num(card, 1)] if card else [])
        step(14, "L'extension apparaît dans la liste", "De retour sur chrome://extensions, une nouvelle carte « Emploi du temps UCA » est là, activée (interrupteur bleu).", "C'est la preuve qu'elle est installée. Tu peux la désactiver ou la supprimer ici à tout moment.", "zip-14")

        # 15 : le menu « puzzle »
        ext_btn = uia("^Extensions$", typ="Button")
        if ext_btn:
            click_screen(ext_btn[0] + ext_btn[2] // 2, ext_btn[1] + ext_btn[3] // 2); time.sleep(1.8)
        row = uia("Emploi du temps UCA")
        raw = RAW / "z15.png"; c.shot(raw)
        finish(raw, "zip-15", ([box(ext_btn, 8), num(ext_btn, 1)] if ext_btn else []) + ([box(row, 6), num(row, 2)] if row else []))
        step(15, "Retrouve l'extension dans le menu « puzzle »", "Clique sur l'icône « puzzle » à droite de la barre d'adresse : la liste de tes extensions s'affiche. « Emploi du temps UCA » y est, avec sa punaise pour l'épingler à la barre d'outils.", "Chrome épingle les nouvelles extensions tout seul. Si ce n'est pas le cas, clique sur la punaise pour garder l'icône visible en permanence.", "zip-15")
        sendkeys("{ESC}"); time.sleep(1.2)

        # 16 : l'icône dans la barre d'outils
        raw = RAW / "z16.png"; c.shot(raw)
        ico = uia("Session Odin|Emploi du temps UCA")
        finish(raw, "zip-16", [box(ico, 8), num(ico, 1)] if ico else [])
        step(16, "Ouvre ton agenda", "L'icône est dans la barre d'outils : clique dessus pour ouvrir l'extension, choisis ton design, puis « Synchroniser » pour te connecter à Odin avec ton compte UCA.", "Ton mot de passe est saisi sur la vraie page de connexion de l'UCA : l'extension ne le voit jamais.", "zip-16")
    finally:
        pass
    return c, steps, step


# ============================================================================================================== INSTALLATEUR
def flow_inst():
    """Installateur Windows (.bat) : vraies fenêtres de l'assistant. Crochets de test : navigateurs jamais lancés ni fermés (MYUCA_NOLAUNCH / MYUCA_NOKILL),
    dossier mémorisé dans un dossier temporaire (MYUCA_CFGDIR)."""
    RAW.mkdir(parents=True, exist_ok=True); IMG.mkdir(parents=True, exist_ok=True)
    close_explorer()
    inst = BASE / "installateur"; dl2 = BASE / "Telechargements-installateur"
    for d in (DL, inst, dl2):
        shutil.rmtree(d, ignore_errors=True)
    DL.mkdir(parents=True)
    steps = []

    def step(n, title, what, why, img):
        steps.append({"n": n, "title": title, "what": what, "why": why, "img": f"aide-install/img/{img}.webp"})

    c = Chrome(os.environ["TEMP"] + r"\udd-inst", 9412, DL)
    try:
        # 1 : la section « Installateurs automatiques »
        c.page.goto(SITE + "extension/#installateurs"); c.page.wait_for_timeout(2500)
        c.page.evaluate("document.getElementById('installateurs').scrollIntoView({block:'start'})"); c.page.wait_for_timeout(800)
        raw = RAW / "i01.png"; c.shot(raw)
        b = c.box('#installateurs .card:nth-child(1) a.dl')
        finish(raw, "inst-01", [box(b, 8), num(b, 1)])
        step(1, "Trouve les installateurs", "Sur la page « Extension » du site, descends jusqu'à « Installateurs automatiques » : un installateur existe pour Windows, macOS et Linux. Pour Windows, clique sur « Installateur Windows ».", "L'installateur fait à ta place le téléchargement, la copie des fichiers et l'ouverture de la bonne page : tu ne manipules pas de ZIP.", "inst-01")

        # 2 : téléchargement du .bat
        c.click_real('#installateurs .card:nth-child(1) a.dl')
        for _ in range(25):
            time.sleep(1)
            if (DL / "installer-windows.bat").exists() and not list(DL.glob("*.crdownload")):
                break
        time.sleep(1.5)
        dlb = uia("Téléchargements|Downloads", pids=c.pids_str(), typ="Button")
        if dlb:
            click_screen(dlb[0] + dlb[2] // 2, dlb[1] + dlb[3] // 2); time.sleep(1.5)
        raw = RAW / "i02.png"; c.shot(raw)
        finish(raw, "inst-02", [box(dlb, 8), num(dlb, 2)] if dlb else [])
        step(2, "Le fichier .bat se télécharge", "Chrome télécharge installer-windows.bat. S'il affiche un avertissement (« ce type de fichier peut endommager votre ordinateur »), clique sur « Conserver » : le script est public et lisible, tu peux l'ouvrir avec le Bloc-notes avant de le lancer.", "Chrome prévient pour tous les scripts. Ici, le code est ouvert sur GitHub et n'envoie rien : il ne fait que télécharger l'extension et copier des fichiers dans ton profil.", "inst-02")
        local = (ROOT / "extension" / "installer-windows.bat").read_bytes()
        if b"MYUCA_NOKILL" not in local or b"MYUCA_NOLAUNCH" not in local:
            raise RuntimeError("installateur sans crochets de test : abandon (il fermerait tes navigateurs)")
        (DL / "installer-windows.bat").write_bytes(local)

        # 3 : le fichier dans l'Explorateur
        open_explorer(DL, select=str(DL / "installer-windows.bat"))
        raw = RAW / "i03.png"; full(raw, title="Téléchargements")
        item = uia("installer-windows.bat", title="Téléchargements", typ="ListItem")
        finish(raw, "inst-03", [box(item, 4), num(item, 1)] if item else [], blur=EXPLORER_NAV)
        step(3, "Double-clique sur installer-windows.bat", "Ouvre ton dossier Téléchargements dans l'Explorateur et double-clique sur installer-windows.bat. Aucun droit administrateur n'est nécessaire.", "Windows lance l'assistant graphique : une fenêtre s'ouvre, pas besoin de taper de commande.", "inst-03")

        # 4 : lancement (avertissement Windows si présent) puis l'assistant
        os.environ["MYUCA_NOLAUNCH"] = "1"
        os.environ["MYUCA_NOKILL"] = "1"
        os.environ["MYUCA_CFGDIR"] = str(BASE / "cfg-test")
        os.environ["MYUCA_URL"] = SITE.rstrip("/")
        os.environ["MYUCA_PAUSE_PAGE3"] = "4000"
        launch_on_desktop(f'cmd.exe /c start "" "{DL / "installer-windows.bat"}"')
        time.sleep(4)
        warn = None
        try:
            warn_re = "Avertissement|Security|SmartScreen|Windows a prot"
            raw = RAW / "i04.png"; full(raw, title=warn_re)
            dr = rect_of(title=warn_re)
            run = uia("Exécuter|Ouvrir|Run|Open", title=warn_re, typ="Button")
            warn = True
        except Exception:
            warn = False
        if warn:
            finish(raw, "inst-04", [box(run, 8), num(run, 1)] if run else [], crop=(max(0, dr[0] - 40), max(0, dr[1] - 40), min(2560, dr[2] + 80), min(1516, dr[3] + 80)))
            step(4, "Autorise l'ouverture si Windows demande", "Windows peut afficher « Avertissement de sécurité » parce que le fichier vient d'Internet. Vérifie que c'est bien installer-windows.bat, puis clique sur « Exécuter » (ou « Ouvrir »).", "C'est une protection normale de Windows pour tout fichier téléchargé.", "inst-04")
            if run:
                click_screen(run[0] + run[2] // 2, run[1] + run[3] // 2)
            time.sleep(4)
        n = len(steps)

        def form_shot(name, marks_fn):
            raw = RAW / f"{name}.png"; full(raw, title="^Installateur My UCA")
            dr = rect_of(title="^Installateur My UCA")
            marks = marks_fn(dr)
            finish(raw, f"inst-{len(steps) + 1:02d}", marks, crop=(max(0, dr[0] - 40), max(0, dr[1] - 40), min(2560, dr[2] + 80), min(1516, dr[3] + 80)))
            return dr

        def at(dr, x, y, w, h):   # position d'un contrôle dans la fenêtre (maquette 656x509) -> pixels écran
            sx, sy = dr[2] / 656.0, dr[3] / 509.0
            return (round(dr[0] + x * sx), round(dr[1] + y * sy), round(w * sx), round(h * sy))

        def dlg_btn(name, title):
            dr = rect_of(title=title)
            out = ps("-File", str(ROOT / "tools" / "uia.ps1"), "-Title", title, "-Name", name, "-Type", "Button", "-All", check=False)
            if not out:
                return None
            for line in out.splitlines():
                parts = line.split("|")
                coords = tuple(int(v) for v in parts[0].split(","))
                if coords[1] > dr[1] + dr[3] - 150:
                    return coords
            return None

        # 5 : assistant, page 1 (dossiers)
        dr0 = rect_of(title="^Installateur My UCA")
        set_expect("^Installateur My UCA")
        time.sleep(0.6)
        t1 = uia("installer l'extension", title="^Installateur My UCA", typ="Edit") or at(dr0, 32, 187, 480, 26)
        t2 = uia("telecharger les fichiers", title="^Installateur My UCA", typ="Edit") or at(dr0, 32, 261, 480, 26)
        click_screen(t1[0] + 40, t1[1] + t1[3] // 2); sendkeys("{HOME}+{END}" + str(inst)); time.sleep(0.4)
        click_screen(t2[0] + 40, t2[1] + t2[3] // 2); sendkeys("{HOME}+{END}" + str(dl2)); time.sleep(0.6)
        form_shot("i05", lambda dr: [box(t1, 6), num(t1, 1), box(t2, 6), num(t2, 2)])
        step(len(steps) + 1, "Choisis où installer et où télécharger", "Un assistant s'ouvre. Indique (ou choisis avec « Parcourir ») le dossier d'installation de l'extension, puis le dossier où télécharger les fichiers. La dernière version est vérifiée automatiquement. Clique sur « Suivant ».", "Le dossier d'installation doit rester en place : Chrome le lit à chaque démarrage.", f"inst-{len(steps) + 1:02d}")

        # 6 : page 2 (navigateurs)
        nxt = dlg_btn("Suivant", "^Installateur My UCA") or at(dr0, 502, 420, 116, 36)
        click_screen(nxt[0] + nxt[2] // 2, nxt[1] + nxt[3] // 2); time.sleep(1.2)
        inst_btn = dlg_btn("Installer", "^Installateur My UCA") or at(dr0, 502, 420, 116, 36)
        clb = uia("", title="^Installateur My UCA", typ="List") or at(dr0, 32, 155, 588, 130)
        form_shot("i06", lambda dr: [box(clb, 6), num(clb, 1), box(inst_btn, 6), num(inst_btn, 2)])
        step(len(steps) + 1, "Choisis tes navigateurs", "L'assistant détecte les navigateurs installés (Chrome, Edge, Brave, Vivaldi, Firefox). Coche ceux où tu veux l'extension : un seul, deux ou tous. Clique sur « Installer ».", "Le même code s'adapte à ton choix : il prépare le bon paquet pour chaque navigateur.", f"inst-{len(steps) + 1:02d}")

        # 7 : installation en cours (barre de progression + journal partiel)
        click_screen(inst_btn[0] + inst_btn[2] // 2, inst_btn[1] + inst_btn[3] // 2)
        time.sleep(2.0)
        form_shot("i06b", lambda dr: [box(at(dr, 24, 124, 588, 26), 6), num(at(dr, 24, 124, 588, 26), 1)])
        step(len(steps) + 1, "Installation en cours", "L'assistant télécharge l'extension et extrait les fichiers dans le dossier choisi. La barre de progression et le journal t'informent de l'avancée.", "Tout se fait automatiquement, sans ligne de commande ni manipulation compliquée.", f"inst-{len(steps) + 1:02d}")

        # 8 : installation, demande de fermer les navigateurs
        mb_re = "^My UCA$"
        found = False
        for _ in range(40):
            time.sleep(1)
            try:
                rect_of(title=mb_re); found = True; break
            except Exception:
                continue
        if found:
            raw = RAW / "i07.png"; full(raw, title=mb_re)
            dr = rect_of(title=mb_re)
            ok = uia("^OK$", title=mb_re, typ="Button")
            finish(raw, f"inst-{len(steps) + 1:02d}", [box(ok, 8), num(ok, 1)] if ok else [], crop=(max(0, dr[0] - 40), max(0, dr[1] - 40), min(2560, dr[2] + 80), min(1516, dr[3] + 80)))
            step(len(steps) + 1, "Ferme tes navigateurs", "Après le téléchargement (barre de progression), l'assistant te demande de fermer correctement les navigateurs choisis. Enregistre ton travail, ferme-les, puis clique sur « OK ». Ceux qui restent ouverts sont fermés de force.", "Un navigateur ouvert verrouille ses fichiers : le fermer évite toute erreur pendant l'installation.", f"inst-{len(steps) + 1:02d}")
            if ok:
                set_expect(mb_re)
                click_screen(ok[0] + ok[2] // 2, ok[1] + ok[3] // 2)
        time.sleep(3)

        # 9 : étape manuelle expliquée (Chrome récent) ou fin
        found2 = False
        for _ in range(40):
            time.sleep(1)
            try:
                rect_of(title="derniere etape|dernière étape"); found2 = True; break
            except Exception:
                continue
        if found2:
            raw = RAW / "i08.png"; full(raw, title="derniere etape|dernière étape")
            dr = rect_of(title="derniere etape|dernière étape")
            ok = uia("^OK$", title="derniere etape|dernière étape", typ="Button")
            finish(raw, f"inst-{len(steps) + 1:02d}", [box(ok, 8), num(ok, 1)] if ok else [], crop=(max(0, dr[0] - 40), max(0, dr[1] - 40), min(2560, dr[2] + 80), min(1516, dr[3] + 80)))
            step(len(steps) + 1, "Lis la dernière étape", "Une fenêtre résume la dernière étape que Chrome impose : charger le dossier une fois (mode développeur). Le chemin du dossier est déjà copié dans le presse-papiers. Clique sur « OK ».", "Chrome 137 et plus interdit de charger automatiquement une extension hors magasin : c'est une règle de sécurité du navigateur, que l'installateur ne peut pas contourner.", f"inst-{len(steps) + 1:02d}")
            if ok:
                set_expect("derniere etape|dernière étape")
                click_screen(ok[0] + ok[2] // 2, ok[1] + ok[3] // 2)
        time.sleep(2)

        # 10 : fin de l'assistant
        raw = RAW / "i09.png"; full(raw, title="^Installateur My UCA")
        dr = rect_of(title="^Installateur My UCA")
        fin = dlg_btn("Fermer", "^Installateur My UCA") or at(dr, 502, 420, 116, 36)
        finish(raw, f"inst-{len(steps) + 1:02d}", [box(at(dr, 24, 164, 588, 230), 6), num(at(dr, 24, 164, 588, 230), 1), box(fin, 6), num(fin, 2)], crop=(max(0, dr[0] - 40), max(0, dr[1] - 40), min(2560, dr[2] + 80), min(1516, dr[3] + 80)))
        step(len(steps) + 1, "L'installation est terminée", "Le journal indique chaque étape réussie : version trouvée, fichiers installés, navigateurs ouverts. Clique sur « Fermer ». L'installateur ouvre aussi, dans chaque navigateur, la page de l'extension et une page de remerciement.", "Tu sais ainsi que tout s'est bien passé, sans avoir à deviner.", f"inst-{len(steps) + 1:02d}")
        set_expect("^Installateur My UCA")
        click_screen(fin[0] + fin[2] // 2, fin[1] + fin[3] // 2); time.sleep(1)

        # 10 : Chrome ouvert sur chrome://extensions (ce que fait l'installateur)
        c.foreground()
        c.page.goto("chrome://extensions"); c.page.wait_for_timeout(1800)
        clean_ext(c.page)
        js = "() => { const m = document.querySelector('extensions-manager'); const t = m.shadowRoot.querySelector('extensions-toolbar'); const e = t.shadowRoot.querySelector('#devMode'); const r = e.getBoundingClientRect(); const d = devicePixelRatio; return [(screenX + r.left) * d, (screenY + (outerHeight - innerHeight) + r.top) * d, r.width * d, r.height * d]; }"
        dev = tuple(round(x) for x in c.page.evaluate(js))
        raw = RAW / "i10.png"; c.shot(raw)
        finish(raw, f"inst-{len(steps) + 1:02d}", [box(dev, 8), num(dev, 1)])
        step(len(steps) + 1, "Chrome s'ouvre sur la page des extensions", "L'installateur ouvre chrome://extensions. Active « Mode développeur » en haut à droite.", "C'est la seule étape manuelle : Chrome l'exige pour toute extension hors Chrome Web Store.", f"inst-{len(steps) + 1:02d}")
        c.foreground()
        click_screen(dev[0] + dev[2] // 2, dev[1] + dev[3] // 2); time.sleep(1.2)
        clean_ext(c.page)
        js2 = js.replace("#devMode", "#loadUnpacked")
        lu = tuple(round(x) for x in c.page.evaluate(js2))
        raw = RAW / "i11.png"; c.shot(raw)
        finish(raw, f"inst-{len(steps) + 1:02d}", [box(lu, 8), num(lu, 2)])
        step(len(steps) + 1, "Clique sur « Charger l'extension non empaquetée »", "Le bouton apparaît à gauche de la page. Dans la fenêtre qui s'ouvre, colle le chemin du dossier (Ctrl+V : l'installateur l'a copié pour toi) puis valide avec Entrée.", "Chrome charge l'extension depuis le dossier installé par l'assistant.", f"inst-{len(steps) + 1:02d}")
        c.foreground()
        click_screen(lu[0] + lu[2] // 2, lu[1] + lu[3] // 2); time.sleep(3)
        set_expect("Sélectionner|répertoire|dossier")
        sendkeys(str(inst / "chrome")); time.sleep(0.8)
        title_re = "Sélectionner|dossier|extension|Choisir"
        raw = RAW / "i12.png"; full(raw, title=title_re)
        dr = rect_of(title=title_re)
        finish(raw, f"inst-{len(steps) + 1:02d}", [], blur=[(dr[0], dr[1] + int(dr[3] * 0.48), int(dr[2] * 0.2), int(dr[3] * 0.5))], crop=(max(0, dr[0] - 40), max(0, dr[1] - 40), min(2560, dr[2] + 80), min(1516, dr[3] + 80)))
        step(len(steps) + 1, "Choisis le dossier installé", "Le chemin du dossier d'installation (sous-dossier « chrome ») est saisi. Clique sur « Sélectionner un dossier ».", "C'est le dossier que l'installateur vient de remplir avec la dernière version.", f"inst-{len(steps) + 1:02d}")
        confirm_folder(title_re); time.sleep(3)

        # 13 : bienvenue
        welcome = None
        for _ in range(12):
            tabs = [p for p in c.ctx.pages]
            welcome = next((p for p in tabs if "choose.html" in p.url), None)
            if welcome:
                break
            time.sleep(0.5)
        if welcome:
            welcome.bring_to_front(); welcome.wait_for_timeout(1800)
            c.page = welcome
        raw = RAW / "i13.png"; c.shot(raw)
        finish(raw, f"inst-{len(steps) + 1:02d}", [])
        step(len(steps) + 1, "La page de bienvenue de l'extension", "L'extension s'ouvre sur « Choisis ton design » : c'est le premier lien de connexion. Choisis un design, puis « Synchroniser » pour te connecter à Odin.", "Cette page prouve que l'extension est bien chargée dans ce navigateur.", f"inst-{len(steps) + 1:02d}")

        # 14 : page de remerciement
        c.page = c.ctx.new_page(); c.page.goto(SITE + "merci.html?v=1.46.30"); c.page.wait_for_timeout(2500)
        raw = RAW / "i14.png"; c.shot(raw)
        btn = c.box("#btnStart")
        finish(raw, f"inst-{len(steps) + 1:02d}", [box(btn, 8), num(btn, 1)] if btn else [])
        step(len(steps) + 1, "La page de remerciement", "Dans un second onglet, l'installateur ouvre une page de remerciement : premiers pas, aide, tutoriel et, si tu veux, un don pour soutenir le projet.", "Un coup d'œil aux premiers pas t'évite de chercher où cliquer.", f"inst-{len(steps) + 1:02d}")
    finally:
        pass
    return c, steps, step


# ============================================================================================================== PAGE
def esc(s):
    return (s or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")


def render_page():
    data = json.loads(STEPS.read_text(encoding="utf-8"))
    order = [("zip", "Le ZIP", "Chrome · mode développeur"), ("installateur", "L'installateur", "Windows · fenêtre guidée"), ("pwa", "Sur téléphone", "Application web (PWA)")]
    tabs, panels = [], []
    for i, (k, short, sub) in enumerate(order):
        d = data.get(k)
        if not d:
            continue
        tabs.append(f'<button type="button" class="tab" role="tab" id="tab-{k}" aria-controls="p-{k}" aria-selected="{"true" if not tabs else "false"}" data-tab="{k}"><b>{esc(short)}</b><span>{esc(sub)}</span><i>{len(d["steps"])} étapes</i></button>')
        cards = []
        for s in d["steps"]:
            cards.append(f"""<article class="st" id="{k}-{s['n']}">
  <div class="st-head"><span class="n">{s['n']}</span><h3>{esc(s['title'])}</h3></div>
  <button type="button" class="shot" data-full="{esc(s['img'])}" data-cap="Étape {s['n']} : {esc(s['title'])}"><img src="{esc(s['img'])}" alt="Capture d'écran, étape {s['n']} : {esc(s['title'])}" loading="lazy"><span class="zoom">Agrandir</span></button>
  <div class="st-txt"><p><b>Ce que tu fais.</b> {esc(s['what'])}</p><p class="why"><b>À quoi ça sert.</b> {esc(s['why'])}</p></div>
</article>""")
        panels.append(f'<section class="panel" role="tabpanel" id="p-{k}" aria-labelledby="tab-{k}"{"" if len(panels) == 0 else " hidden"}><h2>{esc(d["title"])}</h2><p class="intro">{esc(d["intro"])}</p><div class="steps">{"".join(cards)}</div></section>')
    html = f"""<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Aide à l'installation — Emploi du temps UCA</title>
<meta name="description" content="Installer l'extension Emploi du temps UCA pas à pas, en images : avec le ZIP, avec l'installateur Windows, ou l'application sur téléphone.">
<link rel="canonical" href="https://kiricoucou.github.io/uca-extension/installation.html">
<link rel="icon" type="image/png" href="app/icons/icon-192.png">
<link rel="stylesheet" href="site.css">
<link rel="stylesheet" href="site-theme.css">
<style>
.ins{{max-width:1080px;margin:0 auto;padding:28px 16px 70px}}
.ins h1{{font-size:clamp(28px,5vw,44px);margin:0 0 8px;letter-spacing:-.03em}}
.ins .lead{{color:var(--text-dim);font-size:18px;max-width:720px;margin:0 0 22px}}
.tabs{{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px;margin:0 0 26px}}
.tab{{display:flex;flex-direction:column;gap:2px;text-align:left;padding:14px 16px;border-radius:16px;border:1px solid var(--border);background:var(--surface);color:var(--text);font:inherit;cursor:pointer}}
.tab b{{font-size:17px}}.tab span{{color:var(--text-dim);font-size:14px}}.tab i{{font-style:normal;color:var(--accent);font-weight:700;font-size:13px;margin-top:4px}}
.tab[aria-selected="true"]{{border-color:var(--accent);background:var(--accent-tint)}}
.panel h2{{font-size:26px;margin:0 0 6px}}.intro{{color:var(--text-dim);margin:0 0 22px;max-width:720px}}
.steps{{display:grid;gap:22px}}
.st{{background:var(--surface);border:1px solid var(--border);border-radius:20px;padding:18px;box-shadow:var(--shadow)}}
.st-head{{display:flex;align-items:center;gap:12px;margin-bottom:12px}}
.st-head .n{{flex:none;width:38px;height:38px;border-radius:50%;display:grid;place-items:center;background:var(--accent);color:var(--on-accent);font-weight:800}}
.st-head h3{{margin:0;font-size:20px}}
.shot{{display:block;position:relative;width:100%;padding:0;border:1px solid var(--border);border-radius:14px;overflow:hidden;background:var(--surface-2);cursor:zoom-in}}
.shot img{{display:block;width:100%;height:auto}}
.shot .zoom{{position:absolute;right:10px;bottom:10px;font-size:12px;font-weight:700;padding:5px 10px;border-radius:999px;background:rgba(9,9,11,.8);color:#fff}}
.st-txt p{{margin:12px 0 0}}.st-txt .why{{color:var(--text-dim)}}
.lb{{position:fixed;inset:0;z-index:3000;background:rgba(9,9,11,.88);display:flex;align-items:center;justify-content:center;padding:56px 14px 20px}}.lb[hidden]{{display:none}}
.lb figure{{margin:0;max-width:min(1500px,100%);display:flex;flex-direction:column;align-items:center;gap:10px}}
.lb img{{max-width:100%;max-height:calc(100vh - 120px);border-radius:12px;background:#fff}}.lb figcaption{{color:#e6e8ee;font-size:14px;text-align:center}}
.lb button{{position:absolute;top:12px;right:12px;width:46px;height:46px;border-radius:50%;border:0;background:#fff;color:#16181d;font-size:22px;font-weight:700;cursor:pointer}}
.note{{margin-top:26px;padding:16px 18px;border-radius:16px;background:var(--accent-tint);color:var(--text)}}
</style>
</head>
<body>
<main class="ins">
  <h1>Aide à l'installation</h1>
  <p class="lead">Installe l'extension (ou l'application) pas à pas : chaque étape a sa capture d'écran réelle, avec l'endroit où cliquer entouré en rouge, ce que tu fais et à quoi ça sert.</p>
  <div class="tabs" role="tablist" aria-label="Méthode d'installation">{"".join(tabs)}</div>
  {"".join(panels)}
  <p class="note">Besoin d'aide ? Va sur la <a href="aide.html">page d'aide</a> ou la <a href="extension/">page de téléchargement</a>. Les captures sont de vraies fenêtres (Chrome, Explorateur de fichiers, assistant d'installation) ; les chemins affichés sont des exemples : tu peux choisir un autre dossier.</p>
</main>
<div class="lb" id="lb" hidden><button type="button" id="lbx" aria-label="Fermer">✕</button><figure><img id="lbi" alt=""><figcaption id="lbc"></figcaption></figure></div>
<script>
(function () {{
  var tabs = document.querySelectorAll('.tab'), panels = document.querySelectorAll('.panel');
  function show(k) {{ tabs.forEach(function (t) {{ t.setAttribute('aria-selected', String(t.dataset.tab === k)); }}); panels.forEach(function (p) {{ p.hidden = p.id !== 'p-' + k; }}); try {{ history.replaceState(null, '', '#' + k); }} catch (e) {{}} }}
  tabs.forEach(function (t) {{ t.addEventListener('click', function () {{ show(t.dataset.tab); }}); }});
  var h = (location.hash || '').replace('#', '').split('-')[0]; if (h && document.getElementById('p-' + h)) show(h);
  var lb = document.getElementById('lb'), li = document.getElementById('lbi'), lc = document.getElementById('lbc');
  document.querySelectorAll('.shot').forEach(function (b) {{ b.addEventListener('click', function () {{ li.src = b.dataset.full; li.alt = b.querySelector('img').alt; lc.textContent = b.dataset.cap; lb.hidden = false; document.body.style.overflow = 'hidden'; }}); }});
  function close() {{ lb.hidden = true; li.removeAttribute('src'); document.body.style.overflow = ''; }}
  document.getElementById('lbx').addEventListener('click', close); lb.addEventListener('click', function (e) {{ if (e.target === lb) close(); }});
  document.addEventListener('keydown', function (e) {{ if (e.key === 'Escape' && !lb.hidden) close(); }});
}})();
</script>
<script src="site-nav.js" defer></script>
</body>
</html>
"""
    (ROOT / "installation.html").write_text(html, encoding="utf-8")
    log("installation.html", sum(len(d["steps"]) for d in data.values()), "étapes")


def main():
    which = sys.argv[1] if len(sys.argv) > 1 else "zip"
    if which == "page":
        render_page()
        return
    if which == "installateur":
        c, steps, step = flow_inst()
        c.close()
        save_steps("installateur", "Installer l'extension avec l'installateur Windows (.bat)", "Méthode automatique : une fenêtre te guide (dossiers, navigateurs, progression). Sans droits administrateur. Compte environ 2 minutes.", steps)
        log(len(steps), "étapes")
        render_page()
        render_page()
    if which == "zip":
        c, steps, step = flow_zip()
        c.close()
        save_steps("zip", "Installer l'extension avec le ZIP (Chrome, Edge, Brave)", "Méthode manuelle : tu télécharges le ZIP, tu le décompresses, puis tu charges le dossier dans Chrome en mode développeur. Compte environ 3 minutes.", steps)
        log(len(steps), "étapes")
        render_page()


if __name__ == "__main__":
    main()
