export type WallFace = 'N' | 'E' | 'S' | 'W';

export type KnotWallSpec = {
  x: number;
  y: number;
  face: WallFace;
  note: string;
};

/** Old secret-wall carving, reused as a placed stone decoration. */
export const KNOT_WALL_FILE = 'secret_closed.png';

/**
 * Solid-wall faces that show the knot panel. Cell is the wall square; face is
 * the side that looks into the room. Never on or beside a secret.
 */
export const floor1KnotWalls: readonly KnotWallSpec[] = [
  {
    x: 11,
    y: 0,
    face: 'S',
    note: 'guard-hall north end, across from the sunbeam'
  },
  {
    x: 12,
    y: 11,
    face: 'N',
    note: "back wall of Pell the lamp-keeper's room"
  }
];

const FACE_INTO: Record<WallFace, [number, number]> = {
  N: [0, -1],
  E: [1, 0],
  S: [0, 1],
  W: [-1, 0]
};

export function knotWallFile(x: number, y: number, face: string): string | undefined {
  for (const spec of floor1KnotWalls) {
    if (spec.x === x && spec.y === y && spec.face === face) return KNOT_WALL_FILE;
  }
  return undefined;
}

export function knotWallViewer(spec: KnotWallSpec): { x: number; y: number } {
  const [dx, dy] = FACE_INTO[spec.face];
  return { x: spec.x + dx, y: spec.y + dy };
}

export const KNOT_FACE_NEIGHBORS: ReadonlyArray<[number, number]> = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0]
];

export type KnotPixels = {
  width: number;
  height: number;
  data: Uint8ClampedArray | Uint8Array | ArrayLike<number>;
};

/**
 * Inner carved square of `secret_closed.png` (128²). Outside this is a
 * different, lighter brick frame — plus a black top row and a bright
 * floor-course that leaked light at the cornice and the floor.
 */
export const KNOT_PANEL_INSET = { x0: 12, y0: 20, x1: 116, y1: 104 } as const;

export function knotBatchKey(
  look: { key: string },
  wallX: number,
  wallY: number,
  face: string
): string {
  return `knot:${look.key}:${wallX},${wallY},${face}`;
}

function sampleRgba(src: KnotPixels, u: number, v: number): [number, number, number, number] {
  const x = Math.min(src.width - 1, Math.max(0, Math.round(u * (src.width - 1))));
  const y = Math.min(src.height - 1, Math.max(0, Math.round(v * (src.height - 1))));
  const i = (y * src.width + x) * 4;
  const d = src.data;
  return [d[i] ?? 0, d[i + 1] ?? 0, d[i + 2] ?? 0, d[i + 3] ?? 255];
}

function lumaOf(r: number, g: number, b: number): number {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

/** True for the black leak row / empty texels on the knot PNG. */
export function isKnotLeakTexel(r: number, g: number, b: number, a: number): boolean {
  return a < 16 || lumaOf(r, g, b) < 0.02;
}

export function inKnotPanel(x: number, y: number, w: number, h: number): boolean {
  const x0 = Math.round((KNOT_PANEL_INSET.x0 * w) / 128);
  const y0 = Math.round((KNOT_PANEL_INSET.y0 * h) / 128);
  const x1 = Math.round((KNOT_PANEL_INSET.x1 * w) / 128);
  const y1 = Math.round((KNOT_PANEL_INSET.y1 * h) / 128);
  return x >= x0 && x < x1 && y >= y0 && y < y1;
}

/**
 * Room stone for the frame (same tile, so integer-U neighbours still meet).
 * Only the carved panel is taken from `secret_closed.png`. Outer 2 texels
 * and leak-black knot texels stay on the room map so cornice/floor joins
 * cannot open a gap.
 */
export function compositeKnotOnRoom(room: KnotPixels, knot: KnotPixels): KnotPixels {
  const w = room.width;
  const h = room.height;
  const out = new Uint8ClampedArray(w * h * 4);
  const rd = room.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const edge = x < 2 || y < 2 || x >= w - 2 || y >= h - 2;
      let r = rd[i] ?? 0;
      let g = rd[i + 1] ?? 0;
      let b = rd[i + 2] ?? 0;
      let a = rd[i + 3] ?? 255;
      if (!edge && inKnotPanel(x, y, w, h)) {
        const [kr, kg, kb, ka] = sampleRgba(knot, w <= 1 ? 0 : x / (w - 1), h <= 1 ? 0 : y / (h - 1));
        if (!isKnotLeakTexel(kr, kg, kb, ka)) {
          r = kr;
          g = kg;
          b = kb;
          a = ka;
        }
      }
      out[i] = r;
      out[i + 1] = g;
      out[i + 2] = b;
      out[i + 3] = a;
    }
  }
  return { width: w, height: h, data: out };
}
