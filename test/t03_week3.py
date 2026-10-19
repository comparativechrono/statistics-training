"""A student works through week 3 from start to finish: the leukaemia data, a permutation test by hand, t-tests,
Wilcoxon and paired tests, ANOVA, Tukey and Kruskal–Wallis, tables, Fisher's test and odds ratios, Hardy–Weinberg
tests with a function from a file, choosing tests, and a Quarto report rendered twice. Every step ticks itself with the
code a student would write, some steps must not tick for the wrong thing, and at the end the practical is finished.
Run:  python3 test/t03_week3.py"""
import sys
import time
from student import Student, check
import week3 as W

s = Student('week3.html')
p = s.p

# ---- 0. Start here ----
s.chapter('start')
t0 = time.time()
s.run('install.packages("tidyverse")')
s.step('st3-install', timeout=30)
s.step('st3-library', 'library(tidyverse)', timeout=90)
print(f'the tidyverse was installed and loaded in {time.time() - t0:.0f} s')
s.step('st3-wd', 'setwd("~/data")')
s.step('st3-leuk', 'leuk <- read_csv("leukaemia.csv")')
s.step('st3-fms', 'fms <- read_csv("famuss.csv")', timeout=30)
s.step('st3-count', 'leuk %>% count(mol.biol)')
s.short('st3-q-bcr', '37')
s.choose('st3-q-abl')

# ---- 1. The logic of a test ----
s.chapter('logic')
s.run('two <- leuk %>% filter(mol.biol != "NEG")')
s.not_yet('lg-two', 'that kept the wrong groups')
s.step('lg-two', W.TWO_CODE)
s.step('lg-means', W.TWO_SUM)
s.run(W.DIFF_FUN)
s.step('lg-fun', 'obs <- diff_means(two$ABL1, two$mol.biol)')
s.step('lg-null', W.NULL_CODE, timeout=60)
s.step('lg-hist', W.NULL_HIST)
s.step('lg-p', 'mean(abs(null) >= abs(obs))')
s.run('obs_rag <- diff_means(two$RAG1, two$mol.biol)')
s.run('null_rag <- replicate(5000, diff_means(two$RAG1, sample(two$mol.biol)))', settle=1)
s.step('lg-rag', 'mean(abs(null_rag) >= abs(obs_rag))')
s.short('lg-q-p', '0')
s.short('lg-q-rag', '0.8')
s.choose('lg-q-meaning')
s.choose('lg-q-rag2')
s.choose('lg-q-type1')

# ---- 2. Two groups ----
s.chapter('two')
s.step('tw-qq', W.QQ)
s.step('tw-t', 't.test(ABL1 ~ mol.biol, data = two)')
s.step('tw-w', 'wilcox.test(ABL1 ~ mol.biol, data = two)')
s.run('t.test(RAG1 ~ mol.biol, data = two)')
s.not_yet('tw-cd52', 'that was RAG1')
s.step('tw-cd52', 't.test(CD52 ~ mol.biol, data = two)')
s.step('tw-sex', 't.test(NDRM.CH ~ Gender, data = fms)')
s.run('t.test(fms$Post_NDRM_Max, fms$Pre_NDRM_Max)')
s.not_yet('tw-paired', 'that test was not paired')
s.step('tw-paired', W.PAIRED)
s.short('tw-q-diff', '1.10')
s.short('tw-q-gain', '8.62')
s.choose('tw-q-cd52')
s.choose('tw-q-welch')
s.choose('tw-q-paired')
s.choose('tw-q-big')

# ---- 3. Several groups ----
s.chapter('several')
s.step('sv-box', W.HOX_BOX)
s.step('sv-aov', 'summary(aov(HOXA9 ~ mol.biol, data = leuk))')
s.step('sv-tukey', 'TukeyHSD(aov(HOXA9 ~ mol.biol, data = leuk))')
s.step('sv-meis', 'aov(MEIS1 ~ mol.biol, data = leuk)')
s.step('sv-actn3', 'summary(aov(NDRM.CH ~ actn3_r577x, data = fms))')
s.step('sv-kw', 'kruskal.test(NDRM.CH ~ actn3_r577x, data = fms)')
s.short('sv-q-fwer', '0.14')
s.short('sv-q-actn3', '0.024')
s.choose('sv-q-anova')
s.choose('sv-q-tukey')

