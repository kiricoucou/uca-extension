"""Aides communes à la génération des tutoriels d'installation (tools/gen_tuto.py) : vrai Chrome piloté par CDP, capture de fenêtre,
annotations (cadre, flèche, pastille numérotée) et export WebP. Windows uniquement (captures de vraies fenêtres)."""
import ctypes
from ctypes import wintypes
import json
import os
import re
import subprocess
import sys
import time
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
WINCAP = ROOT / "tools" / "wincap.ps1"
BLUE = (11, 123, 196)
RED = (229, 57, 53)


class _STARTUPINFOW(ctypes.Structure):
    _fields_ = [
        ("cb", wintypes.DWORD), ("lpReserved", wintypes.LPWSTR), ("lpDesktop", wintypes.LPWSTR),
        ("lpTitle", wintypes.LPWSTR), ("dwX", wintypes.DWORD), ("dwY", wintypes.DWORD),
        ("dwXSize", wintypes.DWORD), ("dwYSize", wintypes.DWORD), ("dwXCountChars", wintypes.DWORD),
        ("dwYCountChars", wintypes.DWORD), ("dwFillAttribute", wintypes.DWORD), ("dwFlags", wintypes.DWORD),
        ("wShowWindow", wintypes.WORD), ("cbReserved2", wintypes.WORD),
        ("lpReserved2", ctypes.POINTER(wintypes.BYTE)),
        ("hStdInput", wintypes.HANDLE), ("hStdOutput", wintypes.HANDLE), ("hStdError", wintypes.HANDLE),
    ]


class _PROCESS_INFORMATION(ctypes.Structure):
    _fields_ = [
        ("hProcess", wintypes.HANDLE), ("hThread", wintypes.HANDLE),
        ("dwProcessId", wintypes.DWORD), ("dwThreadId", wintypes.DWORD),
    ]


def launch_on_desktop(cmd, desktop=r"WinSta0\default"):
    """Lance un processus Windows directement sur le bureau interactif spécifié (WinSta0\\default)."""
    si = _STARTUPINFOW()
    si.cb = ctypes.sizeof(_STARTUPINFOW)
    si.lpDesktop = desktop
    pi = _PROCESS_INFORMATION()
    ok = ctypes.windll.kernel32.CreateProcessW(
        None, cmd, None, None, False, 0, None, None, ctypes.byref(si), ctypes.byref(pi)
    )
    if not ok:
        raise RuntimeError(f"CreateProcess failed: {ctypes.windll.kernel32.GetLastError()} for cmd: {cmd}")
    ctypes.windll.kernel32.CloseHandle(pi.hThread)
    return pi.hProcess, pi.dwProcessId


def ps(*args, check=True):
    si = subprocess.STARTUPINFO()
    si.lpDesktop = r"WinSta0\default"
    r = subprocess.run(["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", *args], capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=180, startupinfo=si)
    if check and r.returncode:
        raise RuntimeError(r.stderr.strip() or r.stdout.strip())
    return (r.stdout or "").strip()


def ps_cmd(cmd):
    return ps("-Command", cmd)


def wincap(out, *, pid=0, pids="", title="", size=None, pos=(40, 40), full=False, maximize=False):
    """Capture une fenêtre (par processus ou titre) dans le fichier png ; renvoie (x, y, w, h) en pixels écran."""
    a = [str(WINCAP), "-Out", str(out)]
    if pid:
        a += ["-ProcessId", str(pid)]
    if pids:
        a += ["-Pids", str(pids)]
    if title:
        a += ["-Title", title]
    if full:
        a += ["-Full"]
    if maximize:
        a += ["-Maximize"]
    if size:
        a += ["-Move", "-Width", str(size[0]), "-Height", str(size[1]), "-X", str(pos[0]), "-Y", str(pos[1])]
    return tuple(int(v) for v in ps("-File", *a).split(",")[-4:])


EXPECT = None   # motif (regex) du titre que la fenêtre au premier plan doit avoir avant toute frappe ou tout clic


