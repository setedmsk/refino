import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// O client fala com o servidor pelo proxy do Vite, entao tudo e mesma origem
// em dev: sem CORS, e o token vai no header como em producao.
export default defineConfig({
  // Caminhos relativos: o Electron carrega o index.html de file://, e um
  // src="/assets/..." absoluto apontaria para a raiz do disco.
  base: './',
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:3001', changeOrigin: true },
      '/socket.io': { target: 'http://localhost:3001', ws: true },
    },
  },
});
