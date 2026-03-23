import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { corsOrigins } from '../config/env.js';
import { gameEngine } from '../models/dependencies.js';
import { Player, PublicGameView, ChatMessage, GameState, Difficulty } from '../types/game.types.js';

let io: Server | null = null;

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
        const game = gameEngine.updateDifficulty(payload.gameId, payload.difficulty);
        const gameInfo = gameEngine.getGameStateInfo(payload.gameId);
        emitGameStateUpdate(payload.gameId, gameInfo);
      } catch (error: any) {
        console.error('WS_ERROR updating difficulty:', error);
        socket.emit('error', { message: error.message || 'Error updating difficulty' });
      }
    });

    socket.on('question', async (payload: { gameId: string; playerId: string; message: string }) => {
      console.log('WS_MESSAGE_RECEIVED: question', payload);
      try {
        const result = await gameEngine.askQuestion(payload.gameId, {
          playerId: payload.playerId,
          question: payload.message
        });

        // The question, response, and (optional) clue are entries in history
        // We use the unified sendNarratorMessage for narrator outputs
        // Player message is emitted directly as it's not a 'system' message

        const chatHistory = result.game.chatHistory;
        const questionEntry = chatHistory.find(m => m.sequenceId === result.game.nextSequenceId - (result.clue ? 3 : 2));
        const responseEntry = chatHistory.find(m => m.sequenceId === result.game.nextSequenceId - (result.clue ? 2 : 1));
        const clueEntry = result.clue ? chatHistory.find(m => m.sequenceId === result.game.nextSequenceId - 1) : null;

        // 1. Emit Player Question
        const chatMsg = {
          type: 'player',
          playerId: payload.playerId,
          playerName: questionEntry?.playerName || 'Jugador',
          message: payload.message,
          timestamp: questionEntry?.timestamp || Date.now(),
          roundNumber: result.game.roundNumber,
          sequenceId: questionEntry?.sequenceId
        };
        getSocketServer().to(payload.gameId).emit('chat_message', chatMsg);

        // 2. Emit Narrator Response via unified pipeline
        sendNarratorMessage(
          payload.gameId,
          result.response,
          'narrator',
          result.game.roundNumber,
          responseEntry?.sequenceId
        );

        // 3. Emit Clue if it exists via unified pipeline
        if (result.clue) {
          sendNarratorMessage(
            payload.gameId,
            result.clue,
            'clue',
            result.game.roundNumber,
            clueEntry?.sequenceId
          );
        }

        // Delay to ensure messages are processed in order before round transition
        await new Promise(res => setTimeout(res, 50));

        // Advance round if everyone has acted
        await gameEngine.nextTurn(payload.gameId);

        // Get updated game state after turn advancement
        const updatedGame = gameEngine.getGameStateInfo(payload.gameId);

        // Also update game state for everyone
        emitGameStateUpdate(payload.gameId, updatedGame);
      } catch (error: any) {
        console.error('WS_ERROR processing question:', error);
        socket.emit('error', { message: error.message || 'Error processing question' });
      }
    });

    socket.on('disconnect', () => {
      console.log(`WS_CLIENT_DISCONNECTED: ${socket.id}`);
    });
  });

  return io;
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

  // If we just got a string (legacy/direct call), wrap it in an object
  const payload = typeof status === 'string'
    ? { gameId, state: status }
    : { gameId, ...status };

  // Compatibility fix: frontends might expect 'status' property for the main state string
  if (payload.state && !payload.status) {
    payload.status = payload.state;
  }

  getSocketServer().to(gameId).emit('game_state_update', payload);
};

export const emitGameStarted = (gameId: string, payload: PublicGameView | any): void => {
  console.log(`WS_EMIT: game_started to room ${gameId}`);
  getSocketServer().to(gameId).emit('game_started', payload);
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

  console.log(`[PIPELINE] Enqueuing narrator message for game ${gameId}`);
  console.log(`[PIPELINE] Emitting ${type} to room: ${message}`);
  getSocketServer().to(gameId).emit('chat_message', systemMsg);

  // Also persist to chat history
  try {
    gameEngine.recordChatMessage(gameId, {
      type,
      playerName,
      message,
      timestamp,
      roundNumber,
      sequenceId
    });
  } catch (e) {
    // Might fail for 'MAIN_GAME' which doesn't exist in gameEngine
  }
};
