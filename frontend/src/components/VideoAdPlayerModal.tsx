import { useState, useEffect, useRef } from 'react';
import { Volume2, VolumeX, CheckCircle, Sparkles, ExternalLink, ShieldCheck, Zap } from 'lucide-react';

interface VideoAdPlayerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRewardGranted: () => void;
  backendUrl: string;
  initData: string;
  durationSeconds?: number;
}

// Engaging HD Video Spot sources (Arcade, Cyberpunk, Gaming trailers)
const AD_SPOTS = [
  {
    title: 'Cyber Arcade & Meme Markets',
    sponsor: 'CoinCade Ecosystem',
    videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
    poster: '/images/neon_jump_preview.png',
    tagline: 'Trade Coins, Beat Highscores & Earn Real Airdrops!',
    cta: 'Jetzt Mini App entdecken',
  },
  {
    title: 'Neon Drift & Speed Challenge',
    sponsor: 'Telegram Gaming Network',
    videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4',
    poster: '/images/crossy_neon_road_preview.png',
    tagline: 'Compete against thousands of players worldwide.',
    cta: 'Play & Win',
  },
  {
    title: 'Web3 Flappy Masters',
    sponsor: 'The Open Network (TON)',
    videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4',
    poster: '/images/neon_bird_preview.png',
    tagline: 'Dynamic AMM Liquidity & Real-Time Player Tokenomics.',
    cta: 'Join Community',
  }
];

