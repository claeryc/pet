// Filling Percy's order. Tapping the parcel in the room (or Open in
// Messages) takes you out to Percy, who waits with a crate per thing he
// asked for, on an open net (drawn in src/render/delivery.ts). A panel
// slides up over the stat bars, like the garden's: the title, what the
// whole order pays and the time left along the top, then one box per thing
// Percy asked for, with its picture and how many are in it out of how many
// he wants (greyed out while empty). Tap a box to put one in, and the
// little minus to take one back out.
//
// The panel's frame shows how the order is going: bronze with one full box,
// silver with two, and a sparkling gold when every box is full (that's the
// bonus). The button row becomes [Close] [Fill all].
//
// What an order asks for and pays is decided in src/game/delivery.ts.

import { STRINGS } from '../strings';
import { isFull, orderPay, orderTier } from '../game/delivery';
import type { GameState } from '../game/state';
import type { FoodId } from '../game/actions';
import type { DeliveryScene } from '../render/delivery';
import { ITEM_ICONS, STAT_ICONS } from './icons';
import { formatDuration } from './time';

export interface DeliveryCallbacks {
  onPut: (box: number) => void;
  onTake: (box: number) => void;
  onFillAll: () => void;
  onExit: () => void;
  toast: (message: string) => void;
}

export interface DeliveryPanel {
  row: HTMLElement; // the buttons, shown in place of the normal button row
  panel: HTMLElement; // the boxes, shown in place of the stat bars
  start: () => void;
  stop: () => void;
  active: () => boolean;
  update: (state: GameState, now: number) => void;
  scene: () => DeliveryScene | null; // what the room should draw, while open
}

// How long the panel takes to slide in and out (matches .delivery in style.css).
export const DELIVERY_OUT_MS = 450;

const foodName = (id: string) => STRINGS.foods[id as FoodId] ?? id;

export function createDelivery(cb: DeliveryCallbacks): DeliveryPanel {
  let state: GameState | null = null;
  let now = 0;
  let active = false;
  let outTimer = 0;

  const panel = document.createElement('div');
  panel.className = 'delivery';
  panel.hidden = true;

  // [Percy's order ..... coin 68 ..... hourglass 5h 12m]
  const head = document.createElement('div');
  head.className = 'delivery-head';
  const title = document.createElement('b');
  title.textContent = STRINGS.delivery.title;
  const reward = document.createElement('span');
  reward.className = 'delivery-reward';
  const when = document.createElement('span');
  when.className = 'delivery-when';
  head.append(title, reward, when);

  const boxesEl = document.createElement('div');
  boxesEl.className = 'delivery-boxes';
  const empty = document.createElement('p');
  empty.className = 'delivery-empty';
  panel.append(head, boxesEl, empty);

  // One box: [picture] [have / want], with a minus in the corner once
  // something is in it.
  const boxes = Array.from({ length: 3 }, (_, i) => {
    const el = document.createElement('div');
    el.className = 'delivery-box';
    const put = document.createElement('button');
    put.className = 'delivery-box-put';
    const icon = document.createElement('span');
    icon.className = 'delivery-box-icon';
    const count = document.createElement('b');
    count.className = 'delivery-box-count';
    put.append(icon, count);
    const take = document.createElement('button');
    take.className = 'delivery-box-take';
    take.textContent = '−';
    put.addEventListener('click', () => cb.onPut(i));
    take.addEventListener('click', () => cb.onTake(i));
    el.append(put, take);
    return { el, put, icon, count, take, food: '' };
  });
  boxesEl.append(...boxes.map((b) => b.el));

  const row = document.createElement('div');
  row.className = 'actions delivery-row';
  row.hidden = true;
  const close = document.createElement('button');
  close.className = 'btn btn-soft';
  close.textContent = STRINGS.delivery.close;
  const fill = document.createElement('button');
  fill.className = 'btn';
  fill.textContent = STRINGS.delivery.fillAll;
  row.append(close, fill);
  close.addEventListener('click', () => {
    stop();
    cb.onExit();
  });
  fill.addEventListener('click', cb.onFillAll);

  function render(): void {
    if (!state) return;
    const order = state.delivery.order;
    panel.dataset.tier = order ? orderTier(order.boxes) : 'none';
    boxesEl.hidden = !order;
    empty.hidden = !!order;
    fill.disabled = !order || order.boxes.every(isFull);
    if (!order) {
      when.replaceChildren();
      reward.replaceChildren();
      empty.textContent = `${STRINGS.delivery.noOrder} ${STRINGS.delivery.nextOrder(formatDuration(state.delivery.nextAt - now))}`;
      return;
    }
    // What the whole order pays with every box full, bonus included.
    const pay = orderPay(order.boxes.map((b) => ({ ...b, have: b.want })));
    const total = pay.boxes + pay.bonus;
    reward.innerHTML = STAT_ICONS.gold;
    reward.append(String(total));
    reward.title = STRINGS.delivery.reward(total);
    when.innerHTML = STAT_ICONS.hourglass;
    when.append(formatDuration(order.pickupAt - now));
    when.title = STRINGS.delivery.pickupIn(formatDuration(order.pickupAt - now));
    boxesEl.dataset.count = String(order.boxes.length);
    boxes.forEach((b, i) => {
      const box = order.boxes[i];
      b.el.hidden = !box;
      if (!box) return;
      if (b.food !== box.food) {
        b.food = box.food;
        b.icon.innerHTML = ITEM_ICONS[box.food] ?? '';
      }
      b.count.textContent = `${box.have}/${box.want}`;
      b.el.dataset.fill = isFull(box) ? 'full' : box.have > 0 ? 'some' : 'empty';
      b.put.setAttribute('aria-label', STRINGS.delivery.box(foodName(box.food), box.have, box.want));
      b.take.hidden = box.have === 0;
      b.take.setAttribute('aria-label', STRINGS.delivery.takeOut(foodName(box.food)));
    });
  }

  function stop(): void {
    if (!active) return;
    active = false;
    row.hidden = true;
    panel.classList.remove('is-in');
    clearTimeout(outTimer);
    outTimer = window.setTimeout(() => (panel.hidden = true), DELIVERY_OUT_MS);
  }

  return {
    row,
    panel,
    start() {
      active = true;
      row.hidden = false;
      clearTimeout(outTimer);
      panel.hidden = false;
      render();
      void panel.offsetHeight;
      panel.classList.add('is-in');
      if (state?.delivery.order) cb.toast(STRINGS.delivery.start);
    },
    stop,
    active: () => active,
    scene: () => {
      if (!active || !state) return null;
      const boxes = state.delivery.order?.boxes ?? [];
      return {
        percy: boxes.length > 0,
        crates: boxes.map((b) => (isFull(b) ? 'full' : b.have > 0 ? 'some' : 'empty')),
      };
    },
    update(next, at) {
      state = next;
      now = at;
      if (active) render();
    },
  };
}
