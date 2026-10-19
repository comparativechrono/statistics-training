"""Week 4 of Biostatistics for Genomic Medicine: regression, the framework behind the tests.

Correlation; simple linear regression and least squares; genotypes as predictors (additive, genotypic, dominant and
recessive codings); multiple regression, confounding and interactions (ACTN3 R577X and sex); checking a model with
its residuals; logistic regression and odds ratios; and how the tests of week 3 are linear models. Follows the week 4
session plan (blocks 4A, 4B and 4C) and the formative homework 4."""
from lib import *
import figs

NAME = 'week4'
PRELUDE = '''suppressMessages(library(tidyverse))
setwd("~/data")'''

# ---- checks made by R (see lib.rtask) ----
LOADED = '"package:tidyverse" %in% search()'
IN_DATA = 'basename(getwd()) == "data"'
RECODED = has_obj('is.data.frame(o) && nrow(o) == 1397 && all(c("actn3", "esr1", "obese") %in% names(o)) && is.numeric(o$actn3) && '
                  'isTRUE(sum(o$actn3, na.rm = TRUE) == 720) && isTRUE(sum(o$esr1, na.rm = TRUE) == 610) && is.logical(o$obese)')
HLINE = 'any(vapply(v$layers, function(l) inherits(l$geom, "GeomHline"), logical(1)))'


def coef_is(name, value, tol=1e-4, alone=False):
    """the last command gave a model (lm or glm, or its summary) with the coefficient name equal to value (alone: and
    no other predictor)"""
    a = ' && length(m) == 2' if alone else ''
    return lastv(f'(function(m) !is.null(m){a} && {rq(name)} %in% names(m) && isTRUE(abs(m[[{rq(name)}]] - ({value})) < {tol}))'
                 f'(if (inherits(v, "lm")) coef(v) else if (inherits(v, "summary.lm") || inherits(v, "summary.glm")) v$coefficients[, 1] else NULL)')


def slope_is(value, tol=1e-3):
    """the last command gave a model with one predictor whose coefficient is value (whatever the predictor is called)"""
    return lastv(f'(function(m) !is.null(m) && length(m) == 2 && isTRUE(abs(m[[2]] - ({value})) < {tol}))'
                 f'(if (inherits(v, "lm")) coef(v) else if (inherits(v, "summary.lm") || inherits(v, "summary.glm")) v$coefficients[, 1] else NULL)')


# ---- what the short questions accept ----
ACC_R = r'^0?\.53[0-9]*$'
ACC_SLOPE = r'^5\.04[0-9]*$||^5\.03[5-9][0-9]*$||^5\.0$'
ACC_R2 = r'^0?\.28[0-9]*$||^0?\.29$||^28(\.5)? ?%$||^29 ?%$'
ACC_BMIAGE = r'^0?\.177[0-9]*$||^0?\.18$'
ACC_PRED = r'^171(\.[0-9]+)?( ?(pounds|lb|lbs))?$'
ACC_ADD = r'^4\.91[0-9]*$||^4\.90[5-9][0-9]*$||^4\.9$'
ACC_ADJ = r'^[-−]0?\.98[0-9]*$'
ACC_WOMEN = r'^7\.68[0-9]*$||^7\.7$'
ACC_OR = r'^1\.80?[0-9]*$||^1\.79[5-9][0-9]*$'
ACC_ESR1 = r'^1\.27[0-9]*$||^1\.266[0-9]*$'

RECODE = '''fms <- fms %>%
  mutate(actn3 = case_when(actn3_r577x == "CC" ~ 0,
                           actn3_r577x == "CT" ~ 1,
                           actn3_r577x == "TT" ~ 2),
         esr1 = case_when(esr1_rs1042717 == "GG" ~ 0,
                          esr1_rs1042717 == "GA" ~ 1,
                          esr1_rs1042717 == "AA" ~ 2),
         obese = pre.BMI > 25)'''
SCATTER = '''ggplot(fms, aes(x = Pre.height, y = Pre.weight)) +
  geom_point(alpha = 0.4)'''
FIT = 'fit <- lm(Pre.weight ~ Pre.height, data = fms)'
SMOOTH = '''ggplot(fms, aes(x = Pre.height, y = Pre.weight)) +
  geom_point(alpha = 0.4) +
  geom_smooth(method = "lm")'''
ACTN3_PLOT = '''fms %>%
  drop_na(actn3, NDRM.CH) %>%
  ggplot(aes(x = actn3, y = NDRM.CH)) +
  geom_jitter(width = 0.15, alpha = 0.3) +
  geom_smooth(method = "lm")'''
INTER_PLOT = '''fms %>%
  drop_na(actn3, NDRM.CH, Gender) %>%
  ggplot(aes(x = actn3, y = NDRM.CH, colour = Gender)) +
  geom_jitter(width = 0.15, alpha = 0.3) +
  geom_smooth(method = "lm")'''
DIAG = '''diag <- tibble(fitted = fitted(fit), residual = residuals(fit))
ggplot(diag, aes(x = fitted, y = residual)) +
  geom_point(alpha = 0.4) +
  geom_hline(yintercept = 0)'''
DIAG_QQ = '''ggplot(diag, aes(sample = residual)) +
  stat_qq() +
  stat_qq_line()'''
TWO_CODE = 'two <- leuk %>% filter(mol.biol %in% c("BCR/ABL", "NEG"))'

TEMPLATE = '''---
title: "Week 4: regression"
author: "Your name"
format: html
---

```{r}
#| label: setup
#| message: false
library(tidyverse)
fms <- read_csv("data/famuss.csv", show_col_types = FALSE) %>%
  mutate(actn3 = case_when(actn3_r577x == "CC" ~ 0,
                           actn3_r577x == "CT" ~ 1,
                           actn3_r577x == "TT" ~ 2),
         esr1 = case_when(esr1_rs1042717 == "GG" ~ 0,
                          esr1_rs1042717 == "GA" ~ 1,
                          esr1_rs1042717 == "AA" ~ 2),
         obese = pre.BMI > 25)
```

## ACTN3 R577X and the gain in strength

```{r}
#| label: actn3
fit <- lm(NDRM.CH ~ actn3 + Gender + Age, data = fms)
summary(fit)
confint(fit)
```

Each extra copy of the 577X allele was associated with a gain in strength
`r round(coef(fit)["actn3"], 1)` percentage points larger, allowing for sex
and age.

## Does the effect differ between women and men?

Add the model with an interaction between `actn3` and `Gender` here.

## ESR1 and being overweight

Add the logistic regression of `obese` on `esr1`, `Gender` and `Age` here,
with its odds ratios.
'''


