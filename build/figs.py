"""Diagrams for the text of the practicals, drawn as inline SVG (they are part of the page, so they need no files and
stay sharp at any size). Each function returns the SVG; lib.figure() puts it in the page with a caption.

The diagrams are of ideas rather than of the course's data (the students draw those themselves), so they are made
here from formulas and from fixed pseudo-random numbers."""
import math
import random

BLUE, LIGHT, RED, AMBER, GREY, INK, GREEN = '#0b6b8a', '#cfe7ef', '#c8414f', '#d9961c', '#8a96a8', '#39465a', '#2e8b57'


def _f(x):
    return f'{x:.1f}'.rstrip('0').rstrip('.')


class Plot:
    """a small plotting area: data coordinates (x0..x1, y0..y1) mapped into a box of an SVG"""

    def __init__(self, x0, x1, y0, y1, box=(50, 20, 520, 190)):
        self.x0, self.x1, self.y0, self.y1 = x0, x1, y0, y1
        self.L, self.T, self.R, self.B = box
        self.parts = []

    def X(self, x):
        return self.L + (x - self.x0) / (self.x1 - self.x0) * (self.R - self.L)

    def Y(self, y):
        return self.B - (y - self.y0) / (self.y1 - self.y0) * (self.B - self.T)

    def add(self, s):
        self.parts.append(s)
        return self

    def axes(self, xticks=(), yticks=(), xlabel=None, ylabel=None, xfmt=str, yfmt=str, yaxis=True):
        a = [f'<line x1="{_f(self.L)}" y1="{_f(self.B)}" x2="{_f(self.R)}" y2="{_f(self.B)}" stroke="{GREY}"/>']
        if yaxis:
            a.append(f'<line x1="{_f(self.L)}" y1="{_f(self.T)}" x2="{_f(self.L)}" y2="{_f(self.B)}" stroke="{GREY}"/>')
        for t in xticks:
            v, lab = (t if isinstance(t, tuple) else (t, xfmt(t)))
            a.append(f'<line x1="{_f(self.X(v))}" y1="{_f(self.B)}" x2="{_f(self.X(v))}" y2="{_f(self.B + 4)}" stroke="{GREY}"/>'
                     f'<text x="{_f(self.X(v))}" y="{_f(self.B + 17)}" font-size="12" text-anchor="middle">{lab}</text>')
        for t in yticks:
            v, lab = (t if isinstance(t, tuple) else (t, yfmt(t)))
            a.append(f'<line x1="{_f(self.L - 4)}" y1="{_f(self.Y(v))}" x2="{_f(self.L)}" y2="{_f(self.Y(v))}" stroke="{GREY}"/>'
                     f'<text x="{_f(self.L - 7)}" y="{_f(self.Y(v) + 4)}" font-size="12" text-anchor="end">{lab}</text>')
        if xlabel:
            a.append(f'<text x="{_f((self.L + self.R) / 2)}" y="{_f(self.B + 34)}" font-size="12.5" text-anchor="middle">{xlabel}</text>')
        if ylabel:
            cy = (self.T + self.B) / 2
            a.append(f'<text x="{_f(self.L - 38)}" y="{_f(cy)}" font-size="12.5" text-anchor="middle" transform="rotate(-90 {_f(self.L - 38)} {_f(cy)})">{ylabel}</text>')
        return self.add(''.join(a))

    def line(self, pts, color=BLUE, width=2, dash=None, opacity=1):
        d = ' '.join(('M' if i == 0 else 'L') + f'{_f(self.X(x))} {_f(self.Y(y))}' for i, (x, y) in enumerate(pts))
        ds = f' stroke-dasharray="{dash}"' if dash else ''
        return self.add(f'<path d="{d}" fill="none" stroke="{color}" stroke-width="{width}"{ds} opacity="{opacity}"/>')

    def area(self, pts, color=LIGHT, opacity=1):
        """the area between the curve pts and y = y0"""
        if not pts:
            return self
        d = f'M{_f(self.X(pts[0][0]))} {_f(self.Y(self.y0))} ' + ' '.join(f'L{_f(self.X(x))} {_f(self.Y(y))}' for x, y in pts)
        d += f' L{_f(self.X(pts[-1][0]))} {_f(self.Y(self.y0))} Z'
        return self.add(f'<path d="{d}" fill="{color}" opacity="{opacity}" stroke="none"/>')

    def bar(self, x, w, y, color=BLUE, opacity=1):
        x0, x1 = self.X(x - w / 2), self.X(x + w / 2)
        return self.add(f'<rect x="{_f(x0)}" y="{_f(self.Y(y))}" width="{_f(x1 - x0)}" height="{_f(self.Y(self.y0) - self.Y(y))}" fill="{color}" opacity="{opacity}"/>')

    def vline(self, x, color=RED, width=2, dash=None, y0=None, y1=None):
        ds = f' stroke-dasharray="{dash}"' if dash else ''
        ya, yb = self.Y(self.y0 if y0 is None else y0), self.Y(self.y1 if y1 is None else y1)
        return self.add(f'<line x1="{_f(self.X(x))}" y1="{_f(ya)}" x2="{_f(self.X(x))}" y2="{_f(yb)}" stroke="{color}" stroke-width="{width}"{ds}/>')

    def hline(self, y, color=GREY, width=1.5, dash=None, x0=None, x1=None):
        ds = f' stroke-dasharray="{dash}"' if dash else ''
        xa, xb = self.X(self.x0 if x0 is None else x0), self.X(self.x1 if x1 is None else x1)
        return self.add(f'<line x1="{_f(xa)}" y1="{_f(self.Y(y))}" x2="{_f(xb)}" y2="{_f(self.Y(y))}" stroke="{color}" stroke-width="{width}"{ds}/>')

    def dot(self, x, y, r=3.2, color=BLUE, opacity=0.85, stroke=None):
        st = f' stroke="{stroke}" stroke-width="1"' if stroke else ''
        return self.add(f'<circle cx="{_f(self.X(x))}" cy="{_f(self.Y(y))}" r="{r}" fill="{color}" opacity="{opacity}"{st}/>')

    def text(self, x, y, s, size=12, anchor='middle', color=INK, weight=None, dy=0):
        w = f' font-weight="{weight}"' if weight else ''
        return self.add(f'<text x="{_f(self.X(x))}" y="{_f(self.Y(y) + dy)}" font-size="{size}" text-anchor="{anchor}" fill="{color}"{w}>{s}</text>')

    def svg(self, w=560, h=230, extra=''):
        return f'<svg viewBox="0 0 {w} {h}" xmlns="http://www.w3.org/2000/svg" focusable="false">{extra}{"".join(self.parts)}</svg>'


