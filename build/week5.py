"""Week 5 of Biostatistics for Genomic Medicine: genome-scale inference.

The multiple-testing problem (simulated null p-values, the family-wise error rate, and the 47 mutated positions of the
HIV protease in the Virco data); Bonferroni and Benjamini–Hochberg corrections; a genome-wide comparison of 12,625
expression probes between BCR/ABL and NEG leukaemias, and genome-wide significance; population structure (AKT1 allele
frequencies around the world, a simulated study with two populations, principal components and inflated QQ plots);
linkage disequilibrium; and a mini-GWAS of the FAMuSS SNPs with quality control, QQ and Manhattan plots. Follows the
week 5 session plan (blocks 5A, 5B and 5C) and homework 5."""
from lib import *
import figs

NAME = 'week5'
PRELUDE = '''suppressMessages(library(tidyverse))
setwd("~/data")'''

# ---- checks made by R (see lib.rtask) ----
LOADED = '"package:tidyverse" %in% search()'
IN_DATA = 'basename(getwd()) == "data"'
SNPS_OK = ('exists("dosage") && is.function(dosage) && exists("hwe_p") && is.function(hwe_p) && '
           'identical(as.numeric(dosage(c("CC", "CT", "CC", NA, "TT", "CC"))), c(0, 1, 0, NA, 2, 0))')
HLINE = 'any(vapply(v$layers, function(l) inherits(l$geom, "GeomHline"), logical(1)))'
ABLINE = 'any(vapply(v$layers, function(l) inherits(l$geom, "GeomAbline"), logical(1)))'


def count_is(n, names=None):
    """the last command gave the number n (a count), or a vector of n names (which include names), or a logical vector
    with n TRUEs"""
    nm = f' && all(c({", ".join(rq(x) for x in names)}) %in% v)' if names else ''
    return lastv(f'(is.numeric(v) && length(v) == 1 && isTRUE(v == {n})) || (is.character(v) && length(v) == {n}{nm})')


# ---- what the short questions accept ----
ACC_50K = r'^50,?000$||^5 ?[x×*] ?10\^?4$||^5e\+?0?4$||^fifty thousand$'
ACC_FWER47 = r'^0?\.91[0-9]*$||^91(\.[0-9]+)? ?%$'
ACC_EXP47 = r'^2\.35$||^2\.4$||^(about )?2$'
ACC_THR = r'^0?\.00106[0-9]*$||^0?\.0011$||^1\.06 ?[x×*] ?10\^?-3$'
ACC_BH5 = r'^5$||^five$'
ACC_BONF3 = r'^3$||^three$'
ACC_631 = r'^631(\.25?)?$||^631\.3$||^(about )?630$'
ACC_162 = r'^162$'
ACC_8 = r'^(about )?8(\.1)?$'
ACC_FREQ = r'^0?\.30[0-9]*$||^0?\.3$||^30(\.[0-9]+)? ?%$'
ACC_148 = r'^148$'
ACC_R2 = r'^0?\.89[0-9]*$'
ACC_163 = r'^163$'
ACC_12 = r'^12$||^twelve$'
ACC_TOP = r'^acdc[_ ]?rs1501299$||^rs1501299$'

# ---- the code shown ----
SNPS_R = '''# Two functions for genotypes such as "CC", "CT" and "TT" (week 5).

# The number of copies of the minor (less common) allele that each person
# carries: 0, 1 or 2 (NA if the person wasn't genotyped).
dosage <- function(g) {
  # all the alleles of the people who were genotyped, e.g. "C" "T" "C" "C" ...
  alleles <- unlist(strsplit(g[!is.na(g)], ""))
  # only one allele: everyone has 0 copies of the other one
  if (length(unique(alleles)) < 2) return(ifelse(is.na(g), NA, 0))
  # the less common allele
  minor <- names(sort(table(alleles)))[1]
  # the copies in the first and the second letter (TRUE counts as 1)
  (substr(g, 1, 1) == minor) + (substr(g, 2, 2) == minor)
}

# The p-value of a chi-square test of Hardy-Weinberg equilibrium, as in week 3
# (NA if the SNP has only one allele).
hwe_p <- function(g) {
  g <- g[!is.na(g)]
  alleles <- unique(unlist(strsplit(g, "")))
  if (length(alleles) < 2) return(NA)
  n <- length(g)
  n_11 <- sum(g == paste0(alleles[1], alleles[1]))
  n_22 <- sum(g == paste0(alleles[2], alleles[2]))
  n_12 <- n - n_11 - n_22
  p <- (2 * n_11 + n_12) / (2 * n)
  expected <- n * c(p^2, 2 * p * (1 - p), (1 - p)^2)
  x2 <- sum((c(n_11, n_12, n_22) - expected)^2 / expected)
  pchisq(x2, df = 1, lower.tail = FALSE)
}'''

NULL_SIM = 'null_p <- replicate(1000, t.test(rnorm(10), rnorm(10))$p.value)'
NULL_HIST = '''tibble(p = null_p) %>%
  ggplot(aes(x = p)) +
  geom_histogram(breaks = seq(0, 1, by = 0.05))'''
VIRCO_P = 'p_virco <- apply(mut, 2, function(m) t.test(trait[m], trait[!m])$p.value)'
VIRCO_HIST = '''tibble(p = p_virco) %>%
  ggplot(aes(x = p)) +
  geom_histogram(breaks = seq(0, 1, by = 0.05))'''
VIRCO_RESULTS = '''virco_results <- tibble(position = names(p_virco), p = p_virco,
                        bonferroni = p_bonf, bh = p_bh) %>%
  arrange(p)'''
PV = 'pv <- c(0.0001, 0.0004, 0.0019, 0.0095, 0.02, 0.04, 0.2, 0.5, 0.7, 0.9)'
RAW_BH = '''ggplot(virco_results, aes(x = p, y = bh)) +
  geom_point() +
  geom_abline(linetype = "dashed") +
  scale_x_log10() +
  scale_y_log10()'''

TWO_CODE = 'two <- leuk %>% filter(mol.biol %in% c("BCR/ABL", "NEG"))'
EXPR_P = '''p_expr <- apply(mat, 1, function(x)
  t.test(x[groups == "BCR/ABL"], x[groups == "NEG"])$p.value)'''
LOGFC = '''log_fc <- rowMeans(mat[, groups == "BCR/ABL"]) -
  rowMeans(mat[, groups == "NEG"])'''
EXPR_RESULTS = '''expr_results <- tibble(probe = expr$probe, symbol = expr$symbol,
                       log_fc = log_fc, p = p_expr) %>%
  mutate(bonferroni = p.adjust(p, method = "bonferroni"),
         bh = p.adjust(p, method = "BH")) %>%
  arrange(p)'''
EXPR_HIST = '''ggplot(expr_results, aes(x = p)) +
  geom_histogram(breaks = seq(0, 1, by = 0.05))'''
VOLCANO = '''ggplot(expr_results,
       aes(x = log_fc, y = -log10(p), colour = bh < 0.05)) +
  geom_point(alpha = 0.4)'''

FREQS = '''freqs <- hgdp %>%
  drop_na(AKT1.C0756A) %>%
  group_by(Geographic.area) %>%
  summarise(n = n(), freq_A = mean(str_count(AKT1.C0756A, "A")) / 2) %>%
  arrange(desc(freq_A))'''
FREQ_PLOT = '''ggplot(freqs, aes(x = freq_A, y = fct_reorder(Geographic.area, freq_A))) +
  geom_col() +
  labs(x = "frequency of the A allele of AKT1.C0756A", y = NULL)'''
SIM = '''set.seed(42)
# the allele frequencies of 500 SNPs in population 1
f1 <- runif(500, min = 0.1, max = 0.9)
# in population 2 they differ a little (but stay between 0.02 and 0.98)
f2 <- pmin(pmax(f1 + rnorm(500, mean = 0, sd = 0.1), 0.02), 0.98)
# the genotypes (0, 1 or 2 copies) of 200 people from each population
sim_geno <- rbind(sapply(f1, function(f) rbinom(200, size = 2, prob = f)),
                  sapply(f2, function(f) rbinom(200, size = 2, prob = f)))
sim_pop <- rep(c("pop1", "pop2"), each = 200)
# the trait: higher in population 2, on average; no SNP has any effect on it
sim_trait <- rnorm(400, mean = ifelse(sim_pop == "pop2", 1, 0))'''
PCS = 'pcs <- tibble(population = sim_pop, PC1 = pca$x[, 1], PC2 = pca$x[, 2])'
PC_PLOT = '''ggplot(pcs, aes(x = PC1, y = PC2, colour = population)) +
  geom_point()'''
P_NAIVE = '''p_naive <- apply(sim_geno, 2, function(g)
  summary(lm(sim_trait ~ g))$coefficients[2, 4])'''
P_PC1 = '''p_pc1 <- apply(sim_geno, 2, function(g)
  summary(lm(sim_trait ~ g + pcs$PC1))$coefficients[2, 4])'''
QQ_SIM = '''qq <- tibble(expected = -log10(ppoints(500)),
             unadjusted = -log10(sort(p_naive)),
             adjusted = -log10(sort(p_pc1))) %>%
  pivot_longer(c(unadjusted, adjusted),
               names_to = "model", values_to = "observed")
ggplot(qq, aes(x = expected, y = observed, colour = model)) +
  geom_point() +
  geom_abline()'''
LAMBDA = 'median(qchisq(p_naive, df = 1, lower.tail = FALSE)) / qchisq(0.5, df = 1)'
LAMBDA_PC1 = 'median(qchisq(p_pc1, df = 1, lower.tail = FALSE)) / qchisq(0.5, df = 1)'
HWE_AREAS = '''hgdp %>%
  group_by(Geographic.area) %>%
  summarise(n = n(), hwe = hwe_p(AKT1.C0756A)) %>%
  arrange(hwe)'''

HGDP_D = '''hgdp_d <- hgdp %>%
  select(starts_with("AKT1")) %>%
  mutate(across(everything(), dosage))'''