def codings():
    rows = [
        ('<b>Additive</b> (or allelic)', '0, 1, 2 copies of the allele', '1', 'each copy adds the same amount: the usual choice, and the one GWAS use'),
        ('<b>Genotypic</b>', 'the genotype as a category (CC, CT, TT)', '2', 'any pattern of effects, at the cost of an extra parameter'),
        ('<b>Dominant</b>', '1 if any copy (CT or TT), 0 if none (CC)', '1', 'one copy has the full effect'),
        ('<b>Recessive</b>', '1 if two copies (TT), 0 otherwise', '1', 'only two copies have an effect'),
    ]
    return table(['Coding', 'The predictor', 'Degrees of freedom', 'Assumes'], rows)


def lm_family():
    rows = [
        ('Two-sample t-test (equal variances)', '<code>lm(y ~ group)</code>, with two groups', 'the coefficient of the group = the difference in means'),
        ('One-way ANOVA', '<code>lm(y ~ group)</code>, with three or more groups', '<code>anova()</code> of the model gives the same F test'),
        ('Correlation', '<code>lm(y ~ x)</code>', 'the slope is 0 exactly when the correlation is 0, and R² = r²'),
        ('Chi-square test of a 2 × 2 table', '<code>glm(outcome ~ group, family = binomial)</code>', 'the exponentiated coefficient is the odds ratio of the table'),
        ('Adjusting for other variables', 'add them to the model: <code>lm(y ~ x + age + sex)</code>', 'not possible with the simple tests at all'),
    ]
    return table(['The test of week 3', 'As a model', 'The connection'], rows)


# ---------------------------------------------------------------------------------------------------------------------
def ch_start():
    body = f'''
<h2 id="st4-why">From tests to models</h2>
<p>A test tells you whether there is evidence of an effect. A <b>model</b> tells you how big the effect is, and lets you ask about one thing while allowing for others. This week you meet the regression models that do most of the work in medical research and in genetics: linear regression for continuous outcomes, and logistic regression for yes-or-no outcomes. At the end you will see that the tests of last week are special cases of these models.</p>
<p>You will use the FAMuSS data again, and the leukaemia data at the very end. Read both, as in the last two weeks. Then turn the genotypes into numbers: for each person, the number of copies of an allele they carry. <code>case_when()</code> gives each condition the value after its <code>~</code>, and gives <code>NA</code> to everything else, including missing genotypes. <code>obese</code> is TRUE for a BMI over 25 (strictly, overweight or obese).</p>
{setup('fms <- read_csv("famuss.csv", show_col_types = FALSE)')}{setup('leuk <- read_csv("leukaemia.csv", show_col_types = FALSE)')}
{block('fms <- read_csv("famuss.csv")' + chr(10) + 'leuk <- read_csv("leukaemia.csv")')}
{rc(RECODE, 'count(fms, actn3_r577x, actn3)')}
<p>Always check a recoding like this, by counting the old values against the new ones.</p>
{activity("Get ready", [
    task("st4-install", f'Install the tidyverse on this page: {rscode('install.packages("tidyverse")')}', check="installed:tidyverse", auto="rstudio:installed"),
    rtask("st4-library", f'Load it with {rscode("library(tidyverse)")}.', LOADED),
    rtask("st4-wd", f'Set the working directory to your data folder: {rscode('setwd("~/data")')}', IN_DATA),
    rtask("st4-read", f'Read {c("famuss.csv")} into {c("fms")} and {c("leukaemia.csv")} into {c("leuk")}.', has_table(1397, ['id', 'NDRM.CH']) + ' && ' + has_table(89, ['mol.biol', 'ABL1'])),
    rtask("st4-recode", f'Add the columns {c("actn3")}, {c("esr1")} and {c("obese")} to {c("fms")}, as above.', RECODED),
    rtask("st4-check", 'Check the coding of ACTN3 by counting the old values against the new ones.', tib(4, ['actn3_r577x', 'actn3', 'n'])),
])}
{mcq("st4-q-esr1", "In the coding above, what does <code>esr1</code> count?", [
    ("The number of copies of the A allele of esr1_rs1042717", True, "GG has none, GA has one and AA has two. Which allele you count is a choice: say which it is when you report a result."),
    ("The number of copies of the G allele", False, "GG is coded 0, so the coding counts the other allele, A."),
    ("Whether the person was genotyped", False, "People who weren’t genotyped get NA."),
])}
'''
    return chapter("start", "0", "Start here", "rstudio", "Week 4: regression", 10,
                   "Regression measures how an outcome changes with one or more predictors. It is the most widely used method in medical statistics, and the basis of genetic association studies.", body)