def npdf(x, m=0.0, s=1.0):
    return math.exp(-0.5 * ((x - m) / s) ** 2) / (s * math.sqrt(2 * math.pi))


def grid(a, b, n=200):
    return [a + (b - a) * i / n for i in range(n + 1)]


# ---------------------------------------------------------------------------------------------------------------------
# week 2
def normal_areas():
    """the normal curve, with the 68% and 95% areas"""
    p = Plot(-3.6, 3.6, 0, 0.5, box=(30, 12, 530, 196))
    xs = grid(-3.6, 3.6)
    p.area([(x, npdf(x)) for x in xs if -1.96 <= x <= 1.96], LIGHT)
    p.area([(x, npdf(x)) for x in xs if -1 <= x <= 1], '#9fd0df')
    p.area([(x, npdf(x)) for x in xs if x >= 1.96], '#f1b9bf')
    p.area([(x, npdf(x)) for x in xs if x <= -1.96], '#f1b9bf')
    p.line([(x, npdf(x)) for x in xs])
    # a bracket over the middle 95%
    for x in (-1.96, 1.96):
        p.vline(x, GREY, 1.2, '3 3', y0=npdf(x), y1=0.455)
    p.add(f'<line x1="{_f(p.X(-1.96))}" y1="{_f(p.Y(0.455))}" x2="{_f(p.X(1.96))}" y2="{_f(p.Y(0.455))}" stroke="{GREY}" stroke-width="1.2"/>')
    p.text(0, 0.455, '95% of values: within 1.96 σ of the mean', 12, weight='600', color=BLUE, dy=-5)
    p.text(0, 0.16, 'about 68%', 12.5, weight='600')
    p.text(0, 0.16, 'within 1 σ', 11.5, dy=15)
    p.text(2.75, 0.055, '2.5%', 12, color=RED, weight='600')
    p.text(-2.75, 0.055, '2.5%', 12, color=RED, weight='600')
    p.axes(xticks=[(-3, 'μ − 3σ'), (-1.96, 'μ − 1.96σ'), (-1, 'μ − σ'), (0, 'μ'), (1, 'μ + σ'), (1.96, 'μ + 1.96σ'), (3, 'μ + 3σ')], yaxis=False)
    return p.svg(560, 222)


def skew_mean_median():
    """a right-skewed distribution: the mean is pulled into the long tail, the median isn't"""
    # a gamma-shaped curve
    k, th = 2.2, 18.0
    f = lambda x: (x ** (k - 1) * math.exp(-x / th)) / (math.gamma(k) * th ** k) if x > 0 else 0
    p = Plot(0, 200, 0, 0.0155, box=(30, 16, 530, 186))
    xs = grid(0.01, 200)
    p.area([(x, f(x)) for x in xs], LIGHT)
    p.line([(x, f(x)) for x in xs])
    median, mean = 33.9, k * th
    p.vline(median, BLUE, 2, y1=f(median))
    p.vline(mean, RED, 2, '5 4', y1=f(mean) + 0.002)
    p.text(median - 3, f(median) + 0.0012, 'median', 12, 'end', BLUE, '600')
    p.text(mean + 3, f(mean) + 0.0025, 'mean', 12, 'start', RED, '600')
    p.text(150, 0.004, 'a long tail of large values', 12, color=GREY)
    p.add(f'<path d="M{_f(p.X(118))} {_f(p.Y(0.0035))} L{_f(p.X(100))} {_f(p.Y(0.0028))}" stroke="{GREY}"/>')
    p.axes(xticks=[0, 50, 100, 150, 200], xlabel='NDRM.CH (% change in strength)', yaxis=False)
    return p.svg(560, 230)


