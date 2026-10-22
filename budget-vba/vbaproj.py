# -*- coding: utf-8 -*-
"""엑셀 없이 vbaProject.bin 을 만드는 최소 구현 (MS-OVBA / MS-CFB 규격)."""
import random, struct, uuid

# ───────────── MS-OVBA 2.4.1 압축 ─────────────
def _copy_token_help(diff):
    bit_count = 4
    while (1 << bit_count) < diff:
        bit_count += 1
    length_mask = 0xFFFF >> bit_count
    max_len = length_mask + 3
    return bit_count, length_mask, max_len

def _compress_chunk(data, start, end):
    out = bytearray()
    cur = start
    while cur < end:
        flag_pos = len(out)
        out.append(0)
        flags = 0
        for bit in range(8):
            if cur >= end:
                break
            best_len, best_off = 0, 0
            diff = cur - start
            if diff > 0:
                bit_count, _, max_len = _copy_token_help(diff)
                max_len = min(max_len, end - cur)
                p = cur - 1
                while p >= start:
                    l = 0
                    while l < max_len and data[p + l] == data[cur + l]:
                        l += 1
                    if l > best_len:
                        best_len, best_off = l, cur - p
                        if l == max_len:
                            break
                    p -= 1
            if best_len >= 3:
                bit_count, _, _ = _copy_token_help(diff)
                token = ((best_off - 1) << (16 - bit_count)) | (best_len - 3)
                out += struct.pack("<H", token)
                flags |= 1 << bit
                cur += best_len
            else:
                out.append(data[cur])
                cur += 1
        out[flag_pos] = flags
    return bytes(out)

def compress(data: bytes) -> bytes:
    out = bytearray(b"\x01")
    pos = 0
    n = len(data)
    while pos < n:
        end = min(pos + 4096, n)
        body = _compress_chunk(data, pos, end)
        if len(body) > 4096 and end - pos == 4096:
            hdr = 0x3000 | (4096 + 2 - 3)
            out += struct.pack("<H", hdr) + data[pos:end]
        else:
            hdr = 0x8000 | 0x3000 | (len(body) + 2 - 3)
            out += struct.pack("<H", hdr) + body
        pos = end
    return bytes(out)

