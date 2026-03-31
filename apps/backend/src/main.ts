import { createServer } from 'node:http';
import { env } from './config/env.js';
import { createApp } from './app.js';
import { initSocket, sendNarratorMessage, emitGameStateUpdate, emitGenerationProgress } from './websocket/socket.js';
import { gameEngine } from './models/dependencies.js';

const bootstrap = (): void => {
  const app = createApp();
  const server = createServer(app);

  // Initialize Socket.IO
  initSocket(server);

  // Wire up game engine events to websocket
  gameEngine.setSystemEventListener((gameId, message, type, roundNumber, sequenceId) => {
    sendNarratorMessage(gameId, message, type, roundNumber, sequenceId);
  });

  gameEngine.setGameStateChangeListener((gameId, state) => {
    const gameInfo = gameEngine.getGameStateInfo(gameId);
    emitGameStateUpdate(gameId, gameInfo);
  });

  // Wire up orchestrator events to websocket (breaks circular dependency)
  const orchestrator = gameEngine.getOrchestrator();
  orchestrator.setGenerationProgressListener((gameId, progress) => {
    emitGenerationProgress(gameId, progress);
  });
  orchestrator.setGameStateChangeListener((gameId, gameInfo) => {
    emitGameStateUpdate(gameId, gameInfo);
  });

  server.listen(env.PORT, () => {
    console.log("[SERVER] Backend started with Socket.IO");
    console.log("[SERVER] Environment validated");
    process.stdout.write(`Backend listening on port ${env.PORT}\n`);
  });
};

bootstrap();
