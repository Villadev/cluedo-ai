import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { corsOrigins } from '../config/env.js';
import { gameEngine } from '../models/dependencies.js';
import { Player, PublicGameView, ChatMessage, GameState, Difficulty, GenerationPhase } from '../types/game.types.js';

let io: Server | null = null;

// Output Message Queue (Narrator/System)
interface QueueItem {
  gameId: string;
  message: string;
  type: ChatMessage['type'];
  roundNumber?: number;
  sequenceId?: number;
  playerId?: string;
  playerNameOverride?: string;
}

const messageQueue: QueueItem[] = [];
let isProcessingQueue = false;

// Input Question Queue per Game
interface QuestionTask {
  gameId: string;
  playerId: string;
  message: string;
  socketId: string;
}

const questionQueuesByGame = new Map<string, QuestionTask[]>();
const isProcessingByGame = new Map<string, boolean>();

export const initSocket = (httpServer: HttpServer): Server => {
  io = new Server(httpServer, {
    cors: {
      origin: corsOrigins,
      methods: ['GET', 'POST']
    }
  });

  io.on('connection', (socket) => {
    const { gameId, playerId } = socket.handshake.query;

    console.log(`WS_CLIENT_CONNECTED: ${socket.id}, gameId: ${gameId}, playerId: ${playerId}`);

    if (gameId && typeof gameId === 'string') {
      socket.join(gameId);
      console.log(`Socket ${socket.id} joined room ${gameId}`);

      try {
        const gameInfo = gameEngine.getGameStateInfo(gameId);
        socket.emit('game_state_update', {
          gameId,
          ...gameInfo
        });
      } catch (error) {
        console.error('Error emitting initial state:', error);
      }
    }

    socket.emit('connected', { message: 'Connected to Cluedo AI websocket server' });

    socket.on('resync_request', (payload: { gameId: string; playerId?: string }) => {
      console.log('WS_RESYNC_REQUEST:', payload);
      try {
        const gameId = payload.gameId;
        const playerId = payload.playerId;
        const gameState = gameEngine.getPublicState(gameId, playerId);
        const chatHistory = gameEngine.getChatHistory(gameId);

        socket.emit('resync_data', {
          gameState,
          chatHistory,
          timestamp: Date.now()
        });
      } catch (error: any) {
        console.error('WS_RESYNC_ERROR:', error);
        socket.emit('error', { message: 'Error en la resincronització' });
      }
    });

    socket.on('update_difficulty', (payload: { gameId: string; difficulty: Difficulty }) => {
      console.log('WS_EVENT: update_difficulty', payload);
      try {
        gameEngine.updateDifficulty(payload.gameId, payload.difficulty);
        const gameInfo = gameEngine.getGameStateInfo(payload.gameId);
        emitGameStateUpdate(payload.gameId, gameInfo);
      } catch (error: any) {
        console.error('WS_ERROR updating difficulty:', error);
        socket.emit('error', { message: error.message || 'Error updating difficulty' });
      }
    });

    socket.on('question', (payload: { gameId: string; playerId: string; message: string }) => {
      const task: QuestionTask = {
        gameId: payload.gameId,
        playerId: payload.playerId,
        message: payload.message,
        socketId: socket.id
      };

      console.log(`[QUESTION ENQUEUED] Game: ${task.gameId}, Player: ${task.playerId}`);

      if (!questionQueuesByGame.has(task.gameId)) {
        questionQueuesByGame.set(task.gameId, []);
      }
      questionQueuesByGame.get(task.gameId)!.push(task);

      processQuestionQueue(task.gameId);
    });

    socket.on('disconnect', () => {
      console.log(`WS_CLIENT_DISCONNECTED: ${socket.id}`);
    });
  });

  return io;
};