# ---------------------------------------------------------------------------------------------------------------------
def ch_correlation():
    body = f'''
<p>Taller people tend to be heavier. A scatter plot shows the relationship:</p>
{block(SCATTER)}
<p>The <b>correlation coefficient</b>, <i>r</i> (Pearson’s correlation), measures how closely two variables follow a straight line. It goes from −1 (a perfect straight line going down) through 0 (no straight-line relationship) to +1 (a perfect straight line going up):</p>
{formula('<i>r</i> = Σ (<i>x</i><sub><i>i</i></sub> − <i>x̄</i>)(<i>y</i><sub><i>i</i></sub> − <i>ȳ</i>) / √[ Σ (<i>x</i><sub><i>i</i></sub> − <i>x̄</i>)² × Σ (<i>y</i><sub><i>i</i></sub> − <i>ȳ</i>)² ]', 'positive when values above the mean of x tend to go with values above the mean of y')}
{figure(figs.correlations(), 'Correlations of different strengths. The last panel shows a strong relationship that isn’t a straight line: its correlation is about 0.')}
<p><code>cor()</code> calculates <i>r</i> (<code>use = "complete.obs"</code> leaves out the people missing either value), and <code>cor.test()</code> tests whether it differs from 0 and gives a confidence interval:</p>
{rc('cor(fms$Pre.height, fms$Pre.weight, use = "complete.obs")', 'cor.test(fms$Pre.height, fms$Pre.weight)')}
<p><i>r</i>² (here 0.53² = 0.29) is the proportion of the variation in one variable that goes with variation in the other: 29% of the variation in weight goes with height.</p>
<p><b>Spearman’s correlation</b> is the correlation of the ranks. It measures any relationship that goes consistently up or down, whether or not it is a straight line, and it isn’t thrown by outliers. It warns that it can’t compute an exact p-value with ties (people with the same values), so it uses an approximation, which is fine with this many people:</p>
{rc('cor.test(fms$pre.BMI, fms$NDRM.CH, method = "spearman")')}
{callout("concept", "Correlation is not causation", "<p>People with a higher BMI gained less strength, in percentage terms (Spearman’s ρ = −0.21). That doesn’t mean that a higher BMI <i>causes</i> smaller gains. Something else could cause both: men have a higher BMI on average and gained less, in percentage terms, than women. A variable like this is a <b>confounder</b>, and you will meet it again in chapter 3. Correlation also only measures one kind of relationship: always plot the data.</p>")}
{activity("Correlations", [
    rtask("co-scatter", 'Draw the scatter plot of weight against height, as above.', gg("GeomPoint", maps={'x': 'Pre.height', 'y': 'Pre.weight'})),
    rtask("co-r", 'Calculate the correlation between height and weight.', lastv(near(0.5339761, 1e-5))),
    rtask("co-bmiage", f'Test the correlation between {c("pre.BMI")} and {c("Age")}.', htest("Pearson", 'abs(v$estimate - 0.2145853) < 1e-4')),
    rtask("co-spear", f'Calculate Spearman’s correlation between {c("pre.BMI")} and {c("NDRM.CH")}, as above.', htest("Spearman", 'abs(v$estimate - (-0.207464)) < 1e-4')),
])}
{q("co-q-r", "What is the correlation between height and weight, to two decimal places?", "0.53 (95% CI 0.49 to 0.58): a moderately strong positive correlation.", accept=ACC_R, placeholder="A number")}
{mcq("co-q-r2", "The correlation between BMI and age is 0.21. What does that mean?", [
    ("Older participants tended to have a higher BMI, but age goes with only about 4.6% (0.21²) of the variation in BMI", True, "The correlation is clearly positive (p = 4 × 10<sup>−12</sup>) but weak: most of the variation in BMI has nothing to do with age."),
    ("BMI rises by 0.21 for each year of age", False, "That would be a slope. A correlation has no units. (The slope is 0.18 a year: chapter 2.)"),
    ("21% of the participants are older than average", False, "A correlation describes the relationship between two variables, not a proportion of people."),
])}
{mcq("co-q-curve", "Two variables have a correlation of 0.02. What can you conclude?", [
    ("That there is no straight-line relationship between them; there could still be a strong curved one", True, "Pearson’s correlation only measures straight-line relationships, which is why you should always plot the data."),
    ("That the two variables are independent", False, "A U-shaped relationship can have a correlation of about 0, as in the last panel of the figure."),
    ("That one doesn’t cause the other", False, "Correlation, or its absence, can’t settle questions of cause."),
])}
'''
    return chapter("correlation", "1", "Correlation", "rstudio", "Correlation", 25,
                   "The correlation coefficient measures how closely two continuous variables follow a straight line. It is a good start, but it can’t tell you how much one changes with the other.", body)


