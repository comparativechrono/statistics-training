"""Helpers that write the HTML of the instructions of the practicals (used by the modules week2.py … week5.py)."""
import html


def esc(s):
    return html.escape(str(s), quote=True)


def c(s):
    """inline code"""
    return f'<code>{esc(s)}</code>'


def show(cmd, label='show me'):
    """a button that types a command into the terminal (the student presses Enter)"""
    return f'<button class="do showme" type="button" data-term="{esc(cmd)}">{label}</button>'


def cmd(line, label='show me'):
    """a command, with a button that types it"""
    return f'{c(line)} {show(line, label)}'


def edit(path, label=None):
    return f'<button class="do showme" type="button" data-edit="{esc(path)}">{label or "open " + esc(path.split("/")[-1])}</button>'


def bench(name, label):
    return f'<button class="do showme" type="button" data-bench="{esc(name)}">{label}</button>'


def goto(target, label):
    return f'<button class="do showme" type="button" data-goto="{esc(target)}">{label}</button>'


def prompt(text, tab='chat', mode=None, title=None, button=None):
    """a prompt for the AI, shown in full; the button puts it into the AI's box (the student sends it)"""
    t = title or ('A prompt for the assistant' if tab == 'chat' else 'A task for the agent')
    m = f' data-mode="{esc(mode)}"' if mode else ''
    b = button or ('Put it in the chat box' if tab == 'chat' else 'Put it in the agent’s box')
    return (f'<div class="prompt-card"><div class="pc-head"><span class="pc-t">{t}</span><span class="grow"></span>'
            f'<button class="do ask" type="button" data-prompt="{esc(text)}" data-tab="{esc(tab)}"{m}>{b}</button></div>'
            f'<div class="pc-text">{esc(text)}</div></div>')


def codefile(path, text, create=True, note=None, button='Create this file'):
    """a file shown in the instructions, with Create and Copy buttons"""
    b = f'<button class="do" type="button" data-file-create="{esc(path)}">{button}</button>' if create else ''
    n = f'<div class="cf-note">{note}</div>' if note else ''
    return (f'<div class="codefile" data-path="{esc(path)}"><div class="cf-head"><span class="cf-name">{esc(path)}</span>'
            f'<span class="grow"></span>{b}<button class="btn small" type="button" data-copy-code="1">Copy</button></div>'
            f'<pre class="codeblock">{esc(text.rstrip())}</pre>{n}</div>')


def task(tid, body, auto=None, check=None):
    a = f' data-auto="{esc(auto)}"' if auto else ''
    k = f' data-check="{esc(check)}"' if check else ''
    return f'<li data-task="{esc(tid)}"{a}{k}>{body}</li>'


def activity(title, tasks, extra=''):
    return f'<div class="activity">\n  <div class="act-t">{title}</div>\n  <ol class="steps">\n    ' + '\n    '.join(tasks) + f'\n  </ol>{extra}\n</div>'


def q(qid, text, model, accept=None, hint=None, placeholder=None):
    a = f' data-accept="{esc(accept)}"' if accept else ''
    h = f' data-hint="{esc(hint)}"' if hint else ''
    p = f' data-placeholder="{esc(placeholder)}"' if placeholder else ''
    return f'<div class="q" data-q="{esc(qid)}"{a}{h}{p}>\n  <div class="q-text">{text}</div>\n  <div class="q-model">{model}</div>\n</div>'


def mcq(qid, text, options, model=None):
    """options: list of (html, correct, why), written with the right answer first; the page shows them in an order of
    their own, the same every time (a shuffle seeded with the question's id), so that the right answer isn't always first"""
    import random
    options = list(options)
    random.Random('mcq:' + qid).shuffle(options)
    labs = ''.join(f'<label{" data-correct" if ok else ""} data-why="{esc(why)}"><input type="radio"> {opt}</label>' for opt, ok, why in options)
    m = f'\n  <div class="q-model">{model}</div>' if model else ''
    return f'<div class="q" data-q="{esc(qid)}" data-type="mcq">\n  <div class="q-text">{text}</div>\n  <div class="mcq">{labs}</div>{m}\n</div>'


def callout(kind, title, body):
    return f'<div class="callout {kind}">\n  <div class="co-t">{title}</div>\n  {body}\n</div>'


def chapter(cid, num, title, bench_name, h1, minutes, lede, body):
    t = f'  <div class="meta-row"><span class="pill time">≈ {minutes} min</span></div>\n' if minutes else ''
    return (f'<section class="chapter" id="{cid}" data-num="{num}" data-title="{esc(title)}" data-bench="{bench_name}" hidden>\n'
            f'  <h1>{h1}</h1>\n{t}  <p class="lede">{lede}</p>\n{body}\n</section>\n')


