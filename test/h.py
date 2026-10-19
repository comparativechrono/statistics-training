"""Test harness: serves the site to a headless Chromium (Playwright) at https://rtr.test/, as GitHub Pages would
with the service worker's headers in place (cross-origin isolated – SharedArrayBuffer), and helpers to drive it.

    from h import Page
    p = Page()                     # isolated; Page(isolated=False) for a page without SharedArrayBuffer
    p.open('r-basics.html')        # waits for the page to be ready (index.html is the landing page)
    p.js('() => 1 + 1')
    p.close()

The pages download R (webR) from webr.r-wasm.org and packages from repo.r-wasm.org: the computer needs the
internet (through HTTPS_PROXY where there is one)."""
import os, sys, time, json, mimetypes
from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.dirname(HERE)
OUT = os.path.join(HERE, 'out')
mimetypes.add_type('text/javascript', '.mjs')
mimetypes.add_type('application/wasm', '.wasm')
mimetypes.add_type('text/javascript', '.js')


def _serve(isolated, extra=None):
    def serve(route):
        url = route.request.url
        path = url.split('://', 1)[1].split('/', 1)[1].split('?')[0].split('#')[0] or 'index.html'
        iso = {'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp',
               'Cross-Origin-Resource-Policy': 'same-origin'} if isolated else {}
        if extra and path in extra:
            body, ctype = extra[path]
            return route.fulfill(status=200, body=body, headers=dict({'Content-Type': ctype}, **iso))
        f = os.path.join(SITE, path)
        if os.path.isdir(f):
            f = os.path.join(f, 'index.html')
        if not os.path.isfile(f):
            return route.fulfill(status=404, body='not found')
        h = {'Content-Type': mimetypes.guess_type(f)[0] or 'application/octet-stream', 'Cache-Control': 'no-cache'}
        h.update(iso)
        route.fulfill(status=200, body=open(f, 'rb').read(), headers=h)
    return serve


class Server:
    """the site served by serve.py on localhost (a real web server: a service worker can be installed from it, which
    Playwright's routing cannot do) – with Page(base=server.base, service_workers='allow')"""
    def __init__(self):
        import socket, subprocess
        s = socket.socket()
        s.bind(('127.0.0.1', 0))
        self.port = s.getsockname()[1]
        s.close()
        self.proc = subprocess.Popen([sys.executable, os.path.join(SITE, 'serve.py'), str(self.port)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        self.base = f'http://localhost:{self.port}/'
        import urllib.request
        for _ in range(50):
            try:
                urllib.request.urlopen(self.base + 'index.html', timeout=2).read(10)
                break
            except Exception:
                time.sleep(0.1)

    def stop(self):
        self.proc.terminate()
        self.proc.wait(timeout=10)


class Page:
    def __init__(self, isolated=True, width=1500, height=950, extra=None, service_workers='block', base=None):
        self.pw = sync_playwright().start()
        proxy = os.environ.get('HTTPS_PROXY') or os.environ.get('https_proxy')
        # (the site on localhost – Server – is not asked for through the proxy: Chromium's own --proxy-server leaves
        # localhost out, where Playwright's proxy option would send it to the proxy too)
        args = ['--disable-dev-shm-usage']
        if proxy and base:
            args.append('--proxy-server=' + proxy)
        self.browser = self.pw.chromium.launch(headless=True, proxy={'server': proxy} if proxy and not base else None, args=args)
        self.ctx = self.browser.new_context(viewport={'width': width, 'height': height}, service_workers=service_workers,
                                            accept_downloads=True)
        self.base = base or 'https://rtr.test/'
        if not base:
            self.ctx.route('https://rtr.test/**', _serve(isolated, extra))
        self.p = self.ctx.new_page()
        self.logs = []
        self.errors = []
        self.p.on('console', lambda m: self.logs.append(f'[{m.type}] {m.text}'))
        self.p.on('pageerror', lambda e: self.errors.append(str(e)))

    def open(self, page='index.html', wait='window.MG_READY === true', timeout=60000):
        self.p.goto(self.base + page)
        if wait:
            self.p.wait_for_function(wait, timeout=timeout)
        return self

    def js(self, code, arg=None):
        return self.p.evaluate(code, arg)

    def wait(self, code, timeout=60000, arg=None):
        return self.p.wait_for_function(code, arg=arg, timeout=timeout)

    def shot(self, name, full=False):
        os.makedirs(OUT, exist_ok=True)
        path = os.path.join(OUT, name if name.endswith('.png') else name + '.png')
        self.p.screenshot(path=path, full_page=full)
        return path

    def close(self):
        try:
            self.browser.close()
        finally:
            self.pw.stop()


def check(cond, what):
    print(('PASS ' if cond else 'FAIL ') + what)
    if not cond:
        check.failed += 1
    return cond


check.failed = 0


def done():
    print(f'\n{"ALL PASSED" if not check.failed else str(check.failed) + " FAILED"}')
    sys.exit(1 if check.failed else 0)
