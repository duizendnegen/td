/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

// base must match the GitHub Pages project path — see ARCHITECTURE.md §13.
export default defineConfig({
  base: '/td/',
  plugins: [tailwindcss()],
  build: {
    target: 'es2022',
    outDir: 'dist',
  },
  test: {
    // Sim tests only. render/ and ui/ are verified by playing, not by tests.
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
