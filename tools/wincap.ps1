# Capture d'UNE fenêtre précise : on la passe au premier plan (toujours au-dessus), puis on copie seulement son rectangle à l'écran.
# Rien d'autre n'apparaît dans l'image (pas le reste du bureau). Les menus, bulles et boîtes de dialogue ouverts par la fenêtre sont inclus.
# Usage : powershell -File tools/wincap.ps1 -Out image.png (-Title "motif regex" | -ProcessId 1234) [-Width 1280 -Height 800] [-X 40 -Y 40]
#   -Move : redimensionne/déplace la fenêtre avant la capture.   -Info : écrit seulement "x,y,w,h" (pas de capture).
param([string]$Out = "", [string]$Title = "", [int]$ProcessId = 0, [int]$Width = 0, [int]$Height = 0, [int]$X = 40, [int]$Y = 40, [switch]$Move, [switch]$Info, [switch]$Full, [switch]$Maximize)
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Drawing
Add-Type @"
using System; using System.Runtime.InteropServices; using System.Text; using System.Collections.Generic;
public class WinCap {
  public delegate bool EnumProc(IntPtr h, IntPtr l);
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
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int cx, int cy, uint f);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
  public static List<IntPtr> Find(string pat, uint pid) {
    var res = new List<IntPtr>();
    EnumWindows((h, l) => {
      if (!IsWindowVisible(h)) return true;
      var sb = new StringBuilder(512); GetWindowText(h, sb, 512);
      uint p; GetWindowThreadProcessId(h, out p);
      string t = sb.ToString();
      if (t.Length == 0) return true;
      var cn = new StringBuilder(256); GetClassName(h, cn, 256);
      string cls = cn.ToString();
      if (cls == "ConsoleWindowClass" || cls.StartsWith("CASCADIA")) return true;   // jamais la console qui porte le même titre
      if (pid != 0 && p != pid) return true;
      if (pat != "" && !System.Text.RegularExpressions.Regex.IsMatch(t, pat)) return true;
      res.Add(h); return true;
    }, IntPtr.Zero);
    return res;
  }
}
"@
[void][WinCap]::SetProcessDPIAware()
$wins = [WinCap]::Find($Title, [uint32]$ProcessId)
if ($wins.Count -eq 0) { Write-Error "fenetre introuvable"; exit 2 }
$h = $wins[0]
[void][WinCap]::ShowWindow($h, $(if ($Maximize) { 3 } else { 9 }))
if ($Move -and $Width -gt 0) { [void][WinCap]::MoveWindow($h, $X, $Y, $Width, $Height, $true); Start-Sleep -Milliseconds 500 }
[WinCap]::keybd_event(0x12, 0, 0, [UIntPtr]::Zero); [WinCap]::keybd_event(0x12, 0, 2, [UIntPtr]::Zero)
[void][WinCap]::BringWindowToTop($h); [void][WinCap]::SetForegroundWindow($h); Start-Sleep -Milliseconds 500
$r = New-Object WinCap+RECT; [void][WinCap]::GetWindowRect($h, [ref]$r)
$w = $r.R - $r.L; $ht = $r.B - $r.T
if ($Full) {
  Add-Type -AssemblyName System.Windows.Forms
  $b = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
  $bmp = New-Object System.Drawing.Bitmap $b.Width, $b.Height
  $g = [System.Drawing.Graphics]::FromImage($bmp); $g.CopyFromScreen($b.X, $b.Y, 0, 0, $b.Size); $g.Dispose()
  $bmp.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png); $bmp.Dispose()
  "$($b.X),$($b.Y),$($b.Width),$($b.Height)"; exit 0
}
if ($Info -or -not $Out) { "$($r.L),$($r.T),$w,$ht"; exit 0 }
$bmp = New-Object System.Drawing.Bitmap $w, $ht
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($r.L, $r.T, 0, 0, (New-Object System.Drawing.Size $w, $ht))
$g.Dispose()
$bmp.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png); $bmp.Dispose()
"$($r.L),$($r.T),$w,$ht"
