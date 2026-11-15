package fr.edtuca.app

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Calculs des widgets (WidgetModel.derive), avec les mêmes données et la même horloge que tests/widgets.py côté web. */
class WidgetModelTest {
    private fun ev(d: Int, sh: Int, sm: Int, eh: Int, em: Int, title: String, room: String, cancelled: Boolean = false) =
        WEvent(title, title.take(5), if (title.contains("Examen")) "Examen" else "Autre", room, "M. Dupont", cancelled,
            WidgetModel.at(2026, 10, d, sh, sm), WidgetModel.at(2026, 10, d, eh, em), sh, sm, eh, em)

    private val exam = ev(25, 9, 0, 11, 0, "R1.02 Examen DS", "Amphi 1")
    private val snap = WSnapshot(
        at = 0, lastSync = WidgetModel.at(2026, 10, 18, 9, 0), sessionExpired = false, hasData = true,
        events = listOf(
            ev(16, 8, 0, 10, 0, "R1.01 Développement CM", "A101"), ev(18, 8, 0, 10, 0, "R1.01 Développement CM", "A101"),
            ev(18, 10, 15, 12, 15, "R1.02 Web TD", "B204"), ev(18, 13, 30, 15, 30, "SAE1.01 Projet TP", "Labo 3"), ev(18, 16, 0, 17, 0, "Tutorat", "C001"),
            ev(19, 8, 0, 10, 0, "R1.05 Anglais", "D12", cancelled = true), ev(19, 10, 0, 12, 0, "R1.03 Réseau TD", "E5"),
            exam, ev(20, 8, 0, 9, 0, "Piège", "X"),
        ),
        exams = listOf(exam), avg = 12.1,
        matieres = listOf(WMat("R1.01 : Init dev", 15.0, 11.0), WMat("R1.02 : Web", 8.0, 10.0), WMat("R1.03 : Réseau", 9.5, 10.0)),
        evals = listOf(WEval("DS1", "R1.01", 14.0, 11.0)), history = listOf(10.5, 11.2, 12.1),
        tasks = listOf(
            WTask("Rendre le TP réseau", "R1.03", WidgetModel.at(2026, 10, 16, 0, 0)), WTask("Réviser le DS", "R1.02", WidgetModel.at(2026, 10, 18, 0, 0)),
            WTask("Lire le chapitre 4", "", WidgetModel.at(2026, 10, 25, 0, 0)), WTask("Sans date", "", null),
        ),
        absences = WAbs(3, 2, 1, 1),
    )
    private val now = WidgetModel.at(2026, 10, 18, 10, 30)

    @Test fun enCoursEtSuivants() {
        val v = WidgetModel.derive(snap, now)
        assertEquals("R1.02 Web TD", v.cur?.title)
        assertEquals("R1.02 Web TD", v.next?.title)
        assertEquals(4, v.today.size)
        assertEquals(2, v.after.size)
        assertEquals(0.125, v.progress, 0.001)
    }

    @Test fun finDeJourneeEtPause() {
        val v = WidgetModel.derive(snap, now)
        assertEquals(390, v.todayLeftMin)
        val p = v.pause
        assertNotNull(p)
        assertFalse(p!!.now)
        assertEquals(75, p.min)
        assertFalse(v.doneToday)
    }

    @Test fun enPauseEntreDeuxCours() {
        val v = WidgetModel.derive(snap, WidgetModel.at(2026, 10, 18, 12, 45))
        assertNull(v.cur)
        assertEquals("SAE1.01 Projet TP", v.next?.title)
        val p = v.pause
        assertNotNull(p)
        assertTrue(p!!.now)
        assertEquals(45, p.min)
    }

    @Test fun journeeTermineeEtWeekEnd() {
        assertTrue(WidgetModel.derive(snap, WidgetModel.at(2026, 10, 18, 18, 0)).doneToday)
        assertEquals(0, WidgetModel.derive(snap, WidgetModel.at(2026, 10, 21, 12, 0)).today.size)
    }

    @Test fun chargeDeLaSemaine() {
        val v = WidgetModel.derive(snap, now)
        assertEquals(listOf(120, 0, 420, 120, 60, 0, 0), v.weekLoad)
        assertEquals(2, v.weekToday)
        assertEquals(47, v.week)
        assertEquals("mercredi 18 novembre", v.dateLabel)
    }

