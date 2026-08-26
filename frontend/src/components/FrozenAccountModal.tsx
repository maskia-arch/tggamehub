import React from 'react';
import { ShieldAlert, Snowflake, MessageCircle, AlertTriangle } from 'lucide-react';

interface FrozenAccountModalProps {
  isFrozen: boolean;
  isBanned: boolean;
  reason?: string | null;
}

export const FrozenAccountModal: React.FC<FrozenAccountModalProps> = ({
  isFrozen,
  isBanned,
  reason,
}) => {
  if (!isFrozen && !isBanned) return null;

  const title = isBanned
    ? 'Account dauerhaft gesperrt'
    : 'Account vorübergehend eingefroren';

  const defaultReason = isBanned
    ? 'Dein Account wurde aufgrund von schwerwiegenden Verstößen gegen die Nutzungsbedingungen gesperrt.'
    : 'Dein Account wurde zu Sicherheitszwecken vorübergehend eingefroren. Alle Spielfunktionen und Transaktionen sind derzeit pausiert.';

  const handleContactSupport = () => {
    // Open Telegram Support Link
    const webapp = (window as any).Telegram?.WebApp;
    if (webapp && typeof webapp.openTelegramLink === 'function') {
      webapp.openTelegramLink('https://t.me/CoinCadeSupport');
    } else {
      window.open('https://t.me/CoinCadeSupport', '_blank');
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 999999,
        background: 'rgba(3, 7, 18, 0.95)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '380px',
          background: 'linear-gradient(180deg, #161b2e 0%, #0d111d 100%)',
          border: isBanned ? '1px solid rgba(239, 68, 68, 0.4)' : '1px solid rgba(0, 242, 254, 0.4)',
          borderRadius: '24px',
          padding: '28px 22px',
          textAlign: 'center',
          boxShadow: isBanned
            ? '0 20px 60px rgba(0,0,0,0.8), 0 0 30px rgba(239, 68, 68, 0.2)'
            : '0 20px 60px rgba(0,0,0,0.8), 0 0 30px rgba(0, 242, 254, 0.2)',
          color: '#fff',
        }}
      >
        {/* Icon Header */}
        <div
          style={{
            width: '72px',
            height: '72px',
            borderRadius: '24px',
            background: isBanned
              ? 'rgba(239, 68, 68, 0.15)'
              : 'rgba(0, 242, 254, 0.15)',
            border: isBanned
              ? '2px solid rgba(239, 68, 68, 0.4)'
              : '2px solid rgba(0, 242, 254, 0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 18px',
          }}
        >
          {isBanned ? (
            <ShieldAlert size={36} style={{ color: '#ef4444' }} />
          ) : (
            <Snowflake size={36} style={{ color: '#00f2fe' }} />
          )}
        </div>

        {/* Status Badge */}
        <span
          style={{
            fontSize: '11px',
            fontWeight: 900,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            padding: '4px 10px',
            borderRadius: '9999px',
            background: isBanned ? 'rgba(239, 68, 68, 0.2)' : 'rgba(0, 242, 254, 0.15)',
            border: isBanned ? '1px solid rgba(239, 68, 68, 0.4)' : '1px solid rgba(0, 242, 254, 0.3)',
            color: isBanned ? '#ef4444' : '#00f2fe',
            display: 'inline-block',
            marginBottom: '12px',
          }}
        >
          {isBanned ? 'STATUS: GEBANNT' : 'STATUS: EINGEFROREN'}
        </span>

        <h2 style={{ margin: '0 0 10px', fontSize: '20px', fontWeight: 900, color: '#fff' }}>
          {title}
        </h2>

        <p style={{ fontSize: '13px', color: 'rgba(255, 255, 255, 0.7)', lineHeight: 1.5, margin: '0 0 16px' }}>
          {reason || defaultReason}
        </p>

        {/* Support Warning Notice Box */}
        <div
          style={{
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '16px',
            padding: '12px 14px',
            textAlign: 'left',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '10px',
            marginBottom: '20px',
          }}
        >
          <AlertTriangle size={18} style={{ color: '#fbbf24', flexShrink: 0, marginTop: '2px' }} />
          <div style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.6)', lineHeight: 1.4 }}>
            Bitte wende dich direkt an unseren Telegram Support, um die Freischaltung deines Profils zu beantragen.
          </div>
        </div>

        {/* Contact Support Button */}
        <button
          onClick={handleContactSupport}
          style={{
            width: '100%',
            padding: '14px',
            borderRadius: '16px',
            background: 'linear-gradient(135deg, #00f2fe 0%, #4facfe 100%)',
            border: 'none',
            color: '#000',
            fontSize: '14px',
            fontWeight: 900,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            cursor: 'pointer',
            boxShadow: '0 4px 20px rgba(0, 242, 254, 0.3)',
          }}
        >
          <MessageCircle size={18} />
          Support kontaktieren
        </button>
      </div>
    </div>
  );
};
