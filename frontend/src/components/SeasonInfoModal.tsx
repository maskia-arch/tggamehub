import { X, Trophy, Zap, Gift, Sparkles } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';

interface SeasonInfo {
  id: number;
  seasonNumber: number;
  name: string;
  status: 'preparing' | 'active' | 'ended' | 'settled';
  targetAmount: number;
  currentPot: number;
  revenueSharePercent: number;
  durationDays: number;
  top10SharePercent: number;
  active20SharePercent: number;
  randomSharePercent: number;
  daysLeft: number;
  progressPercent: number;
  isGoalReached: boolean;
}

interface SeasonInfoModalProps {
  season: SeasonInfo;
  onClose: () => void;
}

export function SeasonInfoModal({ season, onClose }: SeasonInfoModalProps) {
  const { t } = useLanguage();
  const isPreparing = season.status === 'preparing';

  return (
    <div className="modal-overlay" style={{ zIndex: 1000 }}>
      <div
        className="modal-content-card"
        style={{
          maxWidth: '420px',
          width: '92%',
          background: '#0a0e1a',
          border: '1px solid rgba(0,242,254,0.3)',
          borderRadius: '24px',
          padding: '24px 20px',
          boxShadow: '0 20px 60px rgba(0,0,0,0.8)',
          position: 'relative',
        }}
      >
        {/* Modal Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '12px',
                background: 'linear-gradient(135deg, rgba(0,242,254,0.2), rgba(167,139,250,0.15))',
                border: '1px solid rgba(0,242,254,0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Trophy size={18} style={{ color: '#00f2fe' }} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 900, color: '#fff' }}>
                {season.name} — {t.season.guideTitle}
              </h3>
              <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)' }}>
                {t.season.guideSub}
              </span>
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '50%',
              width: '30px',
              height: '30px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              cursor: 'pointer',
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Current Pot Status Highlight Box */}
        <div
          style={{
            background: 'linear-gradient(135deg, rgba(0,242,254,0.08) 0%, rgba(167,139,250,0.05) 100%)',
            border: '1px solid rgba(0,242,254,0.2)',
            borderRadius: '16px',
            padding: '14px 16px',
            marginBottom: '20px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', fontWeight: 700 }}>
              {isPreparing ? t.season.preSeasonProgress : t.season.activePotSize}
            </span>
            <span
              style={{
                fontSize: '10px',
                fontWeight: 800,
                color: isPreparing ? '#a78bfa' : '#4ade80',
                background: isPreparing ? 'rgba(167,139,250,0.15)' : 'rgba(74,222,128,0.15)',
                padding: '2px 8px',
                borderRadius: '8px',
                border: isPreparing ? '1px solid rgba(167,139,250,0.3)' : '1px solid rgba(74,222,128,0.3)',
              }}
            >
              {isPreparing ? t.season.preparation : t.season.active30Days}
            </span>
          </div>

          <div style={{ fontSize: '20px', fontWeight: 900, color: '#00f2fe', fontFamily: 'monospace' }}>
            {season.currentPot.toFixed(2)} €{' '}
            <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', fontWeight: 600 }}>
              / {t.season.targetLabel}: {season.targetAmount.toFixed(0)} €
            </span>
          </div>

          <div
            style={{
              width: '100%',
              height: '6px',
              background: 'rgba(255,255,255,0.08)',
              borderRadius: '4px',
              marginTop: '8px',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${season.progressPercent}%`,
                background: 'linear-gradient(90deg, #00f2fe, #a78bfa)',
                borderRadius: '4px',
              }}
            />
          </div>
        </div>

        {/* Informational Rules Section */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '22px' }}>
          
          {/* Rule 1: Goal & Start */}
          <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '10px',
                background: 'rgba(167,139,250,0.12)',
                border: '1px solid rgba(167,139,250,0.25)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <Sparkles size={16} style={{ color: '#a78bfa' }} />
            </div>
            <div>
              <h4 style={{ margin: 0, fontSize: '13px', fontWeight: 800, color: '#fff' }}>
                {t.season.rule1Title}
              </h4>
              <p style={{ margin: '2px 0 0', fontSize: '11px', color: 'rgba(255,255,255,0.5)', lineHeight: 1.4 }}>
                {t.season.rule1Desc}
              </p>
            </div>
          </div>

          {/* Rule 2: 30% Revenue Share */}
          <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '10px',
                background: 'rgba(0,242,254,0.12)',
                border: '1px solid rgba(0,242,254,0.25)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <Zap size={16} style={{ color: '#00f2fe' }} />
            </div>
            <div>
              <h4 style={{ margin: 0, fontSize: '13px', fontWeight: 800, color: '#fff' }}>
                {t.season.rule2Title}
              </h4>
              <p style={{ margin: '2px 0 0', fontSize: '11px', color: 'rgba(255,255,255,0.5)', lineHeight: 1.4 }}>
                {t.season.rule2Desc}
              </p>
            </div>
          </div>

          {/* Rule 3: Airdrop Pool Split */}
          <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '10px',
                background: 'rgba(251,191,36,0.12)',
                border: '1px solid rgba(251,191,36,0.25)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <Gift size={16} style={{ color: '#fbbf24' }} />
            </div>
            <div>
              <h4 style={{ margin: 0, fontSize: '13px', fontWeight: 800, color: '#fff' }}>
                {t.season.rule3Title}
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '6px' }}>
                <span style={{ fontSize: '11px', color: '#fbbf24', fontWeight: 700 }}>
                  {t.season.top10}
                </span>
                <span style={{ fontSize: '11px', color: '#a78bfa', fontWeight: 700 }}>
                  {t.season.active20}
                </span>
                <span style={{ fontSize: '11px', color: '#4ade80', fontWeight: 700 }}>
                  {t.season.randomDraw}
                </span>
              </div>
            </div>
          </div>

        </div>

        {/* Close Button */}
        <button
          onClick={onClose}
          style={{
            width: '100%',
            padding: '12px',
            background: 'linear-gradient(135deg, #00f2fe, #00c8ff)',
            border: 'none',
            borderRadius: '14px',
            color: '#000',
            fontWeight: 800,
            fontSize: '13px',
            cursor: 'pointer',
            boxShadow: '0 4px 20px rgba(0,242,254,0.3)',
          }}
        >
          {t.common.understood}
        </button>
      </div>
    </div>
  );
}
