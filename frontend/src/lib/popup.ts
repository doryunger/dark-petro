import { formatDate } from "./dates";
import { entryIconClass, hotSpotLabel } from "./entries";
import type { Entry } from "./types";

function element(tag: string, className: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function entryCard(entry: Entry): HTMLElement {
  const card = element("article", "entry");
  card.append(element("span", entryIconClass(entry)));
  card.append(element("div", "entry-id", entry.shortId));
  const meta = element("div", "entry-meta");
  meta.append(element("span", "entry-area", hotSpotLabel(entry.hotSpot)), element("span", "entry-date", formatDate(entry.date)), element("span", "entry-source", entry.source.toUpperCase()));
  card.append(meta);
  return card;
}
