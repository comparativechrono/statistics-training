"""The AI tab on a practical's page (week 4), against a stand-in for the AI service (Playwright routes) with a fake
key: the suggested questions are the practical's, the offline help speaks of this page, the key is only kept in
memory, what is sent describes the practical, its data and its single R session (and no tabs it doesn't have), the
student's name never leaves the browser, and code in an answer goes to RStudio (there is no R console, notebook or
terminal tab to send it to). No AI service is asked.
Run:  python3 test/t06_assistant.py"""
import json
import sys
import time
from student import Student, check

FAKE = 'TEST-not-a-real-key'
ANSWER = """`z` is the result of dividing `x` by `y`. To round it to two decimal places:

```r
round(z, 2)
```
"""
requests = []


def sse(text):
    parts = [text[i:i + 40] for i in range(0, len(text), 40)]
    return ''.join('data: ' + json.dumps({'candidates': [{'content': {'parts': [{'text': t}], 'role': 'model'}}]}) + '\r\n\r\n' for t in parts)


def service(route):
    try:
        body = json.loads(route.request.post_data or '{}')
    except Exception:
        body = {}
    requests.append((route.request.url, body))
    if 'generativelanguage.googleapis.com' not in route.request.url:
        return route.fulfill(status=500, body='{}', headers={'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'})
    last = ((body.get('contents') or [{}])[-1].get('parts') or [{}])[0].get('text', '')
    text = 'ready' if 'Reply with the single word' in last else ANSWER
    route.fulfill(status=200, body=sse(text), headers={'Content-Type': 'text/event-stream', 'Access-Control-Allow-Origin': '*'})


from h import Page  # noqa: E402
page = Page(width=1500, height=950)
for pat in ['https://generativelanguage.googleapis.com/**', 'https://api.anthropic.com/**', 'https://api.openai.com/**']:
    page.ctx.route(pat, service)
s = Student('week4.html', p=page)
p = s.p
p.js('() => MG.user.setFullName("Ada Lovelace")')

# ---- no key
p.js('() => MG.app.showWorkbench("assistant")')
p.wait('() => MG.app.ai')
tabs = p.js('() => Array.from(document.querySelectorAll(".wb-tab[data-wb]")).map((b) => b.dataset.wb)')
check(tabs == ['rstudio', 'editor', 'assistant'], f'the course page has the RStudio, Files and AI tabs ({tabs})')
card = p.js('() => document.querySelector(".ai-thread[data-tab=chat] .ai-setup").innerText')
check('personal or patient data' in card, 'the setup card says never to paste personal or patient data')
starters = p.js('() => Array.from(MG.app.ai.sugg.querySelectorAll(".chip")).map((b) => b.textContent)')
check(any('regression' in x for x in starters) and not any('penguin' in x.lower() for x in starters), f'the suggested questions are the practical’s ({starters[:2]})')
check(p.js('() => !document.querySelector(".ai-tabs [data-tab=agent], .ai-tab[data-tab=agent]")'), 'there is no agent (it needs the Terminal tab)')
p.js('''() => { const a = MG.app.ai; a.input.value = "Error: object 'z' not found"; a.send(); }''')
p.wait('() => document.querySelector(".ai-thread[data-tab=chat] .ai-msg.offline")', timeout=5000)
off = p.js('() => document.querySelector(".ai-msg.offline").innerText')
check('R does not know the name z' in off, 'the offline help explains “object not found”')
check('R console tab' not in off and 'notebook' not in off.lower(), 'and doesn’t speak of tabs this page doesn’t have: ' + off[:160].replace('\n', ' '))

# ---- a key, in memory only
p.js('() => MG.app.ai.root.querySelector(".ai-bar [aria-label=\'AI settings\']").click()')
p.wait('() => document.querySelector(".ai-set [data-k=key]")')
p.p.fill('.ai-set [data-k="key"]', FAKE)
p.p.click('.ai-set [data-x="save"]')
p.wait('() => MG.app.ai.connected()')
stored = p.js('''(k) => { const all = []; for (const st of [localStorage, sessionStorage]) for (let i = 0; i < st.length; i++) { const n = st.key(i); all.push(n + '=' + st.getItem(n)); } return all.some((x) => x.includes(k)); }''', FAKE)
check(not stored, 'the key is not in localStorage or sessionStorage')

# ---- some R, then a question
s.run('x <- 39\ny <- 22\nz <- x / y\nmy.name <- "Ada Lovelace"\nz')
p.js('() => MG.app.showWorkbench("assistant")')
time.sleep(0.3)
n = p.js('() => MG.app.ai.msgs.chat.length')
p.js('() => { const a = MG.app.ai; a.input.value = "I am Ada Lovelace. How do I round z?"; a.send(); }')
p.wait(f'() => !MG.app.ai.busy && MG.app.ai.msgs.chat.length > {n}', timeout=30000)
time.sleep(0.3)
url, body = requests[-1]
system = (body.get('system_instruction') or {}).get('parts', [{}])[0].get('text', '')
msgs = '\n'.join(pt.get('text', '') for cc in body.get('contents') or [] for pt in cc.get('parts') or [])
everything = json.dumps(body, ensure_ascii=False)
check('week 4 of Biostatistics for Genomic Medicine' in system and 'tidyverse' in system, 'the system prompt describes the practical and its style')
check('famuss.csv' in system and 'virco.csv' in system, 'and the data in ~/data')
check('RStudio' in system and 'Notebook: Jupyter' not in system and '- R console:' not in system, 'it describes the tabs the page has, and not the others')
check('z (numeric' in msgs or 'z (' in msgs, 'the question carries the objects in RStudio')
check('Ada Lovelace' not in everything and 'Lovelace' not in everything, 'the student’s name is not in anything sent')
check('my.name <- "user"' in msgs or 'How do I round z' in msgs, 'it is replaced by “user”')
check(FAKE not in url or 'key=' in url, 'the request went to the (stand-in) Gemini service')
acts = p.js('''() => { const b = document.querySelectorAll('.ai-thread[data-tab=chat] .ai-msg.assistant'); const last = b[b.length - 1];
  return Array.from(last.querySelectorAll('.ai-codebox .ai-code-acts .btn')).map((y) => y.textContent || y.getAttribute('aria-label')); }''')
check(acts and acts[0] == 'Put into RStudio' and 'Run in the R console' not in acts and 'Add to notebook' not in acts, f'R code in an answer goes to RStudio ({acts})')
p.js('''() => { for (const x of document.querySelectorAll('.ai-code-acts .btn')) if (x.textContent === 'Put into RStudio') { x.click(); return; } }''')
p.wait('() => MG.app.currentBench === "rstudio" && MG.app.rstudio.cur && MG.app.rstudio.cur.cmDoc.getValue().includes("round(z, 2)")', timeout=15000)
check(True, 'Put into RStudio puts the code into a script in RStudio')
errs = [e for e in p.errors if "'serviceWorker' property" not in e]
check(not errs, f'no errors in the page ({errs[:3]})')
s.close()
print('failed:', check.failed)
sys.exit(1 if check.failed else 0)