# ---------------------------------------------------------------------------------------------------------------------
def ch_linear():
    body = f'''
<h2 id="lr-model">The model</h2>
<p>Simple linear regression describes the average of an outcome, <i>y</i>, as a straight line in a predictor, <i>x</i>:</p>
{formula('<i>y</i> = β<sub>0</sub> + β<sub>1</sub><i>x</i> + ε', 'β0, the intercept, is the average of y when x = 0; β1, the slope, is how much the average of y changes when x goes up by 1; ε is the scatter of each person around the line')}
<p>The line is fitted by <b>least squares</b>: of all the straight lines, it is the one that makes the sum of the squared <b>residuals</b> (the vertical distances from the points to the line) as small as possible.</p>
{figure(figs.least_squares(), 'Least squares: the fitted line (red) makes the sum of the squared residuals (amber) as small as possible.')}

<h2 id="lr-lm">Fitting a line with lm()</h2>
<p><code>lm()</code> (“linear model”) takes a formula, <code>outcome ~ predictor</code>, and the data:</p>
{rc(FIT, 'fit')}
<p>So the average weight goes up by 5.04 pounds for each inch of height. The intercept, −181 pounds, is the average weight at a height of 0 inches: a meaningless extrapolation, far outside the data, but the line needs it. <code>summary()</code> tells you much more:</p>
{rc('summary(fit)')}
<ul>
<li>The <b>Coefficients</b> table gives each estimate with its <b>standard error</b>, and a <b>t-test</b> of whether it is 0. For the slope, t = 20.3 and p &lt; 2 × 10<sup>−16</sup>: weight certainly changes with height.</li>
<li>The <b>residual standard error</b>, 29.15 pounds, is the typical distance of a person from the line.</li>
<li><b>R²</b> (Multiple R-squared), 0.285, is the proportion of the variation in weight that the model explains. With one predictor it is <i>r</i>²: 0.534² = 0.285.</li>
<li>R tells you that it left out the 365 people who were missing either value.</li>
</ul>
<p><code>confint()</code> gives confidence intervals for the coefficients, and <code>predict()</code> the average outcome for new values of the predictor:</p>
{rc('confint(fit)', 'predict(fit, newdata = tibble(Pre.height = 70))')}
<p>A participant 70 inches tall (1.78 m) would weigh 171 pounds (78 kg), on average. ggplot2 can draw the line, with a 95% confidence band for it, with <code>geom_smooth(method = "lm")</code>:</p>
{block(SMOOTH)}
{activity("Fit a line", [
    rtask("lr-fit", 'Fit the regression of weight on height, as above.', coef_is('Pre.height', 5.039272)),
    rtask("lr-sum", 'Look at its summary().', lastv('inherits(v, "summary.lm") && abs(v$coefficients[2, 1] - 5.039272) < 1e-4')),
    rtask("lr-ci", 'Calculate the confidence intervals of its coefficients.', lastv('is.matrix(v) && all(dim(v) == c(2, 2)) && abs(v[2, 1] - 4.551407) < 1e-4')),
    rtask("lr-pred", 'Predict the average weight of a participant 70 inches tall.', lastv(near(171.3725, 0.01))),
    rtask("lr-smooth", 'Draw the scatter plot with the fitted line.', gg("GeomSmooth", maps={'x': 'Pre.height', 'y': 'Pre.weight'})),
    rtask("lr-bmi", f'Now fit the regression of {c("pre.BMI")} on {c("Age")}, and look at its summary.', coef_is('Age', 0.1771595)),
])}
{q("lr-q-slope", "By how many pounds does the average weight go up for each inch of height, to two decimal places?", "5.04 pounds (95% CI 4.55 to 5.53).", accept=ACC_SLOPE, placeholder="A number")}
{q("lr-q-r2", "What proportion of the variation in weight does height explain?", "0.285, or 28.5% (R², the Multiple R-squared). Most of the variation in weight has nothing to do with height.", accept=ACC_R2, placeholder="A proportion")}
{q("lr-q-pred", "What is the predicted average weight, in pounds, of a participant 70 inches tall?", "171 pounds (171.4), from <code>predict(fit, newdata = tibble(Pre.height = 70))</code>, which is −181.38 + 5.04 × 70.", accept=ACC_PRED, placeholder="A number")}
{q("lr-q-bmi", "How much does the average BMI go up per year of age, to two decimal places?", "0.18 (0.177) per year, with p = 4 × 10<sup>−12</sup>. But R² is only 0.046: age explains less than 5% of the variation in BMI. An effect can be clear and still small.", accept=ACC_BMIAGE, placeholder="A number")}
{mcq("lr-q-int", "The intercept of the regression of weight on height is −181 pounds. What does it mean?", [
    ("It is the line’s value at a height of 0, far outside the data, so on its own it means nothing", True, "To make the intercept meaningful, you can centre the predictor: with lm(Pre.weight ~ I(Pre.height - 66)), the intercept is the average weight at 66 inches."),
    ("The model is wrong, because weights can’t be negative", False, "The model is only meant to describe heights near those in the data, between about 58 and 80 inches."),
    ("Short people weigh less than nothing", False, "No one in the data is anywhere near 0 inches tall."),
])}
'''
    return chapter("linear", "2", "Linear regression", "rstudio", "Simple linear regression", 40,
                   "A regression line tells you how much an outcome changes, on average, for each unit of a predictor, and how sure you can be about it.", body)


# ---------------------------------------------------------------------------------------------------------------------
def ch_genotypes():
    body = f'''
<h2 id="gp-add">The additive model</h2>
<p>A genetic association study asks whether an outcome changes with genotype. Coding the genotype as the number of copies of an allele (0, 1 or 2) makes it a numeric predictor, and the slope is the change in the outcome for each copy. This is the <b>additive</b> model:</p>
{rc('summary(lm(NDRM.CH ~ actn3, data = fms))')}
<p>Each copy of the 577X allele (T) goes with a gain in strength 4.9 percentage points larger (95% CI 1.4 to 8.4; p = 0.006). The effect is small: R² is 0.012, so the genotype explains about 1% of the variation in gains. That is typical of the common variants that affect complex traits.</p>
{block(ACTN3_PLOT)}

<h2 id="gp-codings">Other ways of coding a genotype</h2>
<p>If you give <code>lm()</code> the genotype as text, it treats it as a category: it chooses the first genotype alphabetically (CC) as the <b>reference</b>, and estimates the difference of each other genotype from it. This <b>genotypic</b> model doesn’t assume that each copy has the same effect:</p>
{rc('lm(NDRM.CH ~ actn3_r577x, data = fms)', 'anova(lm(NDRM.CH ~ actn3_r577x, data = fms))')}
<p>CT is 4.8 points above CC, and TT 9.8 points above it: close to the 0, 4.9, 9.8 that the additive model assumes. Its <code>anova()</code> table is exactly last week’s ANOVA (F = 3.75, p = 0.024). There are other codings too:</p>
{codings()}
<p>The additive model is the usual first choice, and the one genome-wide studies use: it has a single degree of freedom, it has good power even when the true effect isn’t quite additive, and its slope is easy to report.</p>
{activity("Genotypes as predictors", [
    rtask("gp-add", 'Fit the additive model of NDRM.CH on actn3, as above, and look at its summary.', coef_is('actn3', 4.908169)),
    rtask("gp-factor", 'Fit the genotypic model, with the genotype as a category.', coef_is('actn3_r577xTT', 9.819736, 1e-3)),
    rtask("gp-anova", 'Look at its ANOVA table with anova().', lastv('inherits(v, "anova") && abs(v[["F value"]][1] - 3.7531) < 0.001')),
    rtask("gp-dom", f'Fit the dominant model: the predictor is whether a person has any copy of T. Inside the formula, {c("I(actn3 >= 1)")} makes it.', slope_is(6.721586)),
])}
{q("gp-q-slope", "In the additive model, how much larger is the gain in strength for each copy of the 577X allele, to two decimal places?", "4.91 percentage points (95% CI 1.39 to 8.42), from the slope of <code>lm(NDRM.CH ~ actn3, data = fms)</code>.", accept=ACC_ADD, placeholder="A number")}
{mcq("gp-q-tt", "In the genotypic model, the coefficient <code>actn3_r577xTT</code> is 9.8. What does it mean?", [
    ("People with genotype TT gained, on average, 9.8 percentage points more than people with CC, the reference", True, "Each coefficient of a category is its difference from the reference category."),
    ("People with genotype TT gained 9.8% in strength", False, "The intercept (48.3) is the mean for CC; TT’s mean is 48.3 + 9.8 = 58.2."),
    ("Each copy of T adds 9.8 points", False, "That would be the additive slope, which is 4.9. TT has two copies."),
])}
{mcq("gp-q-why", "Why do genome-wide association studies usually use the additive model?", [
    ("It has one degree of freedom, keeps good power across many patterns of effect, and gives one number to report per SNP", True, "A study of a million SNPs needs a test that works well whatever the true pattern is, and a simple effect size."),
    ("Because every genetic effect is additive", False, "Some effects are dominant or recessive, but the additive test still detects most of them."),
    ("Because the genotypic model can’t be fitted for SNPs", False, "It can: it is just an ANOVA with three groups."),
])}
'''
    return chapter("genotypes", "3", "Genotypes as predictors", "rstudio", "Genotypes as predictors", 30,
                   "The same regression works for genotypes, once you decide how to turn a genotype into a predictor.", body)


