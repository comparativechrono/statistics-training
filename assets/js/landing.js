/* =====================================================================
   The landing page (index.html): the practicals, how far the student has
   got with each (what each practical's page saved in this browser), and
   their name (optional), which is shown on the answers they download.
   ===================================================================== */
(function () {
  'use strict';
  const MG = window.MG;
  const { bus } = MG;
  const SITE = (MG.config && MG.config.site) || {};
  const $ = (s, r) => (r || document).querySelector(s);

  function showName() {
    const n = MG.user.fullName();
    const t = $('[data-student-name-text]'), b = $('[data-name-btn]');
    if (t) {
      t.textContent = n || 'no name yet';
      t.classList.toggle('none', !n);
    }
    if (b) b.textContent = n ? 'Change' : 'Add your name';
  }

  function showCourse(card) {
    const id = card.dataset.course;
    const c = MG.cert.course(id);
    const st = MG.cert.status(id);
    if (!c || !st) return;
    card.classList.toggle('done', st.complete);
    card.classList.toggle('started', st.started && !st.complete);
    $('.cp-bar > i', card).style.width = st.pct + '%';
    $('.cp-text', card).textContent = st.complete
      ? `Finished on ${MG.cert.longDate(st.completedAt || Date.now())}`
      : st.started
        ? `${st.done} of ${st.total} steps and questions done (${st.pct}%)`
        : 'Not started yet';
    $('.course-go', card).textContent = st.complete ? 'Go back to the practical' : st.started ? 'Carry on with the practical' : 'Start the practical';
  }

  function refresh() {
    showName();
    document.querySelectorAll('.course[data-course]').forEach(showCourse);
  }

  function init() {
    const dept = $('[data-awarded-by]');
    if (dept) dept.textContent = [SITE.department, SITE.institution].filter(Boolean).join(', ');
    const b = $('[data-name-btn]');
    if (b) b.addEventListener('click', () => MG.cert.nameDialog());
    bus.on('user:name', refresh);
    // (a practical in another tab of this browser saved its progress, or a name)
    window.addEventListener('storage', refresh);
    window.addEventListener('pageshow', refresh);
    refresh();
    window.MG_READY = true;
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
