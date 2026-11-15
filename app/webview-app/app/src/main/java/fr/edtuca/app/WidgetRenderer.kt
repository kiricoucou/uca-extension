package fr.edtuca.app

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Typeface
import android.net.Uri
import android.util.TypedValue
import android.view.View
import android.widget.RemoteViews
import fr.edtuca.app.WidgetModel.dayStart
import fr.edtuca.app.WidgetModel.durText
import fr.edtuca.app.WidgetModel.fmtNote
import fr.edtuca.app.WidgetModel.hm
import fr.edtuca.app.WidgetModel.rel

/**
 * Dessin des widgets (RemoteViews) à partir du résumé poussé par la page web. Les 25 widgets reprennent ceux de l'app web
 * (core/widgets.js) : mêmes noms, mêmes textes, mêmes seuils de couleur. Toucher un widget ouvre l'app sur l'écran utile
 * (agenda, notes, absences ou devoirs) ; « Connexion » et « Synchronisation » portent un vrai bouton.
 */
object WidgetRenderer {
    private val ACCENT = Color.parseColor("#18B7B0")
    private val TEXT = Color.parseColor("#F2F3F5")
    private val DIM = Color.parseColor("#9AA0AB")
    private val RED = Color.parseColor("#EF6B6B")
    private val ORANGE = Color.parseColor("#FF8C1A")
    private val GREEN = Color.parseColor("#2FD68F")
    private val BLUE = Color.parseColor("#4AA3DF")

    private val ROW_L = intArrayOf(R.id.wL1, R.id.wL2, R.id.wL3, R.id.wL4, R.id.wL5, R.id.wL6)
    private val ROW_R = intArrayOf(R.id.wR1, R.id.wR2, R.id.wR3, R.id.wR4, R.id.wR5, R.id.wR6)
    private val ROW_BOX = intArrayOf(R.id.wRow1, R.id.wRow2, R.id.wRow3, R.id.wRow4, R.id.wRow5, R.id.wRow6)

    fun gradeColor(n: Double?): Int = when { n == null -> DIM; n >= 14 -> GREEN; n >= 10 -> BLUE; n >= 8 -> ORANGE; else -> RED }

