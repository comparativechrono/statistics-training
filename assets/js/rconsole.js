/* =====================================================================
   The R console tab: R on its own, as R's own program (R GUI) shows it –
   the console, a window of its own for each graphics device, help pages
   in a help window, View() in a data window. Nothing else: no editor, no
   list of variables, no files – what R alone gives you.

   R is an R session of its own (rsession.js): RStudio, the notebook and
   the terminal have theirs.
   ===================================================================== */
(function () {
  'use strict';
  const MG = window.MG;
  const { h, esc, bus, toast, store } = MG;

  class RConsoleApp {
    constructor(root, opts = {}) {
      this.root = root;
      this.opts = opts;
      this.windows = new Map(); // canvas id → {win, plot}
      this.devWins = []; // graphics windows in the order they were opened
      this._build();
      this.start();
    }
    _build() {
      const R = this.root;
      R.classList.add('rgui');
      const tb = (icon, label, title, fn, cls) => {
        const b = h('button.rg-btn' + (cls || ''), { type: 'button', title, 'aria-label': title, html: MG.icon(icon) + (label ? `<span>${esc(label)}</span>` : '') });
        b.addEventListener('click', fn);
        return b;
      };
      this.stopBtn = tb('stop', 'Stop', 'Stop the current computation (Esc)', () => this.interrupt(), '.stop');
      this.stopBtn.disabled = true;
      const menu = (label, items) => {
        const b = h('button.rg-menu', { type: 'button', 'aria-haspopup': 'menu' }, label);
        b.addEventListener('click', () => MG.popmenu(b, items()));
        return b;
      };
      this.menubar = h(
        'div.rg-menubar',
        menu('File', () => [
          ['code', 'Source R code…', () => this.sourceDialog()],
          ['upload', 'Load Workspace…', () => this.loadWorkspace()],
          ['save', 'Save Workspace…', () => this.run('save.image()')],
          ['folder', 'Change dir…', () => this.chdirDialog()],
          ['download', 'Save to File… (the console as text)', () => this.saveConsole()],
          ['x', 'Exit (q())', () => this.run('q()')]
        ]),
        menu('Edit', () => [
          ['copy', 'Copy', () => document.execCommand && document.execCommand('copy')],
          ['trash', 'Clear console (Ctrl+L)', () => this.cv.clear()]
        ]),
        menu('Misc', () => [
          ['stop', 'Stop current computation (Esc)', () => this.interrupt()],
          ['list', 'List objects (ls())', () => this.run('ls()')],
          ['trash', 'Remove all objects', () => this.run('rm(list = ls())')],
          ['reset', 'Restart R (with an empty memory)', () => this.restartDialog()]
        ]),
        menu('Packages', () => [
          ['download', 'Install package(s)…', () => this.installDialog()],
          ['book', 'Load package…', () => this.loadPackageDialog()],
          ['list', 'Installed packages (library())', () => this.run('library()')]
        ]),
        menu('Windows', () => {
          const it = [['terminal', 'R Console', () => this.cv.focus()]];
          for (const w of this.root.querySelectorAll('.fwin')) {
            const t = w.querySelector('.fwin-t').textContent;
            it.push(['image', t, () => (w.style.zIndex = 9999, w.dispatchEvent(new PointerEvent('pointerdown')))]);
          }
          if (it.length > 1) it.push(['x', 'Close all windows', () => this.closeWindows()]);
          return it;
        }),
        menu('Help', () => [
          ['help', 'Console', () => this.consoleHelp()],
          ['book', 'R functions (text)… – help(name)', () => this.helpDialog()],
          ['search', 'Search help… – help.search()', () => this.searchDialog()],
          ['info', 'About R', () => this.run('R.version.string')]
        ])
      );
      this.status = h('span.rg-status');
      this.toolbar = h('div.rg-toolbar', tb('code', '', 'Source R code… (run a script with source("file.R"))', () => this.sourceDialog()), tb('upload', '', 'Load workspace (.RData)', () => this.loadWorkspace()), tb('save', '', 'Save workspace (save.image())', () => this.run('save.image()')), h('span.rg-sep'), tb('copy', '', 'Copy', () => document.execCommand && document.execCommand('copy')), h('span.rg-sep'), this.stopBtn, h('span.grow'), this.status);
      this.desk = h('div.rg-desk');
      const conBody = h('div.rg-conbody');
      this.conWin = h('div.rg-conwin', h('div.rg-contitle', h('span', 'R Console')), conBody);
      this.desk.appendChild(this.conWin);
      R.append(this.menubar, this.toolbar, this.desk);
      this.cv = new MG.ConsoleView(conBody, {
        theme: 'rgui',
        label: 'R console',
        onCannotInterrupt: () => this.cannotInterrupt(),
        onDead: () => this.deadNote(),
        askAI: 'console',
        // (Esc while a Shiny app runs stops the app, as in R)
        onInterrupt: () => {
          if (!this.shinyApp) return false;
          MG.Shiny.stop(this.S);
          return true;
        }
      });
      this.history = store.get('rconHistory', []);
      if (Array.isArray(this.history)) this.cv.history = this.history.slice(-500);
      this.cv.opts.onHistory = () => store.set('rconHistory', this.cv.history.slice(-500));
    }

    /* ---------------- R ---------------- */
    start() {
      const S = new MG.R.Session({ kind: 'console', banner: true, graphics: 'canvas', cwd: MG.app.HOME, restoreData: true });
      this.S = S;
      this.cv.attach(S);
      this.windows.clear();
      this.devWins = [];
      S.on('state', (d) => this._state(d));
      S.on('plot', (d) => this._plot(d));
      S.on('help', (d) => this._help(d));
      S.on('helpchoice', (d) => this._helpChoice(d));
      S.on('view', (d) => this._view(d));
      S.on('pager', (d) => this._pager(d));
      S.on('browse', (d) => MG.app.browse(d.url, { from: 'console' }));
      S.on('edit', (d) => MG.app.editFile(d.file));
      S.on('idle', () => this._idle());
      S.on('wd', () => this._state({ state: S.state }));
      S.on('ended', (d) => this._ended(d));
      S.on('event', (d) => d.event === 'shiny' && this._shiny(d));
      S.on('installed', (d) => toast(`Installed <b>${esc([].concat(d.pkgs).join(', '))}</b>. You can now load ${[].concat(d.pkgs).length === 1 ? 'it' : 'them'} with library() in any R session in the workbench.`, 'ok', 5000));
      S.start().then(() => {
        // (R's devices have 72 pixels to the inch, the page 96: plots are drawn at 3/4 of their window's size in R's
        // pixels, and shown at the window's size – their text as large as in R's own windows)
        const f = this.figSize();
        S.figSize(f.w * 0.75, f.h * 0.75);
      }, (e) => {
        const why = String((e && e.message) || e).trim();
        this.cv.note(`R could not start: ${why}${/[.!?]$/.test(why) ? '' : '.'} ${/internet connection/.test(why) ? 'Then reload the page.' : 'Check your internet connection and reload the page.'}`);
      });
      this._sizeSoon();
      return S;
    }
    _state(d) {
      const S = this.S;
      const busy = d.state === 'busy' || d.state === 'starting';
      this.stopBtn.disabled = !(d.state === 'busy' || d.state === 'input' || d.state === 'browser' || d.state === 'continue');
      const v = S.versions ? `R ${S.versions.r}` : 'R';
      const wd = S.wd ? MG.app.fs.pretty(S.wd) : '~';
      const what = d.state === 'starting' ? (d.text || 'Starting R…') : busy ? 'Busy' : d.state === 'ended' ? 'R has ended' : d.state === 'failed' ? 'R could not start' : d.state === 'input' ? 'Waiting for input' : d.state === 'browser' ? 'Debugging (browser)' : 'Ready';
      this.status.innerHTML = `${busy ? '<span class="spinner small"></span>' : `<span class="kdot ${d.state === 'failed' || d.state === 'ended' ? 'bad' : 'ok'}"></span>`}<span>${esc(what)}</span><span class="rg-wd" title="R's working directory: getwd()">${esc(v)} · ${esc(wd)}</span>`;
      this.root.classList.toggle('busy', busy);
    }
    run(code) {
      if (!this.S || this.S.state === 'ended' || this.S.state === 'failed') return this.deadNote();
      this.cv.run(code);
    }
    type(code) {
      this.cv.type(code);
    }
    interrupt() {
      this.cv.interrupt();
    }
    cannotInterrupt() {
      const m = MG.modal(
        'Stop R?',
        `<p>R cannot be interrupted in this browser, because the page is not cross-origin isolated (see the README). The only way to stop it is to end this R session and start a new one, which loses all its variables.</p><div class="prompt-actions"><button class="btn" data-x="no" type="button">Let it run</button><button class="btn danger" data-x="yes" type="button">End R and start again</button></div>`
      );
      m.box.querySelector('[data-x="no"]').addEventListener('click', () => m.close());
      m.box.querySelector('[data-x="yes"]').addEventListener('click', () => {
        m.close();
        this.restart();
      });
    }
    deadNote() {
      if (this._deadShown && this._deadShown.isConnected) return;
      const b = h('button.btn.small', { type: 'button' }, 'Start R again');
      b.addEventListener('click', () => this.restart());
      this._deadShown = h('div.rc-note.rc-dead', 'R is not running. ', b);
      this.cv.html(this._deadShown);
    }
    restartDialog() {
      const m = MG.modal('Restart R?', `<p>This starts a new R session with nothing in its memory. The objects you have created will be lost, but your files are not affected. It is the same as closing R and opening it again.</p><div class="prompt-actions"><button class="btn" data-x="no" type="button">Cancel</button><button class="btn primary" data-x="yes" type="button">Restart R</button></div>`);
      m.box.querySelector('[data-x="no"]').addEventListener('click', () => m.close());
      m.box.querySelector('[data-x="yes"]').addEventListener('click', () => {
        m.close();
        this.restart();
      });
    }
    /** runApp(): R would open the app in a web browser – here, a window of the console's own */
    _shiny(d) {
      if (!MG.Shiny) return;
      MG.Shiny.start(this.S, d, {
        show: (app) => {
          this.shinyApp = app;
          const win = new MG.FloatWin(this.desk, {
            kind: 'browser',
            title: `${app.title} – http://127.0.0.1:${app.port}`,
            w: Math.min(760, this.desk.clientWidth - 30),
            h: Math.min(560, this.desk.clientHeight - 30),
            onClose: () => app.running && MG.Shiny.stop(this.S)
          });
          win.body.appendChild(h('iframe.rbrowser', { title: 'Shiny app: ' + app.title, src: app.url }));
          win.tool('stopsq', 'Stop the app', () => MG.Shiny.stop(this.S));
          this.shinyWin = win;
          this.cv.hold('The Shiny app is running. Press Esc to stop it.');
          bus.emit('rcon:shiny', { title: app.title, running: true });
        },
        stopped: (app) => {
          if (this.shinyApp === app) this.shinyApp = null;
          if (this.shinyWin) this.shinyWin.close();
          this.shinyWin = null;
          this.cv.release();
          bus.emit('rcon:shiny', { title: app.title, running: false });
        },
        failed: (msg) => this.cv.note(msg)
      });
    }
    restart() {
      if (this.shinyApp && MG.Shiny) MG.Shiny.stop(this.S, true);
      if (this.S) this.S.close(true);
      this.closeWindows();
      this.cv.note('— New R session —');
      this.start();
      bus.emit('rcon:restart', {});
    }
    _ended(d) {
      this.closeWindows(true);
      if (d && d.quit) {
        this.cv.note(d.quit.saved ? 'R has quit (the workspace was saved in .RData).' : 'R has quit.');
        this.deadNote();
      }
      bus.emit('rcon:quit', { saved: !!(d && d.quit && d.quit.saved) });
    }
    /** after each command: the graphics windows' titles (device numbers, the active one); the size of new plots */
    async _idle() {
      if (!this.devWins.length) return;
      const r = await this.S.evalLines('c(as.character(grDevices::dev.cur()), paste(names(grDevices::dev.list()), grDevices::dev.list()))');
      if (!r) return;
      const cur = Number(r[0]);
      const devs = r.slice(1).filter((x) => /^canvas \d+$/.test(x)).map((x) => Number(x.split(' ')[1]));
      // (the windows of devices that were closed in R – dev.off(), graphics.off() – close too)
      const open = this.devWins.filter((w) => !w.win.closed);
      open.forEach((w, i) => {
        const num = devs[i];
        if (num == null) {
          w.gone = true;
          w.win.close();
          return;
        }
        w.num = num;
        w.win.setTitle(`R Graphics: Device ${num}${num === cur ? ' (ACTIVE)' : ' (inactive)'}`);
      });
      this.devWins = this.devWins.filter((w) => !w.win.closed);
    }

    /* ---------------- windows ---------------- */
    _sizeSoon() {
      clearTimeout(this._st);
      this._st = setTimeout(() => this.sized(), 120);
    }
    /** the console's width in characters (options(width)), as R's console sets it */
    sized() {
      if (!this.S) return;
      const el = this.cv.out;
      const w = el.clientWidth;
      if (!w) return;
      const probe = h('span.rc-out', { style: { position: 'absolute', visibility: 'hidden', whiteSpace: 'pre' } }, 'x'.repeat(50));
      this.cv.out.appendChild(probe);
      const cw = probe.getBoundingClientRect().width / 50 || 8;
      probe.remove();
      const chars = Math.floor((w - 24) / cw);
      if (this.S.ready) this.S.consoleWidth(chars);
      else this.S.started && this.S.started.then(() => this.S.consoleWidth(chars)).catch(() => {});
    }
    _plot(d) {
      let rec = this.windows.get(d.id);
      if (!rec) {
        if (d.kind !== 'new' && !this._pendingResize) return;
        const pr = this._pendingResize;
        this._pendingResize = null;
        if (pr && !pr.win.closed) {
          // the same window, drawn again at its new size
          this.windows.delete(pr.id);
          pr.id = d.id;
          this.windows.set(d.id, pr);
          rec = pr;
        } else {
          rec = this._plotWindow(d.id);
        }
      }
      if (d.kind === 'new') rec.plot.newPage();
      else rec.plot.draw(d.image);
      if (d.kind === 'new') bus.emit('rcon:plot', {});
    }
    _plotWindow(id) {
      const desk = this.desk;
      const fig = this.figSize();
      const plot = new MG.PlotCanvas(fig.w * 2, fig.h * 2);
      const rec = { id, plot, win: null, num: null };
      const win = new MG.FloatWin(desk, {
        kind: 'plot',
        title: 'R Graphics: Device ' + (this.devWins.length + 2) + ' (ACTIVE)',
        w: fig.w + 2,
        h: fig.h + 30,
        onClose: () => {
          this.windows.delete(rec.id);
          // (closing the window closes R's device, as in R)
          if (!rec.gone && rec.num && this.S && this.S.ready) this.S.evalVoid(`if (${rec.num} %in% grDevices::dev.list()) grDevices::dev.off(${rec.num})`);
        },
        onResized: () => this._replot(rec)
      });
      win.body.appendChild(plot.canvas);
      win.tool('download', 'Save as PNG', () => {
        const a = h('a', { href: plot.png(), download: 'Rplot.png' });
        document.body.appendChild(a);
        a.click();
        a.remove();
      });
      rec.win = win;
      this.windows.set(id, rec);
      this.devWins.push(rec);
      return rec;
    }
    /** the size of a new plot window: R's default device is 7 × 7 inches; here about 480 × 420 pixels, to fit */
    figSize() {
      const W = this.desk.clientWidth || 900, H = this.desk.clientHeight || 600;
      return { w: Math.round(Math.max(320, Math.min(520, W * 0.55))), h: Math.round(Math.max(260, Math.min(460, H * 0.7))) };
    }
    async _replot(rec) {
      // a graphics window that was resized: R draws its plot again at the new size (recordPlot / replayPlot)
      if (!rec.num || !this.S || !this.S.idle) return;
      const b = rec.win.body;
      const w = Math.round(Math.max(160, b.clientWidth) * 0.75), hh = Math.round(Math.max(120, b.clientHeight) * 0.75);
      const f = this.figSize();
      this._pendingResize = rec;
      await this.S.evalVoid(`local({ d <- ${rec.num}; if (d %in% grDevices::dev.list()) { cur <- grDevices::dev.cur(); grDevices::dev.set(d); p <- grDevices::recordPlot(); grDevices::dev.off(d); w <- get("wb", envir = as.environment("tools:workbench")); w$set("fig", c(width = ${w}, height = ${hh})); grDevices::dev.new(); grDevices::replayPlot(p); w$set("fig", c(width = ${Math.round(f.w * 0.75)}, height = ${Math.round(f.h * 0.75)})); if (cur != d && cur %in% grDevices::dev.list()) grDevices::dev.set(cur) } })`);
      this._idle();
    }
    closeWindows(quiet) {
      for (const w of Array.from(this.desk.querySelectorAll('.fwin'))) w.remove();
      this.windows.clear();
      this.devWins = [];
      if (!quiet) return;
    }
    _help(d) {
      if (d.missing) {
        toast(`No documentation for <b>${esc(d.topic)}</b>${d.package ? ' in ' + esc(d.package) : ''}.`, 'warn');
        return;
      }
      let rec = this.helpWin && !this.helpWin.closed ? this.helpWin : null;
      if (!rec) {
        const desk = this.desk;
        rec = this.helpWin = new MG.FloatWin(desk, { kind: 'help', title: 'R Help', w: Math.min(640, desk.clientWidth - 40), h: Math.min(560, desk.clientHeight - 40), x: 20, y: 18 });
        rec.hist = [];
        rec.back = rec.tool('arrowUp', 'Back', () => {
          rec.hist.pop();
          const prev = rec.hist.pop();
          if (prev) this.S.helpTopic(prev.topic, prev.package);
        });
      }
      rec.hist.push({ topic: d.topic, package: d.package });
      rec.setTitle(`R Help: ${d.title || d.topic}${d.package ? ' {' + d.package + '}' : ''}`);
      rec.body.innerHTML = '';
      rec.body.appendChild(MG.helpHtml(d.html, (topic, pkg) => this.S.helpTopic(topic, pkg)));
      rec.body.scrollTop = 0;
      rec.front();
    }
    _helpChoice(d) {
      const m = MG.modal(`Help on topic ‘${d.topic}’`, `<p>Help on topic <b>${esc(d.topic)}</b> was found in several packages. Choose one:</p><div class="help-choice"></div>`);
      const box = m.box.querySelector('.help-choice');
      d.files.forEach((f, i) => {
        const b = h('button.btn', { type: 'button' }, `${d.packages[i]}::${d.topic}`);
        b.addEventListener('click', () => {
          m.close();
          this.S.helpFile(f, d.topic);
        });
        box.appendChild(b);
      });
    }
    _view(d) {
      const desk = this.desk;
      const win = new MG.FloatWin(desk, { kind: 'data', title: `Data: ${d.title}`, w: Math.min(720, desk.clientWidth - 40), h: Math.min(460, desk.clientHeight - 40) });
      new MG.DataGrid(win.body, d, { filters: false });
    }
    _pager(d) {
      const desk = this.desk;
      const win = new MG.FloatWin(desk, { kind: 'text', title: d.title || 'R Information', w: Math.min(640, desk.clientWidth - 40), h: Math.min(460, desk.clientHeight - 40) });
      win.body.appendChild(MG.rTextNode(d.text));
    }

    /* ---------------- dialogs of the menus ---------------- */
    _pickFile(title, filter, then) {
      const files = [];
      for (const [p, e] of MG.app.fs.entries) if (e.kind !== 'dir' && p.startsWith(MG.app.HOME + '/') && filter.test(p)) files.push(p);
      files.sort();
      const m = MG.modal(title, files.length ? '<div class="pick-list"></div>' : `<p>There are no files of this type among your files.</p>`);
      const box = m.box.querySelector('.pick-list');
      if (box)
        files.forEach((p) => {
          const b = h('button.pick-item', { type: 'button' }, MG.app.fs.pretty(p));
          b.addEventListener('click', () => {
            m.close();
            then(p);
          });
          box.appendChild(b);
        });
    }
    rpath(p) {
      return MG.R.rstr(p);
    }
    sourceDialog() {
      this._pickFile('Source R code', /\.r$/i, (p) => this.run(`source(${this.rpath(MG.app.fs.pretty(p))})`));
    }
    loadWorkspace() {
      this._pickFile('Load workspace', /\.rdata$|\.rda$/i, (p) => this.run(`load(${this.rpath(MG.app.fs.pretty(p))})`));
    }
    chdirDialog() {
      const dirs = [MG.app.HOME];
      for (const [p, e] of MG.app.fs.entries) if (e.kind === 'dir' && p.startsWith(MG.app.HOME + '/') && !/\/\./.test(p)) dirs.push(p);
      dirs.sort();
      const m = MG.modal('Change working directory', '<p>R’s working directory is the folder where R reads and writes files when you give a file name without a path. <code>getwd()</code> shows the working directory, and <code>setwd()</code> changes it.</p><div class="pick-list"></div>');
      const box = m.box.querySelector('.pick-list');
      dirs.forEach((p) => {
        const b = h('button.pick-item', { type: 'button' }, MG.app.fs.pretty(p));
        b.addEventListener('click', () => {
          m.close();
          this.run(`setwd(${this.rpath(MG.app.fs.pretty(p))})`);
        });
        box.appendChild(b);
      });
    }
    async installDialog() {
      const name = await MG.promptText('Install package(s)', 'Type the name of the package, or several names separated by commas. Packages are installed from the webR repository of CRAN packages.', '', 'Install');
      if (!name) return;
      const pk = name.split(/[\s,]+/).filter(Boolean);
      this.run(pk.length === 1 ? `install.packages("${pk[0]}")` : `install.packages(c(${pk.map((x) => `"${x}"`).join(', ')}))`);
    }
    async loadPackageDialog() {
      const name = await MG.promptText('Load package', 'The name of an installed package:', '', 'Load');
      if (name) this.run(`library(${name.trim()})`);
    }
    async helpDialog() {
      const name = await MG.promptText('Help on a function', 'The name of a function or topic:', '', 'Help');
      if (name) this.run(`help("${name.trim().replace(/"/g, '')}")`);
    }
    async searchDialog() {
      const q = await MG.promptText('Search help', 'Search the help pages for:', '', 'Search');
      if (q) this.run(`help.search("${q.trim().replace(/"/g, '')}")`);
    }
    saveConsole() {
      MG.downloadText(this.cv.text(), 'R-console.txt', 'text/plain');
    }
    consoleHelp() {
      MG.modal(
        'The R console',
        `<ul>
<li>Type an R command after the prompt <code>&gt;</code> and press <kbd>Enter</kbd>. R runs it and prints the result.</li>
<li>If the prompt changes to <code>+</code>, the command is not finished yet, because a bracket or a quote is still open. Finish the command, or press <kbd>Esc</kbd> to start again.</li>
<li><kbd>↑</kbd> and <kbd>↓</kbd> bring back earlier commands, <kbd>Tab</kbd> completes a name, and <kbd>Ctrl</kbd>+<kbd>L</kbd> clears the console.</li>
<li><kbd>Esc</kbd> (or the Stop button) stops a computation that is taking too long.</li>
<li>Plots open in a separate window, with one window for each graphics device (<code>dev.new()</code> opens another). <code>?name</code> opens a help page in a help window, and <code>View(data)</code> opens the data in a window too. You can move a window by dragging its title bar, and resize it by dragging its bottom-right corner.</li>
<li>This is the standard R console, as you get it when you install R from <a href="https://cran.r-project.org" target="_blank" rel="noopener">CRAN</a>. This tab has no script editor and no list of your variables, but <code>ls()</code> lists them. Write longer code in a script (in the RStudio tab or in Files) and run it with <code>source("script.R")</code>.</li>
<li>When you quit R with <code>q()</code>, it asks whether to save the workspace (everything in its memory) in a file called <code>.RData</code>.</li>
</ul>`
      );
    }
    shown(opts) {
      if (!opts || !opts.resize) setTimeout(() => this.cv.focus(), 30);
      this._sizeSoon();
    }
  }

  MG.RConsoleApp = RConsoleApp;
})();
