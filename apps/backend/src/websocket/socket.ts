import type { Server as HttpServer } from 'node:http';
import type { Card, GameStatePayload, Player } from '../shared/types';
import { Server } from 'socket.io';
import { corsOrigins } from '../config/env.js';

let io: Server | null = null;

export const initSocket = (httpServer: HttpServer): Server => {
  io = new Server(httpServer, {
    cors: {
      origin: corsOrigins,
      methods: ['GET', 'POST']
    }
  });

  io.on('connection', (socket) => {
    socket.emit('connected', { message: 'Connected to Cluedo AI websocket server' });
  });

  return io;
};

const getSocketServer = (): Server => {
  if (!io) {
    throw new Error('Socket.IO has not been initialized yet');
  }
  return io;
};

export const emitPlayerJoined = (player: Player): void => {
  getSocketServer().emit('player_joined', player);
};

export const emitGameStarted = (payload: GameStatePayload): void => {
  getSocketServer().emit('game_started', payload);
};

export const emitPlayerAssignedCard = (playerId: string, card: Card): void => {
  getSocketServer().emit('player_assigned_card', { playerId, card });
};

export const emitGameStateUpdated = (payload: GameStatePayload): void => {
  getSocketServer().emit('game_state_updated', payload);
};
