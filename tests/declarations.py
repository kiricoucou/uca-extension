"""« Mes déclarations » de l'app Android : le JavaScript et l'expression régulière de UcaSync.kt sont extraits du
source Kotlin, exécutés sur une page Odin factice (bloc #id_liste_justifications) et comparés au résultat attendu
(le même que celui de l'extension, background.js parseDeclarations)."""
import json
import re
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
KT = (ROOT / "app/webview-app/app/src/main/java/fr/edtuca/app/UcaSync.kt").read_text(encoding="utf-8")
results = []


def check(name, ok, detail=""):
    results.append(bool(ok))
    print(("PASS " if ok else "FAIL ") + name + ("" if ok else f" — {detail}"))


PAGE = """<html><body><div id="id_liste_justifications">
• Du 08/10/2026 à 08h00 au 08/10/2026 à 12h00 (Déposée le 12/10/2026 à 14h33) <img alt="Justifiée" src="x.png"> Motif : Matinée découverte Neyrial informatique<br>
• Du 02/11/2026 à 8h00 au 03/11/2026 à 18h00 (Déposée le 04/11/2026 à 09h05) <img alt="Refusée" src="x.png"> Motif : Rendez-vous médical<br>
• Du 09/11/2026 à 13h30 au 09/11/2026 à 15h30 (Déposée le 10/11/2026 à 07h59) <img title="En attente de traitement" src="x.png">
</div></body></html>"""


def main():
    js = re.search(r'DECLARATIONS_JS = """(.*?)"""', KT, re.S).group(1)
    rx = re.search(r'DECLARATION_RE = Regex\(\s*"""(.*?)"""', KT, re.S).group(1)
    check("source Kotlin : script et expression trouvés", bool(js.strip()) and bool(rx))
    with sync_playwright() as p:
        b = p.chromium.launch(); pg = b.new_page()
        pg.set_content(PAGE)
        raw = pg.evaluate("() => " + js.strip())
        none = b.new_page(); none.set_content("<html><body>rien</body></html>")
        check("page sans bloc de déclarations : null (rien d'inventé)", none.evaluate("() => " + js.strip()) is None)
        b.close()
    entries = json.loads(raw)
    check("3 lignes lues dans le bloc caché", len(entries) == 3, str(len(entries)))
    check("statut lu dans l'icône (alt ou title)", [e["status"] for e in entries] == ["Justifiée", "Refusée", "En attente de traitement"], str([e["status"] for e in entries]))
    pat = re.compile(rx, re.I)
    ms = [pat.search(e["text"]) for e in entries]
    check("les 3 lignes reconnues par l'expression", all(ms), str([e["text"][:40] for e, m in zip(entries, ms) if not m]))
    m = ms[0]
    check("dates et horaires (exemple de la capture)", (m.group(1), m.group(2), m.group(3), m.group(4), m.group(5), m.group(6), m.group(7), m.group(8), m.group(9)) == ("08/10/2026", "08", "00", "08/10/2026", "12", "00", "12/10/2026", "14", "33"))
    check("motif lu", m.group(10).strip() == "Matinée découverte Neyrial informatique", str(m.group(10)))
    check("heure sur un chiffre (8h00) acceptée", ms[1].group(2) == "8" and ms[1].group(5) == "18")
    check("sans motif : groupe vide", not (ms[2].group(10) or "").strip())
    # Statuts : mêmes règles que l'extension (declarationStatus dans background.js).
    ktstat = re.search(r"private fun declarationStatus.*?\n    }\n", KT, re.S).group(0)
    check("règles de statut identiques à l'extension", all(s in ktstat for s in ('"refus|rejet"', '"attente|cours d\'examen|à traiter"', '"justifi|valid"', '"refusee"', '"attente"', '"justifiee"')))
    print(f"\n{sum(results)}/{len(results)} vérifications OK")
    sys.exit(0 if all(results) else 1)


if __name__ == "__main__":
    main()
