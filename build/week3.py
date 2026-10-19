"""Week 3 of Biostatistics for Genomic Medicine: hypothesis testing and comparing groups.

The logic of a test, built by hand as a permutation test on ABL1 expression in BCR/ABL and NEG leukaemias; t-tests,
the Wilcoxon test and paired data; ANOVA, Kruskal–Wallis and Tukey's test on HOXA9 across three subtypes; chi-square
and Fisher's exact tests and odds ratios; Hardy–Weinberg equilibrium as quality control (and what a mixture of
populations does to it); choosing the right test; and a Quarto report. Follows the week 3 session plan (blocks 3A, 3B
and 3C) and homework 3."""
from lib import *
import figs

NAME = 'week3'
PRELUDE = '''suppressMessages(library(tidyverse))
setwd("~/data")'''

# ---- checks made by R (see lib.rtask) ----
LOADED = '"package:tidyverse" %in% search()'
IN_DATA = 'basename(getwd()) == "data"'
LEUK_COLS = ['sample', 'sex', 'age', 'mol.biol', 'remission', 'ABL1', 'HOXA9', 'MEIS1', 'CD52', 'RAG1']
TWO = has_obj('is.data.frame(o) && nrow(o) == 79 && all(o$mol.biol %in% c("BCR/ABL", "NEG"))')
TWO_MEANS = lastv('is.data.frame(v) && nrow(v) == 2 && any(vapply(v, function(x) is.numeric(x) && any(abs(x - 9.780811) < 0.001), logical(1)))')
FUN = ('exists("diff_means") && is.function(diff_means) && exists("two") && '
       'isTRUE(abs(diff_means(two$ABL1, two$mol.biol) - 1.09962) < 1e-4)')
NULLD = has_vec(5000, 'sd(o) > 0.12 && sd(o) < 0.22 && abs(mean(o)) < 0.02')
VLINE = 'any(vapply(v$layers, function(l) inherits(l$geom, "GeomVline"), logical(1)))'


def aov_f(F, tol=0.5):
    """the last command gave an ANOVA (aov(), or its summary()) whose F statistic is F"""
    return lastv(f'(function(s) !is.null(s) && isTRUE(abs(s[[1]][["F value"]][1] - {F}) < {tol}))'
                 f'(if (inherits(v, "summary.aov")) v else if (inherits(v, "aov")) summary(v) else NULL)')


# ---- what the short questions accept ----
ACC_37 = r'^37$'
ACC_P0 = r'^0(\.0+)?$||^< ?0?\.0002$||^< ?1 ?/ ?5,?000$'
ACC_RAG = r'^0?\.[78][0-9]*$'
ACC_DIFF = r'^1\.10?[0-9]*$||^1\.099[5-9][0-9]*$'
ACC_GAIN = r'^8\.62[0-9]*$||^8\.6$'
ACC_FWER = r'^0?\.14[0-9]*$||^14(\.[0-9]+)? ?%$'
ACC_ACTN3 = r'^0?\.024[0-9]*$||^0?\.02$'
ACC_EXP = r'^5\.09[0-9]*$||^5\.08[5-9][0-9]*$||^5\.1$'
ACC_OR = r'^1\.80?[0-9]*$||^1\.79[5-9][0-9]*$'
ACC_HWE = r'^0?\.076[0-9]*$||^0?\.075[5-9][0-9]*$||^0?\.08$'

TWO_CODE = 'two <- leuk %>% filter(mol.biol %in% c("BCR/ABL", "NEG"))'
TWO_SUM = 'two %>% group_by(mol.biol) %>% summarise(n = n(), mean = mean(ABL1), sd = sd(ABL1))'
TWO_PLOT = '''ggplot(two, aes(x = mol.biol, y = ABL1)) +
  geom_boxplot() +
  geom_jitter(width = 0.1, alpha = 0.5)'''
DIFF_FUN = '''diff_means <- function(y, group) {
  mean(y[group == "BCR/ABL"]) - mean(y[group == "NEG"])
}'''
NULL_CODE = 'null <- replicate(5000, diff_means(two$ABL1, sample(two$mol.biol)))'
NULL_HIST = '''tibble(null = null) %>%
  ggplot(aes(x = null)) +
  geom_histogram(binwidth = 0.02) +
  geom_vline(xintercept = obs, colour = "red")'''
QQ = '''ggplot(two, aes(sample = ABL1)) +
  stat_qq() +
  stat_qq_line() +
  facet_wrap(~ mol.biol)'''
PAIRED = 't.test(fms$Post_NDRM_Max, fms$Pre_NDRM_Max, paired = TRUE)'
HOX_SUM = 'leuk %>% group_by(mol.biol) %>% summarise(n = n(), mean = mean(HOXA9), sd = sd(HOXA9))'
HOX_BOX = '''ggplot(leuk, aes(x = mol.biol, y = HOXA9)) +
  geom_boxplot()'''
HWE_FUN = '''hwe_p <- function(g) {
  g <- g[!is.na(g)]                         # the people who were genotyped
  alleles <- unique(unlist(strsplit(g, "")))  # the two letters, e.g. "C" and "T"
  n <- length(g)
  n_11 <- sum(g == paste0(alleles[1], alleles[1]))   # e.g. CC
  n_22 <- sum(g == paste0(alleles[2], alleles[2]))   # e.g. TT
  n_12 <- n - n_11 - n_22                             # the heterozygotes
  p <- (2 * n_11 + n_12) / (2 * n)                    # the frequency of the first allele
  expected <- n * c(p^2, 2 * p * (1 - p), (1 - p)^2)
  x2 <- sum((c(n_11, n_12, n_22) - expected)^2 / expected)
  pchisq(x2, df = 1, lower.tail = FALSE)
}'''

TEMPLATE = '''---
title: "Week 3: comparing groups"
author: "Your name"
format: html
---

```{r}
#| label: setup
#| message: false
library(tidyverse)
leuk <- read_csv("data/leukaemia.csv", show_col_types = FALSE)
fms <- read_csv("data/famuss.csv", show_col_types = FALSE)
two <- leuk %>% filter(mol.biol %in% c("BCR/ABL", "NEG"))
```

## ABL1 in BCR/ABL and NEG leukaemias

```{r}
#| label: abl1
t.test(ABL1 ~ mol.biol, data = two)
```

ABL1 expression was higher in the BCR/ABL group, by
`r round(mean(two$ABL1[two$mol.biol == "BCR/ABL"]) - mean(two$ABL1[two$mol.biol == "NEG"]), 2)`
(log2 units).

## HOXA9 in three subtypes

```{r}
#| label: hoxa9
summary(aov(HOXA9 ~ mol.biol, data = leuk))
```

## Remission

Add a Fisher's exact test of remission (CR or REF) in the BCR/ABL and NEG groups here.
'''


def error_types():
    rows = [
        ('<b>The null hypothesis is true</b> (no real difference)', 'a false positive: a <b>type I error</b>. Its probability is α, which you choose (usually 0.05)', 'right'),
        ('<b>The null hypothesis is false</b> (a real difference)', 'right: the probability of this is the <b>power</b> of the test', 'a false negative: a <b>type II error</b>. Its probability is β, and power = 1 − β'),
    ]
    return table(['', 'You reject the null hypothesis (p ≤ α)', 'You don’t reject it (p > α)'], rows)


