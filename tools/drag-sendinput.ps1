param(
    [int]$StartX = 0,
    [int]$StartY = 0,
    [int]$EndX = 0,
    [int]$EndY = 0,
    [int]$ClientStartX = 0,
    [int]$ClientStartY = 0,
    [int]$ClientEndX = 0,
    [int]$ClientEndY = 0,
    [int]$ProcessId = 0,
    [string]$WindowTitle = "OneToOneSupport",
    [int]$Steps = 15,
    [int]$DelayMs = 15
)

$source = @"
using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Threading;

public class NativeInput {
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

    public static void DragWithClient(int pId, string winTitle, int clientStartX, int clientStartY, int clientEndX, int clientEndY, int steps, int delayMs) {
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
                if (p.MainWindowTitle != null && p.MainWindowTitle.Contains(winTitle)) {
                    hWnd = p.MainWindowHandle;
                    break;
                }
            }
        }

        int sX = clientStartX;
        int sY = clientStartY;
        int eX = clientEndX;
        int eY = clientEndY;

        if (hWnd != IntPtr.Zero) {
            ShowWindow(hWnd, 9); // SW_RESTORE
            SetForegroundWindow(hWnd);
            Thread.Sleep(100);

            POINT ptStart = new POINT { X = clientStartX, Y = clientStartY };
            POINT ptEnd = new POINT { X = clientEndX, Y = clientEndY };

            if (ClientToScreen(hWnd, ref ptStart) && ClientToScreen(hWnd, ref ptEnd)) {
                sX = ptStart.X;
                sY = ptStart.Y;
                eX = ptEnd.X;
                eY = ptEnd.Y;
            }
        }

        DragRaw(sX, sY, eX, eY, steps, delayMs);
    }

    public static void DragRaw(int startX, int startY, int endX, int endY, int steps, int delayMs) {
        SetProcessDPIAware();
        SetCursorPos(startX, startY);
        Thread.Sleep(80);
        mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, UIntPtr.Zero);
        Thread.Sleep(delayMs);

        for (int i = 1; i <= steps; i++) {
            int curX = startX + (int)((endX - startX) * ((double)i / steps));
            int curY = startY + (int)((endY - startY) * ((double)i / steps));
            SetCursorPos(curX, curY);
            Thread.Sleep(delayMs);
        }

        Thread.Sleep(80);
        mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, UIntPtr.Zero);
        Thread.Sleep(80);
    }
}
"@

if (-not ([System.Management.Automation.PSTypeName]'NativeInput').Type) {
    Add-Type -TypeDefinition $source
}

if ($ClientEndX -ne 0 -or $ClientEndY -ne 0) {
    [NativeInput]::DragWithClient($ProcessId, $WindowTitle, $ClientStartX, $ClientStartY, $ClientEndX, $ClientEndY, $Steps, $DelayMs)
} else {
    [NativeInput]::DragRaw($StartX, $StartY, $EndX, $EndY, $Steps, $DelayMs)
}
