package fr.edtuca.app

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.webkit.WebView
import android.webkit.WebViewClient
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/**
 * Surveille la boîte de réception Zimbra avec la session de l'app (cookies de la WebView, jamais lus ni copiés) :
 * si le nombre de mails non lus augmente, une notification « nouveau mail » est créée.
 * Lit aussi l'adresse @etu.uca.fr affichée par Zimbra pour l'écran Compte.
 */
object MailWatcher {
    private val UNREAD_RE = Regex("(?:Réception|Boîte de réception|Inbox)\\s*\\((\\d+)\\)", RegexOption.IGNORE_CASE)
    private val FOLDER_RE = Regex("(?:Réception|Boîte de réception|Inbox)", RegexOption.IGNORE_CASE)
    private val ADDRESS_RE = Regex("([A-Za-z0-9._%+-]+@etu\\.uca\\.fr)", RegexOption.IGNORE_CASE)
    private const val EXTRACT = "(function(){return document.body?document.body.innerText:'';})()"
    private val handler = Handler(Looper.getMainLooper())
    @Volatile private var running = false

    /** À appeler depuis le thread principal. */
    fun check(context: Context, onDone: (() -> Unit)? = null) {
        val ctx = context.applicationContext
        if (running || !PrefsStore.isLoggedIn(ctx) || PrefsStore.sessionExpired(ctx) || !PrefsStore.notifMail(ctx) || PrefsStore.qaDemo(ctx)) { onDone?.invoke(); return }
        running = true
        val web = WebView(ctx)
        web.settings.javaScriptEnabled = true
        web.settings.domStorageEnabled = true
        android.webkit.CookieManager.getInstance().setAcceptCookie(true)
        val ua = web.settings.userAgentString
        if (ua != null) web.settings.userAgentString = ua.replace("; wv", "")
        var finished = false
        val finish = {
            if (!finished) { finished = true; running = false; handler.removeCallbacksAndMessages(web); handler.post { web.destroy() }; onDone?.invoke() }
        }
        fun poll(tries: Int) {
            if (finished) return
            web.evaluateJavascript(EXTRACT) { raw ->
                val text = try { org.json.JSONObject("{\"v\":" + raw + "}").getString("v") } catch (_: Exception) { "" }
                ADDRESS_RE.find(text)?.groupValues?.get(1)?.let { PrefsStore.setStudentProfile(ctx, email = it.lowercase()) }
                val m = UNREAD_RE.find(text)
                val known = m != null || FOLDER_RE.containsMatchIn(text)
                if (known) {
                    val count = m?.groupValues?.get(1)?.toIntOrNull() ?: 0
                    val last = PrefsStore.mailUnread(ctx)
                    if (last >= 0 && count > last) {
                        val n = count - last
                        NotifStore.post(ctx, "mail", if (n > 1) "$n nouveaux mails" else "Nouveau mail reçu", "$count message(s) non lu(s) dans ta boîte de réception")
                    }
                    PrefsStore.setMailUnread(ctx, count)
                    finish()
                } else if (tries <= 1) finish() else handler.postDelayed({ poll(tries - 1) }, 1000)
            }
        }
        web.webViewClient = object : WebViewClient() {
            override fun onPageFinished(view: WebView, url: String?) {
                val host = android.net.Uri.parse(url ?: return).host
                if (host == UcaSync.MAIL_HOST) poll(25)
                // Page de connexion du CAS : la session ne suffit pas, on n'insiste pas (la messagerie demandera la connexion).
                else if (host == "ent.uca.fr") view.evaluateJavascript("(function(){return !!document.querySelector('input[type=password]');})()") { r -> if (r == "true") finish() }
            }
        }
        handler.postAtTime({ finish() }, web, android.os.SystemClock.uptimeMillis() + 45000)
        web.loadUrl(UcaSync.MAIL_CAS_URL)
    }

    /** Version pour un thread d'arrière-plan (WorkManager) : bloque jusqu'à la fin, 60 s au plus. */
    fun checkBlocking(context: Context) {
        val latch = CountDownLatch(1)
        handler.post { check(context) { latch.countDown() } }
        latch.await(60, TimeUnit.SECONDS)
    }
}