def boxplot_anatomy():
    """what the parts of a box plot mean"""
    p = Plot(0, 10, 0, 100, box=(40, 14, 520, 248))
    q1, med, q3, lo, hi = 36, 48, 62, 12, 86
    w, cx = 1.6, 2.6
    p.add(f'<rect x="{_f(p.X(cx - w / 2))}" y="{_f(p.Y(q3))}" width="{_f(p.X(cx + w / 2) - p.X(cx - w / 2))}" height="{_f(p.Y(q1) - p.Y(q3))}" fill="{LIGHT}" stroke="{BLUE}" stroke-width="1.6"/>')
    p.add(f'<line x1="{_f(p.X(cx - w / 2))}" y1="{_f(p.Y(med))}" x2="{_f(p.X(cx + w / 2))}" y2="{_f(p.Y(med))}" stroke="{BLUE}" stroke-width="3"/>')
    for a, b in ((q3, hi), (q1, lo)):
        p.add(f'<line x1="{_f(p.X(cx))}" y1="{_f(p.Y(a))}" x2="{_f(p.X(cx))}" y2="{_f(p.Y(b))}" stroke="{BLUE}" stroke-width="1.6"/>')
        p.add(f'<line x1="{_f(p.X(cx - 0.4))}" y1="{_f(p.Y(b))}" x2="{_f(p.X(cx + 0.4))}" y2="{_f(p.Y(b))}" stroke="{BLUE}" stroke-width="1.6"/>')
    for y in (95, 99):
        p.dot(cx, y, 3.4, RED)
    labels = [(97, 'outliers: more than 1.5 × IQR beyond the box'), (hi, 'whisker: the largest value within 1.5 × IQR of the box'),
              (q3, 'upper quartile (Q3): 75% of values are below it'), (med, 'median: half the values are below it'),
              (q1, 'lower quartile (Q1): 25% of values are below it'), (lo, 'whisker: the smallest value within 1.5 × IQR')]
    for y, s_ in labels:
        p.add(f'<line x1="{_f(p.X(cx + w / 2 + 0.25))}" y1="{_f(p.Y(y))}" x2="{_f(p.X(4.3))}" y2="{_f(p.Y(y))}" stroke="{GREY}" stroke-dasharray="2 3"/>')
        p.text(4.45, y, s_, 12, 'start', dy=4)
    p.add(f'<path d="M{_f(p.X(1.2))} {_f(p.Y(q1))} L{_f(p.X(1.0))} {_f(p.Y(q1))} L{_f(p.X(1.0))} {_f(p.Y(q3))} L{_f(p.X(1.2))} {_f(p.Y(q3))}" fill="none" stroke="{AMBER}" stroke-width="1.5"/>')
    p.text(0.85, (q1 + q3) / 2, 'IQR', 12, 'end', AMBER, '600', dy=4)
    return p.svg(560, 262)


def binomial_genotypes(pq=0.3):
    """the binomial distribution with n = 2: the number of copies of an allele in a person"""
    pr = [(1 - pq) ** 2, 2 * pq * (1 - pq), pq ** 2]
    p = Plot(-0.6, 2.6, 0, 0.6, box=(60, 16, 520, 180))
    for k, v in enumerate(pr):
        p.bar(k, 0.62, v, BLUE)
        p.text(k, v, f'{v:.2f}', 12.5, weight='600', dy=-6)
    p.axes(xticks=[(0, '0 copies (CC)'), (1, '1 copy (CT)'), (2, '2 copies (TT)')], yticks=[0, 0.2, 0.4, 0.6],
           yfmt=lambda v: f'{v:.1f}', ylabel='probability')
    p.text(2.0, 0.5, f'p = {pq} for allele T', 12, color=GREY)
    return p.svg(560, 205)


def poisson_pair():
    """two Poisson distributions: λ = 3 (skewed) and λ = 30 (nearly symmetric)"""
    def pmf(k, lam):
        return math.exp(-lam + k * math.log(lam) - math.lgamma(k + 1))
    left = Plot(-0.7, 12.7, 0, 0.25, box=(46, 20, 262, 176))
    for k in range(13):
        left.bar(k, 0.7, pmf(k, 3), BLUE)
    left.axes(xticks=[0, 3, 6, 9, 12], yticks=[0, 0.1, 0.2], yfmt=lambda v: f'{v:.1f}', xlabel='count', ylabel='probability')
    left.text(9, 0.2, 'λ = 3', 13, weight='600')
    right = Plot(9, 51, 0, 0.08, box=(326, 20, 540, 176))
    for k in range(10, 51):
        right.bar(k, 0.75, pmf(k, 30), BLUE)
    right.axes(xticks=[10, 20, 30, 40, 50], yticks=[0, 0.04, 0.08], yfmt=lambda v: f'{v:.2f}', xlabel='count (reads at a base)')
    right.text(44, 0.065, 'λ = 30', 13, weight='600')
    return f'<svg viewBox="0 0 560 220" xmlns="http://www.w3.org/2000/svg" focusable="false">{"".join(left.parts)}{"".join(right.parts)}</svg>'


def sampling_distribution():
    """a skewed population, and the much narrower, nearly normal distribution of means of samples of 30 from it"""
    k, th = 6.0, 4.0  # (a right-skewed "BMI-like" population, shifted)
    f = lambda x: ((x - 15) ** (k - 1) * math.exp(-(x - 15) / th)) / (math.gamma(k) * th ** k) if x > 15 else 0
    mu = 15 + k * th
    sd = math.sqrt(k) * th
    se = sd / math.sqrt(30)
    p = Plot(15, 75, 0, 0.21, box=(30, 16, 530, 186))
    xs = grid(15.01, 75, 300)
    p.area([(x, f(x)) for x in xs], LIGHT)
    p.line([(x, f(x)) for x in xs], BLUE, 2)
    g = [(x, npdf(x, mu, se)) for x in grid(mu - 4 * se, mu + 4 * se, 200)]
    p.line(g, RED, 2.2)
    p.vline(mu, GREY, 1.2, '4 4')
    p.text(58, 0.05, 'the population: one value per person', 12, 'start', BLUE)
    p.text(mu + 2.6, 0.17, 'means of samples of 30', 12, 'start', RED, '600')
    p.text(mu + 2.6, 0.17, f'(standard error = σ / √30)', 11.5, 'start', RED, dy=15)
    p.axes(xticks=[20, 30, 40, 50, 60, 70], xlabel='value', yaxis=False)
    return p.svg(560, 230)


