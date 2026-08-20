import { useState, useEffect, useRef } from 'react';
import { Copy, Check, ShieldAlert, CheckCircle2, Clock, X, ChevronRight, Trophy, Gift } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';

interface ShopProps {
  initData: string;
  backendUrl: string;
  onPurchaseSuccess: () => void;
  profile?: any;
}

export interface ShopProductItem {
  id: string;
  category: 'energy' | 'time_booster' | 'passes' | 'game_booster';
  name: string;
  description: string;
  priceEur: number;
  badge?: string;
  badgeColor?: string;
  icon: string;
  gradient: string;
  energyAmount?: number;
  boosterHours?: number;
  passType?: 'SEASON' | 'VIP';
}

interface CheckoutSession {
  orderId: string;
  productId: string;
  name: string;
  address: string;
  amountCrypto: number;
  amountEur: number;
  coin: string;
  expiresAt: string;
}

const SHOP_PRODUCTS: ShopProductItem[] = [
  // ── 1. Kategorie: Energie Refills ─────────────────────────────────────────
  {
    id: 'quick_refill',
    category: 'energy',
    name: 'Quick Refill',
    description: '+5 Energie (Sofort-Auffüllung für schnelle Runden)',
    priceEur: 0.99,
    badge: 'Schnellstart',
    badgeColor: '#60a5fa',
    icon: '⚡',
    gradient: 'linear-gradient(135deg, rgba(96,165,250,0.12) 0%, rgba(59,130,246,0.05) 100%)',
    energyAmount: 5,
  },
  {
    id: 'grinder_pack',
    category: 'energy',
    name: 'Grinder Pack',
    description: '+15 Energie (Überfüllung des normalen Caps erlaubt)',
    priceEur: 2.49,
    badge: 'Beliebt',
    badgeColor: '#a78bfa',
    icon: '🔥',
    gradient: 'linear-gradient(135deg, rgba(167,139,250,0.12) 0%, rgba(139,92,246,0.06) 100%)',
    energyAmount: 15,
  },
  {
    id: 'whale_stack',
    category: 'energy',
    name: 'Whale Stack',
    description: '+40 Energie (Entfessle maximale Dominanz auf den Mkt-Charts)',
    priceEur: 5.99,
    badge: 'Bester Wert (-40%)',
    badgeColor: '#fbbf24',
    icon: '👑',
    gradient: 'linear-gradient(135deg, rgba(251,191,36,0.12) 0%, rgba(245,158,11,0.06) 100%)',
    energyAmount: 40,
  },

  // ── 2. Kategorie: Time Booster ───────────────────────────────────────────
  {
    id: 'sprint_pass',
    category: 'time_booster',
    name: 'Sprint Pass',
    description: '3 Stunden unbegrenzt spielen (Spiele verbrauchen 0 ⚡ Energie)',
    priceEur: 1.99,
    icon: '⚡',
    gradient: 'linear-gradient(135deg, rgba(0,242,254,0.12) 0%, rgba(79,172,254,0.05) 100%)',
    boosterHours: 3,
  },
  {
    id: 'session_lock',
    category: 'time_booster',
    name: 'Session Lock',
    description: '6 Stunden unbegrenzt spielen (Ideal für ausgiebige Turniere)',
    priceEur: 3.49,
    icon: '⏱️',
    gradient: 'linear-gradient(135deg, rgba(56,189,248,0.12) 0%, rgba(14,165,233,0.05) 100%)',
    boosterHours: 6,
  },
  {
    id: 'day_trader',
    category: 'time_booster',
    name: 'Day Trader',
    description: '12 Stunden unbegrenzt spielen (Ganztägiges Grinden ohne Cooldown)',
    priceEur: 5.99,
    icon: '🚀',
    gradient: 'linear-gradient(135deg, rgba(168,85,247,0.12) 0%, rgba(147,51,234,0.05) 100%)',
    boosterHours: 12,
  },
  {
    id: 'all_nighter',
    category: 'time_booster',
    name: 'All-Nighter',
    description: '24 Stunden unbegrenzt spielen (Maximale Non-Stop Action)',
    priceEur: 8.99,
    badge: '24h Non-Stop',
    badgeColor: '#ec4899',
    icon: '🌌',
    gradient: 'linear-gradient(135deg, rgba(236,72,153,0.14) 0%, rgba(219,39,119,0.06) 100%)',
    boosterHours: 24,
  },

  // ── 3. Kategorie: Season Pässe ───────────────────────────────────────────
  {
    id: 'season_pass',
    category: 'passes',
    name: 'Season Pass',
    description: 'Permanentes Energie-Cap von 8 (statt 5) für die gesamte Saison, 15 tägliche Ads & 1x täglicher Free-Refill (+5 ⚡).',
    priceEur: 9.99,
    icon: '🏆',
    gradient: 'linear-gradient(135deg, rgba(251,191,36,0.14) 0%, rgba(217,119,6,0.06) 100%)',
    passType: 'SEASON',
  },
  {
    id: 'vip_airdrop_pass',
    category: 'passes',
    name: 'VIP Airdrop Pass',
    description: 'Alle Season-Pass Vorteile + 1.25x Multiplikator auf erspielte Season-/Airdrop-Punkte + exklusiver VIP-Badge im Leaderboard.',
    priceEur: 19.99,
    badge: 'Max Rewards',
    badgeColor: '#f43f5e',
    icon: '👑',
    gradient: 'linear-gradient(135deg, rgba(244,63,94,0.16) 0%, rgba(225,29,72,0.08) 100%)',
    passType: 'VIP',
  },
];

