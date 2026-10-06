/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { useState, useEffect, useRef, useCallback, type FormEvent, type ReactNode } from 'react';
import { io, Socket } from 'socket.io-client';
import { QRCodeSVG } from 'qrcode.react';
import {
  ChevronDown, ChevronLeft, ChevronUp, Clock, LogOut, Minus, MoreVertical, Plus, QrCode, RotateCcw, Share2, Undo2, UserPlus, WifiOff,
} from 'lucide-react';
import { Suit, SpecialGameType, GameType } from './types';
import type { Bid, Game } from './types';
import {
  ALLOWED_PLAYER_COUNTS, MAX_PLAYERS, MIN_PLAY_VALUE, allowedValues, formatValue, highestBid,
  currentPlayer, isPlayed, isRoundOver, mayAct, mayUndo, numericValue,
} from './rules';

// --- Darstellung der Spielarten ---
const SUITS: { type: GameType; icon: string; tint: string; border: string }[] = [
  { type: Suit.ROSEN, icon: '/rose.svg', tint: '#FCECEA', border: '#B3261E' },
  { type: Suit.EICHELN, icon: '/eichel.svg', tint: '#EAF3E8', border: '#2F6B2F' },
  { type: Suit.SCHELLEN, icon: '/schellen.svg', tint: '#FBF1DC', border: '#9A6200' },
  { type: Suit.SCHILTEN, icon: '/schilten.svg', tint: '#E8EEF9', border: '#1F4E99' },
  { type: SpecialGameType.OBE_ABE, icon: '/obeabe.svg', tint: '#EDF0F2', border: '#46525C' },
  { type: SpecialGameType.UNE_UFE, icon: '/uneufe.svg', tint: '#EDF0F2', border: '#46525C' },
];
const suitIcon = (type: GameType) => SUITS.find(s => s.type === type)?.icon ?? '';

// Serverfehler auf Deutsch
const ERROR_TEXT: Record<string, string> = {
  'Game not found': 'Spiel nicht gefunden',
  'Game is full': 'Das Spiel ist voll',
  'Game already started': 'Das Spiel hat schon begonnen',
  'Player not found in game': 'Sitzung abgelaufen – bitte neu beitreten',
  'Invalid player name': 'Bitte gib einen Namen mit höchstens 20 Zeichen ein',
  'Too many requests': 'Zu viele Anfragen – bitte kurz warten',
  'Server is full': 'Der Server ist gerade ausgelastet',
  'Too many bids': 'Zu viele Gebote in dieser Runde',
  'Round is over': 'Die Bietrunde ist bereits entschieden',
  'Not your turn': 'Du bist noch nicht wieder dran',
  'Bid too low': 'Das Gebot ist zu tief',
  'Cannot undo': 'Nicht mehr möglich – es wurde schon weiter geboten',
  'Wrong player count': 'Gestartet wird mit 4 oder 6 Spielern',
  'Invalid order': 'Die Reihenfolge konnte nicht gespeichert werden',
};
const SESSION_ERRORS = ['Game not found', 'Player not found in game'];

const STORAGE_NAME = 'sidibarrani_name';
const SESSION_KEYS = ['sidibarrani_playerId', 'sidibarrani_gameCode', 'sidibarrani_token'];

function readStorage(storage: () => Storage, key: string): string | null {
  try { return storage().getItem(key); } catch { return null; }
}
function writeStorage(storage: () => Storage, key: string, value: string | null) {
  try {
    if (value === null) storage().removeItem(key); else storage().setItem(key, value);
  } catch { /* Speicher nicht verfügbar (z.B. privater Modus) */ }
}
const local = () => window.localStorage;
const session = () => window.sessionStorage;

const initial = (name: string) => name.trim().charAt(0).toUpperCase();
const bidLabel = (bid: Bid) => (bid.value === 'Pass' ? 'Passe' : `${formatValue(bid.value)} ${bid.gameType}`);

interface Toast { id: number; text: string }
type ShowToast = (text: string) => void;

