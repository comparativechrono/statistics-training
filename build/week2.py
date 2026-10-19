"""Week 2 of Biostatistics for Genomic Medicine: describing data, distributions and uncertainty.

Describing a real genetic study (FAMuSS) before testing anything: types of data, centre and spread, missing values and
summaries by group; seeing distributions with ggplot2; the normal, binomial and Poisson distributions and where they
arise in genomics; sampling variation, the standard error and confidence intervals (by formula and by the bootstrap);
and a first Quarto report. Follows the week 2 session plan (blocks 2A, 2B and 2C) and homework 2."""
from lib import *
import figs

NAME = 'week2'
PRELUDE = '''suppressMessages(library(tidyverse))
setwd("~/data")'''

# ---- checks made by R (see lib.rtask) ----
LOADED = '"package:tidyverse" %in% search()'
IN_DATA = 'basename(getwd()) == "data"'
FMS_COLS = ['id', 'Gender', 'Age', 'pre.BMI', 'NDRM.CH', 'actn3_r577x']
SEX_SUMMARY = ('is.data.frame(v) && "Gender" %in% names(v) && nrow(v) %in% 2:3 && '
               'any(vapply(v, function(x) is.numeric(x) && any(abs(x - 61.48786) < 0.01, na.rm = TRUE), logical(1)))')
GENO_COUNT = 'is.data.frame(v) && all(c("esr1_rs1042717", "n") %in% names(v)) && nrow(v) %in% 3:4'
CI_BMI = ('(is.numeric(v) && length(v) == 2 && isTRUE(all(abs(as.numeric(v) - c(24.08302, 24.64232)) < 0.002))) || '
          '(inherits(v, "htest") && isTRUE(all(abs(as.numeric(v$conf.int) - c(24.08302, 24.64232)) < 0.002)))')
CI_ESR1 = 'is.numeric(v) && length(v) == 2 && isTRUE(all(abs(as.numeric(v) - c(0.23282, 0.26718)) < 0.002))'
BOOT = ('is.numeric(v) && length(v) == 2 && v[1] >= 41 && v[1] <= 46 && v[2] >= 47 && v[2] <= 52')
MEANS30 = has_vec(2000, 'sd(o) > 0.6 && sd(o) < 1.05 && abs(mean(o) - 24.36) < 0.25')
MEANS120 = has_vec(2000, 'sd(o) > 0.3 && sd(o) < 0.53 && abs(mean(o) - 24.36) < 0.15')
DEPTHS = has_vec(10000, 'all(o == round(o)) && abs(mean(o) - 30) < 0.5')

# ---- what the short questions accept (regular expressions, tried on the answer in lower case with its spaces tidied) ----
ACC_MEDIAN = r'^45\.50*$'
ACC_MISSING = r'^386$'
ACC_BMI = r'^24\.36[0-9]*$||^24\.4$'
ACC_COLS = r'^235$'
ACC_196 = r'^1\.96[0-9]*$||^1\.959[5-9][0-9]*$'
ACC_042 = r'^0?\.420*$||^42 ?%$'
ACC_MISS400 = r'^0?\.13[0-9]*$||^13(\.[0-9]+)? ?%$'
ACC_SE = r'^0?\.14[0-9]*$'
ACC_025 = r'^0?\.250*$'

TEMPLATE = '''---
title: "Week 2: the FAMuSS cohort"
author: "Your name"
format: html
---

This report describes the participants of the FAMuSS study, and how much their
strength changed during 12 weeks of training.

```{r}
#| label: setup
#| message: false
library(tidyverse)
fms <- read_csv("data/famuss.csv", show_col_types = FALSE)
```

## The participants

The data have `r nrow(fms)` participants, and `r sum(!is.na(fms$NDRM.CH))` of
them have a measurement of NDRM.CH, the percentage change in the strength of
their non-dominant arm.

```{r}
#| label: by-sex
fms %>%
  drop_na(Gender, NDRM.CH) %>%
  group_by(Gender) %>%
  summarise(n = n(), mean = mean(NDRM.CH), median = median(NDRM.CH),
            sd = sd(NDRM.CH))
```

## The distribution of NDRM.CH

```{r}
#| label: histogram
#| warning: false
ggplot(fms, aes(x = NDRM.CH)) +
  geom_histogram(binwidth = 10)
```

## Uncertainty

Write your confidence interval for the mean pre-training BMI here.
'''

GROUPED = '''fms %>%
  drop_na(Gender, NDRM.CH) %>%
  group_by(Gender) %>%
  summarise(n = n(), mean = mean(NDRM.CH),
            median = median(NDRM.CH), sd = sd(NDRM.CH))'''
GENO = '''fms %>%
  drop_na(actn3_r577x) %>%
  count(actn3_r577x) %>%
  mutate(proportion = n / sum(n))'''
ACROSS = '''fms %>%
  drop_na(Gender) %>%
  group_by(Gender) %>%
  summarise(across(c(Age, pre.BMI, NDRM.CH), ~ median(.x, na.rm = TRUE)))'''
HIST = '''ggplot(fms, aes(x = NDRM.CH)) +
  geom_histogram(binwidth = 10)'''
BOX = '''fms %>%
  drop_na(Gender, NDRM.CH) %>%
  ggplot(aes(x = Gender, y = NDRM.CH)) +
  geom_boxplot()'''
DENS = '''fms %>%
  drop_na(Gender, NDRM.CH) %>%
  ggplot(aes(x = NDRM.CH, fill = Gender)) +
  geom_density(alpha = 0.5)'''
SIMHIST = '''tibble(depth = depth) %>%
  ggplot(aes(x = depth)) +
  geom_histogram(binwidth = 1)'''
BMI_VEC = 'bmi <- fms %>% drop_na(pre.BMI) %>% pull(pre.BMI)'
MEANS = 'means <- replicate(2000, mean(sample(bmi, 30)))'
MEANS_HIST = '''tibble(means = means) %>%
  ggplot(aes(x = means)) +
  geom_histogram(binwidth = 0.25)'''
G_VEC = 'g <- fms %>% drop_na(actn3_r577x) %>% pull(actn3_r577x)'
P_T = 'p_T <- (2 * sum(g == "TT") + sum(g == "CT")) / (2 * length(g))'
NDRM_VEC = 'ndrm <- fms %>% drop_na(NDRM.CH) %>% pull(NDRM.CH)'
BOOT_MED = 'boot_medians <- replicate(2000, median(sample(ndrm, replace = TRUE)))'
COVER = '''covered <- replicate(1000, {
  s <- sample(bmi, 30)
  ci <- t.test(s)$conf.int
  ci[1] <= mean(bmi) & mean(bmi) <= ci[2]
})'''


