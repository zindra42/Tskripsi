"use client";

import { useActionState, useId } from "react";
import { semproAction, type SemproFormState } from "@/app/actions/sempro";

function Feedback({ state }: { state: SemproFormState }) {
  if (state.error) {
    return (
      <div className="rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700">
        {state.error}
      </div>
    );
  }
  if (state.success) {
    return (
      <div className="rounded border border-emerald-200 bg-emerald-50 p-2 text-xs text-emerald-700">
        {state.success}
      </div>
    );
  }
  return null;
}

export function ChecklistUploadForm({
  pendaftaranId,
  nomorItem,
  label,
}: {
  pendaftaranId: string;
  nomorItem: number;
  label: string;
}) {
  const [state, action, isPending] = useActionState(semproAction, {});
  const key = useId();

  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="key" value={key} />
      <input type="hidden" name="command" value="upload-checklist" />
      <input type="hidden" name="pendaftaranId" value={pendaftaranId} />
      <input type="hidden" name="nomorItem" value={nomorItem} />

      <label className="text-xs font-semibold text-slate-700">
        Unggah {label} (PDF, maks 2MB / proposal 10MB)
      </label>
      <div className="flex items-center gap-2">
        <input
          type="file"
          name="file"
          accept=".pdf,.png,.jpg,.jpeg"
          required
          className="block w-full text-xs text-slate-600 file:mr-2 file:rounded file:border-0 file:bg-slate-100 file:px-2 file:py-1 file:text-xs file:font-medium file:text-slate-700 hover:file:bg-slate-200"
        />
        <button
          type="submit"
          disabled={isPending}
          className="rounded bg-sky-700 px-3 py-1 text-xs font-medium text-white shadow hover:bg-sky-800 disabled:opacity-50"
        >
          {isPending ? "Mengunggah..." : "Unggah"}
        </button>
      </div>
      <Feedback state={state} />
    </form>
  );
}

export function CentangMandiriForm({
  pendaftaranId,
  nomorItem,
  isCentang,
}: {
  pendaftaranId: string;
  nomorItem: number;
  isCentang: boolean;
}) {
  const [state, action, isPending] = useActionState(semproAction, {});
  const key = useId();

  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="key" value={key} />
      <input type="hidden" name="command" value="centang-checklist" />
      <input type="hidden" name="pendaftaranId" value={pendaftaranId} />
      <input type="hidden" name="nomorItem" value={nomorItem} />
      <input type="hidden" name="centang" value={isCentang ? "false" : "true"} />

      <button
        type="submit"
        disabled={isPending}
        className={`rounded px-3 py-1 text-xs font-medium transition ${
          isCentang
            ? "bg-emerald-600 text-white hover:bg-emerald-700"
            : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
        } disabled:opacity-50`}
      >
        {isPending
          ? "Menyimpan..."
          : isCentang
          ? "✓ Sudah Dicetak 3 Rangkap"
          : "Centang Pernyataan Mandiri"}
      </button>
      <Feedback state={state} />
    </form>
  );
}

export function SubmitSemproForm({ pendaftaranId }: { pendaftaranId: string }) {
  const [state, action, isPending] = useActionState(semproAction, {});
  const key = useId();

  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="key" value={key} />
      <input type="hidden" name="command" value="submit-sempro" />
      <input type="hidden" name="pendaftaranId" value={pendaftaranId} />

      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-emerald-700 disabled:opacity-50"
      >
        {isPending ? "Mengirim Pendaftaran..." : "Ajukan Pendaftaran Seminar Proposal"}
      </button>
      <Feedback state={state} />
    </form>
  );
}

export function VerifikasiItemForm({ checklistItemId }: { checklistItemId: string }) {
  const [state, action, isPending] = useActionState(semproAction, {});
  const key = useId();

  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="key" value={key} />
      <input type="hidden" name="command" value="verifikasi-checklist" />
      <input type="hidden" name="checklistItemId" value={checklistItemId} />

      <input
        type="text"
        name="catatan"
        placeholder="Catatan verifikator (opsional jika ditolak)"
        className="w-full rounded border border-slate-300 p-1.5 text-xs text-slate-800"
      />
      <div className="flex gap-2">
        <button
          type="submit"
          name="status"
          value="diverifikasi"
          disabled={isPending}
          className="rounded bg-emerald-600 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {isPending ? "Memproses..." : "Setujui"}
        </button>
        <button
          type="submit"
          name="status"
          value="ditolak"
          disabled={isPending}
          className="rounded bg-rose-600 px-3 py-1 text-xs font-medium text-white hover:bg-rose-700 disabled:opacity-50"
        >
          {isPending ? "Memproses..." : "Tolak"}
        </button>
      </div>
      <Feedback state={state} />
    </form>
  );
}