const processQuestionQueue = async (gameId: string): Promise<void> => {
  if (isProcessingByGame.get(gameId) || !questionQueuesByGame.has(gameId)) return;

  const queue = questionQueuesByGame.get(gameId)!;
  if (queue.length === 0) return;

  isProcessingByGame.set(gameId, true);

  while (queue.length > 0) {
    const task = queue.shift()!;
    console.log(`[QUESTION WORKER] Processing task for Game: ${task.gameId}, Player: ${task.playerId}`);

    try {
      const result = await gameEngine.askQuestion(task.gameId, {
        playerId: task.playerId,
        question: task.message
      });

      const chatHistory = result.game.chatHistory;
      const questionEntry = chatHistory.find(m => m.sequenceId === result.game.nextSequenceId - 2);
      const responseEntry = chatHistory.find(m => m.sequenceId === result.game.nextSequenceId - 1);

      // 1. Emit Player Question
      const chatMsg = {
        type: 'player',
        playerId: task.playerId,
        playerName: questionEntry?.playerName || 'Jugador',
        message: task.message,
        timestamp: questionEntry?.timestamp || Date.now(),
        roundNumber: result.game.roundNumber,
        sequenceId: questionEntry?.sequenceId
      };
      console.log(`[WS_EMIT] chat_message (player question) to room ${task.gameId}`);
      getSocketServer().to(task.gameId).emit('chat_message', chatMsg);

      // 2. Emit Narrator Response
      sendNarratorMessage(
        task.gameId,
        result.response,
        'narrator',
        result.game.roundNumber,
        responseEntry?.sequenceId
      );

      // 3. Round management & state update
      await gameEngine.nextTurn(task.gameId);
      const updatedGame = gameEngine.getGameStateInfo(task.gameId);
      emitGameStateUpdate(task.gameId, updatedGame);

    } catch (error: any) {
      console.error(`WS_ERROR processing question for game ${task.gameId}:`, error);
      getSocketServer().to(task.socketId).emit('error', { message: error.message || 'Error processing question' });
    }

    // Safety delay to avoid AI rate limits or UI jitter
    await new Promise(res => setTimeout(res, 200));
  }

  isProcessingByGame.set(gameId, false);
};

const getSocketServer = (): Server => {
  if (!io) {
    throw new Error('Socket.IO has not been initialized yet');
  }
  return io;
};

export const emitPlayerJoined = (gameId: string, player: Player): void => {
  console.log(`WS_EMIT: player_joined to room ${gameId}`);
  getSocketServer().to(gameId).emit('player_joined', player);
};

export const emitGameStateUpdate = (gameId: string, status: any): void => {
  console.log(`WS_EMIT: game_state_update to room ${gameId}`);

  const payload = typeof status === 'string'
    ? { gameId, state: status }
    : { gameId, ...status };

  if (payload.state && !payload.status) {
    payload.status = payload.state;
  }

  getSocketServer().to(gameId).emit('game_state_update', payload);
};

export const emitGenerationProgress = (
  gameId: string,
  progress: {
    phase: GenerationPhase;
    attempt: number;
    elapsedMs: number;
    error?: string;
  }
): void => {
  console.log(`WS_EMIT: generation_progress to room ${gameId}`, progress);
  getSocketServer().to(gameId).emit('generation_progress', {
    gameId,
    ...progress
  });
};

export const emitGameStarted = (gameId: string, payload: PublicGameView | any): void => {
  console.log(`WS_EMIT: game_started to room ${gameId}`);
  getSocketServer().to(gameId).emit('game_started', payload);
};

export const enqueueMessage = (
  gameId: string,
  message: string,
  options: {
    type?: ChatMessage['type'];
    roundNumber?: number;
    sequenceId?: number;
    playerId?: string;
    playerNameOverride?: string;
  } = {}
): void => {
  messageQueue.push({
    gameId,
    message,
    type: options.type || 'system',
    roundNumber: options.roundNumber,
    sequenceId: options.sequenceId,
    playerId: options.playerId,
    playerNameOverride: options.playerNameOverride
  });

  console.log(`[QUEUE] Message enqueued for game ${gameId}. Queue size: ${messageQueue.length}`);
  processQueue();
};

const processQueue = async (): Promise<void> => {
  if (isProcessingQueue || messageQueue.length === 0) return;

  isProcessingQueue = true;

  while (messageQueue.length > 0) {
    const item = messageQueue.shift();
    if (!item) continue;

    const { gameId, message, type, roundNumber, sequenceId, playerId, playerNameOverride } = item;
    const timestamp = Date.now();
    const playerName = playerNameOverride || (type === 'clue' || type === 'narrator' ? 'Narrador 🕵️' : 'Sistema ⚙️');

    const systemMsg = {
      type,
      playerName,
      message,
      timestamp,
      roundNumber,
      sequenceId,
      playerId
    };

    console.log(`[QUEUE WORKER] Emitting ${type} to room ${gameId}: ${message.substring(0, 30)}...`);
    getSocketServer().to(gameId).emit('chat_message', systemMsg);

    try {
      if (type !== 'narrator') {
        gameEngine.recordChatMessage(gameId, {
          type,
          playerName,
          message,
          timestamp,
          roundNumber,
          sequenceId
        });
      }
    } catch (e) {
      console.warn(`[QUEUE WORKER] Could not persist message to history for game ${gameId}`);
    }

    await new Promise(res => setTimeout(res, 150));
  }

  isProcessingQueue = false;
};

export const sendNarratorMessage = (
  gameId: string,
  message: string,
  type: ChatMessage['type'] = 'system',
  roundNumber?: number,
  sequenceId?: number,
  playerId?: string,
  playerNameOverride?: string
): void => {
  enqueueMessage(gameId, message, {
    type,
    roundNumber,
    sequenceId,
    playerId,
    playerNameOverride
  });
};
