# The data of the practicals

The five files in this folder are copied into each student's `~/data` folder the first time they open a practical (this file is not). They were made by [build/data-prep/make_data.R](../build/data-prep/make_data.R), which downloads or loads the original data and makes all five files; run again on 19 October 2026, it reproduced them byte for byte.

| File | Size | What it holds | Used in |
| --- | --- | --- | --- |
| `famuss.csv` | 1.1 MB | The FAMuSS study: 1,397 people, 13 measurements and 222 SNPs | weeks 2 to 5 |
| `leukaemia.csv` | 5 KB | 89 adults with B-cell acute lymphoblastic leukaemia: their details and the expression of five genes | weeks 3 and 4 |
| `all_expression.csv` | 5.1 MB | The expression of all 12,625 probes of the microarray in 79 of those patients | week 5 |
| `hgdp_akt1.csv` | 75 KB | 1,064 people from 51 populations around the world, genotyped at four SNPs in *AKT1* | week 5 |
| `virco.csv` | 675 KB | 1,066 samples of HIV-1: the amino acid at each position of the protease, and resistance to protease inhibitors | week 5 |

Three of the original files come from the data page of Andrea Foulkes's book, *Applied Statistical Genetics with R: For Population-based Association Studies* (Springer, 2009), at `https://www.biostat.umn.edu/~cavanr/`. They are the files that the original practicals of the module read from that page. The other two come from Bioconductor's ALL package.

## famuss.csv: the FAMuSS study

**The study.** FAMuSS (Functional SNPs Associated with Muscle Size and Strength) enrolled young adults who trained their non-dominant arm for 12 weeks, and measured their strength before and after: Thompson PD and others, “Functional polymorphisms associated with human muscle size and strength”, *Medicine & Science in Sports & Exercise* 36:1132–1139 (2004). The association between ACTN3 R577X and the gain in strength, and its difference between women and men, was reported by Clarkson PM and others, “ACTN3 genotype is associated with increases in muscle strength in response to resistance training in women”, *Journal of Applied Physiology* 99:154–163 (2005).

**The original file.** `FMS_data.txt` (tab-separated; 1,397 rows and 347 columns), downloaded from `https://www.biostat.umn.edu/~cavanr/FMS_data.txt` on 19 October 2026 (SHA-256 `66624be02a612162a39a717ff56ef3774077b0ed03fdd89d4f25eaccc2c359c5`).

**What was done to it.**

- Kept 13 variables: `id`, `Gender`, `Age`, `Race`, `Pre.height` (inches), `Pre.weight` (pounds), `pre.BMI`, `Pre_NDRM_Max`, `Post_NDRM_Max` and `NDRM.CH` (the heaviest weight lifted with the non-dominant arm before and after the training, in pounds, and its percentage change), and `Pre_DRM_Max`, `Post_DRM_Max` and `DRM.CH` (the same for the dominant arm).
- Kept the 222 SNPs whose genotypes are written as two letters (A, C, G and T, or D and I for the deletion and insertion of `ace_id`), and turned the codes of failed genotypes (`Und`, `xx` and `XX`) into missing values. Three SNPs coded in other ways (`b2b`, `hsd11b1_rs860185` and `pai1_4g5g`) were left out.
- Left out the other 109 columns (the study centre and term, blood pressure, blood lipids and insulin, the volumes of muscle, fat and bone from MRI, the repeated measurements of strength, and so on).
- Wrote it as a CSV file, with missing values as empty fields. The values themselves were not changed.

## leukaemia.csv and all_expression.csv: the ALL study

**The study.** Microarrays (Affymetrix HG-U95Av2) of the leukaemic cells of 128 adults with acute lymphoblastic leukaemia (ALL), from the Ritz laboratory at the Dana-Farber Cancer Institute: Chiaretti S and others, “Gene expression profile of adult T-cell acute lymphocytic leukemia identifies distinct subsets of patients with different response to therapy and survival”, *Blood* 103:2771–2778 (2004).

