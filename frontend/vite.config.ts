import { defineConfig } from "vitest/config";
import solid from "vite-plugin-solid";

const service = "http://127.0.0.1:8090";

export default defineConfig({
  plugins: [solid()],
  server: { proxy: { "/tiles": service, "/metadata": service, "/hot-spots": service, "/tracks": service, "/activities": service, "/activity-imos": service, "/sanctioned-index": service, "/captures": service } },
  test: { environment: "node" },
});
