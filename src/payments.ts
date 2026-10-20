// Real-money purchases for the Star Shop. This is only a stand-in: there's
// no payment provider yet, so `purchase()` asks the player to confirm (see
// main.ts) and then always succeeds without charging anything.
//
// To take real payments, replace `purchase()` with a call to the store
// (App Store / Google Play in-app purchases, or a web checkout) and only
// resolve `true` once the store says the payment went through. Everything
// else (the Shop, giving out the stars) stays the same.

import { CONFIG } from './game/config';

export type ProductId = (typeof CONFIG.store)[number]['id'];

// Asks for payment. `confirm` shows the player what they're buying and
// resolves true if they went ahead.
export async function purchase(_product: ProductId, confirm: () => Promise<boolean>): Promise<boolean> {
  return confirm();
}
