// The "?" how-to on the art page: every step from setting up to merging
// your art, in order, each with a picture drawn from the real sheets (so
// the pictures never go out of date) and the matching parts of
// docs/ART_GUIDE.md folded away underneath for the details.

import characters from '../data/characters.json';
import hatData from '../data/hats.json';
import { EXPRESSIONS, type Expression } from '../game/expressions';
import { TRAITS } from '../game/traits';
import { drawFace } from '../render/faces';
import { OUTLINE_OF, PALETTE, type ColourName } from '../render/palette';
import type { ManifestFile, SpriteLibrary, SpriteSheet } from '../render/sprites';
import type { Check } from './checks';
import { markdownToHtml, section } from './guide';

// What the how-to needs from the art page (src/art/main.ts).
export interface HowToKit {
  library: () => SpriteLibrary;
  manifest: () => ManifestFile;
  // An animated 48 x 48 tile, `draw` painting one moment of it.
  tile: (label: string, draw: (ctx: CanvasRenderingContext2D, t: number) => void, scale?: number) => HTMLElement;
  // Draws a pet the way the page and the game do: body, face and hat.
  drawPet: (ctx: CanvasRenderingContext2D, sheet: SpriteSheet, anim: string, t: number, face: 'auto' | Expression, hat?: SpriteSheet) => void;
  checks: (sheet: SpriteSheet) => Check[];
  overlays: Record<string, { label: string; colour: string; tip: string }>;
  // Closes the how-to and takes you to a tab, a pet and an animation.
  showMe: (to: ShowMe) => void;
}

export interface ShowMe {
  tab?: 'animations' | 'moves' | 'faces' | 'hats' | 'tweak' | 'recolour' | 'checks' | 'traits';
  sheet?: string;
  anim?: string;
  view?: 'single' | 'lineup';
}

export interface Step {
  id: string;
  title: string;
  intro: string;
  visual?: (kit: HowToKit) => HTMLElement | undefined;
  todo?: string[];
  showMe?: ShowMe & { label: string };
  // Folded-away extra details, in this file's own words.
  more?: { title: string; html: string }[];
  // Headings of docs/ART_GUIDE.md shown folded away under the step.
  guide?: string[];
}

export interface Part {
  title: string;
  steps: Step[];
}

// ------------------------------------------------------------- pictures

const PET = 'sprig'; // drawn on a face set, with idle moves and a recolour

function el(tag: string, html = '', className = '') {
  const e = document.createElement(tag);
  e.innerHTML = html;
  if (className) e.className = className;
  return e;
}

const code = (lines: string) => `<pre class="terminal"><code>${lines}</code></pre>`;
const chip = (name: string) => `<i class="chip" style="background:${PALETTE[name as ColourName] ?? '#fff'}"></i>`;

function tiles(...items: (HTMLElement | undefined)[]) {
  const row = el('div', '', 'tiles');
  row.append(...items.filter((i): i is HTMLElement => !!i));
  return row;
}

function sheetOf(kit: HowToKit, name: string) {
  return kit.library().get(name) ?? kit.library().get(PET) ?? [...kit.library().values()][0];
}

function petTile(kit: HowToKit, name: string, anim: string, label: string, face: 'auto' | Expression | 'none' = 'auto', hat?: string) {
  const sheet = sheetOf(kit, name);
  if (!sheet) return undefined;
  const body = face === 'none' ? { ...sheet, face: undefined } : sheet;
  const hatSheet = hat ? kit.library().get(hat) : undefined;
  return kit.tile(label, (ctx, t) => kit.drawPet(ctx, body, anim, t, face === 'none' ? 'auto' : face, hatSheet));
}

function faceTile(kit: HowToKit, name: string, expression: Expression, label: string) {
  const sheet = sheetOf(kit, name);
  if (!sheet?.face) return undefined;
  return kit.tile(label, (ctx, t) => drawFace(ctx, sheet, expression, 8, 12, t));
}

function arrow(text = '→') {
  return el('span', text, 'arrow');
}

// Boxes joined by arrows: the path your art takes, or how to share it.
function flow(boxes: [string, string, string?][]) {
  const box = el('div', '', 'flow');
  boxes.forEach(([title, sub, href], i) => {
    if (i) box.append(arrow());
    const b = el(href ? 'a' : 'div', `<b>${title}</b><small>${sub}</small>`, 'flow-box');
    if (href) (b as HTMLAnchorElement).href = `#how-to/${href}`;
    box.append(b);
  });
  return box;
}

