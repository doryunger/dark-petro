import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

const service = "http://127.0.0.1:8090";

export default defineConfig({
  plugins: [react()],
  server: { proxy: { "/tiles": service, "/metadata": service, "/captures": service } },
  test: { environment: "node" },
});