def columns():
    rows = [
        ('<code>id</code>', 'the participant’s code'),
        ('<code>Gender</code>, <code>Age</code>, <code>Race</code>', 'sex (Female or Male), age in years, and self-reported ancestry'),
        ('<code>Pre.height</code>, <code>Pre.weight</code>, <code>pre.BMI</code>', 'height (inches), weight (pounds) and body mass index before the training'),
        ('<code>Pre_NDRM_Max</code>, <code>Post_NDRM_Max</code>', 'the heaviest weight (pounds) lifted with the non-dominant arm before and after the training'),
        ('<code>NDRM.CH</code>', 'the change in that weight, as a percentage of what it was before: the main outcome of the study'),
        ('<code>Pre_DRM_Max</code>, <code>Post_DRM_Max</code>, <code>DRM.CH</code>', 'the same for the dominant arm, which wasn’t trained'),
        ('<code>actn3_r577x</code>, <code>esr1_rs1042717</code>, …', '222 genetic variants, named gene_variant, each holding a genotype such as <code>"CC"</code>, <code>"CT"</code> or <code>"TT"</code>'),
    ]
    return table(['Columns', 'What they hold'], rows)


def data_types():
    rows = [
        ('Continuous', 'a measurement on a scale, which can take any value in a range', '<code>pre.BMI</code>, <code>NDRM.CH</code>, gene expression',
         'mean and SD, or median and IQR'),
        ('Discrete (counts)', 'whole numbers that count something', 'the number of copies of an allele (0, 1 or 2), reads at a base', 'mean and SD, or the counts of each value'),
        ('Categorical', 'a set of named groups, in no order', '<code>Gender</code>, <code>Race</code>, a genotype such as CC, CT or TT', 'the count and proportion in each group'),
        ('Ordinal', 'groups that have an order, but no fixed distance between them', 'tumour grade, the stage of a disease', 'counts, proportions and the median'),
        ('Binary', 'two groups: yes or no', 'obese or not, case or control, mutation or not', 'the count and proportion of yeses'),
    ]
    return table(['Type', 'What it is', 'Examples', 'Summarised by'], rows)


def dpqr():
    rows = [
        ('<code>d</code>', '<code>dnorm(x)</code>, <code>dbinom(k, size, prob)</code>', 'the density at x (for a discrete distribution, the probability of exactly k)'),
        ('<code>p</code>', '<code>pnorm(x)</code>, <code>pbinom(k, size, prob)</code>', 'the probability of a value less than or equal to x (or k)'),
        ('<code>q</code>', '<code>qnorm(p)</code>', 'the quantile: the value that a proportion p of the distribution is below'),
        ('<code>r</code>', '<code>rnorm(n)</code>, <code>rbinom(n, size, prob)</code>, <code>rpois(n, lambda)</code>', 'n random values from the distribution'),
    ]
    return table(['Prefix', 'Examples', 'What it gives you'], rows)


def sd_se():
    rows = [
        ('<b>Standard deviation</b> (SD)', 'how much the values vary from one person to another', 'stays about the same as you collect more data', '<code>sd(x)</code>'),
        ('<b>Standard error</b> (SE)', 'how much an estimate, such as a mean, would vary from one sample to another', 'gets smaller as you collect more data (SD ÷ √n)',
         '<code>sd(x) / sqrt(length(x))</code>'),
    ]
    return table(['', 'What it measures', 'With more data, it…', 'In R'], rows)


# ---------------------------------------------------------------------------------------------------------------------
def ch_start():
    body = f'''
<h2 id="w2-weeks">The statistics practicals</h2>
<p>In week 1 you learnt to read, filter and plot data in R. The next four weeks use those skills to do statistics, on real genetic and genomic data. Each week’s practical builds on the one before:</p>
{table(['Week', 'The question', 'What you learn'], [
    ('2 (this week)', 'What do the data look like, and how sure can we be?', 'Describing data, probability distributions, standard errors and confidence intervals'),
    ('3', 'Is there a difference, or could it be chance?', 'Hypothesis tests: t-tests, ANOVA, chi-square and Fisher’s exact tests, Hardy–Weinberg equilibrium'),
    ('4', 'How big is the effect, allowing for other things?', 'Linear and logistic regression, confounding and interactions'),
    ('5', 'What happens when we test thousands of things at once?', 'Multiple testing, population structure and a small genome-wide association study'),
])}
<p>Each practical works like the courses of week 1. The steps of an activity tick themselves when R sees that you have done them (or you can tick them yourself), questions with a <b>Check</b> button are marked straight away, and <b>Show answer</b> appears once you have had a go at a question. Parts marked <b>If you have time</b> are for people who finish early, and the homework at the end of each week is for after the session; neither counts towards finishing the practical. Your tutor will talk you through some of the ideas in the room, so you may be asked to stop at the end of a chapter.</p>

<h2 id="w2-famuss">This week’s data: the FAMuSS study</h2>
<p>The <b>FAMuSS</b> study (<i>Functional SNPs Associated with Muscle Size and Strength</i>) asked why some people gain much more strength from exercise than others, and how much of the difference is genetic. About 1,400 young adults, aged 17 to 41, trained the biceps of their non-dominant arm (the one they don’t write with) twice a week for 12 weeks. The heaviest weight that each person could lift with that arm was measured before and after the training, and everyone was genotyped at a few hundred single nucleotide polymorphisms (SNPs) in genes that were thought to affect muscle.</p>
<p>The data are in <code>famuss.csv</code> in your <code>data</code> folder, with one row for each person:</p>
{columns()}
<p>As in most real studies, many values are missing: not everyone finished the training, and not everyone was genotyped for every SNP. A missing value is <code>NA</code> in R. You will see it a lot this week.</p>
{callout("concept", "Keep your work in a report", "<p>This week you will also write a short report in a <b>Quarto</b> document, which mixes your text, your R code and its results, and turns into a web page when you <b>Render</b> it. Use the Console for trying things out, and put the code that matters into the report as you go. In chapter 5 you set the report up and render it.</p>")}
{callout("warn", "AI tools and your data", "<p>The <b>AI</b> tab has an AI assistant that you can ask about R and statistics, if you have a key for an AI service. Anything you type into it is sent to an AI company. Never paste personal data or patient data into it, or into any other AI tool. These practicals only use public research data.</p>")}
<p>Before you read the data, install and load the tidyverse. Each practical keeps its own list of installed packages, so install it once here, even if you installed it in week 1. It comes from your browser’s cache if you have downloaded it before, so it should be quick.</p>
{rc('fms <- read_csv("famuss.csv")')}
<p>readr read 235 columns. It read 10 of them as numbers (<code>dbl</code>) and 225 as text (<code>chr</code>): the id, Gender, Race and all the genotypes, which are written with letters.</p>
{activity("Get ready", [
    task("st-install", f'Install the tidyverse: {rscode('install.packages("tidyverse")')}', check="installed:tidyverse", auto="rstudio:installed"),
    rtask("st-library", f'Load it with {rscode("library(tidyverse)")}.', LOADED),
    rtask("st-wd", f'Set the working directory to your data folder: {rscode('setwd("~/data")')}', IN_DATA),
    rtask("st-read", f'Read {c("famuss.csv")} into a tibble called {c("fms")}, as above.', has_table(1397, FMS_COLS)),
    task("st-view", f'Open {c("fms")} in the viewer, by clicking on it in the Environment pane or with {c("View(fms)")}, and scroll to the right to see the genotypes.', auto="r:view kind=rstudio nrow=1397"),
])}
{q("st-q-cols", "How many columns does <code>fms</code> have?", "235: 13 about the participant (from <code>id</code> to <code>DRM.CH</code>) and 222 genotypes. <code>ncol(fms)</code> tells you, and so does the first line readr prints.", accept=ACC_COLS, placeholder="A number")}
{mcq("st-q-text", "readr read the genotype columns, such as <code>actn3_r577x</code>, as text. Is that right?", [
    ("Yes: a genotype such as CT is a category, written with letters, not a number", True, "Genotypes are categorical data. Later you will turn them into numbers on purpose, by counting the copies of an allele."),
    ("No: readr should have read them as numbers", False, "A value such as CT isn’t a number, so readr was right to keep it as text."),
    ("No: they should all be NA", False, "Most of the genotypes are there. NA only marks the people who weren’t genotyped for that SNP."),
])}
'''
    return chapter("start", "0", "Start here", "rstudio", "Week 2: describing data, distributions and uncertainty", 15,
                   "Before you test anything, you need to know what your data look like, and how much they could vary just by chance. This week you describe a real genetic study, meet the probability distributions that genomic data follow, and measure the uncertainty in an estimate.", body)


