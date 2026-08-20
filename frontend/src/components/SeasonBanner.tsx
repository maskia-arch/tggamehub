import { useState, useEffect } from 'react';
import { Info, Sparkles, Trophy, ChevronRight } from 'lucide-react';
import { SeasonInfoModal } from './SeasonInfoModal';
import { useLanguage } from '../i18n/LanguageContext';

interface SeasonInfo {
  id: number;
  seasonNumber: number;
  name: string;
  status: 'preparing' | 'active' | 'ended' | 'settled';
  targetAmount: number;
  currentPot: number;
  revenueSharePercent: number;
  startDate: string | null;
  endDate: string | null;
  durationDays: number;
  top10SharePercent: number;
  active20SharePercent: number;
  randomSharePercent: number;
  daysLeft: number;
  progressPercent: number;
  isGoalReached: boolean;
  totalParticipants: number;
}

interface SeasonBannerProps {
  backendUrl: string;
}

export function SeasonBanner({ backendUrl }: SeasonBannerProps) {
  const { t } = useLanguage();
  const [season, setSeason] = useState<SeasonInfo | null>(null);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    async function fetchSeasonInfo() {
      try {
        const res = await fetch(`${backendUrl}/api/season/info`);
        if (res.ok) {
          const data = await res.json();
          if (data.season) {
            setSeason(data.season);
          }
        }
      } catch (err) {
        // Silent error
      }
    }
    fetchSeasonInfo();
    const interval = setInterval(fetchSeasonInfo, 15000);
    return () => clearInterval(interval);
  }, [backendUrl]);

  if (!season) return null;

  const isPreparing = season.status === 'preparing';

  return (
    <>
      {/* Sleek Integrated Cyber Season Pot Widget */}
      <div
        onClick={() => setShowModal(true)}
        style={{
          background: 'rgba(22, 33, 54, 0.45)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          border: isPreparing
            ? '1px solid rgba(167, 139, 250, 0.25)'
            : '1px solid rgba(251, 191, 36, 0.3)',
          borderRadius: '18px',
          padding: '12px 14px',
          marginBottom: '14px',
          cursor: 'pointer',
          transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
          position: 'relative',
          overflow: 'hidden',
          boxShadow: isPreparing
            ? '0 4px 20px rgba(167, 139, 250, 0.08)'
            : '0 4px 20px rgba(251, 191, 36, 0.12)',
        }}
      >
        {/* Glowing Accent Top Bar */}
        <div
          style={{
            position: 'absolute',
            top: 0, left: 0, right: 0, height: '2px',
            background: isPreparing
              ? 'linear-gradient(90deg, #a78bfa 0%, #00f2fe 100%)'
              : 'linear-gradient(90deg, #fbbf24 0%, #ff8c00 100%)',
          }}
        />

        {/* Top Info Row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {isPreparing ? (
              <Sparkles size={14} style={{ color: '#a78bfa' }} />
            ) : (
              <Trophy size={14} style={{ color: '#fbbf24' }} />
            )}
            <span style={{ fontSize: '11px', fontWeight: 800, color: '#fff', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {isPreparing ? `${season.name} ${t.season.goalPot}` : `${season.name} ${t.season.airdropPot}`}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px', color: 'var(--accent-cyan)', fontWeight: 700 }}>
            <Info size={11} />
            <span>{t.season.info}</span>
            <ChevronRight size={12} />
          </div>
        </div>

        {/* Amount & Progress Text */}
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '6px' }}>
          <div style={{ fontSize: '16px', fontWeight: 900, color: isPreparing ? '#c084fc' : '#fbbf24', fontFamily: 'monospace' }}>
            {season.currentPot.toFixed(2)} €
          </div>
          <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.45)', fontWeight: 700, fontFamily: 'monospace' }}>
            {t.season.targetLabel}: {season.targetAmount.toFixed(0)} € ({season.progressPercent}%)
          </div>
        </div>

        {/* Glowing Progress Bar */}
        <div style={{
          width: '100%', height: '5px',
          background: 'rgba(255,255,255,0.06)',
          borderRadius: '9999px', overflow: 'hidden',
        }}>
          <div style={{
            height: '100%',
            width: `${season.progressPercent}%`,
            background: isPreparing
              ? 'linear-gradient(90deg, #a78bfa 0%, #00f2fe 100%)'
              : 'linear-gradient(90deg, #f59e0b 0%, #fbbf24 100%)',
            borderRadius: '9999px',
            boxShadow: isPreparing
              ? '0 0 10px rgba(167, 139, 250, 0.5)'
              : '0 0 10px rgba(251, 191, 36, 0.5)',
            transition: 'width 0.5s ease-out',
          }} />
        </div>
      </div>

      {showModal && <SeasonInfoModal season={season} onClose={() => setShowModal(false)} />}
    </>
  );
}
