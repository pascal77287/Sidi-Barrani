import express from 'express';
import path from 'path';
import http from 'http';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { Server, Socket } from 'socket.io';
import { Game, Bid, BidValue, GameType, Suit, SpecialGameType } from './src/types.js';
import {
  ALLOWED_PLAYER_COUNTS, MAX_PLAYERS, highestValue, isRoundOver, mayAct, mayUndo, numericValue,
} from './src/rules.js';

// Entwicklungsmodus nur explizit per `--dev` (siehe `npm run dev`).
// Standard ist Produktion, damit nie versehentlich der Vite-Dev-Server öffentlich läuft.
const isDev = process.argv.includes('--dev');

// --- Limits ---
const MAX_GAMES = 1000;
const MAX_BIDS_PER_GAME = 200;
const MAX_NAME_LENGTH = 20;
const MAX_PAYLOAD_BYTES = 4 * 1024;
const GAME_TTL_MS = 24 * 60 * 60 * 1000;

interface InternalGame extends Game {
  lastActivity: number;
  // Geheime Tokens pro Spieler für rejoinGame. Werden nie an andere Clients gesendet.
  rejoinTokens: Map<string, string>;
}

interface ClientSession {
  playerId: string;
  gameCode: string;
}

const games = new Map<string, InternalGame>();

// Bereinigung: Spiele nach 24 Stunden Inaktivität löschen
setInterval(() => {
  const now = Date.now();
  for (const [code, game] of games.entries()) {
    if (now - game.lastActivity > GAME_TTL_MS) {
      console.log(`Lösche inaktives Spiel: ${code}`);
      games.delete(code);
    }
  }
}, 60 * 60 * 1000); // Check jede Stunde

// --- Rate Limiting (Fixed Window, in-memory) ---
class RateLimiter {
  private hits = new Map<string, { count: number; resetAt: number }>();

  constructor(private limit: number, private windowMs: number) {
    setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of this.hits) {
        if (entry.resetAt <= now) this.hits.delete(key);
      }
    }, windowMs).unref();
  }

  allow(key: string): boolean {
    const now = Date.now();
    const entry = this.hits.get(key);
    if (!entry || entry.resetAt <= now) {
      this.hits.set(key, { count: 1, resetAt: now + this.windowMs });
      return true;
    }
    entry.count++;
    return entry.count <= this.limit;
  }
}

const eventLimiter = new RateLimiter(30, 10 * 1000);        // pro Socket: 30 Events / 10s
const createLimiter = new RateLimiter(10, 10 * 60 * 1000);  // pro IP: 10 Spiele / 10min
const joinLimiter = new RateLimiter(20, 60 * 1000);         // pro IP: 20 Beitrittsversuche / min

function clientIp(socket: Socket): string {
  // Mit genau einem vertrauenswürdigen Proxy ist der letzte Eintrag in X-Forwarded-For
  // der vom Proxy gesetzte und damit nicht vom Client fälschbar.
  const xff = socket.handshake.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.length > 0) {
    const parts = xff.split(',').map(s => s.trim()).filter(Boolean);
    if (parts.length > 0) return parts[parts.length - 1];
  }
  return socket.handshake.address;
}

// --- Validierung ---
const GAME_CODE_RE = /^[a-z0-9]{4}$/;
const ID_RE = /^player_[a-f0-9]{16}$/;
const TOKEN_RE = /^[a-f0-9]{64}$/;
const VALID_GAME_TYPES = new Set<string>([...Object.values(Suit), ...Object.values(SpecialGameType)]);

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parsePlayerName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  // Steuerzeichen entfernen, Whitespace normalisieren
  const name = value.replace(/[\u0000-\u001f\u007f-\u009f]/g, '').replace(/\s+/g, ' ').trim();
  if (name.length === 0 || name.length > MAX_NAME_LENGTH) return null;
  return name;
}

