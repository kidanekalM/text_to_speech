import Foundation
import CoreAudio

struct OutputDevice: Codable {
    let id: UInt32
    let name: String
    let uid: String
    let isDefault: Bool
}

struct CurrentOutput: Codable {
    let id: UInt32
    let name: String
    let uid: String
}

struct DoctorReport: Codable {
    let outputCount: Int
    let currentOutput: CurrentOutput?
    let devices: [OutputDevice]
}

enum HelperError: LocalizedError {
    case message(String)

    var errorDescription: String? {
        switch self {
        case .message(let value):
            return value
        }
    }
}

func address(
    _ selector: AudioObjectPropertySelector,
    scope: AudioObjectPropertyScope = AudioObjectPropertyScope(kAudioObjectPropertyScopeGlobal),
    element: AudioObjectPropertyElement = AudioObjectPropertyElement(kAudioObjectPropertyElementMaster)
) -> AudioObjectPropertyAddress {
    AudioObjectPropertyAddress(
        mSelector: selector,
        mScope: scope,
        mElement: element
    )
}

func ensureSuccess(_ status: OSStatus, _ message: String) throws {
    if status != noErr {
        throw HelperError.message("\(message) (OSStatus \(status))")
    }
}

func stringProperty(deviceID: AudioDeviceID, selector: AudioObjectPropertySelector) throws -> String {
    var property = address(selector)
    var value: CFString = "" as CFString
    var dataSize = UInt32(MemoryLayout<CFString>.size)

    try ensureSuccess(
        AudioObjectGetPropertyData(deviceID, &property, 0, nil, &dataSize, &value),
        "Failed to read audio device string property"
    )

    return value as String
}

func outputChannelCount(deviceID: AudioDeviceID) throws -> Int {
    var property = address(
        kAudioDevicePropertyStreamConfiguration,
        scope: AudioObjectPropertyScope(kAudioDevicePropertyScopeOutput)
    )
    var dataSize: UInt32 = 0

    try ensureSuccess(
        AudioObjectGetPropertyDataSize(deviceID, &property, 0, nil, &dataSize),
        "Failed to read output stream configuration size"
    )

    let rawPointer = UnsafeMutableRawPointer.allocate(
        byteCount: Int(dataSize),
        alignment: MemoryLayout<AudioBufferList>.alignment
    )
    defer { rawPointer.deallocate() }

    try ensureSuccess(
        AudioObjectGetPropertyData(deviceID, &property, 0, nil, &dataSize, rawPointer),
        "Failed to read output stream configuration"
    )

    let bufferList = UnsafeMutableAudioBufferListPointer(rawPointer.assumingMemoryBound(to: AudioBufferList.self))
    return bufferList.reduce(0) { partialResult, buffer in
        partialResult + Int(buffer.mNumberChannels)
    }
}

func allDeviceIDs() throws -> [AudioDeviceID] {
    var property = address(kAudioHardwarePropertyDevices)
    var dataSize: UInt32 = 0

    try ensureSuccess(
        AudioObjectGetPropertyDataSize(AudioObjectID(kAudioObjectSystemObject), &property, 0, nil, &dataSize),
        "Failed to read audio device list size"
    )

    let count = Int(dataSize) / MemoryLayout<AudioDeviceID>.size
    var devices = Array(repeating: AudioDeviceID(), count: count)

    try ensureSuccess(
        AudioObjectGetPropertyData(AudioObjectID(kAudioObjectSystemObject), &property, 0, nil, &dataSize, &devices),
        "Failed to read audio device list"
    )

    return devices
}

func currentOutputDeviceID() throws -> AudioDeviceID {
    var property = address(kAudioHardwarePropertyDefaultOutputDevice)
    var deviceID = AudioDeviceID()
    var dataSize = UInt32(MemoryLayout<AudioDeviceID>.size)

    try ensureSuccess(
        AudioObjectGetPropertyData(AudioObjectID(kAudioObjectSystemObject), &property, 0, nil, &dataSize, &deviceID),
        "Failed to read current output device"
    )

    return deviceID
}

