import React from 'react';
import { Send, Trophy, Sparkles, Globe, Gamepad2, Flame, ArrowRight, ExternalLink } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';

interface TelegramRedirectLandingProps {
  botUsername?: string;
}

interface AdBannerItem {
  id: string;
  badge: string;
  titleDe: string;
  titleEn: string;
  descDe: string;
  descEn: string;
  ctaDe: string;
  ctaEn: string;
  icon: string;
  gradient: string;
  borderGlow: string;
  targetUrl?: string;
}

export const TelegramRedirectLanding: React.FC<TelegramRedirectLandingProps> = ({
  botUsername = (import.meta.env.VITE_TELEGRAM_BOT_USERNAME as string) || 'coincadebot',
}) => {
  const { language, setLanguage } = useLanguage();
  const isDe = language === 'de';
  const cleanUsername = botUsername.replace(/^@/, '');
  const botUrl = `https://t.me/${cleanUsername}`;
  const directAdUrl = (import.meta.env.VITE_MONETAG_DIRECT_LINK as string) || botUrl;

  const topBanners: AdBannerItem[] = [
    {
      id: 'top-ad-1',
      badge: 'SPONSOR',
      icon: '⚡',
      titleDe: 'Krypto & Web3 Gaming Deals 2026',
      titleEn: 'Crypto & Web3 Gaming Deals 2026',
      descDe: 'Exklusive Krypto Boni, Airdrops & Partnerangebote sichern.',
      descEn: 'Claim exclusive crypto bonuses, airdrops & partner rewards.',
      ctaDe: 'Jetzt entdecken',
      ctaEn: 'Explore Now',
      gradient: 'linear-gradient(135deg, rgba(14, 165, 233, 0.15) 0%, rgba(99, 102, 241, 0.12) 100%)',
      borderGlow: 'rgba(14, 165, 233, 0.35)',
      targetUrl: directAdUrl,
    },
    {
      id: 'top-ad-2',
      badge: 'PROMO',
      icon: '💎',
      titleDe: 'Top Krypto Börsen & Staking',
      titleEn: 'Top Crypto Exchanges & Staking',
      descDe: 'Geringste Trading-Gebühren & hohe Renditen für Gamer.',
      descEn: 'Lowest trading fees & highest yields for crypto gamers.',
      ctaDe: 'Mehr erfahren',
      ctaEn: 'Learn More',
      gradient: 'linear-gradient(135deg, rgba(236, 72, 153, 0.14) 0%, rgba(139, 92, 246, 0.12) 100%)',
      borderGlow: 'rgba(236, 72, 153, 0.35)',
      targetUrl: directAdUrl,
    },
  ];

  const bottomBanners: AdBannerItem[] = [
    {
      id: 'bottom-ad-1',
      badge: 'FEATURED',
      icon: '🔥',
      titleDe: 'Telegram Bot Hubs & Mini Apps',
      titleEn: 'Telegram Bot Hubs & Mini Apps',
      descDe: 'Die beliebtesten Play-to-Earn Games im Telegram Ökosystem.',
      descEn: 'The hottest Play-to-Earn games in the Telegram ecosystem.',
      ctaDe: 'Kostenlos starten',
      ctaEn: 'Start Free',
      gradient: 'linear-gradient(135deg, rgba(245, 158, 11, 0.14) 0%, rgba(239, 68, 68, 0.12) 100%)',
      borderGlow: 'rgba(245, 158, 11, 0.35)',
      targetUrl: directAdUrl,
    },
    {
      id: 'bottom-ad-2',
      badge: 'AIRDROP',
      icon: '🎁',
      titleDe: 'LTC / BTC Season Airdrops & Rewards',
      titleEn: 'LTC / BTC Season Airdrops & Rewards',
      descDe: 'Erreiche Top-Platzierungen und gewinne echte Kryptowährungen.',
      descEn: 'Reach top leaderboard ranks and win verified cryptocurrency.',
      ctaDe: 'Mitspielen',
      ctaEn: 'Join Contest',
      gradient: 'linear-gradient(135deg, rgba(34, 197, 94, 0.14) 0%, rgba(6, 182, 212, 0.12) 100%)',
      borderGlow: 'rgba(34, 197, 94, 0.35)',
      targetUrl: botUrl,
    },
  ];

  // Initialize Monetag In-App / In-Page Push Monetization on landing mount for web visitors
  React.useEffect(() => {
    try {
      const showFn = (window as any).show_11624183;
      if (typeof showFn === 'function') {
        showFn({
          type: 'inApp',
          inAppSettings: {
            frequency: 1,
            capping: 0.1,
            interval: 20,
            timeout: 3,
            everyPage: false,
          },
        }).catch(() => {});
      }
    } catch (e) {
      console.warn('[MONETAG LANDING]: Note triggering InApp banner:', e);
    }
  }, []);

  const handleBannerClick = (url?: string) => {
    // 1. Trigger Monetag Pop / In-App Ad via SDK
    try {
      const showFn = (window as any).show_11624183;
      if (typeof showFn === 'function') {
        showFn('pop').catch(() => {});
      }
    } catch (e) {}

    // 2. Open configured Monetag Direct Link or target URL
    const target = (import.meta.env.VITE_MONETAG_DIRECT_LINK as string) || url || botUrl;
    if (target) {
      window.open(target, '_blank', 'noopener,noreferrer');
    }
  };

  const renderBannerSlot = (banner: AdBannerItem) => (
    <div
      key={banner.id}
      onClick={() => handleBannerClick(banner.targetUrl)}
      style={{
        width: '100%',
        maxWidth: '480px',
        background: banner.gradient,
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        border: `1px solid ${banner.borderGlow}`,
        borderRadius: '18px',
        padding: '12px 16px',
        boxShadow: '0 8px 24px -6px rgba(0, 0, 0, 0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px',
        cursor: 'pointer',
        transition: 'transform 0.18s ease, box-shadow 0.18s ease',
        boxSizing: 'border-box',
        position: 'relative',
        overflow: 'hidden',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-2px)';
        e.currentTarget.style.boxShadow = `0 12px 28px -6px rgba(0,0,0,0.8), 0 0 16px ${banner.borderGlow}`;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.boxShadow = '0 8px 24px -6px rgba(0, 0, 0, 0.6)';
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0, flex: 1 }}>
        <div style={{
          width: '38px',
          height: '38px',
          borderRadius: '12px',
          background: 'rgba(255, 255, 255, 0.08)',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '20px',
          flexShrink: 0,
        }}>
          {banner.icon}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
            <span style={{
              fontSize: '9px',
              fontWeight: 900,
              color: '#00f2fe',
              background: 'rgba(0, 242, 254, 0.15)',
              padding: '2px 6px',
              borderRadius: '4px',
              letterSpacing: '0.05em',
            }}>
              {banner.badge}
            </span>
            <span style={{ fontSize: '9.5px', color: '#64748b', fontWeight: 600 }}>
              {isDe ? 'Anzeige' : 'Ad'}
            </span>
          </div>
          <div style={{
            fontSize: '13px',
            fontWeight: 800,
            color: '#fff',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}>
            {isDe ? banner.titleDe : banner.titleEn}
          </div>
          <div style={{
            fontSize: '11px',
            color: '#94a3b8',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}>
            {isDe ? banner.descDe : banner.descEn}
          </div>
        </div>
      </div>

      <div style={{
        padding: '6px 12px',
        borderRadius: '10px',
        background: 'rgba(255, 255, 255, 0.08)',
        border: '1px solid rgba(255, 255, 255, 0.18)',
        color: '#fff',
        fontSize: '11px',
        fontWeight: 800,
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        flexShrink: 0,
      }}>
        <span>{isDe ? banner.ctaDe : banner.ctaEn}</span>
        <ExternalLink size={11} style={{ opacity: 0.7 }} />
      </div>
    </div>
  );

  return (
    <div style={{
      minHeight: '100vh',
      background: 'radial-gradient(circle at top, #0b1120 0%, #030712 100%)',
      color: '#f8fafc',
      fontFamily: "'Outfit', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: '20px 16px 40px 16px',
      position: 'relative',
      overflowX: 'hidden',
      boxSizing: 'border-box',
    }}>
      {/* Background Animated Neon Glow Spheres */}
      <div style={{
        position: 'fixed', top: '10%', left: '50%', transform: 'translate(-50%, -50%)',
        width: '420px', height: '420px', borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(0, 242, 254, 0.12) 0%, rgba(0, 242, 254, 0) 70%)',
        pointerEvents: 'none', zIndex: 0,
      }} />
      <div style={{
        position: 'fixed', bottom: '10%', left: '50%', transform: 'translate(-50%, 50%)',
        width: '460px', height: '460px', borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(99, 102, 241, 0.12) 0%, rgba(99, 102, 241, 0) 70%)',
        pointerEvents: 'none', zIndex: 0,
      }} />

      {/* ── 2 TOP AD BANNERS (Strictly visible only to direct web visitors) ── */}
      <div style={{
        width: '100%',
        maxWidth: '480px',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        marginBottom: '16px',
        zIndex: 1,
      }}>
        {topBanners.map(renderBannerSlot)}
      </div>

      {/* ── MAIN GLASSMORPHIC REDIRECT CARD (Center, Unobscured) ── */}
      <div style={{
        width: '100%',
        maxWidth: '480px',
        background: 'rgba(15, 23, 42, 0.90)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: '28px',
        padding: '32px 24px',
        boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.85), 0 0 50px rgba(0, 242, 254, 0.12)',
        position: 'relative',
        zIndex: 1,
        boxSizing: 'border-box',
      }}>
        {/* Top Glow Accent Line */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: '3px',
          background: 'linear-gradient(90deg, #00f2fe, #38bdf8, #818cf8, #c084fc)',
          borderTopLeftRadius: '28px', borderTopRightRadius: '28px',
        }} />

        {/* Top Header: Badge & Language Switcher */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '22px' }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px',
            background: 'rgba(0, 242, 254, 0.1)',
            border: '1px solid rgba(0, 242, 254, 0.3)',
            borderRadius: '9999px', padding: '5px 12px',
            color: '#00f2fe', fontSize: '11px', fontWeight: 800,
            textTransform: 'uppercase', letterSpacing: '0.06em',
          }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#00f2fe', boxShadow: '0 0 8px #00f2fe' }} />
            Telegram Mini App
          </div>

          {/* Language Switcher */}
          <div style={{
            display: 'flex', alignItems: 'center',
            background: 'rgba(30, 41, 59, 0.85)',
            padding: '3px', borderRadius: '9999px',
            border: '1px solid rgba(255, 255, 255, 0.12)',
          }}>
            <Globe size={13} style={{ color: '#94a3b8', marginLeft: '6px', marginRight: '4px' }} />
            <button
              type="button"
              onClick={() => setLanguage('de')}
              style={{
                padding: '4px 9px', borderRadius: '9999px', border: 'none',
                background: isDe ? '#00f2fe' : 'transparent',
                color: isDe ? '#020617' : '#94a3b8',
                fontSize: '11px', fontWeight: 800, cursor: 'pointer', transition: 'all 0.2s',
              }}
            >
              DE
            </button>
            <button
              type="button"
              onClick={() => setLanguage('en')}
              style={{
                padding: '4px 9px', borderRadius: '9999px', border: 'none',
                background: !isDe ? '#00f2fe' : 'transparent',
                color: !isDe ? '#020617' : '#94a3b8',
                fontSize: '11px', fontWeight: 800, cursor: 'pointer', transition: 'all 0.2s',
              }}
            >
              EN
            </button>
          </div>
        </div>

        {/* Logo & Headline */}
        <div style={{ textAlign: 'center', marginBottom: '22px' }}>
          <img
            src="/coincade-logo.png"
            alt="COINCADE"
            style={{
              height: '46px', maxWidth: '240px', width: 'auto',
              objectFit: 'contain', margin: '0 auto 10px auto', display: 'block',
              filter: 'drop-shadow(0 0 16px rgba(0, 242, 254, 0.5))',
            }}
          />
          <div style={{ fontSize: '11.5px', fontWeight: 800, color: '#00f2fe', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            {isDe ? 'Offizieller Telegram Arcade & Krypto Hub' : 'Official Telegram Arcade & Crypto Hub'}
          </div>
        </div>

        {/* Info Card Box */}
        <div style={{
          background: 'rgba(2, 6, 23, 0.75)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '20px', padding: '18px 18px',
          marginBottom: '20px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '15px', fontWeight: 800, color: '#fff', marginBottom: '8px' }}>
            <Gamepad2 size={20} color="#00f2fe" />
            <span>{isDe ? 'Direkte Konto-Verknüpfung via Telegram' : 'Direct Account Link via Telegram'}</span>
          </div>
          <p style={{ fontSize: '13px', lineHeight: 1.6, color: '#cbd5e1', margin: 0 }}>
            {isDe ? (
              <>
                Herzlich willkommen bei <strong>CoinCade</strong>! Um dein Spielerkonto direkt und sicher mit deinem Telegram-Profil zu verknüpfen, deine Highscores aufzuzeichnen und an den echten <strong>Krypto Season Airdrops (LTC / BTC)</strong> teilzunehmen, öffne die Mini App bitte direkt in unserem Telegram Bot.
              </>
            ) : (
              <>
                Welcome to <strong>CoinCade</strong>! To securely link your player account directly to your Telegram profile, record highscores on live leaderboards, and compete for real <strong>Crypto Season Airdrops (LTC / BTC)</strong>, please launch the Mini App inside our official Telegram Bot.
              </>
            )}
          </p>
        </div>

        {/* 3-Step Guide */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '22px', textAlign: 'center' }}>
          <div style={{ background: 'rgba(30, 41, 59, 0.55)', border: '1px solid rgba(255, 255, 255, 0.06)', borderRadius: '14px', padding: '12px 6px' }}>
            <span style={{ display: 'block', fontSize: '15px', fontWeight: 900, color: '#00f2fe', marginBottom: '2px' }}>1</span>
            <span style={{ fontSize: '11px', color: '#cbd5e1', fontWeight: 800 }}>{isDe ? 'Bot öffnen' : 'Open Bot'}</span>
          </div>
          <div style={{ background: 'rgba(30, 41, 59, 0.55)', border: '1px solid rgba(255, 255, 255, 0.06)', borderRadius: '14px', padding: '12px 6px' }}>
            <span style={{ display: 'block', fontSize: '15px', fontWeight: 900, color: '#38bdf8', marginBottom: '2px' }}>2</span>
            <span style={{ fontSize: '11px', color: '#cbd5e1', fontWeight: 800 }}>{isDe ? 'Start tippen' : 'Press Start'}</span>
          </div>
          <div style={{ background: 'rgba(30, 41, 59, 0.55)', border: '1px solid rgba(255, 255, 255, 0.06)', borderRadius: '14px', padding: '12px 6px' }}>
            <span style={{ display: 'block', fontSize: '15px', fontWeight: 900, color: '#4ade80', marginBottom: '2px' }}>3</span>
            <span style={{ fontSize: '11px', color: '#cbd5e1', fontWeight: 800 }}>{isDe ? 'Spielen & Gewinnen' : 'Play & Win'}</span>
          </div>
        </div>

        {/* Giant Glowing CTA Button */}
        <a
          href={botUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '10px',
            width: '100%',
            padding: '16px 20px',
            borderRadius: '18px',
            background: 'linear-gradient(135deg, #00f2fe 0%, #38bdf8 50%, #818cf8 100%)',
            color: '#020617',
            fontSize: '15px',
            fontWeight: 900,
            textDecoration: 'none',
            boxShadow: '0 0 28px rgba(0, 242, 254, 0.45), 0 10px 20px rgba(0,0,0,0.4)',
            transition: 'all 0.2s ease',
            boxSizing: 'border-box',
          }}
        >
          <Send size={19} />
          <span>{isDe ? `Im Telegram Bot starten (@${cleanUsername})` : `Launch in Telegram Bot (@${cleanUsername})`}</span>
          <ArrowRight size={17} style={{ opacity: 0.85 }} />
        </a>

        <div style={{ textAlign: 'center', fontSize: '11.5px', color: '#64748b', marginTop: '12px' }}>
          {isDe ? 'Direktlink zum Bot:' : 'Direct Bot Link:'}{' '}
          <a href={botUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#00f2fe', textDecoration: 'none', fontFamily: 'monospace', fontWeight: 700 }}>
            t.me/{cleanUsername}
          </a>
        </div>

        {/* Footer Feature Badges */}
        <div style={{
          marginTop: '22px', paddingTop: '16px',
          borderTop: '1px solid rgba(255, 255, 255, 0.08)',
          display: 'flex', justifyContent: 'space-around',
          fontSize: '11px', color: '#94a3b8', fontWeight: 700,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <Trophy size={13} color="#fbbf24" />
            <span>Leaderboards</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <Flame size={13} color="#f97316" />
            <span>Token Burns</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <Sparkles size={13} color="#00f2fe" />
            <span>LTC / BTC Payouts</span>
          </div>
        </div>
      </div>

      {/* ── 2 BOTTOM AD BANNERS (Strictly visible only to direct web visitors) ── */}
      <div style={{
        width: '100%',
        maxWidth: '480px',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        marginTop: '16px',
        zIndex: 1,
      }}>
        {bottomBanners.map(renderBannerSlot)}
      </div>
    </div>
  );
};