export function TetapkanPengujiForm({
  pendaftaranId,
  lecturers,
}: {
  pendaftaranId: string;
  lecturers: { id: string; nama: string }[];
}) {
  const [state, action, isPending] = useActionState(semproAction, {});
  const key = useId();

  return (
    <form action={action} className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <input type="hidden" name="key" value={key} />
      <input type="hidden" name="command" value="tetapkan-penguji" />
      <input type="hidden" name="pendaftaranId" value={pendaftaranId} />

      <h4 className="text-sm font-semibold text-slate-800">Tetapkan Dewan Penguji</h4>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-slate-600">Penguji 1 (Ketua Dewan)</label>
        <select
          name="penguji1Id"
          required
          className="rounded border border-slate-300 p-1.5 text-xs text-slate-800"
        >
          <option value="">Pilih Dosen Penguji 1</option>
          {lecturers.map((l) => (
            <option key={l.id} value={l.id}>
              {l.nama}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-slate-600">Penguji 2 (Anggota Dewan)</label>
        <select
          name="penguji2Id"
          required
          className="rounded border border-slate-300 p-1.5 text-xs text-slate-800"
        >
          <option value="">Pilih Dosen Penguji 2</option>
          {lecturers.map((l) => (
            <option key={l.id} value={l.id}>
              {l.nama}
            </option>
          ))}
        </select>
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="rounded bg-sky-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-800 disabled:opacity-50"
      >
        {isPending ? "Menetapkan..." : "Simpan Penugasan Penguji"}
      </button>
      <Feedback state={state} />
    </form>
  );
}

export function AturJadwalForm({ pendaftaranId }: { pendaftaranId: string }) {
  const [state, action, isPending] = useActionState(semproAction, {});
  const key = useId();

  return (
    <form action={action} className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <input type="hidden" name="key" value={key} />
      <input type="hidden" name="command" value="atur-jadwal" />
      <input type="hidden" name="pendaftaranId" value={pendaftaranId} />

      <h4 className="text-sm font-semibold text-slate-800">Jadwalkan Seminar Proposal</h4>

      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-600">Tanggal (Senin - Jumat)</label>
          <input
            type="date"
            name="tanggal"
            required
            className="rounded border border-slate-300 p-1.5 text-xs text-slate-800"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-600">Ruangan</label>
          <input
            type="text"
            name="ruang"
            placeholder="misal: Ruang Seminar FRS 1"
            required
            className="rounded border border-slate-300 p-1.5 text-xs text-slate-800"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-600">Waktu Mulai (WITA)</label>
          <input
            type="time"
            name="waktuMulai"
            defaultValue="09:00"
            required
            className="rounded border border-slate-300 p-1.5 text-xs text-slate-800"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-600">Waktu Selesai (WITA)</label>
          <input
            type="time"
            name="waktuSelesai"
            defaultValue="11:00"
            required
            className="rounded border border-slate-300 p-1.5 text-xs text-slate-800"
          />
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-slate-600">Alasan Perubahan (jika reschedule)</label>
        <input
          type="text"
          name="alasanPerubahan"
          placeholder="Opsional jika penjadwalan ulang"
          className="rounded border border-slate-300 p-1.5 text-xs text-slate-800"
        />
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="rounded bg-sky-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-800 disabled:opacity-50"
      >
        {isPending ? "Memproses..." : "Terbitkan Jadwal & Kirim Permintaan Konfirmasi"}
      </button>
      <Feedback state={state} />
    </form>
  );
}

export function KonfirmasiJadwalForm({ jadwalId }: { jadwalId: string }) {
  const [state, action, isPending] = useActionState(semproAction, {});
  const key = useId();

  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="key" value={key} />
      <input type="hidden" name="command" value="konfirmasi-jadwal" />
      <input type="hidden" name="jadwalId" value={jadwalId} />

      <input
        type="text"
        name="catatan"
        placeholder="Catatan (opsional jika ada permohonan perubahan)"
        className="rounded border border-slate-300 p-1.5 text-xs text-slate-800"
      />

      <div className="flex gap-2">
        <button
          type="submit"
          name="status"
          value="bersedia"
          disabled={isPending}
          className="rounded bg-emerald-600 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {isPending ? "Menyimpan..." : "✓ Bersedia Hadir Sesuai Jadwal"}
        </button>
        <button
          type="submit"
          name="status"
          value="tidak_bersedia"
          disabled={isPending}
          className="rounded bg-rose-600 px-3 py-1 text-xs font-medium text-white hover:bg-rose-700 disabled:opacity-50"
        >
          {isPending ? "Menyimpan..." : "✗ Berhalangan / Tolak"}
        </button>
      </div>
      <Feedback state={state} />
    </form>
  );
}

export function CatatKehadiranForm({ jadwalId }: { jadwalId: string }) {
  const [state, action, isPending] = useActionState(semproAction, {});
  const key = useId();

  return (
    <form action={action} className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <input type="hidden" name="key" value={key} />
      <input type="hidden" name="command" value="catat-kehadiran" />
      <input type="hidden" name="jadwalId" value={jadwalId} />

      <h4 className="text-sm font-semibold text-slate-800">Absensi Peserta Seminar (Foto Selfie)</h4>
      <p className="text-xs text-slate-500">
        Ambil foto selfie di dalam ruangan seminar proposal saat acara berlangsung.
      </p>

      <input
        type="file"
        name="file"
        accept="image/*"
        capture="user"
        required
        className="block w-full text-xs text-slate-600 file:mr-2 file:rounded file:border-0 file:bg-slate-100 file:px-2 file:py-1 file:text-xs file:font-medium file:text-slate-700 hover:file:bg-slate-200"
      />

      <button
        type="submit"
        disabled={isPending}
        className="rounded bg-sky-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-800 disabled:opacity-50"
      >
        {isPending ? "Mencatat Kehadiran..." : "Kirim Bukti Kehadiran"}
      </button>
      <Feedback state={state} />
    </form>
  );
}

export function NilaiPengujiForm({ jadwalId }: { jadwalId: string }) {
  const [state, action, isPending] = useActionState(semproAction, {});
  const key = useId();

  return (
    <form action={action} className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <input type="hidden" name="key" value={key} />
      <input type="hidden" name="command" value="submit-nilai-penguji" />
      <input type="hidden" name="jadwalId" value={jadwalId} />

      <h4 className="text-sm font-semibold text-slate-800">Formulir Penilaian Dosen Penguji</h4>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs font-medium text-slate-600">Presentasi (0 - 100)</label>
          <input
            type="number"
            name="presentasi"
            min="0"
            max="100"
            required
            className="w-full rounded border border-slate-300 p-1 text-xs text-slate-800"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-600">Penguasaan Materi (0 - 100)</label>
          <input
            type="number"
            name="materi"
            min="0"
            max="100"
            required
            className="w-full rounded border border-slate-300 p-1 text-xs text-slate-800"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-600">Metodologi (0 - 100)</label>
          <input
            type="number"
            name="metodologi"
            min="0"
            max="100"
            required
            className="w-full rounded border border-slate-300 p-1 text-xs text-slate-800"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-600">Alat Bantu (0 - 100)</label>
          <input
            type="number"
            name="alatBantu"
            min="0"
            max="100"
            required
            className="w-full rounded border border-slate-300 p-1 text-xs text-slate-800"
          />
        </div>
        <div className="col-span-2">
          <label className="text-xs font-medium text-slate-600">Penampilan (0 - 100)</label>
          <input
            type="number"
            name="penampilan"
            min="0"
            max="100"
            required
            className="w-full rounded border border-slate-300 p-1 text-xs text-slate-800"
          />
        </div>
      </div>

      <div>
        <label className="text-xs font-medium text-slate-600">Catatan Penilaian</label>
        <textarea
          name="catatan"
          rows={2}
          className="w-full rounded border border-slate-300 p-1 text-xs text-slate-800"
        />
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="rounded bg-sky-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-800 disabled:opacity-50"
      >
        {isPending ? "Menyimpan Nilai..." : "Kirim Nilai Penguji"}
      </button>
      <Feedback state={state} />
    </form>
  );
}

export function NilaiPembimbingForm({ jadwalId }: { jadwalId: string }) {
  const [state, action, isPending] = useActionState(semproAction, {});
  const key = useId();

  return (
    <form action={action} className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <input type="hidden" name="key" value={key} />
      <input type="hidden" name="command" value="submit-nilai-pembimbing" />
      <input type="hidden" name="jadwalId" value={jadwalId} />

      <h4 className="text-sm font-semibold text-slate-800">Formulir Penilaian Dosen Pembimbing</h4>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs font-medium text-slate-600">Presentasi (0 - 100)</label>
          <input
            type="number"
            name="presentasi"
            min="0"
            max="100"
            required
            className="w-full rounded border border-slate-300 p-1 text-xs text-slate-800"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-600">Alat Bantu (0 - 100)</label>
          <input
            type="number"
            name="alatBantu"
            min="0"
            max="100"
            required
            className="w-full rounded border border-slate-300 p-1 text-xs text-slate-800"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-600">Penampilan (0 - 100)</label>
          <input
            type="number"
            name="penampilan"
            min="0"
            max="100"
            required
            className="w-full rounded border border-slate-300 p-1 text-xs text-slate-800"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-600">Penguasaan Materi (0 - 100)</label>
          <input
            type="number"
            name="materi"
            min="0"
            max="100"
            required
            className="w-full rounded border border-slate-300 p-1 text-xs text-slate-800"
          />
        </div>
        <div className="col-span-2">
          <label className="text-xs font-medium text-slate-600">Kelayakan Proposal (0 - 100)</label>
          <input
            type="number"
            name="kelayakanProposal"
            min="0"
            max="100"
            required
            className="w-full rounded border border-slate-300 p-1 text-xs text-slate-800"
          />
        </div>
      </div>

      <div>
        <label className="text-xs font-medium text-slate-600">Catatan Pembimbing</label>
        <textarea
          name="catatan"
          rows={2}
          className="w-full rounded border border-slate-300 p-1 text-xs text-slate-800"
        />
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="rounded bg-sky-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-800 disabled:opacity-50"
      >
        {isPending ? "Menyimpan Nilai..." : "Kirim Nilai Pembimbing"}
      </button>
      <Feedback state={state} />
    </form>
  );
}

export function KeputusanPenguji1Form({ jadwalId }: { jadwalId: string }) {
  const [state, action, isPending] = useActionState(semproAction, {});
  const key = useId();

  return (
    <form action={action} className="flex flex-col gap-3 rounded-lg border border-amber-200 bg-amber-50/50 p-4 shadow-sm">
      <input type="hidden" name="key" value={key} />
      <input type="hidden" name="command" value="simpan-keputusan-penguji1" />
      <input type="hidden" name="jadwalId" value={jadwalId} />

      <h4 className="text-sm font-semibold text-slate-800">
        Tier 1: Keputusan Dewan Penguji (Penguji 1 / Ketua)
      </h4>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-slate-600">Hasil Keputusan Dewan</label>
        <select
          name="keputusan"
          required
          className="rounded border border-slate-300 p-1.5 text-xs text-slate-800"
        >
          <option value="lulus">Lulus Tanpa Revisi</option>
          <option value="lulus_revisi">Lulus dengan Revisi</option>
          <option value="tidak_lulus">Tidak Lulus (Seminar Ulang)</option>
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-slate-600">Catatan Revisi Dewan</label>
        <textarea
          name="catatan"
          rows={2}
          placeholder="Rincian perbaikan yang disepakati dewan penguji..."
          className="rounded border border-slate-300 p-1.5 text-xs text-slate-800"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-slate-600">Tenggat Revisi (jika ada)</label>
        <input
          type="date"
          name="tenggatRevisi"
          className="rounded border border-slate-300 p-1.5 text-xs text-slate-800"
        />
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="rounded bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-50"
      >
        {isPending ? "Menyimpan..." : "Simpan Keputusan Dewan Penguji"}
      </button>
      <Feedback state={state} />
    </form>
  );
}

export function SahkanHasilSemproForm({ jadwalId }: { jadwalId: string }) {
  const [state, action, isPending] = useActionState(semproAction, {});
  const key = useId();

  return (
    <form action={action} className="flex flex-col gap-3 rounded-lg border border-emerald-200 bg-emerald-50/50 p-4 shadow-sm">
      <input type="hidden" name="key" value={key} />
      <input type="hidden" name="command" value="sahkan-hasil-sempro" />
      <input type="hidden" name="jadwalId" value={jadwalId} />

      <h4 className="text-sm font-semibold text-slate-800">
        Tier 2: Pengesahan Hasil Kelulusan (Kaprodi)
      </h4>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-slate-600">Keputusan Final</label>
        <select
          name="hasil"
          required
          className="rounded border border-slate-300 p-1.5 text-xs text-slate-800"
        >
          <option value="lulus">Lulus Tanpa Revisi</option>
          <option value="lulus_revisi">Lulus dengan Revisi</option>
          <option value="tidak_lulus">Tidak Lulus (Seminar Ulang)</option>
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-slate-600">Catatan Pengesahan</label>
        <textarea
          name="catatan"
          rows={2}
          placeholder="Catatan pimpinan program studi..."
          className="rounded border border-slate-300 p-1.5 text-xs text-slate-800"
        />
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="rounded bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
      >
        {isPending ? "Mengesahkan..." : "Sahkan Hasil & Terbitkan Berita Acara"}
      </button>
      <Feedback state={state} />
    </form>
  );
}

export function UnggahRevisiForm({ beritaAcaraId }: { beritaAcaraId: string }) {
  const [state, action, isPending] = useActionState(semproAction, {});
  const key = useId();

  return (
    <form action={action} className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <input type="hidden" name="key" value={key} />
      <input type="hidden" name="command" value="unggah-revisi" />
      <input type="hidden" name="beritaAcaraId" value={beritaAcaraId} />

      <h4 className="text-sm font-semibold text-slate-800">Unggah Draf Revisi Proposal</h4>
      <input
        type="file"
        name="file"
        accept=".pdf"
        required
        className="block w-full text-xs text-slate-600 file:mr-2 file:rounded file:border-0 file:bg-slate-100 file:px-2 file:py-1 file:text-xs file:font-medium file:text-slate-700 hover:file:bg-slate-200"
      />
      <input
        type="text"
        name="catatan"
        placeholder="Ringkasan poin yang telah direvisi..."
        className="rounded border border-slate-300 p-1.5 text-xs text-slate-800"
      />

      <button
        type="submit"
        disabled={isPending}
        className="rounded bg-sky-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-800 disabled:opacity-50"
      >
        {isPending ? "Mengunggah..." : "Kirim Naskah Revisi"}
      </button>
      <Feedback state={state} />
    </form>
  );
}

export function DispensasiForm({ pendaftaranId }: { pendaftaranId: string }) {
  const [state, action, isPending] = useActionState(semproAction, {});
  const key = useId();

  return (
    <form action={action} className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <input type="hidden" name="key" value={key} />
      <input type="hidden" name="command" value="ajukan-dispensasi" />
      <input type="hidden" name="pendaftaranId" value={pendaftaranId} />

      <h4 className="text-sm font-semibold text-slate-800">Permohonan Dispensasi Kehadiran</h4>
      <p className="text-xs text-slate-500">
        Ajukan dispensasi jika Anda berada pada urutan awal seminar proposal di mana jumlah seminar yang dapat dihadiri masih terbatas.
      </p>

      <textarea
        name="alasan"
        rows={2}
        required
        placeholder="Alasan pengajuan dispensasi..."
        className="rounded border border-slate-300 p-1.5 text-xs text-slate-800"
      />

      <button
        type="submit"
        disabled={isPending}
        className="rounded bg-sky-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-800 disabled:opacity-50"
      >
        {isPending ? "Mengajukan..." : "Kirim Permohonan Dispensasi"}
      </button>
      <Feedback state={state} />
    </form>
  );
}
