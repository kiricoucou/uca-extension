"""Notes Moodle, vérification avec Selenium (en plus de tests/moodle.py qui utilise Playwright) : l'extension est chargée dans
Chromium, l'agenda s'ouvre avec des données factices, puis on vérifie le panneau Notes (position sous la barre de la semaine,
« Dernière recherche : il y a … »), la fenêtre des notes traitées à droite, son bouton Fermer, le déplacement à la souris et
la mémorisation de la position.

Prérequis : pip install selenium (Selenium Manager récupère le pilote correspondant au navigateur).
Usage : python -I -X utf8 tests/moodle_selenium.py [chemin_de_chromium]
"""
import glob
import json
import os
import re
import sys
import tempfile
import time
from pathlib import Path

from selenium import webdriver
from selenium.webdriver import ActionChains
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait

sys.path.insert(0, str(Path(__file__).resolve().parent))
from fixtures import seed  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
results = []


def step(msg):
    print(f"... {msg}", flush=True)


def check(name, ok, detail=""):
    results.append(ok)
    print(("PASS " if ok else "FAIL ") + name + (f" — {detail}" if detail and not ok else ""), flush=True)


def find_chromium():
    if len(sys.argv) > 1:
        return sys.argv[1]
    base = os.path.join(os.environ.get("LOCALAPPDATA", ""), "ms-playwright")
    cands = sorted(glob.glob(os.path.join(base, "chromium-*", "chrome-win*", "chrome.exe")) + glob.glob(os.path.join(base, "chromium-*", "chrome-linux*", "chrome")))
    return cands[-1] if cands else None


def ev(label, coeff, note):
    return {"label": label, "key": label, "coeff": coeff, "note": note, "moy": None, "maxi": None, "mini": None}


RELEVE = {"ue": [{"label": "UE 1.1 Réaliser", "coeff": 1, "note": None, "matieres": [
    {"label": "R1.07 : Programmation", "coeff": 1, "note": None, "evals": [ev("DS (sur 20.0)", 1, 10)]},
    {"label": "R1.03 : Maths du signal", "coeff": 1, "note": None, "evals": [ev("QCM (sur 20.0)", 1, 8)]}]}]}


def item(i, course, title, raw, mx, matiere, how, status):
    return {"id": f"MDL|{i}|{title.lower()}", "courseId": str(i), "course": course, "title": title, "type": "Test", "raw": raw, "max": mx,
            "note20": round(raw / mx * 20, 3), "feedback": "", "matiere": matiere, "isNew": False, "how": how, "coeff": 1, "status": status, "at": 1, "decidedAt": None}


ITEMS = [
    item(1, "R107 - Programmation", "Résultats évaluation 1", 19, 20, "R1.07 : Programmation", "code", "validated"),
    item(2, "R107 - Programmation", "Quizz n°3", 7.9, 10, "R1.07 : Programmation", "code", "refused"),
    item(3, "Maths 1: outils pour le signal", "Evaluation de rentrée", 14.5, 20, "R1.03 : Maths du signal", "proche", "pending"),
]