def rcon(code, label='show me'):
    """a button that types R code into the R console (the student presses Enter)"""
    return f'<button class="do showme" type="button" data-rcon="{esc(code)}">{label}</button>'


def rcode(code, label='show me'):
    """R code, with a button that types it into the R console"""
    return f'{c(code)} {rcon(code, label)}'


def rsopen(path, label=None):
    """a button that opens a file in RStudio"""
    return f'<button class="do showme" type="button" data-rs-open="{esc(path)}">{label or "open " + esc(path.split("/")[-1]) + " in RStudio"}</button>'


def rsrun(code, label='run it in RStudio'):
    return f'<button class="do" type="button" data-rs-run="{esc(code)}">{label}</button>'


def nbopen(path, label=None):
    return f'<button class="do showme" type="button" data-nb-open="{esc(path)}">{label or "open " + esc(path.split("/")[-1])}</button>'


# ---------------------------------------------------------------------------------------------------------------------
# for the courses (R basics, Tidyverse): code typed into RStudio's Console, checks made by R, "if you have time",
# console output, tables and small diagrams
def rstype(code, label='show me'):
    """a button that types R code into RStudio's Console (the student presses Enter)"""
    return f'<button class="do showme" type="button" data-rs-type="{esc(code)}">{label}</button>'


def rscode(code, label='show me'):
    """R code, with a button that types it into RStudio's Console"""
    return f'{c(code)} {rstype(code, label)}'


def block(code, show=True, label='show me'):
    """R code of several lines, in a box, with a button that types it into RStudio's Console and a Copy button"""
    b = f'<button class="do showme" type="button" data-rs-type="{esc(code.strip())}">{label}</button>' if show else ''
    return (f'<div class="codefile rblock"><div class="cf-head"><span class="cf-name">R</span><span class="grow"></span>{b}'
            f'<button class="btn small" type="button" data-copy-code="1">Copy</button></div><pre class="codeblock">{esc(code.strip())}</pre></div>')


def out(text, title=None):
    """what R prints (shown in the instructions)"""
    t = f'<div class="rout-t">{title}</div>' if title else ''
    return f'<div class="rout">{t}<pre>{esc(text.strip(chr(10)))}</pre></div>'


def rtask(tid, body, rcheck, auto=None):
    """a step that R checks: rcheck is an R expression, evaluated quietly in RStudio's R session after each command;
    the step ticks when it is TRUE"""
    a = f' data-auto="{esc(auto)}"' if auto else ''
    return f'<li data-task="{esc(tid)}" data-rcheck="{esc(rcheck)}"{a}>{body}</li>'


def optional(title, body):
    """a part for those who have time: its steps and questions don't count towards finishing the practical"""
    return (f'<div class="optional">\n  <div class="opt-t"><span class="opt-tag">If you have time</span> {title}</div>\n'
            f'  <p class="opt-note">This part is optional: it doesn’t count towards finishing the practical.</p>\n{body}\n</div>')


def homework(title, body):
    """the week's homework: like an optional part, its steps and questions don't count towards finishing the practical
    in the session, but they build the student's report"""
    return (f'<div class="optional homework">\n  <div class="opt-t"><span class="opt-tag hw">Homework</span> {title}</div>\n'
            f'  <p class="opt-note">Do this after the session, before next week. It doesn’t count towards finishing the practical, but it '
            f'builds your report.</p>\n{body}\n</div>')


def table(head, rows, cls='plain'):
    th = ''.join(f'<th>{x}</th>' for x in head)
    tr = ''.join('<tr>' + ''.join(f'<td>{x}</td>' for x in r) + '</tr>' for r in rows)
    return f'<div class="table"><table class="{cls}"><thead><tr>{th}</tr></thead><tbody>{tr}</tbody></table></div>'


def vecop(a, b, op='+', caption=None, warn=None, labels=('Vector 1', 'Vector 2', 'Result')):
    """a diagram of a vectorised operation, as R does it: the values in the same position are matched, and a shorter
    vector is recycled (its repeated values are drawn paler); warn: the warning R gives when it doesn't fit"""
    import operator
    f = {'+': operator.add, '-': operator.sub, '*': operator.mul, '/': operator.truediv}[op]
    n = max(len(a), len(b))
    A = [a[i % len(a)] for i in range(n)]
    B = [b[i % len(b)] for i in range(n)]
    R = [f(x, y) for x, y in zip(A, B)]
    fmt = lambda v: str(int(v)) if float(v).is_integer() else f'{v:g}'

    def row(label, vals, real, cls):
        cs = ''.join(f'<span class="vc{" " + cls if cls else ""}{" rec" if i >= real else ""}">{fmt(v)}</span>' for i, v in enumerate(vals))
        return f'<div class="vrow"><span class="vlab">{label}</span><span class="vcells">{cs}</span></div>'
    rows = [row(labels[0], A, len(a), ''), f'<div class="vrow"><span class="vlab"></span><span class="vopsym">{esc(op)}</span></div>',
            row(labels[1], B, len(b), ''), '<div class="vrow vline"><span class="vlab"></span><span class="vrule"></span></div>',
            row(labels[2], R, n, 'res')]
    w = f'<div class="vwarn">{warn}</div>' if warn else ''
    cap = f'<figcaption>{caption}</figcaption>' if caption else ''
    alt = esc(f'{labels[0]} {" ".join(fmt(x) for x in a)} {op} {labels[1]} {" ".join(fmt(x) for x in b)} gives {" ".join(fmt(x) for x in R)}')
    return f'<figure class="vecop" role="img" aria-label="{alt}">{"".join(rows)}{w}{cap}</figure>'


