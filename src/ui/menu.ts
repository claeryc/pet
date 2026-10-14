// The menu that slides up when you tap the gear button. It has a main list
// (Settings, Shop, Mini-games, Family Tree) and a Settings page. Items for
// features we haven't built yet are shown greyed out with "Coming soon".

import { STRINGS } from '../strings';

export interface MenuCallbacks {
  onReset: () => void;
}

export interface Menu {
  el: HTMLElement;
  open: () => void;
}

function item(label: string, onClick?: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.className = 'menu-item';
  b.textContent = label;
  if (onClick) {
    b.addEventListener('click', onClick);
  } else {
    // Not built yet: show it, but disabled.
    b.disabled = true;
    const soon = document.createElement('span');
    soon.className = 'menu-soon';
    soon.textContent = STRINGS.menu.comingSoon;
    b.append(soon);
  }
  return b;
}

export function createMenu(cb: MenuCallbacks): Menu {
  // A see-through backdrop covering the screen, with the panel on top.
  const el = document.createElement('div');
  el.className = 'menu-backdrop';
  el.hidden = true;

  const panel = document.createElement('div');
  panel.className = 'menu-panel';
  panel.setAttribute('role', 'dialog');
  el.append(panel);

  const close = () => (el.hidden = true);
  // Tapping outside the panel closes the menu.
  el.addEventListener('click', (e) => {
    if (e.target === el) close();
  });

  function header(title: string, onBack?: () => void): HTMLElement {
    const h = document.createElement('div');
    h.className = 'menu-header';
    const left = document.createElement('button');
    left.className = 'menu-header-btn';
    if (onBack) {
      left.textContent = '‹';
      left.setAttribute('aria-label', STRINGS.menu.back);
      left.addEventListener('click', onBack);
    } else {
      left.style.visibility = 'hidden';
    }
    const t = document.createElement('h2');
    t.textContent = title;
    const x = document.createElement('button');
    x.className = 'menu-header-btn';
    x.textContent = '×';
    x.setAttribute('aria-label', STRINGS.menu.close);
    x.addEventListener('click', close);
    h.append(left, t, x);
    return h;
  }

  function showMain(): void {
    panel.replaceChildren(
      header(STRINGS.menu.title),
      item(STRINGS.menu.settings, showSettings),
      item(STRINGS.menu.shop),
      item(STRINGS.menu.minigames),
      item(STRINGS.menu.familyTree),
    );
  }

  function showSettings(): void {
    const reset = item(STRINGS.buttons.reset, () => {
      close();
      cb.onReset();
    });
    reset.classList.add('menu-item-danger');
    panel.replaceChildren(header(STRINGS.menu.settings, showMain), reset);
  }

  return {
    el,
    open() {
      showMain();
      el.hidden = false;
    },
  };
}
