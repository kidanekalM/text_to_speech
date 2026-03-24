# AFA

Floating macOS text-to-speech app for meetings.

You click the AFA floater, type text, and AFA speaks it. The shipping direction is BlackHole-first so the spoken audio can appear to other apps as microphone input.

## Current Product Direction

- Main app: floating desktop UI
- Virtual mic backend: `BlackHole 2ch`
- User goal: install AFA, let AFA install/check the driver, then type and speak

The app now includes:

- floating always-on-top desktop window
- shared speech/routing controller for desktop UI and CLI
- BlackHole install/readiness detection
- bundled-installer scaffolding
- built-in doctor and setup flows

## Install

```bash
cd /Users/kidanekal/Desktop/code/text_to_speech
npm install
```

## Run

Desktop app:

```bash
npm run desktop
```

Packaged macOS build:

```bash
npm run build
```

Packaged Windows build:

```bash
npm run build:win
```

CLI/debug mode:

```bash
node app.js
```

Diagnostics:

```bash
npm run doctor
node app.js --setup
```

## BlackHole Packaging

For the one-app install flow, bundle the BlackHole installer package at:

```text
resources/blackhole/BlackHole2ch.pkg
```

AFA already looks for that path and can invoke the macOS installer flow from inside the app.

Fastest way to stage the package into the repo before building:

```bash
npm run stage:blackhole -- /absolute/path/to/BlackHole2ch.pkg
```

Scaffold location:

- [`resources/blackhole/README.txt`](/Users/kidanekal/Desktop/code/text_to_speech/resources/blackhole/README.txt)
- [`scripts/stage-blackhole.js`](/Users/kidanekal/Desktop/code/text_to_speech/scripts/stage-blackhole.js)

Windows scaffold:

- [`resources/vbcable/README.txt`](/Users/kidanekal/Desktop/code/text_to_speech/resources/vbcable/README.txt)
- [`scripts/stage-vbcable.js`](/Users/kidanekal/Desktop/code/text_to_speech/scripts/stage-vbcable.js)

## Desktop UI

The floating app is in:

- [`desktop/main.js`](/Users/kidanekal/Desktop/code/text_to_speech/desktop/main.js)
- [`desktop/preload.js`](/Users/kidanekal/Desktop/code/text_to_speech/desktop/preload.js)
- [`desktop/renderer/index.html`](/Users/kidanekal/Desktop/code/text_to_speech/desktop/renderer/index.html)
- [`desktop/renderer/styles.css`](/Users/kidanekal/Desktop/code/text_to_speech/desktop/renderer/styles.css)
- [`desktop/renderer/renderer.js`](/Users/kidanekal/Desktop/code/text_to_speech/desktop/renderer/renderer.js)

The shared application logic is in:

- [`lib/afa-controller.js`](/Users/kidanekal/Desktop/code/text_to_speech/lib/afa-controller.js)
- [`lib/driver-manager.js`](/Users/kidanekal/Desktop/code/text_to_speech/lib/driver-manager.js)
- [`lib/speech.js`](/Users/kidanekal/Desktop/code/text_to_speech/lib/speech.js)
- [`lib/audio-routing.js`](/Users/kidanekal/Desktop/code/text_to_speech/lib/audio-routing.js)
- [`lib/doctor.js`](/Users/kidanekal/Desktop/code/text_to_speech/lib/doctor.js)

## What Still Depends On Packaging

The intended end-state is:

1. user installs AFA
2. AFA installs BlackHole internally
3. user restarts only if macOS requires it
4. user opens AFA and types

What is already implemented:

- detection of BlackHole on disk and in package records
- detection of whether the virtual device is visible
- in-app install command that will use a bundled `.pkg`
- packaged-app resource lookup via `process.resourcesPath`
- `electron-builder` config that copies `resources/blackhole` into the app bundle
- `electron-builder` config that copies `resources/vbcable` into Windows builds
- onboarding state in the floating UI

## Windows Backend Status

Windows support is now scaffolded, not finished.

Implemented:

- Windows TTS backend using PowerShell / `System.Speech`
- Windows driver manager scaffold for `VB-CABLE`
- Windows packaging target via `npm run build:win`

Not implemented yet:

- automatic Windows output switching
- polished Windows virtual-mic onboarding and verification on a real Windows machine

What still depends on the final packaged build:

- actually bundling `BlackHole2ch.pkg`
- testing the in-app installer flow on a packaged macOS app
- tightening the post-install restart/readiness UX

## Notes

- `say` is still the speech engine for the MVP
- `SwitchAudioSource` remains available as a helper, but the product direction is BlackHole-first, not manual routing-first
- the CLI remains useful for debugging, but the desktop floater is now the primary UX
