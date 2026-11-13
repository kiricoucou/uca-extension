# Capture d'UNE fenêtre précise : on la passe au premier plan (toujours au-dessus), puis on copie seulement son rectangle à l'écran.
# Rien d'autre n'apparaît dans l'image (pas le reste du bureau). Les menus, bulles et boîtes de dialogue ouverts par la fenêtre sont inclus.
# Usage : powershell -File tools/wincap.ps1 -Out image.png (-Title "motif regex" | -ProcessId 1234) [-Width 1280 -Height 800] [-X 40 -Y 40]
#   -Move : redimensionne/déplace la fenêtre avant la capture.   -Info : écrit seulement "x,y,w,h" (pas de capture).
param([string]$Out = "", [string]$Title = "", [int]$ProcessId = 0, [string]$Pids = "", [int]$Width = 0, [int]$Height = 0, [int]$X = 40, [int]$Y = 40, [switch]$Move, [switch]$Info, [switch]$Full, [switch]$Maximize)
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms
Add-Type -ReferencedAssemblies System.Drawing, System.Windows.Forms @"
using System; using System.Collections.Generic; using System.Drawing; using System.Drawing.Imaging;
using System.Runtime.InteropServices; using System.Text; using System.Text.RegularExpressions;
using System.Threading; using System.Windows.Forms;

public class WinCap {
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll", SetLastError = true)] public static extern IntPtr OpenDesktop(string lpszDesktop, uint dwFlags, bool fInherit, uint dwDesiredAccess);
  [DllImport("user32.dll", SetLastError = true)] public static extern bool SetThreadDesktop(IntPtr hDesktop);
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc p, IntPtr l);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool MoveWindow(IntPtr h, int x, int y, int w, int hh, bool r);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr h);
  [DllImport("user32.dll")] public static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }

  public static string Execute(string outPath, string pat, int pid, string pidsStr, int width, int height, int x, int y, bool move, bool info, bool full, bool maximize) {
    string result = null;
    Exception err = null;
    Thread t = new Thread(() => {
      try {
        IntPtr hDesk = OpenDesktop("default", 0, false, 0x01FF);
        if (hDesk != IntPtr.Zero) {
          SetThreadDesktop(hDesk);
        }
        SetProcessDPIAware();

        var pidSet = new HashSet<uint>();
        if (pid != 0) pidSet.Add((uint)pid);
        if (!string.IsNullOrEmpty(pidsStr)) {
          foreach (var s in pidsStr.Split(',')) {
            uint xp; if (uint.TryParse(s.Trim(), out xp)) pidSet.Add(xp);
          }
        }

        var res = new List<IntPtr>();
        EnumWindows((h, l) => {
          if (!IsWindowVisible(h)) return true;
          var sb = new StringBuilder(512); GetWindowText(h, sb, 512);
          uint p; GetWindowThreadProcessId(h, out p);
          string tStr = sb.ToString();
          if (tStr.Length == 0) return true;
          var cn = new StringBuilder(256); GetClassName(h, cn, 256);
          string cls = cn.ToString();
          if (cls == "ConsoleWindowClass" || cls.StartsWith("CASCADIA")) return true;
          if (pidSet.Count > 0 && !pidSet.Contains(p)) return true;
          if (!string.IsNullOrEmpty(pat) && !Regex.IsMatch(tStr, pat)) return true;
          res.Add(h); return true;
        }, IntPtr.Zero);

        if (res.Count == 0) throw new Exception("fenetre introuvable");
        IntPtr win = res[0];

        RECT rOrig;
        GetWindowRect(win, out rOrig);
        int wOrig = rOrig.R - rOrig.L;
        int htOrig = rOrig.B - rOrig.T;
        if (wOrig <= 0 || htOrig <= 0) { wOrig = 1280; htOrig = 800; }
        var pb = Screen.PrimaryScreen.Bounds;

        if (rOrig.L < pb.X || rOrig.L >= pb.Right || rOrig.T < pb.Y || rOrig.T >= pb.Bottom) {
          ShowWindow(win, 9);
          MoveWindow(win, pb.X + 40, pb.Y + 40, Math.Min(wOrig, pb.Width - 80), Math.Min(htOrig, pb.Height - 80), true);
          Thread.Sleep(300);
        }

        if (maximize) {
          ShowWindow(win, 3);
          Thread.Sleep(300);
        } else {
          ShowWindow(win, 9);
        }
        if (move && width > 0) {
          MoveWindow(win, x, y, width, height, true);
          Thread.Sleep(500);
        }
        keybd_event(0x12, 0, 0, UIntPtr.Zero);
        keybd_event(0x12, 0, 2, UIntPtr.Zero);
        BringWindowToTop(win);
        SetForegroundWindow(win);
        Thread.Sleep(500);

        RECT r;
        GetWindowRect(win, out r);
        int w = r.R - r.L;
        int ht = r.B - r.T;

        if (full) {
          var b = Screen.PrimaryScreen.Bounds;
          using (var bmp = new Bitmap(b.Width, b.Height)) {
            using (var g = Graphics.FromImage(bmp)) {
              g.CopyFromScreen(b.X, b.Y, 0, 0, b.Size);
            }
            if (!string.IsNullOrEmpty(outPath)) {
              bmp.Save(outPath, ImageFormat.Png);
            }
          }
          result = string.Format("{0},{1},{2},{3}", b.X, b.Y, b.Width, b.Height);
          return;
        }

        if (info || string.IsNullOrEmpty(outPath)) {
          result = string.Format("{0},{1},{2},{3}", r.L, r.T, w, ht);
          return;
        }

        using (var bmp = new Bitmap(w, ht)) {
          using (var g = Graphics.FromImage(bmp)) {
            g.CopyFromScreen(r.L, r.T, 0, 0, new Size(w, ht));
          }
          bmp.Save(outPath, ImageFormat.Png);
        }
        result = string.Format("{0},{1},{2},{3}", r.L, r.T, w, ht);
      } catch (Exception ex) {
        err = ex;
      }
    });

    t.Start();
    t.Join();

    if (err != null) throw err;
    return result;
  }
}
"@

try {
  $res = [WinCap]::Execute($Out, $Title, [int]$ProcessId, $Pids, [int]$Width, [int]$Height, [int]$X, [int]$Y, [bool]$Move, [bool]$Info, [bool]$Full, [bool]$Maximize)
  Write-Output $res
  exit 0
} catch {
  Write-Error $_.Exception.Message
  exit 2
}
