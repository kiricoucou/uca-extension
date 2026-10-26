/* Export et Partage d'Emploi du Temps au format iCalendar (.ics) standard RFC 5545.
   Permet d'importer les cours dans Google Agenda, Apple Calendar, Outlook, ou de partager
   le planning avec d'autres étudiants par Web Share API. */
(function (root) {
  "use strict";

  function pad(n) { return String(n).padStart(2, "0"); }

  /* Formate une date au format iCal UTC (YYYYMMDDTHHMMSSZ) */
  function formatIcsDateTime(year, month, day, hours, minutes) {
    const d = new Date(year, month, day, hours || 0, minutes || 0, 0);
    return (
      d.getUTCFullYear() +
      pad(d.getUTCMonth() + 1) +
      pad(d.getUTCDate()) +
      "T" +
      pad(d.getUTCHours()) +
      pad(d.getUTCMinutes()) +
      pad(d.getUTCSeconds()) +
      "Z"
    );
  }

  function escapeIcsText(str) {
    if (!str) return "";
    return String(str)
      .replace(/\\/g, "\\\\")
      .replace(/;/g, "\\;")
      .replace(/,/g, "\\,")
      .replace(/\n/g, "\\n");
  }

  /* Génère une chaîne iCalendar complète conforme RFC 5545 */
  function eventsToIcs(events, options) {
    const opts = options || {};
    const title = opts.calendarName || "Emploi du temps UCA";
    const nowStr = formatIcsDateTime(new Date().getFullYear(), new Date().getMonth(), new Date().getDate(), new Date().getHours(), new Date().getMinutes());

    const lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//My UCA//Emploi du temps UCA//FR",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "X-WR-CALNAME:" + escapeIcsText(title),
      "X-WR-TIMEZONE:Europe/Paris",
      "REFRESH-INTERVAL;VALUE=DURATION:PT2H"
    ];

    (events || []).forEach((ev, idx) => {
      if (ev.cancelled) return;
      const uid = (ev.id || ("uca-" + ev.year + pad(ev.month + 1) + pad(ev.day) + "-" + idx)) + "@myuca.fr";
      const dtStart = formatIcsDateTime(ev.year, ev.month, ev.day, ev.startH, ev.startM);
      const dtEnd = formatIcsDateTime(ev.year, ev.month, ev.day, ev.endH, ev.endM);

      const descLines = [];
      if (ev.prof) descLines.push("Enseignant: " + ev.prof);
      if (ev.notes) descLines.push("Note personnelle: " + ev.notes);
      if (ev.type) descLines.push("Type: " + ev.type);
      descLines.push("Synchronisé via My UCA");

      lines.push(
        "BEGIN:VEVENT",
        "UID:" + uid,
        "DTSTAMP:" + nowStr,
        "DTSTART:" + dtStart,
        "DTEND:" + dtEnd,
        "SUMMARY:" + escapeIcsText(ev.title || "Cours UCA"),
        ev.room ? "LOCATION:" + escapeIcsText(ev.room) : "LOCATION:Campus UCA",
        "DESCRIPTION:" + escapeIcsText(descLines.join("\n")),
        "STATUS:CONFIRMED"
      );

      // Rappel local 15 minutes avant
      if (opts.includeReminder !== false) {
        lines.push(
          "BEGIN:VALARM",
          "TRIGGER:-PT15M",
          "ACTION:DISPLAY",
          "DESCRIPTION:" + escapeIcsText("Cours dans 15 min : " + (ev.title || "")),
          "END:VALARM"
        );
      }

      lines.push("END:VEVENT");
    });

    lines.push("END:VCALENDAR");
    return lines.join("\r\n");
  }

  /* Déclenche le téléchargement du fichier .ics */
  function downloadIcs(filename, icsContent) {
    const blob = new Blob([icsContent], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename || "emploi_du_temps_uca.ics";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /* Partage natif via Web Share API sur Android/iOS si supporté */
  async function shareIcs(filename, icsContent, title) {
    const fn = filename || "emploi_du_temps_uca.ics";
    const blob = new Blob([icsContent], { type: "text/calendar;charset=utf-8" });
    const file = new File([blob], fn, { type: "text/calendar" });

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
          title: title || "Mon emploi du temps My UCA",
          text: "Voici mon emploi du temps synchronisé avec My UCA."
        });
        return { shared: true, mode: "file" };
      } catch (err) {
        if (err.name !== "AbortError") {
          downloadIcs(fn, icsContent);
          return { shared: false, mode: "download", fallback: true };
        }
        return { shared: false, mode: "cancelled" };
      }
    } else {
      // Téléchargement direct en fallback
      downloadIcs(fn, icsContent);
      return { shared: false, mode: "download" };
    }
  }

  root.UCA_EXPORT = {
    eventsToIcs,
    downloadIcs,
    shareIcs
  };
})(typeof window !== "undefined" ? window : globalThis);