# ---------------------------------------------------------------------------------------------------------------------
def ch_describe():
    body = f'''
<h2 id="d-types">What kind of data?</h2>
<p>The first question to ask about any variable is what kind of data it is, because that decides how you summarise it, how you plot it and, next week, how you test it:</p>
{data_types()}
<p>Genotypes are worth a second look. A genotype such as CT is a category, but you can also count the copies of an allele that a person carries: 0, 1 or 2 copies of the T allele. Both views are useful, and you will use both.</p>

<h2 id="d-centre">Centre and spread</h2>
<p>A continuous variable is usually summarised by two numbers: one for its <b>centre</b> (a typical value) and one for its <b>spread</b> (how much the values vary).</p>
<ul>
<li>The <b>mean</b> is the sum of the values divided by how many there are, written <i>x̄</i>. The <b>median</b> is the middle value when they are sorted: half the values are below it, and half above.</li>
<li>The <b>standard deviation</b> (SD) measures how far the values typically are from the mean:</li>
</ul>
{formula('<i>s</i> = √[ Σ (<i>x</i><sub><i>i</i></sub> − <i>x̄</i>)² / (<i>n</i> − 1) ]', 'Square each value’s distance from the mean, add them up, divide by n − 1, and take the square root. (Dividing by n − 1 rather than n allows for having estimated the mean from the same data.)')}
<ul>
<li>The <b>quartiles</b> split the sorted values into four equal parts. The <b>interquartile range</b> (IQR) is the distance between the lower quartile (Q1, with 25% of the values below it) and the upper quartile (Q3, with 75% below it), so it covers the middle half of the data.</li>
</ul>
<p>The mean and SD use every value, so a few extreme values can pull them a long way. The median and IQR don’t care how extreme the extreme values are, so they are <b>robust</b>. When a distribution is skewed (lopsided, with a long tail on one side) the mean is pulled towards the tail, and the median is usually the better summary of a typical value.</p>
{figure(figs.skew_mean_median(), 'A right-skewed distribution, like the change in strength: a few people more than doubled their strength, so the mean is pulled to the right of the median.')}
<p><code>summary()</code> gives you most of these in one go:</p>
{rc('summary(fms$NDRM.CH)')}

<h2 id="d-missing">Missing values</h2>
<p>The last number in the summary is the count of missing values: 386 people have no NDRM.CH. Most functions return <code>NA</code> if any value is missing, because R can’t know what the answer would have been. Add <code>na.rm = TRUE</code> (“remove the NAs”) to calculate it from the values you have:</p>
{rc('mean(fms$NDRM.CH)', 'mean(fms$NDRM.CH, na.rm = TRUE)', 'median(fms$NDRM.CH, na.rm = TRUE)', 'sd(fms$NDRM.CH, na.rm = TRUE)', 'quantile(fms$NDRM.CH, na.rm = TRUE)', 'IQR(fms$NDRM.CH, na.rm = TRUE)')}
<p><code>is.na()</code> tells you which values are missing, and <code>sum()</code> counts the TRUEs:</p>
{rc('sum(is.na(fms$NDRM.CH))')}
{callout("concept", "Why are the data missing?", "<p>Dropping missing values is only safe if the people who are missing are like the people who aren’t. If the people who dropped out of the training were mostly those who weren’t improving, the people left would make the training look better than it really was. Always ask why data are missing, and report how many are.</p>")}

<h2 id="d-groups">Summaries by group</h2>
<p>To compare groups, use <code>group_by()</code> and <code>summarise()</code> from dplyr. <code>drop_na()</code>, from tidyr, removes the rows with a missing value in the columns you name, so the summaries below use the same people. <code>n()</code> counts the rows in each group:</p>
{rc(GROUPED)}
<p>Women increased the strength of their arm by more than men, in percentage terms, and the mean is higher than the median in both groups: the distributions are skewed to the right.</p>
<p>For categorical data, the summary is the number in each group, which <code>count()</code> gives you. A proportion is a count divided by the total:</p>
{rc('count(fms, Gender)', GENO)}
{activity("Describe the participants", [
    rtask("d-bmi-mean", f'Calculate the mean of {c("pre.BMI")}, the participants’ body mass index before the training.', lastv(near(24.36267, 0.001))),
    rtask("d-bmi-med", f'Calculate its median.', lastv(near(23.35, 0.001))),
    rtask("d-bmi-iqr", f'And its interquartile range, with {c("IQR()")}.', lastv(near(5.1955, 0.001))),
    rtask("d-race", f'Count the participants in each group of {c("Race")}.', tib(7, ['Race', 'n'])),
    rtask("d-sex", f'Make a table of NDRM.CH for women and men, as above, with the number of people, the mean, the median and the SD.', lastv(SEX_SUMMARY)),
    rtask("d-geno", f'Count the genotypes of the SNP {c("esr1_rs1042717")}, in the gene for the oestrogen receptor, and add the proportion of each.', lastv(GENO_COUNT)),
])}
{q("d-q-median", "What is the median of NDRM.CH?", "45.5%, from <code>median(fms$NDRM.CH, na.rm = TRUE)</code>: half the people increased the strength of their non-dominant arm by less than 45.5%, and half by more.", accept=ACC_MEDIAN, placeholder="A number")}
{q("d-q-missing", "How many people have no value of NDRM.CH?", "386, from <code>sum(is.na(fms$NDRM.CH))</code> (or the NA’s line of <code>summary()</code>).", accept=ACC_MISSING, placeholder="A number")}
{q("d-q-bmi", "What is the mean pre-training BMI, to two decimal places?", "24.36, from <code>mean(fms$pre.BMI, na.rm = TRUE)</code>. Its median is 23.35, a little lower, because BMI has a tail of high values.", accept=ACC_BMI, placeholder="A number")}
{mcq("d-q-skew", "NDRM.CH has a mean of 52.6% and a median of 45.5%. What does that tell you about its distribution?", [
    ("It is skewed to the right: a few people made very large gains, which pull the mean up", True, "The mean is pulled towards the long tail. The median, the middle value, isn’t affected by how large the largest values are."),
    ("It is symmetric, so the mean and median are equivalent", False, "In a symmetric distribution the mean and median are about the same. Here they differ by 7 percentage points."),
    ("Most people made gains larger than the mean", False, "Half the people gained less than the median, 45.5%, which is below the mean, so more than half gained less than the mean."),
])}
{mcq("d-q-geno", "How should you summarise the genotypes of a SNP such as <code>actn3_r577x</code>?", [
    ("With the number and proportion of people with each genotype (or the frequency of each allele)", True, "A genotype is a category, so you count it. Next chapter you will see that counting alleles turns it into a number."),
    ("With the mean genotype", False, "There is no mean of CC, CT and TT. Once you code the genotype as the number of copies of an allele (0, 1 or 2), a mean makes sense: it is twice the allele’s frequency."),
    ("With the standard deviation of the genotypes", False, "An SD needs numbers. Genotypes are categories."),
])}
{q("d-q-percent", "Women’s strength went up by about 61% and men’s by about 40%. Before you conclude that women respond better to training, look at <code>Pre_NDRM_Max</code>, the weight lifted before the training, in each group. Why might a percentage change be larger in women even if their gain in pounds were similar?",
   "Women started from a lower weight: the mean of <code>Pre_NDRM_Max</code> is about 13.8 pounds in women and 26.3 pounds in men. A percentage change divides the gain by the starting value, so the same gain in pounds is a larger percentage of a smaller starting weight. How you measure an outcome (here, absolute or relative change) can change what you conclude, so think about it before you analyse. (In this study women did gain more in percentage terms, but less in pounds.)")}
{optional("Many columns at once", f"""
<p><code>across()</code> applies the same summary to several columns. Here <code>~ median(.x, na.rm = TRUE)</code> is a small function, where <code>.x</code> stands for each column in turn:</p>
{rc(ACROSS)}
{activity("Summarise several columns", [rtask("d-across", f"Use {c('across()')} to calculate the mean of {c('Pre.height')}, {c('Pre.weight')} and {c('pre.BMI')} for women and men.", lastv('is.data.frame(v) && all(c("Gender", "Pre.height", "Pre.weight", "pre.BMI") %in% names(v))'))])}
""")}
'''
    return chapter("describe", "1", "Describing data", "rstudio", "Describing data", 45,
                   "Every analysis starts by describing the data: what kind of data each variable is, where its values are centred, how much they vary, and how many are missing.", body)


