const { runPowerShell } = require('./common');

const WINDOWS_AUDIO_INTEROP = `
if (-not ('AFA.WindowsAudio.AudioDevices' -as [type])) {
Add-Type -Language CSharp @"
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;

namespace AFA.WindowsAudio {
  public enum EDataFlow {
    eRender,
    eCapture,
    eAll,
    EDataFlow_enum_count
  }

  public enum ERole {
    eConsole,
    eMultimedia,
    eCommunications,
    ERole_enum_count
  }

  [Flags]
  public enum DEVICE_STATE : uint {
    ACTIVE = 0x00000001,
    DISABLED = 0x00000002,
    NOTPRESENT = 0x00000004,
    UNPLUGGED = 0x00000008,
    MASK_ALL = 0x0000000F
  }

  [StructLayout(LayoutKind.Sequential)]
  public struct PROPERTYKEY {
    public Guid fmtid;
    public int pid;

    public PROPERTYKEY(Guid formatId, int propertyId) {
      fmtid = formatId;
      pid = propertyId;
    }
  }

  [StructLayout(LayoutKind.Explicit)]
  public struct PROPVARIANT {
    [FieldOffset(0)] public ushort vt;
    [FieldOffset(8)] public IntPtr pointerValue;

    public string GetString() {
      if (vt == 31 && pointerValue != IntPtr.Zero) {
        return Marshal.PtrToStringUni(pointerValue);
      }

      if (vt == 30 && pointerValue != IntPtr.Zero) {
        return Marshal.PtrToStringAnsi(pointerValue);
      }

      return null;
    }
  }

  [ComImport]
  [Guid("886d8eeb-8cf2-4446-8d02-cdba1dbdcf99")]
  [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  public interface IPropertyStore {
    int GetCount(out int propertyCount);
    int GetAt(int propertyIndex, out PROPERTYKEY key);
    int GetValue(ref PROPERTYKEY key, out PROPVARIANT value);
    int SetValue(ref PROPERTYKEY key, ref PROPVARIANT value);
    int Commit();
  }

  [ComImport]
  [Guid("D666063F-1587-4E43-81F1-B948E807363F")]
  [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  public interface IMMDevice {
    int Activate(ref Guid iid, int clsCtx, IntPtr activationParams, [MarshalAs(UnmanagedType.IUnknown)] out object interfacePointer);
    int OpenPropertyStore(int storageAccess, out IPropertyStore properties);
    int GetId([MarshalAs(UnmanagedType.LPWStr)] out string id);
    int GetState(out DEVICE_STATE state);
  }

  [ComImport]
  [Guid("0BD7A1BE-7A1A-44DB-8397-CC5392387B5E")]
  [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  public interface IMMDeviceCollection {
    int GetCount(out int deviceCount);
    int Item(int deviceNumber, out IMMDevice device);
  }

  [ComImport]
  [Guid("A95664D2-9614-4F35-A746-DE8DB63617E6")]
  [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  public interface IMMDeviceEnumerator {
    int EnumAudioEndpoints(EDataFlow dataFlow, DEVICE_STATE stateMask, out IMMDeviceCollection devices);
    int GetDefaultAudioEndpoint(EDataFlow dataFlow, ERole role, out IMMDevice endpoint);
    int GetDevice(string id, out IMMDevice device);
    int RegisterEndpointNotificationCallback(IntPtr client);
    int UnregisterEndpointNotificationCallback(IntPtr client);
  }

  [ComImport]
  [Guid("F8679F50-850A-41CF-9C72-430F290290C8")]
  [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  public interface IPolicyConfig {
    int GetMixFormat([MarshalAs(UnmanagedType.LPWStr)] string deviceName, out IntPtr format);
    int GetDeviceFormat([MarshalAs(UnmanagedType.LPWStr)] string deviceName, int defaultFormat, out IntPtr format);
    int ResetDeviceFormat([MarshalAs(UnmanagedType.LPWStr)] string deviceName);
    int SetDeviceFormat([MarshalAs(UnmanagedType.LPWStr)] string deviceName, IntPtr endpointFormat, IntPtr mixFormat);
    int GetProcessingPeriod([MarshalAs(UnmanagedType.LPWStr)] string deviceName, int defaultPeriod, out long defaultValue, out long minimumValue);
    int SetProcessingPeriod([MarshalAs(UnmanagedType.LPWStr)] string deviceName, ref long period);
    int GetShareMode([MarshalAs(UnmanagedType.LPWStr)] string deviceName, out int mode);
    int SetShareMode([MarshalAs(UnmanagedType.LPWStr)] string deviceName, ref int mode);
    int GetPropertyValue([MarshalAs(UnmanagedType.LPWStr)] string deviceName, int fxStore, IntPtr propertyKey, IntPtr value);
    int SetPropertyValue([MarshalAs(UnmanagedType.LPWStr)] string deviceName, int fxStore, IntPtr propertyKey, IntPtr value);
    int SetDefaultEndpoint([MarshalAs(UnmanagedType.LPWStr)] string deviceId, ERole role);
    int SetEndpointVisibility([MarshalAs(UnmanagedType.LPWStr)] string deviceId, int visible);
  }

  [ComImport]
  [Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
  public class MMDeviceEnumeratorComObject {
  }

  [ComImport]
  [Guid("870AF99C-171D-4F9E-AF0D-E63DF40C2BC9")]
  public class PolicyConfigClient {
  }

  public class AudioEndpointInfo {
    public string Id { get; set; }
    public string Name { get; set; }
    public bool IsDefault { get; set; }
  }

  public static class AudioDevices {
    private static readonly PROPERTYKEY FriendlyNameKey = new PROPERTYKEY(new Guid("A45C254E-DF1C-4EFD-8020-67D146A850E0"), 14);

    [DllImport("ole32.dll")]
    private static extern int PropVariantClear(ref PROPVARIANT value);

    public static AudioEndpointInfo[] ListRenderDevices() {
      return ListDevices(EDataFlow.eRender);
    }

    public static AudioEndpointInfo[] ListCaptureDevices() {
      return ListDevices(EDataFlow.eCapture);
    }

    public static string GetDefaultRenderDeviceName() {
      return GetDefaultDeviceName(EDataFlow.eRender);
    }

    public static string GetDefaultCaptureDeviceName() {
      return GetDefaultDeviceName(EDataFlow.eCapture);
    }

    public static void SetDefaultRenderDevice(string deviceId) {
      SetDefaultDevice(deviceId);
    }

    public static void SetDefaultCaptureDevice(string deviceId) {
      SetDefaultDevice(deviceId);
    }

    private static AudioEndpointInfo[] ListDevices(EDataFlow flow) {
      var results = new List<AudioEndpointInfo>();
      IMMDeviceEnumerator enumerator = null;
      IMMDeviceCollection collection = null;
      IMMDevice defaultDevice = null;
      string defaultId = null;

      try {
        enumerator = (IMMDeviceEnumerator)(new MMDeviceEnumeratorComObject());
        Marshal.ThrowExceptionForHR(enumerator.GetDefaultAudioEndpoint(flow, ERole.eConsole, out defaultDevice));
        Marshal.ThrowExceptionForHR(defaultDevice.GetId(out defaultId));
        Marshal.ThrowExceptionForHR(enumerator.EnumAudioEndpoints(flow, DEVICE_STATE.ACTIVE, out collection));

        int count;
        Marshal.ThrowExceptionForHR(collection.GetCount(out count));

        for (int index = 0; index < count; index += 1) {
          IMMDevice device = null;

          try {
            Marshal.ThrowExceptionForHR(collection.Item(index, out device));
            string id;
            Marshal.ThrowExceptionForHR(device.GetId(out id));

            results.Add(new AudioEndpointInfo {
              Id = id,
              Name = GetFriendlyName(device),
              IsDefault = StringComparer.OrdinalIgnoreCase.Equals(id, defaultId)
            });
          } finally {
            if (device != null) {
              Marshal.ReleaseComObject(device);
            }
          }
        }
      } finally {
        if (defaultDevice != null) {
          Marshal.ReleaseComObject(defaultDevice);
        }
        if (collection != null) {
          Marshal.ReleaseComObject(collection);
        }
        if (enumerator != null) {
          Marshal.ReleaseComObject(enumerator);
        }
      }

      return results.ToArray();
    }

    private static string GetDefaultDeviceName(EDataFlow flow) {
      foreach (var device in ListDevices(flow)) {
        if (device.IsDefault) {
          return device.Name;
        }
      }

      return String.Empty;
    }

    private static void SetDefaultDevice(string deviceId) {
      var policy = (IPolicyConfig)(new PolicyConfigClient());

      try {
        Marshal.ThrowExceptionForHR(policy.SetDefaultEndpoint(deviceId, ERole.eConsole));
        Marshal.ThrowExceptionForHR(policy.SetDefaultEndpoint(deviceId, ERole.eMultimedia));
        Marshal.ThrowExceptionForHR(policy.SetDefaultEndpoint(deviceId, ERole.eCommunications));
      } finally {
        Marshal.ReleaseComObject(policy);
      }
    }

    private static string GetFriendlyName(IMMDevice device) {
      IPropertyStore store = null;
      PROPVARIANT value = new PROPVARIANT();
      var key = FriendlyNameKey;

      try {
        Marshal.ThrowExceptionForHR(device.OpenPropertyStore(0, out store));
        Marshal.ThrowExceptionForHR(store.GetValue(ref key, out value));
        return value.GetString() ?? String.Empty;
      } finally {
        PropVariantClear(ref value);

        if (store != null) {
          Marshal.ReleaseComObject(store);
        }
      }
    }
  }
}
"@
}
`;

