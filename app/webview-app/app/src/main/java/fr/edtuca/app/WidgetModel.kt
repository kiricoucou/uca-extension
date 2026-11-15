package fr.edtuca.app

import java.util.Calendar

/**
 * Données des widgets de l'écran d'accueil. La page web (core/widgets.js, fonction snapshot) résume les cours, devoirs,
 * notes et absences dans un JSON compact poussé via UcaBridge.onWidgetData ; ce fichier le lit (parse) puis recalcule à
 * chaque affichage tout ce qui dépend de l'heure (derive, même logique que derive() dans core/widgets.js).
 * Aucun accès réseau, aucune WebView : un widget doit rester instantané.
 */
data class WEvent(
    val title: String, val subject: String, val type: String, val room: String, val teacher: String, val cancelled: Boolean,
    val start: Long, val end: Long, val sh: Int, val sm: Int, val eh: Int, val em: Int,
)
data class WTask(val title: String, val subject: String, val dueMs: Long?)
data class WMat(val label: String, val note: Double, val moy: Double?)
data class WEval(val label: String, val matiere: String, val note: Double, val moy: Double?)
data class WAbs(val total: Int, val justified: Int, val unjustified: Int, val days: Int)

data class WSnapshot(
    val at: Long, val lastSync: Long?, val sessionExpired: Boolean, val hasData: Boolean,
    val events: List<WEvent>, val exams: List<WEvent>, val avg: Double?, val matieres: List<WMat>, val evals: List<WEval>,
    val history: List<Double>, val tasks: List<WTask>, val absences: WAbs?,
)

data class WPause(val now: Boolean, val fromMs: Long, val untilMs: Long, val min: Int)
data class WFree(val off: Int, val label: String)
data class WTaskView(val title: String, val subject: String, val dueMs: Long?, val text: String, val level: String)

data class WView(
    val now: Long, val hasData: Boolean, val sessionExpired: Boolean, val lastSync: Long?,
    val weekday: String, val day: Int, val month: String, val week: Int, val dateLabel: String,
    val today: List<WEvent>, val days3: List<Pair<String, List<WEvent>>>,
    val cur: WEvent?, val next: WEvent?, val after: List<WEvent>, val progress: Double,
    val todayLeftMin: Int, val lastEnd: Long?, val doneToday: Boolean, val pause: WPause?, val freeDay: WFree?,
    val weekLoad: List<Int>, val weekToday: Int,
    val tasks: List<WTaskView>, val late: Int, val dueToday: Int,
    val exams: List<Pair<WEvent, Int>>, val avg: Double?, val avgPrev: Double?, val history: List<Double>,
    val matieres: List<WMat>, val best: WMat?, val worst: WMat?, val evals: List<WEval>, val absences: WAbs?,
)

object WidgetModel {
    const val MIN = 60_000L
    const val DAY = 86_400_000L
    val WEEKDAYS = listOf("dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi")
    val SHORT_DAYS = listOf("dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam.")
    val MONTHS = listOf("janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre")

    fun pad(n: Int) = n.toString().padStart(2, '0')
    fun hm(h: Int, m: Int) = "${pad(h)}:${pad(m)}"

    /** Début de journée (minuit) à `off` jours de `now`. */
    fun dayStart(now: Long, off: Int = 0): Long = Calendar.getInstance().apply {
        timeInMillis = now; set(Calendar.HOUR_OF_DAY, 0); set(Calendar.MINUTE, 0); set(Calendar.SECOND, 0); set(Calendar.MILLISECOND, 0)
        add(Calendar.DAY_OF_MONTH, off)
    }.timeInMillis

    fun at(y: Int, m: Int, d: Int, h: Int, mi: Int): Long = Calendar.getInstance().apply {
        clear(); set(y, m, d, h, mi, 0); set(Calendar.MILLISECOND, 0)
    }.timeInMillis

    fun durText(min: Int): String {
        val v = maxOf(0, min); val h = v / 60; val m = v % 60
        return if (h > 0) (if (m > 0) "$h h ${pad(m)}" else "$h h") else "$m min"
    }

    fun fmtNote(n: Double?): String {
        if (n == null || n.isNaN()) return "—"
        val r = Math.round(n * 100.0) / 100.0
        return if (r == Math.floor(r)) r.toLong().toString() else r.toString().trimEnd('0').replace('.', ',')
    }

