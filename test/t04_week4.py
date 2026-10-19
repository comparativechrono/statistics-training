"""A student works through week 4 from start to finish: recoding genotypes, correlation, linear regression, genotypes
as predictors, confounding and an interaction, residual plots, logistic regression and odds ratios, tests as linear
models, and a Quarto report rendered twice. Every step ticks itself with the code a student would write, some steps
must not tick for the wrong thing, and at the end the practical is finished.
Run:  python3 test/t04_week4.py"""
import sys
import time
from student import Student, check
import week4 as W

s = Student('week4.html')
p = s.p

# ---- 0. Start here ----
s.chapter('start')
t0 = time.time()
s.run('install.packages("tidyverse")')
s.step('st4-install', timeout=30)
s.step('st4-library', 'library(tidyverse)', timeout=90)
print(f'the tidyverse was installed and loaded in {time.time() - t0:.0f} s')
s.step('st4-wd', 'setwd("~/data")')
s.run('fms <- read_csv("famuss.csv")')
s.not_yet('st4-read', 'leuk is not read yet')
s.step('st4-read', 'leuk <- read_csv("leukaemia.csv")')
s.run('fms <- fms %>% mutate(actn3 = case_when(actn3_r577x == "CC" ~ 0, actn3_r577x == "CT" ~ 1, actn3_r577x == "TT" ~ 2))')
s.not_yet('st4-recode', 'esr1 and obese are missing')
s.step('st4-recode', W.RECODE)
s.step('st4-check', 'count(fms, actn3_r577x, actn3)')
s.choose('st4-q-esr1')

# ---- 1. Correlation ----
s.chapter('correlation')
s.step('co-scatter', W.SCATTER)
s.step('co-r', 'cor(fms$Pre.height, fms$Pre.weight, use = "complete.obs")')
s.step('co-bmiage', 'cor.test(fms$pre.BMI, fms$Age)')
s.step('co-spear', 'cor.test(fms$pre.BMI, fms$NDRM.CH, method = "spearman")')
s.short('co-q-r', '0.53')
s.choose('co-q-r2')
s.choose('co-q-curve')

# ---- 2. Linear regression ----
s.chapter('linear')
s.run('lm(Pre.height ~ Pre.weight, data = fms)')
s.not_yet('lr-fit', 'that is height on weight')
s.step('lr-fit', W.FIT)
s.step('lr-sum', 'summary(fit)')
s.step('lr-ci', 'confint(fit)')
s.step('lr-pred', 'predict(fit, newdata = tibble(Pre.height = 70))')
s.step('lr-smooth', W.SMOOTH)
s.step('lr-bmi', 'summary(lm(pre.BMI ~ Age, data = fms))')
s.short('lr-q-slope', '5.04')
s.short('lr-q-r2', '0.285')
s.short('lr-q-pred', '171')
s.short('lr-q-bmi', '0.18')
s.choose('lr-q-int')

# ---- 3. Genotypes as predictors ----
s.chapter('genotypes')
s.step('gp-add', 'summary(lm(NDRM.CH ~ actn3, data = fms))')
s.step('gp-factor', 'lm(NDRM.CH ~ actn3_r577x, data = fms)')
s.step('gp-anova', 'anova(lm(NDRM.CH ~ actn3_r577x, data = fms))')
s.run('lm(NDRM.CH ~ I(actn3 == 2), data = fms)')
s.not_yet('gp-dom', 'that is the recessive model')
s.step('gp-dom', 'lm(NDRM.CH ~ I(actn3 >= 1), data = fms)')
s.short('gp-q-slope', '4.91')
s.choose('gp-q-tt')
s.choose('gp-q-why')

# ---- 4. Confounding ----
s.chapter('confounding')
s.step('cf-bmi', 'lm(NDRM.CH ~ pre.BMI, data = fms)')
s.step('cf-adj', 'lm(NDRM.CH ~ pre.BMI + Gender, data = fms)')
s.step('cf-actn3', 'summary(lm(NDRM.CH ~ actn3 + Gender + Age, data = fms))')
s.step('cf-int', 'lm(NDRM.CH ~ actn3 * Gender, data = fms)')
s.step('cf-plot', W.INTER_PLOT)
s.run('lm(NDRM.CH ~ actn3, data = filter(fms, Gender == "Male"))')
s.not_yet('cf-women', 'that was men')
s.step('cf-women', 'lm(NDRM.CH ~ actn3, data = filter(fms, Gender == "Female"))')
s.short('cf-q-adj', '-0.98')
s.short('cf-q-women', '7.68')
s.choose('cf-q-conf')
s.choose('cf-q-int')
s.write('cf-q-adjust', 'Partly: sex and age explain part of it.')

