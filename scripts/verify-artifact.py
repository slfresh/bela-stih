"""What a shippable Android artifact must and must not carry, read back out
of the AAB or APK itself (build-android.sh runs this on both).

  python scripts/verify-artifact.py <artifact> [<artifact>...]

- Permissions: only the allowlist below, none of the blocked ones. A native
  dependency can add a permission through its manifest without a line of ours
  changing (Expo's template asks for SYSTEM_ALERT_WINDOW, expo-file-system for
  the storage pair; react-native-webrtc's plugin would add CAMERA; expo-audio's
  background mode a foreground service). Play reads the merged manifest, not
  app.json - so this reads the merged manifest too: the <uses-permission>
  elements themselves, parsed from the APK's binary XML or the AAB's protobuf
  XML. Not a byte search: a receiver protected by android:permission="DUMP"
  requests nothing, and a name left behind by tools:node="remove" is not a
  request either.
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
    'android.permission.WAKE_LOCK',
}
# Declared by every app targeting API 33+ that registers a runtime receiver;
# the name carries the package (com.slfresh.belastih.DYNAMIC_RECEIVER_...).
ALLOWED_SUFFIXES = ('.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION',)
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
    'android.permission.MODIFY_AUDIO_SETTINGS',
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


def allowed(perm):
    return perm in ALLOWED or perm.endswith(ALLOWED_SUFFIXES)


# --- the APK's binary XML (ResXMLTree) ---------------------------------------

def axml_uses_permissions(blob):
    """The android:name of every <uses-permission> in an APK's AndroidManifest.xml."""
    if len(blob) < 8 or struct.unpack_from('<H', blob, 0)[0] != 0x0003:
        raise ValueError('not a binary XML document')
    pool = None
    found = set()
    i = 8
    while i + 8 <= len(blob):
        ctype, _hsize, csize = struct.unpack_from('<HHI', blob, i)
        if csize < 8:
            raise ValueError('malformed chunk')
        if ctype == 0x0001:  # RES_STRING_POOL_TYPE
            count, _styles, flags, strings_start = struct.unpack_from('<IIII', blob, i + 8)
            utf8 = bool(flags & 0x100)
            offsets = struct.unpack_from('<%dI' % count, blob, i + 28)
            base = i + strings_start
            pool = []
            for off in offsets:
                p = base + off
                if utf8:
                    # Two lengths, chars then bytes, each one byte or two.
                    n = blob[p]
                    p += 2 if n & 0x80 else 1
                    m = blob[p]
                    p += 1
                    if m & 0x80:
                        m = ((m & 0x7f) << 8) | blob[p]
                        p += 1
                    pool.append(blob[p:p + m].decode('utf-8', 'replace'))
                else:
                    n, = struct.unpack_from('<H', blob, p)
                    p += 2
                    if n & 0x8000:
                        n2, = struct.unpack_from('<H', blob, p)
                        p += 2
                        n = ((n & 0x7fff) << 16) | n2
                    pool.append(blob[p:p + 2 * n].decode('utf-16-le', 'replace'))
        elif ctype == 0x0102:  # RES_XML_START_ELEMENT_TYPE
            if pool is None:
                raise ValueError('an element before the string pool')
            # ResXMLTree_node (16 bytes) then ResXMLTree_attrExt: ns, name, attributeStart,
            # attributeSize, attributeCount, ...; attributeStart is relative to attrExt.
            name_idx, = struct.unpack_from('<I', blob, i + 20)
            attr_start, attr_size, attr_count = struct.unpack_from('<HHH', blob, i + 24)
            if name_idx < len(pool) and pool[name_idx] == 'uses-permission':
                for k in range(attr_count):
                    p = i + 16 + attr_start + k * attr_size
                    _ns, an, raw, _size, _res0, dtype, data = struct.unpack_from('<IIIHBBI', blob, p)
                    if an < len(pool) and pool[an] == 'name':
                        if raw != 0xFFFFFFFF:
                            found.add(pool[raw])
                        elif dtype == 3:  # TYPE_STRING
                            found.add(pool[data])
        i += csize
    if pool is None:
        raise ValueError('no string pool')
    return found


# --- the AAB's protobuf XML (aapt2 Resources.proto: XmlNode / XmlElement / XmlAttribute) ---

def _varint(b, i):
    r = s = 0
    while True:
        c = b[i]
        i += 1
        r |= (c & 0x7F) << s
        if not c & 0x80:
            return r, i
        s += 7


def _fields(b):
    """(field number, wire type, value) for each field of one message; length-delimited values stay bytes."""
    i = 0
    out = []
    while i < len(b):
        key, i = _varint(b, i)
        f, w = key >> 3, key & 7
        if w == 0:
            v, i = _varint(b, i)
        elif w == 1:
            v, i = b[i:i + 8], i + 8
        elif w == 2:
            n, i = _varint(b, i)
            v, i = b[i:i + n], i + n
        elif w == 5:
            v, i = b[i:i + 4], i + 4
        else:
            raise ValueError(f'protobuf wire type {w}')
        out.append((f, w, v))
    return out


def _text(v):
    return v.decode('utf-8', 'replace')


def proto_uses_permissions(blob):
    """The android:name of every <uses-permission> in an AAB's base/manifest/AndroidManifest.xml."""
    found = set()

    def attribute(b):
        # XmlAttribute: 1 namespace_uri, 2 name, 3 value, 6 compiled_item (Item: 2 String{1 value}, 3 RawString{1 value}).
        name = value = None
        for f, w, v in _fields(b):
            if w != 2:
                continue
            if f == 2:
                name = _text(v)
            elif f == 3:
                value = _text(v)
            elif f == 6 and not value:
                for g, gw, gv in _fields(v):
                    if gw == 2 and g in (2, 3):
                        for h, hw, hv in _fields(gv):
                            if hw == 2 and h == 1:
                                value = _text(hv)
        return name, value

    def element(b):
        # XmlElement: 1 namespace_declaration, 2 namespace_uri, 3 name, 4 attribute, 5 child.
        fields = _fields(b)
        name = next((_text(v) for f, w, v in fields if f == 3 and w == 2), '')
        if name == 'uses-permission':
            for f, w, v in fields:
                if f == 4 and w == 2:
                    an, av = attribute(v)
                    if an == 'name' and av:
                        found.add(av)
        for f, w, v in fields:
            if f == 5 and w == 2:
                node(v)

    def node(b):
        # XmlNode: 1 element, 2 text.
        for f, w, v in _fields(b):
            if f == 1 and w == 2:
                element(v)

    node(blob)
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
        try:
            if 'AndroidManifest.xml' in names:
                perms = axml_uses_permissions(z.read('AndroidManifest.xml'))
            elif 'base/manifest/AndroidManifest.xml' in names:
                perms = proto_uses_permissions(z.read('base/manifest/AndroidManifest.xml'))
            else:
                return [f'{path}: no AndroidManifest.xml']
        except (ValueError, IndexError, struct.error) as e:
            return [f'{path}: could not read the manifest ({e}) - the parser, not the app, needs fixing']
        # An app that asks for nothing at all does not exist; an empty set means the parser missed the elements.
        if not perms:
            problems.append(f'{path}: read no <uses-permission> at all - the manifest parser did not understand this artifact')
        for p in sorted(perms & BLOCKED):
            problems.append(f'{path}: BLOCKED permission {p} in the merged manifest (a dependency added it? block it in app.json)')
        for p in sorted(x for x in perms - BLOCKED if not allowed(x)):
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