AKT1 = '''akt1 <- fms %>%
  select(starts_with("akt1")) %>%
  mutate(across(everything(), dosage))
r2 <- cor(akt1, use = "pairwise.complete.obs")^2'''
LD_HEAT = '''as_tibble(r2, rownames = "snp1") %>%
  pivot_longer(-snp1, names_to = "snp2", values_to = "r2") %>%
  ggplot(aes(x = snp1, y = snp2, fill = r2)) +
  geom_tile() +
  scale_fill_gradient(low = "white", high = "firebrick") +
  theme(axis.text.x = element_text(angle = 90, hjust = 1))'''

QC = '''qc <- tibble(snp = snps,
             call_rate = sapply(snps, function(s) mean(!is.na(fms[[s]]))),
             maf = sapply(snps, function(s) mean(dosage(fms[[s]]), na.rm = TRUE) / 2),
             hwe = sapply(snps, function(s) hwe_p(cauc[[s]])))'''
PASSED = 'passed <- qc %>% filter(call_rate >= 0.3, maf >= 0.05, hwe >= 1e-6)'
ASSOC = '''assoc <- function(snp, data = fms) {
  fit <- lm(NDRM.CH ~ dosage(data[[snp]]) + Gender + Age, data = data)
  coefs <- summary(fit)$coefficients
  tibble(snp = snp, beta = coefs[2, 1], se = coefs[2, 2], p = coefs[2, 4])
}'''
SCAN = 'gwas <- bind_rows(lapply(passed$snp, assoc))'
ADJUST = '''gwas <- gwas %>%
  mutate(bonferroni = p.adjust(p, method = "bonferroni"),
         bh = p.adjust(p, method = "BH")) %>%
  arrange(p)'''
QQ_GWAS = '''gwas %>%
  mutate(expected = -log10(ppoints(n())), observed = -log10(p)) %>%
  ggplot(aes(x = expected, y = observed)) +
  geom_point() +
  geom_abline(colour = "red")'''
MANHATTAN = '''gwas %>%
  arrange(snp) %>%
  mutate(index = row_number()) %>%
  ggplot(aes(x = index, y = -log10(p))) +
  geom_point() +
  geom_hline(yintercept = -log10(0.05 / nrow(gwas)),
             linetype = "dashed", colour = "red") +
  geom_text(aes(label = if_else(p < 0.02, snp, "")), vjust = -0.7, size = 3)'''
CAUC_SCAN = '''gwas_cauc <- bind_rows(lapply(passed$snp, assoc, data = cauc)) %>%
  mutate(bh = p.adjust(p, method = "BH")) %>%
  arrange(p)'''

TEMPLATE = '''---
title: "Week 5: a mini-GWAS of the FAMuSS SNPs"
author: "Your name"
format: html
---

```{r}
#| label: setup
#| message: false
library(tidyverse)
source("snps.R")
fms <- read_csv("data/famuss.csv", show_col_types = FALSE)
cauc <- filter(fms, Race == "Caucasian")
snps <- names(fms)[-(1:13)]
```

## Quality control

```{r}
#| label: qc
qc <- tibble(snp = snps,
             call_rate = sapply(snps, function(s) mean(!is.na(fms[[s]]))),
             maf = sapply(snps, function(s) mean(dosage(fms[[s]]), na.rm = TRUE) / 2),
             hwe = sapply(snps, function(s) hwe_p(cauc[[s]])))
passed <- qc %>% filter(call_rate >= 0.3, maf >= 0.05, hwe >= 1e-6)
```

Of the `r nrow(qc)` SNPs, `r nrow(passed)` passed quality control.

## Association tests

Each SNP was tested in a linear regression of the gain in strength
(NDRM.CH) on the number of copies of its minor allele, adjusted for sex
and age.

```{r}
#| label: tests
assoc <- function(snp, data = fms) {
  fit <- lm(NDRM.CH ~ dosage(data[[snp]]) + Gender + Age, data = data)
  coefs <- summary(fit)$coefficients
  tibble(snp = snp, beta = coefs[2, 1], se = coefs[2, 2], p = coefs[2, 4])
}
gwas <- bind_rows(lapply(passed$snp, assoc)) %>%
  mutate(bonferroni = p.adjust(p, method = "bonferroni"),
         bh = p.adjust(p, method = "BH")) %>%
  arrange(p)
head(gwas, 10)
```

## QQ plot

Add the QQ plot of the p-values here.

## Manhattan plot

Add the Manhattan-style plot here, with a line at the Bonferroni threshold.
'''


def week_data():
    rows = [
        ('<code>virco.csv</code>', '1,066 samples of HIV-1: the amino acid at each of the 99 positions of the virus’s protease, and its resistance to protease inhibitors', '1 and 2'),
        ('<code>all_expression.csv</code> and <code>leukaemia.csv</code>', 'the expression of 12,625 microarray probes in 79 patients with BCR/ABL or NEG leukaemia, and the patients’ details (weeks 3 and 4)', '3'),
        ('<code>hgdp_akt1.csv</code>', '1,064 people from 51 populations around the world, genotyped at four SNPs in the gene <i>AKT1</i>', '4 and 5'),
        ('<code>famuss.csv</code>', 'the FAMuSS study (weeks 2 to 4): 222 SNPs, and the gain in strength after training', '5 and 6'),
    ]
    return table(['File', 'What it holds', 'Chapters'], rows)


def fwer_fdr():
    rows = [
        ('<b>What it controls</b>', 'the probability of <b>at least one</b> false positive among all the tests', 'the expected <b>proportion</b> of false positives among the results called significant'),
        ('<b>The usual method</b>', 'Bonferroni: <code>p.adjust(p, method = "bonferroni")</code> (Holm’s method is a little more powerful)', 'Benjamini–Hochberg: <code>p.adjust(p, method = "BH")</code>'),
        ('<b>Suits</b>', 'confirming findings: a claim that a variant affects a disease, a GWAS hit, a clinical test', 'screening: choosing genes or variants to follow up, where a few false leads are acceptable'),
        ('<b>The price</b>', 'little power when there are many tests', 'some of the discoveries will be false, and you don’t know which'),
    ]
    return table(['', 'Family-wise error rate (FWER)', 'False discovery rate (FDR)'], rows)


# ---------------------------------------------------------------------------------------------------------------------
def ch_start():
    body = f'''
<h2 id="st5-why">From one test to thousands</h2>
<p>In weeks 3 and 4 you tested one hypothesis at a time, and a p-value below 0.05 was reasonable evidence against it. Genomics doesn’t work like that. A microarray measures more than 12,000 genes at once, and a genome-wide association study (GWAS) tests a million SNPs or more. If not one of a million SNPs had any effect, a threshold of 0.05 would still give you about 50,000 “significant” results. This week is about testing on that scale honestly: controlling false positives, recognising when ancestry creates associations that aren’t real, and putting it all together in a small association study.</p>
<p>You will use four sets of data this week, all in your <code>data</code> folder:</p>
{week_data()}

<h2 id="st5-fun">Two functions for genotypes</h2>
<p>This week you will work with the genotypes of many SNPs at once, so you need two small functions. <code>hwe_p()</code> is the Hardy–Weinberg test that you wrote in week 3, with one addition: it gives <code>NA</code> for a SNP that has only one allele. <code>dosage()</code> turns genotypes such as CC, CT and TT into the number of copies of the <b>minor</b> (less common) allele that each person carries, 0, 1 or 2: the additive coding of week 4, which it works out for any SNP. <b>Create this file</b> saves it in your home folder as <code>snps.R</code> and opens it in RStudio. Click <b>Source</b> to make the functions.</p>
{codefile("snps.R", SNPS_R, note='Create the file and click <b>Source</b> in RStudio to make the two functions, or copy them into the Console.')}
{setup(SNPS_R)}
<p>Try <code>dosage()</code> on a few genotypes. T is the less common allele here, so CC has no copies of it, CT one and TT two:</p>
{rc('dosage(c("CC", "CT", "CC", NA, "TT", "CC"))')}
<p>Then read the HIV data, which you will use in the next two chapters:</p>
{setup('virco <- read_csv("virco.csv", show_col_types = FALSE)')}
{block('virco <- read_csv("virco.csv")')}
{activity("Get ready", [
    task("st5-install", f'Install the tidyverse on this page: {rscode('install.packages("tidyverse")')}', check="installed:tidyverse", auto="rstudio:installed"),
    rtask("st5-library", f'Load it with {rscode("library(tidyverse)")}.', LOADED),
    rtask("st5-wd", f'Set the working directory to your data folder: {rscode('setwd("~/data")')}', IN_DATA),
    rtask("st5-snps", f'Create {c("snps.R")} and source it, then try {c("dosage()")} on the genotypes above.', SNPS_OK + ' && ' + lastv('identical(as.numeric(v), c(0, 1, 0, NA, 2, 0))')),
    rtask("st5-virco", f'Read {c("virco.csv")} into {c("virco")}.', has_table(1066, ['IDV.Fold', 'NFV.Fold', 'P30'])),
])}
{q("st5-q-50k", "A GWAS tests 1,000,000 SNPs, and not one of them has any effect on the disease. How many would you expect to have p &lt; 0.05?", "50,000: 5% of a million. Every one of them would be a false positive.", accept=ACC_50K, placeholder="A number")}
'''
    return chapter("start", "0", "Start here", "rstudio", "Week 5: genome-scale inference", 10,
                   "Genomic studies test thousands or millions of hypotheses at once. This week you will see what that does to p-values, how to correct for it, how ancestry can mislead, and how a genetic association study is done.", body)


