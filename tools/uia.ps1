# Cherche un élément d'interface (UI Automation) par nom (regex) dans une fenêtre : par titre (regex) ou par processus. Écrit "x,y,w,h" en pixels écran.
# Usage : powershell -File tools/uia.ps1 -Name "Extraire tout" (-Title "Téléchargements" | -ProcessId 123) [-Type Button] [-All]
param([string]$Name, [string]$Title = "", [int]$ProcessId = 0, [string]$Type = "", [switch]$All)
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
Add-Type @"
using System; using System.Runtime.InteropServices;
public class Dpi { [DllImport("user32.dll")] public static extern bool SetProcessDPIAware(); }
"@
[void][Dpi]::SetProcessDPIAware()
$AE = [System.Windows.Automation.AutomationElement]
$root = $AE::RootElement
$wins = $root.FindAll([System.Windows.Automation.TreeScope]::Children, [System.Windows.Automation.Condition]::TrueCondition)
$target = @()
foreach ($w in $wins) {
  $n = $w.Current.Name
  if ($ProcessId -and $w.Current.ProcessId -ne $ProcessId) { continue }
  if ($Title -and $n -notmatch $Title) { continue }
  $target += $w
}
$out = @()
foreach ($w in $target) {
  $els = $w.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
  foreach ($e in $els) {
    $c = $e.Current
    if ($c.Name -match $Name -or $c.AutomationId -match "^$Name$") {
      if ($Type -and $c.ControlType.ProgrammaticName -notmatch $Type) { continue }
      $r = $c.BoundingRectangle
      if ($r.Width -le 0 -or $r.IsEmpty) { continue }
      $out += ("{0},{1},{2},{3}|{4}|{5}" -f [int]$r.X, [int]$r.Y, [int]$r.Width, [int]$r.Height, $c.Name, $c.ControlType.ProgrammaticName)
    }
  }
}
if (-not $out.Count) { exit 3 }
if ($All) { $out } else { $out[0] }
