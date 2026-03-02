import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const exposeLan =
    env.GROOVE_DEV_EXPOSE_LAN === "true" || env.VITE_EXPOSE_LAN === "true";

  return {
    plugins: [react()],
    server: {
      host: exposeLan ? "0.0.0.0" : "127.0.0.1",
      port: 1420,
      strictPort: true,
    },
    clearScreen: false,
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "."),
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            "vendor-react": ["react", "react-dom", "react-router", "react-router-dom"],
            "vendor-xterm": ["@xterm/xterm", "@xterm/addon-fit", "@xterm/addon-clipboard", "@xterm/addon-unicode11", "@xterm/addon-webgl"],
            "vendor-ui": ["lucide-react", "radix-ui", "sonner", "class-variance-authority", "clsx", "tailwind-merge"],
          },
        },
      },
    },
  };
});
