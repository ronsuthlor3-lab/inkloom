/* Inkloom — ตัวแก้ไขเอกสาร (เขียนเอง)
 * ใช้ contenteditable ของเบราว์เซอร์ + คำสั่งจัดรูปแบบ; ตัวกรอง HTML แบบ allowlist; ตาราง รูป ค้นหา/แทนที่ นับคำ
 */
(function (K) {
  'use strict';
  let doc = null, lastRange = null, pendingPt = null;

  // ================= ตัวกรอง HTML =================
  const ALLOWED = new Set(['P', 'BR', 'H1', 'H2', 'H3', 'B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE', 'DEL', 'SUB', 'SUP', 'SPAN', 'A', 'UL', 'OL', 'LI',
    'TABLE', 'THEAD', 'TBODY', 'TFOOT', 'TR', 'TD', 'TH', 'IMG', 'HR', 'BLOCKQUOTE', 'DIV', 'PRE', 'CODE', 'MARK']);
  const DROP = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'SVG', 'MATH', 'FORM', 'INPUT', 'BUTTON', 'SELECT', 'TEXTAREA', 'LINK', 'META',
    'TITLE', 'HEAD', 'NOSCRIPT', 'TEMPLATE', 'VIDEO', 'AUDIO', 'CANVAS', 'FRAME', 'FRAMESET', 'BASE', 'APPLET', 'PORTAL', 'XML']);
  const RENAME = { H4: 'H3', H5: 'H3', H6: 'H3', FONT: 'SPAN', CENTER: 'P', SECTION: 'DIV', ARTICLE: 'DIV', HEADER: 'DIV', FOOTER: 'DIV', MAIN: 'DIV',
    ASIDE: 'DIV', NAV: 'DIV', FIGURE: 'DIV', FIGCAPTION: 'P', CAPTION: 'P', DT: 'P', DD: 'P', DL: 'DIV', ADDRESS: 'P', INS: 'U', TT: 'CODE', KBD: 'CODE' };
  const STYLE_OK = ['color', 'background-color', 'font-weight', 'font-style', 'text-decoration-line', 'font-size', 'font-family', 'text-align', 'line-height',
    'margin-left', 'width', 'vertical-align'];
  function cleanStyle(st, tag) {
    const out = [];
    for (const p of STYLE_OK) {
      let v = st.getPropertyValue(p);
      if (!v || /url\(|expression|javascript:|\\/i.test(v)) continue;
      if (p === 'width' && !['IMG', 'TABLE', 'TD', 'TH'].includes(tag)) continue;
      if (p === 'background-color' && /^(transparent|rgba\(0, 0, 0, 0\)|initial|inherit)$/.test(v)) continue;
      if (p === 'text-decoration-line' && v === 'none') continue;
      out.push(`${p}: ${v}`);
    }
    return out.join('; ');
  }
  function safeUrl(u, img) {
    u = (u || '').trim();
    if (img) return /^data:image\/(png|jpe?g|gif|webp|bmp);base64,[A-Za-z0-9+/=\s]+$/i.test(u) || /^https?:\/\//i.test(u) ? u : null;
    return /^(https?:|mailto:|#)/i.test(u) ? u : null;
  }
  function sanitize(html) {
    const src = new DOMParser().parseFromString(`<!doctype html><body>${html}</body>`, 'text/html');
    const walk = (node, out) => {
      for (const ch of [...node.childNodes]) {
        if (ch.nodeType === 3) { out.append(document.createTextNode(ch.nodeValue)); continue; }
        if (ch.nodeType !== 1) continue;
        const orig = ch.tagName.toUpperCase();
        if (DROP.has(orig) || orig.includes(':')) { if (orig.includes(':')) walk(ch, out); continue; }
        const styleAttr = ch.getAttribute('style') || '';
        if (/page-break-(after|before)\s*:\s*always|break-(after|before)\s*:\s*page/i.test(styleAttr) && !ch.textContent.trim() || (orig === 'DIV' && ch.classList.contains('pagebreak'))) {
          const pb = document.createElement('div'); pb.className = 'pagebreak'; pb.setAttribute('contenteditable', 'false'); out.append(pb); continue;
        }
        const tag = RENAME[orig] || orig;
        if (!ALLOWED.has(tag)) { walk(ch, out); continue; }
        const el = document.createElement(tag);
        if (tag === 'A') { const h = safeUrl(ch.getAttribute('href')); if (h) el.setAttribute('href', h); }
        if (tag === 'IMG') {
          const s = safeUrl(ch.getAttribute('src'), true);
          if (!s) continue;
          el.setAttribute('src', s);
          const alt = ch.getAttribute('alt'); if (alt) el.setAttribute('alt', alt);
          const w = ch.getAttribute('width'); if (w && /^\d+$/.test(w)) el.style.width = Math.min(+w, 602) + 'px';
        }
        if (tag === 'TD' || tag === 'TH') for (const a of ['colspan', 'rowspan']) { const v = ch.getAttribute(a); if (v && /^\d{1,2}$/.test(v) && +v > 1) el.setAttribute(a, v); }
        if (orig === 'FONT') {
          const c = ch.getAttribute('color'); if (c && /^#?[0-9a-z]+$/i.test(c)) el.style.color = c;
          const f = ch.getAttribute('face'); if (f && /^[\w\s,"'฀-๿-]+$/.test(f)) el.style.fontFamily = f;
        }
        if (orig === 'CENTER') el.style.textAlign = 'center';
        const al = ch.getAttribute('align'); if (al && /^(left|center|right|justify)$/i.test(al)) el.style.textAlign = al.toLowerCase();
        const st = cleanStyle(ch.style, tag);
        if (st) el.setAttribute('style', [el.getAttribute('style'), st].filter(Boolean).join('; '));
        walk(ch, el);
        if ((tag === 'SPAN' || tag === 'B' || tag === 'I' || tag === 'U' || tag === 'A') && !el.childNodes.length) continue;
        out.append(el);
      }
    };
    const box = document.createElement('div');
    walk(src.body, box);
    // ข้อความเปล่าที่ระดับบนสุด → ห่อด้วย <p>
    const INLINE_TOP = (n) => n.nodeType === 3 || (n.nodeType === 1 && !/^(P|H1|H2|H3|UL|OL|TABLE|HR|BLOCKQUOTE|DIV|PRE)$/.test(n.tagName));
    let p = null;
    for (const n of [...box.childNodes]) {
      if (INLINE_TOP(n)) {
        if (n.nodeType === 3 && !n.nodeValue.trim() && !p) { n.remove(); continue; }
        if (!p) { p = document.createElement('p'); n.before(p); }
        p.append(n);
      } else p = null;
    }
    return box.innerHTML;
  }
  /** ตัดสิ่งที่ Word ใส่มาตอนวาง (คอมเมนต์เงื่อนไข ฯลฯ) */
  const stripOffice = (html) => html.replace(/<!--\[if[\s\S]*?<!\[endif\]-->/gi, '').replace(/<!--[\s\S]*?-->/g, '');

  // ================= การเลือก =================
  function init(el) {
    doc = el;
    try { document.execCommand('styleWithCSS', false, true); document.execCommand('defaultParagraphSeparator', false, 'p'); } catch (_) { /* เบราว์เซอร์เก่า */ }
    document.addEventListener('selectionchange', () => {
      const s = getSelection();
      if (s.rangeCount && doc.contains(s.anchorNode)) lastRange = s.getRangeAt(0).cloneRange();
    });
    doc.addEventListener('input', convertPendingFont);
  }
  function restore() {
    doc.focus({ preventScroll: true });
    if (lastRange && doc.contains(lastRange.startContainer)) { const s = getSelection(); s.removeAllRanges(); s.addRange(lastRange); }
  }
  function exec(cmd, val) {
    restore();
    const ok = document.execCommand(cmd, false, val === undefined ? null : val);
    ensureNotEmpty();
    remember();
    return ok;
  }
  /** เก็บช่วงที่เลือกทันที (selectionchange มาช้ากว่า ทำให้คำสั่งถัดไปใช้ช่วงเก่า) */
  function remember() { const s = getSelection(); if (s.rangeCount && doc.contains(s.getRangeAt(0).startContainer)) lastRange = s.getRangeAt(0).cloneRange(); }
  function ensureNotEmpty() {
    if (!doc.childNodes.length || doc.innerHTML === '<br>') { doc.innerHTML = '<p><br></p>'; placeCaret(doc.firstChild, 0); }
  }
  function placeCaret(node, offset) { const r = document.createRange(); r.setStart(node, offset); r.collapse(true); const s = getSelection(); s.removeAllRanges(); s.addRange(r); lastRange = r.cloneRange(); }

  // ---------- ขนาดตัวอักษร (pt) ----------
  function convertPendingFont() {
    const fonts = doc.querySelectorAll('font[size="7"]');
    if (!fonts.length) return [];
    const spans = [];
    for (const f of fonts) {
      const sp = document.createElement('span');
      sp.style.fontSize = (pendingPt || 14) + 'pt';
      sp.append(...f.childNodes);
      sp.querySelectorAll('[style*="font-size"]').forEach((x) => { x.style.fontSize = ''; if (!x.getAttribute('style')) x.removeAttribute('style'); });
      f.replaceWith(sp);
      spans.push(sp);
    }
    return spans;
  }
  function setFontSize(pt) {
    pendingPt = pt;
    restore();
    const collapsed = getSelection().isCollapsed;
    document.execCommand('styleWithCSS', false, false);
    document.execCommand('fontSize', false, '7');
    document.execCommand('styleWithCSS', false, true);
    const spans = convertPendingFont();
    if (!collapsed && spans.length) {
      const r = document.createRange();
      r.setStartBefore(spans[0]); r.setEndAfter(spans[spans.length - 1]);
      const s = getSelection(); s.removeAllRanges(); s.addRange(r); lastRange = r.cloneRange();
    } else remember();
  }

  // ---------- ย่อหน้าในช่วงที่เลือก ----------
  const BLOCK_SEL = 'P,H1,H2,H3,LI,BLOCKQUOTE,PRE,TD,TH,DIV:not(.pagebreak)';
  function closestBlock(n) {
    let e = n && (n.nodeType === 1 ? n : n.parentElement);
    while (e && e !== doc && !e.matches(BLOCK_SEL)) e = e.parentElement;
    return e && e !== doc ? e : null;
  }
  function currentRange() {
    const s = getSelection();
    if (s.rangeCount && doc.contains(s.getRangeAt(0).startContainer)) return s.getRangeAt(0);
    return lastRange && doc.contains(lastRange.startContainer) ? lastRange : null;
  }
  function blocksInSelection() {
    const r = currentRange();
    if (!r) return [];
    const set = new Set();
    const a = closestBlock(r.startContainer); if (a) set.add(a);
    const w = document.createTreeWalker(doc, NodeFilter.SHOW_ELEMENT);
    while (w.nextNode()) { const e = w.currentNode; if (e.matches('P,H1,H2,H3,LI,PRE') && r.intersectsNode(e)) set.add(e); }
    const b = closestBlock(r.endContainer); if (b) set.add(b);
    return [...set];
  }
  function setLineHeight(v) {
    restore();
    let bl = blocksInSelection();
    if (!bl.length) { exec('formatBlock', '<p>'); bl = blocksInSelection(); }
    for (const b of bl) b.style.lineHeight = v;
    doc.dispatchEvent(new Event('input'));
  }
  function setBlockAlign(v) { for (const b of blocksInSelection()) b.style.textAlign = v; doc.dispatchEvent(new Event('input')); }

  // ================= ตาราง =================
  function insertTable(rows, cols) {
    let h = '<table><tbody>';
    for (let i = 0; i < rows; i++) { h += '<tr>'; for (let j = 0; j < cols; j++) h += '<td><br></td>'; h += '</tr>'; }
    h += '</tbody></table><p><br></p>';
    exec('insertHTML', h);
  }
  function cellCtx() {
    const r = currentRange();
    if (!r) return null;
    const el = r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentElement;
    const td = el && el.closest('td,th');
    if (!td || !doc.contains(td)) return null;
    const tr = td.parentElement, table = td.closest('table');
    return { td, tr, table, ci: td.cellIndex, ri: [...table.rows].indexOf(tr) };
  }
  /** แก้ตารางผ่าน insertHTML เพื่อให้ย้อนกลับ (Ctrl+Z) ได้ */
  function tableOp(op) {
    const c = cellCtx();
    if (!c) return false;
    const clone = c.table.cloneNode(true), rows = [...clone.rows];
    const emptyCell = (tag = 'td') => { const x = document.createElement(tag); x.innerHTML = '<br>'; return x; };
    let focusR = c.ri, focusC = c.ci;
    switch (op) {
      case 'rowAbove': case 'rowBelow': {
        const tr = document.createElement('tr');
        for (let j = 0; j < rows[c.ri].cells.length; j++) tr.append(emptyCell());
        rows[c.ri][op === 'rowAbove' ? 'before' : 'after'](tr);
        if (op === 'rowBelow') focusR++;
        break;
      }
      case 'colLeft': case 'colRight':
        for (const tr of rows) { const ref = tr.cells[Math.min(c.ci, tr.cells.length - 1)]; const nc = emptyCell(ref && ref.tagName === 'TH' ? 'th' : 'td'); if (!ref) tr.append(nc); else ref[op === 'colLeft' ? 'before' : 'after'](nc); }
        if (op === 'colRight') focusC++;
        break;
      case 'delRow':
        if (rows.length === 1) return tableOp('delTable');
        rows[c.ri].remove(); focusR = Math.min(c.ri, rows.length - 2);
        break;
      case 'delCol':
        if (rows.every((tr) => tr.cells.length <= 1)) return tableOp('delTable');
        for (const tr of rows) if (tr.cells[c.ci]) tr.cells[c.ci].remove();
        focusC = Math.max(0, c.ci - 1);
        break;
      case 'delTable': {
        const r = document.createRange(); r.selectNode(c.table);
        const s = getSelection(); s.removeAllRanges(); s.addRange(r);
        document.execCommand('delete'); ensureNotEmpty();
        return true;
      }
    }
    const marker = 'ik-' + Math.random().toString(36).slice(2);
    clone.setAttribute('data-ik', marker);
    const r = document.createRange(); r.selectNode(c.table);
    const s = getSelection(); s.removeAllRanges(); s.addRange(r);
    document.execCommand('insertHTML', false, clone.outerHTML);
    const t = doc.querySelector(`table[data-ik="${marker}"]`);
    if (t) {
      t.removeAttribute('data-ik');
      const row = t.rows[Math.max(0, Math.min(focusR, t.rows.length - 1))];
      const cell = row && row.cells[Math.max(0, Math.min(focusC, row.cells.length - 1))];
      if (cell) placeCaret(cell, 0);
    }
    return true;
  }
  function moveCell(back) {
    const c = cellCtx();
    if (!c) return false;
    const cells = [...c.table.querySelectorAll('td,th')];
    const i = cells.indexOf(c.td) + (back ? -1 : 1);
    if (i >= cells.length) { tableOp('rowBelow'); return true; }
    if (i < 0) return true;
    const r = document.createRange(); r.selectNodeContents(cells[i]);
    const s = getSelection(); s.removeAllRanges(); s.addRange(r); lastRange = r.cloneRange();
    return true;
  }

  // ================= รูปภาพ =================
  async function imageDataUrl(file) {
    const url = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(file); });
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('อ่านรูปไม่ได้')); i.src = url; });
    const MAX = 1600;
    const needsPng = !/^image\/(png|jpeg)$/.test(file.type);
    if (img.naturalWidth <= MAX && img.naturalHeight <= MAX && !needsPng) return { url, w: img.naturalWidth };
    const k = Math.min(1, MAX / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    const type = file.type === 'image/jpeg' ? 'image/jpeg' : 'image/png';
    return { url: c.toDataURL(type, 0.9), w: c.width };
  }
  async function insertImageFile(file) {
    const { url, w } = await imageDataUrl(file);
    const pct = Math.min(100, Math.max(20, Math.round(w / 602 * 100)));
    exec('insertHTML', `<img src="${url}" alt="" style="width: ${pct}%">`);
  }

  // ================= ค้นหา / แทนที่ =================
  function textNodes(root) {
    const out = [], w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (w.nextNode()) out.push(w.currentNode);
    return out;
  }
  function findNext(q, cs) {
    if (!q) return false;
    const nodes = textNodes(doc);
    if (!nodes.length) return false;
    const norm = (s) => (cs ? s : s.toLocaleLowerCase('th'));
    const nq = norm(q);
    const s = getSelection();
    let startNode = null, startOff = 0;
    if (s.rangeCount && doc.contains(s.focusNode)) { const r = s.getRangeAt(0); startNode = r.endContainer; startOff = r.endOffset; }
    let i0 = startNode && startNode.nodeType === 3 ? nodes.indexOf(startNode) : -1;
    if (i0 < 0) { i0 = 0; startOff = 0; }
    for (let k = 0; k <= nodes.length; k++) {
      const i = (i0 + k) % nodes.length, n = nodes[i];
      const from = k === 0 ? startOff : 0;
      const idx = norm(n.nodeValue).indexOf(nq, from);
      if (idx >= 0) {
        const r = document.createRange(); r.setStart(n, idx); r.setEnd(n, idx + q.length);
        s.removeAllRanges(); s.addRange(r); lastRange = r.cloneRange();
        const el = n.parentElement; if (el) el.scrollIntoView({ block: 'center' });
        return true;
      }
    }
    return false;
  }
  function replaceCurrent(q, rep, cs) {
    const s = getSelection();
    if (s.rangeCount && doc.contains(s.anchorNode)) {
      const t = s.toString();
      if (cs ? t === q : t.toLocaleLowerCase('th') === q.toLocaleLowerCase('th')) { document.execCommand('insertText', false, rep); }
    }
    return findNext(q, cs);
  }
  function replaceAll(q, rep, cs) {
    if (!q) return 0;
    const clone = doc.cloneNode(true);
    let n = 0;
    const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), cs ? 'g' : 'gi');
    for (const t of textNodes(clone)) { const v = t.nodeValue.replace(re, () => { n++; return rep; }); if (v !== t.nodeValue) t.nodeValue = v; }
    if (!n) return 0;
    doc.focus();
    const r = document.createRange(); r.selectNodeContents(doc);
    const s = getSelection(); s.removeAllRanges(); s.addRange(r);
    document.execCommand('insertHTML', false, clone.innerHTML);
    return n;
  }

  // ================= นับคำ =================
  const seg = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter('th', { granularity: 'word' }) : null;
  function counts() {
    const text = doc.innerText.replace(/​/g, '');
    let words = 0;
    if (seg) { for (const s of seg.segment(text)) if (s.isWordLike) words++; }
    else words = (text.match(/\S+/g) || []).length;
    const chars = [...text.replace(/\s/g, '')].length;
    return { words, chars };
  }

  Object.assign(K, { init, exec, restore, sanitize, stripOffice, setFontSize, setLineHeight, setBlockAlign, insertTable, cellCtx, tableOp, moveCell,
    insertImageFile, imageDataUrl, findNext, replaceCurrent, replaceAll, counts, ensureNotEmpty, placeCaret, closestBlock });
  // ต้องใช้ defineProperty — Object.assign จะคัดลอกแค่ค่า ไม่ใช่ตัวอ่าน/ตัวเขียน
  Object.defineProperty(K, 'lastRange', { get: () => lastRange, set: (r) => { lastRange = r; }, configurable: true });
})(window.IK = window.IK || {});