// One frame blown up with the guide lines drawn over it, like the preview.
function zoom(kit: HowToKit, name: string, lines: string[], scale = 8) {
  const sheet = sheetOf(kit, name);
  if (!sheet) return undefined;
  const { frameWidth: w, frameHeight: h } = sheet;
  const canvas = document.createElement('canvas');
  canvas.width = w * scale;
  canvas.height = h * scale;
  canvas.className = 'zoom';
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      ctx.fillStyle = (x + y) % 2 ? '#e9e4ee' : '#f7f4fa';
      ctx.fillRect(x * scale, y * scale, scale, scale);
    }
  const one = document.createElement('canvas');
  one.width = w;
  one.height = h;
  const c1 = one.getContext('2d')!;
  c1.drawImage(sheet.image, 0, 0, w, h, 0, 0, w, h);
  drawFace(c1, sheet, 'content', 0, 0, 0);
  ctx.drawImage(one, 0, 0, w * scale, h * scale);
  ctx.strokeStyle = 'rgba(91, 63, 110, 0.15)';
  ctx.beginPath();
  for (let i = 0; i <= w; i++) {
    ctx.moveTo(i * scale + 0.5, 0);
    ctx.lineTo(i * scale + 0.5, h * scale);
    ctx.moveTo(0, i * scale + 0.5);
    ctx.lineTo(w * scale, i * scale + 0.5);
  }
  ctx.stroke();
  ctx.lineWidth = 2;
  const legend: string[] = [];
  const o = kit.overlays;
  if (lines.includes('top')) {
    ctx.fillStyle = 'rgba(224, 90, 122, 0.3)';
    ctx.fillRect(0, 0, w * scale, scale);
    legend.push(`<i class="chip" style="background:${o.top.colour}"></i>Row 0: always empty`);
  }
  if (lines.includes('feet')) {
    ctx.strokeStyle = o.feet.colour;
    ctx.strokeRect(1, 28 * scale, w * scale - 2, scale);
    ctx.strokeStyle = '#a68bc9';
    ctx.strokeRect(1, 29 * scale, w * scale - 2, scale);
    legend.push(`<i class="chip" style="background:${o.feet.colour}"></i>Row 28: feet`, `<i class="chip" style="background:#a68bc9"></i>Row 29: shadow`);
  }
  if (lines.includes('centre')) {
    ctx.strokeStyle = o.centre.colour;
    ctx.beginPath();
    ctx.moveTo((w / 2) * scale, 0);
    ctx.lineTo((w / 2) * scale, h * scale);
    ctx.stroke();
    legend.push(`<i class="chip" style="background:${o.centre.colour}"></i>The centre`);
  }
  if (lines.includes('head') && sheet.head) {
    const { x, y, width } = sheet.head;
    ctx.strokeStyle = o.head.colour;
    ctx.beginPath();
    ctx.moveTo((x - width / 2) * scale, y * scale);
    ctx.lineTo((x + width / 2) * scale, y * scale);
    ctx.stroke();
    ctx.strokeRect(x * scale, y * scale, scale, scale);
    legend.push(`<i class="chip" style="background:${o.head.colour}"></i>Hat point (${x}, ${y}), ${width} px of room`);
  }
  if (lines.includes('face') && sheet.face) {
    const { x, y } = sheet.face;
    ctx.strokeStyle = o.face.colour;
    ctx.strokeRect(x * scale, y * scale, scale, scale);
    legend.push(`<i class="chip" style="background:${o.face.colour}"></i>Face point (${x}, ${y})`);
  }
  const fig = el('figure', '', 'zoomed');
  fig.append(canvas, el('figcaption', legend.join('<br>')));
  return fig;
}

// A whole exported sheet, each row named, as it is in the PNG.
function sheetPicture(kit: HowToKit, name: string) {
  const sheet = sheetOf(kit, name);
  if (!sheet) return undefined;
  const s = 2;
  const label = 96;
  const { frameWidth: w, frameHeight: h } = sheet;
  const rows = Math.round(sheet.image.height / h);
  const cols = Math.round(sheet.image.width / w);
  const canvas = document.createElement('canvas');
  canvas.width = label + cols * w * s;
  canvas.height = rows * h * s;
  canvas.className = 'sheet';
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(sheet.image, label, 0, cols * w * s, rows * h * s);
  ctx.strokeStyle = 'rgba(91, 63, 110, 0.35)';
  ctx.font = '12px system-ui, sans-serif';
  ctx.textBaseline = 'middle';
  const byRow = Object.fromEntries(Object.entries(sheet.animations).map(([n, a]) => [a.row, n]));
  for (let r = 0; r < rows; r++) {
    ctx.fillStyle = '#5b3f6e';
    ctx.fillText(`${r}  ${byRow[r] ?? ''}`, 6, r * h * s + (h * s) / 2);
    for (let c = 0; c < cols; c++) ctx.strokeRect(label + c * w * s + 0.5, r * h * s + 0.5, w * s - 1, h * s - 1);
  }
  const fig = el('figure', '', 'sheet-figure');
  fig.append(canvas, el('figcaption', `<code>${name}.png</code>: ${cols} frames across, one row per animation. The face isn't on it: the game adds it.`));
  return fig;
}

function palettePicture() {
  const box = el('div', '', 'palette');
  for (const [name, hex] of Object.entries(PALETTE)) {
    const outline = OUTLINE_OF[name as ColourName];
    box.append(
      el(
        'div',
        `<i style="background:${hex}"></i><b>${name}</b><small>${hex}</small>${outline ? `<small>outline ${chip(outline)}${outline}</small>` : '<small>outline / lines</small>'}`,
        'swatch',
      ),
    );
  }
  return box;
}

function outlinePicture(kit: HowToKit) {
  const box = el('div', '', 'pair');
  const groups = new Map<string, string[]>();
  for (const [body, outline] of Object.entries(OUTLINE_OF)) groups.set(outline!, [...(groups.get(outline!) ?? []), body]);
  const list = el('ul', [...groups].map(([outline, bodies]) => `<li>${bodies.map(chip).join('')} ${bodies.join(', ')} <span class="arrow">→</span> ${chip(outline)} <b>${outline}</b></li>`).join('') + `<li>${chip('ink')} <b>ink</b>: lines inside the pet, and the face</li>`, 'outlines');
  const z = zoom(kit, PET, []);
  if (z) box.append(z);
  box.append(list);
  return box;
}

function layersPicture(kit: HowToKit) {
  return tiles(
    petTile(kit, PET, 'idle', '<b>pet</b> layer: the body', 'none'),
    el('span', '+', 'arrow'),
    faceTile(kit, PET, 'content', '<b>face</b> layer: just to look at'),
    el('span', '=', 'arrow'),
    petTile(kit, PET, 'idle', 'what you see'),
  );
}

function hatsPicture(kit: HowToKit) {
  const hat = hatData.hats[0]?.sheet;
  const seen = new Set<string>();
  const items: (HTMLElement | undefined)[] = [];
  for (const c of characters.characters) {
    const sheet = kit.library().get(c.sheet);
    const key = JSON.stringify(sheet?.head);
    if (!sheet?.head || seen.has(key) || items.length >= 6) continue;
    seen.add(key);
    items.push(petTile(kit, c.sheet, 'idle', c.name, 'auto', hat));
  }
  return tiles(...items);
}

function traitsPicture() {
  const box = el('div', '', 'traits');
  for (const t of TRAITS)
    box.append(el('div', `<b>${t.name}</b>${t.special ? ' <small class="badge">character only</small>' : ''}<br><small>${t.about}</small>`, 'trait'));
  return box;
}

