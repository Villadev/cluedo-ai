import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { corsOrigins } from '../config/env.js';
import { gameEngine } from '../models/dependencies.js';
import { Player, PublicGameView, ChatMessage, GameState } from '../types/game.types.js';

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
          status: gameInfo.state
        });
      } catch (error) {
        // This might fail if gameId is for the other 'MAIN_GAME' logic,
        // but we prioritize the new GameEngine logic.
        console.error('Error emitting initial state:', error);
      }
    }

    socket.emit('connected', { message: 'Connected to Cluedo AI websocket server' });

    socket.on('question', async (payload: { gameId: string; playerId: string; message: string }) => {
      console.log('WS_MESSAGE_RECEIVED: question', payload);
      try {
        const result = await gameEngine.askQuestion(payload.gameId, {
          playerId: payload.playerId,
          question: payload.message
        });

        // Broadcast the question and response to all players in the game
        const chatMsg = {
          type: 'player',
          playerId: payload.playerId,
          playerName: result.game.players.find(p => p.id === payload.playerId)?.nickname || 'Jugador',
          message: payload.message,
          timestamp: Date.now(),
          roundNumber: result.game.roundNumber
        };

        const responseMsg = {
          type: 'narrator',
          playerName: 'Narrador 🕵️',
          message: result.response,
          timestamp: Date.now(),
          roundNumber: result.game.roundNumber
        };

        io?.to(payload.gameId).emit('chat_message', chatMsg);
        io?.to(payload.gameId).emit('chat_message', responseMsg);

        // Delay to ensure messages are processed in order before round transition
        await new Promise(res => setTimeout(res, 50));

        // Advance round if everyone has acted
        await gameEngine.nextTurn(payload.gameId);

        // Get updated game state after turn advancement
        const updatedGame = gameEngine.getGameStateInfo(payload.gameId);

        // Also update game state for everyone
        emitGameStateUpdate(payload.gameId, updatedGame.state);

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

export const emitGameStateUpdate = (gameId: string, status: GameState | any): void => {
  console.log(`WS_EMIT: game_state_update to room ${gameId}: ${status}`);
  // Handle both GameState and GameStatePayload for compatibility
  const finalStatus = typeof status === 'string' ? status : status?.game?.status;
  getSocketServer().to(gameId).emit('game_state_update', { gameId, status: finalStatus });
};

export const emitGameStarted = (gameId: string, payload: PublicGameView | any): void => {
  console.log(`WS_EMIT: game_started to room ${gameId}`);
  getSocketServer().to(gameId).emit('game_started', payload);
};

export const emitSystemChatMessage = (gameId: string, message: string, type: ChatMessage['type'] = 'system', roundNumber?: number): void => {
  const timestamp = Date.now();
  const playerName = type === 'clue' || type === 'narrator' ? 'Narrador 🕵️' : 'Sistema ⚙️';

  const systemMsg = {
    type,
    playerName,
    message,
    timestamp,
    roundNumber
  };

  console.log(`WS_EMIT: ${type} chat message to room ${gameId}: ${message}`);
  getSocketServer().to(gameId).emit('chat_message', systemMsg);

  // Also persist to chat history
  try {
    gameEngine.recordChatMessage(gameId, {
      type,
      playerName,
      message,
      timestamp,
      roundNumber
    });
  } catch (e) {
    // Might fail for 'MAIN_GAME' which doesn't exist in gameEngine
  }
};

// Legacy support for shared module
export const emitPlayerAssignedCard = (playerId: string, card: any): void => {
  console.log(`WS_EMIT: player_assigned_card to ${playerId}`);
  getSocketServer().emit('player_assigned_card', { playerId, card });
};
