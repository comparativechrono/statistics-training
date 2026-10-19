# Biostatistics for Genomic Medicine: the statistics practicals (weeks 2 to 5)

**Four practicals for weeks 2 to 5 of the module *Biostatistics for Genomic Medicine* (Department of Genomic Medicine, University of Cambridge; Tim Hearn and Leonardo Bottolo): describing data, testing hypotheses, regression, and genome-scale inference. Each practical explains the statistics, shows how to do it in R, and then asks the student to do it themselves on real genetic and genomic data. R runs in the student's web browser, in an RStudio-style workbench with the instructions alongside it, so there is nothing to install.**

The site follows on from the week 1 practical, [Introduction to R](https://comparativechrono.github.io/r-training/) ([repository](https://github.com/comparativechrono/r-training)), and it is built on the same [R workbench](https://github.com/comparativechrono/r-workbench). R is provided by webR (R 4.6 compiled to WebAssembly), so the R that students use is real R, and everything they do stays in their own browser. The site is static (HTML, CSS and JavaScript only), so it can be hosted on GitHub Pages or any ordinary web server.

---

## Contents

1. [The site](#the-site)
2. [The four practicals](#the-four-practicals)
3. [How a practical works](#how-a-practical-works)
4. [Before students use it](#before-students-use-it)
5. [Publishing it on GitHub Pages](#publishing-it-on-github-pages)
6. [Trying it on your own computer](#trying-it-on-your-own-computer)
7. [Settings in `config.js`](#settings-in-configjs)
8. [Changing a practical](#changing-a-practical)
9. [The data](#the-data)
10. [What students keep, and privacy](#what-students-keep-and-privacy)
11. [Limitations](#limitations)
12. [How it was tested](#how-it-was-tested)
13. [Files](#files)
14. [Credits and licences](#credits-and-licences)

---

## The site

| Page | What it is |
| --- | --- |
| `index.html` | The landing page. It lists the four practicals, shows how far the student has got with each, and has the student's name (which appears on the answers they download) |
| `week2.html` | Week 2: *Describing data* |
| `week3.html` | Week 3: *Testing hypotheses* |
| `week4.html` | Week 4: *Regression* |
| `week5.html` | Week 5: *Genome-scale inference* |

Each practical's page has the instructions on the left and the workbench on the right, with three tabs:

| Tab | What it contains |
| --- | --- |
| **RStudio** | An IDE modelled on RStudio and made for teaching: the Source pane (scripts and Quarto documents, run line by line with <kbd>Ctrl</kbd>+<kbd>Enter</kbd>, sourced with Source, or rendered with Render), the Console, the Environment and History panes, and the Files, Plots, Packages, Help and Viewer panes |
| **Files** | The student's home folder (`~`), with the data in `~/data`, a text editor and viewers for tables, pictures and PDFs |
| **AI** | An AI assistant set up as a tutor for the week, which students can use with a key of their own for an AI service |

## The four practicals

Each practical is a day's work (about 4 to 4½ hours, not counting the extras), in short chapters. The chapters follow the blocks of the module's session plans, and each week ends with that week's homework. Every week the student writes a short report in a Quarto document (`week2.qmd` to `week5.qmd`, in their home folder) and renders it to a web page; the reports are practice for the analysis they hand in for their assessment, and week 5's is the start of its core section.

### Week 2: Describing data (34 steps and 24 questions, and 9 steps and 3 questions in the extras and the homework)

| Chapter | What students learn and do |
| --- | --- |
| 0. Start here | Installing and loading the tidyverse, the working directory, and the FAMuSS data (1,397 young adults who did 12 weeks of strength training, with 222 SNPs) |
| 1. Describing data | Types of data, centre and spread, missing values, and summaries by group. *If you have time:* many columns at once with `across()` |
| 2. Seeing distributions | Histograms, box plots and density plots, and skew. *If you have time:* transforming a skewed variable |
| 3. Probability distributions | The normal, binomial and Poisson distributions behind genomic data (genotypes, read depth), and simulating data. *If you have time:* the law of large numbers |
| 4. Samples and uncertainty | Sampling variation, the standard error, confidence intervals (for a mean and for an allele's frequency) and the bootstrap. *If you have time:* checking that 95% of intervals contain the truth |
| 5. Your report | Why a report in Quarto, the parts of a Quarto document, and a first report, rendered and then extended with an inline result |
| ★ Summary and homework | The main ideas, the homework (describe a second outcome) and the student's progress |

### Week 3: Testing hypotheses (38 steps and 31 questions, and 6 steps and 1 question in the homework)

| Chapter | What students learn and do |
| --- | --- |
| 0. Start here | The leukaemia data (89 adults with B-cell ALL: their subtypes, remission and the expression of five genes) |
| 1. The logic of a test | Null hypotheses, test statistics and p-values, built by hand as a permutation test of ABL1 expression; decisions and errors |
| 2. Two groups | t-tests, their assumptions and QQ plots, the Wilcoxon test, and paired data |
| 3. Several groups | Why not many t-tests, ANOVA, Tukey's test and Kruskal–Wallis, on HOXA9 and ACTN3 |
| 4. Categorical data | Tables of counts, the chi-square test, Fisher's exact test and odds ratios, and Hardy–Weinberg equilibrium (with a function the student keeps in `hwe.R`, and the Wahlund effect) |
| 5. Choosing a test | Six situations, and the test for each |
| 6. Your report | The tests in a Quarto report |
| ★ Summary and homework | The main ideas, the homework (choose and run the right tests) and the student's progress |

### Week 4: Regression (41 steps and 25 questions, and 5 steps and 1 question in the homework)

| Chapter | What students learn and do |
| --- | --- |
| 0. Start here | From tests to models; coding genotypes as numbers of alleles |
| 1. Correlation | Pearson's and Spearman's correlation, and what correlation isn't |
| 2. Linear regression | The model, least squares, `lm()`, its summary, confidence intervals and predictions |
| 3. Genotypes as predictors | The additive, genotypic, dominant and recessive codings |
| 4. Confounding | Multiple regression, confounding (BMI and sex), and an interaction (ACTN3 R577X and sex) |
| 5. Checking a model | The assumptions (LINE), and plots of residuals |
| 6. Logistic regression | Yes-or-no outcomes, log odds and odds ratios, with `glm()` |
| 7. Tests are models | t-tests and ANOVA as linear models |
| 8. Your report | The models in a Quarto report |
| ★ Summary and homework | The main ideas, the formative homework (a regression with a confounder) and the student's progress |

### Week 5: Genome-scale inference (48 steps and 31 questions, and 10 steps and 1 question in the extras and the homework)

| Chapter | What students learn and do |
| --- | --- |
| 0. Start here | Why testing thousands of hypotheses needs new rules, and two functions for genotypes in `snps.R` (`dosage()` and `hwe_p()`) |
| 1. Many tests | p-values when nothing is going on, the family-wise error rate, and a t-test at each of the 47 commonly mutated positions of the HIV protease (Virco data) |
| 2. Corrections | Bonferroni, the false discovery rate and the Benjamini–Hochberg procedure (by hand and with `p.adjust()`), and which mutations survive each. *If you have time:* raw against adjusted p-values |
| 3. Genome-wide | A t-test of each of the 12,625 probes of the leukaemia microarray, the histogram of p-values, a volcano plot, genome-wide significance, the winner's curse and replication |
| 4. Population structure | AKT1 allele frequencies around the world (HGDP), population stratification, a simulated study in which ancestry creates false associations, PCA, adjustment for PC1, and QQ plots. *If you have time:* the genomic inflation factor, and Hardy–Weinberg tests in a mixture of populations |
| 5. Linkage disequilibrium | r², the genotypes of two SNPs in LD, a heat map of LD in *AKT1*, and what LD means for association studies |
| 6. A mini-GWAS | Quality control (call rate, MAF, HWE), a regression for each of the 163 SNPs that pass, Bonferroni and BH, QQ and Manhattan plots, and an honest interpretation. *If you have time:* the scan in one ancestry group |
| 7. Your report | The mini-GWAS in a Quarto report |
| ★ Summary and homework | The main ideas, the homework (the mini-GWAS write-up, which feeds the assessment) and the student's progress |

The practicals have no certificates. Instead, the last chapter of each shows how much of it the student has done, lists anything that is left, and, once it is complete, offers their answers to download and a link to the next week.

## How a practical works

- **Steps tick themselves.** Each chapter has one or more activities, lists of steps. A step ticks itself (and is marked *✓ spotted*) when the workbench sees that it has been done, and students can also tick steps themselves. There are three kinds of check:
  - an **event** on the page, such as a package installed, a file created from the instructions or a document rendered;
  - a **condition**, such as a file containing something (for the reports: “the report has a Fisher's test”, “the rendered page has two plots”);
  - an **R check**: an R expression that RStudio's R session evaluates quietly after each command, which ticks the step when it is TRUE. Most of these look at the value of the student's last command (which R keeps in `.Last.value`) or at the objects in R's memory, so any correct way of getting a result counts: a t-test ticks its step if it is the right test of the right variables, whatever the student calls their data, and a plot ticks its step if it has the layers and aesthetics asked for and R can draw it.
- **Questions.** Short answers and multiple-choice questions are marked straight away. Questions that ask for a sentence count once the student has written something. The model answer to a question is shown, with *Show answer*, once the student has had a go (see `showModelAnswers` below). The options of a multiple-choice question are written with the right answer first, and the page shows them in an order of their own (the same every time).
- **If you have time** parts are extras for faster students, and each week's **homework** is for after the session. Their steps and questions are checked in the same way, but they don't count towards finishing the practical.
- **R output in the instructions.** What the instructions show R printing is what R really prints: it was recorded by running the code in R (see [Changing a practical](#changing-a-practical)), and the tests check every piece of it in the browser.
- **Progress** is shown at the top of each practical, on each chapter's tab, in the last chapter, and on the landing page. When a practical is complete, the student gets a message and the landing page marks it as finished.
- **The tidyverse on each page.** Each practical's page keeps its own list of installed packages, so each practical asks students to install the tidyverse once. After the first time, the browser has a copy, so it takes seconds rather than a minute.
- **Files carry over.** The four practicals share the student's home folder, so the data, the scripts (`hwe.R`, `snps.R`) and the reports are the same in every week.

## Before students use it

1. **Computers and browsers.** Students need a laptop or desktop computer with a current version of Chrome, Edge, Firefox or Safari; 8 GB of memory is comfortable. The pages work on a phone, but the screen is cramped.
2. **Network.** As well as your site, students' browsers must be able to reach `webr.r-wasm.org` (R itself: about 30 MB on the first visit, after which the browser keeps a copy) and `repo.r-wasm.org` (R packages: the tidyverse takes about a minute to download the first time, and rendering a report the first time installs knitr and markdown). Students who use the AI assistant also need to reach their AI service (for Gemini, `generativelanguage.googleapis.com`).
3. **Timing.** R in the browser is slower than R on a computer. Reading the expression data and testing all 12,625 probes takes about 15 seconds in week 5, and rendering a report takes about a minute, because the report runs in a new R session that loads the tidyverse and reads the data again.
4. **AI keys.** The assistant uses a key that each student enters themselves. The key is only kept in the browser tab, never in a file or in the browser's long-term storage. Free Gemini keys are available at [aistudio.google.com/apikey](https://aistudio.google.com/apikey) (students need a Google account and must be 18 or over); please read Google's [Gemini API Additional Terms](https://ai.google.dev/gemini-api/terms) first. The practicals can be done without the assistant.
5. **Shared computers.** Students' work is stored in the browser profile, so computers that wipe profiles when students log out will lose it. Students should download their reports (with **My files**) and their answers (with **My answers**) before they leave.
6. **Personal and patient data.** The practicals use public research data. The instructions and the assistant's settings tell students never to put personal or patient data into an AI tool.

## Publishing it on GitHub Pages

1. On GitHub, open the repository's *Settings → Pages → Build and deployment* page. Under Source choose **Deploy from a branch**, then choose the branch **main** and the folder **/ (root)**, and click Save. (The repository needs to be public, unless your GitHub plan supports Pages for private repositories.)
2. After a minute or so, the site is at `https://comparativechrono.github.io/statistics-training/`. That is the address to give students: it opens the landing page.
3. The first time a browser opens a page of the site, the page reloads itself once. This installs a small service worker (`isolation-sw.js`), which makes the page *cross-origin isolated*: R needs this to be interrupted with <kbd>Esc</kbd> and to wait for typed input. Without it, R still works, but a long calculation can't be stopped except by restarting R.

The empty file `.nojekyll` stops GitHub from processing the site. The site doesn't need the `build/` and `test/` folders, but keep `assets/vendor/licenses/` and the licence files next to the libraries. To host the site on another web server, copy the folder; it needs no server-side code, but its address must use `https` (or be `localhost`).

**Students' work belongs to the site's address.** If the site moves to a different address, students start afresh there. All the GitHub Pages sites of one account share one address (`https://comparativechrono.github.io`), so each site there needs its own `storePrefix` (see below): this site uses `sta`, and the week 1 site uses `rtr`, so the two don't share or overwrite each other's files.

## Trying it on your own computer

Opening the pages directly from your disk (`file://…`) doesn't work, because browsers block the Web Workers and data files that R needs. Serve the folder with a local web server instead:

```bash
cd statistics-training
python3 serve.py 8000        # then open http://localhost:8000
```

`serve.py` sends the cross-origin isolation headers itself. Any other local web server will do, as long as the address is `localhost` or uses `https`.

## Settings in `config.js`

`assets/js/config.js` holds the settings you are most likely to change. **Never put an API key in it**, because anyone can read the files of a public site.

| Setting | What it does |
| --- | --- |
| `courseTitle`, `courseSubtitle` | The name of the module and the line under it |
| `site` | The department, institution, module and tutors, shown at the top of the landing page |
| `showModelAnswers` | `'after-try'` (the default) shows a *Show answer* button under a question once the student has answered it, right or wrong. `true` shows the button straight away, and `false` hides model answers altogether. The answers are still in the pages' source code, so adding `?answers` to the address shows them all, which is handy for tutors but also open to students |
| `storePrefix` | The prefix for everything the site saves in the browser (`sta`). All four practicals share it, so a student's files and name are the same in each |
| `webrBase`, `rRepos` | Where R (webR 0.6.0) and R packages are downloaded from |
| `liveProvider`, `geminiModel`, `geminiFallbackModels`, `anthropicModel`, `aiWaitSeconds` | The AI service offered first, and the models to use. Models are retired from time to time, so keep these up to date |
| `biowasmBase`, `hostname`, `storageWarnMB` | The programs used by the terminal inside RStudio, the computer name in its prompt, and how much a student can store before the page warns them |

The practicals' titles, the text of their cards on the landing page and what the AI assistant is told about each week are in `build/courses.py`; the rest of the landing page is in `build/landing.html`.

## Changing a practical

The pages are generated by Python, from the files in `build/`:

| File | What it holds |
| --- | --- |
| `courses.py` | The list of practicals, in order: for each, its page, title, the text of its card on the landing page, the tabs of its workbench, and what the AI assistant is told about it and its data |
| `week2.py` … `week5.py` | The chapters of each practical. `ALL()` lists them in order; `PRELUDE` is the R code that comes before the examples (loading the tidyverse and setting the working directory) |
| `lib.py` | The helpers that write the chapters' HTML (see below) |
| `figs.py` | The diagrams in the text (the normal curve, least squares, the Benjamini–Hochberg procedure, QQ plots and so on), drawn as inline SVG |
| `golden/week2.json` … | What R prints for each example in the instructions, recorded by `harvest.py` |
| `harvest.py` | Runs every example of a practical in R, in order, and records what R prints |
| `template.html`, `landing.html` | The practical's page and the landing page, with `{{PLACEHOLDERS}}` for what changes |
| `make_pages.py` | Writes `week2.html` … `week5.html` and `index.html` |
| `data-prep/make_data.R` | Makes the data files from their sources (see [The data](#the-data)) |

**The examples of R output.** In the chapters, `rc("code", …)` shows a piece of RStudio's Console: the commands and what R prints for them. The output isn't typed into the text: it is taken from `golden/NAME.json`, which `harvest.py` makes by running all the examples of a practical in R on your computer (with `options(width = 80)`, as RStudio's Console is in the tests). R and the packages should be the versions that webR uses (R 4.6 and the current tidyverse), so that the output is the same as in the browser; `test/t01_examples.py` then checks every example in the browser. `setup("code")` is code that the examples rely on but the text shows some other way (for example in a box with a *show me* button); it is run, but not shown.

To change a practical:

1. Edit its module, `build/weekN.py`, and write any numbers in the text from what R prints.
2. Record R's output: `python3 build/harvest.py weekN` (it needs R on the PATH, with the tidyverse). It reports any example whose output has changed.
3. Make the pages: `python3 build/make_pages.py`. It reports the number of steps and questions in each practical, and stops with an error if an example's output hasn't been recorded, or if two steps, questions or headings in a practical have the same name.
4. Try the page with `python3 serve.py`, run the tests (see [How it was tested](#how-it-was-tested)), and commit the pages together with your changes.

The helpers in `lib.py` include those of the R workbench (`chapter`, `activity`, `task`, `q`, `mcq`, `callout`, `codefile` and the buttons) and these, written for the practicals:

| Helper | What it produces |
| --- | --- |
| `rtask(id, html, rcheck)` | A step that ticks when the R expression `rcheck` is TRUE in RStudio's R session (it is evaluated quietly after each command, for the chapter on screen) |
| `lastv(cond)`, `near(x, tol)`, `htest(method, …)`, `tib(n, cols)`, `has_table(n, cols)`, `has_vec(n, cond)`, `has_obj(cond)`, `gg(geom, …)` | Ready-made R checks: a condition on the value of the last command (`v`); a number near `x`; a test of this kind; a table with `n` rows and these columns; and “there is a table, vector or object like this in R's memory, whatever its name”; and “the last command drew a ggplot with this geometry and statistic, these aesthetics mapped to these columns, and R can draw it” |
| `rc(code, …)`, `console((code, output), …)` | A piece of RStudio's Console, with the output recorded by `harvest.py` (or given) |
| `block(code)`, `rscode(code)`, `codefile(path, text)` | R code with a *show me* button that types it into RStudio's Console; and a file with a *Create this file* button, which saves it in the student's home folder and opens it in RStudio |
| `formula(html, note)`, `figure(svg, caption)`, `table(head, rows)` | A formula, a diagram from `figs.py`, and a table |
| `optional(title, html)`, `homework(title, html)` | An *If you have time* part and the week's homework, whose steps and questions don't count towards finishing the practical |
| `finish_chapter(...)` | The last chapter of a practical, with the student's progress |

Everything in `data/` (except `PROVENANCE.md`) is copied into each student's `~/data` folder the first time they open a practical; a file that is already there is left alone.

## The data

| File | What it holds | Used in |
| --- | --- | --- |
| `famuss.csv` | The FAMuSS study: 1,397 young adults who trained their non-dominant arm for 12 weeks, with their strength before and after, and 222 SNPs | weeks 2 to 5 |
| `leukaemia.csv` | 89 adults with B-cell acute lymphoblastic leukaemia (the ALL study): their subtype, remission and the expression of five genes | weeks 3 and 4 |
| `all_expression.csv` | The expression of all 12,625 probes of the microarray in the 79 of them with the NEG or BCR/ABL subtype | week 5 |
| `hgdp_akt1.csv` | 1,064 people from 51 populations of the Human Genome Diversity Project, genotyped at four SNPs in *AKT1* | week 5 |
| `virco.csv` | 1,066 samples of HIV-1: the amino acid at each of the 99 positions of the protease, and resistance to eight protease inhibitors | week 5 |

FAMuSS, the HGDP data and the Virco data are the versions published with Andrea Foulkes's *Applied Statistical Genetics with R* (Springer, 2009), which the module's original practicals used; the leukaemia data come from Bioconductor's ALL package. [data/PROVENANCE.md](data/PROVENANCE.md) gives the sources, the studies to cite, and exactly what was done to each file, and `build/data-prep/make_data.R` makes all five files from their sources (it reproduces them byte for byte). **Please read the note on licences at the end of PROVENANCE.md before publishing the site**: the book's data page doesn't state a licence for the three files that come from it.

## What students keep, and privacy

Students' files, ticks, answers, name and settings are stored in the browser's storage for the site, on their own computer, and they are still there when the student comes back in the same browser. Nothing is stored on a server. A different browser, a different computer or a private window won't have them, and clearing the browser's data for the site deletes them. **My answers** downloads a student's answers as a web page (with their name, if they gave one), and **My files** downloads their files as a `.zip` file.

The site sets no cookies and has no tracking or analytics. The only things that leave a student's computer are: requests for the pages themselves; R and its packages (from `webr.r-wasm.org` and `repo.r-wasm.org`); anything the student's own R code downloads; and, only if the student connects an AI model, their questions and whatever context they choose to send with them, which go to the AI service they chose, using their own key. The student's name is never sent: in anything that goes to the AI service, it is replaced by `user`.

## Limitations

- **R in the browser** is R 4.6.0 (webR 0.6.0). Each R session runs on one processor core, with WebAssembly's memory limit of a few gigabytes. Packages come from the webR repository, which has most of CRAN, including the whole of the tidyverse. Bioconductor packages aren't available, which is why the leukaemia data are provided as CSV files.
- **Quarto.** Reports are rendered with the real knitr and markdown packages, in a new R session, to a page styled like Quarto's; Quarto itself (and pandoc) can't run in the browser, so formats other than HTML, and Quarto features beyond the chunk options that knitr understands, aren't available.
- **The RStudio tab is an imitation** made for teaching. It has the panes, menus, dialogs and messages of RStudio that the practicals need, but it is not RStudio, and it isn't made or endorsed by Posit. What students learn in it carries over to the real program.
- **Cross-origin isolation** needs `https` (or `localhost`) and a browser that allows service workers. It was tested in Chromium; please try the browsers your students will use.

## How it was tested

The site was tested in Chromium (with Playwright) on 19 October 2026, with R and its packages downloaded from webR's servers, using the scripts in `test/`:

| Script | What it checks |
| --- | --- |
| `t00_answers.py` | That the short questions accept the right answers (in the forms students are likely to type them) and not the wrong ones. It doesn't need a browser |
| `t01_examples.py` | That every piece of Console shown in the instructions is what R really prints: it runs all of them (for all four weeks) in RStudio's Console in the browser and compares the output |
| `t02_week2.py` … `t05_week5.py` | A student working through each practical from start to finish: installing the tidyverse, every step and every question (with code a student would write), steps that must *not* tick for the wrong thing, the files created from the instructions, the report created, rendered, extended and rendered again, the message when the practical is finished, the progress panel, the landing page afterwards, and the homework's checks |
| `t06_assistant.py` | The AI tab, against a stand-in for the AI service with a fake key: the suggested questions, the offline help, that the key stays in memory, what is sent (and that the student's name isn't), and code in an answer going to RStudio |

To run the tests you need Python 3 and Playwright with Chromium:

```bash
python3 build/make_pages.py
python3 test/t00_answers.py
python3 test/t01_examples.py          # or: python3 test/t01_examples.py week5
python3 test/t02_week2.py
python3 test/t03_week3.py
python3 test/t04_week4.py
python3 test/t05_week5.py
python3 test/t06_assistant.py
```

## Files

| Path | What it is |
| --- | --- |
| `index.html`, `week2.html` … `week5.html` | The pages (generated: see `build/`) |
| `assets/js/` | The site's code. Most of it comes from the R workbench and the week 1 site; `progress.js` (progress and the name dialog) and `landing.js` (the landing page) were written for these practicals |
| `assets/css/` | The styles; `stats.css` was written for these practicals |
| `assets/vendor/` | Third-party libraries, with their licences (see `THIRD_PARTY.md`) |
| `data/` | The practicals' data, copied into each student's `~/data` (see `data/PROVENANCE.md`) |
| `build/`, `test/` | The generator of the pages, and the tests |
| `isolation-sw.js`, `serve.py` | The service worker for cross-origin isolation, and a local web server for trying the site |

## Credits and licences

- **The practicals** were written for the module *Biostatistics for Genomic Medicine* by Tim Hearn and Leonardo Bottolo, Department of Genomic Medicine, University of Cambridge.
- **The data** come from the studies listed in [data/PROVENANCE.md](data/PROVENANCE.md), which also gives their sources and licences.
- **The workbench**, its code and the RStudio imitation come from the [R workbench](https://github.com/comparativechrono/r-workbench), by way of the week 1 site, [r-training](https://github.com/comparativechrono/r-training).
- **R** in the browser is [webR](https://docs.r-wasm.org/webr/).
- The licences of everything included in the site, or downloaded by it, are listed in [THIRD_PARTY.md](THIRD_PARTY.md).