# ---------------------------------------------------------------------------------------------------------------------
def ch_confounding():
    body = f'''
<h2 id="cf-multi">Multiple regression</h2>
<p>A model can have several predictors:</p>
{formula('<i>y</i> = β<sub>0</sub> + β<sub>1</sub><i>x</i><sub>1</sub> + β<sub>2</sub><i>x</i><sub>2</sub> + … + ε', 'each coefficient is the change in the average of y for a change of 1 in its predictor, with the other predictors held constant')}
<p>A categorical predictor, such as <code>Gender</code>, becomes an <b>indicator</b> (or dummy) variable: R chooses a reference group (Female, which comes first alphabetically), and the coefficient <code>GenderMale</code> is the difference between men and women.</p>

<h2 id="cf-conf">Confounding</h2>
<p>A <b>confounder</b> is a variable that is associated with both the predictor you are interested in (the exposure) and the outcome, and isn’t on the causal path between them. It can create an association, or hide or distort one.</p>
{figure(figs.confounding(), 'A confounder (here, sex) affects both the exposure (BMI) and the outcome (the gain in strength), so the two are associated even if one has no effect on the other.')}
<p>In chapter 1 you saw that people with a higher BMI gained less strength. But men have a higher BMI (25.0 on average, against 23.9 for women) and gained less, in percentage terms. How much of the BMI association is really an association with sex? Compare the BMI coefficient before and after adding sex to the model:</p>
{rc('lm(NDRM.CH ~ pre.BMI, data = fms)', 'lm(NDRM.CH ~ pre.BMI + Gender, data = fms)')}
<p>Allowing for sex, the BMI coefficient shrinks from −1.22 to −0.98 per unit of BMI: about a fifth of the crude association was due to sex. The rest remains, and could itself be confounded by things that weren’t measured. Adjusting can only allow for the confounders you have measured, and measured well.</p>
<p>In genetic studies, the usual covariates are <b>sex</b>, <b>age</b> and <b>ancestry</b> (week 5):</p>
{rc('summary(lm(NDRM.CH ~ actn3 + Gender + Age, data = fms))')}
<p>Allowing for sex and age, each copy of 577X goes with a gain 4.1 points larger (p = 0.013). Men gained 22.5 points less than women of the same genotype and age, and each extra year of age went with a gain 1.2 points smaller. R² rises to 0.18: sex and age explain far more of the variation than the genotype does.</p>
{callout("warn", "Don’t adjust for everything", "<p>Adjust for confounders, not for variables that the exposure itself affects. If a genotype affected muscle mass, which in turn affected the gain in strength, adjusting for muscle mass would remove part of the very effect you want to measure. And with many predictors and few people, the estimates become unstable: as a rough guide, have at least 10 to 20 people (or, for a yes-or-no outcome, events) for each predictor.</p>")}

<h2 id="cf-int">Interactions</h2>
<p>An <b>interaction</b> means that the effect of one predictor depends on the value of another. The original FAMuSS paper reported that the effect of ACTN3 R577X was seen in women but not in men. In a formula, <code>actn3 * Gender</code> includes both predictors and their interaction:</p>
{rc('summary(lm(NDRM.CH ~ actn3 * Gender, data = fms))')}
<p>Now <code>actn3</code> (7.7) is the effect of each copy in women, the reference group, and <code>actn3:GenderMale</code> (−6.9) is how much smaller it is in men: about 7.7 − 6.9 = 0.8 points per copy. The interaction’s p-value (0.045) tests whether the effects differ.</p>
{figure(figs.interaction_lines(), 'An interaction: the mean gain rises with the number of copies of 577X in women, but hardly at all in men. Without an interaction the lines would be parallel.')}
{block(INTER_PLOT)}
<p>Be careful with interactions. A test for an interaction has much less power than the test of the main effect, and it is easy to find one by chance if you look at enough subgroups. An interaction is most convincing when it was expected beforehand, as this one was, and when it is replicated.</p>
{activity("Adjust, and look for an interaction", [
    rtask("cf-bmi", 'Fit the regression of NDRM.CH on pre.BMI.', coef_is('pre.BMI', -1.223543)),
    rtask("cf-adj", 'Now adjust it for Gender.', coef_is('pre.BMI', -0.9811961)),
    rtask("cf-actn3", 'Fit the additive model of ACTN3, adjusted for Gender and Age, and look at its summary.', coef_is('actn3', 4.098977)),
    rtask("cf-int", 'Fit the model with the interaction between actn3 and Gender.', coef_is('actn3:GenderMale', -6.889804)),
    rtask("cf-plot", 'Draw the plot of NDRM.CH against actn3, with a line for each sex, as above.', gg("GeomSmooth", maps={'x': 'actn3', 'y': 'NDRM.CH', 'colour': 'Gender'})),
    rtask("cf-women", f'Fit the additive model in women only (filter the data in the {c("data")} argument).', coef_is('actn3', 7.680619, alone=True)),
])}
{q("cf-q-adj", "What is the coefficient of pre.BMI once the model is adjusted for Gender, to two decimal places?", "−0.98 (95% CI −1.40 to −0.57): each unit of BMI goes with a gain about 1 point smaller, among people of the same sex.", accept=ACC_ADJ, placeholder="A number")}
{q("cf-q-women", "In women only, how much larger is the gain in strength for each copy of 577X, to two decimal places?", "7.68 percentage points (p = 0.002). In men it is 0.79 (p = 0.66).", accept=ACC_WOMEN, placeholder="A number")}
{mcq("cf-q-conf", "Why is sex a possible confounder of the association between BMI and the gain in strength?", [
    ("Sex is associated with BMI and with the gain in strength, and BMI doesn’t cause a person’s sex", True, "That is what a confounder is: related to both, and not on the path between them."),
    ("Because it is a categorical variable", False, "Confounders can be of any type."),
    ("Because it has a small p-value in the model", False, "Whether a variable is a confounder depends on how it relates to the exposure and the outcome, not on its p-value."),
])}
{mcq("cf-q-int", "What does the interaction term <code>actn3:GenderMale</code> = −6.9 (p = 0.045) mean?", [
    ("The effect of each copy of 577X is about 6.9 points smaller in men than in women", True, "Women: 7.7 points per copy; men: 7.7 − 6.9 = 0.8 points per copy."),
    ("Men have 6.9 points less gain than women", False, "That is closer to the main effect of sex. The interaction is about how the genotype’s effect differs."),
    ("ACTN3 has no effect", False, "It has an effect in women, and the interaction says that it differs between the sexes."),
])}
{q("cf-q-adjust", "The coefficient of actn3 fell from 4.9 to 4.1 when Gender and Age were added. Was the original estimate confounded? What else could make a coefficient change when variables are added?", "Partly: the change suggests that some of the crude association went with sex or age, for example if the genotype’s frequency differed a little between the sexes in this sample. But a coefficient can also change because adding variables that explain a lot of the outcome makes the estimate more precise, and because the people missing a covariate drop out of the model. Here the adjusted model has 602 of the original 603 people (one has no age), so the change is mostly about the adjustment. A genotype is fixed at conception, so sex and age can’t be on its causal path.")}
'''
    return chapter("confounding", "4", "Confounding", "rstudio", "Several predictors, confounding and interactions", 45,
                   "With several predictors, each coefficient is an effect allowing for the others. That is how you deal with confounding, and how you ask whether an effect differs between groups.", body)