function checksPicture(kit: HowToKit) {
  const sheet = sheetOf(kit, PET);
  if (!sheet) return undefined;
  const ul = el('ul', '', 'checks');
  for (const c of kit.checks(sheet))
    ul.append(el('li', `<span>${c.ok ? '✓' : c.warn ? '?' : '⚠'}</span> ${c.label}`, c.ok ? 'ok' : c.warn ? 'hint' : 'bad'));
  const box = el('div');
  box.append(el('p', `What the Checks tab says about <b>${sheet.name}</b> right now:`, 'muted'), ul);
  return box;
}

function recolourPicture(kit: HowToKit) {
  const [name, entry] = Object.entries(kit.manifest().sheets).find(([, s]) => s.from === PET && s.recolour) ?? [];
  const variant = name && kit.library().has(name) ? name : undefined;
  const box = el('div');
  box.append(tiles(petTile(kit, PET, 'idle', `<b>${PET}</b>`), arrow(), variant ? petTile(kit, variant, 'idle', `<b>${variant}</b>`) : undefined));
  if (entry?.recolour)
    box.append(el('p', 'Swaps: ' + Object.entries(entry.recolour).map(([a, b]) => `${chip(a)}${a} → ${chip(b)}${b}`).join(' · '), 'muted'));
  return box;
}

function stagesPicture(kit: HowToKit) {
  const theme = Object.keys(characters.themes)[0];
  const adults = characters.characters.filter((c) => c.theme === theme).sort((a, b) => a.stars - b.stars);
  return tiles(
    petTile(kit, characters.stages.egg, 'idle', 'egg'),
    arrow(),
    petTile(kit, characters.stages.baby, 'idle', 'baby'),
    arrow(),
    petTile(kit, characters.stages.teen, 'idle', 'teen'),
    arrow(),
    ...adults.map((c) => petTile(kit, c.sheet, 'idle', `${c.name} <span class="stars">${'★'.repeat(c.stars)}</span>`)),
  );
}

function pagePicture(kit: HowToKit) {
  const box = el(
    'div',
    `<div class="mock">
      <div class="mock-top">Size · Background · <b>guide lines</b> · <b>Reload art</b> · <b>?</b></div>
      <div class="mock-cols">
        <div><b>1. Pick a pet</b><small>every stage, character and variant</small><b>Try a PNG</b><small>drop a sheet to see it here only</small></div>
        <div><b>2. The preview</b><small>the pet as the game draws it, with guide lines</small></div>
        <div><b>3. Tabs</b><small>Animations · Faces · Hats · Tweak · Recolour · Checks · Traits</small><b>From the art guide</b><small>the rules for that tab</small></div>
      </div>
    </div>`,
  );
  const legend = el('ul', Object.values(kit.overlays).map((o) => `<li><i class="chip" style="background:${o.colour}"></i><b>${o.label}</b>: ${o.tip}</li>`).join(''), 'legend');
  box.append(legend);
  return box;
}

function animationsPicture(kit: HowToKit) {
  const sheet = sheetOf(kit, PET);
  if (!sheet) return undefined;
  const box = el('div');
  box.append(
    tiles(...Object.entries(sheet.animations).filter(([n]) => !n.startsWith('idle-')).sort((a, b) => a[1].row - b[1].row).map(([n, a]) => petTile(kit, PET, n, `row ${a.row}: <b>${n}</b>`))),
  );
  const pic = sheetPicture(kit, PET);
  if (pic) box.append(pic);
  return box;
}

function idleMovesPicture(kit: HowToKit) {
  const sheet = sheetOf(kit, PET);
  if (!sheet) return undefined;
  return tiles(
    petTile(kit, PET, 'idle', '<b>idle</b> (its loop)'),
    ...(sheet.idleMoves ?? []).map((m) => petTile(kit, PET, m, `<b>${m}</b> row ${sheet.animations[m]?.row}`)),
  );
}

function facesPicture(kit: HowToKit) {
  const box = el('div');
  box.append(layersPicture(kit));
  box.append(el('p', 'The same body with every expression from its face set:', 'muted'));
  box.append(tiles(...EXPRESSIONS.map((e) => petTile(kit, PET, 'idle', e, e))));
  return box;
}

function hatPointPicture(kit: HowToKit) {
  const box = el('div', '', 'pair');
  const z = zoom(kit, PET, ['head', 'face']);
  if (z) box.append(z);
  box.append(tiles(petTile(kit, PET, 'idle', 'with a hat', 'auto', hatData.hats[0]?.sheet)));
  return box;
}

function hatSheetsPicture(kit: HowToKit) {
  const box = el('div', '', 'tiles');
  for (const h of hatData.hats) {
    const sheet = kit.library().get(h.sheet);
    if (!sheet) continue;
    const canvas = document.createElement('canvas');
    canvas.width = sheet.image.width * 4;
    canvas.height = sheet.image.height * 4;
    canvas.className = 'strip';
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(sheet.image, 0, 0, canvas.width, canvas.height);
    const f = el('figure', '', 'tile');
    f.append(canvas, el('span', `${h.name}<br><small>${(sheet.hatWidths ?? []).map((w) => `${w} px`).join(' · ')}</small>`));
    box.append(f);
  }
  return box;
}

const terminal = (lines: string) => () => el('div', code(lines));

// --------------------------------------------------------------- the steps

