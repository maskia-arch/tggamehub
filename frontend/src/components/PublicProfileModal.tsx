import React, { useState, useEffect } from 'react';
import { X, Users, Award } from 'lucide-react';
import { getAvatarConfig, getAvatarPath } from '../config/avatars';

interface GameStat {
  gameId: string;
  title: string;
  icon: string;
  scoreUnit: string;
  highScore: number;
  totalRounds: number;
  rank: string;
}

interface BadgeItem {
  id: string;
  category: string;
  title: string;
  description: string;
  badge_icon: string;
  badge_rarity: 'OG' | 'GOLD' | 'SILVER' | 'BRONZE' | 'DIAMOND';
  is_unlocked: boolean;
  unlocked_at: string | null;
}

interface PublicProfileData {
  userId: string;
  displayName: string;
  username: string | null;
  avatarId?: string | null;
  createdAt: string;
  seasonPassType: 'NONE' | 'SEASON' | 'VIP';
  isOgPlayer: boolean;
  isFrozen: boolean;
  isBanned: boolean;
  referralsCount: number;
  gameStats: GameStat[];
  unlockedBadgesCount: number;
  totalBadgesCount: number;
  badges: BadgeItem[];
  allAchievements: BadgeItem[];
}

interface PublicProfileModalProps {
  userId: string | null;
  onClose: () => void;
  backendUrl: string;
  initData: string;
}

const RARITY_STYLES: Record<string, { border: string; bg: string; text: string; glow: string }> = {
  OG: {
    border: 'rgba(251, 191, 36, 0.6)',
    bg: 'linear-gradient(135deg, rgba(251,191,36,0.25) 0%, rgba(245,158,11,0.1) 100%)',
    text: '#fbbf24',
    glow: '0 0 15px rgba(251,191,36,0.35)',
  },
  DIAMOND: {
    border: 'rgba(0, 242, 254, 0.6)',
    bg: 'linear-gradient(135deg, rgba(0,242,254,0.2) 0%, rgba(79,172,254,0.1) 100%)',
    text: '#00f2fe',
    glow: '0 0 12px rgba(0,242,254,0.3)',
  },
  GOLD: {
    border: 'rgba(234, 179, 8, 0.5)',
    bg: 'linear-gradient(135deg, rgba(234,179,8,0.15) 0%, rgba(202,138,4,0.08) 100%)',
    text: '#eab308',
    glow: '0 0 10px rgba(234,179,8,0.25)',
  },
  SILVER: {
    border: 'rgba(148, 163, 184, 0.4)',
    bg: 'linear-gradient(135deg, rgba(148,163,184,0.15) 0%, rgba(100,116,139,0.08) 100%)',
    text: '#cbd5e1',
    glow: '0 0 8px rgba(148,163,184,0.15)',
  },
  BRONZE: {
    border: 'rgba(217, 119, 6, 0.4)',
    bg: 'linear-gradient(135deg, rgba(217,119,6,0.12) 0%, rgba(180,83,9,0.06) 100%)',
    text: '#d97706',
    glow: '0 0 6px rgba(217,119,6,0.15)',
  },
};

