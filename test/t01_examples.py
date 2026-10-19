"""What the instructions show R printing (the Console snippets made with lib.rc() and lib.console()) is what R really
prints, in webR's R in RStudio's Console, with the Console 80 characters wide. The commands are run in the order the
instructions show them, after the week's PRELUDE (loading the tidyverse and setting the working directory), as a
student would run them. Downloads the tidyverse (about a minute).
Run:  python3 test/t01_examples.py [week2 week3 week4 week5]"""
import importlib
import sys
import time
from student import Student, check
import lib

which = sys.argv[1:] or ['week2', 'week3', 'week4', 'week5']

for name in which:
    mod = importlib.import_module(name)
    lib.EXAMPLES.clear()
    mod.ALL()
    ex = list(lib.EXAMPLES)
    print(len([e for e in ex if not e.get('silent')]), 'examples in', name)
    s = Student(name + '.html')
    t0 = time.time()
    s.run('install.packages("tidyverse")')
    for line in mod.PRELUDE.strip().split('\n'):
        s.run(line.replace('suppressMessages(library(tidyverse))', 'library(tidyverse)'))
    print(f'set up in {time.time() - t0:.0f} s')
    s.examples(ex)
    errs = [e for e in s.p.errors if "'serviceWorker' property" not in e]
    check(not errs, f'no errors in the page ({errs[:3]})')
    s.close()

print('failed:', check.failed)
sys.exit(1 if check.failed else 0)
