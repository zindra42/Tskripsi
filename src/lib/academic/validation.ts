import { z } from "zod";
import { idSchema } from "@/lib/accounts/validation";

export const optionalId = z.preprocess((value) => value === "" || value == null ? null : value, idSchema.nullable());
export const matrixFields = ["variabel_penelitian", "lokasi", "metode", "instrumen", "analisis_data"] as const;
const text = z.string().trim().min(3).max(255);
export const matrixSchema = z.object({
  bidang_keahlian_id: optionalId, bidang_keahlian_2_id: optionalId,
  variabel_penelitian: text, lokasi: text, metode: text, instrumen: text, analisis_data: text,
});
export const titleSchema = z.object({
  judul: z.string().trim().min(10).max(255),
  matriks: z.array(matrixSchema).min(1).max(20),
  preferensi: z.array(idSchema).max(2).refine((ids) => new Set(ids).size === ids.length),
});
export const draftSchema = z.object({
  judul: z.string().trim().max(255),
  matriks: z.array(z.object({
    bidang_keahlian_id: optionalId, bidang_keahlian_2_id: optionalId,
    variabel_penelitian: z.string().max(255), lokasi: z.string().max(255), metode: z.string().max(255),
    instrumen: z.string().max(255), analisis_data: z.string().max(255),
  })).min(1).max(20),
  preferensi: z.array(idSchema).max(2),
});
export const reason = z.string().trim().min(5).max(1000);
export const dateOnly = z.iso.date().transform((date) => new Date(`${date}T00:00:00Z`));
export const localDateTime = z.string().regex(/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d$/).refine((value) => {
  return z.iso.date().safeParse(value.slice(0, 10)).success;
}).transform((value) => new Date(`${value}:00+08:00`));
