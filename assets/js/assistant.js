/* =====================================================================
   The AI assistant of the R workbench.

   Chat  – a real AI model, set up as a tutor for students who are
           learning R, answers questions about R code, error messages,
           functions, plots and the ways of using R here. With each
           question it gets – if the user leaves the boxes ticked – what
           the user is working on: the end of the R console, the document
           open in RStudio (or the lines selected in it) with the end of
           RStudio's console and the names of its objects, the open
           notebook's code, the last terminal commands and the names of
           the user's files – never what is in the data files. Code in its
           answers goes into the R console, RStudio, a notebook, the
           terminal or a file with one click.
           Errors come here with a click: "Ask the AI assistant about this
           error" under a failed command (term:ask), "Ask AI" on a notebook
           cell (nb:ask), an R error from any tab (r:ask – {where:
           'console' | 'rstudio' | 'notebook', code, error, output}), and
           "Explain my last error" when the tab the user came from shows
           one.
   Agent – the same model as an agent: it carries out a task by running
           commands in the Terminal (R through Rscript), one step at a
           time, in a folder of its own (~/ai-agent/run-N). It may read any
           file but write only there: what a step changes outside it is
           undone. Every command and its output is shown, and the run is
           kept as a Markdown record in its folder (agent-record.md).
   The model is the user's: Google Gemini (free tier), Anthropic or an
   OpenAI-compatible service, called from the browser with a key that the
   user enters. The key is kept in memory – or, if the user asks, in this
   tab's sessionStorage until the tab is closed – never in localStorage and
   never in a file. Without a key: how to get one, a prompt to copy into
   another AI tool, and offline help for common R error messages.
   ===================================================================== */