export const PARTS: Part[] = [
  {
    title: 'Getting started',
    steps: [
      {
        id: 'big-picture',
        title: 'The big picture',
        intro:
          'You draw in Aseprite, export a PNG, list it in two small files, check it here and share it. You never have to change any code. Click a box to jump to its step.',
        visual: () =>
          flow([
            ['Draw', 'art/…/<i>name</i>.aseprite', 'template'],
            ['Export', 'npm run export-art', 'export'],
            ['PNG', 'public/sprites/…/<i>name</i>.png', 'export'],
            ['List it', 'manifest.json + characters.json', 'list'],
            ['Check', 'this page + npm test', 'check'],
            ['Share', 'commit, pull request, merge', 'share'],
          ]),
        guide: ['Where everything lives'],
      },
      {
        id: 'setup',
        title: 'Set up your computer (once)',
        intro: 'Install three programs, download the project, and start the art page.',
        todo: [
          'Install <a href="https://nodejs.org" target="_blank">Node.js</a> 22.18 or newer, <a href="https://www.aseprite.org" target="_blank">Aseprite</a>, and <a href="https://git-scm.com" target="_blank">Git</a> (or GitHub Desktop).',
          'Open a terminal in the folder where you keep projects, and download it: <code>git clone https://github.com/claeryc/pet.git</code>, then <code>cd pet</code>.',
          'Run <code>npm install</code> to download the tools (first time only).',
        ],
        visual: terminal('git clone https://github.com/claeryc/pet.git\ncd pet\nnpm install'),
        more: [
          {
            title: 'Aseprite is installed somewhere unusual',
            html: '<p><code>npm run export-art</code> looks in the usual install folders, Steam included. If it says it can\'t start Aseprite, tell it where it is:</p>' +
              code('# Mac or Linux\nASEPRITE="/path/to/aseprite" npm run export-art\n\n# Windows PowerShell\n$env:ASEPRITE="D:\\Tools\\Aseprite.exe"; npm run export-art'),
          },
          {
            title: 'Which Node.js do I need?',
            html: '<p>The game and this page run on Node.js 20, but <code>npm run export-art</code> and <code>npm run sprites</code> need 22.18 or newer, so install that one. <code>node --version</code> tells you what you have.</p>',
          },
        ],
      },
      {
        id: 'each-time',
        title: 'Each time you sit down to draw',
        intro: 'Get the latest version first, so you draw on top of everyone else\'s changes and the rules this page checks are up to date.',
        todo: [
          '<code>git pull</code> to get the latest art and rules.',
          '<code>npm install</code> if the pull changed <code>package.json</code> (it\'s harmless to run anyway).',
          '<code>npm run dev</code>, then open the link it prints with <code>/art.html</code> on the end, usually <a href="http://localhost:5173/art.html">localhost:5173/art.html</a>.',
          'Leave it running while you draw. After each export, click <b>Reload art</b>.',
        ],
        visual: terminal('git pull\nnpm install\nnpm run dev      # then open http://localhost:5173/art.html'),
        more: [
          {
            title: 'Working on your own branch',
            html: '<p>If you started a branch for your art (see <a href="#how-to/share">Share it</a>), switch back to it with <code>git checkout <i>your-branch</i></code> and bring in the latest main with <code>git pull origin main</code>.</p>',
          },
        ],
      },
      {
        id: 'page',
        title: 'Find your way around this page',
        intro:
          'This page draws every sheet exactly the way the game does. Pick a pet on the left, look at it in the middle, and use the tabs on the right. Each tab has the matching part of the art guide folded at the bottom.',
        visual: pagePicture,
        todo: [
          'Pick a pet on the left. Groups fold up; the one with your pet stays open.',
          'Turn guide lines on and off at the top. Switch to <b>Lineup</b> to see every character side by side, filtered by theme, rarity, and with or without colour variants.',
          'Drop an exported PNG anywhere on the page to try it without changing anything (<b>Try a PNG</b>).',
          'Click <b>Reload art</b> after exporting.',
        ],
        showMe: { label: 'Show me the Lineup', view: 'lineup' },
        guide: ['The art preview page'],
      },
      {
        id: 'characters',
        title: 'How pets grow into characters',
        intro:
          'Every pet is the same egg, baby and teen. The teen grows into a character, which has a theme and 1 to 3 stars. Better care makes a rarer character more likely. A pet also has a trait, and a character can have colour variants.',
        visual: stagesPicture,
        more: [
          {
            title: 'Every theme and character',
            html:
              '<table><thead><tr><th>Theme</th><th>★</th><th>★★</th><th>★★★</th></tr></thead><tbody>' +
              Object.entries(characters.themes)
                .map(
                  ([id, name]) =>
                    `<tr><td>${name}${characters.laterPacks.includes(id) ? ' <small>(later pack)</small>' : ''}</td>${[1, 2, 3]
                      .map((s) => `<td>${characters.characters.filter((c) => c.theme === id && c.stars === s).map((c) => c.name).join(', ')}</td>`)
                      .join('')}</tr>`,
                )
                .join('') +
              '</tbody></table>',
          },
        ],
        guide: ['How characters work'],
      },
    ],
  },
  {
    title: 'Draw a character',
    steps: [
      {
        id: 'template',
        title: 'Start from the template',
        intro:
          'The template already has the right size, the palette, the guide lines, all 28 frames and the seven animation tags. Copy it and you only have to draw.',
        todo: [
          'Copy <code>art/_template.aseprite</code> into the theme\'s folder and rename it, for example <code>art/characters/cave/stalagbun.aseprite</code>. Use lower case and dashes.',
          'Draw on the <b>pet</b> layer. The <b>guides</b> layer shows the feet line, the shadow row and the centre, and is never exported.',
          'The <b>face</b> layer has the content face from the blob set on every frame, so you see the whole pet while you draw. It isn\'t exported either, so draw the body without eyes, mouth or cheeks. If your face point ends up somewhere else, move the face on this layer to match.',
          'Save often (Ctrl+S / Cmd+S). The <code>.aseprite</code> file is your master copy; the PNG is made from it.',
        ],
        visual: layersPicture,
        more: [
          {
            title: 'Redrawing a character that exists',
            html: '<p>Open its file in <code>art/</code> instead of the template, paint on the <b>pet</b> layer, and export over its PNG. Nothing else changes, and existing pets get the new look. The starter characters only have their idle pose properly drawn: the other rows are simple placeholder motion to draw over. When you redraw a swaying row, take its <code>headShifts</code> out of <code>manifest.json</code> (or fix the numbers).</p>',
          },
        ],
        guide: ['Editing an existing character'],
      },
      {
        id: 'palette',
        title: 'Use only the palette colours',
        intro:
          'Every piece of art uses the same 20 colours, so everything looks like it belongs together, and the recolours and checks can find colours by their exact value.',
        visual: () => palettePicture(),
        todo: [
          'Draw with the <b>Pencil</b> (B) with <b>Pixel-perfect</b> ticked. Never use blur, soft brushes or anti-aliasing.',
          'To snap stray colours, use Sprite → Color Mode → Indexed with the palette loaded.',
          'Older files (stages, hats, Cave, badges) only have the first 16 colours: load <code>docs/palette.gpl</code> in them first.',
          '<b>Never change a colour\'s value.</b> For a new shade, add a new colour at the end (see the details).',
        ],
        guide: ['The palette'],
      },
      {
        id: 'outlines',
        title: 'Outlines and lines',
        intro:
          'The outer edge takes the dark colour of the part it touches, so the face (in ink) is always the darkest thing on the pet. Lines inside the pet, like seams and folds, stay ink.',
        visual: outlinePicture,
        todo: [
          'Outline each stretch of the edge in the dark partner of the colour next to it (the list above).',
          'Draw lines inside the pet, and the face, in <b>ink</b>.',
          'The <b>Checks</b> tab marks spots that break the rule with <b>?</b>. That\'s a hint, not an error: a part can bend the rule on purpose.',
        ],
        showMe: { label: 'Show me the Checks tab', tab: 'checks' },
      },
      {
        id: 'frame',
        title: 'Size, feet and the top row',
        intro:
          'Every frame is 32 × 32 pixels. The feet stand on row 28 with a 1-pixel shadow under them, the pet is centred, and the top row stays empty so hats can follow the head.',
        visual: (kit) => zoom(kit, PET, ['top', 'feet', 'centre']),
        todo: [
          'Keep the feet on the pink line and the shadow on the purple row.',
          'Keep the pet centred on the blue line.',
          'Keep row 0 empty in every frame, even at the top of a jump.',
          'Keep the same silhouette across frames: only small changes, like a hop or a blink.',
          'Original designs only. Don\'t copy characters from other games.',
        ],
        guide: ['Consistency rules (especially for AI-generated art)'],
      },
      {
        id: 'animations',
        title: 'Animations: one row each, named by tags',
        intro:
          'Each row of the sheet is one animation with 4 frames, left to right. In Aseprite each animation is a tag, and the tag\'s <b>name</b> decides its row, not where it is on the timeline.',
        visual: animationsPicture,
        todo: [
          'Keep the template\'s tags: <code>idle</code>, <code>sad</code>, <code>sleep</code>, <code>sick</code>, <code>eat</code>, <code>happy</code>, <code>cheerful</code>.',
          'You can start with just <code>idle</code>: a missing animation plays idle instead.',
          'A tag with a typo (like <code>hapy</code>) stops the export with a message saying so.',
        ],
        showMe: { label: 'Show me the Animations tab', tab: 'animations', sheet: PET },
        more: [
          {
            title: 'A longer or faster animation for one sheet',
            html: '<p>List only that animation in the sheet\'s entry in <code>manifest.json</code>, and every other row stays as shared:</p>' +
              code('"animations": { "happy": { "row": 5, "frames": 6, "frameMs": 120 } }'),
          },
        ],
        guide: ['What a sprite sheet looks like'],
      },
      {
        id: 'idle-moves',
        title: 'Extra idle moves',
        intro:
          'Now and then an idle or cheerful pet plays an extra move, like a look around or a stretch, once, then goes back to its loop. Moves come in shared <b>idle sets</b>, drawn on rows after the usual seven.',
        visual: idleMovesPicture,
        todo: [
          'Give the sheet a set in <code>manifest.json</code>: <code>"idleSet": "curious"</code>, or a list to mix sets.',
          'A pet gets whole sets, so keep sets small (even one move each) to give each pet its own mix.',
          'The <b>Idle moves</b> tab lists every move with its row, its set and the pets that get it, and the next free row for a new one.',
          'In Aseprite, add a tag per move with the move\'s name, like <code>idle-look</code>. The export puts it on its row.',
          'Hats follow the head sideways in a move. If one slips, set <code>headShifts</code> by hand (see the details).',
        ],
        showMe: { label: 'Show me every idle move', tab: 'moves', sheet: PET },
        guide: ['Extra idle moves (idle sets)'],
      },
      {
        id: 'faces',
        title: 'Faces come from a face set',
        intro:
          'The bodies are drawn without a face. The game draws the face on top from a shared face set, and moves it with the head. So a new expression is drawn once, not once per character.',
        visual: facesPicture,
        todo: [
          'Draw the body on the <b>pet</b> layer without eyes, mouth or cheeks.',
          'Most characters use the <code>blob</code> set; Starhoot uses <code>owl</code>. A sheet can pick its own set with <code>"faces": "owl"</code>.',
          'A set that leaves an expression empty uses the blob face for it, so a new set can start small.',
          'If the face sits a pixel too high or low on your character, move its face point on the <b>Tweak</b> tab.',
        ],
        showMe: { label: 'Show me the Faces tab', tab: 'faces', sheet: PET },
        more: [
          {
            title: 'Drawing a new face set',
            html: '<ol><li>Copy <code>art/faces/blob.aseprite</code> to a new name, for example <code>art/faces/star.aseprite</code>, and redraw the faces around (16, 18), the bottom of the eyes.</li><li>Export it and list it under <code>"faceSets"</code> in <code>manifest.json</code>.</li><li>Point the shape (or one sheet) at it with <code>"faces": "star"</code>, and give it a face point.</li><li>A new expression always goes at the <b>end</b> of the list in <code>src/game/expression-order.ts</code>.</li></ol>',
          },
        ],
        guide: ['Faces and expressions'],
      },
      {
        id: 'hats',
        title: 'Hats sit on a body shape',
        intro:
          'Any hat fits any character. Each sheet names a body <b>shape</b>, and the shape says where a hat sits and how wide it may be. Draw on an existing shape and your character gets every hat with no setup.',
        visual: hatsPicture,
        todo: [
          'Pick the shape your body matches (same size, same top where a hat rests) from the table in the details.',
          'A body unlike any other gets a new shape: add it under <code>"shapes"</code> in <code>manifest.json</code>.',
          'Check every hat on it on the <b>Hats</b> tab.',
        ],
        showMe: { label: 'Show me the Hats tab', tab: 'hats', sheet: PET },
        guide: ['Hats'],
      },
      {
        id: 'tweak',
        title: 'Fine-tune the hat and face points',
        intro:
          'The hat point is where the bottom middle of a hat sits, with how many pixels of room it has. The face point is where the bottom of the eyes goes. Move them on the <b>Tweak</b> tab and copy the result.',
        visual: hatPointPicture,
        todo: [
          'Open <b>Tweak</b>. Changing the shape moves the point on every pet of that shape.',
          'Switch to <b>Only <i>this sheet</i></b> when just one character sits a little differently.',
          'A single hat that looks wrong on a shape can get its own nudge.',
          'Copy the JSON it shows into <code>manifest.json</code>.',
        ],
        showMe: { label: 'Show me the Tweak tab', tab: 'tweak', sheet: PET },
        guide: ['Body shapes'],
      },
    ],
  },
  {
    title: 'Put it in the game',
    steps: [
      {
        id: 'list',
        title: 'List the sheet and the character',
        intro:
          'Two small files tell the game about your art: <code>manifest.json</code> lists the sheet and its shape, and <code>characters.json</code> makes it a character. Do this before exporting, so the export knows your rows.',
        todo: [
          'In <code>public/sprites/manifest.json</code>, under <code>"sheets"</code>, add a line for the sheet with its file and shape.',
          'In <code>src/data/characters.json</code>, add the character with its theme, stars and name.',
          'Mind the commas: each line but the last in a list ends with one.',
          'Edit them in an editor like VS Code: it suggests keys, explains them when you hover, and underlines a misspelt key, using the schemas in <code>schemas/</code>. <code>npm test</code> checks them against the schemas too.',
        ],
        visual: () =>
          el(
            'div',
            '<p class="muted"><code>public/sprites/manifest.json</code></p>' +
              code('"stalagbun": { "file": "characters/cave/stalagbun.png", "shape": "wide-loaf" },') +
              '<p class="muted"><code>src/data/characters.json</code></p>' +
              code('{ "id": "stalagbun", "theme": "cave", "stars": 2, "name": "Stalagbun", "sheet": "stalagbun" },'),
          ),
        more: [
          {
            title: 'A new theme, later packs and shelved art',
            html: '<p>A new theme is one more line under <code>"themes"</code> in <code>characters.json</code>. A theme listed under <code>"laterPacks"</code> isn\'t out yet: no new pet grows into it. Retired art lives in <code>art/shelved/</code>, which the export skips.</p>',
          },
        ],
        guide: ['Making a new character'],
      },
      {
        id: 'export',
        title: 'Save and export',
        intro:
          'Exporting turns your <code>.aseprite</code> file into the PNG the game loads, each tag on its row, without the guides and face layers.',
        todo: [
          'Save your file in Aseprite.',
          'In a second terminal (leave <code>npm run dev</code> running), run <code>npm run export-art</code>. Add a word to export only some files: <code>npm run export-art -- stalagbun</code>.',
          'Read what it prints: each file it exported, and a warning if a sheet changed size (usually a missing tag or frame).',
          'Click <b>Reload art</b> on this page.',
        ],
        visual: terminal('npm run export-art -- stalagbun\n  characters/cave/stalagbun.aseprite -> public/sprites/characters/cave/stalagbun.png\nExported 1 sheet.'),
        guide: ['Exporting a sheet from Aseprite'],
      },
      {
        id: 'check',
        title: 'Check it',
        intro:
          'The <b>Checks</b> tab checks the rules a computer can: palette colours only, no soft edges, the sheet\'s size, an empty top row, feet on row 28 and centred, and the outline hint. <code>npm test</code> runs the same checks on every sheet and face set.',
        visual: checksPicture,
        todo: [
          'Open <b>Checks</b> with your pet picked and fix anything marked ⚠.',
          'Look at every animation, face and hat on its tabs.',
          'Run <code>npm test</code> before you share. It also checks your tags, the palette and the traits.',
        ],
        showMe: { label: 'Show me the Checks tab', tab: 'checks' },
      },
      {
        id: 'in-game',
        title: 'Try it in the game',
        intro: 'With <code>npm run dev</code> running, open the game itself (the link without <code>/art.html</code>) and grow a pet into your character.',
        todo: [
          'Open <b>Settings → Testing tools</b>.',
          'Set the Care Score (10, 60 or 90) before growing up: higher makes rarer characters more likely.',
          'Click <b>Grow up now</b> until it\'s an adult. Start over to roll a new pet.',
          '<b>+100 gold</b> helps for trying hats from the Shop.',
        ],
        guide: ['Getting your art into the game'],
      },
    ],
  },
  {
    title: 'Variants, traits and extras',
    steps: [
      {
        id: 'recolour',
        title: 'Colour variants with the Recolour tab',
        intro:
          'A recolour is the same drawing with some palette colours swapped. It needs no PNG of its own: the game repaints it when it loads, every row included.',
        visual: recolourPicture,
        todo: [
          'Pick the pet and open <b>Recolour</b>.',
          'Pick a replacement for each colour and watch it on every animation. When a swap changes which outline a part needs, the outline swaps too.',
          'Name it, then copy the two lines it makes into <code>manifest.json</code> and <code>characters.json</code>. <code>chance</code> is the percent of these characters that get it.',
          'Your swaps stay through a reload, so you can come back to them.',
          '<code>npm run export-art -- --previews</code> writes a big side-by-side to <code>art/previews/</code>, no Aseprite needed.',
        ],
        showMe: { label: 'Show me the Recolour tab', tab: 'recolour', sheet: PET },
        guide: ['Adding a colour variant'],
      },
      {
        id: 'drawn-variant',
        title: 'A drawn variant',
        intro: 'When a variant needs more than a colour swap (a new pattern, a different highlight), draw it as its own sheet.',
        todo: [
          'Save a copy of the character\'s file, for example <code>geodon-frost.aseprite</code>, and recolour it (Edit → Replace Color helps).',
          'Export it, and list it in <code>manifest.json</code> with the same <code>shape</code>.',
          'Add it to the character\'s <code>variants</code> list in <code>characters.json</code> with a <code>chance</code>.',
          'A recolour that is nearly right can start a drawn one: open its preview from <code>art/previews/</code> and touch it up.',
        ],
        guide: ['A drawn variant'],
      },
      {
        id: 'traits',
        title: 'Traits',
        intro:
          'A trait only changes how often a pet fidgets and which faces it pulls, never its stats. A character can list the only traits its pets can have, and a <b>character-only</b> trait goes only to characters that list it.',
        visual: () => traitsPicture(),
        todo: [
          'Try each trait with a mood on the <b>Traits</b> tab to see which face it pulls.',
          'To limit a character, add <code>"traits": ["grumpy", "sleepy"]</code> to it in <code>characters.json</code>.',
          'The traits and their numbers are in <code>src/data/traits.json</code>. <code>npm test</code> checks every listed trait exists.',
        ],
        showMe: { label: 'Show me the Traits tab', tab: 'traits', sheet: PET },
        more: [
          {
            title: 'What the numbers in traits.json do',
            html: '<ul><li><code>idleEvery</code>: how often it plays idle moves, times the usual gap (0.5 is twice as often).</li><li><code>happyMs</code>, <code>surprisedMs</code>: how long a face lasts, times the usual.</li><li><code>poutAfter</code>: how soon it pouts when left alone.</li><li><code>hungryBelow</code>, <code>sleepyBelow</code>, <code>sadBelow</code>: added to the stat a face shows below, so 20 shows it sooner.</li><li><code>lovesEverySnack</code>, <code>grumpyWhenWoken</code>: on or off.</li><li><code>special</code>: character only.</li></ul>',
          },
        ],
      },
      {
        id: 'new-hat',
        title: 'Draw a new hat',
        intro: 'A hat is drawn once, in a few sizes, and the game picks the widest one that fits each shape.',
        visual: hatSheetsPicture,
        todo: [
          'Copy a file in <code>art/hats/</code>. It\'s 16 × 16 with a <code>small</code> and a <code>large</code> frame.',
          'Draw with the bottom edge on the last row, centred on column 8, with a dark outline.',
          'Export (hats come out as one strip), then add it to <code>manifest.json</code> and to <code>src/data/hats.json</code> with a name and a price.',
          'Pick it on the <b>Hats</b> tab to see it on one pet of every shape.',
        ],
        showMe: { label: 'Show me the Hats tab', tab: 'hats' },
        guide: ['Drawing a hat'],
      },
      {
        id: 'badges',
        title: 'Achievement badges and placeholders',
        intro: 'The bronze, silver and gold badges live in one small file, and the placeholder art can be made again when a file is missing.',
        todo: [
          'Badges: draw over the three frames of <code>art/badges/tiers.aseprite</code> and export.',
          'Placeholders: <code>npm run sprites</code> makes any missing PNG or <code>.aseprite</code> file, and never overwrites yours.',
        ],
        guide: ['Achievement badges', 'Regenerating the placeholders'],
      },
    ],
  },
  {
    title: 'Share it',
    steps: [
      {
        id: 'share',
        title: 'Save your work to GitHub and merge it',
        intro:
          'Put your art on a branch, open a pull request, and merge it into main once it looks right and <code>npm test</code> passes. Commit both the <code>.aseprite</code> file and its PNG.',
        visual: () =>
          flow([
            ['Branch', 'git checkout -b art/stalagbun'],
            ['Commit', 'git add art public src/data'],
            ['Push', 'git push -u origin art/stalagbun'],
            ['Pull request', 'on github.com'],
            ['Merge', 'then everyone git pulls'],
          ]),
        todo: [
          '<code>git checkout -b art/stalagbun</code> to start a branch for your art.',
          '<code>git add art public src/data</code>, then <code>git commit -m "Add Stalagbun"</code>.',
          '<code>git push -u origin art/stalagbun</code>, and open the link it prints to make a pull request.',
          'Run <code>npm test</code> and look at your art here once more, then click <b>Merge</b> on GitHub.',
          'Back on your computer: <code>git checkout main</code> and <code>git pull</code>.',
        ],
        more: [
          {
            title: 'Without the terminal',
            html: '<p>On the GitHub website, open the right folder, choose <b>Add file → Upload files</b>, and commit to a new branch, which offers to open a pull request. Edit <code>manifest.json</code> and <code>characters.json</code> there with the pencil icon. Or attach your PNG or <code>.aseprite</code> file in the project thread, say its theme and rarity, and ask Claude to add it.</p>',
          },
          {
            title: 'Git says there\'s a conflict',
            html: '<p>Someone else changed the same lines (often in <code>manifest.json</code> or <code>characters.json</code>). Open the file, keep both lines between the <code>&lt;&lt;&lt;&lt;&lt;&lt;&lt;</code> and <code>&gt;&gt;&gt;&gt;&gt;&gt;&gt;</code> markers, delete the markers, then <code>git add</code> and <code>git commit</code>. A PNG or <code>.aseprite</code> conflict can\'t be merged line by line: pick whose picture to keep and export again. Asking Claude to sort it out works too.</p>',
          },
        ],
      },
      {
        id: 'cheat-sheet',
        title: 'Cheat sheet',
        intro: 'Every command and file in one place.',
        visual: () =>
          el(
            'div',
            '<table><tbody>' +
              [
                ['<code>git pull</code>', 'get the latest'],
                ['<code>npm install</code>', 'download the tools'],
                ['<code>npm run dev</code>', 'start the game and this page'],
                ['<code>npm run export-art</code>', 'export every Aseprite file'],
                ['<code>npm run export-art -- <i>word</i></code>', 'export only files with that word in their path'],
                ['<code>npm run export-art -- --previews</code>', 'recolour previews only, no Aseprite needed'],
                ['<code>npm test</code>', 'run every check'],
                ['<code>npm run sprites</code>', 'make missing placeholder art'],
                ['<code>art/</code>', 'your Aseprite files'],
                ['<code>public/sprites/</code>', 'the exported PNGs and manifest.json'],
                ['<code>src/data/characters.json</code>', 'characters, themes and variants'],
                ['<code>src/data/hats.json</code>', 'hats, names and prices'],
                ['<code>src/data/traits.json</code>', 'traits and their numbers'],
                ['<code>src/render/palette.ts</code>, <code>docs/palette.gpl</code>', 'the palette'],
                ['<code>schemas/</code>', 'what each JSON file may hold (editor hints, checked by npm test)'],
              ]
                .map(([a, b]) => `<tr><td>${a}</td><td>${b}</td></tr>`)
                .join('') +
              '</tbody></table>',
          ),
        guide: ['Where everything lives'],
      },
    ],
  },
];

