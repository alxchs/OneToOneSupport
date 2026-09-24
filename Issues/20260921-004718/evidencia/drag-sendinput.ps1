param([int]$x0,[int]$y0,[int]$x1,[int]$y1)
Add-Type @"
using System; using System.Runtime.InteropServices;
public class M { [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
 [DllImport("user32.dll")] public static extern bool SetCursorPos(int x,int y);
 [DllImport("user32.dll")] public static extern void mouse_event(uint f,uint dx,uint dy,uint d,UIntPtr e); }
"@
[M]::SetProcessDPIAware() | Out-Null
[M]::SetCursorPos($x0,$y0); Start-Sleep -Milliseconds 150
[M]::mouse_event(0x0002,0,0,0,[UIntPtr]::Zero); Start-Sleep -Milliseconds 80
for($i=1;$i -le 25;$i++){ [M]::SetCursorPos([int]($x0+($x1-$x0)*$i/25),[int]($y0+($y1-$y0)*$i/25)); Start-Sleep -Milliseconds 16 }
Start-Sleep -Milliseconds 80
[M]::mouse_event(0x0004,0,0,0,[UIntPtr]::Zero)
