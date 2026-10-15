export interface FloorData {
  id?: number;
  width: number;
  height: number;
  startX: number;
  startY: number;
  startDir: number;
  tiles: Record<string, unknown>[][];
  sconces?: unknown[];
}