def kbd(*keys):
    """keys pressed together: kbd('Ctrl', 'Enter')"""
    return '+'.join(f'<kbd>{esc(k)}</kbd>' for k in keys)


# the commands shown with what R prints for them (console()), in the order they appear: the tests run them in R and
# compare what R prints
EXAMPLES = []

# what R printed for the commands of rc(), recorded by build/harvest.py in build/golden/NAME.json (a list of
# {"code", "output"} in the order the commands appear). use_golden(NAME) loads them for a module.
import json as _json
import os as _os
GOLDEN = {'name': None, 'items': [], 'used': {}}
GOLDEN_DIR = _os.path.join(_os.path.dirname(_os.path.abspath(__file__)), 'golden')


def use_golden(name):
    """use the outputs recorded for module name (each module calls this at the start of its ALL())"""
    path = _os.path.join(GOLDEN_DIR, name + '.json')
    items = _json.load(open(path, encoding='utf-8')) if _os.path.exists(path) else []
    GOLDEN.update(name=name, items=items, used={})


def _golden(code):
    """what R printed for code: the next recording of that code (the same code can appear more than once)"""
    code = code.strip('\n')
    k = GOLDEN['used'].get(code, 0)
    hits = [it for it in GOLDEN['items'] if it['code'] == code]
    GOLDEN['used'][code] = k + 1
    if k < len(hits):
        return hits[k]['output']
    return None


MISSING = []


def console(*pairs, title=None, check=True):
    """a piece of RStudio's Console, as it looks after some commands: each command after R's prompt (>, and + on the
    lines that continue it), followed by what R prints. pairs: (code, output)"""
    lines = []
    for code, output in pairs:
        cl = code.strip('\n').split('\n')
        lines.append('> ' + cl[0])
        lines.extend('+ ' + x for x in cl[1:])
        # (an output can start with a blank line, as R's t.test() does, but not end with one)
        output = output.rstrip('\n')
        if output:
            lines.append(output)
        if check:
            EXAMPLES.append({'code': code.strip('\n'), 'output': output})
    return out('\n'.join(lines), title)


def rc(*codes, title=None):
    """a piece of RStudio's Console, with what R prints for each command taken from the module's recordings (see
    use_golden and build/harvest.py)"""
    pairs = []
    for code in codes:
        o = _golden(code)
        if o is None:
            MISSING.append(code)
            o = '(not recorded yet: run python3 build/harvest.py)'
        pairs.append((code, o))
    return console(*pairs, title=title)


# ---- checks made by R (for rtask): R expressions, TRUE when the step has been done ----
def rq(s):
    """an R string"""
    return '"' + str(s).replace('\\', '\\\\').replace('"', '\\"') + '"'


def lastv(cond):
    """the value of the last command the student ran (which R keeps in .Last.value), called v in cond"""
    return f'(function(v) {{ {cond} }})(.Last.value)'


def tib(n, cols=(), test=None):
    """the last command gave a table (a data frame or tibble) with n rows, and these columns"""
    c = ['is.data.frame(v)', f'nrow(v) == {n}']
    if cols:
        c.append(f'all(c({", ".join(rq(x) for x in cols)}) %in% names(v))')
    if test:
        c.append(test)
    return lastv(' && '.join(c))


def has_table(n, cols):
    """there is a table (a data frame or tibble) with n rows and these columns in R's memory, whatever its name"""
    cs = ', '.join(rq(x) for x in cols)
    return (f'any(vapply(ls(globalenv()), function(nm) {{ o <- get(nm, envir = globalenv()); '
            f'is.data.frame(o) && nrow(o) == {n} && all(c({cs}) %in% names(o)) }}, logical(1)))')


