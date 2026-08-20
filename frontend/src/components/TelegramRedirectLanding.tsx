import React, { useState } from 'react';
import { Send, ExternalLink, Trophy, Sparkles, Globe, Gamepad2, Flame } from 'lucide-react';

interface TelegramRedirectLandingProps {
  botUsername?: string;
}

export const TelegramRedirectLanding: React.FC<TelegramRedirectLandingProps> = ({
  botUsername = (import.meta.env.VITE_TELEGRAM_BOT_USERNAME as string) || 'coincadebot',
}) => {
  const [lang, setLang] = useState<'de' | 'en'>('de');
  const cleanUsername = botUsername.replace(/^@/, '');
  const botUrl = `https://t.me/${cleanUsername}`;

  return (
    <div style={{
      minHeight: '100vh',
      background: 'radial-gradient(circle at top, #0f172a 0%, #020617 100%)',
      color: '#f8fafc',
      fontFamily: "'Outfit', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px 16px',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Background Neon Glow Spheres */}
      <div style={{
        position: 'fixed', top: '15%', left: '50%', transform: 'translate(-50%, -50%)',
        width: '380px', height: '380px', borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(0, 242, 254, 0.12) 0%, rgba(0, 242, 254, 0) 70%)',
        pointerEvents: 'none', zIndex: 0,
      }} />
      <div style={{
        position: 'fixed', bottom: '15%', left: '50%', transform: 'translate(-50%, 50%)',
        width: '420px', height: '420px', borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(99, 102, 241, 0.12) 0%, rgba(99, 102, 241, 0) 70%)',
        pointerEvents: 'none', zIndex: 0,
      }} />

      {/* Main Glassmorphic Container Card */}
      <div style={{
        width: '100%',
        maxWidth: '460px',
        background: 'rgba(15, 23, 42, 0.85)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: '28px',
        padding: '32px 24px',
        boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.7), 0 0 40px rgba(0, 242, 254, 0.1)',
        position: 'relative',
        zIndex: 1,
        boxSizing: 'border-box',
      }}>
        {/* Top Glow Accent Line */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: '3px',
          background: 'linear-gradient(90deg, #00f2fe, #6366f1, #ec4899)',
          borderTopLeftRadius: '28px', borderTopRightRadius: '28px',
        }} />

        {/* Top Bar with Badge & Language Switcher */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px',
            background: 'rgba(0, 242, 254, 0.1)',
            border: '1px solid rgba(0, 242, 254, 0.25)',
            borderRadius: '9999px', padding: '5px 12px',
            color: '#00f2fe', fontSize: '11px', fontWeight: 800,
            textTransform: 'uppercase', letterSpacing: '0.06em',
          }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#00f2fe', boxShadow: '0 0 8px #00f2fe' }} />
            Telegram Mini App
          </div>

          <div style={{
            display: 'flex', alignItems: 'center',
            background: 'rgba(30, 41, 59, 0.8)',
            padding: '3px', borderRadius: '9999px',
            border: '1px solid rgba(255, 255, 255, 0.08)',
          }}>
            <Globe size={13} style={{ color: '#94a3b8', marginLeft: '6px', marginRight: '4px' }} />
            <button
              type="button"
              onClick={() => setLang('de')}
              style={{
                padding: '4px 9px', borderRadius: '9999px', border: 'none',
                background: lang === 'de' ? '#00f2fe' : 'transparent',
                color: lang === 'de' ? '#020617' : '#94a3b8',
                fontSize: '11px', fontWeight: 800, cursor: 'pointer', transition: 'all 0.2s',
              }}
            >
              DE
            </button>
            <button
              type="button"
              onClick={() => setLang('en')}
              style={{
                padding: '4px 9px', borderRadius: '9999px', border: 'none',
                background: lang === 'en' ? '#00f2fe' : 'transparent',
                color: lang === 'en' ? '#020617' : '#94a3b8',
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
              height: '42px', maxWidth: '240px', width: 'auto',
              objectFit: 'contain', margin: '0 auto 10px auto', display: 'block',
              filter: 'drop-shadow(0 0 14px rgba(0, 242, 254, 0.45))',
            }}
          />
          <div style={{ fontSize: '11px', fontWeight: 800, color: '#00f2fe', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Official Telegram Arcade &amp; Crypto Airdrops
          </div>
        </div>

        {/* Info Card Box */}
        <div style={{
          background: 'rgba(2, 6, 23, 0.65)',
          border: '1px solid rgba(255, 255, 255, 0.07)',
          borderRadius: '18px', padding: '18px',
          marginBottom: '20px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '15px', fontWeight: 800, color: '#fff', marginBottom: '8px' }}>
            <Gamepad2 size={20} color="#00f2fe" />
            <span>{lang === 'de' ? 'Spielstart im Telegram Bot erforderlich' : 'Launch inside Telegram Bot required'}</span>
          </div>
          <p style={{ fontSize: '13px', lineHeight: 1.6, color: '#cbd5e1', margin: 0 }}>
            {lang === 'de' ? (
              <>
                <strong>CoinCade</strong> läuft als offizielle <strong>Telegram Mini App</strong>. Um deine Highscores manipulationssicher aufzuzeichnen, im Live-Krypto-Markt zu traden und echte Season-Airdrops (LTC / BTC) zu gewinnen, starte das Spiel bitte direkt über unseren Telegram Bot.
              </>
            ) : (
              <>
                <strong>CoinCade</strong> runs as an official <strong>Telegram Mini App</strong>. To record your highscores securely, trade on the live crypto market, and win real crypto season airdrops (LTC / BTC), please launch the game directly via our Telegram Bot.
              </>
            )}
          </p>
        </div>

        {/* 3-Step Guide */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '22px', textAlign: 'center' }}>
          <div style={{ background: 'rgba(30, 41, 59, 0.5)', border: '1px solid rgba(255, 255, 255, 0.05)', borderRadius: '14px', padding: '12px 6px' }}>
            <span style={{ display: 'block', fontSize: '15px', fontWeight: 900, color: '#00f2fe', marginBottom: '2px' }}>1</span>
            <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 700 }}>{lang === 'de' ? 'Bot öffnen' : 'Open Bot'}</span>
          </div>
          <div style={{ background: 'rgba(30, 41, 59, 0.5)', border: '1px solid rgba(255, 255, 255, 0.05)', borderRadius: '14px', padding: '12px 6px' }}>
            <span style={{ display: 'block', fontSize: '15px', fontWeight: 900, color: '#00f2fe', marginBottom: '2px' }}>2</span>
            <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 700 }}>{lang === 'de' ? 'Start drücken' : 'Press Start'}</span>
          </div>
          <div style={{ background: 'rgba(30, 41, 59, 0.5)', border: '1px solid rgba(255, 255, 255, 0.05)', borderRadius: '14px', padding: '12px 6px' }}>
            <span style={{ display: 'block', fontSize: '15px', fontWeight: 900, color: '#00f2fe', marginBottom: '2px' }}>3</span>
            <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 700 }}>{lang === 'de' ? 'Spielen & Win' : 'Play & Win'}</span>
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
            boxShadow: '0 0 25px rgba(0, 242, 254, 0.4), 0 10px 20px rgba(0,0,0,0.4)',
            transition: 'all 0.2s',
            boxSizing: 'border-box',
          }}
        >
          <Send size={19} />
          <span>{lang === 'de' ? `Im Telegram Bot öffnen (@${cleanUsername})` : `Launch in Telegram Bot (@${cleanUsername})`}</span>
          <ExternalLink size={16} style={{ opacity: 0.75 }} />
        </a>

        <div style={{ textAlign: 'center', fontSize: '11px', color: '#64748b', marginTop: '12px' }}>
          {lang === 'de' ? 'Direktlink:' : 'Direct Link:'}{' '}
          <a href={botUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#00f2fe', textDecoration: 'none', fontFamily: 'monospace', fontWeight: 700 }}>
            t.me/{cleanUsername}
          </a>
        </div>

        {/* Footer Feature Badges */}
        <div style={{
          marginTop: '24px', paddingTop: '18px',
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
            <span>Token Burn</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <Sparkles size={13} color="#00f2fe" />
            <span>LTC / BTC Payouts</span>
          </div>
        </div>
      </div>
    </div>
  );
};

