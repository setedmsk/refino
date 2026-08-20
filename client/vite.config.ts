import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// O client fala com o servidor pelo proxy do Vite, entao tudo e mesma origem
// em dev: sem CORS, e o token vai no header como em producao.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:3001', changeOrigin: true },
      '/socket.io': { target: 'http://localhost:3001', ws: true },
    },
  },
});
