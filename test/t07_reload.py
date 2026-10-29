"""The data in ~/data are kept in the browser like the student's own files: they are still there when the page is
opened again. (Until 29 October 2026 the copies of the data were made before the page began to keep its files, so
they were never kept: after a reload the data folder had gone, while the student's scripts, workspace and name were
still there – and the page didn't copy the data again.) A student who lost the data then gets it back the next time
the page opens, and nothing of theirs is overwritten: neither a starter file they edited, nor a file of their own.
Run:  python3 test/t07_reload.py"""
import time
from h import Page, check, done

PAGE = 'week2.html'
DATA = '/home/user/data'
KEYS = '''([db, d]) => new Promise((res) => { const rq = indexedDB.open(db); rq.onerror = () => res(null);
  rq.onsuccess = () => { const g = rq.result.transaction('files', 'readonly').objectStore('files').getAllKeys();
    g.onsuccess = () => res(g.result.filter((k) => k.startsWith(d + '/')).map((k) => k.slice(d.length + 1))); }; })'''
FORGET = '''([db, paths]) => new Promise((res) => { const rq = indexedDB.open(db); rq.onerror = () => res(false);
  rq.onsuccess = () => { const t = rq.result.transaction('files', 'readwrite'); const st = t.objectStore('files');
    for (const p of paths) st.delete(p); t.oncomplete = () => res(true); t.onerror = () => res(false); }; })'''

p = Page()
p.open(PAGE)
prefix, page = p.js('() => [MG.config.storePrefix, document.body.dataset.page]')
db, flag = prefix + '-files', f'{prefix}:{page}:seeded'
starters = sorted(p.js('() => (window.RWB_STARTERS || []).map((s) => s.p)'))
version = p.js('() => Number(window.RWB_STARTERS_VERSION || 1)')
# (the smallest text file of the data: a student edits it)
small = p.js('() => (window.RWB_STARTERS || []).filter((s) => /\\.(csv|txt|tsv)$/.test(s.p)).sort((a, b) => a.s - b.s)[0].p')
in_page = lambda: sorted(p.js('(d) => Array.from(MG.app.fs.entries.keys()).filter((k) => k.startsWith(d + "/") && MG.app.fs.entries.get(k).kind !== "dir").map((k) => k.slice(d.length + 1))', DATA))
kept = lambda: sorted(p.js(KEYS, [db, DATA]) or [])


def settle(cond, seconds=20):
    t0 = time.time()
    while time.time() - t0 < seconds:
        if cond():
            return True
        time.sleep(0.5)
    return False


# ---- the first visit: the data are copied, and kept
check(set(starters) <= set(in_page()), f'the first visit: ~/data has the {len(starters)} files of the data')
check(settle(lambda: set(starters) <= set(kept())), f'they are kept in the browser ({kept()})')
check(settle(lambda: p.js('(k) => localStorage.getItem(k)', flag) == str(version)), f'the copying counts as done once they are kept ({flag} = {version})')
# a student's own work: a script, a file of their own in data/, and a change to one of the data's files
p.js('() => MG.app.fs.writeText(MG.app.HOME + "/analysis.R", "x <- 1\\n")')
p.js('(d) => MG.app.fs.writeText(d + "/mine.csv", "a,b\\n1,2\\n")', DATA)
p.js('async ([d, f]) => { MG.app.fs.writeText(d + "/" + f, (await MG.app.fs.readText(d + "/" + f)) + "edited by the student\\n"); }', [DATA, small])
edited = lambda: p.js('async ([d, f]) => (await MG.app.fs.readText(d + "/" + f)).endsWith("edited by the student\\n")', [DATA, small])
check(settle(lambda: 'mine.csv' in kept()), 'the student’s own work is kept')

# ---- opened again: everything is there
p.open(PAGE)
check(set(starters) <= set(in_page()), 'after a reload: ~/data still has all the files of the data')
check('mine.csv' in in_page() and p.js('() => MG.app.fs.exists(MG.app.HOME + "/analysis.R")'), 'and the student’s own files')
check(edited(), 'and their change to ' + small)

# ---- a student who lost the data before the fix: the files they didn't change are gone, and the copying counted as done
lost = [DATA + '/' + f for f in starters if f != small]
check(p.js(FORGET, [db, lost]), 'the data the student never changed are forgotten, as they were with the old pages')
p.js('(k) => localStorage.setItem(k, "1")', flag)
p.open(PAGE)
check(set(starters) <= set(in_page()), 'the next visit: the lost files of the data are back')
check(settle(lambda: set(starters) <= set(kept())), 'and kept in the browser this time')
check(edited(), 'the student’s change to ' + small + ' is not overwritten')
check('mine.csv' in in_page(), 'and their own file is still there')
check(settle(lambda: p.js('(k) => localStorage.getItem(k)', flag) == str(version)), 'the copying counts as done again')
p.open(PAGE)
check(set(starters) <= set(in_page()) and 'mine.csv' in in_page(), 'and after one more reload, everything is still there')
errs = [e for e in p.errors if "'serviceWorker' property" not in e]
check(not errs, f'no errors in the page ({errs[:3]})')
p.close()
done()
