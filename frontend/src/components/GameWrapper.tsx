import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, Zap, Target } from 'lucide-react';
import { EnergyModal } from './EnergyModal';
import { useLanguage } from '../i18n/LanguageContext';
import { showRewardedAd } from '../services/adsgram';
import { showMonetagRewardedAd } from '../services/monetagService';

interface Game {
  id: string;
  title: string;
  description: string;
  path: string;
  genre: string;
  icon: string;
  preview?: string;
  targetScore: number;
  coinSymbol: string;
  status?: 'active' | 'maintenance' | 'hidden' | 'coming_soon';
  maintenanceMessage?: string | null;
  hidden?: boolean;
}

interface GameWrapperProps {
  initData: string;
  backendUrl: string;
  currentEnergy: number;
  maxEnergy?: number;
  dailyAdLimit?: number;
  nextRechargeInSeconds: number;
  onGameFinished: () => void;
  referralLink: string;
  dailyAdCount: number;
  onOpenShop?: () => void;
}

export function GameWrapper({
  initData,
  backendUrl,
  currentEnergy,
  maxEnergy = 5,
  dailyAdLimit = 10,
  nextRechargeInSeconds,
  onGameFinished,
  referralLink,
  dailyAdCount,
  onOpenShop,
}: GameWrapperProps) {
  const { t, language } = useLanguage();
  const [activeGame, setActiveGame] = useState<Game | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [gameSessionToken, setGameSessionToken] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showEnergyPopup, setShowEnergyPopup] = useState(false);
  const [adReviveTimer, setAdReviveTimer] = useState<number | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [benchmarks, setBenchmarks] = useState<Record<string, { targetScore: number; totalRoundsPlayed: number }>>({});

  const fetchBenchmarks = useCallback(async () => {
    if (!initData) return;
    try {
      const res = await fetch(`${backendUrl}/api/game/benchmarks`, {
        headers: { Authorization: `Bearer ${initData}` },
      });
      if (res.ok) {
        const bData = await res.json();
        if (bData.benchmarks) {
          setBenchmarks(bData.benchmarks);
        }
      }
    } catch (err) {
      console.warn('Could not load benchmarks:', err);
    }
  }, [initData, backendUrl]);

  useEffect(() => {
    fetchBenchmarks();
  }, [fetchBenchmarks]);

  const gamesList: Game[] = [
    {
      id: 'doodlejump',
      title: 'Neon Jump',
      description: 'Springe hoch, weiche Hindernissen aus. Tastatur & Touch.',
      path: '/games/doodlejump/index.html',
      genre: 'Arcade / Jump',
      icon: '👾',
      preview: '/images/neon_jump_preview.png',
      targetScore: 100,
      coinSymbol: 'DOODLE',
    },
    {
      id: 'neonbird',
      title: 'Neon Bird',
      description: 'Fliege durch die Neon-Rohre und weiche Hindernissen aus. Leertaste & Touch.',
      path: '/games/neonbird/index.html',
      genre: 'Arcade / Flappy',
      icon: '🐦',
      preview: '/images/neon_bird_preview.png',
      targetScore: 25,
      coinSymbol: 'FLAPPY',
    },
    {
      id: 'crossyneonroad',
      title: 'Crossy Neon Road',
      description: 'Hilf dem Neon-Huhn, die Strassen und Fluesse zu ueberqueren. Sammle Leben & weiche Hindernissen aus!',
      path: '/games/crossyneonroad/index.html',
      genre: 'Arcade / Casual',
      icon: '🐔',
      preview: '/images/crossy_neon_road_preview.png',
      targetScore: 40,
      coinSymbol: 'CROSSY',
      hidden: true,
    },
    {
      id: 'neonstacking',
      title: 'Neon Stacking',
      description: 'Stapele die Neon-Bloecke so praezise wie moeglich! Schneide ueberstehende Kanten ab. Touch-optimiert.',
      path: '/games/neonstacking/index.html',
      genre: 'Arcade / Stacking',
      icon: '🧱',
      preview: '/images/neon_stacking_preview.png',
      targetScore: 15,
      coinSymbol: 'STACK',
      hidden: true,
    }
  ];

  const [games, setGames] = useState<Game[]>(gamesList);

  useEffect(() => {
    async function loadCatalog() {
      try {
        const res = await fetch(`${backendUrl}/api/games/catalog?_t=${Date.now()}`);
        if (res.ok) {
          const data = await res.json();
          if (data.games && data.games.length > 0) {
            const merged = data.games.map((fromServer: any) => {
              const fromLocal = gamesList.find((g) => g.id === fromServer.id);
              return {
                ...fromLocal,
                ...fromServer,
                preview: fromLocal?.preview || fromServer.preview,
                description: fromLocal?.description || fromServer.description,
              };
            });
            setGames(merged);
          }
        }
      } catch (e) {
        // Fallback to default gamesList
      }
    }
    loadCatalog();
  }, [backendUrl]);

  const visibleGames = games.filter(
    (game) => (game.status === 'active' || game.status === 'maintenance') && !game.hidden
  );

  const handleCloseGame = useCallback(() => {
    setIsPlaying(false);
    setGameSessionToken(null);
  }, []);

  const handleStartGame = useCallback(
    async (game: Game) => {
      setActiveGame(game);
      setSubmitting(true);
      try {
        const response = await fetch(`${backendUrl}/api/game/start`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${initData}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ gameId: game.id }),
        });

        const data = await response.json();
        
        if (!response.ok || !data.gameSessionToken) {
          setActiveGame(null);
          setSubmitting(false);
          setShowEnergyPopup(true);
          return;
        }

        setGameSessionToken(data.gameSessionToken);
        setIsPlaying(true);
        setSubmitting(false);
        onGameFinished(); // Deducts -1 energy in top header immediately
      } catch (err: any) {
        console.error('Failed to start game:', err);
        setActiveGame(null);
        setSubmitting(false);
        setShowEnergyPopup(true);
      }
    },
    [initData, backendUrl, onGameFinished]
  );

  const submittedTokens = useRef<Set<string>>(new Set());

  // Submits the score to the secure backend api (silently or with loading indicator)
  const handleSubmitScore = useCallback(
    async (score: number, validationPayload?: any, showSpinner: boolean = false) => {
      if (!activeGame || !gameSessionToken) return;
      if (submittedTokens.current.has(gameSessionToken)) {
        return;
      }
      submittedTokens.current.add(gameSessionToken);
      
      if (showSpinner) {
        setSubmitting(true);
      }
      
      try {
        await fetch(`${backendUrl}/api/game/score`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${initData}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            gameSessionToken,
            gameId: activeGame.id,
            score,
            validationPayload,
          }),
        });
      } catch (err: any) {
        console.error('Failed to submit score:', err);
      } finally {
        if (showSpinner) {
          setSubmitting(false);
        }
        onGameFinished(); // Refresh energy/leaderboards in main app
        fetchBenchmarks(); // Refresh dynamic benchmarks
      }
    },
    [activeGame, gameSessionToken, initData, backendUrl, onGameFinished, fetchBenchmarks]
  );

  // Rewarded Ad Timer Effect for In-Game Revival (15 seconds standard rewarded video duration)
  useEffect(() => {
    if (adReviveTimer === null) return;
    if (adReviveTimer > 0) {
      const timer = setTimeout(() => {
        setAdReviveTimer(adReviveTimer - 1);
      }, 1000);
      return () => clearTimeout(timer);
    } else if (adReviveTimer === 0) {
      // 15-second mandatory ad completed! Send verified revive permission to active game iframe
      iframeRef.current?.contentWindow?.postMessage({ type: 'AD_REVIVE_GRANTED' }, '*');
      const timer = setTimeout(() => {
        setAdReviveTimer(null);
      }, 600);
      return () => clearTimeout(timer);
    }
  }, [adReviveTimer]);

  // Message receiver for the Iframe postMessage API
  useEffect(() => {
    const handleIframeMessage = async (event: MessageEvent) => {
      if (event.data) {
        if (event.data.type === 'SUBMIT_SCORE') {
          const score = event.data.score;
          const payload = event.data.validationPayload;
          handleSubmitScore(score, payload, false);
        } else if (event.data.type === 'CLOSE_GAME') {
          handleCloseGame();
        } else if (event.data.type === 'REQUEST_AD_REVIVE') {
          // Trigger official Monetag Rewarded Video (15s) with fallback
          setAdReviveTimer(15);
          showMonetagRewardedAd('rewarded')
            .catch(() => showRewardedAd().catch(() => {}));
        } else if (event.data.type === 'SUBMIT_SCORE_AND_RETRY') {
          const score = event.data.score;
          const payload = event.data.validationPayload;

          // 1. Submit the completed round's score
          await handleSubmitScore(score, payload, false);

          // 2. Request new game session token with -1 energy deduction
          setSubmitting(true);
          try {
            const response = await fetch(`${backendUrl}/api/game/start`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${initData}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ gameId: activeGame!.id }),
            });

            const data = await response.json();
            if (response.ok && data.gameSessionToken) {
              setGameSessionToken(data.gameSessionToken);
              onGameFinished(); // Deducts -1 energy in top header immediately
              setIsPlaying(false);
              setTimeout(() => {
                setIsPlaying(true);
                setSubmitting(false);
              }, 60);
            } else {
              // Insufficient energy! Exit game and show Energy Modal with Ad & Shop options
              setIsPlaying(false);
              setActiveGame(null);
              setSubmitting(false);
              setShowEnergyPopup(true);
            }
          } catch (err) {
            setIsPlaying(false);
            setActiveGame(null);
            setSubmitting(false);
            setShowEnergyPopup(true);
          }
        }
      }
    };

    window.addEventListener('message', handleIframeMessage);
    return () => window.removeEventListener('message', handleIframeMessage);
  }, [handleSubmitScore, activeGame, gameSessionToken, backendUrl, initData, handleCloseGame, onGameFinished]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', paddingBottom: '24px' }}>

      {/* ── Game Catalog ─────────────────────────────────────────────────── */}
      {!isPlaying && (
        <>
          {/* Header Badge & Hero */}
          <div style={{
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: '20px', padding: '18px',
            position: 'relative', overflow: 'hidden',
          }}>
            <div style={{ position: 'relative', zIndex: 2 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                <span style={{
                  fontSize: '10px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em',
                  padding: '3px 8px', borderRadius: '6px',
                  background: 'rgba(0,242,254,0.15)', color: 'var(--accent-cyan)',
                  border: '1px solid rgba(0,242,254,0.3)',
                }}>
                  arcade lobby
                </span>
                <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)' }}>
                  {t.games.subtitle}
                </span>
              </div>
              <h2 style={{ fontSize: '20px', fontWeight: 900, color: '#fff', margin: 0 }}>
                {t.games.title}
              </h2>
            </div>
          </div>

          {/* Games Vertical List (Portrait Optimized) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {visibleGames.map((game) => (
              <div
                key={game.id}
                style={{
                  background: 'rgba(255,255,255,0.02)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: '22px', padding: '16px',
                  display: 'flex', flexDirection: 'column',
                  transition: 'all 0.2s', overflow: 'hidden',
                }}
              >
                {/* Game Preview Screenshot Banner */}
                {game.preview && (
                  <div style={{
                    width: '100%', height: '140px', borderRadius: '16px',
                    overflow: 'hidden', marginBottom: '14px',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    position: 'relative', background: '#05070f',
                  }}>
                    <img
                      src={game.preview}
                      alt={game.title}
                      style={{
                        width: '100%', height: '100%',
                        objectFit: 'cover', display: 'block',
                      }}
                    />
                    <div style={{
                      position: 'absolute', top: '10px', right: '10px',
                      fontSize: '11px', fontWeight: 900, color: 'var(--accent-orange)',
                      background: 'rgba(5, 7, 15, 0.85)', backdropFilter: 'blur(8px)',
                      border: '1px solid rgba(255, 140, 0, 0.3)',
                      padding: '4px 10px', borderRadius: '9999px',
                      display: 'flex', alignItems: 'center', gap: '3px',
                    }}>
                      <span>-1</span>
                      <Zap size={12} className="fill-orange-400 stroke-none" />
                    </div>
                  </div>
                )}

                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                    <div style={{
                      width: '38px', height: '38px', borderRadius: '12px',
                      background: 'rgba(0,242,254,0.1)', border: '1px solid rgba(0,242,254,0.2)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '18px', flexShrink: 0,
                    }}>
                      {game.icon}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                        <h3 style={{ fontSize: '17px', fontWeight: 900, color: '#fff', margin: 0 }}>
                          {t.games.items[game.id as keyof typeof t.games.items]?.title || game.title}
                        </h3>
                        {game.status === 'maintenance' && (
                          <span style={{ fontSize: '9px', fontWeight: 900, color: '#fbbf24', background: 'rgba(251,191,36,0.15)', border: '1px solid rgba(251,191,36,0.35)', borderRadius: '6px', padding: '2px 6px' }}>
                            ⚠️ Wartung
                          </span>
                        )}
                        {game.status === 'coming_soon' && (
                          <span style={{ fontSize: '9px', fontWeight: 900, color: '#a78bfa', background: 'rgba(167,139,250,0.15)', border: '1px solid rgba(167,139,250,0.35)', borderRadius: '6px', padding: '2px 6px' }}>
                            ⏳ In Kürze
                          </span>
                        )}
                      </div>
                      <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        {t.games.items[game.id as keyof typeof t.games.items]?.genre || game.genre}
                      </span>
                    </div>
                  </div>

                  <p style={{ margin: '0 0 12px', fontSize: '12px', color: 'rgba(255,255,255,0.5)', lineHeight: 1.5 }}>
                    {t.games.items[game.id as keyof typeof t.games.items]?.description || game.description}
                  </p>

                  {/* Maintenance Notice Banner if present */}
                  {game.status === 'maintenance' && game.maintenanceMessage && (
                    <div style={{
                      fontSize: '11px', fontWeight: 700, color: '#fbbf24',
                      background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.25)',
                      borderRadius: '10px', padding: '8px 12px', marginBottom: '12px', lineHeight: 1.4,
                    }}>
                      ⚠️ {game.maintenanceMessage}
                    </div>
                  )}

                  {/* Börsen Benchmark target badge */}
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    background: 'rgba(0,242,254,0.05)', border: '1px solid rgba(0,242,254,0.15)',
                    borderRadius: '12px', padding: '8px 12px', marginBottom: '14px',
                    fontSize: '11px', color: 'rgba(255,255,255,0.7)',
                  }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '5px', color: 'var(--accent-cyan)', fontWeight: 800 }}>
                      <Target size={13} /> {t.games.dynamicAvg}: <strong style={{ color: '#fff', marginLeft: '3px', fontFamily: 'monospace' }}>{(benchmarks[game.id]?.targetScore ?? game.targetScore).toLocaleString()} {t.leaderboard.score}</strong>
                    </span>
                    <span style={{ color: '#4ade80', fontWeight: 800, fontFamily: 'monospace', fontSize: '10px' }}>
                      +${game.coinSymbol} Kurs
                    </span>
                  </div>

                  {/* Play button or Status lock */}
                  {game.status === 'maintenance' ? (
                    <button
                      disabled
                      style={{
                        width: '100%', padding: '14px',
                        background: 'rgba(251, 191, 36, 0.1)',
                        border: '1px solid rgba(251, 191, 36, 0.3)',
                        borderRadius: '14px',
                        color: '#fbbf24', fontSize: '13px', fontWeight: 900,
                        textTransform: 'uppercase', letterSpacing: '0.08em',
                        cursor: 'not-allowed',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                      }}
                    >
                      <span>🔒 Wartungsmodus</span>
                    </button>
                  ) : game.status === 'coming_soon' ? (
                    <button
                      disabled
                      style={{
                        width: '100%', padding: '14px',
                        background: 'rgba(167, 139, 250, 0.1)',
                        border: '1px solid rgba(167, 139, 250, 0.3)',
                        borderRadius: '14px',
                        color: '#a78bfa', fontSize: '13px', fontWeight: 900,
                        textTransform: 'uppercase', letterSpacing: '0.08em',
                        cursor: 'not-allowed',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                      }}
                    >
                      <span>🔒 Bald verfügbar</span>
                    </button>
                  ) : (
                    <button
                      onClick={() => handleStartGame(game)}
                      style={{
                        width: '100%', padding: '14px',
                        background: 'linear-gradient(135deg, #00f2fe 0%, #4facfe 100%)',
                        border: 'none', borderRadius: '14px',
                        color: '#000', fontSize: '13px', fontWeight: 900,
                        textTransform: 'uppercase', letterSpacing: '0.08em',
                        cursor: 'pointer', boxShadow: '0 0 20px rgba(0,242,254,0.25)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                        transition: 'all 0.2s',
                      }}
                    >
                      <span>{t.games.playBtn}</span>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', marginLeft: '4px' }}>
                        <span>-1</span>
                        <Zap size={15} className="fill-black stroke-none" />
                      </span>
                    </button>
                  )}
                </div>
              </div>
            ))}

            {/* ── Coming Soon Game Placeholder Card ── */}
            <div
              style={{
                background: 'rgba(255, 255, 255, 0.02)',
                border: '1px dashed rgba(255, 255, 255, 0.15)',
                borderRadius: '24px',
                padding: '24px 20px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                textAlign: 'center',
                gap: '12px',
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: '52px',
                  height: '52px',
                  borderRadius: '16px',
                  background: 'rgba(255, 255, 255, 0.04)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '24px',
                }}
              >
                ⏳
              </div>

              <div>
                <span
                  style={{
                    fontSize: '10px',
                    fontWeight: 900,
                    color: '#fbbf24',
                    background: 'rgba(251, 191, 36, 0.12)',
                    border: '1px solid rgba(251, 191, 36, 0.3)',
                    borderRadius: '9999px',
                    padding: '3px 10px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    display: 'inline-block',
                    marginBottom: '8px',
                  }}
                >
                  In Entwicklung • Coming Soon
                </span>
                <h3 style={{ fontSize: '16px', fontWeight: 900, color: '#fff', margin: 0 }}>
                  Weitere Minigames in Arbeit
                </h3>
                <p style={{ margin: '6px 0 0', fontSize: '12px', color: 'rgba(255,255,255,0.4)', lineHeight: 1.5, maxWidth: '280px' }}>
                  Crossy Neon Road 🐔, Neon Stacking 🧱 und weitere Arcade-Hits folgen in Kürze mit eigenen Token & Highscores!
                </p>
              </div>

              <div
                style={{
                  width: '100%',
                  padding: '12px',
                  borderRadius: '14px',
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.06)',
                  color: 'rgba(255, 255, 255, 0.3)',
                  fontSize: '12px',
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                }}
              >
                🔒 Bald verfügbar
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── Active Game Full-Screen Viewport Portal ───────────────────────── */}
      {isPlaying && activeGame && createPortal(
        <div
          style={{
            position: 'fixed',
            top: 0, left: 0, right: 0, bottom: 0,
            zIndex: 99999,
            backgroundColor: '#000',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {/* Top Glass Bar Controls */}
          <button
            onClick={() => setShowEnergyPopup(true)}
            className="energy-pill-button"
            style={{
              position: 'absolute',
              top: '16px',
              left: '16px',
              zIndex: 100000,
            }}
          >
            <Zap size={11} className="energy-icon animate-pulse" />
            <span className="energy-value">{currentEnergy} / {maxEnergy}</span>
            <span className="energy-plus-indicator">+</span>
          </button>

          {/* Exit Button */}
          <button
            onClick={handleCloseGame}
            style={{
              position: 'absolute', top: '16px', right: '16px', zIndex: 100000,
              width: '42px', height: '42px', borderRadius: '50%',
              backgroundColor: 'rgba(0, 0, 0, 0.7)', backdropFilter: 'blur(8px)',
              border: '1px solid rgba(255, 255, 255, 0.15)', color: '#d1d5db',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', boxShadow: '0 4px 15px rgba(0,0,0,0.5)',
            }}
            title={t.common.close}
          >
            <X size={22} />
          </button>

          {/* Game Iframe */}
          <div style={{ width: '100%', height: '100%', backgroundColor: '#000', position: 'relative' }}>
            <iframe
              ref={iframeRef}
              src={`${activeGame.path}?token=${gameSessionToken || ''}&lang=${language}`}
              style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
              title={t.games.items[activeGame.id as keyof typeof t.games.items]?.title || activeGame.title}
              sandbox="allow-scripts allow-same-origin"
            />

            {/* Rewarded Ad Viewer Overlay for 1x Free Revival */}
            {adReviveTimer !== null && (
              <div style={{
                position: 'absolute', inset: 0, zIndex: 100002,
                backgroundColor: 'rgba(5, 7, 15, 0.94)', backdropFilter: 'blur(16px)',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                padding: '24px', textAlign: 'center',
              }}>
                <div style={{
                  maxWidth: '340px', width: '100%',
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(0, 242, 254, 0.3)',
                  borderRadius: '24px', padding: '24px',
                  boxShadow: '0 0 35px rgba(0, 242, 254, 0.2)',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px',
                }}>
                  <div style={{
                    width: '64px', height: '64px', borderRadius: '50%',
                    background: 'rgba(0, 242, 254, 0.12)', border: '2px solid #00f2fe',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '28px', boxShadow: '0 0 20px rgba(0, 242, 254, 0.4)',
                  }}>
                    📺
                  </div>

                  <div>
                    <h3 style={{ fontSize: '18px', fontWeight: 900, color: '#fff', margin: '0 0 6px 0' }}>
                      {t.games.reviveAdTitle}
                    </h3>
                    <p style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.6)', margin: 0, lineHeight: 1.4 }}>
                      {t.games.reviveAdSubtitle}
                    </p>
                  </div>

                  {/* Progress bar */}
                  <div style={{
                    width: '100%', height: '8px', borderRadius: '9999px',
                    backgroundColor: 'rgba(255, 255, 255, 0.1)', overflow: 'hidden',
                  }}>
                    <div style={{
                      height: '100%',
                      width: `${((15 - (adReviveTimer || 0)) / 15) * 100}%`,
                      background: 'linear-gradient(90deg, #00f2fe, #4ade80)',
                      transition: 'width 1s linear',
                      boxShadow: '0 0 10px rgba(74, 222, 128, 0.6)',
                    }} />
                  </div>

                  {/* Countdown Badge */}
                  <div style={{
                    fontSize: '13px', fontWeight: 900,
                    color: adReviveTimer === 0 ? '#4ade80' : '#00f2fe',
                    background: 'rgba(0, 242, 254, 0.08)', border: '1px solid rgba(0, 242, 254, 0.25)',
                    padding: '6px 14px', borderRadius: '9999px',
                  }}>
                    {adReviveTimer > 0
                      ? t.games.reviveSecRemaining.replace('{sec}', adReviveTimer.toString())
                      : t.games.reviveUnlocked}
                  </div>
                </div>
              </div>
            )}

            {/* Submitting loader */}
            {submitting && (
              <div className="portal-loader-overlay">
                <div className="flex flex-col items-center gap-4 text-center">
                  <div className="relative flex items-center justify-center">
                    <div className="animate-spin rounded-full h-14 w-14 border-4 border-solid border-cyan-400 border-t-transparent"></div>
                    <span className="absolute text-xl">🎮</span>
                  </div>
                  <div>
                    <h3 className="font-extrabold text-xs text-cyan-400 uppercase tracking-widest">{t.games.newGameStarting}</h3>
                    <p className="text-[10px] text-gray-400 max-w-[200px] leading-relaxed mt-1">
                      {t.games.pleaseWait}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>,
        document.body
      )}

      {/* Energy Refill Modal */}
      <EnergyModal
        isOpen={showEnergyPopup}
        onClose={() => {
          setShowEnergyPopup(false);
          if (isPlaying && currentEnergy < 1) {
            handleCloseGame();
          }
        }}
        currentEnergy={currentEnergy}
        maxEnergy={maxEnergy}
        dailyAdLimit={dailyAdLimit}
        nextRechargeInSeconds={nextRechargeInSeconds}
        dailyAdCount={dailyAdCount}
        initData={initData}
        backendUrl={backendUrl}
        referralLink={referralLink}
        onEnergyGranted={() => {
          onGameFinished();
          setShowEnergyPopup(false);
        }}
        onOpenShop={() => {
          setShowEnergyPopup(false);
          if (isPlaying) handleCloseGame();
          if (onOpenShop) onOpenShop();
        }}
      />
    </div>
  );
}
