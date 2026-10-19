/* =====================================================================
   R in the terminal, as on a computer:

     Rscript script.R [args]      runs a script in a new R and ends; what
     Rscript -e 'code'            it prints comes to the terminal, an
                                  error stops it ("Execution halted",
                                  exit status 1); plots go to Rplots.pdf
     R CMD BATCH script.R [out]   runs a script and keeps a record of the
                                  run – commands and output – in
                                  script.Rout; saves the workspace (.RData)
     R                            R's console in the terminal, until q()
     R -e 'code', R -f file, R --no-save < script.R
                                  R reading commands without a person: the
                                  commands are shown with their output

   Each run is an R of its own (rsession.js): what it makes in memory is
   gone when it ends – only its files stay. The files are those of the
   workbench: R starts in the terminal's folder.
   ===================================================================== */
(function () {
  'use strict';
  const MG = window.MG;
  const T = (MG.shellTools = MG.shellTools || {});
  const rstr = (s) => MG.R.rstr(s);
  const ver = () => (MG.R.versions && MG.R.versions.r) || '4.6.0';
  const verString = () => (MG.R.versions && MG.R.versions.string) || `R version ${ver()}`;

  /** what is typed on R's command line → {opts, file, exprs, args, rest, bad} (options as R takes them) */
  function parseArgs(args, rscript) {
    const o = { exprs: [], args: [], file: null, echo: null, save: null, restore: null, quiet: false, version: false, help: false, bad: null, cmd: null, ignored: [] };
    for (let i = 0; i < args.length; i++) {
      const a = args[i];
      if (o.file != null && rscript) {
        // (Rscript FILE ARGS…: what follows the file is the script's)
        o.args.push(a);
        continue;
      }
      if (a === '--args') {
        o.args.push(...args.slice(i + 1));
        break;
      }
      if (a === '-e') {
        if (i + 1 >= args.length) {
          o.bad = rscript ? 'Rscript: -e not followed by an expression' : 'R: -e not followed by an expression';
          break;
        }
        o.exprs.push(args[++i]);
      } else if (a === '--version') o.version = true;
      else if (a === '--help' || a === '-h') o.help = true;
      else if (a === '-f' || a === '--file') o.file = args[++i] || '';
      else if (/^--file=/.test(a)) o.file = a.slice(7);
      else if (a === '--vanilla') {
        o.save = false;
        o.restore = false;
      } else if (a === '--save') o.save = true;
      else if (a === '--no-save') o.save = false;
      else if (a === '--restore') o.restore = true;
      else if (a === '--no-restore' || a === '--no-restore-data') o.restore = false;
      else if (a === '-q' || a === '--quiet' || a === '--silent') o.quiet = true;
      else if (a === '--no-echo' || a === '--slave' || a === '-s') {
        o.echo = false;
        o.quiet = true;
      } else if (/^--(no-environ|no-site-file|no-init-file|no-restore-history|no-readline|interactive|verbose|default-packages=.*|encoding=.*|min-vsize=.*|max-vsize=.*|min-nsize=.*|max-nsize=.*|max-ppsize=.*|max-connections=.*)$/.test(a)) o.ignored.push(a);
      else if (!rscript && a === 'CMD') {
        o.cmd = args.slice(i + 1);
        break;
      } else if (a.startsWith('-') && a !== '-') {
        o.bad = rscript ? `Rscript: unknown option '${a}'` : `WARNING: unknown option '${a}'`;
        if (!rscript) continue;
        break;
      } else if (rscript && !o.exprs.length) o.file = a;
      else if (rscript) o.args.push(a);
      else {
        // (R takes an argument that is no option for an unknown one, and carries on)
        o.ignored.push(a);
      }
    }
    return o;
  }

  /** ask the terminal's own R session, if there is one, to stop; and say what was asked */
  function notes(ctx, o) {
    const idle = Array.from(new Set(o.ignored.filter((x) => /^--(verbose|interactive)$/.test(x))));
    if (idle.length) ctx.io.note(`${idle.join(' and ')} ${idle.length > 1 ? 'are' : 'is'} accepted, but ${idle.length > 1 ? 'they have' : 'it has'} no effect here.`);
  }

  /** what an R that runs without a person reads: the lines of a script, fed to it one by one → the exit status.
      o: {code, kind, echo (show the commands with their prompts, as R -f and R CMD BATCH do), banner, args,
      restore, save, out(text), err(text), atEnd(S) (R CMD BATCH: proc.time()), name (for the terminal's status line)} */
  async function runR(ctx, o) {
    const term = ctx.term;
    const status = (t) => term && term.statusEl && (term.statusEl.innerHTML = t ? `<span class="spinner small"></span> ${MG.esc(t)}` : '');
    status(`${o.name}: starting R…`);
    let S;
    try {
      S = await MG.R.fresh({ kind: o.kind, banner: !!o.banner, graphics: 'pdf', interactive: false, cwd: ctx.fs.isDir(ctx.fs.cwd) ? ctx.fs.cwd : ctx.fs.home, args: o.args && o.args.length ? o.args : null, sync: true });
    } catch (e) {
      ctx.err(`${o.name}: R could not start: ${(e && e.message) || e}\n`);
      status('');
      return 2;
    }
    status(`${o.name}: running`);
    S.haltOnError = true;
    // (R's banner: printed when R started – which may have been a while ago, for an R made ready in advance)
    if (o.banner && S.bannerText) o.out(S.bannerText);
    if (o.restore) {
      const had = await S.whenIdle((W) => W.evalRRaw('if (file.exists(".RData")) { load(".RData", envir = globalenv()); TRUE } else FALSE', 'boolean'));
      if (had && o.banner) o.out('[Previously saved workspace restored]\n\n');
    }
    return new Promise((resolve) => {
      const offs = [];
      let errored = false, done = false, fed = false;
      const finish = async (code, opts = {}) => {
        if (done) return;
        done = true;
        offs.forEach((f) => f());
        if (term && term.job === job) term.job = null;
        if (!S.closed && !opts.killed) {
          try {
            await S._job(async () => {
              if (o.atEnd && !opts.quit) await o.atEnd(S, code);
              // (R closes its graphics devices when it ends: Rplots.pdf is written then)
              await S.webR.evalRVoid('grDevices::graphics.off()');
              await S.sync.pull();
            });
          } catch (e) {
            /* (R stopped) */
          }
          S.close(true);
        }
        status('');
        resolve(code);
      };
      const job = {
        stop: () => {
          S.close(true);
          finish(130, { killed: true });
        }
      };
      if (term) term.job = job;
      offs.push(S.on('output', (d) => (d.stream === 'err' ? o.err : o.out)(d.text)));
      if (o.echo) offs.push(S.on('echo', (d) => o.out(d.prompt + d.line + '\n')));
      offs.push(S.on('rerror', () => (errored = true)));
      offs.push(
        S.on('prompt', (d) => {
          if (!fed) return;
          if (d.kind === 'input' || d.kind === 'browser') {
            // (without a person, readline() and the like get an empty answer, as in R that is not interactive)
            if (!o.echo) o.out(d.prompt + '\n');
            S.send(d.kind === 'browser' ? 'Q' : '', { silent: !o.echo });
          } else if (d.kind === 'continue' && !S.pending().length) {
            // the script ended in the middle of a statement
            o.err(o.echo ? '\nError: unexpected end of input\n' : 'Error: unexpected end of input\n');
            errored = true;
            S.clearQueue();
            o.err('Execution halted\n');
            finish(1);
          }
        })
      );
      offs.push(
        S.on('idle', () => {
          if (!fed) return;
          if (errored) o.err('Execution halted\n');
          finish(errored ? 1 : 0);
        })
      );
      offs.push(S.on('ended', (d) => finish(d && d.quit ? Number(d.quit.status) || 0 : 1, { quit: true })));
      fed = true;
      const code = String(o.code || '').replace(/\r\n?/g, '\n').replace(/\n+$/, '');
      if (!code.trim()) {
        finish(0);
        return;
      }
      S.send(code, { silent: !o.echo });
    });
  }

  /** the text of a script (FILE, or - for the input) → text, or an exit status after the message */
  async function scriptText(ctx, file, who) {
    if (file === '-' || file === '/dev/stdin') return MG.shellUtil.inputOf(ctx, [], who);
    const e = ctx.fs.get(file);
    if (!e || e.kind === 'dir') {
      ctx.err(who === 'Rscript' ? `Fatal error: cannot open file '${file}': ${e ? 'Is a directory' : 'No such file or directory'}\n` : `Fatal error: cannot open file '${file}': No such file or directory\n`);
      return 2;
    }
    return ctx.fs.readText(file);
  }

  /* ------------------------------------------------------------------ Rscript */
  T.Rscript = {
    get version() {
      return ver();
    },
    summary: 'Runs an R script (or R code given with -e) in a new R session, prints its output in the terminal and then ends',
    man: 'Rscript – run an R script from the terminal\n\nRscript script.R                 run the script in a new R session; its output appears here\nRscript script.R a b             … with arguments: commandArgs(trailingOnly = TRUE) gives "a" "b"\nRscript -e \'mean(1:10)\'          run a line of R\nRscript -e \'x <- 1:3\' -e \'x * 2\'  run several lines\n\nAn error stops the script ("Execution halted", exit status 1). Plots are saved to Rplots.pdf in the current folder (or to the file you name in png(), pdf() and so on). Anything the script creates in memory is lost when it ends, so write your results to files.',
    async run(ctx) {
      const o = parseArgs(ctx.args, true);
      if (o.version) {
        ctx.out(`Rscript (R) version ${ver()} (${((MG.R.versions && MG.R.versions.string) || '').replace(/^.*\((\d{4}-\d{2}-\d{2})\).*$/, '$1') || '2026-04-24'})\n`);
        return 0;
      }
      if (o.help || (!o.file && !o.exprs.length && !o.bad)) {
        ctx.out(`Usage: Rscript [options] file [args]\n   or: Rscript [options] -e expr [-e expr2 ...] [args]\nA binary front-end to R, for use in scripting applications.\n\nOptions:\n  --help              Print usage and exit\n  --version           Print version and exit\n  --verbose           Print information on progress\n  --default-packages=LIST  Attach these packages on startup;\n                        a comma-separated LIST of package names, or 'NULL'\nand options to R (in addition to --no-echo --no-restore), for example:\n  --save              Do save workspace at the end of the session\n  --no-environ        Don't read the site and user environment files\n  --no-site-file      Don't read the site-wide Rprofile\n  --no-init-file      Don't read the user R profile\n  --restore           Do restore previously saved objects at startup\n  --vanilla           Combine --no-save, --no-restore, --no-site-file,\n                        --no-init-file and --no-environ\n\nExpressions (one or more '-e <expr>') may be used *instead* of 'file'.\nAny additional 'args' can be accessed from R via 'commandArgs(TRUE)'.\n\nExamples:\n  Rscript -e 'date()' -e 'format(Sys.time(), "%a %b %d %X %Y")'\n  Rscript foo.R arg1 arg2\n`);
        return o.help ? 0 : 1;
      }
      if (o.bad) {
        ctx.err(o.bad + '\n');
        return 1;
      }
      notes(ctx, o);
      let code;
      if (o.exprs.length) code = o.exprs.join('\n');
      else {
        code = await scriptText(ctx, o.file, 'Rscript');
        if (typeof code === 'number') return code;
      }
      const shown = o.file || 'Rscript -e';
      bus().emit('rscript:start', { file: o.file ? ctx.fs.resolve(o.file) : null, exprs: o.exprs.length });
      const code0 = await runR(ctx, { code, kind: 'rscript', echo: false, banner: false, args: o.args, restore: o.restore === true, name: 'Rscript', out: ctx.out, err: ctx.err, atEnd: o.save ? (S) => S.webR.evalRVoid('save.image()') : null });
      bus().emit('rscript:done', { file: o.file ? ctx.fs.resolve(o.file) : null, code: code0, shown });
      return code0;
    }
  };

  /* ------------------------------------------------------------------ R */
  T.R = {
    get version() {
      return ver();
    },
    summary: "Starts R's console in the terminal (type q() to quit); R CMD BATCH script.R saves a record of a run in script.Rout",
    man: "R – the R console in the terminal\n\nR                              start R's console: type R code, and q() to quit (R asks whether to save the workspace)\nR -q                           … without the banner\nR CMD BATCH script.R           run the script, writing the commands and their output to script.Rout and the workspace to .RData\nR CMD BATCH --no-save script.R out.txt    … without saving the workspace, and with the record in out.txt\nR -e 'summary(1:10)'           run a line of R (the banner and the commands are shown as well)\nR --no-save < script.R         run the commands of a script as if they were typed\nR --version\n\nIn the terminal, R's plots are saved to Rplots.pdf, because the terminal has no window to show them in. To see plots as you work, use the R console or RStudio tab.",
    async run(ctx) {
      const o = parseArgs(ctx.args, false);
      if (o.cmd) return rcmd(ctx, o.cmd);
      if (o.version) {
        ctx.out(`${verString()} -- "${(MG.R.versions && MG.R.versions.nick) || ''}"`.replace(/ -- ""$/, '') + `\nCopyright (C) 2026 The R Foundation for Statistical Computing\nPlatform: wasm32-unknown-emscripten (32-bit)\n\nR is free software and comes with ABSOLUTELY NO WARRANTY.\nYou are welcome to redistribute it under the terms of the\nGNU General Public License versions 2 or 3.\nFor more information about these matters see\nhttps://www.gnu.org/licenses/.\n`);
        return 0;
      }
      if (o.help) {
        ctx.out(`Usage: R [options] [< infile] [> outfile]\n   or: R CMD command [arguments]\n\nStart R, a system for statistical computation and graphics, with the\nspecified options, or invoke an R tool via the 'R CMD' interface.\n\nOptions:\n  -h, --help            Print short help message and exit\n  --version             Print version info and exit\n  --save                Do save workspace at the end of the session\n  --no-save             Don't save it\n  --no-restore          Don't restore previously saved objects\n  --vanilla             Combine --no-save, --no-restore and others\n  -q, --quiet           Don't print startup message\n  --silent              Same as --quiet\n  --no-echo             Make R run as quietly as possible\n  --args                Skip the rest of the command line\n  -f FILE, --file=FILE  Take input from 'FILE'\n  -e EXPR               Execute 'EXPR' and exit\n\nCommands (R CMD …): BATCH – run R non-interactively with input from infile and\nplace output (stdout/stderr) in another file. (The other R CMD commands, such\nas INSTALL, build and check, are not available here. Install packages with\ninstall.packages() inside R.)\n`);
        return 0;
      }
      if (o.bad) ctx.err(o.bad + '\n');
      notes(ctx, o);
      // R reading commands without a person: -e, -f, or input that is not the keyboard (a pipe, < FILE)
      const piped = ctx.isPipedIn || !!ctx.stdinFrom;
      if (o.exprs.length || o.file != null || piped || !ctx.toCaller || !ctx.term) {
        let code;
        if (o.exprs.length) code = o.exprs.join('\n');
        else if (o.file != null) {
          code = await scriptText(ctx, o.file, 'R');
          if (typeof code === 'number') return code;
        } else {
          // (R that reads from a pipe or a file wants to know what to do with the workspace, as on a computer)
          if (o.save == null) {
            ctx.err("Fatal error: you must specify '--save', '--no-save' or '--vanilla'\n");
            return 2;
          }
          code = await MG.shellUtil.inputOf(ctx, [], 'R');
        }
        const echo = o.echo !== false;
        return runR(ctx, { code, kind: 'rcmd', echo, banner: !o.quiet, args: o.args, restore: o.restore !== false && !o.exprs.length, name: 'R', out: ctx.out, err: ctx.err, atEnd: async (S) => {
          if (echo) ctx.out('> \n');
          if (o.save) await S.webR.evalRVoid('save.image()');
        } });
      }
      return interactive(ctx, o);
    }
  };
  T.R.subcommands = ['CMD'];

  /** R's console in the terminal: the terminal's prompt is R's until q() */
  function interactive(ctx, o) {
    const term = ctx.term;
    return new Promise((resolve) => {
      const S = new MG.R.Session({ kind: 'rterm', banner: !o.quiet, graphics: 'pdf', interactive: true, cwd: ctx.fs.isDir(ctx.fs.cwd) ? ctx.fs.cwd : ctx.fs.home, restoreData: o.restore !== false, args: o.args.length ? o.args : null, sync: true });
      const hist = MG.store.get('rtermHistory', []);
      const prog = {
        prompt: '',
        title: 'R',
        history: Array.isArray(hist) ? hist.slice(-300) : [],
        line: (text) => {
          if (S.state === 'ended' || S.closed) return;
          if (text.trim()) MG.store.set('rtermHistory', prog.history.slice(-300));
          S.send(text);
          prog.prompt = '';
          term._renderPrompt();
        },
        interrupt: () => {
          if (!S.ready) return;
          if (S.idle || S.state === 'continue') {
            // (Ctrl+C at a prompt: the line is dropped, as in R's console)
            if (S.state === 'continue') S.interrupt();
            ctx.out('\n');
            return;
          }
          if (!S.interrupt()) term.note("R can't be interrupted in this browser, because the page is not cross-origin isolated. Wait until it has finished, or reload the page.");
        },
        complete: (line, cursor) => (S.idle ? S.complete(line, cursor) : null)
      };
      const offs = [];
      const done = (code) => {
        offs.forEach((f) => f());
        term.detach(prog);
        if (term.statusEl) term.statusEl.textContent = '';
        resolve(code);
      };
      offs.push(S.on('output', (d) => (d.stream === 'err' ? ctx.err(d.text) : ctx.out(d.text))));
      offs.push(
        S.on('prompt', (d) => {
          prog.prompt = d.prompt;
          term._renderPrompt();
        })
      );
      offs.push(
        S.on('state', (d) => {
          if (!term.statusEl) return;
          if (d.state === 'starting') term.statusEl.innerHTML = `<span class="spinner small"></span> ${MG.esc(d.text || 'Starting R…')}`;
          else term.statusEl.textContent = d.state === 'busy' ? 'R is running…' : 'R';
        })
      );
      offs.push(S.on('browse', (d) => MG.app && MG.app.browse && MG.app.browse(d.url, { from: 'terminal' })));
      offs.push(S.on('edit', (d) => MG.app && MG.app.editFile && MG.app.editFile(d.file)));
      offs.push(S.on('ended', (d) => done(d && d.quit ? Number(d.quit.status) || 0 : 1)));
      // (the files R wrote are the terminal's at each prompt; the terminal's files R's before each command – rsession)
      term.attach(prog);
      bus().emit('rterm:start', {});
      S.start().catch((e) => {
        ctx.err(`R could not start: ${(e && e.message) || e}\n`);
        done(2);
      });
    });
  }

  /** R CMD …: BATCH; the other tools of R are not here */
  async function rcmd(ctx, args) {
    const sub = args[0];
    if (!sub) {
      ctx.err('R CMD: a command is needed. The only one available here is BATCH, as in R CMD BATCH script.R\n');
      return 1;
    }
    if (sub !== 'BATCH') {
      ctx.err(`R CMD ${sub}: not available in this terminal.\n`);
      ctx.io.note(/^(INSTALL|build|check|REMOVE)$/.test(sub) ? 'Here, packages are installed from inside R with install.packages("NAME"). You can do this in any of the R sessions in the workbench: the console, RStudio, a notebook, or R in this terminal.' : 'The only R CMD tool available here is BATCH. R CMD BATCH script.R runs a script and keeps a record of the run in script.Rout.');
      return 1;
    }
    // R CMD BATCH [options] infile [outfile]
    const opts = [], files = [];
    let rargs = [];
    for (const a of args.slice(1)) {
      const m = /^--args(?:\s+([\s\S]*))?$/.exec(a);
      if (m) rargs = rargs.concat((m[1] || '').split(/\s+/).filter(Boolean));
      else if (a.startsWith('-') && !files.length) opts.push(a);
      else files.push(a);
    }
    if (!files.length) {
      ctx.err('no input file\n');
      return 1;
    }
    const infile = files[0];
    const o = parseArgs(opts, false);
    const outfile = files[1] || MG.path.basename(infile).replace(/\.[^.]*$/, '') + '.Rout';
    const code = await scriptText(ctx, infile, 'R CMD BATCH');
    if (typeof code === 'number') return code;
    const save = o.save !== false;
    let record = '';
    const add = (t) => (record += t);
    const t0 = performance.now();
    const status = await runR(ctx, {
      code,
      kind: 'batch',
      echo: true,
      banner: !o.quiet,
      args: rargs,
      restore: o.restore !== false,
      name: 'R CMD BATCH',
      out: add,
      err: add,
      atEnd: async (S, st) => {
        // (as R CMD BATCH: the workspace is saved, and the time the run took is the last thing in the record)
        if (st) return;
        add('> \n');
        if (save) await S.webR.evalRVoid('save.image()');
        const pt = await S.webR.evalRRaw('paste(utils::capture.output(print(proc.time())), collapse = "\\n")', 'string');
        add('> proc.time()\n' + pt + '\n');
      }
    });
    const out = ctx.fs.resolve(outfile);
    try {
      ctx.fs.writeText(out, record);
    } catch (e) {
      ctx.err(`R CMD BATCH: cannot write ${outfile}: ${e.message}\n`);
      return 1;
    }
    bus().emit('rbatch:done', { file: ctx.fs.resolve(infile), out, code: status, secs: (performance.now() - t0) / 1000 });
    return status;
  }

  const bus = () => MG.bus;
})();