    fun agoText(ms: Long?, now: Long): String {
        if (ms == null || ms <= 0L) return "jamais"
        val m = maxOf(0L, (now - ms) / MIN)
        return when { m < 1 -> "à l'instant"; m < 60 -> "il y a $m min"; m < 48 * 60 -> "il y a ${m / 60} h"; else -> "il y a ${m / 1440} jours" }
    }

    fun rel(ms: Long, now: Long): String {
        val m = Math.round((ms - now) / MIN.toDouble()).toInt()
        return if (m <= 0) "maintenant" else if (m < 60) "dans $m min" else "dans ${durText(m)}"
    }

    fun isoWeek(t: Long): Int = Calendar.getInstance().apply { firstDayOfWeek = Calendar.MONDAY; minimalDaysInFirstWeek = 4; timeInMillis = t }.get(Calendar.WEEK_OF_YEAR)

    private fun parseDue(s: String): Long? {
        val m = Regex("^(\\d{4})-(\\d{2})-(\\d{2})$").find(s) ?: return null
        return at(m.groupValues[1].toInt(), m.groupValues[2].toInt() - 1, m.groupValues[3].toInt(), 0, 0)
    }

    fun dueInfo(dueMs: Long?, now: Long): Pair<String, String> {
        if (dueMs == null) return "Sans date" to "none"
        val days = Math.round((dueMs - dayStart(now, 0)) / DAY.toDouble()).toInt()
        return when {
            days < 0 -> "En retard de ${-days} jour${if (days < -1) "s" else ""}" to "late"
            days == 0 -> "Aujourd'hui" to "today"
            days == 1 -> "Demain" to "soon"
            else -> "Dans $days jours" to (if (days <= 3) "soon" else "later")
        }
    }

    // ------------------------------------------------------------------------------------------ lecture du JSON
    private fun obj(m: Any?): Map<String, Any?> { @Suppress("UNCHECKED_CAST") return (m as? Map<String, Any?>) ?: emptyMap() }
    private fun list(m: Any?): List<Any?> = (m as? List<*>) ?: emptyList<Any?>()
    private fun Map<String, Any?>.str(k: String) = (this[k] as? String) ?: ""
    private fun Map<String, Any?>.int(k: String) = ((this[k] as? Double) ?: 0.0).toInt()
    private fun Map<String, Any?>.dbl(k: String): Double? = this[k] as? Double
    private fun Map<String, Any?>.bool(k: String) = (this[k] as? Boolean) ?: false

    private fun mk(o: Map<String, Any?>): WEvent {
        val y = o.int("y"); val m = o.int("m"); val d = o.int("d")
        val sh = o.int("sh"); val sm = o.int("sm"); val eh = o.int("eh"); val em = o.int("em")
        return WEvent(o.str("t"), o.str("s"), o.str("k"), o.str("r"), o.str("p"), o.int("x") == 1,
            at(y, m, d, sh, sm), at(y, m, d, eh, em), sh, sm, eh, em)
    }

    private fun events(a: Any?): List<WEvent> = list(a).take(300).map { mk(obj(it)) }

    fun parse(json: String): WSnapshot? = try {
        val o = obj(MiniJson.parse(json))
        val ab = (o["absences"] as? Map<*, *>)?.let { obj(it) }?.let { WAbs(it.int("total"), it.int("justified"), it.int("unjustified"), it.int("days")) }
        WSnapshot(
            at = (o.dbl("at") ?: 0.0).toLong(), lastSync = o.dbl("lastSync")?.toLong(),
            sessionExpired = o.bool("sessionExpired"), hasData = o.bool("hasData"),
            events = events(o["events"]), exams = events(o["exams"]), avg = o.dbl("avg"),
            matieres = list(o["matieres"]).take(30).mapNotNull { x -> obj(x).let { m -> m.dbl("n")?.let { n -> WMat(m.str("l"), n, m.dbl("a")) } } },
            evals = list(o["evals"]).take(20).mapNotNull { x -> obj(x).let { m -> m.dbl("n")?.let { n -> WEval(m.str("l"), m.str("m"), n, m.dbl("a")) } } },
            history = list(o["history"]).take(30).mapNotNull { x -> obj(x).dbl("a") },
            tasks = list(o["tasks"]).take(60).map { x -> obj(x).let { t -> WTask(t.str("t"), t.str("s"), parseDue(t.str("due"))) } },
            absences = ab,
        )
    } catch (_: Exception) { null }