    /** Écran demandé au toucher : « notes », « absences », « tasks », ou rien (agenda). */
    private fun open(ctx: Context, id: String, panel: String? = null, action: String? = null): PendingIntent {
        val i = Intent(ctx, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
            data = Uri.parse("uca://widget/$id/${panel ?: "-"}/${action ?: "-"}")
            if (panel != null) putExtra(EXTRA_OPEN, panel)
            if (action != null) putExtra(EXTRA_ACTION, action)
        }
        return PendingIntent.getActivity(ctx, (id + (panel ?: "") + (action ?: "")).hashCode(), i, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }

    const val EXTRA_OPEN = "uca_open"
    const val EXTRA_ACTION = "uca_action"
    val PANELS = setOf("notes", "absences", "tasks")

    // ---------------------------------------------------------------------------------------------- mises en page de base
    private fun card(ctx: Context, label: String, big: String? = null, bigColor: Int = TEXT, title: String? = null, sub: String? = null): RemoteViews {
        val rv = RemoteViews(ctx.packageName, R.layout.widget_card)
        rv.setTextViewText(R.id.wLabel, label.uppercase())
        fun fill(id: Int, text: String?) { if (text.isNullOrEmpty()) rv.setViewVisibility(id, View.GONE) else { rv.setViewVisibility(id, View.VISIBLE); rv.setTextViewText(id, text) } }
        fill(R.id.wBig, big); rv.setTextColor(R.id.wBig, bigColor)
        if (big != null && big.length > 6) rv.setTextViewTextSize(R.id.wBig, TypedValue.COMPLEX_UNIT_SP, 22f) else rv.setTextViewTextSize(R.id.wBig, TypedValue.COMPLEX_UNIT_SP, 30f)
        fill(R.id.wTitle, title); fill(R.id.wSub, sub)
        return rv
    }

    private fun list(ctx: Context, label: String, rows: List<Triple<String, String, Int?>>, empty: String): RemoteViews {
        val rv = RemoteViews(ctx.packageName, R.layout.widget_list)
        rv.setTextViewText(R.id.wLabel, label.uppercase())
        rows.take(6).forEachIndexed { i, (l, r, color) ->
            rv.setViewVisibility(ROW_BOX[i], View.VISIBLE)
            rv.setTextViewText(ROW_L[i], l); rv.setTextColor(ROW_L[i], TEXT)
            rv.setTextViewText(ROW_R[i], r); rv.setTextColor(ROW_R[i], color ?: DIM)
        }
        for (i in rows.size until 6) rv.setViewVisibility(ROW_BOX[i], View.GONE)
        if (rows.isEmpty()) { rv.setViewVisibility(R.id.wEmpty, View.VISIBLE); rv.setTextViewText(R.id.wEmpty, empty) } else rv.setViewVisibility(R.id.wEmpty, View.GONE)
        return rv
    }

    private fun chart(ctx: Context, label: String, bmp: Bitmap?, sub: String?, empty: String): RemoteViews {
        val rv = RemoteViews(ctx.packageName, R.layout.widget_chart)
        rv.setTextViewText(R.id.wLabel, label.uppercase())
        if (bmp != null) { rv.setViewVisibility(R.id.wImg, View.VISIBLE); rv.setImageViewBitmap(R.id.wImg, bmp); rv.setViewVisibility(R.id.wEmpty, View.GONE) }
        else { rv.setViewVisibility(R.id.wImg, View.GONE); rv.setViewVisibility(R.id.wEmpty, View.VISIBLE); rv.setTextViewText(R.id.wEmpty, empty) }
        if (sub.isNullOrEmpty()) rv.setViewVisibility(R.id.wSub, View.GONE) else { rv.setViewVisibility(R.id.wSub, View.VISIBLE); rv.setTextViewText(R.id.wSub, sub) }
        return rv
    }

    private fun action(ctx: Context, label: String, big: String, bigColor: Int, sub: String?, btn: String, pi: PendingIntent): RemoteViews {
        val rv = RemoteViews(ctx.packageName, R.layout.widget_action)
        rv.setTextViewText(R.id.wLabel, label.uppercase())
        rv.setTextViewText(R.id.wBig, big); rv.setTextColor(R.id.wBig, bigColor)
        rv.setTextViewTextSize(R.id.wBig, TypedValue.COMPLEX_UNIT_SP, if (big.length > 6) 20f else 26f)
        if (sub.isNullOrEmpty()) rv.setViewVisibility(R.id.wSub, View.GONE) else { rv.setViewVisibility(R.id.wSub, View.VISIBLE); rv.setTextViewText(R.id.wSub, sub) }
        rv.setTextViewText(R.id.wBtn, btn); rv.setOnClickPendingIntent(R.id.wBtn, pi)
        return rv
    }

    private fun short(t: String, n: Int) = if (t.length > n) t.take(n - 1) + "…" else t
    private fun slot(e: WEvent) = "${hm(e.sh, e.sm)}–${hm(e.eh, e.em)}"
    private fun clock(ms: Long): String { val c = java.util.Calendar.getInstance().apply { timeInMillis = ms }; return hm(c.get(java.util.Calendar.HOUR_OF_DAY), c.get(java.util.Calendar.MINUTE)) }
    private fun noData(ctx: Context, label: String) = card(ctx, label, null, TEXT, "Pas encore de données", "Ouvre l'app et synchronise-toi.")

    // ---------------------------------------------------------------------------------------------- les 25 widgets
    fun render(ctx: Context, id: String, now: Long = System.currentTimeMillis()): RemoteViews {
        val snap = WidgetDataStore.load(ctx, now)
        val v = snap?.let { WidgetModel.derive(it, now) }
        val rv = try { build(ctx, id, v, now) } catch (e: Exception) { card(ctx, "My UCA", null, TEXT, "Widget indisponible", "Ouvre l'app pour le réparer.") }
        // Sauf indication contraire, un toucher ouvre l'app sur l'écran qui correspond au widget.
        if (id != "shortcuts" && id != "status" && id != "sync") rv.setOnClickPendingIntent(R.id.wRoot, open(ctx, id, panelOf(id)))
        return rv
    }

    private fun panelOf(id: String): String? = when (id) {
        "tasks", "late", "nexttask", "exams", "countdown" -> "tasks"
        "avg", "trend", "notes", "recent", "best", "worst" -> "notes"
        "absences" -> "absences"
        else -> null
    }

    private fun build(ctx: Context, id: String, v: WView?, now: Long): RemoteViews {
        val w = WidgetCatalog.byId(id)
        val name = w?.name ?: "My UCA"
        if (v == null) {
            return when (id) {
                "status" -> action(ctx, "Connexion", "Aucune", TEXT, "Aucune donnée pour l'instant", "Ouvrir l'app", open(ctx, id))
                "sync" -> action(ctx, "Synchronisation", "jamais", TEXT, null, "Synchroniser", open(ctx, id, null, "sync"))
                "shortcuts" -> keys(ctx)
                else -> noData(ctx, name)
            }
        }
        return when (id) {
            "next" -> if (!v.hasData) noData(ctx, "Prochain cours") else if (v.next == null) card(ctx, "Prochain cours", "Rien", TEXT, null, "Aucun cours à venir")
                else card(ctx, if (v.cur != null) "En cours" else "Prochain cours", null, TEXT, short(v.next.title, 46),
                    slot(v.next) + (if (v.next.room.isNotEmpty()) " · ${v.next.room}" else "") + "\n" + (if (v.cur != null) "fin ${rel(v.next.end, now)}" else rel(v.next.start, now)))
            "day" -> list(ctx, "Aujourd'hui · ${v.dateLabel}", v.today.map { e -> Triple("${hm(e.sh, e.sm)}  ${short(e.title, 30)}", e.room, if (e.end <= now) Color.parseColor("#5C6370") else if (e.start <= now) BLUE else null) }, if (v.hasData) "Pas de cours aujourd'hui" else "Synchronise-toi pour voir ta journée")
            "days3" -> days3(ctx, v)
            "week" -> chart(ctx, "Cette semaine · ${durText(v.weekLoad.sum())}", if (v.weekLoad.any { it > 0 }) WidgetCharts.weekBars(v.weekLoad, v.weekToday) else null, null, "Aucun cours cette semaine")
            "now" -> if (!v.hasData) noData(ctx, "En ce moment") else if (v.cur != null) card(ctx, "En ce moment", null, TEXT, short(v.cur.title, 40), "${(v.progress * 100).toInt()} % · reste ${durText(((v.cur.end - now) / WidgetModel.MIN).toInt())}")
                else card(ctx, "En ce moment", "Libre", TEXT, null, if (v.next != null) "Prochain ${rel(v.next.start, now)}" else "Aucun cours à venir")
            "room" -> if (!v.hasData) noData(ctx, "Salle") else if (v.next == null) card(ctx, "Salle", "—") else card(ctx, if (v.cur != null) "Salle (en cours)" else "Prochaine salle", v.next.room.ifEmpty { "?" }, TEXT, null, short(v.next.title, 40))
            "endday" -> if (!v.hasData) noData(ctx, "Fin de journée") else if (v.today.isEmpty()) card(ctx, "Fin de journée", "Libre", TEXT, null, "Pas de cours aujourd'hui")
                else if (v.doneToday) card(ctx, "Fin de journée", "Terminé", TEXT, null, "Dernier cours fini à ${clock(v.lastEnd ?: now)}")
                else card(ctx, "Fin des cours", clock(v.lastEnd ?: now), TEXT, null, "dans ${durText(v.todayLeftMin)}")
            "break" -> if (!v.hasData) noData(ctx, "Pause") else if (v.pause != null && v.pause.now) card(ctx, "En pause", durText(v.pause.min), TEXT, null, "jusqu'à ${clock(v.pause.untilMs)}")
                else if (v.pause != null) card(ctx, "Prochaine pause", clock(v.pause.fromMs), TEXT, null, "${durText(v.pause.min)} de pause") else card(ctx, "Pause", "—", TEXT, null, "Pas de pause prévue")
            "freeday" -> if (!v.hasData) noData(ctx, "Prochain jour sans cours") else if (v.freeDay != null) card(ctx, "Prochain jour sans cours", null, TEXT, v.freeDay.label, if (v.freeDay.off == 1) "demain" else "dans ${v.freeDay.off} jours") else card(ctx, "Prochain jour sans cours", "—", TEXT, null, "Aucun dans les 3 semaines")
            "date" -> card(ctx, v.weekday, "${v.day}", TEXT, null, "${v.month} · semaine ${v.week}")
            "tasks" -> list(ctx, "Devoirs · ${v.tasks.size} à faire", v.tasks.map { t -> Triple(short(t.title, 32), t.text, when (t.level) { "late" -> RED; "today", "soon" -> ORANGE; else -> null }) }, "Rien à faire pour l'instant")
            "late" -> card(ctx, "En retard", "${v.late}", if (v.late > 0) RED else TEXT, null, if (v.late > 0) "à rattraper" else "tout est à jour")
            "nexttask" -> { val t = v.tasks.firstOrNull(); if (t == null) card(ctx, "Prochain devoir", "Aucun") else card(ctx, "Prochain devoir", null, TEXT, short(t.title, 40), t.text + (if (t.subject.isNotEmpty()) " · ${t.subject}" else "")) }
            "exams" -> list(ctx, "Examens à venir", v.exams.map { (e, days) -> Triple("${if (days <= 0) "Auj." else "J-$days"}  ${short(e.title, 28)}", e.room, null) }, "Aucun examen prévu")
            "countdown" -> { val x = v.exams.firstOrNull(); if (x == null) card(ctx, "Prochain examen", "—", TEXT, null, "Aucun examen prévu") else card(ctx, "Prochain examen", if (x.second <= 0) "Auj." else "J-${x.second}", TEXT, null, short(x.first.title, 36)) }
            "avg" -> if (v.avg == null) card(ctx, "Moyenne générale", "—", TEXT, null, "Importe tes notes") else card(ctx, "Moyenne générale", fmtNote(v.avg), gradeColor(v.avg), null,
                "/20" + (if (v.avgPrev == null) "" else if (v.avg > v.avgPrev) "   ▲ +${fmtNote(v.avg - v.avgPrev)}" else if (v.avg < v.avgPrev) "   ▼ ${fmtNote(v.avg - v.avgPrev)}" else "   = stable"))
            "trend" -> chart(ctx, "Évolution de la moyenne", if (v.history.size >= 2) WidgetCharts.spark(v.history) else null, if (v.history.size >= 2) "${fmtNote(v.history.first())} → ${fmtNote(v.history.last())}" else null, "La courbe apparaît dès la 2e valeur de moyenne")
            "notes" -> chart(ctx, "Notes par matière", if (v.matieres.isNotEmpty()) WidgetCharts.hBars(v.matieres.take(7)) else null, null, "Importe tes notes pour voir le graphique")
            "recent" -> list(ctx, "Dernières notes", v.evals.take(6).map { e -> Triple(short(e.label.ifEmpty { e.matiere }, 28), fmtNote(e.note), gradeColor(e.note)) }, "Aucune note pour l'instant")
            "best" -> if (v.best == null) card(ctx, "Meilleure matière", "—") else card(ctx, "Meilleure matière", fmtNote(v.best.note), gradeColor(v.best.note), null, short(v.best.label, 32))
            "worst" -> if (v.worst == null) card(ctx, "À surveiller", "—") else card(ctx, "À surveiller", fmtNote(v.worst.note), gradeColor(v.worst.note), null, short(v.worst.label, 32))
            "absences" -> { val a = v.absences; if (a == null) card(ctx, "Absences", "—", TEXT, null, "Importe tes absences") else card(ctx, "Absences", "${a.total}", if (a.unjustified > 0) ORANGE else TEXT, null, "${a.justified} justifiée${if (a.justified > 1) "s" else ""} · ${a.unjustified} non justifiée${if (a.unjustified > 1) "s" else ""}") }
            "status" -> if (v.sessionExpired) action(ctx, "Connexion", "Expirée", RED, "Reconnecte-toi à Odin", "Se connecter", open(ctx, id, null, "login"))
                else if (v.hasData) action(ctx, "Connexion", "Connecté", GREEN, WidgetModel.agoText(v.lastSync, now), "Synchroniser", open(ctx, id, null, "sync"))
                else action(ctx, "Connexion", "Aucune", TEXT, "Aucune donnée", "Se connecter", open(ctx, id, null, "login"))
            "sync" -> action(ctx, "Synchronisation", WidgetModel.agoText(v.lastSync, now), TEXT, null, "Resynchroniser", open(ctx, id, null, "sync"))
            "shortcuts" -> keys(ctx)
            else -> card(ctx, name, null, TEXT, "Widget inconnu", null)
        }
    }

    private fun days3(ctx: Context, v: WView): RemoteViews {
        // Trois jours en liste : un en-tête par jour puis ses cours, 6 lignes au total.
        val rows = ArrayList<Triple<String, String, Int?>>()
        v.days3.forEach { (label, evs) ->
            rows.add(Triple(label, if (evs.isEmpty()) "libre" else "${evs.size} cours", ACCENT))
            evs.take(if (rows.size < 3) 2 else 1).forEach { e -> rows.add(Triple("${hm(e.sh, e.sm)}  ${short(e.title, 26)}", e.room, null)) }
        }
        return list(ctx, "Les 3 prochains jours", rows.take(6), "Aucun cours dans les 3 prochains jours")
    }

    private fun keys(ctx: Context): RemoteViews {
        val rv = RemoteViews(ctx.packageName, R.layout.widget_keys)
        rv.setTextViewText(R.id.wLabel, "RACCOURCIS")
        rv.setOnClickPendingIntent(R.id.wK1, open(ctx, "shortcuts-agenda"))
        rv.setOnClickPendingIntent(R.id.wK2, open(ctx, "shortcuts-notes", "notes"))
        rv.setOnClickPendingIntent(R.id.wK3, open(ctx, "shortcuts-absences", "absences"))
        rv.setOnClickPendingIntent(R.id.wK4, open(ctx, "shortcuts-tasks", "tasks"))
        return rv
    }

    /** Met à jour toutes les instances posées de tous les widgets (après un nouveau résumé ou un passage du temps). */
    fun updateAll(ctx: Context) {
        val mgr = android.appwidget.AppWidgetManager.getInstance(ctx)
        WidgetCatalog.ALL.forEach { w ->
            val ids = mgr.getAppWidgetIds(android.content.ComponentName(ctx, w.provider))
            ids.forEach { mgr.updateAppWidget(it, render(ctx, w.id)) }
        }
    }
}

/** Graphiques dessinés à la main (Canvas) : pas de bibliothèque, un bitmap par widget. */
object WidgetCharts {
    private val TEXT = Color.parseColor("#F2F3F5")
    private val DIM = Color.parseColor("#9AA0AB")
    private val TRACK = Color.parseColor("#2A2E37")
    private val BLUE = Color.parseColor("#4AA3DF")

