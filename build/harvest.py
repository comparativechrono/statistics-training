"""Record what R prints for the commands that the practicals show with rc() (and check those shown with console()), by
running them, in order, in R on this computer: R 4.6 with the same versions of the packages as the webR repository
(see the README). The outputs are written to build/golden/NAME.json, which the modules read (lib.use_golden), so that
the instructions show exactly what R prints. test/t01_examples.py then checks every one of them in the browser, in
webR's R.

Run:  python3 build/harvest.py week2 [week3 …]     (needs R, with the tidyverse, on the PATH)"""
import importlib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.dirname(HERE)
sys.path.insert(0, HERE)
import lib  # noqa: E402

MARK = '#@@EX '


def transcript(script, home):
    """run the script in R, as R CMD BATCH would, and give what R printed (with the commands echoed)"""
    env = dict(os.environ, HOME=home, LANG='C.UTF-8', LC_ALL='C.UTF-8', R_LIBS_USER=os.environ.get('R_LIBS_USER', ''))
    env.pop('R_HISTFILE', None)
    # (R's messages and warnings go to its standard error: merged with its output, in the order R writes them)
    p = subprocess.run(['R', '--vanilla', '--quiet'], input=script, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
                       env=env, cwd=home)
    return p.stdout


def harvest(name):
    mod = importlib.import_module(name)
    lib.EXAMPLES.clear()
    lib.MISSING.clear()
    mod.ALL()
    examples = list(lib.EXAMPLES)
    home = tempfile.mkdtemp(prefix='harvest-')
    shutil.copytree(os.path.join(SITE, 'data'), os.path.join(home, 'data'),
                    ignore=shutil.ignore_patterns('PROVENANCE.md'))
    # (messages and warnings into R's standard output, so that they keep their place among the rest of the output)
    lines = ['options(width = 80, pillar.advice = TRUE)', 'sink(stdout(), type = "message")']
    lines += [getattr(mod, 'PRELUDE', '').strip()]
    for i, ex in enumerate(examples):
        lines.append(MARK + str(i))
        lines.append(ex['code'])
    lines.append(MARK + 'END')
    out = transcript('\n'.join(lines) + '\n', home)
    tl = out.split('\n')
    # where each example starts in what R printed
    pos = {}
    for k, line in enumerate(tl):
        m = re.match(r'^> ' + re.escape(MARK) + r'(\d+|END)\s*$', line)
        if m:
            pos[m.group(1)] = k
    golden, bad = [], 0
    for i, ex in enumerate(examples):
        a, b = pos.get(str(i)), pos.get(str(i + 1), pos.get('END'))
        if a is None or b is None:
            print(f'{name}: example {i} was not found in what R printed:\n{ex["code"]}')
            bad += 1
            continue
        seg = tl[a + 1:b]
        n = len(ex['code'].split('\n'))
        echoed, rest = seg[:n], seg[n:]
        if not all(re.match(r'^[>+] ?', x) or x == '' for x in echoed):
            print(f'{name}: example {i}: the commands were not echoed as expected:\n' + '\n'.join(echoed))
        while rest and not rest[-1].strip():
            rest.pop()
        output = '\n'.join(x.rstrip() for x in rest)
        is_err = re.search(r'(^|\n)Error( in |: )', output) is not None
        if ex.get('silent'):
            if is_err:
                print(f'--- {name}: the setup code gave an error:\n{ex["code"]}\n{output}\n---')
                bad += 1
            continue
        if is_err:
            print(f'--- {name}: R gave an error for\n{ex["code"]}\n{output}\n---')
        if ex['output'] and not ex['output'].startswith('(not recorded') and ex['output'].rstrip() != output:
            print(f'--- {name}: the text shows a different output for\n{ex["code"]}\n--- shown:\n{ex["output"]}\n--- R:\n{output}\n---')
            bad += 1
        golden.append({'code': ex['code'], 'output': output})
    os.makedirs(lib.GOLDEN_DIR, exist_ok=True)
    path = os.path.join(lib.GOLDEN_DIR, name + '.json')
    json.dump(golden, open(path, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(f'{name}: recorded {len(golden)} outputs in {os.path.relpath(path, SITE)}' + (f'; {bad} problems' if bad else ''))
    shutil.rmtree(home, ignore_errors=True)
    return bad


if __name__ == '__main__':
    names = sys.argv[1:] or ['week2', 'week3', 'week4', 'week5']
    sys.exit(1 if sum(harvest(n) for n in names) else 0)
