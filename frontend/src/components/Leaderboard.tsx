import { useState, useEffect } from 'react';
import { Trophy, Clock, Calendar, Compass, ShieldAlert, Medal } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';

interface LeaderboardEntry {
  userId: string;
  username: string | null;
  firstName: string | null;
  displayName?: string | null;
  isVip?: boolean;
  seasonPassType?: 'NONE' | 'SEASON' | 'VIP';
  score: number;
  netProfit?: number;
  totalRounds?: number;
  rank: number;
  expectedSeasonPoints?: number;
  permanentSeasonScore?: number;
}

interface LeaderboardProps {
  initData: string;
  backendUrl: string;
}

function formatCashScore(value: number): string {
  const num = Number(value || 0);
  if (num === 0) return '0.00 $';
  if (Math.abs(num) < 0.01) {
    return `${num.toFixed(4)} $`;
  }
  return `${num.toFixed(2)} $`;
}

const RANK_CONFIGS: Record<number, { gradient: string; border: string; badge: string; glow: string; emoji: string }> = {
  1: {
    gradient: 'linear-gradient(135deg, rgba(251,191,36,0.12) 0%, rgba(245,158,11,0.06) 100%)',
    border: 'rgba(251,191,36,0.25)',
    badge: 'linear-gradient(135deg, #f59e0b, #fbbf24)',
    glow: 'rgba(251,191,36,0.15)',
    emoji: '🥇',
  },
  2: {
    gradient: 'linear-gradient(135deg, rgba(203,213,225,0.10) 0%, rgba(148,163,184,0.05) 100%)',
    border: 'rgba(203,213,225,0.2)',
    badge: 'linear-gradient(135deg, #94a3b8, #cbd5e1)',
    glow: 'rgba(203,213,225,0.1)',
    emoji: '🥈',
  },
  3: {
    gradient: 'linear-gradient(135deg, rgba(180,83,9,0.10) 0%, rgba(217,119,6,0.05) 100%)',
    border: 'rgba(180,83,9,0.25)',
    badge: 'linear-gradient(135deg, #b45309, #d97706)',
    glow: 'rgba(180,83,9,0.12)',
    emoji: '🥉',
  },
};