export function VideoAdPlayerModal({
  isOpen,
  onClose,
  onRewardGranted,
  backendUrl,
  initData,
  durationSeconds = 25,
}: VideoAdPlayerModalProps) {
  const [currentSpotIndex, setCurrentSpotIndex] = useState(0);
  const [secondsRemaining, setSecondsRemaining] = useState(durationSeconds);
  const [isCompleted, setIsCompleted] = useState(false);
  const [isMuted, setIsMuted] = useState(true);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const timerRef = useRef<any>(null);

  // Pick random video spot when opened
  useEffect(() => {
    if (isOpen) {
      const randomIdx = Math.floor(Math.random() * AD_SPOTS.length);
      setCurrentSpotIndex(randomIdx);
      setSecondsRemaining(durationSeconds);
      setIsCompleted(false);
      setIsMuted(false);
    }
  }, [isOpen, durationSeconds]);

  // Main countdown timer (25-30 seconds unskippable)
  useEffect(() => {
    if (!isOpen || isCompleted) return;

    timerRef.current = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current!);
          setIsCompleted(true);
          handleAutoClaim();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isOpen, isCompleted]);

  // Ensure video element plays smoothly
  useEffect(() => {
    if (isOpen && videoRef.current) {
      videoRef.current.currentTime = 0;
      videoRef.current.play().catch(() => {
        // Autoplay policy fallback: mute and play
        if (videoRef.current) {
          videoRef.current.muted = true;
          setIsMuted(true);
          videoRef.current.play().catch((e) => console.log('[VIDEO AD]: Autoplay note', e));
        }
      });
    }
  }, [isOpen, currentSpotIndex]);

  const handleToggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  const handleSponsorClick = () => {
    // Trigger Monetag direct link or sponsor URL
    const directLink = (import.meta.env.VITE_MONETAG_DIRECT_LINK as string) || 'https://coincade.autoacts.link';
    const tg = (window as any).Telegram?.WebApp;
    if (tg?.openLink) {
      tg.openLink(directLink);
    } else {
      window.open(directLink, '_blank', 'noopener,noreferrer');
    }
  };

  const handleAutoClaim = async () => {
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
        const rawText = await response.text();
        console.log('[ENERGY AD CLAIM RAW]:', rawText);
        resData = { success: response.ok };
      }

      if (!response.ok) {
        throw new Error(resData?.message || resData?.error || 'Werbe-Belohnung konnte nicht verbucht werden.');
      }

      onRewardGranted();
    } catch (err: any) {
      console.error('[VIDEO AD CLAIM ERROR]:', err);
      // Fallback: If network glitch, still reward client-side if video was fully watched
      onRewardGranted();
    }
  };

  if (!isOpen) return null;

  const currentSpot = AD_SPOTS[currentSpotIndex];
  const progressPercent = Math.min(100, Math.max(0, ((durationSeconds - secondsRemaining) / durationSeconds) * 100));

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 backdrop-blur-xl p-3 sm:p-6 animate-fade-in">
      <div className="relative w-full max-w-lg bg-slate-900 border border-amber-500/40 rounded-3xl overflow-hidden shadow-2xl flex flex-col">
        
        {/* Top Header Bar */}
        <div className="flex items-center justify-between px-4 py-3 bg-slate-950/80 border-b border-white/10">
          <div className="flex items-center gap-2">
            <span className="bg-amber-500/20 text-amber-400 text-xs font-black px-2 py-0.5 rounded-md border border-amber-500/30 uppercase tracking-wider flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-amber-400" /> SPONSORED AD
            </span>
            <span className="text-xs font-semibold text-slate-300 truncate max-w-[150px]">
              {currentSpot.sponsor}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* Audio Toggle */}
            <button
              onClick={handleToggleMute}
              className="p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-slate-300 transition-colors"
              title={isMuted ? 'Ton einschalten' : 'Stummschalten'}
            >
              {isMuted ? <VolumeX className="w-4 h-4 text-slate-400" /> : <Volume2 className="w-4 h-4 text-amber-400" />}
            </button>

            {/* Countdown / Reward Badge */}
            {!isCompleted ? (
              <div className="bg-slate-800 text-amber-400 text-xs font-mono font-bold px-2.5 py-1 rounded-full border border-amber-500/30 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                <span>Belohnung in {secondsRemaining}s</span>
              </div>
            ) : (
              <div className="bg-emerald-500/20 text-emerald-400 text-xs font-bold px-2.5 py-1 rounded-full border border-emerald-500/40 flex items-center gap-1">
                <CheckCircle className="w-3.5 h-3.5" />
                <span>Freigeschaltet</span>
              </div>
            )}
          </div>
        </div>

        {/* Progress Bar */}
        <div className="w-full bg-slate-800 h-1.5">
          <div
            className={`h-full transition-all duration-300 ease-linear ${isCompleted ? 'bg-emerald-500' : 'bg-gradient-to-r from-amber-500 to-yellow-400'}`}
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        {/* Video Screen Area */}
        <div className="relative w-full aspect-video bg-black flex items-center justify-center overflow-hidden">
          <video
            ref={videoRef}
            src={currentSpot.videoUrl}
            poster={currentSpot.poster}
            playsInline
            muted={isMuted}
            autoPlay
            loop
            className="w-full h-full object-cover"
          />

          {/* Overlay Tagline on Video */}
          <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between bg-black/60 backdrop-blur-md p-2.5 rounded-xl border border-white/10">
            <div className="flex flex-col text-left">
              <span className="text-white text-xs font-bold leading-tight drop-shadow">{currentSpot.title}</span>
              <span className="text-slate-300 text-[10px] leading-tight drop-shadow line-clamp-1">{currentSpot.tagline}</span>
            </div>
            <button
              onClick={handleSponsorClick}
              className="bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-extrabold px-3 py-1.5 rounded-lg flex items-center gap-1 shadow-md transition-transform active:scale-95 whitespace-nowrap"
            >
              <span>{currentSpot.cta}</span>
              <ExternalLink className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* Bottom Reward Action Container */}
        <div className="p-4 bg-slate-950/90 flex flex-col items-center justify-center text-center gap-3">
          {!isCompleted ? (
            <div className="flex flex-col items-center gap-1">
              <div className="flex items-center gap-2 text-slate-400 text-xs">
                <ShieldCheck className="w-4 h-4 text-amber-400" />
                <span>Schaue den Werbespot bis zum Ende, um <b>+1 Energie</b> zu erhalten.</span>
              </div>
              <p className="text-[11px] text-slate-500">
                (Unskipbar &bull; {secondsRemaining} Sekunden verbleibend)
              </p>
            </div>
          ) : (
            <div className="w-full flex flex-col items-center gap-3 animate-fade-in">
              <div className="flex items-center gap-2 text-emerald-400 font-black text-sm">
                <Sparkles className="w-5 h-5 text-yellow-400 animate-spin" />
                <span>🎉 GESCHAFFT! +1 ENERGIE FREIGESCHALTET</span>
              </div>

              <button
                onClick={onClose}
                className="w-full py-3.5 px-6 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-white font-black text-sm uppercase tracking-wider shadow-lg shadow-emerald-500/25 flex items-center justify-center gap-2 transition-transform active:scale-95 cursor-pointer"
              >
                <Zap className="w-5 h-5 fill-current text-yellow-300" />
                <span>+1 Energie einlösen & Zocken</span>
              </button>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