// --- Kleine Bausteine ---
const BottomSheet = ({ label, onClose, children }: { label: string; onClose: () => void; children: ReactNode }) => {
  const panel = useRef<HTMLDivElement>(null);
  // Fokus ins Sheet setzen, mit Escape schliessen
  useEffect(() => {
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-40 flex flex-col justify-end">
      <button aria-label="Schliessen" onClick={onClose} className="absolute inset-0 bg-black/45" />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className="relative mx-auto w-full max-w-md bg-white rounded-t-[26px] px-5 pt-2.5 pb-[calc(2rem+env(safe-area-inset-bottom))] flex flex-col gap-3.5 outline-none"
      >
        <div className="w-10 h-[5px] rounded-full bg-line self-center" />
        {children}
      </div>
    </div>
  );
};

const Avatar = ({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' }) => (
  <div className={`${size === 'sm' ? 'w-7 h-7 text-[13px]' : 'w-9 h-9 text-[15px]'} shrink-0 rounded-full bg-accent text-white flex items-center justify-center font-bold`}>
    {initial(name)}
  </div>
);

// --- Startseite ---
const HomePage = ({ socket, isConnected }: { socket: Socket | null; isConnected: boolean }) => {
  const [playerName, setPlayerName] = useState(() => readStorage(local, STORAGE_NAME) ?? '');
  const [joinCode, setJoinCode] = useState('');

  useEffect(() => {
    const joinParam = new URLSearchParams(window.location.search).get('join');
    if (joinParam) setJoinCode(joinParam.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 4));
  }, []);

  const name = playerName.trim();
  const canCreate = isConnected && name.length > 0;
  const canJoin = canCreate && joinCode.length === 4;

  const rememberName = () => writeStorage(local, STORAGE_NAME, name);

  const handleCreate = (e?: FormEvent) => {
    e?.preventDefault();
    if (!canCreate || !socket) return;
    rememberName();
    socket.emit('createGame', { playerName: name });
  };

  const handleJoin = (e?: FormEvent) => {
    e?.preventDefault();
    if (!canJoin || !socket) return;
    rememberName();
    socket.emit('joinGame', { playerName: name, gameCode: joinCode });
    window.history.replaceState({}, document.title, window.location.pathname);
  };

  return (
    <div className="min-h-dvh max-w-md mx-auto flex flex-col gap-7 px-5 pt-14 pb-[calc(1.75rem+env(safe-area-inset-bottom))]">
      <div className="flex flex-col items-center gap-2.5 pt-6">
        <div className="w-16 h-16 rounded-[18px] bg-accent flex items-center justify-center">
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3" y="5" width="11" height="15" rx="2" />
            <path d="M10 4.2l7.6-1.1a2 2 0 0 1 2.3 1.7l1.6 11.5a2 2 0 0 1-1.7 2.3L17 19" />
          </svg>
        </div>
        <h1 className="m-0 text-[32px] font-extrabold tracking-tight">Sidi Barrani</h1>
        <p className="m-0 text-muted">Biet-Hilfe für eure Jassrunde</p>
      </div>

      <form onSubmit={handleCreate} className="flex flex-col gap-7">
        <div className="flex flex-col gap-2">
          <label htmlFor="name" className="text-sm font-semibold text-ink-2">Dein Name</label>
          <input
            id="name"
            type="text"
            value={playerName}
            onChange={e => setPlayerName(e.target.value.slice(0, 20))}
            placeholder="z.B. Anna"
            maxLength={20}
            autoComplete="nickname"
            enterKeyHint="go"
            className="h-14 px-4 border-[1.5px] border-line-strong rounded-[14px] bg-white text-lg outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
          />
          <span className="text-[13px] text-muted">Wird auf diesem Gerät gemerkt.</span>
        </div>
        <button
          type="submit"
          disabled={!canCreate}
          className="press h-[58px] rounded-[14px] bg-accent disabled:bg-disabled text-white text-lg font-bold"
        >
          Neues Spiel eröffnen
        </button>
      </form>

      <div className="flex items-center gap-3 text-sm text-muted">
        <div className="flex-1 h-px bg-line-strong" />
        <span>oder mit Code beitreten</span>
        <div className="flex-1 h-px bg-line-strong" />
      </div>

      <form onSubmit={handleJoin} className="flex gap-2.5">
        <label htmlFor="code" className="sr-only">Spiel-Code</label>
        <input
          id="code"
          type="text"
          value={joinCode.toUpperCase()}
          onChange={e => setJoinCode(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 4))}
          placeholder="CODE"
          maxLength={4}
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="go"
          className="num flex-1 min-w-0 h-[58px] px-3 border-[1.5px] border-line-strong rounded-[14px] bg-white text-2xl font-bold tracking-[0.3em] text-center outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
        />
        <button
          type="submit"
          disabled={!canJoin}
          className="press w-[130px] h-[58px] rounded-[14px] border-[1.5px] border-accent disabled:border-line-strong bg-white text-accent disabled:text-disabled text-[17px] font-bold"
        >
          Beitreten
        </button>
      </form>

      <div className="flex-1" />
      {!isConnected && (
        <p className="m-0 text-center text-sm text-danger-ink">Verbindung zum Server wird aufgebaut …</p>
      )}
    </div>
  );
};

