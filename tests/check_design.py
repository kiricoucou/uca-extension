"""Vérifie que chaque design du registre fournit tous les éléments (id) utilisés par le core.

Usage : python -I -X utf8 tests/check_design.py
"""
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from harness import ROOT, designs  # noqa: E402

# id optionnels : le core vérifie leur présence avant de s'en servir.
OPTIONAL = {"notesAvg", "moreBtn", "morePanel", "moreWrap", "updateOverlay", "updateBar", "updCurrent", "updLatest",
            "updApplyBtn", "designBtn", "settingsBtn", "noteArea", "lbImg", "ucaSheetBackdrop", "phoneBtn", "phoneOverlay", "phoneClose", "phoneQrApp", "phoneFile", "phoneStart", "phoneQrData", "phoneCounter"}
VIEW_IDS = {"dayView", "threeDayView", "fiveDayView", "sixDayView", "weekView", "monthView"}


def ids_used(js_file):
    return set(re.findall(r'\$\("([A-Za-z][\w-]*)"\)', (ROOT / js_file).read_text(encoding="utf-8")))


def main():
    pages = {"agenda.html": ids_used("core/agenda.js") - OPTIONAL - VIEW_IDS,
             "popup.html": ids_used("core/popup.js") - OPTIONAL}
    failures = 0
    for d in designs():
        folder = ROOT / d["folder"]
        for page, required in pages.items():
            html = (folder / page).read_text(encoding="utf-8")
            present = set(re.findall(r'\bid="([\w-]+)"', html))
            missing = sorted(required - present)
            scripts = re.findall(r'<script src="([^"]+)"', html)
            order_ok = scripts[-2:] == ["design.js", f"../../core/{page.replace('.html', '.js')}"] and "../../core/shared.js" in scripts
            if page == "agenda.html":
                order_ok = order_ok and scripts[0] == "../../core/env.js" and all(x in scripts for x in ("../../core/settings.js", "../../core/transfer.js", "../../vendor/qrcode.js"))
                if not (VIEW_IDS & present):
                    missing.append("(au moins une vue)")
            for shot in d.get("screenshots", []):
                if not (ROOT / shot["src"]).exists():
                    missing.append("capture " + shot["src"])
            status = "OK " if not missing and order_ok else "ERR"
            failures += status == "ERR"
            print(f"{status} {d['id']:<14} {page:<12} " + (f"manque : {', '.join(missing)}" if missing else "")
                  + ("" if order_ok else " scripts mal ordonnés"))
    sys.exit(1 if failures else 0)


if __name__ == "__main__":
    main()