(function () {
  'use strict';
  const MG = window.MG;
  const { h, esc, bus, toast, store } = MG;
  const CFG = MG.config || {};
  const KEY_NAME = (CFG.storePrefix || 'rwb') + '-ai-key'; // (sessionStorage, and only when the user asks)
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const HOME = () => (MG.app && MG.app.HOME) || '/home/user';
  const pretty = (p) => (MG.app && MG.app.fs ? MG.app.fs.pretty(p) : p);
  const TAB_NAMES = { console: 'R console', rstudio: 'RStudio', notebook: 'Notebook', terminal: 'Terminal', editor: 'Files', assistant: 'AI assistant' };
  const tabName = (k) => (MG.app && MG.app.tabName && MG.app.tabName[k]) || TAB_NAMES[k] || k;
  const stamp = () => {
    const d = new Date(), p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
  };
  const quote = (t) => String(t || '').trim().split('\n').map((l) => '> ' + l).join('\n');
  /** a fenced code block that the text cannot break out of (a fence longer than any run of backticks in it) */
  const fence = (text, lang) => {
    const t = String(text == null ? '' : text).replace(/\s+$/, '');
    const run = Math.max(2, ...(t.match(/`+/g) || []).map((x) => x.length));
    const f = '`'.repeat(run + 1);
    return `${f}${lang || ''}\n${t}\n${f}`;
  };
  /** wait for something that a tab makes when it is first shown */
  async function waitFor(get, ms = 8000) {
    for (let t = 0; t < ms && !get(); t += 50) await sleep(50);
    return get();
  }
  const ask = (title, html, ok) =>
    MG.confirmBox
      ? MG.confirmBox(title, html, ok)
      : new Promise((resolve) => {
          let done = false;
          const end = (v) => {
            if (done) return;
            done = true;
            m.close();
            resolve(v);
          };
          const m = MG.modal(title, html + `<div class="prompt-actions"><button class="btn" data-x="no" type="button">Cancel</button><button class="btn primary" data-x="yes" type="button">${esc(ok || 'OK')}</button></div>`, { onClose: () => end(false) });
          m.box.querySelector('[data-x="no"]').addEventListener('click', () => end(false));
          m.box.querySelector('[data-x="yes"]').addEventListener('click', () => end(true));
        });

  /* ------------------------------------------------------------------
     answers: Markdown → HTML (marked), cleaned (DOMPurify). A model's answer can contain anything, so no
     scripts, forms, styles or pictures get through (a picture would be fetched at once, from any address).
     Code blocks become boxes with buttons (codeBox).
     ------------------------------------------------------------------ */
  const CLEAN = { FORBID_TAGS: ['style', 'form', 'input', 'button', 'textarea', 'select', 'iframe', 'script', 'img', 'picture', 'video', 'audio', 'source', 'object', 'embed', 'svg', 'math', 'link', 'meta', 'base'], FORBID_ATTR: ['style', 'srcset'] };
  const clean = (html) => (window.DOMPurify ? window.DOMPurify.sanitize(html, CLEAN) : '<p>' + esc(html) + '</p>');
  /** a code fence's file name: ```r scripts/plot.R  (or title="plot.R") */
  function fenceFile(words) {
    return (
      words
        .map((x) => x.replace(/^(title|file|filename|path)=/i, '').replace(/^["']|["']$/g, ''))
        .find((x) => /^[\w.~/+-]+$/.test(x) && (/\.\w{1,8}$/.test(x) || x.includes('/')) && !/^\d/.test(x)) || null
    );
  }
  /** Markdown → [{html} | {code, lang, file, chunk}] */
  function mdBlocks(md) {
    const src = String(md || '');
    const M = window.marked;
    if (!M || !M.lexer || !M.parser) return [{ html: '<p>' + esc(src).replace(/\n/g, '<br>') + '</p>' }];
    let toks;
    try {
      toks = M.lexer(src, { gfm: true });
    } catch (e) {
      return [{ html: '<pre>' + esc(src) + '</pre>' }];
    }
    const out = [];
    let run = [];
    const flush = () => {
      if (!run.length) return;
      run.links = toks.links || {};
      let html;
      try {
        html = M.parser(run, { gfm: true });
      } catch (e) {
        html = '<p>' + esc(run.map((t) => t.raw || '').join('')) + '</p>';
      }
      out.push({ html: clean(html) });
      run = [];
    };
    for (const t of toks) {
      if (t.type === 'code') {
        flush();
        const raw = String(t.lang || '').trim();
        // (the fence of an R Markdown chunk: ```{r}, ```{r label, echo = FALSE})
        const chunk = /^\{\s*([A-Za-z]+)/.exec(raw);
        const info = raw.split(/\s+/).filter(Boolean);
        out.push({ code: t.text, lang: chunk ? chunk[1].toLowerCase() : (info[0] || '').toLowerCase(), file: chunk ? null : fenceFile(info.slice(1)), chunk: !!chunk });
      } else run.push(t);
    }
    flush();
    return out;
  }

  /* the languages of code blocks */
  const PY = /^(python|py|python3|ipython|ipython3|pycon|jupyter)$/;
  const RL = /^(r|rscript|splus|s|rconsole|webr)$/;
  const RMD = /^(rmd|rmarkdown|qmd|quarto)$/;
  const SH = /^(bash|sh|shell|console|zsh|shell-session|sh-session|shellscript|terminal|cmd|command)$/;
  const PLAIN = /^(text|txt|plaintext|output|log|stdout|stderr|none|rout|out)$/;
  const EXT = { r: '.R', rscript: '.R', rmd: '.Rmd', rmarkdown: '.Rmd', qmd: '.qmd', quarto: '.qmd', bash: '.sh', sh: '.sh', shell: '.sh', python: '.py', py: '.py', yaml: '.yaml', yml: '.yaml', json: '.json', csv: '.csv', tsv: '.tsv', markdown: '.md', md: '.md', html: '.html', css: '.css', sql: '.sql', javascript: '.js', js: '.js', toml: '.toml', ini: '.ini', xml: '.xml', awk: '.awk', sed: '.sed', tex: '.tex', latex: '.tex' };
  /** commands typed after a prompt ("$ head data.csv") – the rest of such a block is what they printed */
  function shellCode(code) {
    const lines = String(code).replace(/\r/g, '').split('\n');
    const prompted = lines.filter((l) => /^\s*\$\s/.test(l));
    return prompted.length ? prompted.map((l) => l.replace(/^\s*\$\s+/, '')).join('\n') : code;
  }
  /** R code as it is typed: a console transcript ("> x <- 1", "+ …" for the lines that go on, then what R printed) is
      reduced to its commands */
  function rCode(code) {
    const lines = String(code).replace(/\r/g, '').split('\n');
    const first = lines.find((l) => l.trim()) || '';
    if (!/^> /.test(first)) return code;
    const out = [];
    let cmd = false;
    for (const l of lines) {
      if (/^> /.test(l) || l === '>') {
        out.push(l.slice(2));
        cmd = true;
      } else if (cmd && (/^\+ /.test(l) || l === '+')) out.push(l.slice(2));
      else cmd = false;
    }
    return out.join('\n').replace(/\n+$/, '');
  }
  /** the commands of a block, one by one (lines that belong together – a loop, a here-document – are one) */
  function shellCommands(code) {
    const SL = MG.shellLang;
    const cmds = [];
    let acc = null;
    for (const line of String(code).replace(/\r/g, '').replace(/\n+$/, '').split('\n')) {
      if (acc == null && (!line.trim() || /^\s*#/.test(line))) continue;
      acc = acc == null ? line : acc + '\n' + line;
      let more = false;
      try {
        more = !!(SL && SL.incomplete && SL.incomplete(acc));
      } catch (e) {
        more = false;
      }
      if (!more) {
        cmds.push(acc);
        acc = null;
      }
    }
    if (acc != null) cmds.push(acc);
    return cmds;
  }
  const knownCommand = (n) => !!((MG.shellTools && MG.shellTools[n]) || (MG.shellBuiltins && MG.shellBuiltins[n]) || (MG.shellLang && MG.shellLang.isShellWord && MG.shellLang.isShellWord(n)));
  /** an unlabelled code block that is terminal commands: its first word is a command of the terminal */
  function looksShell(code) {
    const first = String(code).split('\n').find((l) => l.trim() && !/^\s*#/.test(l)) || '';
    const w = first.trim().replace(/^\$\s+/, '').split(/\s+/)[0] || '';
    return knownCommand(w) && !/^(library|print|function|for|if|while|repeat|source|help|data|set)$/.test(w) && !/^\S+\s*(<-|=)/.test(first.trim());
  }
  /** an unlabelled code block that is R */
  const looksR = (code) => /<-|\|>|%>%|\blibrary\s*\(|\bfunction\s*\(|\bc\s*\(|\b(read\.csv|data\.frame|ggplot|summary|mean|print|plot|head|str|View)\s*\(|\w\$\w/.test(String(code));
  /* code that deletes, moves or overwrites files: asked about before it runs */
  const RISKY = /(^|[\s;&|(`])(rm|rmdir|mv|shred|truncate)(\s|$)|\s-delete\b|>\s*\/home|>\s*~\//m;
  const RISKY_R = /\b(unlink|file\.remove|file\.rename|dir\.delete)\s*\(/;

  /* ------------------------------------------------------------------
     what the model is told about the workbench
     ------------------------------------------------------------------ */
  const PENGUINS = 'species, island, bill_len, bill_dep, flipper_len, body_mass, sex, year';
  /* The page's course (build/make_pages.py writes window.RT_PAGE): its data and its examples, used in what the
     assistant is told and in its offline help. Without it, the R workbench's penguins. */
  const PAGE = window.RT_PAGE || null;
  const EX = Object.assign(
    { obj: 'penguins', Obj: 'Penguins', dataName: 'the penguins data', file: '~/data/penguins.csv', read: 'df <- read.csv("~/data/penguins.csv")', mean: 'mean(penguins$body_mass, na.rm = TRUE)', cols: PENGUINS.split(', '), factors: ['species', 'island', 'sex'] },
    (PAGE && PAGE.ex) || {}
  );
  /** the page has this tab (a course page has only the tabs it needs) */
  const has = (t) => !(MG.app && MG.app.hasTab) || MG.app.hasTab(t);
  /** the places that code from an answer can go, in words: 'the R console, RStudio, a notebook or the terminal' */
  const placesInWords = () => {
    const p = [['console', 'the R console'], ['rstudio', 'RStudio'], ['notebook', 'a notebook'], ['terminal', 'the terminal']].filter(([t]) => has(t)).map(([, w]) => w);
    return p.length > 1 ? p.slice(0, -1).join(', ') + ' or ' + p[p.length - 1] : p[0] || 'RStudio';
  };
  function rVersions() {
    const V = (MG.R && MG.R.versions) || {};
    return { r: V.r || '4.6', webr: V.webr || ((CFG.webrBase || '').match(/v(\d+\.\d+(\.\d+)?)/) || [])[1] || '0.6' };
  }
  function installed() {
    try {
      return MG.R && MG.R.userlib ? MG.R.userlib.list() : [];
    } catch (e) {
      return [];
    }
  }
  /** the programs of the terminal, with their versions */
  function programs() {
    const T = MG.shellTools || {};
    const W = (MG.wasm && MG.wasm.versions) || {};
    const v = (x) => (x ? ' ' + x : '');
    return [
      T.Rscript ? "Rscript (Rscript script.R [args], Rscript -e 'code' – a new R for each run, which ends with the script; plots go to Rplots.pdf unless the script opens png() or pdf())" : null,
      T.R ? "R (R CMD BATCH script.R keeps a record of the run in script.Rout; R -e 'code'; R --no-save < script.R; R on its own starts R's console in the terminal)" : null,
      `GNU coreutils${v(W.coreutils)} (cat head tail wc sort uniq cut tr tee paste join comm seq shuf …), grep${v(W.grep)}, sed${v(W.sed)}, gawk${v(W.gawk)} (awk), diff and cmp${W.diffutils ? ' (diffutils ' + W.diffutils + ')' : ''}`,
      "the shell's own ls cd pwd mkdir cp mv rm touch find tree du stat file chmod xargs env printf bc expr, open FILE (shows a file), nano FILE (edits it in the Files tab), download FILE"
    ]
      .filter(Boolean)
      .join('; ');
  }
  /** the environment: for the chat, the prompt for another AI tool and the agent */
  function envLines() {
    const v = rVersions();
    const pk = installed();
    return [
      PAGE && !has('console') && !has('notebook')
        ? `- R ${v.r} (webR ${v.webr}): R compiled to WebAssembly, running in the browser. The student works in RStudio's Console and scripts: one R session (Session > Restart R starts a new one). Each Rscript run, knit or R in RStudio's Terminal is a separate R. They share the files and the installed packages.`
        : `- R ${v.r} (webR ${v.webr}): R compiled to WebAssembly, running in the browser. Each way of using R here is a separate R session, as R processes on a computer are: the R console tab, RStudio's Console, the notebooks (one R shared by all notebooks), and each Rscript run, knit or R in the terminal. Objects made in one are not in another; they share the files and the installed packages.`,
      `- Packages come from the webR repository: CRAN packages built for webR – a large part of CRAN, ggplot2, dplyr, tidyr, readr, readxl and stringr among them, but not every package with compiled code. A package is installed once with install.packages("name") – in any R of the workbench – and then loaded with library(name) in each R session that uses it. ${pk.length ? 'Installed in this browser now: ' + pk.join(', ') + '.' : 'None is installed in this browser yet; R’s base packages (stats, graphics, grDevices, utils, datasets, methods, tools …) are always there – the recommended packages (MASS, Matrix, lattice …) are not: they are installed like any other.'}`,
      PAGE && PAGE.aiData
        ? `- ${PAGE.aiData}`
        : `- The course's data: ~/data/penguins.csv (344 penguins of three species from three islands; columns ${PENGUINS}; missing values are NA) and ~/data/penguins.xlsx (the same data: a sheet "penguins" and a sheet "about"; read it with readxl::read_excel). R 4.6 also has the same data built in, as datasets::penguins (in it species, island and sex are factors).`,
      PAGE && !has('console') && !has('notebook')
        ? `- Files: the student's files are in ~ (= ${HOME()}), kept in the browser. RStudio's R starts in ~ (getwd()); setwd() or Session > Set Working Directory changes it; knitting runs in the document's folder. A full path such as "${EX.file}" works wherever the working directory is.`
        : `- Files: the student's files are in ~ (= ${HOME()}), kept in the browser and shared by all the tabs. Working directories: the R console and RStudio start in ~; a notebook's code runs in the notebook's folder (most are in ~/notebooks); Rscript and R in the terminal start in the terminal's current folder; knitting runs in the document's folder. A path such as "~/data/penguins.csv" works everywhere.`,
      PAGE && !has('console') && !has('notebook')
        ? "- What works: plots (base graphics, ggplot2 …) in RStudio's Plots pane (Export saves them); View() (a table in the Source pane); help pages (?mean, ??search words, help.search()); readline(); knitting R Markdown documents, R Notebooks and Quarto documents to HTML; Shiny apps in RStudio's Viewer (Run App or runApp()); Rscript and R CMD BATCH in RStudio's Terminal tab."
        : "- What works: plots (base graphics, ggplot2 …) – in windows of the R console, in RStudio's Plots pane, under the cell in a notebook, into Rplots.pdf (or the file of png()) with Rscript; View(); help pages (?mean, help.search()); readline(); knitting R Markdown documents, R Notebooks and Quarto documents to HTML; Shiny apps (in RStudio's Viewer – Run App or runApp() – or in a window of the R console; not in notebooks or Rscript); Rscript and R CMD BATCH in the terminal.",
      `- What does not exist here: system(), system2() and shell() (R cannot run other programs: commands go in ${has('terminal') ? 'the Terminal tab' : "RStudio's Terminal tab"}); pandoc and LaTeX (documents knit to HTML only – not to PDF or Word); RStudio projects, Git and add-ins; Python (and so no reticulate); parallel processes.`,
      `- ${has('terminal') ? 'Terminal' : "RStudio's Terminal tab (next to its Console)"}: a bash-like shell simulated in the page (pipes, redirection, variables, $( ), loops, functions, here-documents; no background jobs, and no sudo, apt, curl, wget, git, python or pip). Its programs: ${programs()}.`
    ];
  }

  /* ------------------------------------------------------------------
     offline help (no model connected): what common error messages mean
     Each rule: [pattern, text or (match, all text, the command) => text]. Up to two rules answer.
     ------------------------------------------------------------------ */
  const COLS = EX.cols;
  const inline = (s) => '`' + s + '`'; // (inline code in the help's Markdown)
  /* the package a function of an error message usually comes from */
  const PKG_OF = {
    '%>%': 'dplyr', ggplot: 'ggplot2', aes: 'ggplot2', ggsave: 'ggplot2', mutate: 'dplyr', select: 'dplyr', summarise: 'dplyr', summarize: 'dplyr', group_by: 'dplyr', arrange: 'dplyr', glimpse: 'dplyr', count: 'dplyr', rename: 'dplyr', left_join: 'dplyr', tibble: 'tibble', read_csv: 'readr', write_csv: 'readr', read_tsv: 'readr', read_excel: 'readxl', excel_sheets: 'readxl', pivot_longer: 'tidyr', pivot_wider: 'tidyr', drop_na: 'tidyr', separate: 'tidyr', str_detect: 'stringr', str_replace: 'stringr', str_to_lower: 'stringr', runApp: 'shiny', shinyApp: 'shiny', fluidPage: 'shiny', kable: 'knitr', skim: 'skimr'
  };
  const R_HELP = [
    [
      /object '([^']+)' not found/,
      (m) => {
        const n = m[1], col = COLS.includes(n);
        return [
          `R does not know the name ${inline(n)}. This usually happens for one of these reasons:`,
          `- There may be a typing mistake. Names are case-sensitive, so ${inline(EX.Obj)} is not the same as ${inline(EX.obj)}.`,
          has('console') || has('notebook')
            ? `- The line that creates ${inline(n)} hasn't been run in *this* R session yet, or it failed. Each tab has its own R session, so an object you create in RStudio doesn't exist in the R console or in a notebook. Knitting also starts a new R session, which only has what the document itself creates.`
            : `- The line that creates ${inline(n)} hasn't been run yet in this R session, or it failed. Restarting R (Session ▸ Restart R) empties its memory, so run the lines of your script again from the top. Knitting also starts a new R session, which only has what the document itself creates.`,
          col
            ? `- ${inline(n)} is a column of ${EX.dataName}, not a separate object. Write ${inline(EX.obj + '$' + n)}, or use the name inside a function that is given the data, such as ${inline(EX.factors.includes(n) ? `table(${EX.obj}$${n})` : `mean(${EX.obj}$${n}, na.rm = TRUE)`)} or ${inline(`aes(x = ${n})`)} in ggplot2. If you use ${inline('filter()')} or ${inline('select()')}, load dplyr first with ${inline('library(dplyr)')}. Without it, R uses the ${inline('filter()')} function from the stats package, which doesn't know about the columns.`
            : `- You used a column name on its own. Write ${inline('data$column')} instead, or use the name inside a function that is given the data.`,
          '',
          `To check, ${inline('ls()')} lists the objects in this R session, and ${inline(`exists("${n}")`)} tells you whether R knows the name.`
        ].join('\n');
      }
    ],
    [
      /could not find function "([^"]+)"/,
      (m) => {
        const f = m[1], pkg = PKG_OF[f], fn = /^[\w.]+$/.test(f) ? f + '()' : f;
        return [
          `R does not know the function ${inline(fn)}.`,
          pkg
            ? `- ${inline(fn)} comes from the **${pkg}** package${f === '%>%' ? " (R's built-in pipe, `|>`, doesn't need a package)" : ''}. Install the package once with ${inline(`install.packages("${pkg}")`)} if you haven't already, then load it in this R session with ${inline(`library(${pkg})`)}.`
            : `- If it comes from a package, that package hasn't been loaded in this R session. Load it with ${inline('library(name)')}, after installing it once with ${inline('install.packages("name")')}.`,
          `- It may be a typing mistake. Function names are case-sensitive, so ${inline('Mean()')} is not the same as ${inline('mean()')}.`,
          "- If you wrote the function yourself, you may have defined it in another tab (each tab has its own R session), or the lines that define it haven't been run yet.",
          /^[\w.]+$/.test(f) ? `\n${inline('??' + f)} searches the help pages of the installed packages.` : ''
        ].join('\n');
      }
    ],
    [
      /is not available for this version of R|there is no build of it for webR/,
      'That package has no build for webR (the version of R that runs in the browser), so it can’t be installed here. Look for another package that does the same job, or do it with base R.'
    ],
    [
      /there is no package called ['‘’"`]?([\w.]+)/,
      (m) =>
        `The package **${m[1]}** isn't installed in this browser yet. Install it once with ${inline(`install.packages("${m[1]}")`)} (you can do this in any of the workbench's R sessions), then load it with ${inline(`library(${m[1]})`)}. Packages come from the webR repository, which has a large part of CRAN. Also check the spelling (it is ${inline('ggplot2')}, not ${inline('ggplot')}), and remember that package names are case-sensitive.`
    ],
    [
      /unexpected 'else'/,
      `R treated the ${inline('if')} part as finished before it got to the ${inline('else')}. When code is run line by line, the ${inline('else')} must be on the same line as the ${inline('}')} that closes the ${inline('if')} part, like this:\n\n\`\`\`r\nif (x > 0) {\n  print("positive")\n} else {\n  print("not positive")\n}\n\`\`\``
    ],
    [
      /unexpected (symbol|numeric constant|string constant)/,
      [
        'R couldn’t make sense of the line, because two things are next to each other with nothing between them. Look for:',
        `- a missing comma: ${inline('c(1 2)')} → ${inline('c(1, 2)')}, or ${inline('mean(x na.rm = TRUE)')} → ${inline('mean(x, na.rm = TRUE)')}`,
        `- a missing operator: ${inline('2 x')} → ${inline('2 * x')}`,
        `- a space in a name: ${inline('body mass')} → ${inline('body_mass')}`,
        '- a bracket or quote on the line before that hasn’t been closed.'
      ].join('\n')
    ],
    [
      /unexpected input|unexpected invalid token|invalid multibyte/,
      `R found a character it can't read. Often this is a curly quote (“ ” or ‘ ’) copied from a document or a web page, so type the quotes again as plain ${inline('"')} or ${inline("'")}. Another common cause is a backslash in a path, such as ${inline('C:\\data')}. In R, paths use ${inline('/')} instead.`
    ],
    [
      /unexpected end of input|INCOMPLETE_STRING/,
      `A bracket or a quote was opened but never closed, so R is still waiting for the rest. Count them: each ${inline('(')} needs a ${inline(')')}, each ${inline('{')} needs a ${inline('}')} and each ${inline('"')} needs another ${inline('"')}. (In a console, a ${inline('+')} prompt means that R is waiting for more. Press Esc to start the line again.)`
    ],
    [
      /unexpected ('\)'|'\]'|'\}'|','|'='|'<-'|'\|'|'>'|'<'|'\*'|'\/'|'\^'|'&'|'%')/,
      `R found a bracket, comma or operator where it expected a value, often because there is one too many. Count the brackets: each ${inline('(')} needs exactly one ${inline(')')}. Also check the line before for a comma at the end of an argument list (${inline('c(1, 2, )')}) or an operator with nothing after it.`
    ],
    [
      /non-numeric argument to (binary operator|mathematical function)/,
      `A calculation was given text instead of numbers. This happens with ${inline('"5" + 1')}, or with a column that R read as text because some of its values are not numbers. Check with ${inline('class(x)')} or ${inline('str(data)')}. ${inline('as.numeric(x)')} turns text into numbers (anything that isn't a number becomes NA).`
    ],
    [
      /argument is not numeric or logical|invalid 'type' \((character|list)\) of argument/,
      `The function needs numbers, but it was given text (or a list, or a whole data frame). Give it a single numeric column, for example ${inline(EX.mean)}. ${inline('str(data)')} shows which columns contain numbers.`
    ],
    [/no applicable method for '([^']+)' applied to an object of class "([^"]+)"/, (m) => `${inline(m[1] + '()')} doesn't work on this kind of object (${inline(m[2])}). Check what you gave it with ${inline('class(x)')}. Often it is a different object from the one you meant, or a package that the function needs hasn't been loaded.`],
    [/used without hex digits|is an unrecognized escape/, `In a string, a backslash starts a special character (${inline('"\\n"')} is a new line), so a Windows path such as ${inline('"C:\\Users\\…"')} doesn't work. Use ${inline('/')} in paths instead. Your files here are in ${inline('~')}, so a path looks like ${inline('"' + EX.file + '"')}.`],
    [/object of type 'closure' is not subsettable/, `You used ${inline('$')} or ${inline('[ ]')} on a function. This happens when no data has been created under that name, so R finds a function with the same name instead (${inline('data')}, ${inline('df')}, ${inline('c')} and ${inline('t')} are all functions). Create the data first, for example with ${inline(EX.read)}, or check the name with ${inline('ls()')}.`],
    [/\$ operator is invalid for atomic vectors/, `${inline('$')} works on data frames and lists, but not on a plain vector. Check what the object is with ${inline('class(x)')} or ${inline('str(x)')}. For a vector, use ${inline('x[2]')} or ${inline('x["name"]')} instead.`],
    [/subscript out of bounds/, `You asked for a row, column or element that doesn't exist, such as ${inline('x[[5]]')} of a list with only 3 elements. Check the size with ${inline('length(x)')}, ${inline('dim(x)')} or ${inline('names(x)')}.`],
    [/undefined columns selected/, `A column name in ${inline('data[ , "name"]')} isn't in the data. Check for a typing mistake or a difference in upper and lower case. ${inline('names(data)')} lists the columns. (Leaving out the comma, as in ${inline('data[rows]')}, also gives this error. Rows go before the comma: ${inline('data[rows, ]')}.)`],
    [
      /cannot open (file|the connection|compressed file)|No such file or directory|does not exist in current working directory|[Pp]ath ['‘`"].*['’`"] does not exist|file ['‘`"].*['’`"] does not exist/,
      [
        has('console') || has('notebook')
          ? `R looked for the file in the wrong place, or the name isn't quite right. If a path has no folder in it, R looks in its working directory. ${inline('getwd()')} shows the working directory, which differs between the tabs: the R console and RStudio start in your home folder (${inline('~')}), a notebook uses the folder it is saved in, and ${inline('Rscript')} uses the terminal's current folder.`
          : `R looked for the file in the wrong place, or the name isn't quite right. If a path has no folder in it, R looks in its working directory: ${inline('getwd()')} shows it. RStudio's R starts in your home folder (${inline('~')}), and ${inline('setwd()')} (or Session ▸ Set Working Directory) changes it.`,
        '',
        `The course's data is in ${inline('~/data')}, so a full path such as ${inline('"' + EX.file + '"')} works wherever R's working directory is. ${inline('list.files("~/data")')} shows what is there, and ${inline('file.exists("' + EX.file + '")')} checks whether a path exists.`
      ].join('\n')
    ],
    [/arguments imply differing number of rows|replacement has \d+ rows?, data has \d+/, `The columns have different lengths, so they can't be put together into one table. For example, ${inline('data.frame(x = 1:3, y = 1:2)')} fails. Check each one with ${inline('length()')}. For a new column, also check that it has one value for each row (${inline('nrow(data)')}).`],
    [/missing value where TRUE\/FALSE needed/, `An ${inline('if ( )')} or ${inline('while ( )')} got NA instead of TRUE or FALSE, because a value in the condition is missing. Test for it first with ${inline('is.na(x)')}, or use ${inline('isTRUE(x > 3)')}. (When data have missing values, ${inline('na.rm = TRUE')} leaves them out of ${inline('mean()')}, ${inline('sum()')} and similar functions.)`],
    [/the condition has length > 1/, `${inline('if ( )')} needs a single TRUE or FALSE, but it was given a whole vector. To get one answer about all the values, use ${inline('any()')} or ${inline('all()')}. To get a separate answer for each value, use ${inline('ifelse(x > 3, "big", "small")')}.`],
    [/argument "([^"]+)" is missing, with no default/, (m) => `The function needs an argument called ${inline(m[1])}, but it wasn't given one. ${inline('?name')} (with the function's name) shows its arguments. Also check that a comma or bracket hasn't cut the call short.`],
    [/unused argument/, `A function was given an argument it doesn't have. This is usually a typing mistake in the argument's name, or a bracket in the wrong place, so that the argument went to a different function: ${inline('mean(x), na.rm = TRUE')} instead of ${inline('mean(x, na.rm = TRUE)')}. ${inline('args(name)')} lists the arguments of a function.`],
    [/Removed \d+ rows? containing (missing|non-finite)/, `This is a warning from ggplot2, not an error: rows with missing values (NA) were left out of the plot. To leave them out yourself, use ${inline('na.omit(data)')}, or ${inline('filter(data, !is.na(column))')} with dplyr.`],
    [/NAs introduced by coercion/, `This is a warning, not an error. Some values couldn't be turned into numbers, so they became NA (for example, ${inline('as.numeric("abc")')} gives NA). To see which values they were, use ${inline('x[is.na(as.numeric(x))]')}.`],
    [/R cannot run other programs|could not find function "system2?"/, `R can't run other programs here, because ${inline('system()')} and ${inline('system2()')} do nothing in the browser. Run the command in ${has('terminal') ? 'the Terminal tab' : "RStudio's Terminal tab"} instead, or do the same thing in R with functions such as ${inline('list.files()')}, ${inline('file.copy()')} and ${inline('readLines()')}.`],
    [/a Shiny app needs a window/, 'A Shiny app needs a window to appear in. Run it in RStudio (with Run App) or in the R console tab, but not in a notebook or with Rscript.'],
    [/Quitting from lines|Quitting from/, `This error came from knitting. Knit runs the whole document again from the beginning in a new R session, which only has what the document itself creates. So every object that the document uses must be created, every file read and every package loaded (with ${inline('library()')}) in an earlier chunk. Run all the chunks in order (Run All) to find the one that fails.`],
    [/figure margins too large/, 'The plot doesn’t fit in the space it has. Make the Plots pane (or the plot window) bigger, then draw the plot again.'],
    [/needs pandoc|pandoc|LaTeX/, 'Documents can only be knitted to HTML here. PDF output needs LaTeX and Word output needs pandoc, and neither of them runs in a browser. Knit to HTML instead, and if you need a PDF, print the page to PDF from the browser.'],
    [/non-conformable/, `The two matrices (or the matrix and the vector) don't have sizes that fit together for that operation. Check their sizes with ${inline('dim()')}. Note that ${inline('%*%')} is matrix multiplication, while ${inline('*')} multiplies element by element.`]
  ];
  const NOT_HERE = /^(python3?|pip3?|curl|wget|git|sudo|apt|apt-get|conda|mamba|brew|java|node|npm|rstudio|quarto|pandoc|make|gcc)$/;
  /** a command line that is R code (typed into the terminal): an assignment, a pipe, or a call such as summary(x) – and
      not a command of the terminal with R code in its arguments (Rscript -e 'x <- 1') */
  function looksRLine(line) {
    const l = String(line || '').trim();
    if (!l || /\$\(|`/.test(l)) return false;
    const first = l.split(/\s+/)[0];
    if (!first.includes('(') && knownCommand(first)) return false;
    return /<-|\|>|%>%/.test(l) || /^[\w.]+\s*\(/.test(l);
  }
  const R_IN_TERMINAL = `That is R code, but the terminal understands bash commands, not R. Type R code into the R console tab, RStudio's Console or a notebook. You can also run it from here with ${inline(`Rscript -e '…'`)}, or start R in the terminal by typing ${inline('R')} (and leave it again with ${inline('q()')}).`;
  const SHELL_HELP = [
    [
      /command not found/,
      (m, all, line) => {
        if (looksRLine(line)) return null;
        const w = ((/(\S+): command not found/.exec(all) || [])[1] || '').replace(/^bash:\s*/, '');
        return NOT_HERE.test(w)
          ? `${inline(w)} is not available in this workbench. Its terminal runs in your browser and only has R (${inline('Rscript')} and ${inline('R')}), the GNU text tools and the shell's built-in commands, which ${inline('help')} lists.`
          : `The terminal has no program with that name. Check the spelling. ${inline('help')} lists the programs that are available: R (${inline('Rscript script.R')}, ${inline('R')}), the GNU text tools (${inline('head')}, ${inline('wc')}, ${inline('grep')}, ${inline('awk')} …) and the shell's built-in commands. To run a shell script, use ${inline('bash script.sh')}.`;
      }
    ],
    [/Execution halted/, 'R stopped the script because of an error. The error message is in the lines just above "Execution halted". Fix the line that caused it, then run the script again.'],
    [/Fatal error: cannot open file/, `${inline('Rscript')} couldn't find the script. Check its name and the folder you are in: ${inline('pwd')} shows the current folder, and ${inline('ls *.R')} lists the R scripts in it.`],
    [/No such file or directory|cannot open|[Cc]ould not open|not found: /, `A file or folder in the command isn't where the command looked for it. Check which folder you are in (${inline('pwd')}) and what is in it (${inline('ls')}). A path that doesn't start with ${inline('/')} or ${inline('~')} starts from the current folder. The course's data is in ${inline('~/data')}.`],
    [/Permission denied/, `To run a script as ${inline('./script.sh')}, you first need to make it executable with ${inline('chmod +x script.sh')}. Alternatively, run it with ${inline('bash script.sh')}, or run an R script with ${inline('Rscript script.R')}.`],
    [/unrecognized option|unrecognised option|invalid option|unknown option|illegal option|unknown argument/i, `The program doesn't have that option (at least, not in this version). Check which options it really has with ${inline('PROGRAM --help')}. AI tools often invent options that sound right.`],
    [/syntax error|unexpected token|unexpected EOF|unexpected end of file/i, `The shell couldn't read the command. Look for an unmatched quote or bracket, a ${inline('do')} without a ${inline('done')}, or an ${inline('if')} without a ${inline('fi')}. Characters such as ${inline('(')}, ${inline(')')}, ${inline(';')}, ${inline('&')}, ${inline('|')}, ${inline('<')} and ${inline('>')} must be quoted when they are part of a name, and R code after ${inline(`Rscript -e`)} goes in single quotes.`],
    [/Is a directory/, `The command expected a file but was given a folder. Give the path of a file inside it, or use the command's option for folders (${inline('cp -r')}, ${inline('rm -r')}).`],
    [/out of memory|Cannot enlarge memory|memory access out of bounds|Array buffer allocation failed/i, 'The program ran out of memory. Programs here run inside the browser, which gives each of them a few gigabytes at most. Try working on a smaller file, or on part of the file.'],
    [/stopped by force|Stop requested/i, 'The command was stopped before it finished, so any files it was writing may be missing or incomplete. Run it again.']
  ];
  /** what an error message usually means – Markdown, or null. lang: 'r' (R's messages), 'shell' (a command in the
      terminal: its own messages and R's, for Rscript), or anything else for both. line: the command */
  function offlineHelp(text, lang, line) {
    // (R code typed into the terminal: whatever bash said about it, that is the answer)
    if (lang === 'shell' && looksRLine(line)) return R_IN_TERMINAL;
    const rules = lang === 'r' ? R_HELP : lang === 'shell' ? SHELL_HELP.concat(R_HELP) : R_HELP.concat(SHELL_HELP);
    const hits = [];
    for (const [re, say] of rules) {
      const m = re.exec(String(text || ''));
      if (!m) continue;
      let t = null;
      try {
        t = typeof say === 'function' ? say(m, String(text), line || '') : say;
      } catch (e) {
        t = null;
      }
      if (t && !hits.includes(t)) hits.push(t);
      if (hits.length >= 2) break;
    }
    return hits.length ? hits.join('\n\n') : null;
  }

  /* ------------------------------------------------------------------
     the last error in a tab (for "Explain my last error")
     ------------------------------------------------------------------ */
  /** R's start-up message is not sent (it says nothing about the student's work) */
  function stripBanner(text) {
    const t = String(text || '');
    const m = /^\s*R version [\s\S]{0,2500}?Type 'q\(\)' to quit R\.[^\n]*\n?/.exec(t);
    return m ? t.slice(m[0].length) : t;
  }
  /** the last command in an R console's text, if it ended in an error – or else in a warning → {code, error, output,
      warning} or null */
  function lastRError(text) {
    const lines = String(text || '').replace(/\r/g, '').split('\n');
    while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
    const cmdAt = (from) => {
      for (let i = from; i >= 0 && i >= lines.length - 400; i--) if (/^> \S/.test(lines[i])) return i;
      return -1;
    };
    const k = cmdAt(lines.length - 1);
    if (k < 0) return null;
    const code = [lines[k].slice(2)];
    let j = k + 1;
    while (j < lines.length && /^\+ /.test(lines[j])) code.push(lines[j++].slice(2));
    const rest = lines.slice(j);
    const e = rest.findIndex((l) => /^Error\b/.test(l));
    const w = e < 0 ? rest.findIndex((l) => /^Warning( messages?:|\b)/.test(l)) : -1;
    if (e < 0 && w < 0) return null;
    const at = e >= 0 ? e : w;
    const out = { code: code.join('\n'), error: rest.slice(at).join('\n').trim().slice(0, 2000), output: rest.slice(0, at).join('\n').slice(-1500), warning: e < 0 };
    // (an "else" on a line of its own – code pasted or run line by line – ends with "unexpected '}'": the cause is the
    // else a few commands before, so that is what is asked about)
    if (/unexpected '\}'/.test(out.error)) {
      for (let i = k - 1; i >= 0 && i >= k - 40; i--) {
        if (!/^Error: unexpected 'else'/.test(lines[i])) continue;
        let c = cmdAt(i);
        if (c < 0) break;
        // (with the if … that the else belongs to: the command before it)
        if (cmdAt(c - 1) >= 0) c = cmdAt(c - 1);
        out.code = lines.slice(c, k + 1 + code.length - 1).filter((l) => /^[>+] /.test(l)).map((l) => l.slice(2)).join('\n');
        out.error = lines[i] + '\n' + out.error;
        break;
      }
    }
    return out;
  }

  /* ------------------------------------------------------------------
     the services and their models
     ------------------------------------------------------------------ */
  const LIVE_DEFAULTS = {
    provider: CFG.liveProvider || 'gemini',
    model: CFG.anthropicModel || 'claude-sonnet-5-5',
    geminiModel: CFG.geminiModel || 'gemini-3.8-flash',
    baseURL: 'https://api.openai.com/v1',
    openaiModel: ''
  };
  /* the model of each service; an empty model in the saved settings means the site's default
     from config.js, so a model changed there (e.g. when one is retired) reaches every user
     who has not chosen a model of their own */
  const geminiModelOf = (s) => (s.geminiModel || LIVE_DEFAULTS.geminiModel).trim().replace(/^models\//, '');
  const anthropicModelOf = (s) => (s.model || LIVE_DEFAULTS.model).trim();
  const modelOf = (s) => (s.provider === 'gemini' ? geminiModelOf(s) : s.provider === 'anthropic' ? anthropicModelOf(s) : s.openaiModel || 'model');
  /** Gemini and Anthropic always need a key; an OpenAI-compatible server (e.g. a local one) may not */
  const needsKey = (s) => s.provider !== 'openai';
  /* A Gemini model can be busy (HTTP 503 "high demand"), give no answer at all, or be over one
     of its limits (429) – on the free tier each model has limits of its own, per minute and per
     day. Then the next model of this list is asked; the answer says which one replied.
     The page remembers what a model said, and does not ask it again before that can have
     changed: a busy model after two minutes (then four, eight … if it is busy again), a silent
     one after one minute, a model over a limit when the service says the limit is over (a limit
     per day: not before tomorrow), a model that was not found not at all. That saves time –
     "busy" can take twenty seconds to arrive – and requests, of which the free tier allows few.
     The memory belongs to one key – another key is another project, with limits of its own –
     and lasts until the page is loaded again. */
  const FALLBACK_DEFAULT = ['gemini-3.7-flash', 'gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'];
  const FALLBACKS = (Array.isArray(CFG.geminiFallbackModels) ? CFG.geminiFallbackModels : FALLBACK_DEFAULT).map((m) => String(m).trim().replace(/^models\//, '')).filter(Boolean);
  const BUSY = [500, 502, 503, 504, 529];
  const BUSY_REST = 120, SILENT_REST = 60; // seconds
  const RETRY = 20; // seconds after which it is worth asking busy or silent models again
  /* how long a Gemini model may say nothing – before its answer begins, or in the middle of it – until the request is given up */
  const WAIT = () => (+CFG.aiWaitSeconds > 0 ? Math.max(1, +CFG.aiWaitSeconds) : 60);
  const REST = new Map(); // model → { model, why: 'busy' | 'noanswer' | 'limit' | 'notfound', at, until (ms), daily, limit, n, status, text }
  let restKey = null;
  const resting = (model) => {
    const r = REST.get(model);
    return r && r.until > Date.now() ? r : null;
  };
  const hhmm = (ms) => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  /** what kept a model from answering: in a word or two (under an answer, in the bar) … */
  const skipWord = (x) => (x.why === 'notfound' ? 'not found' : x.why === 'limit' ? (x.daily ? 'over its limit for today' : 'over its limit') : x.why === 'noanswer' ? 'gave no answer' : x.why === 'broke' ? 'broke off' : 'busy');
  /** … and as part of a sentence – with the numbers that the service gave, unless short */
  const told = (x, short) =>
    x.why === 'notfound'
      ? 'was not found'
      : x.why === 'limit'
        ? x.daily
          ? (short || x.limit == null ? 'is over its limit for today' : `is over its daily limit of ${x.limit} requests`) + (short || !isFinite(x.until) ? '' : ` and can be used again after ${hhmm(x.until)}`)
          : 'is over its limit per minute'
        : x.why === 'noanswer'
          ? 'gave no answer'
          : 'is busy';
  /** the error when no Gemini model answered: what each one said. .status: 429 (limits), 503 (busy), 404, or not set
      (no answer came); .retryIn: after how many seconds asking again can help – 0 when it cannot today */
  function noAnswer(all, connection) {
    const some = (f) => all.some(f);
    const waits = all.filter((x) => x.why === 'limit' && !x.daily).map((x) => Math.min(90, Math.max(1, Math.ceil((x.until - Date.now()) / 1000))));
    if (some((x) => x.why === 'busy' || x.why === 'noanswer')) waits.push(RETRY);
    const retryIn = waits.length ? Math.min(...waits) : 0;
    // one model only (no fallback models): its own words
    if (all.length === 1) return Object.assign(new Error(all[0].text), { status: all[0].status, network: all[0].why === 'noanswer', retryIn });
    let status, lead;
    // (a model that answered within the last two minutes, if only with "busy" or "over its limit": the service can be reached)
    const heard = some((x) => x.status && Date.now() - x.at < 120000);
    if (connection || (some((x) => x.why === 'noanswer') && !some((x) => x.why === 'busy'))) lead = heard ? 'The Gemini API can be reached, but no answer came back. Try again in a moment.' : 'The Gemini API could not be reached (no answer came back). Check your internet connection and try again.';
    else if (some((x) => x.why === 'busy')) (status = 503), (lead = 'HTTP 503. Google’s servers are busy (“high demand”). This is a problem on Google’s side, not with your key. Wait a minute and try again.');
    else if (waits.length) (status = 429), (lead = 'HTTP 429. Too many requests. The free tier only allows a few requests per minute, so wait a minute and try again.');
    else if (some((x) => x.why === 'limit')) (status = 429), (lead = 'HTTP 429. There are no requests left for today, because every model that this page tries is over its limit for this key. On the free tier, each model allows a certain number of requests per day, counted per project. You can carry on when the service accepts requests again, or use a key from another person or project.');
    else (status = 404), (lead = 'HTTP 404. None of the models could be found. Check the model name in the AI settings (⚙).');
    return Object.assign(new Error(`${lead} (${all.map((x) => x.model + ' ' + told(x)).join('; ')}.)`), { status, network: !status, retryIn });
  }
  const stopped = () => new DOMException('Stopped', 'AbortError');

  /* ------------------------------------------------------------------
     the agent: what it may run, and where
     ------------------------------------------------------------------ */
  const AGENT_MAX = Math.max(5, +CFG.agentMaxSteps || 20); // steps per task
  const AGENT_OUT = 3000; // characters of each step's output that the model sees
  // a step of the agent that has not ended after this many seconds is stopped (config.js: agentCommandSeconds)
  const AGENT_SECONDS = Math.max(5, +CFG.agentCommandSeconds || 150);
  /* What the agent may not run: cd (each step starts in its folder, where programs put the files they make), exec,
     and R's console on its own (it waits for a person to type). Commands that act on the user's screen refuse the
     agent themselves (open, nano, download, clear: see shell-extra.js). Everything else of the terminal is the
     agent's to use. */
  const AGENT_DENY = new Set(['cd', 'pushd', 'popd', 'exec']);
  const AGENT_ALLOW = { has: (n) => !AGENT_DENY.has(n) };
  /** Does the text start R's console – R on its own, waiting for a person to type? R -e, R -f, R CMD BATCH, and R that
      reads its commands from a file, a here-document or a pipe do not wait. */
  function startsRConsole(text) {
    const SL = MG.shellLang;
    let list;
    try {
      list = SL.parse(text);
    } catch (e) {
      return false;
    }
    let found = false;
    const walkList = (l) =>
      l &&
      Array.isArray(l.items) &&
      l.items.forEach((a) => [a.first].concat((a.rest || []).map((r) => r && r.pipe)).forEach((pp) => pp && (pp.cmds || []).forEach((c, i) => walkCmd(c, i > 0))));
    const walkCmd = (c, piped) => {
      if (!c || typeof c !== 'object') return;
      if (c.type === 'simple') {
        const w = c.words || [];
        let k = 0;
        while (k < w.length && /^(command|env|time|nice|nohup)$/.test(w[k])) k++;
        if (w[k] !== 'R') return;
        const batch = w.slice(k + 1).some((x) => /^(-e|-f|--file(=.*)?|CMD|--version|--help|-h)$/.test(x));
        const input = piped || (c.redirs || []).some((r) => /^<(<<?)?$/.test(r.op || ''));
        if (!batch && !input) found = true;
        return;
      }
      // (compound commands – if, for, while, { }, ( ): the commands in them)
      for (const v of Object.values(c)) {
        if (Array.isArray(v)) v.forEach((x) => x && Array.isArray(x.items) && walkList(x));
        else if (v && typeof v === 'object' && Array.isArray(v.items)) walkList(v);
      }
    };
    walkList(list);
    return found;
  }
  /** why the agent may not run this text ('' if it may): a command in it that the agent has not got. The names are
      those that the shell itself reads in the text – also inside $( ), loops and pipes. Nothing of such a text is
      run. */
  function agentRefusal(text) {
    let names;
    try {
      names = MG.shellLang.commandNames(text);
    } catch (e) {
      return ''; // (not readable as shell: nothing of it runs, and the terminal says why)
    }
    const bad = names.filter((c) => AGENT_DENY.has(c)).filter((c, i, a) => a.indexOf(c) === i);
    if (bad.some((c) => /^(cd|pushd|popd)$/.test(c))) return 'cd is not available: every step starts in your folder. Use paths instead – relative to your folder, or ~/….';
    if (bad.length) return `${bad.map((b) => '`' + b + '`').join(', ')} ${bad.length > 1 ? 'are' : 'is'} not available to you.`;
    if (names.includes('R') && startsRConsole(text)) return "R on its own starts R's console, which waits for a person to type: use Rscript script.R or Rscript -e '…' (or R CMD BATCH script.R).";
    return '';
  }
  const SHELL_FENCE = ['', 'bash', 'sh', 'shell', 'console', 'zsh', 'shell-session', 'shellscript', 'terminal', 'cmd', 'command'];
  /** The command in an agent's reply: its first shell code block, as it was written ('' = empty block, null = none).
      A model sometimes begins its command on the line of the fence itself (```Rscript summary.R), also after the name
      of a shell (```bash Rscript summary.R) – a known command followed by more words; one word alone is the name of a
      language (```r, ```awk). And sometimes the whole command stands between two fences on one line. */
  function agentStep(reply) {
    const re = /```([^\n`]*)(?:\n([\s\S]*?)```|```)/g;
    let m;
    while ((m = re.exec(reply))) {
      const info = m[1].trim(), words = info.split(/\s+/).filter(Boolean);
      const shell = SHELL_FENCE.includes((words[0] || '').toLowerCase());
      let first = '';
      if (m[2] === undefined) {
        // (one line between two fences: a command if it begins with one – after the name of a shell, or not)
        if (shell && words.length > 1 && knownCommand(words[1])) first = info.slice(words[0].length).trim();
        else if (words.length && knownCommand(words[0])) first = info;
        else continue;
        return { cmd: first, before: withoutCode(reply.slice(0, m.index)), after: withoutCode(reply.slice(re.lastIndex)) };
      }
      if (shell) {
        if (words.length > 1 && knownCommand(words[1])) first = info.slice(words[0].length).trim();
      } else if (words.length > 1 && knownCommand(words[0])) first = info;
      else continue;
      const body = m[2]
        .replace(/\r/g, '')
        .split('\n')
        .map((l) => l.replace(/^\s*\$\s+/, ''))
        .join('\n')
        .trim();
      // (before, after: what the reply says in front of the block of its command, and behind it)
      return { cmd: first ? first + (body ? '\n' + body : '') : body, before: withoutCode(reply.slice(0, m.index)), after: withoutCode(reply.slice(re.lastIndex)) };
    }
    return { cmd: null, before: '', after: '' };
  }
  /* A model sometimes goes on writing after the block of its command – its report, with what the command "showed",
     before the command has run. The reply is a step all the same; but what stands behind the block, when it is more
     than a remark, is not shown as the description of the step: the card says so, and the agent is told. */
  const AGENT_AHEAD = 120; // characters behind the block from which this holds
  const AGENT_AHEAD_TOLD = 'What you wrote after the code block was written before the command had run; it was not shown to the student. Send your report when you have read the output – without a code block.';
  // (what the agent is told, once in a task, when a reply has a code block that is no command)
  const AGENT_REMIND = 'Nothing was run: your reply had a code block, but not a ```bash block with a command. If you meant to run a command – R code too goes into a script that Rscript runs, or into Rscript -e – send it again in a ```bash block. If that was your report, send it again without any code block.';
  /** the commands of a block, one by one (a loop or an if … fi is one command) */
  function agentParts(cmd) {
    try {
      const parts = MG.shellLang.statements(cmd, { extglob: MG.shellLang.extglobOn(MG.app.term.shell._top()) });
      return parts.length ? parts : [cmd];
    } catch (e) {
      return [cmd];
    }
  }
  const withoutCode = (reply) => reply.replace(/```[\s\S]*?(```|$)/g, '').trim();
  // (for the tests)
  MG.agentRules = { deny: AGENT_DENY, refusal: agentRefusal, step: agentStep, command: (r) => agentStep(r).cmd, parts: agentParts, seconds: AGENT_SECONDS, max: AGENT_MAX, startsRConsole };
  const insideDir = (k, root) => k === root || k.startsWith(root + '/');
  // the agent's own folder, and /tmp, where the programs keep temporary files
  const agentMay = (k, root) => insideDir(k, root) || insideDir(k, '/tmp');
  /** every file entry outside the agent's folder, to put back what a command changed there */
  function outsideSnapshot(fs, root) {
    const m = new Map();
    for (const [k, v] of fs.entries) if (!agentMay(k, root)) m.set(k, v);
    return m;
  }
  /* A file that a program of the terminal wrote has its bytes in the programs' memory only. Two copies are taken
     before a step of the agent runs:
     - of the files outside the agent's folder, MG.wasm keeps one in that memory (keep) and writes it back after the
       step, where the step changed or removed the file (putBack);
     - of all such files – in the user's folders and in the agent's – the page holds one itself (holdBytes). If the
       programs have to be stopped by force (a command that does not end: the time limit, or Stop pressed twice),
       their memory is gone, and with it every file that a program wrote. Those that were there before the step are
       then written again from the page's copies: a forced stop costs the work of that step, and nothing else. */
  const AGENT_HOLD = 300 * 1024 * 1024; // bytes that the page holds at most (more than that: lost in a forced stop, and named)
  async function holdBytes(fs, held) {
    // (copies of files that are not there any more are let go)
    const live = new Set(fs.entries.values());
    for (const e of Array.from(held.keys())) if (!live.has(e)) held.delete(e);
    let total = 0;
    for (const b of held.values()) total += b.length;
    for (const [k, v] of Array.from(fs.entries)) {
      if (v.kind !== 'aioli' || held.has(v) || insideDir(k, '/tmp')) continue;
      if (total + (v.size || 0) > AGENT_HOLD) continue;
      try {
        const bytes = await fs.readBytes(k);
        held.set(v, bytes);
        total += bytes.length;
      } catch (e) {
        console.error(e);
      }
    }
  }
  /** After a step: what it changed outside the agent's folder is put back; after a forced stop of the programs, the
      files that programs had written before the step are written again.
      snap: the entries outside the folder before the step; keep: paths the user changed meanwhile (theirs);
      since, gen: when the step started, and MG.wasm.gen then; held: see holdBytes; before: every program-written
      file before the step (path → entry).
      → { changed: paths outside that were put back or removed again, lost: paths whose bytes could not be had, killed } */
  async function undoOutside(fs, root, snap, keep, since, gen, held, before) {
    const W = MG.wasm, changed = [], lost = [], back = [];
    const killed = !!W && W.gen !== gen;
    // 1. what the step made outside the folder goes
    for (const k of Array.from(fs.entries.keys())) {
      if (!agentMay(k, root) && !snap.has(k) && !keep.has(k)) {
        fs.entries.delete(k);
        changed.push(k);
      }
    }
    // 2. files that the step copied or moved, and that stay, get bytes of their own first
    if (W && W.ready && W.settle && !killed) {
      try {
        await W.settle(fs);
      } catch (e) {
        console.error(e);
      }
    }
    // 3. what was there before is put back
    for (const [k, v] of snap) {
      if (keep.has(k)) continue;
      const now = fs.entries.get(k);
      if (v.kind === 'aioli' && killed) {
        // (whatever is there now is not the user's file: it goes, and the file comes back below)
        if (now) {
          fs.entries.delete(k);
          changed.push(k);
        }
        continue;
      }
      if (now === v) continue;
      fs.entries.set(k, v);
      changed.push(k);
      if (v.kind !== 'aioli' || !W || !W.putBack) continue;
      let ok = false;
      try {
        ok = await W.putBack(k, v, since);
      } catch (e) {
        console.error(e);
      }
      if (!ok) {
        fs.entries.delete(k);
        back.push([k, v]);
      }
    }
    // 4. After a forced stop: the files that programs had written before the step. Outside the folder: all of them.
    //    Inside it: those that were still there, unchanged, when the programs were stopped – a file that the step
    //    itself had removed or written anew stays gone.
    if (killed && before) {
      const atStop = W.lostEntries || new Map();
      for (const [k, v] of before) {
        if (keep.has(k) || fs.entries.has(k)) continue;
        if (agentMay(k, root) && atStop.get(k) !== v) continue;
        back.push([k, v]);
      }
    }
    for (const [k, v] of back) {
      const bytes = held ? held.get(v) : null;
      let ok = false;
      if (bytes && W && W.writeBytes) {
        try {
          fs.mkdirp(MG.path.dirname(k));
          await W.writeBytes(fs, k, bytes);
          fs.touch(k, v.mtime); // (the file keeps the time it had: make and R's file.mtime() compare the times of files)
          ok = true;
        } catch (e) {
          console.error(e);
        }
      }
      if (!ok) lost.push(k);
    }
    changed.concat(lost).forEach((k) => fs._changed(k, !fs.entries.has(k) ? 'remove' : fs.entries.get(k).kind === 'dir' ? 'mkdir' : 'write'));
    return { changed, lost, killed };
  }
  /** a pause that the Stop button can cut short */
  const pause = (ms, signal) =>
    new Promise((resolve, reject) => {
      const t = setTimeout(resolve, ms);
      const stop = () => {
        clearTimeout(t);
        reject(new DOMException('Stopped', 'AbortError'));
      };
      if (signal && signal.aborted) stop();
      else if (signal) signal.addEventListener('abort', stop, { once: true });
    });

  /* ------------------------------------------------------------------
     the panel
     ------------------------------------------------------------------ */
  const CHAT_HELLO = () =>
    `Ask me about R: your code, an error message, a function, a plot, or how to do something. With each question I also receive the things you tick below the message box, such as the code you are working on, the end of the console and the names of your files. I never read your data files. You can send code from my answers to ${placesInWords()} with one click.\n\n**Check what I give you.** Run it, look at the result and make sure you understand it. AI models make mistakes, and they sound just as sure of themselves when they do. Never paste personal or patient data here.`;
  const AGENT_HELLO =
    'Give me a complete task, for example *“Write an R script that works out the mean body mass of each penguin species, run it, and save the table as a CSV file”*. I will carry it out in the Terminal, one command at a time, working in my own folder (`~/ai-agent/run-…`), where I run R with `Rscript`. You can see every command and its output, and **Stop** ends the task.\n\nI can read your files, but any changes I make outside my folder are undone. Further tasks carry on in the same folder until you press **New**. Each run is saved as a record in its folder (`agent-record.md`), so check my results there rather than relying on my report alone.';
  const CHAT_STARTERS = (PAGE && PAGE.aiChat) || [
    'How do I read ~/data/penguins.csv into R and take a first look at it?',
    'Plot flipper length against body mass for the penguins, coloured by species, with ggplot2',
    'What is the difference between the R console, RStudio, a notebook and Rscript?',
    'What does “Error: object not found” mean, and how do I fix it?'
  ];
  const AGENT_TASKS = [
    'Write an R script that reads ~/data/penguins.csv, works out the mean body mass of each species and saves the table as a CSV file, and then run it with Rscript',
    'Make a scatter plot of flipper length against body mass from ~/data/penguins.csv, coloured by species, and save it as a PNG file',
    'Count the penguins of each species in ~/data/penguins.csv with the terminal’s text tools, then check the numbers with R',
    'Fit a linear model of body mass on flipper length for the penguins, and report the slope and R²'
  ];
  /* the ticks under the box: what goes with a question */
  const CTX = [
    ['rcon', 'the R console’s last output', 'The end of what the R console tab shows: your commands and what R printed (up to the last 3,000 characters). This can include values from your data.', () => MG.app.rcon],
    ['rs', 'the code in RStudio', 'The document open in RStudio’s Source pane, or the lines you have selected in it (never a data file). Also the end of RStudio’s Console, where what R printed can include values from your data, and the names and classes of the objects in its Environment (but not their values).', () => MG.app.rstudio],
    ['nb', 'the notebook’s code', 'The code cells of the notebook that is open in the Notebook tab, but not their outputs or your data', () => MG.app.nbApp],
    ['term', 'my terminal commands', 'Your most recent commands in the Terminal and the end of what they printed. This can include lines from your files.', () => MG.app.term],
    ['files', 'my file names', 'The names and sizes of the files in your home folder, but not what is in them', () => true]
  ];
  const PLACE = { console: 'the R console', rstudio: 'RStudio', notebook: 'a notebook', terminal: 'the terminal' };
  /** an error that was asked about (a failed terminal command: by the command) */
  const errKey = (where, code, error) => (where === 'terminal' ? `terminal\n${String(code || '').trim()}` : `${where}\n${String(code || '').trim()}\n${String(error || '').trim()}`);
  /* the documents of RStudio's Source whose text may go with a question: code and writing – not data */
  const KIND_NAME = { r: 'an R script', rmd: 'an R Markdown document', notebook: 'an R Notebook', qmd: 'a Quarto document', md: 'a Markdown file' };
  const SENDABLE = /\.(r|rmd|qmd|md|markdown|sh|bash|py|ya?ml|toml|rprofile)$/i;
  /** the lines around the cursor, when a document is too long to send whole */
  function around(text, line, n, mark = '#') {
    if (text.length <= n) return text;
    const L = text.split('\n');
    line = Math.max(0, Math.min(L.length - 1, line || 0));
    let a = line, b = line + 1, size = (L[line] || '').length;
    while ((a > 0 || b < L.length) && size < n) {
      if (a > 0) size += L[--a].length + 1;
      if (b < L.length && size < n) size += L[b++].length + 1;
    }
    const pre = mark ? mark + ' ' : '';
    return (a > 0 ? `${pre}… (lines 1–${a} are left out)\n` : '') + L.slice(a, b).join('\n') + (b < L.length ? `\n${pre}… (lines ${b + 1}–${L.length} are left out)` : '');
  }

  class Assistant {
    constructor(root, opts) {
      this.root = root;
      this.opts = opts || {};
      this.threads = {};
      this.msgs = { chat: [], agent: [] };
      this.busy = false;
      this.tab = 'chat';
      this.settings = Object.assign({}, LIVE_DEFAULTS, store.get('ai:settings', {}));
      delete this.settings.key; // (a key is never kept with the settings)
      this.ctxOpts = Object.assign({ rcon: true, rs: true, nb: true, term: true, files: true }, store.get('ai:context', {}));
      try {
        this.key = window.sessionStorage.getItem(KEY_NAME) || '';
      } catch (e) {
        this.key = '';
      }
      this.agentCtx = null; // the agent's folder and record while the conversation goes on (New starts another)
      this._step = null; // while a step of the agent runs: what the user changes meanwhile (see _onFsChange)
      this.asked = new Set(); // the errors asked about already (the "Explain my last error" chip)
      this._build();
      this.welcome('chat');
      this.welcome('agent');
      if (MG.app && MG.app.fs) MG.app.fs.onChange((p, what) => this._onFsChange(p, what));
      bus.on('r:files', (d) => this._onRFiles(d));
    }
    /** the notebook tab, once it is built */
    get nb() {
      return this.opts.notebook || (MG.app && MG.app.nbApp) || null;
    }
    connected() {
      return !!this.key || !needsKey(this.settings);
    }
    /** the tab the user came to the assistant from (null: none yet) */
    cameFrom() {
      const cur = MG.app && MG.app.currentBench;
      const t = cur && cur !== 'assistant' ? cur : MG.app && MG.app.prevBench;
      return t && t !== 'assistant' ? t : null;
    }
    lastBench() {
      return this.cameFrom() || (has('console') ? 'console' : 'rstudio');
    }

    _build() {
      const R = this.root;
      R.classList.add('ai');
      const tabs = h('div.ai-tabs', { role: 'tablist', 'aria-label': 'Chat or agent' });
      this.tabBtns = {};
      [
        ['chat', 'Chat', 'sparkle', `Ask questions about R. Code in the answers can be sent to ${placesInWords()}.`],
        // (the agent works in the Terminal tab: a page without one has the chat only)
        has('terminal') ? ['agent', 'Agent', 'robot', 'Give the agent a task. It runs commands in the terminal (Rscript for R), working in its own folder.'] : null
      ].filter(Boolean).forEach(([k, label, ic, tip]) => {
        const b = h('button.ai-tab', { type: 'button', role: 'tab', title: tip, html: MG.icon(ic) + '<span>' + label + '</span>' });
        b.addEventListener('click', () => this.showTab(k));
        tabs.appendChild(b);
        this.tabBtns[k] = b;
      });
      this.modeEl = h('button.ai-mode', { type: 'button', title: 'The AI model in use. Click to change it or to add a key.' });
      this.modeEl.addEventListener('click', () => this.settingsDialog());
      const newBtn = h('button.tbtn', { type: 'button', title: 'Start a new conversation (on the Agent tab, the next task will then work in a new folder)', html: MG.icon('reset') + '<span>New</span>' });
      newBtn.addEventListener('click', () => this.newConversation());
      const moreBtn = h('button.tbtn', { type: 'button', title: 'More', 'aria-label': 'More', html: MG.icon('dots') });
      moreBtn.addEventListener('click', () => this.moreMenu(moreBtn));
      const setBtn = h('button.tbtn', { type: 'button', title: 'AI settings: choose the service and model, and enter your key', 'aria-label': 'AI settings', html: MG.icon('gear') });
      setBtn.addEventListener('click', () => this.settingsDialog());
      const body = h('div.ai-threads');
      ['chat', 'agent'].forEach((k) => {
        const t = h('div.ai-thread', { role: 'log', 'aria-live': 'polite', dataset: { tab: k } });
        this.threads[k] = t;
        body.appendChild(t);
      });
      this.sugg = h('div.ai-sugg');
      this.ctxRow = h('div.ai-ctx');
      this.input = h('textarea.ai-input', { rows: 2, 'aria-label': 'Message to the AI assistant' });
      this.sendBtn = h('button.btn.primary.ai-send', { type: 'button', title: 'Send (Enter; Shift+Enter for a new line)', html: MG.icon('send') + '<span>Send</span>' });
      this.sendBtn.addEventListener('click', () => (this._abort ? this.stopNow() : this.send()));
      this.input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
          e.preventDefault();
          if (!this._abort) this.send();
        }
      });
      this.input.addEventListener('input', () => this._grow());
      R.append(h('div.ai-bar', tabs, this.modeEl, h('span.grow'), newBtn, moreBtn, setBtn), body, h('div.ai-foot', this.sugg, h('div.ai-inrow', this.input, this.sendBtn), this.ctxRow));
      this.renderMode();
      this.showTab('chat', true);
    }
    /** the box grows with what is typed (up to a point) */
    _grow() {
      const I = this.input;
      I.style.height = 'auto';
      if (I.value) I.style.height = Math.min(I.scrollHeight + 2, 160) + 'px';
      else I.style.height = '';
    }
    /** each time the tab is shown (page.js): the ticks and suggestions follow what is open now */
    shown() {
      this.renderSuggestions();
      this.renderCtx();
      if (!window.matchMedia('(max-width: 900px)').matches && !this.busy) setTimeout(() => this.input.focus({ preventScroll: true }), 30);
    }
    /** a prompt from the instructions (data-prompt): into the box, to be read, changed and sent */
    offerPrompt(text, opts = {}) {
      let tab = opts.tab;
      if (!tab) {
        const b = Array.from(document.querySelectorAll('[data-prompt]')).find((x) => x.dataset.prompt === text);
        tab = b && b.dataset.tab;
      }
      this.showTab(tab === 'agent' ? 'agent' : 'chat');
      this.input.value = String(text || '');
      this._grow();
      this.input.focus();
      this.input.setSelectionRange(this.input.value.length, this.input.value.length);
    }
    showTab(k, quiet) {
      this.tab = k;
      Object.entries(this.tabBtns).forEach(([n, b]) => {
        b.classList.toggle('on', n === k);
        b.setAttribute('aria-selected', String(n === k));
      });
      Object.entries(this.threads).forEach(([n, t]) => (t.hidden = n !== k));
      this.root.classList.toggle('agent', k === 'agent');
      this.input.placeholder = k === 'agent' ? 'Give the agent a task, e.g. “Count the penguins of each species in ~/data/penguins.csv with an R script”' : 'Ask about R: your code, an error message, a function, a plot…';
      this.renderSuggestions();
      this.renderCtx();
      if (!quiet) bus.emit('ai:tab', { tab: k });
    }
    renderMode() {
      const on = this.connected();
      this.modeEl.classList.toggle('live', on);
      this.modeEl.innerHTML = on ? `<span class="kdot ok"></span> ${esc(modelOf(this.settings))}` : '<span class="kdot"></span> Not connected';
    }
    showStatus() {
      this.renderMode();
    }
    welcome(tab) {
      if (!this.connected()) return this.setupCard(tab);
      if (tab === 'agent' && !has('terminal')) return null;
      return this.addBubble('assistant', tab === 'agent' ? AGENT_HELLO : CHAT_HELLO(), { intro: true, tab });
    }
    /** the buttons under a message when no model is connected */
    setupActs(prompt) {
      const go = h('button.btn.small.primary', { type: 'button', html: MG.icon('key') + '<span>Connect a model</span>' });
      go.addEventListener('click', () => this.settingsDialog());
      const cp = h('button.btn.small', { type: 'button', title: 'Copy a prompt with your question and its context, to paste into an AI tool that you are allowed to use', html: MG.icon('copy') + '<span>Copy a prompt for another AI tool</span>' });
      cp.addEventListener('click', () => this.copyPrompt(prompt && prompt.question, prompt && prompt.extra));
      return h('div.ai-setup-acts', go, cp);
    }
    setupCard(tab) {
      const b = this.addBubble(
        'assistant',
        [
          '**Connect an AI model to use the assistant.** You need a key for an AI service, because the workbench doesn’t come with one.',
          '',
          '- **Google Gemini** has a free tier. You can create a key with a Google account at [aistudio.google.com/apikey](https://aistudio.google.com/apikey) (you must be 18 or over). On the free tier, Google may use what you send to improve its products.',
          '- You can also use a key for **Anthropic (Claude)** or for an **OpenAI-compatible** service, either your own or one you have been given.',
          '',
          'The key stays in this browser tab. It is never saved in a file, and it is only sent to the service you choose.',
          '',
          '**Never paste personal or patient data into an AI tool**, whether here or anywhere else.',
          '',
          tab === 'agent' ? '' : 'Without a key, you can still get short offline help with common error messages. Paste an R error message into the box, or use one of the “Ask the AI” buttons that appear under errors.'
        ].join('\n'),
        { intro: true, tab }
      );
      b.classList.add('ai-setup');
      b.appendChild(this.setupActs());
      return b;
    }
    /** after the settings changed: the cards that ask for a key go, or come */
    refreshIntro() {
      ['chat', 'agent'].forEach((tab) => {
        const t = this.threads[tab];
        const on = this.connected();
        t.querySelectorAll('.ai-msg.ai-setup').forEach((x) => on && x.remove());
        if (on && !t.querySelector('.ai-msg.intro')) {
          if (!this.msgs[tab].length && !t.querySelector('.ai-msg')) t.innerHTML = '';
          this.welcome(tab);
        } else if (!on && !t.querySelector('.ai-setup')) this.setupCard(tab);
      });
    }

    /* ---------------- suggestions: the last error, and questions to start with ---------------- */
    /** an error in the tab the user came from, not asked about yet → {where, label, key, go} or null */
    recentError() {
      const where = this.cameFrom();
      const A = MG.app || {};
      let e = null;
      try {
        if (where === 'console' && A.rcon && A.rcon.cv) {
          const x = lastRError(A.rcon.cv.text(8000));
          if (x) e = { where, x, msg: x.error, go: () => this.askAboutR(Object.assign({ where }, x)) };
        } else if (where === 'rstudio' && A.rstudio && A.rstudio.cv) {
          const x = lastRError(A.rstudio.cv.text(8000));
          if (x) e = { where, x, msg: x.error, go: () => this.askAboutR(Object.assign({ where }, x)) };
        } else if (where === 'notebook' && this.nb && this.nb.view) {
          const v = this.nb.view, c = v.current;
          if (c && !v.foreign && (c.outputs || []).some((o) => o.type === 'error') && typeof v.cellInfo === 'function') {
            const info = v.cellInfo(c);
            e = { where, x: { code: info.code, error: info.error ? info.error.evalue : '' }, msg: info.error ? `${info.error.ename}: ${info.error.evalue}` : 'error', go: () => this.askAboutCell({ kind: 'fix', cell: info }) };
          }
        } else if (where === 'terminal' && A.term) {
          const last = (A.term.transcript || [])[(A.term.transcript || []).length - 1];
          if (last && last.code && last.code !== 130 && String(last.stderr || '').trim())
            e = { where, x: { code: last.line, error: last.stderr }, msg: last.stderr.trim().split('\n')[0], go: () => this.askAboutError({ line: last.line, output: (last.stdout || '') + (last.stderr || ''), error: last.stderr, cwd: last.cwd }) };
        }
      } catch (err) {
        console.error(err);
        e = null;
      }
      if (!e) return null;
      e.key = errKey(e.where, e.x.code, e.x.error);
      return this.asked.has(e.key) ? null : e;
    }
    renderSuggestions() {
      const S = this.sugg;
      S.innerHTML = '';
      if (this.tab === 'chat' && !this.busy) {
        const e = this.recentError();
        if (e) {
          const lines = String(e.msg || '').trim().split('\n');
          // (the message itself: after "Error in f(x) :", or the line after "Warning message:")
          const first = (e.x.warning ? lines.find((l, i) => i > 0 && l.trim()) || lines[0] : lines[0]).replace(/^(Error|Warning)( in .*?)?\s*:\s*/, '').replace(/^In .*? :\s*/, '');
          const what = e.x.warning ? 'the warning' : 'my last error';
          const label = `Explain ${what} (${tabName(e.where)})${first ? ': ' + (first.length > 60 ? first.slice(0, 57) + '…' : first) : ''}`;
          const b = h('button.chip.ai-errchip' + (e.x.warning ? '.warn' : ''), { type: 'button', title: `Ask about the ${e.x.warning ? 'warning' : 'error'} from the last command in the ${tabName(e.where)} tab`, html: MG.icon('sparkle') + '<span>' + esc(label) + '</span>' });
          b.addEventListener('click', () => {
            this.asked.add(e.key);
            e.go();
          });
          S.appendChild(b);
        }
      }
      if (this.msgs[this.tab].length) return; // (questions to start with: only before the first)
      const list = this.tab === 'agent' ? AGENT_TASKS : CHAT_STARTERS;
      S.appendChild(h('span.muted.small', this.tab === 'agent' ? 'Try a task:' : 'Try:'));
      list.forEach((p) => {
        const b = h('button.chip', { type: 'button', title: 'Put this into the message box. You can change it before you press Enter.' }, p);
        b.addEventListener('click', () => {
          this.input.value = p;
          this._grow();
          this.input.focus();
        });
        S.appendChild(b);
      });
    }
    renderCtx() {
      const R = this.ctxRow;
      R.innerHTML = '';
      if (this.tab === 'agent') {
        const c = this.agentCtx;
        const fs = MG.app.fs;
        R.appendChild(
          h('span', {
            html:
              c && fs.isDir(c.run)
                ? `The next task will carry on in <code>${esc(pretty(c.run))}</code>. Press <b>New</b> to start in a new folder.`
                : 'The agent will work in a new folder, <code>~/ai-agent/run-…</code>. Everything it reads and everything its commands print is sent to the AI service.'
          })
        );
        return;
      }
      R.appendChild(h('span', 'With your question, send:'));
      for (const [k, label, tip, open] of CTX) {
        // (only what is there to send: the tabs that have been opened)
        let there = false;
        try {
          there = !!open();
        } catch (e) {
          there = false;
        }
        if (!there) continue;
        const i = h('input', { type: 'checkbox', dataset: { ctx: k } });
        i.checked = !!this.ctxOpts[k];
        i.addEventListener('change', () => {
          this.ctxOpts[k] = i.checked;
          store.set('ai:context', this.ctxOpts);
        });
        R.appendChild(h('label', { title: tip }, i, ' ' + label));
      }
    }
    newConversation() {
      if (this.busy) return toast('The assistant is still busy. Press Stop first.', 'warn');
      const tab = this.tab;
      this.msgs[tab] = [];
      this.threads[tab].innerHTML = '';
      if (tab === 'agent') this.agentCtx = null;
      this.welcome(tab);
      this.renderSuggestions();
      this.renderCtx();
    }
    moreMenu(anchor) {
      MG.popmenu(
        anchor,
        [
          ['copy', 'Copy a prompt for another AI tool', () => this.copyPrompt()],
          ['download', 'Download this conversation (Markdown)', () => this.downloadConversation()],
          this.agentCtx && MG.app.fs.isDir(this.agentCtx.run) ? ['folder', 'Show the agent’s folder in Files', () => MG.app.revealFile(this.agentCtx.run)] : null,
          ['gear', 'AI settings', () => this.settingsDialog()]
        ].filter(Boolean)
      );
    }
    downloadConversation() {
      const tab = this.tab;
      const list = this.msgs[tab];
      if (!list.length) return toast('There is nothing to save yet.', 'warn');
      const lines = [`# AI assistant – ${tab === 'agent' ? 'agent tasks' : 'chat'}`, '', `${CFG.courseTitle || 'R workbench'} · ${new Date().toLocaleString('en-GB')} · ${modelOf(this.settings)}`, ''];
      if (tab === 'agent' && this.agentCtx) lines.push(`The agent's commands and their output are in \`${pretty(this.agentCtx.run)}/agent-record.md\`.`, '');
      for (const m of list) lines.push(m.role === 'user' ? '## You' : '## AI', '', m.content, '');
      MG.downloadText(lines.join('\n'), `ai-${tab}-${stamp()}.md`, 'text/markdown');
    }

    /* ---------------- messages ---------------- */
    addBubble(role, md, meta = {}) {
      const tab = meta.tab || this.tab;
      const b = h('div.ai-msg.' + role + (meta.intro ? '.intro' : ''));
      const body = h('div.ai-body');
      if (meta.origin) body.dataset.origin = meta.origin;
      if (role === 'user') body.textContent = md;
      else this.fill(body, md);
      b.appendChild(body);
      if (meta.badge) b.appendChild(h('div.ai-badge', { html: meta.badge }));
      this.threads[tab].appendChild(b);
      this.scroll(tab, true);
      return b;
    }
    /** to the end of the conversation – while an answer streams in, only if the user has not scrolled up to read */
    scroll(tab, force) {
      const t = this.threads[tab || this.tab];
      if (force || this.atEnd(tab)) t.scrollTop = t.scrollHeight;
    }
    /** is the conversation scrolled to (near) its end? (asked before an answer grows: then it follows the answer) */
    atEnd(tab) {
      const t = this.threads[tab || this.tab];
      return t.scrollHeight - t.scrollTop - t.clientHeight < 140;
    }
    fill(body, md) {
      body.innerHTML = '';
      const origin = body.dataset.origin || this.lastBench();
      for (const blk of mdBlocks(md)) {
        if (blk.html != null) body.insertAdjacentHTML('beforeend', blk.html);
        else body.appendChild(this.codeBox(blk, origin));
      }
      body.querySelectorAll('a[href]').forEach((a) => {
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
      });
      body.querySelectorAll('table').forEach((t) => {
        t.classList.add('ai-table');
        if (!t.parentElement.classList.contains('ai-tablewrap')) {
          const w = h('div.ai-tablewrap');
          t.replaceWith(w);
          w.appendChild(t);
        }
      });
    }
    /** an answer that streams in: drawn at most once a frame */
    painter(body, tab) {
      let pending = null, raf = 0;
      return (text) => {
        pending = text;
        if (raf) return;
        raf = requestAnimationFrame(() => {
          raf = 0;
          if (pending == null) return;
          const follow = this.atEnd(tab);
          this.fill(body, pending + ' ▍');
          if (follow) this.scroll(tab, true);
        });
      };
    }
    /** what a code block is: 'r' | 'rmd' | 'bash' | 'python' | null (to save or copy) */
    kindOf(blk) {
      const lang = blk.lang || '';
      if (PY.test(lang)) return 'python';
      if (RL.test(lang)) return 'r';
      if (RMD.test(lang) || (/^(markdown|md)$/.test(lang) && /^\s*`{3,}\s*\{r/m.test(blk.code))) return 'rmd';
      if (SH.test(lang)) return 'bash';
      if (!lang && looksShell(blk.code)) return 'bash';
      if (!lang && looksR(blk.code)) return 'r';
      return null;
    }
    /** a code block of an answer, with buttons that put it to use – the first where the user came from */
    codeBox(blk, origin) {
      const lang = blk.lang || '';
      const kind = this.kindOf(blk);
      const code = kind === 'r' ? rCode(blk.code) : kind === 'bash' ? shellCode(blk.code) : blk.code;
      const pre = h('pre.ai-code', h('code', blk.code));
      const label = blk.file || { r: 'R', rmd: 'R Markdown', bash: 'terminal', python: 'Python' }[kind] || lang;
      const head = label ? h('div.ai-code-head', label, kind === 'python' && !blk.file ? h('span.ai-code-note', ' · Python does not run in this workbench') : null) : null;
      const acts = h('div.ai-code-acts');
      const btn = (icon, text, fn, primary, tip, cls) => {
        const b = h('button.btn.small' + (primary ? '.primary' : '') + (cls || ''), { type: 'button', title: tip || '', html: (icon ? MG.icon(icon) : '') + '<span>' + esc(text) + '</span>' });
        b.addEventListener('click', async () => {
          b.disabled = true;
          try {
            await fn();
          } catch (e) {
            console.error(e);
            toast(esc(e.message || String(e)), 'error');
          } finally {
            b.disabled = false;
          }
        });
        return b;
      };
      const more = []; // the other ways, in the ⋯ menu
      if (blk.file) acts.appendChild(btn('save', 'Save as ' + blk.file, () => this.saveAs(blk.file, code), true, 'Save this as a file in your home folder and open it'));
      if (kind === 'r') {
        const make = {
          console: (p) => btn('rconsole', 'Run in the R console', () => this.toRConsole(code, true), p, 'Run this code in the R console tab'),
          rstudio: (p) => btn('sourcefile', 'Put into RStudio', () => this.toRStudio(code), p, 'Put this code into the R script that is open in RStudio, at the cursor (or into a new R script). Then run it with Ctrl+Enter.'),
          notebook: (p) => btn('notebook', 'Add to notebook', () => this.toNotebook(code, false), p, 'Add this code to the open notebook as a new cell')
        };
        const order = (origin === 'rstudio' ? ['rstudio', 'console', 'notebook'] : origin === 'notebook' ? ['notebook', 'console', 'rstudio'] : ['console', 'rstudio', 'notebook']).filter(has);
        order.forEach((k, i) => acts.appendChild(make[k](i === 0 && !blk.file)));
        if (has('console')) more.push(['keyboard', 'Type it into the R console without running it', () => this.toRConsole(code, false)]);
        if (has('rstudio')) more.push(['runline', 'Run it in RStudio’s Console', () => this.toRStudioConsole(code)]);
        if (has('notebook')) more.push(['play', 'Add it to the notebook and run it', () => this.toNotebook(code, true)]);
        if (!blk.file) more.push(['save', 'Save it as a file…', () => this.saveAsAsk(blk, code)]);
      } else if (kind === 'rmd') {
        acts.appendChild(btn('book', 'Open in RStudio', () => this.rmdToRStudio(code, lang), !blk.file, 'Open this as a new R Markdown (or Quarto) document in RStudio'));
        if (!blk.file) acts.appendChild(btn('save', 'Save as…', () => this.saveAsAsk(blk, code), false, 'Save this as a file in your home folder'));
      } else if (kind === 'bash') {
        const cmds = has('terminal') ? shellCommands(code) : [];
        if (cmds.length) {
          acts.appendChild(btn('terminal', cmds.length > 1 ? `Run in the terminal (${cmds.length} commands)` : 'Run in the terminal', () => this.toTerminal(code, true), !blk.file, 'Run these commands in the Terminal tab'));
          if (cmds.length === 1 && !cmds[0].includes('\n')) acts.appendChild(btn('keyboard', 'Type in the terminal', () => this.toTerminal(cmds[0], false), false, 'Type the command at the prompt without running it, so that you can check it before you press Enter'));
        }
        if (!blk.file) acts.appendChild(btn('save', 'Save as…', () => this.saveAsAsk(blk, code), false, 'Save this as a file in your home folder (you can then run it as a script with bash FILE)'));
      } else if (!blk.file && !PLAIN.test(lang)) {
        acts.appendChild(btn('save', 'Save as…', () => this.saveAsAsk(blk), false, 'Save this as a file in your home folder'));
      }
      acts.appendChild(btn('copy', 'Copy', async () => ((await MG.copyText(blk.code)) ? toast('Copied.') : toast('Could not copy.', 'error')), false, 'Copy the code', '.ai-copy'));
      if (more.length) {
        const m = h('button.btn.small.ai-more', { type: 'button', title: 'More ways to use this code', 'aria-label': 'More ways to use this code', html: MG.icon('dots') });
        m.addEventListener('click', () =>
          MG.popmenu(
            m,
            more.map(([ic, text, fn]) => [ic, text, () => Promise.resolve().then(fn).catch((e) => (console.error(e), toast(esc(e.message || String(e)), 'error')))])
          )
        );
        acts.appendChild(m);
      }
      return h('div.ai-codebox' + (kind ? '.k-' + kind : ''), head, pre, acts);
    }

    /* ---------------- code into the workbench ---------------- */
    async _riskyR(code, what) {
      if (!RISKY_R.test(code)) return true;
      return ask('Run this code?', `<p>This code deletes, moves or renames files, so check the file names first. A deleted file cannot be recovered.</p><pre class="ai-code">${esc(code)}</pre>`, what || 'Run it');
    }
    /** R code into the R console tab: run, or typed at the prompt for the user to check and run (Enter) */
    async toRConsole(code, run) {
      if (run && !(await this._riskyR(code))) return;
      await MG.app.showWorkbench('console');
      const A = await waitFor(() => MG.app.rcon);
      if (!A) throw new Error('The R console could not start.');
      if (run) A.run(code);
      else A.type(code);
      bus.emit('ai:insert', { target: 'console', run: !!run });
    }
    /** R code into RStudio's Source: at the cursor of the R script that is open (in an R Markdown document: into the
        chunk the cursor is in, or as a new chunk) – or a new R script. The user runs it (Ctrl+Enter). */
    async toRStudio(code) {
      await MG.app.showWorkbench('rstudio');
      const RS = await waitFor(() => MG.app.rstudio);
      if (!RS) throw new Error('RStudio could not start.');
      // (the documents of the last visit are opened again when RStudio starts: after them)
      for (let i = 0; i < 60 && RS._restoring; i++) await sleep(50);
      const text = String(code).replace(/\s+$/, '');
      const d = RS.cur;
      const md = d && /^(rmd|notebook|qmd)$/.test(d.kind || '');
      if (!d || d.type !== 'code' || !d.cmDoc || !(d.kind === 'r' || md)) {
        const nd = RS.newDoc('r', text + '\n');
        toast(`The code has been put into a new R script, <b>${esc((nd && nd.name) || 'Untitled')}</b>. Run a line with Ctrl+Enter, or the whole script with Source.`, 'ok', 5000);
        bus.emit('ai:insert', { target: 'rstudio', doc: 'new' });
        return;
      }
      const doc = d.cmDoc;
      const cur = doc.getCursor();
      const chunk = md && MG.Knit && MG.Knit.chunks ? MG.Knit.chunks(doc.getValue()).find((c) => cur.line >= c.from && cur.line <= c.to) || null : null;
      const inCode = d.kind === 'r' || (chunk && chunk.lang === 'r' && cur.line > chunk.from && cur.line < chunk.to);
      let from, lines = text.split('\n').length, how;
      if (inCode) {
        const lineText = doc.getLine(cur.line);
        if (!lineText.trim()) {
          // (an empty line: the code goes there)
          doc.replaceRange(text + '\n', { line: cur.line, ch: 0 });
          from = cur.line;
        } else {
          // (else after the line of the cursor)
          doc.replaceRange('\n' + text, { line: cur.line, ch: lineText.length });
          from = cur.line + 1;
        }
        how = `The code has been put into <b>${esc(d.name)}</b> at line ${from + 1}. Run it with Ctrl+Enter.`;
      } else {
        // (in the text of an R Markdown document: a new chunk, after the line of the cursor – or after the chunk it is in)
        const after = chunk ? chunk.to : cur.line;
        doc.replaceRange('\n\n```{r}\n' + text + '\n```\n', { line: after, ch: doc.getLine(after).length });
        from = after + 3;
        how = `The code has been added to <b>${esc(d.name)}</b> as a new chunk. Run it with the ▶ button at the top right of the chunk.`;
      }
      const to = Math.min(doc.lineCount() - 1, from + lines - 1);
      doc.setCursor({ line: from, ch: 0 });
      if (RS.cm && RS.cm.getDoc() === doc) RS.cm.scrollIntoView({ line: from, ch: 0 }, 80);
      try {
        const mark = doc.markText({ line: from, ch: 0 }, { line: to, ch: doc.getLine(to).length }, { className: 'ai-inserted' });
        setTimeout(() => mark.clear(), 2200);
      } catch (e) {
        /* (no highlight) */
      }
      if (RS.cm) setTimeout(() => RS.cm.focus(), 40);
      toast(how, 'ok', 4500);
      bus.emit('ai:insert', { target: 'rstudio', doc: d.name });
    }
    /** R code run in RStudio's Console */
    async toRStudioConsole(code) {
      if (!(await this._riskyR(code))) return;
      await MG.app.showWorkbench('rstudio');
      const RS = await waitFor(() => MG.app.rstudio);
      if (!RS) throw new Error('RStudio could not start.');
      RS.consoleRun(code);
      bus.emit('ai:insert', { target: 'rstudio-console', run: true });
    }
    /** an R Markdown (or Quarto) document from an answer: a new document in RStudio */
    async rmdToRStudio(code, lang) {
      await MG.app.showWorkbench('rstudio');
      const RS = await waitFor(() => MG.app.rstudio);
      if (!RS) throw new Error('RStudio could not start.');
      for (let i = 0; i < 60 && RS._restoring; i++) await sleep(50);
      const kind = /^(qmd|quarto)$/.test(lang) || /^---[\s\S]*?\nformat:/.test(code) ? 'qmd' : /output:\s*html_notebook/.test(code) ? 'notebook' : 'rmd';
      const d = RS.newDoc(kind, String(code).replace(/\s+$/, '') + '\n');
      toast(`This is now open in RStudio as a new ${kind === 'qmd' ? 'Quarto' : 'R Markdown'} document, <b>${esc((d && d.name) || 'Untitled')}</b>. Save it, then ${kind === 'qmd' ? 'render' : 'knit'} it.`, 'ok', 5000);
      bus.emit('ai:insert', { target: 'rstudio', doc: 'new', kind });
    }
    /** R code into a notebook (the open one, if it is an R notebook), run or not */
    async toNotebook(code, run) {
      if (run && !(await this._riskyR(code))) return;
      if (!MG.app.toNotebook) throw new Error('The notebook is not available.');
      await MG.app.toNotebook(code, 'r', run);
      bus.emit('ai:insert', { target: 'notebook', lang: 'r', run: !!run });
    }
    /** commands into the terminal: typed at the prompt, or run one after the other (until one fails) */
    async toTerminal(code, run) {
      if (MG.app.term && MG.app.term.locked) return toast('The agent is using the terminal. Wait until it has finished, or press Stop.', 'warn');
      if (run && RISKY.test(code) && !(await ask('Run these commands?', `<p>These commands delete, move or overwrite files, so check the file names first. Anything that is deleted cannot be recovered.</p><pre class="ai-code">${esc(code)}</pre>`, 'Run them'))) return;
      await MG.app.showWorkbench('terminal');
      const T = await waitFor(() => MG.app.term);
      if (!T) throw new Error('The terminal could not start.');
      const cmds = shellCommands(code);
      if (!run) {
        await T.type(cmds[0] || code, false);
        bus.emit('ai:insert', { target: 'terminal', run: false });
        return;
      }
      for (let i = 0; i < 100 && T.busy; i++) await sleep(100);
      if (T.busy) return toast('The terminal is still busy. Wait for the command that is running to finish.', 'warn');
      for (let i = 0; i < cmds.length; i++) {
        const st = await (cmds.length === 1 ? T.type(cmds[i], true) : T.exec(cmds[i]));
        const left = cmds.length - i - 1;
        if (st && left) {
          toast(`A command failed (exit status ${st}), so the ${left === 1 ? 'command after it was' : left + ' commands after it were'} not run.`, 'warn', 6000);
          break;
        }
      }
      bus.emit('ai:insert', { target: 'terminal', run: true });
    }
    resolvePath(file) {
      const rel = file.replace(/^\.\//, '');
      return rel.startsWith('/') ? rel : rel.startsWith('~/') ? HOME() + rel.slice(1) : HOME() + '/' + rel;
    }
    async saveAs(file, code) {
      const fs = MG.app.fs;
      const path = this.resolvePath(file);
      const e = fs.get(path);
      if (e && (e.readonly || e.protected)) return toast(esc(pretty(path)) + ' is read-only, so save it under a different name.', 'error');
      if (e && e.kind === 'dir') return toast(esc(pretty(path)) + ' is a folder. Choose a different name for the file.', 'error');
      if (e) {
        const old = await fs.readText(path);
        if (old.trim() !== code.trim() && !(await ask('Replace the file?', `<p><b>${esc(pretty(path))}</b> already exists. Do you want to replace its contents with the assistant’s version?</p>`, 'Replace'))) return;
      }
      fs.mkdirp(MG.path.dirname(path));
      fs.writeText(path, code.replace(/\s+$/, '') + '\n', /\.(sh|bash|R)$/i.test(path) && /^#!/.test(code) ? { mode: 'x' } : undefined);
      // (an R script or document opens in RStudio when RStudio is open already; anything else in Files)
      if (/\.(r|rmd|qmd)$/i.test(path) && MG.app.openInRStudio && MG.app.tabBuilt && MG.app.tabBuilt('rstudio')) await MG.app.openInRStudio(path);
      else await MG.app.editFile(path, { line: 1 });
      toast(`Saved <b>${esc(pretty(path))}</b>.`, 'ok', 3000);
      bus.emit('ai:insert', { target: 'file', path });
    }
    async saveAsAsk(blk, code) {
      const ext = EXT[blk.lang] || (this.kindOf(blk) === 'r' ? '.R' : this.kindOf(blk) === 'bash' ? '.sh' : '.txt');
      const def = 'ai-' + stamp().slice(11) + ext;
      const name = await MG.promptText('Save as', 'Enter a file name or a path. The file is saved in your home folder (~).', def, 'Save');
      if (name && name.trim()) await this.saveAs(name.trim(), code != null ? code : blk.code);
    }

    /* ---------------- sending ---------------- */
    async send(text) {
      const q = (text != null ? text : this.input.value).trim();
      if (!q) return;
      if (this.busy) {
        toast('The assistant is still busy. Wait for it to finish, or press Stop.', 'warn');
        return;
      }
      const tab = this.tab;
      if (!this.connected()) {
        // (an error message in the box: what it usually means – offline)
        const help = tab === 'chat' ? offlineHelp(q, 'any') : null;
        if (!help) return this.noModel();
        if (text == null) {
          this.input.value = '';
          this._grow();
        }
        this.addBubble('user', q);
        this.offlineReply(`What that message usually means:\n\n${help}`, { question: q });
        return;
      }
      if (text == null) {
        this.input.value = '';
        this._grow();
      }
      this.addBubble('user', q, { tab });
      this.msgs[tab].push({ role: 'user', content: q });
      this.renderSuggestions();
      bus.emit('ai:ask', { tab, source: text == null ? 'typed' : 'button' });
      if (tab === 'agent') return this.liveAgent(q);
      return this.live(q);
    }
    noModel() {
      toast('Connect an AI model first, in the AI settings (⚙).', 'warn', 4000);
      const card = this.threads[this.tab].querySelector('.ai-setup');
      if (!card) return this.setupCard(this.tab);
      card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      card.classList.add('flash');
      setTimeout(() => card.classList.remove('flash'), 1400);
    }
    /** an answer of the offline help, with the ways to a real one */
    offlineReply(md, prompt) {
      const b = this.addBubble('assistant', md + '\n\n*Offline help – no AI model is connected.*', { badge: 'offline help', tab: 'chat' });
      b.classList.add('offline');
      b.appendChild(this.setupActs(prompt));
      bus.emit('ai:offline', {});
      return b;
    }
    /** Stop. While the agent runs a command in the terminal, the first press lets the program that is running finish
        and skips the rest; a second press stops that program by force (what programs had written is then lost). */
    stopNow() {
      if (this._abort) this._abort.abort();
      const T = MG.app.term;
      if (this._agentLive && T && T.busy) T.stop();
    }

    /* ---------------- asked from the terminal, a notebook or another tab ---------------- */
    _toChat() {
      if (MG.app && MG.app.currentBench !== 'assistant' && MG.app.showWorkbench) MG.app.showWorkbench('assistant');
      if (this.tab !== 'chat') this.showTab('chat');
    }
    /** term:ask – a command in the terminal failed: {line, output, error, cwd} */
    async askAboutError(d) {
      d = d || {};
      this._toChat();
      if (this.busy) return toast('The assistant is still answering. Try again in a moment.', 'warn');
      const err = (d.error || d.output || '').trim();
      const short = err.split('\n').slice(-12).join('\n');
      const q = `My command failed:\n$ ${d.line}\n${short}`;
      this.asked.add(errKey('terminal', d.line));
      this.addBubble('user', q);
      if (!this.connected()) {
        const help = offlineHelp(d.line + '\n' + (d.output || '') + '\n' + (d.error || ''), 'shell', d.line);
        this.offlineReply(help ? `What that message usually means:\n\n${help}` : 'Read the **last lines** of the message first, because they usually name the problem. Then check the file names and the folder you are in (`pwd`, `ls`).', { question: 'Why did this command fail, and how do I fix it?', extra: { error: d } });
        return;
      }
      this.msgs.chat.push({ role: 'user', content: q });
      this.renderSuggestions();
      return this.live(q, { error: d, where: 'terminal' });
    }
    /** nb:ask – "Ask AI" on a notebook cell: {kind: 'explain' | 'improve' | 'fix', cell: {code, error, output, path …}} */
    async askAboutCell(d) {
      d = d || {};
      this._toChat();
      if (this.busy) return toast('The assistant is still answering. Try again in a moment.', 'warn');
      const c = d.cell || {};
      const what = d.kind === 'fix' ? 'Explain this error and how to fix it.' : d.kind === 'improve' ? 'How could this code be improved or extended?' : 'Explain what this code does.';
      const src = String(c.code || '');
      const shortCode = src.length > 600 ? src.slice(0, 600) + '\n…' : src;
      const q = `${what}\n\n${shortCode}${d.kind === 'fix' && c.error ? `\n\n${c.error.ename}: ${c.error.evalue}` : ''}`;
      if (c.error) this.asked.add(errKey('notebook', src, c.error.evalue));
      this.addBubble('user', q);
      if (!this.connected()) {
        let reply;
        const e = c.error;
        if (d.kind === 'fix' && e) {
          const help = offlineHelp(`${e.ename}: ${e.evalue}\n${e.traceback || ''}`, 'r');
          reply = `**${e.ename}**${e.evalue ? ': ' + e.evalue : ''}\n\n${help || 'Read the error message first, because it names the problem. The line it points to is where R noticed the problem, but the mistake itself may be just above it. `traceback()` shows which functions R was in when the error happened.'}`;
        } else reply = 'Explaining or improving code needs an AI model. Connect one (Google Gemini has a free tier), or copy a prompt containing this cell into an AI tool that you are allowed to use.';
        this.offlineReply(reply, { question: what, extra: { cell: c } });
        return;
      }
      this.msgs.chat.push({ role: 'user', content: q });
      this.renderSuggestions();
      return this.live(q, { cell: c, where: 'notebook' });
    }
    /** r:ask – an R error in another tab: {where: 'console' | 'rstudio' | 'notebook', code, error, output} */
    async askAboutR(d) {
      d = d || {};
      const from = MG.app && MG.app.currentBench !== 'assistant' ? MG.app.currentBench : this.cameFrom();
      const where = PLACE[d.where] ? d.where : PLACE[from] ? from : 'console';
      this._toChat();
      if (this.busy) return toast('The assistant is still answering. Try again in a moment.', 'warn');
      const src = String(d.code || '').replace(/\s+$/, '');
      const err = String(d.error || '').trim();
      const shortCode = src.length > 600 ? src.slice(0, 600) + '\n…' : src;
      const shortErr = err.split('\n').slice(0, 12).join('\n');
      const q = d.warning ? `My R code gave a warning in ${PLACE[where]}:\n\n${shortCode}\n\n${shortErr}\n\nWhat does it mean, and do I need to do anything about it?` : `My R code gave an error in ${PLACE[where]}:\n\n${shortCode}\n\n${shortErr}\n\nWhat does it mean, and how do I fix it?`;
      this.asked.add(errKey(where, d.code, d.error));
      this.addBubble('user', q);
      const rerr = { where, code: src, error: err, output: String(d.output || ''), warning: !!d.warning };
      if (!this.connected()) {
        const help = offlineHelp(err + '\n' + rerr.output, 'r');
        const none = d.warning
          ? 'A warning is not an error: R did what you asked, but it is telling you that something looks odd. Read the message (`In f(…)` tells you which function gave the warning) and check the result before you use it.'
          : 'Read the error message first, because it names the problem. `Error in f(…)` tells you which function stopped, and the mistake is often in what was given to that function. Run the code one line at a time to find the line that fails.';
        this.offlineReply(help || none, { question: d.warning ? 'What does this R warning mean?' : 'What does this R error mean, and how do I fix it?', extra: { rerr } });
        return;
      }
      this.msgs.chat.push({ role: 'user', content: q });
      this.renderSuggestions();
      return this.live(q, { rerr, where });
    }

    /* ---------------- the chat ---------------- */
    systemPrompt() {
      return [
        PAGE
          ? `You are the AI assistant of an online R course for people who are new to R: ${PAGE.course}. Everything runs in the student's web browser; nothing is installed. You are their R tutor.`
          : 'You are the AI assistant of the R workbench: a website where students learn R – many of them new to programming – and the different ways of working with it. Everything runs in their web browser; nothing is installed. You are their R tutor.',
        '',
        'The ways of using R here (the tabs of the workbench):',
        has('console') ? "- R console: R's own console (as R's GUI shows it). Plots open in windows of their own, ?name opens a help window, View(data) a data window; ls() lists the objects." : null,
        "- RStudio: an RStudio-like IDE. Source edits R scripts (Run: Ctrl+Enter runs the line or selection in the Console; Source runs the whole script), R Markdown documents, R Notebooks and Quarto documents (chunks run with their output under them; Knit or Render runs the whole document from the top in a new R and makes an HTML page), and Shiny apps (Run App shows them in the Viewer). Also the Console, Environment (the objects of its R), History, Files, Plots, Packages, Help and Viewer panes, and Import Dataset.",
        has('notebook') ? '- Notebook: Jupyter-style notebooks in R (.ipynb files, as with the IRkernel): code cells and Markdown cells; outputs and plots under each cell. Notebooks here run R only.' : null,
        has('terminal') ? "- Terminal: a bash-like shell: Rscript script.R, Rscript -e '…', R CMD BATCH, R, and the GNU text tools." : null,
        has('editor') ? '- Files: a file browser and text editor. AI assistant: you.' : '- AI assistant: you.',
        '',
        'The environment:',
        ...envLines(),
        '',
        'How to answer:',
        '- Be brief, clear and friendly; write in British English unless the student writes in another language. Explain in plain words what code does and why – the students are learning, so a short explanation of each new idea helps more than a long answer.',
        PAGE && PAGE.aiStyle
          ? `- ${PAGE.aiStyle}`
          : '- Show small, complete examples that run here – with the penguins data where it fits. Prefer base R; use the tidyverse (dplyr, ggplot2, tidyr, readr) where it is natural or when the student does, and say which package each function comes from (install.packages() once, library() in each session).',
        "- For an error: say in plain words what the message means, point to the cause in the student's own code, show the fix, and say how to check (str(), class(), names(), head(), getwd(), file.exists(), ls(), ?name).",
        '- When the student is working on an exercise, help them get there themselves: explain the idea and give a hint or a similar example first; give the whole solution when they ask for it.',
        `- Put R code in \`\`\`r blocks${has('terminal') ? ' and terminal commands in \`\`\`bash blocks' : ''}: each block gets buttons that send it to ${placesInWords()}. A whole R Markdown document goes in a \`\`\`\`rmd block – with four backticks, as its chunks have three. To offer a file, put its path after the language: \`\`\`r scripts/analysis.R`,
        '- Never invent functions, arguments, packages or results. If you are not sure, say so, and say how to check (?name, args(name), help.search("…")).',
        '- Do not claim to have run code or seen results that the student has not shown you.',
        '- If the student seems to be working with personal or patient data, remind them not to share it with AI tools.'
      ]
        .filter((x) => x != null)
        .join('\n');
    }
    /** the working directory of an R session, for the context */
    _wd(S) {
      return S && S.wd ? pretty(S.wd) : '~';
    }
    /** RStudio's objects: names and classes (and the size of a data frame) – never values */
    async _rsObjects(RS) {
      let vars = RS.vars;
      if (!Array.isArray(vars) && RS.S && RS.S.idle && typeof RS.S.variables === 'function') {
        try {
          vars = await Promise.race([RS.S.variables(), sleep(1500).then(() => null)]);
        } catch (e) {
          vars = null;
        }
      }
      if (!Array.isArray(vars)) return '';
      if (!vars.length) return "RStudio's Environment is empty: its R has no objects yet.";
      const one = (v) => `${v.name} (${v.cls || v.kind || '?'}${v.kind === 'data' && /^[\d,]+ obs\. of \d+ variables?$/.test(v.desc || '') ? ', ' + v.desc : ''})`;
      return `RStudio's Environment – the objects of its R (names and classes only, not their values): ${vars.slice(0, 40).map(one).join(', ')}${vars.length > 40 ? `, and ${vars.length - 40} more` : ''}.`;
    }
    /** what the model gets with a question, besides the conversation: what is ticked, of the tabs that are open */
    async contextFor(extra = {}) {
      const parts = [];
      const fs = MG.app.fs;
      const A = MG.app || {};
      const came = extra.where || this.cameFrom();
      const big = (tab) => came === tab;
      parts.push(extra.where ? `(The student asks about something in the ${tabName(extra.where)} tab.)` : came ? `(The student came to the AI tab from the ${tabName(came)} tab.)` : '(The student has not used another tab of the workbench yet.)');
      try {
        if (extra.error) {
          const e = extra.error;
          parts.push(`The command that failed in the terminal, run in ${pretty(e.cwd || fs.cwd)}: \`${e.line}\`. The end of what it printed:\n${fence(String(e.output || '').slice(-3000), 'text')}`);
        }
        if (extra.cell) {
          const c = extra.cell;
          parts.push(`The student asks about this cell of the R notebook ${pretty(c.path || '')}:\n${fence(c.code, 'r')}`);
          if (c.error) parts.push(`It raised:\n${fence(String(c.error.traceback || c.error.ename + ': ' + c.error.evalue).slice(-2500), 'text')}`);
          else if (c.output) parts.push(`What it printed (the beginning):\n${fence(String(c.output).slice(0, 1200), 'text')}`);
        }
        if (extra.rerr) {
          const e = extra.rerr;
          const S = e.where === 'console' ? A.rcon && A.rcon.S : e.where === 'rstudio' ? A.rstudio && A.rstudio.S : null;
          const what = e.warning ? 'warning' : 'error';
          parts.push(`The R code that gave the ${what}, run in ${PLACE[e.where] || 'R'}${S ? ` (its R's working directory: ${this._wd(S)})` : ''}:\n${fence(e.code, 'r')}\nThe ${what}:\n${fence(e.error, 'text')}` + (e.output && e.output.trim() ? `\nWhat it printed before the ${what} (the end):\n${fence(e.output.slice(-1500), 'text')}` : ''));
        }
        // the R console
        if (this.ctxOpts.rcon && A.rcon && A.rcon.cv) {
          const t = stripBanner(A.rcon.cv.text(big('console') ? 3000 : 1200)).trim();
          if (t) parts.push(`The R console tab (its R's working directory: ${this._wd(A.rcon.S)}) – the end of what it shows:\n${fence(t, 'text')}`);
        }
        // RStudio: the document in Source, the end of the Console, the names of the objects
        const RS = A.rstudio;
        if (this.ctxOpts.rs && RS) {
          const d = RS.cur;
          if (d && d.type === 'code' && d.cmDoc) {
            const name = d.path ? pretty(d.path) : `${d.name} (not saved yet)`;
            const lang = d.kind === 'r' ? 'r' : /^(rmd|notebook|qmd)$/.test(d.kind) ? 'rmd' : d.kind === 'md' ? 'markdown' : '';
            if (KIND_NAME[d.kind] || (d.path && SENDABLE.test(d.path))) {
              const doc = d.cmDoc;
              const sel = doc.somethingSelected() ? doc.getSelection() : '';
              const line = doc.getCursor().line;
              if (sel.trim()) parts.push(`RStudio – the document open in Source: ${name} (${KIND_NAME[d.kind] || 'a text file'}). The student has selected these lines of it:\n${fence(sel.slice(0, 5000), lang)}`);
              else parts.push(`RStudio – the document open in Source: ${name} (${KIND_NAME[d.kind] || 'a text file'}; the cursor is on line ${line + 1}${d.dirty ? '; it has changes that are not saved' : ''}):\n${fence(around(doc.getValue(), line, big('rstudio') ? 6000 : 3000, d.kind === 'r' ? '#' : ''), lang)}`);
            } else parts.push(`RStudio – the document open in Source: ${name} (a data or text file: what is in it is not sent).`);
          } else if (d && d.type) parts.push(`RStudio – Source shows ${d.type === 'data' ? 'a data viewer (View())' : 'a text viewer'}: ${d.name} (what it shows is not sent).`);
          const t = RS.cv ? stripBanner(RS.cv.text(big('rstudio') ? 2500 : 1000)).trim() : '';
          if (t) parts.push(`RStudio's Console (its R's working directory: ${this._wd(RS.S)}) – the end of what it shows:\n${fence(t, 'text')}`);
          const objs = await this._rsObjects(RS);
          if (objs) parts.push(objs);
        }
        // the notebook
        const v = this.nb && this.nb.view;
        if (this.ctxOpts.nb && v && typeof v.codeContext === 'function') {
          const code = v.codeContext(big('notebook') ? 4000 : 2000);
          if (code) parts.push(`The notebook open in the Notebook tab: ${pretty(v.path)} (${v.foreign ? `a ${v.langName || v.lang} notebook – its code cannot run here` : `R; its code runs in ${pretty(MG.path.dirname(v.path))}`}). Its code cells:\n${fence(code, v.foreign ? v.lang : 'r')}`);
        }
        // the terminal
        if (this.ctxOpts.term && A.term && !extra.error) {
          const recent = (A.term.transcript || []).slice(big('terminal') ? -3 : -2);
          if (recent.length) parts.push('The last commands in the Terminal tab, and the end of what they printed:\n' + fence(recent.map((e) => `${pretty(e.cwd)}$ ${e.line}${e.code ? `   (exit status ${e.code})` : ''}\n${String((e.stdout || '') + (e.stderr || '')).slice(-600).replace(/\s+$/, '')}`).join('\n'), 'text'));
        }
        if (this.ctxOpts.files) {
          const list = this.fileList(60);
          if (list) parts.push(`The student's files (names and sizes only):\n${list}`);
        }
      } catch (e) {
        console.error(e);
      }
      // (the name the person gave the workbench stays in the browser: "user" where it names the user – ls -l, whoami …)
      return MG.user.mask(parts.join('\n\n')) + '\n\n';
    }
    /** the user's files: names and sizes, two folders deep */
    fileList(max = 60) {
      const fs = MG.app.fs, out = [];
      let more = 0;
      const walk = (dir, depth) => {
        for (const c of fs.list(dir)) {
          if (c.name.startsWith('.') || (c.entry && c.entry.hidden)) continue;
          const isDir = c.entry.kind === 'dir';
          if (out.length >= max) {
            more++;
            continue;
          }
          out.push(`${'  '.repeat(depth + 1)}${c.name}${isDir ? '/' : ` (${MG.humanSize(fs.size(c.entry))}B)`}`);
          if (isDir && depth < 1) walk(c.path, depth + 1);
        }
      };
      try {
        walk(HOME(), 0);
      } catch (e) {
        return '';
      }
      return out.length ? `~/\n${out.join('\n')}${more ? `\n  … and ${more} more` : ''}` : '';
    }
    async live(q, extra) {
      extra = extra || {};
      this.busy = true;
      this._abort = new AbortController();
      this.sendBtn.innerHTML = MG.icon('stop') + '<span>Stop</span>';
      this.renderSuggestions();
      const b = this.addBubble('assistant', '', { tab: 'chat', origin: extra.where || this.lastBench() });
      const body = b.querySelector('.ai-body');
      body.innerHTML = '<span class="ai-typing"><i></i><i></i><i></i></span>';
      const hist = this.msgs.chat.slice(-12).map((m) => ({ role: m.role, content: m.content }));
      while (hist.length && hist[0].role !== 'user') hist.shift();
      if (hist.length) hist[hist.length - 1] = { role: 'user', content: (await this.contextFor(extra)) + 'Question: ' + hist[hist.length - 1].content };
      let text = '';
      const paint = this.painter(body, 'chat');
      const t0 = performance.now();
      try {
        const res = await this.streamLive(
          hist,
          (delta) => {
            text += delta;
            paint(text);
          },
          this._abort.signal,
          {
            onReset: () => {
              text = '';
              paint('');
            }
          },
          (note) => {
            if (!text) body.innerHTML = `<div class="muted small" style="margin-bottom:0.35em">${esc(note)}</div><span class="ai-typing"><i></i><i></i><i></i></span>`;
          }
        );
        // a reply with nothing in it is not kept as a turn of the conversation: it is reported, and the question can be asked again
        if (!text.trim()) throw Object.assign(new Error(`${res.model} sent an empty reply. Please ask again, as a second try usually gets an answer.`), { empty: true });
        paint(null);
        const follow = this.atEnd('chat');
        this.fill(body, text);
        const via = res.skipped.length ? ` (${res.skipped.map((x) => x.model + ' ' + skipWord(x)).join(', ')})` : '';
        b.appendChild(h('div.ai-badge', { html: `${esc(res.model + via)} · ${((performance.now() - t0) / 1000).toFixed(1)} s` }));
        if (follow) this.scroll('chat', true);
        this.msgs.chat.push({ role: 'assistant', content: text });
        bus.emit('ai:answer', { model: res.model });
      } catch (e) {
        paint(null);
        if (e.name === 'AbortError') {
          this.fill(body, (text || '') + '\n\n*(stopped)*');
          if (text) this.msgs.chat.push({ role: 'assistant', content: text });
        } else {
          this.fill(body, (e.empty ? '' : '**The AI service returned an error.**\n\n') + e.message);
          b.classList.add('err');
        }
      } finally {
        this.busy = false;
        this._abort = null;
        this.sendBtn.innerHTML = MG.icon('send') + '<span>Send</span>';
        this.scroll('chat');
        this.renderSuggestions();
      }
    }

    /* ---------------- the agent ---------------- */
    agentPrompt(run) {
      return [
        "You are an AI agent in the R workbench, a website where students learn R; everything runs in the student's web browser. You carry out the student's task by running shell commands, one step at a time, in its terminal. R is there as Rscript.",
        '',
        'How to work:',
        '- In each reply, say in one or two short sentences what you will do next and why, then give ONE step in a ```bash code block – a command, or a few that belong together, one per line – and stop. You then get the exit status and the output. If a command of the block fails, the ones after it are not run.',
        "- R code goes into a script, written with a here-document and run with Rscript – for example:\n  cat > means.R << 'EOF'\n  penguins <- read.csv(\"~/data/penguins.csv\")\n  print(aggregate(body_mass ~ species, data = penguins, FUN = mean))\n  EOF\n  Rscript means.R\n  Rscript -e '…' is for a line or two. Each Rscript run is a new R: what one run makes in memory is gone in the next, so write results to files (write.csv(), saveRDS()).",
        '- Plots: open a file in the script – png("plot.png", width = 800, height = 600), then the plot, then dev.off() – otherwise the plot goes to Rplots.pdf.',
        "- A package is installed once – Rscript -e 'install.packages(\"ggplot2\")' – and loaded with library() in each script. Base R needs none: prefer it for small tasks.",
        '- Base each next step on the output you got. If a command fails, read the error and change your approach. Check what you make (head, wc -l, cat, ls -l) before you report it.',
        '- Do not ask the student questions – nobody can answer during the task. Make sensible choices, say which, and carry on.',
        `- You can take at most ${AGENT_MAX} steps for a task.`,
        '- When the task is done, or cannot be done, reply WITHOUT a code block: what you did (in short), the files you made (with their paths) and what the results show. Report only what the outputs showed – never invent results, numbers or files. Write for a student who is learning R: plain words, short sentences.',
        '',
        'Your environment:',
        `- Your folder is ${pretty(run)} (= ${run}). Every step starts there, and cd is not available: use paths. Write files only inside your folder – changes anywhere else are undone after each step. You may read files anywhere: the student's files in ~ and the course's data in ~/data. agent-record.md in your folder is the record of your work: leave it alone.`,
        ...envLines(),
        `- Each step's output is shortened to its last ${AGENT_OUT} characters. A step that has not ended after ${AGENT_SECONDS} seconds is stopped.`,
        "- R on its own (R's console) waits for a person to type: use Rscript (or R CMD BATCH script.R) instead. Commands that act on the student's screen (open, nano, download, clear) are not available to you."
      ].join('\n');
    }
    /** one turn of the agent: the model's reply (free-tier limits: wait and ask again, up to 3 times) */
    async agentAsk(hist, run, signal, note, onText) {
      for (let waited = 0; ; waited++) {
        let text = '';
        try {
          const res = await this.streamLive(
            hist,
            (d) => {
              text += d;
              onText(text);
            },
            signal,
            {
              settings: this.settings,
              key: this.key,
              system: this.agentPrompt(run),
              onReset: () => {
                text = '';
                onText('');
              }
            },
            note
          );
          return { text, model: res.model };
        } catch (e) {
          // no model answered. Waiting helps when a limit per minute is reached, the servers are busy or the connection
          // gave no answer (the error says after how many seconds: retryIn) – up to three times for one reply. It does
          // not help when every model is over its limit for today, or the key is not accepted: the task ends at once.
          const wait = e.name !== 'AbortError' && e.retryIn > 0 ? Math.round(Math.min(90, Math.max(5, e.retryIn))) : 0;
          if (wait && waited >= 3) e.message += (e.status === 429 ? ' The page waited and tried again three times, but the limit has still been reached. Perhaps many people are using the same key at once.' : e.status ? ' The page waited and tried again three times, but the service is still busy.' : ' The page waited and tried again three times, but there was still no answer.') + ' Please try again later' + (e.status ? ', or use a key from another person or project (limits are counted per project, not per key).' : '.');
          if (!wait || waited >= 3) throw e;
          for (let t = wait; t > 0; t--) {
            note(`${e.status === 429 ? 'The service only allows a few requests per minute' : e.status ? 'The service is busy' : 'No answer came from the service'} – waiting ${t} s before asking again (press Stop to end the task)…`);
            await pause(1000, signal);
          }
          note('');
        }
      }
    }
    agentCard(title) {
      const card = h('div.ai-msg.assistant.ag');
      const head = h('div.ag-head', { html: MG.icon('robot') + '<b>' + esc(title) + '</b>' });
      const steps = h('ol.ag-steps');
      card.append(head, steps);
      this.threads.agent.appendChild(card);
      this.scroll('agent', true);
      return { card, steps };
    }
    /** run a command in the terminal (as the agent) and capture what it printed */
    async termRun(cmd, opts) {
      const T = MG.app.term;
      for (let i = 0; i < 600 && T.busy; i++) await sleep(100);
      const before = T.outEl.children.length;
      const code = await T.exec(cmd, opts);
      const els = Array.from(T.outEl.children).slice(before + 1);
      const text = els.filter((x) => !x.classList.contains('ask')).map((x) => x.textContent + (x.classList.contains('note') ? '\n' : '')).join('');
      // (what goes to the AI service: the agent runs as "user" – and where the person's name still names the user in
      // what it printed, a log of the person's with the output of whoami or ls -l in it, "user" takes its place)
      return { code, text: opts && opts.agent ? MG.user.mask(text) : text };
    }
    /** While a step of the agent runs, a change to a file that its command did not reach – a notebook saved, a file
        edited in Files, a script saved in RStudio – is the user's: it is not undone after the step. (The terminal
        notes every path that the agent's command works out: T.touched.) */
    _onFsChange(path, what) {
      const s = this._step;
      if (!s || insideDir(path, s.run)) return;
      const T = MG.app.term;
      const touched = T && T.touched;
      if (touched && touched.has(path)) return;
      if (touched && what === 'mkdir') for (const t of touched) if (t.startsWith(path + '/')) return;
      s.saved.add(path);
    }
    /** What an R of the agent's command (Rscript, R CMD BATCH) wrote or removed comes back into the page's files after
        the run, not through the terminal – so it is not among T.touched. It is the agent's doing all the same: what
        it changed outside the agent's folder is undone (with the folders it made for it). */
    _onRFiles(d) {
      const s = this._step;
      const T = MG.app.term;
      if (!s || !d || !(T && T.agentCmd) || !/^(rscript|rcmd|batch|rterm)$/.test(d.kind || '')) return;
      for (const p of [].concat(d.files || [], d.removed || [])) {
        s.saved.delete(p);
        for (const k of Array.from(s.saved)) if (p.startsWith(k + '/')) s.saved.delete(k);
      }
    }
    /** the record of the agent's work in a folder, as a Markdown file: the tasks, each step's commands and output, and
        the reports. (Not a notebook: the steps are shell commands, and the notebooks here run R.) */
    saveRecord(ctx) {
      const fs = MG.app.fs;
      if (!fs.isDir(ctx.run)) return null;
      const path = ctx.run + '/agent-record.md';
      const where = pretty(ctx.run);
      const out = [
        `# AI agent – ${where}`,
        '',
        `This file records the tasks given to the AI agent in the ${CFG.courseTitle || 'R workbench'}, the steps it ran in the terminal, and their output as the agent saw it (shortened). Every step ran in \`${where}\`, the folder that contains this file. **Check the results yourself**, because an agent can be wrong and its report can claim more than the output shows.`,
        '',
        `To run a step again, type \`cd ${where}\` in the Terminal, followed by the step's commands.`
      ];
      ctx.tasks.forEach((t, i) => {
        out.push('', `## Task ${i + 1}`, '', quote(t.task), '', `*${new Date(t.t).toLocaleString('en-GB')} · ${t.models.join(', ') || modelOf(this.settings)} · ${t.steps.length} step${t.steps.length === 1 ? '' : 's'}*`);
        t.steps.forEach((s, k) => {
          out.push('', `### Step ${k + 1}`, '');
          if (s.say) out.push(quote(s.say), '');
          out.push(fence(s.cmd, 'bash'), '');
          if (s.refused) {
            out.push(`*Not run – ${s.refused}*`);
            return;
          }
          const o = s.out.length > 20000 ? s.out.slice(0, 8000) + '\n… (shortened) …\n' + s.out.slice(-8000) : s.out;
          out.push(`Exit status ${s.code}${o.trim() ? ':' : ', no output.'}`);
          if (o.trim()) out.push('', fence(o, 'text'));
          if (s.note) out.push('', `*${s.note}*`);
        });
        out.push('', "### The agent's report", '', t.report || '*(' + (t.outcome || 'no report') + ')*');
      });
      try {
        fs.writeText(path, out.join('\n') + '\n');
      } catch (e) {
        console.error(e);
        return null;
      }
      return path;
    }
    async liveAgent(task) {
      const fs = MG.app.fs;
      if (!MG.app.term && MG.app.showWorkbench) {
        // (the terminal is made the first time it is shown; the assistant stays in front)
        await MG.app.showWorkbench('terminal', { noOpen: true });
        await waitFor(() => MG.app.term, 4000);
        await MG.app.showWorkbench('assistant', { noOpen: true });
      }
      const T = MG.app.term;
      if (!T) {
        this.addBubble('assistant', 'The terminal isn’t ready yet. Please try again in a moment.', { tab: 'agent' });
        return;
      }
      this.busy = true;
      this._abort = new AbortController();
      const signal = this._abort.signal;
      this.sendBtn.innerHTML = MG.icon('stop') + '<span>Stop</span>';
      // the folder: the conversation's, or a new one
      let ctx = this.agentCtx;
      if (!ctx || !fs.isDir(ctx.run)) {
        let n = 1;
        while (fs.exists(HOME() + '/ai-agent/run-' + n)) n++;
        ctx = this.agentCtx = { n, run: HOME() + '/ai-agent/run-' + n, tasks: [] };
        fs.mkdirp(ctx.run);
      }
      const run = ctx.run;
      const earlier = ctx.tasks.slice();
      const rec = { task, steps: [], report: '', outcome: '', t: Date.now(), models: [] };
      ctx.tasks.push(rec);
      this.renderCtx();
      const back = fs.cwd;
      const { card, steps } = this.agentCard(`Agent · working in ${pretty(run)}`);
      const noteEl = h('div.muted.small.ag-note');
      card.appendChild(noteEl);
      const note = (t) => {
        noteEl.textContent = t || '';
        this.scroll('agent');
      };
      const t0 = performance.now();
      // (a task after others in the same folder: what they were, what was run, and what was found)
      const intro = earlier.length
        ? 'Earlier tasks in this folder – you did them, and their files are still there:\n' +
          earlier
            .map((t, i) => `${i + 1}. Task: ${t.task}\n   Commands: ${t.steps.filter((s) => s.cmd && !s.refused).map((s) => s.cmd.split('\n')[0]).slice(-12).join(' ; ').slice(0, 1500) || '(none)'}\n   Your report: ${(t.report || '(none)').slice(0, 1500)}`)
            .join('\n') +
          '\n\nThe new task:\n'
        : '';
      const hist = [{ role: 'user', content: intro + task }];
      let cmds = 0, final = '', outcome = 'done';
      // The agent works in a new shell – the user's variables, functions and options are not its own, and it leaves
      // none behind – and nobody else can type into the terminal meanwhile.
      for (let i = 0; i < 600 && T.busy; i++) await sleep(100);
      const shellState = T.shell.saveState ? T.shell.saveState() : null;
      if (T.shell.freshState) T.shell.freshState();
      const held = new Map(); // the page's copies of program-written files, for a forced stop: see holdBytes
      if (T.lock) T.lock('The AI agent is using the terminal. You can stop it in the AI assistant tab.');
      this._agentLive = true;
      MG.app.agentBusy = true;
      let reminded = false;
      try {
        await this.termRun('cd ' + run, { agent: true });
        for (;;) {
          const li = h('li.ag-step.run', h('span.ag-ic', { html: '<span class="spinner small"></span>' }), h('span.ag-say.muted', 'thinking…'));
          steps.appendChild(li);
          this.scroll('agent');
          const say = li.querySelector('.ag-say');
          const { text, model } = await this.agentAsk(hist, run, signal, note, (t) => {
            say.textContent = withoutCode(t) || 'thinking…';
            this.scroll('agent');
          });
          note('');
          if (!rec.models.includes(model)) rec.models.push(model);
          const step = agentStep(text), cmd = step.cmd;
          // A reply with a code block that is no command (```text, ```r …). The rule the agent was given is that a
          // report has no code block: once in a task it is told that nothing was run, and asked which it meant.
          if (cmd == null && /```/.test(text) && !reminded && cmds < AGENT_MAX) {
            reminded = true;
            li.remove();
            hist.push({ role: 'assistant', content: text }, { role: 'user', content: AGENT_REMIND });
            continue;
          }
          if (cmd == null || cmds >= AGENT_MAX) {
            // no command: this is the agent's report
            li.remove();
            final = cmd == null ? text : withoutCode(text) + `\n\n*(Stopped after reaching the limit of ${AGENT_MAX} steps.)*`;
            break;
          }
          // (the description of the step: what stands in front of its block – see AGENT_AHEAD)
          const ahead = step.before && step.after.length > AGENT_AHEAD;
          const said = ahead ? step.before : withoutCode(text);
          say.textContent = said;
          say.classList.remove('muted');
          cmds++;
          const srec = { say: said, cmd: cmd || '', code: null, out: '', refused: '', note: '' };
          rec.steps.push(srec);
          const refused = cmd ? agentRefusal(cmd) : 'the code block was empty: give one command.';
          let result;
          li.appendChild(h('div.ag-cmdrow', h('code.ag-cmd', cmd || '(empty)')));
          if (refused) {
            li.classList.add('bad');
            li.querySelector('.ag-ic').textContent = '⛔';
            li.appendChild(h('small.muted', 'not run: ' + refused));
            srec.refused = refused;
            result = 'Not run: ' + refused;
          } else {
            // run it in the terminal; what it changes outside the agent's folder is put back
            const W = MG.wasm;
            const snap = outsideSnapshot(fs, run);
            if (W && W.keep) {
              try {
                await W.keep(Array.from(snap));
              } catch (e) {
                console.error(e); // without the copies, only files that the command leaves alone can be put back
              }
            }
            const before = new Map();
            for (const [p, e] of fs.entries) if (e.kind === 'aioli' && !insideDir(p, '/tmp')) before.set(p, e);
            try {
              await holdBytes(fs, held);
            } catch (e) {
              console.error(e);
            }
            const since = Date.now(), gen = W ? W.gen : 0;
            const saved = new Set(); // what the user changes meanwhile: theirs
            this._step = { run, saved };
            // a command that has not ended after AGENT_SECONDS is stopped by force. (The Stop button: see stopNow.)
            let timedOut = false, again = null;
            const timer = setTimeout(() => {
              timedOut = true;
              T.stop();
              T.stop(true);
              // (a program that was only just being started is not "running" yet at that moment: again, until the command has ended)
              again = setInterval(() => T.stop(true), 500);
            }, AGENT_SECONDS * 1000);
            const r = { code: 0, text: '' };
            const notRun = [];
            let ended = null;
            try {
              // the commands of the block, one after the other: what follows a command that failed is not run
              const parts = agentParts(cmd);
              for (let k = 0; k < parts.length; k++) {
                T.shell.endedBy = null;
                T.shell.exitTyped = false;
                // (while a command of the agent runs, a shell that knows of it refuses what the agent has not got)
                T.shell._agentOnly = AGENT_ALLOW;
                let one;
                try {
                  one = await this.termRun(parts[k], { agent: true });
                } finally {
                  T.shell._agentOnly = null;
                }
                r.text += one.text;
                r.code = one.code;
                // (exit, or the agent's own set -e / set -u, ended the command where a script would have ended: so does the block)
                ended = T.shell.exitTyped ? 'exit' : T.shell.endedBy || null;
                T.shell.exitTyped = false;
                if (one.code !== 0 || ended || timedOut || signal.aborted) {
                  notRun.push(...parts.slice(k + 1));
                  break;
                }
              }
            } finally {
              clearTimeout(timer);
              clearInterval(again);
              this._step = null;
            }
            // (files that a forced stop of the programs removed are not the user's doing)
            if (W && W.gen !== gen && W.lostEntries) for (const k of W.lostEntries.keys()) saved.delete(k);
            const u = await undoOutside(fs, run, snap, saved, since, gen, held, before);
            const undone = u.changed, killed = u.killed;
            // (after a forced stop: the program-written files of this folder that are not there any more – the step's own)
            const gone = killed ? Array.from(before.keys()).filter((p) => insideDir(p, run) && !fs.entries.has(p)).map((p) => p.slice(run.length + 1)) : [];
            const lostOut = u.lost.filter((p) => !insideDir(p, run));
            if (fs.cwd !== run && fs.isDir(run)) await this.termRun('cd ' + run, { agent: true });
            li.classList.toggle('bad', r.code !== 0 || undone.length > 0 || timedOut);
            li.querySelector('.ag-ic').innerHTML = r.code === 0 && !undone.length && !timedOut ? '✓' : '✗';
            const lines = r.text.replace(/\s+$/, '').split('\n');
            const excerpt = (lines.length > 14 ? ['…'].concat(lines.slice(-14)) : lines).join('\n');
            li.appendChild(h('details.ag-out', h('summary', `output (exit status ${r.code})`), h('pre', excerpt || '(no output)')));
            const notes = [];
            if (undone.length) notes.push('Changes outside the agent’s folder were undone: ' + undone.slice(0, 4).map((k) => pretty(k)).join(', ') + (undone.length > 4 ? ' …' : ''));
            if (timedOut) notes.push(`The page stopped this step because it ran for more than ${AGENT_SECONDS} seconds.`);
            if (killed) notes.push('The programs had to be stopped by force and then restarted. Anything they wrote during this step has been lost, but the files they had written before it are back as they were.' + (lostOut.length ? ' These files in your folders were too large for the page to keep a copy of, and have been lost: ' + lostOut.slice(0, 4).map((k) => pretty(k)).join(', ') + (lostOut.length > 4 ? ` and ${lostOut.length - 4} more` : '') + '.' : ''));
            notes.forEach((t) => li.appendChild(h('small.muted', t)));
            srec.code = r.code;
            srec.out = r.text;
            srec.note = notes.join(' ');
            const out = r.text.trim();
            result =
              `Exit status ${r.code}.` +
              (timedOut ? ` The command was stopped: it ran for more than ${AGENT_SECONDS} seconds.` : '') +
              (killed ? ' The programs had to be stopped by force: what programs wrote in this step is gone; the files from earlier steps are as they were.' + (gone.length ? ` Not there any more: ${gone.slice(0, 6).join(', ')}.` : '') : '') +
              (notRun.length ? ` Not run, because the command before ${r.code !== 0 ? 'failed' : ended === 'exit' ? 'was exit' : 'ended the block'}: ${notRun.join(' ; ').slice(0, 300)}.` : '') +
              (undone.length ? ` Your changes outside your folder were undone: ${undone.slice(0, 6).map((k) => pretty(k)).join(', ')}.` : '') +
              '\nOutput' +
              (out.length > AGENT_OUT ? ' (last ' + AGENT_OUT + ' characters)' : '') +
              ':\n```text\n' +
              (out.slice(-AGENT_OUT) || '(no output)') +
              '\n```';
          }
          li.classList.remove('run');
          if (ahead) {
            li.appendChild(h('small.muted', 'The model wrote more after this step, before the step had run. That text is not shown here, because a report can only be written once the result is known.'));
            result += '\n\n' + AGENT_AHEAD_TOLD;
          }
          if (cmds >= AGENT_MAX) result += `\n\nYou have used all ${AGENT_MAX} steps. Reply now without a code block: what you did, which files you made and what the results show.`;
          hist.push({ role: 'assistant', content: text }, { role: 'user', content: result });
          if (signal.aborted) throw new DOMException('Stopped', 'AbortError');
        }
      } catch (e) {
        outcome = e.name === 'AbortError' ? 'stopped' : 'error';
        steps.querySelectorAll('li.run').forEach((li) => {
          li.classList.remove('run');
          li.querySelector('.ag-ic').textContent = '–';
          if (/thinking/.test(li.textContent)) li.remove();
        });
        final = outcome === 'stopped' ? '*(Stopped.)*' : '**The AI service returned an error.**\n\n' + e.message;
        if (outcome === 'error') card.classList.add('err');
      } finally {
        this._step = null;
        note('');
        if (fs.cwd !== back && fs.isDir(back)) await this.termRun('cd ' + back, { agent: true });
        this._agentLive = false;
        MG.app.agentBusy = false;
        if (T.unlock) T.unlock();
        if (shellState && T.shell.restoreState) T.shell.restoreState(shellState);
        held.clear();
        if (MG.wasm && MG.wasm.dropKept) MG.wasm.dropKept().catch(() => {});
        if (T._renderPrompt) T._renderPrompt();
        rec.report = outcome === 'done' ? final : '';
        rec.outcome = outcome === 'done' ? 'done' : outcome === 'stopped' ? 'stopped by the student' : 'the AI service returned an error';
        card.querySelector('.ag-head b').textContent = (outcome === 'done' ? 'Agent · finished' : outcome === 'stopped' ? 'Agent · stopped' : 'Agent · error') + ` · ${pretty(run)}`;
        const body = h('div.ai-body', { dataset: { origin: 'terminal' } });
        card.appendChild(body);
        this.fill(body, final || '(no reply)');
        const recPath = this.saveRecord(ctx);
        if (recPath) card.appendChild(this.recordRow(recPath, run));
        const secs = Math.round((performance.now() - t0) / 1000);
        card.appendChild(h('div.ai-badge', `agent · ${rec.models.join(', ') || modelOf(this.settings)} · ${cmds} step${cmds === 1 ? '' : 's'} · ${secs >= 60 ? Math.floor(secs / 60) + ' min ' : ''}${secs % 60} s`));
        this.msgs.agent.push({ role: 'assistant', content: final || '(no reply)' });
        this.busy = false;
        this._abort = null;
        this.sendBtn.innerHTML = MG.icon('send') + '<span>Send</span>';
        this.scroll('agent');
        this.renderCtx();
        bus.emit('agent:live', { ok: outcome === 'done', run: ctx.n, commands: cmds, folder: pretty(run) });
      }
    }
    /** under an agent's card: its record and its folder */
    recordRow(path, run) {
      const fs = MG.app.fs;
      const b = (icon, text, fn, tip) => {
        const x = h('button.btn.small', { type: 'button', title: tip, html: MG.icon(icon) + '<span>' + esc(text) + '</span>' });
        x.addEventListener('click', () => Promise.resolve(fn()).catch((e) => toast(esc(e.message || String(e)), 'error')));
        return x;
      };
      return h(
        'div.ag-file',
        h('span.ag-fname', { html: MG.icon('file') + ' ' + esc(pretty(path)) }),
        h('span.grow'),
        b('eye', 'Open the record', () => MG.app.editFile(path, { line: 1 }), 'Open the record of the tasks, commands and output (a Markdown file) in the Files tab'),
        b('download', '.md', async () => MG.downloadText(await fs.readText(path), `agent-run-${MG.path.basename(run).replace(/^run-/, '')}.md`, 'text/markdown'), 'Download the record'),
        b('folder', 'Folder', () => MG.app.revealFile(run), 'Show the agent’s folder in Files')
      );
    }

    /* ---------------- talking to the service ---------------- */
    /* Stream an answer.
       Gemini: the chosen model is asked first, then the fallback models in their order – but not a model that the
       page knows to be busy, silent or over a limit (the memory above). A model that is busy (HTTP 5xx), over a
       limit (429), not found (404) or gives no answer (the connection fails, or nothing comes for a minute) is
       noted, and the next one is asked. An answer that breaks off part-way is taken back (cfg.onReset) and the
       question goes to the next model. When no model is left that is not at rest, the two that have rested longest
       of those that were only busy or silent get another chance. Two models in a row that give no answer end the
       request: that is the connection, not the models.
       Other services: one model; if it is busy, a second try after a short pause.
       → { model, skipped }: the model that answered, and what kept others from it.
       When nothing answers, the error says what each model said. Its .status is 429 (limits), 503 (busy) or not set
       (no answer came); .retryIn is the number of seconds after which asking again can help. */
    async streamLive(messages, onDelta, signal, cfg, onNote) {
      const s = (cfg && cfg.settings) || this.settings;
      const key = cfg && cfg.key != null ? cfg.key : this.key;
      const system = MG.user.mask((cfg && cfg.system) || this.systemPrompt());
      const note = onNote || (() => {});
      const reset = cfg && cfg.onReset;
      // turns must alternate between user and assistant: join neighbours of the same role
      messages = messages.reduce((out, m) => {
        const last = out[out.length - 1];
        if (last && last.role === m.role) last.content += '\n\n' + m.content;
        else out.push({ role: m.role, content: m.content });
        return out;
      }, []);
      // (the student's name stays in this browser: wherever it is in what goes to the service, it is "user")
      messages = messages.map((m) => ({ role: m.role, content: MG.user.mask(m.content) }));
      if (s.provider !== 'gemini') {
        const model = modelOf(s);
        for (let attempt = 1; ; attempt++) {
          let started = false;
          try {
            await this.streamOnce(s, key, model, messages, (d) => {
              started = true;
              onDelta(d);
            }, signal, system);
            return { model, skipped: [] };
          } catch (e) {
            if (e.name !== 'AbortError' && !started && BUSY.includes(e.status) && attempt === 1) {
              note(`${model} is busy – trying again…`);
              await pause(1500 + Math.random() * 1500, signal);
              continue;
            }
            if (e.status === 429 && !started) e.retryIn = Math.round(Math.min(90, Math.max(5, e.retryAfter || 30)));
            throw e;
          }
        }
      }
      const chosen = geminiModelOf(s);
      const chain = [chosen].concat(FALLBACKS.filter((m, i, a) => a.indexOf(m) === i && m !== chosen));
      if (restKey !== key) {
        // another key is another project, with limits of its own
        REST.clear();
        restKey = key;
      }
      try {
        if (navigator.onLine === false) throw Object.assign(new Error('This browser is offline. Connect to the internet and try again.'), { network: true, retryIn: RETRY });
        const said = new Map(); // what each model said: in this request, or when it was last asked and is still at rest
        chain.forEach((m) => resting(m) && said.set(m, REST.get(m)));
        const failed = [];
        let queue = chain.filter((m) => !said.has(m));
        let again = false, silent = 0;
        for (;;) {
          if (!queue.length && !again) {
            again = true;
            queue = chain.filter((m) => said.has(m) && !failed.includes(said.get(m)) && (said.get(m).why === 'busy' || said.get(m).why === 'noanswer')).sort((a, b) => said.get(a).until - said.get(b).until).slice(0, 2);
          }
          if (!queue.length) break;
          const model = queue.shift();
          const before = failed[failed.length - 1];
          if (before) note(`${before.model} ${before.broke ? 'broke off' : told(before, true)} – asking ${model} instead…`);
          let started = false;
          try {
            await this.streamOnce(s, key, model, messages, (d) => {
              started = true;
              onDelta(d);
            }, signal, system);
            REST.delete(model);
            const first = model !== chosen && said.get(chosen);
            return { model, skipped: (first && !failed.includes(first) ? [first] : []).concat(failed).map((x) => ({ model: x.model, why: x.broke ? 'broke' : x.why, daily: x.daily })) };
          } catch (e) {
            if (e.name === 'AbortError') throw e;
            const why = e.network ? 'noanswer' : e.status === 404 ? 'notfound' : e.status === 429 ? 'limit' : BUSY.includes(e.status) ? 'busy' : '';
            // an error of another kind (the key, the request itself) – or an answer that broke off and cannot be taken back
            if (!why || (started && !reset)) throw e;
            if (started) reset();
            const was = REST.get(model);
            const x = { model, why, broke: started, status: e.status, text: e.message, at: Date.now(), until: Infinity };
            if (why === 'limit') {
              const wait = e.retryAfter > 0 ? Math.min(86400, e.retryAfter) : e.daily ? 3600 : 60;
              x.daily = !!e.daily || wait > 900;
              x.limit = e.limit;
              x.until = Date.now() + (wait + 1) * 1000;
            } else if (why === 'busy') {
              // busy again soon after its rest: the rest is twice as long (2, 4, 8, at most 15 minutes)
              x.n = was && was.why === 'busy' && Date.now() - was.until < 600000 ? was.n + 1 : 1;
              x.until = Date.now() + Math.min(900, BUSY_REST * 2 ** (x.n - 1)) * 1000;
            } else if (why === 'noanswer') x.until = Date.now() + SILENT_REST * 1000;
            REST.set(model, x);
            said.set(model, x);
            failed.push(x);
            silent = why === 'noanswer' ? silent + 1 : 0;
            if (silent >= 2) break;
          }
        }
        throw noAnswer(chain.map((m) => said.get(m)).filter(Boolean), silent >= 2);
      } finally {
        this.showStatus();
      }
    }
    /** one request; the answer is passed to onDelta as it arrives.
        An error that the service reports carries .status – and for "too many requests" (429) .retryAfter (seconds)
        and, when the service names a limit per day, .daily and .limit. An answer that does not come – the connection
        fails or breaks off, or (Gemini) nothing arrives for a minute (aiWaitSeconds) – carries .network. */
    async streamOnce(s, key, model, messages, onDelta, signal, system) {
      const gem = s.provider === 'gemini';
      const base = (s.baseURL || '').replace(/\/+$/, '');
      if (signal && signal.aborted) throw stopped();
      // the request ends when the user presses Stop – or when the service has said nothing for too long
      const ac = new AbortController();
      const onStop = () => ac.abort();
      if (signal) signal.addEventListener('abort', onStop, { once: true });
      const quiet = gem ? WAIT() * 1000 : 0;
      let timer = null, silent = false, bytes = 0;
      const arm = () => {
        clearTimeout(timer);
        if (quiet)
          timer = setTimeout(() => {
            silent = true;
            ac.abort();
          }, quiet);
      };
      /* why the answer did not come: the user's Stop, the service's silence, or the connection */
      const lost = (e) => {
        if (signal && signal.aborted) return stopped();
        if (silent) return Object.assign(new Error(`${model} ${bytes ? 'stopped in the middle of its reply and then sent nothing' : 'gave no answer'} for ${Math.round(quiet / 1000)} seconds.`), { network: true, silent: true });
        if (e.name === 'AbortError') return e;
        const where = gem ? 'the Gemini API' : s.provider === 'anthropic' ? 'the Anthropic API' : base;
        return Object.assign(new Error(bytes ? `The connection to ${where} broke off in the middle of the reply (${e.message}).` : `Could not reach ${where} (${e.message}). ${s.provider === 'openai' ? 'Check the address. The service must also allow requests from web pages (CORS).' : 'Check your internet connection.'}`), { network: true });
      };
      /* an error that the service reports: as the status of its answer, or (Gemini) inside an answer that had begun */
      const refused = (status, j, statusText, retryHeader) => {
        const err = (j && j.error) || null;
        const det = err && Array.isArray(err.details) ? err.details.filter(Boolean) : [];
        const detail = j ? (err && (err.message || err.type)) || JSON.stringify(j).slice(0, 300) : statusText || '';
        const reason = err ? det.map((d) => d.reason).filter(Boolean)[0] || err.status || '' : '';
        const ri = det.find((d) => /RetryInfo$/.test(d['@type'] || ''));
        const retryAfter = (ri && parseFloat(ri.retryDelay)) || parseFloat(retryHeader) || 0;
        // a limit per day is named in the answer: quotaId "GenerateRequestsPerDayPerProjectPerModel-FreeTier", with its value
        const qf = det.find((d) => /QuotaFailure$/.test(d['@type'] || ''));
        const day = ((qf && qf.violations) || []).find((v) => v && /PerDay/i.test(v.quotaId || ''));
        const limit = day && /^\d+$/.test(String(day.quotaValue)) ? +day.quotaValue : undefined;
        const badKey = status === 401 || status === 403 || reason === 'API_KEY_INVALID';
        const why = badKey
          ? 'The API key was not accepted.'
          : status === 404
            ? `The model name (${model}) may be wrong, or the model may have been retired. Check the name in the AI settings (⚙).`
            : status === 429
              ? gem
                ? day
                  ? `${model} is over its limit for today${limit != null ? ` (${limit} requests a day)` : ''}. On the free tier, each model allows a certain number of requests per day, counted per project. You can carry on when the service accepts requests again, use a key from another person or project, or choose a different model in the AI settings (⚙).`
                  : 'Too many requests. The free tier only allows a few requests per minute and per day, so wait a minute and try again.'
                : 'Too many requests, or there is no credit left. Try again in a minute.'
              : BUSY.includes(status)
                ? gem
                  ? `Google’s servers are busy for ${model} (“high demand”). This is a problem on Google’s side, not with your key. Wait a minute and try again, or choose a different model in the AI settings (⚙).`
                  : 'The service is busy or had a temporary problem. Try again in a minute.'
                : '';
        return Object.assign(new Error(`HTTP ${status}. ${why} ${detail}`.trim()), { status, retryAfter, daily: !!day, limit });
      };
      try {
        arm();
        let r;
        if (s.provider === 'anthropic') {
          r = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
            body: JSON.stringify({ model, max_tokens: 8000, system, messages, stream: true }),
            signal: ac.signal
          }).catch((e) => {
            throw lost(e);
          });
        } else if (gem) {
          // Google's Gemini API (generateContent, streamed as server-sent events); the whole conversation is sent each time
          r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
            body: JSON.stringify({ system_instruction: { parts: [{ text: system }] }, contents: messages.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })) }),
            signal: ac.signal
          }).catch((e) => {
            throw lost(e);
          });
        } else {
          r = await fetch(base + '/chat/completions', {
            method: 'POST',
            headers: Object.assign({ 'content-type': 'application/json' }, key ? { authorization: 'Bearer ' + key } : {}),
            body: JSON.stringify({ model, stream: true, messages: [{ role: 'system', content: system }].concat(messages) }),
            signal: ac.signal
          }).catch((e) => {
            throw lost(e);
          });
        }
        arm();
        if (!r.ok) {
          let j = null;
          try {
            j = await r.json();
          } catch (e) {
            if (signal && signal.aborted) throw stopped();
          }
          throw refused(r.status, j, r.statusText, r.headers.get('retry-after'));
        }
        const reader = r.body.getReader();
        const dec = new TextDecoder();
        let buf = '';
        for (;;) {
          const { value, done } = await reader.read().catch((e) => {
            throw lost(e);
          });
          if (done) break;
          arm();
          bytes += value.length;
          buf += dec.decode(value, { stream: true });
          let k;
          while ((k = buf.indexOf('\n')) >= 0) {
            const line = buf.slice(0, k).trim();
            buf = buf.slice(k + 1);
            if (!line.startsWith('data:')) continue;
            const data = line.slice(5).trim();
            if (!data || data === '[DONE]') continue;
            let j;
            try {
              j = JSON.parse(data);
            } catch (e) {
              continue;
            }
            if (s.provider === 'anthropic') {
              if (j.type === 'content_block_delta' && j.delta && j.delta.type === 'text_delta') onDelta(j.delta.text);
              else if (j.type === 'error') throw Object.assign(new Error((j.error && j.error.message) || 'stream error'), { status: j.error && j.error.type === 'overloaded_error' ? 529 : undefined });
            } else if (gem) {
              if (j.error) {
                // an error in an answer that began with "200 OK": the same kinds as the errors that come instead of an answer
                const code = +j.error.code || { UNAVAILABLE: 503, RESOURCE_EXHAUSTED: 429, INTERNAL: 500, DEADLINE_EXCEEDED: 504, NOT_FOUND: 404 }[j.error.status];
                throw code ? refused(code, j) : new Error(j.error.message || 'stream error');
              }
              if (j.promptFeedback && j.promptFeedback.blockReason) throw new Error('Gemini did not answer (' + j.promptFeedback.blockReason + ').');
              const cand = (j.candidates && j.candidates[0]) || {};
              ((cand.content && cand.content.parts) || []).forEach((p) => {
                if (p.text && !p.thought) onDelta(p.text);
              });
              // A reply that the service cut off as a "malformed function call": the model had begun its ```bash block,
              // and the service took the fence for the call of a tool named bash. What it took away is in finishMessage
              // ("Malformed function call: call:bash ```", the commands, "```") – the block goes back into the reply.
              if (cand.finishReason === 'MALFORMED_FUNCTION_CALL' && typeof cand.finishMessage === 'string') {
                const m = /call:\s*(?:bash|sh|shell)\s*```[^\n]*\n([\s\S]*?)\n?```\s*$/.exec(cand.finishMessage);
                if (m && m[1].trim()) onDelta('\n\n```bash\n' + m[1] + '\n```\n');
              }
            } else {
              const dd = j.choices && j.choices[0] && j.choices[0].delta;
              if (dd && dd.content) onDelta(dd.content);
            }
          }
        }
      } finally {
        clearTimeout(timer);
        if (signal) signal.removeEventListener('abort', onStop);
        ac.abort(); // (nothing is left to end when the answer came whole)
      }
    }

    /* ---------------- a prompt for another AI tool ---------------- */
    async buildPrompt(question, extra) {
      const q = question || this.input.value.trim() || '[write your question here]';
      const ctx = await this.contextFor(extra || {});
      return [
        'I am learning R with the R workbench, a website where R runs in the web browser (webR): the R console, an RStudio-like IDE (R scripts, R Markdown, R Notebooks, Quarto, Shiny), Jupyter-style R notebooks, and a bash-like terminal with Rscript.',
        ...envLines(),
        '',
        ctx.trim(),
        '',
        'My question: ' + q,
        '',
        'Please answer briefly, explain the code you give so that I can learn from it, and use only functions and arguments that really exist.'
      ].join('\n');
    }
    async copyPrompt(question, extra) {
      const text = await this.buildPrompt(question, extra);
      const ok = await MG.copyText(text);
      const m = MG.modal(
        'A prompt for another AI tool',
        `<p class="small">${ok ? '<b>Copied to the clipboard.</b> ' : ''}Paste it into an AI tool that you are allowed to use, and check what it gives you. The prompt describes the workbench and contains your question and whatever is ticked below the assistant's message box (your code, the end of the console and your file names), but not your data. Read it before you paste it, and never paste personal or patient data into an AI tool.</p><textarea class="prompt-text" readonly aria-label="Prompt">${esc(text)}</textarea><div class="prompt-actions"><button class="btn" data-x="copy" type="button">${MG.icon('copy')}<span>Copy</span></button><button class="btn primary" data-x="ok" type="button">Done</button></div>`
      );
      m.box.querySelector('[data-x="copy"]').addEventListener('click', async () => toast((await MG.copyText(text)) ? 'Prompt copied.' : 'Could not copy the prompt. Select the text and copy it yourself.', null, 2500));
      m.box.querySelector('[data-x="ok"]').addEventListener('click', () => m.close());
      bus.emit('ai:copyprompt', {});
    }

    /* ---------------- settings ---------------- */
    settingsDialog() {
      const s = this.settings;
      let remembered = false;
      try {
        remembered = !!window.sessionStorage.getItem(KEY_NAME);
      } catch (e) {
        remembered = false;
      }
      const html = `
<div class="ai-set">
  <p class="muted small">The assistant uses an AI service of your choice, with your own key (or one you have been given). Your messages, together with whatever you tick below the message box, go straight from your browser to that service.</p>
  <label>Service <select data-k="provider"><option value="gemini" ${s.provider === 'gemini' ? 'selected' : ''}>Google Gemini (free tier available)</option><option value="anthropic" ${s.provider === 'anthropic' ? 'selected' : ''}>Anthropic (Claude)</option><option value="openai" ${s.provider === 'openai' ? 'selected' : ''}>OpenAI-compatible service</option></select></label>
  <label data-show="gemini">Model <input data-k="geminiModel" value="${esc(geminiModelOf(s))}" spellcheck="false"></label>
  <p data-show="gemini" class="muted small">You can create a free key with a Google account at <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">aistudio.google.com/apikey</a> (you must be 18 or over). On the free tier, Google may use what you send to improve its products, and human reviewers may read it. Each model only allows a few requests per minute and a limited number per day. When a model is busy or over its limit, the page asks another one, and each answer shows which model replied.</p>
  <label data-show="anthropic">Model <input data-k="model" value="${esc(anthropicModelOf(s))}" spellcheck="false"></label>
  <p data-show="anthropic" class="muted small">Create a key in the Claude Console at <a href="https://platform.claude.com/settings/keys" target="_blank" rel="noopener">platform.claude.com</a> (this is a paid service).</p>
  <label data-show="openai">Base URL <input data-k="baseURL" value="${esc(s.baseURL)}" spellcheck="false"></label>
  <label data-show="openai">Model <input data-k="openaiModel" value="${esc(s.openaiModel)}" placeholder="the model name your service uses" spellcheck="false"></label>
  <p data-show="openai" class="muted small">Any service with an OpenAI-style <code>/chat/completions</code> API that allows requests from web pages (CORS), such as a university service or one running on your own computer. It may or may not need a key.</p>
  <label>API key <input data-k="key" type="password" value="${esc(this.key)}" autocomplete="off" spellcheck="false" placeholder="paste the key here"></label>
  <label class="ai-cb"><input type="checkbox" data-k="remember" ${remembered ? 'checked' : ''}> Remember the key until I close this browser tab (otherwise it is forgotten when the page is reloaded)</label>
  <p class="muted small">The key is only kept in this browser tab. It is never saved in a file or in the browser's long-term storage. <b>Never paste personal or patient data into an AI tool.</b></p>
  <div class="prompt-actions"><span class="ai-test-out muted small" aria-live="polite"></span><button class="btn" data-x="forget" type="button">Forget the key</button><button class="btn" data-x="test" type="button">Test</button><button class="btn primary" data-x="save" type="button">Save</button></div>
</div>`;
      const m = MG.modal('AI settings', html);
      const B = m.box;
      const val = (k) => B.querySelector(`[data-k="${k}"]`);
      const sync = () => {
        const p = val('provider').value;
        B.querySelectorAll('[data-show]').forEach((el) => (el.hidden = el.dataset.show !== p));
      };
      val('provider').addEventListener('change', sync);
      sync();
      // a model left at the site's default is saved as '' (= follow config.js)
      const own = (k, dflt) => {
        const v = val(k).value.trim().replace(/^models\//, '');
        return v && v !== dflt ? v : '';
      };
      const read = () => ({
        settings: { provider: val('provider').value, model: own('model', LIVE_DEFAULTS.model), geminiModel: own('geminiModel', LIVE_DEFAULTS.geminiModel), baseURL: val('baseURL').value.trim(), openaiModel: val('openaiModel').value.trim() },
        key: val('key').value.trim()
      });
      B.querySelector('[data-x="test"]').addEventListener('click', async () => {
        const out = B.querySelector('.ai-test-out');
        const r = read();
        if (!r.key && needsKey(r.settings)) {
          out.textContent = 'Paste a key first.';
          return;
        }
        out.textContent = 'Testing…';
        let got = '';
        try {
          const res = await this.streamLive([{ role: 'user', content: 'Reply with the single word: ready' }], (d) => (got += d), undefined, Object.assign(r, { onReset: () => (got = '') }), (note) => (out.textContent = note));
          out.textContent = '✓ Connected: “' + got.trim().slice(0, 40) + '”' + (res.skipped.length ? ` – from ${res.model} (${res.skipped.map((x) => x.model + ' ' + skipWord(x)).join(', ')})` : '');
        } catch (e) {
          out.textContent = '✗ ' + e.message;
        }
      });
      B.querySelector('[data-x="forget"]').addEventListener('click', () => {
        val('key').value = '';
        val('remember').checked = false;
        this.key = '';
        try {
          window.sessionStorage.removeItem(KEY_NAME);
        } catch (e) {
          /* storage may be blocked */
        }
        this.renderMode();
        this.refreshIntro();
        B.querySelector('.ai-test-out').textContent = 'The key has been forgotten.';
      });
      B.querySelector('[data-x="save"]').addEventListener('click', () => {
        const r = read();
        this.settings = r.settings;
        this.key = r.key;
        // (the settings – service and models – are kept; the key never with them)
        store.set('ai:settings', this.settings);
        try {
          if (val('remember').checked && this.key) window.sessionStorage.setItem(KEY_NAME, this.key);
          else window.sessionStorage.removeItem(KEY_NAME);
        } catch (e) {
          /* storage may be blocked */
        }
        this.renderMode();
        this.refreshIntro();
        this.renderCtx();
        m.close();
        if (!this.connected()) toast('Settings saved. Add a key to use the assistant.', 'warn');
        else toast(`The assistant will now use ${esc(modelOf(this.settings))}.`, 'ok', 2500);
        bus.emit('ai:settings', { provider: this.settings.provider });
      });
    }
  }

  /* Questions that other tabs send (an error, a cell): to the assistant – which is made, with its tab, if it is not
     there yet. term:ask {line, output, error, cwd} (terminal.js), nb:ask {kind, cell} (notebook.js), r:ask {where,
     code, error, output} (an R error in the R console, RStudio or a notebook). */
  function relay(method) {
    return (d) => {
      const go = (A) => A && typeof A[method] === 'function' && A[method](d || {});
      if (MG.app && MG.app.ai) return go(MG.app.ai);
      if (!MG.app || !MG.app.showWorkbench) return;
      Promise.resolve(MG.app.showWorkbench('assistant'))
        .then(() => waitFor(() => MG.app.ai, 4000))
        .then(go)
        .catch((e) => console.error(e));
    };
  }
  bus.on('term:ask', relay('askAboutError'));
  bus.on('nb:ask', relay('askAboutCell'));
  bus.on('r:ask', relay('askAboutR'));

  MG.Assistant = Assistant;
  MG.aiModelMemory = REST;
  MG.aiUtil = { mdBlocks, shellCommands, shellCode, rCode, looksR, looksShell, offlineHelp, lastRError, stripBanner, envLines, programs };
})();
