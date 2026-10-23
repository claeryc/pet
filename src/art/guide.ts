// Shows parts of docs/ART_GUIDE.md next to the tool they're about, so the
// page and the guide never disagree. Only the bits of Markdown the guide
// uses are understood: headings, paragraphs, lists, tables, code blocks,
// **bold**, `code`, links and images.

import guide from '../../docs/ART_GUIDE.md?raw';

// The text under a heading (e.g. "## Hats"), up to the next heading of the
// same level or higher, with its subheadings.
export function section(title: string): string {
  const lines = guide.split('\n');
  const start = lines.findIndex((l) => /^#+ /.test(l) && l.replace(/^#+ /, '') === title);
  if (start < 0) return '';
  const level = lines[start].indexOf(' ');
  let end = start + 1;
  while (end < lines.length && !(lines[end].startsWith('#') && lines[end].indexOf(' ') <= level && /^#+ /.test(lines[end]))) end++;
  return lines.slice(start, end).join('\n');
}

function escape(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function inline(text: string): string {
  return escape(text)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img alt="$1" src="/docs/$2">')
    // Links inside the guide point at its own headings, which aren't on
    // this page, so they're kept as plain text.
    .replace(/\[([^\]]+)\]\(#[^)]+\)/g, '$1')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');
}

export function markdownToHtml(md: string): string {
  const out: string[] = [];
  const lines = md.split('\n');
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim().startsWith('```')) {
      const indent = line.indexOf('`');
      const code: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) code.push(lines[i++].slice(indent));
      i++;
      out.push(`<pre><code>${escape(code.join('\n'))}</code></pre>`);
    } else if (/^#+ /.test(line)) {
      const level = Math.min(6, line.indexOf(' ') + 1);
      out.push(`<h${level}>${inline(line.replace(/^#+ /, ''))}</h${level}>`);
      i++;
    } else if (line.startsWith('|')) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].startsWith('|')) {
        const cells = lines[i].split('|').slice(1, -1).map((c) => c.trim());
        if (!cells.every((c) => /^-+$/.test(c))) rows.push(cells);
        i++;
      }
      const [head, ...body] = rows;
      out.push(
        `<table><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>` +
          body.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('') +
          '</tbody></table>',
      );
    } else if (/^(- |\d+\. )/.test(line)) {
      const ordered = /^\d/.test(line);
      const items: string[] = [];
      while (i < lines.length && (/^(- |\d+\. )/.test(lines[i]) || /^ {2,}\S/.test(lines[i]))) {
        if (/^(- |\d+\. )/.test(lines[i])) items.push(lines[i].replace(/^(- |\d+\. )/, ''));
        else if (lines[i].trim().startsWith('```')) {
          // A code block inside a list item.
          const code: string[] = [];
          const indent = lines[i].indexOf('`');
          i++;
          while (i < lines.length && !lines[i].trim().startsWith('```')) code.push(lines[i++].slice(indent));
          items[items.length - 1] += `\u0000${code.join('\n')}`;
        } else items[items.length - 1] += ' ' + lines[i].trim();
        i++;
      }
      const tag = ordered ? 'ol' : 'ul';
      out.push(
        `<${tag}>${items
          .map((it) => {
            const [text, code] = it.split('\u0000');
            return `<li>${inline(text)}${code !== undefined ? `<pre><code>${escape(code)}</code></pre>` : ''}</li>`;
          })
          .join('')}</${tag}>`,
      );
    } else if (line.trim() === '') {
      i++;
    } else {
      const para: string[] = [];
      while (i < lines.length && lines[i].trim() !== '' && !/^(#+ |\||- |\d+\. |```)/.test(lines[i])) para.push(lines[i++]);
      out.push(`<p>${inline(para.join(' '))}</p>`);
    }
  }
  return out.join('\n');
}
