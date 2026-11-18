import json
from playwright.sync_api import sync_playwright

def inspect_t2c_live():
    with sync_playwright() as p:
        br = p.chromium.launch(headless=True)
        ctx = br.new_context(user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36")
        page = ctx.new_page()

        requests_log = []
        page.on("request", lambda r: requests_log.append({
            "url": r.url,
            "method": r.method,
            "post_data": r.post_data
        }))

        responses_log = []
        def handle_response(res):
            if any(k in res.url for k in ["api", "passage", "stop", "line", "ligne", "horaire", "realtime", "trip", "network"]):
                try:
                    text = res.text()[:500]
                    responses_log.append({"url": res.url, "status": res.status, "sample": text})
                except Exception:
                    pass
        page.on("response", handle_response)

        print("Navigation vers https://www.t2c.fr/se-deplacer/horaires-et-plans ...")
        page.goto("https://www.t2c.fr/se-deplacer/horaires-et-plans", timeout=30000, wait_until="networkidle")
        page.wait_for_timeout(3000)

        print("Nombre de requêtes initiales :", len(requests_log))
        print("\nRequêtes API/Data initiales :")
        for req in requests_log:
            if not req["url"].endswith((".png", ".jpg", ".svg", ".css", ".woff", ".woff2")):
                print(" ->", req["method"], req["url"][:120])

        # Cliquer sur un arrêt, par exemple "Cézeaux Pellez" ou "Jaude"
        print("\nRecherche de l'arrêt Jaude ou Cézeaux...")
        stop_card = page.locator(".card-stop", has_text="Jaude").first
        if stop_card.count() == 0:
            stop_card = page.locator(".card-stop", has_text="Cézeaux").first
        if stop_card.count() == 0:
            stop_card = page.locator(".card-stop").first

        if stop_card.count() > 0:
            print("Clic sur l'arrêt :", stop_card.text_content().strip()[:40])
            requests_log.clear()
            stop_card.click()
            page.wait_for_timeout(4000)

            print("\nRequêtes déclenchées par le clic :", len(requests_log))
            for req in requests_log:
                print(" ->", req["method"], req["url"][:150])

            print("\nRéponses API interceptées :", len(responses_log))
            for res in responses_log[-5:]:
                print("Response:", res["url"][:100], "Status:", res["status"])
                print("Sample:", res["sample"][:200])

        br.close()

if __name__ == "__main__":
    inspect_t2c_live()
