package fr.edtuca.app

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.webkit.CookieManager
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.Worker
import androidx.work.WorkerParameters
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/**
 * Garde la connexion à Odin : quitter l'app, même longtemps, ne déconnecte jamais.
 *
 * Ce qui garde la session :
 *  - les cookies de la WebView (CAS, Odin, et le cookie « navigateur de confiance » de la double authentification si
 *    l'étudiant a coché la durée proposée à la connexion) restent sur le disque : seul « Se déconnecter » les efface,
 *    jamais une expiration, une mise à jour ni la fermeture de l'app ;
 *  - toutes les 30 minutes, un contrôle silencieux charge une page Odin avec ces cookies : le CAS et Odin voient une
 *    activité et ne laissent pas la session s'endormir.
 *
 * Ce que l'app ne fait PAS (sécurité) : aucun mot de passe ni code 2FA n'est enregistré, aucun cookie n'est lu, copié
 * ni prolongé de force. La durée maximale reste celle que décide l'UCA ; quand elle est atteinte, l'étudiant se reconnecte
 * (et la confiance 2FA évite alors la double authentification pendant la durée qu'il a choisie).
 */
object SessionKeeper {
    private const val NAME = "uca-session-keep"
    private const val MIN_GAP_MS = 25 * 60 * 1000L
    private val handler = Handler(Looper.getMainLooper())

    fun schedule(context: Context) {
        val req = PeriodicWorkRequestBuilder<SessionWorker>(30, TimeUnit.MINUTES)
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .build()
        WorkManager.getInstance(context).enqueueUniquePeriodicWork(NAME, ExistingPeriodicWorkPolicy.KEEP, req)
    }

    /** Texte affiché sous l'interrupteur des réglages. */
    fun statusText(ctx: Context): String {
        if (!PrefsStore.keepAlive(ctx)) return "Désactivé : la session peut s'endormir quand tu n'ouvres pas l'app. Elle n'est jamais effacée pour autant."
        val t = PrefsStore.lastSessionOk(ctx)
        val last = if (t <= 0L) "Aucun contrôle réussi pour l'instant." else {
            val min = ((System.currentTimeMillis() - t) / 60000L).coerceAtLeast(0)
            "Dernier contrôle réussi : " + when {
                min < 1 -> "à l'instant"
                min < 60 -> "il y a $min min"
                min < 48 * 60 -> "il y a ${min / 60} h"
                else -> "il y a ${min / 1440} jours"
            } + "."
        }
        return "Contrôle silencieux toutes les 30 min, sans mot de passe enregistré. $last"
    }

    /** Appelé par le Worker (thread d'arrière-plan) : un contrôle, un second avant de conclure à l'expiration. */
    fun touchBlocking(ctx: Context) {
        if (!PrefsStore.keepAlive(ctx) || !PrefsStore.isLoggedIn(ctx) || PrefsStore.qaDemo(ctx) || PrefsStore.sessionExpired(ctx)) return
        if (System.currentTimeMillis() - PrefsStore.lastSessionOk(ctx) < MIN_GAP_MS) return   // l'app vient déjà de vérifier
        var result = checkOnce(ctx)
        if (result == true) { Thread.sleep(3000); result = checkOnce(ctx) }
        when (result) {
            false -> {
                PrefsStore.setLastSessionOk(ctx, System.currentTimeMillis())
                SessionDiag.log(ctx, "maintien de session en arrière-plan : session valable")
            }
            true -> {
                PrefsStore.setSessionExpired(ctx, true)
                SessionDiag.log(ctx, "maintien de session en arrière-plan : session expirée (reconnexion proposée à la prochaine ouverture)")
            }
            null -> SessionDiag.log(ctx, "maintien de session en arrière-plan : indéterminé (réseau lent ou coupé), rien n'est changé")
        }
        handler.post { CookieManager.getInstance().flush() }
    }

    private fun checkOnce(ctx: Context): Boolean? {
        val latch = CountDownLatch(1)
        val box = arrayOfNulls<Boolean>(1)
        handler.post { UcaSync.checkSession(ctx.applicationContext) { expired -> box[0] = expired; latch.countDown() } }
        latch.await(40, TimeUnit.SECONDS)
        return box[0]
    }
}

class SessionWorker(ctx: Context, params: WorkerParameters) : Worker(ctx, params) {
    override fun doWork(): Result {
        try { SessionKeeper.touchBlocking(applicationContext) } catch (_: Exception) { /* jamais de plantage en arrière-plan */ }
        return Result.success()
    }
}
