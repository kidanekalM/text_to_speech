// swift-tools-version:5.5
import PackageDescription

let package = Package(
    name: "AFAAudioHelper",
    platforms: [
        .macOS(.v11)
    ],
    products: [
        .executable(
            name: "AFAAudioHelper",
            targets: ["AFAAudioHelper"]
        )
    ],
    targets: [
        .executableTarget(
            name: "AFAAudioHelper",
            path: "Sources"
        )
    ]
)
