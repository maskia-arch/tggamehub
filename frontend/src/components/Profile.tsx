import { useState, useEffect, useRef } from 'react';
import {
  User, Share2, Copy, Check, Tv, Edit3, Wallet,
  Trash2, AlertTriangle, X, ChevronRight, Shield, Clock
} from 'lucide-react';
import { showRewardedAd } from '../services/adsgram';

interface ProfileData {
  user: {
    id: string;
    username: string | null;
    first_name: string | null;
    last_name: string | null;
    display_name: string | null;
    display_name_changed: boolean;
    referral_link: string;
    referrals_count: number;
    daily_ad_count: number;
    daily_ad_limit: number;
    season_pass_type?: 'NONE' | 'SEASON' | 'VIP';
    can_claim_free_refill?: boolean;
    wallet_ltc: string | null;
    deletion_scheduled_at: string | null;
    game_cash?: number;
  };
  energy: {
    current: number;
    max: number;
    nextRechargeInSeconds: number;
    isTimeBoosterActive?: boolean;
    timeBoosterSecondsLeft?: number;
  };
}

interface ProfileProps {
  profile: ProfileData;
  onRefresh: () => void;
  initData: string;
  backendUrl: string;
}

/* ─── Small section card ─────────────────────────────────────────────────── */
function SectionCard({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(255,255,255,0.07)',
      borderRadius: '18px',
      padding: '20px',
      display: 'flex',
      flexDirection: 'column',
      gap: '14px',
      ...style,
    }}>
      {children}
    </div>
  );
}

function SectionTitle({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
      {icon}
      <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)' }}>
        {label}
      </span>
    </div>
  );
}

import { useLanguage } from '../i18n/LanguageContext';

