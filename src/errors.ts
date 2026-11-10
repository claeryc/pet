// Errors that would otherwise go unseen. Each different message is logged
// once, so a problem that happens every frame doesn't flood the console.
// Nothing is sent anywhere: a real error service can hook in here later.

const seen = new Set<string>();

export function reportOnce(error: unknown, where = 'game'): void {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  const key = `${where}|${message}`;
  if (seen.has(key)) return;
  seen.add(key);
  console.error(`[${where}]`, error);
}

// Catches errors nobody handled, from anywhere on the page.
export function watchForErrors(): void {
  window.addEventListener('error', (e) => reportOnce(e.error ?? e.message, 'page'));
  window.addEventListener('unhandledrejection', (e) => reportOnce(e.reason, 'promise'));
}
