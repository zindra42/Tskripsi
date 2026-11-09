export type TitleListParams = Record<string, string | string[] | undefined>;
export type TitleFilters = {
  q: string;
  mode: "alumni" | "pengajuan";
  angkatan: string;
  sort: "latest" | "nim-asc" | "nim-desc";
  perPage: 20 | 50 | 100;
  page: number;
};

function scalar(value: string | string[] | undefined) {
  return typeof value === "string" ? value : "";
}

export function titleFilters(params: TitleListParams): TitleFilters {
  const page = scalar(params.page);
  const perPage = scalar(params.perPage);
  const sort = scalar(params.sort);
  const angkatan = scalar(params.angkatan);
  return {
    q: scalar(params.q).trim().slice(0, 255),
    mode: scalar(params.mode) === "pengajuan" ? "pengajuan" : "alumni",
    angkatan: /^(19|20)\d{2}$/.test(angkatan) ? angkatan : "",
    sort: sort === "nim-asc" || sort === "nim-desc" ? sort : "latest",
    perPage: perPage === "50" ? 50 : perPage === "100" ? 100 : 20,
    page: /^\d+$/.test(page) ? Math.max(1, Math.min(Number(page), 2147483647)) : 1,
  };
}

// Follow semesterFromNim's four-digit rule only for NIMs of at least ten digits.
// Numeric identifiers shorter than five characters and nonnumeric legacy values are ambiguous.
export function cohortPattern(year: string) {
  const patterns = [`${year}[0-9]{6,46}`];
  const number = Number(year);
  if (number >= 1990 && number <= 2089) {
    const prefix = year.slice(2);
    patterns.push(`${prefix}[0-9]{3,${prefix === "19" || prefix === "20" ? 7 : 48}}`);
  }
  return `^(${patterns.join("|")})$`;
}

export function titleListUrl(path: string, filters: TitleFilters, changes: Partial<TitleFilters> = {}) {
  const value = { ...filters, ...changes };
  const params = new URLSearchParams({ mode: value.mode, q: value.q, angkatan: value.angkatan,
    sort: value.sort, perPage: String(value.perPage), page: String(value.page) });
  return `${path}?${params}`;
}

export function titlePage(total: number, filters: TitleFilters) {
  const pages = Math.max(1, Math.ceil(total / filters.perPage));
  const page = Math.min(filters.page, pages);
  return { total, pages, page, skip: (page - 1) * filters.perPage, take: filters.perPage };
}

export function pageLinks(page: number, pages: number): (number | "ellipsis")[] {
  const values = [...new Set([1, pages, page - 2, page - 1, page, page + 1, page + 2])]
    .filter((value) => value >= 1 && value <= pages).sort((a, b) => a - b);
  const result: (number | "ellipsis")[] = [];
  for (const value of values) {
    const previous = result.at(-1);
    if (typeof previous === "number" && value - previous > 1) result.push("ellipsis");
    result.push(value);
  }
  return result;
}