# ───────────── MS-OVBA 2.4.3 데이터 암호화 (CMG/DPB/GC) ─────────────
def encrypt(project_id: str, data: bytes) -> bytes:
    seed = random.randint(0, 255)
    version_enc = 2 ^ seed
    proj_key = sum(ord(c) for c in project_id) & 0xFF
    out = bytearray([seed, version_enc, proj_key ^ seed])
    unenc1, enc1, enc2 = proj_key, proj_key ^ seed, version_enc
    def emit(b):
        nonlocal unenc1, enc1, enc2
        e = b ^ ((enc2 + unenc1) & 0xFF)
        out.append(e)
        enc2, enc1, unenc1 = enc1, e, b
    for _ in range((seed & 6) // 2):
        emit(random.randint(0, 255))
    for b in struct.pack("<I", len(data)):
        emit(b)
    for b in data:
        emit(b)
    return bytes(out)

def decrypt(enc: bytes) -> bytes:
    enc = bytearray(enc)
    seed, version_enc, pk_enc = enc[0], enc[1], enc[2]
    assert version_enc ^ seed == 2
    unenc1, enc1, enc2 = pk_enc ^ seed, pk_enc, version_enc
    i = 3
    def take():
        nonlocal i, unenc1, enc1, enc2
        e = enc[i]; i += 1
        b = e ^ ((enc2 + unenc1) & 0xFF)
        enc2, enc1, unenc1 = enc1, e, b
        return b
    for _ in range((seed & 6) // 2):
        take()
    ln = struct.unpack("<I", bytes(take() for _ in range(4)))[0]
    return bytes(take() for _ in range(ln))

# ───────────── dir / PROJECT 스트림 ─────────────
CP = 949          # 한국어 코드페이지
CP_NAME = "cp949"

def _rec(rid, payload):
    return struct.pack("<HI", rid, len(payload)) + payload

def _dbl(rid, rid_u, text):
    return _rec(rid, text.encode(CP_NAME)) + _rec(rid_u, text.encode("utf-16-le"))

def dir_stream(modules):
    """modules: [(name, is_document)]"""
    b = bytearray()
    b += _rec(0x0001, struct.pack("<I", 3))          # SYSKIND win64
    b += _rec(0x0002, struct.pack("<I", 0x0409))     # LCID
    b += _rec(0x0014, struct.pack("<I", 0x0409))     # LCIDINVOKE
    b += _rec(0x0003, struct.pack("<H", CP))         # CODEPAGE
    b += _rec(0x0004, b"VBAProject")                 # NAME
    b += _dbl(0x0005, 0x0040, "")                    # DOCSTRING
    b += _dbl(0x0006, 0x003D, "")                    # HELPFILEPATH
    b += _rec(0x0007, struct.pack("<I", 0))          # HELPCONTEXT
    b += _rec(0x0008, struct.pack("<I", 0))          # LIBFLAGS
    b += struct.pack("<HIIH", 0x0009, 4, 0x65BE0257, 17)  # VERSION
    b += _dbl(0x000C, 0x003C, "")                    # CONSTANTS
    # 참조: stdole
    b += _dbl(0x0016, 0x003E, "stdole")
    libid = b"*\\G{00020430-0000-0000-C000-000000000046}#2.0#0#C:\\Windows\\System32\\stdole2.tlb#OLE Automation"
    reg = struct.pack("<I", len(libid)) + libid + struct.pack("<IH", 0, 0)
    b += _rec(0x000D, reg)
    # 모듈
    b += _rec(0x000F, struct.pack("<H", len(modules)))
    b += _rec(0x0013, struct.pack("<H", 0xFFFF))
    for name, is_doc in modules:
        b += _rec(0x0019, name.encode(CP_NAME))
        b += _rec(0x0047, name.encode("utf-16-le"))
        b += _dbl(0x001A, 0x0032, name)
        b += _dbl(0x001C, 0x0048, "")
        b += _rec(0x0031, struct.pack("<I", 0))      # 소스 시작 위치(캐시 없음)
        b += _rec(0x001E, struct.pack("<I", 0))
        b += _rec(0x002C, struct.pack("<H", 0xFFFF))
        b += struct.pack("<HI", 0x0022 if is_doc else 0x0021, 0)
        b += struct.pack("<HI", 0x002B, 0)
    b += struct.pack("<HI", 0x0010, 0)
    return bytes(b)

def project_stream(project_id, modules):
    lines = [f'ID="{project_id}"']
    for name, is_doc in modules:
        lines.append(f"Document={name}/&H00000000" if is_doc else f"Module={name}")
    lines += ['Name="VBAProject"', 'HelpContextID="0"', 'VersionCompatible32="393222000"']
    lines.append('CMG="%s"' % encrypt(project_id, b"\x00\x00\x00\x00").hex().upper())
    lines.append('DPB="%s"' % encrypt(project_id, b"\x00").hex().upper())
    lines.append('GC="%s"' % encrypt(project_id, b"\xff").hex().upper())
    lines += ["", "[Host Extender Info]", "&H00000001={3832D640-CF90-11CF-8E43-00A0C911005A};VBE;&H00000000",
              "", "[Workspace]"]
    for name, _ in modules:
        lines.append(f"{name}=0, 0, 0, 0, C")
    return ("\r\n".join(lines) + "\r\n").encode(CP_NAME)

# ───────────── MS-CFB 쓰기 (v3, 512바이트 섹터) ─────────────
FREE, EOC, FATSECT, NOSTREAM = 0xFFFFFFFF, 0xFFFFFFFE, 0xFFFFFFFD, 0xFFFFFFFF

class Node:
    def __init__(self, name, kind, data=b""):
        self.name, self.kind, self.data = name, kind, data   # kind: 5 root, 1 storage, 2 stream
        self.children = []
        self.left = self.right = self.child = NOSTREAM
        self.start, self.size = EOC, 0

def _key(n):
    return (len(n.name), n.name.upper())

def _tree(nodes):
    if not nodes:
        return NOSTREAM
    nodes = sorted(nodes, key=_key)
    mid = len(nodes) // 2
    root = nodes[mid]
    root.left = _tree(nodes[:mid])
    root.right = _tree(nodes[mid + 1:])
    return root.id

def write_cfb(root: Node) -> bytes:
    entries = []
    def walk(n):
        n.id = len(entries)
        entries.append(n)
        for c in n.children:
            walk(c)
    walk(root)
    for n in entries:
        if n.children:
            n.child = _tree(n.children)
    streams = [n for n in entries if n.kind == 2]
    mini = [n for n in streams if len(n.data) < 4096]
    big = [n for n in streams if len(n.data) >= 4096]
    # 미니 스트림
    ministream = bytearray()
    minifat = []
    for n in mini:
        n.size = len(n.data)
        if n.size == 0:
            n.start = EOC
            continue
        cnt = (n.size + 63) // 64
        first = len(ministream) // 64
        n.start = first
        ministream += n.data + b"\x00" * (cnt * 64 - n.size)
        minifat += [first + i + 1 for i in range(cnt - 1)] + [EOC]
    root.size = len(ministream)
    sec = lambda nbytes: (nbytes + 511) // 512
    n_ms = sec(len(ministream))
    n_dir = sec(len(entries) * 128)
    n_mf = sec(len(minifat) * 4)
    n_big = sum(sec(len(n.data)) for n in big)
    n_fat = 1
    while True:
        total = n_ms + n_dir + n_mf + n_big + n_fat
        if (total + 127) // 128 <= n_fat:
            break
        n_fat += 1
    assert n_fat <= 109
    fat = []
    def chain(cnt):
        start = len(fat)
        fat.extend([start + i + 1 for i in range(cnt - 1)] + [EOC])
        return start
    root.start = chain(n_ms) if n_ms else EOC
    dir_start = chain(n_dir)
    mf_start = chain(n_mf) if n_mf else EOC
    for n in big:
        n.size = len(n.data)
        n.start = chain(sec(n.size))
    fat_start = len(fat)
    fat.extend([FATSECT] * n_fat)
    fat.extend([FREE] * (n_fat * 128 - len(fat)))
    # 본문
    body = bytearray()
    body += ministream + b"\x00" * (n_ms * 512 - len(ministream))
    d = bytearray()
    for n in entries:
        nm = n.name.encode("utf-16-le")
        assert len(nm) <= 62
        e = nm + b"\x00" * (64 - len(nm))
        e += struct.pack("<HBBIII", len(nm) + 2, n.kind, 1, n.left, n.right, n.child)
        e += b"\x00" * 16 + struct.pack("<I", 0) + b"\x00" * 16
        e += struct.pack("<IQ", n.start, n.size)
        d += e
    while len(d) % 512:
        d += b"\x00" * 64 + struct.pack("<HBBIII", 0, 0, 0, NOSTREAM, NOSTREAM, NOSTREAM) + b"\x00" * 48
    body += d
    mfb = b"".join(struct.pack("<I", x) for x in minifat)
    body += mfb + struct.pack("<I", FREE) * ((n_mf * 512 - len(mfb)) // 4)
    for n in big:
        body += n.data + b"\x00" * (sec(len(n.data)) * 512 - len(n.data))
    body += b"".join(struct.pack("<I", x) for x in fat)
    hdr = bytearray()
    hdr += bytes.fromhex("D0CF11E0A1B11AE1") + b"\x00" * 16
    hdr += struct.pack("<HHHHH", 0x003E, 0x0003, 0xFFFE, 9, 6) + b"\x00" * 6
    hdr += struct.pack("<IIIIIIIII", 0, n_fat, dir_start, 0, 4096, mf_start, n_mf, EOC, 0)
    difat = list(range(fat_start, fat_start + n_fat)) + [FREE] * (109 - n_fat)
    hdr += b"".join(struct.pack("<I", x) for x in difat)
    assert len(hdr) == 512
    return bytes(hdr + body)

# ───────────── 조립 ─────────────
def build_vba_project(modules):
    """modules: [(name, is_document, source_text)] → vbaProject.bin bytes"""
    pid = "{" + str(uuid.uuid4()).upper() + "}"
    meta = [(m[0], m[1]) for m in modules]
    root = Node("Root Entry", 5)
    vba = Node("VBA", 1)
    root.children = [vba, Node("PROJECT", 2, project_stream(pid, meta))]
    vba.children = [Node("_VBA_PROJECT", 2, struct.pack("<HHBH", 0x61CC, 0xFFFF, 0x00, 0x0000)),
                    Node("dir", 2, compress(dir_stream(meta)))]
    for name, _, src in modules:
        text = src.replace("\r\n", "\n").replace("\n", "\r\n")
        vba.children.append(Node(name, 2, compress(text.encode(CP_NAME, errors="strict"))))
    return write_cfb(root)