    private fun paint(color: Int, size: Float = 0f, bold: Boolean = false) = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        this.color = color; if (size > 0f) textSize = size; typeface = if (bold) Typeface.DEFAULT_BOLD else Typeface.DEFAULT
    }

    private fun bitmap(w: Int, h: Int, draw: (Canvas) -> Unit): Bitmap = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888).also { draw(Canvas(it)) }

    fun weekBars(load: List<Int>, today: Int): Bitmap = bitmap(720, 280) { c ->
        val mx = maxOf(60, load.maxOrNull() ?: 60).toFloat()
        val bw = 72f; val gap = (720f - 7 * bw) / 8f
        val lab = paint(DIM, 26f, true); lab.textAlign = Paint.Align.CENTER
        val val_ = paint(TEXT, 24f); val_.textAlign = Paint.Align.CENTER
        val letters = listOf("L", "M", "M", "J", "V", "S", "D")
        load.forEachIndexed { i, min ->
            val x = gap + i * (bw + gap); val bottom = 230f
            val h = if (min == 0) 6f else 12f + (bottom - 40f - 12f) * min / mx
            val p = paint(if (i == today) BLUE else Color.parseColor("#2F5F7D"))
            c.drawRoundRect(RectF(x, bottom - h, x + bw, bottom), 14f, 14f, p)
            if (min > 0) c.drawText(WidgetModel.durText(min), x + bw / 2, bottom - h - 10f, val_)
            c.drawText(letters[i], x + bw / 2, 268f, lab)
        }
    }

    fun hBars(m: List<WMat>): Bitmap {
        val rowH = 56f; val h = (m.size * rowH + 16f).toInt()
        return bitmap(720, h) { c ->
            val name = paint(TEXT, 26f); val num = paint(TEXT, 28f, true); num.textAlign = Paint.Align.RIGHT
            val x0 = 250f; val x1 = 640f
            m.forEachIndexed { i, x ->
                val y = 8f + i * rowH; val mid = y + rowH / 2
                val label = if (x.label.length > 17) x.label.take(16) + "…" else x.label
                c.drawText(label, 0f, mid + 9f, name)
                c.drawRoundRect(RectF(x0, mid - 8f, x1, mid + 8f), 8f, 8f, paint(TRACK))
                val col = WidgetRenderer.gradeColor(x.note)
                val w = (x1 - x0) * (x.note.coerceIn(0.0, 20.0) / 20.0).toFloat()
                c.drawRoundRect(RectF(x0, mid - 8f, x0 + maxOf(w, 12f), mid + 8f), 8f, 8f, paint(col))
                c.drawRect(x0 + (x1 - x0) / 2 - 1f, mid - 12f, x0 + (x1 - x0) / 2 + 1f, mid + 12f, paint(Color.parseColor("#8A93A6")))
                val np = paint(col, 28f, true); np.textAlign = Paint.Align.RIGHT
                c.drawText(fmtNote(x.note), 720f, mid + 10f, np)
            }
        }
    }

    fun spark(points: List<Double>): Bitmap = bitmap(720, 240) { c ->
        val mn = (points.minOrNull() ?: 0.0) - 0.5; val mxv = (points.maxOrNull() ?: 20.0) + 0.5
        fun x(i: Int) = 24f + (720f - 48f) * i / (points.size - 1)
        fun y(v: Double) = 24f + (240f - 60f) * (1f - ((v - mn) / (mxv - mn)).toFloat())
        val line = paint(BLUE); line.style = Paint.Style.STROKE; line.strokeWidth = 7f; line.strokeCap = Paint.Cap.ROUND; line.strokeJoin = Paint.Join.ROUND
        val fill = paint(Color.parseColor("#264AA3DF")); fill.style = Paint.Style.FILL
        val path = android.graphics.Path(); val area = android.graphics.Path()
        points.forEachIndexed { i, v -> if (i == 0) { path.moveTo(x(i), y(v)); area.moveTo(x(i), 240f); area.lineTo(x(i), y(v)) } else { path.lineTo(x(i), y(v)); area.lineTo(x(i), y(v)) } }
        area.lineTo(x(points.size - 1), 240f); area.close()
        c.drawPath(area, fill); c.drawPath(path, line)
        c.drawCircle(x(points.size - 1), y(points.last()), 11f, paint(BLUE))
    }

    private fun fmtNote(n: Double) = WidgetModel.fmtNote(n)
}
