import { useLanguage } from '../i18n/LanguageContext';

const GermanFlag = () => (
  <svg width="15" height="11" viewBox="0 0 640 480" style={{ borderRadius: '2px', flexShrink: 0, display: 'block' }}>
    <rect width="640" height="160" y="0" fill="#000" />
    <rect width="640" height="160" y="160" fill="#DD0000" />
    <rect width="640" height="160" y="320" fill="#FFCE00" />
  </svg>
);

const UKFlag = () => (
  <svg width="15" height="11" viewBox="0 0 640 480" style={{ borderRadius: '2px', flexShrink: 0, display: 'block' }}>
    <rect width="640" height="480" fill="#012169" />
    <path d="M0,0 L640,480 M640,0 L0,480" stroke="#fff" strokeWidth="60" />
    <path d="M0,0 L640,480 M640,0 L0,480" stroke="#C8102E" strokeWidth="40" />
    <path d="M320,0 V480 M0,240 H640" stroke="#fff" strokeWidth="100" />
    <path d="M320,0 V480 M0,240 H640" stroke="#C8102E" strokeWidth="60" />
  </svg>
);

export function LanguageToggle() {
  const { language, setLanguage } = useLanguage();

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        background: 'rgba(255, 255, 255, 0.04)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: '9999px',
        padding: '2px',
        gap: '2px',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
      }}
    >
      <button
        onClick={() => setLanguage('de')}
        title="Deutsch"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          padding: '3px 7px',
          borderRadius: '9999px',
          border: language === 'de' ? '1px solid rgba(0,242,254,0.4)' : '1px solid transparent',
          background: language === 'de' ? 'rgba(0,242,254,0.15)' : 'transparent',
          color: language === 'de' ? '#00f2fe' : 'rgba(255,255,255,0.4)',
          fontSize: '10px',
          fontWeight: 900,
          cursor: 'pointer',
          transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
          outline: 'none',
          boxShadow: language === 'de' ? '0 0 10px rgba(0,242,254,0.2)' : 'none',
        }}
      >
        <GermanFlag />
        <span>DE</span>
      </button>

      <button
        onClick={() => setLanguage('en')}
        title="English"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          padding: '3px 7px',
          borderRadius: '9999px',
          border: language === 'en' ? '1px solid rgba(0,242,254,0.4)' : '1px solid transparent',
          background: language === 'en' ? 'rgba(0,242,254,0.15)' : 'transparent',
          color: language === 'en' ? '#00f2fe' : 'rgba(255,255,255,0.4)',
          fontSize: '10px',
          fontWeight: 900,
          cursor: 'pointer',
          transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
          outline: 'none',
          boxShadow: language === 'en' ? '0 0 10px rgba(0,242,254,0.2)' : 'none',
        }}
      >
        <UKFlag />
        <span>EN</span>
      </button>
    </div>
  );
}
