import type { Map as MapboxMap } from "mapbox-gl";

export interface PairStyle {
  fill: string;
  stroke: string;
  strokeWidth?: number;
  orientation?: number;
  width?: number;
  height?: number;
}

const SHIP = "M12 0C17 6 24 20 24 34L24 108C24 118 20 126 17 128L7 128C4 126 0 118 0 108L0 34C0 20 7 6 12 0Z";
const VIEW_BOX = "-3 -3 62 134";
const BASE_WIDTH = 26;
const BASE_HEIGHT = 56;

export const PAIR_IMAGES: Record<string, PairStyle> = {
  pair: { fill: "#f2c230", stroke: "#000000" },
  "pair-sanctioned": { fill: "#d64545", stroke: "#000000" },
  "pair-selected": { fill: "#4fd0e4", stroke: "#ffffff" },
};

export function pairSvg({ fill, stroke, strokeWidth = 3, orientation = 180, width = BASE_WIDTH, height = BASE_HEIGHT }: PairStyle): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${VIEW_BOX}" width="${width}" height="${height}">` +
    `<g fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linejoin="round" transform="rotate(${orientation} 28 64)">` +
    `<path d="${SHIP}"/><path d="${SHIP}" transform="translate(32 0)"/></g></svg>`
  );
}

function loadImage(svg: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}

export async function rasterPair(style: PairStyle, pixelRatio = 3): Promise<ImageData> {
  const width = BASE_WIDTH * pixelRatio;
  const height = BASE_HEIGHT * pixelRatio;
  const image = await loadImage(pairSvg({ ...style, width, height }));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("canvas is not available");
  context.drawImage(image, 0, 0, width, height);
  return context.getImageData(0, 0, width, height);
}

export async function addPairImages(map: MapboxMap, pixelRatio = 3): Promise<void> {
  for (const [name, style] of Object.entries(PAIR_IMAGES)) {
    if (map.hasImage(name)) continue;
    map.addImage(name, await rasterPair(style, pixelRatio), { pixelRatio });
  }
}
