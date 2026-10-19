/* =====================================================================
   The frame of the R workbench: the tabs on the right (each built the
   first time it is shown), the instructions on the left (which can be
   hidden, and resized), full screen, the "My files" menu, the storage
   indicator, the button with the person's name, and the start: the page's
   own set-up (page.js: MG.page.init), then the instructions
   (tutorial.js: MG.tutorial.init).
   ===================================================================== */
(function () {
  'use strict';
  const MG = window.MG;
  const { h, esc, bus, toast, store, $, $$ } = MG;
  MG.app = MG.app || {};
  MG.page = MG.page || {};
  MG.actions = MG.actions || {};

  const narrow = () => window.matchMedia('(max-width: 1000px)').matches;
  let ready = false;

  const TAB_NAME = { console: 'R console', rstudio: 'RStudio', notebook: 'Notebook', terminal: 'Terminal', editor: 'Files', assistant: 'AI assistant' };
  MG.app.tabName = TAB_NAME;

  /* ------------------------------------------------------------------
     the tabs of the workbench
     ------------------------------------------------------------------ */
  function initTabs() {
    const tabs = $$('.wb-tab[data-wb]');
    const panes = $$('.wb-pane');
    const built = new Set();
    const building = new Map();
    /** show a tab; the first time, build it. → a promise that resolves when it is built.
        opts.noOpen: on a narrow screen, do not slide the workbench over the instructions */
    MG.app.showWorkbench = (name, opts = {}) => {
      const pane = panes.find((p) => p.dataset.wb === name);
      if (!pane) return Promise.resolve();
      if (narrow() && !opts.noOpen && ready) document.body.classList.add('bench-open');
      tabs.forEach((t) => {
        const on = t.dataset.wb === name;
        t.classList.toggle('on', on);
        t.setAttribute('aria-selected', on ? 'true' : 'false');
        t.tabIndex = on ? 0 : -1;
        if (on) t.classList.remove('attn');
      });
      panes.forEach((p) => (p.hidden = p !== pane));
      const prev = MG.app.currentBench;
      if (prev && prev !== name) MG.app.prevBench = prev;
      MG.app.currentBench = name;
      let p = Promise.resolve();
      if (!built.has(name) && MG.page.lazy && MG.page.lazy[name]) {
        built.add(name);
        p = Promise.resolve()
          .then(() => MG.page.lazy[name](pane))
          .catch((e) => {
            console.error(e);
            pane.firstElementChild.innerHTML = `<div class="wb-failed"><h3>${esc(TAB_NAME[name] || name)} could not start</h3><p>${esc(e.message || String(e))}</p><p>Reload the page to try again.</p></div>`;
          });
        building.set(name, p);
      } else if (building.has(name)) p = building.get(name);
      p.then(() => {
        if (MG.app.currentBench !== name) return;
        const hook = MG.page.shown && MG.page.shown[name];
        if (hook) setTimeout(() => hook(pane, opts), 20);
      });
      if (prev !== name) {
        store.set('bench', name);
        bus.emit('app:bench', { name });
      }
      return p;
    };
    MG.app.tabBuilt = (name) => built.has(name);
    tabs.forEach((t) => t.addEventListener('click', () => MG.app.showWorkbench(t.dataset.wb)));
    // arrow keys move along the tabs (as in other tab lists)
    const list = $('.wb-tabs');
    list.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const i = tabs.indexOf(document.activeElement);
      if (i < 0) return;
      e.preventDefault();
      const t = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
      t.focus();
      MG.app.showWorkbench(t.dataset.wb);
    });
    const fab = $('.bench-fab'), close = $('.bench-close');
    if (fab) fab.addEventListener('click', () => document.body.classList.add('bench-open'));
    if (close) close.addEventListener('click', () => document.body.classList.remove('bench-open'));
  }

  /* ------------------------------------------------------------------
     the instructions: hide and show them, resize them, full screen
     ------------------------------------------------------------------ */
  const tutOpen = () => !document.body.classList.contains('tut-off');
  function setTutOpen(open, opts = {}) {
    if (narrow()) {
      document.body.classList.toggle('bench-open', !open);
      return;
    }
    document.body.classList.toggle('tut-off', !open);
    if (!opts.noSave) store.set('tutOff', !open);
    const t = $('#tutToggle');
    if (t) {
      t.setAttribute('aria-expanded', open ? 'true' : 'false');
      t.title = open ? 'Hide the instructions so that the workbench fills the window (Ctrl+\\)' : 'Show the instructions (Ctrl+\\)';
      t.innerHTML = MG.icon(open ? 'sidebarClose' : 'sidebarOpen');
    }
    const rail = $('#tutRail');
    if (rail) rail.hidden = open;
    resized();
    bus.emit('app:tut', { open });
  }
  MG.app.toggleInstructions = (open) => setTutOpen(open == null ? !tutOpen() : !!open);

  /** after the workbench changed size: the tabs measure themselves again */
  const resized = MG.debounce(() => {
    window.dispatchEvent(new Event('resize'));
    const hook = MG.page.shown && MG.page.shown[MG.app.currentBench];
    if (hook) hook($(`.wb-pane[data-wb="${MG.app.currentBench}"]`), { resize: true });
  }, 60);
  MG.app.resized = resized;

  function initTutPane() {
    const t = $('#tutToggle');
    if (t) t.addEventListener('click', () => MG.app.toggleInstructions());
    const rail = $('#tutRail');
    if (rail) rail.addEventListener('click', () => setTutOpen(true));
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === '\\' || e.code === 'Backslash')) {
        e.preventDefault();
        MG.app.toggleInstructions();
      }
    });
    if (!narrow()) setTutOpen(!store.get('tutOff', false), { noSave: true });

    // full screen: the browser's full screen, with the instructions hidden (and shown again afterwards)
    const full = $('#fullBtn');
    if (!full) return;
    let before = null;
    const label = () => {
      const on = !!document.fullscreenElement;
      full.innerHTML = MG.icon(on ? 'shrink' : 'expand') + `<span>${on ? 'Exit full screen' : 'Full screen'}</span>`;
      full.title = on ? 'Leave full screen (Esc)' : 'Make the workbench fill the whole screen';
    };
    if (!document.documentElement.requestFullscreen) full.hidden = true;
    full.addEventListener('click', async () => {
      try {
        if (document.fullscreenElement) await document.exitFullscreen();
        else {
          before = tutOpen();
          setTutOpen(false, { noSave: true });
          await document.documentElement.requestFullscreen();
        }
      } catch (e) {
        toast('This browser did not allow full screen here. Press F11 (or ⌃⌘F on a Mac) instead.', 'warn');
        if (before != null) setTutOpen(before, { noSave: true });
        before = null;
      }
    });
    document.addEventListener('fullscreenchange', () => {
      label();
      if (!document.fullscreenElement && before != null) {
        setTutOpen(before, { noSave: true });
        before = null;
      }
      resized();
    });
    label();
  }

  function initSplitter() {
    const sp = $('.splitter');
    const saved = store.get('tutWidth', null);
    if (saved) document.documentElement.style.setProperty('--tut-w', saved);
    if (!sp) return;
    let drag = false;
    sp.addEventListener('pointerdown', (e) => {
      drag = true;
      sp.classList.add('drag');
      sp.setPointerCapture(e.pointerId);
      document.body.classList.add('dragging');
    });
    sp.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const w = MG.clamp((e.clientX / window.innerWidth) * 100, 18, 65);
      document.documentElement.style.setProperty('--tut-w', w.toFixed(1) + '%');
    });
    const end = () => {
      if (!drag) return;
      drag = false;
      sp.classList.remove('drag');
      document.body.classList.remove('dragging');
      store.set('tutWidth', getComputedStyle(document.documentElement).getPropertyValue('--tut-w').trim());
      resized();
    };
    sp.addEventListener('pointerup', end);
    sp.addEventListener('pointercancel', end);
    sp.addEventListener('dblclick', () => {
      document.documentElement.style.removeProperty('--tut-w');
      store.remove('tutWidth');
      resized();
    });
    sp.tabIndex = 0;
    sp.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      const cur = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--tut-w')) || 38;
      const w = MG.clamp(cur + (e.key === 'ArrowRight' ? 2 : -2), 18, 65);
      document.documentElement.style.setProperty('--tut-w', w + '%');
      store.set('tutWidth', w + '%');
      resized();
    });
  }

  /* ------------------------------------------------------------------
     "My files": download everything, add files, start afresh
     ------------------------------------------------------------------ */
  function initFilesMenu() {
    const btn = $('#projectBtn');
    if (!btn) return;
    const HOME = () => MG.app.HOME;
    btn.addEventListener('click', async () => {
      const u = await MG.project.usage();
      const used = u && u.usage ? `${MG.humanSize(u.usage)}B used of about ${MG.humanSize(u.quota)}B` : '';
      MG.popmenu(btn, [
        ['zip', 'Download all my files (.zip)', () => MG.project.download(HOME(), 'r-training-files.zip')],
        ['upload', 'Add files from my computer…', () => MG.app.pickFiles(HOME(), false)],
        ['folder', 'Add a folder from my computer…', () => MG.app.pickFiles(HOME(), true)],
        ['folder', 'Show my files', () => MG.app.showWorkbench('editor')],
        ['info', 'Where are my files kept?' + (used ? ' (' + used + ')' : ''), () => filesInfo()],
        ['trash', 'Start afresh: delete all my files…', () => startAfresh()]
      ]);
    });
  }
  function filesInfo() {
    MG.modal(
      'Where your files are kept',
      `<p>Your files (scripts, R Markdown documents, notebooks, data and anything that R writes) are kept <b>in this browser, on this computer</b>, in the storage that the browser sets aside for this site. They will still be there the next time you open the workbench in the same browser on the same computer.</p>
       <ul><li>They are not available on another computer or in another browser. To take them with you, use <b>My files → Download all my files</b> here, and then <b>Add files</b> in the other browser.</li>
       <li>A private window, or a computer that clears the browser when you log out, will forget them, so download your work before you leave.</li>
       <li>Nothing is sent to a server. The packages that you install with <code>install.packages()</code> are kept too, because the browser keeps the files it downloaded.</li></ul>`
    );
  }
  /** a file picker that puts what is chosen into a folder */
  MG.app.pickFiles = (folder, dir) =>
    new Promise((resolve) => {
      const inp = h('input', { type: 'file', multiple: true, style: { display: 'none' } });
      if (dir) inp.webkitdirectory = true;
      document.body.appendChild(inp);
      inp.addEventListener('change', async () => {
        const files = Array.from(inp.files || []);
        inp.remove();
        if (!files.length) return resolve([]);
        const paths = await MG.project.addFiles(MG.app.fs, folder, files);
        if (paths.length) toast(`Added <b>${paths.length}</b> file${paths.length === 1 ? '' : 's'} to ${esc(MG.app.fs.pretty(folder))}.`, 'ok');
        resolve(paths);
      });
      inp.click();
    });

  function startAfresh() {
    const m = MG.modal(
      'Start afresh?',
      `<p>This deletes <b>every file</b> in your home folder (${esc(MG.app.fs.pretty(MG.app.HOME))}) from this browser, including scripts, documents, notebooks, data and results, and it also forgets the packages you have installed. It cannot be undone. (Your ticks and answers are not affected. To clear those, use <b>My answers → Start again</b>.)</p>
       <p>Download your files first if you want to keep any of them.</p>
       <p><label class="check"><input type="checkbox" data-x="sure"> I have downloaded what I want to keep</label></p>
       <div class="prompt-actions"><button class="btn" data-x="dl" type="button">${MG.icon('zip')}<span>Download all my files</span></button><span class="grow"></span><button class="btn" data-x="no" type="button">Cancel</button><button class="btn danger" data-x="yes" type="button" disabled>Delete everything</button></div>`
    );
    const yes = m.box.querySelector('[data-x="yes"]');
    m.box.querySelector('[data-x="sure"]').addEventListener('change', (e) => (yes.disabled = !e.target.checked));
    m.box.querySelector('[data-x="dl"]').addEventListener('click', () => MG.project.download(MG.app.HOME, 'r-training-files.zip'));
    m.box.querySelector('[data-x="no"]').addEventListener('click', () => m.close());
    yes.addEventListener('click', async () => {
      m.close();
      try {
        if (MG.page.beforeReset) await MG.page.beforeReset();
      } catch (e) {
        console.error(e);
      }
      await MG.project.reset(MG.app.fs);
      const keep = new Set(['tutOff', 'tutWidth', 'ai:settings', 'userName', 'progress', 'chapter']);
      try {
        const pfx = (MG.config.storePrefix || 'rwb') + ':' + document.body.dataset.page + ':';
        Object.keys(localStorage)
          .filter((k) => k.startsWith(pfx) && !keep.has(k.slice(pfx.length)))
          .forEach((k) => localStorage.removeItem(k));
      } catch (e) {
        /* ignore */
      }
      location.reload();
    });
  }

  /* ------------------------------------------------------------------
     The button with the person's name, at the top: R's USER and the terminal's prompt show it in place of
     "user". The name is kept in this browser only.
     ------------------------------------------------------------------ */
  function initUser() {
    const btn = $('#userBtn');
    if (!btn) return;
    const label = btn.querySelector('.user-name');
    /* the student's name (optional), as it appears on the answers they download (MG.cert.nameDialog asks for it) */
    const show = () => {
      const n = MG.user.fullName();
      if (label) label.textContent = n || 'Your name';
      btn.title = n ? `Your name, as it appears on the answers you download: ${n} (click to change it)` : 'Add your name, if you like, to show on the answers you download';
      btn.setAttribute('aria-label', n ? `Your name: ${n}. Click to change it.` : 'Add your name');
      btn.classList.toggle('unnamed', !n);
    };
    show();
    bus.on('user:name', show);
    btn.addEventListener('click', () => (MG.cert ? MG.cert.nameDialog() : nameDialog()));
  }
  function nameDialog() {
    const D = MG.user.DEFAULT, cur = MG.user.name();
    const host = (MG.app.term && MG.app.term.hostname) || MG.config.hostname || 'workbench';
    const m = MG.modal('Your name in the workbench', '');
    const input = h('input.prompt-input#userNameIn', { type: 'text', value: cur === D ? '' : cur, placeholder: D, maxlength: '40', spellcheck: 'false', autocomplete: 'off', autocapitalize: 'off', 'aria-describedby': 'userNameNote' });
    const preview = h('code.user-prompt');
    const note = h('p.user-note#userNameNote', { 'aria-live': 'polite' });
    const save = h('button.btn.primary', { type: 'submit' }, 'Save');
    const reset = h('button.btn', { type: 'button' }, `Use “${D}”`);
    const cancel = h('button.btn', { type: 'button' }, 'Cancel');
    const form = h(
      'form.user-form',
      h('p', 'The terminal shows your name in its prompt instead of ', h('code', D), ', and ', h('code', 'whoami'), ', ', h('code', '$USER'), ', ', h('code', 'ls -l'), ' and R’s ', h('code', 'Sys.getenv("USER")'), ' use it too. (An R session that is already running keeps the name it started with.) Your name is kept in this browser only, and your home folder stays ', h('code', MG.app.HOME || '/home/user'), '.'),
      h('label.user-label', { for: 'userNameIn' }, 'Your name'),
      input,
      h('p.user-prev', h('span.muted', 'The prompt: '), preview),
      note,
      h('div.prompt-actions', reset, h('span.grow'), cancel, save)
    );
    m.box.querySelector('.modal-b').appendChild(form);
    let chosen = cur;
    const update = () => {
      const v = input.value.trim();
      const n = v === '' ? D : v === 'root' ? '' : MG.user.valid(v) ? v : MG.user.suggest(v);
      note.classList.toggle('bad', !n);
      if (v === 'root') note.textContent = 'root is the name of the administrator here, so please choose another name.';
      else if (!n) note.textContent = 'A name must begin with a letter and can contain only letters, digits, dots, hyphens and underscores (no spaces), for example ada, ada.lovelace or a_lovelace.';
      else if (v && n !== v) note.textContent = `A name can’t contain spaces or other special characters, so it will be ${n}.`;
      else note.textContent = '';
      chosen = n;
      preview.textContent = `${n || '…'}@${host}:~$`;
      save.disabled = !n;
    };
    input.addEventListener('input', update);
    update();
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!chosen || !MG.user.set(chosen)) return;
      m.close();
      toast(chosen === D ? `The terminal shows <b>${D}</b> again.` : `Saved. The terminal now shows <b>${esc(chosen)}</b>@${esc(host)}.`, 'ok', 3500);
    });
    reset.addEventListener('click', () => {
      input.value = '';
      update();
      input.focus();
    });
    cancel.addEventListener('click', () => m.close());
    setTimeout(() => {
      input.focus();
      input.select();
    }, 30);
  }
  MG.app.nameDialog = nameDialog;
  MG.actions.username = () => nameDialog();

  /* the indicator in the top bar: are the files kept? */
  function initStoreStatus() {
    const el = $('#storeStatus');
    if (!el) return;
    const set = (state, text, title) => {
      el.dataset.state = state;
      el.innerHTML = `<i></i><span>${esc(text)}</span>`;
      if (title) el.title = title;
    };
    if (!MG.project.ok) {
      set('off', 'Not kept', 'This browser does not let the workbench keep your files (perhaps this is a private window). Download your work before you close the page.');
      return;
    }
    const OK_TITLE = 'Your files are kept in this browser on this computer. To take them elsewhere, use My files → Download all my files.';
    let warned = false;
    const saved = () => {
      const limit = Number(MG.config.storageWarnMB) || 0;
      let bytes = 0;
      if (limit && MG.app.fs) for (const [p, e] of MG.app.fs.entries) if (e.kind !== 'dir' && p.startsWith(MG.app.HOME + '/')) bytes += MG.app.fs.size(e) || 0;
      if (!limit || bytes <= limit * 1048576) return set('ok', 'Saved in this browser', OK_TITLE);
      const much = MG.humanSize(bytes) + 'B';
      set('busy', `Saved · ${much}`, `Your files take up ${much} in this browser. Download what you want to keep, and delete any large files you no longer need.`);
      if (!warned) {
        warned = true;
        toast(`Your files now take up <b>${much}</b> in this browser, which is more than ${limit} MB. Browsers limit how much a site can store, so download what you want to keep and delete any large files you no longer need.`, 'warn', 12000);
      }
    };
    saved();
    let t;
    bus.on('files:saving', () => set('busy', 'Saving…'));
    bus.on('files:saved', () => {
      clearTimeout(t);
      t = setTimeout(saved, 250);
    });
    bus.on('files:notsaved', () => set('off', 'Not saved', 'The browser has run out of space. Download your files, and then delete some of them.'));
  }

  /* the title and subtitle of config.js */
  function initBrand() {
    const C = MG.config || {};
    // (a course's page names the course itself, in its header and title)
    if (document.body.dataset.course) return;
    if (C.courseTitle) {
      const t = $('.brand-title'), a = $('.brand');
      if (t) t.textContent = C.courseTitle;
      if (a) a.title = C.courseTitle;
      document.body.dataset.title = C.courseTitle;
    }
    if (C.courseSubtitle != null) {
      const s = $('.brand-sub');
      if (s) s.textContent = C.courseSubtitle;
    }
    if (C.courseTitle || C.courseSubtitle) document.title = [C.courseTitle, C.courseSubtitle].filter(Boolean).join(' – ');
  }

  /* the page in two tabs or windows of one browser: both would write the same files */
  function initTabsWarning() {
    if (!window.BroadcastChannel) return;
    let ch;
    try {
      ch = new BroadcastChannel((MG.config.storePrefix || 'rwb') + '-tabs');
    } catch (e) {
      return;
    }
    const me = Math.random().toString(36).slice(2);
    const others = new Set();
    let bar = null, closed = false;
    const show = () => {
      if (others.size && !bar && !closed) {
        bar = h('div.tabs-warning', { role: 'alert', html: '<b>The R workbench is open in another tab or window of this browser.</b> Please work in only one of them. Both keep their files in the same place, so each can overwrite what the other has saved.' });
        const b = h('button.btn.small', { type: 'button' }, 'Close this note');
        b.addEventListener('click', () => {
          closed = true;
          bar.remove();
          bar = null;
        });
        bar.appendChild(b);
        document.body.appendChild(bar);
      } else if (!others.size && bar) {
        bar.remove();
        bar = null;
      }
    };
    ch.onmessage = (ev) => {
      const m = ev.data || {};
      if (!m.id || m.id === me) return;
      if (m.t === 'hello') {
        others.add(m.id);
        ch.postMessage({ t: 'here', id: me });
      } else if (m.t === 'here') others.add(m.id);
      else if (m.t === 'bye') others.delete(m.id);
      show();
    };
    ch.postMessage({ t: 'hello', id: me });
    window.addEventListener('pagehide', () => ch.postMessage({ t: 'bye', id: me }));
    window.addEventListener('pageshow', (ev) => ev.persisted && ch.postMessage({ t: 'hello', id: me }));
  }

  /* ------------------------------------------------------------------
     start
     ------------------------------------------------------------------ */
  async function init() {
    initBrand();
    initTabs();
    initSplitter();
    initTutPane();
    initFilesMenu();
    initUser();
    try {
      if (MG.page.init) await MG.page.init();
    } catch (e) {
      console.error(e);
      toast('The workbench did not start properly: ' + esc(e.message || String(e)), 'error', 15000);
    }
    initStoreStatus();
    initTabsWarning();
    try {
      if (MG.tutorial && MG.tutorial.init) MG.tutorial.init();
    } catch (e) {
      console.error(e);
    }
    try {
      if (MG.cert && MG.cert.initCoursePage) MG.cert.initCoursePage();
    } catch (e) {
      console.error(e);
    }
    // (a tab this page has: each course page has only the tabs it needs)
    const has = (t) => !!t && !!TAB_NAME[t] && (!MG.app.hasTab || MG.app.hasTab(t));
    const want = new URLSearchParams(location.search).get('tab');
    const first = [want, MG.app.currentBench, store.get('bench', null), MG.page.firstBench, 'rstudio', 'console'].find(has);
    if (!MG.app.currentBench || want) MG.app.showWorkbench(first, { noOpen: true });
    ready = true;
    document.body.classList.add('ready');
    window.MG_READY = true;
    bus.emit('app:ready', {});
  }
  MG.app.isReady = () => ready;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
