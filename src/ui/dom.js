// Tiny DOM helpers for the UI layer (menus / select screen live in HTML over the game canvas).
export function el(tag, attrs = {}, children = []) {
  const e = document.createElement(tag);
  for (const k in attrs) {
    if (k === 'class') e.className = attrs[k];
    else if (k === 'style' && typeof attrs[k] === 'object') {
      for (const sk in attrs[k]) {
        if (sk.startsWith('--')) e.style.setProperty(sk, attrs[k][sk]);
        else e.style[sk] = attrs[k][sk];
      }
    }
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), attrs[k]);
    else e.setAttribute(k, attrs[k]);
  }
  for (const c of [].concat(children)) {
    if (c == null) continue;
    e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return e;
}

export function clearUI() {
  const ui = document.getElementById('ui');
  if (ui) ui.innerHTML = '';
}

/** Generic vertical menu with keyboard navigation. items: [[label, fn], ...] */
export function createMenu(app, title, items, opts = {}) {
  const ui = document.getElementById('ui');
  let idx = 0;
  const buttons = items.map(([label, fn], i) =>
    el('button', { class: 'menu-item', onclick: () => choose(i), onmouseenter: () => focus(i) }, [label]));
  const panel = el('div', { class: `menu-panel ${opts.result ? 'result' : ''} ${opts.className || ''}` }, [
    opts.portrait ? el('div', { class: 'result-portrait', style: { backgroundImage: `url(${opts.portrait})` } }) : null,
    el('div', { class: 'menu-inner' }, [
      el('h2', { class: 'menu-title', 'data-text': title }, [title]),
      opts.subtitle ? el('div', { class: 'menu-sub' }, [opts.subtitle]) : null,
      el('div', { class: 'menu-items' }, buttons),
    ]),
  ]);
  const wrap = el('div', { class: 'menu-overlay' }, [panel]);
  ui.appendChild(wrap);
  function focus(i) {
    idx = (i + buttons.length) % buttons.length;
    buttons.forEach((b, k) => b.classList.toggle('active', k === idx));
  }
  function choose(i) {
    app.audio.ui('confirm');
    close();
    items[i][1]();
  }
  focus(opts.start || 0);
  const unsub = app.keyboard.onPress((code) => {
    const a = app.keyboard.constructor.actionOf(code);
    if (!a) return;
    if (a.action === 'up') { focus(idx - 1); app.audio.ui('move'); }
    else if (a.action === 'down') { focus(idx + 1); app.audio.ui('move'); }
    else if (a.action === 'lp' || a.action === 'lk') choose(idx);
    else if ((a.action === 'left' || a.action === 'right') && items[idx][2]) {
      app.audio.ui('move');
      close();
      items[idx][a.action === 'left' ? 2 : 1]();
    }
    else if ((a.action === 'back' || a.action === 'hp') && opts.onBack) { app.audio.ui('back'); close(); opts.onBack(); }
  });
  function close() {
    unsub();
    wrap.remove();
  }
  return { close, el: wrap };
}
