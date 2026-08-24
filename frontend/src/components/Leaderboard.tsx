import { useState, useEffect } from 'react';
import { Trophy, Clock, Calendar, Compass, ShieldAlert, Medal, Star, Gamepad2, Sparkles, UserCheck, Lock } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';

export type LeaderboardPillar = 'games' | 'season';
export type LeaderboardTimeframe = 'daily' | 'weekly' | 'monthly' | 'all_time';

interface HubGame {
  id: string;
  title: string;
  genre: string;
  icon: string;
  scoreUnit: string;
  targetScore: number;
  coinSymbol: string;
  hidden?: boolean;
}

interface GameHighscoreEntry {
  userId: string;
  username: string | null;
  firstName: string | null;
  displayName: string | null;
  isVip: boolean;
  seasonPassType: 'NONE' | 'SEASON' | 'VIP';
  highscore: number;
  achievedAt: string | null;
  rank: number;
}

interface SeasonLeaderboardEntry {
  userId: string;
  username: string | null;
  firstName: string | null;
  displayName: string | null;
  isVip: boolean;
  seasonPassType: 'NONE' | 'SEASON' | 'VIP';
  score: number;
  netProfit: number;
  totalRounds: number;
  estimatedTop10Prize?: number;
  rank: number;
}

interface PersonalGameHighscore {
  rank: number | null;
  highscore: number;
  achievedAt: string | null;
  isRanked: boolean;
}

interface PersonalSeasonStat {
  rank: number | null;
  netProfit: number;
  totalRounds: number;
  estimatedTop10Prize?: number;
  isRanked: boolean;
}

interface LeaderboardProps {
  initData: string;
  backendUrl: string;
}

const DEFAULT_ACTIVE_GAMES: HubGame[] = [
  {
    id: 'doodlejump',
    title: 'Neon Jump',
    genre: 'Arcade / Jump',
    icon: '👾',
    scoreUnit: 'm',
    targetScore: 1500,
    coinSymbol: 'DOODLE',
  },
  {
    id: 'neonbird',
    title: 'Neon Bird',
    genre: 'Arcade / Flappy',
    icon: '🐦',
    scoreUnit: 'pts',
    targetScore: 25,
    coinSymbol: 'FLAPPY',
  },
];

const UPCOMING_GAMES = [
  {
    id: 'crossyneonroad',
    title: 'Crossy Neon Road',
    genre: 'Arcade / Casual',
    icon: '🐔',
    coinSymbol: 'CROSSY',
    desc: 'Überquere belebte Neon-Straßen & Flüsse. Weiche Fahrzeugen aus!',
  },
  {
    id: 'neonstacking',
    title: 'Neon Stacking',
    genre: 'Arcade / Stacking',
    icon: '🧱',
    coinSymbol: 'STACK',
    desc: 'Stapele Neon-Blöcke auf die perfekte Höhe mit Präzision!',
  },
];

