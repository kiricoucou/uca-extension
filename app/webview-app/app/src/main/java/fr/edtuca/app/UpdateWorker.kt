package fr.edtuca.app

import android.content.Context
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.Worker
import androidx.work.WorkerParameters
import java.util.concurrent.TimeUnit

/**
 * Contrôle périodique des mises à jour sur GitHub, même app fermée (toutes les heures, réseau requis).
 * Il cherche et applique une mise à jour signée des pages (LiveUpdate) ; elle sera visible à la prochaine ouverture.
 * Un nouveau code natif (APK) est proposé à l'ouverture suivante par l'écran d'installation.
 */
class UpdateWorker(ctx: Context, params: WorkerParameters) : Worker(ctx, params) {
    override fun doWork(): Result {
        LiveUpdate.checkAndApplyNow(applicationContext)
        MailWatcher.checkBlocking(applicationContext)
        return Result.success()
    }

    companion object {
        private const val NAME = "uca-live-update"

        fun schedule(context: Context) {
            val req = PeriodicWorkRequestBuilder<UpdateWorker>(1, TimeUnit.HOURS)
                .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                .build()
            WorkManager.getInstance(context).enqueueUniquePeriodicWork(NAME, ExistingPeriodicWorkPolicy.KEEP, req)
        }
    }
}