# ---------------------------------------------------------------------------------------------------------------------
def ch_checking():
    body = f'''
<p>Linear regression makes assumptions, which you can remember as <b>LINE</b>:</p>
<ul>
<li><b>L</b>inear: the average of the outcome changes in a straight line with each predictor;</li>
<li><b>I</b>ndependent: the people (or samples) are independent of each other;</li>
<li><b>N</b>ormal: the residuals are roughly normal (this matters least, in large samples);</li>
<li><b>E</b>qual variance: the scatter around the line is about the same everywhere.</li>
</ul>
<p>Independence is the most important, and the hardest to check from the data: think about how the data were collected (repeated measurements of the same people, or relatives, aren’t independent). The others can be checked by looking at the <b>residuals</b>, the differences between the observed values and the fitted ones.</p>
{figure(figs.residual_patterns(), 'Plots of residuals against fitted values. With no pattern (left), the assumptions look reasonable. A curve means the relationship isn’t a straight line; a funnel means the variance isn’t equal.')}
<p><code>fitted()</code> and <code>residuals()</code> take them out of a model:</p>
{block(DIAG)}
{block(DIAG_QQ)}
<p>For weight and height, the residuals are a little skewed to the right (a few people are much heavier than their height predicts) and spread out a little more for taller people. With 1,032 people, the coefficients and their confidence intervals are still reliable, but a model of log(weight) would fit better. Base R draws similar plots with <code>plot(fit)</code>.</p>
{activity("Check the model", [
    rtask("ck-resid", 'Plot the residuals of the regression of weight on height against its fitted values, as above.', gg("GeomPoint", extra=HLINE)),
    rtask("ck-qq", 'Draw a QQ plot of the residuals.', gg("GeomPoint", stat="StatQq")),
])}
{mcq("ck-q-funnel", "A plot of residuals against fitted values is shaped like a funnel, narrow on the left and wide on the right. What does it suggest?", [
    ("The variance isn’t equal: the scatter grows with the fitted values, and a log transformation of the outcome often helps", True, "Unequal variance makes the standard errors, and so the p-values and confidence intervals, unreliable."),
    ("The relationship is curved", False, "A curve shows up as residuals that are above zero at the ends and below in the middle (or the other way round)."),
    ("Everything is fine", False, "With no problems, the residuals form an even band around zero."),
])}
{mcq("ck-q-indep", "A study measures a biomarker three times in each of 50 patients, and analyses the 150 measurements with lm() as if they were 150 patients. What is wrong?", [
    ("The measurements aren’t independent: measurements of the same patient are alike, so the model is overconfident", True, "Its standard errors are too small and its p-values too small. A model for repeated measurements (a mixed model) is needed, or one summary per patient."),
    ("Nothing, as long as the residuals are normal", False, "Normal residuals don’t make up for observations that aren’t independent."),
    ("lm() can’t use more than 100 observations", False, "It can use any number."),
])}
'''
    return chapter("checking", "5", "Checking a model", "rstudio", "Checking a model", 20,
                   "A model is only as good as its assumptions. Look at its residuals before you trust its p-values.", body)


