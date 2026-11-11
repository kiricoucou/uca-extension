package fr.edtuca.app

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** Appelé par Android juste après l'installation d'une nouvelle version de l'app : supprime l'APK téléchargé (gain d'espace). */
class ApkCleanupReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_MY_PACKAGE_REPLACED) GithubUpdateManager.cleanupDownloadedApks(context.applicationContext)
    }
}