def chooser():
    rows = [
        ('a continuous outcome, two independent groups', 'a two-sample t-test (Welch’s): <code>t.test(y ~ group)</code>', 'Wilcoxon rank-sum test: <code>wilcox.test(y ~ group)</code>'),
        ('a continuous outcome, measured twice on the same people', 'a paired t-test: <code>t.test(after, before, paired = TRUE)</code>', 'Wilcoxon signed-rank test: <code>wilcox.test(after, before, paired = TRUE)</code>'),
        ('a continuous outcome, three or more groups', 'one-way ANOVA: <code>aov(y ~ group)</code>, then <code>TukeyHSD()</code>', 'Kruskal–Wallis test: <code>kruskal.test(y ~ group)</code>'),
        ('two categorical variables (a table of counts)', 'chi-square test: <code>chisq.test(table)</code>', 'Fisher’s exact test, when expected counts are small: <code>fisher.test(table)</code>'),
        ('genotype counts against Hardy–Weinberg proportions', 'chi-square test with 1 degree of freedom (<code>hwe_p()</code>)', 'an exact test (for example in the HardyWeinberg package), for rare alleles'),
        ('two continuous variables', 'Pearson’s correlation: <code>cor.test(x, y)</code> (next week: regression)', 'Spearman’s correlation: <code>cor.test(x, y, method = "spearman")</code>'),
    ]
    return table(['Your data', 'The usual test', 'If its assumptions fail'], rows)


# ---------------------------------------------------------------------------------------------------------------------
def ch_start():
    body = f'''
<h2 id="st3-all">This week’s new data: acute lymphoblastic leukaemia</h2>
<p>Acute lymphoblastic leukaemia (ALL) is a cancer of the cells that would become lymphocytes. It is not one disease: different genetic changes drive it, and they matter for treatment. In about a quarter of adults, the leukaemic cells carry the <b>Philadelphia chromosome</b>, a translocation between chromosomes 9 and 22 that fuses the genes <i>BCR</i> and <i>ABL1</i>. The fusion protein, BCR-ABL1, is a tyrosine kinase that is always switched on, and it is the target of drugs such as imatinib. Another group has a translocation between chromosomes 4 and 11 that fuses <i>KMT2A</i> (also called <i>MLL</i>, or <i>ALL1</i>) to <i>AFF1</i> (<i>AF4</i>).</p>
<p>The <b>ALL study</b> (Chiaretti and others, 2004) measured the expression of about 12,600 genes, with microarrays, in leukaemic cells from adults with ALL. <code>leukaemia.csv</code> has 89 of its patients with B-cell ALL, with one row for each patient:</p>
{table(['Column', 'What it holds'], [
    ('<code>sample</code>', 'the patient’s code'),
    ('<code>sex</code>, <code>age</code>', 'F or M, and age in years'),
    ('<code>BT</code>', 'the stage of B-cell development the leukaemia resembles (B1 to B4)'),
    ('<code>mol.biol</code>', 'the molecular subtype: <code>BCR/ABL</code> (the Philadelphia chromosome), <code>ALL1/AF4</code> (the t(4;11) fusion) or <code>NEG</code> (neither)'),
    ('<code>remission</code>', 'whether the first treatment led to complete remission (<code>CR</code>) or not (<code>REF</code>, refractory); missing for some patients'),
    ('<code>ABL1</code>, <code>HOXA9</code>, <code>MEIS1</code>, <code>CD52</code>, <code>RAG1</code>', 'the expression of five genes, on a log2 scale (each unit is a doubling)'),
])}
<p>You will also use the FAMuSS data again, from <code>famuss.csv</code>.</p>
{rc('leuk <- read_csv("leukaemia.csv")', 'count(leuk, mol.biol)')}
{setup('fms <- read_csv("famuss.csv", show_col_types = FALSE)')}
{activity("Get ready", [
    task("st3-install", f'Install the tidyverse on this page: {rscode('install.packages("tidyverse")')}', check="installed:tidyverse", auto="rstudio:installed"),
    rtask("st3-library", f'Load it with {rscode("library(tidyverse)")}.', LOADED),
    rtask("st3-wd", f'Set the working directory to your data folder: {rscode('setwd("~/data")')}', IN_DATA),
    rtask("st3-leuk", f'Read {c("leukaemia.csv")} into a tibble called {c("leuk")}.', has_table(89, LEUK_COLS)),
    rtask("st3-fms", f'Read {c("famuss.csv")} into {c("fms")}, as last week.', has_table(1397, ['id', 'Gender', 'NDRM.CH', 'actn3_r577x'])),
    rtask("st3-count", 'Count the patients of each molecular subtype.', tib(3, ['mol.biol', 'n'])),
])}
{q("st3-q-bcr", "How many of the patients have the BCR/ABL fusion?", "37, from <code>count(leuk, mol.biol)</code>. There are 42 NEG patients and 10 with ALL1/AF4.", accept=ACC_37, placeholder="A number")}
{mcq("st3-q-abl", "Why might the expression of <i>ABL1</i> itself be higher in BCR/ABL leukaemias?", [
    ("The fusion gene contains most of ABL1, so the microarray’s ABL1 probes also detect the BCR-ABL1 transcript, which is made from BCR’s strong promoter", True, "The probes for ABL1 bind to the part of ABL1 that is in the fusion. You will test whether the difference is real in the next chapter."),
    ("Because imatinib increases ABL1 expression", False, "These samples were taken at diagnosis, before treatment."),
    ("It shouldn’t be: the fusion destroys ABL1", False, "The fusion keeps the kinase part of ABL1, which is why BCR-ABL1 is an active kinase."),
])}
'''
    return chapter("start", "0", "Start here", "rstudio", "Week 3: testing hypotheses and comparing groups", 15,
                   "Last week you described data. This week you ask whether a difference you can see in the data could just be chance, and you learn the tests that answer that question for different kinds of data.", body)