def gg(geom, stat=None, maps=None, fixed=None, labels=(), builds=True, extra=None):
    """the last command drew a ggplot that has a layer of this geometry (a ggproto class such as "GeomPoint"), and in
    that layer: the statistic stat, the aesthetics in maps mapped to these columns (in ggplot() or in the layer), and
    the fixed aesthetics in fixed (an R condition on the value p, e.g. 'identical(p, "blue2")'); labels: the titles it
    has (title, x, y); builds: R can draw it (a column that doesn't exist only fails when the plot is drawn)"""
    lay = [f'inherits(l$geom, {rq(geom)})']
    if stat:
        lay.append(f'inherits(l$stat, {rq(stat)})')
    for a, col in (maps or {}).items():
        lay.append(f'any(vapply(list(v$mapping, l$mapping), function(m) !is.null(m${a}) && identical(rlang::as_label(m${a}), {rq(col)}), logical(1)))')
    for a, cond in (fixed or {}).items():
        lay.append(f'(function(p) !is.null(p) && isTRUE({cond}))(l$aes_params${a})')
    parts = ['inherits(v, "ggplot")', 'any(vapply(v$layers, function(l) ' + ' && '.join(lay) + ', logical(1)))']
    for k in labels:
        parts.append(f'is.character(v$labels${k}) && nzchar(v$labels${k})')
    if extra:
        parts.append(extra)
    if builds:
        parts.append('!inherits(try(ggplot2::ggplot_build(v), silent = TRUE), "try-error")')
    return lastv(' && '.join(parts))


def finish_chapter(cid, num, title, h1, lede, body):
    """the last chapter of a practical: what was covered, the homework, and a panel (filled in by progress.js) that
    shows how far the student has got and what is left to do"""
    panel = ('<h2 id="' + cid + '-progress">Your progress</h2>\n'
             '<p>This panel shows how much of this week’s practical you have done, and lists anything that is left. When everything is '
             'done (apart from the parts marked <b>If you have time</b> and the homework), the practical is complete.</p>\n'
             '<div class="cert-panel" data-cert-panel></div>\n')
    return (f'<section class="chapter finish-chapter" id="{cid}" data-num="{num}" data-title="{esc(title)}" data-bench="rstudio" hidden>\n'
            f'  <h1>{h1}</h1>\n  <p class="lede">{lede}</p>\n{body}\n{panel}</section>\n')


# ---------------------------------------------------------------------------------------------------------------------
# for the statistics practicals: formulas, figures, and more ready-made R checks
def formula(body, note=None):
    """a formula, set on a line of its own (HTML: <i>, <sub>, <sup> and Unicode symbols)"""
    n = f'<div class="formula-note">{note}</div>' if note else ''
    return f'<div class="formula" role="math">{body}{n}</div>'


def figure(svg, caption=None, label=None):
    """a diagram (inline SVG, from figs.py) with a caption"""
    cap = f'<figcaption>{caption}</figcaption>' if caption else ''
    lab = f' aria-label="{esc(label)}"' if label else ''
    return f'<figure class="fig" role="img"{lab}>{svg}{cap}</figure>'


def near(x, tol, n=1):
    """an R check on the value v of the last command: a number (or n numbers) within tol of x"""
    xs = x if isinstance(x, (list, tuple)) else [x]
    return (f'is.numeric(v) && length(v) == {len(xs)} && isTRUE(all(abs(as.numeric(v) - c({", ".join(repr(float(a)) for a in xs)})) < {tol}))')


def htest(method, extra=None):
    """an R check: the last command gave the result of a test (an "htest") whose method matches the regular expression method"""
    c = f'inherits(v, "htest") && grepl({rq(method)}, v$method)'
    return lastv(c + (f' && {extra}' if extra else ''))


def has_vec(n, cond='TRUE'):
    """an R check: there is a numeric vector of length n in R's memory, whatever its name, for which cond (about o) is TRUE"""
    return (f'any(vapply(ls(globalenv()), function(nm) {{ o <- get(nm, envir = globalenv()); '
            f'is.numeric(o) && is.null(dim(o)) && length(o) == {n} && isTRUE({cond}) }}, logical(1)))')


def has_obj(cond):
    """an R check: there is an object in R's memory, whatever its name, for which cond (about o) is TRUE"""
    return (f'any(vapply(ls(globalenv()), function(nm) {{ o <- get(nm, envir = globalenv()); '
            f'isTRUE(tryCatch({{ {cond} }}, error = function(e) FALSE)) }}, logical(1)))')


# the R code that is run, without being shown with its output, before the examples that follow it need it (the tests,
# and build/harvest.py, run it in order with the examples)
def setup(code):
    """code that the examples after it rely on, run by the tests but not shown here (the text shows it some other way)"""
    EXAMPLES.append({'code': code.strip('\n'), 'output': None, 'silent': True})
    return ''