function parseGameCode(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const code = value.trim().toLowerCase();
  return GAME_CODE_RE.test(code) ? code : null;
}

function parseBidValue(value: unknown): BidValue | null {
  if (value === 'Match' || value === 'Pass') return value;
  if (typeof value === 'number' && Number.isInteger(value) && value >= 10 && value <= 150 && value % 10 === 0) {
    return value;
  }
  return null;
}

function tokensEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
}

// --- Hilfsfunktionen ---
function generateGameCode(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  for (;;) {
    let code = '';
    for (let i = 0; i < 4; i++) {
      code += chars[crypto.randomInt(chars.length)];
    }
    if (!games.has(code)) return code;
  }
}

function generatePlayerId(): string {
  return `player_${crypto.randomBytes(8).toString('hex')}`;
}

function generateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

// Nur die öffentlichen Felder an Clients senden (keine Tokens, keine internen Daten)
function publicGame(game: InternalGame): Game {
  return {
    gameCode: game.gameCode,
    players: game.players.map(p => ({ id: p.id, name: p.name })),
    bids: game.bids.map(b => ({ ...b })),
    creatorId: game.creatorId,
    started: game.started,
    startIndex: game.startIndex,
  };
}

function broadcastGameState(io: Server, gameCode: string) {
  const game = games.get(gameCode);
  if (!game) return;
  io.to(gameCode).emit('gameStateUpdate', { game: publicGame(game) });
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function parseUrl(value: string | undefined): URL | null {
  if (!value || !value.trim()) return null;
  try {
    return new URL(value.trim());
  } catch {
    console.warn(`Ungültige URL ignoriert: ${value}`);
    return null;
  }
}

function parseAllowedOrigins(): Set<string> {
  const origins = new Set<string>();
  const raw = [process.env.APP_URL, ...(process.env.ALLOWED_ORIGINS ?? '').split(',')];
  for (const entry of raw) {
    const url = parseUrl(entry);
    if (url) origins.add(url.origin);
  }
  return origins;
}

async function createServer() {
  const app = express();
  const allowedOrigins = parseAllowedOrigins();
  const appUrl = parseUrl(process.env.APP_URL);

  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  // HTTPS-Umleitung nur hinter einem Proxy, der x-forwarded-proto setzt, und NICHT für WebSockets
  app.use((req, res, next) => {
    const isWebSocket = req.headers.upgrade?.toLowerCase() === 'websocket';
    if (!isWebSocket && req.header('x-forwarded-proto') === 'http') {
      // Ziel-Host nicht blind aus dem Host-Header übernehmen (Open Redirect)
      const host = appUrl ? appUrl.host : req.hostname;
      if (!appUrl && !/^[a-z0-9.-]+$/i.test(host)) {
        return res.status(400).send('Bad Request');
      }
      return res.redirect(301, `https://${host}${req.originalUrl}`);
    }
    next();
  });

  const server = http.createServer(app);

  const io = new Server(server, {
    maxHttpBufferSize: MAX_PAYLOAD_BYTES,
    // Kein CORS für fremde Seiten. Zusätzlich Origin prüfen, da WebSockets CORS nicht kennen.
    allowRequest: (req, callback) => {
      const origin = req.headers.origin;
      if (!origin) return callback(null, true); // Nicht-Browser-Clients senden keinen Origin
      let originUrl: URL;
      try {
        originUrl = new URL(origin);
      } catch {
        return callback(null, false);
      }
      const sameHost = originUrl.host === req.headers.host
        || originUrl.host === req.headers['x-forwarded-host'];
      callback(null, sameHost || allowedOrigins.has(originUrl.origin));
    },
  });

  io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);
    const ip = clientIp(socket);
    let session: ClientSession | null = null;

    const sendError = (message: string) => socket.emit('error', { message });

    // Alle Handler mit Rate Limit und try/catch absichern, damit fehlerhafte
    // Nachrichten den Prozess nicht zum Absturz bringen.
    const on = (event: string, handler: (payload: Record<string, unknown>) => void) => {
      socket.on(event, (payload: unknown) => {
        try {
          if (!eventLimiter.allow(socket.id)) {
            sendError('Too many requests');
            return;
          }
          handler(isObject(payload) ? payload : {});
        } catch (error) {
          console.error(`Fehler in Handler '${event}':`, error);
        }
      });
    };

    // Liefert das Spiel der aktuellen Verbindung, falls vorhanden
    const currentGame = (): InternalGame | null => {
      if (!session) return null;
      return games.get(session.gameCode) ?? null;
    };

    const enterGame = (game: InternalGame, playerId: string) => {
      if (session && session.gameCode !== game.gameCode) {
        socket.leave(session.gameCode);
      }
      session = { playerId, gameCode: game.gameCode };
      socket.join(game.gameCode);
    };

    on('createGame', (payload) => {
      const playerName = parsePlayerName(payload.playerName);
      if (!playerName) return sendError('Invalid player name');
      if (!createLimiter.allow(ip)) return sendError('Too many requests');
      if (games.size >= MAX_GAMES) return sendError('Server is full');

      const playerId = generatePlayerId();
      const token = generateToken();
      const gameCode = generateGameCode();
      const newGame: InternalGame = {
        gameCode,
        players: [{ id: playerId, name: playerName }],
        bids: [],
        creatorId: playerId,
        started: false,
        startIndex: 0,
        lastActivity: Date.now(),
        rejoinTokens: new Map([[playerId, token]]),
      };
      games.set(gameCode, newGame);
      enterGame(newGame, playerId);
      socket.emit('gameCreated', { game: publicGame(newGame), playerId, token });
    });

    on('joinGame', (payload) => {
      if (!joinLimiter.allow(ip)) return sendError('Too many requests');
      const playerName = parsePlayerName(payload.playerName);
      if (!playerName) return sendError('Invalid player name');
      const gameCode = parseGameCode(payload.gameCode);
      const game = gameCode ? games.get(gameCode) : undefined;
      if (!game) return sendError('Game not found');
      if (game.started) return sendError('Game already started');
      if (game.players.length >= MAX_PLAYERS) return sendError('Game is full');

      game.lastActivity = Date.now();
      const playerId = generatePlayerId();
      const token = generateToken();
      game.players.push({ id: playerId, name: playerName });
      game.rejoinTokens.set(playerId, token);
      enterGame(game, playerId);
      socket.emit('gameJoined', { game: publicGame(game), playerId, token });
      broadcastGameState(io, game.gameCode);
    });

    on('rejoinGame', (payload) => {
      if (!joinLimiter.allow(ip)) return sendError('Too many requests');
      const gameCode = parseGameCode(payload.gameCode);
      const game = gameCode ? games.get(gameCode) : undefined;
      if (!game) return sendError('Game not found');

      const { playerId, token } = payload;
      const expected = typeof playerId === 'string' && ID_RE.test(playerId)
        ? game.rejoinTokens.get(playerId)
        : undefined;
      if (!expected || typeof token !== 'string' || !TOKEN_RE.test(token) || !tokensEqual(token, expected)) {
        return sendError('Player not found in game');
      }

      game.lastActivity = Date.now();
      enterGame(game, playerId as string);
      socket.emit('gameJoined', { game: publicGame(game), playerId, token });
      broadcastGameState(io, game.gameCode);
    });

    // Der Ersteller legt vor dem Start die Sitz- und Bietreihenfolge fest
    on('reorderPlayers', (payload) => {
      const game = currentGame();
      if (!game || game.creatorId !== session!.playerId || game.started) return;
      const order = payload.order;
      if (!Array.isArray(order) || order.length !== game.players.length) return sendError('Invalid order');
      const byId = new Map(game.players.map(p => [p.id, p]));
      if (new Set(order).size !== order.length || !order.every(id => typeof id === 'string' && byId.has(id))) {
        return sendError('Invalid order');
      }
      game.players = order.map(id => byId.get(id as string)!);
      game.lastActivity = Date.now();
      broadcastGameState(io, game.gameCode);
    });

    on('startGame', () => {
      const game = currentGame();
      if (!game || game.creatorId !== session!.playerId || game.started) return;
      if (!ALLOWED_PLAYER_COUNTS.includes(game.players.length)) return sendError('Wrong player count');
      game.lastActivity = Date.now();
      game.started = true;
      game.startIndex = 0;
      game.bids = [];
      broadcastGameState(io, game.gameCode);
    });

    on('newRound', () => {
      const game = currentGame();
      if (!game || game.creatorId !== session!.playerId || !game.started) return;
      game.lastActivity = Date.now();
      game.bids = [];
      game.startIndex = (game.startIndex + 1) % game.players.length;
      broadcastGameState(io, game.gameCode);
    });

    on('placeBid', (payload) => {
      const game = currentGame();
      if (!game || !game.started) return;
      if (game.bids.length >= MAX_BIDS_PER_GAME) return sendError('Too many bids');
      if (isRoundOver(game)) return sendError('Round is over');
      if (!mayAct(game, session!.playerId)) return sendError('Not your turn');

      const value = parseBidValue(payload.value);
      if (value === null) return;

      let gameType: GameType;
      if (value === 'Pass') {
        gameType = Suit.ROSEN; // Platzhalter, wird bei Pass nicht angezeigt
      } else {
        if (typeof payload.gameType !== 'string' || !VALID_GAME_TYPES.has(payload.gameType)) return;
        gameType = payload.gameType as GameType;
        if (numericValue(value) <= highestValue(game.bids)) return sendError('Bid too low');
      }

      const player = game.players.find(p => p.id === session!.playerId);
      if (!player) return;

      // Spieler-ID und Name stammen immer aus der Session, nie aus dem Payload
      const bid: Bid = { playerId: player.id, playerName: player.name, gameType, value };
      game.lastActivity = Date.now();
      game.bids.push(bid);
      broadcastGameState(io, game.gameCode);
    });

    on('deleteLastBid', () => {
      const game = currentGame();
      if (!game || !mayUndo(game, session!.playerId)) return sendError('Cannot undo');
      game.lastActivity = Date.now();
      game.bids.pop();
      broadcastGameState(io, game.gameCode);
    });

    on('leaveGame', () => {
      const game = currentGame();
      if (!game || !session) return;
      const { playerId } = session;
      socket.leave(game.gameCode);
      session = null;
      // Vor dem Start wird der Platz frei. Nach dem Start bleibt der Spieler
      // im Spiel, damit Gebotsverlauf und Zugregel konsistent bleiben.
      if (!game.started) {
        game.players = game.players.filter(p => p.id !== playerId);
        game.rejoinTokens.delete(playerId);
        if (game.players.length === 0) {
          games.delete(game.gameCode);
          return;
        }
        if (game.creatorId === playerId) game.creatorId = game.players[0].id;
        game.lastActivity = Date.now();
        broadcastGameState(io, game.gameCode);
      }
    });

    socket.on('disconnect', () => {
      // Spieler bleiben im Spiel, damit sie per rejoinGame zurückkehren können.
      // Aufgeräumt wird über den 24h-Timeout.
      console.log('Client disconnected:', socket.id);
      session = null;
    });
  });

  if (isDev) {
    const { createServer: createViteServer } = await import('vite');
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
  // Im Dev-Modus standardmässig nur lokal erreichbar; mit HOST=0.0.0.0 z.B. fürs Testen auf dem Handy freigeben.
  const HOST = process.env.HOST || (isDev ? '127.0.0.1' : '0.0.0.0');
  server.listen(PORT, HOST, () => {
    console.log(`Server listening on http://${HOST}:${PORT} (${isDev ? 'development' : 'production'})`);
  });
}

createServer();