# ---------------------------------------------------------------------------------------------------------------------
def ch_many():
    body = f'''
<h2 id="mt-one">When nothing is going on</h2>
<p>Remember what α = 0.05 means (week 3): when the null hypothesis is true, a test gives p &lt; 0.05 in 5% of studies, by chance. That is the price of one test. To see what it means for many tests, simulate 1,000 t-tests in which nothing is going on: each compares two groups of 10 values drawn from the same normal distribution. <code>replicate()</code> repeats the test 1,000 times, and <code>set.seed()</code> makes the random numbers the same as here:</p>
{rc('set.seed(1)', NULL_SIM, 'sum(null_p < 0.05)')}
<p>Fifty of the 1,000 tests are “significant”, just as α promises, and every one of them is a false positive. Draw a histogram of the p-values, with a bar for each interval of 0.05:</p>
{block(NULL_HIST)}
<p>The bars are all about the same height. When the null hypothesis is true, p-values are spread evenly between 0 and 1: they follow a <b>uniform</b> distribution, so a p-value below 0.05 is no more likely than one between 0.50 and 0.55. That is exactly why 5% of them fall below 0.05.</p>
{figure(figs.pvalue_histograms(), 'The p-values of many tests. When every null hypothesis is true (left), they are uniform. When some are false (right), their p-values pile up near 0, on top of the flat background of the true nulls.')}

<h2 id="mt-fwer">The family-wise error rate</h2>
<p>The <b>family-wise error rate</b> (FWER) is the probability of at least one false positive among a whole family of tests. For <i>m</i> independent tests of true null hypotheses, each at level α:</p>
{formula('FWER = 1 − (1 − α)<sup><i>m</i></sup>', 'with α = 0.05: 5% for one test, 64% for 20 tests, and practically 100% for 12,000')}
{figure(figs.fwer_curve(), 'The chance of at least one false positive grows quickly with the number of tests: with 14 tests it is more likely than not, and with 59 it is 95%.')}

<h2 id="mt-hiv">Testing every position of a protein</h2>
<p>HIV mutates quickly, and mutations in its <b>protease</b>, the enzyme that protease inhibitors block, can make the virus resistant to these drugs. The Virco data have, for 1,066 samples of HIV-1 (nearly all from patients), the amino acid at each of the 99 positions of the protease (the columns <code>P1</code> to <code>P99</code>) and how resistant each virus is to several drugs. <code>IDV.Fold</code> and <code>NFV.Fold</code> are the <b>fold resistance</b> to two protease inhibitors, indinavir and nelfinavir: how many times as much drug it takes to inhibit this virus as a reference virus.</p>
<p>Do some mutations affect one drug more than the other? As the trait, take the difference between the two:</p>
{rc('trait <- virco$IDV.Fold - virco$NFV.Fold', 'summary(trait)')}
<p>In the protease columns, a dash means the same amino acid as the reference virus, a full stop means that the position couldn’t be read, and a letter is the amino acid found (two letters: a mixture of viruses). Turn them into TRUE (mutated) and FALSE (not), counting the positions that couldn’t be read as not mutated (a simplification), and keep the positions that are mutated in more than 5% of the samples:</p>
{rc('positions <- select(virco, P1:P99)', 'mut <- positions != "-" & positions != "."', 'mut <- mut[, colMeans(mut) > 0.05]', 'dim(mut)')}
<p><code>mut</code> is a <b>matrix</b>: a table in which every value has the same type (here TRUE or FALSE), with a row for each sample and a column for each position. <code>colMeans()</code> gives the mean of each column, which for TRUE and FALSE is the proportion that are TRUE. 47 positions are mutated often enough to test.</p>
<p>Now test each of them. <code>apply(mut, 2, …)</code> applies a function to each column of the matrix (<code>2</code> means the columns; <code>1</code> would mean the rows). Here the function takes a column, <code>m</code>, and does a t-test of the trait between the samples with and without a mutation at that position (<code>!m</code> means “not m”), and keeps its p-value:</p>
{rc(VIRCO_P, 'length(p_virco)', 'sum(p_virco < 0.05)', 'head(sort(p_virco))')}
<p>22 of the 47 positions have p &lt; 0.05. If no mutation made any difference, you would expect 47 × 0.05 = 2.35 of them by chance, so many of these must be real. But which? With 47 tests, the chance of at least one false positive among them is 91%. Draw the histogram of these p-values (the same code as before, with <code>p_virco</code>):</p>
{block(VIRCO_HIST)}
<p>It has a tall bar on the left and is roughly flat elsewhere. That is the shape you hope to see: the flat part comes from the positions where nothing is going on, whose p-values are uniform, and the spike near 0 from the positions with real effects. A histogram with a different shape, such as a bump near 1 or a steady slope, suggests that the tests’ assumptions are wrong for these data.</p>
{activity("Many tests", [
    rtask("mt-sim", 'Simulate the 1,000 t-tests with no real differences, as above.', has_vec(1000, 'min(o) >= 0 && max(o) <= 1 && abs(mean(o) - 0.5) < 0.05')),
    rtask("mt-count", 'Count how many of them have p &lt; 0.05.', lastv('is.numeric(v) && length(v) == 1 && ((v >= 30 && v <= 75) || (v >= 0.03 && v <= 0.075))')),
    rtask("mt-hist", 'Draw the histogram of their p-values.', gg("GeomBar", stat="StatBin", maps={'x': 'p'}, extra='nrow(v$data) == 1000')),
    rtask("mt-mut", f'Make the matrix {c("mut")} of the 47 positions that are mutated in more than 5% of the samples.', has_obj('is.matrix(o) && is.logical(o) && all(dim(o) == c(1066, 47))')),
    rtask("mt-virco", 'Test each position, and count the p-values below 0.05.', has_vec(47, 'sum(o < 0.05) == 22') + ' && ' + lastv('is.numeric(v) && length(v) == 1 && v == 22')),
    rtask("mt-vhist", 'Draw the histogram of the 47 p-values.', gg("GeomBar", stat="StatBin", maps={'x': 'p'}, extra='nrow(v$data) == 47')),
])}
{q("mt-q-fwer", "If you did 47 independent tests, each at α = 0.05, and every null hypothesis were true, what would be the probability of at least one false positive, to two decimal places?", "0.91: 1 − 0.95<sup>47</sup> = 0.910. A false positive somewhere is almost certain.", accept=ACC_FWER47, placeholder="A probability")}
{q("mt-q-exp", "How many of the 47 positions would you expect to have p &lt; 0.05 if no mutation made any difference to the trait?", "2.35 (47 × 0.05). 22 have p &lt; 0.05, so most of them reflect real effects, but a couple are probably false positives.", accept=ACC_EXP47, placeholder="A number")}
{mcq("mt-q-uniform", "What do the p-values of many tests look like when every null hypothesis is true?", [
    ("They are spread evenly between 0 and 1, so 5% of them are below 0.05", True, "This is what α means: when the null hypothesis is true, every value of p is equally likely."),
    ("They are mostly close to 1", False, "That would be true only if the tests were badly miscalibrated. Under the null hypothesis, p is uniform."),
    ("They are all above 0.05", False, "No: 5% of them are below 0.05, by chance. Those are the false positives."),
])}
{mcq("mt-q-shape", "A study tests 20,000 genes, and the histogram of the p-values is flat with a spike near 0. Why is that the shape you hope to see?", [
    ("The flat part is the genes with no effect, whose p-values are uniform as they should be; the spike is the genes with real effects", True, "It says that the tests behave properly for the null genes and that there is real signal. Other shapes, such as a bump near 1, suggest problems with the tests or the data."),
    ("Because a spike near 0 means that every gene is significant", False, "The flat part is most of the genes, and none of them has an effect."),
    ("Because it shows that there are no false positives", False, "The flat part contributes false positives below 0.05 too, about 5% of the null genes."),
])}
'''
    return chapter("many", "1", "Many tests", "rstudio", "The multiple-testing problem", 30,
                   "Each test at α = 0.05 has a 5% chance of a false positive. Do thousands of tests, and false positives are certain. First, see the problem.", body)