// --- Einladen ---
const InviteSheet = ({ gameCode, onClose, showToast }: { gameCode: string; onClose: () => void; showToast: ShowToast }) => {
  const shareUrl = `${window.location.origin}/?join=${gameCode}`;

  const handleShare = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Sidi Barrani', text: `Komm und spiel Sidi Barrani! Code: ${gameCode.toUpperCase()}`, url: shareUrl });
      } else {
        await navigator.clipboard.writeText(shareUrl);
        showToast('Link kopiert');
      }
      onClose();
    } catch {
      // Teilen abgebrochen
    }
  };

  return (
    <BottomSheet label="Spieler einladen" onClose={onClose}>
      <div className="flex flex-col items-center gap-3.5">
        <h2 className="m-0 text-xl font-extrabold">Spieler einladen</h2>
        <div className="p-3 rounded-[18px] border border-line bg-white">
          <QRCodeSVG value={shareUrl} size={184} />
        </div>
        <span className="num text-4xl font-extrabold tracking-[0.18em] pl-[0.18em] uppercase">{gameCode}</span>
        <button onClick={handleShare} className="press w-full h-14 rounded-[14px] bg-accent text-white text-[17px] font-bold flex items-center justify-center gap-2.5">
          <Share2 size={20} /> Link teilen
        </button>
      </div>
    </BottomSheet>
  );
};