async function runEndpointScript(body) {
  const script = `${WINDOWS_AUDIO_INTEROP}\n${body}`;
  const result = await runPowerShell(script);

  if (result.code !== 0) {
    throw new Error(result.stderr.trim() || 'Windows audio endpoint command failed.');
  }

  return result.stdout.trim();
}

async function listRenderEndpoints() {
  const raw = await runEndpointScript('[AFA.WindowsAudio.AudioDevices]::ListRenderDevices() | ConvertTo-Json -Compress');

  if (!raw) {
    return [];
  }

  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed : [parsed];
}

async function getDefaultRenderEndpointName() {
  return runEndpointScript('[AFA.WindowsAudio.AudioDevices]::GetDefaultRenderDeviceName()');
}

async function setDefaultRenderEndpoint(deviceId) {
  const escaped = String(deviceId || '').replace(/'/g, "''");
  await runEndpointScript(`[AFA.WindowsAudio.AudioDevices]::SetDefaultRenderDevice('${escaped}')`);
  return true;
}

async function listCaptureEndpoints() {
  const raw = await runEndpointScript('[AFA.WindowsAudio.AudioDevices]::ListCaptureDevices() | ConvertTo-Json -Compress');

  if (!raw) {
    return [];
  }

  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed : [parsed];
}

async function getDefaultCaptureEndpointName() {
  return runEndpointScript('[AFA.WindowsAudio.AudioDevices]::GetDefaultCaptureDeviceName()');
}

async function setDefaultCaptureEndpoint(deviceId) {
  const escaped = String(deviceId || '').replace(/'/g, "''");
  await runEndpointScript(`[AFA.WindowsAudio.AudioDevices]::SetDefaultCaptureDevice('${escaped}')`);
  return true;
}

module.exports = {
  listRenderEndpoints,
  getDefaultRenderEndpointName,
  setDefaultRenderEndpoint,
  listCaptureEndpoints,
  getDefaultCaptureEndpointName,
  setDefaultCaptureEndpoint
};