function formatCashScore(value: number): string {
  const num = Number(value || 0);
  if (num === 0) return '0.00 $';
  if (Math.abs(num) < 0.01) {
    return `${num.toFixed(4)} $`;
  }
  return `${num.toFixed(2)} $`;
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    if (isToday) {
      return `Heute ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    }
    return d.toLocaleDateString([], { day: '2-digit', month: '2-digit' });
  } catch (e) {
    return '';
  }
}

const RANK_CONFIGS: Record<number, { gradient: string; border: string; badge: string; glow: string; emoji: string }> = {
  1: {
    gradient: 'linear-gradient(135deg, rgba(251,191,36,0.14) 0%, rgba(245,158,11,0.06) 100%)',
    border: 'rgba(251,191,36,0.35)',
    badge: 'linear-gradient(135deg, #f59e0b, #fbbf24)',
    glow: 'rgba(251,191,36,0.18)',
    emoji: '🥇',
  },
  2: {
    gradient: 'linear-gradient(135deg, rgba(203,213,225,0.12) 0%, rgba(148,163,184,0.05) 100%)',
    border: 'rgba(203,213,225,0.25)',
    badge: 'linear-gradient(135deg, #94a3b8, #cbd5e1)',
    glow: 'rgba(203,213,225,0.12)',
    emoji: '🥈',
  },
  3: {
    gradient: 'linear-gradient(135deg, rgba(180,83,9,0.12) 0%, rgba(217,119,6,0.05) 100%)',
    border: 'rgba(180,83,9,0.3)',
    badge: 'linear-gradient(135deg, #b45309, #d97706)',
    glow: 'rgba(180,83,9,0.14)',
    emoji: '🥉',
  },
};

export function Leaderboard({ initData, backendUrl }: LeaderboardProps) {
  const { t } = useLanguage();

  // Pillar: 'games' (Highscores) or 'season' (Season Economic Ranking)
  const [pillar, setPillar] = useState<LeaderboardPillar>('games');

  // Pillar 1: Games & Timeframes
  const [games, setGames] = useState<HubGame[]>(DEFAULT_ACTIVE_GAMES);
  const [selectedGameId, setSelectedGameId] = useState<string>('doodlejump');
  const [timeframe, setTimeframe] = useState<LeaderboardTimeframe>('daily');
  const [gameEntries, setGameEntries] = useState<GameHighscoreEntry[]>([]);
  const [personalGameHighscore, setPersonalGameHighscore] = useState<PersonalGameHighscore | null>(null);

  // Pillar 2: Season
  const [seasonEntries, setSeasonEntries] = useState<SeasonLeaderboardEntry[]>([]);
  const [personalSeasonStat, setPersonalSeasonStat] = useState<PersonalSeasonStat | null>(null);
  const [isSeasonActive, setIsSeasonActive] = useState<boolean>(false);
  const [seasonMsg, setSeasonMsg] = useState<string | null>(null);
  const [seasonInfo, setSeasonInfo] = useState<any>(null);

  // Shared state
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load available games list (filtered to active/non-hidden only)
  useEffect(() => {
    async function loadGames() {
      try {
        const res = await fetch(`${backendUrl}/api/leaderboard/games`, {
          headers: { Authorization: `Bearer ${initData}` },
        });
        if (res.ok) {
          const data = await res.json();
          if (data.games && data.games.length > 0) {
            const visible = data.games.filter((g: HubGame) => !g.hidden);
            setGames(visible);
            if (selectedGameId !== 'coming_soon' && !visible.some((g: HubGame) => g.id === selectedGameId)) {
              setSelectedGameId(visible[0].id);
            }
          }
        }
      } catch (e) {
        // Fallback to default games list
      }
    }
    loadGames();
  }, [backendUrl, initData, selectedGameId]);

  // Load Leaderboard data based on active Pillar and filters
  useEffect(() => {
    async function fetchLeaderboardData() {
      if (pillar === 'games' && selectedGameId === 'coming_soon') {
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        if (pillar === 'games') {
          const res = await fetch(
            `${backendUrl}/api/leaderboard/game/${selectedGameId}?timeframe=${timeframe}`,
            {
              headers: { Authorization: `Bearer ${initData}` },
            }
          );
          if (!res.ok) throw new Error(t.common.connectionError);
          const data = await res.json();
          setGameEntries(data.entries || []);
          setPersonalGameHighscore(data.userEntry || null);
        } else {
          // Season Pillar
          const res = await fetch(`${backendUrl}/api/leaderboard/season`, {
            headers: { Authorization: `Bearer ${initData}` },
          });
          if (!res.ok) throw new Error(t.common.connectionError);
          const data = await res.json();
          setSeasonEntries(data.entries || []);
          setIsSeasonActive(data.isSeasonActive ?? false);
          setSeasonMsg(data.message || null);
          setSeasonInfo(data.seasonInfo || null);
          setPersonalSeasonStat(data.userEntry || null);
        }
      } catch (err: any) {
        setError(err.message || t.common.error);
      } finally {
        setLoading(false);
      }
    }

    fetchLeaderboardData();
  }, [pillar, selectedGameId, timeframe, backendUrl, initData, t.common.connectionError, t.common.error]);

  const activeGameConfig = games.find((g) => g.id === selectedGameId) || games[0] || DEFAULT_ACTIVE_GAMES[0];

  const timeframes = [
    { id: 'daily', label: t.leaderboard.today, icon: Clock },
    { id: 'weekly', label: t.leaderboard.week, icon: Calendar },
    { id: 'monthly', label: t.leaderboard.month, icon: Compass },
    { id: 'all_time', label: t.leaderboard.allTime, icon: Star },
  ] as const;

  const top3Game = gameEntries.slice(0, 3);
  const restGame = gameEntries.slice(3);

  const top3Season = seasonEntries.slice(0, 3);
  const restSeason = seasonEntries.slice(3);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', paddingBottom: '24px' }}>

      {/* ── Two-Pillar Header Switcher ─────────────────────────────────────── */}
      <div style={{
        background: 'rgba(0,0,0,0.4)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: '20px',
        padding: '6px',
        display: 'flex',
        gap: '6px',
      }}>
        {/* Pillar 1: Minigames Highscores */}
        <button
          onClick={() => setPillar('games')}
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            padding: '12px 8px',
            borderRadius: '16px',
            border: pillar === 'games' ? '1px solid rgba(0, 242, 254, 0.4)' : '1px solid transparent',
            background: pillar === 'games'
              ? 'linear-gradient(135deg, rgba(0, 242, 254, 0.15) 0%, rgba(79, 172, 254, 0.08) 100%)'
              : 'transparent',
            color: pillar === 'games' ? '#00f2fe' : 'rgba(255,255,255,0.45)',
            fontSize: '13px',
            fontWeight: 900,
            cursor: 'pointer',
            transition: 'all 0.2s',
            boxShadow: pillar === 'games' ? '0 0 16px rgba(0,242,254,0.15)' : 'none',
          }}
        >
          <Gamepad2 size={16} />
          <span>{t.leaderboard.pillarGames}</span>
        </button>

        {/* Pillar 2: Season Economic Ranking */}
        <button
          onClick={() => setPillar('season')}
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            padding: '12px 8px',
            borderRadius: '16px',
            border: pillar === 'season' ? '1px solid rgba(251, 191, 36, 0.4)' : '1px solid transparent',
            background: pillar === 'season'
              ? 'linear-gradient(135deg, rgba(251, 191, 36, 0.15) 0%, rgba(245, 158, 11, 0.08) 100%)'
              : 'transparent',
            color: pillar === 'season' ? '#fbbf24' : 'rgba(255,255,255,0.45)',
            fontSize: '13px',
            fontWeight: 900,
            cursor: 'pointer',
            transition: 'all 0.2s',
            boxShadow: pillar === 'season' ? '0 0 16px rgba(251,191,36,0.15)' : 'none',
          }}
        >
          <Trophy size={16} />
          <span>{t.leaderboard.pillarSeason}</span>
        </button>
      </div>

      {/* ── Sub-Controls for Games Pillar ──────────────────────────────────── */}
      {pillar === 'games' && (
        <>
          {/* Horizontal Game Selector Carousel with 3rd Coming Soon Pill */}
          <div style={{
            display: 'flex',
            gap: '8px',
            overflowX: 'auto',
            paddingBottom: '4px',
            scrollbarWidth: 'none',
          }}>
            {/* Active Games */}
            {games.map((game) => {
              const isSelected = selectedGameId === game.id;
              return (
                <button
                  key={game.id}
                  onClick={() => setSelectedGameId(game.id)}
                  style={{
                    flexShrink: 0,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 14px',
                    borderRadius: '14px',
                    border: isSelected ? '1px solid rgba(0,242,254,0.4)' : '1px solid rgba(255,255,255,0.06)',
                    background: isSelected ? 'rgba(0,242,254,0.12)' : 'rgba(255,255,255,0.02)',
                    color: isSelected ? '#fff' : 'rgba(255,255,255,0.5)',
                    fontSize: '12px',
                    fontWeight: isSelected ? 800 : 600,
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    boxShadow: isSelected ? '0 0 14px rgba(0,242,254,0.12)' : 'none',
                  }}
                >
                  <span style={{ fontSize: '15px' }}>{game.icon}</span>
                  <span>{game.title}</span>
                </button>
              );
            })}

            {/* 3rd Category: Coming Soon */}
            <button
              onClick={() => setSelectedGameId('coming_soon')}
              style={{
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 14px',
                borderRadius: '14px',
                border: selectedGameId === 'coming_soon' ? '1px solid rgba(251, 191, 36, 0.45)' : '1px dashed rgba(255,255,255,0.12)',
                background: selectedGameId === 'coming_soon' ? 'rgba(251, 191, 36, 0.12)' : 'rgba(255,255,255,0.02)',
                color: selectedGameId === 'coming_soon' ? '#fbbf24' : 'rgba(255,255,255,0.45)',
                fontSize: '12px',
                fontWeight: selectedGameId === 'coming_soon' ? 900 : 600,
                cursor: 'pointer',
                transition: 'all 0.2s',
                boxShadow: selectedGameId === 'coming_soon' ? '0 0 14px rgba(251,191,36,0.15)' : 'none',
              }}
            >
              <span style={{ fontSize: '14px' }}>⏳</span>
              <span>Coming Soon</span>
            </button>
          </div>

          {/* Timeframe Tabs (Only when an active game is selected) */}
          {selectedGameId !== 'coming_soon' && (
            <>
              <div style={{
                display: 'flex',
                gap: '5px',
                background: 'rgba(0,0,0,0.3)',
                border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: '14px',
                padding: '4px',
              }}>
                {timeframes.map((tf) => {
                  const Icon = tf.icon;
                  const isActive = timeframe === tf.id;
                  return (
                    <button
                      key={tf.id}
                      onClick={() => setTimeframe(tf.id)}
                      style={{
                        flex: 1,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '5px',
                        padding: '8px 4px',
                        borderRadius: '10px',
                        border: isActive ? '1px solid rgba(0,242,254,0.3)' : '1px solid transparent',
                        background: isActive ? 'rgba(0,242,254,0.1)' : 'transparent',
                        color: isActive ? 'var(--accent-cyan)' : 'rgba(255,255,255,0.35)',
                        fontSize: '11px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                      }}
                    >
                      <Icon size={11} />
                      <span>{tf.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Personal User Highscore Spotlight Card */}
              {personalGameHighscore && (
                <div style={{
                  background: 'linear-gradient(135deg, rgba(0,242,254,0.08) 0%, rgba(16,20,36,0.6) 100%)',
                  border: '1px solid rgba(0,242,254,0.25)',
                  borderRadius: '18px',
                  padding: '14px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{
                      width: '38px', height: '38px', borderRadius: '12px',
                      background: 'rgba(0,242,254,0.15)', border: '1px solid rgba(0,242,254,0.3)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '15px', fontWeight: 900, color: '#00f2fe',
                    }}>
                      {personalGameHighscore.isRanked ? `#${personalGameHighscore.rank}` : '—'}
                    </div>
                    <div>
                      <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 800, display: 'block' }}>
                        {t.leaderboard.yourRank} • {activeGameConfig.title}
                      </span>
                      <span style={{ fontSize: '13px', fontWeight: 800, color: '#fff', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <UserCheck size={14} style={{ color: '#00f2fe' }} />
                        {personalGameHighscore.isRanked
                          ? `Platz ${personalGameHighscore.rank}`
                          : t.leaderboard.notRankedYet}
                      </span>
                    </div>
                  </div>

                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '16px', fontWeight: 900, color: '#00f2fe', fontFamily: 'monospace' }}>
                      {personalGameHighscore.isRanked ? personalGameHighscore.highscore.toLocaleString() : '0'} {activeGameConfig.scoreUnit}
                    </div>
                    <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.4)', fontWeight: 600, marginTop: '2px' }}>
                      {personalGameHighscore.achievedAt ? formatDate(personalGameHighscore.achievedAt) : t.leaderboard.highscore}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* ── Sub-Controls for Season Pillar ─────────────────────────────────── */}
      {pillar === 'season' && (
        <div style={{
          background: 'linear-gradient(135deg, rgba(251,191,36,0.1) 0%, rgba(16,20,36,0.7) 100%)',
          border: '1px solid rgba(251,191,36,0.25)',
          borderRadius: '20px',
          padding: '16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Sparkles size={16} style={{ color: '#fbbf24' }} />
              <span style={{ fontSize: '14px', fontWeight: 900, color: '#fff' }}>
                {seasonInfo?.name || 'Season Airdrop Pool'}
              </span>
            </div>
            <span style={{
              fontSize: '10px', fontWeight: 900,
              color: isSeasonActive ? '#34d399' : '#fbbf24',
              background: isSeasonActive ? 'rgba(52, 211, 153, 0.15)' : 'rgba(251, 191, 36, 0.15)',
              border: `1px solid ${isSeasonActive ? 'rgba(52, 211, 153, 0.3)' : 'rgba(251, 191, 36, 0.3)'}`,
              borderRadius: '9999px', padding: '3px 8px',
            }}>
              {isSeasonActive ? '● AKTIV' : 'VORBEREITUNG'}
            </span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 800 }}>
                Aktueller Preispool
              </span>
              <div style={{ fontSize: '18px', fontWeight: 900, color: '#fbbf24', fontFamily: 'monospace' }}>
                {(seasonInfo?.currentPot || 0).toFixed(2)} €
              </div>
            </div>

            {personalSeasonStat && (
              <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 800 }}>
                  Dein Season-Rang
                </span>
                <div style={{ fontSize: '14px', fontWeight: 900, color: '#fff' }}>
                  {personalSeasonStat.isRanked ? `Platz #${personalSeasonStat.rank}` : '—'}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Content Area ────────────────────────────────────────────────────── */}
      {pillar === 'games' && selectedGameId === 'coming_soon' ? (
        /* ── Coming Soon Showcase View in Leaderboard ── */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{
            background: 'linear-gradient(135deg, rgba(251,191,36,0.08) 0%, rgba(16,20,36,0.7) 100%)',
            border: '1px dashed rgba(251,191,36,0.3)',
            borderRadius: '22px',
            padding: '24px 20px',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '12px',
          }}>
            <div style={{
              width: '56px', height: '56px', borderRadius: '18px',
              background: 'rgba(251,191,36,0.15)', border: '1px solid rgba(251,191,36,0.35)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '26px',
            }}>
              ⏳
            </div>
            <div>
              <span style={{
                fontSize: '10px', fontWeight: 900, color: '#fbbf24',
                background: 'rgba(251,191,36,0.12)', border: '1px solid rgba(251,191,36,0.3)',
                borderRadius: '9999px', padding: '3px 10px', textTransform: 'uppercase', letterSpacing: '0.08em',
                display: 'inline-block', marginBottom: '8px',
              }}>
                In Entwicklung
              </span>
              <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 900, color: '#fff' }}>
                Kommende Minigames & Ranglisten
              </h3>
              <p style={{ margin: '6px 0 0', fontSize: '12px', color: 'rgba(255,255,255,0.5)', lineHeight: 1.5, maxWidth: '300px' }}>
                Diese Minigames befinden sich aktuell in der Fertigstellung. Ihre Ranglisten werden automatisch bei Release freigeschaltet!
              </p>
            </div>
          </div>

          {/* Upcoming Game Teaser Cards */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {UPCOMING_GAMES.map((ug) => (
              <div
                key={ug.id}
                style={{
                  background: 'rgba(255,255,255,0.02)',
                  border: '1px solid rgba(255,255,255,0.06)',
                  borderRadius: '18px',
                  padding: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '14px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{
                    width: '42px', height: '42px', borderRadius: '14px',
                    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '22px', flexShrink: 0,
                  }}>
                    {ug.icon}
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 800, color: '#fff' }}>
                        {ug.title}
                      </h4>
                      <span style={{
                        fontSize: '9px', fontWeight: 800, color: '#fbbf24',
                        background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.25)',
                        borderRadius: '6px', padding: '1px 5px',
                      }}>
                        +${ug.coinSymbol}
                      </span>
                    </div>
                    <p style={{ margin: '3px 0 0', fontSize: '11px', color: 'rgba(255,255,255,0.4)', lineHeight: 1.4 }}>
                      {ug.desc}
                    </p>
                  </div>
                </div>

                <div style={{
                  flexShrink: 0,
                  display: 'flex', alignItems: 'center', gap: '4px',
                  fontSize: '10px', fontWeight: 800, color: 'rgba(255,255,255,0.35)',
                  background: 'rgba(255,255,255,0.04)', padding: '6px 10px', borderRadius: '10px',
                }}>
                  <Lock size={12} />
                  <span>In Kürze</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 0', gap: '12px' }}>
          <div style={{
            width: '36px', height: '36px', borderRadius: '50%',
            border: '3px solid rgba(0,242,254,0.15)',
            borderTopColor: 'var(--accent-cyan)',
            animation: 'spin 0.8s linear infinite',
          }} />
          <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.35)' }}>{t.leaderboard.loadingLeaderboard}</span>
        </div>
      ) : error ? (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px',
          padding: '48px 20px', textAlign: 'center',
          background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.15)',
          borderRadius: '18px',
        }}>
          <ShieldAlert size={36} style={{ color: '#f87171' }} />
          <span style={{ fontSize: '13px', color: '#f87171', fontWeight: 700 }}>{error}</span>
        </div>
      ) : pillar === 'season' && !isSeasonActive ? (
        /* Season Pre-Start Notice */
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px',
          padding: '36px 20px', textAlign: 'center',
          background: 'linear-gradient(135deg, rgba(167,139,250,0.08) 0%, rgba(0,242,254,0.04) 100%)',
          border: '1px solid rgba(167,139,250,0.2)',
          borderRadius: '22px',
        }}>
          <div style={{
            width: '56px', height: '56px', borderRadius: '50%',
            background: 'linear-gradient(135deg, rgba(167,139,250,0.2), rgba(0,242,254,0.15))',
            border: '2px solid rgba(167,139,250,0.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '26px',
          }}>🚀</div>
          <div>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 900, color: '#fff' }}>
              {t.season.preSeasonNoticeTitle}
            </h3>
            <p style={{ margin: '6px 0 0', fontSize: '12px', color: 'rgba(255,255,255,0.5)', lineHeight: 1.5 }}>
              {seasonMsg || t.season.preSeasonNoticeDesc}
            </p>
          </div>
          <div style={{
            fontSize: '11px', fontWeight: 700, color: '#00f2fe',
            background: 'rgba(0,242,254,0.08)', border: '1px solid rgba(0,242,254,0.2)',
            borderRadius: '12px', padding: '8px 14px', marginTop: '4px',
          }}>
            {t.season.preSeasonTip}
          </div>
        </div>
      ) : pillar === 'games' && gameEntries.length === 0 ? (
        /* Empty Game Highscores */
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px',
          padding: '60px 20px', textAlign: 'center',
        }}>
          <Medal size={40} style={{ color: 'rgba(255,255,255,0.1)' }} />
          <span style={{ fontSize: '14px', fontWeight: 700, color: 'rgba(255,255,255,0.4)' }}>
            {t.leaderboard.noEntries}
          </span>
          <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.25)' }}>
            {t.leaderboard.beFirst}
          </span>
        </div>
      ) : pillar === 'season' && seasonEntries.length === 0 ? (
        /* Empty Season Entries */
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px',
          padding: '60px 20px', textAlign: 'center',
        }}>
          <Trophy size={40} style={{ color: 'rgba(255,255,255,0.1)' }} />
          <span style={{ fontSize: '14px', fontWeight: 700, color: 'rgba(255,255,255,0.4)' }}>
            {t.leaderboard.noEntries}
          </span>
          <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.25)' }}>
            {t.leaderboard.beFirst}
          </span>
        </div>
      ) : (
        /* Render Leaderboard Rankings */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {pillar === 'games' ? (
            <>
              {/* Top 3 Podium for Game Highscores */}
              {top3Game.map((entry) => {
                const cfg = RANK_CONFIGS[entry.rank];
                return (
                  <div
                    key={entry.userId}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '14px 16px',
                      background: cfg.gradient,
                      border: `1px solid ${cfg.border}`,
                      borderRadius: '18px',
                      boxShadow: `0 4px 20px ${cfg.glow}`,
                      position: 'relative',
                      overflow: 'hidden',
                    }}
                  >
                    <span style={{ fontSize: '22px', flexShrink: 0 }}>{cfg.emoji}</span>

                    <div style={{
                      width: '28px', height: '28px', borderRadius: '50%', flexShrink: 0,
                      background: cfg.badge,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '12px', fontWeight: 900, color: '#000',
                      boxShadow: `0 2px 8px ${cfg.glow}`,
                    }}>
                      {entry.rank}
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '13px', fontWeight: 800, color: '#fff', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                        {entry.displayName || entry.firstName || t.common.anonymous}
                        {entry.isVip && (
                          <span style={{
                            fontSize: '9px', fontWeight: 900, color: '#fbbf24',
                            background: 'linear-gradient(135deg, rgba(245,158,11,0.25) 0%, rgba(251,191,36,0.12) 100%)',
                            border: '1px solid rgba(251,191,36,0.45)',
                            borderRadius: '6px', padding: '1px 6px',
                            display: 'inline-flex', alignItems: 'center', gap: '3px',
                          }}>
                            👑 VIP
                          </span>
                        )}
                        {entry.username && (
                          <span style={{
                            fontSize: '10px', fontWeight: 700, color: 'var(--accent-cyan)',
                            background: 'rgba(0,242,254,0.08)',
                            border: '1px solid rgba(0,242,254,0.2)',
                            borderRadius: '6px', padding: '1px 6px',
                          }}>
                            @{entry.username}
                          </span>
                        )}
                      </div>
                      {entry.achievedAt && (
                        <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)', marginTop: '2px', fontWeight: 600 }}>
                          🕒 {formatDate(entry.achievedAt)}
                        </div>
                      )}
                    </div>

                    <div style={{ flexShrink: 0, textAlign: 'right' }}>
                      <div style={{ fontSize: '16px', fontWeight: 900, color: 'var(--accent-cyan)', lineHeight: 1, fontFamily: 'monospace' }}>
                        {entry.highscore.toLocaleString()} {activeGameConfig.scoreUnit}
                      </div>
                      <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.35)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: '3px' }}>
                        {t.leaderboard.highscore}
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Divider */}
              {restGame.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '4px 0' }}>
                  <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.06)' }} />
                  <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.2)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                    {t.leaderboard.others}
                  </span>
                  <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.06)' }} />
                </div>
              )}

              {/* Ranks 4-100 */}
              {restGame.map((entry) => (
                <div
                  key={entry.userId}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '12px 16px',
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px solid rgba(255,255,255,0.05)',
                    borderRadius: '14px',
                  }}
                >
                  <div style={{
                    width: '28px', height: '28px', borderRadius: '50%', flexShrink: 0,
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '11px', fontWeight: 800, color: 'rgba(255,255,255,0.4)',
                  }}>
                    {entry.rank}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: '#e2e8f0', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                      {entry.displayName || entry.firstName || t.common.anonymous}
                      {entry.isVip && (
                        <span style={{
                          fontSize: '9px', fontWeight: 900, color: '#fbbf24',
                          background: 'linear-gradient(135deg, rgba(245,158,11,0.25) 0%, rgba(251,191,36,0.12) 100%)',
                          border: '1px solid rgba(251,191,36,0.45)',
                          borderRadius: '6px', padding: '1px 6px',
                        }}>
                          👑 VIP
                        </span>
                      )}
                      {entry.username && (
                        <span style={{
                          fontSize: '9px', color: 'rgba(0,242,254,0.6)',
                          background: 'rgba(0,242,254,0.06)',
                          border: '1px solid rgba(0,242,254,0.12)',
                          borderRadius: '5px', padding: '1px 5px', fontWeight: 700,
                        }}>
                          @{entry.username}
                        </span>
                      )}
                    </div>
                    {entry.achievedAt && (
                      <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.3)', marginTop: '2px', fontWeight: 600 }}>
                        {formatDate(entry.achievedAt)}
                      </div>
                    )}
                  </div>

                  <div style={{ flexShrink: 0, textAlign: 'right' }}>
                    <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--accent-cyan)', fontFamily: 'monospace' }}>
                      {entry.highscore.toLocaleString()} {activeGameConfig.scoreUnit}
                    </div>
                    <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, marginTop: '2px' }}>
                      {t.leaderboard.highscore}
                    </div>
                  </div>
                </div>
              ))}
            </>
          ) : (
            <>
              {/* Top 3 Podium for Season Profit */}
              {top3Season.map((entry) => {
                const cfg = RANK_CONFIGS[entry.rank];
                return (
                  <div
                    key={entry.userId}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '14px 16px',
                      background: cfg.gradient,
                      border: `1px solid ${cfg.border}`,
                      borderRadius: '18px',
                      boxShadow: `0 4px 20px ${cfg.glow}`,
                      position: 'relative',
                      overflow: 'hidden',
                    }}
                  >
                    <span style={{ fontSize: '22px', flexShrink: 0 }}>{cfg.emoji}</span>

                    <div style={{
                      width: '28px', height: '28px', borderRadius: '50%', flexShrink: 0,
                      background: cfg.badge,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '12px', fontWeight: 900, color: '#000',
                      boxShadow: `0 2px 8px ${cfg.glow}`,
                    }}>
                      {entry.rank}
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '13px', fontWeight: 800, color: '#fff', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                        {entry.displayName || entry.firstName || t.common.anonymous}
                        {entry.isVip && (
                          <span style={{
                            fontSize: '9px', fontWeight: 900, color: '#fbbf24',
                            background: 'linear-gradient(135deg, rgba(245,158,11,0.25) 0%, rgba(251,191,36,0.12) 100%)',
                            border: '1px solid rgba(251,191,36,0.45)',
                            borderRadius: '6px', padding: '1px 6px',
                            display: 'inline-flex', alignItems: 'center', gap: '3px',
                          }}>
                            👑 VIP
                          </span>
                        )}
                        {entry.username && (
                          <span style={{
                            fontSize: '10px', fontWeight: 700, color: 'var(--accent-cyan)',
                            background: 'rgba(0,242,254,0.08)',
                            border: '1px solid rgba(0,242,254,0.2)',
                            borderRadius: '6px', padding: '1px 6px',
                          }}>
                            @{entry.username}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)', marginTop: '2px', fontWeight: 600 }}>
                        🎮 {entry.totalRounds} {t.leaderboard.roundsCount}
                        {entry.estimatedTop10Prize && entry.estimatedTop10Prize > 0 ? ` • ~${entry.estimatedTop10Prize.toFixed(2)} € Airdrop` : ''}
                      </div>
                    </div>

                    <div style={{ flexShrink: 0, textAlign: 'right' }}>
                      <div style={{ fontSize: '16px', fontWeight: 900, color: '#fbbf24', lineHeight: 1, fontFamily: 'monospace' }}>
                        {formatCashScore(entry.netProfit)}
                      </div>
                      <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.35)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: '3px' }}>
                        {t.leaderboard.netProfit}
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Divider */}
              {restSeason.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '4px 0' }}>
                  <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.06)' }} />
                  <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.2)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                    {t.leaderboard.others}
                  </span>
                  <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.06)' }} />
                </div>
              )}

              {/* Ranks 4-100 */}
              {restSeason.map((entry) => (
                <div
                  key={entry.userId}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '12px 16px',
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px solid rgba(255,255,255,0.05)',
                    borderRadius: '14px',
                  }}
                >
                  <div style={{
                    width: '28px', height: '28px', borderRadius: '50%', flexShrink: 0,
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '11px', fontWeight: 800, color: 'rgba(255,255,255,0.4)',
                  }}>
                    {entry.rank}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: '#e2e8f0', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                      {entry.displayName || entry.firstName || t.common.anonymous}
                      {entry.isVip && (
                        <span style={{
                          fontSize: '9px', fontWeight: 900, color: '#fbbf24',
                          background: 'linear-gradient(135deg, rgba(245,158,11,0.25) 0%, rgba(251,191,36,0.12) 100%)',
                          border: '1px solid rgba(251,191,36,0.45)',
                          borderRadius: '6px', padding: '1px 6px',
                        }}>
                          👑 VIP
                        </span>
                      )}
                      {entry.username && (
                        <span style={{
                          fontSize: '9px', color: 'rgba(0,242,254,0.6)',
                          background: 'rgba(0,242,254,0.06)',
                          border: '1px solid rgba(0,242,254,0.12)',
                          borderRadius: '5px', padding: '1px 5px', fontWeight: 700,
                        }}>
                          @{entry.username}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.3)', marginTop: '2px', fontWeight: 600 }}>
                      🎮 {entry.totalRounds} {t.leaderboard.roundsCount}
                    </div>
                  </div>

                  <div style={{ flexShrink: 0, textAlign: 'right' }}>
                    <div style={{ fontSize: '13px', fontWeight: 800, color: '#fbbf24', fontFamily: 'monospace' }}>
                      {formatCashScore(entry.netProfit)}
                    </div>
                    <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, marginTop: '2px' }}>
                      {t.leaderboard.netProfit}
                    </div>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