# ---------------------------------------------------------------------------------------------------------------------
def ch_shapes():
    body = f'''
<p>Numbers such as the mean and SD summarise a distribution, but they can hide a lot: two variables with the same mean and SD can look completely different. Always look at the distribution itself. These are the plots you will use most:</p>
{table(['Plot', 'ggplot2', 'Good for'], [
    ('Histogram', '<code>geom_histogram()</code>', 'the shape of one continuous variable: where the values are, skew, outliers, more than one peak'),
    ('Density plot', '<code>geom_density()</code>', 'a smooth version of the histogram, good for overlaying groups'),
    ('Box plot', '<code>geom_boxplot()</code>', 'comparing the distributions of several groups side by side'),
    ('Bar plot', '<code>geom_bar()</code>', 'the counts of a categorical variable'),
])}

<h2 id="sh-hist">Histograms</h2>
<p>A histogram divides the range of values into bins and draws a bar for each bin, as tall as the number of values in it. The width of the bins (<code>binwidth</code>) is up to you: too wide and you lose the shape, too narrow and every bar is noise.</p>
{block(HIST)}
<p>ggplot2 warns you that it <code>Removed 386 rows containing non-finite outside the scale range</code>. These are the missing values of NDRM.CH: it can’t place them on the axis, so it leaves them out, and tells you how many.</p>

<h2 id="sh-box">Box plots</h2>
<p>A box plot shows five things about a distribution, using the quartiles, so it isn’t pulled about by extreme values:</p>
{figure(figs.boxplot_anatomy(), 'The parts of a box plot. Points beyond the whiskers are drawn one by one, as possible outliers.')}
{block(BOX)}
<p>Compare the boxes: where the medians are, how tall the boxes are (the IQRs), and whether the whiskers are longer on one side, which is a sign of skew.</p>

<h2 id="sh-dens">Density plots</h2>
<p>A density plot is a smoothed histogram, scaled so that the area under each curve is 1. Mapping <code>fill</code> to a group, with some transparency (<code>alpha</code>), lets you overlay groups of different sizes:</p>
{block(DENS)}
{activity("Draw the distributions", [
    rtask("sh-hist", f'Draw a histogram of {c("pre.BMI")}, with a bin width that shows its shape well.', gg("GeomBar", stat="StatBin", maps={'x': 'pre.BMI'})),
    rtask("sh-box", f'Draw a box plot of NDRM.CH for each genotype of {c("actn3_r577x")} (genotype on the x axis). Drop the people who are missing either value first.', gg("GeomBoxplot", maps={'x': 'actn3_r577x', 'y': 'NDRM.CH'}, extra='!anyNA(v$data$actn3_r577x)')),
    rtask("sh-dens", f'Draw density plots of NDRM.CH for women and men, overlaid, as above.', gg("GeomDensity", maps={'x': 'NDRM.CH', 'fill': 'Gender'})),
])}
{mcq("sh-q-box", "In your box plot of NDRM.CH by ACTN3 genotype, what does the thick line inside each box show?", [
    ("The median NDRM.CH of the people with that genotype", True, "Half the people with that genotype gained less than the line, and half more."),
    ("The mean NDRM.CH of the people with that genotype", False, "A box plot is drawn from the quartiles. The mean isn’t shown, unless you add it yourself."),
    ("The number of people with that genotype", False, "A box plot doesn’t show how many people are in each group. Use count() for that."),
])}
{mcq("sh-q-shape", "Your histogram of pre.BMI has a long tail to the right. Which of these is true?", [
    ("The mean BMI is higher than the median", True, "The long right tail pulls the mean up: 24.36 against a median of 23.35."),
    ("The median BMI is higher than the mean", False, "That happens with a long tail to the left."),
    ("Most people have a BMI above the mean", False, "With a right skew, more than half the values are below the mean."),
])}
{mcq("sh-q-bins", "What happens if you make the bins of a histogram much narrower?", [
    ("There are more, shorter bars, and the shape becomes ragged with random noise", True, "Each bin holds fewer values, so chance has more effect on each bar. Choose a width that shows the shape without the noise."),
    ("The distribution changes", False, "The data stay the same. Only how they are drawn changes."),
    ("The histogram becomes smoother", False, "Narrower bins make it more ragged. Wider bins (or a density plot) make it smoother."),
])}
{optional("Transforming a skewed variable", f"""
<p>Skewed data often look more symmetric on a logarithmic scale, which is why gene expression is usually analysed as log2 values. Inside <code>aes()</code> you can transform a column, as in <code>aes(x = log2(pre.BMI))</code>.</p>
{activity("Try a log scale", [rtask("sh-log", f"Draw a histogram of the log2 of {c('pre.BMI')}, and compare its shape with that of the original.", gg("GeomBar", stat="StatBin", maps={'x': 'log2(pre.BMI)'}))])}
""")}
'''
    return chapter("shapes", "2", "Seeing distributions", "rstudio", "Seeing distributions", 25,
                   "A summary in numbers can hide a lot. Before you go any further, look at the shape of each distribution.", body)


