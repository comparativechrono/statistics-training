Libraries built into the WebAssembly programs
=============================================
When a program is compiled to WebAssembly, the libraries it uses are built into its .wasm file
and its JavaScript loader. The licences of those libraries ask for their notices to be
distributed with the programs, so they are collected here. The programs on this site are the ones
in ../../biowasm/: GNU coreutils (17 programs), gawk, grep 3.7, grep 3.11 with PCRE2
(grep-perl), sed, diff and cmp, and the base module. All of them are written in C.

EMSCRIPTEN-LICENSE.txt   Emscripten (the compiler's runtime and the JavaScript loaders): MIT, or
                         University of Illinois/NCSA. Used in every program
MUSL-COPYRIGHT.txt       musl, the C library: MIT. Used in every program
LLVM-LICENSE.txt         compiler-rt, LLVM's compiler support functions, which Emscripten links
                         into a program when it needs them: Apache License 2.0 with LLVM
                         exceptions (older parts are under the MIT or University of
                         Illinois/NCSA licence). Under the LLVM exception, the parts of
                         compiler-rt that compiling puts into a program don't need a notice, but
                         the text is included anyway. LLVM's C++ libraries, libc++ and
                         libc++abi, are not used by any of the programs here.

The following three texts are not used by any program on this site. They came with this folder
from the Bioinformatics workbench, where they are needed by programs built on zlib and HTSlib:
ZLIB-LICENSE.txt         zlib
BZIP2-LICENSE.txt        bzip2 (libbzip2)
XZ-COPYING.txt           XZ Utils (liblzma)
None of the .wasm files in ../../biowasm/ contains zlib, bzip2 or liblzma. This was checked on
15 October 2026 by searching the files for the tables and messages that a program containing
these libraries would have. The Biowasm build settings make Emscripten's zlib available to every
program they build (-s USE_ZLIB=1 in ../biowasm-build/bin/shared.sh), but GNU coreutils, gawk,
grep and sed don't use it, so it is not linked into them.

PCRE2, which is part of grep-perl, has its licence next to that program, in
../../biowasm/grep/3.11/PCRE2-LICENCE.

The Emscripten, musl and LLVM texts are those of Emscripten 6.0.10, which was used to compile
diff, cmp and grep-perl for the course. The Biowasm builds were made with earlier versions of
Emscripten, under the same licences.
