// The station switch, shared by the kitchen (pot, board, ...) and the
// workbench (bench, projects): a wide bar just under the counter with a
// big button per station, its icon over its name. It sits low, near the
// thumb, and each button is the full height of the bar, so switching is
// easy on a phone. More stations (the oven, the mill) just split the bar
// further.

export interface StationItem<T extends string> {
  id: T;
  icon: string;
  label: string;
}

export interface StationSwitch<T extends string> {
  el: HTMLElement;
  // Marks `on` as the open station and hides the ones `shown` says no to.
  render: (on: T, shown?: (id: T) => boolean) => void;
}

export function createStationSwitch<T extends string>(
  items: readonly StationItem<T>[],
  onPick: (id: T) => void,
): StationSwitch<T> {
  const bar = document.createElement('div');
  bar.className = 'station-switch';
  bar.setAttribute('role', 'tablist');
  const buttons = items.map((it) => {
    const b = document.createElement('button');
    b.className = 'station-tab';
    b.setAttribute('role', 'tab');
    const icon = document.createElement('span');
    icon.className = 'station-tab-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.innerHTML = it.icon;
    const label = document.createElement('span');
    label.textContent = it.label;
    b.append(icon, label);
    b.addEventListener('click', () => onPick(it.id));
    bar.append(b);
    return { id: it.id, b };
  });

  function render(on: T, shown: (id: T) => boolean = () => true): void {
    let count = 0;
    for (const { id, b } of buttons) {
      b.hidden = !shown(id);
      if (!b.hidden) count++;
      b.classList.toggle('on', id === on);
      b.setAttribute('aria-selected', String(id === on));
    }
    // Nothing to switch between: no bar.
    bar.hidden = count < 2;
  }

  return { el: bar, render };
}
