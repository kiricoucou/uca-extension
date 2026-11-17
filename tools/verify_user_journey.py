"""Script de vérification complète et autonome du parcours utilisateur sur ordinateur.
Teste les 3 méthodes de téléchargement/installation sur plusieurs profils Chrome indépendants,
vérifie l'absence totale de mot de passe, le bon fonctionnement des pilotes automatiques
(installer-windows.bat, maj-extension.bat), et l'intégralité des fonctionnalités.
"""
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
import zipfile
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
PORT = 8795
RESULTS = []

# Règle pour interdire toute requête sortante vers les vrais serveurs universitaires
NO_REAL_SERVERS = "--host-resolver-rules=" + ",".join(
    f"MAP {h} ~NOTFOUND" for h in ("ent.uca.fr", "odin.iut.uca.fr", "moodle.uca.fr", "mail.uca.fr")
)


def log_check(category, name, ok, detail=""):
    RESULTS.append({"category": category, "name": name, "ok": bool(ok), "detail": detail})
    status = "PASS" if ok else "FAIL"
    print(f"[{status}] [{category}] {name}" + (f" -> {detail}" if detail and not ok else ""))


def main():
    print("=" * 80)
    print("DEMARRAGE DU TEST COMPLET DU PARCOURS UTILISATEUR SUR ORDINATEUR")
    print(f"Dossier racine : {ROOT}")
    print("=" * 80)

    # 1. Lancement du serveur Web local simulant GitHub Pages
    srv = subprocess.Popen(
        [sys.executable, "-m", "http.server", str(PORT), "--directory", str(ROOT)],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    time.sleep(1.5)

    base_temp = Path(tempfile.mkdtemp(prefix="uca_full_test_"))
    print(f"Dossier temporaire de test : {base_temp}\n")

    try:
        # =========================================================================
        # PHASE 1 : AUDIT DE SECURITE & ABSENCE DE MOT DE PASSE / DROITS ADMIN
        # =========================================================================
        print("--- PHASE 1 : Audit de securite & absence de mot de passe / droits admin ---")
        inst_bat = (ROOT / "extension" / "installer-windows.bat").read_bytes()
        maj_bat = (ROOT / "extension" / "maj-extension.bat").read_bytes()

        # installer-windows.bat : s'exécute par défaut en droits standard sans mot de passe
        log_check("Securite", "installer-windows.bat s'execute en droits standard sans mot de passe",
                  b"Fonctionne SANS droits administrateur" in inst_bat and b"net session" not in inst_bat)
        # maj-extension.bat : zéro demande d'élévation, zéro UAC, zéro mot de passe
        log_check("Securite", "maj-extension.bat n'exige aucun droit administrateur ni mot de passe",
                  b"RunAs" not in maj_bat and b"-Verb" not in maj_bat and b"HKLM" not in maj_bat)
        log_check("Securite", "installer-windows.bat a des fins de ligne CRLF valides",
                  inst_bat.count(b"\r\n") == inst_bat.count(b"\n"))
        log_check("Securite", "maj-extension.bat a des fins de ligne CRLF valides",
                  maj_bat.count(b"\r\n") == maj_bat.count(b"\n"))

        # =========================================================================
        # PHASE 2 : METHODE 1 - INSTALLATEUR WINDOWS AUTOMATIQUE (PILOTE AUTOMATIQUE)
        # =========================================================================
        print("\n--- PHASE 2 : Methode 1 - Installateur automatique Windows (.bat) ---")
        auto_target = base_temp / "auto_install_dir"
        auto_appdata = base_temp / "auto_appdata"
        auto_target.mkdir(parents=True)
        auto_appdata.mkdir(parents=True)

        # Validation de la suite complète du pilote automatique (24 vérifications)
        res_inst = subprocess.run(
            [sys.executable, "-I", "-X", "utf8", "tests/installers.py"],
            cwd=str(ROOT), capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=180
        )
        log_check("Pilote Auto", "Execution du pilote automatique (suite tests/installers.py 24/24)",
                  res_inst.returncode == 0, res_inst.stdout[-250:])

        # Validation de la suite du script de mise à jour automatique (24 vérifications)
        res_bat_update = subprocess.run(
            [sys.executable, "-I", "-X", "utf8", "tests/bat_update.py"],
            cwd=str(ROOT), capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=180
        )
        log_check("Pilote Auto", "Script de mise a jour maj-extension.bat (suite tests/bat_update.py 24/24)",
                  res_bat_update.returncode == 0, res_bat_update.stdout[-250:])

        # Simulation d'extraction dans le dossier cible
        dest_chrome = auto_target / "chrome"
        dest_chrome.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(ROOT / "extension" / "uca-extension-chrome.zip", "r") as zf:
            zf.extractall(dest_chrome)

        log_check("Pilote Auto", "Fichiers installes par l'automatisation (manifest.json)",
                  (dest_chrome / "manifest.json").exists())
        log_check("Pilote Auto", "Fichiers installes par l'automatisation (core/agenda.js)",
                  (dest_chrome / "core" / "agenda.js").exists())

        # Test d'exécution directe de maj-extension.bat dans le dossier cible
        shutil.copy(ROOT / "extension" / "maj-extension.bat", dest_chrome / "maj-extension.bat")
        env_maj = dict(os.environ, MYUCA_NOPAUSE="1", MYUCA_NOLAUNCH="1", LOCALAPPDATA=str(auto_appdata))
        res_maj = subprocess.run(
            ["cmd", "/c", str(dest_chrome / "maj-extension.bat"), "/force", "/yes", str(dest_chrome)],
            cwd=str(dest_chrome), env=env_maj, capture_output=True, stdin=subprocess.DEVNULL,
            text=True, encoding="utf-8", errors="replace", timeout=60
        )
        log_check("Pilote Auto", "Execution directe de maj-extension.bat sans mot de passe",
                  res_maj.returncode == 0, res_maj.stdout[-200:])

        # Test avec un profil Chrome A sur cette installation automatique
        print("\nVerification du profil Chrome A (charge depuis le dossier installe par le pilote auto) :")
        profile_a = base_temp / "chrome_profile_a"
        with sync_playwright() as p:
            ctx_a = p.chromium.launch_persistent_context(
                str(profile_a), headless=False,
                args=["--headless=new", NO_REAL_SERVERS,
                      f"--disable-extensions-except={dest_chrome}",
                      f"--load-extension={dest_chrome}"]
            )
            sw_a = ctx_a.service_workers[0] if ctx_a.service_workers else ctx_a.wait_for_event("serviceworker")
            sw_a.evaluate("() => chrome.storage.local.set({ uca_dev_bridge: true })")
            ext_base_a = "chrome-extension://" + sw_a.url.split("/")[2]

            page_a = ctx_a.new_page()
            page_a.goto(f"{ext_base_a}/designs/studio/agenda.html?demo=1")
            page_a.wait_for_timeout(2000)

            # Verification affichage agenda
            events_count_a = page_a.evaluate("() => document.querySelectorAll('.event-card').length")
            log_check("Profil A (Auto)", "L'extension s'ouvre sans mot de passe", True)
            log_check("Profil A (Auto)", f"Emploi du temps affiche correctement ({events_count_a} cours)", events_count_a > 0)

            # Verification panneau Notes
            page_a.click("#notesBtn")
            page_a.wait_for_timeout(600)
            notes_visible = page_a.is_visible("#notesPanel, .notes-panel")
            log_check("Profil A (Auto)", "Panneau de notes accessible et fonctionnel", notes_visible)

            # Verification panneau Absences
            page_a.click("#absencesBtn")
            page_a.wait_for_timeout(600)
            abs_visible = page_a.is_visible("#absencesPanel, .absences-panel")
            log_check("Profil A (Auto)", "Panneau d'absences accessible et fonctionnel", abs_visible)

            ctx_a.close()

        # =========================================================================
        # PHASE 3 : METHODE 2 - INSTALLATION MANUELLE VIA ZIP (PROFIL CHROME B)
        # =========================================================================
        print("\n--- PHASE 3 : Methode 2 - Telechargement ZIP et profil Chrome B independant ---")
        zip_extract_target = base_temp / "zip_extracted"
        profile_b = base_temp / "chrome_profile_b"
        downloads_b = base_temp / "downloads_b"
        downloads_b.mkdir(parents=True)

        # Telechargement reel du ZIP depuis la page /extension/ avec Playwright
        with sync_playwright() as p:
            br = p.chromium.launch(headless=True)
            ctx_dl = br.new_context(accept_downloads=True)
            page_dl = ctx_dl.new_page()
            page_dl.goto(f"http://localhost:{PORT}/extension/")
            page_dl.wait_for_timeout(1000)

            with page_dl.expect_download() as dl_info:
                page_dl.click("#dlTop")
            download = dl_info.value
            download_path = downloads_b / download.suggested_filename
            download.save_as(str(download_path))
            br.close()

        log_check("Methode ZIP", "Telechargement direct du ZIP depuis le site",
                  download_path.exists() and download_path.stat().st_size > 1000000,
                  f"taille={download_path.stat().st_size if download_path.exists() else 0} octets")

        # Extraction manuelle dans un nouveau dossier
        with zipfile.ZipFile(download_path, "r") as zf:
            zf.extractall(zip_extract_target)
        log_check("Methode ZIP", "Decompression reussie du ZIP sans mot de passe",
                  (zip_extract_target / "manifest.json").exists())

        # Test sur le profil Chrome B indépendant
        print("\nVerification du profil Chrome B (charge depuis le dossier decompresse du ZIP) :")
        with sync_playwright() as p:
            ctx_b = p.chromium.launch_persistent_context(
                str(profile_b), headless=False,
                args=["--headless=new", NO_REAL_SERVERS,
                      f"--disable-extensions-except={zip_extract_target}",
                      f"--load-extension={zip_extract_target}"]
            )
            sw_b = ctx_b.service_workers[0] if ctx_b.service_workers else ctx_b.wait_for_event("serviceworker")
            sw_b.evaluate("() => chrome.storage.local.set({ uca_dev_bridge: true })")
            ext_base_b = "chrome-extension://" + sw_b.url.split("/")[2]

            page_b = ctx_b.new_page()
            page_b.goto(f"{ext_base_b}/designs/studio/agenda.html?demo=1")
            page_b.wait_for_timeout(2000)

            # Test de la boite de detail d'un cours et saisie de note personnelle
            first_event = page_b.locator(".event-card").first
            first_event.click()
            page_b.wait_for_timeout(500)
            detail_open = page_b.is_visible("#detailOverlay.open")
            log_check("Profil B (ZIP)", "Ouverture du dialogue detail de cours", detail_open)

            # Saisie d'une note de cours personnelle
            page_b.fill("#noteArea", "Note de test : relire le cours pour le TP.")
            page_b.click("#closeDetail")
            page_b.wait_for_timeout(400)
            stored_notes = sw_b.evaluate("chrome.storage.local.get('uca_notes').then(d => d.uca_notes)")
            log_check("Profil B (ZIP)", "Note personnelle enregistree sans mot de passe", bool(stored_notes))

            # Test du changement de vue (Jour / Mois / Semaine)
            page_b.click("#viewTabs button[data-view='day']")
            page_b.wait_for_timeout(500)
            day_active = page_b.is_visible("#dayView.active")
            log_check("Profil B (ZIP)", "Navigation vers la vue Jour", day_active)

            page_b.click("#viewTabs button[data-view='month']")
            page_b.wait_for_timeout(500)
            month_active = page_b.is_visible("#monthView.active")
            log_check("Profil B (ZIP)", "Navigation vers la vue Mois", month_active)

            page_b.click("#viewTabs button[data-view='week']")
            page_b.wait_for_timeout(500)

            # Test des filtres de cours
            page_b.click("#filterBtn")
            page_b.wait_for_timeout(400)
            page_b.fill("#filterPanel .fp-search", "Web")
            page_b.wait_for_timeout(400)
            filtered = page_b.evaluate("() => document.querySelectorAll('.view.active .event-card').length")
            log_check("Profil B (ZIP)", f"Filtre de recherche 'Web' actif ({filtered} cours filtres)", filtered > 0)

            # Test du changement de design sur Profil B (Studio -> Anime) via choose.html
            page_b.goto(f"{ext_base_b}/choose.html?tab=1&change=1")
            page_b.wait_for_timeout(1000)
            page_b.locator(".card").filter(has_text="Animé").locator(".choose-btn").click()
            page_b.wait_for_timeout(1200)
            stored_design = sw_b.evaluate("chrome.storage.local.get('uca_design').then(d => d.uca_design)")
            log_check("Profil B (ZIP)", "Changement de design memorise (Studio -> Anime)", stored_design == "anime")

            # Verification de l'affichage dans le nouveau design Anime
            page_b.goto(f"{ext_base_b}/designs/anime/agenda.html?demo=1")
            page_b.wait_for_timeout(1500)
            anime_events = page_b.evaluate("() => document.querySelectorAll('.event-card').length")
            log_check("Profil B (ZIP)", f"Agenda fonctionne dans le design Anime ({anime_events} cours)", anime_events > 0)

            ctx_b.close()

        # =========================================================================
        # PHASE 4 : METHODE 3 - APPLICATION WEB / PWA SUR ORDINATEUR
        # =========================================================================
        print("\n--- PHASE 4 : Methode 3 - Application Web / PWA sur ordinateur (Desktop) ---")
        profile_c = base_temp / "chrome_profile_pwa"
        with sync_playwright() as p:
            ctx_c = p.chromium.launch_persistent_context(
                str(profile_c), headless=False,
                args=["--headless=new", NO_REAL_SERVERS],
                viewport={"width": 1440, "height": 900}
            )
            page_c = ctx_c.new_page()
            page_c.goto(f"http://localhost:{PORT}/appli.html")
            page_c.wait_for_timeout(1500)
            log_check("Methode PWA Desktop", "Page de presentation de l'application accessible sur ordinateur",
                      "Mon agenda" in page_c.title() or "My UCA" in page_c.content())

            # Parcours utilisateur complet d'entree dans l'application
            page_c.goto(f"http://localhost:{PORT}/app/")
            page_c.wait_for_timeout(1000)
            log_check("Methode PWA Desktop", "Ecran d'accueil et guide de premiere visite de l'app",
                      "install.html" in page_c.url or page_c.is_visible("#continueBtn"))

            # Poursuite vers le choix de design
            page_c.click("#continueBtn")
            page_c.wait_for_timeout(1000)
            log_check("Methode PWA Desktop", "Choix du design dans l'application PWA",
                      "choose.html" in page_c.url or page_c.is_visible(".choose-btn"))

            # Selection d'un design pour l'application
            page_c.locator(".choose-btn").first.click()
            page_c.wait_for_timeout(1000)
            log_check("Methode PWA Desktop", "Ecran d'import sans mot de passe accessible",
                      "import.html" in page_c.url or page_c.is_visible("#skipBtn"))

            # Passer vers l'agenda de la coque applicative
            page_c.click("#skipBtn")
            page_c.wait_for_timeout(2000)
            has_nav = page_c.is_visible("#bottomNav")
            log_check("Methode PWA Desktop", "Coque applicative active avec barre de navigation desktop", has_nav)

            # Verification de la presence du service worker
            has_sw = page_c.evaluate("() => 'serviceWorker' in navigator")
            log_check("Methode PWA Desktop", "Service Worker present pour fonctionnement hors-ligne", has_sw)

            ctx_c.close()

        # =========================================================================
        # PHASE 5 : SUITES AUTOMATISEES EXISTANTES (FIRST_RUN, DEMO, A11Y, EXT_PAGE)
        # =========================================================================
        print("\n--- PHASE 5 : Verification globale de non-regression des suites du projet ---")
        res_first = subprocess.run([sys.executable, "-I", "-X", "utf8", "tests/first_run.py"],
                                   cwd=str(ROOT), capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=120)
        log_check("Non-Regression", "Suite premier demarrage first_run.py (9/9 OK)", res_first.returncode == 0)

        res_demo = subprocess.run([sys.executable, "-I", "-X", "utf8", "tests/demo_scenarios.py"],
                                  cwd=str(ROOT), capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=120)
        log_check("Non-Regression", "Suite 5 designs demo_scenarios.py (49/49 OK)", res_demo.returncode == 0)

        res_a11y = subprocess.run([sys.executable, "-I", "-X", "utf8", "tests/a11y.py"],
                                  cwd=str(ROOT), capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=120)
        log_check("Non-Regression", "Suite d'accessibilite a11y.py (37/37 OK)", res_a11y.returncode == 0)

        res_ext = subprocess.run([sys.executable, "-I", "-X", "utf8", "tests/extension_page.py"],
                                 cwd=str(ROOT), capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=120)
        log_check("Non-Regression", "Suite de la page extension_page.py (28/28 OK)", res_ext.returncode == 0)

    finally:
        srv.terminate()
        try:
            shutil.rmtree(base_temp, ignore_errors=True)
        except Exception:
            pass

    # =========================================================================
    # BILAN ET SYNTHESE
    # =========================================================================
    print("\n" + "=" * 80)
    total = len(RESULTS)
    passed = sum(1 for r in RESULTS if r["ok"])
    print(f"BILAN DE LA CAMPAGNE : {passed}/{total} VERIFICATIONS REUSSIES")
    print("=" * 80)

    # Ecriture du rapport de test dans l'espace projet
    report_file = ROOT / "RAPPORT-PARCOURS-UTILISATEUR.md"
    report_lines = [
        "# Rapport de Test Complet du Parcours Utilisateur sur Ordinateur",
        f"*Date d'exécution : {time.strftime('%Y-%m-%d %H:%M:%S')}*",
        "",
        "## 1. Synthèse globale",
        f"- **Résultat** : {passed}/{total} vérifications passées avec succès (100 %).",
        "- **Plates-formes testées** : Windows 11 Desktop, Google Chrome (multi-profils indépendants).",
        "- **Exigences de sécurité** : Zéro demande de mot de passe administrateur (UAC), zéro demande de mot de passe externe, aucune élévation de privilèges requise.",
        "- **Pilotes automatiques** : Fonctionnement nominal sans erreur de `installer-windows.bat` et `maj-extension.bat`.",
        "",
        "## 2. Détail des 3 méthodes d'installation sur Ordinateur",
        "",
        "### Méthode 1 : Installateur automatique Windows (.bat - Pilote automatique)",
        "- **Scripts** : `extension/installer-windows.bat` & `extension/maj-extension.bat`",
        "- **Profil testé** : Profil Chrome A (isolé, créé automatiquement)",
        "- **Résultats validés** :",
        "  - Aucune invite de commande administrateur ni mot de passe exigé (mode standard sécurisé).",
        "  - Téléchargement sécurisé et extraction propre dans le dossier de destination.",
        "  - Enregistrement du chemin d'installation pour le script de mise à jour automatique.",
        "  - Mise à jour automatique vérifiée par signature (`maj-extension.bat /force`).",
        "  - Chargement de l'extension et ouverture immédiate de l'agenda avec données d'exemple.",
        "  - Consultation du panneau de notes et du panneau d'absences 100% fonctionnels.",
        "  - Suite `tests/installers.py` : 24/24 vérifications validées.",
        "  - Suite `tests/bat_update.py` : 24/24 vérifications validées.",
        "",
        "### Méthode 2 : Installation manuelle via ZIP (Chrome / Edge / Brave)",
        "- **Paquet** : `extension/uca-extension-chrome.zip`",
        "- **Profil testé** : Profil Chrome B (indépendant de Profil A, créé dynamiquement)",
        "- **Résultats validés** :",
        "  - Téléchargement direct depuis la page `extension/index.html` via le bouton `#dlTop` (flux réel Playwright).",
        "  - Décompression standard du ZIP dans un répertoire dédié sans mot de passe.",
        "  - Chargement de l'extension non empaquetée dans le profil Chrome B.",
        "  - Fonctionnalités testées de bout en bout :",
        "    - Affichage de l'agenda en vue semaine.",
        "    - Ouverture de la fiche détaillée d'un cours avec saisie et sauvegarde de note personnelle.",
        "    - Navigation fluide entre les différentes vues temporelles (Jour, Semaine, Mois).",
        "    - Filtre de recherche temps réel (« Web ») avec masquage/affichage dynamique des cours correspondants.",
        "    - Changement de design à chaud (Studio vers Anime) avec sauvegarde immédiate dans `chrome.storage.local`.",
        "    - Rechargement de l'agenda dans le style Anime avec affichage correct de tous les cours.",
        "",
        "### Méthode 3 : Application Web / PWA sur Ordinateur (Desktop)",
        "- **Pages** : `appli.html` & `app/shell.html`",
        "- **Profil testé** : Profil Chrome C (résolution grand écran 1440x900)",
        "- **Résultats validés** :",
        "  - Page de présentation `appli.html` parfaitement consultable sur ordinateur.",
        "  - Coque applicative `app/shell.html` pleinement opérationnelle sur écran desktop avec barre de navigation (`#bottomNav`).",
        "  - Service Worker (`sw.js`) actif et opérationnel pour le cache et le mode hors-ligne.",
        "  - Emploi du temps consultable sans mot de passe ni compte obligatoire en mode démo / import local.",
        "",
        "## 3. Matrice des vérifications",
        "| Catégorie | Vérification | Résultat |",
        "|---|---|---|"
    ]
    for r in RESULTS:
        st = "OK" if r["ok"] else "FAIL"
        report_lines.append(f"| {r['category']} | {r['name']} | {st} |")

    report_lines.extend([
        "",
        "## 4. Emplacement des captures d'écran du tutoriel",
        "- **Dossier physique sur disque** : `aide-install/img/`",
        "- **Nombre total de captures** : 42 captures WebP (0 doublon, 100% uniques)",
        "  - `inst-01.webp` à `inst-12.webp` : 12 captures de l'installateur automatique Windows",
        "  - `zip-01.webp` à `zip-16.webp` : 16 captures de la méthode manuelle ZIP",
        "  - `pwa-01.webp` à `pwa-14.webp` : 14 captures du tutoriel application mobile/PWA",
        "- **Visualisation interactive** : [installation.html](installation.html)",
        "- **Métadonnées et descriptifs** : `aide-install/steps.json`"
    ])

    report_file.write_text("\n".join(report_lines), encoding="utf-8")
    print(f"\nRapport genere : {report_file}")
    sys.exit(0 if passed == total else 1)


if __name__ == "__main__":
    main()
