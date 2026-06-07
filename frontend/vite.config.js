import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg"],
      manifest: {
        name: "Cyanea",
        short_name: "Cyanea",
        description: "Planificacion colaborativa de viajes grupales",
        theme_color: "#0f766e",
        background_color: "#f4efe5",
        display: "standalone",
        start_url: "/"
      }
    })
  ],
  server: {
    host: "0.0.0.0",
    port: 5173
  }
});