# ---------------------------------------------------------------------------------------------------------------------
def ch_logic():
    body = f'''
<h2 id="lg-q">The question</h2>
<p>Is <i>ABL1</i> expressed differently in BCR/ABL leukaemias and in NEG leukaemias? Start by looking:</p>
{rc(TWO_CODE, TWO_SUM)}
{block(TWO_PLOT)}
<p>The mean in the BCR/ABL group is about 1.1 higher, on a log2 scale: a little over twice as much ABL1 RNA. But the values in each group vary, and with only 37 and 42 patients you would expect the two means to differ a bit even if, in all such patients, they were the same. How can you tell a real difference from chance?</p>

<h2 id="lg-steps">The logic of a hypothesis test</h2>
<ol>
<li><b>State a null hypothesis</b>, H<sub>0</sub>: the thing you would like to disprove. Here, “the mean expression of ABL1 is the same in both subtypes.” The <b>alternative hypothesis</b>, H<sub>1</sub>, is that it isn’t.</li>
<li><b>Choose a test statistic</b>: a number that measures how far the data are from what H<sub>0</sub> says. Here, the difference between the two means.</li>
<li><b>Work out the null distribution</b>: the values the statistic would take, by chance, if H<sub>0</sub> were true.</li>
<li><b>Compare</b>. The <b>p-value</b> is the probability, if H<sub>0</sub> were true, of a statistic at least as extreme as the one you observed. A small p-value means the data would be surprising if H<sub>0</sub> were true.</li>
</ol>
{figure(figs.null_and_observed(), 'The null distribution of a test statistic. The p-value is the probability of a value at least as extreme as the one observed: the area of both tails, for a two-sided test.')}

<h2 id="lg-perm">A null distribution, by shuffling</h2>
<p>If the subtype made no difference to ABL1, the labels BCR/ABL and NEG would just be names attached at random to the 79 values. So shuffle them: give the same values random labels, and calculate the difference between the means again. Each shuffle gives one value of the statistic as it would be if H<sub>0</sub> were true. This is a <b>permutation test</b>, and it needs no formulas at all.</p>
<p>You will calculate the difference many times, so write a small <b>function</b> for it. <code>function(y, group)</code> makes a function with two arguments, and the last line inside the braces is the result it gives back:</p>
{rc(DIFF_FUN, 'obs <- diff_means(two$ABL1, two$mol.biol)', 'obs')}
<p><code>sample()</code>, given a vector, shuffles it. Two shuffles give two differences that arise by chance alone:</p>
{rc('set.seed(1)', 'diff_means(two$ABL1, sample(two$mol.biol))', 'diff_means(two$ABL1, sample(two$mol.biol))')}
<p>Now do it 5,000 times, and see how often chance alone gives a difference as large as the one you observed (in either direction, so compare the absolute values, with <code>abs()</code>):</p>
{rc('set.seed(1)', NULL_CODE, 'max(abs(null))', 'mean(abs(null) >= abs(obs))')}
<p>In 5,000 shuffles, the largest difference was 0.65, and none was as large as 1.10. So the p-value is less than 1 in 5,000 (p &lt; 0.0002): if the subtype made no difference, a difference this large would be very surprising. You can reject the null hypothesis.</p>
{block(NULL_HIST)}

<h2 id="lg-errors">Decisions and errors</h2>
<p>To turn a p-value into a decision, you choose a <b>significance level</b>, α, beforehand, usually 0.05, and reject H<sub>0</sub> when p ≤ α. Either way, you can be wrong:</p>
{error_types()}
<p>The <b>power</b> of a test is the chance of detecting a difference when there really is one. It grows with the size of the sample and the size of the difference, and it shrinks as the data become more variable. A small study can easily miss a real difference: a large p-value doesn’t show that there is no difference.</p>
{callout("concept", "What a p-value is not", "<ul><li>It is <b>not</b> the probability that the null hypothesis is true. It is calculated <i>assuming</i> that H<sub>0</sub> is true.</li><li>It is <b>not</b> a measure of how large or important a difference is. A tiny difference in a huge study can have a tiny p-value. Always report the size of the difference, with a confidence interval.</li><li>p &gt; 0.05 does <b>not</b> show that there is no difference: “absence of evidence is not evidence of absence”.</li><li>0.05 is a convention, not a law of nature: p = 0.049 and p = 0.051 are practically the same evidence.</li></ul>")}
{activity("Test ABL1, and then RAG1", [
    rtask("lg-two", f'Make {c("two")}, the 79 patients with BCR/ABL or NEG leukaemia, as above.', TWO),
    rtask("lg-means", 'Make a table of the number of patients, and the mean and SD of ABL1, in each group.', TWO_MEANS),
    rtask("lg-fun", f'Make the function {c("diff_means()")}, and use it to calculate {c("obs")}.', FUN),
    rtask("lg-null", f'Make the null distribution, {c("null")}, from 5,000 shuffles.', NULLD),
    rtask("lg-hist", 'Draw a histogram of the null distribution, with a red line at the observed difference, as above.', gg("GeomBar", stat="StatBin", extra=VLINE)),
    rtask("lg-p", 'Calculate the permutation p-value for ABL1.', lastv(near(0, 1e-12))),
    rtask("lg-rag", f'Now do the same for {c("RAG1")}, a gene that has nothing to do with the fusion: calculate its observed difference and its own null distribution of 5,000 shuffles, and then its permutation p-value.', lastv('is.numeric(v) && length(v) == 1 && v > 0.6 && v <= 1')),
])}
{q("lg-q-p", "What permutation p-value did you get for ABL1?", "0: none of the 5,000 shuffles gave a difference as large as 1.10. That doesn’t mean p is exactly 0, only that it is less than 1 in 5,000 (p &lt; 0.0002). The t-test in the next chapter gives p = 1.8 × 10<sup>−13</sup>.", accept=ACC_P0, placeholder="A number")}
{q("lg-q-rag", "What permutation p-value did you get for RAG1, to one decimal place?", "About 0.8: chance alone often gives a difference as large as RAG1’s (0.07), so the data give no evidence of a difference. (Your value may differ a little, because the shuffles are random.)", accept=ACC_RAG, placeholder="A number")}
{mcq("lg-q-meaning", "The test for ABL1 has p &lt; 0.0002. Which statement is right?", [
    ("If ABL1’s mean were the same in both subtypes, a difference this large would happen by chance less than once in 5,000 studies", True, "That is exactly what a p-value is: a probability calculated as if the null hypothesis were true."),
    ("There is less than a 0.02% chance that the null hypothesis is true", False, "A p-value is calculated assuming H0 is true, so it can’t be the probability that H0 is true."),
    ("The difference in ABL1 expression is large and important", False, "The p-value says nothing about size: look at the difference itself (1.10 on a log2 scale) and its confidence interval."),
])}
{mcq("lg-q-rag2", "RAG1’s p-value is about 0.8. What can you conclude?", [
    ("The data give no evidence that RAG1’s expression differs between the subtypes", True, "A large p-value means the data are consistent with no difference. That isn’t the same as showing there is none."),
    ("RAG1’s expression is the same in the two subtypes", False, "You can never prove a null hypothesis: a small difference might exist, too small for 79 patients to detect."),
    ("There is an 80% chance that RAG1 has no difference", False, "That is the same misreading of a p-value as before."),
])}
{mcq("lg-q-type1", "You test 20 genes, none of which really differs between the subtypes, each at α = 0.05. What do you expect?", [
    ("About one of them to have p ≤ 0.05, by chance: a false positive", True, "With α = 0.05, each true null hypothesis is rejected 5% of the time. Testing many things at once is the subject of week 5."),
    ("None of them to have p ≤ 0.05", False, "Each test has a 5% chance of a false positive, and 20 × 5% = 1."),
    ("All of them to have p > 0.95", False, "When the null hypothesis is true, the p-value is equally likely to be anywhere between 0 and 1."),
])}
'''
    return chapter("logic", "1", "The logic of a test", "rstudio", "The logic of a hypothesis test", 40,
                   "A hypothesis test asks one question: if there were really no difference, how surprising would the data be? Build the answer yourself, by shuffling labels.", body)


