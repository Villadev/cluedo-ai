import { GameEngine } from '../engine/game-engine.js';
import { AIService } from '../services/AIService.js';
import { GameStoreService } from '../services/game-store.service.js';
import { DbService } from '../services/db.service.js';

const dbService = new DbService();
const store = new GameStoreService(dbService);
const aiService = new AIService();

export const gameEngine = new GameEngine(store, aiService);
