import { useState, useEffect, useRef } from 'react';
import { Zap, ShieldCheck, CheckCircle2 } from 'lucide-react';
import { showMonetagRewardedAd } from '../services/monetagService';
import { sendServerLog } from '../services/telemetry';

interface StoryRewardedAdModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRewardGranted: () => void;
  backendUrl: string;
  initData: string;
  dailyAdLimit?: number;
  dailyAdCount?: number;
}

export function StoryRewardedAdModal({
  isOpen,
  onClose,
  onRewardGranted,
  backendUrl,
  initData,
  dailyAdLimit = 10,
  dailyAdCount = 0,
}: StoryRewardedAdModalProps) {
  const [currentSpot, setCurrentSpot] = useState<1 | 2>(1);
  const [spot1Seconds, setSpot1Seconds] = useState(15);
  const [spot2Seconds, setSpot2Seconds] = useState(15);
  const [isCompleted, setIsCompleted] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const timerRef = useRef<any>(null);

  // Initialize and start Story Ad flow
  useEffect(() => {
    if (!isOpen) {
      setCurrentSpot(1);
      setSpot1Seconds(15);
      setSpot2Seconds(15);
      setIsCompleted(false);
      setErrorMsg(null);
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    sendServerLog('info', '🎬 Story Ad Player: Spot 1/2 gestartet (15s Countdown)');

    // Trigger Monetag SDK for Spot 1
    showMonetagRewardedAd().catch((e) => {
      console.warn('[STORY AD]: Monetag spot note:', e);
      sendServerLog('warn', '⚠️ Monetag Spot 1 Trigger Note', { error: e?.message });
    });

    // Start 15s countdown for Spot 1
    timerRef.current = setInterval(() => {
      setSpot1Seconds((prev) => {
        if (prev <= 1) {
          // Spot 1 finished! Transition to Spot 2
          setCurrentSpot(2);
          sendServerLog('info', '🎬 Story Ad Player: Spot 1 abgeschlossen ➔ Spot 2/2 gestartet (15s Countdown)');
          if (timerRef.current) clearInterval(timerRef.current);
          
          // Trigger Monetag SDK for Spot 2 (rotation)
          showMonetagRewardedAd().catch((e) => {
            console.warn('[STORY AD]: Monetag spot 2 note:', e);
            sendServerLog('warn', '⚠️ Monetag Spot 2 Trigger Note', { error: e?.message });
          });

          // Start 15s countdown for Spot 2
          timerRef.current = setInterval(() => {
            setSpot2Seconds((p2) => {
              if (p2 <= 1) {
                // Spot 2 finished! Both 15s spots completed (30s total)
                if (timerRef.current) clearInterval(timerRef.current);
                sendServerLog('info', '⚡ Story Ad Player: Beide 15s Spots abgeschlossen (30s). Claiming +1 Energie...');
                triggerRewardClaim();
                return 0;
              }
              return p2 - 1;
            });
          }, 1000);

          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isOpen]);

  const triggerRewardClaim = async () => {
    setErrorMsg(null);

    try {
      const response = await fetch(`${backendUrl}/api/user/energy/ad`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${initData}`,
          'Content-Type': 'application/json',
        },
      });

      let resData: any = null;
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        resData = await response.json();
      } else {
        resData = { success: response.ok };
      }

      if (!response.ok) {
        throw new Error(resData?.message || 'Fehler beim Server-Abgleich.');
      }

      sendServerLog('info', '🎉 Story Ad Player: +1 Energie erfolgreich verbucht!', { resData });
      setIsCompleted(true);
      onRewardGranted();

      setTimeout(() => {
        onClose();
      }, 1600);
    } catch (err: any) {
      console.error('[STORY AD CLAIM ERROR]:', err);
      sendServerLog('error', '❌ Story Ad Player: Claim-Fehler', { error: err?.message });
      setErrorMsg('Fehler bei der Energie-Gutschrift. Bitte kurz warten...');
      setTimeout(() => {
        onRewardGranted();
        onClose();
      }, 2000);
    }
  };

  if (!isOpen) return null;

  const currentSeconds = currentSpot === 1 ? spot1Seconds : spot2Seconds;
  const spot1Progress = Math.min(100, Math.max(0, ((15 - spot1Seconds) / 15) * 100));
  const spot2Progress = currentSpot === 1 ? 0 : Math.min(100, Math.max(0, ((15 - spot2Seconds) / 15) * 100));

  const remainingDailyVideos = Math.max(0, dailyAdLimit - (dailyAdCount || 0));

  return (
    <div
      style={{
        position: 'fixed',
        top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: '#070913',
        zIndex: 2000000,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'stretch',
        justifyContent: 'space-between',
        padding: '16px 16px 24px 16px',
        animation: 'fadeIn 0.2s ease-out forwards',
        userSelect: 'none',
      }}
    >
      {/* Top Header: Instagram/Telegram Story Progress Bar */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {/* Story Segment Bars */}
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

        {/* Story Header Info */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px' }}>
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
            <span style={{ fontSize: '11px', fontWeight: 700, color: 'rgba(255,255,255,0.75)' }}>
              {isCompleted ? 'Belohnung bereit!' : `Noch ${currentSeconds}s bis zur Energie`}
            </span>
          </div>

          <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)', fontWeight: 600 }}>
            {remainingDailyVideos}/{dailyAdLimit} verbleibend
          </span>
        </div>
      </div>

      {/* Main Center Stage: Monetag Sponsored Content Area */}
      <div
        style={{
          flex: 1,
          margin: '20px 0',
          borderRadius: '24px',
          border: '1px solid rgba(255, 140, 0, 0.25)',
          background: 'linear-gradient(180deg, rgba(16, 20, 36, 0.95) 0%, rgba(8, 10, 20, 0.98) 100%)',
          boxShadow: '0 0 40px rgba(0, 0, 0, 0.8), inset 0 0 20px rgba(255, 140, 0, 0.05)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
          textAlign: 'center',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Ambient Glow */}
        <div
          style={{
            position: 'absolute',
            top: '20%',
            left: '50%',
            transform: 'translateX(-50%)',
            width: '200px',
            height: '200px',
            background: 'radial-gradient(circle, rgba(255, 140, 0, 0.15) 0%, transparent 70%)',
            pointerEvents: 'none',
          }}
        />

        {isCompleted ? (
          <div style={{ animation: 'scaleUp 0.3s ease-out forwards', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
            <CheckCircle2 size={56} style={{ color: '#34d399' }} className="animate-bounce" />
            <h3 style={{ fontSize: '18px', fontWeight: 900, color: '#fff', margin: 0 }}>
              🎉 +1 Energie gutgeschrieben!
            </h3>
            <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)', margin: 0 }}>
              Viel Spaß beim Spielen auf CoinCade!
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px' }}>
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
                boxShadow: '0 0 20px rgba(255, 140, 0, 0.2)',
              }}
            >
              <Zap size={32} style={{ color: '#ff8c00' }} className="animate-pulse" />
            </div>

            <div>
              <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 800 }}>
                Gesponserter Werbespot ({currentSpot}/2)
              </span>
              <h2 style={{ fontSize: '20px', fontWeight: 900, color: '#fff', marginTop: '4px', marginBottom: '8px' }}>
                Monetag Partner Netzwerk
              </h2>
              <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)', maxWidth: '260px', margin: '0 auto', lineHeight: 1.5 }}>
                {currentSpot === 1
                  ? 'Werbespot 1 von 2 läuft. Bleibe in der App, um die Belohnung freizuschalten.'
                  : 'Letzter Werbespot läuft! Noch wenige Sekunden bis zu deiner Gratis-Energie.'}
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
                marginTop: '10px',
              }}
            >
              <ShieldCheck size={16} style={{ color: '#00f2fe' }} />
              <span style={{ fontSize: '13px', fontWeight: 900, color: '#00f2fe', fontFamily: 'monospace' }}>
                00:{currentSeconds.toString().padStart(2, '0')}
              </span>
            </div>
          </div>
        )}

        {errorMsg && (
          <div style={{ marginTop: '14px', fontSize: '11px', color: '#f87171', fontWeight: 700 }}>
            {errorMsg}
          </div>
        )}
      </div>

      {/* Bottom Status Bar */}
      <div style={{ textAlign: 'center' }}>
        <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.35)', fontWeight: 600 }}>
          ⚡ 2 Spots à 15s = +1 Energie • Ads by Monetag
        </span>
      </div>
    </div>
  );
}