def set_expect(regex):
    global EXPECT
    EXPECT = regex


def fg_title():
    return ps_cmd("""Add-Type @"
using System; using System.Text; using System.Runtime.InteropServices; using System.Threading;
public class FG {
    [DllImport("user32.dll", SetLastError = true)] public static extern IntPtr OpenDesktop(string lpszDesktop, uint dwFlags, bool fInherit, uint dwDesiredAccess);
    [DllImport("user32.dll", SetLastError = true)] public static extern bool SetThreadDesktop(IntPtr hDesktop);
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
    public static string Get() {
        string res = "";
        Thread t = new Thread(() => {
            IntPtr hDesk = OpenDesktop("default", 0, false, 0x01FF);
            if (hDesk != IntPtr.Zero) SetThreadDesktop(hDesk);
            IntPtr fg = GetForegroundWindow();
            var sb = new StringBuilder(512);
            GetWindowText(fg, sb, 512);
            res = sb.ToString();
        });
        t.Start();
        t.Join();
        return res;
    }
}
"@
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
[FG]::Get()""")


def guard():
    """Sécurité : ne tape et ne clique JAMAIS si la fenêtre au premier plan n'est pas celle attendue (évite d'écrire dans une autre application)."""
    if EXPECT is None:
        raise RuntimeError("aucune fenêtre attendue définie : saisie refusée")
    t = fg_title()
    if not re.search(EXPECT, t):
        raise RuntimeError(f"fenêtre au premier plan inattendue ({t!r}), attendu /{EXPECT}/ : saisie refusée")


def sendkeys(keys):
    guard()
    safe_keys = keys.replace("'", "''")
    ps_cmd("""Add-Type -ReferencedAssemblies System.Windows.Forms @"
using System; using System.Runtime.InteropServices; using System.Threading; using System.Windows.Forms;
public class SK {
    [DllImport("user32.dll", SetLastError = true)] public static extern IntPtr OpenDesktop(string lpszDesktop, uint dwFlags, bool fInherit, uint dwDesiredAccess);
    [DllImport("user32.dll", SetLastError = true)] public static extern bool SetThreadDesktop(IntPtr hDesktop);
    public static void Send(string k) {
        Thread t = new Thread(() => {
            IntPtr hDesk = OpenDesktop("default", 0, false, 0x01FF);
            if (hDesk != IntPtr.Zero) SetThreadDesktop(hDesk);
            SendKeys.SendWait(k);
        });
        t.Start();
        t.Join();
    }
}
"@
[SK]::Send('%s')""" % safe_keys)


def click_screen(x, y):
    """Clic réel de souris à des coordonnées écran (pixels physiques)."""
    guard()
    ps_cmd("""Add-Type @"
using System; using System.Runtime.InteropServices; using System.Threading;
public class M {
    [DllImport("user32.dll", SetLastError = true)] public static extern IntPtr OpenDesktop(string lpszDesktop, uint dwFlags, bool fInherit, uint dwDesiredAccess);
    [DllImport("user32.dll", SetLastError = true)] public static extern bool SetThreadDesktop(IntPtr hDesktop);
    [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
    [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
    [DllImport("user32.dll")] public static extern void mouse_event(int f, int dx, int dy, int d, int e);
    public static void Click(int x, int y) {
        Thread t = new Thread(() => {
            IntPtr hDesk = OpenDesktop("default", 0, false, 0x01FF);
            if (hDesk != IntPtr.Zero) SetThreadDesktop(hDesk);
            SetProcessDPIAware();
            SetCursorPos(x, y);
            Thread.Sleep(150);
            mouse_event(2, 0, 0, 0, 0);
            mouse_event(4, 0, 0, 0, 0);
        });
        t.Start();
        t.Join();
    }
}
"@
[M]::Click(%d, %d)""" % (x, y))


