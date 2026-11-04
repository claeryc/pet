import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { LINKS, VERSION } from '../src/about';

describe('about the game', () => {
  it('shows the version from package.json', () => {
    const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    expect(VERSION).toBe(version);
  });

  it('only links to web pages or an email address', () => {
    for (const url of Object.values(LINKS)) {
      if (url) expect(url).toMatch(/^(https:\/\/|mailto:)/);
    }
  });
});
