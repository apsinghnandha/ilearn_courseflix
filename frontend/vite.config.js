import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  root: '.',
  build: {
    outDir: 'dist',
    rollupOptions: {
      output: {
        manualChunks: {
          mantine: ['@mantine/core', '@mantine/hooks', '@mantine/carousel'],
          react: ['react', 'react-dom', 'react-router-dom'],
          icons: ['tabler-icons-react'],
        },
      },
    },
  },
  server: {
    proxy: {
      '/api': 'http://localhost:8000',
    },
  },
});
