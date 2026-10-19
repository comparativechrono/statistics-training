Licences, source code and build recipes for the bundled programs
=================================================================
This folder goes with the terminal's WebAssembly programs, which are in ../biowasm/. Please keep
it with the site: those programs are licensed under the GNU General Public License, which asks
anyone who distributes the programs to offer their source code and build scripts in the same
place.

GPL-3.0.txt                    the GNU General Public License, version 3
Apache-2.0.txt                 the Apache License, version 2.0, which covers Comlink and the SIMD
                                 check from wasm-feature-detect; both are part of
                                 ../biowasm/aioli.js (see ../biowasm/LICENSE.txt)
sources/                       the programs' source code, as released: GNU coreutils 8.32,
                                 diffutils 3.10, gawk 5.1.0, grep 3.7, grep 3.11 and sed 4.8
                                 (.tar.xz files), and PCRE2 10.42 (a .tar.bz2 file, under a BSD
                                 licence), which is part of the grep that carries out "grep -P"
source-archives.json           where each archive came from, its size and SHA-256 checksum, and
                                 how it was checked against the upstream release (with its
                                 signature, and with the published checksum where there is one)
biowasm-build/                 the Biowasm recipes for coreutils, gawk, grep 3.7 and sed (their
                                 build scripts and gawk's patch), together with the build scripts
                                 and settings of the Biowasm repository, all taken from a single
                                 pinned commit of https://github.com/biowasm/biowasm (97bb232).
                                 The commit and toolchain used to build the files on the Biowasm
                                 CDN were not recorded, so these recipes are provided for
                                 inspection and rebuilding; they are not a claim that rebuilding
                                 will produce identical programs
biowasm-build-manifest.json    a list of those files, with their paths in the Biowasm repository,
                                 their addresses and SHA-256 checksums, and the commits of the GNU
                                 sources that the recipes check out
diffutils-build/               how diff and cmp (GNU diffutils) were compiled for the course: the
                                 patch, the build script and instructions
grep-perl-build/               how GNU grep 3.11 with PCRE2 10.42 ("grep -P") was compiled for the
                                 course: the build script, one added function and instructions
runtime-libraries/             the licences of the libraries that are built into every program
                                 (Emscripten's runtime, the C library musl and LLVM's
                                 compiler-rt). Its README.txt also explains which of the texts
                                 there don't apply to any program on this site
local-patches/                 unbuffer-stdout.py, the one-byte change made to the 17 coreutils
                                 programs and to grep 3.7 (see the NOTICE.txt files in
                                 ../biowasm/coreutils/8.32/ and ../biowasm/grep/3.7/), and
                                 fix-day-of-year.py, which corrects the day of the year in the
                                 loaders of date and gawk (see ../biowasm/RUNTIME-PATCHES.txt,
                                 section 2)
shinylive-MIT.txt              the MIT licence notice of Shinylive (Posit). The site's code for
                                 running Shiny apps in a web page (the Shiny part of
                                 isolation-sw.js, assets/js/shiny.js, shiny-socket.js and the
                                 Shiny part of rsession.js) follows Shinylive's design; the file
                                 explains which parts follow which
SHA256SUMS                     checksums for everything in this folder

Each program's folder, ../biowasm/NAME/VERSION/, also contains the program's licence, a
NOTICE.txt (describing where it came from, any local changes and where its source code is) and a
SHA256SUMS file. The base module only has a notice and checksums, because its licence is
../biowasm/LICENSE.txt. ../biowasm/RUNTIME-PATCHES.txt lists the changes made to the runner and
the programs, and THIRD_PARTY.md, at the top level of the site, lists all the third-party parts
of the site.
