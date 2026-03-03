import { GameEngine } from '../engine/game-engine.js';
import { AIService } from '../services/AIService.js';
import { GameStoreService } from '../services/game-store.service.js';

const store = new GameStoreService();
const aiService = new AIService();

export const gameEngine = new GameEngine(store, aiService);
