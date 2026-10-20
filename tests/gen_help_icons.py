"""Génère les icônes SVG des designs (animé, professionnel, carnet), à la place des anciens GIF.

Usage : python -I -X utf8 tests/gen_help_icons.py
Mêmes pictogrammes (traits sur une grille 24×24) habillés selon le design :
animé = pastille animée, professionnel = pastille bleue nette (clair/sombre), carnet = post-it et trait d'encre irrégulier.
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

ICONS = {
    "calendar": '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/><path d="M8 14h.01M12 14h.01M16 14h.01M8 17.5h.01M12 17.5h.01"/>',
    "rocket": '<path d="M12 2.5c3.2 2.2 5 6 5 9.8L15 16H9l-2-3.7c0-3.8 1.8-7.6 5-9.8z"/><circle cx="12" cy="9.8" r="1.9"/><path d="M7.3 12.6 4.5 15.5v3l3.4-2M16.7 12.6l2.8 2.9v3l-3.4-2M10.2 18.5 12 21.5l1.8-3"/>',
    "sync": '<path d="M19.5 12a7.5 7.5 0 0 1-13.4 4.6M4.5 12a7.5 7.5 0 0 1 13.4-4.6"/><path d="M18.4 3.2v4.4H14M5.6 20.8v-4.4H10"/>',
    "stats": '<path d="M3.5 20.5h17M6 20.5v-7M10.5 20.5V6M15 20.5v-9.5M19.5 20.5V15"/>',
    "notes": '<path d="M2 9.2 12 4.5l10 4.7-10 4.7z"/><path d="M6 11.1v5c0 1.5 2.7 3 6 3s6-1.5 6-3v-5M22 9.2v5.8"/>',
    "pen": '<path d="M4 20l1-4.2L16.2 4.6a2.1 2.1 0 0 1 3 3L8 18.9z"/><path d="M14.4 6.4l3 3M12.5 20.5h8"/>',
    "lock": '<rect x="4.5" y="10.5" width="15" height="10.5" rx="2.5"/><path d="M8 10.5V7.4a4 4 0 0 1 8 0v3.1M12 14.6v2.6"/>',
    "user": '<circle cx="12" cy="8" r="4"/><path d="M4.5 20.5c.6-3.8 3.7-5.8 7.5-5.8s6.9 2 7.5 5.8"/>',
    "time": '<circle cx="12" cy="12" r="8.6"/><path d="M12 7v5.2l3.4 2.1"/>',
    "search": '<circle cx="10.8" cy="10.8" r="6.6"/><path d="m15.6 15.6 4.9 4.9"/>',
    "trash": '<path d="M4 7h16M9.5 7V4.5h5V7M6 7l1 13.5h10L18 7M10 11v6M14 11v6"/>',
    "pin": '<path d="M12 21.5s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11z"/><circle cx="12" cy="10.5" r="2.4"/>',
    "link": '<path d="M10 14a4.2 4.2 0 0 0 6 0l3-3a4.2 4.2 0 0 0-6-6l-1 1"/><path d="M14 10a4.2 4.2 0 0 0-6 0l-3 3a4.2 4.2 0 0 0 6 6l1-1"/>',
    "mail": '<rect x="3" y="5.5" width="18" height="13" rx="2.2"/><path d="m3.8 7 8.2 6.2L20.2 7"/>',
    "bolt": '<path d="M13.2 2.5 5 13.5h6.2l-1 8 8.3-11h-6.3z"/>',
    "gear": '<circle cx="12" cy="12" r="3"/><path d="M12 2.8v2.6M12 18.6v2.6M2.8 12h2.6M18.6 12h2.6M5.5 5.5l1.9 1.9M16.6 16.6l1.9 1.9M5.5 18.5l1.9-1.9M16.6 7.4l1.9-1.9"/><circle cx="12" cy="12" r="6.4"/>',
    "phone": '<rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M10.5 18.5h3"/>',
}

# Design animé : pastille sombre teintée, trait turquoise, chaque pictogramme a sa propre animation.
ANIM = {"sync": "spin", "gear": "spin-slow", "rocket": "float", "user": "float", "pin": "float", "phone": "float",
        "mail": "swing", "lock": "swing", "trash": "swing", "time": "spin-slow"}
ANIME = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#14403e"/><stop offset="1" stop-color="#0d2423"/></linearGradient></defs>
<style>.i{{fill:none;stroke:#5ff0e6;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round;transform-box:view-box;transform-origin:12px 12px}}
.t{{animation:glow 2.6s ease-in-out infinite}}
.spin{{animation:spin 1.6s linear infinite}}.spin-slow{{animation:spin 6s linear infinite}}
.float{{animation:float 1.8s ease-in-out infinite alternate}}.swing{{animation:swing 1.4s ease-in-out infinite}}
.draw *{{stroke-dasharray:1;animation:draw 2.8s ease-in-out infinite}}
@keyframes spin{{to{{transform:rotate(360deg)}}}}
@keyframes float{{from{{transform:translateY(1px)}}to{{transform:translateY(-1.6px)}}}}
@keyframes swing{{0%,100%{{transform:rotate(0)}}25%{{transform:rotate(-9deg)}}75%{{transform:rotate(9deg)}}}}
@keyframes draw{{0%{{stroke-dashoffset:1}}55%,100%{{stroke-dashoffset:0}}}}
@keyframes glow{{0%,100%{{stroke-opacity:.35}}50%{{stroke-opacity:1}}}}
@media (prefers-reduced-motion:reduce){{*{{animation:none!important;stroke-dasharray:none!important}}}}</style>
<rect class="t" x=".5" y=".5" width="31" height="31" rx="8" fill="url(#g)" stroke="#18b7b0"/>
<g transform="translate(4 4)"><g class="i {anim}">{body}</g></g></svg>
"""


