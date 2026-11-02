package fr.edtuca.app

import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Base64
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import java.security.Signature
import java.security.cert.CertificateFactory
import java.io.ByteArrayInputStream
import java.util.concurrent.Executors
import java.util.zip.ZipInputStream

/**
 * Mise à jour automatique de l'interface (pages web de l'app) depuis GitHub, sans retélécharger l'APK.
 *
 * Sécurité : le paquet (ota-bundle.zip) n'est appliqué que si sa signature (ota-bundle.sig, RSA SHA-256)
 * est valable pour le certificat qui signe CETTE application. Un dépôt GitHub piraté ou un fichier
 * remplacé en route ne peut donc pas faire exécuter du code : sans la clé privée de signature, rien ne passe.
 * Les adresses sont écrites en dur, jamais lues dans version.json. Le paquet doit viser la même version native
 * (base_version_code) et une version strictement plus récente (pas de retour en arrière).
 */
object LiveUpdate {
    private const val RAW = "https://raw.githubusercontent.com/kiricoucou/uca-extension/main/"
    private const val VERSION_URL = RAW + "version.json"
    private const val BUNDLE_URL = RAW + "ota-bundle.zip"
    private const val SIG_URL = RAW + "ota-bundle.sig"

    private const val MAX_ZIP_BYTES = 25L * 1024 * 1024
    private const val MAX_UNZIPPED_BYTES = 60L * 1024 * 1024
    private const val MAX_ENTRIES = 3000
    private val ALLOWED_EXT = setOf(
        "html", "js", "css", "json", "png", "jpg", "jpeg", "gif", "svg", "webp", "ico",
        "woff", "woff2", "ttf", "txt", "webmanifest", "md"
    )

    private val executor = Executors.newSingleThreadExecutor()
    private val main = Handler(Looper.getMainLooper())

    sealed class Result {
        object UpToDate : Result()
        object NeedsApk : Result()
        data class Applied(val version: String) : Result()
        data class Failed(val reason: String) : Result()
    }

    private fun liveDir(ctx: Context) = File(ctx.filesDir, "live-site")

