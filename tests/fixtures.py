"""Données factices (aucun vrai nom) pour les tests et les captures du sélecteur."""
import datetime


def _ms(dt):
    return int(dt.timestamp() * 1000)


def seed():
    today = datetime.date.today()
    monday = today - datetime.timedelta(days=today.weekday())
    slots = [
        (8, 0, 10, 0, "R1.01 Développement CM", "M. Dupont", "A101"),
        (10, 15, 12, 15, "R1.02 Web TD", "Mme Martin", "B204"),
        (13, 30, 15, 30, "SAE1.01 Projet TP", "M. Durand, Mme Leroy", "Labo 3"),
        (16, 0, 17, 0, "Tutorat", "M. Bernard", "C001"),
        (18, 0, 20, 0, "R1.05 Anglais", "Mrs Smith", "D12"),
    ]
    events = []

    def add(day, sh, sm, eh, em, title, teacher, room):
        events.append({"date": day.isoformat(), "year": day.year, "month": day.month - 1, "day": day.day,
                       "startH": sh, "startM": sm, "endH": eh, "endM": em, "title": title,
                       "teacher": teacher, "room": room, "raw": title, "color": "#888"})

    for d in range(5):
        day = monday + datetime.timedelta(days=d)
        for slot in slots[: 3 + d % 3]:
            add(day, *slot)
    # Cours d'1h avec prof et salles longues (doivent rester entièrement lisibles).
    add(monday + datetime.timedelta(days=4), 8, 0, 9, 0, "Archi_res1 - CM", "M. Martin Antoine", "A5, A5bis")
    add(monday, 11, 0, 12, 0, "Archi_res1 - CM", "M. Martin Antoine", "A5, A5bis")

    first = events[0]
    note_key = f"{first['date']}_{first['startH']:02d}:{first['startM']:02d}_{first['title']}"
    now = datetime.datetime.now()
    releve = {"ue": [
        {"label": "UE 1.1 Réaliser", "coeff": 1, "note": None, "moy": None, "maxi": None, "mini": None, "matieres": [
            {"label": "R1.01 : Init dev", "coeff": 2, "note": None, "moy": 11, "maxi": 18, "mini": 3, "evals": [
                {"label": "DS1 (sur 20.0)", "coeff": 1, "note": 14, "moy": 11, "maxi": 18, "mini": 3},
                {"label": "TP (sur 20.0)", "coeff": 1, "note": 16, "moy": 12, "maxi": 19, "mini": 5}]},
            {"label": "R1.02 : Web", "coeff": 1, "note": 12, "moy": 10, "maxi": 17, "mini": 4, "evals": []}]},
        {"label": "UE 1.2 Optimiser", "coeff": 1, "note": 9, "moy": None, "maxi": None, "mini": None, "matieres": []}]}
    return {
        "uca_events": events,
        "uca_last_sync": now.isoformat(),
        "uca_session_expired": False,
        "uca_notes": {note_key: "réviser"},
        "uca_notes_seen": {
            "R1.01 : Init dev|DS1 (sur 20.0)": {"note": 14, "at": _ms(now) - 86400000},
            "R1.01 : Init dev|TP (sur 20.0)": {"note": 16, "at": _ms(now) - 3 * 86400000},
            "R1.02 : Web|": {"note": 12, "at": 0},
        },
        "uca_releve_notes": releve,
        "uca_absences": {"declarees": 3, "justifiees": 2, "nonJustifiees": 1, "avecMotifs": 0, "journeesNonJustifiees": 0},
    }


EXPECTED_AVERAGE = "11,5"  # UE1 = (15×2 + 12×1)/3 = 14 ; UE2 = 9 ; (14 + 9)/2