def many_intervals(n=20, seed=3):
    """95% confidence intervals from 20 samples: most contain the true value; about 1 in 20 doesn't"""
    rnd = random.Random(seed)
    mu, sd, m = 25.0, 4.0, 30
    rows = []
    for _ in range(n):
        xs = [rnd.gauss(mu, sd) for _ in range(m)]
        mean = sum(xs) / m
        s = math.sqrt(sum((x - mean) ** 2 for x in xs) / (m - 1))
        half = 2.045 * s / math.sqrt(m)
        rows.append((mean, mean - half, mean + half))
    # make sure one interval misses (as about one in twenty does), for the picture
    if all(lo <= mu <= hi for _, lo, hi in rows):
        mean = mu + 2.7
        rows[13] = (mean, mean - 1.55, mean + 1.55)
    p = Plot(21.5, 28.5, 0, n + 1, box=(40, 10, 520, 210))
    p.vline(mu, GREY, 1.5, '5 4')
    for i, (mean, lo, hi) in enumerate(rows):
        y = n - i
        miss = not (lo <= mu <= hi)
        col = RED if miss else BLUE
        p.add(f'<line x1="{_f(p.X(lo))}" y1="{_f(p.Y(y))}" x2="{_f(p.X(hi))}" y2="{_f(p.Y(y))}" stroke="{col}" stroke-width="2.2"/>')
        p.dot(mean, y, 3.2, col, 1)
    p.axes(xticks=[22, 24, 26, 28], xlabel='estimate of the mean, with its 95% confidence interval', yaxis=False)
    p.text(mu, n + 0.9, 'true mean', 12, color=GREY)
    return p.svg(560, 250)


# ---------------------------------------------------------------------------------------------------------------------
# week 3
def null_and_observed(obs=2.4):
    """the null distribution of a test statistic, the observed value, and the p-value as the area of the two tails"""
    p = Plot(-4, 4, 0, 0.43, box=(30, 16, 530, 186))
    xs = grid(-4, 4)
    p.area([(x, npdf(x)) for x in xs if x >= obs], '#f1b9bf')
    p.area([(x, npdf(x)) for x in xs if x <= -obs], '#f1b9bf')
    p.line([(x, npdf(x)) for x in xs])
    p.vline(obs, RED, 2, y1=0.25)
    p.text(obs, 0.26, 'observed', 12, color=RED, weight='600', dy=-4)
    p.text(0, 0.2, 'what the statistic would be', 12)
    p.text(0, 0.2, 'if the null hypothesis were true', 12, dy=15)
    p.text(3.35, 0.06, 'tail', 11.5, color=RED)
    p.text(-3.35, 0.06, 'tail', 11.5, color=RED)
    p.text(-3.3, 0.36, 'p-value = the area of the', 11.5, 'start', RED)
    p.text(-3.3, 0.36, 'two tails (as far out as, or', 11.5, 'start', RED, dy=14)
    p.text(-3.3, 0.36, 'further than, what was seen)', 11.5, 'start', RED, dy=28)
    p.axes(xticks=[-4, -2, 0, 2, 4], xlabel='test statistic', yaxis=False)
    return p.svg(560, 230)


def anova_variation():
    """three groups: the variation within each group, and between the group means and the grand mean"""
    rnd = random.Random(11)
    groups = [(1, 4.0), (2, 4.2), (3, 7.6)]
    p = Plot(0.3, 3.7, 1, 10, box=(50, 14, 520, 184))
    grand = sum(m for _, m in groups) / 3
    p.hline(grand, GREY, 1.4, '5 4')
    p.text(3.68, grand, 'grand mean', 11.5, 'end', GREY, dy=-6)
    for x, m in groups:
        ys = [m + rnd.gauss(0, 0.75) for _ in range(14)]
        for y in ys:
            p.dot(x + rnd.uniform(-0.17, 0.17), y, 3, BLUE, 0.55)
        p.add(f'<line x1="{_f(p.X(x - 0.28))}" y1="{_f(p.Y(m))}" x2="{_f(p.X(x + 0.28))}" y2="{_f(p.Y(m))}" stroke="{RED}" stroke-width="3"/>')
        p.add(f'<line x1="{_f(p.X(x + 0.32))}" y1="{_f(p.Y(m))}" x2="{_f(p.X(x + 0.32))}" y2="{_f(p.Y(grand))}" stroke="{AMBER}" stroke-width="2"/>')
    p.axes(xticks=[(1, 'NEG'), (2, 'BCR/ABL'), (3, 'ALL1/AF4')], yticks=[2, 4, 6, 8, 10], ylabel='expression')
    p.text(1.0, 9.3, 'within groups: points around their group’s mean (red)', 11.5, 'start', BLUE)
    p.text(1.0, 9.3, 'between groups: group means around the grand mean (amber)', 11.5, 'start', AMBER, dy=15)
    return p.svg(560, 222)