# ---------------------------------------------------------------------------------------------------------------------
def ch_distributions():
    body = f'''
<p>A <b>probability distribution</b> describes how a random quantity varies: which values it can take, and how likely each one is. A distribution for continuous data is a curve (a <i>density</i>) on which the area between two values is the probability of a value between them. A distribution for counts gives a probability to each whole number. Each distribution has <b>parameters</b>, such as its mean, that fix its exact shape.</p>
<p>Three distributions turn up again and again in genomics, and the statistical tests of the coming weeks are built on them.</p>

<h2 id="pd-normal">The normal distribution</h2>
<p>The normal distribution is the familiar bell-shaped curve. It has two parameters: its mean, <i>μ</i>, which is its centre, and its standard deviation, <i>σ</i>, which is its spread. Many measurements are roughly normal, such as height, or the log of a gene’s expression across people, because they add up many small, independent effects.</p>
{figure(figs.normal_areas(), 'In a normal distribution, about 68% of values are within one SD of the mean, and 95% within 1.96 SDs. Only 2.5% are more than 1.96 SDs above the mean.')}
<p>The distance of a value from the mean, in SDs, is its <b>z-score</b>: <i>z</i> = (<i>x</i> − <i>μ</i>) / <i>σ</i>. A z-score of 2 means “2 SDs above the mean”, whatever the units of the original measurement. The <b>standard normal</b> distribution has a mean of 0 and an SD of 1.</p>
<p>R has four functions for each distribution, whose names start with <code>d</code>, <code>p</code>, <code>q</code> or <code>r</code>:</p>
{dpqr()}
{rc('pnorm(1.96)', 'qnorm(0.975)', '2 * pnorm(-1.96)')}
<p>So 97.5% of a normal distribution is below 1.96 SDs above the mean, and a value is more than 1.96 SDs from the mean, in either direction, with a probability of 0.05. You will meet 1.96 and 0.05 many more times.</p>

<h2 id="pd-binom">The binomial distribution</h2>
<p>The binomial distribution counts <b>successes in a fixed number of independent trials</b>, each with the same probability of success. Its parameters are the number of trials, <i>n</i>, and the probability, <i>p</i>. Its mean is <i>np</i>, and its variance is <i>np</i>(1 − <i>p</i>).</p>
<p>Genetics is full of binomial counts. Each person has two copies of each autosome, and if the copies are inherited independently, the number of copies of an allele that a person carries is binomial with <i>n</i> = 2 and <i>p</i> equal to the allele’s frequency. The probabilities of 0, 1 and 2 copies are (1 − <i>p</i>)², 2<i>p</i>(1 − <i>p</i>) and <i>p</i>²: the <b>Hardy–Weinberg proportions</b>, which you will test next week.</p>
{figure(figs.binomial_genotypes(0.3), 'The number of copies of an allele whose frequency is 0.3: a binomial distribution with n = 2 and p = 0.3.')}
{rc('dbinom(0:2, size = 2, prob = 0.3)')}
<p>The same idea tells you about rare variants. A variant with a frequency of 1% is carried on 1 chromosome in 100. In a sample of 50 people (100 chromosomes), the chance of not seeing it at all is:</p>
{rc('dbinom(0, size = 100, prob = 0.01)')}
<p>More than a third: a small study can easily miss a rare variant completely, which is why the studies of rare variants have to be large.</p>

<h2 id="pd-pois">The Poisson distribution</h2>
<p>The Poisson distribution counts <b>events that happen independently, at a constant average rate</b>, in a fixed space or time, when there is no fixed number of trials. Its single parameter, <i>λ</i> (lambda), is both its mean and its variance. Examples are the number of new (de novo) mutations in a child’s genome, or the number of sequencing reads that cover a base.</p>
{figure(figs.poisson_pair(), 'Two Poisson distributions. With a small mean (λ = 3), the counts are skewed. With a large mean (λ = 30), such as the number of reads at a base sequenced to 30× depth, the distribution is nearly normal.')}
<p>If a genome is sequenced to an average depth of 30×, the number of reads at each base is roughly Poisson with <i>λ</i> = 30. A variant at a base covered by fewer than 10 reads is hard to call, and the chance of that happening is small but not zero:</p>
{rc('ppois(9, lambda = 30)')}
<p>About 7 in a million bases: in a genome of 3 billion bases, that is still about 20,000 bases.</p>
{callout("concept", "When counts vary more than Poisson allows", "<p>In a Poisson distribution the variance equals the mean. Real counts often vary more than that: the coverage of a genome is uneven, and the read counts of a gene vary between people for biological reasons as well as by chance. This is called <b>over-dispersion</b>. The tools that analyse RNA-seq data, such as DESeq2 and edgeR, use the <b>negative binomial</b> distribution instead, which has a second parameter for the extra variation.</p>")}

<h2 id="pd-sim">Simulating data</h2>
<p>The <code>r</code> functions draw random values from a distribution. Simulation lets you see what a distribution looks like, and what chance alone can do. A computer’s random numbers come from a fixed sequence, so <code>set.seed()</code> makes them the same each time: run the two lines below and you get the same ten values as the example. Each value is the number of copies of the allele in a person:</p>
{rc('set.seed(42)', 'rbinom(10, size = 2, prob = 0.3)')}
{activity("Probabilities in R", [
    rtask("pd-tails", 'Calculate the probability that a value from a normal distribution is more than 2 SDs from the mean, in either direction.', lastv(near(0.04550026, 1e-6))),
    rtask("pd-het", 'An allele has a frequency of 0.1. Use dbinom() to calculate the proportion of people who carry exactly one copy of it (who are heterozygous).', lastv(near(0.18, 1e-9))),
    rtask("pd-miss", 'A variant has a frequency of 0.5% (0.005). What is the chance that it isn’t seen at all in 200 people (400 chromosomes)?', lastv(near(0.134658, 1e-5))),
    rtask("pd-depth", 'At an average depth of 30×, what is the chance that a base is covered by fewer than 15 reads?', lastv(near(0.0009206824, 1e-8))),
    rtask("pd-sim", f'Simulate the depth at 10,000 bases sequenced to 30×, with {c("rpois()")}, and store the depths in an object called {c("depth")}.', DEPTHS),
    rtask("pd-simhist", 'Draw a histogram of the simulated depths (put them in a tibble first, as in the box below).', gg("GeomBar", stat="StatBin")),
    rtask("pd-low", 'What proportion of your simulated bases have fewer than 15 reads? (The mean of a logical vector is the proportion of TRUEs.)', lastv('is.numeric(v) && length(v) == 1 && v >= 0 && v < 0.005')),
])}
{block(SIMHIST, show=False)}
{q("pd-q-975", "What is <code>qnorm(0.975)</code>, to two decimal places?", "1.96: 97.5% of a normal distribution lies below 1.96 SDs above the mean, so 95% lies within 1.96 SDs of the mean. That is why 1.96 appears in 95% confidence intervals.", accept=ACC_196, placeholder="A number")}
{q("pd-q-het", "An allele has a frequency of 0.3. Under the Hardy–Weinberg proportions, what proportion of people are heterozygous?", "0.42, which is 2 × 0.3 × 0.7: <code>dbinom(1, size = 2, prob = 0.3)</code>.", accept=ACC_042, placeholder="A proportion")}
{q("pd-q-miss", "What is the chance of not seeing a variant with a frequency of 0.5% in 200 people, to two decimal places?", "0.13, from <code>dbinom(0, size = 400, prob = 0.005)</code>: about one study in eight of this size would miss the variant completely.", accept=ACC_MISS400, placeholder="A probability")}
{mcq("pd-q-which", "Which distribution describes the number of copies of the minor allele of a SNP that a person carries, if the two copies are inherited independently?", [
    ("Binomial, with n = 2 and p equal to the allele’s frequency", True, "Two trials (the two copies), each with the same probability. This gives the Hardy–Weinberg proportions."),
    ("Normal, with a mean of 1", False, "The count can only be 0, 1 or 2, so it isn’t a continuous, bell-shaped variable."),
    ("Poisson, with λ equal to the allele’s frequency", False, "A Poisson count has no upper limit, but a person can carry at most two copies."),
])}
{mcq("pd-q-rnaseq", "Across replicate samples, the read counts of a gene in an RNA-seq experiment have a mean of 200 and a variance of 2,500. What does that suggest?", [
    ("The counts are over-dispersed: they vary much more than a Poisson distribution allows, so a negative binomial model is better", True, "A Poisson distribution with a mean of 200 has a variance of 200, not 2,500. This is why DESeq2 and edgeR use the negative binomial distribution."),
    ("The counts follow a Poisson distribution", False, "In a Poisson distribution the variance equals the mean (200 here)."),
    ("The counts are normally distributed, so a t-test is fine", False, "Counts with this much extra variation need a model that allows for it, such as the negative binomial."),
])}
{optional("The law of large numbers", f"""
<p>The mean of simulated values gets closer to the distribution’s true mean as you simulate more of them. Try <code>mean(rpois(10, 30))</code>, <code>mean(rpois(100, 30))</code> and <code>mean(rpois(100000, 30))</code> a few times each, and see how much each one varies.</p>
{activity("Watch the mean settle down", [rtask("pd-lln", "Calculate the mean of 100,000 values from a Poisson distribution with λ = 30.", lastv("is.numeric(v) && length(v) == 1 && abs(v - 30) < 0.1"))])}
{q("pd-q-lln", "How much did the means of 10 values vary, compared with the means of 100,000 values? Why?", "The means of 10 values varied by several reads from one try to the next, but the means of 100,000 values were always within a few hundredths of 30. A mean of more values varies less: this is the idea behind the standard error, in the next chapter.")}
""")}
'''
    return chapter("distributions", "3", "Probability distributions", "rstudio", "Probability distributions in genomics", 45,
                   "Behind every statistical test is a model of how the data would vary by chance. Three distributions do most of the work in genomics: the normal, the binomial and the Poisson.", body)


