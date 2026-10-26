package fr.edtuca.app

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.os.Handler
import android.os.Looper
import androidx.core.content.FileProvider
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors
import java.util.zip.ZipInputStream

/**
 * Gestionnaire autonome de mise à jour via GitHub.
 * Supporte :
 * 1. Mise à jour à chaud OTA (Over-The-Air) ultra-rapide (2 secondes, ~390 Ko) sans réinstaller l'APK.
 * 2. Téléchargement de l'APK complet (uniquement si le code natif Android / Manifeste évolue).
 */
object GithubUpdateManager {

    const val GITHUB_REPO_URL = "https://github.com/kiricoucou/uca-extension"
    const val GITHUB_VERSION_RAW_URL = "https://raw.githubusercontent.com/kiricoucou/uca-extension/main/version.json"
    const val GITHUB_COMMITS_API_URL = "https://api.github.com/repos/kiricoucou/uca-extension/commits/main"
    const val GITHUB_RAW_APK_URL = "https://raw.githubusercontent.com/kiricoucou/uca-extension/main/EdtUca.apk"
    const val GITHUB_OTA_BUNDLE_URL = "https://raw.githubusercontent.com/kiricoucou/uca-extension/main/core-bundle.zip"
    const val GITHUB_RAW_BASE_URL = "https://raw.githubusercontent.com/kiricoucou/uca-extension/main/"

    private val executor = Executors.newSingleThreadExecutor()
    private val mainHandler = Handler(Looper.getMainLooper())

    data class UpdateInfo(
        val isUpdateAvailable: Boolean,
        val isNativeApkRequired: Boolean,
        val isOtaUpdateAvailable: Boolean,
        val currentVersion: String,
        val latestVersion: String,
        val currentVersionCode: Int,
        val latestVersionCode: Int,
        val minApkVersionCode: Int,
        val commitSha: String,
        val branch: String,
        val publishedAt: String,
        val changelog: List<String>,
        val otaBundleUrl: String,
        val rawBaseUrl: String,
        val apkDownloadUrl: String,
        val githubRepoUrl: String,
        val isMandatory: Boolean = true
    )

    fun compareSemver(a: String, b: String): Int {
        val pa = a.split(".").map { it.toIntOrNull() ?: 0 }
        val pb = b.split(".").map { it.toIntOrNull() ?: 0 }
        val len = maxOf(pa.size, pb.size)
        for (i in 0 until len) {
            val va = pa.getOrElse(i) { 0 }
            val vb = pb.getOrElse(i) { 0 }
            if (va != vb) return va.compareTo(vb)
        }
        return 0
    }

    /**
     * Vérifie en arrière-plan sur GitHub (branche main) si une nouvelle version existe.
     */
    fun checkForUpdate(context: Context, callback: (UpdateInfo?) -> Unit) {
        val appContext = context.applicationContext
        val (localVersionName, localVersionCode) = try {
            val pkg = appContext.packageManager.getPackageInfo(appContext.packageName, 0)
            val code = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                pkg.longVersionCode.toInt()
            } else {
                @Suppress("DEPRECATION")
                pkg.versionCode
            }
            Pair(pkg.versionName ?: "1.1.0", code)
        } catch (e: Exception) {
            Pair("1.1.0", 2)
        }

        val installedCommit = PrefsStore.installedCommit(appContext)

