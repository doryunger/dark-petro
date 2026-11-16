import { PAIR_IMAGES, VESSEL_IMAGES, pairSvg, vesselSvg } from "../lib/icons";
import type { PairStyle } from "../lib/icons";
import type { Tab } from "../lib/types";

interface Item {
  label: string;
  style: PairStyle;
  draw: (style: PairStyle) => string;
}

export const LEGEND_ITEMS: Record<Tab, Item[]> = {
  pairs: [
    { label: "Suspected STS", style: PAIR_IMAGES.pair, draw: pairSvg },
    { label: "Suspected STS with sanctioned vessel", style: PAIR_IMAGES["pair-sanctioned"], draw: pairSvg },
    { label: "Selected", style: PAIR_IMAGES["pair-selected"], draw: pairSvg },
  ],
  sanctioned: [
    { label: "Sanctioned vessel", style: VESSEL_IMAGES["vessel-sanctioned"], draw: vesselSvg },
    { label: "Selected vessel", style: VESSEL_IMAGES["vessel-selected"], draw: vesselSvg },
    { label: "Previous position", style: VESSEL_IMAGES["vessel-history"], draw: vesselSvg },
    { label: "Selected previous position", style: VESSEL_IMAGES["vessel-picked"], draw: vesselSvg },
  ],
};

const ICON_LENGTH_REM = 1.4;

export default function Legend({ tab }: { tab: Tab }) {
  return (
    <ul className="legend" aria-label="Map legend">
      {LEGEND_ITEMS[tab].map((item) => (
        <li className="legend-item" key={item.label}>
          <span className="legend-swatch">
            <img className="legend-icon" src={`data:image/svg+xml;utf8,${encodeURIComponent(item.draw(item.style))}`} alt="" style={{ height: `${ICON_LENGTH_REM}rem` }} />
          </span>
          <span className="legend-label">{item.label}</span>
        </li>
      ))}
    </ul>
  );
}