# ---------------------------------------------------------------------------------------------------------------------
def ch_two():
    body = f'''
<h2 id="tw-t">The t-test</h2>
<p>Shuffling works for any statistic, but for a difference between two means there is a quicker way. If the means are approximately normally distributed (which, thanks to the central limit theorem, they usually are), the difference divided by its standard error follows a known distribution, the <b>t distribution</b>:</p>
{formula('<i>t</i> = (<i>x̄</i><sub>1</sub> − <i>x̄</i><sub>2</sub>) / SE, &nbsp; where SE = √( <i>s</i><sub>1</sub>² / <i>n</i><sub>1</sub> + <i>s</i><sub>2</sub>² / <i>n</i><sub>2</sub> )', 'how many standard errors apart the two means are')}
<p>A t of 0 means the means are equal; the further t is from 0, in either direction, the stronger the evidence against H<sub>0</sub>. The t distribution looks like the normal distribution, but with heavier tails when the samples are small; its shape is set by the <b>degrees of freedom</b> (df). R’s <code>t.test()</code> does the whole calculation. With a formula, <code>ABL1 ~ mol.biol</code>, it compares ABL1 between the groups of mol.biol:</p>
{rc('t.test(ABL1 ~ mol.biol, data = two)')}
<p>Read it from the bottom. The means are 9.78 and 8.68, so the difference is 1.10. The <b>95% confidence interval</b> for the difference is 0.86 to 1.34: this is the most useful line, because it tells you how large the difference is likely to be. t = 9.13 means the means are more than 9 standard errors apart, and p = 1.8 × 10<sup>−13</sup> agrees with the permutation test. R uses <b>Welch’s</b> t-test by default, which doesn’t assume that the two groups have the same SD (hence the df of 68.8, which isn’t a whole number). <code>var.equal = TRUE</code> gives the original Student’s t-test, which does.</p>

<h2 id="tw-assume">Assumptions</h2>
<p>Every test makes assumptions, and its p-value is only right when they are (roughly) true. The t-test assumes that:</p>
<ul>
<li>the observations are <b>independent</b>: each patient is counted once, and patients don’t influence each other;</li>
<li>each group is <b>roughly normal</b>, or the groups are large enough for the central limit theorem to make the means normal. Outliers and strong skew matter most in small samples.</li>
</ul>
<p>A <b>QQ plot</b> (quantile–quantile plot) checks normality. It plots the sorted values against the values you would expect from a normal distribution: if the data are normal, the points lie close to a straight line. A curve means skew, and points that peel away at the ends mean heavy tails or outliers.</p>
{block(QQ)}

<h2 id="tw-wilcox">When the assumptions fail: the Wilcoxon test</h2>
<p>The <b>Wilcoxon rank-sum test</b> (also called the Mann–Whitney test) replaces the values with their ranks (1 for the smallest, 2 for the next, and so on) and asks whether one group’s ranks tend to be higher. It doesn’t assume normality and isn’t affected by outliers, so it suits skewed data and small samples. The price is a little less power when the data really are normal, and its result is about the ranks rather than about a difference in means.</p>
{rc('wilcox.test(ABL1 ~ mol.biol, data = two)')}

<h2 id="tw-paired">Paired data</h2>
<p>The FAMuSS participants were measured before and after the training. These measurements are <b>paired</b>: each “after” belongs with a “before” from the same person, and people who are strong before tend to be strong after. A <b>paired t-test</b> tests whether the mean of the differences is zero, which removes the variation between people and makes the test much more powerful:</p>
{rc(PAIRED)}
<p>On average, people could lift 8.6 pounds more after the training (95% CI 8.4 to 8.9). Analysing paired data as if the groups were independent throws away this advantage, and is a common mistake.</p>
{activity("Compare two groups", [
    rtask("tw-qq", 'Draw QQ plots of ABL1 in the two groups, as above. Do the points lie near the lines?', gg("GeomPoint", stat="StatQq", maps={'sample': 'ABL1'})),
    rtask("tw-t", 'Compare ABL1 between the two groups with a t-test.', htest("Welch", 'abs(abs(v$statistic) - 9.1326) < 0.01')),
    rtask("tw-w", 'Compare it with a Wilcoxon test as well.', htest("Wilcoxon")),
    rtask("tw-cd52", f'Is {c("CD52")} expressed differently in the two groups? Use a t-test.', htest("t-test", 'abs(abs(v$statistic) - 2.9394) < 0.01')),
    rtask("tw-sex", f'In the FAMuSS data, compare NDRM.CH between women and men with a t-test.', htest("t-test", 'abs(abs(v$statistic) - 11.892) < 0.01')),
    rtask("tw-paired", 'Test whether the strength of the non-dominant arm changed during the training, with a paired t-test.', htest("Paired")),
])}
{q("tw-q-diff", "How much higher is the mean expression of ABL1 in BCR/ABL leukaemias than in NEG ones, in log2 units (to two decimal places)?", "1.10 (95% CI 0.86 to 1.34). On a log2 scale, a difference of 1.10 means 2<sup>1.10</sup> = 2.1 times as much RNA.", accept=ACC_DIFF, placeholder="A number")}
{q("tw-q-gain", "By how many pounds did the strength of the non-dominant arm increase, on average (to two decimal places)?", "8.62 pounds, the mean of the differences, with a 95% confidence interval of 8.36 to 8.89.", accept=ACC_GAIN, placeholder="A number")}
{mcq("tw-q-cd52", "CD52 is the target of the antibody alemtuzumab. Its t-test gives a mean difference of 0.57 (95% CI 0.18 to 0.96) and p = 0.004. What would you report?", [
    ("CD52 expression is higher in BCR/ABL leukaemias, by about 0.6 log2 units (95% CI 0.2 to 1.0)", True, "Report the size and direction of the difference, with its uncertainty, as well as the p-value."),
    ("p = 0.004, so CD52 is important in BCR/ABL leukaemia", False, "A p-value can’t show importance. The size of the difference, and the biology, have to do that."),
    ("CD52 is higher in BCR/ABL leukaemias in every patient", False, "The groups overlap a lot: this is a difference in means."),
])}
{mcq("tw-q-welch", "What is the difference between Welch’s t-test (R’s default) and Student’s t-test?", [
    ("Welch’s doesn’t assume that the two groups have the same variance", True, "Welch’s test is the safer default. When the variances are similar, the two give almost the same answer."),
    ("Welch’s is for paired data", False, "Paired data need paired = TRUE."),
    ("Welch’s doesn’t assume normality", False, "Both assume roughly normal means. The Wilcoxon test is the one that doesn’t."),
])}
{mcq("tw-q-paired", "Why is a paired t-test right for the strength before and after training, and not a two-sample t-test?", [
    ("The two measurements come from the same people, so they aren’t independent groups", True, "A paired test analyses each person’s change, which removes the large differences in strength between people."),
    ("Because there are more than 1,000 people", False, "The size of the sample doesn’t decide this: the design does."),
    ("Because strength isn’t normally distributed", False, "That would be a reason for a Wilcoxon test, not for pairing."),
])}
{mcq("tw-q-big", "The paired t-test gives p &lt; 2.2 × 10<sup>−16</sup>. Does that tell you the training had a large effect?", [
    ("No: the effect is the mean change, 8.6 pounds (95% CI 8.4 to 8.9); the tiny p-value mostly reflects the large sample", True, "With 1,011 people, even a small change would give a tiny p-value. Judge the size of an effect from the estimate and its confidence interval."),
    ("Yes: the smaller the p-value, the larger the effect", False, "A p-value mixes the size of the effect with the size of the sample."),
    ("It means the result is certainly correct", False, "A p-value can’t rule out bias, for example from people getting used to the test (see last week’s homework)."),
])}
'''
    return chapter("two", "2", "Two groups", "rstudio", "Comparing two groups", 40,
                   "The t-test is the most used test in medical research. Learn what it calculates, what it assumes, what to use when those assumptions fail, and how to handle measurements made twice on the same people.", body)