# ---------------------------------------------------------------------------------------------------------------------
def ch_correct():
    body = f'''
<h2 id="co-bonf">Bonferroni: controlling the family-wise error rate</h2>
<p>The simplest correction is <b>Bonferroni’s</b>. To keep the family-wise error rate at α across <i>m</i> tests, test each one at α / <i>m</i>. For the 47 positions, that is 0.05 / 47 = 0.00106. Equivalently, multiply each p-value by <i>m</i> (capping the result at 1) and compare it with α. <code>p.adjust()</code> does this:</p>
{formula('Bonferroni: reject when <i>p</i> ≤ α / <i>m</i>, or when the adjusted p-value, min(1, <i>m</i> × <i>p</i>), ≤ α')}
{rc('0.05 / length(p_virco)', 'p_bonf <- p.adjust(p_virco, method = "bonferroni")', 'sum(p_bonf < 0.05)', 'names(p_virco)[p_bonf < 0.05]')}
<p>Eight positions survive. Bonferroni guarantees that the chance of even one false positive among them is at most 5%, whatever the tests (independent or not). That guarantee is expensive: with many tests the threshold becomes so strict that real effects are missed, so the tests have little <b>power</b>. It is also <b>conservative</b> when the tests are correlated, as they are for SNPs close together on a chromosome (chapter 5): it treats each test as a separate chance of a false positive, when correlated tests tend to be wrong together.</p>

<h2 id="co-fdr">The false discovery rate</h2>
<p>Often you don’t need to be sure that every finding is real. If you are choosing genes to follow up in the lab, a few false leads in the list are fine, as long as most of the list is right. The <b>false discovery rate</b> (FDR) is the expected proportion of false positives among the results you call significant (your “discoveries”). Controlling the FDR at 5% means that, on average, no more than 5% of your discoveries are false.</p>
<p>The <b>Benjamini–Hochberg</b> (BH) procedure controls the FDR at a level <i>q</i>:</p>
<ol>
<li>Sort the <i>m</i> p-values from smallest to largest: <i>p</i><sub>(1)</sub> ≤ <i>p</i><sub>(2)</sub> ≤ … ≤ <i>p</i><sub>(<i>m</i>)</sub>.</li>
<li>Find the largest rank <i>i</i> for which <i>p</i><sub>(<i>i</i>)</sub> ≤ (<i>i</i> / <i>m</i>) × <i>q</i>.</li>
<li>Call the <i>i</i> smallest p-values significant.</li>
</ol>
{figure(figs.bh_procedure(), 'The Benjamini–Hochberg procedure for 40 p-values and q = 0.1. Each sorted p-value is compared with its own threshold, on the red line; every p-value up to the last one below the line counts as a discovery.')}
<p>The smallest p-value is compared with <i>q</i> / <i>m</i>, as in Bonferroni, but each next one with a less strict threshold. <code>p.adjust(…, method = "BH")</code> gives <b>BH-adjusted p-values</b>, which you compare with <i>q</i>. A test’s adjusted p-value is the smallest FDR at which it would count as a discovery: the idea behind the <b>q-value</b>.</p>
{rc('p_bh <- p.adjust(p_virco, method = "BH")', 'sum(p_bh < 0.05)')}
<p>BH keeps 18 positions, against Bonferroni’s 8. Put the results in a table, sorted by p-value:</p>
{rc(VIRCO_RESULTS, 'print(virco_results, n = 20)')}
<p>The first eight rows, down to P82, have Bonferroni-adjusted p-values below 0.05. The ninth, P60, has p = 0.0011, just above Bonferroni’s threshold of 0.00106, but its BH-adjusted p-value is 0.006: well within an FDR of 5%. BH’s list stops at the 18th, P47 (adjusted p-value 0.041); the next, P35, has 0.059.</p>
<p>The top of the list makes sense biologically. In the samples with a mutation at position 30 (D30N) or 88 (N88D or N88S), the trait is strongly negative, because these mutations are selected by nelfinavir and make the virus resistant to nelfinavir but not to indinavir. Position 82 (V82A and others) is a classic indinavir mutation, and in samples with it the trait is higher. Statistics found the known biology among 47 positions; the corrections tell you how far down the list to trust it.</p>

<h2 id="co-pv">Your turn: ten p-values</h2>
<p>Here are ten p-values, already in order:</p>
{block(PV)}
<p>Use <code>p.adjust()</code> to apply both corrections, and count how many p-values are significant at 0.05 after each. Then do the BH procedure by hand: compare each p-value with its threshold, (<i>i</i> / <i>m</i>) × 0.05. Because <code>pv</code> is sorted, R can do all ten comparisons at once:</p>
{block('pv <= (1:10) / 10 * 0.05')}
<p>The last TRUE is at <i>i</i> = 5, so BH calls the 5 smallest p-values significant, even though the 4th, 0.0095, is above Bonferroni’s threshold of 0.005.</p>
{fwer_fdr()}
{callout("warn", "Two common misunderstandings", "<p><b>“Bonferroni is always right.”</b> It is always <i>safe</i> against false positives, but with many correlated tests it is far stricter than it needs to be, and it misses real effects. Genome-wide studies allow for the correlation between SNPs (chapter 3).</p><p><b>“An FDR of 5% means that each discovery has a 5% chance of being false.”</b> The FDR is about the list as a whole: of the 18 positions, you expect about 1 to be false. Those at the top of the list (P30, with p = 4 × 10<sup>−12</sup>) are almost certainly real; those near the cut-off are much less certain.</p>")}
{activity("Correct for many tests", [
    rtask("co-bonf", 'Apply the Bonferroni correction to the 47 p-values, and find the positions that survive it.', count_is(8, ['P30', 'P82']) + f' || {lastv("is.numeric(v) && length(v) == 47 && sum(v < 0.05) == 8")}'),
    rtask("co-bh", 'Apply the Benjamini–Hochberg correction, and count the positions that survive it.', count_is(18, ['P30', 'P47']) + f' || {lastv("is.numeric(v) && length(v) == 47 && sum(v < 0.05) == 18")}'),
    rtask("co-table", f'Make the table {c("virco_results")}, as above.', has_table(47, ['p', 'bonferroni', 'bh'])),
    rtask("co-pvb", f'Make {c("pv")} and apply the Bonferroni correction to it.', lastv(near([0.001, 0.004, 0.019, 0.095, 0.2, 0.4, 1, 1, 1, 1], 1e-6))),
    rtask("co-pvbh", f'Apply the BH correction to {c("pv")}.', lastv(near([0.001, 0.002, 0.006333333, 0.02375, 0.04, 0.06666667, 0.2857143, 0.625, 0.7777778, 0.9], 1e-6))),
    rtask("co-hand", 'Do the BH procedure by hand, with the comparison above.', lastv('is.logical(v) && length(v) == 10 && sum(v) == 5')),
])}
{q("co-q-thr", "With the Bonferroni correction for the 47 positions, what is the threshold that a p-value must be below, to three significant figures?", "0.00106 (0.05 / 47).", accept=ACC_THR, placeholder="A number")}
{q("co-q-bonf10", "How many of the ten p-values in <code>pv</code> are significant after the Bonferroni correction?", "3: 0.0001, 0.0004 and 0.0019 are below 0.05 / 10 = 0.005 (their adjusted values are 0.001, 0.004 and 0.019).", accept=ACC_BONF3, placeholder="A number")}
{q("co-q-bh10", "How many of the ten p-values are significant after the BH correction, at an FDR of 5%?", "5: the 5th p-value, 0.02, is below (5 / 10) × 0.05 = 0.025, and the 6th, 0.04, is above 0.03. Their BH-adjusted values are 0.001, 0.002, 0.0063, 0.024 and 0.04.", accept=ACC_BH5, placeholder="A number")}
{mcq("co-q-fdr", "18 positions pass the BH correction at an FDR of 5%. What does that mean?", [
    ("On average, about 5% of such a list (here, about 1 position) would be false discoveries, but you don’t know which", True, "The FDR is a property of the list of discoveries, not of any one of them."),
    ("Each of the 18 positions has a 5% chance of being a false positive", False, "The positions at the top are far more certain than those near the cut-off. The FDR describes the list as a whole."),
    ("There is a 95% chance that none of the 18 is a false positive", False, "That would be control of the family-wise error rate, which is what Bonferroni gives."),
])}
{mcq("co-q-more", "Why does BH keep more positions than Bonferroni?", [
    ("It controls a less strict error rate: it accepts a small proportion of false discoveries instead of guarding against even one", True, "That gives it more power, which is why it is the usual choice for screening many genes."),
    ("It ignores the number of tests", False, "It uses the number of tests: the smallest p-value is compared with q / m, just as in Bonferroni."),
    ("It is only valid for HIV data", False, "It works for any set of p-values, and is widely used for gene expression and other genomic data."),
])}
{q("co-q-two", "In two sentences, say what the family-wise error rate and the false discovery rate each control, and when you would use each.", "The FWER is the probability of at least one false positive among all the tests; controlling it (with Bonferroni) suits confirmatory claims, such as a variant that affects a disease, where any false positive matters. The FDR is the expected proportion of false positives among the results called significant; controlling it (with Benjamini–Hochberg) suits screening, where a few false leads in a list of candidates are acceptable in exchange for more power.")}
{optional("Raw and adjusted p-values", f"""
<p>Plot each position’s BH-adjusted p-value against its original p-value, on log scales. The dashed line is where the two would be equal:</p>
{block(RAW_BH)}
<p>Every adjusted value is at least as large as the original. The smallest p-values are multiplied the most (the smallest by 47, as in Bonferroni), and the largest the least. Because BH makes the adjusted values increase with the original ones, some neighbours share the same adjusted value: the points form short flat steps.</p>
{activity("Plot the adjustment", [rtask("co-plot", "Plot the BH-adjusted p-values against the original ones.", gg("GeomPoint", maps={'x': 'p', 'y': 'bh'}))])}
""")}
'''
    return chapter("correct", "2", "Corrections", "rstudio", "Correcting for many tests", 40,
                   "Two ways of correcting for many tests: Bonferroni, which guards against any false positive, and the false discovery rate, which keeps the proportion of false positives small.", body)


