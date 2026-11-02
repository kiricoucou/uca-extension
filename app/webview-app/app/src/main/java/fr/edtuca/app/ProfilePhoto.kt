package fr.edtuca.app

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import java.io.File

/** Photo de profil choisie par l'étudiant : réduite et gardée dans le stockage privé de l'app, jamais envoyée ailleurs. */
object ProfilePhoto {
    private const val MAX_SIDE = 512

    private fun file(ctx: Context) = File(ctx.filesDir, "profile_photo.jpg")

    fun exists(ctx: Context) = file(ctx).isFile

    fun load(ctx: Context): Bitmap? = if (exists(ctx)) BitmapFactory.decodeFile(file(ctx).path) else null

    /** Copie l'image choisie en la réduisant (côté max 512 px, JPEG). false si ce n'est pas une image lisible. */
    fun save(ctx: Context, uri: Uri): Boolean {
        return try {
            val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
            ctx.contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, bounds) }
            if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return false
            var sample = 1
            while (maxOf(bounds.outWidth, bounds.outHeight) / (sample * 2) >= MAX_SIDE) sample *= 2
            val bmp = ctx.contentResolver.openInputStream(uri)?.use {
                BitmapFactory.decodeStream(it, null, BitmapFactory.Options().apply { inSampleSize = sample })
            } ?: return false
            val scale = MAX_SIDE.toFloat() / maxOf(bmp.width, bmp.height)
            val out = if (scale < 1f) Bitmap.createScaledBitmap(bmp, (bmp.width * scale).toInt(), (bmp.height * scale).toInt(), true) else bmp
            file(ctx).outputStream().use { out.compress(Bitmap.CompressFormat.JPEG, 88, it) }
            true
        } catch (_: Exception) { false }
    }

    fun delete(ctx: Context) { file(ctx).delete() }
}
