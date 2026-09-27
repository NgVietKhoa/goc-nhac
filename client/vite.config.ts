import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // Dev: chuyển /api sang server Node (npm run dev -w server).
    // Muốn thử với Edge Function chạy local thì đặt API_PROXY=http://localhost:54321/functions/v1
    proxy: {
      '/api': {
        target: process.env.API_PROXY ?? 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
