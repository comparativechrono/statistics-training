"""Write the site's pages: a page for each practical (build/template.html, with the practical's chapters from its
module and the tabs it uses) and the landing page, index.html (build/landing.html), which lists the practicals.

Each page also gets the list of the files that a new user finds in ~/data (everything in ../data, except its
PROVENANCE.md), and the list of the practicals with the steps and questions that count towards finishing them
(those in "If you have time" parts and in the homework don't). The examples of R's output come from build/golden/
(see build/harvest.py); the build stops if one of them hasn't been recorded.
Run:  python3 build/make_pages.py"""
import html
import importlib
import json
import os
import re
import sys
from html.parser import HTMLParser

HERE = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.dirname(HERE)
sys.path.insert(0, HERE)
from courses import COURSES, PROGRAMME, TABS  # noqa: E402
import lib  # noqa: E402

# the starter files: data/ of the site → ~/data/ of the user (data/small_file.txt → ~/data/small_file.txt)
STARTERS_VERSION = 2  # 2: copy the data again, for those who lost it (October 2026)
starters = []
for root, dirs, files in os.walk(os.path.join(SITE, 'data')):
    dirs.sort()
    for f in sorted(files):
        rel = os.path.relpath(os.path.join(root, f), os.path.join(SITE, 'data')).replace(os.sep, '/')
        if rel in ('PROVENANCE.md',):
            continue
        starters.append({'p': rel, 's': os.path.getsize(os.path.join(root, f))})
STARTERS = ('<script>window.RWB_STARTERS = ' + json.dumps(starters, separators=(',', ':')) +
            f';\nwindow.RWB_STARTERS_VERSION = {STARTERS_VERSION};</script>')


class Ids(HTMLParser):
    """the steps (data-task) and questions (data-q) of the chapters, and whether each is in an optional part"""
    VOID = {'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr'}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stack = []
        self.tasks, self.questions = [], []

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        optional = 'optional' in (a.get('class') or '').split() or (self.stack and self.stack[-1][1])
        if 'data-task' in a:
            self.tasks.append((a['data-task'], bool(optional)))
        if 'data-q' in a:
            self.questions.append((a['data-q'], bool(optional)))
        if tag not in self.VOID:
            self.stack.append((tag, bool(optional)))

    def handle_endtag(self, tag):
        # (pop back to the element that ends)
        for i in range(len(self.stack) - 1, -1, -1):
            if self.stack[i][0] == tag:
                del self.stack[i:]
                break


def svg(paths):
    return (f'<svg class="ic" viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" '
            f'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">{paths}</svg>')


def tabs_html(names):
    btns, panes = [], []
    for i, n in enumerate(names):
        title, label, icon, root = TABS[n]
        on = ' on' if i == 0 else ''
        btns.append(f'        <button class="wb-tab{on}" type="button" role="tab" data-wb="{n}" title="{html.escape(title)}">{svg(icon)}'
                    f'<span class="lbl">{label}</span><span class="dot"></span></button>')
        panes.append(f'        <div class="wb-pane" data-wb="{n}"{"" if i == 0 else " hidden"}><div id="{root}"></div></div>')
    return '\n'.join(btns), '\n'.join(panes)


bad = False
registry = []
pages = {}
for c in COURSES:
    mod = importlib.import_module(c['module'])
    lib.MISSING.clear()
    chapters = '\n'.join(mod.ALL()).replace(' hidden>', '>', 1)  # (the first chapter is visible when the page loads)
    if lib.MISSING:
        print(f'{c["page"]}: {len(lib.MISSING)} examples have no recorded output (run python3 build/harvest.py {c["module"]}): {lib.MISSING[:3]}')
        bad = True
    p = Ids()
    p.feed(chapters)
    tasks = [t for t, opt in p.tasks if not opt]
    questions = [q for q, opt in p.questions if not opt]
    # every task, question and heading needs a name of its own
    for what, ids in (('step', [t for t, _ in p.tasks]), ('question', [q for q, _ in p.questions]), ('heading', re.findall(r'<h2 id="([^"]+)"', chapters))):
        dup = sorted({x for x in ids if ids.count(x) > 1})
        if dup:
            print(f'{c["page"]}: {what}s used twice: {dup}')
            bad = True
    print(f'{c["page"]}: {len(p.tasks)} steps and {len(p.questions)} questions; {len(tasks)} steps and {len(questions)} questions count towards finishing it')
    registry.append({'id': c['id'], 'page': c['page'], 'dataPage': c['data_page'], 'title': c['title'], 'short': c['short'],
                     'week': c['week'], 'time': c['time'], 'tasks': tasks, 'questions': questions})
    pages[c['id']] = chapters

