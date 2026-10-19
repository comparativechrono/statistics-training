"""A student works through week 2 from start to finish: installing and loading the tidyverse, reading the FAMuSS data,
describing it, plotting distributions, probabilities and simulations, standard errors and confidence intervals, and a
Quarto report that is rendered (twice). Every step ticks itself with the code a student would write, some steps must
not tick for the wrong thing, and at the end the practical is finished and the landing page says so. Downloads the
tidyverse, knitr and markdown (a minute or two).
Run:  python3 test/t02_week2.py"""
import sys
import time
from student import Student, check
import week2 as W

s = Student('week2.html')
p = s.p

# ---- 0. Start here ----
s.chapter('start')
t0 = time.time()
s.run('install.packages("tidyverse")')
s.step('st-install', timeout=30)
s.step('st-library', 'library(tidyverse)', timeout=90)
print(f'the tidyverse was installed and loaded in {time.time() - t0:.0f} s')
s.not_yet('st-wd', 'the working directory is still the home folder')
s.step('st-wd', 'setwd("~/data")')
s.step('st-read', 'fms <- read_csv("famuss.csv")', timeout=30)
s.step('st-view', 'View(fms)', timeout=30)
s.short('st-q-cols', '235')
s.choose('st-q-text')

# ---- 1. Describing data ----
s.chapter('describe')
s.run('mean(fms$pre.BMI)')
s.not_yet('d-bmi-mean', 'without na.rm the mean is NA')
s.step('d-bmi-mean', 'mean(fms$pre.BMI, na.rm = TRUE)')
s.step('d-bmi-med', 'median(fms$pre.BMI, na.rm = TRUE)')
s.step('d-bmi-iqr', 'IQR(fms$pre.BMI, na.rm = TRUE)')
s.step('d-race', 'count(fms, Race)')
s.run('fms %>% drop_na(Gender) %>% group_by(Gender) %>% summarise(median = median(NDRM.CH, na.rm = TRUE))')
s.not_yet('d-sex', 'the table has no mean')
s.step('d-sex', W.GROUPED)
s.step('d-geno', 'fms %>% drop_na(esr1_rs1042717) %>% count(esr1_rs1042717) %>% mutate(proportion = n / sum(n))')
s.short('d-q-median', '45.5')
s.short('d-q-missing', '386')
s.short('d-q-bmi', '24.4')
s.choose('d-q-skew')
s.choose('d-q-geno')
s.write('d-q-percent', 'Women started from a lower weight, so the same gain is a bigger percentage.')
s.step('d-across', 'fms %>% drop_na(Gender) %>% group_by(Gender) %>% summarise(across(c(Pre.height, Pre.weight, pre.BMI), ~ mean(.x, na.rm = TRUE)))')

# ---- 2. Seeing distributions ----
s.chapter('shapes')
s.step('sh-hist', 'ggplot(fms, aes(x = pre.BMI)) + geom_histogram(binwidth = 1)')
s.run('ggplot(fms, aes(x = actn3_r577x, y = NDRM.CH)) + geom_boxplot()')
s.not_yet('sh-box', 'the people without a genotype are still in the plot')
s.step('sh-box', 'fms %>% drop_na(actn3_r577x, NDRM.CH) %>% ggplot(aes(x = actn3_r577x, y = NDRM.CH)) + geom_boxplot()')
s.step('sh-dens', W.DENS)
s.choose('sh-q-box')
s.choose('sh-q-shape')
s.choose('sh-q-bins')
s.step('sh-log', 'ggplot(fms, aes(x = log2(pre.BMI))) + geom_histogram(bins = 30)')

# ---- 3. Probability distributions ----
s.chapter('distributions')
s.run('pnorm(-2)')
s.not_yet('pd-tails', 'only one tail')
s.step('pd-tails', '2 * pnorm(-2)')
s.step('pd-het', 'dbinom(1, size = 2, prob = 0.1)')
s.step('pd-miss', 'dbinom(0, size = 400, prob = 0.005)')
s.step('pd-depth', 'ppois(14, lambda = 30)')
s.step('pd-sim', 'depth <- rpois(10000, lambda = 30)')
s.step('pd-simhist', W.SIMHIST)
s.step('pd-low', 'mean(depth < 15)')
s.short('pd-q-975', '1.96')
s.short('pd-q-het', '0.42')
s.short('pd-q-miss', '0.37', expect=False)
s.short('pd-q-miss', '0.13')
s.choose('pd-q-which')
s.choose('pd-q-rnaseq')
s.step('pd-lln', 'mean(rpois(100000, 30))')
s.write('pd-q-lln', 'The means of 10 values varied much more.')

