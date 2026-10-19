/* =====================================================================
   The notebook's kernel: R, as Jupyter's R kernel (IRkernel) runs it –
   here in the browser.

   One R serves all the notebooks of the page: a variable made in one
   notebook can be used in another. It is an R of its own (MG.R.Session,
   rsession.js), as the R console's, RStudio's and the terminal's are: what
   those make in memory is not here, and what is made here is not there.
   Like them it works on the user's files (the files that changed are
   copied in before each cell and the files R wrote are copied back after
   it), and it can load every package that an R of the page installed
   with install.packages().

   A cell is run as one line read by R's read–eval–print loop:
       .wb_run("the cell's code", "the notebook's folder")
   The R helpers below (R_SETUP) run the code expression by expression,
   stop at the first error (as Jupyter does), show data frames as tables
   and errors with a hint. What the page needs to know besides R's text –
   a table, an error, where R is – reaches it as marked lines on R's
   standard output: \x01WB:kind\x01fields (newlines in a field as \x02,
   fields separated by \x03). Plots come from R's canvas device: each
   page of a plot is one picture under the cell.
   ===================================================================== */
(function () {
  'use strict';
  const MG = window.MG;
  const { bus } = MG;
  const HOME = () => (MG.app && MG.app.HOME) || '/home/user';
  const rstr = (s) => MG.R.rstr(s);
  /* R's console reads at most 4096 bytes a line (webR cuts a longer one): a cell with more code is handed over in a
     file instead */
  const MAX_LINE = 4000;
  const utf8Len = (s) => new TextEncoder().encode(s).length;

  /* ------------------------------------------------------------------
     the notebook's helpers in R: an environment "workbench" on the
     search path, before rsession.js's tools:workbench (whose View(), q()
     and system() it hides). Its functions look things up in base R first,
     so a variable of the user's called paste or cat does not upset them.
     ------------------------------------------------------------------ */
  const R_SETUP = String.raw`
local({
  tw <- get("wb", envir = as.environment("tools:workbench"))
  wb <- new.env()
  wb$lastcwd <- ""
  wb$calls <- NULL
  wb$devsize <- NULL

  ## ---- marked lines: what the page shows besides R's text --------------------------------
  wb$mark <- function(kind, fields = "") {
    s <- paste(gsub("\n", "\002", enc2utf8(as.character(fields)), fixed = TRUE), collapse = "\003")
    cat("\001WB:", kind, "\001", s, "\n", sep = "")
  }
  wb$pretty <- function(p) {
    h <- path.expand("~")
    if (identical(p, h)) "~" else if (startsWith(p, paste0(h, "/"))) paste0("~", substring(p, nchar(h) + 1L)) else p
  }

  ## ---- data frames as tables -------------------------------------------------------------
  wb$esc <- function(s) {
    s <- gsub("&", "&amp;", s, fixed = TRUE)
    s <- gsub("<", "&lt;", s, fixed = TRUE)
    gsub(">", "&gt;", s, fixed = TRUE)
  }
  wb$abbr <- function(col) {
    cl <- class(col)[1L]
    switch(cl, integer = "int", numeric = "dbl", character = "chr", factor = "fct", ordered = "ord",
           logical = "lgl", Date = "date", POSIXct = "dttm", list = "list", complex = "cpl", difftime = "drtn", cl)
  }
  wb$df_html <- function(x, n = 25L, title = NULL) {
    nr <- nrow(x); nc <- ncol(x)
    shown <- as.data.frame(utils::head(x, n))
    cells <- lapply(shown, function(col) {
      v <- if (is.list(col)) vapply(col, function(e) paste(format(e), collapse = ", "), "")
           else format(col, digits = 7, trim = TRUE, justify = "none")
      v[is.na(v)] <- "NA"
      wb$esc(as.character(v))
    })
    hdr <- paste0("<th>", wb$esc(names(x)), "<br><small>&lt;", vapply(x, wb$abbr, ""), "&gt;</small></th>", collapse = "")
    rows <- ""
    if (nrow(shown)) {
      body <- if (length(cells)) do.call(paste0, lapply(cells, function(v) paste0("<td>", v, "</td>"))) else ""
      rows <- paste0("<tr><th>", wb$esc(rownames(shown)), "</th>", body, "</tr>", collapse = "")
    }
    what <- if (inherits(x, "tbl_df")) "A tibble" else if (inherits(x, "data.table")) "A data.table" else "A data.frame"
    info <- sprintf("%s: %s × %d", what, format(nr, big.mark = ","), nc)
    if (nr > n) info <- sprintf("%s (the first %d rows are shown)", info, n)
    if (!is.null(title) && nzchar(title)) info <- paste0(title, " · ", info)
    paste0("<p class=\"nb-dfinfo\">", wb$esc(info), "</p><table class=\"dataframe\"><thead><tr><th></th>", hdr,
           "</tr></thead><tbody>", rows, "</tbody></table>")
  }
  # (the table, and the same as text for programs that show the .ipynb file without HTML)
  wb$table <- function(x, n = 25L, title = NULL) {
    h <- tryCatch(wb$df_html(x, n, title), error = function(e) NULL)
    if (is.null(h)) return(FALSE)
    txt <- tryCatch(paste(utils::capture.output(print(utils::head(x, min(n, 50L)))), collapse = "\n"), error = function(e) "")
    wb$mark("html", c(h, txt))
    TRUE
  }
  # (what R prints of a value at the top level: a data frame as a table)
  wb$show <- function(x) {
    if (is.data.frame(x) && wb$table(x)) return(invisible(NULL))
    if (isS4(x)) methods::show(x) else print(x)
    invisible(NULL)
  }

  ## ---- errors, and what to do about them -------------------------------------------------
  wb$fmt_call <- function(cl) {
    if (is.null(cl)) return("")
    d <- deparse(cl, nlines = 1L, width.cutoff = 60L)
    if (length(d) > 1L || nchar(d[1L]) > 70L) paste0(substr(d[1L], 1L, 70L), " …") else d[1L]
  }
  # (the call that a condition names – not the notebook's own eval() of the cell's code)
  wb$call_of <- function(cond) {
    txt <- wb$fmt_call(conditionCall(cond))
    # (the workbench loads a package that another R installed before R's loadNamespace() runs: R's own name for it)
    if (startsWith(txt, "orig(package")) return("loadNamespace(package)")
    if (startsWith(txt, "eval(") || startsWith(txt, "withVisible(")) "" else txt
  }
  wb$pkg_of <- c(ggplot = "ggplot2", aes = "ggplot2", geom_point = "ggplot2", geom_line = "ggplot2", geom_bar = "ggplot2",
    geom_col = "ggplot2", geom_histogram = "ggplot2", geom_boxplot = "ggplot2", geom_smooth = "ggplot2", ggsave = "ggplot2",
    theme_bw = "ggplot2", theme_minimal = "ggplot2", labs = "ggplot2", facet_wrap = "ggplot2", facet_grid = "ggplot2",
    read_csv = "readr", read_tsv = "readr", write_csv = "readr", mutate = "dplyr", select = "dplyr", arrange = "dplyr",
    summarise = "dplyr", summarize = "dplyr", group_by = "dplyr", left_join = "dplyr", inner_join = "dplyr", count = "dplyr",
    rename = "dplyr", distinct = "dplyr", tibble = "tibble", as_tibble = "tibble", glimpse = "dplyr", pivot_longer = "tidyr",
    pivot_wider = "tidyr", drop_na = "tidyr", str_detect = "stringr", str_replace = "stringr", str_sub = "stringr",
    map = "purrr", map_dbl = "purrr", fct_reorder = "forcats", ymd = "lubridate", fromJSON = "jsonlite", toJSON = "jsonlite",
    kable = "knitr", fread = "data.table", fwrite = "data.table", read_excel = "readxl", glue = "glue")
  wb$installed <- function(pkg) pkg %in% tw$userlib || length(find.package(pkg, quiet = TRUE)) > 0L
  wb$hint <- function(msg, code = "") {
    m <- regmatches(msg, regexec("could not find function \"([^\"]+)\"", msg))[[1L]]
    if (length(m) == 2L) {
      f <- m[2L]
      if (f %in% c("%>%", "%<>%", "%T>%")) return(sprintf("%s comes from the magrittr package, which dplyr loads. Run  library(dplyr)  first, or use R's own pipe |> instead.", f))
      p <- unname(wb$pkg_of[f])
      if (!is.na(p)) {
        if (wb$installed(p)) return(sprintf("%s comes from the %s package, so load the package first with  library(%s)", f, p, p))
        return(sprintf("%s comes from the %s package, which is not installed yet. Install it once with  install.packages(\"%s\")  (it comes from the webR repository, repo.r-wasm.org), then load it with  library(%s)", f, p, p, p))
      }
      fns <- ls(globalenv())
      same <- fns[tolower(fns) == tolower(f) & fns != f]
      if (length(same)) return(sprintf("Names in R are case-sensitive, so %s is not the same as %s.", f, same[1L]))
      return(sprintf("There is no function called %s here. Check the spelling (R is case-sensitive). If the function comes from a package, load the package with library() first (it must have been installed once with install.packages()). If it is a function of your own, run the cell that creates it first.", f))
    }
    m <- regmatches(msg, regexec("object '([^']+)' not found", msg))[[1L]]
    if (length(m) == 2L) {
      o <- m[2L]
      cand <- ls(globalenv())
      same <- cand[tolower(cand) == tolower(o) & cand != o]
      if (length(same)) return(sprintf("Names in R are case-sensitive, so %s is not the same as %s.", o, same[1L]))
      close <- if (length(cand)) cand[utils::adist(o, cand)[1L, ] <= max(1, nchar(o) %/% 4)] else character(0)
      if (length(close)) return(sprintf("Did you mean %s?", paste(utils::head(close, 3L), collapse = ", ")))
      return(sprintf("There is no object called %s in the notebooks' R session. Run the cell that creates it first (after a restart, R has forgotten everything). The R console, RStudio and the terminal each have their own R session, so objects you created there are not available here. If %s is meant to be text, put it in quotes. If it is a column of a data frame, write df$%s.", o, o, o))
    }
    m <- regmatches(msg, regexec("there is no package called .([A-Za-z][A-Za-z0-9.]*).", msg))[[1L]]
    if (length(m) == 2L) return(sprintf("The %s package is not installed in this browser yet. Install it once with  install.packages(\"%s\")  and then load it with  library(%s). Packages come from the webR repository (repo.r-wasm.org), and not every CRAN package has been built for webR.", m[2L], m[2L], m[2L]))
    if (grepl("cannot open|No such file", msg)) return(sprintf("R's working directory is %s, which is where R looks for a file when you give its name without a folder. Your files are in ~ (%s) and the data files are in ~/data. From a notebook in ~/notebooks, write \"../data/name.csv\" or \"~/data/name.csv\". Use list.files() to see what is in the working directory.", wb$pretty(getwd()), path.expand("~")))
    if (grepl("non-numeric argument to binary operator", msg)) return("One of the values is text, not a number. Convert it with as.numeric(), or look at the types of the columns with str().")
    if (grepl("subscript out of bounds", msg)) return("R counts from 1 (not 0), and the position you ask for must exist. Check the size with length(), nrow() or ncol().")
    if (grepl("missing value where TRUE/FALSE needed", msg)) return("The condition of an if() or while() was NA. Check for missing values with is.na().")
    if (grepl("argument is of length zero", msg)) return("The condition of an if() was empty. This often happens with a column name that does not exist, because df$name then gives NULL.")
    if (grepl("arguments imply differing number of rows", msg)) return("All the columns of a data frame must have the same length.")
    if (grepl("unused argument", msg)) return("The function does not have an argument with that name. Look at its help page with ?name to see which arguments it takes.")
    if (grepl("invalid argument type", msg) && grepl("(^|\n)[ \t]*![ \t]*[A-Za-z]", code)) return("In Python's Jupyter kernel, a line that starts with ! runs a shell command, but in R ! means 'not'. Run shell commands in the Terminal tab instead.")
    if (grepl("unexpected", msg)) {
      if (grepl("(^|\n)[ \t]*%", code)) return("Lines that start with % (and cells that start with %%) are commands for Python's Jupyter kernel (IPython), and the R kernel does not have them. Run shell commands in the Terminal tab instead.")
      if (grepl("(^|\n)[ \t]*(import [A-Za-z]|from [A-Za-z_.]+ import|def [A-Za-z_]+\\(|elif )", code)) return("This looks like Python, but the notebooks here run R. In R you would write, for example, x <- 5, print(x) or library(name).")
      return("R could not read this code. Check that every ( [ { has a matching ) ] }, that quotes come in pairs and that the arguments are separated by commas. The mistake is often just before the place marked with ^.")
    }
    ""
  }
  wb$report <- function(e, code) {
    msg <- conditionMessage(e)
    callTxt <- wb$call_of(e)
    head <-if (nzchar(callTxt)) paste0("Error in ", callTxt, ": ", msg) else paste0("Error: ", msg)
    tb <- ""
    calls <- wb$calls
    wb$calls <- NULL
    if (length(calls)) {
      txt <- vapply(calls, function(c) paste(deparse(c, nlines = 1L), collapse = ""), "")
      k <- max(c(0L, which(startsWith(txt, "eval(.wb_e"))))
      if (k > 0L && k < length(calls)) {
        user <- calls[(k + 1L):length(calls)]
        fn <- vapply(user, function(c) paste(deparse(c[[1L]], nlines = 1L), collapse = ""), "")
        user <- user[!fn %in% c(".handleSimpleError", "h", "stop", "signalCondition", "doWithOneRestart", "withOneRestart",
                                 "withRestarts", ".signalSimpleWarning", "simpleError", "warning", "stopifnot", "eval", "withVisible",
                                 "tryCatch", "tryCatchList", "tryCatchOne", "doTryCatch", "withCallingHandlers", "orig") &
                     !grepl("^\\(?function", fn)]
        if (length(user) >= 2L) tb <- paste0(seq_along(user), ". ", vapply(user, wb$fmt_call, ""), collapse = "\n")
      }
    }
    wb$mark("error", c("Error", msg, head, tb, wb$hint(msg, code)))
  }
  wb$parse_error <- function(e, code) {
    msg <- conditionMessage(e)
    m <- regmatches(msg, regexec("^<text>:([0-9]+):([0-9]+): ([^\n]*)", msg))[[1L]]
    if (length(m) == 4L) {
      rest <- sub("^[^\n]*\n?", "", msg)
      evalue <- sprintf("%s (line %s)", m[4L], m[2L])
      head <- paste0("Error: ", m[4L], " in line ", m[2L], if (nzchar(rest)) paste0(":\n", rest) else "")
    } else {
      evalue <- msg
      head <- paste0("Error: ", msg)
    }
    wb$mark("error", c("Error", evalue, head, "", wb$hint(msg, code)))
  }

  ## ---- plots: 7 x 5 inches, or options(repr.plot.width, repr.plot.height) as with IRkernel --------
  wb$size <- function() {
    px <- c(width = as.numeric(tw$fig[["width"]]), height = as.numeric(tw$fig[["height"]]))
    w <- getOption("repr.plot.width")
    h <- getOption("repr.plot.height")
    if (is.numeric(w) && length(w) == 1L && is.finite(w) && w > 0) px[["width"]] <- min(w, 40) * 72
    if (is.numeric(h) && length(h) == 1L && is.finite(h) && h > 0) px[["height"]] <- min(h, 40) * 72
    round(px)
  }
  wb$device <- function(width = NULL, height = NULL, pointsize = 12, bg = "white", ...) {
    px <- wb$size()
    # (dev.new(width = 6, height = 4): inches)
    if (is.numeric(width) && length(width) == 1L) px[["width"]] <- round(if (width <= 50) width * 72 else width)
    if (is.numeric(height) && length(height) == 1L) px[["height"]] <- round(if (height <= 50) height * 72 else height)
    wb$devsize <- px
    tw$canvas(width = px[["width"]], height = px[["height"]], pointsize = pointsize, bg = bg)
  }
  # (a plot that is open keeps its size: after the size was changed, the next plot opens at the new size)
  wb$check_size <- function() {
    if (is.null(wb$devsize) || grDevices::dev.cur() <= 1L) return(invisible(NULL))
    if (!isTRUE(all.equal(as.numeric(wb$size()), as.numeric(wb$devsize)))) {
      d <- grDevices::dev.list()
      for (i in d[names(d) == "canvas"]) grDevices::dev.off(i)
      wb$devsize <- NULL
    }
    invisible(NULL)
  }

  ## ---- a cell ----------------------------------------------------------------------------
  # (R works in the notebook's folder: when another notebook – in another folder – runs a cell, R moves there;
  # otherwise it stays where setwd() put it, as Jupyter's kernel does)
  wb$run <- function(code = NULL, cwd = NULL, file = NULL) {
    if (!is.null(file)) {
      code <- paste(readLines(file, encoding = "UTF-8", warn = FALSE), collapse = "\n")
      unlink(file)
    }
    if (!is.null(cwd) && !identical(cwd, wb$lastcwd)) {
      wb$lastcwd <- cwd
      if (dir.exists(cwd)) setwd(cwd)
    }
    status <- 1L
    on.exit({
      wb$mark("cwd", c(wb$lastcwd, tryCatch(getwd(), error = function(e) "")))
      wb$mark("status", status)
    }, add = TRUE)
    exprs <- tryCatch(parse(text = code, keep.source = TRUE), error = function(e) e)
    if (inherits(exprs, "error")) {
      wb$parse_error(exprs, code)
      return(invisible(FALSE))
    }
    ok <- TRUE
    tryCatch({
      for (.wb_e in exprs) {
        wb$check_size()
        tryCatch(
          withCallingHandlers({
            res <- withVisible(eval(.wb_e, envir = globalenv()))
            if (res$visible) wb$show(res$value)
          },
          error = function(e) wb$calls <- sys.calls(),
          warning = function(w) {
            lv <- getOption("warn", 0)
            # (warn = 2: R makes the warning an error)
            if (is.numeric(lv) && length(lv) == 1L && lv >= 2) return()
            if (!(is.numeric(lv) && length(lv) == 1L && lv < 0)) {
              cl <- wb$call_of(w)
              cat(if (!nzchar(cl)) "Warning message:\n" else paste0("Warning message in ", cl, ":\n"),
                  "“", conditionMessage(w), "”\n", sep = "", file = stderr())
            }
            invokeRestart("muffleWarning")
          },
          message = function(m) {
            # (message() ends its text with a new line, unless asked not to; rlang's and cli's messages leave it to the
            # handler)
            msg <- conditionMessage(m)
            if (!inherits(m, "simpleMessage") && !endsWith(msg, "\n")) msg <- paste0(msg, "\n")
            cat(msg, sep = "", file = stderr())
            invokeRestart("muffleMessage")
          }),
          error = function(e) {
            ok <<- FALSE
            wb$report(e, code)
          })
        if (!ok) break
        # (a plot may be complete: what is printed from now on comes after it)
        if (grDevices::dev.cur() > 1L) wb$mark("step")
      }
    }, interrupt = function(i) {
      ok <<- FALSE
      wb$mark("interrupted")
    })
    if (ok) status <- 0L
    invisible(ok)
  }

  ## ---- the Variables list ----------------------------------------------------------------
  wb$vars <- function() {
    env <- globalenv()
    nm <- ls(env)
    if (!length(nm)) return(character(0))
    vapply(nm, function(n) {
      if (bindingIsActive(n, env)) return(paste(n, "active binding", "", sep = "\t"))
      x <- tryCatch(get(n, envir = env), error = function(e) NULL)
      cls <- paste(class(x), collapse = "/")
      d <- tryCatch(
        if (is.data.frame(x)) sprintf("%s rows × %d columns", format(nrow(x), big.mark = ","), ncol(x))
        else if (is.function(x)) paste0("function(", paste(names(formals(x)), collapse = ", "), ")")
        else if (is.matrix(x)) sprintf("%s × %s matrix", format(nrow(x), big.mark = ","), format(ncol(x), big.mark = ","))
        else if (is.atomic(x) && length(x) == 1L && is.null(attributes(x))) substr(paste(format(x), collapse = ""), 1L, 80L)
        else tw$oneline(x, 80L),
        error = function(e) "")
      paste(n, cls, gsub("[\t\n]", " ", d), sep = "\t")
    }, "")
  }

  ## ---- what the notebook does differently from R's console -------------------------------
  e <- new.env()
  e$wb <- wb
  e$.wb_run <- function(code = NULL, cwd = NULL, file = NULL) invisible(wb$run(code, cwd, file))
  e$.wb_vars <- function() wb$vars()
  # (View(): the data as a table under the cell)
  e$View <- function(x, title) {
    if (missing(title)) title <- paste(deparse(substitute(x), width.cutoff = 500L), collapse = " ")
    d <- if (is.data.frame(x)) x else if (is.matrix(x)) as.data.frame(x) else NULL
    if (!is.null(d) && wb$table(d, n = 1000L, title = title)) return(invisible(NULL))
    print(x)
    invisible(NULL)
  }
  e$quit <- e$q <- function(save = "default", status = 0, runLast = TRUE) {
    stop("quit() does not end the notebooks' R session. To start again with an empty memory, use the Restart button above the notebook.", call. = FALSE)
  }
  e$system <- e$system2 <- e$shell <- function(...) {
    stop("R cannot run other programs here, because in the browser it has no shell. Run the command in the Terminal tab instead.", call. = FALSE)
  }
  # (where the page is not cross-origin isolated, R cannot wait for an answer: readline() says so, and gets "")
  if (!isTRUE(tw$can_block)) e$readline <- function(prompt = "") {
    cat(prompt, "\n", sep = "")
    message("(readline() cannot wait for your answer in this browser, because the page is not cross-origin isolated. It returns an empty answer, \"\", instead.)")
    ""
  }
  attach(e, name = "workbench", warn.conflicts = FALSE)
  options(device = wb$device)
}, envir = new.env(parent = .BaseNamespaceEnv))
`;

  /** a marked line (\x01WB:kind\x01fields) → {kind, fields}, or null */
  function parseMark(s) {
    const m = /^\x01WB:(\w+)\x01([^\n]*)$/.exec(s);
    if (!m) return null;
    return { kind: m[1], fields: m[2].split('\x03').map((f) => f.replace(/\x02/g, '\n')) };
  }

  /* ------------------------------------------------------------------
     the kernel
     ------------------------------------------------------------------ */
  class RKernel {
    constructor() {
      this.lang = 'r';
      this.label = 'R';
      this.state = 'off'; // off · loading · ready · failed · ended
      this.statusText = '';
      this.versions = null;
      this.S = null; // the R session
      this.gen = 0; // a new R each time it (re)starts
      this.readyPromise = null;
      this.jobs = Promise.resolve();
      this.cur = null; // the cell that runs
      this._waiters = new Set(); // cells that wait for R to start
      this._idleWaiters = new Set(); // a cell that waits for R to finish what it does
      this.pages = new Map(); // a canvas device's id → its current page {pc, cur, dirty, settled}
      this.where = null; // {folder, cwd}: the notebook's folder of the last cell, and R's working directory after it
    }
    get busy() {
      return !!this.cur;
    }
    get waitingInput() {
      return !!(this.cur && this.cur.input);
    }
    /** start R if it is not running → a promise: R is ready. cwd: the folder R starts in (the notebook's) */
    ensure(cwd) {
      if (this.state === 'off' || this.state === 'failed' || this.state === 'ended') this.start(cwd);
      return this.readyPromise;
    }
    ready() {
      return this.ensure();
    }
    _status(text, bad) {
      this.statusText = text || '';
      bus.emit('kernel:status', { lang: 'r', text: this.statusText, bad: !!bad });
    }
    _setState(state, extra) {
      this.state = state;
      bus.emit('kernel:state', Object.assign({ lang: 'r', state }, extra || {}));
    }
    start(cwd) {
      const gen = ++this.gen;
      const dir = cwd && MG.app && MG.app.fs && MG.app.fs.isDir(cwd) ? cwd : HOME();
      const S = new MG.R.Session({ kind: 'notebook', banner: false, graphics: 'canvas', interactive: true, cwd: dir, sync: true, setup: R_SETUP });
      this.S = S;
      this.pages = new Map();
      this.where = null;
      this._setState('loading');
      this._status('Starting R…');
      const mine = (fn) => (d) => {
        if (this.S === S) fn(d);
      };
      S.on('state', mine((d) => {
        if (d.state === 'starting') this._status(d.text || 'Starting R…');
        else if (this.state === 'ready') bus.emit('kernel:status', { lang: 'r', text: '', busy: d.state !== 'idle' });
      }));
      S.on('output', mine((d) => this._output(d)));
      S.on('plot', mine((d) => this._plot(d)));
      S.on('echo', mine((d) => this.cur && d.silent && d.line === this.cur.line && (this.cur.fed = true)));
      S.on('prompt', mine((d) => this._prompt(d)));
      S.on('idle', mine(() => this.cur && this.cur.fed && this._finish()));
      S.on('rerror', mine(() => this.cur && (this.cur.ok = false)));
      S.on('pager', mine((d) => this.cur && d.text && this._text((d.text.endsWith('\n') ? d.text : d.text + '\n'), 'stdout')));
      S.on('browse', mine((d) => MG.app && MG.app.browse && MG.app.browse(d.url, { from: 'notebook' })));
      S.on('edit', mine((d) => MG.app && MG.app.editFile && MG.app.editFile(d.file)));
      S.on('ended', mine((d) => this._ended(d)));
      this.readyPromise = S.start().then(async () => {
        if (gen !== this.gen) throw new Error('R was restarted');
        this.versions = S.versions;
        // (plots are 7 × 5 inches: R's device has 72 pixels to the inch; the page shows them at 96 to the inch)
        await S.figSize(504, 360);
        this._status('');
        this._setState('ready', { versions: this.versions });
        return this.versions;
      });
      this.readyPromise.catch((e) => {
        if (gen !== this.gen) return;
        this._setState('failed', { message: (e && e.message) || String(e) });
        this._status('R could not start: ' + ((e && e.message) || e), true);
      });
      return this.readyPromise;
    }

    /* ---------------- running a cell ---------------- */
    /** run a cell's code in the notebook's folder → {ok, secs, interrupted?, restarted?, ended?}.
        handlers: onOutput(o) – an output for the notebook ({type:'stream'|'display'|'error', …});
        onInput(req) – R asks for an answer (readline(), menu(), browser()): req = {prompt, kind, answer(text)};
        onInputEnd(req) – that question is over (answered, or the cell was stopped) */
    async run(code, handlers = {}, cwd) {
      const ready = this.ensure(cwd);
      const gen = this.gen;
      // (R restarted while this cell waited for it to start: the cell does not run)
      let stop = null;
      const restarted = new Promise((resolve) => {
        stop = () => resolve('restarted');
        this._waiters.add(stop);
      });
      try {
        const r = await Promise.race([ready.then(() => 'ready'), restarted]);
        if (r === 'restarted' || gen !== this.gen) return { ok: false, secs: 0, restarted: true };
      } catch (e) {
        if (gen !== this.gen) return { ok: false, secs: 0, restarted: true };
        throw e;
      } finally {
        this._waiters.delete(stop);
      }
      return this._queued(() => this._run(String(code), handlers, cwd || HOME()));
    }
    _queued(fn) {
      const job = this.jobs.then(fn);
      this.jobs = job.catch(() => {});
      return job;
    }
    async _run(code, handlers, cwd) {
      const S = this.S;
      if (!S || S.closed || this.state !== 'ready') return { ok: false, secs: 0, ended: true };
      await this._whenIdle(S);
      if (S !== this.S || S.closed) return { ok: false, secs: 0, restarted: true };
      let line = `.wb_run(${rstr(code)}, ${rstr(cwd)})`;
      if (utf8Len(line) > MAX_LINE) {
        const file = `/tmp/.wb_cell_${Date.now()}.R`;
        await S.whenIdle((W) => W.FS.writeFile(file, new TextEncoder().encode(code)));
        line = `.wb_run(file = ${rstr(file)}, cwd = ${rstr(cwd)})`;
      }
      return new Promise((resolve) => {
        this.cur = { S, line, handlers, resolve, t0: performance.now(), ok: true, fed: false, buf: '', input: null, interrupted: false };
        S.send(line, { silent: true });
      });
    }
    /** → a promise: R waits at its prompt (or this R was closed – a restart ends the wait too) */
    _whenIdle(S) {
      if (S.idle || S.closed) return Promise.resolve();
      return new Promise((resolve) => {
        const offs = [];
        const done = () => {
          offs.forEach((f) => f());
          this._idleWaiters.delete(done);
          resolve();
        };
        offs.push(S.on('idle', done), S.on('ended', done));
        this._idleWaiters.add(done);
      });
    }
    _emit(o) {
      const C = this.cur;
      if (C && C.handlers.onOutput) C.handlers.onOutput(o);
    }
    /** text for the cell: a picture that is complete comes first */
    _text(text, name) {
      if (!text) return;
      this._flushPlots(name === 'stdout' ? 'all' : 'settled');
      this._emit({ type: 'stream', name, text });
    }
    /* R's standard output is read in whole lines, for the marks; what has no new line yet is shown at once – unless it
       may be the start of a mark */
    _output(d) {
      const C = this.cur;
      if (!C) return;
      if (d.stream === 'err') return this._text(d.text, 'stderr');
      C.buf += d.text;
      let i;
      while ((i = C.buf.indexOf('\n')) >= 0) {
        const line = C.buf.slice(0, i);
        C.buf = C.buf.slice(i + 1);
        this._line(line);
      }
      const at = C.buf.indexOf('\x01');
      if (at < 0) {
        this._text(C.buf, 'stdout');
        C.buf = '';
      } else {
        if (at > 0) {
          this._text(C.buf.slice(0, at), 'stdout');
          C.buf = C.buf.slice(at);
        }
        if (!'\x01WB:'.startsWith(C.buf.slice(0, 4))) {
          this._text(C.buf, 'stdout');
          C.buf = '';
        }
      }
    }
    _line(line) {
      const at = line.indexOf('\x01WB:');
      const mk = at >= 0 ? parseMark(line.slice(at)) : null;
      if (!mk) return this._text(line + '\n', 'stdout');
      // (what was printed last without a new line – cat("done") – is on the line of the mark)
      if (at > 0) this._text(line.slice(0, at), 'stdout');
      this._mark(mk);
    }
    _mark(mk) {
      const C = this.cur;
      const f = mk.fields;
      switch (mk.kind) {
        case 'html':
          this._flushPlots('all');
          this._emit({ type: 'display', mime: 'text/html', data: f[0] || '', plain: f[1] || '' });
          break;
        case 'error': {
          C.ok = false;
          this._flushPlots('all');
          const [ename, evalue, head, tb, hint] = f;
          this._emit({ type: 'error', ename: ename || 'Error', evalue: evalue || '', traceback: (head || '') + (tb ? '\nTraceback:\n' + tb : ''), hints: hint ? [hint] : [] });
          break;
        }
        case 'interrupted':
          C.ok = false;
          C.interrupted = true;
          this._flushPlots('all');
          this._emit({ type: 'stream', name: 'stderr', text: 'Interrupted: the cell was stopped before it finished. Anything it had created so far is kept.\n' });
          break;
        case 'cwd':
          this.where = { folder: f[0] || '', cwd: f[1] || '' };
          break;
        case 'status':
          if (f[0] !== '0') C.ok = false;
          break;
        case 'step':
          for (const pg of this.pages.values()) if (pg.cur === C && pg.dirty) pg.settled = true;
          break;
        default:
          break;
      }
    }

    /* ---------------- plots ---------------- */
    /* Each page of R's canvas device is one picture: it is shown when the next page begins, when the cell prints
       something after it, or when the cell ends – so plot() and then abline() make one picture. A plot of an
       earlier cell that a cell draws on (abline() on its own) is shown again, with what was added. */
    _plot(d) {
      const C = this.cur;
      if (d.kind === 'new') {
        this._flushPage(d.id);
        this.pages.set(d.id, { pc: new MG.PlotCanvas(1008, 720), cur: C, dirty: false, settled: false });
        return;
      }
      let pg = this.pages.get(d.id);
      if (!pg) {
        pg = { pc: new MG.PlotCanvas(1008, 720), cur: C, dirty: false, settled: false };
        this.pages.set(d.id, pg);
      }
      pg.pc.draw(d.image);
      if (C) {
        pg.cur = C;
        pg.dirty = true;
        pg.settled = false;
      }
    }
    _flushPage(id) {
      const pg = this.pages.get(id);
      if (!pg || !pg.dirty || !pg.cur || pg.cur !== this.cur) return;
      pg.dirty = false;
      pg.settled = false;
      const c = pg.pc.canvas;
      const data = pg.pc.png().replace(/^data:image\/png;base64,/, '');
      // (the picture has 2 pixels for each of R's: shown at 96 to the inch, it is 2/3 of its width in pixels)
      this._emit({ type: 'display', mime: 'image/png', data, width: Math.round(c.width / 1.5), height: Math.round(c.height / 1.5) });
    }
    /** which: 'all' – every picture the cell drew on; 'settled' – those whose drawing has finished */
    _flushPlots(which) {
      for (const [id, pg] of this.pages) if (pg.dirty && pg.cur === this.cur && (which === 'all' || pg.settled)) this._flushPage(id);
    }

    /* ---------------- questions, the end of a cell ---------------- */
    _prompt(d) {
      const C = this.cur;
      if (!C || !C.fed) return;
      this._endInput();
      if (d.kind === 'input' || d.kind === 'browser') {
        // (what R printed before it asks – menu()'s choices – is shown first)
        if (C.buf) {
          const rest = C.buf;
          C.buf = '';
          this._text(rest, 'stdout');
        }
        this._flushPlots('all');
        const req = {
          prompt: d.prompt,
          kind: d.kind,
          answered: false,
          answer: (text) => {
            if (req.answered || C !== this.cur) return;
            req.answered = true;
            C.input = null;
            C.S.send(String(text == null ? '' : text).replace(/[\r\n]+/g, ' '), { silent: true });
          }
        };
        C.input = req;
        if (C.handlers.onInput) C.handlers.onInput(req);
        else req.answer('');
        bus.emit('kernel:status', { lang: 'r', text: '', input: true });
      } else if (d.kind === 'continue') {
        // (R waits for the rest of a command: it should never here – the line was not read whole)
        this._emit({ type: 'stream', name: 'stderr', text: 'R did not receive the whole cell, so the cell was stopped.\n' });
        C.ok = false;
        if (!C.S.interrupt()) C.S.send(')', { silent: true });
      }
    }
    _endInput() {
      const C = this.cur;
      if (!C || !C.input) return;
      const req = C.input;
      C.input = null;
      req.answered = true;
      if (C.handlers.onInputEnd) C.handlers.onInputEnd(req);
    }
    _finish(extra) {
      const C = this.cur;
      if (!C) return;
      this._endInput();
      if (C.buf) {
        const rest = C.buf;
        C.buf = '';
        const mk = parseMark(rest);
        if (mk) this._mark(mk);
        else this._text(rest, 'stdout');
      }
      this._flushPlots('all');
      this.cur = null;
      const res = Object.assign({ ok: C.ok, secs: (performance.now() - C.t0) / 1000, interrupted: C.interrupted }, extra || {});
      if (extra && extra.ok === false) res.ok = false;
      C.resolve(res);
      bus.emit('kernel:status', { lang: 'r', text: '', busy: false });
    }
    _ended(d) {
      const C = this.cur;
      if (C) {
        this._emit({ type: 'error', ename: 'R stopped', evalue: (d && d.why) || '', traceback: 'R has stopped' + (d && d.why ? ': ' + d.why : '.') + ' Run the cell again to start a new R session (it will have an empty memory).', hints: [] });
        this._finish({ ok: false, ended: true });
      }
      this.S = null;
      this.pages = new Map();
      this._setState('ended', { why: (d && d.why) || '' });
    }

    /* ---------------- stopping, restarting ---------------- */
    /** stop the running cell (R keeps its variables) → false where R cannot be interrupted (the page is not
        cross-origin isolated) */
    interrupt() {
      const C = this.cur;
      if (!C || !this.S) return true;
      const ok = this.S.interrupt();
      if (ok) C.interrupted = true;
      return ok;
    }
    /** the cells that wait for R to start do not run */
    cancelWaiting() {
      for (const done of Array.from(this._waiters)) done();
    }
    /** a new R: the old one is closed with everything in its memory. cwd: the folder the new one starts in */
    restart(cwd) {
      const S = this.S;
      this.S = null;
      if (this.cur) this._finish({ ok: false, restarted: true });
      for (const done of Array.from(this._waiters).concat(Array.from(this._idleWaiters))) done();
      this.jobs = Promise.resolve();
      if (S) S.close(true);
      this.state = 'off';
      const p = this.start(cwd);
      bus.emit('kernel:state', { lang: 'r', state: 'restarted' });
      return p;
    }

    /* ---------------- for the Variables list and other tabs ---------------- */
    /** the variables of R's global environment: [{name, type, desc}] – or null while R is busy */
    async vars() {
      const S = this.S;
      if (!S || this.state !== 'ready') return [];
      if (!S.idle) return null;
      let lines;
      try {
        lines = await S.evalLines('.wb_vars()');
      } catch (e) {
        return [];
      }
      if (lines == null) return null;
      return lines.filter(Boolean).map((l) => {
        const [name, type, desc] = l.split('\t');
        return { name, type, desc: desc || '' };
      });
    }
    /** the files R wrote → the page (they are copied after every cell; this is for the times in between) */
    async syncFiles() {
      const S = this.S;
      if (!S || this.state !== 'ready' || !S.idle) return;
      await S.whenIdle(() => S.sync.pull());
    }
    describe() {
      const v = this.versions || {};
      return `R ${v.r || ''} (webR ${v.webr || ''}) in your browser`;
    }
  }

  /* ------------------------------------------------------------------
     the registry: the notebook's languages – R only
     ------------------------------------------------------------------ */
  const isR = (lang) => lang == null || /^r$/i.test(String(lang));
  let rKernel = null;
  const kernels = {
    LANGS: {
      r: {
        label: 'R',
        ext: '.R',
        cm: 'r',
        kernelspec: { name: 'ir', display_name: 'R', language: 'R' },
        language_info: { name: 'R', codemirror_mode: 'r', file_extension: '.r', mimetype: 'text/x-r-source', pygments_lexer: 'r' }
      }
    },
    isR,
    /** the kernel of a language, made (not started) the first time – R's; null for another language */
    get(lang) {
      if (!isR(lang)) return null;
      if (!rKernel) rKernel = new RKernel();
      return rKernel;
    },
    /** the kernel if it was made, else null */
    peek(lang) {
      return isR(lang) ? rKernel : null;
    },
    /** the files the notebook's R wrote: into the page's files */
    async syncAll() {
      if (rKernel) await rKernel.syncFiles().catch(() => {});
    }
  };
  MG.kernels = kernels;
  MG.RKernel = RKernel;
})();
