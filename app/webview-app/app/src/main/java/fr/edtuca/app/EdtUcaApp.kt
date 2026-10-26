package fr.edtuca.app

import android.app.Application

/** Applique le mode sombre/clair choisi par l'utilisateur avant la première Activity. */
class EdtUcaApp : Application() {
    override fun onCreate() {
        super.onCreate()
        PrefsStore.applyThemeMode(PrefsStore.themeMode(this))
    }
}
