package fr.edtuca.app

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class NotifStoreTest {
    private val day = 86_400_000L
    private val now = 100 * day
    private fun item(ageDays: Int, kept: Boolean = false) = NotifStore.Item("note", "t$ageDays$kept", "x", now - ageDays * day, false, kept)

    @Test fun illimiteRienNestSupprime() {
        val items = listOf(item(1), item(500))
        assertEquals(2, NotifStore.prune(items, 0, now).size)
    }

    @Test fun dureeLesNonGardeesVieillesDisparaissent() {
        val out = NotifStore.prune(listOf(item(3), item(10), item(40)), 14, now)
        assertEquals(listOf(3, 10), out.map { ((now - it.at) / day).toInt() })
    }

    @Test fun lesGardeesNeSontJamaisSupprimees() {
        val out = NotifStore.prune(listOf(item(400, kept = true), item(400)), 7, now)
        assertEquals(1, out.size)
        assertTrue(out[0].kept)
    }

    @Test fun limiteExacteConservee() {
        assertEquals(1, NotifStore.prune(listOf(item(14)), 14, now).size)
    }
}
