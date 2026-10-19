/* =====================================================================
   Progress through the practicals, and the student's name.

   A practical is finished when every step and question of it is done
   (those marked "if you have time" don't count). There is no certificate:
   the last chapter of each practical shows what is left to do, and a
   message says when the practical is finished. The landing page
   (index.html) shows how far the student has got with each practical,
   from what that practical's page saved in this browser.

   The student's name (optional) is kept in this browser for the whole
   site (MG.user.fullName). It is shown on the answers they download with
   My answers, and it is never sent anywhere.

   Used by the practicals' pages and by the landing page.
     MG.cert.status(id)          → { done, total, pct, complete, completedAt, started }
     MG.cert.nameDialog()        → a promise of the name ('' if none was given)
     MG.cert.panel(host)         fills in the last chapter's panel
   (It keeps the name MG.cert, which the workbench's code uses, although
   there are no certificates on this site.)
   ===================================================================== */
(function () {
  'use strict';
  const MG = window.MG;
  const { h, esc, toast, bus, siteStore } = MG;
  const COURSES = window.RT_COURSES || [];

  const course = (id) => COURSES.find((c) => c.id === id) || null;

  /* ------------------------------------------------------------------
     how far a student has got with a practical
     ------------------------------------------------------------------ */
  /** what the practical's page saved: its ticks and answers (the live state when it is this page) */
  function saved(c) {
    if (MG.tutorial && MG.tutorial.state && document.body.dataset.course === c.id) return MG.tutorial.state;
    return siteStore.get(c.dataPage + ':progress', null) || { tasks: {}, answers: {} };
  }
  function status(id) {
    const c = course(id);
    if (!c) return null;
    const st = saved(c);
    const tasks = st.tasks || {}, answers = st.answers || {};
    let done = 0;
    c.tasks.forEach((t) => tasks[t] && done++);
    c.questions.forEach((q) => answers[q] && answers[q].done && done++);
    const total = c.tasks.length + c.questions.length;
    const anyTouched = Object.keys(tasks).length > 0 || Object.keys(answers).length > 0;
    return {
      done,
      total,
      pct: total ? Math.round((done / total) * 100) : 0,
      // (once finished, a practical stays finished: unticking a step, or a step added later, doesn't change that;
      // only "Start again" does)
      complete: !!st.completedAt || (total > 0 && done === total),
      completedAt: st.completedAt || null,
      started: anyTouched
    };
  }

  /* ------------------------------------------------------------------
     the student's name (optional)
     ------------------------------------------------------------------ */
  /** asks for the student's name → a promise of the name kept ('' if there is none) */
  function nameDialog(opts = {}) {
    return new Promise((resolve) => {
      const cur = MG.user.fullName();
      let settled = false;
      const m = MG.modal(opts.title || 'Your name', '', {
        onClose: () => {
          if (!settled) {
            settled = true;
            resolve(MG.user.fullName());
          }
        }
      });
      const input = h('input.prompt-input#studentNameIn', { type: 'text', value: cur, placeholder: 'For example, Ada Lovelace', maxlength: String(MG.user.MAX + 10), spellcheck: 'false', autocomplete: 'name', 'aria-describedby': 'studentNameNote' });
      const note = h('p.user-note#studentNameNote', { 'aria-live': 'polite' });
      const save = h('button.btn.primary', { type: 'submit' }, 'Save');
      const cancel = h('button.btn', { type: 'button' }, 'Cancel');
      const form = h(
        'form.user-form',
        h('p', opts.why || 'If you like, type your name. It is shown on the answers you download with My answers, so that your tutor knows whose they are. You don’t have to give it.'),
        h('label.user-label', { for: 'studentNameIn' }, 'Your name'),
        input,
        note,
        h('p.hint', 'Your name is kept in this web browser only. It isn’t sent anywhere: if you ask the AI assistant a question, your name is replaced by “user” in what is sent.'),
        h('div.prompt-actions', h('span.grow'), cancel, save)
      );
      m.box.querySelector('.modal-b').appendChild(form);
      let chosen = cur;
      const update = () => {
        const n = MG.user.cleanName(input.value);
        note.classList.toggle('bad', n == null);
        if (n == null) note.textContent = `That is too long: a name can have at most ${MG.user.MAX} characters.`;
        else note.textContent = '';
        chosen = n;
        save.disabled = n == null;
      };
      input.addEventListener('input', update);
      update();
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        if (chosen == null) return;
        const kept = MG.user.setFullName(chosen);
        if (kept == null) return;
        settled = true;
        m.close();
        if (kept) toast(`Saved. Your downloaded answers will show the name <b>${esc(kept)}</b>.`, 'ok', 3500);
        resolve(kept);
      });
      cancel.addEventListener('click', () => m.close());
      setTimeout(() => {
        input.focus();
        input.select();
      }, 30);
    });
  }

  const longDate = (d) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

  /* ------------------------------------------------------------------
     on a practical's page: the last chapter's panel, and the message when the practical is finished
     ------------------------------------------------------------------ */
  /** what is still to do, chapter by chapter: [{ id, num, title, tasks, questions }] */
  function leftToDo() {
    const st = (MG.tutorial && MG.tutorial.state) || { tasks: {}, answers: {} };
    const out = [];
    document.querySelectorAll('.chapter').forEach((ch) => {
      const req = (el) => !el.closest('.optional');
      const tasks = Array.from(ch.querySelectorAll('[data-task]')).filter(req).filter((li) => !st.tasks[li.dataset.task]).length;
      const questions = Array.from(ch.querySelectorAll('.q[data-q]')).filter(req).filter((q) => !(st.answers[q.dataset.q] || {}).done).length;
      if (tasks || questions) out.push({ id: ch.id, num: ch.dataset.num || '', title: ch.dataset.title || ch.id, tasks, questions });
    });
    return out;
  }
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

  /** the next practical after this one (or null) */
  function nextCourse(id) {
    const i = COURSES.findIndex((c) => c.id === id);
    return i >= 0 && i + 1 < COURSES.length ? COURSES[i + 1] : null;
  }

  /** the last chapter's panel: how far the student has got, and what is left */
  function panel(host) {
    const id = document.body.dataset.course;
    const c = course(id);
    if (!host || !c) return;
    const st = status(id);
    host.innerHTML = '';
    if (!st.complete) {
      const left = leftToDo();
      host.appendChild(
        h(
          'div.cert-locked',
          h('div.cert-lock-h', { html: MG.icon('list') + `<span>You have done <b>${st.done}</b> of the <b>${st.total}</b> steps and questions of ${esc(c.title)}.</span>` }),
          h('div.cert-bar', h('i', { style: { width: st.pct + '%' } })),
          left.length
            ? h(
                'ul.cert-left',
                left.map((x) =>
                  h(
                    'li',
                    h('button.linkbtn', { type: 'button', onclick: () => MG.app.showChapter(x.id, true) }, `${x.num ? x.num + '. ' : ''}${x.title}`),
                    h('span.muted', ' – ' + [x.tasks ? plural(x.tasks, 'step', 'steps') : '', x.questions ? plural(x.questions, 'question', 'questions') : ''].filter(Boolean).join(' and ') + ' to do')
                  )
                )
              )
            : null,
          h('p.hint', 'Steps and questions marked “If you have time” don’t count. A question with a Check button, or a choice of answers, counts once you have answered it correctly; any other question counts once you have written an answer.')
        )
      );
      return;
    }
    const nx = nextCourse(id);
    host.appendChild(h('p.cert-done', { html: `Well done: you finished <b>${esc(c.title)}</b> on ${esc(longDate(st.completedAt || Date.now()))}.` }));
    host.appendChild(
      h(
        'div.cert-actions',
        h('button.btn', { type: 'button', html: MG.icon('download') + '<span>Download my answers</span>', onclick: () => MG.tutorial && MG.tutorial.exportAnswers && MG.tutorial.exportAnswers() }),
        nx ? h('a.btn.primary', { href: nx.page }, `Go on to ${nx.title}`) : h('a.btn.primary', { href: 'index.html' }, 'Back to all the practicals')
      )
    );
  }

  /** when the practical is finished for the first time: a message */
  function celebrate() {
    const id = document.body.dataset.course;
    const c = course(id);
    if (!c) return;
    const nx = nextCourse(id);
    const m = MG.modal(
      'Practical complete',
      `<div class="cert-cele"><p>Well done! You have finished every step and question of <b>${esc(c.title)}</b>.</p>
       <p>Before you go, download your answers (and, if your tutor asks for it, your rendered report from the Files tab).</p>
       <div class="prompt-actions"><button class="btn" type="button" data-x="dl">${MG.icon('download')}<span>Download my answers</span></button><span class="grow"></span><a class="btn primary" href="${esc(nx ? nx.page : 'index.html')}">${esc(nx ? 'Go on to ' + nx.title : 'Back to all the practicals')}</a></div></div>`
    );
    m.box.querySelector('[data-x="dl"]').addEventListener('click', () => {
      m.close();
      if (MG.tutorial && MG.tutorial.exportAnswers) MG.tutorial.exportAnswers();
    });
  }

  /** the practical's page: keep the last chapter's panel up to date */
  function initCoursePage() {
    const host = document.querySelector('[data-cert-panel]');
    const again = MG.debounce(() => {
      const ch = host && host.closest('.chapter');
      if (ch && !ch.hidden) panel(host);
    }, 250);
    if (host) {
      bus.on('app:chapter', ({ id }) => {
        const ch = host.closest('.chapter');
        if (ch && ch.id === id) panel(host);
      });
      bus.on('progress:changed', again);
      if (!host.closest('.chapter').hidden) panel(host);
    }
    bus.on('course:complete', () => {
      again();
      celebrate();
    });
  }

  MG.cert = { course, courses: () => COURSES.slice(), status, nameDialog, longDate, panel, celebrate, initCoursePage, leftToDo, nextCourse };
  MG.progressOf = status;
})();
