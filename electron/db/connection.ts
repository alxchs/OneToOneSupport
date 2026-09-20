import Database, { Database as DatabaseType } from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';

let dbInstance: DatabaseType | null = null;

export interface DbOptions {
  dbPath?: string;
  migrationsDir?: string;
}

export function getDefaultDbPath(): string {
  const appData =
    process.env.APPDATA ||
    (process.platform === 'darwin'
      ? path.join(process.env.HOME || '', 'Library', 'Application Support')
      : path.join(process.env.HOME || '', '.config'));
  return path.join(appData, 'OneToOneSupport', 'onetoone.db');
}

export function getDefaultMigrationsDir(): string {
  // Try relative to __dirname first, then fallback to project root
  const candidate1 = path.join(__dirname, 'migrations');
  if (fs.existsSync(candidate1)) {
    return candidate1;
  }
  const candidate2 = path.resolve(process.cwd(), 'electron', 'db', 'migrations');
  if (fs.existsSync(candidate2)) {
    return candidate2;
  }
  return candidate1;
}

export function initDb(options: DbOptions = {}): DatabaseType {
  const targetPath = options.dbPath || getDefaultDbPath();

  if (targetPath !== ':memory:') {
    const dir = path.dirname(targetPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  const db = new Database(targetPath);

  // Regras inegociáveis do SQLite
  db.pragma('foreign_keys = ON');
  const journalMode = db.pragma('journal_mode = WAL', { simple: true });
  if (targetPath !== ':memory:' && journalMode !== 'wal') {
    console.warn(`[DB] Aviso: journal_mode retornou '${journalMode}' em vez de 'wal'`);
  }

  // Executar migrações
  const migrationsDir = options.migrationsDir || getDefaultMigrationsDir();
  runMigrations(db, migrationsDir);

  dbInstance = db;
  return db;
}

export function getDb(): DatabaseType {
  if (!dbInstance) {
    return initDb();
  }
  return dbInstance;
}

export function closeDb(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}

export function runMigrations(db: DatabaseType, migrationsDir: string): void {
  // Criar tabela de controle de migrações se não existir
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      applied_at INTEGER NOT NULL
    );
  `);

  if (!fs.existsSync(migrationsDir)) {
    console.warn(`[DB] Diretório de migrações não encontrado: ${migrationsDir}`);
    return;
  }

  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const getMigrationStmt = db.prepare('SELECT 1 FROM _migrations WHERE name = ?');
  const recordMigrationStmt = db.prepare(
    'INSERT INTO _migrations (name, applied_at) VALUES (?, ?)'
  );

  for (const file of files) {
    const alreadyApplied = getMigrationStmt.get(file);
    if (!alreadyApplied) {
      const sqlPath = path.join(migrationsDir, file);
      const sqlContent = fs.readFileSync(sqlPath, 'utf-8');

      const applyTransaction = db.transaction(() => {
        db.exec(sqlContent);
        recordMigrationStmt.run(file, Date.now());
      });

      applyTransaction();
      console.log(`[DB] Migração aplicada com sucesso: ${file}`);
    }
  }
}
