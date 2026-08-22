import { useState, useEffect, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { Volume2, VolumeX, CheckCircle, Sparkles, ExternalLink, ShieldCheck, Zap, RefreshCw } from 'lucide-react';

interface VideoAdPlayerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRewardGranted: () => void;
  backendUrl: string;
  initData: string;
  totalDurationSeconds?: number;
}

const AD_SPOTS = [
  {
    id: 1,
    title: 'Neon Jump & Cyber Arcade 👾',
    sponsor: 'CoinCade Ecosystem',
    tagline: 'Springe über Neon-Plattformen, knacke Highscores & verdiene Game$!',
    accentColor: '#00f2fe',
    badge: 'ARCADE SPOT (1/2)',
    cta: 'Jetzt entdecken',
    preview: '/images/neon_jump_preview.png',
  },
  {
    id: 2,
    title: 'Neon Bird Flappy Masters 🐦',
    sponsor: 'TON Web3 Network',
    tagline: 'Echtzeit AMM-Tokenomics, Liquiditäts-Burning & Krypto-Airdrops!',
    accentColor: '#ff8c00',
    badge: 'SPONSOR SPOT (2/2)',
    cta: 'Community beitreten',
    preview: '/images/neon_bird_preview.png',
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
  const [isClaiming, setIsClaiming] = useState(false);
  const [claimStatus, setClaimStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [claimMessage, setClaimMessage] = useState('');

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const timerRef = useRef<any>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  // Initialize playback on open
  useEffect(() => {
    if (isOpen) {
      setCurrentSpotIndex(0);
      setSecondsRemaining(totalDurationSeconds);
      setIsCompleted(false);
      setIsClaiming(false);
      setClaimMessage('');

      // Check if official Monetag TMA show function exists on window
      try {
        const globalWin = window as any;
        const monetagShowFn = Object.keys(globalWin).find(
          (k) => k.startsWith('show_') && typeof globalWin[k] === 'function'
        );
        if (monetagShowFn) {
          console.log(`[MONETAG TMA SDK]: Found official show function: ${monetagShowFn}. Triggering live ad...`);
          globalWin[monetagShowFn]({ type: 'rewarded' })
            .then(() => console.log('[MONETAG TMA SDK]: Live ad completed!'))
            .catch((e: any) => console.log('[MONETAG TMA SDK]: Live ad note:', e));
        }
      } catch (e) {
        // non-fatal
      }
    }
  }, [isOpen, totalDurationSeconds]);

  // Main countdown timer (25s unskippable)
  useEffect(() => {
    if (!isOpen || isCompleted) return;

    timerRef.current = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          setIsCompleted(true);
          handleTriggerClaim();
          return 0;
        }

        // Switch spot halfway through (e.g. at 12s)
        if (prev === Math.floor(totalDurationSeconds / 2)) {
          setCurrentSpotIndex(1);
        }

        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isOpen, isCompleted, totalDurationSeconds]);

  // Sound effects generator (Web Audio API synth)
  const playChime = useCallback((freq = 587.33) => {
    if (isMuted) return;
    try {
      if (!audioCtxRef.current) {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioContextClass) audioCtxRef.current = new AudioContextClass();
      }
      if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
        audioCtxRef.current.resume();
      }
      if (audioCtxRef.current) {
        const ctx = audioCtxRef.current;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, ctx.currentTime);
        gain.gain.setValueAtTime(0.12, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.35);
      }
    } catch (e) {}
  }, [isMuted]);

  // High-Energy Animated Canvas Cinema Screen (100% reliable, zero black screens)
  useEffect(() => {
    if (!isOpen) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animFrameId: number;
    let frame = 0;
    const particles: { x: number; y: number; vx: number; vy: number; size: number; color: string }[] = [];

    // Initialize particles
    for (let i = 0; i < 40; i++) {
      particles.push({
        x: Math.random() * 400,
        y: Math.random() * 240,
        vx: (Math.random() - 0.5) * 1.5,
        vy: (Math.random() - 0.5) * 1.5,
        size: Math.random() * 3 + 1,
        color: ['#00f2fe', '#ff8c00', '#ffd700', '#f5576c'][Math.floor(Math.random() * 4)],
      });
    }

    const render = () => {
      frame++;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // 1. Dark futuristic space background with grid
      const grad = ctx.createRadialGradient(
        canvas.width / 2,
        canvas.height / 2,
        10,
        canvas.width / 2,
        canvas.height / 2,
        canvas.width / 1.4
      );
      grad.addColorStop(0, '#0f172a');
      grad.addColorStop(1, '#020617');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // 2. Animated Cyber Grid Lines
      ctx.strokeStyle = 'rgba(0, 242, 254, 0.12)';
      ctx.lineWidth = 1;
      const gridOffset = (frame * 1.2) % 30;
      for (let x = 0; x < canvas.width; x += 30) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
      }
      for (let y = gridOffset; y < canvas.height; y += 30) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
      }

      // 3. Floating Particles
      particles.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0) p.x = canvas.width;
        if (p.x > canvas.width) p.x = 0;
        if (p.y < 0) p.y = canvas.height;
        if (p.y > canvas.height) p.y = 0;

        ctx.fillStyle = p.color;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      });

      // 4. Center Glowing Arcade Orb / Pulse
      const pulse = Math.sin(frame * 0.08) * 6;
      const orbColor = currentSpotIndex === 0 ? '#00f2fe' : '#ff8c00';
      ctx.shadowColor = orbColor;
      ctx.shadowBlur = 24 + pulse * 2;
      ctx.strokeStyle = orbColor;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(canvas.width / 2, canvas.height / 2 - 10, 42 + pulse, 0, Math.PI * 2);
      ctx.stroke();
      ctx.shadowBlur = 0;

      // 5. Center CoinCade Icon & Text
      ctx.fillStyle = '#ffffff';
      ctx.font = '900 18px Outfit, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(currentSpotIndex === 0 ? '👾 NEON JUMP ARCADE' : '🐦 NEON BIRD MASTER', canvas.width / 2, canvas.height / 2 - 5);

      ctx.fillStyle = orbColor;
      ctx.font = '700 11px Outfit, sans-serif';
      ctx.fillText('SPONSORED VIDEO SPOT', canvas.width / 2, canvas.height / 2 + 15);

      // 6. Audio pulse beep every 5 seconds
      if (frame % 300 === 0) {
        playChime(659.25);
      }

      animFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animFrameId);
    };
  }, [isOpen, currentSpotIndex, playChime]);

  const handleSponsorClick = () => {
    const directLink = (import.meta.env.VITE_MONETAG_DIRECT_LINK as string) || 'https://coincade.autoacts.link';
    const tg = (window as any).Telegram?.WebApp;
    if (tg?.openLink) {
      tg.openLink(directLink);
    } else {
      window.open(directLink, '_blank', 'noopener,noreferrer');
    }
  };

  const handleTriggerClaim = async () => {
    setIsClaiming(true);
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

      if (response.ok) {
        setClaimStatus('success');
        setClaimMessage(resData?.message || '+1 Energie erfolgreich gutgeschrieben!');
        playChime(880); // High victory chime
      } else {
        setClaimStatus('error');
        setClaimMessage(resData?.message || 'Fehler beim Server-Abgleich.');
      }
    } catch (err: any) {
      console.error('[CLAIM ERROR]:', err);
      setClaimStatus('success'); // client side fallback
    } finally {
      setIsClaiming(false);
    }
  };

  const handleFinishAndCollect = () => {
    onRewardGranted();
    onClose();
  };

  if (!isOpen) return null;

  const currentSpot = AD_SPOTS[currentSpotIndex] || AD_SPOTS[0];
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
          padding: '14px 16px',
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
            <Sparkles size={11} color="#fbbf24" /> {currentSpot.badge}
          </span>
          <span
            style={{
              fontSize: '12px',
              fontWeight: 700,
              color: '#e2e8f0',
              maxWidth: '140px',
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
          <button
            onClick={() => setIsMuted(!isMuted)}
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
              <span>BEREIT</span>
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

      {/* 3. CENTER CINEMA CANVAS & SPONSOR SCREEN */}
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
        <canvas
          ref={canvasRef}
          width={400}
          height={260}
          style={{
            width: '100%',
            height: '100%',
            maxHeight: '65vh',
            objectFit: 'cover',
            display: 'block',
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
            backgroundColor: 'rgba(15, 23, 42, 0.9)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            borderRadius: '14px',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '10px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
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
              backgroundColor: currentSpot.accentColor,
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
              boxShadow: `0 2px 8px ${currentSpot.accentColor}66`,
            }}
          >
            <span>{currentSpot.cta}</span>
            <ExternalLink size={12} />
          </button>
        </div>
      </div>

      {/* 4. BOTTOM ACTION & CLAIM BAR */}
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: claimStatus === 'error' ? '#f87171' : '#34d399', fontSize: '13px', fontWeight: 900 }}>
              <Sparkles size={16} color={claimStatus === 'error' ? '#f87171' : '#ffd700'} />
              <span>🎉 {claimMessage || 'GESCHAFFT! +1 ENERGIE FREIGESCHALTET'}</span>
            </div>

            <button
              onClick={handleFinishAndCollect}
              disabled={isClaiming}
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
              {isClaiming ? (
                <>
                  <RefreshCw size={16} className="animate-spin" />
                  <span>WIRD GUTGESCHRIEBEN...</span>
                </>
              ) : (
                <>
                  <Zap size={18} fill="#fef08a" color="#fef08a" />
                  <span>+1 ENERGIE EINLÖSEN & WEITERSPIELEN</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );

  return ReactDOM.createPortal(modalContent, document.body);
}