COURSES_JS = '<script>window.RT_COURSES = ' + json.dumps(registry, ensure_ascii=False, separators=(',', ':')) + ';</script>'

shell = open(os.path.join(HERE, 'template.html'), encoding='utf-8').read()
for c in COURSES:
    page = shell
    a = page.index('<!--CHAPTERS-->') + len('<!--CHAPTERS-->')
    b = page.index('<!--/CHAPTERS-->')
    page = page[:a] + '\n' + pages[c['id']] + page[b:]
    t, pn = tabs_html(c['tabs'])
    cfg = '<script>window.RT_PAGE = ' + json.dumps(c['ai'], ensure_ascii=False, separators=(',', ':')) + ';</script>'
    for k, v in {
        '{{PAGE_TITLE}}': html.escape(f'{c["title"]} – {PROGRAMME}'),
        '{{DESCRIPTION}}': html.escape(c['description']),
        '{{DATA_PAGE}}': c['data_page'],
        '{{TITLE}}': html.escape(c['title']),
        '{{SUBTITLE}}': html.escape(c['subtitle']),
        '{{PROGRAMME}}': html.escape(PROGRAMME),
        '{{COURSE}}': c['id'],
        '{{FIRST}}': c['first'],
        '{{TABS}}': t,
        '{{PANES}}': pn,
        '{{COURSES}}': COURSES_JS + '\n' + cfg,
        '<!--STARTERS-->': STARTERS,
    }.items():
        page = page.replace(k, v)
    left = re.findall(r'\{\{[A-Z_]+\}\}', page)
    if left:
        print(c['page'], 'has placeholders left:', left)
        bad = True
    open(os.path.join(SITE, c['page']), 'w', encoding='utf-8').write(page)
    print(f'wrote {c["page"]} ({len(page) // 1024} KB)')

# the landing page
land = open(os.path.join(HERE, 'landing.html'), encoding='utf-8').read()
cards = []
for c, r in zip(COURSES, registry):
    topics = ''.join(f'<li>{html.escape(x)}</li>' for x in c['topics'])
    cards.append(f'''<article class="course" data-course="{c['id']}">
  <div class="course-part">Week {c['week']}</div>
  <h2><a href="{c['page']}">{html.escape(c['short'])}</a></h2>
  <p class="course-lede">{html.escape(c['card'])}</p>
  <ul class="course-topics">{topics}</ul>
  <p class="course-meta"><span>{html.escape(c['time'])}</span><span>{len(r['tasks'])} steps and {len(r['questions'])} questions</span></p>
  <div class="course-progress" aria-live="polite"><div class="cp-bar"><i></i></div><span class="cp-text">Not started yet</span></div>
  <div class="course-actions">
    <a class="btn primary course-go" href="{c['page']}">Start the practical</a>
  </div>
</article>''')
land = land.replace('{{COURSE_CARDS}}', '\n'.join(cards)).replace('{{COURSES}}', COURSES_JS).replace('{{PROGRAMME}}', html.escape(PROGRAMME))
left = re.findall(r'\{\{[A-Z_]+\}\}', land)
if left:
    print('index.html has placeholders left:', left)
    bad = True
open(os.path.join(SITE, 'index.html'), 'w', encoding='utf-8').write(land)
print(f'wrote index.html; {len(starters)} starter files')
sys.exit(1 if bad else 0)
