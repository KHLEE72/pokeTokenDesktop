param([int]$AppProcessId, [long]$ExcludedWindowHandle = 0, [int]$IntervalMs = 120, [switch]$Once, [switch]$InputDiagnostics)
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
    [StructLayout(LayoutKind.Sequential)] public struct Point { public int X,Y; }
    [StructLayout(LayoutKind.Sequential)] public struct GuiInfo {
        public uint Size,Flags; public IntPtr Active,Focus,Capture,MenuOwner,MoveSize,Caret; public Rect CaretRect;
    }
    public delegate bool Callback(IntPtr window, IntPtr parameter);
    [DllImport("user32.dll")] static extern bool EnumWindows(Callback callback, IntPtr parameter);
    [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr window);
    [DllImport("user32.dll")] static extern bool IsIconic(IntPtr window);
    [DllImport("user32.dll")] static extern int GetWindowLong(IntPtr window, int index);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr window, out uint pid);
    [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr window, out Rect rect);
    [DllImport("user32.dll")] static extern bool GetCursorPos(out Point point);
    [DllImport("user32.dll")] static extern short GetAsyncKeyState(int key);
    [DllImport("user32.dll")] static extern IntPtr WindowFromPoint(Point point);
    [DllImport("user32.dll")] static extern IntPtr GetAncestor(IntPtr window, uint flag);
    [DllImport("user32.dll")] static extern bool GetGUIThreadInfo(uint thread,ref GuiInfo info);
    [DllImport("user32.dll")] static extern bool IsWindowEnabled(IntPtr window);
    [DllImport("user32.dll")] static extern uint GetDpiForWindow(IntPtr window);
    [DllImport("user32.dll")] static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
    [DllImport("dwmapi.dll", EntryPoint="DwmGetWindowAttribute")] static extern int FrameBounds(IntPtr window, int attribute, out Rect rect, int size);
    [DllImport("dwmapi.dll", EntryPoint="DwmGetWindowAttribute")] static extern int Cloaked(IntPtr window, int attribute, out int value, int size);
    static bool wasOver=false, trackingPress=false;
    static string lastInput="";
    static long lastInputAt=0;
    static string JsonBool(bool value) { return value ? "true" : "false"; }
    static void ReadPetInput(IntPtr pet) {
        Rect rect;Point point;
        if (pet==IntPtr.Zero || !GetWindowRect(pet,out rect) || !GetCursorPos(out point)) return;
        bool visible=IsWindowVisible(pet),over=visible && point.X>=rect.Left && point.X<rect.Right && point.Y>=rect.Top && point.Y<rect.Bottom;
        bool left=(GetAsyncKeyState(1)&0x8000)!=0;
        // Observe presses only on this pet, including the corresponding release.
        // Other apps' mouse activity and titles are never written to this stream.
        if (!(over || wasOver || trackingPress)) return;
        if(over&&left)trackingPress=true;
        int style=GetWindowLong(pet,-20);uint pid;
        var gui=new GuiInfo();gui.Size=(uint)Marshal.SizeOf(typeof(GuiInfo));
        GetGUIThreadInfo(GetWindowThreadProcessId(pet,out pid),ref gui);
        bool hit=GetAncestor(WindowFromPoint(point),2)==pet,captured=gui.Capture!=IntPtr.Zero;
        bool ownCapture=captured&&GetAncestor(gui.Capture,2)==pet;
        string key=over+":"+left+":"+hit+":"+captured+":"+ownCapture+":"+style+":"+visible+":"+IsWindowEnabled(pet);
        long now=Environment.TickCount;
        if(key!=lastInput || now<lastInputAt || now-lastInputAt>=5000) {
            lastInput=key;lastInputAt=now;
            Console.WriteLine(string.Format(CultureInfo.InvariantCulture,
                "{{\"petInput\":{{\"overWindow\":{0},\"leftDown\":{1},\"hitPet\":{2},\"captured\":{3},\"captureOnPet\":{4},\"clickThrough\":{5},\"enabled\":{6},\"visible\":{7},\"topmost\":{8},\"noActivate\":{9},\"x\":{10},\"y\":{11},\"width\":{12},\"height\":{13},\"dpi\":{14}}}}}",
                JsonBool(over),JsonBool(left),JsonBool(hit),JsonBool(captured),JsonBool(ownCapture),JsonBool((style&32)!=0),JsonBool(IsWindowEnabled(pet)),JsonBool(visible),JsonBool((style&8)!=0),JsonBool((style&0x08000000)!=0),
                point.X-rect.Left,point.Y-rect.Top,rect.Right-rect.Left,rect.Bottom-rect.Top,GetDpiForWindow(pet)));
        }
        wasOver=over;if(!left)trackingPress=false;
    }
    public static void Run(int parentPid, long excludedHandle, int interval, bool once, bool diagnostics) {
        SetThreadDpiAwarenessContext(new IntPtr(-4));
        Process.GetCurrentProcess().PriorityClass = ProcessPriorityClass.BelowNormal;
        while (true) {
            try { using (var parent = Process.GetProcessById(parentPid)) { if (parent.HasExited) return; } } catch { return; }
            var rows = new List<string>();
            EnumWindows((window, _) => {
                if (rows.Count >= 256) return false;
                if (window.ToInt64() == excludedHandle) return true;
                if (!IsWindowVisible(window) || IsIconic(window)) return true;
                // Custom title bars (e.g. KakaoTalk) may omit WS_CAPTION. Accept
                // resizable/app windows too; tooltips, menus and no-activate
                // overlays are not supporting surfaces. Exclude only the pet
                // handle, so our own normal management window is also usable.
                int style = GetWindowLong(window, -16);
                int extended = GetWindowLong(window, -20);
                bool appWindow = (style & 0x00C00000) == 0x00C00000 || (style & 0x00040000) != 0 || (extended & 0x00040000) != 0;
                if (!appWindow || (style & 0x40000000) != 0 || (extended & 0x08000080) != 0) return true;
                uint pid; GetWindowThreadProcessId(window, out pid);
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
            if(diagnostics)ReadPetInput(new IntPtr(excludedHandle));
            if (once) return;
            Thread.Sleep(Math.Max(80, interval));
        }
    }
}
'@
[PetWindowScanner]::Run($AppProcessId, $ExcludedWindowHandle, $IntervalMs, $Once.IsPresent, $InputDiagnostics.IsPresent)
