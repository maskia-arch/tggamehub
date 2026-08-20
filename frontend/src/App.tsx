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

// Read API URL from environment, fallback to current origin (single-service) or local dev server
const BACKEND_URL = (import.meta.env.VITE_API_URL as string) || (typeof window !== 'undefined' && window.location.origin ? window.location.origin : 'http://localhost:5000');

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
  const { initData, isInsideTelegram } = useTelegram();
  const [activeTab, setActiveTab] = useState<'games' | 'market' | 'leaderboard' | 'shop' | 'profile'>('games');
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showEnergyPopup, setShowEnergyPopup] = useState(false);

  // If visitor is browsing directly on web outside Telegram, show the Telegram redirect landing page
  if (isInsideTelegram === false) {
    return <TelegramRedirectLanding />;
  }


  // Fetch/Refresh profile details
  const fetchProfile = useCallback(async () => {
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
      console.error('Fetch profile error:', err);
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

  return (
    <div
      className="min-h-screen flex flex-col relative px-4 text-white font-sans overflow-x-hidden"
      style={{ maxWidth: '440px', width: '100%', margin: '0 auto' }}
    >
      
      {/* Top Header Row with Official CoinCade Logo */}
      <header className="brand-header">
        <div className="flex items-center gap-2 cursor-pointer" onClick={() => setActiveTab('games')}>
          <img
            src="/coincade-logo.png"
            alt="COINCADE"
            className="h-7 sm:h-8 w-auto object-contain drop-shadow-[0_0_10px_rgba(0,242,254,0.35)] hover:scale-105 transition-transform"
          />
        </div>


        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
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
          onEnergyGranted={fetchProfile}
          onOpenShop={() => {
            setShowEnergyPopup(false);
            setActiveTab('shop');
          }}
        />
      )}
    </div>
  );
}
