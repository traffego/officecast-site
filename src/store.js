'use strict';
// Persistência em arquivos JSON no servidor.
// - Gravação atômica (arquivo temporário + rename) para não corromper dados em caso de queda.
// - Backup da versão anterior a cada gravação de conteúdo (mantém os últimos N).
// - Fila de escrita: alterações simultâneas são aplicadas em sequência.
const fs = require('node:fs');
const path = require('node:path');

const MAX_BACKUPS = 40;

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJsonAtomic(file, data) {
  const dir = path.dirname(file);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(dir, `.${path.basename(file)}.${process.pid}.${Date.now()}.tmp`);
  const fd = fs.openSync(tmp, 'w');
  try {
    fs.writeSync(fd, JSON.stringify(data, null, 2));
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmp, file);
}

class JsonDocument {
  constructor(file, { initial, backupDir } = {}) {
    this.file = file;
    this.backupDir = backupDir || null;
    this.queue = Promise.resolve();
    if (!fs.existsSync(file)) {
      const start = typeof initial === 'function' ? initial() : initial;
      writeJsonAtomic(file, start === undefined ? {} : start);
    }
    this.data = readJson(file);
  }

  get() {
    return this.data;
  }

  // fn recebe uma cópia profunda; o que ela retornar (ou a própria cópia alterada) é gravado.
  update(fn) {
    const run = async () => {
      const draft = structuredClone(this.data);
      const result = await fn(draft);
      const next = result === undefined ? draft : result;
      if (this.backupDir && fs.existsSync(this.file)) this.backup();
      writeJsonAtomic(this.file, next);
      this.data = next;
      return next;
    };
    const p = this.queue.then(run, run);
    this.queue = p.catch(() => {});
    return p;
  }

  backup() {
    fs.mkdirSync(this.backupDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const base = path.basename(this.file, '.json');
    fs.copyFileSync(this.file, path.join(this.backupDir, `${base}-${stamp}.json`));
    const old = fs.readdirSync(this.backupDir).filter((f) => f.startsWith(base + '-')).sort();
    while (old.length > MAX_BACKUPS) fs.rmSync(path.join(this.backupDir, old.shift()));
  }
}

function openStores(config) {
  fs.mkdirSync(config.dataDir, { recursive: true });
  for (const sub of ['uploads', 'thumbs', 'backups']) fs.mkdirSync(path.join(config.dataDir, sub), { recursive: true });
  const content = new JsonDocument(path.join(config.dataDir, 'content.json'), {
    initial: () => readJson(config.seedFile),
    backupDir: path.join(config.dataDir, 'backups'),
  });
  const submissions = new JsonDocument(path.join(config.dataDir, 'submissions.json'), {
    initial: { contact: [], waitlist: [] },
  });
  return { content, submissions };
}

module.exports = { JsonDocument, openStores, writeJsonAtomic, readJson };
