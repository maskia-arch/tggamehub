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
import { FrozenAccountModal } from './components/FrozenAccountModal';
import { TutorialOverlay } from './components/TutorialOverlay';

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
    can_change_name?: boolean;
    name_change_cooldown_days_left?: number;
    last_name_change_at?: string | null;
    name_changes_count?: number;
    avatar_id?: string | null;
    referral_link: string;
    referrals_count: number;
    daily_ad_count: number;
    daily_ad_limit: number;
    season_pass_type?: 'NONE' | 'SEASON' | 'VIP';
    is_vip?: boolean;
    is_ad_free?: boolean;
    can_claim_free_refill?: boolean;
    daily_refill_remaining?: number;
    daily_refill_limit?: number;
    daily_refill_amount?: number;
    wallet_ltc: string | null;
    deletion_scheduled_at: string | null;
    game_cash?: number;
    is_frozen?: boolean;
    frozen_reason?: string | null;
    is_banned?: boolean;
    ban_reason?: string | null;
    is_og_player?: boolean;
    unlocked_badges_count?: number;
    total_badges_count?: number;
    badges?: any[];
    all_achievements?: any[];
    tutorial_status?: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'SKIPPED';
    tutorial_step?: number;
    tutorial_reward_claimed?: boolean;
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

  // ── Tutorial State & Flow Management ──
  const [tutorialStep, setTutorialStep] = useState<number>(1);
  const [isTutorialActive, setIsTutorialActive] = useState<boolean>(false);
  const [showTutorialOffer, setShowTutorialOffer] = useState<boolean>(false);
  const [showTutorialCompletion, setShowTutorialCompletion] = useState<boolean>(false);
  const [tutorialSubStep, setTutorialSubStep] = useState<string | null>(null);
  const [tutorialPillar, setTutorialPillar] = useState<'games' | 'season'>('games');
  const [autoOpenAvatarModal, setAutoOpenAvatarModal] = useState<boolean>(false);

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

  // ── Sync Tutorial Initial State From Loaded Profile ──
  useEffect(() => {
    if (!profile || isGuest) return;
    const status = profile.user.tutorial_status || 'NOT_STARTED';
    const isPostponed = sessionStorage.getItem('coincade_tutorial_postponed_session') === 'true';

    if (status === 'NOT_STARTED' && !isPostponed && !isTutorialActive && !showTutorialCompletion) {
      setShowTutorialOffer(true);
    } else if (status === 'IN_PROGRESS' && !isTutorialActive && !showTutorialCompletion) {
      setIsTutorialActive(true);
      const step = profile.user.tutorial_step || 1;
      setTutorialStep(step);
      if (step === 1 || step === 2) setActiveTab('games');
      else if (step === 3) { setActiveTab('market'); setTutorialSubStep('market_news'); }
      else if (step === 4) { setActiveTab('leaderboard'); setTutorialPillar('games'); }
      else if (step === 5) { setActiveTab('leaderboard'); setTutorialPillar('season'); }
      else if (step === 6) setActiveTab('shop');
      else if (step === 7) { setActiveTab('profile'); setAutoOpenAvatarModal(true); }
    }
  }, [profile?.user?.tutorial_status, profile?.user?.tutorial_step, isGuest]);

  const handleStartTutorial = async () => {
    setShowTutorialOffer(false);
    setIsTutorialActive(true);
    setTutorialStep(1);
    setActiveTab('games');
    try {
      await fetch(`${BACKEND_URL}/api/user/tutorial/status`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${initData}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'IN_PROGRESS', step: 1 }),
      });
    } catch (e) {
      console.warn('Failed to save tutorial status:', e);
    }
  };

  const handlePostponeTutorial = () => {
    setShowTutorialOffer(false);
    setIsTutorialActive(false);
    sessionStorage.setItem('coincade_tutorial_postponed_session', 'true');
  };

  const handleDeclinePermanentTutorial = async () => {
    setShowTutorialOffer(false);
    setIsTutorialActive(false);
    if (profile) {
      setProfile({
        ...profile,
        user: { ...profile.user, tutorial_status: 'SKIPPED' },
      });
    }
    try {
      await fetch(`${BACKEND_URL}/api/user/tutorial/status`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${initData}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'SKIPPED' }),
      });
    } catch (e) {
      console.warn('Failed to save tutorial skip:', e);
    }
  };

  const handleAbortTutorial = async () => {
    setIsTutorialActive(false);
    setShowTutorialOffer(false);
    if (profile) {
      setProfile({
        ...profile,
        user: { ...profile.user, tutorial_status: 'SKIPPED' },
      });
    }
    try {
      await fetch(`${BACKEND_URL}/api/user/tutorial/status`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${initData}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'SKIPPED' }),
      });
    } catch (e) {
      console.warn('Failed to save tutorial abort:', e);
    }
  };

  const syncTutorialStep = async (step: number) => {
    try {
      await fetch(`${BACKEND_URL}/api/user/tutorial/status`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${initData}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ step }),
      });
    } catch (e) {
      console.warn('Failed to sync tutorial step:', e);
    }
  };

  const handleNextStep = async () => {
    if (tutorialStep === 1) {
      setTutorialStep(2);
      setActiveTab('games');
      await syncTutorialStep(2);
    } else if (tutorialStep === 2) {
      setTutorialStep(3);
      setTutorialSubStep('market_news');
      setActiveTab('market');
      await syncTutorialStep(3);
    } else if (tutorialStep === 3) {
      if (tutorialSubStep === 'market_news') {
        setTutorialSubStep('trading_doodle');
      } else if (tutorialSubStep === 'portfolio' || !tutorialSubStep) {
        setTutorialStep(4);
        setTutorialSubStep(null);
        setActiveTab('leaderboard');
        setTutorialPillar('games');
        await syncTutorialStep(4);
      }
    } else if (tutorialStep === 4) {
      setTutorialStep(5);
      setActiveTab('leaderboard');
      setTutorialPillar('season');
      await syncTutorialStep(5);
    } else if (tutorialStep === 5) {
      setTutorialStep(6);
      setActiveTab('shop');
      await syncTutorialStep(6);
    } else if (tutorialStep === 6) {
      setTutorialStep(7);
      setActiveTab('profile');
      setAutoOpenAvatarModal(true);
      await syncTutorialStep(7);
    }
  };

  const handleClaimTutorialReward = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/user/tutorial/complete`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${initData}` },
      });
      if (res.ok || res.status === 400) {
        setShowTutorialCompletion(false);
        setIsTutorialActive(false);
        if (profile) {
          setProfile({
            ...profile,
            user: {
              ...profile.user,
              tutorial_status: 'COMPLETED',
              tutorial_reward_claimed: true,
            }
          });
        }
        await fetchProfile();
      }
    } catch (e) {
      console.error('Failed to claim tutorial reward:', e);
      setShowTutorialCompletion(false);
      setIsTutorialActive(false);
      await fetchProfile();
    }
  };

  const getTargetSelector = () => {
    if (!isTutorialActive) return null;
    switch (tutorialStep) {
      case 2:
        return '[data-tutorial="game-play-btn-doodlejump"]';
      case 3:
        if (tutorialSubStep === 'market_news') return '[data-tutorial="market-subtabs"]';
        if (tutorialSubStep === 'trading_doodle') return '[data-tutorial="market-trade-max-btn"]';
        if (tutorialSubStep === 'portfolio') return '[data-tutorial="market-tab-portfolio"]';
        return null;
      case 4:
        return '[data-tutorial="leaderboard-timeframes"]';
      case 5:
        return '[data-tutorial="leaderboard-pillar-season"]';
      case 6:
        return '[data-tutorial="shop-header-card"]';
      case 7:
        return '[data-tutorial="profile-avatar-btn"]';
      default:
        return null;
    }
  };

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
                isTutorialStep2={isTutorialActive && tutorialStep === 2}
                onTutorialGameCompleted={() => {
                  setTutorialStep(3);
                  setTutorialSubStep('market_news');
                  setActiveTab('market');
                  syncTutorialStep(3);
                  fetchProfile();
                }}
              />
            )}
            {activeTab === 'market' && (
              <Market
                initData={initData}
                backendUrl={BACKEND_URL}
                onBalanceUpdate={fetchProfile}
                tutorialSubStep={isTutorialActive && tutorialStep === 3 ? tutorialSubStep : null}
                onTutorialProgress={(nextSub) => {
                  setTutorialSubStep(nextSub);
                }}
              />
            )}
            {activeTab === 'leaderboard' && (
              <Leaderboard
                initData={initData}
                backendUrl={BACKEND_URL}
                tutorialPillar={isTutorialActive ? tutorialPillar : undefined}
                onTutorialSwitchPillar={(p) => setTutorialPillar(p)}
              />
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
                autoOpenAvatarModal={isTutorialActive && tutorialStep === 7 && autoOpenAvatarModal}
                onTutorialAvatarSelected={() => {
                  setAutoOpenAvatarModal(false);
                  setIsTutorialActive(false);
                  setShowTutorialCompletion(true);
                }}
              />
            )}
          </>
        )}
      </main>

      {/* Bottom Sticky Tab Navigation */}
      <nav className="nav-bar glass">
        <button
          data-tutorial="nav-item-games"
          onClick={() => setActiveTab('games')}
          className={`nav-item ${activeTab === 'games' ? 'active' : ''}`}
        >
          <Gamepad2 size={20} />
          <span>{t.nav.games}</span>
        </button>
        <button
          data-tutorial="nav-item-market"
          onClick={() => setActiveTab('market')}
          className={`nav-item ${activeTab === 'market' ? 'active' : ''}`}
        >
          <TrendingUp size={20} />
          <span>{t.nav.market}</span>
        </button>
        <button
          data-tutorial="nav-item-leaderboard"
          onClick={() => setActiveTab('leaderboard')}
          className={`nav-item ${activeTab === 'leaderboard' ? 'active' : ''}`}
        >
          <Trophy size={20} />
          <span>{t.nav.leaderboard}</span>
        </button>
        <button
          data-tutorial="nav-item-shop"
          onClick={() => setActiveTab('shop')}
          className={`nav-item ${activeTab === 'shop' ? 'active' : ''}`}
        >
          <Zap size={20} />
          <span>{t.nav.shop}</span>
        </button>
        <button
          data-tutorial="nav-item-profile"
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

      {/* Frozen or Banned Lockout Screen */}
      {profile && (profile.user.is_frozen || profile.user.is_banned) && (
        <FrozenAccountModal
          isFrozen={Boolean(profile.user.is_frozen)}
          isBanned={Boolean(profile.user.is_banned)}
          reason={profile.user.frozen_reason || profile.user.ban_reason}
        />
      )}

      {/* ── Guided Onboarding Tutorial System ── */}
      <TutorialOverlay
        currentStep={tutorialStep}
        isActive={isTutorialActive}
        showOffer={showTutorialOffer}
        showCompletion={showTutorialCompletion}
        onStart={handleStartTutorial}
        onPostpone={handlePostponeTutorial}
        onDeclinePermanent={handleDeclinePermanentTutorial}
        onNextStep={handleNextStep}
        onAbortTutorial={handleAbortTutorial}
        onClaimReward={handleClaimTutorialReward}
        targetElementSelector={getTargetSelector()}
        subStep={tutorialSubStep}
      />
    </div>
  );
}