# ---------------------------------------------------------------------------------------------------------------------
# week 4
def least_squares():
    """a regression line, and the residuals (vertical distances) whose squares it makes as small as possible"""
    rnd = random.Random(5)
    pts = []
    for _ in range(18):
        x = rnd.uniform(1, 9)
        pts.append((x, 2 + 0.8 * x + rnd.gauss(0, 0.9)))
    n = len(pts)
    mx, my = sum(x for x, _ in pts) / n, sum(y for _, y in pts) / n
    b1 = sum((x - mx) * (y - my) for x, y in pts) / sum((x - mx) ** 2 for x, _ in pts)
    b0 = my - b1 * mx
    p = Plot(0, 10, 0, 12, box=(50, 14, 520, 184))
    for x, y in pts:
        p.add(f'<line x1="{_f(p.X(x))}" y1="{_f(p.Y(y))}" x2="{_f(p.X(x))}" y2="{_f(p.Y(b0 + b1 * x))}" stroke="{AMBER}" stroke-width="1.6"/>')
    p.line([(0, b0), (10, b0 + b1 * 10)], RED, 2.4)
    for x, y in pts:
        p.dot(x, y, 3.6, BLUE, 0.9)
    p.axes(xticks=[0, 2, 4, 6, 8, 10], yticks=[0, 4, 8, 12], xlabel='predictor, x', ylabel='outcome, y')
    p.text(0.4, 11.2, 'fitted line: ŷ = β₀ + β₁x', 12, 'start', RED, '600')
    p.text(0.4, 11.2, 'residuals (amber): y − ŷ', 12, 'start', AMBER, dy=16)
    return p.svg(560, 222)


def confounding():
    """a confounder affects both the exposure and the outcome"""
    return f'''<svg viewBox="0 0 560 190" xmlns="http://www.w3.org/2000/svg" focusable="false">
<defs><marker id="arw" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="{INK}"/></marker>
<marker id="arwq" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="{GREY}"/></marker></defs>
<rect x="196" y="12" width="168" height="44" rx="9" fill="#fff4dc" stroke="{AMBER}" stroke-width="1.6"/>
<text x="280" y="31" font-size="13" text-anchor="middle" font-weight="650">confounder</text>
<text x="280" y="48" font-size="11.5" text-anchor="middle">for example, sex</text>
<rect x="34" y="124" width="170" height="46" rx="9" fill="{LIGHT}" stroke="{BLUE}" stroke-width="1.6"/>
<text x="119" y="144" font-size="13" text-anchor="middle" font-weight="650">exposure</text>
<text x="119" y="161" font-size="11.5" text-anchor="middle">for example, BMI</text>
<rect x="356" y="124" width="170" height="46" rx="9" fill="{LIGHT}" stroke="{BLUE}" stroke-width="1.6"/>
<text x="441" y="144" font-size="13" text-anchor="middle" font-weight="650">outcome</text>
<text x="441" y="161" font-size="11.5" text-anchor="middle">gain in strength</text>
<line x1="236" y1="58" x2="150" y2="120" stroke="{INK}" stroke-width="1.8" marker-end="url(#arw)"/>
<line x1="324" y1="58" x2="410" y2="120" stroke="{INK}" stroke-width="1.8" marker-end="url(#arw)"/>
<line x1="208" y1="147" x2="350" y2="147" stroke="{GREY}" stroke-width="1.8" stroke-dasharray="6 5" marker-end="url(#arwq)"/>
<text x="279" y="138" font-size="11.5" text-anchor="middle" fill="{GREY}">association?</text>
</svg>'''


def interaction_lines():
    """an interaction: the effect of the genotype (the slope) differs between the two groups"""
    p = Plot(-0.3, 2.3, 30, 75, box=(56, 14, 470, 180))
    women = [55.1 + 7.7 * k for k in range(3)]
    men = [38.4 + 0.8 * k for k in range(3)]
    p.line([(k, v) for k, v in enumerate(women)], RED, 2.4)
    p.line([(k, v) for k, v in enumerate(men)], BLUE, 2.4)
    for k in range(3):
        p.dot(k, women[k], 4, RED, 1)
        p.dot(k, men[k], 4, BLUE, 1)
    p.text(2.08, women[2], 'women', 12.5, 'start', RED, '600', dy=4)
    p.text(2.08, men[2], 'men', 12.5, 'start', BLUE, '600', dy=4)
    p.axes(xticks=[(0, 'CC (0)'), (1, 'CT (1)'), (2, 'TT (2)')], yticks=[30, 45, 60, 75], xlabel='ACTN3 R577X genotype (copies of T, the 577X allele)',
           ylabel='mean NDRM.CH (%)')
    return p.svg(560, 222)


def residual_patterns():
    """three plots of residuals against fitted values: what a good model looks like, a curve, and a funnel"""
    rnd = random.Random(8)
    out = []
    specs = [('no pattern: good', lambda x: rnd.gauss(0, 1)), ('a curve: not linear', lambda x: 0.55 * (x - 5) ** 2 - 4 + rnd.gauss(0, 0.8)),
             ('a funnel: unequal variance', lambda x: rnd.gauss(0, 0.15 + 0.32 * x))]
    for i, (title, f) in enumerate(specs):
        left = 20 + i * 182
        p = Plot(0, 10, -5, 5, box=(left + 14, 28, left + 168, 170))
        p.hline(0, GREY, 1.2, '4 4')
        for _ in range(45):
            x = rnd.uniform(0.3, 9.7)
            p.dot(x, max(-4.9, min(4.9, f(x))), 2.6, BLUE, 0.7)
        p.add(f'<rect x="{_f(left + 14)}" y="28" width="154" height="142" fill="none" stroke="{GREY}"/>')
        p.add(f'<text x="{_f(left + 91)}" y="18" font-size="12" text-anchor="middle" font-weight="600">{title}</text>')
        p.add(f'<text x="{_f(left + 91)}" y="188" font-size="11.5" text-anchor="middle">fitted values</text>')
        out.append(''.join(p.parts))
    return f'<svg viewBox="0 0 560 196" xmlns="http://www.w3.org/2000/svg" focusable="false">{"".join(out)}</svg>'