export function Leaderboard({ initData, backendUrl }: LeaderboardProps) {
  const { t } = useLanguage();
  const [period, setPeriod] = useState<'day' | 'week' | 'month' | 'season'>('day');
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [isSeasonActive, setIsSeasonActive] = useState<boolean>(true);
  const [seasonMsg, setSeasonMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchLeaderboard() {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`${backendUrl}/api/leaderboard?period=${period}`, {
          headers: { 'Authorization': `Bearer ${initData}` },
        });
        if (!response.ok) throw new Error(t.common.connectionError);
        const data = await response.json();
        setEntries(data.entries || []);
        if (period === 'season') {
          setIsSeasonActive(data.isSeasonActive ?? false);
          setSeasonMsg(data.message || null);
        } else {
          setIsSeasonActive(true);
          setSeasonMsg(null);
        }
      } catch (err: any) {
        setError(err.message || t.common.error);
      } finally {
        setLoading(false);
      }
    }
    fetchLeaderboard();
  }, [period, initData, backendUrl, t.common.connectionError, t.common.error]);

  const periods = [
    { id: 'day', label: t.leaderboard.today, icon: Clock },
    { id: 'week', label: t.leaderboard.week, icon: Calendar },
    { id: 'month', label: t.leaderboard.month, icon: Compass },
    { id: 'season', label: t.leaderboard.season, icon: Trophy },
  ] as const;

  const top3 = entries.slice(0, 3);
  const rest = entries.slice(3);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', paddingBottom: '24px' }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(251,191,36,0.08) 0%, rgba(245,158,11,0.04) 100%)',
        border: '1px solid rgba(251,191,36,0.15)',
        borderRadius: '22px',
        padding: '20px',
        display: 'flex',
        alignItems: 'center',
        gap: '14px',
        position: 'relative',
        overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute', top: '-30px', right: '-30px',
          width: '120px', height: '120px', borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(251,191,36,0.12) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />
        <div style={{
          width: '50px', height: '50px', borderRadius: '50%', flexShrink: 0,
          background: 'linear-gradient(135deg, rgba(251,191,36,0.25), rgba(245,158,11,0.15))',
          border: '2px solid rgba(251,191,36,0.3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 0 20px rgba(251,191,36,0.15)',
          fontSize: '22px',
        }}>🏆</div>
        <div>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 900, color: '#fff' }}>{t.leaderboard.title}</h2>
          <p style={{ margin: 0, fontSize: '12px', color: 'rgba(255,255,255,0.4)', marginTop: '3px' }}>
            {t.leaderboard.subtitle}
          </p>
        </div>
      </div>

      {/* ── Period Tabs ────────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', gap: '6px',
        background: 'rgba(0,0,0,0.3)',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: '16px', padding: '5px',
      }}>
        {periods.map((p) => {
          const Icon = p.icon;
          const isActive = period === p.id;
          return (
            <button
              key={p.id}
              onClick={() => setPeriod(p.id)}
              style={{
                flex: 1,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px',
                padding: '9px 4px',
                borderRadius: '12px',
                border: isActive ? '1px solid rgba(0,242,254,0.25)' : '1px solid transparent',
                background: isActive ? 'rgba(0,242,254,0.1)' : 'transparent',
                color: isActive ? 'var(--accent-cyan)' : 'rgba(255,255,255,0.35)',
                fontSize: '11px', fontWeight: 700,
                cursor: 'pointer',
                transition: 'all 0.2s',
                boxShadow: isActive ? '0 0 12px rgba(0,242,254,0.08)' : 'none',
              }}
            >
              <Icon size={11} />
              <span>{p.label}</span>
            </button>
          );
        })}
      </div>

      {/* ── Content ────────────────────────────────────────────────────────── */}
      {loading ? (
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
      ) : period === 'season' && !isSeasonActive ? (
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
      ) : entries.length === 0 ? (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px',
          padding: '60px 20px', textAlign: 'center',
        }}>
          <Medal size={40} style={{ color: 'rgba(255,255,255,0.1)' }} />
          <span style={{ fontSize: '14px', fontWeight: 700, color: 'rgba(255,255,255,0.3)' }}>{t.leaderboard.noEntries}</span>
          <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.2)' }}>{t.leaderboard.beFirst}</span>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>

          {/* ── Top 3 podium ─────────────────────────────────────────────── */}
          {top3.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '6px' }}>
              {top3.map((entry) => {
                const cfg = RANK_CONFIGS[entry.rank];
                return (
                  <div key={entry.userId} style={{
                    display: 'flex', alignItems: 'center', gap: '12px',
                    padding: '14px 16px',
                    background: cfg.gradient,
                    border: `1px solid ${cfg.border}`,
                    borderRadius: '18px',
                    boxShadow: `0 4px 20px ${cfg.glow}`,
                    position: 'relative', overflow: 'hidden',
                  }}>
                    {/* Rank emoji */}
                    <span style={{ fontSize: '22px', flexShrink: 0 }}>{cfg.emoji}</span>

                    {/* Badge number */}
                    <div style={{
                      width: '28px', height: '28px', borderRadius: '50%', flexShrink: 0,
                      background: cfg.badge,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '12px', fontWeight: 900, color: '#000',
                      boxShadow: `0 2px 8px ${cfg.glow}`,
                    }}>
                      {entry.rank}
                    </div>

                    {/* Name info */}
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
                            boxShadow: '0 0 10px rgba(251,191,36,0.3)',
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
                      {period === 'season' && entry.totalRounds !== undefined && (
                        <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)', marginTop: '2px', fontWeight: 600 }}>
                          🎮 {entry.totalRounds} {t.leaderboard.roundsCount}
                        </div>
                      )}
                    </div>

                    {/* Score / Net Profit */}
                    <div style={{ flexShrink: 0, textAlign: 'right' }}>
                      <div style={{ fontSize: '16px', fontWeight: 900, color: 'var(--accent-cyan)', lineHeight: 1 }}>
                        {formatCashScore(entry.score)}
                      </div>
                      <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.35)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: '3px' }}>
                        {period === 'season' ? t.leaderboard.netProfit : t.leaderboard.earnedCash}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Divider ──────────────────────────────────────────────────── */}
          {rest.length > 0 && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: '10px', margin: '4px 0',
            }}>
              <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.06)' }} />
              <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.2)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>{t.leaderboard.others}</span>
              <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.06)' }} />
            </div>
          )}

          {/* ── Rest of rankings ─────────────────────────────────────────── */}
          {rest.map((entry) => (
            <div key={entry.userId} style={{
              display: 'flex', alignItems: 'center', gap: '12px',
              padding: '12px 16px',
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(255,255,255,0.05)',
              borderRadius: '14px',
              transition: 'background 0.2s',
            }}>
              {/* Rank number */}
              <div style={{
                width: '28px', height: '28px', borderRadius: '50%', flexShrink: 0,
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.08)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '11px', fontWeight: 800, color: 'rgba(255,255,255,0.4)',
              }}>
                {entry.rank}
              </div>

              {/* Name info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#e2e8f0', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                  {entry.displayName || entry.firstName || t.common.anonymous}
                  {entry.isVip && (
                    <span style={{
                      fontSize: '9px', fontWeight: 900, color: '#fbbf24',
                      background: 'linear-gradient(135deg, rgba(245,158,11,0.25) 0%, rgba(251,191,36,0.12) 100%)',
                      border: '1px solid rgba(251,191,36,0.45)',
                      borderRadius: '6px', padding: '1px 6px',
                      display: 'inline-flex', alignItems: 'center', gap: '3px',
                      boxShadow: '0 0 10px rgba(251,191,36,0.3)',
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
                {period === 'season' && entry.totalRounds !== undefined && (
                  <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.35)', marginTop: '2px', fontWeight: 600 }}>
                    🎮 {entry.totalRounds} {t.leaderboard.roundsCount}
                  </div>
                )}
              </div>

              {/* Score / Net Profit */}
              <div style={{ flexShrink: 0, textAlign: 'right' }}>
                <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--accent-cyan)' }}>
                  {formatCashScore(entry.score)}
                </div>
                <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, marginTop: '2px' }}>
                  {period === 'season' ? t.leaderboard.netProfit : t.leaderboard.earnedCash}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
