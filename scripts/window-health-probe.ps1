param([long]$PetHandle, [long]$CoverHandle)
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public static class PetHealthProbe {
    public delegate bool Callback(IntPtr window, IntPtr parameter);
    [DllImport("user32.dll")] static extern bool EnumWindows(Callback callback, IntPtr parameter);
    [DllImport("user32.dll")] static extern int GetWindowLong(IntPtr window, int index);
    [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr window);
    [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
    public static void Read(long pet, long cover) {
        var order = new List<long>();
        EnumWindows((window, _) => { if (window.ToInt64() == pet || window.ToInt64() == cover) order.Add(window.ToInt64()); return true; }, IntPtr.Zero);
        int style = GetWindowLong(new IntPtr(pet), -20);
        bool above = order.Contains(pet) && order.Contains(cover) && order.IndexOf(pet) < order.IndexOf(cover);
        Console.WriteLine("{{\"petAboveCover\":{0},\"topmost\":{1},\"clickThrough\":{2},\"visible\":{3},\"focused\":{4}}}",
            above.ToString().ToLowerInvariant(), ((style & 8) != 0).ToString().ToLowerInvariant(),
            ((style & 0x20) != 0).ToString().ToLowerInvariant(), IsWindowVisible(new IntPtr(pet)).ToString().ToLowerInvariant(),
            (GetForegroundWindow().ToInt64() == pet).ToString().ToLowerInvariant());
    }
}
'@
[PetHealthProbe]::Read($PetHandle, $CoverHandle)