# ---------------------------------------------------------------------------------------------------------------------
def ch_genome():
    body = f'''
<h2 id="gw-data">Every probe on a microarray</h2>
<p>In week 3 you compared the expression of one gene, ABL1, between BCR/ABL and NEG leukaemias. The microarray measured 12,625 probes (most genes have one probe, and some have several). <code>all_expression.csv</code> has them all, for the 79 patients with these two subtypes: a row for each probe, and a column for each patient. Read it, and the patients’ details. The expression data take a few seconds:</p>
{setup('expr <- read_csv("all_expression.csv", show_col_types = FALSE)')}{setup('leuk <- read_csv("leukaemia.csv", show_col_types = FALSE)')}
{block('expr <- read_csv("all_expression.csv")' + chr(10) + 'leuk <- read_csv("leukaemia.csv")')}
<p>For calculations, turn the expression values into a matrix, with the names of the probes on its rows. Then check that its columns are in the same order as the patients in <code>leukaemia.csv</code>, so that each column gets the right subtype:</p>
{rc('dim(expr)', 'mat <- as.matrix(expr[, -(1:2)])', 'rownames(mat) <- expr$probe', 'mat[1:3, 1:4]', TWO_CODE, 'identical(colnames(mat), two$sample)', 'groups <- two$mol.biol', 'table(groups)')}
<p><code>expr[, -(1:2)]</code> is every column except the first two (the probe and the gene’s symbol). Always make a check like <code>identical()</code> before you put together data from two files: if the order differed, every test would compare the wrong patients, and still give a confident-looking answer.</p>

<h2 id="gw-test">Test every probe</h2>
<p><code>apply(mat, 1, …)</code> applies a function to each <i>row</i>: here, a t-test of each probe between the two subtypes. It does 12,625 t-tests, which takes about 10 seconds in your browser:</p>
{rc(EXPR_P)}
<p>The <b>log fold change</b> of a probe is the difference between the means of the two groups, on the log2 scale of the data: 1 means twice as high in BCR/ABL, and −1 half as high. Put everything in a table, with both adjustments, sorted by p-value:</p>
{rc(LOGFC, EXPR_RESULTS, 'expr_results')}
{rc('sum(expr_results$p < 0.05)', 'sum(expr_results$bonferroni < 0.05)', 'sum(expr_results$bh < 0.05)')}
<p>1,236 probes have p &lt; 0.05. By chance alone you would expect 12,625 × 0.05 = 631, so there must be hundreds of real differences, mixed with about 600 false positives that you can’t pick out. Bonferroni’s threshold, 0.05 / 12,625 = 4.0 × 10<sup>−6</sup>, keeps 20 probes. BH, at an FDR of 5%, keeps 162, of which about 8 (5%) are expected to be false discoveries: a much better list to follow up.</p>
<p>The three probes at the top all measure <b>ABL1</b>. That is reassuring: BCR/ABL leukaemias carry the BCR–ABL1 fusion gene, whose transcript contains most of ABL1, so the ABL1 probes detect it. A known difference that comes out on top is a <b>positive control</b>: it tells you that the analysis is working.</p>
{block(EXPR_HIST)}
<p>This histogram has the shape you hope for: flat, with a spike near 0 from the probes that really differ.</p>

<h2 id="gw-volcano">A volcano plot</h2>
<p>A <b>volcano plot</b> shows, for every probe, the size of the difference (the log fold change, across) and the strength of the evidence (−log<sub>10</sub> p, up: 2 means p = 0.01, and 6 means p = 10<sup>−6</sup>):</p>
{block(VOLCANO)}
<p>The probes that pass BH form the two arms of the “volcano”. Some have large differences but weak evidence (few patients, or a lot of variation), and some have strong evidence for tiny differences. A difference worth following up in the lab usually needs both: strong evidence and a size that could matter biologically.</p>

<h2 id="gw-gws">Genome-wide significance</h2>
<p>A GWAS tests a million or more SNPs, and the threshold it uses, <b>p &lt; 5 × 10<sup>−8</sup></b>, is a Bonferroni correction. Because of linkage disequilibrium (chapter 5), the millions of common SNPs in a European-ancestry genome behave like about one million independent tests, and 0.05 / 1,000,000 = 5 × 10<sup>−8</sup>. So the threshold counts independent regions of the genome rather than SNPs, which makes it less conservative than a Bonferroni correction for every SNP. It is a convention, not a law: studies of African-ancestry populations, whose genomes have shorter stretches of LD and so more independent tests, and studies of rare variants, may need stricter thresholds.</p>
{figure(figs.manhattan_sketch(), 'A Manhattan plot of a GWAS: −log₁₀ p for every SNP, along the chromosomes, with a line at genome-wide significance. A real association shows up as a tower of SNPs in LD with each other.')}
{callout("concept", "The winner’s curse, and replication", "<p>A SNP that only just passes a strict threshold is likely to have had some luck: its effect, in that sample, happened to be estimated on the high side. So the first estimate of the effect of a newly discovered variant is usually too large, and it shrinks in later studies. This is the <b>winner’s curse</b>. The answer is <b>replication</b>: a finding is accepted when an independent study, ideally of a different population, finds the same association, and the effect is best estimated in the replication study.</p>")}
{activity("A genome-wide comparison", [
    rtask("gw-read", f'Read {c("all_expression.csv")} into {c("expr")} and {c("leukaemia.csv")} into {c("leuk")}.', has_table(12625, ['probe', 'symbol']) + ' && ' + has_table(89, ['mol.biol', 'ABL1'])),
    rtask("gw-mat", f'Make the matrix {c("mat")} and the subtypes {c("groups")}, and check that the patients are in the same order.', has_obj('is.matrix(o) && is.numeric(o) && all(dim(o) == c(12625, 79))') + ' && ' + has_obj('is.character(o) && length(o) == 79 && sum(o == "BCR/ABL") == 37')),
    rtask("gw-tests", 'Test every probe with a t-test.', has_vec(12625, 'sum(o < 0.05) == 1236')),
    rtask("gw-results", f'Make the table {c("expr_results")}, with the log fold changes and both adjustments.', has_table(12625, ['log_fc', 'p', 'bonferroni', 'bh'])),
    rtask("gw-count", 'Count the probes that pass the BH correction at 5%.', lastv('is.numeric(v) && length(v) == 1 && v == 162')),
    rtask("gw-hist", 'Draw the histogram of the 12,625 p-values.', gg("GeomBar", stat="StatBin", maps={'x': 'p'}, extra='nrow(v$data) == 12625')),
    rtask("gw-volcano", 'Draw the volcano plot.', gg("GeomPoint", maps={'x': 'log_fc'})),
])}
{q("gw-q-exp", "If no gene differed between the subtypes, how many of the 12,625 probes would you expect to have p &lt; 0.05?", "631 (12,625 × 0.05). The 1,236 observed means that there are hundreds of real differences, but p &lt; 0.05 alone can’t tell you which.", accept=ACC_631, placeholder="A number")}
{q("gw-q-bh", "How many probes pass the BH correction at an FDR of 5%?", "162: 128 are higher in BCR/ABL leukaemias and 34 lower. Bonferroni keeps 20.", accept=ACC_162, placeholder="A number")}
{q("gw-q-false", "About how many of those probes would you expect to be false discoveries?", "About 8: 5% of 162.", accept=ACC_8, placeholder="A number")}
{mcq("gw-q-abl1", "Why is it reassuring that the three probes with the smallest p-values measure ABL1?", [
    ("BCR/ABL leukaemias carry the BCR–ABL1 fusion, which the ABL1 probes detect, so a difference that must be there was found: a positive control", True, "If the known difference hadn’t come out near the top, you would suspect a problem with the analysis, such as patients matched to the wrong subtypes."),
    ("Because ABL1 has the most probes on the array", False, "It has three probes, which is unusual but not the reason: they come out top because the expression really differs."),
    ("It proves that the other 159 probes are real", False, "It shows that the analysis works; the FDR still says that about 8 of the list are expected to be false."),
])}
{mcq("gw-q-5e8", "Where does the genome-wide significance threshold of 5 × 10<sup>−8</sup> come from?", [
    ("A Bonferroni correction for about one million independent common variants: 0.05 / 1,000,000", True, "LD makes the millions of SNPs behave like about a million independent tests in European-ancestry genomes."),
    ("It is the smallest p-value a computer can calculate", False, "Computers can calculate much smaller p-values. It is a multiple-testing correction."),
    ("It is the false discovery rate of a GWAS", False, "It controls the family-wise error rate, not the FDR."),
])}
{mcq("gw-q-winner", "A SNP just passes genome-wide significance in a first study, with an odds ratio of 1.4. What is most likely in an independent replication study?", [
    ("A smaller odds ratio, if the association is replicated at all", True, "This is the winner’s curse: a SNP that only just passes a strict threshold has probably had its effect overestimated."),
    ("Exactly the same odds ratio", False, "Estimates vary between studies, and the first one is biased upwards by the selection."),
    ("A larger odds ratio, because the replication study is designed for it", False, "The effect usually shrinks: the first estimate was selected for being large."),
])}
'''
    return chapter("genome", "3", "Genome-wide", "rstudio", "A genome-wide comparison", 35,
                   "Test all 12,625 probes of a microarray for a difference between two leukaemia subtypes, see which survive the corrections, and meet the threshold that genome-wide association studies use.", body)


