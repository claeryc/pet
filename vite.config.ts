import { readFileSync } from 'node:fs';
import { configDefaults, defineConfig } from 'vitest/config';
import { mapLab } from './scripts/map-lab-server.ts';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

// The map lab's save and load (dev server only, see map-lab.html), and the
// game's version for Settings (see src/about.ts).
export default defineConfig({
  plugins: [mapLab()],
  define: { __APP_VERSION__: JSON.stringify(version) },
  // The Playwright smoke test runs on its own (npm run e2e), not in vitest.
  test: { exclude: [...configDefaults.exclude, 'tests-e2e/**'] },
});