func currentOutput() throws -> CurrentOutput {
    let deviceID = try currentOutputDeviceID()
    return CurrentOutput(
        id: deviceID,
        name: try stringProperty(deviceID: deviceID, selector: kAudioObjectPropertyName),
        uid: try stringProperty(deviceID: deviceID, selector: kAudioDevicePropertyDeviceUID)
    )
}

func listOutputDevices() throws -> [OutputDevice] {
    let currentID = try currentOutputDeviceID()

    return try allDeviceIDs()
        .filter { deviceID in
            (try? outputChannelCount(deviceID: deviceID)) ?? 0 > 0
        }
        .map { deviceID in
            OutputDevice(
                id: deviceID,
                name: (try? stringProperty(deviceID: deviceID, selector: kAudioObjectPropertyName)) ?? "Unknown",
                uid: (try? stringProperty(deviceID: deviceID, selector: kAudioDevicePropertyDeviceUID)) ?? "",
                isDefault: deviceID == currentID
            )
        }
        .sorted { lhs, rhs in
            lhs.name.localizedCaseInsensitiveCompare(rhs.name) == .orderedAscending
        }
}

func bestMatch(for target: String, in devices: [OutputDevice]) -> OutputDevice? {
    let normalizedTarget = target.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()

    guard !normalizedTarget.isEmpty else {
        return nil
    }

    if let exact = devices.first(where: { $0.name.lowercased() == normalizedTarget }) {
        return exact
    }

    let startsWith = devices.filter { $0.name.lowercased().hasPrefix(normalizedTarget) }
    if startsWith.count == 1 {
        return startsWith[0]
    }

    let contains = devices.filter { $0.name.lowercased().contains(normalizedTarget) }
    if contains.count == 1 {
        return contains[0]
    }

    return nil
}

func setDefaultOutput(target: String) throws -> OutputDevice {
    let devices = try listOutputDevices()

    guard let match = bestMatch(for: target, in: devices) else {
        throw HelperError.message("Output device \"\(target)\" was not found.")
    }

    var property = address(kAudioHardwarePropertyDefaultOutputDevice)
    var deviceID = match.id
    let dataSize = UInt32(MemoryLayout<AudioDeviceID>.size)

    try ensureSuccess(
        AudioObjectSetPropertyData(AudioObjectID(kAudioObjectSystemObject), &property, 0, nil, dataSize, &deviceID),
        "Failed to set default output device"
    )

    return match
}

func printJSON<T: Encodable>(_ value: T) throws {
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
    let data = try encoder.encode(value)
    guard let string = String(data: data, encoding: .utf8) else {
        throw HelperError.message("Failed to encode JSON output")
    }

    print(string)
}

func printUsage() {
    let usage = """
    Usage:
      AFAAudioHelper list-output-devices [--json]
      AFAAudioHelper current-output [--json]
      AFAAudioHelper set-output <device-name> [--json]
      AFAAudioHelper doctor [--json]
    """

    print(usage)
}

do {
    let arguments = CommandLine.arguments.dropFirst()
    guard let command = arguments.first else {
        printUsage()
        exit(1)
    }

    let remaining = Array(arguments.dropFirst())
    let wantsJSON = remaining.contains("--json")
    let positional = remaining.filter { $0 != "--json" }

    switch command {
    case "list-output-devices":
        let devices = try listOutputDevices()
        if wantsJSON {
            try printJSON(devices)
        } else {
            devices.forEach { print($0.name) }
        }

    case "current-output":
        let output = try currentOutput()
        if wantsJSON {
            try printJSON(output)
        } else {
            print(output.name)
        }

    case "set-output":
        guard let target = positional.first else {
            throw HelperError.message("set-output requires a device name")
        }

        let device = try setDefaultOutput(target: target)
        if wantsJSON {
            try printJSON(device)
        } else {
            print(device.name)
        }

    case "doctor":
        let devices = try listOutputDevices()
        let report = DoctorReport(
            outputCount: devices.count,
            currentOutput: try? currentOutput(),
            devices: devices
        )

        if wantsJSON {
            try printJSON(report)
        } else {
            print("Output devices: \(report.outputCount)")
            print("Current output: \(report.currentOutput?.name ?? "Unknown")")
        }

    default:
        printUsage()
        exit(1)
    }
} catch {
    fputs("\(error.localizedDescription)\n", stderr)
    exit(1)
}