# ---- 4. Categorical data ----
s.chapter('categorical')
s.run('tab <- table(two$mol.biol, two$remission)')
s.step('ct-tab', 'tab')
s.step('ct-fisher', 'fisher.test(tab)')
s.step('ct-obese', 'fms <- fms %>% mutate(obese = pre.BMI > 25)')
s.run('tab2 <- table(fms$Gender, fms$obese)')
s.step('ct-chisq', 'chisq.test(tab2)')
s.step('ct-or', '(178 / 247) / (173 / 432)')
s.create_file('hwe.R')
p.js('() => MG.app.rstudio.sourceDoc(false)')
time.sleep(1)
s.idle()
check(p.js('() => MG.app.rstudio.vars.some((v) => v.name === "hwe_p")'), 'Source made the function hwe_p')
s.step('ct-hwe', 'hwe_p(fms$actn3_r577x)')
s.step('ct-cauc', 'fms %>% filter(Race == "Caucasian") %>% pull(actn3_r577x) %>% hwe_p()')
s.run('hwe_p(fms$akt1_t8407g)')
s.not_yet('ct-akt1', 'that was everyone')
s.step('ct-akt1', 'hwe_p(fms$akt1_t8407g[fms$Race %in% "Caucasian"])')
s.short('ct-q-exp', '5.09')
s.short('ct-q-or', '1.80')
s.short('ct-q-hwe', '0.08')
s.choose('ct-q-fisher')
s.choose('ct-q-dir')
s.choose('ct-q-wahlund')
s.choose('ct-q-nr3c1')

# ---- 5. Choosing a test ----
s.chapter('choose')
for k in range(1, 7):
    s.choose(f'ch-q-{k}')

# ---- 6. Your report ----
s.chapter('report')
s.create_file('week3.qmd')
s.step('rp-create')
check(s.doc_text().strip() == W.TEMPLATE.strip(), 'the report starts as it is shown in the instructions')
ev = s.knit()
check(ev and ev.get('ok'), f'the report renders ({ev})')
s.step('rp-render', timeout=5)
html = s.read('week3.html') or ''
check('Welch Two Sample t-test' in html and '230.3' in html and '1.1' in html, 'the rendered report has the t-test, the ANOVA and the inline difference')
added = s.doc_text().replace("Add a Fisher's exact test of remission (CR or REF) in the BCR/ABL and NEG groups here.", '''```{r}
#| label: remission
tab <- table(two$mol.biol, two$remission)
fisher.test(tab)
```

## Hardy-Weinberg equilibrium

```{r}
#| label: hwe
source("hwe.R")
hwe_p(fms$actn3_r577x)
fms %>% filter(Race == "Caucasian") %>% pull(actn3_r577x) %>% hwe_p()
```''')
s.doc_set(added)
s.step('rp-fisher', timeout=5)
s.step('rp-hwe', timeout=5)
ev = s.knit()
check(ev and ev.get('ok'), f'the report renders again ({ev})')
s.step('rp-render2', timeout=5)
html = s.read('week3.html') or ''
check('0.0759' in html or '0.07598' in html, 'the report has the HWE test in the Caucasian participants')
s.write('rp-q-sentence', 'Fewer BCR/ABL patients went into remission (Fisher p = 0.008).')

# ---- the end ----
left = s.left()
check(not left, f'nothing is left to do ({left})')
s.chapter('wrapup')
time.sleep(1)
panel = p.js('() => document.querySelector("[data-cert-panel]").textContent')
check('Well done' in panel, 'the last chapter says the practical is finished: ' + panel[:100])
st = p.js('() => MG.cert.status("week3")')
check(st and st['complete'], f'the practical is complete ({st})')
errs = [e for e in p.errors if "'serviceWorker' property" not in e]
check(not errs, f'no errors in the page ({errs[:3]})')
s.close()
print('failed:', check.failed)
sys.exit(1 if check.failed else 0)
