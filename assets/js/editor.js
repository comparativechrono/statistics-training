/* =====================================================================
   The Files tab: your home folder (~) – the files that every R of the
   workbench reads and writes – with an editor and viewers.

   The tree      upload (also by dragging files onto the tab), download
                 (a folder as a .zip), new file or folder, rename, copy,
                 move (also by dragging a file onto a folder), delete
   The editor    text files (CodeMirror): R scripts, R Markdown and
                 Quarto documents, Markdown, YAML, shell scripts, JSON –
                 and anything else that is text (a CSV file as text, a
                 .Rout record)
   The viewers   tables (CSV, TSV – sorted, searched and filtered as
                 RStudio's data viewer does), pictures, PDF files
                 (pdfview.js), HTML reports (without their scripts), and a
                 card for a file that is not text (an Excel workbook, .rds,
                 .RData, .zip) that says how R reads it
   The buttons   take a file to the other tabs: an R script to RStudio,
                 to Rscript (Terminal) or to source() (R console); an R
                 Markdown or Quarto document to RStudio's Knit; a table to
                 RStudio's Import Dataset or to read.csv() (R console); a
                 notebook to the Notebook tab

   Files are saved into the page's file system: each R copies in what has
   changed before its next command, and copies back what it wrote after
   it. Everything is kept in this browser (project.js).
   ===================================================================== */
