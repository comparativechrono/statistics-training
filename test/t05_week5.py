"""A student works through week 5 from start to finish: the functions for genotypes, many tests in which nothing is
going on, the Virco HIV data with Bonferroni and Benjamini–Hochberg corrections, every probe of the leukaemia
microarray, population structure (HGDP allele frequencies, a simulated study, PCA and QQ plots), linkage
disequilibrium, a mini-GWAS of the FAMuSS SNPs, and a Quarto report rendered twice, with the homework. Every step
ticks itself with the code a student would write, some steps must not tick for the wrong thing, and at the end the
practical is finished.
Run:  python3 test/t05_week5.py"""
import sys
import time
from student import Student, check
import week5 as W

s = Student('week5.html')
p = s.p

# ---- 0. Start here ----
s.chapter('start')
t0 = time.time()
s.run('install.packages("tidyverse")')
s.step('st5-install', timeout=30)
s.step('st5-library', 'library(tidyverse)', timeout=90)
print(f'the tidyverse was installed and loaded in {time.time() - t0:.0f} s')
s.step('st5-wd', 'setwd("~/data")')
s.run('dosage(c("CC", "CT", "CC", NA, "TT", "CC"))')
s.not_yet('st5-snps', 'snps.R has not been sourced')
s.create_file('snps.R')
check(s.doc_text().strip() == W.SNPS_R.strip(), 'snps.R is as the instructions show it')
p.js('() => MG.app.rstudio.sourceDoc(false)')
time.sleep(1)
s.idle()
check(p.js('() => ["dosage", "hwe_p"].every((n) => MG.app.rstudio.vars.some((v) => v.name === n))'), 'Source made the functions dosage and hwe_p')
s.step('st5-snps', 'dosage(c("CC", "CT", "CC", NA, "TT", "CC"))')
s.step('st5-virco', 'virco <- read_csv("virco.csv")', timeout=30)
s.short('st5-q-50k', '5000', expect=False)
s.short('st5-q-50k', '50,000')

# ---- 1. Many tests ----
s.chapter('many')
s.run('set.seed(1)')
s.step('mt-sim', W.NULL_SIM, timeout=30)
s.step('mt-count', 'sum(null_p < 0.05)')
s.step('mt-hist', W.NULL_HIST)
s.not_yet('mt-vhist', 'that was the histogram of the simulated p-values')
s.run('trait <- virco$IDV.Fold - virco$NFV.Fold')
s.run('positions <- select(virco, P1:P99)')
s.run('mut <- positions != "-" & positions != "."')
s.not_yet('mt-mut', 'every position is still there')
s.step('mt-mut', 'mut <- mut[, colMeans(mut) > 0.05]')
s.run(W.VIRCO_P)
s.not_yet('mt-virco', 'the p-values are not counted yet')
s.step('mt-virco', 'sum(p_virco < 0.05)')
s.step('mt-vhist', W.VIRCO_HIST)
s.short('mt-q-fwer', '0.91')
s.short('mt-q-exp', '2.35')
s.choose('mt-q-uniform', right=False)
s.choose('mt-q-uniform')
s.choose('mt-q-shape')

# ---- 2. Corrections ----
s.chapter('correct')
s.run('p_bh <- p.adjust(p_virco, method = "BH")')
s.step('co-bh', 'sum(p_bh < 0.05)')
s.not_yet('co-bonf', 'that was BH')
s.run('p_bonf <- p.adjust(p_virco, method = "bonferroni")')
s.step('co-bonf', 'names(p_virco)[p_bonf < 0.05]')
s.step('co-table', W.VIRCO_RESULTS)
s.run(W.PV)
s.not_yet('co-pvb', 'not adjusted yet')
s.step('co-pvb', 'p.adjust(pv, method = "bonferroni")')
s.step('co-pvbh', 'p.adjust(pv, method = "BH")')
s.step('co-hand', 'pv <= (1:10) / 10 * 0.05')
s.short('co-q-thr', '0.00106')
s.short('co-q-bonf10', '3')
s.short('co-q-bh10', '6', expect=False)
s.short('co-q-bh10', '5')
s.choose('co-q-fdr')
s.choose('co-q-more')
s.write('co-q-two', 'FWER: the chance of any false positive (Bonferroni). FDR: the expected proportion of false discoveries (BH).')
s.step('co-plot', W.RAW_BH)

