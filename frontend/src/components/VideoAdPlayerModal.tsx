import { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { Volume2, VolumeX, CheckCircle, Sparkles, ExternalLink, ShieldCheck, Zap } from 'lucide-react';

interface VideoAdPlayerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRewardGranted: () => void;
  backendUrl: string;
  initData: string;
  totalDurationSeconds?: number;
}

// Commercial Video Spots Playlist (Chains spots to guarantee 25-30 seconds of video ad playback)
const AD_SPOTS_PLAYLIST = [
  {
    id: 1,
    title: 'Cyber Arcade & Meme Tokens',
    sponsor: 'CoinCade Ecosystem',
    videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
    tagline: 'Zocke Arcade Games, knacke Highscores & sichere dir Krypto-Airdrops!',
    cta: 'Jetzt entdecken',
    duration: 15,
  },
  {
    id: 2,
    title: 'Neon Drift Speed Arena',
    sponsor: 'Telegram Web3 Network',
    videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4',
    tagline: 'Messe dich mit tausenden Spielern in Echtzeit-Turnieren.',
    cta: 'Gratis spielen',
    duration: 15,
  },
  {
    id: 3,
    title: 'TON Crypto Arcade Revolution',
    sponsor: 'Open Network Arcade',
    videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4',
    tagline: 'Echte Tokenomics & automatisches Liquiditäts-Burning.',
    cta: 'Community beitreten',
    duration: 15,
  }
];