        executor.execute {
            var updateInfo: UpdateInfo? = null
            try {
                val url = URL("$GITHUB_VERSION_RAW_URL?t=${System.currentTimeMillis()}")
                val conn = (url.openConnection() as HttpURLConnection).apply {
                    connectTimeout = 6000
                    readTimeout = 6000
                    setRequestProperty("User-Agent", "MyUCA-App")
                    setRequestProperty("Cache-Control", "no-cache")
                }

                if (conn.responseCode in 200..299) {
                    val body = conn.inputStream.bufferedReader().use { it.readText() }
                    val json = JSONObject(body)

                    val remoteVersion = json.optString("version", localVersionName)
                    val remoteVersionCode = json.optInt("version_code", localVersionCode)
                    val minApkVersionCode = json.optInt("min_apk_version_code", 2)
                    val commitSha = json.optString("commit_sha", "main").take(7)
                    val branch = json.optString("branch", "main")
                    val publishedAt = json.optString("published_at", "25/10/2026")
                    val forceUpdate = json.optBoolean("force_update", true)
                    val apkUrl = json.optString("apk_download_url", GITHUB_RAW_APK_URL)
                    val otaUrl = json.optString("ota_bundle_url", GITHUB_OTA_BUNDLE_URL)
                    val rawBase = json.optString("raw_base_url", GITHUB_RAW_BASE_URL)
                    val repoUrl = json.optString("github_repo_url", GITHUB_REPO_URL)

                    val changelogList = mutableListOf<String>()
                    val changelogArr = json.optJSONArray("changelog")
                    if (changelogArr != null) {
                        for (i in 0 until changelogArr.length()) {
                            changelogList.add(changelogArr.getString(i))
                        }
                    } else {
                        changelogList.add("Mise à jour rapide des composants et synchronisation")
                    }

                    // On a besoin de retélécharger l'APK uniquement si le code natif a changé
                    val isNativeApkRequired = minApkVersionCode > localVersionCode
                    val isNewer = isNativeApkRequired ||
                            remoteVersionCode > localVersionCode ||
                            compareSemver(remoteVersion, localVersionName) > 0 ||
                            (commitSha != installedCommit && commitSha.isNotBlank()) ||
                            (forceUpdate && remoteVersion != localVersionName)

                    val isOtaAvailable = isNewer && !isNativeApkRequired

                    updateInfo = UpdateInfo(
                        isUpdateAvailable = isNewer,
                        isNativeApkRequired = isNativeApkRequired,
                        isOtaUpdateAvailable = isOtaAvailable,
                        currentVersion = localVersionName,
                        latestVersion = remoteVersion,
                        currentVersionCode = localVersionCode,
                        latestVersionCode = remoteVersionCode,
                        minApkVersionCode = minApkVersionCode,
                        commitSha = commitSha,
                        branch = branch,
                        publishedAt = publishedAt,
                        changelog = changelogList,
                        otaBundleUrl = otaUrl,
                        rawBaseUrl = rawBase,
                        apkDownloadUrl = apkUrl,
                        githubRepoUrl = repoUrl,
                        isMandatory = true
                    )
                }
            } catch (_: Exception) {
                // Hors-ligne ou GitHub temporairement inaccessible
            }

            mainHandler.post {
                callback(updateInfo)
            }
        }
    }

    /**
     * Applique la mise à jour à chaud OTA (Over-The-Air) :
     * Télécharge le bundle zippé (ou les fichiers modifiés) dans filesDir/live-site/,
     * sans jamais toucher à l'APK ni demander d'installation Android.
     */
    fun downloadAndApplyOtaUpdate(
        activity: Activity,
        updateInfo: UpdateInfo,
        onProgress: (Int) -> Unit,
        onComplete: () -> Unit,
        onError: (String) -> Unit
    ) {
        executor.execute {
            try {
                val liveSiteDir = File(activity.filesDir, "live-site")
                if (!liveSiteDir.exists()) liveSiteDir.mkdirs()

                var success = false

                // 1. Essai de téléchargement du bundle zip
                try {
                    val url = URL("${updateInfo.otaBundleUrl}?t=${System.currentTimeMillis()}")
                    val conn = (url.openConnection() as HttpURLConnection).apply {
                        connectTimeout = 8000
                        readTimeout = 15000
                        setRequestProperty("User-Agent", "MyUCA-OTA")
                    }

                    if (conn.responseCode in 200..299) {
                        val totalLen = conn.contentLength
                        var downloaded = 0L

                        conn.inputStream.use { rawIn ->
                            val zipIn = ZipInputStream(rawIn)
                            var entry = zipIn.nextEntry
                            while (entry != null) {
                                val targetFile = File(liveSiteDir, entry.name)
                                if (entry.isDirectory) {
                                    targetFile.mkdirs()
                                } else {
                                    targetFile.parentFile?.mkdirs()
                                    FileOutputStream(targetFile).use { out ->
                                        val buf = ByteArray(4096)
                                        var len: Int
                                        while (zipIn.read(buf).also { len = it } != -1) {
                                            out.write(buf, 0, len)
                                            downloaded += len
                                            if (totalLen > 0) {
                                                val pct = ((downloaded * 100) / totalLen).toInt().coerceIn(0, 95)
                                                mainHandler.post { onProgress(pct) }
                                            }
                                        }
                                    }
                                }
                                zipIn.closeEntry()
                                entry = zipIn.nextEntry
                            }
                        }
                        success = true
                    }
                } catch (_: Exception) {
                    success = false
                }

                // 2. Si le zip est absent ou a échoué, repli sur le téléchargement direct des fichiers clés
                if (!success) {
                    val filesToDownload = listOf(
                        "core/agenda.js",
                        "core/shared.js",
                        "core/env.js",
                        "core/github-updater.js",
                        "choose.html",
                        "choose.js",
                        "site/app.html",
                        "version.json",
                        "manifest.json"
                    )

                    var count = 0
                    for (relPath in filesToDownload) {
                        try {
                            val fUrl = URL("${updateInfo.rawBaseUrl}$relPath?t=${System.currentTimeMillis()}")
                            val conn = (fUrl.openConnection() as HttpURLConnection).apply {
                                connectTimeout = 5000
                                readTimeout = 8000
                            }
                            if (conn.responseCode in 200..299) {
                                val dest = File(liveSiteDir, relPath)
                                dest.parentFile?.mkdirs()
                                dest.outputStream().use { out ->
                                    conn.inputStream.copyTo(out)
                                }
                            }
                        } catch (_: Exception) {}
                        count++
                        val pct = ((count * 100) / filesToDownload.size).coerceIn(0, 95)
                        mainHandler.post { onProgress(pct) }
                    }
                    success = true
                }

                if (success) {
                    PrefsStore.setInstalledCommit(activity, updateInfo.commitSha)
                    PrefsStore.setInstalledBundleVersion(activity, updateInfo.latestVersion)

                    mainHandler.post {
                        onProgress(100)
                        onComplete()
                    }
                } else {
                    mainHandler.post { onError("Impossible de récupérer les fichiers de mise à jour.") }
                }

            } catch (e: Exception) {
                mainHandler.post {
                    onError("Échec OTA : ${e.localizedMessage ?: "erreur réseau"}")
                }
            }
        }
    }

    /**
     * Télécharge le fichier APK directement depuis GitHub avec suivi de progression,
     * puis déclenche l'installation Android standard (uniquement si le code natif change).
     */
    fun downloadAndInstallApk(
        activity: Activity,
        apkUrl: String,
        onProgress: (Int) -> Unit,
        onError: (String) -> Unit
    ) {
        executor.execute {
            try {
                val targetDir = activity.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS)
                    ?: activity.cacheDir
                val apkFile = File(targetDir, "MyUCA-latest.apk")
                if (apkFile.exists()) apkFile.delete()

                val url = URL(apkUrl)
                val conn = (url.openConnection() as HttpURLConnection).apply {
                    connectTimeout = 10000
                    readTimeout = 30000
                    setRequestProperty("User-Agent", "MyUCA-App")
                }

                if (conn.responseCode !in 200..299) {
                    mainHandler.post { onError("Erreur HTTP ${conn.responseCode} lors du téléchargement de l'APK.") }
                    return@execute
                }

                val totalLength = conn.contentLength
                var downloaded = 0L

                conn.inputStream.use { input ->
                    FileOutputStream(apkFile).use { output ->
                        val buffer = ByteArray(8192)
                        var bytesRead: Int
                        while (input.read(buffer).also { bytesRead = it } != -1) {
                            output.write(buffer, 0, bytesRead)
                            downloaded += bytesRead
                            if (totalLength > 0) {
                                val progress = ((downloaded * 100) / totalLength).toInt()
                                mainHandler.post { onProgress(progress) }
                            }
                        }
                    }
                }

                mainHandler.post {
                    onProgress(100)
                    installApk(activity, apkFile)
                }
            } catch (e: Exception) {
                mainHandler.post {
                    onError("Échec du téléchargement : ${e.localizedMessage ?: "erreur réseau"}")
                }
            }
        }
    }

    fun installApk(activity: Activity, apkFile: File) {
        try {
            val uri = FileProvider.getUriForFile(
                activity,
                "${activity.packageName}.fileprovider",
                apkFile
            )
            val intent = Intent(Intent.ACTION_VIEW).apply {
                setDataAndType(uri, "application/vnd.android.package-archive")
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_GRANT_READ_URI_PERMISSION
            }
            activity.startActivity(intent)
        } catch (e: Exception) {
            openGithubDownload(activity, GITHUB_REPO_URL)
        }
    }

    fun openGithubDownload(activity: Activity, url: String) {
        try {
            val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
            activity.startActivity(intent)
        } catch (_: Exception) {}
    }

    /**
     * Génère une simulation réaliste d'une mise à jour OTA ultra-rapide (2 sec)
     * pour tester le hot-reload sans réinstaller l'APK.
     */
    fun createSimulatedOtaUpdate(context: Context): UpdateInfo {
        val (localVersionName, localVersionCode) = try {
            val pkg = context.packageManager.getPackageInfo(context.packageName, 0)
            Pair(pkg.versionName ?: "1.1.0", 2)
        } catch (_: Exception) {
            Pair("1.1.0", 2)
        }

        return UpdateInfo(
            isUpdateAvailable = true,
            isNativeApkRequired = false,
            isOtaUpdateAvailable = true,
            currentVersion = localVersionName,
            latestVersion = "1.1.1",
            currentVersionCode = localVersionCode,
            latestVersionCode = localVersionCode,
            minApkVersionCode = localVersionCode,
            commitSha = "c49b81e",
            branch = "main",
            publishedAt = "25/10/2026 à 17:15",
            changelog = listOf(
                "⚡ Mise à jour à chaud OTA (Over-The-Air) sans réinstaller l'APK",
                "Synchronisation temps réel des cours et des notes d'Odin",
                "Correctif de vitesse et amélioration du cache"
            ),
            otaBundleUrl = GITHUB_OTA_BUNDLE_URL,
            rawBaseUrl = GITHUB_RAW_BASE_URL,
            apkDownloadUrl = GITHUB_RAW_APK_URL,
            githubRepoUrl = GITHUB_REPO_URL,
            isMandatory = true
        )
    }

    /**
     * Simulation d'une mise à jour native complète (changement du code Kotlin / Manifeste).
     */
    fun createSimulatedNativeUpdate(context: Context): UpdateInfo {
        val (localVersionName, localVersionCode) = try {
            val pkg = context.packageManager.getPackageInfo(context.packageName, 0)
            Pair(pkg.versionName ?: "1.1.0", 2)
        } catch (_: Exception) {
            Pair("1.1.0", 2)
        }

        return UpdateInfo(
            isUpdateAvailable = true,
            isNativeApkRequired = true,
            isOtaUpdateAvailable = false,
            currentVersion = localVersionName,
            latestVersion = "2.0.0",
            currentVersionCode = localVersionCode,
            latestVersionCode = localVersionCode + 1,
            minApkVersionCode = localVersionCode + 1,
            commitSha = "f8a12bc",
            branch = "main",
            publishedAt = "25/10/2026 à 17:15",
            changelog = listOf(
                "📦 Refonte native Android : nouveau moteur de notifications et widget système",
                "Nouveau socle Android SDK 35",
                "Réinstallation de l'APK requise pour cette version majeure"
            ),
            otaBundleUrl = GITHUB_OTA_BUNDLE_URL,
            rawBaseUrl = GITHUB_RAW_BASE_URL,
            apkDownloadUrl = GITHUB_RAW_APK_URL,
            githubRepoUrl = GITHUB_REPO_URL,
            isMandatory = true
        )
    }
}