# ---- 3. Genome-wide ----
s.chapter('genome')
s.run('expr <- read_csv("all_expression.csv")', settle=1)
s.step('gw-read', 'leuk <- read_csv("leukaemia.csv")', timeout=30)
for line in ('mat <- as.matrix(expr[, -(1:2)])', 'rownames(mat) <- expr$probe', W.TWO_CODE, 'identical(colnames(mat), two$sample)'):
    s.run(line)
s.step('gw-mat', 'groups <- two$mol.biol')
t0 = time.time()
s.step('gw-tests', W.EXPR_P, timeout=120)
print(f'12,625 t-tests took {time.time() - t0:.0f} s')
s.run(W.LOGFC)
s.step('gw-results', W.EXPR_RESULTS)
s.run('sum(expr_results$bonferroni < 0.05)')
s.not_yet('gw-count', 'that was Bonferroni')
s.step('gw-count', 'sum(expr_results$bh < 0.05)')
s.step('gw-hist', W.EXPR_HIST)
s.step('gw-volcano', W.VOLCANO)
s.short('gw-q-exp', '631')
s.short('gw-q-bh', '162')
s.short('gw-q-false', '8')
s.choose('gw-q-abl1')
s.choose('gw-q-5e8')
s.choose('gw-q-winner')

# ---- 4. Population structure ----
s.chapter('structure')
s.step('ps-read', 'hgdp <- read_csv("hgdp_akt1.csv")', timeout=30)
s.step('ps-freq', W.FREQS)
s.step('ps-plot', W.FREQ_PLOT)
s.step('ps-sim', W.SIM, timeout=30)
s.not_yet('ps-naive', 'nothing is tested yet')
s.not_yet('ps-adj', 'nothing is tested yet (the allele frequencies f2 are not p-values)')
s.step('ps-pca', 'pca <- prcomp(sim_geno, scale. = TRUE)', timeout=30)
s.run(W.PCS)
s.step('ps-pcplot', W.PC_PLOT)
t0 = time.time()
s.step('ps-naive', W.P_NAIVE, timeout=60)
s.not_yet('ps-adj', 'only the unadjusted p-values so far')
s.step('ps-adj', W.P_PC1, timeout=60)
print(f'the two scans of 500 SNPs took {time.time() - t0:.0f} s')
out = s.run('sum(p_naive < 0.05)')
check('148' in out, f'148 SNPs have p < 0.05 without adjustment ({out.strip()!r})')
out = s.run('sum(p_pc1 < 0.05)')
check('25' in out, f'25 SNPs have p < 0.05 adjusted for PC1 ({out.strip()!r})')
s.step('ps-qq', W.QQ_SIM)
s.not_yet('g5-qq', 'that was the QQ plot of the simulation')
s.short('ps-q-freq', '0.30')
s.short('ps-q-naive', '148')
s.choose('ps-q-ten')
s.choose('ps-q-pc1')
s.choose('ps-q-scale')
s.step('ps-lambda', W.LAMBDA)
s.step('ps-hwe', W.HWE_AREAS)

# ---- 5. Linkage disequilibrium ----
s.chapter('ld')
s.run(W.HGDP_D)
s.step('ld-hgdp', 'cor(hgdp_d, use = "pairwise.complete.obs")^2')
s.run('fms <- read_csv("famuss.csv")', settle=1)
s.step('ld-table', 'table(fms$akt1_g15129a, fms$akt1_g14803t)')
s.step('ld-r2', W.AKT1)
s.step('ld-heat', W.LD_HEAT)
s.short('ld-q-r2', '0.89')
s.choose('ld-q-tag')
s.choose('ld-q-bonf')