# ---------------------------------------------------------------------------------------------------------------------
def ch_uncertainty():
    body = f'''
<h2 id="u-sample">Samples and populations</h2>
<p>The 1,397 people in FAMuSS are a <b>sample</b> from a much larger <b>population</b>: all the young adults who might train like this. What we want to know about is the population, such as the true mean BMI, or the true frequency of an allele. Such a quantity is a <b>parameter</b>, written with a Greek letter (<i>μ</i> for a mean). What we can calculate is an <b>estimate</b> from the sample (<i>x̄</i>). A different sample would give a different estimate, and the question is how different.</p>

<h2 id="u-sim">Seeing sampling variation</h2>
<p>You can see sampling variation by simulation. Pretend, for a moment, that the 1,032 people with a BMI are the whole population, and draw small samples from them, as a small study would. <code>pull()</code> takes a single column out of a tibble, as a vector:</p>
{rc(BMI_VEC, 'length(bmi)', 'set.seed(1)', 'mean(sample(bmi, 30))', 'mean(sample(bmi, 30))')}
<p>Each sample of 30 people gives a different mean. <code>replicate()</code> repeats an expression many times, so you can draw 2,000 samples and keep the mean of each:</p>
{rc(MEANS)}
<p>The 2,000 means form the <b>sampling distribution</b> of the mean. Plot them:</p>
{block(MEANS_HIST)}
{figure(figs.sampling_distribution(), 'Means of samples vary much less than the values they come from, and their distribution is close to normal, even when the values themselves are skewed.')}
<p>Two things stand out. The means vary much less than the BMIs of individual people do. And their distribution is close to normal, even though BMI itself is skewed. That is the <b>central limit theorem</b>: means of reasonably large samples are close to normally distributed, whatever the shape of the data they come from. It is why the normal distribution underlies so many tests.</p>

<h2 id="u-se">The standard error</h2>
<p>The SD of a sampling distribution has a name of its own: the <b>standard error</b> (SE). For a mean, you don’t need a simulation to find it:</p>
{formula('SE = <i>s</i> / √<i>n</i>', 'the SD of the data divided by the square root of the size of the sample')}
{rc('sd(means)', 'sd(bmi) / sqrt(30)')}
<p>The simulation and the formula agree. Because of the √<i>n</i>, a sample four times as large has half the standard error. The SD and the SE are easy to confuse, but they answer different questions:</p>
{sd_se()}
<p>For a proportion <i>p̂</i>, such as the frequency of an allele estimated from <i>n</i> chromosomes, the standard error is:</p>
{formula('SE = √[ <i>p̂</i> (1 − <i>p̂</i>) / <i>n</i> ]')}

<h2 id="u-ci">Confidence intervals</h2>
<p>A <b>95% confidence interval</b> (CI) gives a range of plausible values for a parameter. Because the sampling distribution is close to normal, the estimate is within 1.96 standard errors of the true value in 95% of samples, so:</p>
{formula('95% CI = estimate ± 1.96 × SE')}
<p>For a mean, R uses a slightly larger number than 1.96 from the <i>t</i> distribution, <code>qt(0.975, df = n − 1)</code>, which allows for having estimated the SD as well; for large samples the two are almost the same. <code>t.test()</code> calculates the interval for you, and <code>$conf.int</code> takes it out of the result:</p>
{rc('se <- sd(bmi) / sqrt(length(bmi))', 'se', 'mean(bmi) + c(-1, 1) * qt(0.975, df = length(bmi) - 1) * se', 't.test(bmi)$conf.int')}
<p>So, with 95% confidence, the mean BMI of the population these people come from is between 24.08 and 24.64. The box below says exactly what “95% confidence” means.</p>
{figure(figs.many_intervals(), 'Twenty samples, each with its 95% confidence interval. Most of the intervals contain the true mean, but about one in twenty misses it (red): with 95% confidence, you will be wrong 5% of the time.')}
{callout("concept", "What “95% confident” means", "<p>The true mean is fixed: it is either inside this interval or not. The 95% describes the <b>method</b>: if you repeated the study many times, and calculated an interval in the same way each time, 95% of those intervals would contain the true value. It is <i>not</i> a 95% probability that the true value is in this particular interval. A wider interval means a less precise estimate: more data, or less variable data, give narrower intervals.</p>")}

<h2 id="u-af">An allele’s frequency, with its confidence interval</h2>
<p>The R577X variant of <i>ACTN3</i> (the gene for α-actinin-3, a protein of fast muscle fibres) changes a codon for arginine (R, the C allele here) into a stop codon (X, the T allele). People with two copies of X make no α-actinin-3 at all. Each person contributes two alleles, so the frequency of the T allele is the number of T alleles divided by the number of alleles:</p>
{rc(G_VEC, P_T, 'p_T', 'p_T + c(-1, 1) * 1.96 * sqrt(p_T * (1 - p_T) / (2 * length(g)))')}

<h2 id="u-boot">The bootstrap</h2>
<p>Not every estimate has a simple formula for its standard error: the median doesn’t, for example. The <b>bootstrap</b> gets round this by treating the sample as if it were the population, and drawing new samples from it <b>with replacement</b> (so a person can be drawn more than once), each as large as the original. The spread of the estimates from those samples shows how much the estimate varies, and the middle 95% of them gives a confidence interval:</p>
{rc(NDRM_VEC, 'set.seed(2)', BOOT_MED, 'quantile(boot_medians, c(0.025, 0.975))')}
<p>So a 95% confidence interval for the median gain in strength is 42.9% to 50%. (NDRM.CH only takes some values, because the weights go up in steps of 2.5 pounds, so the bootstrapped medians do too.)</p>
{activity("Measure the uncertainty", [
    rtask("u-means", f'Make the 2,000 means of samples of 30 BMIs, as above, and keep them in {c("means")}.', MEANS30),
    rtask("u-hist", 'Draw a histogram of the 2,000 means.', gg("GeomBar", stat="StatBin")),
    rtask("u-120", f'Now make 2,000 means of samples of 120, four times as large, in an object called {c("means120")}. Compare their SD with that of the means of 30.', MEANS120),
    rtask("u-se", 'Calculate the standard error of the mean BMI of all 1,032 people.', lastv(near(0.1425119, 1e-5))),
    rtask("u-ci", 'Calculate the 95% confidence interval for the mean BMI.', lastv(CI_BMI)),
    rtask("u-af", f'Calculate the frequency of the A allele of {c("esr1_rs1042717")} (its genotypes are AA, GA and GG).', lastv(near(0.25, 1e-6))),
    rtask("u-afci", 'Calculate a 95% confidence interval for that frequency.', lastv(CI_ESR1)),
    rtask("u-boot", 'Calculate a bootstrap 95% confidence interval for the median NDRM.CH, as above.', lastv(BOOT)),
])}
{q("u-q-se", "What is the standard error of the mean BMI of all 1,032 people, to two decimal places?", "0.14, from <code>sd(bmi) / sqrt(length(bmi))</code>, which is 4.58 / √1032. The SD of BMI is 4.58: people vary a lot, but the mean of 1,032 of them is known quite precisely.", accept=ACC_SE, placeholder="A number")}
{q("u-q-af", "What is the frequency of the A allele of esr1_rs1042717?", "0.25: (2 × 71 + 468) / (2 × 1220) = 610 / 2440. The 95% CI is 0.233 to 0.267.", accept=ACC_025, placeholder="A proportion")}
{mcq("u-q-n", "The SD of your means of samples of 120 was about half that of the means of samples of 30. Why?", [
    ("The standard error is the SD divided by √n, and √120 is twice √30", True, "To halve the standard error, you need four times as much data."),
    ("Larger samples have a smaller SD", False, "The SD of the BMIs themselves is about the same in large and small samples. It is the standard error of the mean that shrinks."),
    ("Because the samples of 120 overlapped more", False, "The reason is the √n in the standard error."),
])}
{mcq("u-q-sdse", "A paper reports that the participants’ mean BMI was 24.4 (SD 4.6). Which statement is right?", [
    ("A typical participant’s BMI was within a few units of 24.4: the SD describes how BMI varied between people", True, "The SD describes the people. The SE (0.14) would describe how precisely the mean is known."),
    ("The true mean BMI is between 19.8 and 29.0 with 95% confidence", False, "That confuses the SD with the SE. The confidence interval for the mean is much narrower: 24.08 to 24.64."),
    ("If the study were repeated, the mean would change by about 4.6", False, "The mean would change by about the SE (0.14), not the SD."),
])}
{mcq("u-q-ci", "The 95% CI for the mean BMI is 24.08 to 24.64. Which interpretation is right?", [
    ("If the study were repeated many times, 95% of the intervals calculated like this would contain the true mean", True, "The 95% is a property of the method, over many repetitions."),
    ("There is a 95% probability that the true mean is between 24.08 and 24.64", False, "The true mean is fixed, so it is either in this interval or not. This is the most common misreading of a confidence interval."),
    ("95% of the participants have a BMI between 24.08 and 24.64", False, "That would be a range for individuals, which is far wider. The CI is about the mean."),
])}
{optional("Check the 95% yourself", f"""
<p>If 95% intervals really contain the true value 95% of the time, you should be able to see it. Take 1,000 samples of 30 BMIs, calculate a confidence interval from each, and count how often the interval contains the “true” mean, <code>mean(bmi)</code>:</p>
{block(COVER)}
{activity("Count the intervals that contain the true mean", [rtask("u-cover", f"Run the code above, then calculate {c('mean(covered)')}, the proportion of intervals that contain the true mean.", lastv("is.numeric(v) && length(v) == 1 && v > 0.9 && v < 0.98"))])}
{q("u-q-cover", "What proportion did you get, and why isn’t it exactly 0.95?", "About 0.94 or 0.95. Each set of 1,000 intervals is itself a random sample, so the proportion varies a little around 0.95. (With samples as small as 30 from a skewed distribution, it can be a little below 0.95, because the t interval assumes the data are roughly normal.)")}
""")}
'''
    return chapter("uncertainty", "4", "Samples and uncertainty", "rstudio", "Samples, standard errors and confidence intervals", 55,
                   "An estimate from a sample is never exactly right. The standard error and the confidence interval tell you how wrong it might be.", body)


