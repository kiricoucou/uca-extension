# Cherche un élément d'interface (UI Automation) par nom (regex) dans une fenêtre : par titre (regex) ou par processus. Écrit "x,y,w,h" en pixels écran.
# Usage : powershell -File tools/uia.ps1 -Name "Extraire tout" (-Title "Téléchargements" | -ProcessId 123) [-Type Button] [-All]
param([string]$Name, [string]$Title = "", [int]$ProcessId = 0, [string]$Pids = "", [string]$Type = "", [switch]$All)
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes, WindowsBase
Add-Type -ReferencedAssemblies UIAutomationClient, UIAutomationTypes, WindowsBase @"
using System; using System.Collections.Generic; using System.Runtime.InteropServices;
using System.Text.RegularExpressions; using System.Threading; using System.Windows.Automation;

public class UiaRunner {
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll", SetLastError = true)] public static extern IntPtr OpenDesktop(string lpszDesktop, uint dwFlags, bool fInherit, uint dwDesiredAccess);
  [DllImport("user32.dll", SetLastError = true)] public static extern bool SetThreadDesktop(IntPtr hDesktop);
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc p, IntPtr l);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr h, System.Text.StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern int GetClassName(IntPtr h, System.Text.StringBuilder s, int n);

  public static string[] Query(string namePat, string titlePat, int pid, string pidsStr, string typePat, bool all) {
    var outList = new List<string>();
    Exception err = null;
    Thread t = new Thread(() => {
      try {
        IntPtr hDesk = OpenDesktop("default", 0, false, 0x01FF);
        if (hDesk != IntPtr.Zero) SetThreadDesktop(hDesk);
        SetProcessDPIAware();

        var pidSet = new HashSet<uint>();
        if (pid != 0) pidSet.Add((uint)pid);
        if (!string.IsNullOrEmpty(pidsStr)) {
          foreach (var s in pidsStr.Split(',')) {
            uint xp; if (uint.TryParse(s.Trim(), out xp)) pidSet.Add(xp);
          }
        }

        var target = new List<AutomationElement>();
        EnumWindows((h, l) => {
          if (!IsWindowVisible(h)) return true;
          var sb = new System.Text.StringBuilder(512); GetWindowText(h, sb, 512);
          uint p; GetWindowThreadProcessId(h, out p);
          string tStr = sb.ToString();
          if (tStr.Length == 0) return true;
          var cn = new System.Text.StringBuilder(256); GetClassName(h, cn, 256);
          string cls = cn.ToString();
          if (cls == "ConsoleWindowClass" || cls.StartsWith("CASCADIA")) return true;
          if (pidSet.Count > 0 && !pidSet.Contains(p)) return true;
          if (!string.IsNullOrEmpty(titlePat) && !Regex.IsMatch(tStr, titlePat)) return true;
          try {
            var ae = AutomationElement.FromHandle(h);
            if (ae != null) target.Add(ae);
          } catch {}
          return true;
        }, IntPtr.Zero);
        foreach (var w in target) {
          var els = w.FindAll(TreeScope.Descendants, Condition.TrueCondition);
          foreach (AutomationElement e in els) {
            try {
              var c = e.Current;
              string eName = c.Name ?? "";
              string eId = c.AutomationId ?? "";
              if (string.IsNullOrEmpty(namePat) || Regex.IsMatch(eName, namePat) || Regex.IsMatch(eId, "^" + namePat + "$")) {
                if (!string.IsNullOrEmpty(typePat) && !Regex.IsMatch(c.ControlType.ProgrammaticName ?? "", typePat)) continue;
                var r = c.BoundingRectangle;
                if (r.Width <= 0 || r.IsEmpty || r.X < 0 || r.X >= 2560) continue;
                outList.Add(string.Format("{0},{1},{2},{3}|{4}|{5}", (int)r.X, (int)r.Y, (int)r.Width, (int)r.Height, eName, c.ControlType.ProgrammaticName));
              }
            } catch {}
          }
        }
      } catch (Exception ex) {
        err = ex;
      }
    });

    t.Start();
    t.Join();

    if (err != null) throw err;
    return outList.ToArray();
  }
}
"@

try {
  $res = [UiaRunner]::Query($Name, $Title, [int]$ProcessId, $Pids, $Type, [bool]$All)
  if (-not $res -or $res.Length -eq 0) { exit 3 }
  if ($All) { $res } else { $res[0] }
  exit 0
} catch {
  Write-Error $_.Exception.Message
  exit 3
}