export const PublicProfileModal: React.FC<PublicProfileModalProps> = ({
  userId,
  onClose,
  backendUrl,
  initData,
}) => {
  const [profile, setProfile] = useState<PublicProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedBadge, setSelectedBadge] = useState<BadgeItem | null>(null);

  useEffect(() => {
    if (!userId) return;

    let isMounted = true;
    setLoading(true);
    setError(null);

    const fetchPublicProfile = async () => {
      try {
        const res = await fetch(`${backendUrl}/api/user/public-profile/${userId}`, {
          headers: {
            Authorization: `Bearer ${initData}`,
          },
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error || 'Spielerprofil konnte nicht geladen werden.');
        }
        if (isMounted) {
          setProfile(data.profile);
        }
      } catch (err: any) {
        if (isMounted) {
          setError(err.message || 'Fehler beim Laden des Profils.');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchPublicProfile();
    return () => {
      isMounted = false;
    };
  }, [userId, backendUrl, initData]);

  if (!userId) return null;

  const memberSince = profile?.createdAt
    ? new Date(profile.createdAt).toLocaleDateString('de-DE', { month: 'short', year: 'numeric' })
    : '—';

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        background: 'rgba(4, 6, 15, 0.85)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        animation: 'fadeIn 0.2s ease-out',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '420px',
          maxHeight: '90vh',
          overflowY: 'auto',
          background: 'linear-gradient(180deg, #12182c 0%, #0a0d18 100%)',
          border: '1px solid rgba(0, 242, 254, 0.25)',
          borderRadius: '24px',
          padding: '24px 20px',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.8), 0 0 30px rgba(0, 242, 254, 0.15)',
          color: '#fff',
          position: 'relative',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '16px',
            right: '16px',
            background: 'rgba(255, 255, 255, 0.08)',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            borderRadius: '50%',
            width: '32px',
            height: '32px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            cursor: 'pointer',
            zIndex: 10,
          }}
        >
          <X size={18} />
        </button>

        {loading ? (
          <div style={{ padding: '60px 0', textAlign: 'center', color: '#00f2fe' }}>
            <div style={{ fontSize: '24px', animation: 'spin 1s infinite linear', display: 'inline-block' }}>⚡</div>
            <div style={{ marginTop: '12px', fontSize: '13px', color: 'rgba(255,255,255,0.6)', fontWeight: 600 }}>
              Lade Spielerkarte...
            </div>
          </div>
        ) : error || !profile ? (
          <div style={{ padding: '40px 0', textAlign: 'center' }}>
            <div style={{ fontSize: '32px' }}>⚠️</div>
            <h3 style={{ margin: '12px 0 6px', fontSize: '16px', color: '#ff4d4d' }}>Profil nicht verfügbar</h3>
            <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)', margin: 0 }}>{error}</p>
          </div>
        ) : (
          <div>
            {/* ── Gamer Header ── */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '20px' }}>
              <div
                style={{
                  width: '64px',
                  height: '64px',
                  borderRadius: '20px',
                  overflow: 'hidden',
                  border: `2px solid ${getAvatarConfig(profile.avatarId).glowColor}`,
                  boxShadow: `0 0 20px ${getAvatarConfig(profile.avatarId).glowColor}66`,
                  flexShrink: 0,
                }}
              >
                <img
                  src={getAvatarPath(profile.avatarId)}
                  alt={profile.displayName}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 900, color: '#fff', letterSpacing: '0.02em' }}>
                    {profile.displayName}
                  </h2>
                  {profile.seasonPassType === 'VIP' && (
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      <img
                        src="/assets/vip_badge_gold.png"
                        alt="VIP Badge"
                        style={{
                          width: '24px', height: '24px', objectFit: 'contain',
                          filter: 'drop-shadow(0 0 6px rgba(251,191,36,0.8))',
                          verticalAlign: 'middle',
                        }}
                      />
                      <span style={{
                        fontSize: '9px', fontWeight: 900, color: '#fbbf24',
                        background: 'rgba(251,191,36,0.15)', border: '1px solid rgba(251,191,36,0.35)',
                        borderRadius: '6px', padding: '2px 6px', letterSpacing: '0.05em',
                        boxShadow: '0 0 10px rgba(251,191,36,0.25)',
                      }}>
                        👑 VIP PASS
                      </span>
                    </div>
                  )}
                </div>

                {profile.username && (
                  <div style={{ fontSize: '12px', color: '#00f2fe', fontWeight: 600, marginTop: '2px' }}>
                    @{profile.username}
                  </div>
                )}

                <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', marginTop: '4px' }}>
                  Dabei seit {memberSince}
                </div>
              </div>
            </div>

            {/* ── Golden OG Pioneer Banner (If Eligible) ── */}
            {profile.isOgPlayer && (
              <div
                style={{
                  background: 'linear-gradient(135deg, rgba(251,191,36,0.2) 0%, rgba(217,119,6,0.1) 100%)',
                  border: '1px solid rgba(251,191,36,0.5)',
                  borderRadius: '16px',
                  padding: '12px 14px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  marginBottom: '16px',
                  boxShadow: '0 0 15px rgba(251,191,36,0.2)',
                }}
              >
                <div style={{
                  fontSize: '24px', width: '36px', height: '36px', borderRadius: '10px',
                  background: 'rgba(251,191,36,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                  🌟
                </div>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 900, color: '#fbbf24', letterSpacing: '0.04em' }}>
                    GOLDENER OG PIONIER
                  </div>
                  <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.7)', marginTop: '2px' }}>
                    Seit Stunde 1 vor Airdrop Season 1 registriert.
                  </div>
                </div>
              </div>
            )}

            {/* ── Summary Stats Grid ── */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '20px' }}>
              <div style={{
                background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '14px', padding: '10px 12px', display: 'flex', alignItems: 'center', gap: '10px'
              }}>
                <Award size={20} style={{ color: '#fbbf24' }} />
                <div>
                  <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', fontWeight: 800 }}>
                    Badges
                  </div>
                  <div style={{ fontSize: '14px', fontWeight: 900, color: '#fff' }}>
                    {profile.unlockedBadgesCount} / {profile.totalBadgesCount}
                  </div>
                </div>
              </div>

              <div style={{
                background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '14px', padding: '10px 12px', display: 'flex', alignItems: 'center', gap: '10px'
              }}>
                <Users size={20} style={{ color: '#00f2fe' }} />
                <div>
                  <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', fontWeight: 800 }}>
                    Eingeladen
                  </div>
                  <div style={{ fontSize: '14px', fontWeight: 900, color: '#fff' }}>
                    {profile.referralsCount} Spieler
                  </div>
                </div>
              </div>
            </div>

            {/* ── Highscores All Minigames ── */}
            <div style={{ marginBottom: '20px' }}>
              <div style={{ fontSize: '11px', fontWeight: 900, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '10px' }}>
                🎮 Game Highscores & Ränge
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {profile.gameStats.map((stat) => (
                  <div
                    key={stat.gameId}
                    style={{
                      background: 'rgba(16, 22, 40, 0.6)',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      borderRadius: '14px',
                      padding: '10px 14px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ fontSize: '18px' }}>{stat.icon}</span>
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: 800, color: '#fff' }}>
                          {stat.title}
                        </div>
                        <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)' }}>
                          {stat.totalRounds} Runden absolviert
                        </div>
                      </div>
                    </div>

                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '14px', fontWeight: 900, color: '#00f2fe', fontFamily: 'monospace' }}>
                        {stat.highScore.toLocaleString()} {stat.scoreUnit}
                      </div>
                      <div style={{ fontSize: '11px', fontWeight: 800, color: stat.rank !== '—' ? '#fbbf24' : 'rgba(255,255,255,0.3)' }}>
                        Rang {stat.rank}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Badges & Achievements Vitrine ── */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <span style={{ fontSize: '11px', fontWeight: 900, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  🏆 Badges & Erfolge ({profile.unlockedBadgesCount})
                </span>
                <span style={{ fontSize: '11px', color: '#00f2fe', fontWeight: 700 }}>
                  Vitrine
                </span>
              </div>

              {profile.badges.length === 0 ? (
                <div style={{ padding: '20px 0', textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: '12px' }}>
                  Noch keine Badges freigeschaltet.
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
                  {profile.badges.map((badge) => {
                    const rarityStyle = RARITY_STYLES[badge.badge_rarity] || RARITY_STYLES.BRONZE;
                    return (
                      <div
                        key={badge.id}
                        onClick={() => setSelectedBadge(badge)}
                        style={{
                          background: rarityStyle.bg,
                          border: `1px solid ${rarityStyle.border}`,
                          borderRadius: '14px',
                          padding: '10px 6px',
                          textAlign: 'center',
                          cursor: 'pointer',
                          boxShadow: rarityStyle.glow,
                          transition: 'transform 0.15s ease',
                        }}
                      >
                        <div style={{ fontSize: '22px', marginBottom: '4px' }}>{badge.badge_icon}</div>
                        <div style={{
                          fontSize: '10px', fontWeight: 800, color: '#fff',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                        }}>
                          {badge.title}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Badge Detail Modal / Drawer inside */}
              {selectedBadge && (
                <div
                  style={{
                    marginTop: '14px',
                    background: 'rgba(0, 0, 0, 0.4)',
                    border: `1px solid ${RARITY_STYLES[selectedBadge.badge_rarity]?.border || 'rgba(255,255,255,0.2)'}`,
                    borderRadius: '14px',
                    padding: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    position: 'relative',
                  }}
                >
                  <div style={{ fontSize: '28px' }}>{selectedBadge.badge_icon}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <div style={{ fontSize: '13px', fontWeight: 900, color: '#fff' }}>
                        {selectedBadge.title}
                      </div>
                      <span style={{
                        fontSize: '8px', fontWeight: 900, padding: '1px 5px', borderRadius: '4px',
                        color: RARITY_STYLES[selectedBadge.badge_rarity]?.text || '#fff',
                        border: `1px solid ${RARITY_STYLES[selectedBadge.badge_rarity]?.border || 'rgba(255,255,255,0.2)'}`
                      }}>
                        {selectedBadge.badge_rarity}
                      </span>
                    </div>
                    <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.7)', marginTop: '2px' }}>
                      {selectedBadge.description}
                    </div>
                    {selectedBadge.unlocked_at && (
                      <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)', marginTop: '4px' }}>
                        Freigeschaltet am {new Date(selectedBadge.unlocked_at).toLocaleDateString('de-DE')}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => setSelectedBadge(null)}
                    style={{
                      background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)',
                      cursor: 'pointer', padding: '4px'
                    }}
                  >
                    <X size={14} />
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