    @Test fun devoirsEtExamens() {
        val v = WidgetModel.derive(snap, now)
        assertEquals(4, v.tasks.size)
        assertEquals(1, v.late)
        assertEquals(1, v.dueToday)
        assertEquals("Rendre le TP réseau", v.tasks.first().title)
        assertEquals("Sans date", v.tasks.last().title)
        assertEquals("En retard de 2 jours", v.tasks.first().text)
        assertEquals(listOf(7), v.exams.map { it.second })
    }

    @Test fun notesEtMoyenne() {
        val v = WidgetModel.derive(snap, now)
        assertEquals(11.2, v.avgPrev!!, 0.001)
        assertEquals("R1.01 : Init dev", v.best?.label)
        assertEquals("R1.02 : Web", v.worst?.label)
    }

    @Test fun prochainJourLibre() {
        val v = WidgetModel.derive(snap, now)
        assertEquals("lundi 23 novembre", v.freeDay?.label)
        assertEquals(5, v.freeDay?.off)
    }

    @Test fun formats() {
        assertEquals("12", WidgetModel.fmtNote(12.0))
        assertEquals("12,5", WidgetModel.fmtNote(12.5))
        assertEquals("12,35", WidgetModel.fmtNote(12.345))
        assertEquals("—", WidgetModel.fmtNote(null))
        assertEquals("0,5", WidgetModel.fmtNote(0.5))
        assertEquals("5 min", WidgetModel.durText(5))
        assertEquals("1 h", WidgetModel.durText(60))
        assertEquals("2 h 15", WidgetModel.durText(135))
        assertEquals("il y a 2 h", WidgetModel.agoText(now - 125 * 60_000L, now))
        assertEquals("jamais", WidgetModel.agoText(null, now))
    }

    @Test fun sansDonnees() {
        val v = WidgetModel.derive(WSnapshot(0, null, false, false, emptyList(), emptyList(), null, emptyList(), emptyList(), emptyList(), emptyList(), null), now)
        assertNull(v.next)
        assertTrue(v.today.isEmpty())
        assertNull(v.avg)
        assertEquals(0, v.late)
    }

    /** Vrai résumé produit par core/widgets.js (mêmes données, 18 novembre 2026, 10 h 30) : le natif le lit et obtient les mêmes résultats. */
    @Test fun lecturDuJsonDuWeb() {
        val json = javaClass.getResourceAsStream("/widget-snapshot.json")!!.readBytes().toString(Charsets.UTF_8)
        val s = WidgetModel.parse(json)
        assertNotNull(s)
        s!!
        assertEquals(9, s.events.size)
        assertEquals(1, s.exams.size)
        assertEquals(3, s.matieres.size)
        assertEquals(4, s.tasks.size)
        assertEquals(3, s.history.size)
        assertEquals(WAbs(3, 2, 1, 1), s.absences)
        assertTrue(s.hasData)
        assertFalse(s.sessionExpired)
        assertNotNull(s.avg)
        val v = WidgetModel.derive(s, now)
        assertEquals("R1.02 Web TD", v.cur?.title)
        assertEquals("B204", v.cur?.room)
        assertEquals(4, v.today.size)
        assertEquals(390, v.todayLeftMin)
        assertEquals(listOf(120, 0, 420, 120, 60, 0, 0), v.weekLoad)
        assertEquals(1, v.late)
        assertEquals(listOf(7), v.exams.map { it.second })
        assertEquals("R1.01 : Init dev", v.best?.label)
        assertEquals(11.2, v.avgPrev!!, 0.001)
        assertEquals(WidgetModel.at(2026, 10, 18, 9, 0), s.lastSync)
    }

    @Test fun lecteurJsonRobuste() {
        assertNull(WidgetModel.parse("pas du json"))
        assertNull(WidgetModel.parse("{\"events\": [}"))
        val s = WidgetModel.parse("{\"v\":1,\"at\":5,\"lastSync\":null,\"events\":[],\"matieres\":[{\"l\":\"Caf\\u00e9 \\\"x\\\"\",\"n\":12.5,\"a\":null}]}")
        assertNotNull(s)
        assertNull(s!!.lastSync)
        assertEquals("Café \"x\"", s.matieres[0].label)
        assertNull(s.matieres[0].moy)
    }
}