const COIN_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  LTC: { bg: 'rgba(167,139,250,0.1)', border: 'rgba(167,139,250,0.3)', text: '#a78bfa' },
  BTC: { bg: 'rgba(251,191,36,0.1)', border: 'rgba(251,191,36,0.3)', text: '#fbbf24' },
  ETH: { bg: 'rgba(99,102,241,0.1)', border: 'rgba(99,102,241,0.3)', text: '#818cf8' },
  SOL: { bg: 'rgba(52,211,153,0.1)', border: 'rgba(52,211,153,0.3)', text: '#34d399' },
};

export function Shop({ initData, backendUrl, onPurchaseSuccess, profile }: ShopProps) {
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState<'energy' | 'time_booster' | 'passes' | 'game_booster'>('energy');
  const [selectedProduct, setSelectedProduct] = useState<ShopProductItem | null>(null);
  const [selectedCoin, setSelectedCoin] = useState<string>('LTC');
  const [checkout, setCheckout] = useState<CheckoutSession | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedAddr, setCopiedAddr] = useState(false);
  const [copiedAmt, setCopiedAmt] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(1800);
  const [orderStatus, setOrderStatus] = useState<string>('pending');
  const [claimingFreeRefill, setClaimingFreeRefill] = useState(false);
  const pollingInterval = useRef<any>(null);

  const userPassType = profile?.user?.season_pass_type || 'NONE';
  const isTimeBoosterActive = profile?.energy?.isTimeBoosterActive || false;
  const boosterSecondsLeft = profile?.energy?.timeBoosterSecondsLeft || 0;
  const canClaimFreeRefill = profile?.user?.can_claim_free_refill || false;

  const coins = [
    { id: 'LTC', name: 'Litecoin', icon: 'Ł' },
    { id: 'BTC', name: 'Bitcoin', icon: '₿' },
    { id: 'ETH', name: 'Ethereum', icon: 'Ξ' },
    { id: 'SOL', name: 'Solana', icon: '◎' },
  ];

  const handleClaimFreeRefill = async () => {
    setClaimingFreeRefill(true);
    try {
      const response = await fetch(`${backendUrl}/api/user/claim-daily-free-refill`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${initData}`, 'Content-Type': 'application/json' },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Free Refill konnte nicht beansprucht werden.');
      alert('🎉 1x Daily Free-Refill eingelöst (+5 ⚡ Energie)!');
      onPurchaseSuccess();
    } catch (err: any) {
      alert(err.message || 'Fehler beim Abholen des Free-Refills.');
    } finally {
      setClaimingFreeRefill(false);
    }
  };


  const handleBuy = async (product: ShopProductItem) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${backendUrl}/api/shop/checkout`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${initData}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: product.id, coin: selectedCoin }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || data.error || 'Zahlungsfehler beim Checkout');
      setCheckout(data);
      setOrderStatus('pending');
      const msLeft = new Date(data.expiresAt).getTime() - Date.now();
      setSecondsLeft(Math.max(0, Math.floor(msLeft / 1000)));
    } catch (err: any) {
      setError(err.message || 'Netzwerkfehler beim Erstellen der Zahlung.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!checkout || orderStatus === 'paid' || secondsLeft <= 0) return;
    const timer = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) { clearInterval(timer); setOrderStatus('expired'); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [checkout, orderStatus, secondsLeft]);

  useEffect(() => {
    if (!checkout || orderStatus === 'paid' || orderStatus === 'expired') {
      if (pollingInterval.current) clearInterval(pollingInterval.current);
      return;
    }
    const poll = async () => {
      try {
        const response = await fetch(`${backendUrl}/api/shop/order/status/${checkout.orderId}`, {
          headers: { 'Authorization': `Bearer ${initData}` },
        });
        if (response.ok) {
          const data = await response.json();
          setOrderStatus(data.status);
          if (data.status === 'paid') {
            if (pollingInterval.current) clearInterval(pollingInterval.current);
            onPurchaseSuccess();
          }
        }
      } catch (err) { console.warn('Status polling error:', err); }
    };
    pollingInterval.current = setInterval(poll, 4000);
    poll();
    return () => { if (pollingInterval.current) clearInterval(pollingInterval.current); };
  }, [checkout, orderStatus, initData, backendUrl, onPurchaseSuccess]);

  const copyToClipboard = async (text: string, type: 'addr' | 'amt') => {
    try {
      await navigator.clipboard.writeText(text);
      if (type === 'addr') { setCopiedAddr(true); setTimeout(() => setCopiedAddr(false), 2000); }
      else { setCopiedAmt(true); setTimeout(() => setCopiedAmt(false), 2000); }
    } catch { /* ignore */ }
  };

  const formatTime = (secs: number) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    if (h > 0) return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const handleCloseCheckout = () => {
    setCheckout(null); setSelectedProduct(null); setOrderStatus('pending');
    if (pollingInterval.current) clearInterval(pollingInterval.current);
  };

  const getCoinScheme = (coin: string, address: string, amount: number) => {
    const schemeMap: Record<string, string> = { ltc: 'litecoin', btc: 'bitcoin', eth: 'ethereum', sol: 'solana' };
    return `${schemeMap[coin.toLowerCase()] || coin.toLowerCase()}:${address}?amount=${amount}`;
  };

  const visibleProducts = SHOP_PRODUCTS.filter((p) => p.category === activeTab);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', paddingBottom: '24px' }}>

      {!checkout && (
        <>
          {/* ── Shop Header ────────────────────────────────────────────────── */}
          <div style={{
            background: 'linear-gradient(135deg, rgba(0,242,254,0.08) 0%, rgba(167,139,250,0.06) 100%)',
            border: '1px solid rgba(0,242,254,0.15)',
            borderRadius: '22px',
            padding: '18px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            position: 'relative', overflow: 'hidden',
          }}>
            <div>
              <span style={{
                fontSize: '10px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em',
                padding: '3px 8px', borderRadius: '6px',
                background: 'rgba(0,242,254,0.15)', color: 'var(--accent-cyan)',
                border: '1px solid rgba(0,242,254,0.3)',
              }}>
                {t.shop.title}
              </span>
              <h2 style={{ margin: '6px 0 0', fontSize: '18px', fontWeight: 900, color: '#fff' }}>
                {t.shop.subtitle}
              </h2>
            </div>
            <div style={{
              width: '46px', height: '46px', borderRadius: '16px', flexShrink: 0,
              background: 'linear-gradient(135deg, rgba(0,242,254,0.2), rgba(167,139,250,0.15))',
              border: '1px solid rgba(0,242,254,0.3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '22px', boxShadow: '0 0 20px rgba(0,242,254,0.2)',
            }}>⚡</div>
          </div>

          {/* ── Active Status Widgets ─────────────────────────────────────── */}
          {userPassType !== 'NONE' && (
            <div style={{
              background: userPassType === 'VIP'
                ? 'linear-gradient(135deg, rgba(244,63,94,0.14) 0%, rgba(225,29,72,0.06) 100%)'
                : 'linear-gradient(135deg, rgba(251,191,36,0.12) 0%, rgba(245,158,11,0.05) 100%)',
              border: userPassType === 'VIP' ? '1px solid rgba(244,63,94,0.3)' : '1px solid rgba(251,191,36,0.3)',
              borderRadius: '16px', padding: '12px 14px',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Trophy size={16} style={{ color: userPassType === 'VIP' ? '#f43f5e' : '#fbbf24' }} />
                <div>
                  <div style={{ fontSize: '12px', fontWeight: 900, color: '#fff' }}>
                    {userPassType === 'VIP' ? t.shop.vipPassActive : t.shop.seasonPassActive}
                  </div>
                  <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)', marginTop: '2px' }}>
                    Max 8 ⚡ Cap | 15 Ads/Tag {userPassType === 'VIP' && '| 1.25x Multiplier'}
                  </div>
                </div>
              </div>
              {canClaimFreeRefill && (
                <button
                  onClick={handleClaimFreeRefill}
                  disabled={claimingFreeRefill}
                  style={{
                    background: 'linear-gradient(135deg, #4ade80 0%, #22c55e 100%)',
                    border: 'none', borderRadius: '10px', padding: '6px 10px',
                    color: '#000', fontSize: '11px', fontWeight: 900, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: '4px', boxShadow: '0 0 12px rgba(74,222,128,0.3)',
                  }}
                >
                  <Gift size={12} />
                  <span>{t.shop.claimFreeRefill}</span>
                </button>
              )}
            </div>
          )}

          {isTimeBoosterActive && (
            <div style={{
              background: 'linear-gradient(135deg, rgba(0,242,254,0.12) 0%, rgba(59,130,246,0.06) 100%)',
              border: '1px solid rgba(0,242,254,0.3)',
              borderRadius: '16px', padding: '12px 14px',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Clock size={16} style={{ color: 'var(--accent-cyan)' }} />
                <div>
                  <div style={{ fontSize: '12px', fontWeight: 900, color: 'var(--accent-cyan)' }}>
                    {t.shop.timeBoosterActiveBadge}
                  </div>
                  <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)', marginTop: '2px' }}>
                    {t.shop.timeBoosterDesc}
                  </div>
                </div>
              </div>
              <div style={{ fontSize: '12px', fontWeight: 900, color: '#fff', fontFamily: 'monospace' }}>
                {formatTime(boosterSecondsLeft)}
              </div>
            </div>
          )}

          {/* ── Error ──────────────────────────────────────────────────────── */}
          {error && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: '10px',
              padding: '14px 16px',
              background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
              borderRadius: '14px', fontSize: '12px', color: '#f87171',
            }}>
              <ShieldAlert size={16} />
              <span>{error}</span>
            </div>
          )}

          {/* ── Category Tabs ──────────────────────────────────────────────── */}
          <div style={{
            display: 'flex', background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '16px', padding: '4px', gap: '4px',
          }}>
            {[
              { id: 'energy', label: t.shop.energyTab, icon: '⚡' },
              { id: 'time_booster', label: t.shop.timeBoosterTab, icon: '⏱️' },
              { id: 'passes', label: t.shop.passesTab, icon: '🏆' },
              { id: 'game_booster', label: t.shop.boosterTab, icon: '🚀' },
            ].map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  style={{
                    flex: 1, padding: '8px 4px', borderRadius: '12px',
                    border: isActive ? '1px solid rgba(0,242,254,0.4)' : '1px solid transparent',
                    background: isActive ? 'linear-gradient(135deg, rgba(0,242,254,0.2) 0%, rgba(79,172,254,0.1) 100%)' : 'transparent',
                    color: isActive ? '#00f2fe' : 'rgba(255,255,255,0.4)',
                    fontSize: '11px', fontWeight: 800, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px',
                    transition: 'all 0.2s',
                  }}
                >
                  <span style={{ fontSize: '12px' }}>{tab.icon}</span>
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* ── Coin Selector ──────────────────────────────────────────────── */}
          {activeTab !== 'game_booster' && (
            <div style={{
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(255,255,255,0.07)',
              borderRadius: '18px', padding: '14px 16px',
            }}>
              <div style={{ fontSize: '10px', fontWeight: 700, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '8px' }}>
                {t.shop.paymentMethod}
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                {coins.map((c) => {
                  const isActive = selectedCoin === c.id;
                  const colors = COIN_COLORS[c.id];
                  return (
                    <button
                      key={c.id}
                      onClick={() => setSelectedCoin(c.id)}
                      disabled={loading}
                      style={{
                        flex: 1, padding: '8px 4px',
                        borderRadius: '12px',
                        border: isActive ? `1px solid ${colors.border}` : '1px solid rgba(255,255,255,0.06)',
                        background: isActive ? colors.bg : 'rgba(255,255,255,0.02)',
                        color: isActive ? colors.text : 'rgba(255,255,255,0.3)',
                        fontSize: '11px', fontWeight: 800,
                        cursor: 'pointer', transition: 'all 0.2s',
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px',
                      }}
                    >
                      <span style={{ fontSize: '15px' }}>{c.icon}</span>
                      <span style={{ fontSize: '9px' }}>{c.id}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Category 4: Game Booster Empty State Placeholder ────────── */}
          {activeTab === 'game_booster' && (
            <div style={{
              background: 'rgba(255,255,255,0.02)',
              border: '1px dashed rgba(255,255,255,0.15)',
              borderRadius: '22px', padding: '40px 20px',
              display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center',
              gap: '12px',
            }}>
              <div style={{
                width: '56px', height: '56px', borderRadius: '20px',
                background: 'rgba(0,242,254,0.1)', border: '1px solid rgba(0,242,254,0.2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '26px',
              }}>
                🚀
              </div>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 900, color: '#fff' }}>
                {t.shop.gameBoosterComingSoon}
              </h3>
              <p style={{ margin: 0, fontSize: '12px', color: 'rgba(255,255,255,0.5)', maxWidth: '300px', lineHeight: 1.6 }}>
                {t.shop.gameBoosterPlaceholder}
              </p>
            </div>
          )}

          {/* ── Product Cards List ────────────────────────────────────────── */}
          {activeTab !== 'game_booster' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {visibleProducts.map((prod) => (
                <div
                  key={prod.id}
                  style={{
                    background: prod.gradient,
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: '20px',
                    overflow: 'hidden',
                    position: 'relative',
                  }}
                >
                  {/* Badge */}
                  {prod.badge && (
                    <div style={{
                      position: 'absolute', top: '14px', right: '14px',
                      background: `${prod.badgeColor || '#00f2fe'}20`,
                      border: `1px solid ${prod.badgeColor || '#00f2fe'}40`,
                      borderRadius: '8px', padding: '3px 10px',
                      fontSize: '9px', fontWeight: 800, color: prod.badgeColor || '#00f2fe',
                      letterSpacing: '0.08em', textTransform: 'uppercase',
                    }}>
                      {prod.badge}
                    </div>
                  )}

                  <div style={{ padding: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                      <div style={{
                        width: '42px', height: '42px', borderRadius: '14px', flexShrink: 0,
                        background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.08)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '20px',
                      }}>
                        {prod.icon}
                      </div>
                      <div>
                        <div style={{ fontSize: '15px', fontWeight: 900, color: '#fff', lineHeight: 1.2 }}>{prod.name}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px' }}>
                          {prod.energyAmount && (
                            <span style={{ fontSize: '11px', fontWeight: 800, color: '#fbbf24' }}>
                              ⚡ +{prod.energyAmount} {t.header.energy}
                            </span>
                          )}
                          {prod.boosterHours && (
                            <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--accent-cyan)' }}>
                              ⏱️ {prod.boosterHours}h {t.header.unlimitedPlay}
                            </span>
                          )}
                          {prod.passType && (
                            <span style={{ fontSize: '11px', fontWeight: 800, color: '#f43f5e' }}>
                              🏆 Season-Pass
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', margin: '0 0 14px', lineHeight: 1.5 }}>
                      {prod.description}
                    </p>

                    {/* Price & Buy Button */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '20px', fontWeight: 900, color: '#fff', lineHeight: 1 }}>
                          {prod.priceEur.toFixed(2)} €
                        </div>
                        <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)', marginTop: '2px' }}>
                          in {selectedCoin}
                        </div>
                      </div>
                      <button
                        onClick={() => { setSelectedProduct(prod); handleBuy(prod); }}
                        disabled={loading}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '6px',
                          padding: '12px 20px',
                          background: loading && selectedProduct?.id === prod.id ? 'rgba(255,255,255,0.1)' : 'var(--primary-glow)',
                          boxShadow: loading ? 'none' : 'var(--shadow-neon)',
                          border: 'none', borderRadius: '14px',
                          color: '#000', fontWeight: 800, fontSize: '12px',
                          cursor: loading ? 'not-allowed' : 'pointer',
                          opacity: loading && selectedProduct?.id !== prod.id ? 0.5 : 1,
                          transition: 'all 0.2s',
                        }}
                      >
                        {loading && selectedProduct?.id === prod.id ? (
                          <div style={{
                            width: '16px', height: '16px', borderRadius: '50%',
                            border: '2px solid rgba(0,0,0,0.3)', borderTopColor: '#000',
                            animation: 'spin 0.7s linear infinite',
                          }} />
                        ) : (
                          <>{t.shop.buyBtn} <ChevronRight size={14} /></>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Checkout Modal Screen ─────────────────────────────────────────── */}
      {checkout && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* Header */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: '18px', padding: '16px 18px',
          }}>
            <div>
              <div style={{ fontSize: '10px', fontWeight: 700, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{t.shop.orderSummary}</div>
              <div style={{ fontSize: '15px', fontWeight: 900, color: '#fff', marginTop: '2px' }}>{checkout.name}</div>
            </div>
            <button
              onClick={handleCloseCheckout}
              style={{
                background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '10px', padding: '8px 12px',
                color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: '12px',
                display: 'flex', alignItems: 'center', gap: '5px',
              }}
            >
              <X size={13} /> {t.common.cancel}
            </button>
          </div>

          {/* Pending: Payment Screen */}
          {orderStatus === 'pending' && (
            <>
              {/* Timer */}
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                background: secondsLeft < 300 ? 'rgba(239,68,68,0.08)' : 'rgba(251,191,36,0.08)',
                border: `1px solid ${secondsLeft < 300 ? 'rgba(239,68,68,0.2)' : 'rgba(251,191,36,0.2)'}`,
                borderRadius: '14px', padding: '12px',
              }}>
                <Clock size={14} style={{ color: secondsLeft < 300 ? '#f87171' : '#fbbf24' }} />
                <span style={{ fontSize: '13px', fontWeight: 800, color: secondsLeft < 300 ? '#f87171' : '#fbbf24', fontFamily: 'monospace' }}>
                  {formatTime(secondsLeft)}
                </span>
                <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)' }}>{t.shop.remaining}</span>
              </div>

              {/* QR Code */}
              <div style={{
                display: 'flex', justifyContent: 'center', padding: '20px',
                background: '#fff', borderRadius: '20px',
                boxShadow: '0 0 40px rgba(0,242,254,0.08)',
              }}>
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(getCoinScheme(checkout.coin, checkout.address, checkout.amountCrypto))}`}
                  alt="QR Code"
                  style={{ width: '160px', height: '160px', display: 'block' }}
                />
              </div>

              {/* Amount & Address */}
              <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '18px', overflow: 'hidden' }}>
                <div
                  onClick={() => copyToClipboard(String(checkout.amountCrypto), 'amt')}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '16px 18px', cursor: 'pointer',
                    borderBottom: '1px solid rgba(255,255,255,0.05)',
                  }}
                >
                  <div>
                    <div style={{ fontSize: '9px', fontWeight: 700, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '4px' }}>{t.shop.amount}</div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '5px' }}>
                      <span style={{ fontSize: '22px', fontWeight: 900, color: 'var(--accent-cyan)', fontFamily: 'monospace' }}>{checkout.amountCrypto}</span>
                      <span style={{ fontSize: '13px', fontWeight: 700, color: 'rgba(0,242,254,0.6)' }}>{checkout.coin}</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: copiedAmt ? '#4ade80' : 'rgba(255,255,255,0.3)', fontSize: '11px' }}>
                    {copiedAmt ? <><Check size={14} /><span>{t.profile.linkCopied}</span></> : <Copy size={16} />}
                  </div>
                </div>

                <div
                  onClick={() => copyToClipboard(checkout.address, 'addr')}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '16px 18px', cursor: 'pointer', gap: '12px',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '9px', fontWeight: 700, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '4px' }}>
                      {t.shop.address} ({checkout.coin})
                    </div>
                    <span style={{ fontSize: '12px', color: '#e2e8f0', fontFamily: 'monospace', wordBreak: 'break-all', lineHeight: 1.5 }}>
                      {checkout.address}
                    </span>
                  </div>
                  <div style={{ color: copiedAddr ? '#4ade80' : 'rgba(255,255,255,0.3)', flexShrink: 0 }}>
                    {copiedAddr ? <Check size={16} /> : <Copy size={16} />}
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Paid Success */}
          {orderStatus === 'paid' && (
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px',
              padding: '40px 20px', textAlign: 'center',
              background: 'rgba(74,222,128,0.05)', border: '1px solid rgba(74,222,128,0.15)',
              borderRadius: '22px',
            }}>
              <CheckCircle2 size={56} style={{ color: '#4ade80' }} />
              <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 900, color: '#4ade80' }}>{t.shop.paymentSuccess}</h2>
              <div style={{
                background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.15)',
                borderRadius: '16px', padding: '14px 20px',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px',
              }}>
                <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700 }}>{t.shop.activatedPerk}</span>
                <span style={{ fontSize: '20px', fontWeight: 900, color: '#fff' }}>{selectedProduct?.name}</span>
              </div>
              <button
                onClick={handleCloseCheckout}
                style={{
                  background: 'var(--primary-glow)', boxShadow: 'var(--shadow-neon)',
                  border: 'none', borderRadius: '14px', padding: '14px 32px',
                  color: '#000', fontWeight: 800, fontSize: '14px', cursor: 'pointer',
                }}
              >
                {t.shop.done}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
