const API = "https://api.mapbox.com";
const STYLE = "mapbox/navigation-night-v1";

export const FALLBACK_STYLE = {
  version: 8,
  sources: {},
  layers: [{ id: "background", type: "background", paint: { "background-color": "#1d4e6b" } }],
};

export function styleFor(token) {
  return token ? `${API}/styles/v1/${STYLE}?access_token=${token}` : FALLBACK_STYLE;
}

export function mapboxUrl(url, token) {
  const signed = (u) => `${u}${u.includes("?") ? "&" : "?"}access_token=${token}`;
  let m;
  if ((m = /^mapbox:\/\/styles\/([^/]+)\/([^/?]+)$/.exec(url))) return signed(`${API}/styles/v1/${m[1]}/${m[2]}`);
  if ((m = /^mapbox:\/\/sprites\/([^/]+)\/([^/?@.]+)(.*)$/.exec(url))) return signed(`${API}/styles/v1/${m[1]}/${m[2]}/sprite${m[3]}`);
  if ((m = /^mapbox:\/\/fonts\/([^/]+)\/(.+)$/.exec(url))) return signed(`${API}/fonts/v1/${m[1]}/${m[2]}`);
  if ((m = /^mapbox:\/\/([^/]+)$/.exec(url))) return signed(`${API}/v4/${m[1]}.json?secure`);
  if ((url.startsWith(API) || /^https:\/\/[a-d]\.tiles\.mapbox\.com\//.test(url)) && !url.includes("access_token=")) return signed(url);
  return null;
}

export function transformRequest(token) {
  return (url) => {
    if (!token) return { url };
    return { url: mapboxUrl(url, token) ?? url };
  };
}