# ---------------------------------------------------------------------------------------------------------------------
def ch_structure():
    body = f'''
<h2 id="ps-freq">Allele frequencies differ between populations</h2>
<p>The <b>Human Genome Diversity Project</b> (HGDP) collected DNA from people of 51 populations around the world. <code>hgdp_akt1.csv</code> has 1,064 of them, genotyped at four SNPs in <i>AKT1</i>, a gene of insulin signalling and muscle growth that FAMuSS studied too. How common is the A allele of <code>AKT1.C0756A</code> in each part of the world? <code>str_count()</code> counts the A’s in each genotype (CC has none, CA one and AA two), so their mean, divided by 2, is the frequency of the allele:</p>
{setup('hgdp <- read_csv("hgdp_akt1.csv", show_col_types = FALSE)')}
{block('hgdp <- read_csv("hgdp_akt1.csv")')}
{rc(FREQS, 'freqs')}
{block(FREQ_PLOT)}
<p><code>fct_reorder()</code> puts the areas in the order of their frequencies, so that the bars go from the highest to the lowest. The frequency ranges from 0.30 in Central Africa to 0.03 in New Guinea. Differences like this are normal: populations that have been apart for many generations drift apart in their allele frequencies, so most SNPs differ in frequency between populations to some extent.</p>

<h2 id="ps-strat">How ancestry creates false associations</h2>
<p>Now suppose that a study mixes people from two populations, and that the trait differs between the populations for reasons that have nothing to do with a particular SNP: diet, environment, other genes, or even how the samples were collected. Then every SNP whose allele frequency differs between the populations will seem to be associated with the trait. This is <b>population stratification</b>, and it is a form of confounding (week 4): ancestry affects both the genotype and the trait.</p>
{figure(figs.stratification(), 'Population stratification. Within each population the SNP has no effect (the dashed lines are flat), but population B has more copies of the allele and higher values of the trait. Pooled, the allele seems to raise the trait.')}
<p>To see what this does to a genome-wide study, simulate one. The code below makes the genotypes of 400 people at 500 SNPs, using what you know from week 2: the number of copies of an allele that a person carries is binomial, with size 2 and the allele’s frequency as its probability. Half of the people come from population 1 and half from population 2, whose allele frequencies differ a little. The trait is higher, on average, in population 2, and no SNP has any effect on it:</p>
{block(SIM)}
{setup(SIM)}
<p><code>sapply()</code> applies a function to each element of a vector, here each of the 500 frequencies, and puts the results together: 500 columns of 200 genotypes. <code>rbind()</code> stacks the two populations, so <code>sim_geno</code> is a matrix with a row for each of the 400 people and a column for each SNP.</p>

<h2 id="ps-pca">Principal component analysis</h2>
<p><b>Principal component analysis</b> (PCA) finds the directions in which a set of variables varies most. The first principal component (PC1) is the combination of the variables that varies most from person to person, PC2 the one that varies most of what is left, and so on. Applied to genotypes, the first principal components usually capture <b>ancestry</b>, because ancestry affects many SNPs at once. <code>prcomp()</code> does it. <code>scale. = TRUE</code> puts every SNP on the same scale first; otherwise SNPs whose genotypes vary more would count for more.</p>
{rc('pca <- prcomp(sim_geno, scale. = TRUE)', 'summary(pca)$importance[, 1:4]')}
<p>PC1 explains only 2.9% of the variation in the genotypes, and PC2 to PC4 about 0.9% each. But plot PC1 and PC2:</p>
{block(PCS + chr(10) + PC_PLOT)}{setup(PCS)}
<p>PC1 separates the two populations completely. It has found every person’s ancestry from their genotypes alone, without being told who came from where. (The sign of a principal component is arbitrary, so your plot could be the mirror image of someone else’s.)</p>

<h2 id="ps-adjust">False positives, and how to remove them</h2>
<p>Test every SNP for an association with the trait, first on its own and then adjusted for PC1, as a covariate in the regression. Each line takes a few seconds:</p>
{rc(P_NAIVE, P_PC1, 'sum(p_naive < 0.05)', 'sum(p_pc1 < 0.05)', 'sum(p.adjust(p_naive, method = "bonferroni") < 0.05)')}
<p>Without adjustment, 148 of the 500 SNPs have p &lt; 0.05, against the 25 expected by chance, and 10 even pass the Bonferroni correction: ten findings that would be published as significant, and every one of them false. Adjusted for PC1, 25 SNPs have p &lt; 0.05: just what chance predicts.</p>
<p>A <b>QQ plot</b> (quantile–quantile plot) of p-values shows this at a glance. It plots the p-values you observed, sorted and on the −log<sub>10</sub> scale, against the values you would expect if every null hypothesis were true. <code>ppoints(500)</code> gives those expected values: 500 evenly spaced probabilities between 0 and 1.</p>
{block(QQ_SIM)}
<p>If nothing is going on, the points lie on the diagonal. The unadjusted p-values lift off it from the very start: the whole distribution is shifted, which is the signature of <b>inflation</b> by something that affects every test, such as population structure. A few real associations would only lift the last few points, at the top right. After adjustment for PC1, the points follow the line.</p>
{figure(figs.qq_shapes(), 'Three QQ plots of p-values: no signal (the points follow the line), a few real signals (only the top points rise above it), and inflation (the whole line of points is lifted, from the start).')}
{callout("concept", "Population structure in real studies", "<p>A GWAS calculates principal components from many thousands of SNPs across the genome, after removing SNPs in strong LD with each other so that a few regions don’t dominate. It includes the first few (often 10) as covariates, or uses a <b>linear mixed model</b>, which also allows for relatedness between participants. Self-reported ethnicity is a much cruder measure of ancestry. Studies also report the <b>genomic inflation factor</b>, λ, which compares the middle (median) of the observed test statistics with what is expected if nothing is going on. λ near 1 means no inflation; above about 1.1 is a warning sign.</p>")}
{callout("warn", "Principal components are not races", "<p>A PCA of real people often shows clusters, but they are clusters of people with similar ancestry along axes that are <b>continuous</b>: many people fall between clusters, and the clusters depend on which populations were sampled. Read a PCA plot as a map of genetic similarity, not as evidence of discrete groups.</p>")}
{activity("Population structure", [
    rtask("ps-read", f'Read {c("hgdp_akt1.csv")} into {c("hgdp")}.', has_table(1064, ['Population', 'Geographic.area', 'AKT1.C0756A'])),
    rtask("ps-freq", 'Calculate the frequency of the A allele of AKT1.C0756A in each geographic area.', has_obj('is.data.frame(o) && nrow(o) == 14 && "freq_A" %in% names(o) && isTRUE(abs(max(o$freq_A) - 0.302521) < 0.001)')),
    rtask("ps-plot", 'Draw the frequencies.', gg("Geom", maps={'x': 'freq_A'})),
    rtask("ps-sim", 'Simulate the two populations, as above.', has_obj('is.matrix(o) && is.numeric(o) && all(dim(o) == c(400, 500))') + ' && ' + has_vec(400)),
    rtask("ps-pca", 'Do the PCA of the genotypes.', has_obj('inherits(o, "prcomp") && nrow(o$x) == 400')),
    rtask("ps-pcplot", 'Plot PC2 against PC1, coloured by population.', gg("GeomPoint", maps={'x': 'PC1', 'y': 'PC2', 'colour': 'population'})),
    rtask("ps-naive", 'Test every SNP without adjustment.', has_vec(500, 'min(o) >= 0 && max(o) <= 1 && sum(o < 0.05) > 90')),
    rtask("ps-adj", 'Test every SNP adjusted for PC1.', has_vec(500, 'min(o) >= 0 && max(o) <= 1 && min(o) < 0.015 && sum(o < 0.05) < 45 && sum(o < 0.05) > 5')),
    rtask("ps-qq", 'Draw the QQ plot of both sets of p-values.', gg("GeomPoint", maps={'x': 'expected', 'y': 'observed', 'colour': 'model'}, extra=ABLINE)),
])}
{q("ps-q-freq", "What is the highest frequency of the A allele of AKT1.C0756A in any geographic area, to two decimal places?", "0.30, in Central Africa. The lowest is 0.03, in New Guinea.", accept=ACC_FREQ, placeholder="A frequency")}
{q("ps-q-naive", "In the simulated study, how many of the 500 SNPs have p &lt; 0.05 without adjustment?", "148, against the 25 (5% of 500) expected by chance. (With a different seed, the number would differ a little.)", accept=ACC_148, placeholder="A number")}
{mcq("ps-q-ten", "Ten SNPs pass even the Bonferroni correction in the unadjusted analysis. Are they real associations?", [
    ("No: no SNP affects the trait; their frequencies differ between the populations, and so does the trait. Ancestry confounds the association", True, "That is population stratification. Adjusting for ancestry (PC1) removes it."),
    ("Yes: Bonferroni guarantees that they are real", False, "Bonferroni controls false positives due to chance across many tests. It can’t remove bias from confounding, which affects every test."),
    ("Some of them: on average half of them", False, "We simulated the data, so we know that none of them is real."),
])}
{mcq("ps-q-pc1", "In a case–control GWAS, the cases and the controls are separated along PC1. What should you worry about?", [
    ("That the cases and controls differ in ancestry, so any SNP whose frequency varies with ancestry will look associated with the disease", True, "Include the principal components as covariates (or match cases and controls on ancestry), and check the QQ plot and λ for inflation."),
    ("Nothing: PC1 shows that the disease is genetic", False, "A difference along PC1 shows a difference in ancestry, which is a confounder, not evidence about the disease."),
    ("That the PCA has failed", False, "The PCA has done its job: it has revealed a difference in ancestry that would confound the study."),
])}
{mcq("ps-q-scale", "Why use <code>scale. = TRUE</code> in <code>prcomp()</code> for genotypes?", [
    ("So that every SNP counts equally, instead of SNPs with more variable genotypes dominating the components", True, "Without scaling, the variables with the largest variances dominate a PCA."),
    ("Because prcomp() can’t handle genotypes without it", False, "It can; the result would just be dominated by the most variable SNPs."),
    ("To remove population structure", False, "Scaling changes how much each SNP counts; it doesn’t remove structure. The principal components reveal it."),
])}
{optional("Inflation, and a mixture of populations", f"""
<p>The genomic inflation factor, λ, divides the median of the tests’ chi-square statistics (which you can get back from their p-values with <code>qchisq()</code>) by its expected value when nothing is going on, 0.455:</p>
{rc(LAMBDA, LAMBDA_PC1)}
<p>λ is 3.4 without adjustment: very strong inflation, because the populations in this simulation are very different. Adjusted for PC1 it is 0.87, a little below 1 by chance.</p>
<p>A mixture of populations also shows up in Hardy–Weinberg tests, as in week 3. Test AKT1.C0756A in all the HGDP participants, and then in each geographic area:</p>
{rc('hwe_p(hgdp$AKT1.C0756A)', HWE_AREAS)}
<p>Pooled, the SNP fails the test (p = 0.008): there are too few heterozygotes (291, against 317 expected), the Wahlund effect. Within most areas it is in equilibrium. The exception, South America, is itself a mixture: its 58 people come from three small, isolated populations (the Karitiana, the Surui and Colombians), whose allele frequencies differ a lot.</p>
{activity("Inflation and HWE", [rtask("ps-lambda", "Calculate λ for the unadjusted p-values.", lastv("is.numeric(v) && length(v) == 1 && v > 2")),
                                rtask("ps-hwe", "Test AKT1.C0756A for Hardy–Weinberg equilibrium within each geographic area.", lastv('is.data.frame(v) && nrow(v) == 14 && "hwe" %in% names(v)'))])}
""")}
'''
    return chapter("structure", "4", "Population structure", "rstudio", "Population structure and principal components", 45,
                   "Allele frequencies differ between populations. When a study mixes populations, that can create associations that aren’t real. Principal components reveal ancestry and allow for it.", body)


