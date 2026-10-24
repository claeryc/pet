// A box that asks the player to pick one of a few options, floating over
// the whole screen like the naming box (and styled the same). Used when a
// little one arrives: keep its parent at home, or retire it, and which pet
// moves out when the room is full. It can't be dismissed without picking.

export interface ChoiceOption {
  label: string;
  picture?: string; // an image URL shown on the button (a pet's portrait)
  soft?: boolean; // the quieter, second-choice style
  onPick: () => void;
}

export interface ChoiceRequest {
  art?: string; // a small picture on top (markup), e.g. how something works
  artReadable?: boolean; // the picture has words a screen reader should read
  title: string;
  text: string;
  detail?: string; // more to read under the text (markup), e.g. the forecast before mingling
  options: ChoiceOption[];
}

export interface ChoiceBox {
  open: (request: ChoiceRequest) => void;
  isOpen: () => boolean;
}

export function createChoiceBox(root: HTMLElement): ChoiceBox {
  const backdrop = document.createElement('div');
  backdrop.className = 'name-backdrop';
  backdrop.hidden = true;
  const box = document.createElement('div');
  box.className = 'name-box choice-box';
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  box.setAttribute('aria-labelledby', 'choice-box-title');
  const art = document.createElement('div');
  art.className = 'choice-art';
  art.setAttribute('aria-hidden', 'true');
  const title = document.createElement('h2');
  title.id = 'choice-box-title';
  const text = document.createElement('p');
  text.className = 'name-ask';
  const detail = document.createElement('div');
  detail.className = 'choice-detail';
  const buttons = document.createElement('div');
  buttons.className = 'choice-buttons';
  box.append(art, title, text, detail, buttons);
  backdrop.append(box);
  root.append(backdrop);

  let open = false;
  return {
    open(request) {
      open = true;
      art.innerHTML = request.art ?? '';
      art.hidden = !request.art;
      art.setAttribute('aria-hidden', String(!request.artReadable));
      title.textContent = request.title;
      text.textContent = request.text;
      detail.innerHTML = request.detail ?? '';
      detail.hidden = !request.detail;
      buttons.replaceChildren(
        ...request.options.map((o) => {
          const b = document.createElement('button');
          b.className = `shop-btn choice-btn${o.soft ? ' shop-btn-soft' : ''}`;
          if (o.picture) {
            const pic = document.createElement('span');
            pic.className = 'portrait';
            pic.style.backgroundImage = `url('${o.picture}')`;
            b.append(pic);
          }
          b.append(o.label);
          b.addEventListener('click', () => {
            open = false;
            backdrop.hidden = true;
            o.onPick();
          });
          return b;
        }),
      );
      backdrop.hidden = false;
      (buttons.firstElementChild as HTMLElement | null)?.focus();
    },
    isOpen: () => open,
  };
}
