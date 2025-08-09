import { defineConfig } from 'vite';

export default defineConfig({
  // Build the app in this folder, not the repo root
  root: 'self_steering',
  base: '/Self-Steering-3D-Voronoi-Three.js/',
  // Output into the repository root's docs/ so GitHub Pages can serve it from main branch
  build: { outDir: '../docs', emptyOutDir: true }
});