    // ------------------------------------------------------------------------------------------ calculs dépendant de l'heure
    fun derive(s: WSnapshot, now: Long): WView {
        val evs = s.events.filter { !it.cancelled }.sortedBy { it.start }
        fun ofDay(off: Int): List<WEvent> { val a = dayStart(now, off); val b = dayStart(now, off + 1); return evs.filter { it.start >= a && it.start < b } }
        val today = ofDay(0)
        val cal = Calendar.getInstance().apply { timeInMillis = now }
        val days3 = (0..2).map { off ->
            val t = Calendar.getInstance().apply { timeInMillis = dayStart(now, off) }
            val label = when (off) { 0 -> "Aujourd'hui"; 1 -> "Demain"; else -> "${SHORT_DAYS[t.get(Calendar.DAY_OF_WEEK) - 1]} ${t.get(Calendar.DAY_OF_MONTH)}" }
            label to ofDay(off)
        }
        val cur = today.firstOrNull { it.start <= now && it.end > now }
        val next = cur ?: evs.firstOrNull { it.end > now }
        val after = evs.filter { it.end > now && it != next }.take(2)
        val progress = if (cur != null) ((now - cur.start).toDouble() / (cur.end - cur.start)).coerceIn(0.0, 1.0) else 0.0
        val todayRest = today.filter { it.end > now }
        val lastEnd = today.maxOfOrNull { it.end }
        val doneToday = today.isNotEmpty() && todayRest.isEmpty()
        var pause: WPause? = null
        val nextToday = today.firstOrNull { it.start > now }
        if (cur == null && nextToday != null && today.any { it.end <= now }) {
            pause = WPause(true, now, nextToday.start, Math.ceil((nextToday.start - now) / MIN.toDouble()).toInt())
        } else if (cur != null) {
            val n2 = today.firstOrNull { it.start >= cur.end }
            if (n2 != null && n2.start - cur.end >= 15 * MIN) pause = WPause(false, cur.end, n2.start, Math.round((n2.start - cur.end) / MIN.toDouble()).toInt())
        }
        var freeDay: WFree? = null
        for (off in 1..21) {
            if (freeDay != null) break
            val t = Calendar.getInstance().apply { timeInMillis = dayStart(now, off) }
            val wd = t.get(Calendar.DAY_OF_WEEK) - 1   // 0 = dimanche
            if (wd in 1..5 && ofDay(off).isEmpty()) freeDay = WFree(off, "${WEEKDAYS[wd]} ${t.get(Calendar.DAY_OF_MONTH)} ${MONTHS[t.get(Calendar.MONTH)]}")
        }
        val todayWd = (cal.get(Calendar.DAY_OF_WEEK) + 5) % 7   // 0 = lundi
        val mon = dayStart(now, -todayWd)
        val weekLoad = (0..6).map { i ->
            val a = dayStart(mon + 12 * 3_600_000L, i); val b = dayStart(mon + 12 * 3_600_000L, i + 1)
            evs.filter { it.start >= a && it.start < b }.sumOf { (it.end - it.start) / MIN }.toInt()
        }
        val tasks = s.tasks.map { t -> val (text, level) = dueInfo(t.dueMs, now); WTaskView(t.title, t.subject, t.dueMs, text, level) }
            .sortedWith(compareBy<WTaskView> { it.dueMs == null }.thenBy { it.dueMs ?: 0L })
        val exams = s.exams.filter { it.end > now }.map { it to Math.round((dayStart(it.start, 0) - dayStart(now, 0)) / DAY.toDouble()).toInt() }
        val mats = s.matieres.sortedByDescending { it.note }
        return WView(
            now = now, hasData = s.hasData, sessionExpired = s.sessionExpired, lastSync = s.lastSync,
            weekday = WEEKDAYS[cal.get(Calendar.DAY_OF_WEEK) - 1], day = cal.get(Calendar.DAY_OF_MONTH), month = MONTHS[cal.get(Calendar.MONTH)], week = isoWeek(now),
            dateLabel = "${WEEKDAYS[cal.get(Calendar.DAY_OF_WEEK) - 1]} ${cal.get(Calendar.DAY_OF_MONTH)} ${MONTHS[cal.get(Calendar.MONTH)]}",
            today = today, days3 = days3, cur = cur, next = next, after = after, progress = progress,
            todayLeftMin = if (lastEnd != null && lastEnd > now) Math.ceil((lastEnd - now) / MIN.toDouble()).toInt() else 0,
            lastEnd = lastEnd, doneToday = doneToday, pause = pause, freeDay = freeDay, weekLoad = weekLoad, weekToday = todayWd,
            tasks = tasks, late = tasks.count { it.level == "late" }, dueToday = tasks.count { it.level == "today" },
            exams = exams, avg = s.avg, avgPrev = if (s.history.size >= 2) s.history[s.history.size - 2] else null, history = s.history,
            matieres = mats, best = mats.firstOrNull(), worst = if (mats.size > 1) mats.last() else null, evals = s.evals, absences = s.absences,
        )
    }