def logistic_curve():
    """the logistic curve: probabilities stay between 0 and 1; a straight line would not"""
    p = Plot(-6, 6, -0.2, 1.2, box=(56, 14, 520, 184))
    p.hline(0, GREY, 1, '3 4')
    p.hline(1, GREY, 1, '3 4')
    p.line([(-6, 0.5 - 0.12 * 6), (6, 0.5 + 0.12 * 6)], GREY, 1.8, '6 5')
    p.line([(x, 1 / (1 + math.exp(-x))) for x in grid(-6, 6)], BLUE, 2.6)
    p.axes(xticks=[(-6, ''), (0, ''), (6, '')], yticks=[0, 0.5, 1], yfmt=lambda v: f'{v:g}', xlabel='predictor (for example, the number of risk alleles)',
           ylabel='P(outcome)')
    p.text(2.2, 0.62, 'logistic curve: always', 12, 'start', BLUE, '600')
    p.text(2.2, 0.62, 'between 0 and 1', 12, 'start', BLUE, '600', dy=15)
    p.text(-5.8, 1.08, 'a straight line goes below 0 and above 1', 11.5, 'start', GREY)
    return p.svg(560, 222)


# ---------------------------------------------------------------------------------------------------------------------
# week 5
def fwer_curve():
    """the chance of at least one false positive, 1 − 0.95^m, as the number of tests m grows"""
    p = Plot(1, 100, 0, 1, box=(56, 14, 520, 180))
    p.line([(m, 1 - 0.95 ** m) for m in range(1, 101)], RED, 2.6)
    for m in (1, 14, 59):
        p.dot(m, 1 - 0.95 ** m, 4, RED, 1)
    p.text(5, 0.025, '1 test: 5%', 11.5, 'start')
    p.text(16, 1 - 0.95 ** 14 - 0.02, '14 tests: 51%', 11.5, 'start')
    p.text(61, 1 - 0.95 ** 59 - 0.07, '59 tests: 95%', 11.5, 'start')
    p.axes(xticks=[1, 20, 40, 60, 80, 100], yticks=[0, 0.25, 0.5, 0.75, 1], yfmt=lambda v: f'{v:g}', xlabel='number of tests (each at α = 0.05, all null)',
           ylabel='P(at least one false positive)')
    return p.svg(560, 222)


def pvalue_histograms():
    """p-values when every null hypothesis is true (flat), and when some are false (a spike near 0)"""
    rnd = random.Random(2)
    def hist(vals, left, title):
        p = Plot(0, 1, 0, 2600, box=(left + 30, 30, left + 250, 166))
        counts = [0] * 20
        for v in vals:
            counts[min(19, int(v * 20))] += 1
        for i, c_ in enumerate(counts):
            p.bar(i / 20 + 0.025, 0.046, c_, BLUE)
        p.axes(xticks=[0, 0.5, 1], xfmt=lambda v: f'{v:g}', xlabel='p-value', yaxis=False)
        p.add(f'<text x="{_f(left + 140)}" y="18" font-size="12" text-anchor="middle" font-weight="600">{title}</text>')
        return ''.join(p.parts)
    null = [rnd.random() for _ in range(12000)]
    mix = [rnd.random() for _ in range(10500)] + [min(0.999, rnd.betavariate(0.25, 9)) for _ in range(1500)]
    return (f'<svg viewBox="0 0 560 210" xmlns="http://www.w3.org/2000/svg" focusable="false">{hist(null, 10, "every null hypothesis true")}'
            f'{hist(mix, 290, "some null hypotheses false")}</svg>')


def bh_procedure():
    """the Benjamini–Hochberg procedure: the sorted p-values against the line (i/m)·q"""
    rnd = random.Random(4)
    m = 40
    ps = sorted([rnd.random() for _ in range(32)] + [rnd.uniform(0, 0.012) for _ in range(8)])
    q = 0.1
    k = max([i + 1 for i, v in enumerate(ps) if v <= (i + 1) / m * q] or [0])
    p = Plot(0, m + 1, 0, 0.4, box=(56, 14, 520, 184))
    p.line([(0, 0), (m + 1, (m + 1) / m * q)], RED, 2)
    for i, v in enumerate(ps):
        if v <= 0.4:
            p.dot(i + 1, v, 3.4, BLUE if i + 1 <= k else GREY, 0.95)
    p.vline(k + 0.5, AMBER, 1.6, '5 4')
    p.text(m + 1, 0.37, 'dashed line: the largest i with p(i) ≤ (i/m)·q', 11.5, 'end', AMBER)
    p.text(m + 1, 0.37, f'reject the {k} smallest p-values, to its left', 11.5, 'end', AMBER, dy=15)
    p.text(m - 1, (m - 1) / m * q + 0.03, 'line (i/m)·q', 12, 'end', RED, '600')
    p.axes(xticks=[1, 10, 20, 30, 40], yticks=[0, 0.1, 0.2, 0.3, 0.4], yfmt=lambda v: f'{v:g}', xlabel='rank of the p-value, i (of m = 40)',
           ylabel='p-value')
    return p.svg(560, 222)