# ---------------------------------------------------------------------------------------------------------------------
def ch_ld():
    body = f'''
<p>Alleles at SNPs that are close together on a chromosome tend to be inherited together, because recombination rarely separates them. So, in a population, a person’s allele at one SNP tells you something about their allele at a SNP nearby. This association between the alleles of nearby SNPs is <b>linkage disequilibrium</b> (LD).</p>
{figure(figs.ld_haplotypes(), 'Linkage disequilibrium. Each line is one copy of a stretch of chromosome. The alleles of SNPs 1 and 2, which are close together, almost always go together; recombination has shuffled those of SNP 3, far away, so it is independent of them.')}
<p>LD is usually measured by <b>r²</b>, the square of the correlation between the numbers of copies of the alleles at two SNPs: 1 means that one SNP predicts the other perfectly, and 0 that they are independent. (Strictly, r² is defined for the alleles that sit together on one copy of a chromosome; with genotypes, the correlation between the allele counts is a close and widely used approximation.) The four SNPs in the HGDP data lie within a few thousand bases of each other in <i>AKT1</i>. <code>across(everything(), dosage)</code> applies <code>dosage()</code> (from <code>snps.R</code>) to every column (you met <code>across()</code> in week 2), and <code>cor()</code> gives the correlations between all the columns:</p>
{rc(HGDP_D, 'cor(hgdp_d, use = "pairwise.complete.obs")^2')}
<p>AKT1.C0756A and AKT1.C6024T have r² = 0.97: they almost always travel together. You can see LD in the genotypes themselves. Here are two SNPs in <i>AKT1</i> in FAMuSS, counted against each other:</p>
{setup('fms <- read_csv("famuss.csv", show_col_types = FALSE)')}
{block('fms <- read_csv("famuss.csv")')}
{rc('table(fms$akt1_g15129a, fms$akt1_g14803t)')}
<p>Nearly everyone with AA at the first SNP has TT at the second, nearly everyone with AG has GT, and nearly everyone with GG has GG: r² = 0.89. FAMuSS genotyped 24 SNPs in <i>AKT1</i>. Calculate r² for every pair, and draw it as a <b>heat map</b>:</p>
{block(AKT1)}
{block(LD_HEAT)}
<p>Each square is a pair of SNPs, and the darker its colour, the stronger their LD. The diagonal is each SNP with itself (r² = 1). The other dark squares are pairs in strong LD, such as akt1_g15129a and akt1_g14803t. (The SNPs are in alphabetical order, not in their order along the chromosome, so the groups of SNPs in LD with each other aren’t next to each other.)</p>

<h2 id="ld-gwas">What LD means for association studies</h2>
<ul>
<li><b>Tag SNPs.</b> Because of LD, a genotyping array doesn’t need to measure every variant: a few hundred thousand well-chosen SNPs “tag” most of the common variants in the genome, and many others can be filled in statistically (<b>imputation</b>).</li>
<li><b>Peaks, not points.</b> A variant that affects a trait makes every SNP in LD with it look associated too, which is why an association in a GWAS shows up as a tower of SNPs in a Manhattan plot.</li>
<li><b>Association is not causation.</b> The SNP with the smallest p-value may just be in LD with the variant that matters. Finding that variant needs <b>fine-mapping</b> and laboratory studies.</li>
<li><b>Correlated tests.</b> Tests of SNPs in LD are correlated, so there are fewer independent tests than SNPs: Bonferroni is too strict, and genome-wide significance counts independent regions instead.</li>
<li><b>LD differs between populations.</b> It extends over shorter distances in African populations, which have the longest history, so a SNP that tags a variant in one population may not tag it in another.</li>
</ul>
{activity("Linkage disequilibrium", [
    rtask("ld-hgdp", 'Calculate r² between the four AKT1 SNPs in the HGDP data.', lastv('is.matrix(v) && all(dim(v) == c(4, 4)) && isTRUE(abs(v[1, 2] - 0.9685746) < 0.001)')),
    rtask("ld-table", 'Count the genotypes of akt1_g15129a against those of akt1_g14803t in FAMuSS.', lastv('inherits(v, "table") && all(dim(v) == c(3, 3))')),
    rtask("ld-r2", f'Calculate r² for every pair of the 24 AKT1 SNPs in FAMuSS, in {c("r2")}.', has_obj('is.matrix(o) && is.numeric(o) && all(dim(o) == c(24, 24))')),
    rtask("ld-heat", 'Draw the heat map.', gg("GeomTile", maps={'fill': 'r2'})),
])}
{q("ld-q-r2", "What is r² between akt1_g15129a and akt1_g14803t, to two decimal places? (Look it up in <code>r2</code>.)", "0.89: <code>r2[\"akt1_g15129a\", \"akt1_g14803t\"]</code>. The two SNPs are in strong LD.", accept=ACC_R2, placeholder="A number")}
{mcq("ld-q-tag", "A GWAS finds a strong association with a SNP that is in strong LD (r² above 0.9) with 30 other SNPs. What can you conclude?", [
    ("That a variant in this region is associated with the trait; the causal variant could be any of the SNPs in LD, or another variant they tag", True, "Fine-mapping (often with data from several populations, whose LD differs) and laboratory studies are needed to find the variant that matters."),
    ("That the SNP with the smallest p-value is the cause", False, "SNPs in strong LD have similar p-values, and which one comes out top is partly chance."),
    ("That the 31 SNPs each have an independent effect", False, "They are associated because they travel together, not because each one has an effect."),
])}
{mcq("ld-q-bonf", "Why is a Bonferroni correction for every SNP too strict in a GWAS?", [
    ("SNPs in LD give correlated tests, so there are fewer independent tests than SNPs", True, "That is why genome-wide significance, 5 × 10<sup>−8</sup>, counts independent regions rather than SNPs."),
    ("Because most SNPs are rare", False, "Common SNPs are the ones tested in most GWAS. The issue is the correlation between tests."),
    ("Because a GWAS doesn’t need to control false positives", False, "It does: that is the point of the genome-wide threshold."),
])}
'''
    return chapter("ld", "5", "Linkage disequilibrium", "rstudio", "Linkage disequilibrium", 20,
                   "Nearby variants travel together. That makes genotyping arrays possible, and it shapes how the results of association studies look and what they mean.", body)


# ---------------------------------------------------------------------------------------------------------------------
def ch_gwas():
    body = f'''
<p>You now have everything for a genetic association study. FAMuSS genotyped 222 SNPs in 89 genes: not a whole genome, but enough to go through every step of a GWAS.</p>
{figure(figs.gwas_pipeline(), 'The steps of a genetic association study.')}

<h2 id="g5-qc">Quality control</h2>
<p>Three standard checks for each SNP:</p>
<ul>
<li>Its <b>call rate</b>: the proportion of people with a genotype. A SNP that often fails may be genotyped badly. A GWAS removes SNPs with a call rate below 95–98%, but FAMuSS genotyped many of its SNPs in only part of the study, so here the threshold is 30%, which removes the SNPs genotyped in very few people.</li>
<li>Its <b>minor allele frequency</b> (MAF): the frequency of the less common allele. A rare variant gives unstable estimates and has very little power in a study of this size, so remove SNPs with a MAF below 5%.</li>
<li><b>Hardy–Weinberg equilibrium</b>: a strong departure is often a sign of genotyping errors (week 3). Test it within one ancestry group (here the Caucasian participants, the largest group), and remove SNPs with p &lt; 10<sup>−6</sup>.</li>
</ul>
<p>The genotypes are in all the columns after the first 13. <code>sapply()</code> applies a function to each SNP’s name in turn, and gives back the results:</p>
{rc('cauc <- filter(fms, Race == "Caucasian")', 'snps <- names(fms)[-(1:13)]', 'length(snps)', QC, 'qc')}
{rc('sum(qc$call_rate < 0.3)', 'sum(qc$maf < 0.05)', 'sum(qc$hwe < 1e-6, na.rm = TRUE)', PASSED, 'nrow(passed)')}
<p>31 SNPs have a call rate below 30%, 40 have a MAF below 5% (some of them have a low call rate too), and 5 fail the Hardy–Weinberg test, such as <code>ucp2_ct</code> (p = 5 × 10<sup>−20</sup>). (<code>na.rm = TRUE</code> is needed because <code>hwe_p()</code> gives NA for the SNPs with only one allele in the Caucasian participants.) 163 SNPs pass all three checks. When you report a study, say how many SNPs each filter removed, and why.</p>

<h2 id="g5-test">Test every SNP</h2>
<p>As in week 4, the test is a linear regression of the gain in strength on the number of copies of the minor allele, adjusted for sex and age. A function does it for one SNP and gives back a one-row table with the effect of each copy (<code>beta</code>), its standard error and its p-value. Inside a model formula, <code>data[[snp]]</code> takes the column whose name is in <code>snp</code>:</p>
{rc(ASSOC, 'assoc("actn3_r577x")')}
<p>The same result as in week 4: 4.10 points per copy (p = 0.013), because the minor allele of ACTN3 R577X in FAMuSS is T, the allele you counted then. <code>lapply()</code> applies the function to each SNP that passed quality control and gives back a list of one-row tables, which <code>bind_rows()</code> stacks into one table. Then adjust the p-values, and sort the table:</p>
{rc(SCAN, ADJUST, 'gwas', 'sum(gwas$p < 0.05)')}
<p>12 SNPs have p &lt; 0.05, against the 8 (163 × 0.05) expected by chance. None passes the Bonferroni correction (p &lt; 0.05 / 163 = 3.1 × 10<sup>−4</sup>), and none passes BH either: the smallest BH-adjusted p-value is 0.58.</p>

<h2 id="g5-plots">QQ and Manhattan plots</h2>
<p>For the QQ plot, the table must be sorted by p-value (it is), so that the observed p-values line up with the expected ones from <code>ppoints()</code>:</p>
{block(QQ_GWAS)}
<p>The points follow the diagonal, with at most a slight lift at the top: what you would see if no SNP had an effect, or if the effects were too small for a study of this size to detect. There is no sign of inflation.</p>
<p>A real Manhattan plot puts the SNPs in their order along the chromosomes. FAMuSS doesn’t record the SNPs’ positions, so put them in alphabetical order, which keeps the SNPs of each gene together, and number them. The dashed line is the Bonferroni threshold, and the SNPs with p &lt; 0.02 are labelled:</p>
{block(MANHATTAN)}
<p>Remember that the height of a point is the strength of the evidence (−log<sub>10</sub> p), not the size of the effect: a small effect in many people can be as tall as a large effect in a few.</p>

<h2 id="g5-interpret">What does it show?</h2>
<p>No SNP is significant once you allow for 163 tests. The smallest p-value is for <code>acdc_rs1501299</code>, a SNP in the gene for adiponectin, a hormone made by fat tissue: each copy of its A allele went with a gain 4.3 points smaller (p = 0.007). ACTN3 R577X comes second.</p>
<p>In week 4 you could reasonably take p = 0.013 for ACTN3 as evidence of an effect. That was a single test of a hypothesis that the study had been designed to test, with support from earlier research. Here, the same p-value is one of 163, and the second smallest of 163 p-values is expected to be about this small by chance alone. How much a p-value means depends on how many tests were done, and on how plausible the hypothesis was beforehand.</p>
<p>The study is also small for genetics: 400 to 975 people were tested for each SNP, and the effects of common variants on complex traits are small (ACTN3 explained about 1% of the variation in the gain in strength). Genome-wide studies of such traits need tens or hundreds of thousands of people, and their findings need replication.</p>
{activity("A mini-GWAS", [
    rtask("g5-qc", f'Make the quality-control table {c("qc")}, with the call rate, MAF and HWE p-value of every SNP.', has_table(222, ['snp', 'call_rate', 'maf', 'hwe'])),
    rtask("g5-pass", f'Keep the SNPs that pass all three checks, in {c("passed")}.', has_obj('is.data.frame(o) && nrow(o) == 163 && all(c("snp", "call_rate") %in% names(o))')),
    rtask("g5-assoc", f'Make the function {c("assoc()")}, and test ACTN3 R577X with it.', lastv('is.data.frame(v) && nrow(v) == 1 && "p" %in% names(v) && isTRUE(abs(v$p - 0.01309296) < 1e-5)')),
    rtask("g5-scan", 'Test every SNP that passed, and adjust the p-values.', has_obj('is.data.frame(o) && nrow(o) == 163 && all(c("beta", "p", "bonferroni", "bh") %in% names(o))')),
    rtask("g5-qq", 'Draw the QQ plot.', gg("GeomPoint", maps={'x': 'expected', 'y': 'observed'}, extra=ABLINE + ' && nrow(v$data) == 163')),
    rtask("g5-man", 'Draw the Manhattan-style plot, with the Bonferroni threshold.', gg("GeomPoint", extra=HLINE + ' && nrow(v$data) == 163')),
])}
{q("g5-q-pass", "How many SNPs pass quality control?", "163 of the 222: 31 have a call rate below 30%, 25 more have a MAF below 5%, and 3 more fail the HWE test.", accept=ACC_163, placeholder="A number")}
{q("g5-q-n05", "How many SNPs have p &lt; 0.05 before any correction?", "12, against about 8 expected by chance (163 × 0.05 = 8.2). That is not much more than chance alone would give.", accept=ACC_12, placeholder="A number")}
{q("g5-q-top", "Which SNP has the smallest p-value?", "<code>acdc_rs1501299</code> (p = 0.0073; BH-adjusted 0.58).", accept=ACC_TOP, placeholder="The SNP’s name")}
{mcq("g5-q-actn3", "In week 4, ACTN3 R577X had p = 0.013 and you took it as evidence of an effect. Here the same p-value isn’t significant. Which is right?", [
    ("Both: a single test of a hypothesis with prior support is different from the second-best of 163 tests, which would be this small by chance", True, "How much a p-value means depends on the number of tests and on how plausible the hypothesis was. This is why a study should say in advance which hypotheses it will test."),
    ("Week 4 was wrong: every p-value should always be corrected for every test anyone has ever done", False, "Corrections apply to the family of tests in an analysis. A single pre-specified hypothesis is a family of one."),
    ("This week is wrong, because ACTN3 has a real effect", False, "It may well have, and the evidence from other studies matters. But this scan, on its own, can’t distinguish it from chance."),
])}
{mcq("g5-q-qq", "In your QQ plot of a GWAS, the points lift off the diagonal early, across all the SNPs. Is it inflation or a true signal, and how would you tell?", [
    ("Probably inflation, such as from population structure: a few true signals lift only the top points. Check λ, and whether adjusting for principal components brings the points back to the line", True, "Inflation shifts the whole distribution of p-values. Real associations affect a few SNPs (and those in LD with them)."),
    ("A true signal: the more points above the line, the stronger the evidence", False, "When every SNP is lifted, something affects all the tests, which is far more likely to be bias than thousands of real effects."),
    ("Neither: QQ plots can’t show problems", False, "Showing inflation is what they are for."),
])}
{mcq("g5-q-manh", "In a Manhattan plot, one SNP is much taller than another. What does that tell you?", [
    ("That the evidence against its null hypothesis is stronger (a smaller p-value); not necessarily that its effect is larger", True, "−log<sub>10</sub> p depends on the size of the effect, its variability and the number of people. Look at beta and its confidence interval for the size."),
    ("That its effect on the trait is larger", False, "The y-axis is −log<sub>10</sub> p, not the effect. A small effect of a common variant can give a smaller p-value than a large effect of a rare one."),
    ("That it is the causal variant", False, "It may be in LD with the causal variant (chapter 5)."),
])}
{optional("In one ancestry group", f"""
<p>FAMuSS mixes people of several ancestries. One way to make sure that ancestry doesn’t confound the results, when you have no genome-wide data to calculate principal components, is to analyse one ancestry group on its own. <code>assoc()</code> takes the data as its second argument, so you can run the scan in the Caucasian participants alone:</p>
{rc(CAUC_SCAN, 'head(gwas_cauc)')}
<p>In the Caucasian participants, ACTN3 R577X comes top (p = 0.005), but with a BH-adjusted p-value of 0.79 it still isn’t significant once you allow for 163 tests. Restricting to one group removes confounding by ancestry, at the cost of fewer people.</p>
{activity("One ancestry group", [rtask("g5-cauc", "Run the scan in the Caucasian participants alone.", has_obj('is.data.frame(o) && nrow(o) == 163 && "bh" %in% names(o) && isTRUE(o$snp[1] == "actn3_r577x")'))])}
""")}
'''
    return chapter("gwas", "6", "A mini-GWAS", "rstudio", "A mini-GWAS of the FAMuSS SNPs", 50,
                   "Put the week together: quality control, a test of every SNP, a correction for the number of tests, QQ and Manhattan plots, and an honest interpretation.", body)


