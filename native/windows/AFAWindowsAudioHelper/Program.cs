using NAudio.CoreAudioApi;
using NAudio.Wave;

static string? GetArgument(string[] args, string name)
{
    for (var index = 0; index < args.Length - 1; index += 1)
    {
        if (string.Equals(args[index], name, StringComparison.OrdinalIgnoreCase))
        {
            return args[index + 1];
        }
    }

    return null;
}

static bool HasFlag(string[] args, string name) =>
    args.Any(arg => string.Equals(arg, name, StringComparison.OrdinalIgnoreCase));

static MMDevice? FindRenderDevice(MMDeviceEnumerator enumerator, string target)
{
    var normalizedTarget = target.Trim().ToLowerInvariant();
    var devices = enumerator.EnumerateAudioEndPoints(DataFlow.Render, DeviceState.Active).ToList();

    var exact = devices.FirstOrDefault(device => device.FriendlyName.Equals(target, StringComparison.OrdinalIgnoreCase));
    if (exact != null)
    {
        return exact;
    }

    var startsWith = devices.Where(device => device.FriendlyName.ToLowerInvariant().StartsWith(normalizedTarget)).ToList();
    if (startsWith.Count == 1)
    {
        return startsWith[0];
    }

    var contains = devices.Where(device => device.FriendlyName.ToLowerInvariant().Contains(normalizedTarget)).ToList();
    if (contains.Count == 1)
    {
        return contains[0];
    }

    return null;
}

static Task PlayWaveAsync(byte[] wavData, MMDevice device)
{
    var completion = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
    var memory = new MemoryStream(wavData, writable: false);
    var reader = new WaveFileReader(memory);
    var output = new WasapiOut(device, AudioClientShareMode.Shared, false, 200);

    output.Init(reader);
    output.PlaybackStopped += (_, eventArgs) =>
    {
        output.Dispose();
        reader.Dispose();
        memory.Dispose();

        if (eventArgs.Exception != null)
        {
          completion.TrySetException(eventArgs.Exception);
          return;
        }

        completion.TrySetResult();
    };

    output.Play();
    return completion.Task;
}

static MMDevice? FindCaptureDevice(MMDeviceEnumerator enumerator, string target)
{
    var normalizedTarget = target.Trim().ToLowerInvariant();
    var devices = enumerator.EnumerateAudioEndPoints(DataFlow.Capture, DeviceState.Active).ToList();

    var exact = devices.FirstOrDefault(device => device.FriendlyName.Equals(target, StringComparison.OrdinalIgnoreCase));
    if (exact != null)
    {
        return exact;
    }

    var startsWith = devices.Where(device => device.FriendlyName.ToLowerInvariant().StartsWith(normalizedTarget)).ToList();
    if (startsWith.Count == 1)
    {
        return startsWith[0];
    }

    var contains = devices.Where(device => device.FriendlyName.ToLowerInvariant().Contains(normalizedTarget)).ToList();
    if (contains.Count == 1)
    {
        return contains[0];
    }

    return null;
}

static async Task<double> MeasureCapturePeakAsync(MMDevice device, TimeSpan duration)
{
    var completion = new TaskCompletionSource<double>(TaskCreationOptions.RunContinuationsAsynchronously);
    using var capture = new WasapiCapture(device);
    double peak = 0;

    capture.DataAvailable += (_, eventArgs) =>
    {
        for (var index = 0; index < eventArgs.BytesRecorded; index += 2)
        {
            if (index + 1 >= eventArgs.BytesRecorded)
            {
                break;
            }

            var sample = BitConverter.ToInt16(eventArgs.Buffer, index) / 32768.0;
            peak = Math.Max(peak, Math.Abs(sample));
        }
    };

    capture.RecordingStopped += (_, eventArgs) =>
    {
        if (eventArgs.Exception != null)
        {
            completion.TrySetException(eventArgs.Exception);
            return;
        }

        completion.TrySetResult(peak);
    };

    capture.StartRecording();
    await Task.Delay(duration);
    capture.StopRecording();
    return await completion.Task;
}

if (args.Length == 0)
{
    Console.Error.WriteLine("Usage: AFAWindowsAudioHelper play-wav --wav FILE --device DEVICE [--mirror-default]");
    return 1;
}

var command = args[0];

if (!string.Equals(command, "play-wav", StringComparison.OrdinalIgnoreCase) &&
    !string.Equals(command, "verify-route", StringComparison.OrdinalIgnoreCase))
{
    Console.Error.WriteLine($"Unknown command: {command}");
    return 1;
}

var wavPath = GetArgument(args, "--wav");
var deviceName = GetArgument(args, "--device");
var mirrorDefault = HasFlag(args, "--mirror-default");

if (string.IsNullOrWhiteSpace(wavPath))
{
    Console.Error.WriteLine("Missing --wav.");
    return 1;
}

if (string.IsNullOrWhiteSpace(deviceName))
{
    Console.Error.WriteLine("Missing --device.");
    return 1;
}

if (!File.Exists(wavPath))
{
    Console.Error.WriteLine($"WAV file not found: {wavPath}");
    return 1;
}

try
{
    using var enumerator = new MMDeviceEnumerator();
    var targetDevice = FindRenderDevice(enumerator, deviceName);

    if (targetDevice == null)
    {
        Console.Error.WriteLine($"Playback device not found: {deviceName}");
        return 1;
    }

    var wavData = await File.ReadAllBytesAsync(wavPath);

    if (string.Equals(command, "verify-route", StringComparison.OrdinalIgnoreCase))
    {
        var captureName = GetArgument(args, "--capture-device");

        if (string.IsNullOrWhiteSpace(captureName))
        {
            Console.Error.WriteLine("Missing --capture-device.");
            return 1;
        }

        var captureDevice = FindCaptureDevice(enumerator, captureName);

        if (captureDevice == null)
        {
            Console.Error.WriteLine($"Capture device not found: {captureName}");
            return 1;
        }

        var playbackTasks = new List<Task>();
        var captureTask = MeasureCapturePeakAsync(captureDevice, TimeSpan.FromSeconds(4));

        playbackTasks.Add(PlayWaveAsync(wavData, targetDevice));

        if (mirrorDefault)
        {
            var defaultDevice = enumerator.GetDefaultAudioEndpoint(DataFlow.Render, Role.Multimedia);

            if (!string.Equals(defaultDevice.ID, targetDevice.ID, StringComparison.OrdinalIgnoreCase))
            {
                playbackTasks.Add(PlayWaveAsync(wavData, defaultDevice));
            }
        }

        await Task.WhenAll(playbackTasks);
        var peak = await captureTask;
        Console.WriteLine(peak.ToString("F6", System.Globalization.CultureInfo.InvariantCulture));
        return peak > 0.001 ? 0 : 2;
    }

    var tasks = new List<Task> { PlayWaveAsync(wavData, targetDevice) };

    if (mirrorDefault)
    {
        var defaultDevice = enumerator.GetDefaultAudioEndpoint(DataFlow.Render, Role.Multimedia);

        if (!string.Equals(defaultDevice.ID, targetDevice.ID, StringComparison.OrdinalIgnoreCase))
        {
            tasks.Add(PlayWaveAsync(wavData, defaultDevice));
        }
    }

    await Task.WhenAll(tasks);
    return 0;
}
catch (Exception error)
{
    Console.Error.WriteLine(error.Message);
    return 1;
}
