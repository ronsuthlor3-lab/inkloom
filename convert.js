/* Inkloom — แปลงเอกสาร HTML ↔ .docx / Markdown / ข้อความล้วน
 * .docx เขียนด้วย docx 8.5.0 (MIT), อ่านด้วย mammoth 1.8.0 (BSD-2-Clause) — โหลดเฉพาะตอนใช้
 */
(function (C) {
  'use strict';
  const LIB = {
    docx: 'https://cdn.jsdelivr.net/npm/docx@8.5.0/build/index.umd.js',
    mammoth: 'https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.8.0/mammoth.browser.min.js',
  };
  const loading = {};
  function load(name) {
    if (window[name]) return Promise.resolve();
    return loading[name] || (loading[name] = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = LIB[name]; s.crossOrigin = 'anonymous';
      s.onload = () => res();
      s.onerror = () => { delete loading[name]; rej(new Error('โหลดไลบรารีไม่สำเร็จ (ต้องต่ออินเทอร์เน็ต)')); };
      document.head.append(s);
    }));
  }
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  // ================= HTML → .docx =================
  const NAMED = { black: '000000', white: 'FFFFFF', red: 'FF0000', green: '008000', blue: '0000FF', yellow: 'FFFF00', gray: '808080', grey: '808080', orange: 'FFA500', purple: '800080' };
  function hex(c) {
    if (!c) return null;
    c = c.trim();
    let m;
    if ((m = /^#([0-9a-f]{3})$/i.exec(c))) return m[1].split('').map((x) => x + x).join('').toUpperCase();
    if ((m = /^#([0-9a-f]{6})$/i.exec(c))) return m[1].toUpperCase();
    if ((m = /^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/i.exec(c))) {
      if (m[4] !== undefined && +m[4] === 0) return null;
      return [m[1], m[2], m[3]].map((x) => (+x).toString(16).padStart(2, '0')).join('').toUpperCase();
    }
    return NAMED[c.toLowerCase()] || null;
  }
  const KW = { 'xx-small': 7, 'x-small': 7.5, small: 10, medium: 12, large: 13.5, 'x-large': 18, 'xx-large': 24, 'xxx-large': 36 };
  function pt(v) { if (!v) return null; let m; if ((m = /^([\d.]+)pt$/.exec(v))) return +m[1]; if ((m = /^([\d.]+)px$/.exec(v))) return +m[1] * 0.75; return KW[v] ?? null; }
  const px = (v) => { const m = /^([\d.]+)px$/.exec(v || ''); if (m) return +m[1]; const n = /^([\d.]+)pt$/.exec(v || ''); if (n) return +n[1] / 0.75; const e = /^([\d.]+)em$/.exec(v || ''); return e ? +e[1] * 16 : 0; };
  const BLOCKS = new Set(['P', 'H1', 'H2', 'H3', 'DIV', 'BLOCKQUOTE', 'PRE', 'UL', 'OL', 'LI', 'TABLE', 'HR', 'TR', 'TD', 'TH', 'THEAD', 'TBODY', 'TFOOT']);
  const CONTENT_W = 602; // ความกว้างพื้นที่พิมพ์ A4 (px ที่ 96 dpi)

  async function toDocx(root, title) {
    await load('docx');
    const D = window.docx;
    let instance = 0;
    const AL = { left: D.AlignmentType.LEFT, center: D.AlignmentType.CENTER, right: D.AlignmentType.RIGHT, justify: D.AlignmentType.JUSTIFIED };

    function runCtx(el, c) {
      const n = { ...c }, t = el.tagName, st = el.style;
      if (t === 'B' || t === 'STRONG') n.bold = true;
      if (t === 'I' || t === 'EM') n.italics = true;
      if (t === 'U') n.underline = true;
      if (t === 'S' || t === 'STRIKE' || t === 'DEL') n.strike = true;
      if (t === 'SUP') n.sup = true;
      if (t === 'SUB') n.sub = true;
      if (t === 'MARK') n.hl = 'FFF176';
      if (t === 'CODE' || t === 'PRE') n.font = 'Courier New';
      if (st.fontWeight) n.bold = st.fontWeight === 'bold' || +st.fontWeight >= 600;
      if (st.fontStyle) n.italics = st.fontStyle === 'italic';
      const td = st.textDecorationLine || st.textDecoration;
      if (td) { if (/underline/.test(td)) n.underline = true; if (/line-through/.test(td)) n.strike = true; }
      if (st.color) n.color = hex(st.color) || n.color;
      if (st.backgroundColor) { const h = hex(st.backgroundColor); if (h) n.hl = h; }
      const p = pt(st.fontSize); if (p) n.size = p;
      if (st.fontFamily) n.font = st.fontFamily.split(',')[0].replace(/["']/g, '').trim();
      if (st.verticalAlign === 'super') n.sup = true;
      if (st.verticalAlign === 'sub') n.sub = true;
      return n;
    }
    const run = (text, c) => new D.TextRun({
      text, bold: c.bold, italics: c.italics, underline: c.underline ? {} : undefined, strike: c.strike,
      superScript: c.sup, subScript: c.sub, color: c.color, size: c.size ? Math.round(c.size * 2) : undefined, font: c.font,
      shading: c.hl ? { type: D.ShadingType.CLEAR, color: 'auto', fill: c.hl } : undefined, style: c.link ? 'Hyperlink' : undefined,
    });
    async function imageRun(img) {
      const src = img.getAttribute('src') || '';
      let bytes;
      try {
        let blob = await (await fetch(src)).blob();
        if (!/^image\/(png|jpeg|gif|bmp)$/.test(blob.type)) {
          const bmp = await createImageBitmap(blob), c = document.createElement('canvas');
          c.width = bmp.width; c.height = bmp.height; c.getContext('2d').drawImage(bmp, 0, 0);
          blob = await new Promise((r) => c.toBlob(r, 'image/png'));
        }
        bytes = new Uint8Array(await blob.arrayBuffer());
      } catch (_) { return null; }
      const nw = img.naturalWidth || 400, nh = img.naturalHeight || 300;
      const sw = img.style.width;
      let w = /%$/.test(sw) ? CONTENT_W * parseFloat(sw) / 100 : px(sw) || Math.min(nw, CONTENT_W);
      w = Math.min(w, CONTENT_W);
      return new D.ImageRun({ data: bytes, transformation: { width: Math.round(w), height: Math.round(w * nh / nw) } });
    }
    async function inlines(nodes, c, out) {
      for (const ch of nodes) {
        if (ch.nodeType === 3) { const t = ch.nodeValue.replace(/​/g, '').replace(/[\r\n\t]+/g, ' '); if (t) out.push(run(t, c)); continue; }
        if (ch.nodeType !== 1) continue;
        const tag = ch.tagName;
        if (tag === 'BR') { out.push(new D.TextRun({ break: 1 })); continue; }
        if (tag === 'IMG') { const r = await imageRun(ch); if (r) out.push(r); continue; }
        if (tag === 'A' && ch.getAttribute('href')) {
          const kids = [];
          await inlines([...ch.childNodes], { ...runCtx(ch, c), link: true }, kids);
          out.push(new D.ExternalHyperlink({ link: ch.getAttribute('href'), children: kids.filter((k) => k instanceof D.TextRun) }));
          continue;
        }
        await inlines([...ch.childNodes], runCtx(ch, c), out);
      }
    }
    function paraProps(el, ctx) {
      const t = el ? el.tagName : 'P', st = el ? el.style : {};
      const o = {};
      if (t === 'H1') o.heading = D.HeadingLevel.HEADING_1;
      if (t === 'H2') o.heading = D.HeadingLevel.HEADING_2;
      if (t === 'H3') o.heading = D.HeadingLevel.HEADING_3;
      const al = st.textAlign || ctx.align; if (AL[al]) o.alignment = AL[al];
      const lh = parseFloat(st.lineHeight || ctx.lh);
      if (lh > 0 && lh < 5) o.spacing = { line: Math.round(240 * lh), lineRule: D.LineRuleType.AUTO };
      const left = (ctx.indent || 0) + px(st.marginLeft) + (ctx.quote || 0) * 40;
      if (left > 0) o.indent = { left: Math.round(left * 15) };
      return o;
    }
    async function para(nodes, el, ctx, base) {
      const kids = [];
      await inlines(nodes, base || (el ? runCtx(el, {}) : {}), kids);
      return new D.Paragraph({ ...paraProps(el, ctx), ...(ctx.extra || {}), children: kids });
    }
    const isBlock = (n) => n.nodeType === 1 && (BLOCKS.has(n.tagName) || n.classList.contains('pagebreak'));
    async function blockList(nodes, out, ctx) {
      let buf = [];
      const flush = async () => {
        if (buf.some((n) => n.nodeType === 1 || n.nodeValue.trim())) out.push(await para(buf, null, ctx, ctx.base));
        buf = [];
      };
      for (const n of nodes) { if (isBlock(n)) { await flush(); await block(n, out, ctx); } else buf.push(n); }
      await flush();
    }
    async function block(el, out, ctx) {
      const t = el.tagName;
      if (el.classList.contains('pagebreak')) { out.push(new D.Paragraph({ children: [new D.PageBreak()] })); return; }
      switch (t) {
        case 'P': case 'H1': case 'H2': case 'H3': case 'PRE':
          if ([...el.children].some((c) => BLOCKS.has(c.tagName))) { await blockList([...el.childNodes], out, ctx); return; }
          out.push(await para([...el.childNodes], el, ctx, runCtx(el, ctx.base || {})));
          return;
        case 'DIV': case 'BLOCKQUOTE': case 'THEAD': case 'TBODY': case 'TFOOT':
          await blockList([...el.childNodes], out, {
            ...ctx, quote: (ctx.quote || 0) + (t === 'BLOCKQUOTE' ? 1 : 0), align: el.style.textAlign || ctx.align,
            lh: el.style.lineHeight || ctx.lh, indent: (ctx.indent || 0) + px(el.style.marginLeft), base: t === 'BLOCKQUOTE' ? { ...(ctx.base || {}), italics: true } : ctx.base,
          });
          return;
        case 'UL': case 'OL': {
          const level = ctx.listLevel === undefined ? 0 : Math.min(ctx.listLevel + 1, 8);
          const inst = level === 0 ? ++instance : ctx.instance;
          const ref = t === 'OL' ? 'num' : 'bul';
          for (const li of el.children) {
            if (li.tagName !== 'LI') { await block(li, out, ctx); continue; }
            const own = [], sub = [];
            for (const n of li.childNodes) (n.nodeType === 1 && (n.tagName === 'UL' || n.tagName === 'OL') ? sub : own).push(n);
            out.push(await para(own, li, { ...ctx, extra: { numbering: { reference: ref, level, instance: inst } } }));
            for (const s of sub) await block(s, out, { ...ctx, listLevel: level, instance: inst, extra: undefined });
          }
          return;
        }
        case 'TABLE': {
          const trs = [...el.rows];
          const ncol = Math.max(1, ...trs.map((r) => [...r.cells].reduce((a, c) => a + (c.colSpan || 1), 0)));
          const cw = Math.floor(9026 / ncol);
          const rows = [];
          for (const tr of trs) {
            const cells = [];
            for (const td of tr.cells) {
              const kids = [];
              await blockList([...td.childNodes], kids, { base: td.tagName === 'TH' ? { bold: true } : undefined });
              if (!kids.length) kids.push(new D.Paragraph(''));
              cells.push(new D.TableCell({
                children: kids, columnSpan: td.colSpan > 1 ? td.colSpan : undefined, rowSpan: td.rowSpan > 1 ? td.rowSpan : undefined,
                width: { size: cw * (td.colSpan || 1), type: D.WidthType.DXA },
                shading: td.tagName === 'TH' ? { type: D.ShadingType.CLEAR, color: 'auto', fill: 'F1ECF2' } : undefined,
              }));
            }
            if (cells.length) rows.push(new D.TableRow({ children: cells }));
          }
          if (rows.length) { out.push(new D.Table({ rows, width: { size: 9026, type: D.WidthType.DXA }, columnWidths: Array(ncol).fill(cw) })); out.push(new D.Paragraph('')); }
          return;
        }
        case 'HR':
          out.push(new D.Paragraph({ border: { bottom: { style: D.BorderStyle.SINGLE, size: 6, color: '999999', space: 1 } } }));
          return;
        case 'LI':
          out.push(await para([...el.childNodes], el, ctx));
          return;
        default:
          await blockList([...el.childNodes], out, ctx);
      }
    }
    const children = [];
    await blockList([...root.childNodes], children, {});
    if (!children.length) children.push(new D.Paragraph(''));
    const lvl = (fmt, texts) => [...Array(9)].map((_, l) => ({
      level: l, format: fmt, text: typeof texts === 'function' ? texts(l) : texts[l % texts.length], alignment: D.AlignmentType.LEFT,
      style: { paragraph: { indent: { left: 720 * (l + 1), hanging: 360 } } },
    }));
    const H = (id, name, size) => ({ id, name, basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size, bold: true, color: '222222' }, paragraph: { spacing: { before: 240, after: 120 } } });
    const d = new D.Document({
      creator: 'Inkloom', title: title || '',
      styles: {
        default: { document: { run: { font: 'Sarabun', size: 28 }, paragraph: { spacing: { after: 120, line: 360 } } } },
        paragraphStyles: [H('Heading1', 'Heading 1', 44), H('Heading2', 'Heading 2', 36), H('Heading3', 'Heading 3', 30)],
        characterStyles: [{ id: 'Hyperlink', name: 'Hyperlink', basedOn: 'DefaultParagraphFont', run: { color: '6B2F8A', underline: {} } }],
      },
      numbering: { config: [
        { reference: 'bul', levels: lvl(D.LevelFormat.BULLET, ['•', '◦', '▪']) },
        { reference: 'num', levels: lvl(D.LevelFormat.DECIMAL, (l) => `%${l + 1}.`) },
      ] },
      sections: [{
        properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } },
        footers: { default: new D.Footer({ children: [new D.Paragraph({ alignment: D.AlignmentType.CENTER, children: [new D.TextRun({ children: [D.PageNumber.CURRENT], size: 20, color: '777777' })] })] }) },
        children,
      }],
    });
    return D.Packer.toBlob(d);
  }

  // ================= .docx → HTML =================
  async function fromDocx(buf) {
    await load('mammoth');
    const r = await window.mammoth.convertToHtml({ arrayBuffer: buf }, {
      styleMap: ["p[style-name='Title'] => h1:fresh", "p[style-name='Subtitle'] => h2:fresh", 'u => u', 'strike => s', "r[style-name='Strong'] => strong", "p[style-name='Quote'] => blockquote:fresh"],
      ignoreEmptyParagraphs: false,
    });
    return { html: r.value, warnings: r.messages.filter((m) => m.type === 'warning').length };
  }

  // ================= Markdown =================
  function toMarkdown(root) {
    const mdEsc = (s) => s.replace(/([\\`*_[\]])/g, '\\$1').replace(/​/g, '');
    function inline(nodes) {
      let s = '';
      for (const n of nodes) {
        if (n.nodeType === 3) { s += mdEsc(n.nodeValue.replace(/\s+/g, ' ')); continue; }
        if (n.nodeType !== 1) continue;
        const t = n.tagName, st = n.style, inner = inline([...n.childNodes]);
        if (!inner && t !== 'BR' && t !== 'IMG') continue;
        if (t === 'BR') s += '  \n';
        else if (t === 'IMG') s += `![${mdEsc(n.getAttribute('alt') || '')}](${n.getAttribute('src')})`;
        else if (t === 'A') s += `[${inner}](${n.getAttribute('href') || ''})`;
        else if (t === 'B' || t === 'STRONG' || +st.fontWeight >= 600 || st.fontWeight === 'bold') s += `**${inner}**`;
        else if (t === 'I' || t === 'EM' || st.fontStyle === 'italic') s += `*${inner}*`;
        else if (t === 'S' || t === 'DEL' || t === 'STRIKE') s += `~~${inner}~~`;
        else if (t === 'CODE') s += '`' + n.textContent + '`';
        else if (t === 'U') s += `<u>${inner}</u>`;
        else if (t === 'SUP') s += `<sup>${inner}</sup>`;
        else if (t === 'SUB') s += `<sub>${inner}</sub>`;
        else s += inner;
      }
      return s;
    }
    function blocks(nodes, depth = 0) {
      let out = '', buf = [];
      const flush = () => { const t = inline(buf).trim(); if (t) out += t + '\n\n'; buf = []; };
      for (const n of nodes) {
        if (n.nodeType !== 1 || !(BLOCKS.has(n.tagName) || n.classList.contains('pagebreak'))) { buf.push(n); continue; }
        flush();
        const t = n.tagName;
        if (n.classList.contains('pagebreak')) { out += '<div style="page-break-after: always"></div>\n\n'; continue; }
        if (/^H[1-3]$/.test(t)) out += '#'.repeat(+t[1]) + ' ' + inline([...n.childNodes]).trim() + '\n\n';
        else if (t === 'P' || t === 'LI') { const x = inline([...n.childNodes]).trim(); out += (x || '') + '\n\n'; }
        else if (t === 'PRE') out += '```\n' + n.textContent + '\n```\n\n';
        else if (t === 'HR') out += '---\n\n';
        else if (t === 'BLOCKQUOTE') out += blocks([...n.childNodes]).trim().split('\n').map((l) => '> ' + l).join('\n') + '\n\n';
        else if (t === 'UL' || t === 'OL') out += list(n, depth) + (depth ? '' : '\n');
        else if (t === 'TABLE') {
          const rows = [...n.rows].map((r) => [...r.cells].map((c) => inline([...c.childNodes]).trim().replace(/\|/g, '\\|').replace(/\n/g, ' ')));
          if (rows.length) {
            const w = Math.max(...rows.map((r) => r.length));
            rows.forEach((r) => { while (r.length < w) r.push(''); });
            out += '| ' + rows[0].join(' | ') + ' |\n|' + ' --- |'.repeat(w) + '\n' + rows.slice(1).map((r) => '| ' + r.join(' | ') + ' |').join('\n') + '\n\n';
          }
        } else out += blocks([...n.childNodes], depth);
      }
      flush();
      return out;
    }
    function list(el, depth) {
      let s = '', i = 1;
      for (const li of el.children) {
        const own = [], sub = [];
        for (const n of li.childNodes) (n.nodeType === 1 && (n.tagName === 'UL' || n.tagName === 'OL') ? sub : own).push(n);
        s += '  '.repeat(depth) + (el.tagName === 'OL' ? `${i++}. ` : '- ') + inline(own).trim() + '\n';
        for (const x of sub) s += list(x, depth + 1);
      }
      return s;
    }
    return blocks([...root.childNodes]).replace(/\n{3,}/g, '\n\n').trim() + '\n';
  }
  function fromMarkdown(md) {
    const inl = (s) => {
      let t = esc(s);
      t = t.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, '<img alt="$1" src="$2">');
      t = t.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>');
      t = t.replace(/`([^`]+)`/g, '<code>$1</code>');
      t = t.replace(/\*\*([^*]+)\*\*|__([^_]+)__/g, (_, a, b) => `<strong>${a || b}</strong>`);
      t = t.replace(/\*([^*]+)\*|_([^_\s][^_]*)_/g, (_, a, b) => `<em>${a || b}</em>`);
      t = t.replace(/~~([^~]+)~~/g, '<s>$1</s>');
      t = t.replace(/&lt;(\/?)(u|sup|sub)&gt;/g, '<$1$2>');
      t = t.replace(/\\([\\`*_[\]#|])/g, '$1');
      return t;
    };
    const lines = md.replace(/\r\n?/g, '\n').split('\n');
    let html = '', i = 0, para = [];
    const flush = () => { if (para.length) { html += '<p>' + para.map((l) => inl(l.replace(/ {2,}$/, '')) + (/ {2,}$/.test(l) ? '<br>' : '')).join(' ') + '</p>'; para = []; } };
    while (i < lines.length) {
      const l = lines[i];
      let m;
      if (/^```/.test(l)) { flush(); const buf = []; i++; while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]); i++; html += '<pre>' + esc(buf.join('\n')) + '</pre>'; continue; }
      if ((m = /^(#{1,6})\s+(.*)$/.exec(l))) { flush(); const n = Math.min(3, m[1].length); html += `<h${n}>${inl(m[2])}</h${n}>`; i++; continue; }
      if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(l)) { flush(); html += '<hr>'; i++; continue; }
      if (/page-break-after:\s*always/.test(l)) { flush(); html += '<div class="pagebreak"></div>'; i++; continue; }
      if (/^>\s?/.test(l)) { flush(); const buf = []; while (i < lines.length && /^>\s?/.test(lines[i])) buf.push(lines[i++].replace(/^>\s?/, '')); html += '<blockquote>' + fromMarkdown(buf.join('\n')) + '</blockquote>'; continue; }
      if (/^\s*\|.*\|\s*$/.test(l) && /^\s*\|?\s*:?-{3,}/.test(lines[i + 1] || '')) {
        flush();
        const row = (s) => s.trim().replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map((c) => inl(c.trim()));
        const head = row(l); i += 2;
        let t = '<table><tbody><tr>' + head.map((c) => `<th>${c}</th>`).join('') + '</tr>';
        while (i < lines.length && /^\s*\|/.test(lines[i])) t += '<tr>' + row(lines[i++]).map((c) => `<td>${c}</td>`).join('') + '</tr>';
        html += t + '</tbody></table>'; continue;
      }
      if (/^\s*([-*+]|\d+[.)])\s+/.test(l)) {
        flush();
        const items = [];
        while (i < lines.length && /^\s*([-*+]|\d+[.)])\s+/.test(lines[i])) {
          const mm = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(lines[i++]);
          items.push({ d: Math.floor(mm[1].replace(/\t/g, '    ').length / 2), ol: /\d/.test(mm[2]), t: mm[3] });
        }
        let out = '', stack = [];
        for (const it of items) {
          while (stack.length > it.d + 1) out += `</li></${stack.pop()}>`;
          if (stack.length === it.d + 1) out += '</li>';
          while (stack.length < it.d + 1) { const tag = it.ol ? 'ol' : 'ul'; out += `<${tag}>`; stack.push(tag); }
          out += '<li>' + inl(it.t);
        }
        while (stack.length) out += `</li></${stack.pop()}>`;
        html += out; continue;
      }
      if (!l.trim()) { flush(); i++; continue; }
      para.push(l); i++;
    }
    flush();
    return html;
  }

  // ================= ข้อความล้วน / HTML =================
  const fromText = (t) => t.replace(/\r\n?/g, '\n').split('\n').map((l) => (l ? `<p>${esc(l)}</p>` : '<p><br></p>')).join('');
  function toText(root) {
    const out = [];
    const walk = (nodes) => {
      for (const n of nodes) {
        if (n.nodeType !== 1) continue;
        if (n.classList.contains('pagebreak')) { out.push('\f'); continue; }
        if (n.tagName === 'TABLE') { for (const r of n.rows) out.push([...r.cells].map((c) => c.innerText.trim()).join('\t')); continue; }
        if (n.tagName === 'UL' || n.tagName === 'OL') { let k = 1; for (const li of n.children) out.push((n.tagName === 'OL' ? `${k++}. ` : '• ') + li.innerText.trim()); continue; }
        if (n.tagName === 'HR') { out.push('—'.repeat(20)); continue; }
        if (['DIV', 'BLOCKQUOTE'].includes(n.tagName) && [...n.children].some((c) => BLOCKS.has(c.tagName))) { walk([...n.childNodes]); continue; }
        out.push(n.innerText.replace(/​/g, ''));
      }
    };
    walk([...root.childNodes]);
    return out.join('\n');
  }
  function toHtmlFile(root, title) {
    return `<!doctype html>
<html lang="th">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="Inkloom">
<title>${esc(title)}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Sarabun:ital,wght@0,400;0,700;1,400;1,700&display=swap">
<style>
body { font-family: Sarabun, Tahoma, sans-serif; font-size: 14pt; line-height: 1.5; max-width: 160mm; margin: 2em auto; padding: 0 1em; color: #1b1b1b; }
table { border-collapse: collapse; width: 100%; } td, th { border: 1px solid #888; padding: 4px 6px; vertical-align: top; }
img { max-width: 100%; height: auto; } blockquote { margin-left: 1.2em; padding-left: .8em; border-left: 3px solid #ccc; }
.pagebreak { break-after: page; }
</style>
</head>
<body>
${root.innerHTML.replace(/ contenteditable="false"/g, '')}
</body>
</html>
`;
  }
  function fromHtmlFile(text) {
    const d = new DOMParser().parseFromString(text, 'text/html');
    return { html: d.body ? d.body.innerHTML : text, title: d.title };
  }

  Object.assign(C, { load, toDocx, fromDocx, toMarkdown, fromMarkdown, fromText, toText, toHtmlFile, fromHtmlFile });
})(window.IKC = window.IKC || {});
