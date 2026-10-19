"""The practicals of the site, in order: weeks 2 to 5 of Biostatistics for Genomic Medicine. make_pages.py makes a page
for each (from template.html and the practical's module of chapters) and the landing page (index.html) that lists them.

To add a practical: write its module of chapters (like week2.py, with ALL() listing the chapters), add an entry here,
record what R prints for its examples (python3 build/harvest.py NAME), and run  python3 build/make_pages.py."""

PROGRAMME = 'Biostatistics for Genomic Medicine'

# the tabs of the workbench that a page can have: (button title, label, the icon's SVG paths, the pane's root)
TABS = {
    'console': ('The standard R console', 'R console', '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 10l3 2-3 2M12 15h5"/>', 'rconRoot'),
    'rstudio': ('RStudio, an integrated development environment for R', 'RStudio', '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M12 4v16M3 12h18"/>', 'rsRoot'),
    'notebook': ('Jupyter-style notebooks in R', 'Notebook', '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 3v18M12 8h4M12 12h4"/>', 'nbRoot'),
    'terminal': ('A bash terminal, with Rscript and R', 'Terminal', '<path d="M4 17l6-5-6-5M12 19h8"/>', 'termRoot'),
    'editor': ('Your files and a text editor', 'Files', '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v1H7l-4 9z"/><path d="M3 19l3.5-8H22l-3.5 8z"/>', 'edRoot'),
    'assistant': ('AI assistant', 'AI', '<path d="M12 3l2 5.5L19.5 10 14 12l-2 5.5L10 12l-5.5-2L10 8.5z"/><path d="M19 17l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/>', 'aiRoot'),
}

FAMUSS = ('famuss.csv (the FAMuSS study: 1,397 young adults who did 12 weeks of strength training of their non-dominant arm; '
          'one row per person, with the columns id, Gender, Age, Race, Pre.height (inches), Pre.weight (pounds), pre.BMI, Pre_NDRM_Max '
          'and Post_NDRM_Max (the heaviest weight lifted with the non-dominant arm before and after the training, in pounds), NDRM.CH '
          '(its percentage change), the same for the dominant arm (Pre_DRM_Max, Post_DRM_Max, DRM.CH), and 222 columns of genotypes '
          'named gene_variant, such as actn3_r577x and esr1_rs1042717, holding genotypes such as "CC", "CT" and "TT"; many values are '
          'missing (NA), because not everyone was measured or genotyped)')
LEUK = ('leukaemia.csv (89 adults with B-cell acute lymphoblastic leukaemia from the ALL study: the columns sample, sex, age, BT '
        '(the B-cell stage), mol.biol (the molecular subtype: NEG, BCR/ABL or ALL1/AF4), remission (CR, complete remission, or REF, '
        'refractory) and the expression (log2) of five genes: ABL1, HOXA9, MEIS1, CD52 and RAG1)')
EXPR = ('all_expression.csv (the expression, log2, of all 12,625 probes of the microarray in the 79 NEG and BCR/ABL patients of '
        'leukaemia.csv: one row per probe, with the columns probe, symbol and one column per patient, named as in leukaemia.csv’s '
        'sample column)')
VIRCO = ('virco.csv (1,066 samples of HIV-1 from the Virco data: SeqID and other details, the fold resistance to eight '
         'protease inhibitors (APV.Fold, ATV.Fold, IDV.Fold for indinavir, LPV.Fold, NFV.Fold for nelfinavir, RTV.Fold, SQV.Fold, '
         'TPV.Fold; how many times as much drug it takes to inhibit the virus as a reference virus), and the amino acid at each of '
         'the 99 positions of the protease, in the columns P1 to P99: "-" is the reference amino acid, "." a position that '
         'could not be read, and letters the amino acids found)')
