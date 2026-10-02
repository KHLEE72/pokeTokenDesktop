param([int]$AppProcessId, [int]$IntervalMs = 120, [switch]$Once)
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.Runtime.InteropServices;
using System.Threading;
public static class PetWindowScanner {
    [StructLayout(LayoutKind.Sequential)] public struct Rect { public int Left, Top, Right, Bottom; }
    public delegate bool Callback(IntPtr window, IntPtr parameter);
    [DllImport("user32.dll")] static extern bool EnumWindows(Callback callback, IntPtr parameter);
    [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr window);
    [DllImport("user32.dll")] static extern bool IsIconic(IntPtr window);
    [DllImport("user32.dll")] static extern int GetWindowLong(IntPtr window, int index);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr window, out uint pid);
    [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr window, out Rect rect);
    [DllImport("user32.dll")] static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
    [DllImport("dwmapi.dll", EntryPoint="DwmGetWindowAttribute")] static extern int FrameBounds(IntPtr window, int attribute, out Rect rect, int size);
    [DllImport("dwmapi.dll", EntryPoint="DwmGetWindowAttribute")] static extern int Cloaked(IntPtr window, int attribute, out int value, int size);
    public static void Run(int parentPid, int interval, bool once) {
        SetThreadDpiAwarenessContext(new IntPtr(-4));
        Process.GetCurrentProcess().PriorityClass = ProcessPriorityClass.BelowNormal;
        while (true) {
            try { using (var parent = Process.GetProcessById(parentPid)) { if (parent.HasExited) return; } } catch { return; }
            var rows = new List<string>();
            EnumWindows((window, _) => {
                if (rows.Count >= 256) return false;
                if (!IsWindowVisible(window) || IsIconic(window)) return true;
                // Normal, framed top-level desktop windows; exclude pets, menus and tooltips.
                int style = GetWindowLong(window, -16);
                if ((style & 0x00C00000) != 0x00C00000 || (style & 0x40000000) != 0) return true;
                uint pid; GetWindowThreadProcessId(window, out pid);
                if (pid == parentPid) return true;
                int cloaked; if (Cloaked(window, 14, out cloaked, 4) == 0 && cloaked != 0) return true;
                Rect rect;
                if (FrameBounds(window, 9, out rect, Marshal.SizeOf(typeof(Rect))) != 0 && !GetWindowRect(window, out rect)) return true;
                int width = rect.Right - rect.Left, height = rect.Bottom - rect.Top;
                if (width < 80 || height < 40) return true;
                rows.Add(string.Format(CultureInfo.InvariantCulture,
                    "{{\"id\":\"win:{0}:{1}\",\"pid\":{0},\"x\":{2},\"y\":{3},\"width\":{4},\"height\":{5}}}",
                    pid, window.ToInt64(), rect.Left, rect.Top, width, height));
                return true;
            }, IntPtr.Zero);
            Console.WriteLine("[" + string.Join(",", rows) + "]");
            if (once) return;
            Thread.Sleep(Math.Max(80, interval));
        }
    }
}
'@
[PetWindowScanner]::Run($AppProcessId, $IntervalMs, $Once.IsPresent)