def with_path_length(body):
    """pathLength="1" sur chaque tracé : le dessin progressif marche quelle que soit sa longueur."""
    for tag in ("<path ", "<circle ", "<rect "):
        body = body.replace(tag, tag + 'pathLength="1" ')
    return body

# Professionnel : pastille arrondie teintée, pictogramme bleu ; suit le thème clair/sombre du système.
PRO = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
<style>.t{{fill:#e8f0fe}}.i{{fill:none;stroke:#0b57d0;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round}}
@media (prefers-color-scheme:dark){{.t{{fill:#0b3a82}}.i{{stroke:#d3e3fd}}}}</style>
<rect class="t" width="32" height="32" rx="8"/><g class="i" transform="translate(4 4)">{body}</g></svg>
"""

# Carnet : post-it pastel légèrement penché, bout de scotch, trait d'encre bleu un peu tremblé.
CARNET_COLORS = {"calendar": "#fff3b0", "rocket": "#ffd9c2", "sync": "#d4f0e4", "stats": "#d9e6ff", "notes": "#ffe0ec",
                 "pen": "#fff3b0", "lock": "#e6dcff", "user": "#d4f0e4", "time": "#ffd9c2", "search": "#d9e6ff", "trash": "#ffe0ec"}
CARNET = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
<defs><filter id="w" x="-10%" y="-10%" width="120%" height="120%"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="1" seed="{seed}"/>
<feDisplacementMap in="SourceGraphic" scale=".9"/></filter></defs>
<g transform="rotate({rot} 16 16)"><rect x="2.5" y="3" width="27" height="26.5" rx="2" fill="{paper}" stroke="#d8c9a3" stroke-width=".6"/>
<path d="M2.5 26.5c4 1.6 10 2.2 27 0v1a2 2 0 0 1-2 2h-23a2 2 0 0 1-2-2z" fill="#000" opacity=".05"/></g>
<rect x="11" y=".8" width="10" height="4.2" rx=".6" fill="#f3ead2" opacity=".85" transform="rotate(-4 16 3)"/>
<g filter="url(#w)" fill="none" stroke="#2f4fa2" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" transform="translate(5 6) scale(.92)">{body}</g></svg>
"""


def main():
    for design in ("anime", "professionnel", "carnet"):
        out = ROOT / "designs" / design / "svg"
        out.mkdir(exist_ok=True)
        for k, (name, body) in enumerate(ICONS.items()):
            if design == "anime":
                anim = ANIM.get(name, "draw")
                svg = ANIME.format(body=with_path_length(body) if anim == "draw" else body, anim=anim)
            elif design == "professionnel":
                svg = PRO.format(body=body)
            else:
                svg = CARNET.format(body=body, seed=k + 3, rot=(-3, 2, -1.5, 3, -2)[k % 5], paper=CARNET_COLORS.get(name, "#fff3b0"))
            (out / f"{name}.svg").write_text(svg, encoding="utf-8")
        print(design, ":", len(ICONS), "icônes")


if __name__ == "__main__":
    main()
