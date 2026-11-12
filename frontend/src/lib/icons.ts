import type { Map as MapboxMap } from "mapbox-gl";

export interface PairStyle {
  fill: string;
  stroke: string;
  strokeWidth?: number;
  outline?: string;
  outlineWidth?: number;
  scale?: number;
  orientation?: number;
  width?: number;
  height?: number;
}

const SHIP = "M12 0C17 6 24 20 24 34L24 108C24 118 20 126 17 128L7 128C4 126 0 118 0 108L0 34C0 20 7 6 12 0Z";
const SHIP_HEIGHT = 128;
const PAIR_SPAN = 56;
const VESSEL_SPAN = 24;
const VIEW_PAD = 3;
const BASE_WIDTH = 26;
const VESSEL_BASE_WIDTH = 13;
const BASE_HEIGHT = 56;

const SELECTED_RING = { stroke: "#ffffff", strokeWidth: 12, outline: "#000000", outlineWidth: 3, scale: 1.4 };

export const PAIR_IMAGES: Record<string, PairStyle> = {
  pair: { fill: "#f2c230", stroke: "#000000" },
  "pair-sanctioned": { fill: "#d64545", stroke: "#000000" },
  "pair-selected": { fill: "#4fd0e4", ...SELECTED_RING },
};

export const VESSEL_IMAGES: Record<string, PairStyle> = {
  "vessel-sanctioned": { fill: "#d64545", stroke: "#000000" },
  "vessel-selected": { fill: "#4fd0e4", ...SELECTED_RING },
  "vessel-picked": { fill: "#9aa5b0", ...SELECTED_RING },
  "vessel-history": { fill: "#e88f8f", stroke: "#000000" },
};

function padOf({ strokeWidth = 3, outline, outlineWidth = 0 }: PairStyle): number {
  return outline ? Math.max(VIEW_PAD, (strokeWidth + 2 * outlineWidth) / 2 + 1) : VIEW_PAD;
}

function padFactor(style: PairStyle, span: number): { x: number; y: number } {
  const pad = padOf(style);
  return { x: (span + 2 * pad) / (span + 2 * VIEW_PAD), y: (SHIP_HEIGHT + 2 * pad) / (SHIP_HEIGHT + 2 * VIEW_PAD) };
}

function hulls(shapes: string[], style: PairStyle, transform: string, dividerX: number | null): string {
  const { fill, stroke, strokeWidth = 3, outline, outlineWidth = 0 } = style;
  const layer = (content: string, paint: string, line: string, widthOfLine: number) => `<g fill="${paint}" stroke="${line}" stroke-width="${widthOfLine}" stroke-linejoin="round">${content}</g>`;
  if (!outline) return `<g transform="${transform}">${layer(shapes.join(""), fill, stroke, strokeWidth)}</g>`;
  const halves = dividerX === null || shapes.length !== 2 ? null : [dividerX - outlineWidth / 2, dividerX + outlineWidth / 2];
  const clips = halves
    ? `<defs><clipPath id="hull-first"><rect x="-100" y="-100" width="${100 + halves[0]}" height="400"/></clipPath><clipPath id="hull-second"><rect x="${halves[1]}" y="-100" width="300" height="400"/></clipPath></defs>`
    : "";
  const ring = halves
    ? shapes.map((shape, index) => `<g clip-path="url(#${index === 0 ? "hull-first" : "hull-second"})">${layer(shape, stroke, stroke, strokeWidth)}</g>`).join("")
    : layer(shapes.join(""), stroke, stroke, strokeWidth);
  const body = clips + layer(shapes.join(""), outline, outline, strokeWidth + 2 * outlineWidth) + ring + `<g fill="${fill}">${shapes.join("")}</g>`;
  return `<g transform="${transform}">${body}</g>`;
}

function svgOf(span: number, centerX: number, shapes: string[], dividerX: number | null, style: PairStyle, orientation: number, width: number, height: number): string {
  const pad = padOf(style);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-pad} ${-pad} ${span + 2 * pad} ${SHIP_HEIGHT + 2 * pad}" width="${width}" height="${height}">` +
    hulls(shapes, style, `rotate(${orientation} ${centerX} 64)`, dividerX) +
    "</svg>"
  );
}

export function pairSvg(style: PairStyle): string {
  const { orientation = 180, scale = 1 } = style;
  const factor = padFactor(style, PAIR_SPAN);
  const { width = BASE_WIDTH * scale * factor.x, height = BASE_HEIGHT * scale * factor.y } = style;
  return svgOf(PAIR_SPAN, 28, [`<path d="${SHIP}"/>`, `<path d="${SHIP}" transform="translate(32 0)"/>`], 28, style, orientation, width, height);
}

export function vesselSvg(style: PairStyle): string {
  const { orientation = 0, scale = 1 } = style;
  const factor = padFactor(style, VESSEL_SPAN);
  const { width = VESSEL_BASE_WIDTH * scale * factor.x, height = BASE_HEIGHT * scale * factor.y } = style;
  return svgOf(VESSEL_SPAN, 12, [`<path d="${SHIP}"/>`], null, style, orientation, width, height);
}

function loadImage(svg: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}

async function raster(draw: (style: PairStyle) => string, baseWidth: number, span: number, style: PairStyle, pixelRatio: number): Promise<ImageData> {
  const factor = padFactor(style, span);
  const scale = style.scale ?? 1;
  const width = Math.round(baseWidth * pixelRatio * scale * factor.x);
  const height = Math.round(BASE_HEIGHT * pixelRatio * scale * factor.y);
  const image = await loadImage(draw({ ...style, width, height }));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("canvas is not available");
  context.drawImage(image, 0, 0, width, height);
  return context.getImageData(0, 0, width, height);
}

export function rasterPair(style: PairStyle, pixelRatio = 3): Promise<ImageData> {
  return raster(pairSvg, BASE_WIDTH, PAIR_SPAN, style, pixelRatio);
}

export function rasterVessel(style: PairStyle, pixelRatio = 3): Promise<ImageData> {
  return raster(vesselSvg, VESSEL_BASE_WIDTH, VESSEL_SPAN, style, pixelRatio);
}

export async function addMapImages(map: MapboxMap, pixelRatio = 3): Promise<void> {
  const sets: [Record<string, PairStyle>, (style: PairStyle, ratio: number) => Promise<ImageData>][] = [
    [PAIR_IMAGES, rasterPair],
    [VESSEL_IMAGES, rasterVessel],
  ];
  for (const [images, draw] of sets) {
    for (const [name, style] of Object.entries(images)) {
      if (map.hasImage(name)) continue;
      map.addImage(name, await draw(style, pixelRatio), { pixelRatio });
    }
  }
}
