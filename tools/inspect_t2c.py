import urllib.request
import re

url = "https://www.t2c.fr/se-deplacer/horaires-et-plans"
req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"})
html = urllib.request.urlopen(req, timeout=15).read().decode("utf-8", "ignore")

# Trouver des blocs card-stop
stops = re.findall(r'<li[^>]*class="[^"]*list-stop__item[^"]*"[^>]*>(.*?)</li>', html, re.DOTALL)
print(f"Num list-stop items: {len(stops)}")
if stops:
    print("\nPremier arrêt HTML :")
    print(stops[0][:1000])

# Trouver les balises lines ou boutons ou liens à l'intérieur
if len(stops) > 1:
    print("\nDeuxième arrêt HTML :")
    print(stops[1][:1000])