# ---------------------------------------------------------------------------------------------------------------------
def ch_several():
    body = f'''
<h2 id="sv-why">Why not lots of t-tests?</h2>
<p>With three subtypes there are three pairs of groups to compare. If you did a t-test for each, at α = 0.05, the chance of at least one false positive would be 1 − 0.95<sup>3</sup>, about 14%, not 5%. The more groups, the worse it gets. Instead, start with one test of the question “do the means differ at all?”</p>

<h2 id="sv-anova">Analysis of variance</h2>
<p><b>One-way analysis of variance</b> (ANOVA) compares the variation <b>between</b> the groups’ means with the variation <b>within</b> the groups. If the groups don’t really differ, the means should be about as variable as chance makes them, given the scatter within each group.</p>
{figure(figs.anova_variation(), 'ANOVA compares how far the groups’ means are from the grand mean (amber) with how far the values are from their own group’s mean (the spread within each group).')}
{formula('<i>F</i> = (variation between the groups, per degree of freedom) / (variation within the groups, per degree of freedom)', 'If H0 is true (all the means are equal), F is about 1. The larger F is, the stronger the evidence that at least one mean differs.')}
<p>Here is <i>HOXA9</i>, a gene that controls the development of blood cells, in the three subtypes:</p>
{rc(HOX_SUM)}
{block(HOX_BOX)}
{rc('summary(aov(HOXA9 ~ mol.biol, data = leuk))')}
<p>The ANOVA table has a row for the groups and a row for the residuals (the variation within groups), with their degrees of freedom (2 = 3 groups − 1, and 86 = 89 patients − 3 groups), sums of squares and mean squares. F = 230 is enormous, and p &lt; 2 × 10<sup>−16</sup>. ANOVA assumes, like the t-test, that the observations are independent and roughly normal within each group, and also that the groups have similar variances.</p>

<h2 id="sv-post">Which groups differ?</h2>
<p>A significant ANOVA tells you that the means aren’t all equal, but not which ones differ. A <b>post hoc</b> test compares every pair of groups, and adjusts for the number of comparisons so that the chance of any false positive stays at 5%. <b>Tukey’s honest significant difference</b> is the usual one:</p>
{rc('TukeyHSD(aov(HOXA9 ~ mol.biol, data = leuk))')}
<p>ALL1/AF4 leukaemias have about 4 log2 units (16 times) more HOXA9 than either of the others, which don’t differ from each other (adjusted p = 0.997). This is a famous result: leukaemias with <i>KMT2A</i> (<i>MLL</i>) fusions switch on <i>HOXA9</i> and <i>MEIS1</i>, and the newest drugs for them, the menin inhibitors, work by switching these genes off again.</p>

<h2 id="sv-kw">When the assumptions fail: Kruskal–Wallis</h2>
<p>The <b>Kruskal–Wallis test</b> is the rank-based version of ANOVA, just as the Wilcoxon test is of the t-test. Use it when the groups are skewed or have outliers, especially when they are small (the ALL1/AF4 group has only 10 patients):</p>
{rc('kruskal.test(HOXA9 ~ mol.biol, data = leuk)')}
{activity("Compare three groups", [
    rtask("sv-box", 'Draw box plots of HOXA9 in the three subtypes, as above.', gg("GeomBoxplot", maps={'x': 'mol.biol', 'y': 'HOXA9'})),
    rtask("sv-aov", 'Do the ANOVA of HOXA9, and look at its table with summary().', aov_f(230.3)),
    rtask("sv-tukey", 'Find out which subtypes differ, with Tukey’s test.', lastv('inherits(v, "TukeyHSD")')),
    rtask("sv-meis", f'Now do an ANOVA of {c("MEIS1")}, the partner of HOXA9.', aov_f(243.9)),
    rtask("sv-actn3", f'In the FAMuSS data, use an ANOVA to ask whether NDRM.CH differs between the three genotypes of {c("actn3_r577x")}.', aov_f(3.753, 0.01)),
    rtask("sv-kw", 'Do the same comparison with a Kruskal–Wallis test.', htest("Kruskal", 'abs(v$statistic - 6.9413) < 0.01')),
])}
{q("sv-q-fwer", "If you compared 3 groups with 3 separate t-tests, each at α = 0.05, what would be the chance of at least one false positive when no groups differ, to two decimal places?", "0.14: 1 − 0.95<sup>3</sup> = 0.143. (This assumes the tests are independent, which they aren’t quite, but it gives the idea.)", accept=ACC_FWER, placeholder="A probability")}
{q("sv-q-actn3", "What is the p-value of the ANOVA of NDRM.CH by ACTN3 genotype?", "0.024: there is some evidence that the gain in strength differs between the genotypes. The means are 48.3% (CC), 53.1% (CT) and 58.2% (TT), so people with more copies of the 577X allele gained a little more. The Kruskal–Wallis test agrees (p = 0.031). Next week you will model this as a trend.", accept=ACC_ACTN3, placeholder="A number")}
{mcq("sv-q-anova", "The ANOVA of HOXA9 has p &lt; 2 × 10<sup>−16</sup>. What does it tell you on its own?", [
    ("That the three means are not all equal", True, "To find out which groups differ, you need a post hoc test such as Tukey’s."),
    ("That all three means differ from each other", False, "Tukey’s test shows that BCR/ABL and NEG don’t differ: only ALL1/AF4 stands out."),
    ("That ALL1/AF4 has the highest mean", False, "The ANOVA doesn’t say which group is which: the summary table and the box plots do."),
])}
{mcq("sv-q-tukey", "Why use Tukey’s test, rather than three t-tests, to compare the pairs of subtypes?", [
    ("It adjusts for the three comparisons, so that the chance of any false positive stays at 5%", True, "Its p-values and confidence intervals are adjusted for all the pairs being compared at once."),
    ("It doesn’t assume normality", False, "Tukey’s test makes the same assumptions as ANOVA."),
    ("It is more powerful than a t-test for each pair", False, "The adjustment makes each comparison a little less powerful, in exchange for controlling false positives."),
])}
'''
    return chapter("several", "3", "Several groups", "rstudio", "Comparing several groups", 40,
                   "With three or more groups, start with one test of whether the groups differ at all, and only then ask which ones differ.", body)


