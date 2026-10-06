import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import http from 'http';
import { Server, Socket } from 'socket.io';
import { Game } from './src/types.js';

interface InternalGame extends Game {
  lastActivity: number;
}

const games = new Map<string, InternalGame>();

// Bereinigung: Spiele nach 24 Stunden Inaktivität löschen
setInterval(() => {
  const now = Date.now();
  const ONE_DAY = 24 * 60 * 60 * 1000;
  for (const [code, game] of games.entries()) {
    if (now - game.lastActivity > ONE_DAY) {
      console.log(`Lösche inaktives Spiel: ${code}`);
      games.delete(code);
    }
  }
}, 60 * 60 * 1000); // Check jede Stunde

function updateActivity(gameCode: string) {
  const game = games.get(gameCode);
  if (game) {
    game.lastActivity = Date.now();
  }
}

const clients = new Map<Socket, { playerId: string; gameCode: string }>();

function generateGameCode(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return games.has(code) ? generateGameCode() : code;
}

function broadcastGameState(io: Server, gameCode: string) {
  const game = games.get(gameCode);
  if (!game) return;
  io.to(gameCode).emit('gameStateUpdate', { game });
}

import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function createServer() {
  const app = express();
  
  app.set('trust proxy', 1);

  // HTTPS Umleitung, aber NICHT für WebSockets
  app.use((req, res, next) => {
    const isWebSocket = req.headers.upgrade && req.headers.upgrade.toLowerCase() === 'websocket';
    if (!isWebSocket && req.header('x-forwarded-proto') !== 'https' && process.env.NODE_ENV === 'production') {
      return res.redirect(`https://${req.header('host')}${req.url}`);
    }
    next();
  });

  const server = http.createServer(app);

  const io = new Server(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    socket.on('createGame', (payload) => {
      try {
        const { playerName } = payload;
        const playerId = `player_${Math.random().toString(36).slice(2, 9)}`;
        const gameCode = generateGameCode();
        const newGame: InternalGame = {
          gameCode,
          players: [{ id: playerId, name: playerName }],
          bids: [],
          creatorId: playerId,
          started: false,
          lastActivity: Date.now()
        };
        games.set(gameCode, newGame);
        clients.set(socket, { playerId, gameCode });
        socket.join(gameCode);
        socket.emit('gameCreated', { game: newGame, playerId });
      } catch (error) {
        console.error('Failed to create game:', error);
      }
    });

    socket.on('startGame', (payload) => {
      const { gameCode } = payload;
      const game = games.get(gameCode);
      if (game) {
        updateActivity(gameCode);
        game.started = true;
        broadcastGameState(io, gameCode);
      }
    });

    socket.on('placeBid', (payload) => {
      const { gameCode, bid } = payload;
      const game = games.get(gameCode);
      if (game && game.started) {
        updateActivity(gameCode);
        game.bids.push(bid);
        broadcastGameState(io, gameCode);
      }
    });

    socket.on('newRound', (payload) => {
      const { gameCode } = payload;
      const game = games.get(gameCode);
      if (game) {
        updateActivity(gameCode);
        game.bids = [];
        broadcastGameState(io, gameCode);
      }
    });

    socket.on('joinGame', (payload) => {
      const { gameCode, playerName } = payload;
      const game = games.get(gameCode);
      if (game) {
        updateActivity(gameCode);
        if (game.players.length >= 4) {
          socket.emit('error', { message: 'Game is full' });
          return;
        }
        const playerId = `player_${Math.random().toString(36).slice(2, 9)}`;
        game.players.push({ id: playerId, name: playerName });
        clients.set(socket, { playerId, gameCode });
        socket.join(gameCode);
        socket.emit('gameJoined', { game, playerId });
        broadcastGameState(io, gameCode);
      } else {
        socket.emit('error', { message: 'Game not found' });
      }
    });

    socket.on('deleteLastBid', (payload) => {
      const { gameCode, playerId } = payload;
      const game = games.get(gameCode);
      if (game && game.started && game.bids.length > 0) {
        const lastBid = game.bids[game.bids.length - 1];
        if (lastBid.playerId === playerId) {
          updateActivity(gameCode);
          game.bids.pop();
          broadcastGameState(io, gameCode);
        }
      }
    });

    socket.on('rejoinGame', (payload) => {
      const { gameCode, playerId } = payload;
      const game = games.get(gameCode);
      if (game) {
        const playerExists = game.players.some((p) => p.id === playerId);
        if (playerExists) {
          updateActivity(gameCode);
          clients.set(socket, { playerId, gameCode });
          socket.join(gameCode);
          socket.emit('gameJoined', { game, playerId });
          broadcastGameState(io, gameCode);
        } else {
          socket.emit('error', { message: 'Player not found in game' });
        }
      } else {
        socket.emit('error', { message: 'Game not found' });
      }
    });

    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id);
      const clientInfo = clients.get(socket);
      if (clientInfo) {
        const { gameCode, playerId } = clientInfo;
        const game = games.get(gameCode);
        if (game) {
          // We no longer remove the player from the game immediately upon disconnect
          // to allow them to rejoin. It will be cleaned up by the 24h timeout.
          const activeClients = Array.from(clients.values()).filter(c => c.gameCode === gameCode);
          if (activeClients.length === 0) {
            // Optional: log that all clients for this game have disconnected
            console.log(`All clients for game ${gameCode} disconnected, waiting for timeout.`);
          }
        }
        clients.delete(socket);
      }
    });
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, '../dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, '../dist', 'index.html'));
    });
  }

  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://localhost:${PORT}`);
  });
}

createServer();