def stratification():
    """two populations that differ in both the allele's frequency and the trait: pooled, the allele seems to matter"""
    rnd = random.Random(21)
    p = Plot(-0.4, 2.85, 0, 12, box=(56, 14, 520, 184))
    pops = [(0.2, 4.0, BLUE, 'population A'), (0.7, 7.5, RED, 'population B')]
    allp = []
    for freq, mean, col, lab in pops:
        for _ in range(60):
            g = (rnd.random() < freq) + (rnd.random() < freq)
            y = mean + rnd.gauss(0, 1.2)
            allp.append((g, y))
            p.dot(g + rnd.uniform(-0.18, 0.18) + (-0.06 if col == BLUE else 0.06), y, 2.8, col, 0.55)
        p.line([(0, mean), (2, mean)], col, 2, '6 4')
    n = len(allp)
    mx, my = sum(g for g, _ in allp) / n, sum(y for _, y in allp) / n
    b1 = sum((g - mx) * (y - my) for g, y in allp) / sum((g - mx) ** 2 for g, _ in allp)
    b0 = my - b1 * mx
    p.line([(0, b0), (2, b0 + 2 * b1)], INK, 2.6)
    p.text(2.3, 4.0, 'population A', 12, 'start', BLUE, '650', dy=4)
    p.text(2.3, 7.5, 'population B', 12, 'start', RED, '650', dy=-6)
    p.text(2.3, b0 + 2 * b1, 'both pooled', 12, 'start', INK, '650', dy=12)
    p.axes(xticks=[(0, '0'), (1, '1'), (2, '2')], yticks=[0, 4, 8, 12], xlabel='copies of the allele', ylabel='trait')
    return p.svg(560, 222)


def qq_shapes():
    """QQ plots of p-values: on the line (nothing going on), a few points off at the end (some real signals), and the
    whole line lifted (inflation, for example from population structure)"""
    rnd = random.Random(9)
    m = 400
    exp_ = [-math.log10((i + 0.5) / m) for i in range(m)]
    def panel(left, obs, title):
        p = Plot(0, 3.2, 0, 7, box=(left + 26, 28, left + 168, 166))
        p.line([(0, 0), (3.2, 3.2)], RED, 1.6)
        for e, o in zip(exp_, obs):
            p.dot(e, min(6.9, o), 2.2, BLUE, 0.75)
        p.add(f'<rect x="{_f(left + 26)}" y="28" width="142" height="138" fill="none" stroke="{GREY}"/>')
        p.add(f'<text x="{_f(left + 97)}" y="18" font-size="12" text-anchor="middle" font-weight="600">{title}</text>')
        p.add(f'<text x="{_f(left + 97)}" y="182" font-size="11" text-anchor="middle">expected −log₁₀ p</text>')
        return ''.join(p.parts)
    null = sorted([-math.log10(rnd.random()) for _ in range(m)], reverse=True)
    sig = sorted([-math.log10(rnd.random()) for _ in range(m - 5)] + [rnd.uniform(4, 6.5) for _ in range(5)], reverse=True)
    infl = sorted([-math.log10(rnd.random()) * 1.6 for _ in range(m)], reverse=True)
    return (f'<svg viewBox="0 0 560 192" xmlns="http://www.w3.org/2000/svg" focusable="false">{panel(6, null, "no signal")}'
            f'{panel(190, sig, "a few real signals")}{panel(374, infl, "inflation")}'
            f'<text x="12" y="100" font-size="11" text-anchor="middle" transform="rotate(-90 12 100)">observed −log₁₀ p</text></svg>')


def manhattan_sketch():
    """a Manhattan plot: −log10 p for each SNP, along the genome, with a line at genome-wide significance"""
    rnd = random.Random(14)
    p = Plot(0, 22, 0, 12, box=(52, 14, 530, 176))
    x = 0.0
    for chrom in range(1, 23):
        n = 46
        col = BLUE if chrom % 2 else '#5fa3bd'
        for j in range(n):
            v = -math.log10(rnd.random())
            pos = chrom - 1 + j / n
            if chrom == 6 and 18 < j < 30:
                v += max(0, 9.5 - abs(j - 24) * 1.3) * rnd.uniform(0.7, 1.0)
            p.dot(pos, min(11.8, v), 2, col, 0.85)
    p.hline(-math.log10(5e-8), RED, 1.6, '6 4')
    p.text(22, -math.log10(5e-8), '5 × 10⁻⁸', 11.5, 'end', RED, dy=-5)
    p.axes(xticks=[(c - 0.5, str(c)) for c in (1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21)], yticks=[0, 4, 8, 12], xlabel='chromosome',
           ylabel='−log₁₀ p')
    p.text(6.5, 11.5, 'a peak: many SNPs in LD', 11.5, 'start', INK)
    return p.svg(560, 216)


