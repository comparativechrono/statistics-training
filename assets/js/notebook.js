/* =====================================================================
   The Notebook tab: Jupyter-style notebooks in R – as Jupyter with its R
   kernel (IRkernel).

   · Each notebook is an .ipynb file among the user's files (normally in
     ~/notebooks), saved as it is edited and run – outputs included – so
     it is kept in the browser and can be downloaded and opened in
     Jupyter, JupyterLab, VS Code or Google Colab.
   · Code cells (R) and text cells (Markdown); Jupyter's keyboard keys.
   · The code runs in the notebooks' R (kernels.js): one R for all the
     notebooks, separate from the R console's, RStudio's and the
     terminal's. A notebook written for another language (Python …) can
     be opened and read, but its code cells do not run here.
   ===================================================================== */
(function () {
  'use strict';
  const MG = window.MG;
  const { h, esc, bus, toast, store } = MG;
  const LANGS = () => MG.kernels.LANGS;
  MG.app = MG.app || {};

  /* ------------------------------------------------------------------
     small helpers
     ------------------------------------------------------------------ */
  const uid = () => Math.random().toString(36).slice(2, 10);
  const srcText = (x) => (Array.isArray(x) ? x.join('') : x == null ? '' : String(x));
  const toLines = (s) => {
    const a = String(s).split(/(?<=\n)/);
    return a.length === 1 && a[0] === '' ? [] : a;
  };
  const stripAnsi = (s) => String(s).replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '');
  /** \r and \b in what was printed, as a terminal (and Jupyter) shows them – a progress bar counts over itself: \r goes
      back to the start of the line, \b one character back, and what follows is written over what was there */
  const inPlace = (s) => {
    if (!/[\r\b]/.test(s)) return s;
    let done = '', line = [], at = 0;
    for (const ch of s) {
      if (ch === '\r') at = 0;
      else if (ch === '\b') at = Math.max(0, at - 1);
      else if (ch === '\n') { done += line.join('') + '\n'; line = []; at = 0; }
      else line[at++] = ch;
    }
    return done + line.join('');
  };
  /* a cell that begins with a cell magic (%%bash …): Python's Jupyter kernel has those, R's has none */
  const MAGIC = /^\s*%%([A-Za-z_][\w-]*)/;
  const MAX_TEXT = 400000; // the text a cell shows at most (more is left out)
  const cap = (s) => String(s).charAt(0).toUpperCase() + String(s).slice(1);
  const isR = (lang) => MG.kernels.isR(lang);

  /* HTML from cells (tables, rich output) and Markdown are cleaned before they are shown:
     code from the internet or an AI model could otherwise put scripts or look-alike page elements here. */
  const NUMERIC = /^[\s\-+−]*[\d.,]+(e[-+]?\d+)?\s*%?$|^(NaN|nan|NA|None|True|False|TRUE|FALSE|–|-|inf|-inf|Inf|-Inf)$/i;
  function cleanHtml(html, opts = {}) {
    if (!window.DOMPurify) return esc(html);
    return window.DOMPurify.sanitize(html, Object.assign({ FORBID_TAGS: ['style', 'form', 'input', 'button', 'textarea', 'select', 'iframe', 'script'], FORBID_ATTR: ['style'] }, opts));
  }
  function htmlOutput(html) {
    const box = h('div.nb-html', { html: cleanHtml(html) });
    box.querySelectorAll('td').forEach((td) => {
      if (!NUMERIC.test(td.textContent.trim())) td.classList.add('txt');
    });
    box.querySelectorAll('a[href]').forEach((a) => {
      a.target = '_blank';
      a.rel = 'noopener';
    });
    return box;
  }
  function renderMarkdown(src) {
    let html;
    try {
      html = window.marked ? window.marked.parse(src, { gfm: true, breaks: false }) : '<pre>' + esc(src) + '</pre>';
    } catch (e) {
      html = '<pre>' + esc(src) + '</pre>';
    }
    const box = h('div', { html: cleanHtml(html, { FORBID_TAGS: ['style', 'form', 'input', 'button', 'textarea', 'select', 'iframe', 'script'] }) });
    box.querySelectorAll('a[href]').forEach((a) => {
      if (/^https?:/.test(a.getAttribute('href'))) {
        a.target = '_blank';
        a.rel = 'noopener';
      }
    });
    return box.innerHTML;
  }
  MG.renderMarkdownSafe = renderMarkdown;

  /* ------------------------------------------------------------------
     .ipynb ⇄ the notebook's model
     cell: {id, type: 'code'|'markdown'|'raw', source, outputs[], count, meta}
     output: {type:'stream', name, text} | {type:'display', mime, data, plain?, width?, height?, result?, bundle?}
             | {type:'error', ename, evalue, traceback, hints}
     ------------------------------------------------------------------ */
  /** the language of a notebook, from its metadata: 'r', or the name of another one ('python', 'julia' …). A notebook
      that does not say is taken for R. */
  function langOf(meta) {
    const ks = (meta && meta.kernelspec) || {}, li = (meta && meta.language_info) || {};
    const lang = String(ks.language || li.name || '').trim().toLowerCase();
    const name = String(ks.name || '').trim().toLowerCase();
    if (lang === 'r' || (!lang && /^(ir|r|xr|webr|ark)([-_ .\d]|$)/.test(name))) return 'r';
    if (!lang && !name) return 'r';
    return lang || name.replace(/[-_ .]?\d[\w.]*$/, '') || name;
  }
  const langName = (lang) => (isR(lang) ? 'R' : { python: 'Python', julia: 'Julia', javascript: 'JavaScript', typescript: 'TypeScript', bash: 'Bash' }[lang] || cap(lang));

  const MIME_ORDER = ['image/png', 'image/jpeg', 'image/svg+xml', 'text/html', 'text/markdown', 'text/latex', 'application/json', 'text/plain'];
  function outputFromJupyter(o) {
    if (o.output_type === 'stream') return { type: 'stream', name: o.name === 'stderr' ? 'stderr' : 'stdout', text: stripAnsi(srcText(o.text)) };
    if (o.output_type === 'error') return { type: 'error', ename: o.ename || 'Error', evalue: o.evalue || '', traceback: stripAnsi((o.traceback || []).join('\n')), hints: [] };
    if (o.output_type === 'display_data' || o.output_type === 'execute_result') {
      const data = o.data || {};
      const mime = MIME_ORDER.find((m) => data[m] != null) || Object.keys(data)[0];
      if (!mime) return null;
      let d = data[mime];
      if (mime === 'application/json') d = JSON.stringify(d, null, 2);
      else d = srcText(d);
      const out = { type: 'display', mime: mime === 'application/json' || mime === 'text/latex' ? 'text/plain' : mime, data: mime === 'image/png' || mime === 'image/jpeg' ? d.replace(/\s+/g, '') : d, result: o.output_type === 'execute_result', bundle: data };
      // (the size a picture is shown at)
      const md = (o.metadata && o.metadata[mime]) || {};
      if (Number(md.width) > 0) out.width = Number(md.width);
      if (Number(md.height) > 0) out.height = Number(md.height);
      return out;
    }
    return null;
  }
  function outputToJupyter(o, count) {
    if (o.type === 'stream') return { output_type: 'stream', name: o.name, text: toLines(o.text) };
    if (o.type === 'error') return { output_type: 'error', ename: o.ename || 'Error', evalue: o.evalue || '', traceback: String(o.traceback || '').split('\n') };
    if (o.type === 'display') {
      let data;
      if (o.bundle) data = o.bundle;
      else {
        data = {};
        data[o.mime] = o.mime === 'image/png' || o.mime === 'image/jpeg' ? o.data : toLines(o.data);
        // (what a program that cannot show the picture or the table shows instead – as IRkernel writes it)
        if (o.mime !== 'text/plain') data['text/plain'] = o.plain ? toLines(o.plain) : [o.mime.startsWith('image/') ? 'plot without title' : '<output>'];
      }
      const out = { output_type: o.result ? 'execute_result' : 'display_data', data, metadata: {} };
      if (/^image\//.test(o.mime) && o.width) out.metadata[o.mime] = o.height ? { width: o.width, height: o.height } : { width: o.width };
      if (o.result) out.execution_count = count == null ? null : count;
      return out;
    }
    return null;
  }
  /** an .ipynb text → {lang, foreign, meta, cells, warning} */
  function parseIpynb(text) {
    const nb = JSON.parse(text);
    if (!nb || !Array.isArray(nb.cells)) throw new Error('This file is not a Jupyter notebook (it has no cells).');
    const meta = nb.metadata || {};
    const lang = langOf(meta);
    const foreign = !isR(lang);
    let warning = '';
    if (foreign) {
      const ks = meta.kernelspec || {};
      const what = langName(lang);
      const kern = ks.display_name && ks.display_name !== what ? ` (its kernel is “${ks.display_name}”)` : '';
      warning = `This notebook's code is in ${what}${kern}, not R. The notebooks here run R only, so its code cells cannot be run, but you can still read it, along with the outputs it was saved with.`;
    }
    const cells = nb.cells.map((c) => ({
      id: c.id || uid(),
      type: c.cell_type === 'markdown' ? 'markdown' : c.cell_type === 'raw' ? 'raw' : 'code',
      source: srcText(c.source),
      outputs: c.cell_type === 'code' ? (c.outputs || []).map(outputFromJupyter).filter(Boolean) : [],
      count: c.execution_count == null ? null : c.execution_count,
      meta: c.metadata || {},
      attachments: c.attachments
    }));
    return { lang, foreign, meta, cells, warning };
  }
  /** the model → an .ipynb object (nbformat 4.5). An R notebook says it is for the R kernel (IRkernel's "ir"); a
      notebook of another language keeps what it said */
  function buildIpynb(lang, cells, meta) {
    const m = Object.assign({}, meta || {});
    if (isR(lang)) {
      const L = LANGS().r;
      const K = MG.kernels.peek('r');
      const li = Object.assign({}, L.language_info);
      const before = meta && meta.language_info;
      if (K && K.versions && K.versions.r) li.version = K.versions.r;
      else if (before && before.version && langOf(meta) === 'r') li.version = before.version;
      m.kernelspec = Object.assign({}, L.kernelspec);
      m.language_info = li;
    } else if (!m.kernelspec) {
      m.kernelspec = { name: lang, display_name: langName(lang), language: lang };
      if (!m.language_info) m.language_info = { name: lang };
    }
    m.workbench = Object.assign({}, m.workbench || {}, { made_with: 'R workbench (in the browser)' });
    return {
      cells: cells.map((c) => {
        const base = { cell_type: c.type, id: c.id || uid(), metadata: c.meta || {}, source: toLines(c.source) };
        if (c.type === 'markdown' && c.attachments) base.attachments = c.attachments;
        if (c.type !== 'code') return base;
        return Object.assign(base, { execution_count: c.count == null ? null : c.count, outputs: (c.outputs || []).map((o) => outputToJupyter(o, c.count)).filter(Boolean) });
      }),
      metadata: m,
      nbformat: 4,
      nbformat_minor: 5
    };
  }
  /** for other tabs: make a notebook from a list of cells [{type, source, outputs?}] */
  function makeIpynb(lang, cells, meta) {
    return buildIpynb(lang, cells.map((c) => Object.assign({ id: uid(), type: 'code', source: '', outputs: [], count: null, meta: {} }, c)), meta);
  }
  MG.nbformat = { parse: parseIpynb, build: buildIpynb, make: makeIpynb, outputFromJupyter, outputToJupyter, renderMarkdown, langOf };

  /** the error of a cell that begins with a cell magic (%%bash …) */
  function magicError(name) {
    const shell = /^(bash|sh|script|system|cmd|powershell)$/i.test(name);
    return {
      type: 'error',
      ename: 'Error',
      evalue: `%%${name} is not R`,
      traceback: `Error: the cell begins with %%${name}, which is a cell magic. R does not have cell magics.`,
      hints: [
        shell
          ? `%%${name} cells run shell commands in Python's Jupyter kernel (IPython), but this notebook's kernel is R. Run shell commands in the Terminal tab instead, or work with files from R, using functions such as list.files() and file.copy().`
          : `Cell magics such as %%${name} belong to Python's Jupyter kernel (IPython), and the R kernel does not have any. Remove the first line to run the rest of the cell as R code.`
      ]
    };
  }

  /* ------------------------------------------------------------------
     one open notebook
     ------------------------------------------------------------------ */
  class NotebookView {
    constructor(app, path, doc) {
      this.app = app;
      this.path = path;
      this.lang = isR(doc.lang) ? 'r' : doc.lang;
      this.foreign = !isR(doc.lang);
      this.meta = doc.meta || {};
      this.cells = [];
      this.current = null;
      this.warning = doc.warning || '';
      this.el = h('div.nb-cells', { tabindex: '-1' });
      if (this.foreign) this.el.classList.add('foreign');
      this.el.addEventListener('click', (e) => {
        const c = this.cells.find((x) => x.el.contains(e.target));
        if (c && !e.target.closest('button, a, .CodeMirror, input')) this.select(c, false, true);
      });
      this.endEl = h('div.nb-end');
      const addCode = h('button.tbtn', { type: 'button', html: MG.icon('plus') + '<span>Code</span>', title: 'Add a code cell at the end' });
      const addText = h('button.tbtn', { type: 'button', html: MG.icon('plus') + '<span>Text</span>', title: 'Add a text (Markdown) cell at the end' });
      addCode.addEventListener('click', () => this.addCell({ type: 'code' }, { after: this.cells[this.cells.length - 1], focus: true }));
      addText.addEventListener('click', () => this.addCell({ type: 'markdown' }, { after: this.cells[this.cells.length - 1], focus: true, edit: true }));
      this.endEl.append(addCode, addText);
      this.el.appendChild(this.endEl);
      doc.cells.forEach((c) => this.addCell(c, { noSave: true }));
      if (!this.cells.length) this.addCell({ type: 'code' }, { noSave: true });
      this.select(this.cells[0], false);
      this.dirty = false;
    }
    /** the kernel that runs this notebook: R's – none for a notebook of another language */
    get kernel() {
      return this.foreign ? null : MG.kernels.get('r');
    }
    get langName() {
      return langName(this.lang);
    }
    get folder() {
      return MG.path.dirname(this.path);
    }

    /* ---------------- cells ---------------- */
    addCell(data, opts = {}) {
      const c = {
        id: data.id || uid(),
        type: data.type || 'code',
        outputs: (data.outputs || []).slice(),
        count: data.count == null ? null : data.count,
        meta: data.meta || {},
        attachments: data.attachments,
        el: null,
        cm: null,
        rendered: data.type === 'markdown' && !opts.edit
      };
      const runBtn = h('button.nb-runbtn', { type: 'button', title: 'Run this cell (Shift+Enter)', 'aria-label': 'Run this cell', html: MG.icon('play') });
      runBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.select(c, false);
        this.runCell(c);
      });
      const countEl = h('span.nb-count', c.type === 'code' ? (c.count ? `[${c.count}]` : '[ ]') : '');
      const edBox = h('div.nb-editor');
      const mdView = h('div.nb-md', { title: 'Double-click to edit' });
      mdView.addEventListener('dblclick', () => this.editMarkdown(c));
      const tools = h('div.nb-tools');
      const tb = (icon, title, fn) => {
        const b = h('button.icon-btn', { type: 'button', title, 'aria-label': title, html: MG.icon(icon) });
        b.addEventListener('click', (e) => {
          e.stopPropagation();
          this.select(c, false);
          fn(e);
        });
        tools.appendChild(b);
        return b;
      };
      const ai = h('button.nb-ai', { type: 'button', title: 'Ask the AI assistant about this cell', html: MG.icon('sparkle') + '<span>Ask AI</span>' });
      ai.addEventListener('click', (e) => {
        e.stopPropagation();
        this.select(c, false);
        const items = [
          ['sparkle', 'Explain this code', () => this.app.askAI('explain', this.cellInfo(c))],
          ['sparkle', 'Improve or extend this code', () => this.app.askAI('improve', this.cellInfo(c))]
        ];
        if (c.outputs.some((o) => o.type === 'error')) items.unshift(['sparkle', 'Explain the error and fix it', () => this.app.askAI('fix', this.cellInfo(c))]);
        MG.popmenu(e.currentTarget, items);
      });
      c.aiBtn = ai;
      tools.appendChild(ai);
      tb('dots', 'More actions for this cell: run, change type, move, copy or delete', (e) => {
        const items = [];
        if (!this.foreign) {
          items.push(['fastforward', 'Run the cells above this one', () => this.runAbove(c)]);
          items.push(['fastforward', 'Run this cell and the ones below', () => this.runBelow(c)]);
        }
        items.push(
          c.type === 'code' ? ['text', 'Make it a text (Markdown) cell', () => this.setType(c, 'markdown')] : ['code', 'Make it a code cell', () => this.setType(c, 'code')],
          ['arrowUp', 'Move up', () => this.move(c, -1)],
          ['arrowDown', 'Move down', () => this.move(c, 1)],
          ['plus', 'Add a code cell below', () => this.addCell({ type: 'code' }, { after: c, focus: true })],
          ['plus', 'Add a text cell below', () => this.addCell({ type: 'markdown' }, { after: c, focus: true, edit: true })],
          ['copy', 'Duplicate', () => this.addCell({ type: c.type, source: c.cm.getValue() }, { after: c, focus: true })],
          ['trash', 'Clear the output', () => this.clearOutput(c, true)],
          ['trash', 'Delete the cell', () => this.deleteCell(c)]
        );
        MG.popmenu(e.currentTarget, items);
      });
      const out = h('div.nb-out', { 'aria-live': 'polite' });
      c.el = h('div.nb-cell', { dataset: { id: c.id, type: c.type }, tabindex: '-1' }, h('div.nb-gutter', runBtn, countEl), h('div.nb-main', h('div.nb-edrow', edBox, mdView, tools), out));
      c.countEl = countEl;
      c.outEl = out;
      c.runBtn = runBtn;
      c.edBox = edBox;
      c.mdView = mdView;
      const idx = opts.after ? this.cells.indexOf(opts.after) + 1 : opts.before ? this.cells.indexOf(opts.before) : this.cells.length;
      const ref = this.cells[idx];
      this.cells.splice(idx, 0, c);
      this.el.insertBefore(c.el, ref ? ref.el : this.endEl);
      const indent = this.foreign ? 4 : 2;
      c.cm = window.CodeMirror(edBox, {
        value: data.source || '',
        mode: this._mode(c),
        indentUnit: indent,
        tabSize: 4,
        lineWrapping: true,
        viewportMargin: Infinity,
        matchBrackets: true,
        autoCloseBrackets: c.type === 'code',
        screenReaderLabel: c.type === 'code' ? `${this.langName} code cell` : 'Text cell (Markdown)',
        extraKeys: {
          Esc: () => this.commandMode(c),
          'Shift-Enter': () => this.runCell(c, { advance: true }),
          'Ctrl-Enter': () => this.runCell(c),
          'Cmd-Enter': () => this.runCell(c),
          'Alt-Enter': () => this.runCell(c, { insert: true }),
          'Ctrl-S': () => this.saveNow(true),
          'Cmd-S': () => this.saveNow(true),
          'Ctrl-/': 'toggleComment',
          'Cmd-/': 'toggleComment',
          Tab: (cm) => (cm.somethingSelected() ? cm.indentSelection('add') : cm.replaceSelection(' '.repeat(indent), 'end')),
          'Shift-Tab': (cm) => cm.indentSelection('subtract'),
          Up: (cm) => {
            const cur = cm.getCursor();
            if (cur.line === 0 && cur.ch === 0) return this.focusNeighbour(c, -1);
            return window.CodeMirror.Pass;
          },
          Down: (cm) => {
            const cur = cm.getCursor();
            if (cur.line === cm.lastLine() && cur.ch === cm.getLine(cur.line).length) return this.focusNeighbour(c, 1);
            return window.CodeMirror.Pass;
          }
        }
      });
      c.cm.on('focus', () => this.select(c, false));
      c.cm.on('change', () => this.changed());
      this._showType(c);
      c.outputs.forEach((o) => this._render(c, o));
      if (c.outputs.some((o) => o.type === 'error')) c.el.classList.add('has-error');
      c.el.addEventListener('keydown', (e) => this._cmdKey(e, c));
      if (opts.focus) setTimeout(() => this.select(c, true), 0);
      if (!opts.noSave) this.changed();
      return c;
    }
    _mode(c) {
      if (c.type === 'markdown') return 'markdown';
      if (c.type === 'raw') return null;
      if (this.foreign) return window.CodeMirror.modes && window.CodeMirror.modes[this.lang] ? this.lang : null;
      const src = c.cm ? c.cm.getValue() : '';
      if (/^\s*%%(bash|sh|script)\b/.test(src)) return 'shell';
      return LANGS().r.cm;
    }
    _showType(c) {
      c.el.dataset.type = c.type;
      const md = c.type === 'markdown';
      c.runBtn.hidden = c.type === 'raw';
      c.aiBtn.hidden = md || c.type === 'raw' || this.foreign;
      c.countEl.textContent = c.type === 'code' ? (c.count ? `[${c.count}]` : '[ ]') : '';
      if (md && c.rendered) {
        const src = c.cm.getValue();
        c.mdView.innerHTML = src.trim() ? renderMarkdown(src) : '<p class="nb-md-empty">Empty text cell. Double-click to write in it (Markdown: # heading, **bold**, - list).</p>';
        c.mdView.hidden = false;
        c.edBox.hidden = true;
      } else {
        c.mdView.hidden = true;
        c.edBox.hidden = false;
        const mode = this._mode(c);
        if (c.cm.getOption('mode') !== mode) c.cm.setOption('mode', mode);
        setTimeout(() => c.cm.refresh(), 0);
      }
    }
    setType(c, type) {
      if (c.type === type) return;
      c.type = type;
      c.rendered = false;
      this.clearOutput(c);
      c.count = null;
      c.cm.setOption('autoCloseBrackets', type === 'code');
      this._showType(c);
      c.cm.focus();
      this.changed();
    }
    editMarkdown(c) {
      if (c.type !== 'markdown') return;
      c.rendered = false;
      this._showType(c);
      this.select(c, true);
    }
    cellInfo(c) {
      const err = c.outputs.find((o) => o.type === 'error');
      const text = c.outputs
        .filter((o) => o.type === 'stream' || (o.type === 'display' && o.mime === 'text/plain'))
        .map((o) => o.text || o.data)
        .join('')
        .slice(0, 1500);
      return { id: c.id, lang: this.lang, path: this.path, code: c.cm.getValue(), count: c.count, error: err ? { ename: err.ename, evalue: err.evalue, traceback: err.traceback, hints: err.hints } : null, output: text, hasPlot: c.outputs.some((o) => o.mime === 'image/png'), hasTable: c.outputs.some((o) => o.mime === 'text/html') };
    }
    select(c, focus, keyboard) {
      if (!c) return;
      if (this.current && this.current !== c) this.current.el.classList.remove('sel');
      this.current = c;
      c.el.classList.add('sel');
      if (focus) {
        c.cm.focus();
        c.el.scrollIntoView({ block: 'nearest' });
      } else if (keyboard) c.el.focus({ preventScroll: true });
    }
    focusNeighbour(c, d) {
      const i = this.cells.indexOf(c) + d;
      const n = this.cells[i];
      if (!n) return window.CodeMirror.Pass;
      if (n.type === 'markdown' && n.rendered) {
        this.select(n, false, true);
        n.el.scrollIntoView({ block: 'nearest' });
        return;
      }
      this.select(n, true);
      n.cm.setCursor(d < 0 ? { line: n.cm.lastLine(), ch: 1e6 } : { line: 0, ch: 0 });
    }
    commandMode(c) {
      c.cm.getInputField().blur();
      if (c.type === 'markdown' && !c.rendered && c.cm.getValue().trim()) {
        c.rendered = true;
        this._showType(c);
      }
      this.select(c, false, true);
    }
    /** the same key twice in a row (D D, I I, 0 0) */
    _twice(k) {
      const now = Date.now();
      if (this._key === k && now - this._keyAt < 700) {
        this._key = null;
        return true;
      }
      this._key = k;
      this._keyAt = now;
      return false;
    }
    /* Jupyter's keys for a selected cell (not editing): Enter edit, A/B add above/below, D D delete, M text, Y code,
       ↑ ↓ move, I I stop R, 0 0 restart R, H help */
    _cmdKey(e, c) {
      if (e.target !== c.el || e.altKey) return;
      const k = e.key;
      // (⌘ on a Mac does what Ctrl does)
      if (e.ctrlKey || e.metaKey) {
        if (k === 'Enter') (e.preventDefault(), this.runCell(c));
        else if (k === 's') (e.preventDefault(), this.saveNow(true));
        return;
      }
      if (k === 'Enter' && e.shiftKey) (e.preventDefault(), this.runCell(c, { advance: true }));
      else if (k === 'Enter') {
        e.preventDefault();
        if (c.type === 'markdown') this.editMarkdown(c);
        else this.select(c, true);
      } else if (k === 'a' || k === 'A') (e.preventDefault(), this.addCell({ type: 'code' }, { before: c, focus: true }));
      else if (k === 'b' || k === 'B') (e.preventDefault(), this.addCell({ type: 'code' }, { after: c, focus: true }));
      else if (k === 'm' || k === 'M') (e.preventDefault(), this.setType(c, 'markdown'), this.commandMode(c));
      else if (k === 'y' || k === 'Y') (e.preventDefault(), this.setType(c, 'code'), this.commandMode(c));
      else if (k === 'h' || k === 'H') (e.preventDefault(), this.app.help());
      else if (k === 'ArrowUp' || k === 'k') {
        e.preventDefault();
        const p = this.cells[this.cells.indexOf(c) - 1];
        if (p) (this.select(p, false, true), p.el.scrollIntoView({ block: 'nearest' }));
      } else if (k === 'ArrowDown' || k === 'j') {
        e.preventDefault();
        const n = this.cells[this.cells.indexOf(c) + 1];
        if (n) (this.select(n, false, true), n.el.scrollIntoView({ block: 'nearest' }));
      } else if (k === 'd' || k === 'D') {
        e.preventDefault();
        if (this._twice('d')) this.deleteCell(c);
      } else if (k === 'i' || k === 'I') {
        e.preventDefault();
        if (this._twice('i')) this.app.stop();
      } else if (k === '0') {
        e.preventDefault();
        if (this._twice('0')) this.app.askRestart();
      }
    }
    move(c, d) {
      const i = this.cells.indexOf(c);
      const j = i + d;
      if (j < 0 || j >= this.cells.length) return;
      this.cells.splice(i, 1);
      this.cells.splice(j, 0, c);
      const ref = this.cells[j + 1];
      this.el.insertBefore(c.el, ref ? ref.el : this.endEl);
      c.cm.refresh();
      this.changed();
    }
    deleteCell(c) {
      const i = this.cells.indexOf(c);
      if (i < 0) return;
      const removed = { data: { type: c.type, source: c.cm.getValue(), outputs: c.outputs, count: c.count, meta: c.meta }, i };
      this.cells.splice(i, 1);
      c.el.remove();
      if (!this.cells.length) this.addCell({ type: 'code' });
      const next = this.cells[Math.min(i, this.cells.length - 1)];
      this.select(next, false, true);
      this.changed();
      // a deleted cell can come back (once)
      const t = h('span', { html: 'Cell deleted. ' });
      const undo = h('button.linkbtn', { type: 'button' }, 'Undo');
      undo.addEventListener('click', () => {
        const before = this.cells[removed.i];
        const nc = this.addCell(removed.data, before ? { before } : {});
        this.select(nc, false, true);
      });
      t.appendChild(undo);
      toastNode(t);
    }
    clearOutput(c, save) {
      c.outputs = [];
      c.outEl.innerHTML = '';
      c.el.classList.remove('has-error');
      c.cut = false;
      c.chars = 0;
      if (save) this.changed();
    }
    clearAll() {
      this.cells.forEach((c) => {
        this.clearOutput(c);
        c.count = null;
        this._showType(c);
      });
      this.changed();
    }

    /* ---------------- running ---------------- */
    runCell(c, opts = {}) {
      if (opts.advance) {
        const i = this.cells.indexOf(c);
        const next = this.cells[i + 1] || this.addCell({ type: 'code' }, { after: c });
        setTimeout(() => (next.type === 'markdown' && next.rendered ? this.select(next, false, true) : this.select(next, true)), 0);
      } else if (opts.insert) {
        const n = this.addCell({ type: 'code' }, { after: c });
        setTimeout(() => this.select(n, true), 0);
      }
      if (c.type === 'markdown') {
        c.rendered = true;
        this._showType(c);
        this.changed();
        if (!opts.advance && !opts.insert) this.select(c, false, true);
        return Promise.resolve();
      }
      if (c.type === 'raw') return Promise.resolve();
      if (this.foreign) return this.app.foreignNote(this);
      return this.app.enqueue(this, c);
    }
    runAll() {
      if (this.foreign) return this.app.foreignNote(this);
      this.cells.forEach((c) => (c.type === 'markdown' ? ((c.rendered = true), this._showType(c)) : c.type === 'code' && this.app.enqueue(this, c)));
      return this.app.queue;
    }
    runAbove(c) {
      if (this.foreign) return this.app.foreignNote(this);
      const i = this.cells.indexOf(c);
      this.cells.slice(0, i).forEach((x) => x.type === 'code' && this.app.enqueue(this, x));
      return this.app.queue;
    }
    runBelow(c) {
      if (this.foreign) return this.app.foreignNote(this);
      const i = this.cells.indexOf(c);
      this.cells.slice(Math.max(0, i)).forEach((x) => (x.type === 'markdown' ? ((x.rendered = true), this._showType(x)) : x.type === 'code' && this.app.enqueue(this, x)));
      return this.app.queue;
    }
    /** run one cell (called by the app's queue) → the kernel's result, or null if the cell did not run */
    async _run(c, gen) {
      c.queued = false;
      if (gen !== this.app.gen || !this.cells.includes(c)) {
        c.countEl.textContent = c.count ? `[${c.count}]` : '[ ]';
        return null;
      }
      const code = c.cm.getValue();
      this.clearOutput(c);
      if (!code.trim()) {
        // (an empty cell: there is nothing to run, as in Jupyter)
        c.count = null;
        c.countEl.textContent = '[ ]';
        this.changed();
        return { ok: true, secs: 0, empty: true };
      }
      c.el.classList.add('running');
      c.countEl.textContent = '[*]';
      this.app.setRunning(this, c);
      const t0 = performance.now();
      let res = null;
      const magic = MAGIC.exec(code);
      if (magic) {
        this._append(c, magicError(magic[1]));
        res = { ok: false };
      } else {
        const handlers = {
          onOutput: (o) => this._append(c, o),
          onInput: (req) => this._askInput(c, req),
          onInputEnd: (req) => this._inputDone(c, req)
        };
        try {
          res = await this.kernel.run(code, handlers, this.folder);
        } catch (e) {
          const why = (e && e.message) || String(e);
          this._append(c, { type: 'error', ename: 'R could not start', evalue: why, traceback: `R could not start: ${why}`, hints: ['R is downloaded into the browser the first time it is used. Check your internet connection, then press Restart to try again.'] });
          res = { ok: false };
        }
      }
      c.el.classList.remove('running');
      if (res && res.restarted) {
        // (R was restarted while the cell ran: it did not finish)
        c.countEl.textContent = c.count ? `[${c.count}]` : '[ ]';
      } else {
        c.count = this.app.nextCount();
        c.countEl.textContent = `[${c.count}]`;
      }
      const secs = (performance.now() - t0) / 1000;
      this.app.setRunning(this, null, secs);
      this.changed(true);
      // (an error stops the cells that wait to run after it, as in Jupyter)
      if (!(res && res.ok) && gen === this.app.gen) this.app.stopQueue();
      if (res && res.restarted) return res;
      const err = c.outputs.find((o) => o.type === 'error');
      bus.emit('nb:run', {
        id: c.id,
        lang: this.lang,
        path: this.path,
        code,
        ok: !!(res && res.ok),
        error: err ? err.ename : '',
        plot: c.outputs.some((o) => o.mime === 'image/png'),
        table: c.outputs.some((o) => o.mime === 'text/html'),
        secs,
        text: c.outputs.filter((o) => o.type === 'stream' || o.mime === 'text/plain').map((o) => o.text || o.data).join('').slice(0, 4000)
      });
      return res;
    }
    /* readline(), menu(), browser(): R waits for an answer – a box under the cell, as in Jupyter */
    _askInput(c, req) {
      const box = h('div.nb-input');
      const field = h('input.nb-input-f', { type: 'text', spellcheck: 'false', autocomplete: 'off', autocapitalize: 'off', 'aria-label': 'Your answer to R: ' + req.prompt.trim() });
      const tip = req.kind === 'browser' ? 'Debugging: n runs the next line, c continues and Q stops. Press Enter to send.' : 'Press Enter to send your answer';
      box.append(h('span.nb-input-p', req.prompt), field, h('span.nb-input-h', tip));
      c.outEl.appendChild(box);
      req.box = box;
      field.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key !== 'Enter') return;
        e.preventDefault();
        const text = field.value;
        box.remove();
        req.box = null;
        this._append(c, { type: 'stream', name: 'stdout', text: req.prompt + text + '\n' });
        req.answer(text);
      });
      this.app.status('R is waiting for your answer');
      setTimeout(() => {
        if (box.isConnected) {
          field.focus({ preventScroll: true });
          box.scrollIntoView({ block: 'nearest' });
        }
      }, 0);
    }
    _inputDone(c, req) {
      if (req.box) req.box.remove();
      req.box = null;
    }

    /* ---------------- outputs ---------------- */
    _append(c, o) {
      if (o.type === 'stream') {
        o = Object.assign({}, o, { text: stripAnsi(o.text) });
        // (a terminal's control codes and nothing else – cli's "show the cursor": nothing to show)
        if (!o.text) return;
        // (a cell that prints a great deal: the rest is left out)
        c.chars = (c.chars || 0) + o.text.length;
        if (c.chars > MAX_TEXT) {
          if (c.cut) return;
          c.cut = true;
          o = { type: 'stream', name: 'stderr', text: '\n… the cell printed more than this, so the rest is not shown.\n' };
        }
      }
      const prev = c.outputs[c.outputs.length - 1];
      if (o.type === 'stream' && prev && prev.type === 'stream' && prev.name === o.name) {
        // (a \r or \b goes on from the line that the earlier output ended with)
        const edit = /[\r\b]/.test(o.text);
        prev.text = edit ? inPlace(prev.text + o.text) : prev.text + o.text;
        // (the last output's node: an answer box for readline() may come after it)
        let last = c.outEl.lastElementChild;
        if (last && last.classList.contains('nb-input')) last = last.previousElementSibling;
        if (last && last.classList.contains('nb-stream') && last.dataset.name === o.name) {
          if (edit) last.textContent = prev.text;
          else last.appendChild(document.createTextNode(o.text));
        } else this._render(c, o);
        return;
      }
      if (o.type === 'stream') o.text = inPlace(o.text);
      c.outputs.push(o);
      this._render(c, o);
    }
    _render(c, o) {
      const box = c.outEl;
      const before = box.querySelector(':scope > .nb-input');
      const add = (node) => (before ? box.insertBefore(node, before) : box.appendChild(node));
      if (o.type === 'stream') {
        add(h('pre.nb-stream' + (o.name === 'stderr' ? '.err' : ''), { dataset: { name: o.name } }, o.text));
      } else if (o.type === 'display') {
        if (o.mime === 'image/png' || o.mime === 'image/jpeg') {
          const img = h('img.nb-img', { src: `data:${o.mime};base64,` + o.data, alt: 'Plot' });
          if (o.width) img.style.width = o.width + 'px';
          const dl = h('button.icon-btn.nb-imgdl', { type: 'button', title: 'Save this picture as a PNG file', 'aria-label': 'Save this picture as a PNG file', html: MG.icon('download') });
          dl.addEventListener('click', () => {
            const a = h('a', { href: img.src, download: 'plot.' + (o.mime === 'image/jpeg' ? 'jpg' : 'png') });
            document.body.appendChild(a);
            a.click();
            a.remove();
          });
          add(h('div.nb-figure', img, dl));
        } else if (o.mime === 'image/svg+xml') {
          add(h('div.nb-svg', { html: window.DOMPurify ? window.DOMPurify.sanitize(o.data, { USE_PROFILES: { svg: true, svgFilters: true } }) : '' }));
        } else if (o.mime === 'text/html') add(htmlOutput(o.data));
        else if (o.mime === 'text/markdown') add(h('div.nb-md.nb-mdout', { html: renderMarkdown(o.data) }));
        else add(h('pre.nb-text', o.data));
      } else if (o.type === 'error') {
        c.el.classList.add('has-error');
        const acts = h('div.nb-err-actions');
        if (!this.foreign) {
          const fix = h('button.btn.small.nb-fix', { type: 'button', html: MG.icon('sparkle') + '<span>Ask the AI to explain this error</span>' });
          fix.addEventListener('click', () => this.app.askAI('fix', this.cellInfo(c)));
          acts.appendChild(fix);
        }
        const hints = (o.hints || []).map((t) => h('div.nb-hint', '💡 ' + t));
        add(h('div.nb-error', h('pre', o.traceback || o.ename + ': ' + o.evalue), hints, acts));
      }
    }

    /* ---------------- saving: the .ipynb file ---------------- */
    toIpynb() {
      return buildIpynb(
        this.lang,
        this.cells.map((c) => ({ id: c.id, type: c.type, source: c.cm.getValue(), outputs: c.outputs, count: c.count, meta: c.meta, attachments: c.attachments })),
        this.meta
      );
    }
    changed(now) {
      this.dirty = true;
      this.app.saveState(this, 'unsaved');
      clearTimeout(this._st);
      const big = this._lastSize > 1.5e6;
      this._st = setTimeout(() => this.saveNow(), now ? 150 : big ? 2500 : 800);
    }
    saveNow(user) {
      clearTimeout(this._st);
      const F = MG.app.fs;
      if (this.gone) return;
      const text = JSON.stringify(this.toIpynb(), null, 1);
      this._lastSize = text.length;
      try {
        this._saving = true;
        try {
          F.writeText(this.path, text);
        } finally {
          this._saving = false;
        }
        this.written = F.get(this.path);
        this.dirty = false;
        this.app.saveState(this, 'saved');
        if (user) toast(`Saved <b>${esc(F.pretty(this.path))}</b>. It is kept in this browser, and Download saves a copy on your computer.`, 'ok', 2500);
        bus.emit('nb:saved', { path: this.path });
      } catch (e) {
        this.app.saveState(this, 'error');
        toast('The notebook could not be saved: ' + esc(e.message), 'error');
      }
    }
    refresh() {
      this.cells.forEach((c) => c.cm.refresh());
    }
    insertCode(code, opts = {}) {
      const last = this.cells[this.cells.length - 1];
      let c;
      // (an empty code cell at the end takes the code)
      if ((opts.type || 'code') === 'code' && last && last.type === 'code' && !last.cm.getValue().trim() && !last.outputs.length) {
        c = last;
        c.cm.setValue(code);
      } else c = this.addCell({ type: opts.type || 'code', source: code }, { after: last });
      if (opts.type === 'markdown') {
        c.rendered = true;
        this._showType(c);
      }
      this.select(c, false);
      setTimeout(() => {
        c.el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        c.el.classList.add('flash');
        setTimeout(() => c.el.classList.remove('flash'), 1400);
        c.cm.refresh();
      }, 50);
      this.changed();
      if (opts.run) return this.runCell(c).then(() => c);
      return Promise.resolve(c);
    }
    codeContext(maxChars = 5000) {
      const parts = this.cells
        .filter((c) => c.type === 'code')
        .map((c, i) => `# cell ${i + 1}${c.count ? ` [ran as ${c.count}]` : ''}\n${c.cm.getValue().trim()}`)
        .filter((s) => s.split('\n').length > 1 || s.length > 12);
      let s = parts.join('\n\n');
      if (s.length > maxChars) s = '…\n' + s.slice(-maxChars);
      return s;
    }
    destroy() {
      clearTimeout(this._st);
      this.el.remove();
    }
  }

  function toastNode(node) {
    const id = 'tn' + uid();
    MG.toast(`<span id="${id}"></span>`, null, 6000);
    setTimeout(() => {
      const slot = document.getElementById(id);
      if (slot) slot.replaceWith(node);
    }, 0);
  }

  /* ------------------------------------------------------------------
     the tab: notebooks, R, toolbar
     ------------------------------------------------------------------ */
  class NotebookApp {
    constructor(root, opts = {}) {
      this.root = root;
      this.fs = opts.fs || MG.app.fs;
      this.dir = opts.dir || MG.app.HOME + '/notebooks';
      this.views = new Map(); // path → NotebookView
      this.view = null;
      this.queue = Promise.resolve();
      this.gen = 0; // cells queued before a restart (or an error) do not run
      this.count = 0; // the cells run since R started: [1], [2] …
      this._build();
      this._watch();
      bus.on('kernel:state', (d) => {
        if (d.state === 'restarted') this.count = 0;
        this._kernelPill();
      });
      bus.on('kernel:status', () => this._kernelPill());
      bus.on('r:installed', (d) => {
        if (d.kind !== 'notebook') return;
        const pk = [].concat(d.pkgs || []);
        if (pk.length) toast(`Installed <b>${esc(pk.join(', '))}</b>. Load it with library(${esc(pk[0])}), here or in any other R session in the workbench.`, 'ok', 5000);
      });
    }

    _build() {
      const R = this.root;
      R.classList.add('nb');
      const btn = (icon, label, title, fn, cls) => {
        const b = h('button.tbtn' + (cls || ''), { type: 'button', title, 'aria-label': label ? null : title, html: MG.icon(icon) + (label ? '<span>' + esc(label) + '</span>' : '') });
        b.addEventListener('click', fn);
        return b;
      };
      this.listBtn = btn('notebook', 'Notebooks', 'Open another notebook, or start a new one', (e) => this.notebookMenu(e.currentTarget), '.nb-listbtn');
      this.titleEl = h('input.nb-name', { type: 'text', spellcheck: 'false', 'aria-label': 'Notebook name', title: 'The notebook\'s file name – click to rename' });
      this.titleEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') this.titleEl.blur();
        if (e.key === 'Escape') {
          this.titleEl.value = this.view ? MG.path.basename(this.view.path) : '';
          this.titleEl.blur();
        }
      });
      this.titleEl.addEventListener('change', () => this.rename(this.titleEl.value));
      this.saveEl = h('span.nb-save');
      this.kernelEl = h('button.nb-kernel', { type: 'button', title: 'The notebooks\' R session (click for options)' });
      this.kernelEl.addEventListener('click', (e) => this.kernelMenu(e.currentTarget));
      this.statusEl = h('span.nb-status', { 'aria-live': 'polite' });
      this.runBtn = btn('play', 'Run', 'Run the selected cell and move to the next one (Shift+Enter)', () => this.view && this.view.current && this.view.runCell(this.view.current, { advance: true }));
      this.stopBtn = btn('stopsq', 'Stop', 'Stop the running cell (I I). This interrupts R, which keeps its variables.', () => this.stop(), '.nb-stopbtn');
      this.stopBtn.hidden = true;
      const bar = h('div.nb-bar', this.listBtn, h('div.nb-namebox', this.titleEl, this.saveEl), h('span.grow'), this.statusEl, this.kernelEl);
      const bar2 = h(
        'div.nb-bar.nb-bar2',
        btn('plus', 'Code', 'Add a code cell below the selected one (B)', () => this.view && this.view.addCell({ type: 'code' }, { after: this.view.current, focus: true })),
        btn('plus', 'Text', 'Add a text (Markdown) cell below the selected one', () => this.view && this.view.addCell({ type: 'markdown' }, { after: this.view.current, focus: true, edit: true })),
        h('span.nb-sep'),
        this.runBtn,
        (this.runAllBtn = btn('fastforward', 'Run all', 'Run every cell from the top', () => this.view && this.view.runAll())),
        this.stopBtn,
        btn('reset', 'Restart', 'Restart R with an empty memory (0 0)', () => this.askRestart()),
        h('span.grow'),
        btn('list', 'Variables', 'Show the variables in the notebooks\' R session', () => this.showVars(), '.nb-varsbtn'),
        btn('download', 'Download', 'Download this notebook (.ipynb, R script or web page)', (e) => this.downloadMenu(e.currentTarget)),
        btn('help', '', 'Help for notebooks (H)', () => this.help())
      );
      this.banner = h('div.nb-banner', { hidden: true });
      this.body = h('div.nb-body');
      R.append(bar, bar2, this.banner, this.body);
      // drop .ipynb files onto the notebook to open them
      R.addEventListener('dragover', (e) => {
        if (e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files')) {
          e.preventDefault();
          R.classList.add('dropping');
        }
      });
      R.addEventListener('dragleave', (e) => {
        if (!R.contains(e.relatedTarget)) R.classList.remove('dropping');
      });
      R.addEventListener('drop', async (e) => {
        R.classList.remove('dropping');
        const files = Array.from((e.dataTransfer && e.dataTransfer.files) || []);
        if (!files.length) return;
        e.preventDefault();
        const nbs = files.filter((f) => /\.ipynb$/i.test(f.name));
        if (!nbs.length) {
          const paths = await MG.project.addFiles(this.fs, this.view ? this.view.folder : MG.app.HOME, files);
          if (paths.length) toast(`Added ${paths.length} file${paths.length === 1 ? '' : 's'} next to the notebook (${esc(this.fs.pretty(MG.path.dirname(paths[0])))}).`, 'ok');
          return;
        }
        for (const f of nbs) await this.importFile(f);
      });
    }

    /* ---------------- the notebook files ---------------- */
    list() {
      const out = [];
      for (const [p, e] of this.fs.entries) if (e.kind !== 'dir' && /\.ipynb$/i.test(p) && p.startsWith(MG.app.HOME + '/') && !/\/\.ipynb_checkpoints\//.test(p)) out.push({ path: p, mtime: e.mtime || 0 });
      return out.sort((a, b) => b.mtime - a.mtime);
    }
    async open(path, opts = {}) {
      path = this.fs.resolve(path);
      if (this.view && this.view.path === path) return this.view;
      let v = this.views.get(path);
      if (!v || v.gone) {
        let doc;
        try {
          doc = parseIpynb(await this.fs.readText(path));
        } catch (e) {
          toast(`<b>${esc(this.fs.pretty(path))}</b> could not be opened as a notebook: ${esc(e.message)}`, 'error', 8000);
          return null;
        }
        v = new NotebookView(this, path, doc);
        v.written = this.fs.get(path);
        this.views.set(path, v);
      }
      if (this.view) {
        this.view.el.remove();
        if (this.view.dirty) this.view.saveNow();
      }
      this.view = v;
      this.body.appendChild(v.el);
      this.root.classList.toggle('foreign', v.foreign);
      // (a notebook in another language does not run here)
      this.runBtn.disabled = this.runAllBtn.disabled = v.foreign;
      this.titleEl.value = MG.path.basename(path);
      this.titleEl.title = this.fs.pretty(path) + ' – click to rename';
      this.saveState(v, v.dirty ? 'unsaved' : 'saved');
      this._banner();
      this._kernelPill();
      setTimeout(() => v.refresh(), 0);
      store.set('nbOpen', path);
      bus.emit('nb:open', { path, lang: v.lang });
      // R starts in the background – in the notebook's folder – the first time a notebook is open
      if (!opts.noStart && !v.foreign) setTimeout(() => MG.kernels.get('r').ensure(v.folder).catch(() => {}), opts.delay || 400);
      return v;
    }
    _banner() {
      const v = this.view;
      this.banner.className = 'nb-banner';
      if (v && v.gone) {
        this.banner.hidden = false;
        this.banner.innerHTML = `${MG.icon('warning')}<span>This notebook's file was deleted or moved. </span>`;
        const again = h('button.btn.small', { type: 'button' }, 'Save it again');
        again.addEventListener('click', () => {
          v.gone = false;
          v.saveNow(true);
          this._banner();
        });
        this.banner.appendChild(again);
      } else if (v && v.warning) {
        this.banner.hidden = false;
        if (v.foreign) this.banner.classList.add('foreign');
        this.banner.innerHTML = `${MG.icon('warning')}<span>${esc(v.warning)}</span>`;
      } else this.banner.hidden = true;
    }
    /** a free name in a folder: Untitled.ipynb, Untitled1.ipynb … */
    freeName(folder, stem, ext = '.ipynb') {
      let p = `${folder}/${stem}${ext}`;
      for (let i = 1; this.fs.exists(p); i++) p = `${folder}/${stem}${i}${ext}`;
      return p;
    }
    /** a new R notebook (lang: 'r' – the only language here) */
    async newNotebook(lang, opts = {}) {
      this.fs.mkdirp(this.dir);
      const path = opts.path || this.freeName(this.dir, opts.stem || 'Untitled');
      const cells = opts.cells || [{ type: 'code', source: '' }];
      this.fs.writeText(path, JSON.stringify(makeIpynb('r', cells), null, 1));
      const v = await this.open(path);
      if (v && !opts.cells) v.select(v.cells[0], true);
      return v;
    }
    async importFile(file) {
      this.fs.mkdirp(this.dir);
      const text = await file.text();
      let doc;
      try {
        doc = parseIpynb(text);
      } catch (e) {
        toast(`<b>${esc(file.name)}</b> could not be read as a notebook.`, 'error');
        return null;
      }
      const stem = file.name.replace(/\.ipynb$/i, '').replace(/[\/\\]/g, '_');
      const path = this.freeName(this.dir, stem);
      this.fs.writeText(path, text);
      toast(`Opened <b>${esc(file.name)}</b> and saved it as ${esc(this.fs.pretty(path))}.${doc.foreign ? '' : ' Run its cells to recreate the results.'}`, 'ok', 6000);
      return this.open(path);
    }
    openFromComputer() {
      const inp = h('input', { type: 'file', accept: '.ipynb,application/x-ipynb+json,application/json', multiple: true, style: { display: 'none' } });
      document.body.appendChild(inp);
      inp.addEventListener('change', async () => {
        const files = Array.from(inp.files || []);
        inp.remove();
        for (const f of files) await this.importFile(f);
      });
      inp.click();
    }
    rename(name) {
      const v = this.view;
      if (!v) return;
      name = String(name || '').trim().replace(/[\/\\]/g, '_');
      if (!name) {
        this.titleEl.value = MG.path.basename(v.path);
        return;
      }
      if (!/\.ipynb$/i.test(name)) name += '.ipynb';
      const to = MG.path.dirname(v.path) + '/' + name;
      if (to === v.path) return;
      if (this.fs.exists(to)) {
        toast(`There is already a file called <b>${esc(name)}</b> here.`, 'warn');
        this.titleEl.value = MG.path.basename(v.path);
        return;
      }
      if (v.dirty) v.saveNow();
      this._renaming = true;
      try {
        this.fs.rename(v.path, to);
      } finally {
        this._renaming = false;
      }
      this.views.delete(v.path);
      v.path = to;
      v.written = this.fs.get(to);
      this.views.set(to, v);
      this.titleEl.value = name;
      store.set('nbOpen', to);
      toast(`Renamed to <b>${esc(name)}</b>.`, 'ok', 2000);
    }
    /** files changed by other tabs (an upload, the terminal, the AI): an open notebook follows its file */
    _watch() {
      this.fs.onChange((path, what) => {
        if (this._renaming || !/\.ipynb$/i.test(path)) return;
        const v = this.views.get(path);
        if (what === 'rename' && !v) {
          // a notebook moved (mv in the terminal, rename in Files): follow it
          const e = this.fs.get(path);
          for (const [p, x] of this.views) {
            if (x.written === e && p !== path) {
              this.views.delete(p);
              x.path = path;
              x.gone = false;
              this.views.set(path, x);
              if (x === this.view) {
                this.titleEl.value = MG.path.basename(path);
                store.set('nbOpen', path);
                this._banner();
              }
            }
          }
          return;
        }
        if (!v) return;
        if (what === 'remove') {
          setTimeout(() => {
            if (!this.fs.exists(v.path)) {
              v.gone = true;
              if (v === this.view) this._banner();
            }
          }, 30);
          return;
        }
        if (what === 'write' && !v._saving && this.fs.get(path) !== v.written) this._external(v);
      });
    }
    async _external(v) {
      const e = this.fs.get(v.path);
      if (!e || e === v.written) return;
      if (v.dirty) {
        toast(`<b>${esc(this.fs.pretty(v.path))}</b> was changed somewhere else while you were editing it here. Your version is kept. If you want to keep both versions, rename this one by clicking its name.`, 'warn', 9000);
        v.written = e;
        return;
      }
      let doc;
      try {
        doc = parseIpynb(await this.fs.readText(v.path));
      } catch (err) {
        return;
      }
      const nv = new NotebookView(this, v.path, doc);
      nv.written = this.fs.get(v.path);
      this.views.set(v.path, nv);
      if (v === this.view) {
        v.destroy();
        this.view = null;
        await this.open(nv.path, { noStart: true });
        toast('This notebook was changed in another tab of the workbench, so the new version is now shown.', null, 4000);
      } else v.destroy();
    }

    /* ---------------- menus ---------------- */
    notebookMenu(anchor) {
      const items = [
        ['plus', 'New notebook', () => this.newNotebook('r')],
        ['upload', 'Open a notebook from my computer…', () => this.openFromComputer()]
      ];
      const nbs = this.list().slice(0, 14);
      nbs.forEach((n) => items.push(['notebook', (this.view && this.view.path === n.path ? '● ' : '') + this.fs.pretty(n.path), () => this.open(n.path)]));
      if (this.list().length > 14) items.push(['folder', 'All my files…', () => MG.app.showWorkbench('editor')]);
      if (this.view) {
        items.push(['copy', 'Make a copy of this notebook', () => this.duplicate()]);
        items.push(['folder', 'Show this notebook in Files', () => MG.app.revealFile && MG.app.revealFile(this.view.path)]);
        items.push(['trash', 'Delete this notebook…', () => this.deleteNotebook()]);
      }
      MG.popmenu(anchor, items);
    }
    downloadMenu(anchor) {
      const v = this.view;
      if (!v) return;
      const items = [['download', 'Jupyter notebook (.ipynb)', () => this.downloadIpynb()]];
      if (!v.foreign) items.push(['code', 'R script (.R)', () => this.downloadScript()]);
      items.push(['globe', 'Web page with the results (.html)', () => this.downloadHtml()]);
      MG.popmenu(anchor, items);
    }
    kernelMenu(anchor) {
      const v = this.view;
      if (!v) return;
      const items = [];
      if (v.foreign) {
        items.push(['info', `About this ${v.langName} notebook`, () => this.foreignNote(v, true)]);
        items.push(['trash', 'Clear all outputs', () => v.clearAll()]);
        MG.popmenu(anchor, items);
        return;
      }
      const K = MG.kernels.get('r');
      if (K.state !== 'ready' && K.state !== 'loading') items.push(['play', 'Start R', () => K.ensure(v.folder).catch(() => {})]);
      if (K.busy) items.push(['stopsq', 'Stop the running cell (interrupt R)', () => this.stop()]);
      items.push(['reset', 'Restart R (forget all variables)', () => this.askRestart()]);
      items.push(['fastforward', 'Restart R and run all cells', () => this.askRestart(true)]);
      items.push(['trash', 'Clear all outputs', () => v.clearAll()]);
      items.push(['list', 'Variables', () => this.showVars()]);
      items.push(['info', 'About the notebooks\' R session', () => this.about()]);
      MG.popmenu(anchor, items);
    }
    _kernelPill() {
      const v = this.view;
      if (!v) return;
      const el = this.kernelEl;
      if (v.foreign) {
        el.dataset.state = 'foreign';
        el.innerHTML = `<span class="nb-lang">${esc(v.langName)}</span><span class="nb-ktext">cannot run here</span>`;
        el.title = `This is a ${v.langName} notebook, but the notebooks here run R only.\nClick for options.`;
        return;
      }
      const K = MG.kernels.peek('r');
      let state = 'off', text = 'R · not started', tip = 'R starts when a notebook is opened or when you run a cell.';
      if (K) {
        if (K.state === 'ready') {
          state = K.waitingInput ? 'input' : K.busy ? 'busy' : 'idle';
          text = `R ${(K.versions && K.versions.r) || ''}`.trim();
          tip = `${K.describe()}. ${state === 'input' ? 'R is waiting for an answer.' : state === 'busy' ? 'R is busy.' : 'R is idle.'}`;
        } else if (K.state === 'loading') {
          state = 'loading';
          text = `R · ${(K.statusText || 'starting…').replace(/…$/, '')}…`;
          tip = 'R is starting. The first time, it has to be downloaded into the browser.';
        } else if (K.state === 'failed') {
          state = 'bad';
          text = 'R could not start';
          tip = K.statusText || text;
        } else if (K.state === 'ended') {
          state = 'bad';
          text = 'R has stopped';
          tip = 'Run a cell or press Restart to start a new R session.';
        }
      }
      const dot = { idle: 'ok', busy: 'busy', input: 'busy', loading: 'busy', bad: 'bad' }[state] || 'off';
      el.dataset.state = state;
      el.innerHTML = `<span class="kdot ${dot}"></span><span class="nb-ktext">${esc(text)}</span>${MG.icon('chevD')}`;
      el.title = tip + '\nClick for options.';
    }
    saveState(v, state) {
      if (v !== this.view) return;
      this.saveEl.dataset.state = state;
      this.saveEl.textContent = state === 'saved' ? 'Saved' : state === 'unsaved' ? 'Editing…' : 'Not saved';
      this.saveEl.title = state === 'saved' ? 'Saved with your files, which are kept in this browser' : '';
    }
    status(html) {
      this.statusEl.innerHTML = html || '';
    }
    /** the cells of a notebook in another language do not run here */
    foreignNote(v, always) {
      const msg = `This is a ${esc(v.langName)} notebook. The notebooks here run R, so its code cannot be run here. To run it, open it in Jupyter (or another program with a ${esc(v.langName)} kernel).`;
      if (always) MG.modal(`A ${v.langName} notebook`, `<p>${msg}</p><p>You can still read it, see the outputs it was saved with and edit its text. It will be saved as a ${esc(v.langName)} notebook.</p>`);
      else toast(msg, 'warn', 6000);
      return Promise.resolve();
    }

    /* ---------------- running ---------------- */
    nextCount() {
      return ++this.count;
    }
    enqueue(view, c) {
      if (view.foreign) return Promise.resolve();
      const gen = this.gen;
      c.queued = true;
      if (!c.el.classList.contains('running')) c.countEl.textContent = '[*]';
      this.queue = this.queue.then(() => view._run(c, gen)).catch((e) => console.error(e));
      return this.queue;
    }
    /** the cells waiting to run do not run (after an error, a restart) */
    stopQueue() {
      this.gen++;
      for (const x of this.views.values())
        x.cells.forEach((c) => {
          if (!c.queued) return;
          c.queued = false;
          c.countEl.textContent = c.count ? `[${c.count}]` : '[ ]';
        });
    }
    setRunning(view, c, secs) {
      this.running = c ? { view, c } : null;
      this.stopBtn.hidden = !c;
      this.runBtn.hidden = !!c;
      clearInterval(this._timer);
      if (c) {
        const t0 = performance.now();
        const tick = () => {
          const K = MG.kernels.peek('r');
          const s = Math.round((performance.now() - t0) / 1000);
          if (K && K.state === 'loading') this.status(`<span class="spinner small"></span> waiting for R to start… ${s} s`);
          else if (K && K.waitingInput) this.status('R is waiting for your answer');
          else if (s >= 2) this.status(`<span class="spinner small"></span> running… ${s} s`);
          else this.status('');
        };
        tick();
        this._timer = setInterval(tick, 500);
      } else this.status(secs > 3 ? `last cell: ${secs.toFixed(1)} s` : '');
      this._kernelPill();
    }
    /** Stop: R is interrupted – the cell stops, R keeps its variables */
    stop() {
      const r = this.running;
      const K = MG.kernels.peek('r');
      if (!r || !K) return;
      if (K.state === 'loading') {
        // (R is still starting: the cells waiting for it do not run)
        this.stopQueue();
        K.cancelWaiting();
        toast('Cancelled. The cells that were waiting will not run, but R is still starting.', null, 3500);
        return;
      }
      if (K.state !== 'ready') return;
      if (K.interrupt()) {
        this.status('<span class="spinner small"></span> stopping…');
        return;
      }
      const m = MG.modal(
        'Stop the running cell?',
        `<p>In this browser, R cannot be interrupted, because the page is not cross-origin isolated. The only way to stop the cell is to restart R, which loses all its variables (your files are not affected).</p><div class="prompt-actions"><button class="btn" data-x="no" type="button">Let it run</button><button class="btn danger" data-x="yes" type="button">Restart R</button></div>`
      );
      m.box.querySelector('[data-x="no"]').addEventListener('click', () => m.close());
      m.box.querySelector('[data-x="yes"]').addEventListener('click', () => {
        m.close();
        this.restart();
      });
    }
    /** Restart, as the toolbar and 0 0 ask for it: R's memory is lost, so the user says yes first */
    async askRestart(runAll) {
      const ok = await MG.confirmBox(
        runAll ? 'Restart R and run all cells?' : 'Restart R?',
        `<p>R will restart with an empty memory, so all its variables will be lost (your files are not affected).${runAll ? ' Then all the cells will run again, from the top.' : ' Afterwards, run your cells again from the top.'} Your other notebooks share this R session, so their variables will be lost too.</p>`,
        runAll ? 'Restart and run all' : 'Restart'
      );
      if (ok) this.restart(runAll);
    }
    /** a new R for the notebooks (the old one is closed); runAll: then run the open notebook from the top */
    restart(runAll) {
      const v = this.view;
      this.stopQueue();
      this.count = 0;
      this.queue = Promise.resolve();
      const K = MG.kernels.get('r');
      const cwd = v && !v.foreign ? v.folder : MG.app.HOME;
      const p = K.state === 'off' ? K.ensure(cwd) : K.restart(cwd);
      bus.emit('nb:restart', { runAll: !!runAll });
      return p.then(
        () => {
          if (runAll && v && !v.foreign) return v.runAll();
          toast('R has been restarted with an empty memory. Run your cells again from the top (Run all).', null, 4000);
        },
        () => {}
      );
    }
    async showVars() {
      const K = MG.kernels.peek('r');
      let vars = [];
      if (K && K.state === 'ready') {
        try {
          vars = await K.vars();
        } catch (e) {
          vars = [];
        }
      }
      const row = (msg) => `<tr><td colspan="3" class="muted">${msg}</td></tr>`;
      const rows = !K || K.state !== 'ready'
        ? row('R has not started yet. It starts when a notebook is opened.')
        : vars === null
          ? row('R is busy running a cell. The variables will be listed when it has finished.')
          : vars.length
            ? vars.map((x) => `<tr><td><code>${esc(x.name)}</code></td><td>${esc(x.type)}</td><td>${esc(x.desc)}</td></tr>`).join('')
            : row('There are no variables yet. Run a cell that creates one, such as <code>x &lt;- c(5, 3, 8)</code>.');
      MG.modal('Variables', `<p class="muted small">These are the variables in the notebooks' R session at the moment. They were created by the cells you have run since R started, in any of your notebooks, because all your notebooks share one R session. The R console, RStudio and the terminal each have their own session.</p><div class="nb-varsbox"><table class="table small nb-vars"><tr><th>Name</th><th>Type</th><th>Value</th></tr>${rows}</table></div>`);
    }
    askAI(kind, info) {
      MG.app.showWorkbench('assistant').then(() => setTimeout(() => bus.emit('nb:ask', { kind, cell: info }), 60));
    }
    help() {
      MG.modal(
        'Notebooks',
        `<div class="nb-help">
<p>A notebook combines <b>code cells</b>, which contain R code, and <b>text cells</b>, which are written in Markdown. When you run a code cell, its results (text, tables and plots) appear under the cell and are saved with the notebook.</p>
<h4>Running code</h4>
<ul>
<li><kbd>Shift</kbd>+<kbd>Enter</kbd> runs a cell and moves to the next one, <kbd>Ctrl</kbd>+<kbd>Enter</kbd> runs it and stays on it, and <kbd>Alt</kbd>+<kbd>Enter</kbd> runs it and adds a new cell below. <b>Run all</b> runs every cell, starting from the top.</li>
<li>The number beside a cell, such as <code>[3]</code>, shows the order in which the cells were run. <code>[*]</code> means that the cell is running or waiting for its turn.</li>
<li>An error stops the cell at the line where it happened, and any cells that were waiting to run after it are not run.</li>
<li><b>Stop</b> interrupts R: the cell stops, but R keeps its variables. <b>Restart</b> starts a new R session with an empty memory, so you will need to run your cells again from the top.</li>
</ul>
<h4>Keyboard shortcuts when you are not typing in a cell (press <kbd>Esc</kbd> first)</h4>
<p><kbd>Enter</kbd> edit the cell · <kbd>A</kbd> / <kbd>B</kbd> new cell above / below · <kbd>D</kbd> <kbd>D</kbd> delete it · <kbd>M</kbd> make it a text cell · <kbd>Y</kbd> make it a code cell · <kbd>↑</kbd> <kbd>↓</kbd> go up or down · <kbd>I</kbd> <kbd>I</kbd> stop R · <kbd>0</kbd> <kbd>0</kbd> restart R · <kbd>H</kbd> this help</p>
<h4>The notebooks' R session</h4>
<ul>
<li>All your notebooks share <b>one R session</b>, so a variable created in one notebook can be used in another. This session is separate from the ones in the R console, RStudio and the terminal, which each have their own. Objects you create there are not available here, and the other way round.</li>
<li>All these R sessions do share your <b>files</b>, though. R works in the notebook's folder: <code>getwd()</code> shows which folder that is, and <code>setwd()</code> changes it for the cells that follow. Your files are in <code>~</code> and the data files are in <code>~/data</code>.</li>
<li>They also share the <b>packages</b>. Install a package once with <code>install.packages("name")</code> (packages come from the webR repository), and then you can load it with <code>library(name)</code> in any R session in the workbench.</li>
<li>Plots appear under the cell at a size of 7 × 5 inches. For a different size, run <code>options(repr.plot.width = 9, repr.plot.height = 4)</code> first. <code>?mean</code> shows a help page under the cell, <code>View(df)</code> shows the data as a table, and <code>readline()</code> asks for your answer in a box under the cell.</li>
</ul>
<h4>The file</h4>
<p>Each notebook is an <code>.ipynb</code> file (most of them are in <code>~/notebooks</code>), which is saved automatically as you work, including the outputs. You can download it and open it in Jupyter, JupyterLab, VS Code or Google Colab with an R kernel, or download it as an R script.</p>
<p class="muted">Jupyter's Python kernel has some extras that the R kernel does not have: in Python notebooks, <code>%%bash</code> cells and lines that start with <code>!</code> run shell commands. Here, run shell commands in the Terminal tab instead.</p>
</div>`
      );
    }
    about() {
      const K = MG.kernels.peek('r');
      const v = (K && K.versions) || null;
      const where = K && K.S && K.S.wd ? MG.app.fs.pretty(K.S.wd) : null;
      const pk = MG.R && MG.R.userlib ? MG.R.userlib.list() : [];
      MG.modal(
        'The notebooks\' R session',
        `<div class="nb-help">
<p>${v ? `<b>R ${esc(v.r)}</b> (webR ${esc(v.webr)})` : '<b>R</b> (webR)'} is R compiled to WebAssembly, running in your browser. Nothing is installed on your computer, and your code and data are not sent anywhere.</p>
<ul>
<li>One R session serves all your notebooks. The R console, RStudio and the terminal each have their own R session. They all share your files and the packages installed with <code>install.packages()</code>, but not what is in memory.</li>
${where ? `<li>R is working in <code>${esc(where)}</code> (<code>getwd()</code>).</li>` : '<li>R has not started yet. It starts when a notebook is opened.</li>'}
<li>Packages installed in this browser: ${pk.length ? pk.map((p) => `<code>${esc(p)}</code>`).join(', ') : 'none yet (R\'s built-in packages, such as stats, graphics and utils, are always available)'}.</li>
</ul>
<p class="muted">When you use Jupyter on a computer, its R kernel is called IRkernel. Notebooks saved here say that they use IRkernel, so Jupyter opens them with R.</p>
</div>`
      );
    }

    /* ---------------- downloads ---------------- */
    downloadIpynb() {
      const v = this.view;
      if (!v) return;
      if (v.dirty) v.saveNow();
      MG.downloadText(JSON.stringify(v.toIpynb(), null, 1), MG.path.basename(v.path), 'application/x-ipynb+json');
      toast('The notebook has been downloaded. You can open it in Jupyter, JupyterLab, VS Code or Google Colab (with an R kernel). If it reads data files, download those too (from the Files tab) and keep them in the same folders as here.', null, 7000);
      bus.emit('nb:download', { path: v.path, format: 'ipynb' });
    }
    /** the notebook as an R script: each cell begins with a # %% line (the "percent" format of Jupytext), text cells
        become comments */
    downloadScript() {
      const v = this.view;
      if (!v || v.foreign) return;
      const stem = MG.path.basename(v.path).replace(/\.ipynb$/i, '');
      const comment = (src) => src.split('\n').map((l) => (l ? '# ' + l : '#')).join('\n');
      const parts = [`# ${stem}: an R notebook from the R workbench, saved as an R script.\n# Each "# %%" line starts a new cell, and the text cells have been turned into comments.`];
      for (const c of v.cells) {
        const src = c.cm.getValue().replace(/\s+$/, '');
        if (c.type === 'markdown') parts.push('# %% [markdown]\n' + comment(src));
        else if (c.type === 'raw') parts.push('# %% [raw]\n' + comment(src));
        else if (MAGIC.test(src)) parts.push('# %%\n# (this cell is not R code: run its commands in the Terminal)\n' + comment(src));
        else parts.push('# %%\n' + src);
      }
      MG.downloadText(parts.join('\n\n') + '\n', stem + '.R', 'text/plain');
      bus.emit('nb:download', { path: v.path, format: 'R' });
    }
    downloadHtml() {
      const v = this.view;
      if (!v) return;
      const title = MG.path.basename(v.path).replace(/\.ipynb$/i, '');
      const cells = v.cells
        .map((c) => {
          if (c.type === 'markdown') return `<div class="md">${renderMarkdown(c.cm.getValue())}</div>`;
          if (c.type === 'raw') return `<pre class="raw">${esc(c.cm.getValue())}</pre>`;
          const outs = c.outEl.innerHTML.replace(/<button[\s\S]*?<\/button>/g, '').replace(/<div class="nb-input">[\s\S]*?<\/div>/g, '');
          return `<div class="cell"><div class="in"><span class="n">[${c.count || ' '}]</span><pre>${esc(c.cm.getValue())}</pre></div>${outs ? `<div class="out">${outs}</div>` : ''}</div>`;
        })
        .join('\n');
      const css = `body{font:15px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:960px;margin:24px auto;padding:0 16px;color:#18212f}
.cell{margin:10px 0}.in{display:flex;gap:8px}.n{font:12px monospace;color:#647086;min-width:3em;padding-top:8px}
.in pre{flex:1;background:#f6f8fa;border:1px solid #e0e5ec;border-radius:6px;padding:8px;margin:0;white-space:pre-wrap;font:13px/1.45 ui-monospace,Menlo,Consolas,monospace}
.out{margin-left:3.6em}.out pre{white-space:pre-wrap;font:12.5px/1.45 ui-monospace,Menlo,Consolas,monospace;margin:4px 0}
.nb-stream.err{background:#fff8e8;color:#7a5200}.nb-error{border:1px solid #f1c2bf;background:#fdeceb;border-radius:6px;padding:6px 10px}.nb-error pre{color:#8a1c15}
img{max-width:100%}table{border-collapse:collapse;font-size:12px}th,td{border-bottom:1px solid #e0e5ec;padding:3px 8px;text-align:right}td.txt{text-align:left}
.nb-dfinfo{font-size:12px;color:#647086;margin:4px 0}th small{font-weight:normal;color:#647086}
.md{margin:14px 0}.md pre{background:#f6f8fa;padding:8px;border-radius:6px}`;
      const kind = v.foreign ? `${esc(v.langName)} notebook` : 'R notebook';
      const html = `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)}</title><style>${css}</style></head><body><h1>${esc(title)}</h1><p style="color:#647086">${kind} from the R workbench · ${esc(new Date().toLocaleString('en-GB'))}</p>${cells}</body></html>`;
      MG.downloadText(html, title + '.html', 'text/html');
      bus.emit('nb:download', { path: v.path, format: 'html' });
    }
    duplicate() {
      const v = this.view;
      if (!v) return;
      if (v.dirty) v.saveNow();
      const stem = MG.path.basename(v.path).replace(/\.ipynb$/i, '') + '-copy';
      const to = this.freeName(MG.path.dirname(v.path), stem);
      this.fs.copy(v.path, to);
      this.open(to);
    }
    deleteNotebook() {
      const v = this.view;
      if (!v) return;
      const m = MG.modal('Delete this notebook?', `<p><b>${esc(this.fs.pretty(v.path))}</b> will be deleted from your files. Download it first if you want to keep a copy.</p><div class="prompt-actions"><button class="btn" data-x="no" type="button">Cancel</button><button class="btn danger" data-x="yes" type="button">Delete</button></div>`);
      m.box.querySelector('[data-x="no"]').addEventListener('click', () => m.close());
      m.box.querySelector('[data-x="yes"]').addEventListener('click', async () => {
        m.close();
        const p = v.path;
        clearTimeout(v._st);
        v.gone = true;
        this.views.delete(p);
        this.fs.remove(p);
        v.destroy();
        this.view = null;
        const next = this.list()[0];
        if (next) await this.open(next.path);
        else await this.newNotebook('r');
      });
    }

    /* ---------------- for the instructions, the AI and the other tabs ---------------- */
    /** put R code into a notebook (the open one, or another R notebook) and optionally run it. opts: {lang, type, run} */
    async insertCode(code, opts = {}) {
      const lang = String(opts.lang || 'r').toLowerCase();
      if (!isR(lang)) {
        toast(`This is ${esc(langName(lang))} code, but the notebooks here run R only.`, 'warn', 5000);
        return null;
      }
      let v = this.view;
      if (!v || v.foreign) {
        const other = this.list()
          .map((n) => this.views.get(n.path) || n)
          .find((n) => (n instanceof NotebookView ? !n.foreign : this._langOf(n.path) === 'r'));
        if (other) v = await this.open(other.path);
        else v = await this.newNotebook('r', { stem: 'scratch' });
        if (v) toast(`The code was added to <b>${esc(MG.path.basename(v.path))}</b>, an R notebook.`, null, 3500);
      }
      if (!v) return null;
      return v.insertCode(code, opts);
    }
    _langOf(path) {
      try {
        const e = this.fs.get(path);
        if (e && e.kind === 'text') return parseIpynb(e.text).lang;
      } catch (err) {
        /* not readable */
      }
      return null;
    }
    /** the open notebook's code (for the AI) */
    codeContext(n) {
      return this.view ? this.view.codeContext(n) : '';
    }
    shown() {
      if (this.view) this.view.refresh();
    }
  }

  /* code from another tab (the AI's answers): into a notebook, run or not */
  if (!MG.app.toNotebook)
    MG.app.toNotebook = async (code, lang, run) => {
      await MG.app.showWorkbench('notebook');
      const nb = MG.app.waitFor ? await MG.app.waitFor(() => MG.app.nbApp) : MG.app.nbApp;
      return nb ? nb.insertCode(code, { lang, run: !!run }) : null;
    };

  MG.NotebookApp = NotebookApp;
  MG.NotebookView = NotebookView;
})();
