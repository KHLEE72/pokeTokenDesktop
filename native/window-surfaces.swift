import Foundation
import CoreGraphics
import Darwin

// Window titles and pixels are deliberately not read. Bounds, IDs and PIDs are
// sufficient, and CGWindowListCopyWindowInfo does not request capture permission.
let parent = pid_t(CommandLine.arguments.dropFirst().first.flatMap(Int32.init) ?? 0)
struct Frame: Encodable {
    let id: String
    let pid: Int32
    let x: Double
    let y: Double
    let width: Double
    let height: Double
}
let encoder = JSONEncoder()
while parent > 0 && kill(parent, 0) == 0 {
    autoreleasepool {
        let windows = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] ?? []
        let frames: [Frame] = windows.prefix(256).compactMap { window in
            guard let owner = window[kCGWindowOwnerPID as String] as? Int32, owner != parent,
                  let layer = window[kCGWindowLayer as String] as? Int, layer == 0,
                  let alpha = window[kCGWindowAlpha as String] as? Double, alpha > 0,
                  let number = window[kCGWindowNumber as String] as? UInt32,
                  let bounds = window[kCGWindowBounds as String] as? [String: Any],
                  let rect = CGRect(dictionaryRepresentation: bounds as CFDictionary), rect.width >= 80, rect.height >= 40 else { return nil }
            return Frame(id: "mac:\(owner):\(number)", pid: owner, x: Double(rect.minX), y: Double(rect.minY), width: Double(rect.width), height: Double(rect.height))
        }
        if let bytes = try? encoder.encode(frames) {
            FileHandle.standardOutput.write(bytes)
            FileHandle.standardOutput.write(Data([10]))
        }
    }
    usleep(120_000)
}
