import Foundation
import CoreGraphics
import Darwin
let ids = CommandLine.arguments.dropFirst().compactMap(UInt32.init)
guard ids.count == 2 else { exit(1) }
let windows = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] ?? []
let order = windows.compactMap { $0[kCGWindowNumber as String] as? UInt32 }
let pet = order.firstIndex(of: ids[0]), cover = order.firstIndex(of: ids[1])
let layer = windows.first { ($0[kCGWindowNumber as String] as? UInt32) == ids[0] }?[kCGWindowLayer as String] as? Int ?? 0
let result: [String: Bool] = ["petAboveCover": pet != nil && cover != nil && pet! < cover!, "topmost": layer > 0, "visible": pet != nil]
let bytes = try JSONSerialization.data(withJSONObject: result, options: [.sortedKeys])
FileHandle.standardOutput.write(bytes)