def move_mouse(x, y):
    ps_cmd("""Add-Type @"
using System; using System.Runtime.InteropServices; using System.Threading;
public class M2 {
    [DllImport("user32.dll", SetLastError = true)] public static extern IntPtr OpenDesktop(string lpszDesktop, uint dwFlags, bool fInherit, uint dwDesiredAccess);
    [DllImport("user32.dll", SetLastError = true)] public static extern bool SetThreadDesktop(IntPtr hDesktop);
    [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
    [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
    public static void Move(int x, int y) {
        Thread t = new Thread(() => {
            IntPtr hDesk = OpenDesktop("default", 0, false, 0x01FF);
            if (hDesk != IntPtr.Zero) SetThreadDesktop(hDesk);
            SetProcessDPIAware();
            SetCursorPos(x, y);
        });
        t.Start();
        t.Join();
    }
}
"@
[M2]::Move(%d, %d)""" % (x, y))


# ---------------------------------------------------------------- annotations
def _font(size):
    for f in ("segoeuib.ttf", "arialbd.ttf"):
        try:
            return ImageFont.truetype(f, size)
        except OSError:
            continue
    return ImageFont.load_default()


def annotate(src, dst, marks, scale=1.0, max_w=1280):
    """marks : liste de dicts {box:(x,y,w,h)} (cadre rouge + halo), {arrow:(x1,y1,x2,y2)}, {num:(x,y,n)} (pastille), {label:(x,y,texte)}.
    Coordonnées dans l'image source. Enregistre en WebP (largeur max_w)."""
    im = Image.open(src).convert("RGB")
    ov = Image.new("RGBA", im.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(ov)
    for m in marks:
        if "box" in m:
            x, y, w, h = m["box"]
            d.rounded_rectangle((x - 6, y - 6, x + w + 6, y + h + 6), radius=10, outline=RED + (255,), width=5, fill=RED + (28,))
        if "arrow" in m:
            x1, y1, x2, y2 = m["arrow"]
            d.line((x1, y1, x2, y2), fill=RED + (255,), width=6)
            import math
            a = math.atan2(y2 - y1, x2 - x1)
            for s in (-0.5, 0.5):
                d.line((x2, y2, x2 - 22 * math.cos(a + s), y2 - 22 * math.sin(a + s)), fill=RED + (255,), width=6)
        if "num" in m:
            x, y, n = m["num"]
            d.ellipse((x - 20, y - 20, x + 20, y + 20), fill=RED + (255,), outline=(255, 255, 255, 255), width=3)
            f = _font(24)
            tw = d.textlength(str(n), font=f)
            d.text((x - tw / 2, y - 15), str(n), fill=(255, 255, 255, 255), font=f)
        if "label" in m:
            x, y, t = m["label"]
            f = _font(22)
            tw = d.textlength(t, font=f)
            d.rounded_rectangle((x, y, x + tw + 24, y + 40), radius=10, fill=(255, 255, 255, 240), outline=RED + (255,), width=3)
            d.text((x + 12, y + 7), t, fill=(30, 30, 30, 255), font=f)
    im = Image.alpha_composite(im.convert("RGBA"), ov).convert("RGB")
    if im.width > max_w:
        im = im.resize((max_w, round(im.height * max_w / im.width)), Image.LANCZOS)
    Path(dst).parent.mkdir(parents=True, exist_ok=True)
    im.save(dst, "WEBP", quality=86, method=6)
    return im.size


class Chrome:
    """Vrai Chrome (celui installé), profil neuf, piloté par CDP : captures de la fenêtre entière (barre d'outils, bulles, dialogues)."""
    def __init__(self, profile, port, dl_dir, size=(1280, 800)):
        import shutil
        shutil.rmtree(profile, ignore_errors=True)
        (Path(profile) / "Default").mkdir(parents=True, exist_ok=True)
        (Path(profile) / "Default" / "Preferences").write_text(json.dumps({
            "download": {"default_directory": str(dl_dir), "prompt_for_download": False, "directory_upgrade": True},
            "savefile": {"default_directory": str(dl_dir)}, "profile": {"password_manager_enabled": False}, "credentials_enable_service": False,
            "browser": {"has_seen_welcome_page": True}, "signin": {"allowed": False}, "sync_promo": {"show_on_first_run_allowed": False}, "bookmark_bar": {"show_on_all_tabs": False},
            "extensions": {"ui": {"developer_mode": False}},
        }), encoding="utf-8")
        self.profile, self.port, self.size = str(profile), port, size
        cmd = (f'"{CHROME}" --user-data-dir="{profile}" --remote-debugging-port={port} --no-first-run --no-default-browser-check '
               f'--disable-features=Translate,OptimizationHints,MediaRouter,SigninInterceptBubble --disable-sync --disable-signin-promo --lang=fr '
               f'--password-store=basic --disable-save-password-bubble --hide-crash-restore-bubble about:blank')
        self.hProc, self.pid = launch_on_desktop(cmd)
        from playwright.sync_api import sync_playwright
        self._pw = sync_playwright().start()
        for _ in range(40):
            try:
                self.browser = self._pw.chromium.connect_over_cdp(f"http://localhost:{port}")
                break
            except Exception:
                time.sleep(0.5)
        self.ctx = self.browser.contexts[0]
        try:   # Playwright détourne les téléchargements : on rend la main à Chrome (dossier des préférences, bulle de téléchargement réelle)
            self.browser.new_browser_cdp_session().send("Browser.setDownloadBehavior", {"behavior": "default"})
        except Exception:
            pass
        self.page = self.ctx.pages[0] if self.ctx.pages else self.ctx.new_page()

    def pids(self):
        import psutil
        pids = []
        target = str(self.profile).lower()
        for p in psutil.process_iter(['pid', 'name', 'cmdline']):
            try:
                if p.info['name'] and 'chrome' in p.info['name'].lower() and p.info['cmdline']:
                    if any(target in a.lower() for a in p.info['cmdline']):
                        pids.append(p.info['pid'])
            except Exception:
                pass
        return pids or [self.pid]

    def pids_str(self):
        return ",".join(str(p) for p in self.pids())

    def shot(self, out, title="", full=True):
        """Plein écran (autorisé par l'utilisateur) avec Chrome maximisé au premier plan ; renvoie (x, y, w, h) de l'écran."""
        time.sleep(0.9)
        t = title or "Google Chrome|Chrome|Sélectionner|répertoire"
        set_expect(t)
        return wincap(out, pids=self.pids_str() if not title else "", title=t, full=full, maximize=not title)

    def foreground(self):
        wincap(None, pids=self.pids_str(), full=False, maximize=True)
        set_expect("Google Chrome|Chrome")
        time.sleep(0.5)

    def box(self, selector, frame=None):
        """Rectangle écran (pixels physiques) d'un élément de la page, pour les annotations."""
        js = """(sel) => { const e = document.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(); const d = window.devicePixelRatio;
          return [(window.screenX + r.left) * d, (window.screenY + (window.outerHeight - window.innerHeight) + r.top) * d, r.width * d, r.height * d]; }"""
        v = self.page.evaluate(js, selector)
        return tuple(round(x) for x in v) if v else None

    def click_real(self, selector):
        self.foreground()
        b = self.box(selector)
        click_screen(b[0] + b[2] // 2, b[1] + b[3] // 2)

    def close(self):
        try:
            self.browser.close()
        except Exception:
            pass
        try:
            self._pw.stop()
        except Exception:
            pass
        import psutil
        target = str(self.profile).lower()
        for p in psutil.process_iter(['pid', 'name', 'cmdline']):
            try:
                if p.info['name'] and 'chrome' in p.info['name'].lower() and p.info['cmdline']:
                    if any(target in a.lower() for a in p.info['cmdline']):
                        p.kill()
            except Exception:
                pass
        try:
            ctypes.windll.kernel32.TerminateProcess(self.hProc, 0)
            ctypes.windll.kernel32.CloseHandle(self.hProc)
        except Exception:
            pass
