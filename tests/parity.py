"""Vérifie que manifest.json (Chrome) et manifest.firefox.json restent en phase : mêmes
permissions, host_permissions et content_scripts. Les champs qui DOIVENT différer entre les deux
navigateurs (background, browser_specific_settings) sont ignorés ici volontairement.

Usage : python -I -X utf8 tests/parity.py
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
results = []


def check(name, ok, detail=""):
    results.append(ok)
    print(("PASS " if ok else "FAIL ") + name + (f" — {detail}" if detail and not ok else ""))


def main():
    a = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))
    b = json.loads((ROOT / "manifest.firefox.json").read_text(encoding="utf-8"))

    check("même version", a["version"] == b["version"], f"{a['version']} vs {b['version']}")
    check("mêmes permissions", set(a["permissions"]) == set(b["permissions"]), str(set(a["permissions"]) ^ set(b["permissions"])))
    check("mêmes host_permissions", set(a["host_permissions"]) == set(b["host_permissions"]), str(set(a["host_permissions"]) ^ set(b["host_permissions"])))
    check("mêmes content_scripts", a["content_scripts"] == b["content_scripts"], str(a["content_scripts"]))
    check("même popup/icônes (action)", a["action"] == b["action"], str(a["action"]))

    check("Firefox : background par scripts (pas de service worker)", "scripts" in b.get("background", {}))
    check("Firefox : background.scripts inclut background.js", "background.js" in b["background"]["scripts"])
    check("Firefox : identifiant gecko déclaré", bool(b.get("browser_specific_settings", {}).get("gecko", {}).get("id")))
    check("Chrome : background par service_worker", "service_worker" in a.get("background", {}))

    for s in b["background"]["scripts"]:
        check(f"Firefox : {s} existe", (ROOT / s).exists())

    print(f"\n{sum(results)}/{len(results)} vérifications OK")
    sys.exit(0 if all(results) else 1)


if __name__ == "__main__":
    main()