# ---------------------------------------------------------------------------------------------------------------------
def ch_report():
    body = f'''
<p>This week’s report is your mini-GWAS. It becomes the core of your assessment, so it is worth doing carefully. <b>Create this file</b> saves it as <code>week5.qmd</code> in your home folder, next to <code>snps.R</code>, which it uses.</p>
{codefile("week5.qmd", TEMPLATE)}
<p>The report runs the quality control and the association tests. Add the QQ plot and the Manhattan-style plot, as in the last chapter, and render it again. Rendering takes a little longer this week, because it tests every SNP.</p>
{activity("Write and render your report", [
    task("rp5-create", 'Create <code>week5.qmd</code> with the button above, and put your name in it.', auto="file:create path~week5.qmd"),
    task("rp5-render", 'Render it.', auto="knit:done path~week5.qmd ok=true"),
    task("rp5-qq", 'Under <b>QQ plot</b>, add a chunk that draws the QQ plot of the p-values.', check=r"has:week5.qmd|ppoints\("),
    task("rp5-man", 'Under <b>Manhattan plot</b>, add a chunk that draws the Manhattan-style plot, with a line at the Bonferroni threshold.', check=r"has:week5.qmd|geom_hline\("),
    task("rp5-render2", 'Render the report again, and check that it shows both plots.', check=r"has:week5.html|data:image/png[\s\S]*data:image/png"),
])}
'''
    return chapter("report", "7", "Your report", "rstudio", "Your mini-GWAS report", 25,
                   "Put the mini-GWAS into a report that renders from the data: this is the start of the core section of your assessment.", body)


# ---------------------------------------------------------------------------------------------------------------------
def ch_wrapup():
    body = f'''
<h2 id="w5-ideas">This week’s main ideas</h2>
<ul>
<li>When the null hypothesis is true, p-values are <b>uniform</b>: 5% of tests give p &lt; 0.05 by chance, so many tests give many false positives.</li>
<li>The <b>family-wise error rate</b> is the chance of at least one false positive; <b>Bonferroni</b> controls it by testing at α / <i>m</i>. It is safe but conservative, especially for correlated tests.</li>
<li>The <b>false discovery rate</b> is the expected proportion of false positives among the discoveries; <b>Benjamini–Hochberg</b> controls it, with more power. Use it for screening; use FWER control to confirm.</li>
<li>A histogram of p-values that is flat with a spike near 0 shows real signals on a background of true nulls.</li>
<li>Genome-wide significance, <b>5 × 10<sup>−8</sup></b>, is a Bonferroni correction for about a million independent common variants. First estimates of effects are inflated (the <b>winner’s curse</b>), so findings need <b>replication</b>.</li>
<li><b>Population stratification</b> confounds association studies when ancestry is related to both genotype and trait. <b>Principal components</b> of the genotypes capture ancestry and are used as covariates; QQ plots and λ show inflation.</li>
<li><b>Linkage disequilibrium</b> makes nearby SNPs travel together: GWAS hits are peaks, the top SNP may not be causal, and tests are correlated.</li>
<li>A GWAS goes: quality control (call rate, MAF, HWE), a test of every SNP with covariates, a correction for the number of tests, QQ and Manhattan plots, and an interpretation that considers LD, confounding and replication.</li>
</ul>
{homework("The mini-GWAS write-up", f"""
<p>This write-up becomes the core inference section of your assessment: the multiple-testing correction and the association results. Finish it in <code>week5.qmd</code>, render it, and keep the <code>.qmd</code> and <code>.html</code> files (download them from the Files tab).</p>
{activity("Homework 5", [
    task("hw5-qc", "Report the quality control: how many SNPs each filter removed, and how many were left.", check=r"has:week5.qmd|sum\(qc\$|removed|excluded"),
    task("hw5-hits", "List the SNPs that pass each correction, if any, with filter() (an empty table is a result too).", check=r"has:week5.qmd|filter\([^)]*\b(bh|bonferroni)\b"),
    task("hw5-fdr", "Explain, in a few sentences, the difference between controlling the family-wise error rate and the false discovery rate, and which you would use here.", check=r"has:week5.qmd|^(?=[\s\S]*([Ff]amily-wise|FWER))(?=[\s\S]*([Ff]alse discovery|FDR))"),
    task("hw5-critique", "Write a paragraph that critiques the result: possible inflation, the role of population structure and LD, the size of the study, and what replication would add.", check=r"has:week5.qmd|[Rr]eplicat"),
    task("hw5-render", "Render the report, and check that the critique appears in it.", check=r"has:week5.html|[Rr]eplicat"),
    task("hw5-anc", "Stretch: re-run the analysis allowing for ancestry, in the Caucasian participants alone (as in the last part of chapter 6) or with Race as a covariate, and say whether the top association changes.", check=r"has:week5.qmd|data = cauc|\+ ?Race\b"),
])}
{q("hw5-q-strat", "What would your QQ plot look like if the analysis were confounded by population structure that you hadn’t allowed for, and how would you fix it?", "The points would rise above the diagonal from early on, across the whole range of p-values, not just at the top (λ above 1), because ancestry would shift the test statistics of every SNP whose frequency differs between the groups. You would allow for ancestry: with principal components of genome-wide genotypes as covariates (or a mixed model), or by analysing a group of similar ancestry on its own, and then check that the QQ plot and λ come back to the line. In FAMuSS, with only candidate-gene SNPs, the Caucasian participants alone, or self-reported race as a covariate, are cruder substitutes for principal components.")}
""")}
'''
    return finish_chapter("wrapup", "★", "Summary and homework", "Summary and homework",
                          "What you have learnt this week, the homework that completes your mini-GWAS, and how much of the practical you have done.", body)


def ALL():
    use_golden(NAME)
    return [ch_start(), ch_many(), ch_correct(), ch_genome(), ch_structure(), ch_ld(), ch_gwas(), ch_report(), ch_wrapup()]
