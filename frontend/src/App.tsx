import { useState, useEffect, useCallback } from 'react';
import { Gamepad2, Trophy, User, Zap, TrendingUp } from 'lucide-react';
import { useTelegram } from './hooks/useTelegram';
import { Profile } from './components/Profile';
import { Leaderboard } from './components/Leaderboard';
import { GameWrapper } from './components/GameWrapper';
import { Shop } from './components/Shop';
import { Market } from './components/Market';
import { SeasonBanner } from './components/SeasonBanner';
import { EnergyModal } from './components/EnergyModal';
import { useLanguage } from './i18n/LanguageContext';
import { LanguageToggle } from './components/LanguageToggle';
import { TelegramRedirectLanding } from './components/TelegramRedirectLanding';

// Read API URL from environment, fallback to backend on local dev or current origin in prod
const BACKEND_URL =
  (import.meta.env.VITE_API_URL as string) ||
  (typeof window !== 'undefined' &&
  (window.location.port === '5173' ||
    window.location.port === '3000' ||
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1')
    ? 'http://localhost:5000'
    : typeof window !== 'undefined' && window.location.origin
    ? window.location.origin
    : 'http://localhost:5000');

interface ProfileData {
  user: {
    id: string;
    username: string | null;
    first_name: string | null;
    last_name: string | null;
    display_name: string | null;
    display_name_changed: boolean;
    referral_link: string;
    referrals_count: number;
    daily_ad_count: number;
    daily_ad_limit: number;
    season_pass_type?: 'NONE' | 'SEASON' | 'VIP';
    can_claim_free_refill?: boolean;
    daily_refill_remaining?: number;
    daily_refill_limit?: number;
    wallet_ltc: string | null;
    deletion_scheduled_at: string | null;
    game_cash?: number;
  };
  energy: {
    current: number;
    max: number;
    nextRechargeInSeconds: number;
    isTimeBoosterActive?: boolean;
    timeBoosterSecondsLeft?: number;
  };
}

export default function App() {
  const { t } = useLanguage();
  const { initData, isInsideTelegram, isGuest } = useTelegram();
  const [activeTab, setActiveTab] = useState<'games' | 'market' | 'leaderboard' | 'shop' | 'profile'>('games');
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showEnergyPopup, setShowEnergyPopup] = useState(false);

  // If accessed directly via browser outside Telegram -> Show referral landing card
  if (!isInsideTelegram) {
    return <TelegramRedirectLanding />;
  }


  // Fetch/Refresh profile details with optional retry on temporary network drop
  const fetchProfile = useCallback(async (retryCount = 0) => {
    if (!initData) return;
    try {
      const response = await fetch(`${BACKEND_URL}/api/user/profile`, {
        headers: {
          'Authorization': `Bearer ${initData}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Fehler beim Laden des Profils (${response.status})`);
      }

      const data: ProfileData = await response.json();
      setProfile(data);
    } catch (err: any) {
      console.warn('Fetch profile error:', err);
      // Auto-retry once on waking up from background / temporary network glitch
      if (retryCount < 1) {
        setTimeout(() => fetchProfile(retryCount + 1), 1200);
      }
    } finally {
      setLoading(false);
    }
  }, [initData]);

  // Initial load when initData is ready
  useEffect(() => {
    if (initData) {
      fetchProfile();
    }
  }, [initData, fetchProfile]);

  // 1. Auto-Resume & Connection Recovery:
  // Re-fetch profile & energy immediately when returning to the Mini App, focusing window, or reconnecting online
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchProfile();
      }
    };
    const handleFocus = () => {
      fetchProfile();
    };
    const handleOnline = () => {
      fetchProfile();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('online', handleOnline);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('online', handleOnline);
    };
  }, [fetchProfile]);

  // 2. Global Energy Countdown & Auto-Regeneration Tick:
  // Runs continuously in root App so energy naturally regenerates across all tabs & views
  useEffect(() => {
    if (!profile) return;
    const { current, max, nextRechargeInSeconds } = profile.energy;

    // Only tick when energy is depleted below max and cooldown timer > 0
    if (current >= max || nextRechargeInSeconds <= 0) return;

    const timer = setInterval(() => {
      setProfile((prev) => {
        if (!prev) return prev;
        const prevEnergy = prev.energy;
        if (prevEnergy.current >= prevEnergy.max) return prev;

        const newSeconds = prevEnergy.nextRechargeInSeconds - 1;
        if (newSeconds <= 0) {
          // Timer reached 0 -> Fetch authoritative state from backend immediately
          setTimeout(() => fetchProfile(), 100);
          return {
            ...prev,
            energy: {
              ...prevEnergy,
              current: Math.min(prevEnergy.max, prevEnergy.current + 1),
              nextRechargeInSeconds: 0,
            },
          };
        }

        return {
          ...prev,
          energy: {
            ...prevEnergy,
            nextRechargeInSeconds: newSeconds,
          },
        };
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [profile?.energy?.current, profile?.energy?.max, profile?.energy?.nextRechargeInSeconds, fetchProfile]);

  // 3. Periodic Background Sync (every 25s when visible):
  useEffect(() => {
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible' && initData) {
        fetchProfile();
      }
    }, 25000);
    return () => clearInterval(interval);
  }, [initData, fetchProfile]);

  return (
    <div
      className="min-h-screen flex flex-col relative px-4 text-white font-sans overflow-x-hidden"
      style={{ maxWidth: '440px', width: '100%', margin: '0 auto' }}
    >
      
      {/* Top Header Row with Official CoinCade Logo filling entire space up to language toggle */}
      <header className="brand-header">
        <div className="flex-1 flex items-center cursor-pointer min-w-0 pr-3" onClick={() => setActiveTab('games')}>
          <img
            src="/coincade-logo.png"
            alt="COINCADE"
            style={{
              width: '100%',
              height: 'auto',
              maxHeight: '48px',
              objectFit: 'contain',
              objectPosition: 'left center',
              display: 'block',
            }}
            className="drop-shadow-[0_0_12px_rgba(0,242,254,0.45)] hover:scale-[1.02] transition-transform origin-left"
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
          <LanguageToggle />

          {profile && (
            <>
              <button
                onClick={() => setActiveTab('market')}
                style={{
                  display: 'flex', alignItems: 'center', gap: '4px',
                  background: 'rgba(74,222,128,0.12)', border: '1px solid rgba(74,222,128,0.3)',
                  borderRadius: '12px', padding: '5px 8px',
                  color: '#4ade80', fontSize: '11px', fontWeight: 800, fontFamily: 'monospace',
                  cursor: 'pointer',
                }}
                title={t.nav.market}
              >
                <span>💵 {(profile.user.game_cash || 0.0).toFixed(2)} $</span>
              </button>

              <button
                onClick={() => setShowEnergyPopup(true)}
                className="energy-pill-button"
                title={t.header.getEnergy}
              >
                <Zap size={11} className="energy-icon animate-pulse" />
                <span className="energy-value">
                  {profile.energy.isTimeBoosterActive ? '∞' : `${profile.energy.current} / ${profile.energy.max}`}
                </span>
                <span className="energy-plus-indicator">+</span>
              </button>
            </>
          )}
        </div>
      </header>

      {/* Web Guest Mode CTA Banner */}
      {isGuest && (
        <div
          style={{
            margin: '8px 0 12px 0',
            background: 'linear-gradient(135deg, rgba(251,191,36,0.14) 0%, rgba(0,242,254,0.08) 100%)',
            border: '1px solid rgba(251,191,36,0.35)',
            borderRadius: '16px',
            padding: '12px 14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.35)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
            <span style={{ fontSize: '22px', flexShrink: 0 }}>🎮</span>
            <div style={{ minWidth: 0 }}>
              <div style={{
                fontSize: '11px',
                fontWeight: 900,
                color: 'var(--gold)',
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
                marginBottom: '2px',
              }}>
                {t.guestBanner.title}
              </div>
              <div style={{
                fontSize: '10.5px',
                color: 'rgba(255,255,255,0.75)',
                lineHeight: 1.35,
              }}>
                {t.guestBanner.description}
              </div>
            </div>
          </div>

          <a
            href="https://t.me/coincadebot/webapp"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              background: 'linear-gradient(135deg, #00f2fe 0%, #4facfe 100%)',
              color: '#000',
              fontWeight: 900,
              fontSize: '11px',
              padding: '8px 14px',
              borderRadius: '10px',
              textDecoration: 'none',
              boxShadow: '0 0 16px rgba(0,242,254,0.4)',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            <span>✈️ {t.guestBanner.ctaBtn}</span>
          </a>
        </div>
      )}

      {/* Season Progress & Airdrop Banner */}
      <SeasonBanner backendUrl={BACKEND_URL} />

      {/* Main Content Area */}
      <main className="content-area">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-cyan-400" style={{ borderBottomColor: 'var(--accent-cyan)' }}></div>
            <span className="text-sm font-semibold text-cyan-400 animate-pulse">{t.common.loading}</span>
          </div>
        ) : (
          <>
            {activeTab === 'games' && profile && (
              <GameWrapper
                initData={initData}
                backendUrl={BACKEND_URL}
                currentEnergy={profile.energy.current}
                maxEnergy={profile.energy.max}
                nextRechargeInSeconds={profile.energy.nextRechargeInSeconds}
                onGameFinished={fetchProfile}
                referralLink={profile.user.referral_link}
                dailyAdCount={profile.user.daily_ad_count}
                dailyAdLimit={profile.user.daily_ad_limit}
                onOpenShop={() => setActiveTab('shop')}
              />
            )}
            {activeTab === 'market' && (
              <Market
                initData={initData}
                backendUrl={BACKEND_URL}
                onBalanceUpdate={fetchProfile}
              />
            )}
            {activeTab === 'leaderboard' && (
              <Leaderboard initData={initData} backendUrl={BACKEND_URL} />
            )}
            {activeTab === 'shop' && profile && (
              <Shop
                initData={initData}
                backendUrl={BACKEND_URL}
                onPurchaseSuccess={fetchProfile}
                profile={profile}
              />
            )}
            {activeTab === 'profile' && profile && (
              <Profile
                profile={profile}
                onRefresh={fetchProfile}
                initData={initData}
                backendUrl={BACKEND_URL}
              />
            )}
          </>
        )}
      </main>

      {/* Bottom Sticky Tab Navigation */}
      <nav className="nav-bar glass">
        <button
          onClick={() => setActiveTab('games')}
          className={`nav-item ${activeTab === 'games' ? 'active' : ''}`}
        >
          <Gamepad2 size={20} />
          <span>{t.nav.games}</span>
        </button>
        <button
          onClick={() => setActiveTab('market')}
          className={`nav-item ${activeTab === 'market' ? 'active' : ''}`}
        >
          <TrendingUp size={20} />
          <span>{t.nav.market}</span>
        </button>
        <button
          onClick={() => setActiveTab('leaderboard')}
          className={`nav-item ${activeTab === 'leaderboard' ? 'active' : ''}`}
        >
          <Trophy size={20} />
          <span>{t.nav.leaderboard}</span>
        </button>
        <button
          onClick={() => setActiveTab('shop')}
          className={`nav-item ${activeTab === 'shop' ? 'active' : ''}`}
        >
          <Zap size={20} />
          <span>{t.nav.shop}</span>
        </button>
        <button
          onClick={() => setActiveTab('profile')}
          className={`nav-item ${activeTab === 'profile' ? 'active' : ''}`}
        >
          <User size={20} />
          <span>{t.nav.profile}</span>
        </button>
      </nav>

      {/* Global Energy Refill Modal */}
      {profile && (
        <EnergyModal
          isOpen={showEnergyPopup}
          onClose={() => setShowEnergyPopup(false)}
          currentEnergy={profile.energy.current}
          maxEnergy={profile.energy.max}
          nextRechargeInSeconds={profile.energy.nextRechargeInSeconds}
          dailyAdCount={profile.user.daily_ad_count}
          dailyAdLimit={profile.user.daily_ad_limit || 10}
          initData={initData}
          backendUrl={BACKEND_URL}
          referralLink={profile.user.referral_link}
          onEnergyGranted={() => fetchProfile()}
          onOpenShop={() => {
            setShowEnergyPopup(false);
            setActiveTab('shop');
          }}
        />
      )}
    </div>
  );
}
