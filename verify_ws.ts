import { io } from 'socket.io-client';

const socket = io('http://localhost:3000', {
  query: {
    gameId: 'test-game',
    playerId: 'test-player'
  }
});

socket.on('connect', () => {
  console.log('CONNECTED');
  socket.emit('question', {
    gameId: 'test-game',
    playerId: 'test-player',
    message: 'Hola, qui eres?'
  });
});

socket.on('connected', (data) => {
  console.log('RECEIVED connected:', data);
});

socket.on('chat_message', (data) => {
  console.log('RECEIVED chat_message:', data);
  if (data.type === 'response') {
    console.log('SUCCESS: Received response from narrator');
    process.exit(0);
  }
});

socket.on('error', (err) => {
  console.error('ERROR:', err);
  process.exit(1);
});

socket.on('connect_error', (err) => {
  console.error('CONNECT_ERROR:', err);
  process.exit(1);
});

setTimeout(() => {
  console.error('TIMEOUT');
  process.exit(1);
}, 10000);