export const STEPS: Step[] = PARTS.flatMap((p) => p.steps);

// ------------------------------------------------------------- the dialog

function renderStep(kit: HowToKit, step: Step, n: number): HTMLElement {
  const sec = el('section', '', 'howto-step');
  sec.id = `how-to-${step.id}`;
  sec.append(el('h2', `<span class="num">${n}</span>${step.title}`));
  sec.append(el('p', step.intro, 'intro'));
  const visual = step.visual?.(kit);
  if (visual) {
    visual.classList.add('visual');
    sec.append(visual);
  }
  if (step.todo) sec.append(el('ol', step.todo.map((t) => `<li>${t}</li>`).join(''), 'todo'));
  if (step.showMe) {
    const { label, ...to } = step.showMe;
    const b = el('button', `${label} →`, 'show-me');
    b.onclick = () => kit.showMe(to);
    sec.append(b);
  }
  for (const m of step.more ?? []) {
    const d = el('details', `<summary>${m.title}</summary>`, 'more');
    d.append(el('div', m.html));
    sec.append(d);
  }
  if (step.guide?.length) {
    const d = el('details', `<summary>The full details from the art guide</summary>`, 'more guide') as HTMLDetailsElement;
    // Filled in when opened, as some sections are long.
    d.ontoggle = () => {
      if (d.open && d.children.length < 2) d.append(el('div', step.guide!.map((t) => markdownToHtml(section(t))).join('')));
    };
    sec.append(d);
  }
  return sec;
}