# ---- 4. Samples and uncertainty ----
s.chapter('uncertainty')
s.run(W.BMI_VEC)
s.step('u-means', W.MEANS, timeout=30)
s.step('u-hist', W.MEANS_HIST)
s.step('u-120', 'means120 <- replicate(2000, mean(sample(bmi, 120)))', timeout=30)
s.step('u-se', 'sd(bmi) / sqrt(length(bmi))')
s.step('u-ci', 't.test(bmi)$conf.int')
s.run('e <- fms %>% drop_na(esr1_rs1042717) %>% pull(esr1_rs1042717)')
s.step('u-af', '(2 * sum(e == "AA") + sum(e == "GA")) / (2 * length(e))')
s.run('p_A <- (2 * sum(e == "AA") + sum(e == "GA")) / (2 * length(e))')
s.step('u-afci', 'p_A + c(-1, 1) * qnorm(0.975) * sqrt(p_A * (1 - p_A) / (2 * length(e)))')
s.run(W.NDRM_VEC)
s.run(W.BOOT_MED, settle=1)
s.step('u-boot', 'quantile(boot_medians, c(0.025, 0.975))')
s.short('u-q-se', '0.14')
s.short('u-q-af', '0.25')
s.choose('u-q-n')
s.choose('u-q-sdse')
s.choose('u-q-ci', right=False)
s.choose('u-q-ci')
s.run(W.COVER, settle=1)
s.step('u-cover', 'mean(covered)')
s.write('u-q-cover', 'About 0.94: the proportion varies by chance.')

# ---- 5. Your report ----
s.chapter('report')
s.create_file('week2.qmd')
s.step('r-create')
check(s.doc_text().strip() == W.TEMPLATE.strip(), 'the report starts as it is shown in the instructions')
s.doc_set(s.doc_text().replace('author: "Your name"', 'author: "Ada Lovelace"'))
ev = s.knit()
check(ev and ev.get('ok'), f'the report renders ({ev})')
s.step('r-render', timeout=5)
html = s.read('week2.html') or ''
check('1397' in html and 'title-block-header' in html, 'the rendered report has the inline numbers and the title')
check('Female' in html and '61.5' in html, 'the rendered report has the table by sex')
added = s.doc_text().replace('Write your confidence interval for the mean pre-training BMI here.', '''```{r}
#| label: ci
bmi <- fms %>% drop_na(pre.BMI) %>% pull(pre.BMI)
t.test(bmi)
```

The frequency of the T allele of ACTN3 R577X is
`r g <- na.omit(fms$actn3_r577x); round((2 * sum(g == "TT") + sum(g == "CT")) / (2 * length(g)), 3)`.''')
s.doc_set(added)
s.step('r-ci', timeout=5)
s.step('r-inline', timeout=5)
s.not_yet('r-render2', 'not rendered again yet')
ev = s.knit()
check(ev and ev.get('ok'), f'the report renders again ({ev})')
s.step('r-render2', timeout=5)
html = s.read('week2.html') or ''
check('0.49' in html, 'the inline allele frequency is in the report')
s.choose('r-q-new')
s.choose('r-q-path')
s.write('r-q-why', 'Every number comes from the code, so it can be checked and updated.')

# ---- the end: everything is done ----
left = s.left()
check(not left, f'nothing is left to do ({left})')
s.wait_modal('Practical complete')
s.chapter('wrapup')
time.sleep(1)
panel = p.js('() => document.querySelector("[data-cert-panel]").textContent')
check('Well done' in panel and 'Week 2' in panel, 'the last chapter says the practical is finished: ' + panel[:120])
check('Practical complete' in s.last_modal, 'a message said the practical is complete')
st = p.js('() => MG.cert.status("week2")')
check(st and st['complete'], f'the practical is complete ({st})')
errs = [e for e in p.errors if "'serviceWorker' property" not in e]
check(not errs, f'no errors in the page ({errs[:3]})')
# the landing page knows
p.open('index.html')
time.sleep(0.5)
txt = p.js('() => document.querySelector(\'.course[data-course="week2"] .cp-text\').textContent')
check(txt.startswith('Finished on'), 'the landing page shows week 2 as finished: ' + txt)
txt3 = p.js('() => document.querySelector(\'.course[data-course="week3"] .cp-text\').textContent')
check(txt3 == 'Not started yet', 'and week 3 as not started yet: ' + txt3)
s.close()
print('failed:', check.failed)
sys.exit(1 if check.failed else 0)