# ---------------------------------------------------------------------------------------------------------------------
def ch_report():
    body = f'''
<h2 id="r-why">Why a report in Quarto?</h2>
<p>A result is only useful if someone else can see how you got it, and get it again. If you copy numbers from the Console into a Word document, nobody can check where they came from, and when the data change you have to do it all again by hand. A <b>Quarto</b> document (<code>.qmd</code>) keeps your text, your code and its results together. When you <b>Render</b> it, the code is run from the beginning and the results are put into a web page with your text. Your assessment for this course is a reproducible analysis of this kind, so each week’s report is practice for it.</p>

<h2 id="r-parts">The parts of a Quarto document</h2>
<ul>
<li>A <b>header</b> in YAML, between two lines of <code>---</code>, with the document’s title, author and output format.</li>
<li><b>Text</b> in Markdown: <code>## A heading</code>, <code>**bold**</code>, <code>*italic*</code>, lists that start with <code>-</code>, and so on.</li>
<li><b>Chunks</b> of R code, which start with <code>```{{r}}</code> and end with <code>```</code>. Lines at the top of a chunk that start with <code>#|</code> are its options: <code>#| label: by-sex</code> names it, <code>#| echo: false</code> hides the code but shows its results, and <code>#| message: false</code> and <code>#| warning: false</code> hide messages and warnings.</li>
<li><b>Inline code</b>, <code>`r …`</code>, which puts the result of a little R into a sentence, so that the numbers in your text always match the data.</li>
</ul>
{callout("warn", "Render runs your document in a new R", "<p>When you render, the document is run from the top in a <b>new R session</b>, not in the R of the Console. It doesn’t see the objects you made in the Console, so it must load its packages and read its data itself. It also runs in the folder the document is saved in, your home folder here, so the data are in <code>data/famuss.csv</code>, wherever the Console’s working directory is. This is the whole point: if the document renders, everything it needs is in it.</p>")}

<h2 id="r-start">Start your report</h2>
<p>Here is the start of a report. <b>Create this file</b> saves it as <code>week2.qmd</code> in your home folder and opens it in RStudio. Change the author to your name, and then click <b>Render</b> at the top of the document. The first time, RStudio asks to install the packages <b>knitr</b> and <b>markdown</b>, which do the rendering; say yes. Rendering takes a minute or so, because it starts a new R and loads the tidyverse into it (you can follow it in the Background Jobs tab). The rendered report appears in the Viewer, and it is saved as <code>week2.html</code> in your Files.</p>
{codefile("week2.qmd", TEMPLATE)}
{activity("Write and render your report", [
    task("r-create", 'Create <code>week2.qmd</code> with the button above.', auto="file:create path~week2.qmd"),
    task("r-render", 'Render it, and look at the report in the Viewer.', auto="knit:done path~week2.qmd ok=true"),
    task("r-ci", f'Under <b>Uncertainty</b>, add a chunk that makes {c("bmi")} and calculates the 95% confidence interval for the mean pre-training BMI with {c("t.test()")}.', check=r"has:week2.qmd|t\.test\("),
    task("r-inline", f'Add a sentence that gives the frequency of the T allele of ACTN3 R577X, using inline code (<code>`r …`</code>) so that the number comes from the data.', check=r"has:week2.qmd|`r [^`]*(actn3|p_T|TT)"),
    task("r-render2", 'Render the report again, and check that your confidence interval and your sentence appear in it.', check="has:week2.html|95 percent confidence interval"),
])}
{mcq("r-q-new", "You delete the <code>setup</code> chunk and render again. The report stops with <code>object 'fms' not found</code>, although <code>fms</code> is in your Environment pane. Why?", [
    ("Render runs the document in a new R session, which only has what the document itself creates", True, "That is what makes a report reproducible: everything it needs must be in it."),
    ("The Environment pane is out of date", False, "fms is in the Console’s R, but the report is run in a different R."),
    ("Quarto can’t read CSV files", False, "The setup chunk read it without any trouble. Without that chunk, nothing reads it."),
])}
{mcq("r-q-path", "Why does the report read <code>data/famuss.csv</code>, rather than <code>famuss.csv</code> as you did in the Console?", [
    ("The report runs in the folder it is saved in (your home folder), whatever the Console’s working directory is", True, "Paths in a report are relative to the document. That is why setwd() doesn’t belong in a report."),
    ("Quarto needs the full path of every file", False, "data/famuss.csv isn’t a full path: it is relative to the folder of the document."),
    ("famuss.csv would work just as well", False, "In the report’s folder there is no famuss.csv, only the folder data, which holds it."),
])}
{q("r-q-why", "Give one advantage of writing your analysis as a Quarto report rather than copying the results into a Word document.", "For example: anyone can see exactly how each number was calculated; when the data change, rendering again updates every number, table and plot; inline code means the numbers in the text can’t disagree with the analysis; and a mistake can be fixed once, in the code, rather than in every copied result.")}
'''
    return chapter("report", "5", "Your report", "rstudio", "Your first Quarto report", 30,
                   "Put the main results of this week into a report that anyone can render again from the data, and check that it works.", body)