HGDP = ('hgdp_akt1.csv (1,064 people from 51 populations of the Human Genome Diversity Project, with the columns ID, Gender, '
        'Population, Geographic.origin, Geographic.area and their genotypes at four SNPs in AKT1: AKT1.C0756A, AKT1.C6024T, '
        'AKT1.G2347T and AKT1.G2375A)')

AI_STYLE = ('Show small, complete examples that run here, in the style of this course: the tidyverse (library(tidyverse)) for '
            'reading and wrangling data (read_csv, filter, select, mutate, group_by, summarise, count, pivot_longer) and for plots '
            '(ggplot2), and base R’s statistics functions (mean, sd, quantile, t.test, wilcox.test, aov, TukeyHSD, chisq.test, '
            'fisher.test, cor.test, lm, glm, p.adjust, prcomp). Explain the statistics in plain words for healthcare professionals '
            'who are learning biostatistics: what a result means, and what it does not mean. Use na.rm = TRUE or drop the missing '
            'values, because the FAMuSS data have many. Never put personal or patient data into an answer.')

COURSES = [
    {
        'id': 'week2',
        'page': 'week2.html',
        'data_page': 'week2',
        'module': 'week2',
        'title': 'Week 2: Describing data',
        'short': 'Describing data',
        'week': 2,
        'subtitle': PROGRAMME + ', week 2: describing data, distributions and uncertainty',
        'description': 'Week 2 of Biostatistics for Genomic Medicine: describing data, probability distributions in genomics, '
                       'standard errors and confidence intervals, with the FAMuSS genetic study. R runs in your web browser, '
                       'in an RStudio-style workbench, so there is nothing to install.',
        'card': 'Describe a real genetic study before you test anything: centre, spread and missing values, the shapes of '
                'distributions, the normal, binomial and Poisson distributions behind genomic data, and how much an estimate '
                'could vary by chance.',
        'topics': ['Types of data, centre and spread', 'Missing values and summaries by group', 'Seeing distributions with ggplot2',
                   'The normal, binomial and Poisson distributions', 'Sampling variation and the standard error',
                   'Confidence intervals, and a first Quarto report'],
        'time': 'About 4 hours',
        'tabs': ['rstudio', 'editor', 'assistant'],
        'first': 'rstudio',
        'ai': {
            'course': 'week 2 of Biostatistics for Genomic Medicine, a course for healthcare professionals: describing data, '
                      'distributions and uncertainty, in R in RStudio',
            'aiData': 'The course’s data are in ~/data: ' + FAMUSS + ', ' + LEUK + ', ' + EXPR + ', ' + HGDP + ' and ' + VIRCO + '. This week uses famuss.csv.',
            'aiStyle': AI_STYLE,
            'aiChat': ['What is the difference between a standard deviation and a standard error?',
                       'When should I report the median rather than the mean?',
                       'What does a 95% confidence interval mean?',
                       'Why is the number of copies of an allele a binomial variable?'],
            'ex': {'obj': 'fms', 'Obj': 'Fms', 'dataName': 'the FAMuSS data', 'file': '~/data/famuss.csv',
                   'read': 'fms <- read_csv("~/data/famuss.csv")', 'mean': 'mean(fms$NDRM.CH, na.rm = TRUE)',
                   'cols': ['id', 'Gender', 'Age', 'Race', 'Pre.height', 'Pre.weight', 'pre.BMI', 'Pre_NDRM_Max', 'Post_NDRM_Max',
                            'NDRM.CH', 'actn3_r577x', 'esr1_rs1042717'],
                   'factors': ['Gender', 'Race', 'actn3_r577x', 'esr1_rs1042717']},
        },
    },
    {
        'id': 'week3',
        'page': 'week3.html',
        'data_page': 'week3',
        'module': 'week3',
        'title': 'Week 3: Testing hypotheses',
        'short': 'Testing hypotheses',
        'week': 3,
        'subtitle': PROGRAMME + ', week 3: hypothesis tests and comparing groups',
        'description': 'Week 3 of Biostatistics for Genomic Medicine: the logic of a hypothesis test, comparing two and several '
                       'groups, tests for genotypes and other categorical data, and Hardy–Weinberg equilibrium, with leukaemia '
                       'and FAMuSS data. R runs in your web browser, so there is nothing to install.',
        'card': 'Build a p-value yourself by shuffling labels, then use t-tests, Wilcoxon tests, ANOVA, chi-square and Fisher’s '
                'exact tests on leukaemia subtypes and genotypes, test Hardy–Weinberg equilibrium, and learn to choose the right test.',
        'topics': ['Null hypotheses, test statistics and p-values', 'A permutation test, by hand', 't-tests, Wilcoxon tests and paired data',
                   'ANOVA, Kruskal–Wallis and post hoc tests', 'Chi-square, Fisher’s exact test and odds ratios',
                   'Hardy–Weinberg equilibrium as quality control'],
        'time': 'About 4½ hours',
        'tabs': ['rstudio', 'editor', 'assistant'],
        'first': 'rstudio',
        'ai': {
            'course': 'week 3 of Biostatistics for Genomic Medicine, a course for healthcare professionals: hypothesis tests and '
                      'comparing groups, in R in RStudio',
            'aiData': 'The course’s data are in ~/data: ' + FAMUSS + ', ' + LEUK + ', ' + EXPR + ', ' + HGDP + ' and ' + VIRCO + '. This week uses famuss.csv and leukaemia.csv.',
            'aiStyle': AI_STYLE,
            'aiChat': ['What exactly does a p-value tell me, and what does it not?',
                       'When should I use a Wilcoxon test instead of a t-test?',
                       'Why use Fisher’s exact test rather than a chi-square test?',
                       'Why can a mixture of populations make a SNP fail a Hardy–Weinberg test?'],
            'ex': {'obj': 'leuk', 'Obj': 'Leuk', 'dataName': 'the leukaemia data', 'file': '~/data/leukaemia.csv',
                   'read': 'leuk <- read_csv("~/data/leukaemia.csv")', 'mean': 'mean(leuk$ABL1)',
                   'cols': ['sample', 'sex', 'age', 'BT', 'mol.biol', 'remission', 'ABL1', 'HOXA9', 'MEIS1', 'CD52', 'RAG1',
                            'Gender', 'Age', 'pre.BMI', 'NDRM.CH', 'actn3_r577x', 'esr1_rs1042717'],
                   'factors': ['sex', 'BT', 'mol.biol', 'remission', 'Gender', 'actn3_r577x']},
        },
    },
    {
        'id': 'week4',
        'page': 'week4.html',
        'data_page': 'week4',
        'module': 'week4',
        'title': 'Week 4: Regression',
        'short': 'Regression',
        'week': 4,
        'subtitle': PROGRAMME + ', week 4: regression, the framework behind the tests',
        'description': 'Week 4 of Biostatistics for Genomic Medicine: correlation, linear regression, genotypes as predictors, '
                       'confounding and interactions, checking a model, logistic regression and odds ratios, with the FAMuSS '
                       'data. R runs in your web browser, so there is nothing to install.',
        'card': 'Fit lines through data and read what they say: correlation, simple and multiple linear regression, additive '
                'genotype models, confounding by sex and age, an ACTN3-by-sex interaction, logistic regression, and why the '
                'tests of week 3 are all linear models.',
        'topics': ['Correlation, and what it isn’t', 'Simple linear regression and least squares', 'Genotypes as predictors: additive and other codings',
                   'Confounding, adjustment and interactions', 'Checking a model with its residuals', 'Logistic regression and odds ratios'],
        'time': 'About 4½ hours',
        'tabs': ['rstudio', 'editor', 'assistant'],
        'first': 'rstudio',
        'ai': {
            'course': 'week 4 of Biostatistics for Genomic Medicine, a course for healthcare professionals: linear and logistic '
                      'regression, in R in RStudio',
            'aiData': 'The course’s data are in ~/data: ' + FAMUSS + ', ' + LEUK + ', ' + EXPR + ', ' + HGDP + ' and ' + VIRCO + '. This week uses famuss.csv.',
            'aiStyle': AI_STYLE,
            'aiChat': ['How do I interpret the slope of a regression line?',
                       'What does it mean to adjust for a confounder?',
                       'How do I turn a logistic regression coefficient into an odds ratio?',
                       'Why is a t-test the same as a linear model?'],
            'ex': {'obj': 'fms', 'Obj': 'Fms', 'dataName': 'the FAMuSS data', 'file': '~/data/famuss.csv',
                   'read': 'fms <- read_csv("~/data/famuss.csv")', 'mean': 'mean(fms$NDRM.CH, na.rm = TRUE)',
                   'cols': ['id', 'Gender', 'Age', 'Race', 'Pre.height', 'Pre.weight', 'pre.BMI', 'NDRM.CH', 'actn3_r577x',
                            'esr1_rs1042717', 'actn3', 'esr1', 'obese'],
                   'factors': ['Gender', 'Race', 'actn3_r577x', 'esr1_rs1042717']},
        },
    },
    {
        'id': 'week5',
        'page': 'week5.html',
        'data_page': 'week5',
        'module': 'week5',
        'title': 'Week 5: Genome-scale inference',
        'short': 'Genome-scale inference',
        'week': 5,
        'subtitle': PROGRAMME + ', week 5: multiple testing, population structure and a mini-GWAS',
        'description': 'Week 5 of Biostatistics for Genomic Medicine: the multiple-testing problem, Bonferroni and false '
                       'discovery rates, HIV drug-resistance mutations, a genome-wide comparison of gene expression, population '
                       'structure and principal components, linkage disequilibrium, and a small genetic association study. R '
                       'runs in your web browser, so there is nothing to install.',
        'card': 'Scale up from one test to thousands: false positives and how to control them, with HIV drug-resistance '
                'mutations and 12,625 probes in leukaemia; how ancestry can create false associations; linkage '
                'disequilibrium; and a mini-GWAS of the FAMuSS SNPs with QQ and Manhattan plots.',
        'topics': ['Why many tests give false positives', 'Bonferroni and the false discovery rate', 'Testing every gene on a microarray',
                   'Population structure and principal components', 'Linkage disequilibrium', 'A mini-GWAS, with QQ and Manhattan plots'],
        'time': 'About 4½ hours',
        'tabs': ['rstudio', 'editor', 'assistant'],
        'first': 'rstudio',
        'ai': {
            'course': 'week 5 of Biostatistics for Genomic Medicine, a course for healthcare professionals: multiple testing, '
                      'population structure and genetic association studies, in R in RStudio',
            'aiData': 'The course’s data are in ~/data: ' + FAMUSS + ', ' + LEUK + ', ' + EXPR + ', ' + HGDP + ' and ' + VIRCO + '. This week uses all of them.',
            'aiStyle': AI_STYLE,
            'aiChat': ['What is the difference between the family-wise error rate and the false discovery rate?',
                       'How does the Benjamini–Hochberg procedure work?',
                       'Why can population structure create false associations?',
                       'How do I read a QQ plot of p-values?'],
            'ex': {'obj': 'fms', 'Obj': 'Fms', 'dataName': 'the FAMuSS data', 'file': '~/data/famuss.csv',
                   'read': 'fms <- read_csv("~/data/famuss.csv")', 'mean': 'mean(fms$NDRM.CH, na.rm = TRUE)',
                   'cols': ['id', 'Gender', 'Age', 'Race', 'pre.BMI', 'NDRM.CH', 'actn3_r577x', 'acdc_rs1501299', 'akt1_g15129a',
                            'akt1_g14803t'],
                   'factors': ['Gender', 'Race', 'actn3_r577x', 'acdc_rs1501299', 'akt1_g15129a', 'akt1_g14803t']},
        },
    },
]
