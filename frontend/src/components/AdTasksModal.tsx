import { useState, useEffect, useRef } from 'react';
import { Zap, CheckCircle2, Play, X, Clock, RotateCcw } from 'lucide-react';
import { showMonetagRewardedAd } from '../services/monetagService';
import { sendServerLog } from '../services/telemetry';

interface AdTasksModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRewardGranted: (newEnergyVal?: number) => void;
  backendUrl: string;
  initData: string;
  dailyAdLimit?: number;
  dailyAdCount?: number;
}

export function AdTasksModal({
  isOpen,
  onClose,
  onRewardGranted,
  backendUrl,
  initData,
  dailyAdLimit = 10,
  dailyAdCount = 0,
}: AdTasksModalProps) {
  const [spot1Status, setSpot1Status] = useState<'PENDING' | 'WATCHING' | 'DONE'>('PENDING');
  const [spot2Status, setSpot2Status] = useState<'LOCKED' | 'PENDING' | 'WATCHING' | 'DONE'>('LOCKED');
  
  const [spot1Seconds, setSpot1Seconds] = useState(15);
  const [spot2Seconds, setSpot2Seconds] = useState(15);
  
  const [isCompleted, setIsCompleted] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);

  const spot1StartTimeRef = useRef<number>(0);
  const spot2StartTimeRef = useRef<number>(0);
  const timer1Ref = useRef<any>(null);
  const timer2Ref = useRef<any>(null);
  const hasClaimedRef = useRef<boolean>(false);

  // Reset state when modal opens
  useEffect(() => {
    if (!isOpen) {
      if (timer1Ref.current) clearInterval(timer1Ref.current);
      if (timer2Ref.current) clearInterval(timer2Ref.current);
      setSpot1Status('PENDING');
      setSpot2Status('LOCKED');
      setSpot1Seconds(15);
      setSpot2Seconds(15);
      setIsCompleted(false);
      setClaimError(null);
      hasClaimedRef.current = false;
      spot1StartTimeRef.current = 0;
      spot2StartTimeRef.current = 0;
      return;
    }

    sendServerLog('info', '📋 Ad Tasks Modal geöffnet: 2 Spots Aufgabe gestartet');

    // Visibility / focus listener to sync wall-clock timers if user leaves MiniApp
    const handleResume = () => {
      // Sync Spot 1
      if (spot1StartTimeRef.current > 0 && spot1Status === 'WATCHING') {
        const elapsed = Math.floor((Date.now() - spot1StartTimeRef.current) / 1000);
        const remaining = Math.max(0, 15 - elapsed);
        setSpot1Seconds(remaining);
        if (remaining <= 0) {
          if (timer1Ref.current) clearInterval(timer1Ref.current);
          completeSpot1();
        }
      }
      // Sync Spot 2
      if (spot2StartTimeRef.current > 0 && spot2Status === 'WATCHING') {
        const elapsed = Math.floor((Date.now() - spot2StartTimeRef.current) / 1000);
        const remaining = Math.max(0, 15 - elapsed);
        setSpot2Seconds(remaining);
        if (remaining <= 0 && !hasClaimedRef.current) {
          if (timer2Ref.current) clearInterval(timer2Ref.current);
          completeSpot2();
        }
      }
    };

    document.addEventListener('visibilitychange', handleResume);
    window.addEventListener('focus', handleResume);

    return () => {
      if (timer1Ref.current) clearInterval(timer1Ref.current);
      if (timer2Ref.current) clearInterval(timer2Ref.current);
      document.removeEventListener('visibilitychange', handleResume);
      window.removeEventListener('focus', handleResume);
    };
  }, [isOpen, spot1Status, spot2Status]);

  // Start Spot 1
  const startSpot1 = () => {
    setSpot1Status('WATCHING');
    setSpot1Seconds(15);
    spot1StartTimeRef.current = Date.now();
    sendServerLog('info', '🎬 Starte Werbespot 1 (15s)');

    showMonetagRewardedAd('rewarded').catch((e) => {
      console.warn('[AD TASK] Spot 1 note:', e);
    });

    if (timer1Ref.current) clearInterval(timer1Ref.current);
    timer1Ref.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - spot1StartTimeRef.current) / 1000);
      const remaining = Math.max(0, 15 - elapsed);
      setSpot1Seconds(remaining);
      if (remaining <= 0) {
        if (timer1Ref.current) clearInterval(timer1Ref.current);
        completeSpot1();
      }
    }, 1000);
  };

  const completeSpot1 = () => {
    setSpot1Status('DONE');
    setSpot2Status('PENDING');
    sendServerLog('info', '✅ Werbespot 1 abgeschlossen (1/2 fertig)');
  };

  // Start Spot 2
  const startSpot2 = () => {
    setSpot2Status('WATCHING');
    setSpot2Seconds(15);
    spot2StartTimeRef.current = Date.now();
    sendServerLog('info', '🎬 Starte Werbespot 2 (15s)');

    showMonetagRewardedAd('pop').catch(() => {
      showMonetagRewardedAd('rewarded').catch(() => {});
    });

    if (timer2Ref.current) clearInterval(timer2Ref.current);
    timer2Ref.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - spot2StartTimeRef.current) / 1000);
      const remaining = Math.max(0, 15 - elapsed);
      setSpot2Seconds(remaining);
      if (remaining <= 0) {
        if (timer2Ref.current) clearInterval(timer2Ref.current);
        completeSpot2();
      }
    }, 1000);
  };

  const completeSpot2 = () => {
    setSpot2Status('DONE');
    sendServerLog('info', '✅ Werbespot 2 abgeschlossen (2/2 fertig). Führe Energie-Claim aus...');
    handleClaimReward();
  };

  const handleClaimReward = async () => {
    if (hasClaimedRef.current) return;
    hasClaimedRef.current = true;
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
      sendServerLog('info', '🎉 +1 Energie erfolgreich verbucht!', { resData });
      
      const newEnergyVal = resData?.energy?.currentEnergy;
      onRewardGranted(newEnergyVal);

      setTimeout(() => {
        onClose();
      }, 1600);
    } catch (err: any) {
      console.error('[AD TASK CLAIM ERROR]:', err);
      hasClaimedRef.current = false;
      sendServerLog('error', 'Claim Fehler', { error: err?.message });
      setClaimError(err?.message || 'Fehler bei der Energie-Gutschrift. Klicke auf Wiederholen.');
    }
  };

  if (!isOpen) return null;

  const completedCount = (spot1Status === 'DONE' ? 1 : 0) + (spot2Status === 'DONE' ? 1 : 0);
  const remainingDailyVideos = Math.max(0, dailyAdLimit - dailyAdCount);

  return (
    <div
      style={{
        position: 'fixed',
        top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'rgba(5, 7, 15, 0.9)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        zIndex: 2000000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        animation: 'fadeIn 0.2s ease-out forwards',
        userSelect: 'none',
      }}
    >
      <div
        style={{
          background: '#0c1020',
          border: '1px solid rgba(255, 140, 0, 0.3)',
          boxShadow: '0 0 50px rgba(255, 140, 0, 0.2), 0 20px 40px rgba(0,0,0,0.8)',
          borderRadius: '24px',
          padding: '22px',
          width: '100%',
          maxWidth: '360px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'stretch',
          animation: 'scaleUp 0.25s cubic-bezier(0.34, 1.56, 0.64, 1) forwards',
          position: 'relative',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div
              style={{
                width: '32px', height: '32px', borderRadius: '10px',
                background: 'rgba(255, 140, 0, 0.15)', border: '1px solid rgba(255, 140, 0, 0.4)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <Zap size={18} style={{ color: '#ff8c00' }} className="animate-pulse" />
            </div>
            <div>
              <span style={{ fontSize: '13px', fontWeight: 900, color: '#fff', display: 'block' }}>
                Energie-Aufgabe
              </span>
              <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)', display: 'block' }}>
                Schaue 2 kurze Spots für +1 ⚡
              </span>
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              background: 'rgba(255, 255, 255, 0.06)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              borderRadius: '50%',
              width: '30px', height: '30px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'rgba(255, 255, 255, 0.6)', cursor: 'pointer',
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Overall Progress Badge */}
        <div
          style={{
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '14px',
            padding: '12px 14px',
            marginBottom: '16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.6)', fontWeight: 700, display: 'block' }}>
              Fortschritt:
            </span>
            <span style={{ fontSize: '14px', fontWeight: 900, color: completedCount === 2 ? '#34d399' : '#ff8c00' }}>
              {completedCount} von 2 Werbespots
            </span>
          </div>

          <span
            style={{
              fontSize: '11px',
              fontWeight: 900,
              color: '#00f2fe',
              background: 'rgba(0, 242, 254, 0.1)',
              border: '1px solid rgba(0, 242, 254, 0.3)',
              borderRadius: '9999px',
              padding: '4px 10px',
            }}
          >
            Belohnung: +1 ⚡
          </span>
        </div>

        {/* Task 1: Werbespot 1 */}
        <div
          style={{
            background: spot1Status === 'DONE' ? 'rgba(52, 211, 153, 0.06)' : 'rgba(255, 140, 0, 0.05)',
            border: `1px solid ${spot1Status === 'DONE' ? 'rgba(52, 211, 153, 0.3)' : 'rgba(255, 140, 0, 0.25)'}`,
            borderRadius: '16px',
            padding: '14px',
            marginBottom: '10px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {spot1Status === 'DONE' ? (
              <CheckCircle2 size={22} style={{ color: '#34d399' }} />
            ) : spot1Status === 'WATCHING' ? (
              <Clock size={22} style={{ color: '#ff8c00' }} className="animate-spin" />
            ) : (
              <div
                style={{
                  width: '22px', height: '22px', borderRadius: '50%',
                  border: '2px solid rgba(255, 140, 0, 0.5)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '11px', fontWeight: 900, color: '#ff8c00',
                }}
              >
                1
              </div>
            )}
            <div>
              <span style={{ fontSize: '12px', fontWeight: 800, color: '#fff', display: 'block' }}>
                Werbespot 1
              </span>
              <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)', display: 'block' }}>
                {spot1Status === 'DONE'
                  ? 'Abgeschlossen ✅'
                  : spot1Status === 'WATCHING'
                    ? `Läuft... noch ${spot1Seconds}s`
                    : '15 Sekunden ansehen'}
              </span>
            </div>
          </div>

          {spot1Status === 'PENDING' && (
            <button
              onClick={startSpot1}
              style={{
                background: 'linear-gradient(135deg, #ff8c00 0%, #ff5500 100%)',
                border: 'none',
                borderRadius: '10px',
                padding: '8px 14px',
                color: '#fff',
                fontWeight: 900,
                fontSize: '11px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                boxShadow: '0 0 12px rgba(255, 140, 0, 0.3)',
              }}
            >
              <Play size={12} className="fill-white stroke-none" /> Start
            </button>
          )}

          {spot1Status === 'WATCHING' && (
            <span
              style={{
                fontSize: '12px',
                fontWeight: 900,
                color: '#ff8c00',
                fontFamily: 'monospace',
                background: 'rgba(255, 140, 0, 0.15)',
                padding: '4px 8px',
                borderRadius: '8px',
              }}
            >
              00:{spot1Seconds.toString().padStart(2, '0')}
            </span>
          )}

          {spot1Status === 'DONE' && (
            <span style={{ fontSize: '11px', fontWeight: 900, color: '#34d399' }}>
              Fertig
            </span>
          )}
        </div>

        {/* Task 2: Werbespot 2 */}
        <div
          style={{
            background: spot2Status === 'DONE'
              ? 'rgba(52, 211, 153, 0.06)'
              : spot2Status === 'LOCKED'
                ? 'rgba(255, 255, 255, 0.02)'
                : 'rgba(255, 140, 0, 0.05)',
            border: `1px solid ${
              spot2Status === 'DONE'
                ? 'rgba(52, 211, 153, 0.3)'
                : spot2Status === 'LOCKED'
                  ? 'rgba(255, 255, 255, 0.06)'
                  : 'rgba(255, 140, 0, 0.25)'
            }`,
            borderRadius: '16px',
            padding: '14px',
            marginBottom: '16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            opacity: spot2Status === 'LOCKED' ? 0.5 : 1,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {spot2Status === 'DONE' ? (
              <CheckCircle2 size={22} style={{ color: '#34d399' }} />
            ) : spot2Status === 'WATCHING' ? (
              <Clock size={22} style={{ color: '#00f2fe' }} className="animate-spin" />
            ) : (
              <div
                style={{
                  width: '22px', height: '22px', borderRadius: '50%',
                  border: `2px solid ${spot2Status === 'LOCKED' ? 'rgba(255,255,255,0.2)' : 'rgba(0, 242, 254, 0.5)'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '11px', fontWeight: 900, color: spot2Status === 'LOCKED' ? 'rgba(255,255,255,0.3)' : '#00f2fe',
                }}
              >
                2
              </div>
            )}
            <div>
              <span style={{ fontSize: '12px', fontWeight: 800, color: '#fff', display: 'block' }}>
                Werbespot 2
              </span>
              <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)', display: 'block' }}>
                {spot2Status === 'DONE'
                  ? 'Abgeschlossen ✅'
                  : spot2Status === 'WATCHING'
                    ? `Läuft... noch ${spot2Seconds}s`
                    : spot2Status === 'LOCKED'
                      ? 'Warte auf Spot 1...'
                      : '15 Sekunden ansehen'}
              </span>
            </div>
          </div>

          {spot2Status === 'PENDING' && (
            <button
              onClick={startSpot2}
              style={{
                background: 'linear-gradient(135deg, #00f2fe 0%, #4facfe 100%)',
                border: 'none',
                borderRadius: '10px',
                padding: '8px 14px',
                color: '#000',
                fontWeight: 900,
                fontSize: '11px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                boxShadow: '0 0 12px rgba(0, 242, 254, 0.3)',
              }}
            >
              <Play size={12} className="fill-black stroke-none" /> Start
            </button>
          )}

          {spot2Status === 'WATCHING' && (
            <span
              style={{
                fontSize: '12px',
                fontWeight: 900,
                color: '#00f2fe',
                fontFamily: 'monospace',
                background: 'rgba(0, 242, 254, 0.15)',
                padding: '4px 8px',
                borderRadius: '8px',
              }}
            >
              00:{spot2Seconds.toString().padStart(2, '0')}
            </span>
          )}

          {spot2Status === 'DONE' && (
            <span style={{ fontSize: '11px', fontWeight: 900, color: '#34d399' }}>
              Fertig
            </span>
          )}
        </div>

        {/* Claim Status / Celebration Banner */}
        {isCompleted && (
          <div
            style={{
              background: 'rgba(52, 211, 153, 0.15)',
              border: '1px solid rgba(52, 211, 153, 0.4)',
              borderRadius: '14px',
              padding: '12px',
              textAlign: 'center',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              animation: 'bounce 0.4s ease-out',
            }}
          >
            <CheckCircle2 size={20} style={{ color: '#34d399' }} />
            <span style={{ fontSize: '13px', fontWeight: 900, color: '#34d399' }}>
              🎉 +1 Energie erfolgreich gutgeschrieben!
            </span>
          </div>
        )}

        {claimError && (
          <div style={{ marginTop: '8px', textAlign: 'center' }}>
            <span style={{ fontSize: '11px', color: '#f87171', fontWeight: 700, display: 'block', marginBottom: '6px' }}>
              {claimError}
            </span>
            <button
              onClick={handleClaimReward}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                background: 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.15)',
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

        {/* Footer info */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '14px' }}>
          <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.35)', fontWeight: 600 }}>
            {remainingDailyVideos}/{dailyAdLimit} Heute verfügbar
          </span>
          <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.35)', fontWeight: 600 }}>
            Monetag Ads
          </span>
        </div>
      </div>
    </div>
  );
}
