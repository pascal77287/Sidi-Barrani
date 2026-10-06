/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { QRCodeSVG } from 'qrcode.react';
import { Share2, X, RotateCcw, Trash2 } from 'lucide-react';
import { Suit, SpecialGameType, GameType, Bid } from './types';
import type { Game, BidValue } from './types';

const HomePage = ({ socket, setPlayerId, setGame, isConnected }: {
  socket: Socket | null;
  setPlayerId: (id: string) => void;
  setGame: (game: Game) => void;
  isConnected: boolean;
}) => {
  const [playerName, setPlayerName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [mode, setMode] = useState<'select' | 'create' | 'join'>('select');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const joinParam = params.get('join');
    if (joinParam) {
      setJoinCode(joinParam);
      setMode('join');
    }
  }, []);

  const handleCreateGame = () => {
    if (playerName.trim() && socket) {
      socket.emit('createGame', { playerName });
    }
  };

  const handleJoinGame = () => {
    if (playerName.trim() && joinCode.trim() && socket) {
      socket.emit('joinGame', { playerName, gameCode: joinCode });
      // clean up url after join
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  };

  return (
    <div className="p-4 bg-slate-50 min-h-screen flex flex-col items-center justify-center font-sans text-slate-900">
      <div className="w-full max-w-sm bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <h1 className="text-3xl font-bold tracking-tight text-center mb-6 text-slate-900">Sidi Barrani</h1>
        
        {mode === 'select' && (
          <div className="flex flex-col gap-4">
            <button 
              onClick={() => setMode('create')}
              className="w-full bg-slate-900 text-white py-4 px-2 rounded-lg font-semibold hover:bg-slate-800 transition-colors"
              disabled={!isConnected}
            >
              Neues Spiel eröffnen
            </button>
            <button 
              onClick={() => setMode('join')}
              className="w-full bg-white text-slate-800 border border-slate-300 py-4 px-2 rounded-lg font-semibold hover:bg-slate-50 transition-colors"
              disabled={!isConnected}
            >
              Einem Spiel beitreten
            </button>
            {!isConnected && (
              <p className="text-center text-red-500 text-sm">Verbindung zum Server wird aufgebaut...</p>
            )}
          </div>
        )}

        {mode === 'create' && (
          <div className="flex flex-col">
            <h2 className="text-lg font-semibold mb-4 text-center">Spiel eröffnen</h2>
            <input
              type="text"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              placeholder="Dein Name"
              className="w-full p-3 border border-slate-300 rounded-lg mb-4 focus:ring-1 focus:ring-slate-900 focus:border-slate-900 outline-none transition-all"
              autoFocus
            />
            <button 
              onClick={handleCreateGame} 
              className="w-full bg-slate-900 text-white p-3 rounded-lg font-semibold hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed mb-4 transition-colors" 
              disabled={!isConnected || !playerName.trim()}
            >
              Spiel erstellen
            </button>
            <button 
              onClick={() => setMode('select')}
              className="text-gray-500 hover:text-gray-700 text-sm font-medium"
            >
              &larr; Zurück
            </button>
          </div>
        )}

        {mode === 'join' && (
          <div className="flex flex-col">
            <h2 className="text-lg font-semibold mb-4 text-center">Spiel beitreten</h2>
            <input
              type="text"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              placeholder="Dein Name"
              className="w-full p-3 border border-slate-300 rounded-lg mb-4 focus:ring-1 focus:ring-slate-900 focus:border-slate-900 outline-none transition-all"
              autoFocus
            />
            <input
              type="text"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toLowerCase())}
              placeholder="4-stelliger Spiel-Code"
              className="w-full p-3 border border-slate-300 rounded-lg mb-4 focus:ring-1 focus:ring-slate-900 focus:border-slate-900 outline-none text-center font-mono text-xl tracking-widest transition-all uppercase"
              maxLength={4}
            />
            <button 
              onClick={handleJoinGame} 
              className="w-full bg-slate-900 text-white p-3 rounded-lg font-semibold hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed mb-4 transition-colors" 
              disabled={!isConnected || !playerName.trim() || !joinCode.trim()}
            >
              Beitreten
            </button>
            <button 
              onClick={() => setMode('select')}
              className="text-gray-500 hover:text-gray-700 text-sm font-medium"
            >
              &larr; Zurück
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

const GamePage = ({ game, playerId, socket }: { game: Game, playerId: string, socket: Socket | null }) => {
  const isCreator = game.creatorId === playerId;
  const [showShareModal, setShowShareModal] = useState(false);

  const handleStartGame = () => {
    if (socket) {
      socket.emit('startGame', { gameCode: game.gameCode });
    }
  };

  const shareUrl = `${window.location.origin}?join=${game.gameCode}`;

  const handleShareClick = () => {
    if (navigator.share) {
      navigator.share({
        title: 'Sidi Barrani',
        text: `Komm und spiel Sidi Barrani! Code: ${game.gameCode}`,
        url: shareUrl,
      }).catch(console.error);
    } else {
      setShowShareModal(true);
    }
  };

  return (
    <div className="p-4 bg-slate-50 min-h-screen flex flex-col items-center font-sans text-slate-900">
      <div className="w-full max-w-md bg-white p-6 rounded-xl border border-slate-200 shadow-sm relative">
        {showShareModal && (
          <div 
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
            onClick={() => setShowShareModal(false)}
          >
            <div 
              className="bg-white p-6 rounded-xl shadow-xl flex flex-col items-center max-w-sm w-full relative"
              onClick={e => e.stopPropagation()}
            >
              <button 
                onClick={() => setShowShareModal(false)} 
                className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
                title="Schliessen"
              >
                <X size={24} />
              </button>
              <h3 className="text-xl font-bold mb-4">Spiel einladen</h3>
              <p className="text-gray-600 mb-6 text-center">Scan den Code oder teile den Link mit deinen Freunden</p>
              <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 mb-6 flex justify-center items-center">
                 <QRCodeSVG value={shareUrl} size={200} />
              </div>
              <p className="font-mono text-2xl font-bold tracking-widest mb-6 text-slate-900 uppercase">{game.gameCode}</p>
              <div className="flex gap-2 w-full">
                {navigator.share ? (
                  <button onClick={handleShareClick} className="w-full bg-slate-900 text-white p-3 rounded-lg font-semibold hover:bg-slate-800 flex items-center justify-center gap-2 transition-colors">
                    <Share2 size={18} /> Teilen
                  </button>
                ) : (
                  <button onClick={() => setShowShareModal(false)} className="w-full bg-white border border-slate-300 text-slate-800 p-3 rounded-lg font-semibold hover:bg-slate-50 transition-colors">Schliessen</button>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-3 mb-4">
          <div className="flex justify-between items-center">
            <h1 className="text-xl font-bold flex items-center gap-2">
              Spiel: 
              <button 
                onClick={() => setShowShareModal(true)} 
                className="flex items-center gap-2 bg-slate-100 text-slate-800 px-3 py-1 rounded hover:bg-slate-200 transition-colors cursor-pointer group"
                title="Spiel teilen"
              >
                <span className="font-mono tracking-wider uppercase text-sm font-semibold">{game.gameCode}</span>
                <Share2 size={16} className="text-slate-400 group-hover:text-slate-600" />
              </button>
            </h1>
          </div>
          <div className="flex gap-2">
            {isCreator && !game.started && (
              <button onClick={handleStartGame} className="w-full bg-slate-900 text-white px-4 py-2 rounded-lg font-semibold hover:bg-slate-800 transition-colors">
                Spiel starten
              </button>
            )}
          </div>
        </div>

        <div className="mb-4">
          <h2 className="text-sm font-bold uppercase tracking-wider border-b border-slate-200 pb-2 mb-3 px-1 flex items-center justify-between text-slate-500">Spieler</h2>
          <div className="grid grid-cols-2 gap-2">
            {game.players.map(p => (
              <div key={p.id} className={`px-3 py-2 rounded-lg bg-white border flex items-center justify-between ${p.id === playerId ? 'font-semibold text-slate-900 border-slate-800 bg-slate-50' : 'text-slate-600 border-slate-200'}`}>
                <span className="truncate text-sm">{p.name}</span>
                {p.id === game.creatorId && <span className="text-[9px] uppercase tracking-wider text-slate-400 border border-slate-200 bg-white px-1.5 py-0.5 rounded ml-2">Ersteller</span>}
              </div>
            ))}
          </div>
        </div>

        {game.started ? (
          <BiddingComponent game={game} playerId={playerId} socket={socket} />
        ) : (
          <div className="text-center text-gray-500">Das Spiel hat noch nicht begonnen.</div>
        )}
      </div>
    </div>
  );
};

const BiddingComponent = ({ game, playerId, socket }: { game: Game, playerId: string, socket: Socket | null }) => {
  const [bidValue, setBidValue] = useState<number | 'Match'>('');
  const [errorMsg, setErrorMsg] = useState('');

  const isCreator = game.creatorId === playerId;

  const handleNewRound = () => {
    if (socket) {
      socket.emit('newRound', { gameCode: game.gameCode });
    }
  };

  const handleDeleteLastBid = () => {
    if (socket) {
      socket.emit('deleteLastBid', { gameCode: game.gameCode, playerId });
    }
  };

  // Helper zum Vergleich von Werten
  const getNumericValue = (val: BidValue): number => {
    if (val === 'Match') return 157;
    if (val === 'Pass') return -1;
    return val as number;
  };

  // Höchstes aktuelles Gebat finden (Pass ignorieren)
  const currentHighestValue = Math.max(
    ...game.bids
      .filter(b => b.value !== 'Pass')
      .map(b => getNumericValue(b.value)),
    0
  );

  // Liste aller möglichen Werte
  const allValues: (number | 'Match')[] = [
    ...Array.from({ length: 15 }, (_, i) => (i + 1) * 10),
    'Match'
  ];

  // Nur Werte erlauben, die höher als das aktuelle Gebot sind
  const availableValues = allValues.filter(val => getNumericValue(val) > currentHighestValue);

  // Automatische Vorauswahl des nächsten Wertes
  useEffect(() => {
    if (availableValues.length > 0) {
      // Wenn nichts gewählt oder das Gewählte nicht mehr gültig ist: Nächsthöheren wählen
      if (bidValue === '' || getNumericValue(bidValue) <= currentHighestValue) {
        setBidValue(availableValues[0]);
      }
    } else if (currentHighestValue >= 157) {
      setBidValue('');
    }
  }, [currentHighestValue, availableValues, bidValue]);

  const handleBid = (type: GameType | 'Pass') => {
    if (!socket) return;
    setErrorMsg('');

    if (type === 'Pass') {
      const passBid: Bid = {
        playerId,
        playerName: game.players.find(p => p.id === playerId)?.name || 'Unknown',
        gameType: Suit.ROSEN, // Dummy suit for Pass
        value: 'Pass',
      };
      socket.emit('placeBid', { gameCode: game.gameCode, bid: passBid });
      return;
    }

    if (bidValue === '') {
      setErrorMsg('Bitte wähle zuerst einen Wert.');
      return;
    }

    const bid: Bid = {
      playerId,
      playerName: game.players.find(p => p.id === playerId)?.name || 'Unknown',
      gameType: type,
      value: bidValue,
    };

    socket.emit('placeBid', { gameCode: game.gameCode, bid });
  };

  const getSuitDisplay = (suit: string) => {
    const baseClass = "bg-white border border-slate-300 text-slate-700 hover:border-slate-800 hover:text-slate-900";
    switch (suit) {
      case 'Eicheln': return { color: baseClass, label: 'Eicheln', icon: '/eichel.svg' };
      case 'Schellen': return { color: baseClass, label: 'Schellen', icon: '/schellen.svg' };
      case 'Schilten': return { color: baseClass, label: 'Schilten', icon: '/schilten.svg' };
      case 'Rosen': return { color: baseClass, label: 'Rosen', icon: '/rose.svg' };
      case 'Obeabe': return { color: baseClass, label: 'Obeabe', icon: '/obeabe.svg' };
      case 'Uneufe': return { color: baseClass, label: 'Uneufe', icon: '/uneufe.svg' };
      default: return { color: baseClass, label: suit, icon: '' };
    }
  };

  return (
    <div>
      <h2 className="text-sm font-bold uppercase tracking-wider border-b border-slate-200 pb-2 mb-3 px-1 flex items-center justify-between text-slate-500">Bieten</h2>
      <div className="flex gap-2 mb-3">
        <select 
          value={bidValue} 
          onChange={e => {
            const val = e.target.value;
            setBidValue(val === 'Match' ? 'Match' : Number(val));
          }} 
          className="w-full p-3 border border-slate-300 rounded-lg bg-white font-semibold outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900 text-slate-900 transition-colors" 
          disabled={availableValues.length === 0}
        >
          <option value="" disabled>Wert wählen...</option>
          {availableValues.map(val => (
            <option key={val} value={val}>{val === 'Match' ? 'Match (157)' : val}</option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-4 gap-1 mb-2">
        {(Object.values(Suit) as GameType[]).map(gt => {
          const display = getSuitDisplay(gt as string);
          return (
            <button 
              key={gt} 
              onClick={() => handleBid(gt)} 
              disabled={availableValues.length === 0 || bidValue === ''}
              className={`p-2 min-h-[44px] rounded-lg font-semibold text-[11px] sm:text-xs transition-all active:scale-95 text-center break-words leading-tight flex flex-col gap-1 items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed ${display.color}`}
            >
              {display.icon && <img src={display.icon} alt={display.label} className="w-6 h-6 object-contain pointer-events-none" />}
              <span>{display.label}</span>
            </button>
          );
        })}
      </div>
      
      <div className="grid grid-cols-4 gap-1 mb-6">
        {(Object.values(SpecialGameType) as GameType[]).map(gt => {
          const display = getSuitDisplay(gt as string);
          return (
            <button 
              key={gt} 
              onClick={() => handleBid(gt)} 
              disabled={availableValues.length === 0 || bidValue === ''}
              className={`p-2 min-h-[44px] rounded-lg font-semibold text-[11px] sm:text-xs transition-all active:scale-95 text-center break-words leading-tight flex flex-col gap-1 items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed ${display.color}`}
            >
              {display.icon && <img src={display.icon} alt={display.label} className="w-6 h-6 object-contain pointer-events-none" />}
              <span>{display.label}</span>
            </button>
          );
        })}
        <button 
          onClick={() => handleBid('Pass')} 
          className="col-span-2 bg-slate-100 border border-slate-200 text-slate-700 p-2 min-h-[44px] rounded-lg font-semibold text-[11px] sm:text-xs hover:bg-slate-200 hover:text-slate-900 transition-all active:scale-95 flex items-center justify-center"
        >
          Ich passe
        </button>
      </div>

      {errorMsg && <p className="text-red-600 text-sm font-medium mb-3 text-center bg-red-50 p-2 rounded-lg border border-red-100">{errorMsg}</p>}

      <div className="mt-8">
        <h3 className="text-sm font-bold uppercase tracking-wider border-b border-slate-200 pb-2 mb-3 px-1 flex items-center justify-between text-slate-500">
          <span>Aktuelle Gebote</span>
          {isCreator && (
            <button 
              onClick={handleNewRound} 
              className="text-xs font-semibold text-slate-500 hover:text-slate-900 flex items-center gap-1 transition-colors"
            >
              <RotateCcw size={14} /> <span>Neue Runde</span>
            </button>
          )}
        </h3>
        <div className="space-y-2">
          {game.bids.length === 0 ? (
            <p className="text-slate-400 italic text-center py-4 bg-slate-50 rounded-lg text-sm border border-slate-100">Noch keine Gebote vorhanden</p>
          ) : (
            [...game.bids].reverse().map((b, index, arr) => {
              const originalIndex = arr.length - 1 - index;
              const isLastBid = originalIndex === game.bids.length - 1;
              const canDelete = isLastBid && b.playerId === playerId;

              return (
                <div 
                  key={originalIndex} 
                  className={`p-3 rounded-lg border flex justify-between items-center transition-colors ${
                    b.playerId === playerId ? 'bg-slate-50 border-slate-800 text-slate-900' : 'bg-white border-slate-200 text-slate-700'
                  } ${b.value === 'Pass' ? 'opacity-60' : ''}`}
                >
                  <span className="font-semibold text-sm">{b.playerName}</span>
                  <div className="flex items-center gap-3">
                    <span className={`px-2 py-0.5 rounded text-xs font-mono font-medium border ${b.value === 'Pass' ? 'bg-slate-100 border-slate-200 text-slate-500' : 'bg-white border-slate-300 text-slate-900'}`}>
                      {b.value === 'Pass' ? 'Passe' : `${b.gameType} ${b.value === 'Match' ? 'Match' : b.value}`}
                    </span>
                    {canDelete && (
                      <button 
                        onClick={handleDeleteLastBid} 
                        className="text-slate-400 hover:text-red-600 hover:bg-red-50 p-1.5 rounded transition-colors -mr-1"
                        title="Gebot löschen"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

export default function App() {
  const [game, setGame] = useState<Game | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    const socket = io();
    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('Socket.io connected');
      setIsConnected(true);

      const savedPlayerId = sessionStorage.getItem('sidibarrani_playerId');
      const savedGameCode = sessionStorage.getItem('sidibarrani_gameCode');
      if (savedPlayerId && savedGameCode) {
        socket.emit('rejoinGame', { gameCode: savedGameCode, playerId: savedPlayerId });
      }
    });
    
    socket.on('disconnect', () => {
      console.log('Socket.io disconnected');
      setIsConnected(false);
    });

    socket.on('gameCreated', (data) => {
      setGame(data.game);
      setPlayerId(data.playerId);
      sessionStorage.setItem('sidibarrani_playerId', data.playerId);
      sessionStorage.setItem('sidibarrani_gameCode', data.game.gameCode);
      setError(null);
    });

    socket.on('gameJoined', (data) => {
      setGame(data.game);
      setPlayerId(data.playerId);
      sessionStorage.setItem('sidibarrani_playerId', data.playerId);
      sessionStorage.setItem('sidibarrani_gameCode', data.game.gameCode);
      setError(null);
    });

    socket.on('gameStateUpdate', (data) => {
      setGame(data.game);
    });

    socket.on('error', (data) => {
      setError(data.message);
      if (data.message === 'Game not found' || data.message === 'Player not found in game') {
        sessionStorage.removeItem('sidibarrani_playerId');
        sessionStorage.removeItem('sidibarrani_gameCode');
        setGame(null);
        setPlayerId(null);
      }
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  if (error) {
    // Simple error display, could be a toast notification
    alert(error);
    setError(null);
  }

  if (!game || !playerId) {
    return <HomePage socket={socketRef.current} setPlayerId={setPlayerId} setGame={setGame} isConnected={isConnected} />;
  }

  return <GamePage game={game} playerId={playerId} socket={socketRef.current} />;
}
