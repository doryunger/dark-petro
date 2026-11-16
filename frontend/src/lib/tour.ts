export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

const GRID_PX = 16;
const MARGIN_PX = 16;

export function rectOfPoints(points: Point[]): Rect | null {
  if (points.length === 0) return null;
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return { left: Math.min(...xs), top: Math.min(...ys), right: Math.max(...xs), bottom: Math.max(...ys) };
}

export function padRect(rect: Rect, pad: number, within: Size): Rect {
  return {
    left: Math.max(rect.left - pad, 2),
    top: Math.max(rect.top - pad, 2),
    right: Math.min(rect.right + pad, within.width - 2),
    bottom: Math.min(rect.bottom + pad, within.height - 2),
  };
}

export function minSide(rect: Rect, side: number): Rect {
  const grow = (low: number, high: number): [number, number] => (high - low >= side ? [low, high] : [(low + high - side) / 2, (low + high + side) / 2]);
  const [left, right] = grow(rect.left, rect.right);
  const [top, bottom] = grow(rect.top, rect.bottom);
  return { left, top, right, bottom };
}

function overlap(a: Rect, b: Rect): number {
  const width = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const height = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  return width > 0 && height > 0 ? width * height : 0;
}

export function placeCard(targets: Rect[], card: Size, area: Rect): Point {
  const minX = area.left + MARGIN_PX;
  const minY = area.top + MARGIN_PX;
  const maxX = Math.max(minX, area.right - card.width - MARGIN_PX);
  const maxY = Math.max(minY, area.bottom - card.height - MARGIN_PX);
  if (targets.length === 0) return { x: (area.left + area.right - card.width) / 2, y: (area.top + area.bottom - card.height) / 2 };
  const avoid = targets.map((t) => ({ left: t.left - MARGIN_PX, top: t.top - MARGIN_PX, right: t.right + MARGIN_PX, bottom: t.bottom + MARGIN_PX }));
  const centre = rectOfPoints(targets.flatMap((t) => [{ x: t.left, y: t.top }, { x: t.right, y: t.bottom }]));
  const cx = centre ? (centre.left + centre.right) / 2 : 0;
  const cy = centre ? (centre.top + centre.bottom) / 2 : 0;
  let best: { x: number; y: number; hit: number; dist: number } | null = null;
  for (let y = minY; y <= maxY + 0.5; y += GRID_PX) {
    for (let x = minX; x <= maxX + 0.5; x += GRID_PX) {
      const box = { left: x, top: y, right: x + card.width, bottom: y + card.height };
      const hit = avoid.reduce((sum, t) => sum + overlap(box, t), 0);
      const dist = Math.hypot(x + card.width / 2 - cx, y + card.height / 2 - cy);
      if (!best || hit < best.hit || (hit === best.hit && dist < best.dist)) best = { x, y, hit, dist };
    }
  }
  return best ? { x: best.x, y: best.y } : { x: minX, y: minY };
}
