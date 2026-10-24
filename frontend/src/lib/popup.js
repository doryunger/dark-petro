import { formatDate } from "./dates.js";
import { hotSpotLabel } from "./entries.js";

function element(tag, className, text) {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function entryCard(entry) {
  const card = element("article", "entry");
  card.append(element("span", `entry-icon${entry.sanctioned ? " entry-icon-sanctioned" : ""}`));
  card.append(element("div", "entry-id", entry.shortId));
  const meta = element("div", "entry-meta");
  meta.append(element("span", "entry-area", hotSpotLabel(entry.hotSpot)), element("span", "entry-date", formatDate(entry.date)), element("span", "entry-source", entry.source.toUpperCase()));
  card.append(meta);
  return card;
}