export function VideoAdPlayerModal({
  isOpen,
  onClose,
  onRewardGranted,
  backendUrl,
  initData,
  totalDurationSeconds = 25,
}: VideoAdPlayerModalProps) {
  const [currentSpotIndex, setCurrentSpotIndex] = useState(0);
  const [secondsRemaining, setSecondsRemaining] = useState(totalDurationSeconds);
  const [isCompleted, setIsCompleted] = useState(false);
  const [isMuted, setIsMuted] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const timerRef = useRef<any>(null);

  // Initialize playback when opened
  useEffect(() => {
    if (isOpen) {
      setCurrentSpotIndex(0);
      setSecondsRemaining(totalDurationSeconds);
      setIsCompleted(false);
      setIsMuted(false);
    }
  }, [isOpen, totalDurationSeconds]);

  // Main countdown timer (25-30s total duration)
  useEffect(() => {
    if (!isOpen || isCompleted) return;

    timerRef.current = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current!);
          setIsCompleted(true);
          handleClaimReward();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isOpen, isCompleted]);

  // Video element play & multi-spot sequencing
  useEffect(() => {
    if (isOpen && videoRef.current) {
      videoRef.current.currentTime = 0;
      videoRef.current.muted = isMuted;
      videoRef.current.play().catch(() => {
        // Fallback for strict browser autoplay: start muted and allow one-tap unmute
        if (videoRef.current) {
          videoRef.current.muted = true;
          setIsMuted(true);
          videoRef.current.play().catch((e) => console.log('[VIDEO AD]: Autoplay note:', e));
        }
      });
    }
  }, [isOpen, currentSpotIndex]);

  const handleVideoEnded = () => {
    // If more spots exist in playlist, advance to next spot
    if (currentSpotIndex < AD_SPOTS_PLAYLIST.length - 1) {
      setCurrentSpotIndex((prev) => prev + 1);
    } else {
      // Loop back to first spot if total timer is still running
      if (videoRef.current) {
        videoRef.current.currentTime = 0;
        videoRef.current.play().catch(() => {});
      }
    }
  };

  const handleToggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  const handleSponsorClick = () => {
    const directLink = (import.meta.env.VITE_MONETAG_DIRECT_LINK as string) || 'https://coincade.autoacts.link';
    const tg = (window as any).Telegram?.WebApp;
    if (tg?.openLink) {
      tg.openLink(directLink);
    } else {
      window.open(directLink, '_blank', 'noopener,noreferrer');
    }
  };

  const handleClaimReward = async () => {
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
        console.warn('[VIDEO AD REWARD CLAIM NOTE]:', resData?.message || resData?.error);
      }
    } catch (err: any) {
      console.error('[VIDEO AD REWARD ERROR]:', err);
    }
  };

  const handleFinishAndCollect = () => {
    onRewardGranted();
    onClose();
  };

  if (!isOpen) return null;

  const currentSpot = AD_SPOTS_PLAYLIST[currentSpotIndex] || AD_SPOTS_PLAYLIST[0];
  const progressPercent = Math.min(100, Math.max(0, ((totalDurationSeconds - secondsRemaining) / totalDurationSeconds) * 100));

  const modalContent = (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: '100vw',
        height: '100vh',
        backgroundColor: '#030712',
        zIndex: 9999999,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        overflow: 'hidden',
        fontFamily: "'Outfit', -apple-system, BlinkMacSystemFont, sans-serif",
      }}
    >
      {/* 1. TOP HEADER BAR */}
      <div
        style={{
          width: '100%',
          padding: '12px 16px',
          backgroundColor: '#0b1120',
          borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          zIndex: 10,
        }}
      >
        {/* Sponsor Badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span
            style={{
              background: 'rgba(245, 158, 11, 0.15)',
              color: '#fbbf24',
              fontSize: '10px',
              fontWeight: 900,
              padding: '4px 8px',
              borderRadius: '6px',
              border: '1px solid rgba(245, 158, 11, 0.4)',
              letterSpacing: '0.5px',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <Sparkles size={11} color="#fbbf24" /> AD SPOT ({currentSpotIndex + 1}/{AD_SPOTS_PLAYLIST.length})
          </span>
          <span
            style={{
              fontSize: '12px',
              fontWeight: 700,
              color: '#e2e8f0',
              maxWidth: '130px',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {currentSpot.sponsor}
          </span>
        </div>

        {/* Audio & Live Countdown Badges */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* Mute Toggle Button */}
          <button
            onClick={handleToggleMute}
            style={{
              padding: '6px 10px',
              borderRadius: '8px',
              backgroundColor: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              fontSize: '11px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            {isMuted ? (
              <>
                <VolumeX size={14} color="#94a3b8" />
                <span style={{ color: '#94a3b8' }}>Stumm</span>
              </>
            ) : (
              <>
                <Volume2 size={14} color="#fbbf24" />
                <span style={{ color: '#fbbf24' }}>Ton an</span>
              </>
            )}
          </button>

          {/* Countdown / Reward Badge */}
          {!isCompleted ? (
            <div
              style={{
                backgroundColor: 'rgba(245, 158, 11, 0.15)',
                color: '#fbbf24',
                fontSize: '12px',
                fontFamily: 'monospace',
                fontWeight: 900,
                padding: '5px 10px',
                borderRadius: '8px',
                border: '1px solid rgba(245, 158, 11, 0.4)',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <span
                style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  backgroundColor: '#fbbf24',
                  boxShadow: '0 0 6px #fbbf24',
                }}
              />
              <span>{secondsRemaining}s</span>
            </div>
          ) : (
            <div
              style={{
                backgroundColor: 'rgba(16, 185, 129, 0.2)',
                color: '#34d399',
                fontSize: '12px',
                fontWeight: 900,
                padding: '5px 10px',
                borderRadius: '8px',
                border: '1px solid rgba(16, 185, 129, 0.4)',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
              }}
            >
              <CheckCircle size={13} color="#34d399" />
              <span>GUTGESCHRIEBEN</span>
            </div>
          )}
        </div>
      </div>

      {/* 2. TOP PROGRESS BAR */}
      <div style={{ width: '100%', height: '4px', backgroundColor: 'rgba(255, 255, 255, 0.1)' }}>
        <div
          style={{
            height: '100%',
            width: `${progressPercent}%`,
            background: isCompleted
              ? '#10b981'
              : 'linear-gradient(90deg, #ff8c00, #ffd700, #38ef7d)',
            transition: 'width 1s linear',
            boxShadow: '0 0 8px rgba(255, 140, 0, 0.6)',
          }}
        />
      </div>

      {/* 3. CENTER CINEMA VIDEO SCREEN */}
      <div
        style={{
          flex: 1,
          width: '100%',
          backgroundColor: '#000',
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}
      >
        <video
          ref={videoRef}
          src={currentSpot.videoUrl}
          playsInline
          autoPlay
          muted={isMuted}
          onEnded={handleVideoEnded}
          style={{
            width: '100%',
            height: '100%',
            maxHeight: '65vh',
            objectFit: 'contain',
            backgroundColor: '#000',
          }}
        />

        {/* Sponsor Banner Card over Video */}
        <div
          style={{
            position: 'absolute',
            bottom: '12px',
            left: '12px',
            right: '12px',
            padding: '10px 14px',
            backgroundColor: 'rgba(15, 23, 42, 0.85)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            borderRadius: '14px',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '10px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', textAlign: 'left', minWidth: 0 }}>
            <span style={{ color: '#fff', fontSize: '12px', fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {currentSpot.title}
            </span>
            <span style={{ color: '#94a3b8', fontSize: '10px', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {currentSpot.tagline}
            </span>
          </div>

          <button
            onClick={handleSponsorClick}
            style={{
              backgroundColor: '#f59e0b',
              color: '#0f172a',
              fontSize: '11px',
              fontWeight: 900,
              padding: '8px 12px',
              borderRadius: '10px',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              flexShrink: 0,
              boxShadow: '0 2px 8px rgba(245, 158, 11, 0.4)',
            }}
          >
            <span>{currentSpot.cta}</span>
            <ExternalLink size={12} />
          </button>
        </div>
      </div>

      {/* 4. BOTTOM ACTION / REWARD BAR */}
      <div
        style={{
          width: '100%',
          padding: '16px 20px',
          backgroundColor: '#0b1120',
          borderTop: '1px solid rgba(255, 255, 255, 0.1)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '10px',
        }}
      >
        {!isCompleted ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', textAlign: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#fbbf24', fontSize: '12px', fontWeight: 800 }}>
              <ShieldCheck size={16} color="#fbbf24" />
              <span>Werbespot läuft &bull; Bitte nicht schließen</span>
            </div>
            <span style={{ color: '#64748b', fontSize: '11px', fontWeight: 600 }}>
              Noch <strong>{secondsRemaining} Sekunden</strong> bis zur garantierten +1 Energie-Belohnung
            </span>
          </div>
        ) : (
          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#34d399', fontSize: '13px', fontWeight: 900 }}>
              <Sparkles size={16} color="#ffd700" />
              <span>🎉 GLÜCKWUNSCH! +1 ENERGIE FREIGESCHALTET</span>
            </div>

            <button
              onClick={handleFinishAndCollect}
              style={{
                width: '100%',
                padding: '14px 20px',
                borderRadius: '16px',
                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                color: '#fff',
                fontSize: '14px',
                fontWeight: 900,
                letterSpacing: '0.5px',
                textTransform: 'uppercase',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                boxShadow: '0 4px 18px rgba(16, 185, 129, 0.45)',
              }}
            >
              <Zap size={18} fill="#fef08a" color="#fef08a" />
              <span>+1 ENERGIE EINLÖSEN & WEITERSPIELEN</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );

  return ReactDOM.createPortal(modalContent, document.body);
}
