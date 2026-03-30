import type { Game } from '../types/game.types.js';
import type { DbService } from './db.service.js';

export class GameStoreService {
  constructor(private readonly dbService: DbService) {}

  public save(game: Game): void {
    const db = this.dbService.getDatabase();
    const stmt = db.prepare(`
      INSERT INTO games (id, payload, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        payload = excluded.payload,
        updated_at = excluded.updated_at
    `);

    stmt.run(game.id, JSON.stringify(game), game.updatedAt || new Date().toISOString());
  }

  public getById(gameId: string): Game | undefined {
    const db = this.dbService.getDatabase();
    const stmt = db.prepare('SELECT payload FROM games WHERE id = ?');
    const row = stmt.get(gameId) as { payload: string } | undefined;

    if (!row) return undefined;
    return JSON.parse(row.payload) as Game;
  }

  public clear(): void {
    const db = this.dbService.getDatabase();
    db.prepare('DELETE FROM games').run();
  }

  public list(): Game[] {
    const db = this.dbService.getDatabase();
    const stmt = db.prepare('SELECT payload FROM games');
    const rows = stmt.all() as { payload: string }[];
    return rows.map(row => JSON.parse(row.payload) as Game);
  }

  public appendChatMessage(gameId: string, message: any): void {
    const db = this.dbService.getDatabase();
    // Using json_insert and json_extract to atomically append to chatHistory
    const stmt = db.prepare(`
      UPDATE games
      SET payload = json_set(
        payload,
        '$.chatHistory',
        json_insert(
          json_extract(payload, '$.chatHistory'),
          '$[' || json_array_length(json_extract(payload, '$.chatHistory')) || ']',
          json(?)
        ),
        '$.updatedAt',
        ?
      )
      WHERE id = ?
    `);

    stmt.run(JSON.stringify(message), new Date().toISOString(), gameId);
  }
}