/* ─── Main Component ──────────────────────────────────────────────────────── */
export function Profile({ profile, onRefresh, initData, backendUrl }: ProfileProps) {
  const { t } = useLanguage();
  const [copied, setCopied] = useState(false);
  const [adLoading, setAdLoading] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(profile.energy.nextRechargeInSeconds);

  // Display name state
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(profile.user.display_name || profile.user.first_name || '');
  const [nameSaving, setNameSaving] = useState(false);
  const [nameError, setNameError] = useState('');
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Wallet state
  const [editingWallets, setEditingWallets] = useState(false);
  const [ltcInput, setLtcInput] = useState(profile.user.wallet_ltc || '');
  const [walletSaving, setWalletSaving] = useState(false);
  const [walletError, setWalletError] = useState('');
  const [walletSuccess, setWalletSuccess] = useState(false);

  // Deletion modal state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirming, setDeleteConfirming] = useState(false);
  const [deleteScheduled, setDeleteScheduled] = useState(!!profile.user.deletion_scheduled_at);
  const [deletionTime, setDeletionTime] = useState(profile.user.deletion_scheduled_at);

  // Sync countdown
  useEffect(() => { setSecondsLeft(profile.energy.nextRechargeInSeconds); }, [profile.energy.nextRechargeInSeconds]);
  useEffect(() => {
    if (profile.energy.current >= profile.energy.max || secondsLeft <= 0) return;
    const timer = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) { clearInterval(timer); onRefresh(); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [secondsLeft, profile.energy.current, profile.energy.max, onRefresh]);

  const formatTime = (secs: number) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    return `${h > 0 ? String(h).padStart(2, '0') + ':' : ''}${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  // ── Referral copy ──────────────────────────────────────────────────────────
  const copyReferral = async () => {
    try {
      await navigator.clipboard.writeText(profile.user.referral_link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch { /* ignore */ }
  };

  // ── Watch ad ───────────────────────────────────────────────────────────────
  const watchAd = async () => {
    setAdLoading(true);
    try {
      const adResult = await showRewardedAd();
      if (!adResult.success || !adResult.rewardEarned) {
        if (adResult.error) {
          alert(adResult.error);
        }
        return;
      }

      const res = await fetch(`${backendUrl}/api/user/energy/ad`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${initData}`, 'Content-Type': 'application/json' },
      });
      if (res.ok) {
        onRefresh();
      }
    } catch {
      /* ignore */
    } finally {
      setAdLoading(false);
    }
  };

  // ── Save display name (costs 10 InGame$) ────────────────────────────────────
  const saveDisplayName = async () => {
    const cleanName = nameInput.trim();
    if (!cleanName || cleanName.length < 3 || cleanName.length > 15) {
      setNameError('Anzeigename muss zwischen 3 und 15 Zeichen lang sein.');
      return;
    }

    const currentCash = profile.user.game_cash || 0;
    if (currentCash < 10.0) {
      setNameError(`Zu wenig Game Cash (Kosten: 10.00 $, Dein Guthaben: ${currentCash.toFixed(2)} $).`);
      return;
    }

    setNameSaving(true);
    setNameError('');
    try {
      const res = await fetch(`${backendUrl}/api/user/display-name`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${initData}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: cleanName }),
      });
      const data = await res.json();
      if (!res.ok) {
        setNameError(data.message || data.error || 'Fehler beim Speichern.');
      } else {
        setEditingName(false);
        onRefresh();
      }
    } catch { setNameError('Netzwerkfehler.'); }
    finally { setNameSaving(false); }
  };

  // ── Save LTC wallet ────────────────────────────────────────────────────────
  const saveWallets = async () => {
    setWalletSaving(true);
    setWalletError('');
    setWalletSuccess(false);
    try {
      const res = await fetch(`${backendUrl}/api/user/wallets`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${initData}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet_ltc: ltcInput.trim() || null }),
      });
      const data = await res.json();
      if (!res.ok) {
        setWalletError(data.error || data.message || 'Fehler beim Speichern.');
      } else {
        setWalletSuccess(true);
        setEditingWallets(false);
        onRefresh();
        setTimeout(() => setWalletSuccess(false), 3000);
      }
    } catch { setWalletError('Netzwerkfehler.'); }
    finally { setWalletSaving(false); }
  };

  // ── Schedule deletion ──────────────────────────────────────────────────────
  const scheduleDeletion = async () => {
    setDeleteConfirming(true);
    try {
      const res = await fetch(`${backendUrl}/api/user/delete`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${initData}`, 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (res.ok) {
        setDeleteScheduled(true);
        setDeletionTime(data.deletion_scheduled_at);
        setShowDeleteModal(false);
        // Close the mini app
        const webapp = (window as any).Telegram?.WebApp;
        if (webapp) webapp.close();
      }
    } catch { /* ignore */ }
    finally { setDeleteConfirming(false); }
  };

  // ── Computed values ────────────────────────────────────────────────────────
  const displayName = profile.user.display_name || profile.user.first_name || `Spieler ${profile.user.id.slice(-4)}`;
  const energyPercent = (profile.energy.current / profile.energy.max) * 100;
  const circumference = 2 * Math.PI * 44;
  const strokeDashoffset = circumference - (energyPercent / 100) * circumference;

  /* ════════════════════════════════════════════════════════════════════════ */
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', paddingBottom: '24px' }}>

      {/* ── Hero Profile Card ─────────────────────────────────────────────── */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(0,242,254,0.07) 0%, rgba(255,140,0,0.05) 100%)',
        border: '1px solid rgba(0,242,254,0.15)',
        borderRadius: '22px',
        padding: '24px 20px 20px',
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* Glow blob */}
        <div style={{
          position: 'absolute', top: '-40px', right: '-40px',
          width: '140px', height: '140px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(0,242,254,0.12) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />

        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
          {/* Avatar */}
          <div style={{
            width: '58px', height: '58px', flexShrink: 0,
            borderRadius: '50%',
            background: 'linear-gradient(135deg, rgba(0,242,254,0.2), rgba(255,140,0,0.15))',
            border: '2px solid rgba(0,242,254,0.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 0 20px rgba(0,242,254,0.15)',
          }}>
            <User size={26} style={{ color: 'var(--accent-cyan)' }} />
          </div>

          {/* Name + username */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {editingName ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
                <div style={{ fontSize: '11px', color: 'var(--accent-gold)', fontWeight: 700 }}>
                  {t.profile.nameChangeCostNotice.replace('{cash}', (profile.user.game_cash || 0).toFixed(2))}
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <input
                    ref={nameInputRef}
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    maxLength={15}
                    placeholder={t.profile.enterNamePlaceholder}
                    autoFocus
                    style={{
                      flex: 1, background: 'rgba(0,0,0,0.4)',
                      border: '1px solid rgba(0,242,254,0.35)',
                      borderRadius: '10px', padding: '8px 12px',
                      color: '#fff', fontSize: '14px', fontWeight: 700,
                      outline: 'none',
                    }}
                    onKeyDown={(e) => { if (e.key === 'Enter') saveDisplayName(); if (e.key === 'Escape') setEditingName(false); }}
                  />
                  <button
                    onClick={saveDisplayName}
                    disabled={nameSaving || (profile.user.game_cash || 0) < 10.0}
                    style={{
                      background: (profile.user.game_cash || 0) < 10.0 ? 'rgba(255,255,255,0.1)' : 'var(--primary-glow)',
                      border: 'none',
                      borderRadius: '10px', padding: '8px 14px',
                      color: (profile.user.game_cash || 0) < 10.0 ? 'rgba(255,255,255,0.4)' : '#000',
                      fontWeight: 800, fontSize: '12px',
                      cursor: (profile.user.game_cash || 0) < 10.0 ? 'not-allowed' : 'pointer',
                      opacity: nameSaving ? 0.6 : 1,
                    }}
                  >
                    {nameSaving ? '...' : t.profile.pay10Dollars}
                  </button>
                  <button
                    onClick={() => { setEditingName(false); setNameError(''); }}
                    style={{
                      background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: '10px', padding: '8px 10px',
                      color: '#aaa', cursor: 'pointer',
                    }}
                  >
                    <X size={14} />
                  </button>
                </div>
                {nameError && <span style={{ fontSize: '11px', color: '#f87171' }}>{nameError}</span>}
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '18px', fontWeight: 900, color: '#fff', lineHeight: 1.2 }}>
                  {displayName}
                </span>
                <button
                  onClick={() => { setEditingName(true); setTimeout(() => nameInputRef.current?.focus(), 50); }}
                  title={t.profile.nameChangeButton}
                  style={{
                    background: 'rgba(0,242,254,0.1)', border: '1px solid rgba(0,242,254,0.2)',
                    borderRadius: '8px', padding: '3px 8px',
                    display: 'flex', alignItems: 'center', gap: '4px',
                    cursor: 'pointer', color: 'var(--accent-cyan)', fontSize: '10px', fontWeight: 700,
                  }}
                >
                  <Edit3 size={11} /> {t.profile.nameChangeButton}
                </button>
              </div>
            )}
            <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.35)', marginTop: '3px', display: 'block' }}>
              {profile.user.username ? `@${profile.user.username}` : `ID: ${profile.user.id}`}
            </span>
          </div>

          {/* Referral count badge */}
          <div style={{
            flexShrink: 0, textAlign: 'center',
            background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '14px', padding: '8px 14px',
          }}>
            <div style={{ fontSize: '22px', fontWeight: 900, color: 'var(--accent-cyan)', lineHeight: 1 }}>
              {profile.user.referrals_count}
            </div>
            <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: '2px' }}>
              {t.profile.referrals}
            </div>
          </div>
        </div>

        {/* ── Pending deletion warning ───────────────────────────────────── */}
        {deleteScheduled && deletionTime && (
          <div style={{
            marginTop: '16px',
            background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: '12px', padding: '12px 14px',
            display: 'flex', alignItems: 'center', gap: '10px',
          }}>
            <Clock size={15} style={{ color: '#f87171', flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#f87171' }}>{t.profile.deleteAccountTitle}</div>
              <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.45)', marginTop: '2px' }}>
                {t.profile.deletionPending} {new Date(deletionTime).toLocaleString()}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Energy Card ───────────────────────────────────────────────────── */}
      <SectionCard>
        <SectionTitle icon={<span style={{ fontSize: '13px' }}>⚡</span>} label={t.header.energy} />
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          {/* Circular progress */}
          <div style={{ position: 'relative', width: '90px', height: '90px', flexShrink: 0 }}>
            <svg viewBox="0 0 100 100" width="90" height="90" style={{ transform: 'rotate(-90deg)' }}>
              <circle cx="50" cy="50" r="44" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="7" />
              <circle cx="50" cy="50" r="44" fill="none"
                stroke="url(#eGrad)" strokeWidth="7"
                strokeDasharray={circumference} strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
                style={{ transition: 'stroke-dashoffset 0.8s ease' }}
              />
              <defs>
                <linearGradient id="eGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#ffd358" />
                  <stop offset="100%" stopColor="#ff8c00" />
                </linearGradient>
              </defs>
            </svg>
            <div style={{
              position: 'absolute', inset: 0,
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            }}>
              <span style={{ fontSize: '22px', fontWeight: 900, color: 'var(--accent-orange)', lineHeight: 1 }}>
                {profile.energy.current}
              </span>
              <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.35)', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 700 }}>
                / {profile.energy.max}
              </span>
            </div>
          </div>

          {/* Right col: countdown + ads */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {profile.energy.current < profile.energy.max ? (
              <span style={{ fontSize: '12px', color: 'var(--accent-gold)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '5px' }}>
                🔋 +1 in {formatTime(secondsLeft)}
              </span>
            ) : (
              <span style={{ fontSize: '12px', color: '#4ade80', fontWeight: 700 }}>{t.header.energyFull}</span>
            )}

            {/* Watch ad */}
            <button
              onClick={watchAd}
              disabled={adLoading || profile.user.daily_ad_count >= profile.user.daily_ad_limit}
              style={{
                background: adLoading || profile.user.daily_ad_count >= profile.user.daily_ad_limit ? 'rgba(255,255,255,0.05)' : 'var(--primary-glow)',
                boxShadow: adLoading || profile.user.daily_ad_count >= profile.user.daily_ad_limit ? 'none' : 'var(--shadow-neon)',
                border: 'none', borderRadius: '12px',
                padding: '10px 14px',
                color: adLoading || profile.user.daily_ad_count >= profile.user.daily_ad_limit ? 'rgba(255,255,255,0.3)' : '#000',
                fontWeight: 800, fontSize: '11px', cursor: adLoading || profile.user.daily_ad_count >= profile.user.daily_ad_limit ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                transition: 'all 0.2s',
              }}
            >
              <Tv size={13} />
              {adLoading ? t.common.loading : profile.user.daily_ad_count >= profile.user.daily_ad_limit ? t.header.adLimitReached : t.header.watchAdBtn}
            </button>
            <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.25)' }}>
              {Math.max(0, profile.user.daily_ad_limit - profile.user.daily_ad_count)}/{profile.user.daily_ad_limit} {t.header.videosRemaining}
            </span>
          </div>
        </div>
      </SectionCard>

      {/* ── Referral Program ──────────────────────────────────────────────── */}
      <SectionCard>
        <SectionTitle icon={<Share2 size={12} style={{ color: 'var(--accent-cyan)' }} />} label={t.profile.referralProgram} />
        <button
          onClick={copyReferral}
          style={{
            background: 'rgba(0,242,254,0.05)', border: '1px solid rgba(0,242,254,0.15)',
            borderRadius: '14px', padding: '14px 16px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            cursor: 'pointer', transition: 'all 0.2s', color: '#fff',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', textAlign: 'left' }}>
            <span style={{ fontSize: '13px', fontWeight: 700 }}>{t.profile.referralsTitle}</span>
            <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)' }}>
              {profile.user.referral_link.replace('https://', '')}
            </span>
          </div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            background: copied ? 'rgba(74,222,128,0.15)' : 'rgba(0,242,254,0.1)',
            border: `1px solid ${copied ? 'rgba(74,222,128,0.3)' : 'rgba(0,242,254,0.2)'}`,
            borderRadius: '10px', padding: '6px 12px',
            fontSize: '11px', fontWeight: 700,
            color: copied ? '#4ade80' : 'var(--accent-cyan)',
          }}>
            {copied ? <Check size={13} /> : <Copy size={13} />}
            {copied ? 'Kopiert!' : '+5⚡'}
          </div>
        </button>
      </SectionCard>

      {/* ── Wallet Addresses ──────────────────────────────────────────────── */}
      <SectionCard>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <SectionTitle icon={<Wallet size={12} style={{ color: '#a78bfa' }} />} label={t.profile.payoutAddresses} />
          {!editingWallets && (
            <button
              onClick={() => setEditingWallets(true)}
              style={{
                background: 'rgba(167,139,250,0.1)', border: '1px solid rgba(167,139,250,0.2)',
                borderRadius: '8px', padding: '5px 10px',
                display: 'flex', alignItems: 'center', gap: '4px',
                cursor: 'pointer', color: '#a78bfa', fontSize: '10px', fontWeight: 700,
              }}
            >
              <Edit3 size={11} /> {t.profile.edit}
            </button>
          )}
        </div>

        {editingWallets ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {/* LTC Input */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              <label style={{ fontSize: '10px', fontWeight: 700, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                {t.profile.ltcPayoutAddress}
              </label>
              <input
                value={ltcInput}
                onChange={(e) => setLtcInput(e.target.value)}
                placeholder={t.profile.ltcPlaceholder}
                style={{
                  background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(167,139,250,0.3)',
                  borderRadius: '12px', padding: '11px 14px',
                  color: '#fff', fontSize: '13px', outline: 'none',
                  fontFamily: 'monospace',
                }}
              />
            </div>
            {walletError && <span style={{ fontSize: '11px', color: '#f87171' }}>{walletError}</span>}
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={saveWallets}
                disabled={walletSaving}
                style={{
                  flex: 1, background: 'linear-gradient(135deg, #a78bfa, #818cf8)',
                  border: 'none', borderRadius: '12px', padding: '12px',
                  color: '#fff', fontWeight: 800, fontSize: '12px',
                  cursor: walletSaving ? 'not-allowed' : 'pointer', opacity: walletSaving ? 0.7 : 1,
                }}
              >
                {walletSaving ? t.profile.saving : t.profile.saveLtcAddress}
              </button>
              <button
                onClick={() => { setEditingWallets(false); setWalletError(''); setLtcInput(profile.user.wallet_ltc || ''); }}
                style={{
                  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '12px', padding: '12px 16px',
                  color: '#aaa', cursor: 'pointer', fontSize: '12px',
                }}
              >
                <X size={14} />
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {/* LTC display */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: '10px',
              background: 'rgba(0,0,0,0.2)', borderRadius: '12px', padding: '11px 14px',
              border: '1px solid rgba(255,255,255,0.05)',
            }}>
              <span style={{ fontSize: '16px', flexShrink: 0 }}>🟣</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700 }}>{t.profile.ltcAirdropPayout}</div>
                <div style={{ fontSize: '12px', color: profile.user.wallet_ltc ? '#e2e8f0' : 'rgba(255,255,255,0.2)', fontFamily: 'monospace', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {profile.user.wallet_ltc || t.profile.noAddressSet}
                </div>
              </div>
              {profile.user.wallet_ltc && <Check size={14} style={{ color: '#4ade80', flexShrink: 0 }} />}
            </div>
            {walletSuccess && (
              <div style={{ fontSize: '11px', color: '#4ade80', display: 'flex', alignItems: 'center', gap: '5px' }}>
                <Check size={12} /> {t.profile.ltcSavedSuccess}
              </div>
            )}
            <p style={{ fontSize: '10px', color: 'rgba(255,255,255,0.25)', margin: 0, lineHeight: 1.5 }}>
              {t.profile.ltcPayoutExplanation}
            </p>
          </div>
        )}
      </SectionCard>

      {/* ── Account Security / Danger Zone ───────────────────────────────── */}
      <SectionCard style={{ border: '1px solid rgba(239,68,68,0.15)' }}>
        <SectionTitle icon={<Shield size={12} style={{ color: '#f87171' }} />} label={t.profile.account} />

        <button
          onClick={() => setShowDeleteModal(true)}
          style={{
            width: '100%', background: 'rgba(239,68,68,0.07)',
            border: '1px solid rgba(239,68,68,0.2)',
            borderRadius: '14px', padding: '14px 16px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            cursor: 'pointer', transition: 'all 0.2s', color: '#f87171',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Trash2 size={16} />
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontSize: '13px', fontWeight: 700 }}>{t.profile.deleteAccountTitle}</div>
              <div style={{ fontSize: '10px', color: 'rgba(248,113,113,0.6)', marginTop: '2px' }}>
                {t.profile.deleteAccountSub}
              </div>
            </div>
          </div>
          <ChevronRight size={16} style={{ opacity: 0.5 }} />
        </button>
      </SectionCard>

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 999999,
            background: 'rgba(0,0,0,0.85)',
            backdropFilter: 'blur(8px)',
            display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
            padding: '0 0 24px',
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowDeleteModal(false); }}
        >
          <div style={{
            background: 'linear-gradient(180deg, #0f1623 0%, #0a0e18 100%)',
            border: '1px solid rgba(239,68,68,0.25)',
            borderRadius: '24px 24px 20px 20px',
            padding: '28px 24px 24px',
            width: '100%', maxWidth: '440px',
            boxShadow: '0 -8px 60px rgba(239,68,68,0.15)',
          }}>
            {/* Modal header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{
                  width: '42px', height: '42px', borderRadius: '50%',
                  background: 'rgba(239,68,68,0.12)',
                  border: '1px solid rgba(239,68,68,0.3)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <AlertTriangle size={20} style={{ color: '#f87171' }} />
                </div>
                <div>
                  <div style={{ fontSize: '16px', fontWeight: 900, color: '#f87171' }}>{t.profile.deletionWarningTitle}</div>
                  <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', marginTop: '2px' }}>{t.profile.deleteModalActionIrreversible}</div>
                </div>
              </div>
              <button onClick={() => setShowDeleteModal(false)}
                style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', padding: '8px', cursor: 'pointer', color: '#aaa' }}>
                <X size={16} />
              </button>
            </div>

            {/* Info box */}
            <div style={{
              background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)',
              borderRadius: '14px', padding: '16px',
              marginBottom: '20px',
            }}>
              <ul style={{ margin: 0, paddingLeft: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {[
                  t.profile.bullet1,
                  t.profile.bullet2,
                  t.profile.bullet3,
                  t.profile.bullet4,
                  t.profile.bullet5,
                ].map((item, i) => (
                  <li key={i} style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)', lineHeight: 1.5 }}>{item}</li>
                ))}
              </ul>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <button
                onClick={scheduleDeletion}
                disabled={deleteConfirming}
                style={{
                  background: 'rgba(239,68,68,0.2)',
                  border: '1px solid rgba(239,68,68,0.4)',
                  borderRadius: '14px', padding: '14px',
                  color: '#f87171', fontWeight: 800, fontSize: '13px',
                  cursor: deleteConfirming ? 'not-allowed' : 'pointer',
                  opacity: deleteConfirming ? 0.6 : 1,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                }}
              >
                <Trash2 size={15} />
                {deleteConfirming ? t.profile.processing : t.profile.confirmAndLogout}
              </button>
              <button
                onClick={() => setShowDeleteModal(false)}
                style={{
                  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '14px', padding: '14px',
                  color: '#fff', fontWeight: 700, fontSize: '13px', cursor: 'pointer',
                }}
              >
                {t.common.cancel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
