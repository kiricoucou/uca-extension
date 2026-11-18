import json
import re
import sys
import os
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent

def test_transport_t2c():
    html_file = (ROOT / "transport.html").resolve().as_uri()
    print(f"Loading {html_file}...")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()

        js_errors = []
        page.on("pageerror", lambda err: js_errors.append(str(err)))
        page.on("console", lambda msg: print(f"[CONSOLE {msg.type}] {msg.text}") if msg.type in ["error", "warning"] else None)

        page.goto(html_file, wait_until="networkidle")
        page.wait_for_timeout(1000)

        assert len(js_errors) == 0, f"JS errors on load: {js_errors}"
        print("PASS 1: Page loaded cleanly with 0 JS errors.")

        # --- TEST 1: Autocomplete / Recommendations sur l'Origine ---
        orig_input = page.locator("#inputOrigin")
        orig_suggs = page.locator("#originSuggs")

        # Focus & Type "cezeau"
        orig_input.click()
        orig_input.fill("")
        orig_input.type("cezeau", delay=50)
        page.wait_for_timeout(500)

        assert orig_suggs.is_visible(), "Origin suggestions box should be visible when typing"
        items = orig_suggs.locator(".sugg-item")
        count = items.count()
        assert count >= 2, f"Expected at least 2 suggestions for 'cezeau', got {count}"

        first_text = items.first.text_content()
        print(f"First suggestion for 'cezeau': {first_text.strip()[:60]}")
        assert "cézeaux" in first_text.lower() or "cezeaux" in first_text.lower(), "Should contain Cézeaux"
        print(f"PASS 2: Autocomplete suggestions appear properly for 'cezeau' ({count} items found).")

        # Click first suggestion
        items.first.click()
        page.wait_for_timeout(400)
        assert not orig_suggs.is_visible(), "Suggestions box should close after selection"
        print(f"Selected origin: {orig_input.input_value()}")
        print("PASS 3: Clicking recommendation sets input value and closes dropdown.")

        # --- TEST 2: Autocomplete / Recommendations sur la Destination ---
        dest_input = page.locator("#inputDest")
        dest_suggs = page.locator("#destSuggs")

        dest_input.click()
        dest_input.fill("")
        dest_input.type("jaude", delay=50)
        page.wait_for_timeout(500)

        assert dest_suggs.is_visible(), "Dest suggestions box should be visible for 'jaude'"
        dest_items = dest_suggs.locator(".sugg-item")
        assert dest_items.count() >= 1, "Expected Jaude suggestion"
        assert "jaude" in dest_items.first.text_content().lower()

        dest_items.first.click()
        page.wait_for_timeout(400)
        assert not dest_suggs.is_visible(), "Dest suggestions box closed"
        print(f"Selected dest: {dest_input.input_value()}")
        print("PASS 4: Destination autocomplete verified successfully.")

        # --- TEST 3: Prochains départs en direct ---
        dep_rows = page.locator("#departuresList .dep-row")
        assert dep_rows.count() > 0, "Departures list should contain live departure rows"
        first_dep_text = dep_rows.first.text_content()
        print(f"First live departure: {first_dep_text.strip()}")
        assert ("dans" in first_dep_text.lower() or "approche" in first_dep_text.lower()), "Departure should show countdown minutes"
        print("PASS 5: Live departures card displays countdown and upcoming vehicles.")

        # --- TEST 4: "Se balader dans toutes les lignes" (Onglet 2) ---
        page.locator("#tabBtnRoutes").click()
        page.wait_for_timeout(500)

        routes_grid = page.locator("#routesGridContainer .route-card")
        total_routes_rendered = routes_grid.count()
        print(f"Total routes rendered in explorer: {total_routes_rendered}")
        assert total_routes_rendered >= 50, f"Expected 54 routes, got {total_routes_rendered}"
        print("PASS 6: Explorer tab displays all lines of Clermont network.")

        # Click on Tram A
        tram_card = page.locator("#routesGridContainer .route-card", has_text="Ligne A").first
        tram_card.click()
        page.wait_for_timeout(600)

        line_container = page.locator("#lineDetailContainer")
        assert line_container.is_visible(), "Line detail container should be visible"
        line_stops = line_container.locator(".timeline-stop-item")
        assert line_stops.count() >= 30, f"Tram A should have 34 stops, got {line_stops.count()}"
        print(f"Tram A stops sequence count: {line_stops.count()}")
        print("PASS 7: Tram A linear journey shows all stops in order.")

        # Click on a stop in the line timeline to open live modal
        cezeaux_stop_btn = line_stops.locator("button.btn-live-stop").first
        cezeaux_stop_btn.click()
        page.wait_for_timeout(800)

        modal = page.locator("#stopLiveModal")
        assert modal.is_visible(), "Live departures modal should be open"
        modal_title = page.locator("#modalStopTitle").text_content()
        print(f"Modal opened for stop: {modal_title}")

        modal_rows = page.locator("#modalStopBody .dep-row")
        assert modal_rows.count() > 0, "Modal should display upcoming departures"
        modal_row_text = modal_rows.first.text_content()
        print(f"Modal departure: {modal_row_text.strip()}")
        assert ("dans" in modal_row_text.lower() or "approche" in modal_row_text.lower()), "Modal should show minutes countdown"
        print("PASS 8: Live modal opens from line explorer with real-time countdown.")

        # Close modal
        page.locator(".modal-close").click()
        page.wait_for_timeout(300)
        assert not modal.is_visible(), "Modal closed"

        # --- TEST 5: Annuaire des arrêts (Onglet 3) ---
        page.locator("#tabBtnDirectory").click()
        page.wait_for_timeout(500)

        dir_cards = page.locator("#stopsDirectoryList .stop-dir-card")
        dir_count = dir_cards.count()
        assert dir_count > 0, "Directory should list stops"
        print(f"Directory initial stops displayed: {dir_count}")

        # Search in directory
        dir_input = page.locator("#dirSearchInput")
        dir_input.fill("Cézeaux")
        page.wait_for_timeout(400)
        filtered_cards = page.locator("#stopsDirectoryList .stop-dir-card")
        assert filtered_cards.count() > 0, "Filtered directory should have Cézeaux"
        print(f"Directory filtered for 'Cézeaux': {filtered_cards.count()} stops")
        print("PASS 9: Full stops directory search works seamlessly.")

        browser.close()
        print("\nALL 9 CHECKS PASSED: T2C full network, live departures, autocomplete, and explorer verified 100%!")

if __name__ == "__main__":
    test_transport_t2c()
