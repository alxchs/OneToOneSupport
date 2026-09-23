param(
    [int]$ProcessId = 0,
    [string]$WindowTitle = "OneToOneSupport",
    [int]$ClientBaseX = 300,
    [int]$ClientBaseY = 300,
    [int]$ScreenBaseX = 0,
    [int]$ScreenBaseY = 0,
    [int]$StrokeCount = 5,
    [int]$DelayBetweenStrokesMs = 60,
    [int]$StepsPerStroke = 30,
    [int]$DelayPerStepMs = 8
)

$source = @"
using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Threading;

public class NativeCursiveInputV2 {
    [DllImport("user32.dll")]
    public static extern bool SetProcessDPIAware();

    [DllImport("user32.dll")]
    public static extern bool SetCursorPos(int X, int Y);

    [DllImport("user32.dll")]
    public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, UIntPtr dwExtraInfo);

    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern IntPtr FindWindow(string lpClassName, string lpWindowName);

    [DllImport("user32.dll")]
    public static extern bool ClientToScreen(IntPtr hWnd, ref POINT lpPoint);

    [StructLayout(LayoutKind.Sequential)]
    public struct POINT {
        public int X;
        public int Y;
    }

    public const uint MOUSEEVENTF_LEFTDOWN = 0x0002;
    public const uint MOUSEEVENTF_LEFTUP   = 0x0004;
    public const uint MOUSEEVENTF_MOVE     = 0x0001;

    public static void DrawCursiveStrokes(int pId, string winTitle, int clientBaseX, int clientBaseY, int explicitScreenX, int explicitScreenY, int strokeCount, int delayBetweenMs, int stepsPerStroke, int delayPerStepMs) {
        SetProcessDPIAware();
        IntPtr hWnd = IntPtr.Zero;

        if (pId > 0) {
            try {
                Process p = Process.GetProcessById(pId);
                hWnd = p.MainWindowHandle;
            } catch {}
        }

        if (hWnd == IntPtr.Zero && !string.IsNullOrEmpty(winTitle)) {
            foreach (Process p in Process.GetProcesses()) {
                if (p.ProcessName.ToLower().Contains("electron") && p.MainWindowTitle != null && p.MainWindowTitle.Contains(winTitle)) {
                    hWnd = p.MainWindowHandle;
                    break;
                }
            }
        }

        int screenBaseX = explicitScreenX > 0 ? explicitScreenX : clientBaseX;
        int screenBaseY = explicitScreenY > 0 ? explicitScreenY : clientBaseY;

        if (hWnd != IntPtr.Zero) {
            ShowWindow(hWnd, 9); // SW_RESTORE
            SetForegroundWindow(hWnd);
            Thread.Sleep(200);

            if (explicitScreenX <= 0 || explicitScreenY <= 0) {
                POINT pt = new POINT { X = clientBaseX, Y = clientBaseY };
                if (ClientToScreen(hWnd, ref pt)) {
                    screenBaseX = pt.X;
                    screenBaseY = pt.Y;
                }
            }
        }

        Console.WriteLine("[NativeCursiveInput] Iniciando sequencia de " + strokeCount + " tracos cursivos a partir de screen(" + screenBaseX + "," + screenBaseY + ")");

        for (int s = 0; s < strokeCount; s++) {
            int startX = screenBaseX + (s * 45);
            int startY = screenBaseY + ((s % 2) * 20);

            SetCursorPos(startX, startY);
            Thread.Sleep(25);
            mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, UIntPtr.Zero);
            Thread.Sleep(delayPerStepMs);

            for (int i = 1; i <= stepsPerStroke; i++) {
                double t = (double)i / stepsPerStroke;
                int curX = startX + (int)(t * 60.0);
                int curY = startY + (int)(Math.Sin(t * Math.PI * 4.0) * 28.0);
                SetCursorPos(curX, curY);
                Thread.Sleep(delayPerStepMs);
            }

            Thread.Sleep(25);
            mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, UIntPtr.Zero);
            Thread.Sleep(delayBetweenMs);
        }

        Console.WriteLine("[NativeCursiveInput] Concluidos " + strokeCount + " tracos cursivos.");
    }
}
"@

if (-not ([System.Management.Automation.PSTypeName]'NativeCursiveInputV2').Type) {
    Add-Type -TypeDefinition $source
}

[NativeCursiveInputV2]::DrawCursiveStrokes($ProcessId, $WindowTitle, $ClientBaseX, $ClientBaseY, $ScreenBaseX, $ScreenBaseY, $StrokeCount, $DelayBetweenStrokesMs, $StepsPerStroke, $DelayPerStepMs)
