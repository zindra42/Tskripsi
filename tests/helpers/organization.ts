export function program(id = 1n, fakultasId = 1n) {
  return { id, fakultasId, kode: `P${id}`, nama: "Informatika", jenjang: "S1", aktif: true,
    fakultas: { id: fakultasId, kode: `F${fakultasId}`, nama: `Fakultas ${fakultasId}`, aktif: true } };
}
export function affiliation(id = 1n, fakultasId = 1n) {
  return { programStudiId: id, programStudi: program(id, fakultasId) };
}
