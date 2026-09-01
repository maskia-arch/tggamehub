import { useState, useEffect } from 'react';
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

  // Measure target bounding box dynamically & auto-scroll into center
  useEffect(() => {
    if (!targetElementSelector) {
      setSpotlightRect(null);
      return;
    }

    const update = () => {
      const el = document.querySelector(targetElementSelector);
      if (el) {
        setSpotlightRect(el.getBoundingClientRect());
      }
    };

    // Auto-scroll target smoothly into center
    const timer1 = setTimeout(() => {
      const el = document.querySelector(targetElementSelector);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        update();
      }
    }, 120);

    const timer2 = setTimeout(update, 350);
    const interval = setInterval(update, 400);
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearInterval(interval);
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [targetElementSelector, currentStep, subStep]);

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
            maxWidth: '390px',
            display: 'flex',
            flexDirection: 'column',
            gap: '18px',
            textAlign: 'center',
          }}
        >
          {/* Cyberpunk Arcade Icon */}
          <div
            style={{
              width: '64px',
              height: '64px',
              borderRadius: '20px',
              margin: '0 auto',
              background: 'linear-gradient(135deg, rgba(0,242,254,0.2) 0%, rgba(79,172,254,0.1) 100%)',
              border: '1px solid rgba(0, 242, 254, 0.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0 25px rgba(0,242,254,0.25)',
            }}
          >
            <Sparkles size={32} style={{ color: '#00f2fe' }} />
          </div>

          <div>
            <h2 style={{ fontSize: '20px', fontWeight: 900, color: '#fff', margin: '0 0 6px 0', letterSpacing: '-0.02em' }}>
              {t.tutorial.offerTitle}
            </h2>
            <p style={{ fontSize: '12px', fontWeight: 800, color: '#00f2fe', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 10px 0' }}>
              {t.tutorial.offerSubtitle}
            </p>
            <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.8)', lineHeight: 1.5, margin: 0 }}>
              {t.tutorial.offerDescription}
            </p>
          </div>

          {/* Reward Highlights */}
          <div
            style={{
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '16px',
              padding: '12px',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              textAlign: 'left',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Zap size={16} style={{ color: '#fbbf24' }} />
              <span style={{ fontSize: '12px', fontWeight: 800, color: '#fbbf24' }}>
                +5 {t.tutorial.completion.energyAward}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <TrendingUp size={16} style={{ color: '#4ade80' }} />
              <span style={{ fontSize: '11.5px', fontWeight: 700, color: '#4ade80' }}>
                {t.tutorial.completion.portfolioAward}
              </span>
            </div>
          </div>

          {/* Action Options */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
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
                boxShadow: '0 0 25px rgba(0, 242, 254, 0.4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
              }}
            >
              <span>{t.tutorial.startBtn}</span>
              <ChevronRight size={18} />
            </button>

            <button
              onClick={onPostpone}
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
              {t.tutorial.laterBtn}
            </button>

            <button
              onClick={onDeclinePermanent}
              style={{
                background: 'none',
                border: 'none',
                color: 'rgba(255,255,255,0.4)',
                fontSize: '11.5px',
                fontWeight: 600,
                cursor: 'pointer',
                padding: '4px',
              }}
            >
              {t.tutorial.expertBtn}
            </button>
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
            background: 'linear-gradient(180deg, #0d1e2e 0%, #06111a 100%)',
            border: '1px solid rgba(74, 222, 128, 0.45)',
            boxShadow: '0 0 50px rgba(74, 222, 128, 0.25), 0 20px 40px rgba(0,0,0,0.9)',
            borderRadius: '24px',
            padding: '26px 22px',
            width: '100%',
            maxWidth: '390px',
            display: 'flex',
            flexDirection: 'column',
            gap: '18px',
            textAlign: 'center',
            animation: 'slideUpTutorial 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
          }}
        >
          <div
            style={{
              width: '68px',
              height: '68px',
              borderRadius: '22px',
              margin: '0 auto',
              background: 'linear-gradient(135deg, rgba(74,222,128,0.25) 0%, rgba(34,197,94,0.12) 100%)',
              border: '1px solid rgba(74, 222, 128, 0.5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0 30px rgba(74, 222, 128, 0.35)',
              fontSize: '32px',
            }}
          >
            🎉
          </div>

          <div>
            <h2 style={{ fontSize: '22px', fontWeight: 900, color: '#fff', margin: '0 0 6px 0', letterSpacing: '-0.02em' }}>
              {t.tutorial.completion.title}
            </h2>
            <p style={{ fontSize: '12.5px', color: 'rgba(255,255,255,0.75)', lineHeight: 1.45, margin: 0 }}>
              {t.tutorial.completion.subtitle}
            </p>
          </div>

          {/* Reward Breakdown Cards */}
          <div
            style={{
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '18px',
              padding: '14px',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
              textAlign: 'left',
            }}
          >
            <div style={{ fontSize: '11px', fontWeight: 900, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
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
          buttonText: 'Neon Jump starten 🎮',
          showActionBtn: true,
          onAction: () => {
            const el = document.querySelector('[data-tutorial="game-play-btn-doodlejump"]') as HTMLElement;
            if (el) el.click();
            else onNextStep();
          },
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
            buttonText: 'MAX (0,10$) auswählen 🛒',
            showActionBtn: true,
            onAction: () => {
              const maxBtn = document.querySelector('[data-tutorial="market-trade-max-btn"]') as HTMLElement;
              if (maxBtn) maxBtn.click();
            },
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
          buttonText: 'Profilbild auswählen 🎭',
          showActionBtn: true,
          onAction: () => {
            const el = document.querySelector('[data-tutorial="profile-avatar-btn"]') as HTMLElement;
            if (el) el.click();
          },
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

  // Smart non-overlapping card positioning:
  // If highlighted target is in the lower half of screen -> anchor card at TOP (top: 16px).
  // If highlighted target is in upper half or none -> anchor card at BOTTOM (bottom: 84px).
  const targetCenterY = spotlightRect ? (spotlightRect.top + spotlightRect.height / 2) : 0;
  const isTargetInLowerHalf = Boolean(spotlightRect && targetCenterY > (window.innerHeight * 0.44));

  return (
    <>
      {/* ── True Cutout Spotlight Overlay (Crystal Clear Inside, Dimmed Outside) ── */}
      {spotlightRect ? (
        <>
          {/* Transparent click blocker around the highlighted area */}
          <div
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 99980,
              pointerEvents: 'none',
            }}
          />
          {/* Spotlight cutout border box with infinite outer dark shadow */}
          <div
            style={{
              position: 'fixed',
              top: spotlightRect.top - 6,
              left: spotlightRect.left - 6,
              width: spotlightRect.width + 12,
              height: spotlightRect.height + 12,
              borderRadius: '16px',
              border: '2.5px solid #00f2fe',
              boxShadow: '0 0 0 9999px rgba(3, 7, 18, 0.85), 0 0 30px rgba(0, 242, 254, 0.9), inset 0 0 15px rgba(0, 242, 254, 0.25)',
              zIndex: 99990,
              pointerEvents: 'none',
              transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
              animation: 'pulseGlow 2s infinite ease-in-out',
            }}
          />
        </>
      ) : (
        /* Fullscreen dimmed backdrop for steps without a specific target element */
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(3, 7, 18, 0.85)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            zIndex: 99990,
            pointerEvents: 'auto',
            animation: 'fadeIn 0.2s ease-out',
          }}
        />
      )}

      {/* ── Floating Smart-Positioned Tutorial Explanation Card ── */}
      <div
        style={{
          position: 'fixed',
          left: '50%',
          transform: 'translateX(-50%)',
          top: isTargetInLowerHalf ? '16px' : 'auto',
          bottom: !isTargetInLowerHalf ? '84px' : 'auto',
          width: 'calc(100% - 24px)',
          maxWidth: '410px',
          background: 'linear-gradient(180deg, rgba(14, 22, 42, 0.98) 0%, rgba(6, 10, 20, 0.99) 100%)',
          border: '1.5px solid rgba(0, 242, 254, 0.45)',
          boxShadow: '0 0 40px rgba(0, 242, 254, 0.25), 0 16px 36px rgba(0,0,0,0.92)',
          borderRadius: '22px',
          padding: '16px 18px',
          zIndex: 99998,
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
          animation: 'slideUpTutorial 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
          transition: 'top 0.3s ease, bottom 0.3s ease',
        }}
      >
        {/* Header with Step indicator, Target Direction Hint, and Abort button */}
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
            <span style={{ fontSize: '11px', fontWeight: 800, color: 'rgba(255,255,255,0.65)' }}>
              {stepInfo.badge}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {spotlightRect && (
              <span
                style={{
                  fontSize: '9.5px',
                  fontWeight: 800,
                  color: '#00f2fe',
                  background: 'rgba(0,242,254,0.1)',
                  borderRadius: '6px',
                  padding: '2px 6px',
                  border: '1px solid rgba(0,242,254,0.25)',
                }}
              >
                {isTargetInLowerHalf ? '⬇️ Unten' : '⬆️ Oben'}
              </span>
            )}
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
              padding: '11px 14px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, #00f2fe 0%, #4facfe 100%)',
              color: '#000',
              fontSize: '13px',
              fontWeight: 900,
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              boxShadow: '0 0 18px rgba(0,242,254,0.35)',
            }}
          >
            <span>{stepInfo.buttonText || 'Weiter'}</span>
            <ChevronRight size={16} />
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