# ---------------------------------------------------------------------------------------------------------------------
def ch_logistic():
    body = f'''
<h2 id="lg-why">Yes-or-no outcomes</h2>
<p>Many outcomes in medicine are binary: disease or not, response to treatment or not, case or control. A straight line is a poor model of a probability, because it goes below 0 and above 1. <b>Logistic regression</b> models the <b>log odds</b> instead, which can take any value:</p>
{formula('log( <i>p</i> / (1 − <i>p</i>) ) = β<sub>0</sub> + β<sub>1</sub><i>x</i><sub>1</sub> + β<sub>2</sub><i>x</i><sub>2</sub> + …', 'p is the probability of the outcome, and p / (1 − p) its odds; each coefficient is the change in the log odds for a change of 1 in its predictor')}
{figure(figs.logistic_curve(), 'On the scale of probabilities, the logistic model is an S-shaped curve that stays between 0 and 1.')}
<p>Because the coefficients are on the log scale, <b>exponentiating</b> one gives an <b>odds ratio</b>: the factor by which the odds are multiplied for a change of 1 in its predictor. In R, <code>glm()</code> (a <i>generalised linear model</i>) with <code>family = binomial</code> fits a logistic regression:</p>
{rc('m1 <- glm(obese ~ Gender, data = fms, family = binomial)', 'coef(m1)', 'exp(coef(m1))')}
<p>The odds of a BMI over 25 are 1.80 times as high in men as in women: exactly the odds ratio you calculated from the table last week. (The exponentiated intercept, 0.40, is the odds for women: 173 / 432.) Unlike the table, a model can adjust for other variables. Here is the A allele of the ESR1 SNP, adjusted for sex and age:</p>
{rc('m2 <- glm(obese ~ esr1 + Gender + Age, data = fms, family = binomial)', 'summary(m2)')}
<p><code>summary()</code> shows the coefficients on the log-odds scale, with <i>z</i> tests (logistic regression uses the normal distribution, not the t distribution). To report odds ratios, exponentiate the coefficients and their confidence intervals. <code>confint()</code> calculates intervals for a glm by “profiling” the likelihood, and it says so:</p>
{rc('exp(cbind(OR = coef(m2), confint(m2)))')}
<p>Each copy of the A allele goes with 1.27 times the odds of being overweight (95% CI 1.02 to 1.58), allowing for sex and age; each year of age multiplies the odds by 1.07. Odds ratios are how case–control studies and GWAS report the effects of alleles on disease.</p>
{activity("Logistic regression", [
    rtask("lo-m1", 'Fit the logistic regression of obese on Gender.', coef_is('GenderMale', 0.5875292)),
    rtask("lo-or", 'Exponentiate its coefficients to get the odds ratio.', lastv('is.numeric(v) && any(abs(v - 1.799537) < 1e-4)')),
    rtask("lo-m2", 'Fit the model of obese on esr1, Gender and Age, and look at its summary.', coef_is('esr1', 0.2358438)),
    rtask("lo-ci", 'Calculate its odds ratios with their confidence intervals.', lastv('is.matrix(v) && ncol(v) == 3 && any(abs(v - 1.0163505) < 1e-4)')),
    rtask("lo-actn3", 'Is ACTN3 R577X associated with being overweight? Fit the model of obese on actn3, Gender and Age.', coef_is('actn3', -0.1836, 1e-3)),
])}
{q("lo-q-or", "What is the odds ratio for being overweight in men compared with women, to two decimal places?", "1.80, the same as the odds ratio of the table in week 3: a logistic regression with one categorical predictor reproduces the table’s odds ratio.", accept=ACC_OR, placeholder="A number")}
{q("lo-q-esr1", "What is the odds ratio for each copy of the A allele of esr1_rs1042717, allowing for sex and age, to two decimal places?", "1.27 (95% CI 1.02 to 1.58; p = 0.035).", accept=ACC_ESR1, placeholder="A number")}
{mcq("lo-q-age", "The odds ratio for Age is 1.07. What does it mean?", [
    ("Each extra year of age multiplies the odds of being overweight by 1.07, allowing for sex and genotype", True, "Over 10 years, that is 1.07<sup>10</sup>, about double the odds."),
    ("Each year of age adds 7% to the probability of being overweight", False, "An odds ratio multiplies the odds, not the probability."),
    ("Older people are 1.07 times as likely to be overweight", False, "That would be a risk ratio, and it would be per year. Odds ratios and risk ratios are similar only for rare outcomes."),
])}
{q("lo-q-dich", "The linear regression of pre.BMI on esr1 gives p = 0.32, but the logistic regression of obese (BMI over 25) on esr1 gives p = 0.035. How could that happen, and what would you report?", "They ask different questions: one about the mean BMI, the other about the proportion above 25, so they can disagree, especially when the evidence is weak. Turning a continuous outcome into yes or no throws away information, and choosing a cut-off after seeing the data is a form of p-hacking. Decide on the outcome and the model before the analysis, report the one you planned, and treat this weak, inconsistent evidence with caution.")}
'''
    return chapter("logistic", "6", "Logistic regression", "rstudio", "Logistic regression and odds ratios", 40,
                   "For a yes-or-no outcome, logistic regression models the log odds, and its exponentiated coefficients are odds ratios.", body)


# ---------------------------------------------------------------------------------------------------------------------
def ch_unify():
    body = f'''
<p>The tests of week 3 are linear models with particular predictors. Fit a t-test with equal variances, and then the regression of ABL1 on the subtype:</p>
{rc(TWO_CODE, 't.test(ABL1 ~ mol.biol, data = two, var.equal = TRUE)', 'summary(lm(ABL1 ~ mol.biol, data = two))')}
<p>The regression’s coefficient <code>mol.biolNEG</code> (−1.10) is the difference between the means (NEG minus BCR/ABL, the reference), and its t (−9.26, with 77 degrees of freedom) and p-value (3.7 × 10<sup>−14</sup>) are the t-test’s. And the ANOVA of week 3 is the <code>anova()</code> of a model with a categorical predictor:</p>
{rc('anova(lm(HOXA9 ~ mol.biol, data = leuk))')}
{lm_family()}
<p>This matters for two reasons. You only need to understand one framework, the model, to understand all these tests. And a model can do what the simple tests can’t: allow for confounders, include several predictors, and estimate the size of each effect.</p>
{activity("Tests as models", [
    rtask("un-t", 'Do the t-test of ABL1 between the two subtypes with equal variances (Student’s t-test).', htest("Two Sample t-test", '!grepl("Welch", v$method)')),
    rtask("un-lm", 'Fit the same comparison as a linear model, and look at its summary.', coef_is('mol.biolNEG', -1.09962)),
    rtask("un-anova", 'Do the ANOVA of HOXA9 as the anova() of a linear model.', lastv('inherits(v, "anova") && abs(v[["F value"]][1] - 230.28) < 0.01')),
])}
{mcq("un-q-coef", "In <code>lm(ABL1 ~ mol.biol, data = two)</code>, what is the intercept, 9.78?", [
    ("The mean ABL1 expression of the reference group, BCR/ABL", True, "With a categorical predictor, the intercept is the mean of the reference group, and each other coefficient is a difference from it."),
    ("The mean ABL1 expression of all 79 patients", False, "That would be about 9.2."),
    ("The difference between the groups", False, "That is the coefficient mol.biolNEG."),
])}
{mcq("un-q-welch", "The t-test with equal variances gives t = 9.26, but Welch’s test (chapter 2 of last week) gave t = 9.13. Why?", [
    ("Welch’s test doesn’t assume equal variances, so it uses a slightly different standard error, and lm() assumes equal variances like Student’s test", True, "A standard linear model assumes the same variance in every group: the E of LINE."),
    ("One of them is wrong", False, "They make different assumptions. With similar variances, as here, they agree closely."),
    ("Because lm() leaves out some patients", False, "Both use all 79."),
])}
'''
    return chapter("unify", "7", "Tests are models", "rstudio", "Why the tests are linear models", 15,
                   "t-tests, ANOVA and correlation are all regression models in disguise. Seeing them that way makes statistics simpler, not harder.", body)