(function () {
  'use strict';
  const MG = window.MG;
  const { h, esc, bus, store, toast } = MG;
  const ROW_MIME = 'application/x-rwb-path'; // a row of the tree, dragged
  const TEXT_MAX = 50e6; // larger files are not opened in the editor
  const TEXT_CUT = 4e6; // of a larger file, the first TEXT_LINES lines are shown (read-only)
  const TEXT_LINES = 5000;
  const TABLE_MAX = 30e6; // larger tables are not read into the table viewer
  const TABLE_ROWS = 100000; // the rows of a table that are shown (all are counted)

  /* ------------------------------------------------------------------
     kinds of files
     ------------------------------------------------------------------ */
  /** the highlighting of the editor (the modes that the page loads) */
  function modeFor(path) {
    const n = MG.path.basename(path);
    if (/\.(r|rprofile|rhistory)$/i.test(n)) return 'r';
    if (/\.(rmd|qmd)$/i.test(n)) return 'rmarkdown';
    if (/\.(md|markdown)$/i.test(n)) return 'markdown';
    if (/\.ya?ml$/i.test(n)) return 'yaml';
    if (/\.(sh|bash)$|^\.(bashrc|bash_profile|profile)$/i.test(n)) return 'shell';
    if (/\.(json|ipynb)$/i.test(n)) return { name: 'javascript', json: true };
    if (/\.(js|mjs)$/i.test(n)) return 'javascript';
    return 'text/plain';
  }
  /** R, R Markdown, YAML and JSON are indented by 2 spaces (as RStudio does), the rest by 4 */
  const indentFor = (path) => (/\.(r|rmd|qmd|rprofile|ya?ml|json|ipynb)$/i.test(path) ? 2 : 4);
  /** prose is wrapped at the edge of the editor; code is not */
  const wrapFor = (path) => /\.(md|markdown|rmd|qmd|txt)$/i.test(path);

  const BINARY = /\.(xlsx?|xlsm|ods|rds|rda|rdata|zip|gz|bz2|xz|tgz|tar|7z|docx?|pptx?|odt|odp|sqlite|db|duckdb|parquet|feather|arrow|sav|dta|sas7bdat|xpt|h5|hdf5|nc|mp3|mp4|wav|mov|webm|ogg|ttf|otf|woff2?|wasm|so|o|dll|exe|bin)$/i;
  /** how a file is shown: in the editor ('text') or by a viewer */
  function kindOf(path) {
    const n = path.toLowerCase();
    if (/\.(png|jpe?g|gif|webp|bmp|ico|avif)$/.test(n)) return 'image';
    if (/\.svg$/.test(n)) return 'svg';
    if (/\.html?$/.test(n)) return 'html';
    if (/\.pdf$/.test(n)) return 'pdf';
    if (/\.(csv|tsv|tab)$/.test(n)) return 'table';
    if (/\.ipynb$/.test(n)) return 'notebook';
    if (BINARY.test(n)) return 'binary';
    return 'text';
  }
  /** the icon of a file in the tree, and a word for its colour */
  function iconOf(name) {
    if (/\.r$/i.test(name)) return ['rlang', 'r'];
    if (/\.rmd$/i.test(name)) return ['book', 'rmd'];
    if (/\.qmd$/i.test(name)) return ['book2', 'rmd'];
    if (/\.ipynb$/i.test(name)) return ['notebook', 'nb'];
    if (/\.(csv|tsv|tab|xlsx?|ods)$/i.test(name)) return ['table', 'data'];
    if (/\.(rdata|rda|rds)$/i.test(name)) return ['env', 'data'];
    if (/\.(png|jpe?g|gif|webp|bmp|svg|pdf)$/i.test(name)) return ['image', 'pic'];
    if (/\.html?$/i.test(name)) return ['globe', 'pic'];
    if (/\.(zip|tar|tgz|gz|bz2|xz|7z)$/i.test(name)) return ['zip', ''];
    if (/\.(sh|bash)$/i.test(name)) return ['terminal', ''];
    if (/^\.rhistory$/i.test(name)) return ['history', ''];
    if (/\.(md|markdown|txt|rout|log)$/i.test(name)) return ['text', ''];
    if (/\.(json|ya?ml|js|css)$|^\.rprofile$/i.test(name)) return ['code', ''];
    return ['file', ''];
  }

  /* ------------------------------------------------------------------
     words for the shell and for R
     ------------------------------------------------------------------ */
  /** a word for the shell, quoted when it needs to be */
  const shq = (s) => (/^[\w~@%+=:,./-]+$/.test(s) ? s : "'" + String(s).replace(/'/g, "'\\''") + "'");
  /** a path for the shell: in the home folder ~/…, with the ~ outside the quotes (only there does the shell put the
      home folder in its place) */
  const shPath = (fs, abs) => {
    const p = fs.pretty(abs);
    return p === '~' ? '~' : p.startsWith('~/') ? '~/' + shq(p.slice(2)) : shq(p);
  };
  /** a JavaScript string as an R string */
  const rstr = (s) => (MG.R && MG.R.rstr ? MG.R.rstr(s) : JSON.stringify(String(s)));
  /** a name for an R variable, made from a file's name (penguins.csv → penguins) as RStudio's Import Dataset makes it */
  function rName(file) {
    let v = String(file).replace(/\.[^.]*$/, '').replace(/[^A-Za-z0-9._]+/g, '_');
    if (!/^[A-Za-z.]/.test(v) || /^\.\d/.test(v)) v = 'X' + v;
    return v;
  }
  /** bytes → text, or null when they are not text (a NUL byte near the start). UTF-8; else Windows' Latin-1, in which
      Excel writes CSV files */
  function decodeText(bytes) {
    const head = bytes.subarray(0, 8192);
    for (let i = 0; i < head.length; i++) if (head[i] === 0) return null;
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch (e) {
      return new TextDecoder('windows-1252').decode(bytes);
    }
  }

  class Editor {
    constructor(root, opts) {
      this.root = root;
      this.fs = opts.fs;
      this.home = this.fs.home;
      this.open = new Map(); // path → { doc, saved, gen, ro, truncated, entry, dirty, gone }: the text files in the editor
      this.current = null; // the text file on show in the editor
      this.viewPath = null; // the file on show in a viewer
      this.sel = null; // the row last chosen in the tree (a file or a folder): new files go into its folder
      const ex = store.get('edExpanded', null);
      this.expanded = new Set(Array.isArray(ex) ? ex : [this.home, this.home + '/data']);
      this.showHidden = !!store.get('edHidden', false);
      this._build();
      this.fs.onChange((path, what) => this._fsChanged(path, what));
      // the files that were open last time are opened again, and the one that was on show is shown
      const last = store.get('edOpen', []), cur = store.get('edCurrent', null);
      this._restoring = true;
      this._empty();
      this.renderTree();
      this._restore(Array.isArray(last) ? last : [], cur);
      this._usage();
    }
    async _restore(paths, cur) {
      try {
        for (const p of paths) {
          if (typeof p === 'string' && this._mine(p) && this.fs.exists(p) && !this.fs.isDir(p) && kindOf(p) === 'text') await this._openText(p, { quiet: true, background: true });
        }
      } finally {
        this._restoring = false;
      }
      if (cur && this.open.has(cur) && !this.current && !this.viewPath) this.show(cur, { noFocus: true });
      else this._renderTabs();
      this._persist();
    }
    _mine(p) {
      return p === this.home || String(p).startsWith(this.home + '/');
    }

    _build() {
      const R = this.root;
      R.classList.add('ed');
      const btn = (icon, label, title, fn, cls) => {
        const b = h('button.tbtn' + (cls || ''), { type: 'button', title, 'aria-label': label ? null : title, html: MG.icon(icon) + (label ? '<span>' + esc(label) + '</span>' : '') });
        b.addEventListener('click', fn);
        return b;
      };
      this.tree = h('div.ed-tree', { role: 'tree', 'aria-label': 'Your files' });
      this.hiddenBtn = btn('eye', '', 'Show hidden files (files whose names start with a dot, such as .RData and .Rhistory)', () => this.toggleHidden());
      const treeBar = h(
        'div.ed-treebar',
        h('b', 'Files'),
        h('span.grow'),
        btn('upload', '', 'Upload files from your computer into the selected folder (or drag them onto a folder here)', () => this.upload(false)),
        btn('plus', '', 'New file in the selected folder', () => this.newFile()),
        btn('folder', '', 'New folder in the selected folder', () => this.newFolder()),
        this.hiddenBtn
      );
      this.hiddenBtn.classList.toggle('on', this.showHidden);
      this.hiddenBtn.setAttribute('aria-pressed', String(this.showHidden));
      this.usageEl = h('div.ed-usage', { title: 'Your files are kept in this browser, on this computer' });
      this.side = h('aside.ed-side', { 'aria-label': 'Your files' }, treeBar, this.tree, this.usageEl);
      this.tabs = h('div.ed-tabs', { role: 'tablist', 'aria-label': 'Files open in the editor' });
      this.pathEl = h('span.ed-path');
      this.actsEl = h('span.ed-acts');
      this.dlBtn = btn('download', '', 'Download this file to your computer', () => this.download());
      this.saveBtn = btn('save', 'Save', 'Save (Ctrl+S)', () => this.save(), '.ed-save');
      // (the file's name, its buttons to the other tabs, then Download and Save at the end; where the pane is too
      // narrow for one line, the buttons to the other tabs go onto a line of their own – see _fitBar)
      this.endEl = h('span.ed-end', this.dlBtn, this.saveBtn);
      this.bar = h('div.ed-bar', this.pathEl, this.actsEl, this.endEl);
      if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => this._fitBar()).observe(this.bar);
      this.cmHost = h('div.ed-cm');
      this.view = h('div.ed-view', { hidden: true });
      this.emptyEl = h('div.ed-empty');
      this.main = h('section.ed-main', { 'aria-label': 'The open file' }, this.tabs, this.bar, this.cmHost, this.view, this.emptyEl);
      R.append(this.side, this.main);
      this.cm = window.CodeMirror(this.cmHost, {
        value: '',
        lineNumbers: true,
        indentUnit: 2,
        tabSize: 4,
        indentWithTabs: false,
        matchBrackets: true,
        autoCloseBrackets: true,
        styleActiveLine: true,
        viewportMargin: 30,
        // (files dropped onto the editor are uploaded – see below – not pasted into the text)
        allowDropFileTypes: [],
        screenReaderLabel: 'Text editor',
        extraKeys: {
          'Ctrl-S': () => this.save(),
          'Cmd-S': () => this.save(),
          Tab: (cm) => (cm.somethingSelected() ? cm.indentSelection('add') : cm.replaceSelection(' '.repeat(cm.getOption('indentUnit')), 'end')),
          'Shift-Tab': (cm) => cm.indentSelection('subtract'),
          'Ctrl-/': 'toggleComment',
          'Cmd-/': 'toggleComment'
        }
      });
      this.cm.on('changes', () => this._dirtyCheck());
      this.cmHost.hidden = true;
      // Ctrl+S saves wherever the focus is in the tab (not the browser's "Save page")
      R.addEventListener('keydown', (e) => {
        if (e.defaultPrevented) return; // (the editor's own Ctrl+S)
        if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === 's' || e.key === 'S') && this.current) {
          e.preventDefault();
          this.save();
        }
      });
      this._dnd();
    }

    /* ---------------- dragging: files from the computer, and rows of the tree ---------------- */
    _dnd() {
      const R = this.root;
      const types = (e) => Array.from((e.dataTransfer && e.dataTransfer.types) || []);
      const what = (e) => (types(e).includes(ROW_MIME) ? 'row' : types(e).includes('Files') ? 'files' : null);
      /** the folder under the pointer: a folder's row, or the folder of a file's row */
      const folderAt = (e) => {
        const row = e.target.closest && e.target.closest('.ed-row');
        if (!row || !row.dataset.path || !this._mine(row.dataset.path)) return null;
        return this.fs.isDir(row.dataset.path) ? row.dataset.path : MG.path.dirname(row.dataset.path);
      };
      const clear = () => {
        R.classList.remove('dropping');
        this._dropMark(null);
      };
      // (files from the computer dragged over the editor are this tab's, not CodeMirror's; a row of the tree dropped
      // onto the editor is CodeMirror's: it puts the file's path into the text)
      for (const t of ['dragenter', 'dragover', 'drop']) this.cm.on(t, (cm, e) => what(e) === 'files' && (e.codemirrorIgnore = true));
      R.addEventListener('dragover', (e) => {
        const k = what(e);
        if (!k || (k === 'row' && !this.side.contains(e.target))) return;
        const dir = folderAt(e) || (k === 'row' ? this.home : this._baseDir());
        if (k === 'row' && !this._canDrop(this._drag, dir)) {
          this._dropMark(null);
          return;
        }
        e.preventDefault();
        e.dataTransfer.dropEffect = k === 'files' || e.ctrlKey || e.altKey ? 'copy' : 'move';
        R.classList.toggle('dropping', k === 'files');
        this._dropMark(dir);
      });
      R.addEventListener('dragleave', (e) => {
        if (!R.contains(e.relatedTarget)) clear();
      });
      R.addEventListener('drop', async (e) => {
        const k = what(e);
        clear();
        if (k === 'row') {
          if (!this.side.contains(e.target)) return;
          e.preventDefault();
          const src = e.dataTransfer.getData(ROW_MIME) || this._drag;
          const dir = folderAt(e) || this.home;
          this._drag = null;
          if (this._canDrop(src, dir)) this._transfer(src, dir, e.ctrlKey || e.altKey);
          return;
        }
        if (!e.dataTransfer || !e.dataTransfer.files || !e.dataTransfer.files.length) return;
        e.preventDefault();
        const folder = folderAt(e) || this._baseDir();
        const files = await filesOfDrop(e.dataTransfer);
        const paths = await MG.project.addFiles(this.fs, folder, files);
        if (paths.length) {
          this.expanded.add(folder);
          this._saveExpanded();
          toast(`Added <b>${paths.length}</b> file${paths.length === 1 ? '' : 's'} to ${esc(this.fs.pretty(folder))}.`, 'ok');
          if (paths.length === 1) this.reveal(paths[0]);
          else this.renderTree();
        }
      });
    }
    /** can the file or folder src go into the folder dir? (not where it is, not into itself) */
    _canDrop(src, dir) {
      return !!(src && dir && src !== this.home && this._mine(src) && this._mine(dir) && this.fs.isDir(dir) && dir !== MG.path.dirname(src) && dir !== src && !dir.startsWith(src + '/'));
    }
    _dropMark(dir) {
      this.tree.querySelectorAll('.drop-on').forEach((x) => x.classList.remove('drop-on'));
      const r = dir && this.tree.querySelector(`.ed-row[data-path="${CSS.escape(dir)}"]`);
      if (r) r.classList.add('drop-on');
    }

    /* ------------------------------------------------------------------
       the tree
       ------------------------------------------------------------------ */
    toggleHidden() {
      this.showHidden = !this.showHidden;
      store.set('edHidden', this.showHidden);
      this.hiddenBtn.classList.toggle('on', this.showHidden);
      this.hiddenBtn.setAttribute('aria-pressed', String(this.showHidden));
      this.renderTree();
    }
    _saveExpanded() {
      store.set('edExpanded', Array.from(this.expanded));
    }
    /** the folders above a file are opened in the tree */
    _expandTo(path) {
      let d = MG.path.dirname(path), more = false;
      while (this._mine(d)) {
        if (!this.expanded.has(d)) {
          this.expanded.add(d);
          more = true;
        }
        if (d === this.home) break;
        d = MG.path.dirname(d);
      }
      if (more) this._saveExpanded();
    }
    renderTree() {
      clearTimeout(this._rt);
      const el = this.tree;
      const keep = el.scrollTop;
      // (the row that has the keyboard's focus keeps it: the tree is drawn anew after each change)
      const act = document.activeElement;
      const focused = act && el.contains(act) && act.dataset ? act.dataset.path : null;
      el.innerHTML = '';
      const sel = this.sel || this.current || this.viewPath;
      const row = (c, depth, label) => {
        const isDir = c.entry.kind === 'dir';
        const open = isDir && this.expanded.has(c.path);
        const on = c.path === sel;
        const [icon, tint] = isDir ? ['folder', ''] : iconOf(c.name);
        const r = h('div.ed-row' + (isDir ? '.dir' : '') + (on ? '.on' : '') + (label ? '.root' : ''), {
          role: 'treeitem',
          tabindex: '-1',
          title: this.fs.pretty(c.path),
          dataset: { path: c.path },
          style: { paddingLeft: 6 + depth * 14 + 'px' },
          'aria-level': String(depth + 1),
          'aria-expanded': isDir ? String(open) : null,
          'aria-selected': on ? 'true' : 'false',
          draggable: label ? null : 'true'
        });
        r.append(h('span.ed-caret', { 'aria-hidden': 'true' }, isDir ? (open ? '▾' : '▸') : ''), h('span.ed-ic' + (tint ? '.t-' + tint : ''), { html: MG.icon(icon) }), h('span.ed-name', label || c.name));
        if (!isDir) r.appendChild(h('small.ed-size', MG.humanSize(this.fs.size(c.entry))));
        if (!label && (c.entry.readonly || c.entry.protected)) r.appendChild(h('span.ed-lock', { title: 'read-only', html: MG.icon('lock') }));
        if (c.entry.fresh && Date.now() - (c.entry.mtime || 0) < 60000) r.classList.add('fresh');
        const more = h('button.ed-more', { type: 'button', tabindex: '-1', title: 'Actions for ' + (label || c.name), 'aria-label': 'Actions for ' + (label || c.name), html: MG.icon('dots') });
        more.addEventListener('click', (e) => {
          e.stopPropagation();
          this._menu(r, c);
        });
        r.appendChild(more);
        r.addEventListener('click', () => this._choose(c));
        r.addEventListener('keydown', (e) => this._rowKey(e, r, c));
        r.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          this._menu(r, c);
        });
        if (!label) {
          r.addEventListener('dragstart', (e) => {
            this._drag = c.path;
            e.dataTransfer.setData(ROW_MIME, c.path);
            e.dataTransfer.setData('text/plain', this.fs.pretty(c.path));
            e.dataTransfer.effectAllowed = 'copyMove';
          });
          r.addEventListener('dragend', () => {
            this._drag = null;
            this._dropMark(null);
          });
        }
        el.appendChild(r);
        return open;
      };
      const walk = (path, depth) => {
        this.fs
          .list(path)
          .filter((c) => this.showHidden || (!c.name.startsWith('.') && !c.entry.hidden))
          .sort((a, b) => ((a.entry.kind === 'dir') === (b.entry.kind === 'dir') ? a.name.localeCompare(b.name) : a.entry.kind === 'dir' ? -1 : 1))
          .forEach((c) => {
            if (row(c, depth) && c.entry.kind === 'dir') walk(c.path, depth + 1);
          });
      };
      const homeEntry = this.fs.get(this.home);
      if (homeEntry && row({ path: this.home, name: '~', entry: homeEntry }, 0, 'My files  (~)')) walk(this.home, 1);
      if (this.fs.list(this.home).length === 0 && this.expanded.has(this.home)) el.appendChild(h('p.ed-hint', 'You have no files yet. Upload some with the ↑ button above, or drag them here from your computer.'));
      el.scrollTop = keep;
      // one row is reached with Tab (the others with the arrow keys)
      const rows = el.querySelectorAll('.ed-row');
      const back = focused && el.querySelector(`.ed-row[data-path="${CSS.escape(focused)}"]`);
      const stop = back || el.querySelector('.ed-row.on') || rows[0];
      if (stop) stop.tabIndex = 0;
      if (back) back.focus({ preventScroll: true });
    }
    /** a row clicked (or Enter): a folder opens or closes, a file opens */
    _choose(c) {
      this.sel = c.path;
      if (c.entry.kind === 'dir') this._toggle(c.path, !this.expanded.has(c.path));
      else this.openFile(c.path);
    }
    _toggle(path, open) {
      if (open) this.expanded.add(path);
      else this.expanded.delete(path);
      this._saveExpanded();
      this.renderTree();
    }
    /** the keys of a tree: ↑ ↓ Home End move, → ← open and close folders, Enter opens, F2 renames, Delete deletes */
    _rowKey(e, r, c) {
      const rows = Array.from(this.tree.querySelectorAll('.ed-row'));
      const i = rows.indexOf(r);
      const go = (x) => {
        if (!x) return;
        rows.forEach((y) => (y.tabIndex = -1));
        x.tabIndex = 0;
        x.focus();
      };
      const isDir = c.entry.kind === 'dir', open = isDir && this.expanded.has(c.path);
      const mine = this._mine(c.path) && c.path !== this.home;
      const k = e.key;
      if (k === 'Enter' || k === ' ') this._choose(c);
      else if (k === 'ArrowDown') go(rows[i + 1]);
      else if (k === 'ArrowUp') go(rows[i - 1]);
      else if (k === 'Home') go(rows[0]);
      else if (k === 'End') go(rows[rows.length - 1]);
      else if (k === 'ArrowRight') isDir && !open ? this._toggle(c.path, true) : go(rows[i + 1]);
      else if (k === 'ArrowLeft') isDir && open ? this._toggle(c.path, false) : go(this.tree.querySelector(`.ed-row[data-path="${CSS.escape(MG.path.dirname(c.path))}"]`));
      else if (k === 'F2' && mine) this.rename(c.path);
      else if (k === 'Delete' && mine) this.remove(c.path);
      else if (k === 'ContextMenu' || (e.shiftKey && k === 'F10')) this._menu(r, c);
      else return;
      e.preventDefault();
    }
    /** show a file or folder in the tree: its folders open, it is selected (a file is opened) */
    reveal(path) {
      this._expandTo(path);
      if (this.fs.isDir(path)) {
        this.expanded.add(path);
        this._saveExpanded();
      }
      this.sel = path;
      if (!this.fs.isDir(path)) this.openFile(path);
      else this.renderTree();
      setTimeout(() => {
        const r = this.tree.querySelector(`.ed-row[data-path="${CSS.escape(path)}"]`);
        if (r) {
          r.scrollIntoView({ block: 'nearest' });
          r.classList.add('flash-attn');
          setTimeout(() => r.classList.remove('flash-attn'), 1400);
        }
      }, 60);
    }
    /** the menu of a row (right-click, or its ⋯) */
    _menu(rowEl, c) {
      const p = c.path;
      const e = c.entry;
      const mine = this._mine(p);
      const isDir = e.kind === 'dir';
      const items = [];
      if (!isDir) {
        items.push(['eye', 'Open', () => this.openFile(p)]);
        const k = kindOf(p);
        if (k !== 'text' && k !== 'binary') items.push(['text', 'Open as text', () => this._openText(p)]);
        for (const a of this._actions(p)) items.push([a.icon, a.label, a.fn]);
        if (/\.zip$/i.test(p) && mine) items.push(['zip', 'Unpack (unzip) here', () => this.unzip(p)]);
        items.push(['download', 'Download', () => this.download(p)]);
      } else {
        if (mine) {
          items.push(['upload', 'Upload files here…', () => this.upload(false, p)]);
          items.push(['upload', 'Upload a folder here…', () => this.upload(true, p)]);
          items.push(['plus', 'New file here…', () => this.newFile(p)]);
          items.push(['folder', 'New folder here…', () => this.newFolder(p)]);
        }
        items.push(['zip', 'Download as a .zip', () => MG.project.download(p, (p === this.home ? 'r-workbench-files' : MG.path.basename(p) || 'files') + '.zip')]);
        items.push(['terminal', 'Open in the Terminal (cd)', () => this._terminal(`cd ${shPath(this.fs, p)}`, true)]);
      }
      if (mine && p !== this.home) {
        items.push(['rename', 'Rename…', () => this.rename(p)]);
        items.push(['copy', 'Copy to…', () => this.copyTo(p)]);
        items.push(['move', 'Move to…', () => this.moveTo(p)]);
        if (!isDir) items.push(['copy', 'Duplicate', () => this.duplicate(p)]);
      } else if (!mine && !isDir) items.push(['copy', 'Copy into my files', () => this.copyHome(p)]);
      items.push(['link', 'Copy the path', () => MG.copyText(this.fs.pretty(p)).then(() => toast('Copied ' + esc(this.fs.pretty(p)), null, 1500))]);
      if (mine && p !== this.home && !e.protected) items.push(['trash', 'Delete…', () => this.remove(p)]);
      MG.popmenu(rowEl.querySelector('.ed-more') || rowEl, items);
    }
    async _usage() {
      clearTimeout(this._ut);
      this._ut = setTimeout(async () => {
        let n = 0, bytes = 0;
        for (const [p, e] of this.fs.entries) {
          if (e.kind === 'dir' || !p.startsWith(this.home + '/')) continue;
          n++;
          bytes += this.fs.size(e);
        }
        const u = await MG.project.usage();
        const kept = MG.project.ok ? 'kept in this browser' : 'NOT kept in this browser (a private window?), so download them';
        this.usageEl.innerHTML = `${MG.icon(MG.project.ok ? 'lock' : 'warning')}<span>${n} file${n === 1 ? '' : 's'}, ${MG.humanSize(bytes)}B · ${kept}${u && u.quota ? ` · room for about ${MG.humanSize(Math.max(0, u.quota - u.usage))}B more` : ''}</span>`;
        this.usageEl.classList.toggle('bad', !MG.project.ok);
      }, 300);
    }

    /* ------------------------------------------------------------------
       what the other tabs, the terminal and R do to the files
       ------------------------------------------------------------------ */
    _fsChanged(path, what) {
      clearTimeout(this._rt);
      this._rt = setTimeout(() => {
        this.renderTree();
        this._usage();
      }, 150);
      // A file that is moved or renamed (here, by mv in the Terminal, in RStudio's Files pane) is removed, and at once
      // it is there under its new name: its open file follows it, edits and all. A file that is only removed is
      // marked as deleted.
      if (what === 'remove') {
        this._removed = path;
        Promise.resolve().then(() => {
          if (this._removed !== path) return;
          this._removed = null;
          this._gone(path);
        });
        return;
      }
      if (what === 'rename' && this._removed) {
        const from = this._removed;
        this._removed = null;
        this._moved(from, path);
        return;
      }
      this._removed = null;
      if (this.open.has(path) && (what === 'write' || what === 'chmod' || what === 'rename')) this._reloadFromFs(path);
      if (this.viewPath === path && (what === 'write' || what === 'rename')) this._refreshView(path);
    }
    _gone(path) {
      const under = (q) => q === path || q.startsWith(path + '/');
      let any = false;
      for (const [q, o] of this.open) {
        if (under(q) && !this.fs.exists(q) && !o.gone) {
          o.gone = true;
          any = true;
        }
      }
      if (any) {
        this._renderTabs();
        if (this.current && under(this.current)) this._head(this.current);
      }
      if (this.sel && under(this.sel)) this.sel = null;
      if (this.viewPath && under(this.viewPath) && !this.fs.exists(this.viewPath)) this._empty();
    }
    _moved(from, to) {
      const map = (q) => (q === from ? to : q && q.startsWith(from + '/') ? to + q.slice(from.length) : null);
      const moved = new Set();
      const next = new Map();
      for (const [q, o] of this.open) {
        const m = map(q);
        if (!m) continue;
        o.gone = false;
        o.entry = this.fs.get(m) || o.entry;
        next.set(m, o);
        moved.add(m);
      }
      if (moved.size) {
        // (in the order of the tabs; a file that a moved one took the place of is closed)
        const all = new Map();
        for (const [q, o] of this.open) {
          const m = map(q);
          if (m) all.set(m, next.get(m));
          else if (!moved.has(q)) all.set(q, o);
        }
        this.open = all;
      }
      const cur = map(this.current), view = map(this.viewPath), sel = map(this.sel);
      if (cur) this.current = cur;
      if (view) this.viewPath = view;
      if (sel) this.sel = sel;
      for (const q of Array.from(this.expanded)) {
        const m = map(q);
        if (m) {
          this.expanded.delete(q);
          this.expanded.add(m);
        }
      }
      this._saveExpanded();
      if (this.open.has(to) && !moved.has(to)) this._reloadFromFs(to);
      if (cur) {
        this._docOptions(this.current, this.open.get(this.current));
        this._head(this.current);
        this._acts(this.current);
      }
      if (view) {
        this._head(this.viewPath);
        this._acts(this.viewPath);
      }
      if (moved.size || cur || view) {
        this._renderTabs();
        this._persist();
      }
      if (!view && this.viewPath === to) this._refreshView(to);
    }

    /* ------------------------------------------------------------------
       opening files
       ------------------------------------------------------------------ */
    /** open a file: text in the editor, the rest in a viewer (a notebook in the Notebook tab). opts: line (go to that
        line), create (make the file if it is not there), asText, noFocus */
    async openFile(path, opts = {}) {
      path = this.fs.resolve(path);
      const e = this.fs.get(path);
      if (!e) {
        if (opts.create) {
          try {
            this.fs.mkdirp(MG.path.dirname(path));
            this.fs.writeText(path, '');
          } catch (err) {
            toast(esc(err.message), 'error');
            return;
          }
          return this._openText(path, opts);
        }
        toast('There is no file ' + esc(this.fs.pretty(path)) + '.', 'warn');
        return;
      }
      if (e.kind === 'dir') return this.reveal(path);
      const k = kindOf(path);
      if (k === 'text' || opts.asText || (opts.edit && k === 'notebook')) return this._openText(path, opts);
      return this.showView(path, opts);
    }
    async _openText(path, opts = {}) {
      const e = this.fs.get(path);
      if (!e || e.kind === 'dir') return;
      let o = this.open.get(path);
      if (!o || (!o.dirty && o.entry !== e)) {
        const size = this.fs.size(e);
        if (size > TEXT_MAX) {
          if (!opts.background) this.showView(path, { kind: 'binary', tooBig: true });
          return;
        }
        let text;
        try {
          text = e.kind === 'text' ? e.text : decodeText(await this.fs.readBytes(path));
        } catch (err) {
          if (!opts.quiet) toast('Could not read ' + esc(this.fs.pretty(path)) + ': ' + esc(err.message), 'error');
          return;
        }
        if (text == null) {
          if (!opts.background) this.showView(path, { kind: 'binary' });
          return;
        }
        let truncated = 0;
        if (size > TEXT_CUT) {
          const L = text.split('\n');
          if (L.length > TEXT_LINES) {
            text = L.slice(0, TEXT_LINES).join('\n');
            truncated = TEXT_LINES;
          }
        }
        const ro = !!(e.readonly || e.protected || truncated || !this._mine(path));
        o = this.open.get(path); // (opened meanwhile)
        if (!o) {
          const doc = window.CodeMirror.Doc(text, modeFor(path));
          o = { doc, saved: text, gen: doc.changeGeneration(true), ro, truncated, entry: e, dirty: false, gone: false };
          this.open.set(path, o);
        } else if (!o.dirty) {
          this._setText(o, text);
          Object.assign(o, { ro, truncated, entry: e, gone: false });
        }
      }
      this._persist();
      if (!opts.background) this.show(path, opts);
      else this._renderTabs();
    }
    _persist() {
      if (this._restoring) return;
      store.set('edOpen', Array.from(this.open.keys()).filter((p) => this._mine(p)));
      store.set('edCurrent', this.current);
    }
    /** the editor's settings for a file: its highlighting, indentation, wrapping, whether it can be changed */
    _docOptions(path, o) {
      if (!o) return;
      const mode = modeFor(path);
      if (JSON.stringify(o.doc.modeOption) !== JSON.stringify(mode)) this.cm.setOption('mode', mode);
      this.cm.setOption('readOnly', o.ro);
      this.cm.setOption('indentUnit', indentFor(path));
      this.cm.setOption('lineWrapping', wrapFor(path));
      this.saveBtn.hidden = o.ro;
      this.saveBtn.classList.toggle('dirty', !!o.dirty);
    }
    /** show a text file that is open in the editor */
    show(path, opts = {}) {
      const o = this.open.get(path);
      if (!o) return;
      this._closeView();
      this.current = path;
      this.viewPath = null;
      this.sel = path;
      this.view.hidden = true;
      this.view.innerHTML = '';
      this.emptyEl.hidden = true;
      this.bar.hidden = false;
      this.dlBtn.hidden = false;
      this.cmHost.hidden = false;
      if (this.cm.getDoc() !== o.doc) this.cm.swapDoc(o.doc);
      this._docOptions(path, o);
      this._head(path);
      this._acts(path);
      this._expandTo(path);
      this._renderTabs();
      this._persist();
      setTimeout(() => {
        if (this.current !== path) return;
        this.cm.refresh();
        if (opts.line) {
          const ln = Math.max(0, Math.min(o.doc.lastLine(), opts.line - 1));
          this.cm.setCursor({ line: ln, ch: 0 });
          this.cm.scrollIntoView({ line: ln, ch: 0 }, 80);
          this.cm.addLineClass(ln, 'background', 'cm-flash');
          setTimeout(() => this.cm.removeLineClass(ln, 'background', 'cm-flash'), 2200);
        }
        if (!opts.noFocus) this.cm.focus();
      }, 20);
      this.renderTree();
      bus.emit('editor:open', { path, name: MG.path.basename(path) });
    }
    /** the name of the file on show, above it */
    _head(path) {
      const P = this.pathEl;
      P.innerHTML = '';
      const pretty = this.fs.pretty(path);
      const cut = pretty.lastIndexOf('/') + 1;
      P.title = pretty;
      this._fitSoon();
      P.append(h('span.ed-dir', pretty.slice(0, cut)), h('span.ed-fname', pretty.slice(cut)));
      const o = this.open.get(path);
      if (this.current === path && o) {
        if (o.gone) P.appendChild(h('span.pill.small.warn', 'deleted – Save will recreate it'));
        else if (o.ro) P.appendChild(h('span.pill.small', { title: o.truncated ? 'This file is large, so only its beginning is shown' : this._mine(path) ? 'This file is read-only. You can change that with chmod in the Terminal.' : 'This is not one of your files. Use Copy into my files to get a copy that you can change.' }, o.truncated ? `read-only, showing the first ${o.truncated.toLocaleString('en-GB')} lines` : 'read-only'));
      } else {
        const e = this.fs.get(path);
        if (e) P.appendChild(h('span.pill.small', MG.humanSize(this.fs.size(e)) + 'B'));
      }
    }

    /* ------------------------------------------------------------------
       the buttons of a file: to the other tabs
       ------------------------------------------------------------------ */
    /** what the other tabs can do with a file → [{id, icon, label, short (for a narrow pane), title, fn}] */
    _actions(p) {
      const n = MG.path.basename(p);
      const f = this.fs.pretty(p);
      const A = [];
      const add = (id, icon, label, short, title, fn) => A.push({ id, icon, label, short, title, fn });
      if (/\.r$/i.test(n)) {
        add('rstudio', 'panes', 'Open in RStudio', 'RStudio', 'Open the script in RStudio’s Source pane, where you can run it line by line (Ctrl+Enter)', () => this.toRStudio(p));
        add('rscript', 'play', 'Run with Rscript', 'Rscript', `Run the whole script in a new R session in the Terminal (Rscript ${n})`, () => this.runInTerminal(p, 'Rscript'));
        add('source', 'rconsole', 'Source in the R console', 'source()', `Run the whole script in the R console with source(${rstr(f)})`, () => this.sourceInConsole(p));
      } else if (/\.(rmd|qmd)$/i.test(n)) {
        const q = /\.qmd$/i.test(n);
        add('rstudio', 'panes', 'Open in RStudio', 'RStudio', 'Open the document in RStudio’s Source pane, where you can run its chunks', () => this.toRStudio(p));
        add('knit', 'knit', q ? 'Render in RStudio' : 'Knit in RStudio', q ? 'Render' : 'Knit', `Open the document in RStudio and ${q ? 'render' : 'knit'} it into a web page that shows its text and code, together with the output and plots that the code produces`, () => this.knitInRStudio(p));
      } else if (/\.(md|markdown)$/i.test(n)) {
        add('rstudio', 'panes', 'Open in RStudio', 'RStudio', 'Open the file in RStudio’s Source pane, where its Preview button shows it as a web page', () => this.toRStudio(p));
      } else if (/\.ipynb$/i.test(n)) {
        add('notebook', 'notebook', 'Open in the Notebook tab', 'Notebook', 'Open the notebook in the Notebook tab, where you can run its cells', () => MG.app.openFile(p));
      } else if (/\.(csv|tsv|tab)$/i.test(n)) {
        add('import', 'table', 'Import in RStudio (readr)', 'Import', 'Open RStudio’s Import Dataset dialog, which shows a preview of the data and the readr code that reads it', () => this.importInRStudio(p, 'readr'));
        add('read', 'rconsole', 'Read in the R console', 'R console', 'Type the read.csv() command that reads the table into the R console', () => this.readInConsole(p));
      } else if (/\.xlsx?$/i.test(n)) {
        add('import', 'table', 'Import in RStudio', 'Import', 'Open RStudio’s Import Dataset dialog for Excel, which shows a preview of a sheet and the readxl code that reads it', () => this.importInRStudio(p, 'excel'));
      } else if (/\.(rdata|rda|rds)$/i.test(n)) {
        const code = this._loadCode(p);
        add('load-rstudio', 'env', 'Load in RStudio', 'RStudio', `Run ${code} in RStudio’s console`, () => this.loadIn('rstudio', p));
        add('load-rcon', 'rconsole', 'Load in the R console', 'R console', `Run ${code} in the R console`, () => this.loadIn('console', p));
      } else if (/\.html?$/i.test(n)) {
        add('viewer', 'viewer', 'Show in RStudio’s Viewer', 'Viewer', 'Show the page in RStudio’s Viewer, which runs its scripts, so interactive plots and tables work there', () => this.toViewer(p));
      } else if (/\.(sh|bash)$/i.test(n)) {
        add('bash', 'terminal', 'Run with bash', 'bash', `Run the shell script in the Terminal (bash ${n})`, () => this.runInTerminal(p, 'bash'));
      }
      return A;
    }
    /** the bar above the file on one line when all of it fits; else two: the file's name with Download and Save,
        and under it the buttons to the other tabs */
    _fitBar() {
      const B = this.bar;
      if (B.hidden || !B.clientWidth) return;
      const sum = (el) => Array.from(el.children).reduce((s, c) => s + (c.hidden ? 0 : Math.max(c.scrollWidth, c.offsetWidth)), 0) + 6 * Math.max(0, el.children.length - 1);
      const need = sum(this.pathEl) + sum(this.actsEl) + sum(this.endEl) + 40;
      const two = this.actsEl.children.length > 0 && need > B.clientWidth;
      if (two !== B.classList.contains('two')) B.classList.toggle('two', two);
    }
    /** the buttons above the file on show */
    _fitSoon() {
      if (this._fitRaf) return;
      this._fitRaf = requestAnimationFrame(() => {
        this._fitRaf = null;
        this._fitBar();
      });
    }
    _acts(path) {
      const A = this.actsEl;
      A.innerHTML = '';
      this._fitSoon();
      if (!path) return;
      this._actions(path).forEach((a, i) => {
        const b = h('button.tbtn.ed-act' + (i === 0 ? '.first' : ''), { type: 'button', title: a.title, dataset: { act: a.id }, html: MG.icon(a.icon) + `<span class="l">${esc(a.label)}</span><span class="s">${esc(a.short)}</span>` });
        b.addEventListener('click', () => a.fn());
        A.appendChild(b);
      });
      if (!this._mine(path) && this.fs.exists(path)) {
        const b = h('button.tbtn.ed-act', { type: 'button', title: 'Make a copy of this file in your home folder, where you can change it', dataset: { act: 'copy' }, html: MG.icon('copy') + '<span class="l">Copy into my files</span><span class="s">Copy</span>' });
        b.addEventListener('click', () => this.copyHome(path));
        A.appendChild(b);
      }
    }
    /** a file that another tab works with: what is typed here is saved first */
    _saveFirst(p) {
      if (this.isDirty(p)) this.save(p);
    }
    async _rstudio() {
      await MG.app.showWorkbench('rstudio');
      return MG.app.waitFor(() => MG.app.rstudio);
    }
    async _console() {
      await MG.app.showWorkbench('console');
      return MG.app.waitFor(() => MG.app.rcon);
    }
    async _terminal(line, run) {
      await MG.app.showWorkbench('terminal');
      const T = await MG.app.waitFor(() => MG.app.term);
      return T ? T.type(line, run) : null;
    }
    toRStudio(p) {
      this._saveFirst(p);
      return MG.app.openInRStudio(p);
    }
    async knitInRStudio(p) {
      this._saveFirst(p);
      const d = await MG.app.openInRStudio(p);
      if (d && MG.app.rstudio) return MG.app.rstudio.knit(d);
    }
    /** run a script in the Terminal, in its folder: Rscript script.R, bash script.sh */
    runInTerminal(p, prog) {
      this._saveFirst(p);
      const dir = MG.path.dirname(p);
      const cd = this.fs.cwd === dir ? '' : `cd ${shPath(this.fs, dir)} && `;
      return this._terminal(`${cd}${prog} ${shq(MG.path.basename(p))}`, true);
    }
    async sourceInConsole(p) {
      this._saveFirst(p);
      const A = await this._console();
      if (A) A.run(`source(${rstr(this.fs.pretty(p))})`);
    }
    /** the command that reads a table, typed into the R console (Enter runs it): read.csv(), read.csv2() for a CSV
        file with semicolons, read.delim() for tabs */
    async readInConsole(p) {
      this._saveFirst(p);
      let sep = /\.csv$/i.test(p) ? ',' : '\t';
      try {
        const e = this.fs.get(p);
        if (sep === ',' && e && e.kind === 'text') sep = sepOf(e.text);
      } catch (err) {
        /* a comma, then */
      }
      const fn = sep === '\t' ? 'read.delim' : sep === ';' ? 'read.csv2' : 'read.csv';
      const A = await this._console();
      if (!A) return;
      A.type(`${rName(MG.path.basename(p))} <- ${fn}(${rstr(this.fs.pretty(p))})`);
      toast('Press Enter in the R console to run it.', null, 2600);
    }
    async importInRStudio(p, kind) {
      this._saveFirst(p);
      const rs = await this._rstudio();
      if (rs) rs.importDialog(kind, p);
    }
    _loadCode(p) {
      const n = MG.path.basename(p), f = rstr(this.fs.pretty(p));
      return /\.rds$/i.test(n) ? `${rName(n)} <- readRDS(${f})` : `load(${f})`;
    }
    async loadIn(where, p) {
      const code = this._loadCode(p);
      if (where === 'rstudio') {
        const rs = await this._rstudio();
        if (rs) rs.consoleRun(code);
      } else {
        const A = await this._console();
        if (A) A.run(code);
      }
    }
    async toViewer(p) {
      const rs = await this._rstudio();
      if (rs) rs.viewFile(p);
    }

    /* ------------------------------------------------------------------
       the open files: tabs, saving
       ------------------------------------------------------------------ */
    _renderTabs() {
      this.tabs.innerHTML = '';
      for (const [p, o] of this.open) {
        const on = p === this.current;
        const name = MG.path.basename(p);
        const t = h('div.ed-tab' + (on ? '.on' : '') + (o.dirty ? '.dirty' : '') + (o.gone ? '.gone' : ''), { role: 'tab', 'aria-selected': on ? 'true' : 'false', title: this.fs.pretty(p) + (o.dirty ? ' – not saved' : '') });
        const lab = h('button.ed-tab-l', { type: 'button' }, name);
        lab.addEventListener('click', () => this.show(p));
        t.addEventListener('auxclick', (ev) => ev.button === 1 && this.close(p));
        const x = h('button.ed-tab-x', { type: 'button', title: o.dirty ? 'Close (has unsaved changes)' : 'Close', 'aria-label': 'Close ' + name, html: o.dirty ? '●' : '×' });
        x.addEventListener('click', (ev) => {
          ev.stopPropagation();
          this.close(p);
        });
        t.append(lab, x);
        this.tabs.appendChild(t);
      }
      const on = this.tabs.querySelector('.on');
      if (on && on.scrollIntoView) on.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
    /** close an open file (asks first when it has unsaved edits) */
    async close(p) {
      const o = this.open.get(p);
      if (!o) return;
      if (o.dirty && !o.gone) {
        const a = await this._askSave(p);
        if (a === 'cancel' || (a === 'save' && !this.save(p))) return;
      }
      this.open.delete(p);
      if (this.current === p) {
        const next = Array.from(this.open.keys()).pop();
        if (next) this.show(next);
        else this._empty();
      } else this._renderTabs();
      this._persist();
    }
    _askSave(p) {
      return new Promise((resolve) => {
        let done = false;
        const m = MG.modal('Save the changes?', `<p><b>${esc(MG.path.basename(p))}</b> has changes that have not been saved. Do you want to save them before you close it?</p><div class="prompt-actions"><button class="btn" data-x="cancel" type="button">Cancel</button><span class="grow"></span><button class="btn" data-x="discard" type="button">Don’t save</button><button class="btn primary" data-x="save" type="button">Save</button></div>`, {
          onClose: () => {
            if (!done) {
              done = true;
              resolve('cancel');
            }
          }
        });
        for (const x of ['cancel', 'discard', 'save']) {
          m.box.querySelector(`[data-x="${x}"]`).addEventListener('click', () => {
            if (done) return;
            done = true;
            m.close();
            resolve(x);
          });
        }
      });
    }
    /** nothing open: what the tab is for */
    _empty() {
      this._closeView();
      this.current = null;
      this.viewPath = null;
      this.cmHost.hidden = true;
      this.view.hidden = true;
      this.view.innerHTML = '';
      this.bar.hidden = true;
      this.actsEl.innerHTML = '';
      this.pathEl.textContent = '';
      this.emptyEl.hidden = false;
      this.emptyEl.innerHTML = '';
      this.emptyEl.appendChild(this._welcome());
      this._renderTabs();
      this._persist();
    }
    _welcome() {
      const w = h('div.ed-welcome');
      w.innerHTML = `<div class="ed-welcome-h">${MG.icon('folder')}<h3>Your files</h3></div>
        <p class="ed-lead">This is your home folder, <code>~</code>. It holds the files that the R console, RStudio, the notebooks and the Terminal read and write.</p>
        <ul>
          <li><b>Open a file</b> by clicking it on the left. Scripts and documents open here in the editor, and tables, pictures, PDFs and knitted reports are shown in a viewer. The buttons above a file send it to the other tabs, for example an R script to RStudio or to <code>Rscript</code>, or a table to <code>read.csv()</code>.</li>
          <li><b>Every R session sees the same files.</b> Each R session in the workbench works on its own copy of them. Before each command, it copies in any files that have changed, and afterwards it copies back what it wrote. So a file you save here is available to the next command in any R session, and a file that R writes appears here as soon as its command has finished.</li>
          <li><b>Your files are kept in this browser</b>, on this computer, and nothing is sent to a server. Download them as a .zip file to keep a copy or to take them to another computer.</li>
          <li><b>Add files</b> from your computer with the ↑ button above the list, or drag them onto this tab. For more options, right-click a file or click its ⋯ button.</li>
        </ul>`;
      const up = h('button.btn.primary', { type: 'button', html: MG.icon('upload') + '<span>Upload files</span>' });
      up.addEventListener('click', () => this.upload(false));
      const dl = h('button.btn', { type: 'button', html: MG.icon('zip') + '<span>Download all my files (.zip)</span>' });
      dl.addEventListener('click', () => MG.project.download(this.home, 'r-workbench-files.zip'));
      w.appendChild(h('div.ed-welcome-acts', up, dl));
      return w;
    }
    isDirty(p) {
      const o = this.open.get(p);
      return !!(o && o.dirty);
    }
    dirtyPaths() {
      return Array.from(this.open.entries())
        .filter(([, o]) => o.dirty && !o.gone)
        .map(([p]) => p);
    }
    /** add text at the end of a file (opening it), save it and highlight the new lines → the first new line's number */
    async appendText(path, text) {
      if (!this.open.get(path)) await this.openFile(path, { create: true, noFocus: true, asText: true });
      else this.show(path, { noFocus: true });
      const o = this.open.get(path);
      if (!o || o.ro) return 0;
      const doc = o.doc;
      const last = doc.lastLine();
      const tail = doc.getLine(last);
      const body = doc.getValue();
      const sep = !body.trim() ? '' : tail === '' ? (doc.getLine(Math.max(0, last - 1)) === '' ? '' : '\n') : '\n\n';
      const add = sep + text.replace(/\s+$/, '') + '\n';
      const first = last + (sep.match(/\n/g) || []).length;
      doc.replaceRange(add, { line: last, ch: tail.length });
      const n = text.replace(/\s+$/, '').split('\n').length;
      this.save(path);
      for (let i = first; i < first + n; i++) this.cm.addLineClass(i, 'background', 'cm-flash');
      setTimeout(() => {
        for (let i = first; i < first + n; i++) this.cm.removeLineClass(i, 'background', 'cm-flash');
      }, 2600);
      this.cm.scrollIntoView({ line: Math.min(doc.lastLine(), first + n), ch: 0 }, 60);
      return first + 1;
    }
    /** new text for an open file, from its file: not an edit (it is not "unsaved") */
    _setText(o, text) {
      o.loading = true;
      try {
        o.doc.setValue(text);
      } finally {
        o.loading = false;
      }
      o.saved = text;
      o.gen = o.doc.changeGeneration(true);
      o.dirty = false;
      if (this.open.get(this.current) === o) this.saveBtn.classList.remove('dirty');
    }
    _dirtyCheck() {
      const o = this.open.get(this.current);
      if (!o || o.loading) return;
      const d = !o.doc.isClean(o.gen);
      if (d !== !!o.dirty) {
        o.dirty = d;
        this.saveBtn.classList.toggle('dirty', d);
        this._renderTabs();
      }
    }
    /** save an open file (the one on show, if no path is given) → true when it was saved */
    save(p = this.current) {
      const o = this.open.get(p);
      if (!o || o.ro) return false;
      const text = o.doc.getValue();
      const old = this.fs.get(p);
      if (old && old.kind === 'dir') {
        toast('Could not save the file, because ' + esc(this.fs.pretty(p)) + ' is a folder.', 'error');
        return false;
      }
      o.saving = true;
      try {
        if (!this.fs.isDir(MG.path.dirname(p))) this.fs.mkdirp(MG.path.dirname(p));
        // (a file keeps its permissions – an executable script stays executable)
        this.fs.rewrite(p, text);
      } catch (err) {
        toast('Could not save ' + esc(this.fs.pretty(p)) + ': ' + esc(err.message), 'error');
        return false;
      } finally {
        o.saving = false;
      }
      Object.assign(o, { entry: this.fs.get(p), saved: text, gen: o.doc.changeGeneration(true), dirty: false, gone: false, conflict: false });
      this._renderTabs();
      if (p === this.current) {
        this._head(p);
        this.saveBtn.classList.remove('dirty');
      }
      toast('Saved ' + esc(this.fs.pretty(p)), null, 1600);
      bus.emit('editor:save', { path: p, name: MG.path.basename(p), text });
      return true;
    }
    /** a file that is open was changed by something else (R, the Terminal, RStudio): it is read again – unless it has
        edits here, which are kept */
    async _reloadFromFs(p) {
      const o = this.open.get(p);
      if (!o || o.saving) return;
      const e = this.fs.get(p);
      if (!e || e === o.entry || e.kind === 'dir') return;
      o.entry = e;
      o.gone = false;
      o.ro = !!(e.readonly || e.protected || o.truncated || !this._mine(p));
      if (p === this.current) {
        this.cm.setOption('readOnly', o.ro);
        this.saveBtn.hidden = o.ro;
        this._head(p);
      }
      let text;
      try {
        text = e.kind === 'text' ? e.text : decodeText(await this.fs.readBytes(p));
      } catch (err) {
        return;
      }
      if (text == null || text === o.saved || this.fs.get(p) !== e) return;
      if (o.dirty) {
        o.conflict = true;
        if (this.current === p) toast(`<b>${esc(MG.path.basename(p))}</b> has been changed elsewhere (by R, the Terminal or RStudio). Your unsaved edits have been kept, but if you save them, they will replace the other version.`, 'warn', 8000);
        return;
      }
      const here = this.current === p;
      const cur = here ? this.cm.getCursor() : null;
      const scroll = here ? this.cm.getScrollInfo() : null;
      this._setText(o, text);
      if (here) {
        this.cm.setCursor(cur);
        this.cm.scrollTo(scroll.left, scroll.top);
      }
      this._renderTabs();
    }

    /* ------------------------------------------------------------------
       viewers
       ------------------------------------------------------------------ */
    /** show a file in a viewer. opts.kind: how (else by its name); opts.tooBig */
    async showView(path, opts = {}) {
      const e = this.fs.get(path);
      if (!e) return;
      const k = opts.kind || kindOf(path);
      if (k === 'notebook') return MG.app.openFile(path);
      this.current = null;
      this.viewPath = path;
      this.sel = path;
      this.cmHost.hidden = true;
      this.emptyEl.hidden = true;
      this.view.hidden = false;
      this.bar.hidden = false;
      this.dlBtn.hidden = false;
      this.saveBtn.hidden = true;
      this._head(path);
      this._acts(path);
      this._expandTo(path);
      this._renderTabs();
      this._persist();
      this.renderTree();
      this._viewOpts = Object.assign({}, opts, { kind: k });
      await this._renderView(path, this._viewOpts);
      bus.emit('editor:view', { path, name: MG.path.basename(path), kind: k });
    }
    async _refreshView(path) {
      if (this.view.hidden || this.viewPath !== path || !this.fs.exists(path)) return;
      this._head(path);
      await this._renderView(path, this._viewOpts || {});
    }
    /** what a viewer holds (a PDF document and its worker, a table, a picture's URL): let go of it */
    _closeView() {
      this._viewToken = (this._viewToken || 0) + 1; // (a view still being made is not shown)
      if (this._pdf) {
        this._pdf.destroy();
        this._pdf = null;
      }
      if (this._grid) {
        this._grid.destroy();
        this._grid = null;
      }
      if (this._url) URL.revokeObjectURL(this._url);
      this._url = null;
    }
    async _renderView(path, opts = {}) {
      const V = this.view;
      // (a PDF shown again – R wrote it anew – opens at the same page and zoom)
      const keep = this._pdf && this._pdfPath === path ? this._pdf.state() : null;
      this._closeView();
      V.innerHTML = '';
      V.className = 'ed-view';
      const k = opts.kind || kindOf(path);
      V.classList.add('k-' + k);
      // (two views asked for one after the other: only the last one is shown)
      const token = (this._viewToken = (this._viewToken || 0) + 1);
      const stale = () => token !== this._viewToken;
      const name = MG.path.basename(path);
      try {
        if (k === 'image') {
          const blob = await this.fs.toBlob(path);
          if (stale()) return;
          this._url = URL.createObjectURL(blob);
          const img = h('img', { src: this._url, alt: name });
          img.addEventListener('load', () => !stale() && img.naturalWidth && this.pathEl.appendChild(h('span.pill.small', `${img.naturalWidth} × ${img.naturalHeight} px`)));
          V.appendChild(h('div.ed-img', img));
        } else if (k === 'svg') {
          const text = await this.fs.readText(path);
          if (stale()) return;
          this._url = URL.createObjectURL(new Blob([text], { type: 'image/svg+xml' }));
          V.appendChild(h('div.ed-img.svg', h('img', { src: this._url, alt: name })));
          V.appendChild(h('p.ed-note', this._textBtn(path, 'Show the SVG text')));
        } else if (k === 'pdf') {
          // drawn by the page itself (pdfview.js), not by the browser's PDF plug-in
          const bytes = await this.fs.readBytes(path);
          if (stale()) return;
          this._pdf = MG.pdfView(V, bytes, { name, state: keep });
          this._pdfPath = path;
        } else if (k === 'html') {
          const text = await this.fs.readText(path);
          if (stale()) return;
          // (without its scripts: an HTML file could come from anywhere. RStudio's Viewer shows it with them)
          const fr = h('iframe.ed-frame', { sandbox: '', title: name });
          fr.srcdoc = text;
          V.append(fr, h('p.ed-note.muted', 'For safety, the page is shown here without its scripts, so interactive plots and tables don’t work. To see it with its scripts, use ', this._actBtn('viewer', 'Show in RStudio’s Viewer', () => this.toViewer(path), '.small'), '.'));
        } else if (k === 'table') {
          await this._tableView(path, V, stale);
        } else {
          V.appendChild(this._card(path, opts, stale));
        }
      } catch (err) {
        if (stale()) return;
        V.appendChild(h('div.ed-card', h('p', 'This file could not be shown: ' + err.message)));
      }
    }
    _textBtn(path, label) {
      return this._actBtn('text', label || 'Open as text', () => this._openText(path), '.small');
    }
    /** a button; cls: '.small', '.primary' … */
    _actBtn(icon, label, fn, cls) {
      const b = h('button.btn' + (cls || ''), { type: 'button', html: MG.icon(icon) + `<span>${esc(label)}</span>` });
      b.addEventListener('click', fn);
      return b;
    }
    /** a CSV or TSV file as a table that can be sorted, searched and filtered (dataview.js), with the types of its
        columns as R's read.csv() reads them */
    async _tableView(path, V, stale) {
      const e = this.fs.get(path);
      if (this.fs.size(e) > TABLE_MAX) {
        V.classList.remove('k-table');
        V.appendChild(this._card(path, { tooBig: true }, stale));
        return;
      }
      const text = e.kind === 'text' ? e.text : decodeText(await this.fs.readBytes(path));
      if (stale()) return;
      if (text == null) {
        V.classList.remove('k-table');
        V.appendChild(this._card(path, {}, stale));
        return;
      }
      const sep = /\.csv$/i.test(path) ? sepOf(text) : '\t';
      const t = parseDelimited(text, sep, TABLE_ROWS);
      if (!t.header.length) {
        V.classList.remove('k-table');
        V.appendChild(h('div.ed-card', h('p', 'This table is empty.'), h('p', this._textBtn(path))));
        return;
      }
      const columns = t.header.map((nm, j) => column(nm, t.rows.map((r) => (r[j] == null ? '' : r[j]))));
      const box = h('div.ed-grid');
      V.appendChild(box);
      this._grid = new MG.DataGrid(box, { title: MG.path.basename(path), nrow: t.nrow, ncol: columns.length, shown: t.rows.length, columns }, { filters: false });
      const fn = sep === '\t' ? 'read.delim()' : sep === ';' ? 'read.csv2()' : 'read.csv()';
      V.appendChild(h('div.ed-foot', this._textBtn(path), h('span', `Under each column name is the column’s type, as R’s ${fn} would read it: int for whole numbers, dbl for other numbers, chr for text and lgl for TRUE/FALSE. Click a column name to sort by it.`)));
    }
    /** a file that is not shown: what it is, how R reads it, what can be done with it */
    _card(path, opts, stale) {
      const e = this.fs.get(path);
      const n = MG.path.basename(path);
      const size = MG.humanSize(this.fs.size(e)) + 'B';
      const f = rstr(this.fs.pretty(path)), v = rName(n);
      let title, text, code = null;
      if (opts.tooBig && /\.(csv|tsv|tab)$/i.test(n)) {
        title = 'A large table';
        text = 'It is too large to show here, but R can read it like any other table (this may take a moment):';
        code = `${v} <- ${/\.csv$/i.test(n) ? 'read.csv' : 'read.delim'}(${f})`;
      } else if (opts.tooBig) {
        title = 'A large file';
        text = 'It is too large to show here, but you can look at its first lines in the Terminal or in R:';
        code = `readLines(${f}, n = 20)`;
      } else if (/\.xlsx?$/i.test(n)) {
        title = 'An Excel workbook';
        text = 'It is not a text file, so it can’t be shown here. R reads Excel sheets with the readxl package, and RStudio’s Import Dataset dialog shows you a preview of the data and writes the code for you:';
        code = `library(readxl)\n${v} <- read_excel(${f})`;
      } else if (/\.(rdata|rda)$/i.test(n)) {
        title = 'Saved R objects';
        text = 'This is R’s own file format for saved objects. It is written by save() or save.image(), or by q() when you answer yes to saving the workspace. load() puts the objects back into R’s memory, each under the name it was saved with:';
        code = `load(${f})`;
      } else if (/\.rds$/i.test(n)) {
        title = 'A saved R object';
        text = 'This file holds a single R object, written by saveRDS(). readRDS() reads it back, and you choose the name to give it:';
        code = `${v} <- readRDS(${f})`;
      } else if (/\.zip$/i.test(n)) {
        title = 'A zip archive';
        text = 'One or more files packed into a single file. Unpack it to see and use the files inside.';
      } else {
        title = 'Not a text file';
        text = 'It is not plain text, so it can’t be shown here. Download it to open it with a program on your computer.';
      }
      const [icon] = iconOf(n);
      const card = h('div.ed-card', h('div.ed-card-h', h('span.ed-card-ic', { html: MG.icon(icon) }), h('div', h('h3', title), h('p.ed-card-sub', `${n} · ${size}`))), h('p', text));
      if (code) card.appendChild(h('pre.ed-code', code));
      const acts = h('div.ed-card-acts');
      this._actions(path).forEach((a) => acts.appendChild(this._actBtn(a.icon, a.label, a.fn, acts.children.length ? '' : '.primary')));
      if (/\.zip$/i.test(n) && this._mine(path)) acts.appendChild(this._actBtn('zip', 'Unpack it here', () => this.unzip(path), acts.children.length ? '' : '.primary'));
      if (opts.tooBig) {
        const rel = this.fs.cwd && path.startsWith(this.fs.cwd + '/') ? shq(path.slice(this.fs.cwd.length + 1)) : shPath(this.fs, path);
        acts.appendChild(this._actBtn('terminal', `Run in the Terminal: head -n 20 ${n}`, () => this._terminal(`head -n 20 ${rel}`, true)));
      }
      acts.appendChild(this._actBtn('download', 'Download', () => this.download(path)));
      card.appendChild(acts);
      if (/\.xlsx$/i.test(n)) this._sheets(path, card, stale);
      return card;
    }
    /** the names of the sheets of an Excel workbook (read in the page, as RStudio's Import Dataset reads them) */
    async _sheets(path, card, stale) {
      const read = MG.RStudio && MG.RStudio.readXlsx;
      if (!read) return;
      try {
        const x = await read(await this.fs.readBytes(path), null, 1);
        if (stale() || !x || !x.sheets || !x.sheets.length) return;
        card.insertBefore(h('p.ed-sheets', h('b', x.sheets.length === 1 ? 'Sheet: ' : 'Sheets: '), x.sheets.join(', ') + (x.sheets.length > 1 ? ' (read_excel() reads the first sheet unless you choose another with sheet = "…")' : '')), card.querySelector('.ed-code'));
      } catch (err) {
        /* not a workbook that can be read here: no list */
      }
    }

    /* ------------------------------------------------------------------
       making, renaming, copying, moving and deleting files
       ------------------------------------------------------------------ */
    /** the folder that new files go into: the folder chosen in the tree, or that of the file chosen */
    _baseDir() {
      const p = this.sel || this.current || this.viewPath;
      if (p && this._mine(p) && this.fs.exists(p)) return this.fs.isDir(p) ? p : MG.path.dirname(p);
      return this.home;
    }
    async upload(dir, folder) {
      folder = folder || this._baseDir();
      const paths = await MG.app.pickFiles(folder, dir);
      if (paths && paths.length) {
        this.expanded.add(folder);
        this._saveExpanded();
        if (paths.length === 1) this.reveal(paths[0]);
        else this.renderTree();
      }
    }
    async unzip(p) {
      const folder = MG.path.dirname(p);
      try {
        const out = await MG.project.unzip(this.fs, p, folder);
        toast(`Unpacked ${out.length} file${out.length === 1 ? '' : 's'} into ${esc(this.fs.pretty(folder))}.`, 'ok');
        this.expanded.add(folder);
        this._saveExpanded();
        this.renderTree();
      } catch (e) {
        toast('Could not unpack the zip file: ' + esc(e.message), 'error');
      }
    }
    async _ask(title, label, value, ok) {
      return (MG.promptText ? await MG.promptText(title, label, value, ok) : window.prompt(label, value)) || null;
    }
    async newFile(base) {
      base = base || this._baseDir();
      let def = 'script.R';
      for (let i = 2; this.fs.exists(base + '/' + def); i++) def = `script${i}.R`;
      const name = await this._ask('New file', `Enter a name for the new file in ${this.fs.pretty(base)}. The ending of the name says what kind of file it is: .R for an R script, .Rmd for R Markdown, .qmd for Quarto, .md for Markdown, .csv for a table and .txt for plain text.`, def, 'Create');
      if (!name) return;
      const abs = this.fs.resolve(name, base);
      if (!this._mine(abs) || abs === this.home) return toast('New files can only be made in your home folder (~).', 'warn');
      if (this.fs.exists(abs)) return this.fs.isDir(abs) ? toast(`There is already a folder called <b>${esc(name)}</b>.`, 'warn') : this.openFile(abs);
      try {
        this.fs.mkdirp(MG.path.dirname(abs));
        this.fs.writeText(abs, '');
      } catch (err) {
        return toast(esc(err.message), 'warn');
      }
      this._expandTo(abs);
      this.sel = abs;
      return this._openText(abs);
    }
    async newFolder(base) {
      base = base || this._baseDir();
      const name = await this._ask('New folder', `Enter a name for the new folder in ${this.fs.pretty(base)}:`, 'new_folder', 'Create');
      if (!name) return;
      const abs = this.fs.resolve(name, base);
      if (!this._mine(abs) || abs === this.home) return toast('Folders can only be made in your home folder (~).', 'warn');
      try {
        this.fs.mkdirp(abs);
      } catch (err) {
        return toast(esc(err.message), 'warn');
      }
      this._expandTo(abs);
      this.expanded.add(abs);
      this._saveExpanded();
      this.sel = abs;
      this.renderTree();
    }
    async rename(p) {
      const old = MG.path.basename(p);
      const name = await this._ask('Rename', `Enter a new name for ${old}:`, old, 'Rename');
      if (!name || name === old) return;
      if (/[\/\\]/.test(name)) return toast('A name can’t contain a slash (/). To put it into another folder, use Move to… or drag it onto that folder.', 'warn');
      const to = MG.path.dirname(p) + '/' + name;
      if (this.fs.exists(to)) return toast(`There is already a file or folder called <b>${esc(name)}</b> here.`, 'warn');
      if (!this.fs.rename(p, to)) return toast(`${esc(old)} could not be renamed.`, 'warn');
      toast(`Renamed to <b>${esc(name)}</b>.`, 'ok', 1800);
    }
    duplicate(p) {
      const dir = MG.path.dirname(p);
      const m = /^(.+?)(\.[^.]*)?$/.exec(MG.path.basename(p));
      let to = `${dir}/${m[1]}-copy${m[2] || ''}`;
      for (let i = 2; this.fs.exists(to); i++) to = `${dir}/${m[1]}-copy${i}${m[2] || ''}`;
      this._copyTree(p, to);
      this.reveal(to);
    }
    /** a file from outside the home folder: a copy of it in ~ */
    copyHome(p) {
      const m = /^(.+?)(\.[^.]*)?$/.exec(MG.path.basename(p));
      let to = `${this.home}/${m[1]}${m[2] || ''}`;
      for (let i = 2; this.fs.exists(to); i++) to = `${this.home}/${m[1]}-${i}${m[2] || ''}`;
      this._copyTree(p, to);
      toast(`Copied to <b>${esc(this.fs.pretty(to))}</b>. This copy is your own, so you can change it.`, 'ok');
      this.reveal(to);
    }
    async copyTo(p) {
      const dir = await this._pickFolder('Copy to…', p, true);
      if (dir) this._transfer(p, dir, true);
    }
    async moveTo(p) {
      const dir = await this._pickFolder('Move to…', p, false);
      if (dir) this._transfer(p, dir, false);
    }
    /** choose a folder of the home folder → its path, or null */
    _pickFolder(title, src, copy) {
      return new Promise((resolve) => {
        const dirs = [this.home];
        for (const [q, e] of this.fs.entries) if (e.kind === 'dir' && q.startsWith(this.home + '/') && (this.showHidden || !/\/\./.test(q.slice(this.home.length)))) dirs.push(q);
        const ok = dirs.filter((d) => d !== src && !d.startsWith(src + '/')).sort();
        let done = false;
        const m = MG.modal(title, `<p>Which folder do you want to ${copy ? 'copy' : 'move'} <b>${esc(MG.path.basename(src))}</b> into?</p><div class="pick-list"></div>`, {
          onClose: () => {
            if (!done) {
              done = true;
              resolve(null);
            }
          }
        });
        const box = m.box.querySelector('.pick-list');
        for (const d of ok) {
          const here = d === MG.path.dirname(src);
          const b = h('button.pick-item', { type: 'button', disabled: here && !copy ? true : null }, this.fs.pretty(d) + (here ? '   (where it is now)' : ''));
          b.addEventListener('click', () => {
            done = true;
            m.close();
            resolve(d);
          });
          box.appendChild(b);
        }
      });
    }
    /** copy or move a file or folder into a folder (a copy into its own folder is a duplicate) → true when done */
    _transfer(src, dir, copy) {
      const name = MG.path.basename(src);
      const to = dir + '/' + name;
      if (copy && to === src) {
        this.duplicate(src);
        return true;
      }
      if (this.fs.exists(to)) {
        toast(`There is already a file or folder called <b>${esc(name)}</b> in ${esc(this.fs.pretty(dir))}.`, 'warn');
        return false;
      }
      try {
        if (copy) this._copyTree(src, to);
        else if (!this.fs.rename(src, to)) throw new Error('it can’t be put in that folder');
      } catch (err) {
        toast(`Could not ${copy ? 'copy' : 'move'} ${esc(name)}: ${esc(err.message)}`, 'warn');
        return false;
      }
      this.expanded.add(dir);
      this._saveExpanded();
      this.sel = to;
      this.renderTree();
      toast(`${copy ? 'Copied' : 'Moved'} <b>${esc(name)}</b> to ${esc(this.fs.pretty(dir))}.`, 'ok', 2200);
      return true;
    }
    _copyTree(src, to) {
      const e = this.fs.get(src);
      if (!e) return;
      if (e.kind !== 'dir') return this.fs.copy(src, to);
      this.fs.mkdirp(to);
      for (const [q, x] of Array.from(this.fs.entries)) {
        if (!q.startsWith(src + '/')) continue;
        if (x.kind === 'dir') this.fs.mkdirp(to + q.slice(src.length));
        else this.fs.copy(q, to + q.slice(src.length));
      }
    }
    /** delete a file or folder (asks first) */
    async remove(p) {
      const e = this.fs.get(p);
      if (!e || p === this.home) return;
      const isDir = e.kind === 'dir';
      const n = isDir ? Array.from(this.fs.entries.keys()).filter((k) => k.startsWith(p + '/')).length : 0;
      const ok = await MG.confirmBox('Delete?', `<p>Delete <b>${esc(this.fs.pretty(p))}</b>${isDir ? ` and everything in it (${n} item${n === 1 ? '' : 's'})` : ''}? This cannot be undone.</p>`, 'Delete', { danger: true });
      if (!ok || !this.fs.exists(p)) return;
      this.fs.remove(p);
      // (its open files close: their edits go with them)
      const under = (q) => q === p || q.startsWith(p + '/');
      for (const q of Array.from(this.open.keys())) if (under(q)) this.open.delete(q);
      if (this.sel && under(this.sel)) this.sel = null;
      if (this.current && under(this.current)) {
        this.current = null;
        const next = Array.from(this.open.keys()).pop();
        if (next) this.show(next, { noFocus: true });
        else this._empty();
      } else if (this.viewPath && under(this.viewPath)) this._empty();
      else this._renderTabs();
      this._persist();
      toast(`Deleted <b>${esc(MG.path.basename(p))}</b>.`, null, 2000);
    }
    async download(p) {
      p = p || this.current || this.viewPath;
      if (!p) return;
      if (this.fs.isDir(p)) return MG.project.download(p, (MG.path.basename(p) || 'files') + '.zip');
      try {
        MG.downloadBlob(await this.fs.toBlob(p), MG.path.basename(p));
        bus.emit('file:download', { path: p });
      } catch (err) {
        toast(esc(err.message), 'error');
      }
    }
    /** the tab is shown */
    shown() {
      if (!this.cmHost.hidden) this.cm.refresh();
      if (this._grid) this._grid._draw(true);
      this._usage();
    }
  }

  /** the files of a drop – folders too (webkitGetAsEntry), with their paths */
  async function filesOfDrop(dt) {
    const items = Array.from(dt.items || []);
    const entries = items.map((it) => (it.webkitGetAsEntry ? it.webkitGetAsEntry() : null)).filter(Boolean);
    if (!entries.length || !entries.some((e) => e.isDirectory)) return Array.from(dt.files);
    const out = [];
    const walk = (entry, prefix) =>
      new Promise((resolve) => {
        if (entry.isFile) {
          entry.file(
            (f) => {
              try {
                Object.defineProperty(f, 'relativePath', { value: prefix + f.name });
              } catch (e) {
                /* read-only */
              }
              out.push(f);
              resolve();
            },
            () => resolve()
          );
        } else if (entry.isDirectory) {
          const reader = entry.createReader();
          const all = [];
          const more = () =>
            reader.readEntries(
              async (batch) => {
                if (!batch.length) {
                  for (const c of all) await walk(c, prefix + entry.name + '/');
                  resolve();
                } else {
                  all.push(...batch);
                  more();
                }
              },
              () => resolve()
            );
          more();
        } else resolve();
      });
    for (const e of entries) await walk(e, '');
    return out;
  }

  /* ------------------------------------------------------------------
     tables
     ------------------------------------------------------------------ */
  /** the separator of a .csv file: a comma – or a semicolon, where a comma is the decimal mark (read.csv2) */
  function sepOf(text) {
    const first = text.slice(0, text.indexOf('\n') < 0 ? 4096 : Math.min(4096, text.indexOf('\n')));
    const n = (c) => first.split(c).length - 1;
    return n(';') > n(',') ? ';' : n('\t') > n(',') ? '\t' : ',';
  }
  /** delimited text → { header, rows (the first max), nrow (all) }. Quotes as in CSV: a quoted field can hold the
      separator, line breaks and "" (a quote). A line with nothing on it is no row. */
  function parseDelimited(text, sep, max) {
    const S = sep.charCodeAt(0);
    const n = text.length;
    const rows = [];
    let row = [], total = 0, i = 0;
    const field = () => {
      // (up to the separator or the end of the line)
      let e = i;
      while (e < n) {
        const c = text.charCodeAt(e);
        if (c === S || c === 10 || c === 13) break;
        e++;
      }
      const f = text.slice(i, e);
      i = e;
      return f;
    };
    for (;;) {
      let f;
      if (text.charCodeAt(i) === 34) {
        let j = i + 1, part = '';
        for (;;) {
          const k = text.indexOf('"', j);
          if (k < 0) {
            part += text.slice(j);
            i = n;
            break;
          }
          if (text.charCodeAt(k + 1) === 34) {
            part += text.slice(j, k + 1);
            j = k + 2;
            continue;
          }
          part += text.slice(j, k);
          i = k + 1;
          break;
        }
        f = part + field();
      } else f = field();
      row.push(f);
      const c = i < n ? text.charCodeAt(i) : -1;
      if (c === S) {
        i++;
        continue;
      }
      if (c === 13 && text.charCodeAt(i + 1) === 10) i++;
      i++;
      if (!(row.length === 1 && row[0] === '')) {
        if (rows.length <= max) rows.push(row);
        total++;
      }
      row = [];
      if (c === -1 || i >= n) break;
    }
    return { header: rows.length ? rows[0] : [], rows: rows.slice(1), nrow: Math.max(0, total - 1) };
  }
  const NA = (v) => v === 'NA' || v === '';
  const INT = /^\s*[-+]?\d{1,10}\s*$/;
  const NUM = /^\s*([-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?|[-+]?Inf|NaN)\s*$/;
  const LGL = /^\s*(TRUE|FALSE|T|F|true|false|True|False)\s*$/;
  /** a column of strings → {name, type, values} for the data viewer, as read.csv() reads it (type.convert): "NA" is
      a missing value, and so is an empty field in a column of numbers or of TRUE and FALSE */
  function column(name, vals) {
    let lgl = true, int = true, num = true, any = false;
    for (const v of vals) {
      if (NA(v)) continue;
      any = true;
      if (lgl && !LGL.test(v)) lgl = false;
      if (int && !(INT.test(v) && Math.abs(Number(v)) <= 2147483647)) int = false;
      if (num && !NUM.test(v)) num = false;
      if (!lgl && !num) break;
    }
    const number = (v) => {
      const t = v.trim();
      return /Inf$/.test(t) ? (t[0] === '-' ? -Infinity : Infinity) : Number(t);
    };
    if (!any || lgl) return { name, type: 'logical', values: vals.map((v) => (NA(v) ? null : /^\s*(TRUE|T|true|True)\s*$/.test(v))) };
    if (int) return { name, type: 'integer', values: vals.map((v) => (NA(v) ? null : Number(v.trim()))) };
    if (num) return { name, type: 'numeric', values: vals.map((v) => (NA(v) ? null : number(v))) };
    return { name, type: 'character', values: vals.map((v) => (v === 'NA' ? null : v)) };
  }

  MG.Editor = Editor;
})();