**The original data.** Bioconductor's data package [ALL](https://bioconductor.org/packages/ALL/) (version 1.54.0), which holds the RMA-normalised (log2) expression of 12,625 probes and the patients' details, and the annotation package [hgu95av2.db](https://bioconductor.org/packages/hgu95av2.db/) (version 3.13.0), for the genes' symbols. Both are licensed under the Artistic License 2.0.

**What was done to it.**

- `leukaemia.csv`: the 89 patients with B-cell ALL (`BT` B, B1, B2, B3 or B4) whose molecular subtype (`mol.biol`) is NEG, BCR/ABL or ALL1/AF4. The columns are `sample` (the package's sample name with a P in front, such as P01005), `sex`, `age`, `BT`, `mol.biol`, `remission` (CR or REF; missing for 10 patients) and the expression of five probes, rounded to two decimal places: ABL1 (`1636_g_at`), HOXA9 (`37809_at`), MEIS1 (`40763_at`), CD52 (`34210_at`) and RAG1 (`1077_at`).
- `all_expression.csv`: the expression of all 12,625 probes in the 79 of those patients whose subtype is NEG (42) or BCR/ABL (37), rounded to two decimal places. One row per probe: `probe`, `symbol` (the gene's symbol from hgu95av2.db, the first one when a probe has several; empty for the 494 probes without one), and one column per patient, named as in `leukaemia.csv` and in the same order. (Because the values are rounded, results calculated from this file can differ very slightly from those calculated from the package: for example, 162 probes pass the Benjamini–Hochberg correction in week 5, against 163 with the unrounded values.)

## hgdp_akt1.csv: the Human Genome Diversity Project

**The study.** The HGDP–CEPH Human Genome Diversity Cell Line Panel: Cann HM and others, “A human genome diversity cell line panel”, *Science* 296:261–262 (2002).

**The original file.** `HGDP_AKT1.txt` (tab-separated; 1,064 rows), downloaded from `https://www.biostat.umn.edu/~cavanr/HGDP_AKT1.txt` on 19 October 2026 (SHA-256 `4ea550080dce1367d556eb050c95bbcc11fd2383185f0c5cfce46354eb99d4fe`).

**What was done to it.** Left out the row numbers and the column `Well` (the position of the sample on its plate); removed the spaces at the ends of some names of populations (such as `Biaka Pygmies `); turned empty genotypes into missing values; and wrote it as a CSV file. The columns are `ID`, `Gender`, `Population`, `Geographic.origin`, `Geographic.area` and the genotypes at four SNPs in *AKT1*: `AKT1.C0756A`, `AKT1.C6024T`, `AKT1.G2347T` and `AKT1.G2375A`.

## virco.csv: HIV-1 drug resistance

**The data.** For 1,066 samples of HIV-1 (1,038 from patients and 28 laboratory strains), the amino acid at each of the 99 positions of the virus's protease, and its susceptibility to eight protease inhibitors measured by Virco: the fold change (`APV.Fold`, `ATV.Fold`, `IDV.Fold`, `LPV.Fold`, `NFV.Fold`, `RTV.Fold`, `SQV.Fold` and `TPV.Fold`) is how many times as much drug it takes to inhibit the virus as a reference virus. The positions (`P1` to `P99`) follow the conventions of the [Stanford HIV Drug Resistance Database](https://hivdb.stanford.edu/): a dash is the amino acid of the consensus subtype B sequence, a full stop means that there is no sequence at that position, and letters are the amino acids found (two or more letters for a mixture). The last three columns list the mutations.

**The original file.** `Virco_data.csv`, downloaded from `https://www.biostat.umn.edu/~cavanr/Virco_data.csv` on 19 October 2026 (SHA-256 `783f659efb3fafb37314742b4488d2e5fefebfc1c3e0b895067c30d051c9f420`).

**What was done to it.** Nothing: `virco.csv` is a copy of it under another name.

## Licences

- The files made from the ALL package (`leukaemia.csv` and `all_expression.csv`) are derived from data under the Artistic License 2.0, which allows them to be redistributed.
- The book's data page doesn't state a licence for `FMS_data.txt`, `HGDP_AKT1.txt` and `Virco_data.csv`. They are published there for teaching with the book, and they are widely used in teaching, but whoever publishes this site should be content that redistributing copies of them (as `famuss.csv`, `hgdp_akt1.csv` and `virco.csv`) is acceptable, or ask the book's author.