# ---- 6. A mini-GWAS ----
s.chapter('gwas')
s.run('cauc <- filter(fms, Race == "Caucasian")')
s.run('snps <- names(fms)[-(1:13)]')
s.step('g5-qc', W.QC, timeout=30)
s.step('g5-pass', W.PASSED)
s.run(W.ASSOC)
s.run('assoc("vdr_taq1")')
s.not_yet('g5-assoc', 'that was another SNP')
s.step('g5-assoc', 'assoc("actn3_r577x")')
s.run(W.SCAN, settle=1)
s.not_yet('g5-scan', 'the p-values are not adjusted yet')
s.step('g5-scan', W.ADJUST)
s.step('g5-qq', W.QQ_GWAS)
s.step('g5-man', W.MANHATTAN)
s.step('g5-cauc', W.CAUC_SCAN, timeout=30)
s.short('g5-q-pass', '163')
s.short('g5-q-n05', '12')
s.short('g5-q-top', 'actn3_r577x', expect=False)
s.short('g5-q-top', 'acdc_rs1501299')
s.choose('g5-q-actn3')
s.choose('g5-q-qq')
s.choose('g5-q-manh')

# ---- 7. Your report ----
s.chapter('report')
s.create_file('week5.qmd')
s.step('rp5-create')
check(s.doc_text().strip() == W.TEMPLATE.strip(), 'the report starts as it is shown in the instructions')
t0 = time.time()
ev = s.knit()
print(f'the report rendered in {time.time() - t0:.0f} s')
check(ev and ev.get('ok'), f'the report renders ({ev})')
s.step('rp5-render', timeout=5)
html = s.read('week5.html') or ''
check('163' in html and 'acdc_rs1501299' in html and 'passed quality control' in html, 'the rendered report has the QC count and the table of results')
added = s.doc_text().replace('Add the QQ plot of the p-values here.', '```{r}\n#| label: qq\n' + W.QQ_GWAS + '\n```').replace(
    'Add the Manhattan-style plot here, with a line at the Bonferroni threshold.', '```{r}\n#| label: manhattan\n' + W.MANHATTAN + '\n```')
s.doc_set(added)
s.step('rp5-qq', timeout=5)
s.step('rp5-man', timeout=5)
s.not_yet('rp5-render2', 'not rendered again yet')
ev = s.knit()
check(ev and ev.get('ok'), f'the report renders again ({ev})')
s.step('rp5-render2', timeout=5)

# ---- the end ----
left = s.left()
check(not left, f'nothing is left to do ({left})')
s.wait_modal('Practical complete')
s.chapter('wrapup')
check('Practical complete' in s.last_modal, 'a message said that the practical is complete')
time.sleep(1)
panel = p.js('() => document.querySelector("[data-cert-panel]").textContent')
check('Well done' in panel, 'the last chapter says the practical is finished: ' + panel[:100])
st = p.js('() => MG.cert.status("week5")')
check(st and st['complete'], f'the practical is complete ({st})')
# the homework's checks
s.doc_set(s.doc_text() + '''
## Quality control in detail

```{r}
#| label: qc-detail
sum(qc$call_rate < 0.3)
sum(qc$maf < 0.05)
```

## The SNPs that pass each correction

```{r}
#| label: hits
filter(gwas, bonferroni < 0.05)
filter(gwas, bh < 0.05)
```

Bonferroni controls the family-wise error rate; Benjamini-Hochberg controls the false discovery rate.

## Critique

No SNP survived, and the result would need replication in an independent sample.

```{r}
#| label: caucasian
gwas_cauc <- bind_rows(lapply(passed$snp, assoc, data = cauc)) %>% arrange(p)
head(gwas_cauc)
```
''')
for t in ('hw5-qc', 'hw5-hits', 'hw5-fdr', 'hw5-critique', 'hw5-anc'):
    s.step(t, timeout=5)
s.not_yet('hw5-render', 'the critique is not rendered yet')
ev = s.knit()
check(ev and ev.get('ok'), f'the report with the homework renders ({ev})')
s.step('hw5-render', timeout=5)
s.write('hw5-q-strat', 'Lifted from the start; adjust for principal components.')
errs = [e for e in p.errors if "'serviceWorker' property" not in e]
check(not errs, f'no errors in the page ({errs[:3]})')
s.close()
print('failed:', check.failed)
sys.exit(1 if check.failed else 0)
