/* Real, pinned programs compiled to WebAssembly: GNU coreutils, grep, sed and gawk (Biowasm builds), and GNU grep
 * with PCRE2 (grep -P) and GNU diffutils (diff, cmp), compiled for the course. One shared filesystem backs the
 * terminal and the AI agent. Pipes use byte-preserving temporary files (run one after another, not as concurrent
 * processes). Aioli's local execIO patch binds real file descriptors and reports each exit status.
 */
(function () {
  'use strict';
  const MG = window.MG;
  const ROOT = '/shared/vfs', TMP = ROOT + '/tmp/.pipes';
  // copies of files the AI agent could change (see keep): in the file system of the page, where no program looks
  const KEEP = '/keep';
  const TEXT_MAX = 262144;
  const CORE = ['cat','head','tail','wc','sort','uniq','cut','tr','tee','comm','join','paste','seq','fold','shuf','md5sum','date'];
  class FileRef { constructor(apath, binary=false) { this.apath=apath; this.binary=binary; } }
  // While a command of the AI agent runs, the shell's file system notes every path that is worked out through it
  // (terminal.js: watched). What is done here looks at all files, whatever the command names: it uses the file system itself.
  const real=fs=>(fs&&fs.__real)||fs;
  MG.FileRef=FileRef;
  /** The environment of a program, as NAME=value: the variables that the shell exports (export NAME, declare -x,
      NAME=value COMMAND, env NAME=value COMMAND) – awk's ENVIRON and getenv() in every program see them,
      and LC_ALL=C means bytes to sort, grep, sed, wc and awk as it does on Linux. PWD and _ are there as bash sets
      them. Left out: TMPDIR when it names a folder outside the home folder (a program's own /tmp is not the /tmp of
      this terminal: sort would look for a folder that it cannot see). */
  function envOf(ctx,program,fs){
    const st=ctx.opts&&ctx.opts.st,vars=ctx.env||{},out=[],home=fs.home;
    const names=st&&st.exported?Array.from(st.exported):Object.keys(vars);
    let pwd=false;
    for(const k of names){
      let v=vars[k];
      // (a variable that a function declared local and gave no value: the program still gets the value from outside)
      if(v===undefined&&st&&st.locals&&st.locals.has(k))v=st.locals.get(k);
      if(typeof v!=='string'||k==='_'||!/^[A-Za-z_]\w*$/.test(k)||v.includes('\0'))continue;
      if(k==='TMPDIR'&&!(v===home||v.startsWith(home+'/')))continue;
      if(k==='PWD')pwd=true;
      // (cmp says "differ: byte 7" – and "char 7" where the language of the messages is C or POSIX; diff -c dates
      // its files "2024-03-05 12:34:56.000000000 +0000" – and "Tue Mar  5 12:34:56 2024" where the language of
      // times is C or POSIX. The C library of these builds takes C.UTF-8 for C in these respects, Linux's does
      // not: the two programs get the name of a language instead.)
      out.push(k+'='+((program==='cmp'||program==='diff')&&/^(LANG|LC_ALL|LC_MESSAGES|LC_TIME)$/.test(k)&&/^C\.utf-?8$/i.test(v)?'en_US.UTF-8':v));
    }
    if(!pwd&&(!st||!st.exported||st.exported.has('PWD')))out.push('PWD='+fs.cwd);
    if(ctx.shell&&ctx.shell.oldpwd&&(!st||!st.exported||st.exported.has('OLDPWD'))&&typeof vars.OLDPWD!=='string')out.push('OLDPWD='+ctx.shell.oldpwd);
    const name=String(ctx.name||program);
    if(!(st&&st.envEmptied))out.push('_='+(name.includes('/')?name:'/usr/bin/'+name));
    return out;
  }
  const W = {
    ready:false, loading:null, cli:null, pipeN:0, mountN:0,
    synced:new Map(), placed:new Map(), managed:new Set(), dirs:new Set(), gone:[], denied:[], refused:[],
    gen:0, kept:new Map(), keepN:0,
    versions:{gawk:'5.1.0',grep:'3.7','grep-perl':'3.11',sed:'4.8',coreutils:'8.32',diffutils:'3.10'},
    apath(abs) { return ROOT+abs; },
    ensure(status) {
      if(this.ready)return Promise.resolve(this.cli);
      if(this.loading)return this.loading;
      const base=new URL(MG.config.biowasmBase||'assets/vendor/biowasm',location.href).href.replace(/\/$/,'');
      this.loading=(async()=>{
        if(!window.Aioli)await loadScript(base+'/aioli.js');
        status?.('Starting the local WebAssembly filesystem…');
        // 'base' holds the shared file system and never runs a program: a tool that aborts is replaced without losing the files
        const specs=[['base','1.0.0'],['gawk','5.1.0'],['grep','3.7'],['grep','3.11','grep-perl'],['sed','4.8'],['diffutils','3.10','diff'],['diffutils','3.10','cmp'],...CORE.map(p=>['coreutils','8.32',p])];
        const tools=specs.map(([tool,version,program])=>({tool,version,program:program||tool,urlPrefix:`${base}/${tool}/${version}`,loading:'lazy',features:{}}));
        this.cli=await new window.Aioli(tools,{printInterleaved:false,urlCDN:base,debug:false});
        await mkdirp(this.cli,TMP); await mkdirp(this.cli,KEEP); this.ready=true; MG.bus.emit('wasm:ready',{}); return this.cli;
      })().catch(e=>{this.loading=null;throw e;});
      return this.loading;
    },
    // (decoded here, not by the programs' file system: that one stops at the first NUL byte – find -print0 | sort -z)
    async readText(p){return new TextDecoder('utf-8',{ignoreBOM:true}).decode(await (await this.ensure()).fs.readFile(p));},
    async readBytes(p){return (await this.ensure()).fs.readFile(p);},
    /* how many bytes a file of the programs holds (what one program wrote for the next) */
    async sizeOf(p){const s=await stat(await this.ensure(),p);return s?s.size:0;},
    async readTextSmart(p){return this.readText(p);},
    async stat(p){return stat(await this.ensure(),p);},
    /* known: what is in the programs' file system (see snapshot) – asked once for all files, not once per file. */
    async syncIn(fs,abs,known){
      fs=real(fs);
      const e=fs.entries.get(abs), cli=this.cli, dest=this.apath(abs);
      if(!e)return;
      // (what is under ROOT, and no file of a pipe, is in the list – or is not there)
      const look=p=>known&&p.startsWith(ROOT+'/')&&!p.startsWith(TMP)?Promise.resolve(known.get(p)||null):stat(cli,p);
      const folder=async d=>{
        if(known&&(d===ROOT||(known.get(d)||{}).isDir))return;
        await mkdirp(cli,d);
        if(known)for(let q=d;q.length>ROOT.length;q=MG.path.dirname(q))known.set(q,{size:0,mtime:0,isDir:true,sig:''});
      };
      if(e.kind==='dir'){await folder(dest);this.dirs.add(abs);return;}
      await folder(MG.path.dirname(dest));
      // a folder of that name that is still there (it could not be removed) must not stop every later program
      const there=await look(dest);
      if(there&&there.isDir){await rmtree(cli,dest);if(known)known.delete(dest);}
      if(e.kind==='virtual')throw MG.shellUtil.userErr('The programs here need the actual bytes of a file, so simulated files cannot be processed.');
      const prior=this.synced.get(abs);
      // a read-only file is read-only for the programs too (they get "Permission denied")
      const locked=!!(e.readonly||e.protected);
      // (the file keeps the time of its last change: diff -u and diff -c print it. Last of all: in this file system
      // a change of the permissions sets the time, too)
      const stamp=async()=>{if(e.mtime)try{await cli.fs.utime(dest,e.mtime,e.mtime);}catch(x){}};
      const write=async data=>{if(await stat(cli,dest))await cli.fs.chmod(dest,0o644);await cli.fs.writeFile(dest,data);if(locked)await cli.fs.chmod(dest,0o444);await stamp();};
      if(e.kind==='text'){
        if(prior!==e||e.dirty||!(await look(dest))){await write(e.text);e.dirty=false;}
      }else if(e.kind==='aioli'){
        if(prior!==e||e.apath!==dest){
          if(!(await look(e.apath))){
            // its bytes are gone: a name without contents must not stay behind (every later program would stop)
            fs.entries.delete(abs);fs._changed(abs,'remove');this.synced.delete(abs);this.managed.delete(abs);this.gone.push(abs);return;
          }
          if(e.apath!==dest){await write(await cli.fs.readFile(e.apath));e.apath=dest;}
          else{await cli.fs.chmod(dest,locked?0o444:0o644);await stamp();}
        }
      }else if(e.kind==='url'||e.kind==='blob'){
        // (a file the page keeps as a Blob or a URL – an upload, a starter file – is copied in as real bytes)
        if(prior!==e||!(await look(dest)))await write(await fs.readBytes(abs));
      }else throw MG.shellUtil.userErr(`Unsupported file entry: ${e.kind}`);
      this.synced.set(abs,e);this.managed.add(abs);
    },
    /* A file that was copied or moved (cp, mv) still has its bytes at the old place, until a program
       needs it. settle gives every such file its own bytes: all of them are read first, then written –
       so that it does not matter in which order they are, or what else is written to the old places.
       between() runs after the reading and before the writing. */
    async settle(fs,between){
      fs=real(fs);
      const cli=this.cli,moved=[];
      for(const [abs,e] of Array.from(fs.entries))if(e.kind==='aioli'&&e.apath!==this.apath(abs)){
        if(await stat(cli,e.apath))moved.push([abs,e,await cli.fs.readFile(e.apath)]);
        else{fs.entries.delete(abs);fs._changed(abs,'remove');this.gone.push(abs);}
      }
      if(between)await between();
      for(const [abs,e,bytes] of moved){
        if(fs.entries.get(abs)!==e)continue;
        const dest=this.apath(abs);
        await place(cli,dest,bytes);e.apath=dest;this.noteDirs(abs);
        if(e.readonly||e.protected)await cli.fs.chmod(dest,0o444);
        this.synced.set(abs,e);this.managed.add(abs);
      }
    },
    /** the folders above abs exist in the programs' file system: remember them (syncAll removes those the page no longer has) */
    noteDirs(abs){for(let d=MG.path.dirname(abs);d&&d!=='/';d=MG.path.dirname(d))this.dirs.add(d);},
    /* Make the programs' file system the same as the page's.
       1. Copied and moved files get their own bytes (settle).
       2. In between: files that are no longer there are removed – and folders too, deepest first.
          (Left there, a folder that was removed with rm -r would come back, empty, after the next
          program.) The programs first leave the folder they were in: a folder cannot be removed while
          it is somebody's working directory.
       3. Everything else is brought up to date. */
    async syncAll(fs){
      fs=real(fs);
      const cli=this.cli;
      await this.settle(fs,async()=>{
        await cli.cd(ROOT);
        for(const abs of Array.from(this.managed)){
          const e=fs.entries.get(abs);
          if(!e||e.kind==='dir'){
            try{await cli.fs.unlink(this.apath(abs));}catch(x){}
            this.managed.delete(abs);this.synced.delete(abs);
          }
        }
        for(const abs of Array.from(this.dirs).sort((a,b)=>b.length-a.length))if(!fs.isDir(abs)){
          try{await cli.fs.rmdir(this.apath(abs));}catch(x){}
          this.dirs.delete(abs);
        }
      });
      // (what is there now: one answer for the whole tree)
      const known=await this.snapshot();
      for(const [abs] of Array.from(fs.entries))await this.syncIn(fs,abs,known);
    },
    /* ---- for the AI agent: what it changes outside its own folder is put back (assistant.js) ----
       A file of kind 'aioli' has its bytes only here, in the programs' memory. Before a command of the
       agent runs, each such file outside the agent's folder is copied (once per run of the agent);
       putBack writes the copy back where a command changed or removed the file. */
    async keep(list){
      if(!this.ready)return 0;
      const cli=this.cli;let n=0;
      for(const [,e] of list){
        if(e.kind!=='aioli')continue;
        const had=this.kept.get(e);
        if(had&&had.gen===this.gen)continue;
        const s=await stat(cli,e.apath);
        if(!s||s.isDir)continue;
        const path=`${KEEP}/${++this.keepN}`;
        await cli.fs.writeFile(path,await cli.fs.readFile(e.apath));
        this.kept.set(e,{path,sig:s.size+':'+s.mtime,gen:this.gen});n++;
      }
      return n;
    },
    /** the entry e is at abs in the page's file system again: make sure its bytes are there too.
        since: when the command started (ms). → false: the bytes are lost */
    async putBack(abs,e,since){
      if(!this.ready)return false;
      const cli=this.cli,dest=this.apath(abs),now=await stat(cli,e.apath);
      let k=this.kept.get(e);if(k&&k.gen!==this.gen)k=null;
      // untouched: the file is as it was when the copy was made. (Without a copy: there, of the size the
      // entry records, and not written since the command started.)
      const same=!!now&&!now.isDir&&(k?now.size+':'+now.mtime===k.sig:now.size===e.size&&(!since||now.mtime<since));
      if(!same&&!k)return false;
      const moved=!same||e.apath!==dest;
      if(moved){await place(cli,dest,await cli.fs.readFile(same?e.apath:k.path));e.apath=dest;this.noteDirs(abs);}
      await cli.fs.chmod(dest,e.readonly||e.protected?0o444:0o644);
      // (the time of the file changes with chmod: the mark of "untouched" is taken afterwards)
      if(k){const s=await stat(cli,dest);k.sig=s.size+':'+s.mtime;}
      this.synced.set(abs,e);this.managed.add(abs);
      return true;
    },
    async dropKept(){
      const all=Array.from(this.kept.values());this.kept.clear();
      if(!this.ready)return;
      for(const k of all)if(k.gen===this.gen)try{await this.cli.fs.unlink(k.path);}catch(x){}
    },
    /* everything in the programs' file system (but the files of pipes): path → {size, mtime, isDir, sig}. The
       worker answers for the whole tree at once (statTree, a local addition to aioli.js): asked file by file,
       a folder of a thousand files made every program take a second longer. */
    async snapshot(){
      const out=new Map();
      for(const [p,size,mtime,isDir] of await this.cli.statTree(ROOT,'.pipes'))out.set(p,{size,mtime,isDir,sig:size+':'+mtime});
      return out;
    },
    /* A file that a program wrote joins the page's file system. A small text file (a table, a log,
       a JSON report, an edited script) becomes an ordinary text file: it can be edited and is saved
       with the student's work. Anything else (.gz files, pictures, large files) stays in the programs' memory. */
    async adopt(fs,abs,apath,size,bytes,like){
      fs=real(fs);
      const there=fs.get(abs),was=there&&there.kind!=='dir'?there:(like||null),keep={};
      // (a file that took the place of a read-only one is read-only, too: sed -i gives the new file the old one's permissions.
      // like: the file that a program renamed to this name – it keeps its permissions under the new name, see importChanges)
      if(was&&was.kind!=='dir'){if(was.mode)keep.mode=was.mode;if(was.perm!=null)keep.perm=was.perm;if(was.readonly&&!was.protected)keep.readonly=true;}
      let text=null;
      if(size<=TEXT_MAX){
        try{
          if(!bytes)bytes=await this.cli.fs.readFile(apath);
          const t=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);
          if(t.indexOf('\u0000')<0)text=t;
        }catch(e){text=null;}
      }
      // (its time is the time at which the program wrote it)
      const made=await stat(this.cli,apath);if(made&&made.mtime)keep.mtime=made.mtime;
      if(text!=null){fs.put(abs,Object.assign({kind:'text',text,fresh:true},keep));fs.get(abs).dirty=false;}
      else fs.put(abs,Object.assign({kind:'aioli',apath,size,fresh:true},keep));
      this.synced.set(abs,fs.get(abs));this.managed.add(abs);
    },
    /* what a program changed in the WebAssembly file system becomes part of the page's file system.
       A protected file (one of root's: see lockedDir in vfs.js) that a program changed or removed is put back (the
       folder is not the student's). A read-only file of the student's own is another matter: the programs cannot
       write into it (it has mode 444 in their file system: "Permission denied"), but a program may put a new file in
       its place or remove it – sed -i does: that takes a folder one may write to, as on Linux. */
    async importChanges(fs,before){
      fs=real(fs);
      const after=await this.snapshot(),created=[];this.denied=[];this.refused=[];
      const guarded=abs=>{const e=fs.get(abs);return !!e&&e.kind!=='aioli'&&e.kind!=='dir'&&!!e.protected;};
      // A new name in a protected folder (one of root's – see refusesNew in vfs.js): such a folder takes nothing new.
      // It is removed again, and the run says so (refused). (What was there before the program ran and is unchanged
      // is a leftover: removed without a word.)
      const out=[],underOut=abs=>out.some(r=>abs.startsWith(r+'/'));
      // A file that a program renamed – sed -i.bak: FILE becomes FILE.bak, and a new FILE is written – keeps its
      // permissions under the new name, as on Linux. The programs' file system does not hold them (the page does), so
      // a renamed file is told by what a rename leaves as it was, its size and its time: a name that is new and has the
      // size and time that another file had before the program ran – a file that is gone now, or has changed. Where
      // several files had that size and time (three files written by one loop), the names decide: FILE.bak begins with
      // FILE, and a backup in a folder of its own (sed -i'bak/*') has the name of its file.
      const moved=new Map();
      for(const [p,s] of before){if(s.isDir)continue;const now=after.get(p);if(!now||now.isDir||now.sig!==s.sig){if(!moved.has(s.sig))moved.set(s.sig,[]);moved.get(s.sig).push(p.slice(ROOT.length));}}
      const last=x=>x.slice(x.lastIndexOf('/')+1);
      const renamedFrom=(old,s,abs)=>{
        const c=old?null:moved.get(s.sig);
        if(!c)return null;
        const from=c.filter(q=>abs.length>q.length&&abs.startsWith(q)).sort((a,b)=>b.length-a.length)[0]||c.find(q=>last(q)===last(abs))||(c.length===1?c[0]:null);
        const e=from?fs.get(from):null;
        return e&&e.kind!=='dir'&&!e.protected?e:null;
      };
      for(const [p,s] of after){
        const abs=p.slice(ROOT.length), old=before.get(p);
        if(underOut(abs))continue;
        if(fs.refusesNew(abs)){out.push(abs);if(!old||(!s.isDir&&old.sig!==s.sig))this.refused.push(abs);continue;}
        if(s.isDir){
          this.dirs.add(abs);
          if(!fs.exists(abs))fs.mkdirp(abs);
          // (a program that made, renamed or removed a name in a folder – sed -i does all three – has changed the folder:
          // its time moves on, as on Linux; see _dirTouched in vfs.js)
          else if(old&&s.mtime>old.mtime){const d=fs.entries.get(abs);if(d&&d.kind==='dir'&&s.mtime>(d.mtime||0))d.mtime=s.mtime;}
          continue;
        }
        if(old&&old.sig===s.sig)continue;
        if(guarded(abs)){this.denied.push(abs);this.synced.delete(abs);continue;}
        await this.adopt(fs,abs,p,s.size,undefined,renamedFrom(old,s,abs));created.push(abs);
      }
      for(const [p,s] of before)if(!s.isDir&&!after.has(p)){
        const abs=p.slice(ROOT.length);
        if(guarded(abs)){this.denied.push(abs);this.synced.delete(abs);continue;}
        fs.remove(abs);this.managed.delete(abs);
      }
      for(const abs of out){
        const p=ROOT+abs;
        try{const st=await stat(this.cli,p);if(st&&st.isDir)await rmtree(this.cli,p);else if(st)await this.cli.fs.unlink(p);}catch(x){}
      }
      return created;
    },
    /* Bytes that the shell has in hand (what a block printed: { cat a.png; } > b.png, f | wc -c):
       writeBytes makes them a file of the page; tempBytes a file for the next command of a pipe to read. */
    async writeBytes(fs,abs,bytes){
      fs=real(fs);
      // (nothing new in a protected folder – refused before anything is written)
      if(fs.refusesNew(abs))fs._refuseNew(abs);
      const cli=await this.ensure(),dest=this.apath(abs);
      // (a file that was copied or moved – cp, mv – may still have its bytes at this very place: see settle.
      // Each such file gets its own bytes before anything is written here.)
      await this.settle(fs);
      await mkdirp(cli,MG.path.dirname(dest));
      const there=await stat(cli,dest);
      if(there&&there.isDir)await rmtree(cli,dest);else if(there)await cli.fs.chmod(dest,0o644);
      await cli.fs.writeFile(dest,bytes);
      await this.adopt(fs,abs,dest,bytes.length,bytes);
      this.noteDirs(abs);
    },
    async tempBytes(bytes,binary){
      const cli=await this.ensure(),path=`${TMP}/i${++this.pipeN}`;
      await cli.fs.writeFile(path,bytes);
      return new FileRef(path,!!binary);
    },
    /* a file of a pipe that is still needed (the input of a block or a script that runs several programs) is not
       tidied away: see cleanupPipes */
    held:new Map(),
    hold(p){this.held.set(p,(this.held.get(p)||0)+1);},
    release(p){const n=(this.held.get(p)||0)-1;if(n>0)this.held.set(p,n);else this.held.delete(p);},
    /* one WebAssembly program at a time */
    lock:Promise.resolve(),
    async run(ctx,program,args,opts={}){
      let release;const prev=this.lock;this.lock=new Promise(r=>(release=r));
      await prev;
      try{return await this._run(ctx,program,args,opts);}finally{release();}
    },
    async _run(ctx,program,args,opts={}){
      const start=performance.now(),fs=real(ctx.fs);
      // … but the arguments that name a file or a folder that is there are paths the command uses: they are noted.
      // (A pattern or a program – /^#/d, /Gentoo/ – names none. A file that the command makes is seen
      // afterwards, when the page looks at what has changed.)
      if(ctx.fs!==fs){
        const kinds=MG.shellLang&&MG.shellLang.argKinds?MG.shellLang.argKinds(ctx.name||program,args):[];
        args.forEach((v,i)=>{
          const m=/^--[^=]+=(.+)$/.exec(v),w=m?m[1]:v;
          if(kinds[i]!=='skip'&&w&&!w.startsWith('-')&&fs.exists(w))ctx.fs.resolve(w);
        });
      }
      const status=s=>{if(ctx.term?.statusEl)ctx.term.statusEl.textContent=s;};
      await this.ensure(status);this.gone=[];await this.syncAll(fs);
      const cli=this.cli;let stdin=null,inherit=null;
      if(ctx.stdin instanceof FileRef)stdin=ctx.stdin.apath;
      else if(ctx.stdin!=null){
        if(typeof ctx.stdin!=='string')throw MG.shellUtil.userErr('Only real byte streams can enter a tool.');
        stdin=`${TMP}/i${++this.pipeN}`;await cli.fs.writeFile(stdin,ctx.stdin);
      }else if(ctx.inherit&&ctx.inherit.pos<ctx.inherit.text.length){
        // No input of its own: the program stands in a block, a function or a script that has one
        // ({ head -n 1; sort; } < FILE,  f() { wc -l; }; f < FILE,  while read x; do PROGRAM; done < FILE).
        // It gets what is left of that input, and afterwards the page looks at how much of it the program read:
        // a program that does not read leaves it to the commands after it. From the start of a file the program
        // gets the file itself (byte for byte); otherwise the rest of the text.
        inherit=ctx.inherit;
        const own=inherit.pos===0?(inherit.apath||(inherit.path&&fs.exists(inherit.path)&&!fs.isDir(inherit.path)?this.apath(inherit.path):null)):null;
        if(own&&await stat(cli,own))stdin=own;
        else{stdin=`${TMP}/i${++this.pipeN}`;await cli.fs.writeFile(stdin,inherit.text.slice(inherit.pos));}
        inherit.size=((await stat(cli,stdin))||{}).size||0;
      }
      await this.cleanupPipes(fs,stdin);
      // Paths in the student's home are given to the programs as typed: each program has the link /home/user (the home
      // folder) -> the shared folder (see links below), and prints the names it was given (grep -H, the headers of
      // diff -u). Other absolute paths (/tmp/…) are in the shared folder under ROOT.
      const home=fs.home,inHome=p=>p===home||p.startsWith(home+'/');
      // (a path below /home/student – the home folder until October 2026 – is one below the home folder: see vfs.js)
      const pathToken=p=>(p=MG.VFS.unalias(fs,p),p.startsWith(ROOT)||p.startsWith('/dev/')||inHome(p)?p:(p.startsWith('/')?this.apath(MG.path.norm(p)):p));
      // What is no path goes to the program as it was typed: a pattern (grep /tmp, awk '/Adelie/'), a set of characters
      // (tr / _), a delimiter (cut -d /). Of the rest, absolute paths and absolute output destinations are rewritten.
      const kinds=MG.shellLang&&MG.shellLang.argKinds?MG.shellLang.argKinds(ctx.name||program,args):args.map(()=>'path');
      const stdoutPath=`${TMP}/o${++this.pipeN}`,stderrPath=`${TMP}/e${this.pipeN}`;
      // /dev/stdin, /dev/stdout and /dev/stderr as arguments (sort /dev/stdin, sort -o /dev/stdout): the files
      // that are the program's input and output here. (In what the program prints they get their names back.)
      const dev={'/dev/stdin':()=>stdin||'/dev/null','/dev/fd/0':()=>stdin||'/dev/null','/dev/stdout':()=>stdoutPath,'/dev/fd/1':()=>stdoutPath,'/dev/stderr':()=>ctx.mergeStderr?stdoutPath:stderrPath,'/dev/fd/2':()=>ctx.mergeStderr?stdoutPath:stderrPath};
      const devUsed=new Map();
      // An operand that names nothing because of the way it is written – "FILE/", "nosuch/../x" (see VFS.forShell):
      // the programs' file system would take the dots and the slash away and find the file. So the program is given a
      // name in a folder that is not there (it can neither read nor make anything under it), and in what it prints the
      // name that was typed is put back (the same way as for /dev/stdin, see named below).
      let nowhere=0;const notDir=[];
      // (the shell is in a folder that was removed – a script after  rm -rf "$PWD" : the program cannot be started
      // there. An operand that names something that is there – ../a.txt – is handed over with its whole path.)
      const adrift=!fs.isDir(fs.cwd);
      const a=args.map((v,i)=>{
        if(kinds[i]==='skip')return v;
        if(adrift&&v&&!v.startsWith('-')&&!v.startsWith('/')&&v.includes('/')){const abs=ctx.fs.resolve(v);if(fs.entries.has(abs)){const full=pathToken(abs);devUsed.set(full,v);return full;}}
        if(v.includes('/')&&!v.startsWith('-')&&ctx.fs.pathError&&ctx.fs.pathError(v)){const fake=`.no-such-folder-${++nowhere}/x`;devUsed.set(fake,v);if(ctx.fs.pathError(v)==='Not a directory')notDir.push(v);return fake;}
        const d=/^(-[A-Za-z]|--[^=]+=)?(\/dev\/(?:stdin|stdout|stderr|fd\/[012]))$/.exec(v);
        if(d&&!(d[1]&&/^-[A-Za-z]$/.test(d[1])&&MG.shellLang&&MG.shellLang.optionSkips&&MG.shellLang.optionSkips(ctx.name||program,d[1]))){const real=dev[d[2]]();if(real!=='/dev/null')devUsed.set(real,d[2].replace('/dev/fd/0','/dev/stdin').replace('/dev/fd/1','/dev/stdout').replace('/dev/fd/2','/dev/stderr'));return (d[1]||'')+real;}
        if(v.startsWith('/')&&(fs.exists(v)||fs.isDir(MG.path.dirname(v))))return pathToken(v);
        // -o/tmp/x.txt, -f/tmp/patterns.txt: a path glued to its option (not the value of an option that takes a
        // pattern or a delimiter: -F/, -d/, -e/x/d)
        const o=/^(-[A-Za-z])(\/[^/]+\/.*)$/.exec(v);
        if(o&&!(MG.shellLang&&MG.shellLang.optionSkips&&MG.shellLang.optionSkips(ctx.name||program,o[1]))&&(fs.exists(o[2])||fs.isDir(MG.path.dirname(o[2]))))return o[1]+pathToken(o[2]);
        const m=/^(--[^=]+=)(\/.*)$/.exec(v);return m?m[1]+pathToken(m[2]):v;
      });
      if(ctx.mergeStderr)await cli.fs.writeFile(stdoutPath,'');
      // date -u, TZ=UTC date, TZ=America/New_York date: the clock of that zone (the programs take the time zone from the
      // browser, and no notice of TZ); and the short name of the time zone (BST), as date prints it on Linux.
      // The same for awk's strftime and mktime, and for the times of the files in the headers of diff -u and diff -c.
      let clock={};
      if(program==='date'||program==='gawk'||program==='diff'){
        const tz=ctx.env&&typeof ctx.env.TZ==='string'&&(!(ctx.opts&&ctx.opts.st&&ctx.opts.st.exported)||ctx.opts.st.exported.has('TZ'))?ctx.env.TZ:null;
        let zone=MG.time.zoneOf(ctx);
        if(program==='date'&&dateUTC(args))zone='UTC';
        if(tz&&!zone)ctx.io.note(`${ctx.name||program}: the time zone ${tz} (TZ) is not known in this browser, so this computer's own time zone is used instead.`);
        clock={zoneName:true,zone:zone||null};
      }
      // sed in a block whose input is a file ({ sed 1q; cat; } < FILE): what sed did not use is left for the next command.
      // On Linux the C library puts the rest back when sed ends; here sed is handed its input a line at a time.
      const lines=program==='sed'&&!!inherit&&!inherit.pipe;
      // wc sets the width of its columns by what its input is: 7 for a pipe ("cat f | wc" →  "      3       3      17"),
      // the digits of the size for a file ("wc < f" → " 3  3 17"). Here a pipe is a file too – so wc is told. (bash
      // hands a here-document over as a pipe when it has 64 KiB at most, as a file when it has more.)
      const piped=stdin!=null&&(ctx.stdin instanceof FileRef?(!ctx.stdin.fromFile||!!ctx.stdin.psub):ctx.stdin!=null?!(ctx.hereInput&&new Blob([ctx.stdin]).size>65536):!!(inherit&&inherit.pipe));
      const fifo=program==='wc'&&piped;
      const before=await this.snapshot();await cli.cd(this.apath(fs.isDir(fs.cwd)?fs.cwd:fs.home));
      status(`${program} is running locally…`);
      const timer=setInterval(()=>status(`${this.running||program} · ${((performance.now()-start)/1000).toFixed(0)} s`),1000);
      let result;
      const killed=new Promise((_,reject)=>{this._killed=reject;});
      this.running=program;
      const job=cli.execIO(program,a,{stdin,stdout:stdoutPath,stderr:ctx.mergeStderr?stdoutPath:stderrPath,merge:!!ctx.mergeStderr,links:[[this.apath(home),home]],lines,fifo,env:envOf(ctx,program,fs),...clock});
      try{result=await Promise.race([job,killed]);}
      catch(e){
        // not a forced stop (then there is nothing left to look at): the page's file system must still learn what was written.
        // No program is running any more: a forced stop that came now would end the worker under this very call.
        this._killed=null;this.running=null;
        if(this.ready&&this.cli===cli)try{await this.importChanges(fs,before);}catch(x){}
        throw e;
      }finally{clearInterval(timer);this._killed=null;this.running=null;}
      if(inherit){
        // how far the program read: in a file, where it left off (head -n 1 goes back behind the first line);
        // in what came through a pipe, the furthest byte it took
        const n=devUsed.has(stdin)?Infinity:inherit.pipe?Math.max(result.stdinMax||0,result.stdinPos||0):(result.stdinPos||0);
        if(n>0){
          // (n bytes of the file are so many characters of the text)
          const t=inherit.text;let k=inherit.pos,b=0;
          if(n>=inherit.size)k=t.length;
          else while(k<t.length&&b<n){const c=t.codePointAt(k);b+=c<0x80?1:c<0x800?2:c<0x10000?3:4;k+=c>0xffff?2:1;}
          inherit.pos=k;
        }
      }
      const created=await this.importChanges(fs,before);
      if(ctx.mergeStderr){
        // 2>&1: what the program wrote to stderr is in the output file – tidy it like stderr (see tidy)
        const st=await stat(cli,stdoutPath);
        if(st&&st.size&&st.size<=1048576)try{
          const t=new TextDecoder('utf-8',{fatal:true}).decode(await this.readBytes(stdoutPath)),t2=tidy(t,ctx.name||program);
          if(t2!==t)await cli.fs.writeFile(stdoutPath,t2);
        }catch(e){}
      }
      // (a file that stood for /dev/stdin … is called that again in what the program printed – also without the
      // folder of the programs' file system in front of its name)
      // (… and of a name that asks for a folder where a file is – "a.txt/", "a.txt/../x" – the program is told, in
      // Linux's words, why it was not found)
      const named=t=>{for(const [real,name] of devUsed){t=t.split(real).join(name);if(real.startsWith(TMP+'/'))t=t.split(real.slice(ROOT.length)).join(name);}if(notDir.length)t=t.split('\n').map(l=>notDir.some(v=>l.includes(v))?l.replace('No such file or directory','Not a directory'):l).join('\n');return t;};
      if(devUsed.size){
        const st=await stat(cli,stdoutPath);
        if(st&&st.size&&st.size<=1048576)try{
          const t=new TextDecoder('utf-8',{fatal:true}).decode(await this.readBytes(stdoutPath)),t2=named(t);
          if(t2!==t)await cli.fs.writeFile(stdoutPath,t2);
        }catch(e){}
      }
      const stderr=ctx.mergeStderr?'':named(await this.readText(stderrPath)),outStat=await stat(cli,stdoutPath);
      // exit(-1) in C gives status 255 on Linux
      const raw=result.code==null?(result.error?1:0):result.code,code=((raw%256)+256)%256;
      const stdout=opts.binaryOut?'':tidy(await this.readText(stdoutPath),ctx.name||program);
      for(const path of created)MG.bus.emit('vfs:created',{path,program,sub:args[0]});
      // (how many changes were put back so far: the agent's run asks, see agentRun – the message may go to /dev/null)
      if(this.denied.length)this.deniedN=(this.deniedN||0)+this.denied.length;
      const undone=this.denied.map(abs=>`${program}: ${fs.pretty(abs)} is read-only, so the change to it was undone\n`).join('')
        +this.refused.map(abs=>`${program}: ${fs.pretty(abs)} was not kept, because nothing new can be written into that folder (it is read-only). Write into your home folder instead.\n`).join('');
      const gone=this.gone.map(abs=>`${fs.pretty(abs)}: the contents of this file were lost when the programs were stopped, so it needs to be created again\n`).join('');this.gone=[];
      const failure=result.error?(/FS error/.test(result.error)?`${ctx.name||program}: stopped because it could not read or write a file. Check the file names in the command.`:result.error):'';
      // The two outputs in the order in which the program wrote to them (wc -l a nosuch b: the count of a, the
      // message, the count of b): the run reports that order, and where both go the same way – to the terminal, to
      // the file or the pipe of a block or a script – they are passed on in it (see runReal). parts: [1 or 2,
      // bytes] in turn; only when the list accounts for every byte of both files.
      let parts=null;const ord=result.order||[],tail=(failure?`\n${failure}\n`:'')+undone+gone;
      if(!ctx.mergeStderr&&!opts.binaryOut&&!devUsed.size&&ord.length>2){
        const ob=await this.readBytes(stdoutPath),eb=await this.readBytes(stderrPath);let no=0,ne=0;
        for(let k=0;k<ord.length;k+=2){if(ord[k]===1)no+=ord[k+1];else ne+=ord[k+1];}
        if(no===ob.length&&ne===eb.length){
          let oi=0,ei=0;parts=[];
          for(let k=0;k<ord.length;k+=2){
            const n=ord[k+1];
            if(ord[k]===1){parts.push([1,ob.subarray(oi,oi+n)]);oi+=n;}
            else{parts.push([2,eb.subarray(ei,ei+n)]);ei+=n;}
          }
        }
      }
      // how far the program read what was piped in (see "the reader left early" in runPipeline) – Infinity: it was
      // named as a file (cat - , sort /dev/stdin), and so read as one
      const stdinUsed=stdin&&!inherit?(devUsed.has(stdin)?Infinity:Math.max(result.stdinMax||0,result.stdinPos||0)):null;
      return {stdout,stderr:stderr+tail,parts,tail,stdoutPath,stdoutSize:outStat?.size||0,created,secs:(performance.now()-start)/1000,code:code||(undone?1:0),statusKnown:result.code!=null,stdinUsed};
    },
    /* A program that does not end blocks every later command. kill() stops the worker that runs the
       programs; the next command starts a new one. What programs had written lived in that worker's
       memory and is lost (returned as a list); text files are not. */
    lastKill:'',
    kill(fs){
      fs=real(fs);
      this.lastKill='runner';
      const w=window.Aioli&&window.Aioli.lastWorker;
      if(!this.cli||!w)return [];
      const program=this.running;
      try{w.terminate();}catch(e){}
      window.Aioli.lastWorker=null;
      this.ready=false;this.loading=null;this.cli=null;this.synced.clear();this.placed.clear();this.managed.clear();this.dirs.clear();this.gen++;
      const lost=[];this.lostTimes=new Map();this.lostEntries=new Map();
      for(const [abs,e] of Array.from(fs.entries))if(e.kind==='aioli'){this.lostTimes.set(abs,e.mtime||0);this.lostEntries.set(abs,e);fs.entries.delete(abs);fs._changed(abs,'remove');lost.push(abs);}
      if(this._killed)this._killed(Object.assign(new Error('Killed'),{userMessage:`${program||'program'}: Killed`,code:137}));
      MG.bus.emit('wasm:killed',{program,lost:lost.length});
      return lost;
    },
    async cleanupPipes(fs,keep){
      fs=real(fs);
      if(!this.ready)return;
      const refs=new Set(keep?[keep]:[]);for(const e of fs.entries.values())if(e.apath)refs.add(e.apath);for(const p of this.held.keys())refs.add(p);
      for(const n of await readdir(this.cli,TMP)){const p=TMP+'/'+n;if(n!=='.'&&n!=='..'&&!refs.has(p))try{await this.cli.fs.unlink(p);}catch(e){}}
    }
  };
  async function stat(cli,p){try{const s=await cli.fs.lstat(p);return {size:s.size,mtime:+new Date(s.mtime),isDir:(s.mode&0o170000)===0o040000};}catch(e){return null;}}
  async function readdir(cli,p){try{return await cli.fs.readdir(p);}catch(e){return [];}}
  async function mkdirp(cli,p){let cur='';for(const part of p.split('/').filter(Boolean)){cur+='/'+part;const s=await stat(cli,cur);if(s&&!s.isDir)try{await cli.fs.unlink(cur);}catch(e){}if(!s||!s.isDir)try{await cli.mkdir(cur);}catch(e){}}}
  /* write a file at dest, whatever is in the way: a folder of that name, a file where a folder should be */
  async function place(cli,dest,data){
    const parts=dest.split('/').filter(Boolean);let cur='';
    for(let i=0;i<parts.length-1;i++){
      cur+='/'+parts[i];const s=await stat(cli,cur);
      if(s&&!s.isDir)await cli.fs.unlink(cur);
      if(!s||!s.isDir)await cli.mkdir(cur); // Aioli's mkdir: FS.mkdir returns a node, which cannot be sent to the page
    }
    const s=await stat(cli,dest);
    if(s&&s.isDir)await rmtree(cli,dest);else if(s)await cli.fs.chmod(dest,0o644);
    await cli.fs.writeFile(dest,data);
  }
  async function rmtree(cli,p){
    for(const n of await readdir(cli,p)){
      if(n==='.'||n==='..')continue;
      const q=p+'/'+n,s=await stat(cli,q);
      if(s&&s.isDir)await rmtree(cli,q);else if(s)await cli.fs.unlink(q);
    }
    await cli.fs.rmdir(p);
  }
  function loadScript(src){return new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=src;s.onload=resolve;s.onerror=()=>reject(new Error('Could not load '+src));document.head.appendChild(s);});}
  MG.wasm=W;
  /* date -u …: is the time asked for in UTC? (-u among the letters of an option – not in the value of -d or -I) */
  function dateUTC(args){
    for(let i=0;i<args.length;i++){
      const v=args[i];
      if(v==='--utc'||v==='--universal')return true;
      if(v==='--')break;
      if(!/^-[A-Za-z]/.test(v))continue;
      for(let j=1;j<v.length;j++){
        const c=v[j];
        if(c==='u')return true;
        if(c==='I')break;
        if('dfrs'.includes(c)){if(j===v.length-1)i++;break;}
      }
    }
    return false;
  }
  /* date -r FILE: the time of the last change of a file. The page knows it; the programs' copy of the file is newer. */
  function dateArgs(ctx){
    const a=ctx.args,out=[];
    for(let i=0;i<a.length;i++){
      const v=a[i],m=/^--reference=(.*)$/.exec(v),c=/^-([uR]*)r(.*)$/.exec(v);
      let f=null;
      if(m)f=m[1];
      else if(v==='--reference')f=a[++i];
      else if(c){if(c[1])out.push('-'+c[1]);f=c[2]!==''?c[2]:a[++i];}
      else{out.push(v);if(/^-[uR]*[dfs]$/.test(v)&&i+1<a.length)out.push(a[++i]);continue;}
      const e=f!=null?ctx.fs.get(f):null;
      if(!e)throw MG.shellUtil.userErr(`date: ${f==null?'option requires an argument -- \'r\'':f+': No such file or directory'}`);
      out.push('-d','@'+Math.floor((e.mtime||Date.now())/1000));
    }
    return out;
  }
  /* cat FILE >> FILE, cat A FILE > FILE: GNU cat does not read a file that it is itself writing to once something is
     in it ("input file is output file") – it names the file, leaves it out, and ends with status 1. (After > the file
     is empty at first: cat FILE > FILE reads nothing, and nothing is said.) */
  async function catRun(ctx){
    const out=ctx.redirectTarget?ctx.fs.resolve(ctx.redirectTarget):ctx.toCaller&&ctx.io.outFile?ctx.io.outFile.path:null;
    const e=out&&ctx.redirectTarget!=='/dev/null'?ctx.fs.get(out):null;
    if(!e||e.kind==='dir')return runReal(ctx,'cat');
    const fromIt=ctx.stdin instanceof FileRef&&ctx.stdin.fromFile&&ctx.stdin.apath===W.apath(out);
    const names=[];let opts=true;
    for(const a of ctx.args){if(opts&&a==='--')opts=false;else if(!(opts&&a.startsWith('-')&&a!=='-'))names.push(a);}
    if(!fromIt&&!names.some(a=>a!=='-'&&ctx.fs.resolve(a)===out))return runReal(ctx,'cat');
    // how much is in the output file when cat comes to each of its inputs: with >> what was there, with > what cat
    // itself has written by then
    const sizeOf=async a=>{
      if(a!=='-'){const f=ctx.fs.get(a);return f&&f.kind!=='dir'?ctx.fs.size(f):0;}
      const s=ctx.stdin;
      return s==null?(ctx.inherit?1:0):s instanceof FileRef?(await W.readBytes(s.apath)).length:String(s).length;
    };
    // (the file of a block – { echo start; cat FILE; } > FILE –: what the block has written into it so far counts)
    let written=ctx.redirectTarget?(ctx.redirectAppend?ctx.fs.size(e):0):ctx.fs.size(e);
    const args=[];let files=0,bad=0;opts=true;
    for(const a of ctx.args){
      if(opts&&a==='--'){opts=false;args.push(a);continue;}
      if(opts&&a.startsWith('-')&&a!=='-'){args.push(a);continue;}
      files++;
      const same=a==='-'?fromIt:ctx.fs.resolve(a)===out;
      if(same&&written>0){ctx.err(`cat: ${a}: input file is output file\n`);bad++;}
      else{args.push(a);if(!same)written+=await sizeOf(a);}
    }
    if(!files&&fromIt&&written>0){ctx.err('cat: -: input file is output file\n');return 1;}
    if(!bad)return runReal(ctx,'cat');
    if(bad===files)return 1;
    await withArgs(ctx,args,'cat');
    return 1;
  }
  /* tee /dev/stdout, tee /dev/stderr: one more copy of the input on the output (or among the messages). The page
     makes the copy: tee writes its input into a file of its own, too, and that file is printed once more. */
  async function teeRun(ctx){
    const isOut=a=>a==='/dev/stdout'||a==='/dev/fd/1',isErr=a=>a==='/dev/stderr'||a==='/dev/fd/2'||a==='/dev/tty';
    let opts=true,outs=0,errs=0;const args=[];
    for(const a of ctx.args){
      if(opts&&a==='--'){opts=false;args.push(a);}
      else if(opts&&a.startsWith('-')&&a!=='-')args.push(a);
      else if(isOut(a))outs++;
      else if(isErr(a))errs++;
      else args.push(a);
    }
    if(!outs&&!errs)return runReal(ctx,'tee');
    const copy=`${TMP}/t${++W.pipeN}`;
    const code=await withArgs(ctx,[...args,copy],'tee');
    let bytes;
    try{bytes=await W.readBytes(copy);}catch(e){return code;}
    try{await W.cli.fs.unlink(copy);}catch(e){}
    // (tee /dev/stdout > FILE: on Linux both copies are written to the same place in FILE – it holds the input once)
    if(!ctx.redirectTarget)for(let k=0;k<outs;k++)if(bytes.length)ctx.out(bytes);
    for(let k=0;k<errs;k++)if(bytes.length)ctx.err(MG.shellUtil.bytesText(bytes));
    return code;
  }
  /* Messages of the programs: paths as the student sees them, and the program's name where the
     WebAssembly build has none ("(null): cannot open …"). */
  function tidy(text,name){
    return text.replace(/\/shared\/vfs/g,'').replace(/^\(null\):/gm,name+':');
  }
  async function runReal(ctx,program,opts={}){
    const r=await W.run(ctx,program,ctx.args,opts);
    if(r.stdinUsed!=null)ctx.stdinUsed=r.stdinUsed;
    // Messages and output that go the same way – to the terminal, or to whoever takes the output of the block or
    // the script this command stands in – are passed on in the order in which the program wrote them. (To the
    // terminal as text; to a block's file or pipe the output goes as bytes, as it is.)
    const inTurn=!!r.parts&&!ctx.redirectTarget&&!!ctx.toCaller;
    // (> FILE 2>&1: the program's messages are in its output already; what the page adds – "… is read-only: the
    // change to it was undone" – follows them into the file)
    const tailBytes=ctx.mergeStderr&&ctx.redirectTarget&&r.tail?new TextEncoder().encode(tidy(r.tail,ctx.name||program).replace(/^\n/,'')):null;
    if(inTurn){
      const name=ctx.name||program,od=new TextDecoder('utf-8',{ignoreBOM:true}),ed=new TextDecoder('utf-8',{ignoreBOM:true});
      for(const [fd,bytes] of r.parts){
        if(!bytes.length)continue;
        if(fd===2)ctx.err(tidy(ed.decode(bytes,{stream:true}),name));
        else if(ctx.isPipedOut)ctx.out(bytes);
        else ctx.out(tidy(od.decode(bytes,{stream:true}),name));
      }
      if(r.tail)ctx.err(tidy(r.tail,name));
    }else if(r.stderr&&!tailBytes)ctx.err(tidy(r.stderr,ctx.name||program));
    if(inTurn){/* (passed on above) */}
    else if(ctx.redirectTarget){
      if(ctx.redirectTarget!=='/dev/null'){
        const target=ctx.fs.resolve(ctx.redirectTarget);let bytes=await W.readBytes(r.stdoutPath);
        if(tailBytes){const all=new Uint8Array(bytes.length+tailBytes.length);all.set(bytes);all.set(tailBytes,bytes.length);bytes=all;}
        // (The program printed nothing: the file stays as it was opened – made, or emptied, before the program ran –
        // or as the program itself wrote it by name:  sort -o F a > F,  sort -o F a > F 2>&1.)
        const nothing=!bytes.length&&ctx.fs.exists(target)&&!ctx.fs.isDir(target);
        if(!nothing){
        if(ctx.redirectAppend&&ctx.fs.exists(target)){const old=await ctx.fs.readBytes(target),joined=new Uint8Array(old.length+bytes.length);joined.set(old);joined.set(bytes,old.length);bytes=joined;}
        const dest=W.apath(target);await mkdirp(W.cli,MG.path.dirname(dest));await W.cli.fs.writeFile(dest,bytes);
        await W.adopt(ctx.fs,target,dest,bytes.length,bytes);
        }
        r.created.push(target);MG.bus.emit('vfs:created',{path:target,program,sub:ctx.args[0]});
      }
      ctx.wroteRedirect=true;
    }else if(ctx.isPipedOut)ctx.out(new FileRef(r.stdoutPath,false));
    else if(r.stdout)ctx.out(r.stdout);
    MG.bus.emit('tool:run',{program,sub:ctx.args[0]||'',args:ctx.args,code:r.code,secs:r.secs,created:r.created,real:true,line:ctx.rawLine,statusKnown:r.statusKnown});
    return r.code;
  }
  MG.runReal=runReal;
  /* Run with other arguments on the same context object: the shell reads what a program did
     (a redirect already written, for one) from that object afterwards. */
  async function withArgs(ctx,args,program){
    const given=ctx.args;ctx.args=args;
    try{return await runReal(ctx,program);}finally{ctx.args=given;}
  }
  const T=MG.shellTools=MG.shellTools||{};
  /* grep -P. The Biowasm build of grep 3.7 has no PCRE ("Perl matching not supported in a --disable-perl-regexp
     build"), so a command line that asks for Perl patterns is carried out by a second program: GNU grep 3.11 with
     PCRE2 10.42, built for this practical (grep-perl; see its NOTICE.txt). Whether a command line asks for them is
     decided as grep's getopt decides it: -P alone or in a group of letters (-oP, -oPm1 – but not behind a letter that
     takes a value: -eP is the pattern "P"), --perl-regexp or a beginning of that word, anywhere before "--". */
  const GREP_VALUE='ABCDXdefm',GREP_LONG={'after-context':1,'before-context':1,'binary-files':1,'context':1,'devices':1,'directories':1,'exclude':1,'exclude-from':1,'exclude-dir':1,'file':1,'group-separator':1,'include':1,'label':1,'max-count':1,'regexp':1,
    'basic-regexp':0,'extended-regexp':0,'fixed-regexp':0,'fixed-strings':0,'perl-regexp':0,'byte-offset':0,'color':0,'colour':0,'count':0,'files-with-matches':0,'files-without-match':0,'help':0,'ignore-case':0,'no-ignore-case':0,'initial-tab':0,'line-buffered':0,'line-number':0,'line-regexp':0,'no-filename':0,'no-group-separator':0,'no-messages':0,'null':0,'null-data':0,'only-matching':0,'quiet':0,'recursive':0,'dereference-recursive':0,'invert-match':0,'silent':0,'text':0,'binary':0,'unix-byte-offsets':0,'version':0,'with-filename':0,'word-regexp':0};
  function wantsPerl(args){
    let perl=false;
    for(let i=0;i<args.length;i++){
      const a=String(args[i]);
      if(a==='--')break;
      if(a.startsWith('--')){
        const word=a.slice(2).split('=')[0];
        // (the whole word, or a beginning that only one word has)
        const hits=word in GREP_LONG?[word]:Object.keys(GREP_LONG).filter(k=>k.startsWith(word));
        if(hits.length!==1)continue;
        if(hits[0]==='perl-regexp')perl=true;
        else if(GREP_LONG[hits[0]]&&!a.includes('='))i++;
      }else if(a.length>1&&a[0]==='-'){
        for(let k=1;k<a.length;k++){
          if(a[k]==='P')perl=true;
          else if(GREP_VALUE.includes(a[k])){if(k===a.length-1)i++;break;}
        }
      }
    }
    return perl;
  }
  MG.wantsPerl=wantsPerl;
  const grepRun=(ctx,name)=>{
    const first=name==='egrep'?['-E']:name==='fgrep'?['-F']:[],program=wantsPerl(ctx.args)?'grep-perl':'grep';
    return first.length?withArgs(ctx,[...first,...ctx.args],program):runReal(ctx,program);
  };
  for(const name of ['awk','gawk','grep','egrep','fgrep','sed','diff','cmp',...CORE]){
    const program=name==='awk'?'gawk':name==='egrep'||name==='fgrep'?'grep':name;
    T[name]={summary:'GNU '+name+' (real WebAssembly executable)',man:`This is GNU ${name}. Type  ${name} --help  to see the options it supports, and  help  for an overview of the shell itself.`,run:ctx=>program==='grep'?grepRun(ctx,name):name==='date'?withArgs(ctx,dateArgs(ctx),program):name==='cat'?catRun(ctx):name==='tee'?teeRun(ctx):runReal(ctx,program)};
    delete MG.shellBuiltins[name];
  }
})();
