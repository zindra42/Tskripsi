import { stemWord } from "./stemmer";

// Keep the two source stopword sets separate. Archive seeding uses the older set.
const archiveStopwords = new Set("dan di ke dari yang untuk pada dengan adalah ini itu dalam sebagai oleh akan telah dapat atau juga ada tidak ya sudah bisa saat ketika serta agar karena bila jika maka tersebut lebih sangat hanya belum masih suatu sama antara hingga seperti yaitu sekitar sehingga".split(" "));
const titleStopwords = new Set("dan di ke dari pada untuk dengan yang oleh dalam atas ini itu sebagai adalah yaitu yakni atau karena maka jika bila saat secara suatu para antara tentang terhadap bagi serta agar supaya hingga sampai ia dia mereka kita kami kamu anda tersebut bisa dapat akan telah sudah sedang masih belum tidak bukan pun hanya juga lagi lalu kemudian setelah sebelum sesudah selama".split(" "));

export function preprocess(text: string, archive = false): string[] {
  const stopwords = archive ? archiveStopwords : titleStopwords;
  const tokens = text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/)
    .filter((word) => word.length > 1 && !stopwords.has(word)).map(stemWord)
    .filter((word) => word && (archive || !stopwords.has(word)));
  return [...new Set(tokens)];
}

export function jaccard(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const left = new Set(a);
  const right = new Set(b);
  const intersection = [...left].filter((word) => right.has(word)).length;
  return Math.round(intersection / new Set([...left, ...right]).size * 100);
}

export type ArchiveTitle = {
  id: bigint; judul: string; namaPenulis: string | null; nim: string | null; tahun: string | null;
  prodi: string | null; keywords: unknown;
};

export function keywords(value: unknown): string[] {
  if (typeof value === "string") {
    try { return keywords(JSON.parse(value)); } catch { return []; }
  }
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export function similarity(title: string, corpus: ArchiveTitle[]) {
  const input = preprocess(title);
  const matches = corpus.map((row) => ({ id: row.id.toString(), judul: row.judul,
    penulis: row.namaPenulis, nim: row.nim, tahun: row.tahun, prodi: row.prodi,
    skor: jaccard(input, keywords(row.keywords)),
  })).filter((row) => row.skor > 0).sort((a, b) => b.skor - a.skor);
  return { skor: matches[0]?.skor ?? 0, top: matches.slice(0, 3), total: matches.length };
}

export function similarityWarning(score: number | null, settings: Record<string, string>) {
  const threshold = Number(settings.threshold_peringatan_plagiasi ?? "35");
  return { threshold, high: (score ?? 0) >= threshold };
}

export function similarityColumns(result: ReturnType<typeof similarity>) {
  const top = result.top[0];
  return { skorKemiripan: result.skor, topKemiripan: result.top,
    judulTermirip: top?.judul ?? null, penulisTermirip: top?.penulis ?? null, nimTermirip: top?.nim ?? null,
    tahunTermirip: top?.tahun && /^\d{4}$/.test(top.tahun) ? Number(top.tahun) : null };
}

const recommendationStopwords = new Set("dan atau di ke dari yang untuk pada dengan dalam adalah sebagai ini itu terhadap berbasis sistem aplikasi menggunakan".split(" "));

export function recommendationScore(title: string, fields: bigint[], expertise: { bidangId: bigint; bidang: { namaBidang: string } }[], phenomenon = "", gap = "") {
  // The latter two legacy attributes were dropped by the 10 September migration.
  const corpus = `${title} ${phenomenon} ${gap}`.toLowerCase();
  const tokens = corpus.split(/[\s,.\-_:/()]+/).filter((word) => word.length >= 3 && !recommendationStopwords.has(word));
  return expertise.reduce((score, item) => {
    if (fields.length) return score + (fields.includes(item.bidangId) ? 10 : 0);
    const name = item.bidang.namaBidang.toLowerCase();
    if (corpus.includes(name)) return score + 10;
    return score + (name.split(/[\s,.\-_:/()]+/).some((word) => word.length >= 3 && tokens.includes(word)) ? 3 : 0);
  }, 0);
}