export function setupHowTo(kit: HowToKit, button: HTMLElement) {
  const dialog = el('div', '', 'howto');
  dialog.hidden = true;
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-label', 'How to make pet art');
  document.body.append(dialog);
  let observer: IntersectionObserver | undefined;

  const close = () => {
    dialog.hidden = true;
    dialog.innerHTML = ''; // stops its tiles animating
    observer?.disconnect();
    document.body.classList.remove('howto-open');
    if (location.hash.startsWith('#how-to')) history.replaceState(null, '', location.pathname + location.search);
  };

  const open = (stepId?: string) => {
    if (dialog.hidden) {
      dialog.hidden = false;
      document.body.classList.add('howto-open');
      dialog.innerHTML = '';
      const box = el('div', '', 'howto-box');
      const head = el('div', '<h1>How to make pet art</h1><p>Every step from setting up to merging. Pictures are drawn from the real sheets. Tap a heading with ▸ for the details.</p>', 'howto-head');
      const x = el('button', '✕', 'howto-close');
      x.title = 'Close (Esc)';
      x.onclick = close;
      head.append(x);
      // "Show me" closes the how-to first.
      const steps: HowToKit = { ...kit, showMe: (to) => (close(), kit.showMe(to)) };
      const nav = el('nav', '', 'howto-nav');
      const body = el('div', '', 'howto-body');
      let n = 0;
      for (const part of PARTS) {
        nav.append(el('h3', part.title));
        body.append(el('h2', part.title, 'howto-part'));
        for (const step of part.steps) {
          n++;
          const a = el('a', `<span class="num">${n}</span>${step.title}`) as HTMLAnchorElement;
          a.href = `#how-to/${step.id}`;
          a.dataset.step = step.id;
          nav.append(a);
          body.append(renderStep(steps, step, n));
        }
      }
      box.append(head, nav, body);
      dialog.append(box);
      // Light up the step being read in the list.
      observer = new IntersectionObserver(
        (entries) => {
          for (const e of entries)
            if (e.isIntersecting) {
              const id = e.target.id.replace('how-to-', '');
              nav.querySelectorAll('a').forEach((a) => {
                a.classList.toggle('on', a.dataset.step === id);
                // Keep it in view in the list, which scrolls sideways on a phone.
                if (a.dataset.step === id) nav.scrollTo({ left: a.offsetLeft - 12, top: a.offsetTop - nav.clientHeight / 2 });
              });
            }
        },
        { root: body, rootMargin: '0px 0px -70% 0px' },
      );
      body.querySelectorAll('.howto-step').forEach((s) => observer!.observe(s));
    }
    if (stepId) dialog.querySelector(`#how-to-${stepId}`)?.scrollIntoView({ block: 'start' });
  };

  const fromHash = () => {
    const m = location.hash.match(/^#how-to(?:\/(.+))?$/);
    if (m) open(m[1]);
  };
  window.addEventListener('hashchange', fromHash);
  button.onclick = () => {
    history.replaceState(null, '', '#how-to');
    open();
  };
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !dialog.hidden) close();
    const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLTextAreaElement;
    if (e.key === '?' && !typing && dialog.hidden) button.click();
  });
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) close();
  });
  fromHash();
  return { open, close };
}