# ---------------------------------------------------------------------------------------------------------------------
def ch_categorical():
    body = f'''
<h2 id="ct-tables">Tables of counts</h2>
<p>When both variables are categorical, the data are counts, and they are best shown as a <b>contingency table</b>. Did the patients with BCR/ABL leukaemia do worse after their first treatment? <code>table()</code> counts each combination of subtype and response (and leaves out the patients whose response is missing):</p>
{rc('tab <- table(two$mol.biol, two$remission)', 'tab')}
<p>8 of the 30 BCR/ABL patients (27%) didn’t go into remission (REF), against 1 of the 39 NEG patients (3%).</p>

<h2 id="ct-chisq">The chi-square test</h2>
<p>If remission didn’t depend on the subtype, each subtype would have the same proportion of REF patients as the table as a whole, 9 of 69. The <b>expected count</b> of each cell is what it would hold if that were so:</p>
{formula('expected count = (row total × column total) / grand total')}
<p>The <b>chi-square</b> (χ²) statistic adds up how far the observed counts (O) are from the expected counts (E):</p>
{formula('χ² = Σ (O − E)² / E', 'with (rows − 1) × (columns − 1) degrees of freedom: 1 for a 2 × 2 table')}
{rc('ct <- chisq.test(tab)', 'ct', 'ct$expected')}
<p>R warns that the chi-square approximation may be incorrect. The test relies on a large-sample approximation, which needs every <b>expected</b> count to be at least about 5, and two of them are less than that. (For a 2 × 2 table, R also applies Yates’ continuity correction, which makes the test a little more cautious.)</p>

<h2 id="ct-fisher">Fisher’s exact test, and the odds ratio</h2>
<p><b>Fisher’s exact test</b> calculates the p-value exactly, from all the tables with the same totals, so it is right however small the counts are. Use it whenever expected counts are small:</p>
{rc('fisher.test(tab)')}
<p>Besides the p-value (0.008), Fisher’s test gives the <b>odds ratio</b>, a measure of how strongly the two variables are associated. The <b>odds</b> of something is the probability that it happens divided by the probability that it doesn’t: 22 of the BCR/ABL patients went into remission and 8 didn’t, so their odds of remission were 22 / 8 = 2.75. For the NEG patients they were 38 / 1 = 38.</p>
{formula('odds ratio = odds in group 1 / odds in group 2 = (22 / 8) / (38 / 1) = 0.072', 'Fisher’s test gives 0.075, a slightly different kind of estimate. An odds ratio of 1 means no association.')}
<p>So the BCR/ABL patients had less than a tenth of the odds of remission of the NEG patients: equally, their odds of being refractory were more than ten times as high. Which way round an odds ratio is depends on the order of the rows and columns, so always say what it compares. Its confidence interval (0.002 to 0.62) is very wide, because only 9 patients were refractory.</p>
<p>Odds ratios are everywhere in genetic epidemiology: case–control studies and GWAS report the effect of an allele as an odds ratio. Next week you will estimate them with logistic regression, which can also adjust for other variables.</p>

<h2 id="ct-hwe">Hardy–Weinberg equilibrium</h2>
<p>Last week you saw that, if the two copies of a gene are inherited independently, the genotypes of a SNP with allele frequencies <i>p</i> and <i>q</i> = 1 − <i>p</i> should be in the proportions <i>p</i>², 2<i>pq</i> and <i>q</i>². This is <b>Hardy–Weinberg equilibrium</b> (HWE). It holds when mating is random and there is no selection, migration or mutation to disturb it. Testing it is a standard <b>quality control</b> step for genotyping data, because the commonest reason for a SNP to fail is a problem with the genotyping, such as heterozygotes that are called as homozygotes.</p>
<p>The test is a chi-square test of the observed genotype counts against the counts expected from the allele frequency. It has 1 degree of freedom: 3 genotypes, minus 1 because the counts must add up to the total, minus 1 more because the allele frequency was estimated from the same data. Here it is for ACTN3 R577X, step by step:</p>
{rc('geno <- fms %>% drop_na(actn3_r577x) %>% count(actn3_r577x)', 'geno', 'n <- sum(geno$n)', 'p_C <- (2 * geno$n[1] + geno$n[2]) / (2 * n)', 'p_C',
    'expected <- n * c(p_C^2, 2 * p_C * (1 - p_C), (1 - p_C)^2)', 'expected', 'x2 <- sum((geno$n - expected)^2 / expected)', 'x2', 'pchisq(x2, df = 1, lower.tail = FALSE)')}
<p>There are fewer heterozygotes than expected (318 against 367), and p = 0.0003. To test other SNPs, wrap the steps in a function that takes a vector of genotypes, works out which two letters are the alleles, and gives back the p-value. You will use this function again in week 5:</p>
{codefile("hwe.R", HWE_FUN, note='Create the file and click <b>Source</b> in RStudio to make the function, or copy it into the Console.')}
{setup(HWE_FUN)}
{rc('hwe_p(fms$actn3_r577x)', 'fms %>% filter(Race == "Caucasian") %>% pull(actn3_r577x) %>% hwe_p()')}
<p>In everyone, the SNP fails the test; in the Caucasian participants alone, it doesn’t (p = 0.08). FAMuSS mixes people of several ancestries, in whom the allele frequencies differ. Each group can be in equilibrium on its own, but pooling groups with different allele frequencies always gives too few heterozygotes (the <b>Wahlund effect</b>). So test HWE within groups of similar ancestry, and treat a failure as a warning to investigate rather than as a finding.</p>
{callout("concept", "HWE in genome-wide studies", "<p>Before a genome-wide association study, SNPs that fail HWE badly (for example p &lt; 10<sup>−6</sup>, tested in the controls) are usually removed, because genotyping errors can create false associations. The threshold is strict because a study tests hundreds of thousands of SNPs, so some will fail by chance (week 5). Testing in controls avoids removing a real association: in cases, a SNP that causes the disease may well be out of equilibrium.</p>")}
{activity("Tables, odds and genotypes", [
    rtask("ct-tab", 'Make the table of remission in the BCR/ABL and NEG groups, as above.', lastv('inherits(v, "table") && all(dim(v) == c(2, 2))')),
    rtask("ct-fisher", 'Test it with Fisher’s exact test.', htest("Fisher", 'abs(v$p.value - 0.00802) < 0.0001')),
    rtask("ct-obese", f'In {c("fms")}, add a column {c("obese")} that is TRUE when {c("pre.BMI")} is more than 25 (overweight or obese).', has_obj('is.data.frame(o) && nrow(o) == 1397 && "obese" %in% names(o) && is.logical(o$obese)')),
    rtask("ct-chisq", 'Make a table of obese against Gender, and test it with a chi-square test.', htest("Chi-squared", 'v$p.value < 1e-4')),
    rtask("ct-or", 'Calculate the odds ratio for being obese in men compared with women, from the counts in your table.', lastv(near(1.799537, 0.002))),
    rtask("ct-hwe", f'Make the function {c("hwe_p()")}, and test ACTN3 R577X for Hardy–Weinberg equilibrium in everyone.', lastv(near(0.0002706381, 1e-7))),
    rtask("ct-cauc", 'Then test it in the Caucasian participants alone.', lastv(near(0.07598464, 1e-5))),
    rtask("ct-akt1", f'Test {c("akt1_t8407g")}, a SNP in <i>AKT1</i>, in everyone and then in the Caucasian participants alone.', lastv(near(0.4780294, 1e-5))),
])}
{q("ct-q-exp", "In the table of remission, what is the expected count of refractory (REF) NEG patients, to two decimal places?", "5.09: 39 NEG patients × 9 REF patients / 69 patients. The observed count was 1. The expected count for REF in the BCR/ABL group, 3.91, is below 5, which is why R warned about the chi-square test.", accept=ACC_EXP, placeholder="A number")}
{q("ct-q-or", "What is the odds ratio for being obese in men compared with women, to two decimal places?", "1.80: (178 / 247) / (173 / 432). Men had 1.8 times the odds of a BMI over 25. Fisher’s test gives 1.80 too, with a 95% CI of 1.37 to 2.36.", accept=ACC_OR, placeholder="A number")}
{q("ct-q-hwe", "What is the p-value of the HWE test of ACTN3 R577X in the Caucasian participants, to two decimal places?", "0.08 (0.076): no evidence against equilibrium, unlike the p = 0.0003 for everyone together. For akt1_t8407g the contrast is even sharper: p = 2 × 10<sup>−12</sup> in everyone, and 0.48 in the Caucasian participants. The Asian participants carry its G allele far more often.", accept=ACC_HWE, placeholder="A number")}
{mcq("ct-q-fisher", "Why is Fisher’s exact test better than the chi-square test for the table of remission?", [
    ("Two of the expected counts are below 5, so the chi-square approximation isn’t reliable", True, "What matters is the expected counts, not the observed ones. Fisher’s test is exact for any counts."),
    ("Fisher’s test is always better", False, "With large expected counts the two agree, and the chi-square test also works for larger tables, where Fisher’s test can be very slow."),
    ("Because one of the observed counts is 1", False, "It is the expected counts that matter. A table can have a small observed count and still have large expected ones."),
])}
{mcq("ct-q-dir", "Fisher’s test gives an odds ratio of 0.075 for the table of remission (rows BCR/ABL then NEG; columns CR then REF). What does it mean?", [
    ("BCR/ABL patients had less than a tenth of the odds of complete remission of NEG patients", True, "Equally, their odds of being refractory were more than ten times as high (1 / 0.075 = 13). The odds ratio compares the odds of the first column in the first row with those in the second row."),
    ("7.5% of BCR/ABL patients went into remission", False, "An odds ratio is a ratio of two odds, not a proportion. 22 of 30 (73%) BCR/ABL patients went into remission."),
    ("BCR/ABL patients were more likely to go into remission", False, "An odds ratio below 1 means lower odds in the first row."),
])}
{mcq("ct-q-wahlund", "ACTN3 R577X fails the HWE test in all the FAMuSS participants, but not in the Caucasian participants alone. What is the most likely explanation?", [
    ("The participants come from groups with different allele frequencies, and pooling them gives too few heterozygotes", True, "This is the Wahlund effect. It is why HWE is tested within groups of similar ancestry."),
    ("The genotyping of ACTN3 failed in the non-Caucasian participants", False, "A genotyping problem is always worth checking, but here the excess of homozygotes is what a mixture of populations produces."),
    ("The R577X variant is under strong natural selection in FAMuSS", False, "Selection can’t act within a group of volunteers in one generation."),
])}
{mcq("ct-q-nr3c1", "nr3c1_rs6195 has 561 AA, 29 AG and 7 GG genotypes in the Caucasian participants, where about 0.8 GG would be expected (p = 2 × 10<sup>−13</sup>). What would you do?", [
    ("Suspect a genotyping problem: check the genotype calls, and leave the SNP out of association tests if it can’t be fixed", True, "Far too many rare homozygotes, within one ancestry group, is a classic sign of genotyping error. In a GWAS this SNP would fail quality control."),
    ("Report that GG is enriched in people who do strength training", False, "Nothing suggests that, and HWE is about how the genotypes are distributed, not about the training."),
    ("Ignore it: HWE tests are not important", False, "Genotyping errors can create false associations, which is why HWE is part of quality control."),
])}
'''
    return chapter("categorical", "4", "Categorical data", "rstudio", "Categorical data and genotypes", 45,
                   "Counts need tests of their own: the chi-square test and Fisher’s exact test, the odds ratio to measure association, and the Hardy–Weinberg test, which checks the quality of genotypes.", body)


