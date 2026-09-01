import { useState, useEffect, useCallback } from 'react';
import { Sparkles, Trophy, Zap, ChevronRight, X, AlertTriangle, CheckCircle2, TrendingUp, Gamepad2, ShoppingBag, User } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';

export interface TutorialOverlayProps {
  currentStep: number;
  isActive: boolean;
  showOffer: boolean;
  showCompletion: boolean;
  onStart: () => void;
  onPostpone: () => void;
  onDeclinePermanent: () => void;
  onNextStep: () => void;
  onAbortTutorial: () => void;
  onClaimReward: () => Promise<void>;
  targetElementSelector?: string | null;
  subStep?: string | null;
}

export function TutorialOverlay({
  currentStep,
  isActive,
  showOffer,
  showCompletion,
  onStart,
  onPostpone,
  onDeclinePermanent,
  onNextStep,
  onAbortTutorial,
  onClaimReward,
  targetElementSelector,
  subStep,
}: TutorialOverlayProps) {
  const { t } = useLanguage();
  const [showAbortModal, setShowAbortModal] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [spotlightRect, setSpotlightRect] = useState<DOMRect | null>(null);

  // Measure target bounding box dynamically
  const updateSpotlight = useCallback(() => {
    if (!targetElementSelector) {
      setSpotlightRect(null);
      return;
    }
    const el = document.querySelector(targetElementSelector);
    if (el) {
      const rect = el.getBoundingClientRect();
      setSpotlightRect(rect);
    } else {
      setSpotlightRect(null);
    }
  }, [targetElementSelector]);

  useEffect(() => {
    updateSpotlight();
    const interval = setInterval(updateSpotlight, 400);
    window.addEventListener('resize', updateSpotlight);
    window.addEventListener('scroll', updateSpotlight, true);
    return () => {
      clearInterval(interval);
      window.removeEventListener('resize', updateSpotlight);
      window.removeEventListener('scroll', updateSpotlight, true);
    };
  }, [updateSpotlight]);

  const handleClaim = async () => {
    setClaiming(true);
    try {
      await onClaimReward();
    } finally {
      setClaiming(false);
    }
  };

  // 1. Initial Offer Modal
  if (showOffer) {
    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(3, 7, 18, 0.85)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          zIndex: 999990,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px',
          animation: 'fadeIn 0.25s ease-out',
        }}
      >
        <div
          style={{
            background: 'linear-gradient(180deg, #0d1527 0%, #080c18 100%)',
            border: '1px solid rgba(0, 242, 254, 0.35)',
            boxShadow: '0 0 45px rgba(0, 242, 254, 0.2), 0 20px 40px rgba(0,0,0,0.85)',
            borderRadius: '24px',
            padding: '24px',
            width: '100%',
            maxWidth: '420px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            textAlign: 'center',
          }}
        >
          <div
            style={{
              width: '64px',
              height: '64px',
              borderRadius: '20px',
              margin: '0 auto',
              background: 'linear-gradient(135deg, rgba(0,242,254,0.15) 0%, rgba(79,172,254,0.25) 100%)',
              border: '1px solid rgba(0,242,254,0.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0 20px rgba(0,242,254,0.3)',
            }}
          >
            <Sparkles size={32} style={{ color: '#00f2fe' }} />
          </div>

          <div>
            <h2 style={{ fontSize: '20px', fontWeight: 900, color: '#fff', margin: '0 0 6px 0', letterSpacing: '-0.02em' }}>
              {t.tutorial.offerTitle}
            </h2>
            <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--accent-cyan)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              {t.tutorial.offerSubtitle}
            </div>
          </div>

          <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.8)', lineHeight: 1.5, margin: 0 }}>
            {t.tutorial.offerDescription}
          </p>

          {/* Reward Badges Box */}
          <div
            style={{
              background: 'rgba(0, 242, 254, 0.06)',
              border: '1px solid rgba(0, 242, 254, 0.2)',
              borderRadius: '16px',
              padding: '12px',
              display: 'flex',
              justifyContent: 'space-around',
              alignItems: 'center',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Zap size={16} style={{ color: '#fbbf24' }} />
              <span style={{ fontSize: '12px', fontWeight: 800, color: '#fbbf24' }}>+5 Energy</span>
            </div>
            <div style={{ width: '1px', height: '20px', background: 'rgba(255,255,255,0.15)' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <TrendingUp size={16} style={{ color: '#4ade80' }} />
              <span style={{ fontSize: '12px', fontWeight: 800, color: '#4ade80' }}>All Coins Starter-Bag</span>
            </div>
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '6px' }}>
            <button
              onClick={onStart}
              style={{
                width: '100%',
                padding: '14px',
                borderRadius: '14px',
                background: 'linear-gradient(135deg, #00f2fe 0%, #4facfe 100%)',
                color: '#000',
                fontSize: '14px',
                fontWeight: 900,
                border: 'none',
                cursor: 'pointer',
                boxShadow: '0 0 25px rgba(0, 242, 254, 0.45)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                transition: 'transform 0.15s ease',
              }}
            >
              <span>{t.tutorial.startBtn}</span>
            </button>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={onPostpone}
                style={{
                  flex: 1,
                  padding: '11px',
                  borderRadius: '12px',
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  color: 'rgba(255,255,255,0.85)',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                {t.tutorial.laterBtn}
              </button>

              <button
                onClick={onDeclinePermanent}
                style={{
                  flex: 1,
                  padding: '11px',
                  borderRadius: '12px',
                  background: 'rgba(239, 68, 68, 0.08)',
                  border: '1px solid rgba(239, 68, 68, 0.25)',
                  color: '#f87171',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                {t.tutorial.expertBtn}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 2. Final Completion Reward Modal
  if (showCompletion) {
    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(3, 7, 18, 0.88)',
          backdropFilter: 'blur(14px)',
          WebkitBackdropFilter: 'blur(14px)',
          zIndex: 999990,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px',
          animation: 'fadeIn 0.25s ease-out',
        }}
      >
        <div
          style={{
            background: 'linear-gradient(180deg, #101c38 0%, #090e1f 100%)',
            border: '1px solid rgba(74, 222, 128, 0.4)',
            boxShadow: '0 0 50px rgba(74, 222, 128, 0.25), 0 20px 40px rgba(0,0,0,0.9)',
            borderRadius: '24px',
            padding: '24px',
            width: '100%',
            maxWidth: '420px',
            display: 'flex',
            flexDirection: 'column',
            gap: '18px',
            textAlign: 'center',
          }}
        >
          <div
            style={{
              width: '72px',
              height: '72px',
              borderRadius: '22px',
              margin: '0 auto',
              background: 'linear-gradient(135deg, rgba(74,222,128,0.2) 0%, rgba(34,197,94,0.35) 100%)',
              border: '1px solid rgba(74,222,128,0.5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0 30px rgba(74,222,128,0.4)',
            }}
          >
            <Trophy size={38} style={{ color: '#4ade80' }} />
          </div>

          <div>
            <h2 style={{ fontSize: '22px', fontWeight: 900, color: '#fff', margin: '0 0 6px 0' }}>
              {t.tutorial.completion.title}
            </h2>
            <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.75)' }}>
              {t.tutorial.completion.subtitle}
            </div>
          </div>

          <div
            style={{
              background: 'rgba(0,0,0,0.4)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '18px',
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              textAlign: 'left',
            }}
          >
            <div style={{ fontSize: '11px', fontWeight: 800, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              {t.tutorial.completion.rewardHeader}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ width: '32px', height: '32px', borderRadius: '10px', background: 'rgba(251,191,36,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Zap size={18} style={{ color: '#fbbf24' }} />
              </div>
              <div style={{ fontSize: '13px', fontWeight: 800, color: '#fbbf24' }}>
                {t.tutorial.completion.energyAward}
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
              <div style={{ width: '32px', height: '32px', borderRadius: '10px', background: 'rgba(74,222,128,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <TrendingUp size={18} style={{ color: '#4ade80' }} />
              </div>
              <div style={{ fontSize: '12.5px', fontWeight: 700, color: '#4ade80', lineHeight: 1.4 }}>
                {t.tutorial.completion.portfolioAward}
              </div>
            </div>
          </div>

          <button
            onClick={handleClaim}
            disabled={claiming}
            style={{
              width: '100%',
              padding: '15px',
              borderRadius: '14px',
              background: 'linear-gradient(135deg, #4ade80 0%, #22c55e 100%)',
              color: '#000',
              fontSize: '14px',
              fontWeight: 900,
              border: 'none',
              cursor: claiming ? 'not-allowed' : 'pointer',
              boxShadow: '0 0 25px rgba(74, 222, 128, 0.45)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              opacity: claiming ? 0.7 : 1,
            }}
          >
            {claiming ? (
              <span>Gutschreiben...</span>
            ) : (
              <span>{t.tutorial.completion.claimBtn}</span>
            )}
          </button>
        </div>
      </div>
    );
  }

  if (!isActive) return null;

  // Step information helpers
  const getStepContent = () => {
    switch (currentStep) {
      case 1:
        return {
          icon: <Gamepad2 size={20} style={{ color: '#00f2fe' }} />,
          badge: t.tutorial.step1.badge,
          title: t.tutorial.step1.title,
          text: t.tutorial.step1.text,
          buttonText: t.tutorial.step1.cta,
          onAction: onNextStep,
          showActionBtn: true,
        };
      case 2:
        return {
          icon: <Zap size={20} style={{ color: '#fbbf24' }} />,
          badge: t.tutorial.step2.badge,
          title: t.tutorial.step2.title,
          text: t.tutorial.step2.text,
          buttonText: undefined,
          showActionBtn: false,
        };
      case 3:
        if (subStep === 'market_news') {
          return {
            icon: <TrendingUp size={20} style={{ color: '#00f2fe' }} />,
            badge: t.tutorial.step3.badge,
            title: t.tutorial.step3.title,
            text: t.tutorial.step3.marketTabIntro,
            buttonText: t.tutorial.step3.switchTrading,
            showActionBtn: true,
            onAction: onNextStep,
          };
        }
        if (subStep === 'trading_doodle') {
          return {
            icon: <TrendingUp size={20} style={{ color: '#4ade80' }} />,
            badge: t.tutorial.step3.badge,
            title: '$DOODLE kaufen',
            text: t.tutorial.step3.tradingIntro,
            showActionBtn: false,
          };
        }
        return {
          icon: <CheckCircle2 size={20} style={{ color: '#a78bfa' }} />,
          badge: t.tutorial.step3.badge,
          title: 'Portfolio & Rendite',
          text: t.tutorial.step3.portfolioIntro,
          buttonText: t.tutorial.step3.cta,
          showActionBtn: true,
          onAction: onNextStep,
        };
      case 4:
        return {
          icon: <Trophy size={20} style={{ color: '#fbbf24' }} />,
          badge: t.tutorial.step4.badge,
          title: t.tutorial.step4.title,
          text: `${t.tutorial.step4.intro} ${t.tutorial.step4.timeframeGuide}`,
          buttonText: t.tutorial.step4.cta,
          showActionBtn: true,
          onAction: onNextStep,
        };
      case 5:
        return {
          icon: <Sparkles size={20} style={{ color: '#00f2fe' }} />,
          badge: t.tutorial.step5.badge,
          title: t.tutorial.step5.title,
          text: `${t.tutorial.step5.seasonActiveIntro} ${t.tutorial.step5.payoutRules} ${t.tutorial.step5.targetPotIntro}`,
          buttonText: t.tutorial.step5.cta,
          showActionBtn: true,
          onAction: onNextStep,
        };
      case 6:
        return {
          icon: <ShoppingBag size={20} style={{ color: '#f472b6' }} />,
          badge: t.tutorial.step6.badge,
          title: t.tutorial.step6.title,
          text: t.tutorial.step6.text,
          buttonText: t.tutorial.step6.cta,
          showActionBtn: true,
          onAction: onNextStep,
        };
      case 7:
        return {
          icon: <User size={20} style={{ color: '#38bdf8' }} />,
          badge: t.tutorial.step7.badge,
          title: t.tutorial.step7.title,
          text: t.tutorial.step7.text,
          buttonText: undefined,
          showActionBtn: false,
        };
      default:
        return {
          icon: <Sparkles size={20} />,
          badge: `Step ${currentStep}`,
          title: 'Tutorial',
          text: '',
          buttonText: 'Weiter',
          showActionBtn: true,
          onAction: onNextStep,
        };
    }
  };

  const stepInfo = getStepContent();

  return (
    <>
      {/* Dimmed & blurred global backdrop with spotlight cut-out */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: spotlightRect ? 'rgba(3, 7, 18, 0.72)' : 'rgba(3, 7, 18, 0.82)',
          backdropFilter: 'blur(4px)',
          WebkitBackdropFilter: 'blur(4px)',
          zIndex: 99990,
          pointerEvents: spotlightRect ? 'none' : 'auto',
          transition: 'all 0.3s ease',
        }}
      />

      {/* Spotlight glow border over highlighted element */}
      {spotlightRect && (
        <div
          style={{
            position: 'fixed',
            top: spotlightRect.top - 4,
            left: spotlightRect.left - 4,
            width: spotlightRect.width + 8,
            height: spotlightRect.height + 8,
            borderRadius: '16px',
            border: '2px solid #00f2fe',
            boxShadow: '0 0 25px rgba(0, 242, 254, 0.6), inset 0 0 15px rgba(0, 242, 254, 0.2)',
            zIndex: 99995,
            pointerEvents: 'none',
            animation: 'pulseGlow 2s infinite ease-in-out',
          }}
        />
      )}

      {/* Floating Tutorial Card */}
      <div
        style={{
          position: 'fixed',
          left: '50%',
          transform: 'translateX(-50%)',
          bottom: '84px', // Placed just above the bottom navigation bar
          width: 'calc(100% - 28px)',
          maxWidth: '410px',
          background: 'linear-gradient(180deg, rgba(16, 24, 46, 0.96) 0%, rgba(8, 12, 24, 0.98) 100%)',
          border: '1px solid rgba(0, 242, 254, 0.4)',
          boxShadow: '0 0 35px rgba(0, 242, 254, 0.2), 0 12px 30px rgba(0,0,0,0.85)',
          borderRadius: '22px',
          padding: '16px 18px',
          zIndex: 99998,
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
          animation: 'slideUpTutorial 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        {/* Header with Step indicator and Abort button */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span
              style={{
                fontSize: '10px',
                fontWeight: 900,
                color: 'var(--accent-cyan)',
                background: 'rgba(0, 242, 254, 0.12)',
                border: '1px solid rgba(0, 242, 254, 0.3)',
                borderRadius: '8px',
                padding: '3px 8px',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              {t.tutorial.stepIndicator.replace('{step}', String(currentStep)).replace('{total}', '7')}
            </span>
            <span style={{ fontSize: '11px', fontWeight: 800, color: 'rgba(255,255,255,0.6)' }}>
              {stepInfo.badge}
            </span>
          </div>

          <button
            onClick={() => setShowAbortModal(true)}
            style={{
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '50%',
              width: '24px',
              height: '24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'rgba(255,255,255,0.6)',
              cursor: 'pointer',
            }}
            title="Tutorial abbrechen"
          >
            <X size={13} />
          </button>
        </div>

        {/* Title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {stepInfo.icon}
          <h3 style={{ fontSize: '15px', fontWeight: 900, color: '#fff', margin: 0 }}>
            {stepInfo.title}
          </h3>
        </div>

        {/* Text */}
        <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.85)', lineHeight: 1.45, margin: 0 }}>
          {stepInfo.text}
        </p>

        {/* Action Button if applicable */}
        {stepInfo.showActionBtn && (
          <button
            onClick={stepInfo.onAction}
            style={{
              width: '100%',
              marginTop: '4px',
              padding: '10px 14px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, #00f2fe 0%, #4facfe 100%)',
              color: '#000',
              fontSize: '12.5px',
              fontWeight: 900,
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              boxShadow: '0 0 16px rgba(0,242,254,0.35)',
            }}
          >
            <span>{stepInfo.buttonText || 'Weiter'}</span>
            <ChevronRight size={15} />
          </button>
        )}
      </div>

      {/* 3. Double-Confirmation Abort Modal */}
      {showAbortModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(3, 7, 18, 0.9)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            zIndex: 999999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
            animation: 'fadeIn 0.2s ease-out',
          }}
        >
          <div
            style={{
              background: 'linear-gradient(180deg, #18101a 0%, #0d0812 100%)',
              border: '1px solid rgba(239, 68, 68, 0.4)',
              boxShadow: '0 0 40px rgba(239, 68, 68, 0.25), 0 20px 40px rgba(0,0,0,0.9)',
              borderRadius: '24px',
              padding: '22px',
              width: '100%',
              maxWidth: '380px',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
              textAlign: 'center',
            }}
          >
            <div
              style={{
                width: '56px',
                height: '56px',
                borderRadius: '18px',
                margin: '0 auto',
                background: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid rgba(239, 68, 68, 0.35)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <AlertTriangle size={28} style={{ color: '#ef4444' }} />
            </div>

            <div>
              <h3 style={{ fontSize: '18px', fontWeight: 900, color: '#fff', margin: '0 0 6px 0' }}>
                {t.tutorial.abortTitle}
              </h3>
              <p style={{ fontSize: '12.5px', color: 'rgba(255,255,255,0.75)', lineHeight: 1.45, margin: 0 }}>
                {t.tutorial.abortDescription}
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <button
                onClick={() => {
                  setShowAbortModal(false);
                  onAbortTutorial();
                }}
                style={{
                  width: '100%',
                  padding: '12px',
                  borderRadius: '12px',
                  background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                  color: '#fff',
                  fontSize: '13px',
                  fontWeight: 900,
                  border: 'none',
                  cursor: 'pointer',
                  boxShadow: '0 0 20px rgba(239, 68, 68, 0.35)',
                }}
              >
                {t.tutorial.abortConfirm}
              </button>

              <button
                onClick={() => setShowAbortModal(false)}
                style={{
                  width: '100%',
                  padding: '11px',
                  borderRadius: '12px',
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  color: 'rgba(255,255,255,0.85)',
                  fontSize: '12.5px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                {t.tutorial.abortCancel}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
