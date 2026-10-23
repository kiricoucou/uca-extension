"""« Quoi de neuf » du site, généré depuis UPDATES.md (section « Historique des versions ») : page statique
nouveautes.html et bloc des trois dernières versions de index.html (entre <!--news:start--> et <!--news:end-->).
Aucune requête, aucun script côté visiteur : du HTML déjà prêt.

Usage : python -I -X utf8 tests/gen_news.py            écrit nouveautes.html et met à jour index.html
        python -I -X utf8 tests/gen_news.py --check    échoue si ces fichiers ne correspondent pas à UPDATES.md
"""
import html
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SITE = "https://kiricoucou.github.io/uca-extension/"
START, END = "<!--news:start-->", "<!--news:end-->"


def versions():
    text = (ROOT / "UPDATES.md").read_text(encoding="utf-8")
    body = text.split("# Historique des versions", 1)[1]
    out = []
    for block in re.split(r"^## ", body, flags=re.M)[1:]:
        head, _, rest = block.partition("\n")
        m = re.match(r"(\d+\.\d+\.\d+)\s*[—-]\s*(.+)", head.strip())
        if m:
            out.append({"version": m.group(1), "title": m.group(2).strip(), "body": rest.strip()})
    return out[::-1]  # la plus récente d'abord


def inline(s):
    s = html.escape(s, quote=False)
    s = re.sub(r"`([^`]+)`", r"<code>\1</code>", s)
    s = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", s)
    s = re.sub(r"\*([^*]+)\*", r"<em>\1</em>", s)
    return s


def md_to_html(md):
    out, items, para = [], [], []

    def flush():
        nonlocal items, para
        if para:
            out.append("<p>" + inline(" ".join(para)) + "</p>"); para = []
        if items:
            out.append("<ul>" + "".join(f"<li>{inline(i)}</li>" for i in items) + "</ul>"); items = []

    for line in md.splitlines():
        if line.startswith("- "):
            if para:
                flush()
            items.append(line[2:].strip())
        elif line.startswith("  ") and items:
            items[-1] += " " + line.strip()
        elif not line.strip():
            flush()
        else:
            if items:
                flush()
            para.append(line.strip())
    flush()
    return "\n".join(out)


def plain(s, limit=150):
    s = re.sub(r"[`*]", "", s)
    return s if len(s) <= limit else s[: limit - 1].rsplit(" ", 1)[0] + "…"


def first_bullets(body, n=3):
    return [plain(l[2:].strip()) for l in body.splitlines() if l.startswith("- ")][:n]


def teaser(vs):
    parts = []
    for v in vs[:3]:
        lis = "".join(f"<li>{html.escape(b, quote=False)}</li>" for b in first_bullets(v["body"]))
        parts.append(f'<article class="card"><h3>{v["version"]}</h3><p><strong>{html.escape(v["title"], quote=False)}</strong></p><ul class="news-list">{lis}</ul></article>')
    return "\n        ".join(parts)


def page(vs):
    sections = "\n".join(
        f'<section class="news-item" id="v{v["version"].replace(".", "-")}"><h2>{v["version"]} <small>{html.escape(v["title"], quote=False)}</small></h2>\n{md_to_html(v["body"])}\n</section>' for v in vs)
    return f"""<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Quoi de neuf — Emploi du temps UCA</title>
<meta name="description" content="Les nouveautés de chaque version de l'extension, de l'app et du site Emploi du temps UCA (projet étudiant non officiel).">
<link rel="canonical" href="{SITE}nouveautes.html">
<meta property="og:type" content="website">
<meta property="og:title" content="Quoi de neuf — Emploi du temps UCA">
<meta property="og:description" content="Les nouveautés de chaque version de l'extension, de l'app et du site.">
<meta property="og:url" content="{SITE}nouveautes.html">
<meta property="og:image" content="{SITE}app/icons/og-image.png">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" type="image/png" href="app/icons/icon-192.png">
<link rel="stylesheet" href="site.css">
</head>
<body>
<header class="topbar">
  <div class="wrap">
    <a class="brand" href="index.html" aria-label="Emploi du temps UCA"><img src="app/icons/icon-192.png" alt=""><span>Emploi du temps UCA</span></a>
    <nav class="nav" aria-label="Navigation principale">
      <a href="index.html" class="hide-sm">Accueil</a>
      <a href="index.html#demo">Démo</a>
      <a href="nouveautes.html" aria-current="page">Nouveautés</a>
      <a href="aide.html">Aide</a>
      <a href="app/index.html">Agenda en ligne</a>
    </nav>
  </div>
</header>
<main class="wrap news">
  <h1>Quoi de neuf</h1>
  <p class="lead">Les nouveautés de chaque version, de la plus récente à la plus ancienne. Page générée depuis <code>UPDATES.md</code>.</p>
{sections}
</main>
<footer class="site">
  <div class="wrap">
    <span>Emploi du temps UCA — projet étudiant, non affilié à l'Université Clermont Auvergne.</span>
    <span><a href="aide.html">Aide</a> · <a href="confidentialite.html">Confidentialité</a> · <a href="https://github.com/kiricoucou/uca-extension">Code source</a></span>
  </div>
</footer>
</body>
</html>
"""


def apply_index(index_html, vs):
    if START not in index_html or END not in index_html:
        raise SystemExit("index.html : marqueurs <!--news:start--> / <!--news:end--> introuvables")
    head, rest = index_html.split(START, 1)
    _, tail = rest.split(END, 1)
    return head + START + "\n        " + teaser(vs) + "\n        " + END + tail


def main():
    vs = versions()
    if not vs:
        raise SystemExit("UPDATES.md : aucune version trouvée")
    want_page = page(vs)
    index_path = ROOT / "index.html"
    want_index = apply_index(index_path.read_text(encoding="utf-8"), vs)
    page_path = ROOT / "nouveautes.html"
    if "--check" in sys.argv[1:]:
        ok_page = page_path.exists() and page_path.read_text(encoding="utf-8") == want_page
        ok_index = index_path.read_text(encoding="utf-8") == want_index
        print(("OK  " if ok_page else "ERR ") + "nouveautes.html à jour")
        print(("OK  " if ok_index else "ERR ") + "index.html (nouveautés) à jour")
        sys.exit(0 if ok_page and ok_index else 1)
    page_path.write_text(want_page, encoding="utf-8", newline="\n")
    index_path.write_text(want_index, encoding="utf-8", newline="\n")
    print(f"nouveautes.html : {len(vs)} versions ; index.html : 3 dernières versions")


if __name__ == "__main__":
    main()
