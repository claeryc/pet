import { describe, expect, it } from 'vitest';
import { LINKS, VERSION } from '../src/about';
import pkg from '../package.json';

describe('about the game', () => {
  it('shows the version from package.json', () => {
    expect(VERSION).toBe(pkg.version);
  });

  it('only links to web pages or an email address', () => {
    for (const url of Object.values(LINKS)) {
      if (url) expect(url).toMatch(/^(https:\/\/|mailto:)/);
    }
  });
});
