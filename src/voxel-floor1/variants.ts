/** Same FNV-1a as proto3d/texture-variants — duplicated so this page does not import proto3d. */

export function faceHash(x: number, y: number, face: string, salt: number): number {
  const s = `${x},${y},${face},${salt}`;
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function pickVariantIndex(count: number, x: number, y: number, face: string): number {
  if (count <= 1) return 0;
  return faceHash(x, y, face, 1) % count;
}

export function pickVariant<T>(list: readonly T[], x: number, y: number, face: string): T {
  return list[pickVariantIndex(list.length, x, y, face)];
}
