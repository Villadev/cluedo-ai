import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { corsOrigins } from '../config/env.js';
import { gameEngine } from '../models/dependencies.js';
import { Player, PublicGameView } from '../types/game.types.js';

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
          type: 'chat',
          playerId: payload.playerId,
          playerName: result.game.players.find(p => p.id === payload.playerId)?.nickname || 'Jugador',
          message: payload.message,
          timestamp: Date.now()
        };

        const responseMsg = {
          type: 'response',
          playerName: 'Narrador',
          message: result.response,
          timestamp: Date.now()
        };

        io?.to(payload.gameId).emit('chat_message', chatMsg);
        io?.to(payload.gameId).emit('chat_message', responseMsg);

        // Also update game state for everyone
        emitGameStateUpdated(payload.gameId, gameEngine.getPublicState(payload.gameId));

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

export const emitGameStateUpdated = (gameId: string, payload: PublicGameView): void => {
  console.log(`WS_EMIT: game_state_updated to room ${gameId}`);
  getSocketServer().to(gameId).emit('game_state_updated', payload);
};

export const emitGameStarted = (gameId: string, payload: PublicGameView): void => {
  console.log(`WS_EMIT: game_started to room ${gameId}`);
  getSocketServer().to(gameId).emit('game_started', payload);
};

// Legacy support for shared module
export const emitPlayerAssignedCard = (playerId: string, card: any): void => {
  console.log(`WS_EMIT: player_assigned_card to ${playerId}`);
  getSocketServer().emit('player_assigned_card', { playerId, card });
};