# ---------------------------------------------------------------------------------------------------------------------
def ch_choose():
    body = f'''
<p>Choosing a test comes down to three questions. What <b>kind of outcome</b> is it: continuous, or counts in categories? How many <b>groups</b> are you comparing, and are they <b>independent</b> or matched (paired)? And are the <b>assumptions</b> of the usual test reasonable, or do the data call for a test that makes fewer?</p>
{chooser()}
<p>Two pieces of advice that matter more than the choice of test. First, decide on your main test <b>before</b> you look at the results: trying several tests and reporting the one with the smallest p-value makes p-values meaningless (more about this in week 6). Second, report the <b>size</b> of the effect, with its confidence interval, as well as the p-value.</p>
<p>For each of these situations, choose the test you would use.</p>
{mcq("ch-q-1", "You measure the expression of a gene in tumour and in normal tissue from the same 12 patients. The differences look roughly normal. Which test?", [
    ("A paired t-test", True, "Each tumour sample is matched with normal tissue from the same patient, so analyse the differences."),
    ("A two-sample t-test", False, "The two sets of samples aren’t independent: they come from the same patients."),
    ("A chi-square test", False, "The outcome is continuous, not a count."),
])}
{mcq("ch-q-2", "You compare the number of copies of a gene, a count with a few very large values, between 8 patients and 9 controls. Which test?", [
    ("A Wilcoxon rank-sum test", True, "Two independent, small, skewed groups: a test based on ranks isn’t thrown by the large values."),
    ("A t-test", False, "With such small, skewed groups, the t-test’s assumption of normal means is doubtful."),
    ("ANOVA", False, "There are only two groups."),
])}
{mcq("ch-q-3", "You compare the carriers and non-carriers of a variant among 15 cases and 15 controls: 6 cases and 1 control are carriers. Which test?", [
    ("Fisher’s exact test", True, "A 2 × 2 table with small expected counts (the carriers’ expected counts are 3.5)."),
    ("A chi-square test", False, "Two of the expected counts are below 5."),
    ("A t-test", False, "Carrier or not is categorical, not continuous."),
])}
{mcq("ch-q-4", "You compare BMI, which is roughly normal, between four ancestry groups. Which test?", [
    ("A one-way ANOVA, followed by Tukey’s test if it is significant", True, "One continuous outcome, more than two independent groups, roughly normal data."),
    ("Six t-tests, one for each pair of groups", False, "Six tests at α = 0.05 give a much higher chance of a false positive."),
    ("A paired t-test", False, "The groups contain different people."),
])}
{mcq("ch-q-5", "You genotype 2,000 controls for a new SNP panel and want to check the quality of each SNP. Which test?", [
    ("A test of Hardy–Weinberg equilibrium for each SNP, within each ancestry group", True, "It is a standard quality control: SNPs that fail badly are checked or removed."),
    ("A t-test of each SNP against the others", False, "The question is whether each SNP’s genotypes are in the proportions expected, not a comparison between SNPs."),
    ("A Kruskal–Wallis test", False, "That compares a continuous outcome between groups."),
])}
{mcq("ch-q-6", "You compare the change in a biomarker between 200 patients given a drug and 200 given a placebo, randomly allocated. The changes are roughly normal. Which test?", [
    ("A two-sample (Welch’s) t-test of the change", True, "Two independent groups of reasonable size and a continuous outcome. The change within each patient is the outcome."),
    ("A paired t-test of drug against placebo", False, "The patients on the drug aren’t matched with those on the placebo: they are different people."),
    ("Fisher’s exact test", False, "The outcome is continuous. (You would lose information by turning it into “improved or not”.)"),
])}
'''
    return chapter("choose", "5", "Choosing a test", "rstudio", "Choosing the right test", 20,
                   "Which test you use depends on the kind of data, the design of the study and the assumptions you can make. Practise choosing.", body)


