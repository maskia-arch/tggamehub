import { useState, useEffect } from 'react';
import { Zap, X, Play, ShoppingBag, Users, Clock, Lock } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';
import { VideoAdPlayerModal } from './VideoAdPlayerModal';

interface EnergyModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentEnergy: number;
  maxEnergy?: number;
  nextRechargeInSeconds: number;
  dailyAdCount: number;
  dailyAdLimit?: number;
  initData: string;
  backendUrl: string;
  referralLink: string;
  onEnergyGranted: (newEnergy?: number) => void;
  onOpenShop?: () => void;
}

export function EnergyModal({
  isOpen,
  onClose,
  currentEnergy,
  maxEnergy = 5,
  nextRechargeInSeconds,
  dailyAdCount,
  dailyAdLimit = 10,
  initData,
  backendUrl,
  referralLink,
  onEnergyGranted,
  onOpenShop,
}: EnergyModalProps) {
  const { t } = useLanguage();
  const [showVideoPlayer, setShowVideoPlayer] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(nextRechargeInSeconds);
  const [copiedLink, setCopiedLink] = useState(false);

  // Synchronize countdown when prop or visibility changes
  useEffect(() => {
    setSecondsLeft(nextRechargeInSeconds);
  }, [nextRechargeInSeconds, isOpen]);

  // Live countdown timer ticking down every second
  useEffect(() => {
    if (!isOpen || currentEnergy >= maxEnergy || secondsLeft <= 0) return;
    const timer = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          onEnergyGranted();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [isOpen, secondsLeft, currentEnergy, maxEnergy, onEnergyGranted]);

  if (!isOpen) return null;

  const isUnlimitedAds = dailyAdLimit >= 999;
  const remainingAds = Math.max(0, dailyAdLimit - (dailyAdCount || 0));
  const isAdLimitReached = !isUnlimitedAds && remainingAds <= 0;

  const formatCountdown = (totalSec: number): string => {
    if (totalSec <= 0) return t.common.ok;
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const handleWatchAd = () => {
    if (isAdLimitReached) return;
    setShowVideoPlayer(true);
  };

  const handleInviteFriend = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(referralLink);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 3000);
    }
    // Also trigger Telegram WebApp share if available
    const tg = (window as any).Telegram?.WebApp;
    if (tg?.openTelegramLink) {
      const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(referralLink)}&text=${encodeURIComponent(t.common.telegramShareText)}`;
      tg.openTelegramLink(shareUrl);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'rgba(5, 7, 15, 0.88)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        zIndex: 1000000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        animation: 'fadeIn 0.2s ease-out forwards',
      }}
    >
      <div
        style={{
          background: '#0c1020',
          border: '1px solid rgba(255, 140, 0, 0.25)',
          boxShadow: '0 0 50px rgba(255, 140, 0, 0.15), 0 20px 40px rgba(0,0,0,0.8)',
          borderRadius: '24px',
          padding: '20px',
          width: '100%',
          maxWidth: '350px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'stretch',
          animation: 'scaleUp 0.25s cubic-bezier(0.34, 1.56, 0.64, 1) forwards',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', fontWeight: 900, color: 'var(--accent-orange)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            <Zap size={16} className="fill-orange-400 stroke-none animate-bounce" /> {t.header.getEnergy}
          </span>
          <button
            onClick={onClose}
            style={{
              width: '32px', height: '32px', borderRadius: '50%',
              background: 'rgba(255, 255, 255, 0.06)', border: '1px solid rgba(255, 255, 255, 0.1)',
              color: '#d1d5db', display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', transition: 'all 0.2s',
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Current Energy Status Recessed Card */}
        <div style={{
          background: 'rgba(5, 7, 15, 0.8)',
          border: '1px solid rgba(255, 140, 0, 0.2)',
          borderRadius: '18px', padding: '14px', marginBottom: '16px',
          textAlign: 'center', boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.5)',
        }}>
          <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 800, display: 'block', marginBottom: '4px' }}>
            {t.header.energy}
          </span>
          <div style={{ fontSize: '24px', fontWeight: 900, color: 'var(--accent-orange)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
            <Zap size={22} className="fill-orange-400 stroke-none animate-pulse" /> {currentEnergy} / {maxEnergy}
          </div>

          {/* Next Energy Countdown Timer */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', marginTop: '8px', fontSize: '11px', color: 'rgba(255,255,255,0.7)', fontWeight: 700 }}>
            {currentEnergy < maxEnergy && secondsLeft > 0 ? (
              <>
                <Clock size={12} style={{ color: 'var(--accent-cyan)' }} />
                <span>{t.header.rechargeIn} <strong style={{ color: 'var(--accent-cyan)', fontFamily: 'monospace' }}>{formatCountdown(secondsLeft)}</strong></span>
              </>
            ) : (
              <span style={{ color: '#4ade80', fontWeight: 800 }}>{t.header.energyFull}</span>
            )}
          </div>
        </div>

        {/* Options List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          
          {/* Option 1: Watch Ad (10/day limit) */}
            <button
              onClick={handleWatchAd}
              disabled={isAdLimitReached}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '14px 16px',
                background: isAdLimitReached ? 'rgba(255,255,255,0.02)' : 'rgba(255, 140, 0, 0.08)',
                border: isAdLimitReached ? '1px solid rgba(255,255,255,0.06)' : '1px solid rgba(255, 140, 0, 0.3)',
                borderRadius: '16px', cursor: isAdLimitReached ? 'not-allowed' : 'pointer',
                textAlign: 'left', opacity: isAdLimitReached ? 0.5 : 1,
                transition: 'all 0.2s',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                {isAdLimitReached ? <Lock size={18} style={{ color: '#f87171' }} /> : <Play size={18} style={{ color: 'var(--accent-orange)' }} />}
                <div>
                  <span style={{ fontSize: '12px', fontWeight: 800, color: '#fff', display: 'block' }}>
                    {t.header.watchAdBtn}
                  </span>
                  <span style={{ fontSize: '9px', color: isAdLimitReached ? '#f87171' : 'rgba(255,255,255,0.5)', display: 'block', marginTop: '2px' }}>
                    {isUnlimitedAds
                      ? '∞ Unbegrenzte Videos (VIP)'
                      : isAdLimitReached
                        ? t.header.adLimitReached
                        : `${remainingAds}/${dailyAdLimit} ${t.header.videosRemaining}`}
                  </span>
                </div>
              </div>
              <span style={{
                fontSize: '11px', fontWeight: 900, color: isAdLimitReached ? '#6b7280' : 'var(--accent-orange)',
                background: isAdLimitReached ? 'rgba(255,255,255,0.05)' : 'rgba(255, 140, 0, 0.15)',
                border: `1px solid ${isAdLimitReached ? 'rgba(255,255,255,0.1)' : 'rgba(255, 140, 0, 0.3)'}`,
                padding: '4px 10px', borderRadius: '9999px', flexShrink: 0,
              }}>
                +1 ⚡
              </span>
            </button>

            {/* Option 2: Buy in Shop */}
            {onOpenShop && (
              <button
                onClick={() => {
                  onClose();
                  onOpenShop();
                }}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '14px 16px',
                  background: 'rgba(0, 242, 254, 0.06)',
                  border: '1px solid rgba(0, 242, 254, 0.25)',
                  borderRadius: '16px', cursor: 'pointer',
                  textAlign: 'left', transition: 'all 0.2s',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <ShoppingBag size={18} style={{ color: 'var(--accent-cyan)' }} />
                  <div>
                    <span style={{ fontSize: '12px', fontWeight: 800, color: '#fff', display: 'block' }}>
                      {t.shop.title}
                    </span>
                    <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.5)', display: 'block', marginTop: '2px' }}>
                      {t.shop.subtitle}
                    </span>
                  </div>
                </div>
                <span style={{
                  fontSize: '11px', fontWeight: 900, color: 'var(--accent-cyan)',
                  background: 'rgba(0, 242, 254, 0.12)', border: '1px solid rgba(0, 242, 254, 0.3)',
                  padding: '4px 10px', borderRadius: '9999px', flexShrink: 0,
                }}>
                  {t.nav.shop} 🛒
                </span>
              </button>
            )}

            {/* Option 3: Invite Friends */}
            <button
              onClick={handleInviteFriend}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '14px 16px',
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '16px', cursor: 'pointer',
                textAlign: 'left', transition: 'all 0.2s',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Users size={18} style={{ color: '#a78bfa' }} />
                <div>
                  <span style={{ fontSize: '12px', fontWeight: 800, color: '#fff', display: 'block' }}>
                    {t.profile.referralsTitle}
                  </span>
                  <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.5)', display: 'block', marginTop: '2px' }}>
                    {copiedLink ? t.profile.linkCopied : t.profile.copyLink}
                  </span>
                </div>
              </div>
              <span style={{
                fontSize: '11px', fontWeight: 900, color: '#a78bfa',
                background: 'rgba(167, 139, 250, 0.12)', border: '1px solid rgba(167, 139, 250, 0.3)',
                padding: '4px 10px', borderRadius: '9999px', flexShrink: 0,
              }}>
                +5 ⚡
              </span>
            </button>

          </div>
      </div>

      {/* Real Fullscreen Video Ad Player (25-30s unskippable) */}
      <VideoAdPlayerModal
        isOpen={showVideoPlayer}
        onClose={() => setShowVideoPlayer(false)}
        onRewardGranted={() => {
          setShowVideoPlayer(false);
          onEnergyGranted(currentEnergy + 1);
          onClose();
        }}
        backendUrl={backendUrl}
        initData={initData}
        totalDurationSeconds={25}
      />
    </div>
  );
}
