import { defineConfig } from 'vite';
import { mapLab } from './scripts/map-lab-server.ts';

// The map lab's save and load (dev server only, see map-lab.html).
export default defineConfig({
  plugins: [mapLab()],
});
