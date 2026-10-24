export function tileUrl(origin, filter) {
  const params = [`from=${filter.from}`, `to=${filter.to}`, `source=${[...filter.sources].sort().join(",")}`];
  return `${origin}/tiles/{z}/{x}/{y}.mvt?${params.join("&")}`;
}

export function matches(entry, filter) {
  return entry.date >= filter.from && entry.date <= filter.to && filter.sources.includes(entry.source);
}