def main():
    exe = find_chromium()
    if not exe or not Path(exe).exists():
        print("Chromium introuvable : python -m playwright install chromium"); sys.exit(2)
    step(f"navigateur : {exe}")
    opts = Options()
    opts.binary_location = exe
    opts.add_argument("--headless=new")
    opts.add_argument(f"--load-extension={ROOT}")
    opts.add_argument(f"--disable-extensions-except={ROOT}")
    opts.add_argument(f"--user-data-dir={tempfile.mkdtemp()}")
    opts.add_argument("--window-size=1400,900")
    opts.add_argument("--host-resolver-rules=MAP odin.iut.uca.fr ~NOTFOUND, MAP ent.uca.fr ~NOTFOUND")
    step("démarrage de Selenium (Selenium Manager récupère le pilote correspondant au navigateur si besoin)")
    drv = webdriver.Chrome(options=opts)
    try:
        drv.set_window_size(1400, 900)
        step("recherche de l'identifiant de l'extension (service worker)")
        ext_id = None
        for _ in range(40):
            targets = drv.execute_cdp_cmd("Target.getTargets", {})["targetInfos"]
            sw = [t for t in targets if t["type"] == "service_worker" and t["url"].startswith("chrome-extension://")]
            if sw:
                ext_id = sw[0]["url"].split("/")[2]; break
            time.sleep(0.25)
        check("extension chargée dans le navigateur (service worker trouvé)", bool(ext_id), "aucun service worker")
        base = f"chrome-extension://{ext_id}"

        step("ouverture d'une page de l'extension et injection des données factices (cours, relevé, notes Moodle)")
        drv.get(f"{base}/choose.html")
        data = seed()
        data["uca_releve_notes"] = RELEVE
        data["uca_settings"] = {"moodleNotes": True}
        data["uca_design"] = "studio"
        data["uca_moodle"] = {"sync": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(time.time() - 7 * 60)), "items": {i["id"]: i for i in ITEMS}}
        drv.set_script_timeout(20)
        drv.execute_async_script("const [d, done] = [arguments[0], arguments[arguments.length - 1]]; chrome.storage.local.set(d, () => done(true));", data)

        step("ouverture de l'agenda (design Studio) et du panneau Notes")
        drv.get(f"{base}/designs/studio/agenda.html")
        drv.execute_script("localStorage.removeItem('uca_notes_geom_v1')")
        drv.refresh()
        WebDriverWait(drv, 15).until(lambda d: d.find_element(By.ID, "notesBtn"))
        time.sleep(0.8)
        drv.find_element(By.ID, "notesBtn").click(); time.sleep(0.6)
        panel = drv.find_element(By.ID, "notesPanel")
        check("panneau Notes ouvert", panel.is_displayed())

        step("mesure : le panneau doit être à 10 px sous la barre « Semaine du … »")
        gap = drv.execute_script("const p = document.getElementById('notesPanel').getBoundingClientRect(), s = document.getElementById('weekSubLabel').getBoundingClientRect(); return [p.top - s.bottom, getComputedStyle(document.getElementById('notesPanel')).position];")
        check("panneau Notes à 10 px sous la barre de la semaine", abs(gap[0] - 10) <= 1.5 and gap[1] == "fixed", str(gap))

        step("lecture de « Dernière recherche : il y a … » à côté du bouton « Chercher sur Moodle »")
        ago = drv.find_element(By.ID, "moodleAgo").text
        check("« Dernière recherche : il y a 7 minutes » affiché", re.fullmatch(r"Dernière recherche : il y a [67] minutes?", ago) is not None, ago)
        sync_bg = drv.execute_script("return getComputedStyle(document.getElementById('moodleSyncBtn')).backgroundColor")
        check("bouton « Chercher sur Moodle » en bleu", sync_bg == "rgb(31, 111, 235)", sync_bg)

        step("ouverture des notes traitées : une fenêtre à droite de l'écran, le panneau Notes reste à gauche")
        drv.find_element(By.ID, "moodleDoneToggle").click(); time.sleep(0.5)
        side = drv.find_element(By.ID, "moodleSide")
        geo = drv.execute_script("const s = document.getElementById('moodleSide').getBoundingClientRect(), p = document.getElementById('notesPanel').getBoundingClientRect(); return {gap: window.innerWidth - s.right, w: s.width, left: s.left, pr: p.right, inPanel: document.querySelectorAll('#notesPanel .np-moodle-edit').length, inSide: document.querySelectorAll('#moodleSide .np-moodle-edit').length};")
        check("fenêtre des notes traitées collée à droite (12 px du bord)", side.is_displayed() and (abs(geo["gap"] - 12) <= 1.5 or geo["w"] >= 898) and 360 <= geo["w"] <= 902, str(geo))
        check("fenêtre de droite à 15 px du panneau Notes, seule la note validée y est (la refusée est à la corbeille)", geo["inSide"] == 1 and geo["inPanel"] == 0 and 13 <= geo["left"] - geo["pr"] <= 17, str(geo))
        green = drv.execute_script("return getComputedStyle(document.querySelector('.np-moodle-edit[data-status=validated]')).borderTopColor")
        check("note validée en vert", green == "rgb(22, 138, 85)", green)
        step("ouverture de la corbeille (bouton à côté de Fermer)")
        btn = drv.find_element(By.ID, "moodleTrashBtn")
        near = drv.execute_script("const t = document.getElementById('moodleTrashBtn').getBoundingClientRect(), c = document.getElementById('moodleSideClose').getBoundingClientRect(); return c.left - t.right;")
        check("bouton Corbeille juste à côté de Fermer", 0 <= near <= 16, str(near))
        btn.click(); time.sleep(0.4)
        rows = drv.find_elements(By.CSS_SELECTOR, "#moodleSide .np-moodle-trash-row")
        red = drv.execute_script("return getComputedStyle(document.querySelector('.np-moodle-trash-row')).borderTopColor")
        check("corbeille : la note refusée y est, en rouge", len(rows) == 1 and red == "rgb(209, 52, 58)", f"{len(rows)} {red}")
        step("restauration de la note depuis la corbeille")
        rows[0].find_element(By.XPATH, ".//button[contains(., 'Restaurer')]").click(); time.sleep(0.5)
        status = drv.execute_async_script("const done = arguments[arguments.length - 1]; chrome.storage.local.get('uca_moodle', (d) => done(Object.values(d.uca_moodle.items).map((i) => i.title + ':' + i.status)));")
        check("restaurée : la note repasse en attente", "Quizz n°3:pending" in status, str(status))
        drv.find_element(By.ID, "moodleTrashBtn").click(); time.sleep(0.3)

        step("clic sur « Fermer » en haut à droite de la fenêtre de droite")
        drv.find_element(By.ID, "moodleSideClose").click(); time.sleep(0.4)
        check("« Fermer » ferme seulement la fenêtre de droite, le panneau Notes reste ouvert",
              not drv.find_elements(By.ID, "moodleSide") and drv.find_element(By.ID, "notesPanel").is_displayed())

        step("déplacement du panneau Notes à la souris par sa barre")
        bar = drv.find_element(By.CSS_SELECTOR, ".np-dragbar")
        before = drv.execute_script("const p = document.getElementById('notesPanel'); return [p.offsetLeft, p.offsetTop];")
        ActionChains(drv).move_to_element(bar).click_and_hold().move_by_offset(120, 90).move_by_offset(60, 40).release().perform(); time.sleep(0.4)
        after = drv.execute_script("const p = document.getElementById('notesPanel'); return [p.offsetLeft, p.offsetTop];")
        check("panneau Notes déplaçable à la souris", abs((after[0] - before[0]) - 180) <= 4 and abs((after[1] - before[1]) - 130) <= 4, f"{before} -> {after}")
        saved = drv.execute_script("return localStorage.getItem('uca_notes_geom_v1')")
        check("position mémorisée", bool(saved) and abs(json.loads(saved)["x"] - after[0]) <= 2, str(saved))
        drv.execute_script("localStorage.removeItem('uca_notes_geom_v1')")

        step("aucune erreur JavaScript dans la console")
        logs = []
        try:
            logs = [l for l in drv.get_log("browser") if l.get("level") == "SEVERE"]
        except Exception:
            pass
        check("aucune erreur JavaScript sévère", not logs, str(logs[:2]))
    finally:
        drv.quit()
    print(f"\n{sum(results)}/{len(results)} vérifications OK", flush=True)
    sys.exit(0 if all(results) else 1)


main()
