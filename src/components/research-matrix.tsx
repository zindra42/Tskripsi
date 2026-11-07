import { matrixFields } from "@/lib/academic/validation";

const labels = ["Variabel penelitian", "Lokasi / objek", "Metode", "Instrumen", "Analisis data"];

export function ResearchMatrix({ value }: { value: unknown }) {
  const rows = Array.isArray(value) ? value.filter((row) => row && typeof row === "object") : [];
  if (!rows.length) return <p>Matriks penelitian belum tersedia.</p>;
  return <div className="overflow-x-auto"><table className="w-full text-left text-sm">
    <caption className="sr-only">Matriks rencana penelitian</caption>
    <thead><tr>{labels.map((label) => <th key={label} scope="col" className="border-b p-3 align-top">{label}</th>)}</tr></thead>
    <tbody>{rows.map((row, index) => <tr key={index}>{matrixFields.map((key) => <td key={key} className="border-b p-3 align-top whitespace-pre-wrap">{typeof row[key] === "string" ? row[key] : "—"}</td>)}</tr>)}</tbody>
  </table></div>;
}