    private fun versionCode(ctx: Context): Int {
        val pkg = ctx.packageManager.getPackageInfo(ctx.packageName, 0)
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) pkg.longVersionCode.toInt()
        else @Suppress("DEPRECATION") pkg.versionCode
    }

    private fun versionName(ctx: Context): String =
        ctx.packageManager.getPackageInfo(ctx.packageName, 0).versionName ?: "0"

    /** Dossier des pages mises à jour s'il est valable pour cette version native, sinon null (et nettoyé). */
    fun liveRoot(ctx: Context): File? {
        val dir = liveDir(ctx)
        if (!dir.isDirectory) return null
        val ok = try {
            val meta = JSONObject(File(dir, "ota.json").readText())
            meta.getInt("base_version_code") == versionCode(ctx) &&
                GithubUpdateManager.compareSemver(meta.getString("bundle_version"), versionName(ctx)) > 0
        } catch (_: Exception) { false }
        if (!ok) { dir.deleteRecursively(); return null }
        return dir
    }

    /** Fichier d'une page mise à jour, ou null : refuse tout chemin qui sortirait du dossier. */
    fun liveFile(ctx: Context, relativePath: String): File? {
        val root = liveRoot(ctx) ?: return null
        val f = File(root, relativePath)
        val rootPath = root.canonicalPath + File.separator
        return if (f.canonicalPath.startsWith(rootPath) && f.isFile && f.length() > 0) f else null
    }

    private fun download(url: String, maxBytes: Long): ByteArray {
        val conn = (URL(url).openConnection() as HttpURLConnection).apply {
            connectTimeout = 8000; readTimeout = 20000
            instanceFollowRedirects = true
            setRequestProperty("User-Agent", "MyUCA-OTA")
            setRequestProperty("Cache-Control", "no-cache")
        }
        if (conn.responseCode !in 200..299) throw IllegalStateException("HTTP ${conn.responseCode}")
        if (!conn.url.protocol.equals("https", true)) throw IllegalStateException("redirection non sécurisée")
        val out = ByteArrayOutputStream()
        conn.inputStream.use { input ->
            val buf = ByteArray(8192)
            var total = 0L
            while (true) {
                val n = input.read(buf)
                if (n < 0) break
                total += n
                if (total > maxBytes) throw IllegalStateException("fichier trop gros")
                out.write(buf, 0, n)
            }
        }
        return out.toByteArray()
    }

    @Suppress("DEPRECATION")
    private fun signingCertBytes(ctx: Context): List<ByteArray> {
        val pm = ctx.packageManager
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            val info = pm.getPackageInfo(ctx.packageName, PackageManager.GET_SIGNING_CERTIFICATES)
            val si = info.signingInfo ?: return emptyList()
            (if (si.hasMultipleSigners()) si.apkContentsSigners else si.signingCertificateHistory).map { it.toByteArray() }
        } else {
            pm.getPackageInfo(ctx.packageName, PackageManager.GET_SIGNATURES).signatures.map { it.toByteArray() }
        }
    }

    /** true seulement si la signature est valable pour un certificat de signature de cette application. */
    private fun signatureValid(ctx: Context, data: ByteArray, sigB64: String): Boolean {
        val sig = try { Base64.decode(sigB64.trim(), Base64.DEFAULT) } catch (_: Exception) { return false }
        val cf = CertificateFactory.getInstance("X.509")
        for (certBytes in signingCertBytes(ctx)) {
            try {
                val cert = cf.generateCertificate(ByteArrayInputStream(certBytes))
                val verifier = Signature.getInstance("SHA256withRSA")
                verifier.initVerify(cert.publicKey)
                verifier.update(data)
                if (verifier.verify(sig)) return true
            } catch (_: Exception) { }
        }
        return false
    }

    /** Extrait le zip dans [target] : chemins contrôlés, extensions autorisées, tailles limitées. */
    private fun extract(zip: ByteArray, target: File) {
        target.deleteRecursively(); target.mkdirs()
        val base = target.canonicalPath + File.separator
        var entries = 0
        var total = 0L
        ZipInputStream(ByteArrayInputStream(zip)).use { zin ->
            while (true) {
                val e = zin.nextEntry ?: break
                if (++entries > MAX_ENTRIES) throw IllegalStateException("trop de fichiers")
                val dest = File(target, e.name)
                if (!dest.canonicalPath.startsWith(base)) throw IllegalStateException("chemin interdit")
                if (e.isDirectory) { dest.mkdirs(); continue }
                if (e.name.substringAfterLast('.', "").lowercase() !in ALLOWED_EXT) throw IllegalStateException("type interdit")
                dest.parentFile?.mkdirs()
                dest.outputStream().use { out ->
                    val buf = ByteArray(8192)
                    while (true) {
                        val n = zin.read(buf)
                        if (n < 0) break
                        total += n
                        if (total > MAX_UNZIPPED_BYTES) throw IllegalStateException("contenu trop gros")
                        out.write(buf, 0, n)
                    }
                }
            }
        }
    }

    /**
     * Cherche une mise à jour des pages et l'applique si tout est valable. Appelé en arrière-plan ;
     * [onResult] est rappelé sur le thread principal. Ne bloque jamais l'utilisateur.
     */
    fun checkAndApply(context: Context, onResult: (Result) -> Unit) {
        val ctx = context.applicationContext
        executor.execute {
            val result = try { run(ctx) } catch (e: Exception) { Result.Failed(e.message ?: "erreur") }
            main.post { onResult(result) }
        }
    }

    /** Version sans callback pour le contrôle périodique en arrière-plan (WorkManager, thread déjà secondaire). */
    fun checkAndApplyNow(context: Context): Result =
        try { run(context.applicationContext) } catch (e: Exception) { Result.Failed(e.message ?: "erreur") }

    private fun run(ctx: Context): Result {
        val local = versionCode(ctx)
        val current = liveRoot(ctx)?.let { JSONObject(File(it, "ota.json").readText()).getString("bundle_version") }
            ?: versionName(ctx)

        val info = JSONObject(String(download("$VERSION_URL?t=${System.currentTimeMillis()}", 200_000)))
        if (info.optInt("min_apk_version_code", 0) > local) return Result.NeedsApk
        val announced = info.optString("ota_version", "")
        if (announced.isEmpty() || info.optInt("ota_base_version_code", -1) != local) return Result.UpToDate
        if (GithubUpdateManager.compareSemver(announced, current) <= 0) return Result.UpToDate

        val zip = download("$BUNDLE_URL?t=${System.currentTimeMillis()}", MAX_ZIP_BYTES)
        val sig = String(download("$SIG_URL?t=${System.currentTimeMillis()}", 4096))
        if (!signatureValid(ctx, zip, sig)) return Result.Failed("signature invalide")

        val staging = File(ctx.filesDir, "live-site.new")
        extract(zip, staging)
        val meta = JSONObject(File(staging, "ota.json").readText())
        if (meta.getInt("base_version_code") != local) { staging.deleteRecursively(); return Result.Failed("version native différente") }
        val version = meta.getString("bundle_version")
        if (GithubUpdateManager.compareSemver(version, current) <= 0) { staging.deleteRecursively(); return Result.UpToDate }
        if (!File(staging, "index.html").isFile) { staging.deleteRecursively(); return Result.Failed("paquet incomplet") }

        // Remplacement : l'ancien dossier n'est supprimé qu'une fois le nouveau en place.
        val live = liveDir(ctx)
        val old = File(ctx.filesDir, "live-site.old")
        old.deleteRecursively()
        if (live.exists() && !live.renameTo(old)) { staging.deleteRecursively(); return Result.Failed("remplacement impossible") }
        if (!staging.renameTo(live)) { old.renameTo(live); return Result.Failed("remplacement impossible") }
        old.deleteRecursively()
        PrefsStore.setInstalledBundleVersion(ctx, version)
        return Result.Applied(version)
    }

    @Suppress("unused")
    private fun sha256(b: ByteArray): String = MessageDigest.getInstance("SHA-256").digest(b).joinToString("") { "%02x".format(it) }
}
