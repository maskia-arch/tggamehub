import { useState, useEffect, useRef } from 'react';
import { Zap, ShieldCheck, CheckCircle2, X, RotateCcw } from 'lucide-react';
import { showMonetagRewardedAd } from '../services/monetagService';
import { sendServerLog } from '../services/telemetry';

interface RewardedAdPlayerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRewardGranted: (newEnergyVal?: number) => void;
  backendUrl: string;
  initData: string;
  dailyAdLimit?: number;
  dailyAdCount?: number;
}

const TOTAL_AD_DURATION_SECONDS = 30;

export function RewardedAdPlayerModal({
  isOpen,
  onClose,
  onRewardGranted,
  backendUrl,
  initData,
  dailyAdLimit = 10,
  dailyAdCount = 0,
}: RewardedAdPlayerModalProps) {
  const [secondsLeft, setSecondsLeft] = useState(TOTAL_AD_DURATION_SECONDS);
  const [isCompleted, setIsCompleted] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);

  const timerRef = useRef<any>(null);
  const startTimeRef = useRef<number>(0);
  const hasClaimedRef = useRef<boolean>(false);

  // Sync remaining seconds based on real wall-clock time
  const syncTimer = () => {
    if (!startTimeRef.current || hasClaimedRef.current) return;
    const elapsedSeconds = Math.floor((Date.now() - startTimeRef.current) / 1000);
    const remaining = Math.max(0, TOTAL_AD_DURATION_SECONDS - elapsedSeconds);
    setSecondsLeft(remaining);

    if (remaining <= 0 && !hasClaimedRef.current) {
      if (timerRef.current) clearInterval(timerRef.current);
      handleFinalClaim();
    }
  };

  // Start 30s wall-clock timer when modal opens
  useEffect(() => {
    if (!isOpen) {
      if (timerRef.current) clearInterval(timerRef.current);
      setSecondsLeft(TOTAL_AD_DURATION_SECONDS);
      setIsCompleted(false);
      setClaimError(null);
      hasClaimedRef.current = false;
      startTimeRef.current = 0;
      return;
    }

    startTimeRef.current = Date.now();
    hasClaimedRef.current = false;
    sendServerLog('info', '🎬 Ad Player: Starte 30s Werbespot (Hintergrund-Timer aktiv)');

    // Trigger Monetag Rewarded Interstitial
    showMonetagRewardedAd('rewarded').catch((e) => {
      console.warn('[AD PLAYER] Spot note:', e);
    });

    // 1-second interval checking actual elapsed wall-clock time
    timerRef.current = setInterval(() => {
      syncTimer();
    }, 1000);

    // Wall-clock catch-up on visibility change / window focus when user returns
    const handleResume = () => {
      syncTimer();
      sendServerLog('info', '🔄 Ad Player: Fenster re-fokussiert, Timer synchronisiert');
    };

    document.addEventListener('visibilitychange', handleResume);
    window.addEventListener('focus', handleResume);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      document.removeEventListener('visibilitychange', handleResume);
      window.removeEventListener('focus', handleResume);
    };
  }, [isOpen]);

  const handleFinalClaim = async () => {
    if (hasClaimedRef.current) return;
    hasClaimedRef.current = true;

    sendServerLog('info', '⚡ Ad Player: 30s vollendet. Sende Energie-Claim an Server...');
    setClaimError(null);

    try {
      const response = await fetch(`${backendUrl}/api/user/energy/ad`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${initData}`,
          'Content-Type': 'application/json',
        },
      });

      let resData: any = null;
      try {
        resData = await response.json();
      } catch (e) {
        resData = { success: response.ok };
      }

      if (!response.ok) {
        throw new Error(resData?.message || 'Serverfehler beim Energie-Claim.');
      }

      setIsCompleted(true);
      sendServerLog('info', '🎉 Ad Player: +1 Energie erfolgreich verbucht!', { resData });
      
      const newEnergyVal = resData?.energy?.currentEnergy;
      onRewardGranted(newEnergyVal);

      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err: any) {
      console.error('[AD CLAIM FAILED]:', err);
      hasClaimedRef.current = false;
      sendServerLog('error', 'Ad Claim Failed', { error: err?.message });
      setClaimError(err?.message || 'Fehler beim Abgleich. Klicke auf Wiederholen.');
    }
  };

  if (!isOpen) return null;

  const progressPercent = Math.min(100, Math.max(0, ((TOTAL_AD_DURATION_SECONDS - secondsLeft) / TOTAL_AD_DURATION_SECONDS) * 100));
  const remainingVideos = Math.max(0, dailyAdLimit - dailyAdCount);

  return (
    <div
      style={{
        position: 'fixed',
        top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: '#070914',
        zIndex: 3000000,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '16px 16px 24px 16px',
        animation: 'fadeIn 0.2s ease-out forwards',
        userSelect: 'none',
      }}
    >
      {/* Top Bar: Story Progress Bar & Cancel Button */}
      <div>
        {/* Continuous 30s Story Segment */}
        <div style={{ width: '100%', height: '5px', background: 'rgba(255, 255, 255, 0.15)', borderRadius: '9999px', overflow: 'hidden' }}>
          <div
            style={{
              height: '100%',
              width: `${progressPercent}%`,
              background: 'linear-gradient(90deg, #ff8c00 0%, #00f2fe 100%)',
              boxShadow: '0 0 10px rgba(0, 242, 254, 0.5)',
              transition: 'width 0.95s linear',
            }}
          />
        </div>

        {/* Top Controls */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div
              style={{
                background: 'rgba(255, 140, 0, 0.15)',
                border: '1px solid rgba(255, 140, 0, 0.4)',
                borderRadius: '8px',
                padding: '4px 8px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <Zap size={14} style={{ color: '#ff8c00' }} className="animate-pulse" />
              <span style={{ fontSize: '11px', fontWeight: 900, color: '#ff8c00', letterSpacing: '0.04em' }}>
                30S SPOT
              </span>
            </div>
            <span style={{ fontSize: '12px', fontWeight: 700, color: 'rgba(255,255,255,0.85)' }}>
              {isCompleted ? 'Belohnung bereit!' : `Noch ${secondsLeft}s für +1 Energie`}
            </span>
          </div>

          {/* Cancel / Exit Button */}
          <button
            onClick={onClose}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              background: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              borderRadius: '9999px',
              padding: '6px 12px',
              color: 'rgba(255,255,255,0.7)',
              fontSize: '11px',
              fontWeight: 800,
              cursor: 'pointer',
            }}
          >
            <X size={14} /> Abbrechen
          </button>
        </div>
      </div>

      {/* Center Display Card */}
      <div
        style={{
          flex: 1,
          margin: '24px 0',
          borderRadius: '24px',
          border: '1px solid rgba(255, 140, 0, 0.25)',
          background: 'linear-gradient(180deg, rgba(16, 20, 36, 0.95) 0%, rgba(8, 10, 20, 0.98) 100%)',
          boxShadow: '0 0 40px rgba(0, 0, 0, 0.8)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
          textAlign: 'center',
          position: 'relative',
        }}
      >
        {isCompleted ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
            <CheckCircle2 size={56} style={{ color: '#34d399' }} className="animate-bounce" />
            <h3 style={{ fontSize: '20px', fontWeight: 900, color: '#fff', margin: 0 }}>
              🎉 +1 Energie erhalten!
            </h3>
            <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)', margin: 0 }}>
              Dein Energiespeicher wurde erfolgreich aufgeladen.
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
            <div
              style={{
                width: '64px',
                height: '64px',
                borderRadius: '20px',
                background: 'rgba(255, 140, 0, 0.12)',
                border: '1px solid rgba(255, 140, 0, 0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Zap size={32} style={{ color: '#ff8c00' }} className="animate-pulse" />
            </div>

            <div>
              <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 800 }}>
                Gesponserter Werbespot
              </span>
              <h2 style={{ fontSize: '20px', fontWeight: 900, color: '#fff', marginTop: '4px', marginBottom: '8px' }}>
                Monetag Partner Netzwerk
              </h2>
              <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)', maxWidth: '270px', margin: '0 auto', lineHeight: 1.5 }}>
                Werbespot läuft. Der Timer zählt auch im Hintergrund zuverlässig weiter.
              </p>
            </div>

            {/* Countdown Badge */}
            <div
              style={{
                background: 'rgba(0, 242, 254, 0.08)',
                border: '1px solid rgba(0, 242, 254, 0.3)',
                borderRadius: '9999px',
                padding: '6px 16px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <ShieldCheck size={16} style={{ color: '#00f2fe' }} />
              <span style={{ fontSize: '14px', fontWeight: 900, color: '#00f2fe', fontFamily: 'monospace' }}>
                00:{secondsLeft.toString().padStart(2, '0')}
              </span>
            </div>

            {/* Re-trigger ad if overlay didn't pop */}
            <button
              onClick={() => {
                showMonetagRewardedAd('rewarded').catch(() => {});
              }}
              style={{
                background: 'none',
                border: 'none',
                color: 'rgba(255,255,255,0.4)',
                fontSize: '10px',
                cursor: 'pointer',
                textDecoration: 'underline',
                marginTop: '4px',
              }}
            >
              Spot nicht sichtbar? Hier klicken zum Wiederholen
            </button>
          </div>
        )}

        {/* Claim Error with Retry */}
        {claimError && (
          <div style={{ marginTop: '16px', textAlign: 'center' }}>
            <span style={{ fontSize: '11px', color: '#f87171', fontWeight: 700, display: 'block', marginBottom: '8px' }}>
              {claimError}
            </span>
            <button
              onClick={handleFinalClaim}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                background: 'rgba(255,255,255,0.1)',
                border: '1px solid rgba(255,255,255,0.2)',
                borderRadius: '8px',
                padding: '6px 12px',
                color: '#fff',
                fontSize: '11px',
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              <RotateCcw size={12} /> Belohnung erneut beanspruchen
            </button>
          </div>
        )}
      </div>

      {/* Footer Info */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 4px' }}>
        <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)', fontWeight: 600 }}>
          ⚡ 30s Werbespot = +1 Energie
        </span>
        <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)', fontWeight: 600 }}>
          {remainingVideos}/{dailyAdLimit} heute verfügbar
        </span>
      </div>
    </div>
  );
}
