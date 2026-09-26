"""What a shippable Android artifact must and must not carry, read back out
of the AAB or APK itself (build-android.sh runs this on both).

  python scripts/verify-artifact.py <artifact> [<artifact>...]

- Permissions: only the allowlist below, none of the blocked ones. A native
  dependency can add a permission through its manifest without a line of ours
  changing (react-native-webrtc's config plugin adds CAMERA and
  SYSTEM_ALERT_WINDOW; expo-audio's background mode adds a foreground
  service). Play reads the merged manifest, not app.json.
- 16 KB pages: every 64-bit native library must load on a 16 KB-page kernel
  (Play requires it of new apps and updates from 2025-11-01): each PT_LOAD
  segment's alignment must be at least 16 KiB. Checked on the ELF headers, so
  it holds for an AAB (whose libraries Play re-packs) as much as for an APK.
- Size: per-ABI native code and the DEX stay within a budget, so a dependency
  that doubles the download is noticed before the store is.

Exit 1 on any failure; the reasons are printed with the artifact's name.
"""
import re
import struct
import sys
import zipfile

ALLOWED = {
    'android.permission.INTERNET',
    'android.permission.ACCESS_NETWORK_STATE',
    'android.permission.VIBRATE',
    'android.permission.RECORD_AUDIO',
    'android.permission.MODIFY_AUDIO_SETTINGS',
    'android.permission.WAKE_LOCK',
    # Declared by every app targeting API 33+ that registers a runtime receiver.
    'android.permission.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION',
}
# Never, whatever a dependency asks for: each of these changes the Data safety
# answers, the privacy page, or what a reviewer sees in the manifest.
BLOCKED = {
    'android.permission.SYSTEM_ALERT_WINDOW',
    'android.permission.CAMERA',
    'android.permission.READ_EXTERNAL_STORAGE',
    'android.permission.WRITE_EXTERNAL_STORAGE',
    'android.permission.READ_MEDIA_IMAGES',
    'android.permission.READ_MEDIA_VIDEO',
    'android.permission.READ_MEDIA_AUDIO',
    'android.permission.FOREGROUND_SERVICE',
    'android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK',
    'android.permission.FOREGROUND_SERVICE_MICROPHONE',
    'android.permission.ACCESS_FINE_LOCATION',
    'android.permission.ACCESS_COARSE_LOCATION',
    'android.permission.READ_CONTACTS',
    'android.permission.READ_PHONE_STATE',
    'android.permission.POST_NOTIFICATIONS',
    'android.permission.BLUETOOTH_CONNECT',
    'com.google.android.gms.permission.AD_ID',
}
# Bytes, uncompressed. The 1.5.1 build: arm64 26.9 MB, armeabi-v7a 19.6 MB,
# dex 27.5 MB. A quarter of headroom; a real new dependency raises these on
# purpose, in the same commit.
BUDGET = {
    'lib/arm64-v8a': 34 * 1024 * 1024,
    'lib/armeabi-v7a': 25 * 1024 * 1024,
    'dex': 34 * 1024 * 1024,
}
PAGE_16K = 16 * 1024


def permissions(blobs):
    found = set()
    pattern = rb'(?:android|com\.google\.android\.gms)\.permission\.[A-Z_]+'
    for blob in blobs:
        found.update(m.decode() for m in re.findall(pattern, blob))
        # An APK's binary XML holds strings in UTF-16LE.
        wide = blob.decode('utf-16-le', errors='ignore').encode('latin-1', errors='ignore')
        found.update(m.decode() for m in re.findall(pattern, wide))
    return found


def elf_load_alignments(data):
    """(bits, [p_align of every PT_LOAD]) of an ELF, or None if it is not one."""
    if data[:4] != b'\x7fELF':
        return None
    bits = 64 if data[4] == 2 else 32
    little = data[5] == 1
    end = '<' if little else '>'
    if bits == 64:
        phoff, = struct.unpack_from(end + 'Q', data, 0x20)
        phentsize, phnum = struct.unpack_from(end + 'HH', data, 0x36)
    else:
        phoff, = struct.unpack_from(end + 'I', data, 0x1c)
        phentsize, phnum = struct.unpack_from(end + 'HH', data, 0x2a)
    aligns = []
    for i in range(phnum):
        off = phoff + i * phentsize
        if bits == 64:
            p_type, = struct.unpack_from(end + 'I', data, off)
            p_align, = struct.unpack_from(end + 'Q', data, off + 0x30)
        else:
            p_type, = struct.unpack_from(end + 'I', data, off)
            p_align, = struct.unpack_from(end + 'I', data, off + 0x1c)
        if p_type == 1:  # PT_LOAD
            aligns.append(p_align)
    return bits, aligns


def verify(path):
    problems = []
    with zipfile.ZipFile(path) as z:
        names = z.namelist()
        manifests = [z.read(n) for n in names if n in ('AndroidManifest.xml', 'base/manifest/AndroidManifest.xml')]
        if not manifests:
            return [f'{path}: no AndroidManifest.xml']
        perms = permissions(manifests)
        for p in sorted(perms & BLOCKED):
            problems.append(f'{path}: BLOCKED permission {p} in the merged manifest (a dependency added it?)')
        for p in sorted(perms - ALLOWED - BLOCKED):
            problems.append(f'{path}: unknown permission {p}: add it to ALLOWED in scripts/verify-artifact.py on purpose, or remove what asks for it')
        print(f'   {path}: permissions {", ".join(sorted(perms)) or "(none)"}')

        sizes = {}
        misaligned = []
        for n in names:
            m = re.match(r'(?:base/)?(lib/[^/]+)/[^/]+\.so$', n)
            if not m:
                continue
            info = z.getinfo(n)
            sizes[m.group(1)] = sizes.get(m.group(1), 0) + info.file_size
            elf = elf_load_alignments(z.read(n))
            if elf is None:
                problems.append(f'{path}: {n} is not an ELF file')
                continue
            bits, aligns = elf
            if bits == 64 and any(a < PAGE_16K for a in aligns):
                misaligned.append(f'{n} (PT_LOAD align {min(aligns)})')
        if misaligned:
            problems.append(f'{path}: 64-bit libraries not built for 16 KB pages: {", ".join(misaligned)}')
        dex = sum(z.getinfo(n).file_size for n in names if n.endswith('.dex'))
        sizes['dex'] = dex
        for key, budget in BUDGET.items():
            got = sizes.get(key, 0)
            flag = '' if got <= budget else '  !! over budget'
            print(f'   {path}: {key} {got / 1024 / 1024:.1f} MB (budget {budget / 1024 / 1024:.0f} MB){flag}')
            if got > budget:
                problems.append(f'{path}: {key} is {got / 1024 / 1024:.1f} MB, over the {budget / 1024 / 1024:.0f} MB budget')
        for abi in ('lib/x86', 'lib/x86_64'):
            if sizes.get(abi):
                problems.append(f'{path}: carries {abi} ({sizes[abi] / 1024 / 1024:.1f} MB): release builds are arm only')
        aligned64 = sum(1 for n in names if re.match(r'(?:base/)?lib/arm64-v8a/[^/]+\.so$', n))
        print(f'   {path}: {aligned64} arm64 libraries, all 16 KB-page aligned' if not misaligned else f'   {path}: 16 KB alignment FAILED')
    return problems


def main(argv):
    if not argv:
        sys.exit(__doc__)
    problems = []
    for path in argv:
        problems.extend(verify(path))
    for p in problems:
        print('!! ' + p)
    if problems:
        sys.exit(1)
    print('== artifact checks passed')


if __name__ == '__main__':
    main(sys.argv[1:])