# ---------------------------------------------------------------------------------------------------------------------
def ch_wrapup():
    body = f'''
<h2 id="wu-ideas">This week’s main ideas</h2>
<ul>
<li>Decide what <b>kind of data</b> each variable is: continuous, a count, categorical, ordinal or binary. It decides the summary, the plot and the test.</li>
<li>Summarise a continuous variable with its <b>centre and spread</b>: the mean and SD, or, when it is skewed or has outliers, the median and IQR. <b>Look at the distribution</b>, and count the <b>missing values</b>.</li>
<li>The <b>normal</b> distribution describes measurements that add up many small effects; the <b>binomial</b> counts successes in a fixed number of trials, such as copies of an allele; the <b>Poisson</b> counts independent events, such as reads at a base; real counts are often <b>over-dispersed</b>.</li>
<li>An estimate varies from sample to sample. Its <b>standard error</b> measures how much, and shrinks with √<i>n</i>. A <b>95% confidence interval</b>, about the estimate ± 1.96 SE, contains the true value in 95% of studies. The <b>bootstrap</b> gives an interval when there is no formula.</li>
<li>A <b>Quarto report</b> is run from the beginning, in a new R, every time it is rendered, so it shows exactly how each result was obtained.</li>
</ul>
{homework("Describe a second outcome", f"""
<p>The FAMuSS participants only trained their <b>non-dominant</b> arm. The dominant arm wasn’t trained, so its change in strength, <code>DRM.CH</code>, shows how much people improve without training: from getting used to the test, for example. Add a section to <code>week2.qmd</code> that describes it, and render the report again.</p>
{activity("Homework 2", [
    task("hw-sum", f"Summarise {c('DRM.CH')} for women and men (the number of people, the mean, the median and the SD), in a chunk of your report.", check=r"has:week2.qmd|\bDRM\.CH"),
    task("hw-plot", f"Plot its distribution, and compare it with that of {c('NDRM.CH')}.", check=r"has:week2.qmd|aes\([^)]*\bDRM\.CH"),
    task("hw-ci", f"Calculate a 95% confidence interval for the mean of {c('DRM.CH')}.", check=r"has:week2.qmd|t\.test\([^)]*\bDRM\.CH"),
    task("hw-af", "Choose another SNP from the data, and report the frequency of one of its alleles with a 95% confidence interval.", check=r"has:week2.qmd|sqrt\("),
    task("hw-render", "Render the report, and write two or three sentences that interpret your results for someone who isn’t a statistician.", check=r"has:week2.html|\bDRM\.CH"),
])}
{q("hw-q-drm", "How did the dominant (untrained) arm change, compared with the trained arm? What does that tell you about how to judge the effect of the training?", "The untrained arm got stronger too, but much less: a mean change of about 11% (95% CI 9.6% to 12.0%), against about 53% in the trained arm. Some of the change in the trained arm would have happened anyway (for example, because people got used to the test), so the effect of the training is better judged against the untrained arm, a kind of control, than against zero.")}
""")}
'''
    return finish_chapter("wrapup", "★", "Summary and homework", "Summary and homework",
                          "What you have learnt this week, the homework, and how much of the practical you have done.", body)


def ALL():
    use_golden(NAME)
    return [ch_start(), ch_describe(), ch_shapes(), ch_distributions(), ch_uncertainty(), ch_report(), ch_wrapup()]
