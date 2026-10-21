#!/usr/bin/env python3
"""Make Artie's 256² floor_stone variants wrap at cell borders.

Approach (offline rewrite, not a shared interior joint layout):
Artie's tiles already share an identical ~16 px rim on matching sides, but
left ≠ right and top ≠ bottom, so joints die at every cell edge. This script
rewrites a 16–24 px band on the right and bottom from the master's left/top
edge set (hard pixel copy, jagged depth, no blur) so any two variants tile
in the mesher's unrotated UV frame.

Run from the repo root: python3 levels/tools/edge_match_floor_tiles.py
"""
from __future__ import annotations

import struct
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TEX = ROOT / 'public' / 'proto3d' / 'tex3d'
MASTER = 'floor_stone.png'
VARIANTS = (
    'floor_stone.png',
    'floor_stone_2.png',
    'floor_stone_3.png',
    'floor_stone_4.png',
)
BAND_MIN = 16
BAND_MAX = 24


def decode_png(path: Path) -> tuple[int, int, bytearray]:
    data = path.read_bytes()
    assert data[:8] == b'\x89PNG\r\n\x1a\n', path
    pos = 8
    w = h = bit = colour = None
    idat = b''
    while pos < len(data):
        ln = struct.unpack('>I', data[pos : pos + 4])[0]
        tag = data[pos + 4 : pos + 8]
        payload = data[pos + 8 : pos + 8 + ln]
        pos += 12 + ln
        if tag == b'IHDR':
            w, h, bit, colour = struct.unpack('>IIBB', payload[:10])
        elif tag == b'IDAT':
            idat += payload
        elif tag == b'IEND':
            break
    assert w and h and bit == 8 and colour in (2, 6), path
    raw = zlib.decompress(idat)
    bpp = 4 if colour == 6 else 3
    stride = w * bpp
    out = bytearray(w * h * 4)
    prev = bytearray(stride)
    i = 0

    def paeth(a: int, b: int, c: int) -> int:
        p = a + b - c
        pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
        return a if pa <= pb and pa <= pc else b if pb <= pc else c

    for y in range(h):
        filt = raw[i]
        i += 1
        row = bytearray(raw[i : i + stride])
        i += stride
        for x in range(stride):
            a = row[x - bpp] if x >= bpp else 0
            b = prev[x]
            c = prev[x - bpp] if x >= bpp else 0
            v = row[x]
            if filt == 0:
                n = v
            elif filt == 1:
                n = (v + a) & 255
            elif filt == 2:
                n = (v + b) & 255
            elif filt == 3:
                n = (v + (a + b) // 2) & 255
            elif filt == 4:
                n = (v + paeth(a, b, c)) & 255
            else:
                raise ValueError(f'png filter {filt}')
            row[x] = n
        prev = row
        for x in range(w):
            o = (y * w + x) * 4
            if colour == 6:
                out[o : o + 4] = row[x * 4 : x * 4 + 4]
            else:
                out[o : o + 3] = row[x * 3 : x * 3 + 3]
                out[o + 3] = 255
    return w, h, out


def encode_png(path: Path, w: int, h: int, rgba: bytes) -> None:
    def chunk(tag: bytes, payload: bytes) -> bytes:
        return (
            struct.pack('>I', len(payload))
            + tag
            + payload
            + struct.pack('>I', zlib.crc32(tag + payload) & 0xFFFFFFFF)
        )

    raw = bytearray()
    for y in range(h):
        raw.append(0)
        raw.extend(rgba[y * w * 4 : (y + 1) * w * 4])
    png = (
        b'\x89PNG\r\n\x1a\n'
        + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0))
        + chunk(b'IDAT', zlib.compress(bytes(raw), 9))
        + chunk(b'IEND', b'')
    )
    path.write_bytes(png)


def band_depth(along: int, salt: int) -> int:
    """16–24 px, jagged so the cut is not a straight frame."""
    return BAND_MIN + ((along * 17 + salt * 31) & 0xFFFF) % (BAND_MAX - BAND_MIN + 1)


def pix(buf: bytearray, w: int, x: int, y: int) -> bytes:
    i = (y * w + x) * 4
    return bytes(buf[i : i + 4])


def set_pix(buf: bytearray, w: int, x: int, y: int, rgba: bytes) -> None:
    i = (y * w + x) * 4
    buf[i : i + 4] = rgba


def edge_match(dest: bytearray, master: bytearray, w: int, h: int) -> None:
    """Stamp master left→right and top→bottom. Hard copy, no blend."""
    for y in range(h):
        d = band_depth(y, 1)
        for i in range(d):
            set_pix(dest, w, w - 1 - i, y, pix(master, w, i, y))
    for x in range(w):
        d = band_depth(x, 2)
        for i in range(d):
            set_pix(dest, w, x, h - 1 - i, pix(master, w, x, i))
    # Outer pixel must wrap exactly: neighbour cells sample these columns/rows.
    # Endpoints of both profiles share the master corner so the four corners agree.
    corner = pix(master, w, 0, 0)
    set_pix(dest, w, 0, 0, corner)
    set_pix(dest, w, w - 1, 0, corner)
    for y in range(h):
        set_pix(dest, w, w - 1, y, pix(dest, w, 0, y))
    for x in range(w):
        set_pix(dest, w, x, h - 1, pix(dest, w, x, 0))


def main() -> None:
    mw, mh, master = decode_png(TEX / MASTER)
    assert mw == mh == 256
    for name in VARIANTS:
        w, h, pixels = decode_png(TEX / name)
        assert (w, h) == (mw, mh), name
        edge_match(pixels, master, w, h)
        encode_png(TEX / name, w, h, bytes(pixels))
        print('wrote', name)


if __name__ == '__main__':
    main()
