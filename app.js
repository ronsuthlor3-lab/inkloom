/* Inkloom — เชื่อมแถบเครื่องมือ ไฟล์ บันทึกอัตโนมัติ แป้นลัด */
(() => {
  'use strict';
  const E = window.IK, C = window.IKC;
  const $ = (id) => document.getElementById(id);
  const docEl = $('doc'), nameEl = $('docname');
  E.init(docEl);

  // ---------- ข้อความแจ้ง ----------
  let msgT = 0;
  function msg(t, kind = '', ms) { const m = $('msg'); m.textContent = t; m.className = 'msg' + (kind ? ' ' + kind : ''); clearTimeout(msgT); msgT = setTimeout(() => { m.textContent = ''; }, ms || (kind === 'err' ? 7000 : 3500)); }

  // ---------- เนื้อหา ----------
  function setContent(html, name) {
    docEl.innerHTML = E.sanitize(html) || '<p><br></p>';
    E.ensureNotEmpty();
    if (name !== undefined) nameEl.value = name;
    E.placeCaret(docEl.firstChild, 0);
    changed();
  }
  const baseName = () => (nameEl.value.trim() || 'เอกสาร').replace(/[\\/:*?"<>|]+/g, '_');

  // ---------- แถบเครื่องมือ ----------
  for (const el of document.querySelectorAll('.tools button, .ctxbar button')) el.addEventListener('mousedown', (e) => e.preventDefault());
  document.querySelectorAll('#tools [data-cmd]').forEach((b) => b.addEventListener('click', () => { E.exec(b.dataset.cmd); sync(); changed(); }));
  $('t-block').addEventListener('change', (e) => { E.exec('formatBlock', `<${e.target.value}>`); sync(); changed(); });
  $('t-font').addEventListener('change', (e) => { E.exec('fontName', e.target.value); sync(); changed(); });
  $('t-size').addEventListener('change', (e) => { E.setFontSize(+e.target.value); sync(); changed(); });
  $('t-color').addEventListener('input', (e) => { E.exec('foreColor', e.target.value); changed(); });
  $('t-hl').addEventListener('input', (e) => { E.exec('hiliteColor', e.target.value); changed(); });
  $('t-line').addEventListener('change', (e) => { if (e.target.value) E.setLineHeight(e.target.value); e.target.value = ''; changed(); });

  $('i-table').addEventListener('click', () => {
    const v = prompt('ขนาดตาราง (แถว x คอลัมน์)', '3x3');
    if (v === null) return;
    const m = /^\s*(\d{1,2})\s*[x×*,]\s*(\d{1,2})\s*$/i.exec(v);
    if (!m || +m[1] < 1 || +m[2] < 1) return msg('พิมพ์เช่น 3x4 (สูงสุด 99x99)', 'err');
    E.insertTable(+m[1], +m[2]); changed();
  });
  $('i-image').addEventListener('click', () => $('i-image-input').click());
  $('i-image-input').addEventListener('change', async (e) => {
    const f = e.target.files[0]; e.target.value = '';
    if (!f) return;
    try { await E.insertImageFile(f); changed(); } catch (er) { msg('แทรกรูปไม่ได้: ' + er.message, 'err'); }
  });
  function insertLink() {
    E.restore();
    const sel = getSelection();
    const a = sel.anchorNode && (sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement).closest('a');
    const url = prompt('ที่อยู่ลิงก์ (https://… หรือ mailto:…) — เว้นว่างเพื่อลบลิงก์', a ? a.getAttribute('href') : 'https://');
    if (url === null) return;
    if (!url.trim()) { E.exec('unlink'); changed(); return; }
    const u = url.trim().replace(/^www\./i, 'https://www.');
    if (!/^(https?:\/\/|mailto:)/i.test(u)) return msg('ลิงก์ต้องขึ้นต้นด้วย https:// http:// หรือ mailto:', 'err');
    if (getSelection().isCollapsed && !a) E.exec('insertHTML', `<a href="${u.replace(/"/g, '%22')}">${u.replace(/</g, '&lt;')}</a>&nbsp;`);
    else E.exec('createLink', u);
    changed();
  }
  $('i-link').addEventListener('click', insertLink);
  $('i-hr').addEventListener('click', () => { E.exec('insertHorizontalRule'); changed(); });
  const pageBreak = () => { E.exec('insertHTML', '<div class="pagebreak" contenteditable="false"></div><p><br></p>'); changed(); };
  $('i-break').addEventListener('click', pageBreak);
  $('i-date').addEventListener('click', () => { E.exec('insertText', new Date().toLocaleDateString('th-TH', { dateStyle: 'long' })); changed(); });

  // ---------- ตาราง / รูป (แถบตามบริบท) ----------
  document.querySelectorAll('[data-tbl]').forEach((b) => b.addEventListener('click', () => { if (E.tableOp(b.dataset.tbl)) { changed(); sync(); } }));
  let selImg = null;
  function selectImage(img) {
    if (selImg) selImg.classList.remove('sel');
    selImg = img;
    $('imagebar').hidden = !img;
    if (img) {
      img.classList.add('sel');
      const w = parseFloat(img.style.width) || 60;
      $('img-w').value = Math.round(/%$/.test(img.style.width) ? w : Math.min(100, w / 602 * 100));
      $('img-w-out').textContent = $('img-w').value + '%';
    }
  }
  docEl.addEventListener('click', (e) => { selectImage(e.target.tagName === 'IMG' ? e.target : null); if (e.target.tagName === 'A' && (e.ctrlKey || e.metaKey)) window.open(e.target.href, '_blank', 'noopener'); });
  $('img-w').addEventListener('input', (e) => { if (!selImg) return; selImg.style.width = e.target.value + '%'; $('img-w-out').textContent = e.target.value + '%'; changed(); });
  document.querySelectorAll('[data-imgal]').forEach((b) => b.addEventListener('click', () => {
    if (!selImg) return;
    const bl = E.closestBlock(selImg);
    if (bl) bl.style.textAlign = b.dataset.imgal;
    changed();
  }));
  $('img-del').addEventListener('click', () => {
    if (!selImg) return;
    const r = document.createRange(); r.selectNode(selImg);
    const s = getSelection(); s.removeAllRanges(); s.addRange(r);
    document.execCommand('delete'); selectImage(null); changed();
  });

  // ---------- ค้นหา / แทนที่ ----------
  function openFind() { $('findbar').hidden = false; const s = getSelection().toString(); if (s && s.length < 80) $('find-q').value = s; $('find-q').focus(); $('find-q').select(); }
  const fq = () => $('find-q').value, fcs = () => $('find-case').checked;
  $('t-find').addEventListener('click', openFind);
  $('find-next').addEventListener('click', () => { $('find-msg').textContent = E.findNext(fq(), fcs()) ? '' : 'ไม่พบ'; });
  $('find-rep').addEventListener('click', () => { $('find-msg').textContent = E.replaceCurrent(fq(), $('find-r').value, fcs()) ? '' : 'ไม่พบ'; changed(); });
  $('find-all').addEventListener('click', () => { const n = E.replaceAll(fq(), $('find-r').value, fcs()); $('find-msg').textContent = n ? `แทนที่ ${n} แห่ง` : 'ไม่พบ'; changed(); });
  $('find-q').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); $('find-next').click(); } if (e.key === 'Escape') { $('findbar').hidden = true; E.restore(); } });
  $('find-close').addEventListener('click', () => { $('findbar').hidden = true; E.restore(); });

  // ---------- สถานะแถบเครื่องมือ ----------
  let syncRaf = 0;
  function sync() {
    if (syncRaf) return;
    syncRaf = requestAnimationFrame(() => {
      syncRaf = 0;
      const s = getSelection();
      if (!s.rangeCount || !docEl.contains(s.anchorNode)) return;
      for (const b of document.querySelectorAll('#tools [data-cmd]')) {
        const c = b.dataset.cmd;
        if (/^(bold|italic|underline|strikeThrough|superscript|subscript|insertUnorderedList|insertOrderedList|justify\w+)$/.test(c)) {
          let on = false; try { on = document.queryCommandState(c); } catch (_) { /* ไม่รองรับ */ }
          b.setAttribute('aria-pressed', String(!!on));
        }
      }
      const el = s.anchorNode.nodeType === 1 ? s.anchorNode : s.anchorNode.parentElement;
      const blk = E.closestBlock(el);
      const tag = blk ? (blk.closest('h1,h2,h3,blockquote') || blk).tagName.toLowerCase() : 'p';
      $('t-block').value = ['h1', 'h2', 'h3', 'blockquote'].includes(tag) ? tag : 'p';
      const cs = getComputedStyle(el);
      const fam = cs.fontFamily.split(',')[0].replace(/["']/g, '').trim();
      if ([...$('t-font').options].some((o) => o.value === fam)) $('t-font').value = fam;
      const p = Math.round(parseFloat(cs.fontSize) * 0.75);
      const opts = [...$('t-size').options].map((o) => +o.value);
      $('t-size').value = String(opts.reduce((a, b) => (Math.abs(b - p) < Math.abs(a - p) ? b : a)));
      $('tablebar').hidden = !E.cellCtx();
    });
  }
  document.addEventListener('selectionchange', sync);

  // ---------- แป้นลัด ----------
  let plainNext = false;
  docEl.addEventListener('keydown', (e) => {
    const ctrl = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
    if (e.key === 'Tab') {
      e.preventDefault();
      if (E.moveCell(e.shiftKey)) return;
      const s = getSelection(), n = s.anchorNode, el = n && (n.nodeType === 1 ? n : n.parentElement);
      if (el && el.closest('li')) E.exec(e.shiftKey ? 'outdent' : 'indent');
      else if (!e.shiftKey) E.exec('insertText', '  ');
      changed(); return;
    }
    if (ctrl && e.key === 'Enter') { e.preventDefault(); pageBreak(); return; }
    if (ctrl && k === 'k') { e.preventDefault(); insertLink(); return; }
    if (ctrl && e.shiftKey && k === 'v') plainNext = true;
    if ((e.key === 'Backspace' || e.key === 'Delete') && selImg) { e.preventDefault(); $('img-del').click(); }
  });
  document.addEventListener('keydown', (e) => {
    const ctrl = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
    if (ctrl && k === 's') { e.preventDefault(); saveDocx(); }
    if (ctrl && (k === 'f' || k === 'h')) { e.preventDefault(); openFind(); }
    if (e.key === 'Escape' && selImg) selectImage(null);
  });

  // ---------- วาง / ลากวาง ----------
  docEl.addEventListener('paste', async (e) => {
    const cd = e.clipboardData;
    const files = [...cd.files].filter((f) => f.type.startsWith('image/'));
    const html = cd.getData('text/html'), text = cd.getData('text/plain');
    e.preventDefault();
    if (files.length && !html) { for (const f of files) await E.insertImageFile(f); changed(); return; }
    if (html && !plainNext) E.exec('insertHTML', E.sanitize(E.stripOffice(html)));
    else if (text) E.exec('insertText', text);
    plainNext = false;
    changed();
  });
  const desk = $('desk');
  desk.addEventListener('dragover', (e) => { if ([...e.dataTransfer.types].includes('Files')) e.preventDefault(); });
  desk.addEventListener('drop', async (e) => {
    const f = e.dataTransfer.files[0];
    if (!f) return;
    e.preventDefault();
    if (f.type.startsWith('image/')) {
      const pos = document.caretRangeFromPoint ? document.caretRangeFromPoint(e.clientX, e.clientY) : null;
      if (pos && docEl.contains(pos.startContainer)) E.lastRange = pos;
      await E.insertImageFile(f); changed();
    } else openFile(f);
  });

  // ---------- สถานะ / บันทึกอัตโนมัติ ----------
  let dirty = false, saveT = 0, statT = 0;
  const PAGE_CONTENT_PX = (297 - 2 * 25.4) * 96 / 25.4;
  function updateStatus() {
    const { words, chars } = E.counts();
    const zoom = +$('zoom').value || 1;
    const h = docEl.getBoundingClientRect().height / zoom;
    $('st-pages').textContent = `ประมาณ ${Math.max(1, Math.ceil((h - 2) / PAGE_CONTENT_PX) + docEl.querySelectorAll('.pagebreak').length)} หน้า`;
    $('st-words').textContent = `${words.toLocaleString('th-TH')} คำ`;
    $('st-chars').textContent = `${chars.toLocaleString('th-TH')} ตัวอักษร`;
  }
  function changed() {
    dirty = true;
    clearTimeout(statT); statT = setTimeout(updateStatus, 250);
    clearTimeout(saveT);
    saveT = setTimeout(() => {
      try {
        localStorage.setItem('inkloom.autosave', JSON.stringify({ name: nameEl.value, html: docEl.innerHTML }));
        $('st-save').textContent = 'บันทึกในเบราว์เซอร์แล้ว ' + new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
      } catch (_) { $('st-save').textContent = 'เอกสารใหญ่เกินกว่าจะบันทึกอัตโนมัติ — กดบันทึก .docx'; }
    }, 800);
  }
  docEl.addEventListener('input', () => { E.ensureNotEmpty(); changed(); });
  nameEl.addEventListener('input', changed);
  $('zoom').addEventListener('change', (e) => { $('page').style.zoom = e.target.value; updateStatus(); });

  // ---------- ไฟล์ ----------
  function download(data, name, type) {
    const url = URL.createObjectURL(data instanceof Blob ? data : new Blob([data], { type }));
    const a = document.createElement('a'); a.href = url; a.download = name; document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  async function saveDocx() {
    const b = $('f-docx'); b.disabled = true; b.textContent = 'กำลังสร้าง…';
    try {
      selectImage(null);
      const blob = await C.toDocx(docEl, nameEl.value);
      download(blob, baseName() + '.docx');
      dirty = false; msg('บันทึก .docx แล้ว');
    } catch (er) { console.error(er); msg('บันทึก .docx ไม่ได้: ' + er.message, 'err'); }
    finally { b.disabled = false; b.textContent = 'บันทึก .docx'; }
  }
  async function openFile(file) {
    const name = file.name, base = name.replace(/\.[^.]+$/, '');
    try {
      if (/\.doc$/i.test(name)) return msg('ไฟล์ .doc แบบเก่ายังเปิดไม่ได้ — บันทึกเป็น .docx จากโปรแกรมเดิมก่อน แล้วเปิดใหม่', 'err', 9000);
      if (dirty && docEl.innerText.trim() && !confirm('เอกสารปัจจุบันยังไม่ได้บันทึก เปิดไฟล์ใหม่ทับเลยไหม?')) return;
      const buf = await file.arrayBuffer();
      if (/\.docx$/i.test(name)) {
        const sig = new Uint8Array(buf.slice(0, 2));
        if (sig[0] !== 0x50 || sig[1] !== 0x4B) throw new Error('ไฟล์เสียหาย หรือไม่ใช่ .docx');
        msg('กำลังเปิด…');
        const r = await C.fromDocx(buf);
        setContent(r.html, base);
        dirty = false;
        return msg('เปิดแล้ว — หมายเหตุ: สี ขนาด แบบอักษร การจัดแนว และหัว/ท้ายกระดาษจากไฟล์ .docx ยังไม่ถูกนำเข้า', '', 7000);
      }
      const text = (() => { try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch (_) { return new TextDecoder('windows-874').decode(buf); } })().replace(/^﻿/, '');
      if (/\.html?$/i.test(name)) { const r = C.fromHtmlFile(text); setContent(r.html, r.title || base); }
      else if (/\.(md|markdown)$/i.test(name)) setContent(C.fromMarkdown(text), base);
      else setContent(C.fromText(text), base);
      dirty = false;
      msg('เปิด ' + name + ' แล้ว');
    } catch (er) { console.error(er); msg('เปิดไฟล์ไม่ได้: ' + er.message, 'err'); }
  }
  $('f-new').addEventListener('click', () => { if (dirty && docEl.innerText.trim() && !confirm('เริ่มเอกสารใหม่? งานที่ยังไม่บันทึกจะหาย')) return; setContent('<p><br></p>', 'เอกสารใหม่'); dirty = false; });
  $('f-open').addEventListener('click', () => $('f-input').click());
  $('f-input').addEventListener('change', (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) openFile(f); });
  $('f-docx').addEventListener('click', saveDocx);
  $('f-pdf').addEventListener('click', () => { selectImage(null); msg('ในหน้าต่างพิมพ์ เลือกปลายทาง "บันทึกเป็น PDF" ได้', '', 5000); setTimeout(() => window.print(), 300); });
  $('f-export').addEventListener('change', (e) => {
    const v = e.target.value; e.target.value = '';
    selectImage(null);
    if (v === 'html') download(C.toHtmlFile(docEl, nameEl.value), baseName() + '.html', 'text/html;charset=utf-8');
    if (v === 'md') download(C.toMarkdown(docEl), baseName() + '.md', 'text/markdown;charset=utf-8');
    if (v === 'txt') download('﻿' + C.toText(docEl), baseName() + '.txt', 'text/plain;charset=utf-8');
    if (v) msg('บันทึกแล้ว');
  });

  // ---------- เริ่มต้น ----------
  let restored = false;
  try {
    const s = JSON.parse(localStorage.getItem('inkloom.autosave') || 'null');
    if (s && typeof s.html === 'string') { docEl.innerHTML = E.sanitize(s.html); nameEl.value = s.name || 'เอกสารใหม่'; restored = true; }
  } catch (_) { /* ไม่มีงานเดิม */ }
  if (!restored) docEl.innerHTML = '<p><br></p>';
  E.ensureNotEmpty();
  updateStatus();
  docEl.focus();
  if (restored && docEl.innerText.trim()) msg('เปิดเอกสารล่าสุดที่บันทึกอัตโนมัติไว้');
  window.Inkloom = { setContent, openFile, saveDocx, counts: E.counts, C, E };
})();
