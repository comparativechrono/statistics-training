# Make the data files of the practicals (data/), from their public sources.
#
#   Rscript build/data-prep/make_data.R [OUTPUT_FOLDER]      (default: data, run from the top folder of the site)
#
# It downloads three files from the data page of Foulkes's book, Applied Statistical Genetics with R (Springer, 2009),
# into build/data-prep/raw/ (unless they are there already), and reads the leukaemia data from Bioconductor's ALL
# package. It needs R with the Bioconductor packages Biobase, ALL and hgu95av2.db (and AnnotationDbi, which comes with
# them):  install.packages("BiocManager"); BiocManager::install(c("Biobase", "ALL", "hgu95av2.db"))
# data/PROVENANCE.md describes the files and what was done to them.

args <- commandArgs(trailingOnly = TRUE)
out <- if (length(args)) args[1] else "data"
here <- local({
  f <- sub("^--file=", "", grep("^--file=", commandArgs(FALSE), value = TRUE))
  if (length(f)) dirname(normalizePath(f)) else "build/data-prep"
})
raw <- file.path(here, "raw")
dir.create(raw, showWarnings = FALSE)
dir.create(out, showWarnings = FALSE)

# ---- the files from the book's data page ----
base <- "https://www.biostat.umn.edu/~cavanr/"
for (f in c("FMS_data.txt", "HGDP_AKT1.txt", "Virco_data.csv")) {
  if (!file.exists(file.path(raw, f))) download.file(paste0(base, f), file.path(raw, f), mode = "wb")
}
cat("SHA-256 of the downloaded files:\n")
for (f in c("FMS_data.txt", "HGDP_AKT1.txt", "Virco_data.csv")) {
  cat(" ", f, unname(tools::sha256sum(file.path(raw, f))), "\n")
}

# ---- FAMuSS: the variables the practicals use, and every SNP coded as two letters ----
fms <- read.delim(file.path(raw, "FMS_data.txt"), stringsAsFactors = FALSE)
pheno <- c("id", "Gender", "Age", "Race", "Pre.height", "Pre.weight", "pre.BMI",
           "Pre_NDRM_Max", "Post_NDRM_Max", "NDRM.CH", "Pre_DRM_Max", "Post_DRM_Max", "DRM.CH")
# (a genotype column holds two letters, A, C, G or T, or D and I for a deletion and an insertion, apart from the codes
# for a failed genotype, "Und", "xx" and "XX", which become missing values; this leaves out three SNPs coded otherwise:
# b2b, hsd11b1_rs860185 and pai1_4g5g)
is_geno <- function(x) {
  v <- unique(na.omit(x))
  v <- v[!v %in% c("Und", "xx", "XX")]
  is.character(x) && length(v) > 0 && all(grepl("^[ACGTDI]{2}$", v))
}
geno <- setdiff(names(fms)[vapply(fms, is_geno, logical(1))], pheno)
famuss <- fms[, c(pheno, geno)]
for (g in geno) famuss[[g]][famuss[[g]] %in% c("Und", "xx", "XX")] <- NA
rownames(famuss) <- NULL
write.csv(famuss, file.path(out, "famuss.csv"), row.names = FALSE, na = "")
cat("famuss.csv:", nrow(famuss), "rows,", ncol(famuss), "columns (", length(geno), "SNPs )\n")

# ---- HGDP: the people and their genotypes at four SNPs in AKT1 (without the plate's well) ----
h <- read.delim(file.path(raw, "HGDP_AKT1.txt"), stringsAsFactors = FALSE)
hgdp <- data.frame(ID = h$ID, Gender = h$Gender, Population = trimws(h$Population),
                   Geographic.origin = trimws(h$Geographic.origin), Geographic.area = trimws(h$Geographic.area),
                   h[, grepl("^AKT1", names(h))], stringsAsFactors = FALSE)
for (s in grep("^AKT1", names(hgdp), value = TRUE)) hgdp[[s]][hgdp[[s]] == ""] <- NA
write.csv(hgdp, file.path(out, "hgdp_akt1.csv"), row.names = FALSE, na = "")
cat("hgdp_akt1.csv:", nrow(hgdp), "rows,", ncol(hgdp), "columns\n")

# ---- Virco: unchanged ----
invisible(file.copy(file.path(raw, "Virco_data.csv"), file.path(out, "virco.csv"), overwrite = TRUE))
cat("virco.csv: a copy of Virco_data.csv\n")

# ---- ALL: the B-cell leukaemias of three subtypes, five genes (leukaemia.csv), and every probe in two subtypes
# (all_expression.csv) ----
suppressMessages({
  library(Biobase)
  library(ALL)
  library(hgu95av2.db)
})
data(ALL)
b <- grepl("^B", as.character(ALL$BT))
mb <- as.character(ALL$mol.biol)
sub <- ALL[, b & mb %in% c("NEG", "BCR/ABL", "ALL1/AF4")]
pd <- pData(sub)
ids <- paste0("P", sampleNames(sub))
e <- exprs(sub)
genes <- c(ABL1 = "1636_g_at", HOXA9 = "37809_at", MEIS1 = "40763_at", CD52 = "34210_at", RAG1 = "1077_at")
leuk <- data.frame(sample = ids, sex = as.character(pd$sex), age = pd$age, BT = as.character(pd$BT),
                   mol.biol = as.character(pd$mol.biol), remission = as.character(pd$remission), stringsAsFactors = FALSE)
for (g in names(genes)) leuk[[g]] <- round(e[genes[[g]], ], 2)
write.csv(leuk, file.path(out, "leukaemia.csv"), row.names = FALSE, na = "")
cat("leukaemia.csv:", nrow(leuk), "rows,", ncol(leuk), "columns\n")
two <- pd$mol.biol %in% c("NEG", "BCR/ABL")
m <- round(e[, two], 2)
sym <- AnnotationDbi::mapIds(hgu95av2.db, rownames(m), "SYMBOL", "PROBEID", multiVals = "first")
ex <- data.frame(probe = rownames(m), symbol = unname(sym), m, check.names = FALSE, stringsAsFactors = FALSE)
names(ex)[-(1:2)] <- ids[two]
write.csv(ex, file.path(out, "all_expression.csv"), row.names = FALSE, na = "")
cat("all_expression.csv:", nrow(ex), "rows,", ncol(ex), "columns; probes without a gene symbol:", sum(is.na(sym)), "\n")
cat("ALL", as.character(packageVersion("ALL")), "and hgu95av2.db", as.character(packageVersion("hgu95av2.db")), "\n")