// --- Lobby ---
const LobbyPage = ({ game, playerId, socket, onInvite, onLeave }: {
  game: Game; playerId: string; socket: Socket | null; onInvite: () => void; onLeave: () => void;
}) => {
  const isCreator = game.creatorId === playerId;
  const creatorName = game.players.find(p => p.id === game.creatorId)?.name ?? 'den Ersteller';
  const count = game.players.length;
  const canStart = ALLOWED_PLAYER_COUNTS.includes(count);
  const startLabel = count < 4 ? `Warte auf Mitspieler … (${count}/4)`
    : count === 4 ? 'Mit 4 Spielern starten'
    : count === 5 ? 'Für 6 Spieler fehlt noch 1'
    : 'Mit 6 Spielern starten';

  const slots = Array.from({ length: MAX_PLAYERS }, (_, i) => game.players[i] ?? null);

  // Spieler um eine Position verschieben (nur Ersteller, vor dem Start)
  const move = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= count) return;
    const order = game.players.map(p => p.id);
    [order[index], order[target]] = [order[target], order[index]];
    socket?.emit('reorderPlayers', { order });
  };

  return (
    <div className="h-dvh max-w-md mx-auto flex flex-col">
      <div className="h-[60px] shrink-0 flex items-center justify-between pl-2 pr-3">
        <button onClick={onLeave} aria-label="Spiel verlassen" className="press w-11 h-11 rounded-xl flex items-center justify-center">
          <ChevronLeft size={24} />
        </button>
        <span className="font-bold text-[17px]">Lobby</span>
        <div className="w-11" />
      </div>

      <div className="flex-1 overflow-y-auto px-5 pt-1 pb-5 flex flex-col gap-5">
        <div className="bg-white rounded-[22px] border border-line px-5 py-5 flex flex-col items-center gap-1.5">
          <span className="text-[13px] font-semibold text-muted uppercase tracking-[0.08em]">Spiel-Code</span>
          <span className="num text-[52px] font-extrabold tracking-[0.18em] pl-[0.18em] uppercase">{game.gameCode}</span>
          <button onClick={onInvite} className="press mt-2.5 w-full h-[52px] rounded-[14px] bg-accent-tint text-accent-ink text-[17px] font-bold flex items-center justify-center gap-2.5">
            <QrCode size={20} /> Spieler einladen
          </button>
        </div>

        <div className="flex flex-col gap-2.5">
          <div className="flex justify-between items-baseline">
            <h2 className="m-0 text-[15px] font-bold">Reihenfolge</h2>
            <span className="num text-sm text-muted">{count} Spieler · Start mit 4 oder 6</span>
          </div>
          <p className="m-0 -mt-1 text-[13px] text-muted">
            {isCreator
              ? 'Ordne die Spieler so, wie ihr am Tisch sitzt. Geboten wird reihum in dieser Reihenfolge, Nr. 1 beginnt.'
              : 'Geboten wird reihum in dieser Reihenfolge. Der Ersteller legt sie vor dem Start fest.'}
          </p>
          {slots.map((p, i) => p ? (
            <div key={p.id} className="h-[60px] flex items-center gap-2.5 pl-3 pr-1.5 rounded-2xl bg-white border border-line">
              <span className="num w-5 text-center text-[15px] font-bold text-muted">{i + 1}</span>
              <Avatar name={p.name} />
              <div className="flex-1 min-w-0 flex flex-col leading-tight">
                <span className="font-semibold text-[17px] truncate">{p.name}</span>
                {(p.id === playerId || p.id === game.creatorId) && (
                  <span className="text-xs text-muted">
                    {[p.id === playerId && 'Du', p.id === game.creatorId && 'Ersteller'].filter(Boolean).join(' · ')}
                  </span>
                )}
              </div>
              {isCreator && (
                <div className="flex gap-1">
                  <button onClick={() => move(i, -1)} disabled={i === 0} aria-label={`${p.name} nach oben`} className="press w-11 h-11 rounded-xl bg-neutral-soft text-ink disabled:text-line-strong flex items-center justify-center">
                    <ChevronUp size={22} />
                  </button>
                  <button onClick={() => move(i, 1)} disabled={i === count - 1} aria-label={`${p.name} nach unten`} className="press w-11 h-11 rounded-xl bg-neutral-soft text-ink disabled:text-line-strong flex items-center justify-center">
                    <ChevronDown size={22} />
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div key={`empty-${i}`} className="h-[60px] flex items-center gap-2.5 pl-3 pr-3.5 rounded-2xl border-[1.5px] border-dashed border-line-strong text-muted">
              <span className="num w-5 text-center text-[15px] font-bold">{i + 1}</span>
              <div className="w-9 h-9 rounded-full border-[1.5px] border-dashed border-line-strong" />
              <span>{i < 4 ? 'Freier Platz' : `Platz ${i + 1} · optional`}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="shrink-0 bg-white border-t border-line px-5 pt-3.5 pb-[calc(1.75rem+env(safe-area-inset-bottom))]">
        {isCreator ? (
          <button
            onClick={() => socket?.emit('startGame')}
            disabled={!canStart}
            className="press w-full h-[58px] rounded-[14px] bg-accent disabled:bg-disabled text-white text-lg font-bold"
          >
            {startLabel}
          </button>
        ) : (
          <div className="h-[58px] flex items-center justify-center gap-2.5 text-ink-2">
            <Clock size={20} /> Warte auf {creatorName}, bis das Spiel startet …
          </div>
        )}
      </div>
    </div>
  );
};

// --- Spiel ---
const GamePage = ({ game, playerId, socket, isConnected, onInvite, onMenu }: {
  game: Game; playerId: string; socket: Socket | null; isConnected: boolean;
  onInvite: () => void; onMenu: () => void;
}) => {
  const [pick, setPick] = useState<number | 'Match' | null>(null);
  const [flashId, setFlashId] = useState<string | null>(null);
  const prevBidCount = useRef(game.bids.length);

  const isCreator = game.creatorId === playerId;
  const best = highestBid(game.bids);
  const over = isRoundOver(game);
  const played = isPlayed(game);
  const myTurn = mayAct(game, playerId);
  const canUndo = mayUndo(game, playerId);
  const lastBid = game.bids[game.bids.length - 1];
  const turn = currentPlayer(game);
  const starterId = game.players[game.startIndex % game.players.length]?.id;
  // Wer kommt noch vor mir an die Reihe?
  const beforeMe: string[] = [];
  if (turn) {
    const n = game.players.length;
    for (let i = game.players.indexOf(turn); game.players[i % n].id !== playerId && beforeMe.length < n; i++) {
      beforeMe.push(game.players[i % n].name);
    }
  }
  const creatorName = game.players.find(p => p.id === game.creatorId)?.name ?? 'den Ersteller';

  const allowed = allowedValues(game.bids);
  const value = pick !== null && allowed.includes(pick) ? pick : allowed[0] ?? null;
  const valueIndex = value === null ? -1 : allowed.indexOf(value);

  // Neue Gebote anderer kurz hervorheben (und leicht vibrieren)
  useEffect(() => {
    if (game.bids.length > prevBidCount.current) {
      const latest = game.bids[game.bids.length - 1];
      setFlashId(latest.playerId);
      if (latest.playerId !== playerId) navigator.vibrate?.(30);
      const t = setTimeout(() => setFlashId(null), 1300);
      prevBidCount.current = game.bids.length;
      return () => clearTimeout(t);
    }
    prevBidCount.current = game.bids.length;
  }, [game.bids, playerId]);

  const placeBid = (gameType: GameType) => {
    if (!socket || value === null || !myTurn || !isConnected) return;
    socket.emit('placeBid', { gameType, value });
    setPick(null);
  };

  const pass = () => {
    if (!socket || !myTurn || !isConnected) return;
    socket.emit('placeBid', { value: 'Pass' });
  };

  const undoAndEdit = () => {
    if (lastBid && lastBid.value !== 'Pass') setPick(lastBid.value);
    socket?.emit('deleteLastBid');
  };

  const step = (dir: number) => {
    const next = allowed[valueIndex + dir];
    if (next !== undefined) setPick(next);
  };

  // Info-Box über den Spielern
  let banner: { style: string; overline: string; title: string; sub: string; icon?: string };
  if (over && !played) {
    banner = {
      style: 'bg-warn-bg text-warn-ink', overline: 'Bietrunde beendet', title: 'Nicht gespielt',
      sub: best ? `Höchstgebot ${formatValue(best.value)} liegt unter ${MIN_PLAY_VALUE}` : 'Alle haben gepasst',
    };
  } else if (best) {
    const byMe = best.playerId === playerId;
    banner = {
      style: over ? 'bg-accent text-white' : 'bg-accent-banner text-ink',
      overline: over ? 'Bietrunde beendet' : 'Höchstgebot',
      title: `${formatValue(best.value)} ${best.gameType}`,
      sub: over
        ? (byMe ? 'Du spielst' : `${best.playerName} spielt`)
        : `von ${byMe ? 'dir' : best.playerName}${numericValue(best.value) < MIN_PLAY_VALUE ? ` · gespielt wird ab ${MIN_PLAY_VALUE}` : ''}`,
      icon: suitIcon(best.gameType),
    };
  } else {
    banner = { style: 'bg-accent-idle text-ink', overline: 'Höchstgebot', title: 'Noch kein Gebot', sub: `Gespielt wird ab ${MIN_PLAY_VALUE}` };
  }

  const myLast = lastBid && lastBid.playerId === playerId ? lastBid : null;

  return (
    <div className="h-dvh max-w-md mx-auto flex flex-col">
      {/* Kopfzeile */}
      <div className="h-[60px] shrink-0 flex items-center gap-2 pl-3.5 pr-2">
        <button onClick={onInvite} aria-label="Spiel-Code teilen" className="press num h-11 px-3 rounded-xl border border-line bg-white flex items-center gap-2 font-extrabold tracking-[0.12em] uppercase">
          {game.gameCode}
          <Share2 size={16} className="text-muted" />
        </button>
        <div className="flex-1" />
        <span className={`h-11 px-3 rounded-full flex items-center gap-2 text-sm font-semibold ${isConnected ? 'bg-neutral-btn text-ink-2' : 'bg-danger-bg text-danger-ink'}`}>
          <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-online' : 'bg-offline'}`} />
          {isConnected ? 'Verbunden' : 'Offline'}
        </span>
        <button onClick={onMenu} aria-label="Menü" className="press w-11 h-11 rounded-xl flex items-center justify-center">
          <MoreVertical size={22} />
        </button>
      </div>

      {!isConnected && (
        <div className="mx-3.5 mb-2 px-3.5 py-2.5 rounded-xl bg-danger-bg text-danger-ink text-sm font-semibold flex items-center gap-2.5 shrink-0">
          <WifiOff size={18} /> Verbindung unterbrochen – verbinde neu …
        </div>
      )}

      {/* Höchstgebot */}
      <div className={`mx-3.5 px-4 py-3 rounded-[20px] flex items-center gap-4 shrink-0 transition-colors ${banner.style}`}>
        {banner.icon && (
          <div className="w-[50px] h-[50px] rounded-[15px] bg-white flex items-center justify-center shrink-0">
            <img src={banner.icon} alt="" className="w-[30px] h-[30px] object-contain" />
          </div>
        )}
        <div className="flex flex-col gap-0.5 min-w-0">
          <span className="text-xs font-bold uppercase tracking-[0.08em] opacity-85">{banner.overline}</span>
          <span className="num text-[26px] font-extrabold leading-tight">{banner.title}</span>
          <span className="text-sm opacity-90">{banner.sub}</span>
        </div>
      </div>

      {/* Spieler mit allen ihren Geboten */}
      <div className="flex-1 min-h-0 overflow-y-auto px-3.5 py-2.5 flex flex-col gap-1.5">
        {game.players.map(p => {
          const tags = [p.id === playerId && 'Du', p.id === starterId && 'beginnt'].filter(Boolean).join(' · ');
          const onTurn = turn?.id === p.id;
          const chips = game.bids.map((b, i) => ({ b, n: i + 1 })).filter(({ b }) => b.playerId === p.id);
          return (
            <div
              key={p.id}
              className={`flex items-start gap-2 px-2.5 py-2 rounded-[14px] border-[1.5px] transition-colors duration-500 ${flashId === p.id ? 'bg-flash' : 'bg-white'} ${onTurn ? 'border-accent ring-2 ring-accent/25' : 'border-line'}`}
            >
              <div className="w-[100px] shrink-0 flex items-center gap-2 min-h-[30px]">
                <Avatar name={p.name} size="sm" />
                <div className="min-w-0 flex flex-col leading-tight">
                  <span className="font-bold text-[15px] truncate">{p.name}</span>
                  {tags && <span className="text-[11px] text-muted whitespace-nowrap">{tags}</span>}
                </div>
              </div>
              <div className="flex-1 min-w-0 flex flex-wrap gap-1 items-center min-h-[30px]">
                {chips.length === 0 && !onTurn && <span className="text-[13px] text-muted">noch kein Gebot</span>}
                {chips.map(({ b, n }) => {
                  const lead = best === b;
                  const isPass = b.value === 'Pass';
                  return (
                    <span
                      key={n}
                      aria-label={`Gebot ${n}: ${bidLabel(b)}`}
                      className={`num h-7 inline-flex items-center gap-1 pl-1.5 pr-2 rounded-lg border text-[13px] font-bold whitespace-nowrap ${
                        isPass ? 'bg-ground border-ground text-muted'
                        : lead ? 'bg-accent-soft border-accent text-accent-ink'
                        : 'bg-white border-line-strong text-ink'}`}
                    >
                      <span className="text-[10px] font-semibold opacity-70">{n}</span>
                      {!isPass && <img src={suitIcon(b.gameType)} alt={b.gameType} className="w-[15px] h-[15px] object-contain" />}
                      {formatValue(b.value)}
                    </span>
                  );
                })}
                {onTurn && (
                  <span className="h-7 inline-flex items-center px-2 rounded-lg bg-accent text-white text-[12px] font-bold whitespace-nowrap">
                    {p.id === playerId ? 'Du bist dran' : 'am Zug'}
                  </span>
                )}
              </div>
            </div>
          );
        })}
        <span className="text-xs text-muted text-center py-1">
          Geboten wird reihum von oben nach unten. Die kleine Zahl zeigt die Reihenfolge der Gebote. Gespielt wird ab {MIN_PLAY_VALUE}.
        </span>
      </div>

      {/* Bedienfeld in der Daumenzone */}
      <div className="shrink-0 bg-white border-t border-line rounded-t-3xl px-3.5 pt-3 pb-[calc(1.5rem+env(safe-area-inset-bottom))] flex flex-col gap-2 shadow-[0_-6px_20px_rgba(22,32,28,0.06)]">
        {myTurn ? (
          <>
            <div className="flex items-center gap-2.5">
              <button onClick={() => step(-1)} disabled={valueIndex <= 0} aria-label="Wert verringern" className="press w-[52px] h-12 rounded-[14px] border-[1.5px] border-line-strong bg-white text-ink disabled:text-line-strong flex items-center justify-center">
                <Minus size={24} strokeWidth={2.4} />
              </button>
              <div className="flex-1 flex flex-col items-center leading-none">
                <span className="num text-[32px] font-extrabold">{value === null ? '–' : formatValue(value)}</span>
                <span className="text-xs text-muted mt-1">
                  {value === 'Match' ? 'alle Stiche (157)' : valueIndex === 0 ? 'nächstmöglicher Wert' : 'Wert gewählt'}
                </span>
              </div>
              <button onClick={() => step(1)} disabled={valueIndex < 0 || valueIndex >= allowed.length - 1} aria-label="Wert erhöhen" className="press w-[52px] h-12 rounded-[14px] border-[1.5px] border-line-strong bg-white text-ink disabled:text-line-strong flex items-center justify-center">
                <Plus size={24} strokeWidth={2.4} />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {SUITS.map(s => (
                <button
                  key={s.type}
                  onClick={() => placeBid(s.type)}
                  disabled={!isConnected || value === null}
                  style={isConnected ? { background: s.tint, borderColor: s.border } : undefined}
                  className="press h-14 rounded-[14px] border-[1.5px] border-line bg-ground disabled:opacity-50 flex flex-col items-center justify-center gap-1 text-sm font-bold"
                >
                  <img src={s.icon} alt="" className="w-[22px] h-[22px] object-contain" />
                  {s.type}
                </button>
              ))}
            </div>
            <button onClick={pass} disabled={!isConnected} className="press h-12 rounded-[14px] bg-neutral-btn disabled:opacity-50 text-[17px] font-bold">
              Ich passe
            </button>
          </>
        ) : (
          <div className="flex flex-col items-center gap-3 pt-2 pb-1">
            <span className="text-[17px] font-bold text-center">
              {over ? (played ? 'Bietrunde beendet' : 'Nicht gespielt')
                : myLast ? (myLast.value === 'Pass' ? 'Du hast gepasst' : `Du hast ${bidLabel(myLast)} geboten`)
                : `${turn?.name ?? 'Jemand anderes'} ist am Zug`}
            </span>
            <span className="text-[15px] text-muted text-center">
              {over
                ? (isCreator ? 'Starte die nächste Runde, wenn ihr bereit seid.' : `Warte auf ${creatorName} für die nächste Runde.`)
                : `Vor dir: ${beforeMe.join(', ')}`}
            </span>
            {canUndo && (
              <>
                <button onClick={undoAndEdit} disabled={!isConnected} className="press w-full h-[52px] rounded-[14px] border-[1.5px] border-accent bg-white text-accent-ink text-[17px] font-bold flex items-center justify-center gap-2.5 disabled:opacity-50">
                  <Undo2 size={20} /> Zurücknehmen und neu setzen
                </button>
                <span className="text-xs text-muted text-center">Möglich, bis die nächste Person geboten oder gepasst hat.</span>
              </>
            )}
            {over && isCreator && (
              <button onClick={() => socket?.emit('newRound')} className="press w-full h-14 rounded-[14px] bg-accent text-white text-[17px] font-bold flex items-center justify-center gap-2.5">
                <RotateCcw size={20} /> Neue Runde starten
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// --- Menü im Spiel ---
const MenuSheet = ({ isCreator, onNewRound, onInvite, onLeave, onClose }: {
  isCreator: boolean; onNewRound: () => void; onInvite: () => void; onLeave: () => void; onClose: () => void;
}) => {
  const [confirmLeave, setConfirmLeave] = useState(false);
  const item = 'press h-14 rounded-[14px] text-[17px] font-semibold flex items-center gap-3.5 px-4';
  return (
    <BottomSheet label="Menü" onClose={onClose}>
      <div className="flex flex-col gap-1.5">
        {isCreator && (
          <button onClick={onNewRound} className={`${item} bg-neutral-soft`}><RotateCcw size={22} /> Neue Bietrunde</button>
        )}
        <button onClick={onInvite} className={`${item} bg-neutral-soft`}><UserPlus size={22} /> Spieler einladen</button>
        <button onClick={() => (confirmLeave ? onLeave() : setConfirmLeave(true))} className={`${item} bg-danger-bg text-danger-ink`}>
          <LogOut size={22} /> {confirmLeave ? 'Wirklich verlassen? Nochmals tippen' : 'Spiel verlassen'}
        </button>
      </div>
    </BottomSheet>
  );
};

// --- App ---
export default function App() {
  const [game, setGame] = useState<Game | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [sheet, setSheet] = useState<'invite' | 'menu' | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback<ShowToast>((text) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ id: Date.now(), text });
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  }, []);

  const resetSession = useCallback(() => {
    SESSION_KEYS.forEach(k => writeStorage(session, k, null));
    setGame(null);
    setPlayerId(null);
    setSheet(null);
  }, []);

  useEffect(() => {
    const socket = io();
    socketRef.current = socket;

    socket.on('connect', () => {
      setIsConnected(true);
      const savedPlayerId = readStorage(session, 'sidibarrani_playerId');
      const savedGameCode = readStorage(session, 'sidibarrani_gameCode');
      const savedToken = readStorage(session, 'sidibarrani_token');
      if (savedPlayerId && savedGameCode && savedToken) {
        socket.emit('rejoinGame', { gameCode: savedGameCode, playerId: savedPlayerId, token: savedToken });
      }
    });

    socket.on('disconnect', () => setIsConnected(false));

    const onEnter = (data: { game: Game; playerId: string; token: string }) => {
      setGame(data.game);
      setPlayerId(data.playerId);
      writeStorage(session, 'sidibarrani_playerId', data.playerId);
      writeStorage(session, 'sidibarrani_gameCode', data.game.gameCode);
      writeStorage(session, 'sidibarrani_token', data.token);
    };
    socket.on('gameCreated', onEnter);
    socket.on('gameJoined', onEnter);
    socket.on('gameStateUpdate', (data: { game: Game }) => setGame(data.game));

    socket.on('error', (data: { message: string }) => {
      showToast(ERROR_TEXT[data.message] ?? 'Etwas ist schiefgelaufen');
      if (SESSION_ERRORS.includes(data.message)) resetSession();
    });

    return () => {
      socket.disconnect();
    };
  }, [showToast, resetSession]);

  // Bildschirm während des Spiels wach halten
  const inGame = !!game?.started;
  useEffect(() => {
    if (!inGame || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    const request = async () => {
      try {
        if (document.visibilityState === 'visible') lock = await navigator.wakeLock.request('screen');
      } catch { /* z.B. Energiesparmodus */ }
    };
    request();
    document.addEventListener('visibilitychange', request);
    return () => {
      document.removeEventListener('visibilitychange', request);
      lock?.release().catch(() => {});
    };
  }, [inGame]);

  const closeSheet = useCallback(() => setSheet(null), []);

  const leave = () => {
    socketRef.current?.emit('leaveGame');
    resetSession();
  };

  const socket = socketRef.current;
  let page: ReactNode;
  if (!game || !playerId) {
    page = <HomePage socket={socket} isConnected={isConnected} />;
  } else if (!game.started) {
    page = <LobbyPage game={game} playerId={playerId} socket={socket} onInvite={() => setSheet('invite')} onLeave={leave} />;
  } else {
    page = (
      <GamePage
        game={game} playerId={playerId} socket={socket} isConnected={isConnected}
        onInvite={() => setSheet('invite')} onMenu={() => setSheet('menu')}
      />
    );
  }

  return (
    <div className="font-sans text-ink">
      {page}

      <div aria-live="polite" className="fixed top-[68px] inset-x-0 z-30 px-3.5 pointer-events-none">
        {toast && (
          <div key={toast.id} role="status" className="mx-auto max-w-md min-h-[52px] px-4 py-3 rounded-2xl bg-ink text-white flex items-center shadow-[0_10px_30px_rgba(0,0,0,0.25)]">
            <span className="text-[15px] font-semibold">{toast.text}</span>
          </div>
        )}
      </div>

      {game && sheet === 'invite' && (
        <InviteSheet gameCode={game.gameCode} onClose={closeSheet} showToast={showToast} />
      )}
      {game && playerId && sheet === 'menu' && (
        <MenuSheet
          isCreator={game.creatorId === playerId}
          onNewRound={() => { socket?.emit('newRound'); setSheet(null); showToast('Neue Bietrunde gestartet'); }}
          onInvite={() => setSheet('invite')}
          onLeave={leave}
          onClose={closeSheet}
        />
      )}
    </div>
  );
}
