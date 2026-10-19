/* =====================================================================
   Settings for the statistics practicals of Biostatistics for Genomic
   Medicine (weeks 2 to 5).
   You can change these settings by editing this file and uploading it
   again; nothing else needs to change.
   Never put an API key in this file: anyone could copy it from a public site.
   ===================================================================== */
window.MG_CONFIG = {
  courseTitle: 'Biostatistics for Genomic Medicine',
  courseSubtitle: 'Statistics practicals, weeks 2 to 5, in your browser',

  /* The prefix for everything the pages save in the browser (files, ticks, answers, the student's name and
     settings). All the practicals on this site share it, so a student's files and name are the same in each
     week, and the report they start in one week is still there the next. It must be different from the prefix
     of any other site at the same address: all the GitHub Pages sites of one account share one address, and
     r-training uses 'rtr'. */
  storePrefix: 'sta',
  hostname: 'workbench',

  /* Model answers. 'after-try' shows a "Show answer" button under a question once the student has answered it
     (right or wrong); true shows it straight away; false never shows it (the answers are still in the page's
     source code, and adding ?answers to the address shows them). */
  showModelAnswers: 'after-try',

  /* Who runs the course: shown at the top of the landing page. */
  site: {
    department: 'Department of Genomic Medicine',
    institution: 'University of Cambridge',
    module: 'Biostatistics for Genomic Medicine',
    tutors: 'Tim Hearn and Leonardo Bottolo'
  },

  /* R in the browser (webR). Every R session in the page downloads R from here. It is about 30 MB, and the
     browser keeps a copy after the first download. R packages are downloaded from the webR repository when
     install.packages() asks for them. */
  webrBase: 'https://webr.r-wasm.org/v0.6.0/',
  rRepos: ['https://repo.r-wasm.org'],

  /* The WebAssembly programs used by the terminal in RStudio (GNU coreutils, grep, sed, awk and diff). */
  biowasmBase: 'assets/vendor/biowasm',

  /* The AI assistant. Each user enters their own API key in the assistant's settings. The key is kept in
     the browser tab's memory (or, if the user ticks "Remember", in the tab's session storage, which is
     cleared when the tab is closed). It is never stored in this file or on the server.
     liveProvider is the service offered first ('gemini', 'anthropic' or 'openai'), followed by the model
     used for each service. Models are retired from time to time, so if the assistant reports that a model
     cannot be found, put a current one here (see ai.google.dev/gemini-api/docs/models). */
  liveProvider: 'gemini',
  geminiModel: 'gemini-3.8-flash',
  /* If that model is busy, over its limit or cannot be found, the assistant tries these models in turn. */
  geminiFallbackModels: ['gemini-3.7-flash', 'gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'],
  aiWaitSeconds: 60,
  anthropicModel: 'claude-sonnet-5-5',

  /* How many megabytes of files the workbench can keep in the browser before it warns the user. */
  storageWarnMB: 1500
};