def correlations():
    """scatter plots with correlations from strong and positive to strong and negative, and a curve with r near 0"""
    rnd = random.Random(31)
    specs = [(0.9, 'r = 0.9'), (0.5, 'r = 0.5'), (0.0, 'r = 0'), (-0.7, 'r = −0.7'), (None, 'a curve: r ≈ 0')]
    out = []
    for i, (r, title) in enumerate(specs):
        left = 6 + i * 110
        p = Plot(-3, 3, -3.2, 3.2, box=(left + 6, 26, left + 100, 120))
        for _ in range(60):
            x = rnd.gauss(0, 1)
            if r is None:
                x = rnd.uniform(-2.4, 2.4)
                y = 1.1 * x * x - 2.2 + rnd.gauss(0, 0.35)
            else:
                y = r * x + math.sqrt(1 - r * r) * rnd.gauss(0, 1)
            p.dot(max(-2.9, min(2.9, x)), max(-3.1, min(3.1, y)), 2, BLUE, 0.7)
        p.add(f'<rect x="{_f(left + 6)}" y="26" width="94" height="94" fill="none" stroke="{GREY}"/>')
        p.add(f'<text x="{_f(left + 53)}" y="16" font-size="12" text-anchor="middle" font-weight="600">{title}</text>')
        out.append(''.join(p.parts))
    return f'<svg viewBox="0 0 560 130" xmlns="http://www.w3.org/2000/svg" focusable="false">{"".join(out)}</svg>'


def ld_haplotypes():
    """linkage disequilibrium: copies of a stretch of chromosome; the alleles of two SNPs close together travel together,
    those of a SNP far away don't"""
    rows = 8
    x0, x1 = 70, 540
    sx = [150, 196, 470]
    parts = []
    # which copies carry the rarer allele (amber) at each SNP: SNPs 1 and 2 nearly always together, SNP 3 at random
    s1 = [1, 0, 1, 0, 0, 1, 0, 0]
    s2 = [1, 0, 1, 0, 0, 1, 0, 1]
    s3 = [1, 0, 0, 1, 0, 0, 1, 0]
    for i in range(rows):
        y = 44 + i * 19
        parts.append(f'<line x1="{x0}" y1="{y}" x2="{x1}" y2="{y}" stroke="{GREY}" stroke-width="3" stroke-linecap="round"/>')
        parts.append(f'<text x="{x0 - 10}" y="{y + 4}" font-size="11" text-anchor="end" fill="{GREY}">copy {i + 1}</text>')
        for x, s in zip(sx, (s1[i], s2[i], s3[i])):
            parts.append(f'<circle cx="{x}" cy="{y}" r="6.5" fill="{AMBER if s else BLUE}" stroke="white" stroke-width="1.2"/>')
    for x, lab in zip(sx, ('SNP 1', 'SNP 2', 'SNP 3')):
        parts.append(f'<text x="{x}" y="22" font-size="12" text-anchor="middle" font-weight="600">{lab}</text>')
    yb = 44 + rows * 19 + 4
    parts.append(f'<path d="M{sx[0] - 8} {yb} L{sx[0] - 8} {yb + 6} L{sx[1] + 8} {yb + 6} L{sx[1] + 8} {yb}" fill="none" stroke="{INK}"/>')
    parts.append(f'<text x="{(sx[0] + sx[1]) / 2}" y="{yb + 21}" font-size="11.5" text-anchor="middle" fill="{INK}">close together: strong LD</text>')
    parts.append(f'<text x="{(sx[0] + sx[1]) / 2}" y="{yb + 35}" font-size="11.5" text-anchor="middle" fill="{INK}">(r² high)</text>')
    parts.append(f'<text x="{sx[2]}" y="{yb + 21}" font-size="11.5" text-anchor="middle" fill="{INK}">far away: shuffled by</text>')
    parts.append(f'<text x="{sx[2]}" y="{yb + 35}" font-size="11.5" text-anchor="middle" fill="{INK}">recombination (r² near 0)</text>')
    return f'<svg viewBox="0 0 560 250" xmlns="http://www.w3.org/2000/svg" focusable="false">{"".join(parts)}</svg>'


def gwas_pipeline():
    """the steps of a genetic association study, from genotypes to a result"""
    steps = [('Quality control', 'call rate, MAF,', 'Hardy–Weinberg'), ('Test each SNP', 'regression with', 'covariates'),
             ('Correct', 'for many tests:', 'Bonferroni, FDR'), ('Plot', 'QQ and', 'Manhattan plots'),
             ('Interpret', 'effect sizes, LD;', 'replicate')]
    w, gap, h, y = 106, 15, 78, 12
    parts = []
    for i, (a, b, c_) in enumerate(steps):
        x = 4 + i * (w + gap)
        parts.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="8" fill="{LIGHT}" stroke="{BLUE}" stroke-width="1.4"/>')
        parts.append(f'<text x="{x + w / 2}" y="{y + 25}" font-size="13.5" text-anchor="middle" font-weight="650" fill="{INK}">{a}</text>')
        parts.append(f'<text x="{x + w / 2}" y="{y + 47}" font-size="12.5" text-anchor="middle" fill="{INK}">{b}</text>')
        parts.append(f'<text x="{x + w / 2}" y="{y + 63}" font-size="12.5" text-anchor="middle" fill="{INK}">{c_}</text>')
        if i < len(steps) - 1:
            ax = x + w + 2
            parts.append(f'<path d="M{ax} {y + h / 2} L{ax + gap - 5} {y + h / 2}" stroke="{INK}" stroke-width="1.6"/>'
                         f'<path d="M{ax + gap - 9} {y + h / 2 - 4} L{ax + gap - 3} {y + h / 2} L{ax + gap - 9} {y + h / 2 + 4}" fill="none" stroke="{INK}" stroke-width="1.6"/>')
    return f'<svg viewBox="0 0 600 104" xmlns="http://www.w3.org/2000/svg" focusable="false">{"".join(parts)}</svg>'