# ---------------------------------------------------------------------------------------------------------------------
def ch_report():
    body = f'''
<p>This week’s report shows your tests. As last week, <b>Create this file</b> saves it in your home folder, as <code>week3.qmd</code>, and opens it in RStudio. Each chunk shows the code and the result of a test, and the text says what it means.</p>
{codefile("week3.qmd", TEMPLATE)}
<p>A good report of a test gives the <b>estimate</b> (a difference in means, or an odds ratio), its <b>confidence interval</b>, the <b>test</b> you used and its <b>p-value</b>, in words someone else can follow. For example: “ABL1 expression was higher in BCR/ABL than in NEG leukaemias, by 1.10 log2 units (95% CI 0.86 to 1.34; Welch’s t-test, p = 1.8 × 10<sup>−13</sup>).”</p>
{activity("Write and render your report", [
    task("rp-create", 'Create <code>week3.qmd</code> with the button above, and put your name in it.', auto="file:create path~week3.qmd"),
    task("rp-render", 'Render it.', auto="knit:done path~week3.qmd ok=true"),
    task("rp-fisher", 'Under <b>Remission</b>, add a chunk that makes the table of remission by subtype and tests it with Fisher’s exact test, and a sentence that reports the result.', check=r"has:week3.qmd|fisher\.test\("),
    task("rp-hwe", f'Add a section on Hardy–Weinberg equilibrium, with the function {c("hwe_p()")} and the tests of ACTN3 R577X in everyone and in the Caucasian participants.', check=r"has:week3.qmd|hwe_p\("),
    task("rp-render2", 'Render the report again, and check that it shows Fisher’s test.', check="has:week3.html|Fisher's Exact Test|Fisher&#39;s Exact Test"),
])}
{q("rp-q-sentence", "Write a sentence that reports the Fisher’s exact test of remission for a clinician, with the numbers.", "For example: “Fewer patients with BCR/ABL leukaemia went into complete remission after their first treatment than patients with NEG leukaemia (22 of 30, 73%, against 38 of 39, 97%; odds ratio 0.075, 95% CI 0.002 to 0.62; Fisher’s exact test, p = 0.008).” The interval is very wide because only 9 patients were refractory.")}
'''
    return chapter("report", "6", "Your report", "rstudio", "Reporting tests in Quarto", 25,
                   "Put this week’s main tests into a report that renders from the data, and practise reporting a test so that a clinician can understand it.", body)


# ---------------------------------------------------------------------------------------------------------------------
def ch_wrapup():
    body = f'''
<h2 id="w3-ideas">This week’s main ideas</h2>
<ul>
<li>A test starts from a <b>null hypothesis</b>. The <b>p-value</b> is the probability, if H<sub>0</sub> were true, of data at least as extreme as yours. It isn’t the probability that H<sub>0</sub> is true, and it doesn’t measure the size of an effect.</li>
<li>A <b>permutation test</b> builds the null distribution by shuffling labels. The <b>t-test</b> uses the t distribution instead. Both ask how many standard errors apart two means are.</li>
<li>Check the <b>assumptions</b> (independence, roughly normal groups); use <b>Wilcoxon</b> or <b>Kruskal–Wallis</b> when they fail, and a <b>paired</b> test for matched measurements.</li>
<li>For three or more groups, use <b>ANOVA</b>, then <b>Tukey’s test</b> to see which groups differ.</li>
<li>For counts, use a <b>chi-square</b> test, or <b>Fisher’s exact test</b> when expected counts are small, and measure the association with an <b>odds ratio</b>.</li>
<li><b>Hardy–Weinberg equilibrium</b> is a quality check of genotypes. Test it within groups of similar ancestry: mixing populations gives too few heterozygotes.</li>
<li>Always report the <b>estimate and its confidence interval</b>, not just the p-value.</li>
</ul>
{homework("Choose and run the right tests", f"""
<p>Add a section to <code>week3.qmd</code> for each of these questions. For each one, say which test you chose and why, run it, and report the estimate, its confidence interval (where there is one) and the p-value in a sentence. Then render the report.</p>
{activity("Homework 3", [
    task("hw3-meis", "Is MEIS1 expressed differently in the BCR/ABL and NEG groups? (Look at the data first.)", check=r"has:week3.qmd|MEIS1"),
    task("hw3-age", "Do the patients of the three subtypes differ in age?", check=r"has:week3.qmd|\bage\b[\s\S]*mol\.biol|mol\.biol[\s\S]*\bage\b"),
    task("hw3-sex", "Is the subtype of leukaemia associated with the patient’s sex?", check=r"has:week3.qmd|table\([^)]*sex|count\([^)]*sex"),
    task("hw3-esr1", "Is esr1_rs1042717 in Hardy–Weinberg equilibrium in the Caucasian participants?", check=r"has:week3.qmd|esr1_rs1042717"),
    task("hw3-drm", "Did the strength of the untrained (dominant) arm change during the study?", check=r"has:week3.qmd|DRM_Max"),
    task("hw3-render", "Render the report.", check=r"has:week3.html|MEIS1"),
])}
{q("hw3-q-choice", "Which test did you choose for the age of the patients in the three subtypes, and why?", "A one-way ANOVA (then Tukey’s test), or a Kruskal–Wallis test if the ages look skewed or the small ALL1/AF4 group worries you: age is continuous and there are three independent groups. The NEG patients are younger on average (about 26, against about 40 in the BCR/ABL group and 42 in the ALL1/AF4 group): BCR/ABL leukaemia becomes commoner with age.")}
""")}
'''
    return finish_chapter("wrapup", "★", "Summary and homework", "Summary and homework",
                          "What you have learnt this week, the homework, and how much of the practical you have done.", body)


def ALL():
    use_golden(NAME)
    return [ch_start(), ch_logic(), ch_two(), ch_several(), ch_categorical(), ch_choose(), ch_report(), ch_wrapup()]
