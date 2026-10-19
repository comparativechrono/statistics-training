"""The short questions of the practicals accept the answers they should, and not others. (No browser: the patterns are
tried here as tutorial.js tries them – on the answer in lower case, with its dashes and spaces tidied – with Python's
re, whose syntax for these patterns is the same as JavaScript's.)
Run:  python3 test/t00_answers.py"""
import re
import sys
from html.parser import HTMLParser
from student import check
import week2
import week3
import week4
import week5


class Questions(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.q = {}

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if 'data-q' in a and 'data-accept' in a:
            self.q[a['data-q']] = a['data-accept']


def norm(s):
    return re.sub(r'\s+', ' ', re.sub('[‐-―−]', '-', s.lower())).strip()


def accepts(pattern, answer):
    v = norm(answer)
    return any(re.search(a.strip(), v, re.I) for a in pattern.split('||') if a.strip())


GOOD = {
    # week 2
    'st-q-cols': ['235', ' 235 '],
    'd-q-median': ['45.5', '45.50'],
    'd-q-missing': ['386'],
    'd-q-bmi': ['24.36', '24.364', '24.4'],
    'pd-q-975': ['1.96', '1.959964'],
    'pd-q-het': ['0.42', '.42', '42%', '42 %'],
    'pd-q-miss': ['0.13', '0.134', '13%', '13.4%'],
    'u-q-se': ['0.14', '.14', '0.143'],
    'u-q-af': ['0.25', '.25', '0.250'],
    # week 3
    'st3-q-bcr': ['37'],
    'lg-q-p': ['0', '0.000', '<0.0002', '< 1/5000'],
    'lg-q-rag': ['0.8', '0.76', '0.83', '.79'],
    'tw-q-diff': ['1.10', '1.1', '1.0996'],
    'tw-q-gain': ['8.62', '8.6', '8.6234'],
    'sv-q-fwer': ['0.14', '0.143', '14%', '14.3 %'],
    'sv-q-actn3': ['0.024', '0.0242', '0.02'],
    'ct-q-exp': ['5.09', '5.087', '5.1'],
    'ct-q-or': ['1.80', '1.8', '1.7995'],
    'ct-q-hwe': ['0.076', '0.0760', '0.07598', '0.08'],
    # week 4
    'co-q-r': ['0.53', '.534', '0.5340'],
    'lr-q-slope': ['5.04', '5.039', '5.0'],
    'lr-q-r2': ['0.285', '0.29', '28.5%', '29%'],
    'lr-q-pred': ['171', '171.4', '171.37 pounds', '171 lb'],
    'lr-q-bmi': ['0.177', '0.18', '.1772'],
    'gp-q-slope': ['4.91', '4.908', '4.9'],
    'cf-q-adj': ['-0.98', '−0.98', '-0.981', '-.98'],
    'cf-q-women': ['7.68', '7.681', '7.7'],
    'lo-q-or': ['1.80', '1.8', '1.7995'],
    'lo-q-esr1': ['1.27', '1.266', '1.2660'],
    # week 5
    'st5-q-50k': ['50000', '50,000', '5 x 10^4', '5×10^4', '5e4', 'fifty thousand'],
    'mt-q-fwer': ['0.91', '0.910', '.91', '91%'],
    'mt-q-exp': ['2.35', '2.4', '2', 'about 2'],
    'co-q-thr': ['0.00106', '0.001064', '.00106', '0.0011', '1.06 x 10^-3'],
    'co-q-bonf10': ['3', 'three'],
    'co-q-bh10': ['5', 'five'],
    'gw-q-exp': ['631', '631.25', '631.3', 'about 630'],
    'gw-q-bh': ['162'],
    'gw-q-false': ['8', '8.1', 'about 8'],
    'ps-q-freq': ['0.30', '0.3', '0.303', '.3025', '30%'],
    'ps-q-naive': ['148'],
    'ld-q-r2': ['0.89', '0.892', '.8916'],
    'g5-q-pass': ['163'],
    'g5-q-n05': ['12', 'twelve'],
    'g5-q-top': ['acdc_rs1501299', 'ACDC_rs1501299', 'acdc rs1501299', 'rs1501299'],
}
BAD = {
    # week 2
    'st-q-cols': ['222', '13', '2350'],
    'd-q-median': ['45', '46', '45.51'],
    'd-q-missing': ['1011', '38'],
    'd-q-bmi': ['24.3', '23.35', '24'],
    'pd-q-975': ['1.64', '2', '0.975'],
    'pd-q-het': ['0.21', '0.09', '0.49'],
    'pd-q-miss': ['0.37', '0.01', '0.87'],
    'u-q-se': ['4.6', '0.4', '1.4'],
    'u-q-af': ['0.75', '0.5', '0.2'],
    # week 3
    'st3-q-bcr': ['42', '10', '79'],
    'lg-q-p': ['0.05', '1', '0.5'],
    'lg-q-rag': ['0.05', '0.08', '0.3'],
    'tw-q-diff': ['9.78', '1.2', '0.11'],
    'tw-q-gain': ['8', '86.2', '8.7'],
    'sv-q-fwer': ['0.05', '0.15', '0.86'],
    'sv-q-actn3': ['0.24', '0.034', '0.05'],
    'ct-q-exp': ['5', '3.91', '1', '5.084'],
    'ct-q-or': ['0.56', '1.37', '2.36'],
    'ct-q-hwe': ['0.0003', '0.7', '0.05', '0.0754'],
    # week 4
    'co-q-r': ['0.29', '0.5', '5.3'],
    'lr-q-slope': ['5', '181', '4.55', '5.034'],
    'lr-q-r2': ['0.53', '0.2', '53%'],
    'lr-q-pred': ['70', '170', '-181'],
    'lr-q-bmi': ['0.21', '0.046', '1.8'],
    'gp-q-slope': ['9.8', '4.8', '49'],
    'cf-q-adj': ['0.98', '-1.22', '-0.9'],
    'cf-q-women': ['0.79', '7.6', '76.8'],
    'lo-q-or': ['0.59', '0.40', '18'],
    'lo-q-esr1': ['0.24', '1.07', '1.2'],
    # week 5
    'st5-q-50k': ['5000', '500,000', '0.05', '1000000'],
    'mt-q-fwer': ['0.05', '0.95', '0.09'],
    'mt-q-exp': ['22', '47', '0.05'],
    'co-q-thr': ['0.001', '0.0010', '0.05', '0.00213'],
    'co-q-bonf10': ['5', '1', '10'],
    'co-q-bh10': ['3', '6', '4'],
    'gw-q-exp': ['1236', '63', '12625'],
    'gw-q-bh': ['20', '1236', '16'],
    'gw-q-false': ['5', '162', '0.05'],
    'ps-q-freq': ['0.03', '0.25', '0.7'],
    'ps-q-naive': ['25', '10', '500'],
    'ld-q-r2': ['0.97', '0.8', '0.09'],
    'g5-q-pass': ['141', '222', '191'],
    'g5-q-n05': ['8', '22', '0'],
    'g5-q-top': ['actn3_r577x', 'acdc_rs15012', 'vdr_taq1'],
}

found = {}
for mod in (week2, week3, week4, week5):
    p = Questions()
    p.feed('\n'.join(mod.ALL()))
    found.update(p.q)

check(set(found) == set(GOOD), f'every short question is tried here ({sorted(set(found) ^ set(GOOD))})')
for qid, pattern in sorted(found.items()):
    for a in GOOD.get(qid, []):
        check(accepts(pattern, a), f'{qid} accepts {a!r}')
    for a in BAD.get(qid, []):
        check(not accepts(pattern, a), f'{qid} does not accept {a!r}')
print('failed:', check.failed)
sys.exit(1 if check.failed else 0)
