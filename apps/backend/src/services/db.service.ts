import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';

export class DbService {
  private db: Database.Database;

  constructor() {
    const dbPath = process.env.DATABASE_URL || path.join(process.cwd(), 'game.db');

    // Ensure directory exists if it's a file path
    const dbDir = path.dirname(dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    this.db = new Database(dbPath);
    this.init();
  }

  private init(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS games (
        id TEXT PRIMARY KEY,
        payload TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
    console.log("[DB] SQLite initialized at", this.db.name);
  }

  public getDatabase(): Database.Database {
    return this.db;
  }
}
