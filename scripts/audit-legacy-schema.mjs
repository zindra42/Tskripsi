// Offline source inspection only: no Laravel bootstrap, SQL execution or database client.
import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

const root = process.argv[2];
if (!root) throw new Error('Usage: node scripts/audit-legacy-schema.mjs <Laravel source root>');
const sha = (s) => createHash('sha256').update(s).digest('hex');
// Preserve offsets and quoted URLs while removing PHP comments. No PHP is executed.
function clean(source) {
  const chars = [...source]; let quote = '';
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    if (quote) { if (c === '\\') i++; else if (c === quote) quote = ''; continue; }
    if (c === '"' || c === "'") { quote = c; continue; }
    const block = c === '/' && chars[i + 1] === '*';
    if (block || c === '/' && chars[i + 1] === '/' || c === '#') {
      let j = i + (c === '#' ? 1 : 2);
      if (block) { while (j < chars.length && !(chars[j] === '*' && chars[j + 1] === '/')) j++; j += 2; }
      else while (j < chars.length && chars[j] !== '\n') j++;
      for (let k = i; k < j; k++) if (chars[k] !== '\n') chars[k] = ' ';
      i = j - 1;
    }
  }
  return chars.join('');
}
function closing(s, start) {
  let depth = 0, quote = '';
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (quote) { if (c === '\\') i++; else if (c === quote) quote = ''; continue; }
    if (c === '"' || c === "'") { quote = c; continue; }
    if (c === '{') depth++;
    if (c === '}' && --depth === 0) return i;
  }
  throw new Error('Unbalanced source');
}
const tables = {}, migrations = [], drops = [], operations = [];
const folder = path.join(root, 'database/migrations');
for (const file of (await readdir(folder)).filter((f) => f.endsWith('.php')).sort()) {
  if (!file.startsWith('0001_') && file.slice(0, 10) > '2026_11_05') throw new Error(`Migration beyond reviewed cutoff: ${file}`);
  const source = (await readFile(path.join(folder, file), 'utf8')).replace(/\r\n/g, '\n');
  const start = source.indexOf('{', source.indexOf('function up('));
  if (start < 0) throw new Error(`Missing up(): ${file}`);
  const end = closing(clean(source), start), up = clean(source.slice(start + 1, end));
  const evidence = (index) => `${file}:${source.slice(0, start + 1 + index).split('\n').length}`;
  migrations.push({ name: file.slice(0, -4), sha256: sha(source), upSha256: sha(source.slice(start, end + 1)), upStartLine: source.slice(0, start).split('\n').length, upEndLine: source.slice(0, end).split('\n').length, dataChanges: /DB::|PengaturanSistem::/.test(up), rawSql: [...up.matchAll(/DB::statement\(("[\s\S]*?"|'[^']*')\)/g)].map((m) => ({ sql: m[1], evidence: evidence(m.index) })) });
  const events = [];
  for (const m of up.matchAll(/Schema::(create|table)\('([^']+)'[^{}]*\{/g)) {
    const open = m.index + m[0].length - 1, close = closing(up, open);
    events.push({ index: m.index, kind: m[1], table: m[2], body: up.slice(open + 1, close), open });
  }
  for (const m of up.matchAll(/Schema::drop(?:IfExists)?\('([^']+)'\)/g)) events.push({ index: m.index, kind: 'drop', table: m[1] });
  for (const ev of events.sort((a, b) => a.index - b.index)) {
    const ref = evidence(ev.index);
    if (ev.kind === 'drop') { delete tables[ev.table]; drops.push({ table: ev.table, evidence: ref }); continue; }
    const t = tables[ev.table] ??= { columns: {}, primaryKey: [], unique: [], foreignKeys: [], evidence: ref };
    for (const m of ev.body.matchAll(/\$table->([\s\S]*?);/g)) {
      const statement = m[1].replace(/\s+/g, ' ').trim();
      const op = /^(\w+)\(([^)]*)\)/.exec(statement);
      if (!op) throw new Error(`Unsupported statement: ${ref}`);
      const type = op[1], args = op[2], names = [...args.matchAll(/'([^']+)'/g)].map((n) => n[1]);
      const col = names[0], proof = evidence(ev.open + 1 + m.index);
      operations.push({ table: ev.table, statement, evidence: proof });
      if (['index','fullText','dropIndex'].includes(type)) continue;
      if (type === 'dropUnique') {
        if (!args.startsWith('[')) throw new Error(`Named unique removal needs manual review: ${proof}`);
        t.unique = t.unique.filter((u) => JSON.stringify(u) !== JSON.stringify(names)); continue;
      }
      if (type === 'dropForeign') { t.foreignKeys = t.foreignKeys.filter((f) => !names.includes(f.column)); continue; }
      if (type === 'dropColumn') { for (const n of names) { delete t.columns[n]; t.foreignKeys = t.foreignKeys.filter((f) => f.column !== n); } continue; }
      if (type === 'primary' || type === 'unique') { const cols = args.startsWith('[') ? [...args.split(']')[0].matchAll(/'([^']+)'/g)].map((n) => n[1]) : [col]; if (type === 'primary') t.primaryKey = cols; else if (!t.unique.some((a) => JSON.stringify(a) === JSON.stringify(cols))) t.unique.push(cols); continue; }
      if (type === 'timestamps') { for (const n of ['created_at','updated_at']) t.columns[n] = { type: 'timestamp', nullable: true, evidence: proof }; continue; }
      if (type === 'softDeletes') { t.columns.deleted_at = { type: 'timestamp', nullable: true, evidence: proof }; continue; }
      if (type === 'rememberToken') { t.columns.remember_token = { type: 'rememberToken', nullable: true, evidence: proof }; continue; }
      if (type === 'morphs') { t.columns[`${col}_id`] = { type: 'unsignedBigInteger', nullable: false, evidence: proof }; t.columns[`${col}_type`] = { type: 'string', nullable: false, evidence: proof }; continue; }
      const name = type === 'id' ? 'id' : col;
      if (!name) throw new Error(`Unnamed column: ${proof}`);
      // The normal chronological path does not enter !hasColumn when it already exists.
      // Preserve an existing FK on change(); a repeated add() must not invent a new FK.
      if (t.columns[name] && !statement.includes('->change()')) continue;
      t.columns[name] = { type, nullable: statement.includes('->nullable()'), definition: statement, evidence: proof };
      if (type === 'id' || statement.includes('->primary()')) t.primaryKey = [name];
      if (statement.includes('->unique(') && !t.unique.some((u) => u.length === 1 && u[0] === name)) t.unique.push([name]);
      const fk = /->constrained\('([^']+)'(?:,\s*'([^']+)')?\)/.exec(statement);
      if (fk && !t.foreignKeys.some((f) => f.column === name)) t.foreignKeys.push({ column: name, table: fk[1], target: fk[2] ?? 'id', evidence: proof });
    }
  }
  for (const raw of up.matchAll(/ALTER TABLE (\w+) MODIFY(?: COLUMN)? (\w+) ENUM\(([^)]*)\)/g)) {
    const previous = tables[raw[1]].columns[raw[2]];
    tables[raw[1]].columns[raw[2]] = { ...previous, type: 'enum', definition: `enum('${raw[2]}', [${raw[3]}])`, evidence: evidence(raw.index) };
  }
}
// MySQL branches are the source contract. Preserve explicit raw enum alterations as evidence.
const rawChanges = operations.filter((o) => /->change\(\)/.test(o.statement));
const prisma = (await readFile('prisma/schema.prisma', 'utf8')).replace(/\r\n/g, '\n');
const enums = Object.fromEntries([...prisma.matchAll(/enum (\w+) \{([^}]+)\}/g)].map((m) => [m[1], m[2].trim().split(/\s+/)]));
const models = [...prisma.matchAll(/model (\w+) \{([\s\S]*?)\n\}/g)];
const modelTables = Object.fromEntries(models.map((m) => [m[1], /@@map\("([^"]+)"\)/.exec(m[2])?.[1] ?? m[1]]));
const target = {};
for (const m of models) {
  const columns = {}, fields = {}, unique = [], foreignKeys = [];
  let primaryKey = [];
  for (const line of m[2].split('\n')) {
    const f = /^\s+(\w+)\s+(\w+)(\??)(.*)$/.exec(line);
    if (!f || f[4].startsWith('[]') || modelTables[f[2]]) continue;
    const [, field, type, optional, tail] = f, name = /@map\("([^"]+)"\)/.exec(tail)?.[1] ?? field;
    fields[field] = name;
    const def = /@default\(("[^"]*"|[^()]*)\)/.exec(tail)?.[1];
    columns[name] = { type, nullable: optional === '?', generated: /@default\((autoincrement|uuid|now)\(/.test(tail), default: def === undefined ? null : def, native: /@db\.(\w+)(?:\(([^)]*)\))?/.exec(tail)?.slice(1) ?? [], enum: enums[type] ?? null };
    if (/@id\b/.test(tail)) primaryKey = [name];
    if (/@unique\b/.test(tail)) unique.push([name]);
  }
  for (const key of ['id','unique']) for (const u of m[2].matchAll(new RegExp(`@@${key}\\(\\[([^\\]]+)\\]`, 'g'))) {
    const names = u[1].split(',').map((v) => fields[v.trim()]);
    if (key === 'id') primaryKey = names; else unique.push(names);
  }
  for (const r of m[2].matchAll(/\s+(\w+)\s+(\w+)\??\s+@relation\([^\n]*?fields: \[([^\]]+)\], references: \[([^\]]+)\]/g)) {
    const related = models.find((v) => v[1] === r[2]);
    const toField = r[4].trim(), relatedLine = related[2].split('\n').find((l) => l.trim().startsWith(toField + ' '));
    foreignKeys.push({ column: fields[r[3].trim()], table: modelTables[r[2]], target: /@map\("([^"]+)"\)/.exec(relatedLine)?.[1] ?? toField });
  }
  target[modelTables[m[1]]] = { columns, primaryKey, unique, foreignKeys };
}
await mkdir('src/lib/migration', { recursive: true });
await writeFile('src/lib/migration/source-schema.json', JSON.stringify({ format: 1, cutoff: '2026-11-05', driver: 'mysql', migrations, tables, drops, operations, rawChanges }, null, 2) + '\n');
await writeFile('src/lib/migration/target-schema.json', JSON.stringify({ schemaSha256: sha(prisma), tables: target }, null, 2) + '\n');
const gaps = Object.entries(tables).flatMap(([table, t]) => target[table] ? Object.keys(t.columns).filter((c) => !target[table].columns[c]).map((column) => ({ table, column })) : [{ table }]);
console.log(JSON.stringify({ migrations: migrations.length, sourceTables: Object.keys(tables).length, targetTables: Object.keys(target).length, gaps }, null, 2));