# ---------------------------------------------------------------------------------------------------------------------
def ch_report():
    body = f'''
<p>This week’s report is about ACTN3 R577X, the gain in strength, and an allele of ESR1 and being overweight. <b>Create this file</b> saves it as <code>week4.qmd</code>.</p>
{codefile("week4.qmd", TEMPLATE)}
<p>When you report a regression, give the coefficient (or the odds ratio), its confidence interval and its p-value, say what it is adjusted for, and say what the predictor counts: “each copy of the 577X allele”, not just “actn3”.</p>
{activity("Write and render your report", [
    task("rp4-create", 'Create <code>week4.qmd</code> with the button above, and put your name in it.', auto="file:create path~week4.qmd"),
    task("rp4-render", 'Render it.', auto="knit:done path~week4.qmd ok=true"),
    task("rp4-int", 'Add the model with the interaction between actn3 and Gender, and a sentence about what it shows.', check=r"has:week4.qmd|actn3 ?\* ?Gender|actn3:Gender|Gender ?\* ?actn3"),
    task("rp4-glm", 'Add the logistic regression of obese on esr1, Gender and Age, with its odds ratios and confidence intervals.', check=r"has:week4.qmd|glm\([\s\S]*binomial"),
    task("rp4-render2", 'Render the report again, and check that it shows the odds ratios.', check=r"has:week4.html|OR\s+2\.5 %|esr1\s+1\.26"),
])}
'''
    return chapter("report", "8", "Your report", "rstudio", "Reporting regression models", 20,
                   "Put this week’s models into a report that renders from the data, with their effects reported in words.", body)


# ---------------------------------------------------------------------------------------------------------------------
def ch_wrapup():
    body = f'''
<h2 id="w4-ideas">This week’s main ideas</h2>
<ul>
<li><b>Correlation</b> measures how closely two variables follow a straight line; it isn’t causation, and it misses curved relationships.</li>
<li><b>Linear regression</b> fits the line that minimises the squared residuals. The slope is the change in the average outcome per unit of the predictor; report it with its <b>confidence interval</b>. <b>R²</b> is the proportion of the variation explained.</li>
<li>A genotype becomes a predictor by counting alleles (the <b>additive</b> model), or as a category (the genotypic model).</li>
<li>In <b>multiple regression</b>, each coefficient allows for the other predictors. Adjusting for a <b>confounder</b> removes the part of an association that it explains; don’t adjust for variables on the causal path.</li>
<li>An <b>interaction</b> means that an effect differs between groups: here ACTN3 R577X’s effect differs between women and men.</li>
<li>Check the assumptions (<b>LINE</b>) with the residuals; independence matters most.</li>
<li><b>Logistic regression</b> models the log odds of a yes-or-no outcome; exponentiated coefficients are <b>odds ratios</b>.</li>
<li>The tests of week 3 are linear models, which can also adjust for other variables.</li>
</ul>
{homework("A regression with a confounder (formative)", f"""
<p>This homework is the <b>formative checkpoint</b> of the module: hand it in for feedback before week 5. It isn’t marked, but it is a rehearsal of the reporting that your assessment asks for. Add a new section to <code>week4.qmd</code>, render it, and send your tutor the <code>.qmd</code> and <code>.html</code> files (download them from the Files tab), together with your answers (<b>My answers</b>).</p>
{activity("Homework 4", [
    task("hw4-snp", "Choose a SNP other than ACTN3 R577X, code it additively, and fit a linear regression of NDRM.CH on it, adjusted for Gender and Age.", check=r"has:week4.qmd|lm\(NDRM\.CH ~ (?!actn3)[^)]*\+[^)]*Gender"),
    task("hw4-ci", "Report its coefficient with a confidence interval (confint()).", check=r"has:week4.qmd|confint\("),
    task("hw4-resid", "Check the model’s residuals with a plot.", check=r"has:week4.qmd|residuals\(|resid\("),
    task("hw4-words", "Write a paragraph, for a clinician, that says what you tested, what you found (with the effect size, its confidence interval and the p-value), what you adjusted for and why, and one limitation.", check=r"has:week4.qmd|confidence interval"),
    task("hw4-render", "Render the report.", check=r"has:week4.html|confint"),
])}
{q("hw4-q-limit", "What is one important limitation of a single-SNP regression like yours?", "For example: the result is one of many possible tests (other SNPs, outcomes and codings), so a small p-value could be chance (week 5); the effect is small and explains little of the variation; there may be confounding by ancestry, which you haven’t adjusted for (week 5); the SNP may only be in linkage disequilibrium with the variant that matters; many participants weren’t genotyped, and if the missing data aren’t random the estimate could be biased; and an association needs replication in an independent study.")}
""")}
'''
    return finish_chapter("wrapup", "★", "Summary and homework", "Summary and homework",
                          "What you have learnt this week, the formative homework, and how much of the practical you have done.", body)


def ALL():
    use_golden(NAME)
    return [ch_start(), ch_correlation(), ch_linear(), ch_genotypes(), ch_confounding(), ch_checking(), ch_logistic(), ch_unify(),
            ch_report(), ch_wrapup()]
