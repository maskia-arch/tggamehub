import { useState, useEffect, useRef } from 'react';
import { Zap, ShieldCheck, CheckCircle2, X, Play, AlertCircle, RotateCcw } from 'lucide-react';
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

export function RewardedAdPlayerModal({
  isOpen,
  onClose,
  onRewardGranted,
  backendUrl,
  initData,
  dailyAdLimit = 10,
  dailyAdCount = 0,
}: RewardedAdPlayerModalProps) {
  const [currentSpot, setCurrentSpot] = useState<1 | 2>(1);
  const [spot1Seconds, setSpot1Seconds] = useState(15);
  const [spot2Seconds, setSpot2Seconds] = useState(15);
  const [isPaused, setIsPaused] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);

  const timerRef = useRef<any>(null);
  const hasClaimedRef = useRef<boolean>(false);

  // Reset and start flow when opened
  useEffect(() => {
    if (!isOpen) {
      if (timerRef.current) clearInterval(timerRef.current);
      setCurrentSpot(1);
      setSpot1Seconds(15);
      setSpot2Seconds(15);
      setIsPaused(false);
      setIsCompleted(false);
      setClaimError(null);
      hasClaimedRef.current = false;
      return;
    }

    sendServerLog('info', '🎬 Ad Player: Starte 30s Werbeziel (Spot 1/2 à 15s oder 1x 30s)');

    // 1. Initialize In-App Interstitial frequency settings
    showMonetagRewardedAd('inApp').catch(() => {});

    // 2. Trigger primary Rewarded Spot
    showMonetagRewardedAd('rewarded')
      .then(() => {
        // If a full 30s video was watched, complete the goal immediately!
        sendServerLog('info', '🎉 Monetag Rewarded Video vollständig abgespielt!');
      })
      .catch((e) => {
        console.warn('[AD PLAYER] Spot 1 note:', e);
      });

    startSpot1Timer();

    // Visibility listener: pause countdown if user switches apps, resume when returning
    const handleVisibility = () => {
      if (document.hidden) {
        setIsPaused(true);
        if (timerRef.current) clearInterval(timerRef.current);
        sendServerLog('info', '⏸️ Ad Player: Nutzer hat App minimiert (Pausiert)');
      } else {
        setIsPaused(false);
        sendServerLog('info', '▶️ Ad Player: Nutzer zurück in App (Fortgesetzt)');
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', handleVisibility);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', handleVisibility);
    };
  }, [isOpen]);

  const startSpot1Timer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setSpot1Seconds((prev) => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          transitionToSpot2();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const transitionToSpot2 = () => {
    setCurrentSpot(2);
    sendServerLog('info', '🎬 Ad Player: Spot 1 beendet ➔ Starte Spot 2 von 2 (15s)');

    // Trigger Spot 2 Pop / Interstitial format
    showMonetagRewardedAd('pop').catch(() => {
      showMonetagRewardedAd('rewarded').catch(() => {});
    });

    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setSpot2Seconds((p2) => {
        if (p2 <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          handleFinalClaim();
          return 0;
        }
        return p2 - 1;
      });
    }, 1000);
  };

  const handleFinalClaim = async () => {
    if (hasClaimedRef.current) return;
    hasClaimedRef.current = true;

    sendServerLog('info', '⚡ Ad Player: 30s Werbeziel erreicht. Verbucht Belohnung...');
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
        throw new Error(resData?.message || 'Serverfehler beim Claim.');
      }

      setIsCompleted(true);
      sendServerLog('info', '🎉 Ad Player: Belohnung erfolgreich gutgeschrieben!', { resData });
      
      const newEnergyVal = resData?.energy?.currentEnergy;
      onRewardGranted(newEnergyVal);

      setTimeout(() => {
        onClose();
      }, 1600);
    } catch (err: any) {
      console.error('[AD CLAIM FAILED]:', err);
      hasClaimedRef.current = false;
      sendServerLog('error', 'Ad Claim Failed', { error: err?.message });
      setClaimError(err?.message || 'Fehler beim Abgleich. Klicke auf Wiederholen.');
    }
  };

  if (!isOpen) return null;

  const currentSeconds = currentSpot === 1 ? spot1Seconds : spot2Seconds;
  const spot1Progress = Math.min(100, Math.max(0, ((15 - spot1Seconds) / 15) * 100));
  const spot2Progress = currentSpot === 1 ? 0 : Math.min(100, Math.max(0, ((15 - spot2Seconds) / 15) * 100));
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
      {/* Top Bar: Story Segmented Progress Bar & Close Button */}
      <div>
        {/* 2 Segments (15s + 15s = 30s Total Goal) */}
        <div style={{ display: 'flex', gap: '6px', width: '100%', height: '4px' }}>
          {/* Segment 1 */}
          <div style={{ flex: 1, background: 'rgba(255, 255, 255, 0.2)', borderRadius: '9999px', overflow: 'hidden' }}>
            <div
              style={{
                height: '100%',
                width: `${spot1Progress}%`,
                background: '#ff8c00',
                boxShadow: '0 0 8px #ff8c00',
                transition: 'width 0.95s linear',
              }}
            />
          </div>
          {/* Segment 2 */}
          <div style={{ flex: 1, background: 'rgba(255, 255, 255, 0.2)', borderRadius: '9999px', overflow: 'hidden' }}>
            <div
              style={{
                height: '100%',
                width: `${spot2Progress}%`,
                background: '#ff8c00',
                boxShadow: '0 0 8px #ff8c00',
                transition: 'width 0.95s linear',
              }}
            />
          </div>
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
                SPOT {currentSpot} VON 2
              </span>
            </div>
            <span style={{ fontSize: '12px', fontWeight: 700, color: 'rgba(255,255,255,0.85)' }}>
              {isCompleted ? 'Belohnung bereit!' : `Noch ${currentSeconds}s für +1 Energie`}
            </span>
          </div>

          {/* Bulletproof Cancel / Exit Button */}
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
        ) : isPaused ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px' }}>
            <AlertCircle size={44} style={{ color: '#fbbf24' }} />
            <h3 style={{ fontSize: '17px', fontWeight: 800, color: '#fff', margin: 0 }}>
              Spot pausiert
            </h3>
            <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.7)', maxWidth: '260px', margin: 0 }}>
              Bitte schaue die restlichen {currentSeconds} Sekunden an, um deine Belohnung zu erhalten.
            </p>
            <button
              onClick={() => {
                setIsPaused(false);
                if (currentSpot === 1) startSpot1Timer();
                else transitionToSpot2();
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                background: '#ff8c00',
                border: 'none',
                borderRadius: '12px',
                padding: '10px 20px',
                color: '#fff',
                fontWeight: 900,
                fontSize: '13px',
                cursor: 'pointer',
                marginTop: '8px',
              }}
            >
              <Play size={16} /> Weiter ansehen
            </button>
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
                Werbespot {currentSpot} von 2
              </span>
              <h2 style={{ fontSize: '20px', fontWeight: 900, color: '#fff', marginTop: '4px', marginBottom: '8px' }}>
                Monetag Partner Netzwerk
              </h2>
              <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)', maxWidth: '270px', margin: '0 auto', lineHeight: 1.5 }}>
                {currentSpot === 1
                  ? 'Spot 1 läuft (15s). Bleibe in der App für den automatischen Übergang zu Spot 2.'
                  : 'Spot 2 läuft (15s). Gleich hast du deine Gratis-Energie verdient!'}
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
                00:{currentSeconds.toString().padStart(2, '0')}
              </span>
            </div>

            {/* Re-trigger ad if overlay didn't pop */}
            <button
              onClick={() => {
                showMonetagRewardedAd(currentSpot === 1 ? 'rewarded' : 'pop').catch(() => {});
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
          ⚡ 30s Werbeziel = +1 Energie
        </span>
        <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)', fontWeight: 600 }}>
          {remainingVideos}/{dailyAdLimit} heute verfügbar
        </span>
      </div>
    </div>
  );
}