    /** Repli : tant que la page n'a envoyé aucun résumé, le widget « Prochain cours » vit des cours déjà en cache. */
    fun fromEvents(list: List<UcaEvent>, now: Long): WSnapshot {
        val evs = list.map { WEvent(it.title, "", "", it.room ?: "", it.teacher ?: "", false, it.startMillis(), it.endMillis(), it.startH, it.startM, it.endH, it.endM) }
        return WSnapshot(now, null, false, evs.isNotEmpty(), evs, emptyList(), null, emptyList(), emptyList(), emptyList(), emptyList(), null)
    }
}

/** Lecteur JSON minimal (objets, tableaux, chaînes, nombres, booléens, null) : testable sur ordinateur, sans org.json. */
internal object MiniJson {
    fun parse(s: String): Any? {
        val p = Reader(s)
        val v = p.value(); p.ws()
        if (p.i != s.length) throw IllegalArgumentException("fin inattendue")
        return v
    }

    private class Reader(val s: String) {
        var i = 0
        fun ws() { while (i < s.length && s[i].isWhitespace()) i++ }
        fun expect(c: Char) { if (i >= s.length || s[i] != c) throw IllegalArgumentException("« $c » attendu à $i"); i++ }
        fun value(): Any? {
            ws()
            if (i >= s.length) throw IllegalArgumentException("fin inattendue")
            return when (s[i]) {
                '{' -> obj(); '[' -> arr(); '"' -> str()
                't' -> lit("true", true); 'f' -> lit("false", false); 'n' -> lit("null", null)
                else -> num()
            }
        }
        fun lit(w: String, v: Any?): Any? { if (!s.startsWith(w, i)) throw IllegalArgumentException("valeur inconnue à $i"); i += w.length; return v }
        fun num(): Double { val st = i; while (i < s.length && s[i] in "+-0123456789.eE") i++; if (st == i) throw IllegalArgumentException("nombre attendu à $i"); return s.substring(st, i).toDouble() }
        fun str(): String {
            expect('"'); val sb = StringBuilder()
            while (true) {
                if (i >= s.length) throw IllegalArgumentException("chaîne non terminée")
                val c = s[i++]
                if (c == '"') return sb.toString()
                if (c != '\\') { sb.append(c); continue }
                when (val e = s[i++]) {
                    'n' -> sb.append('\n'); 't' -> sb.append('\t'); 'r' -> sb.append('\r'); 'b' -> sb.append('\b'); 'f' -> sb.append('\u000c')
                    'u' -> { sb.append(s.substring(i, i + 4).toInt(16).toChar()); i += 4 }
                    else -> sb.append(e)   // guillemet, antislash et barre oblique échappés
                }
            }
        }
        fun obj(): Map<String, Any?> {
            expect('{'); val m = LinkedHashMap<String, Any?>(); ws()
            if (i < s.length && s[i] == '}') { i++; return m }
            while (true) {
                ws(); val k = str(); ws(); expect(':'); m[k] = value(); ws()
                if (i < s.length && s[i] == ',') { i++; continue }
                expect('}'); return m
            }
        }
        fun arr(): List<Any?> {
            expect('['); val l = ArrayList<Any?>(); ws()
            if (i < s.length && s[i] == ']') { i++; return l }
            while (true) {
                l.add(value()); ws()
                if (i < s.length && s[i] == ',') { i++; continue }
                expect(']'); return l
            }
        }
    }
}