# ---- 5. Checking a model ----
s.chapter('checking')
s.run('diag <- tibble(fitted = fitted(fit), residual = residuals(fit))')
s.step('ck-resid', 'ggplot(diag, aes(x = fitted, y = residual)) + geom_point(alpha = 0.4) + geom_hline(yintercept = 0)')
s.step('ck-qq', W.DIAG_QQ)
s.choose('ck-q-funnel')
s.choose('ck-q-indep')

# ---- 6. Logistic regression ----
s.chapter('logistic')
s.step('lo-m1', 'm1 <- glm(obese ~ Gender, data = fms, family = binomial)')
s.step('lo-or', 'exp(coef(m1))')
s.step('lo-m2', 'm2 <- glm(obese ~ esr1 + Gender + Age, data = fms, family = binomial)')
s.step('lo-ci', 'exp(cbind(OR = coef(m2), confint(m2)))', timeout=30)
s.step('lo-actn3', 'summary(glm(obese ~ actn3 + Gender + Age, data = fms, family = binomial))')
s.short('lo-q-or', '1.80')
s.short('lo-q-esr1', '1.27')
s.choose('lo-q-age')
s.write('lo-q-dich', 'They ask different questions; decide the outcome before the analysis.')

# ---- 7. Tests are models ----
s.chapter('unify')
s.run(W.TWO_CODE)
s.run('t.test(ABL1 ~ mol.biol, data = two)')
s.not_yet('un-t', 'that was Welch’s test')
s.step('un-t', 't.test(ABL1 ~ mol.biol, data = two, var.equal = TRUE)')
s.step('un-lm', 'summary(lm(ABL1 ~ mol.biol, data = two))')
s.step('un-anova', 'anova(lm(HOXA9 ~ mol.biol, data = leuk))')
s.choose('un-q-coef')
s.choose('un-q-welch')

# ---- 8. Your report ----
s.chapter('report')
s.create_file('week4.qmd')
s.step('rp4-create')
check(s.doc_text().strip() == W.TEMPLATE.strip(), 'the report starts as it is shown in the instructions')
ev = s.knit()
check(ev and ev.get('ok'), f'the report renders ({ev})')
s.step('rp4-render', timeout=5)
html = s.read('week4.html') or ''
check('4.1' in html and 'GenderMale' in html, 'the rendered report has the adjusted model and the inline coefficient')
added = s.doc_text().replace('Add the model with an interaction between `actn3` and `Gender` here.', '''```{r}
#| label: interaction
summary(lm(NDRM.CH ~ actn3 * Gender, data = fms))
```''').replace('''Add the logistic regression of `obese` on `esr1`, `Gender` and `Age` here,
with its odds ratios.''', '''```{r}
#| label: logistic
m2 <- glm(obese ~ esr1 + Gender + Age, data = fms, family = binomial)
exp(cbind(OR = coef(m2), confint(m2)))
```''')
s.doc_set(added)
s.step('rp4-int', timeout=5)
s.step('rp4-glm', timeout=5)
s.not_yet('rp4-render2', 'not rendered again yet')
ev = s.knit()
check(ev and ev.get('ok'), f'the report renders again ({ev})')
s.step('rp4-render2', timeout=5)

# ---- the end ----
left = s.left()
check(not left, f'nothing is left to do ({left})')
s.chapter('wrapup')
time.sleep(1)
panel = p.js('() => document.querySelector("[data-cert-panel]").textContent')
check('Well done' in panel, 'the last chapter says the practical is finished: ' + panel[:100])
# the formative homework's checks
s.doc_set(s.doc_text() + '''

## Homework: VDR

```{r}
#| label: vdr
fms <- fms %>% mutate(vdr = case_when(vdr_taq1 == "CC" ~ 2, vdr_taq1 == "CT" ~ 1, vdr_taq1 == "TT" ~ 0))
hw <- lm(NDRM.CH ~ vdr + Gender + Age, data = fms)
summary(hw)
confint(hw)
plot(fitted(hw), residuals(hw))
```

Each copy of the C allele went with a larger gain (see the confidence interval above).
''')
for t in ('hw4-snp', 'hw4-ci', 'hw4-resid', 'hw4-words'):
    s.step(t, timeout=5)
errs = [e for e in p.errors if "'serviceWorker' property" not in e]
check(not errs, f'no errors in the page ({errs[:3]})')
s.close()
print('failed:', check.failed)
sys.exit(1 if check.failed else 0)
