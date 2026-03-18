import { io } from 'socket.io-client';

const socket = io('http://localhost:3000', {
  query: { gameId: 'test-game' }
});

socket.on('connect', () => {
  console.log('Connected to server');
});

socket.on('game_state_update', (data) => {
  console.log('Received game_state_update:', data);
  process.exit(0);
});

setTimeout(() => {
  console.log('Timeout waiting for game_state_update');
  process.exit(1);
}, 5000);
