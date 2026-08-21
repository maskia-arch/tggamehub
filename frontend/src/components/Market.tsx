import { useState, useEffect, useCallback, useRef } from 'react';
import { TrendingUp, Flame, DollarSign, ArrowUpRight, ArrowDownRight, BarChart2, ShieldAlert, CheckCircle2, Zap, Target } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';

interface MarketProps {
  initData: string;
  backendUrl: string;
  onBalanceUpdate?: () => void;
}

interface MarketCoin {
  symbol: string;
  name: string;
  gameId: string;
  currentPrice: number;
  basePrice: number;
  virtualGameReserve?: number;
  virtualTokenReserve?: number;
  constantProductK?: number;
  circulatingSupply: number;
  totalBurned: number;
  volume24h: number;
  volume1h?: number;
  change24hPercent: number;
  targetScore?: number;
  hourlyBoost?: {
    tier: 'NONE' | 'BRONZE' | 'SILBER' | 'GOLD' | 'PLATIN';
    label: string;
    multiplier: number;
    hourlyPoints: number;
    hourlyRounds?: number;
    difficultyFactor: number;
    nextTierTarget: number;
    nextTierLabel: string;
    progressPercent: number;
  };
  updatedAt: string;
}

interface MarketEvent {
  id: number;
  coinSymbol: string;
  eventType: string;
  title: string;
  description: string;
  priceImpactPercent: number;
  createdAt: string;
}

interface UserPortfolioItem {
  coinSymbol: string;
  coinName: string;
  amount: number;
  avgBuyPrice: number;
  currentPrice: number;
  currentValue: number;
  totalInvested: number;
  pnlCash: number;
  pnlPercent: number;
}

interface MarketOverviewData {
  userCash: number;
  coins: MarketCoin[];
  portfolio: UserPortfolioItem[];
  events: MarketEvent[];
}

interface CandlePoint {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  timestamp: string;
  isBullish: boolean;
}

const formatPrice = (price: number): string => {
  if (price < 0.00001) {
    return price.toFixed(10) + ' $';
  } else if (price < 0.001) {
    return price.toFixed(8) + ' $';
  } else if (price < 0.1) {
    return price.toFixed(6) + ' $';
  }
  return price.toFixed(4) + ' $';
};

const formatTokens = (amount: number): string => {
  if (amount >= 1e12) {
    return (amount / 1e12).toFixed(2) + 'T';
  } else if (amount >= 1e9) {
    return (amount / 1e9).toFixed(2) + 'B';
  } else if (amount >= 1e6) {
    return (amount / 1e6).toFixed(2) + 'M';
  } else if (amount >= 1000) {
    return (amount / 1000).toFixed(2) + 'K';
  }
  return amount.toFixed(2);
};

const formatBurnedTokens = (amount: number): string => {
  const num = Number(amount || 0);
  if (num >= 1000000) return (num / 1000000).toFixed(2) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  if (num >= 10) return num.toFixed(0);
  if (num > 0) return num.toFixed(1);
  return '0';
};

export function Market({ initData, backendUrl, onBalanceUpdate }: MarketProps) {
  const { t } = useLanguage();
  const [data, setData] = useState<MarketOverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedSymbol, setSelectedSymbol] = useState<string>('DOODLE');
  const [chartData, setChartData] = useState<CandlePoint[]>([]);
  const [loadingChart, setLoadingChart] = useState(false);
  const [hoveredCandle, setHoveredCandle] = useState<CandlePoint | null>(null);
  const [timeframe, setTimeframe] = useState<'30m' | '60m' | '12h' | '24h'>('30m');

  const [activeTab, setActiveTab] = useState<'market' | 'trade' | 'portfolio'>('market');
  const [tradeType, setTradeType] = useState<'BUY' | 'SELL'>('BUY');
  const [tradeAmount, setTradeAmount] = useState<string>('');
  const [trading, setTrading] = useState(false);
  const [tradeSuccessMsg, setTradeSuccessMsg] = useState<string | null>(null);

  const CANONICAL_COIN_ORDER = ['DOODLE', 'FLAPPY'];
  const sortedCoins = [...(data?.coins || [])].sort((a, b) => {
    const iA = CANONICAL_COIN_ORDER.indexOf(a.symbol.toUpperCase());
    const iB = CANONICAL_COIN_ORDER.indexOf(b.symbol.toUpperCase());
    if (iA !== -1 && iB !== -1) return iA - iB;
    return a.symbol.localeCompare(b.symbol);
  });

  // Dynamically derive selectedCoin from sorted coins and selectedSymbol (prevents object reference loops)
  const selectedCoin = sortedCoins.find((c) => c.symbol === selectedSymbol) || sortedCoins[0] || null;

  // Stable refs to prevent async race conditions during interval polls
  const selectedSymbolRef = useRef(selectedSymbol);
  selectedSymbolRef.current = selectedSymbol;

  const timeframeRef = useRef(timeframe);
  timeframeRef.current = timeframe;

  // Pure overview data fetch (does not mutate selected symbol state)
  const fetchMarket = useCallback(async () => {
    if (!initData) return;
    try {
      const response = await fetch(`${backendUrl}/api/market/overview`, {
        headers: { Authorization: `Bearer ${initData}` },
      });
      if (!response.ok) throw new Error('Fehler beim Laden der Börsendaten');
      const marketData: MarketOverviewData = await response.json();
      if (marketData && marketData.coins) {
        marketData.coins.sort((a, b) => {
          const iA = CANONICAL_COIN_ORDER.indexOf(a.symbol.toUpperCase());
          const iB = CANONICAL_COIN_ORDER.indexOf(b.symbol.toUpperCase());
          if (iA !== -1 && iB !== -1) return iA - iB;
          return a.symbol.localeCompare(b.symbol);
        });
      }
      setData(marketData);
    } catch (err: any) {
      console.error('Market fetch error:', err);
      setError(err.message || 'Verbindung zur Börse fehlgeschlagen');
    } finally {
      setLoading(false);
    }
  }, [initData, backendUrl]);

  // Chart data fetch with race-condition guard ensuring responses only apply to the currently selected symbol
  const fetchChart = useCallback(async (symbol: string, tf: string = timeframeRef.current) => {
    if (!initData || !symbol) return;
    const cleanSymbol = symbol.replace('$', '').toUpperCase();
    setLoadingChart(true);
    try {
      const response = await fetch(`${backendUrl}/api/market/chart/${cleanSymbol}?timeframe=${tf}`, {
        headers: { Authorization: `Bearer ${initData}` },
      });
      if (response.ok) {
        const resData = await response.json();
        if (selectedSymbolRef.current === cleanSymbol && timeframeRef.current === tf) {
          setChartData(resData.history || []);
        }
      }
    } catch (err) {
      console.warn('Chart fetch error:', err);
    } finally {
      setLoadingChart(false);
    }
  }, [initData, backendUrl]);

  // Fetch chart instantly when user selects a different coin or timeframe
  useEffect(() => {
    if (selectedSymbol) {
      setChartData([]); // Instant feedback reset
      fetchChart(selectedSymbol, timeframe);
    }
  }, [selectedSymbol, timeframe, fetchChart]);

  // Continuous background 1-second polling (uncoupled from state re-renders)
  useEffect(() => {
    fetchMarket();
    const interval = setInterval(() => {
      fetchMarket();
      if (selectedSymbolRef.current) {
        fetchChart(selectedSymbolRef.current, timeframeRef.current);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [fetchMarket, fetchChart]);

  const handleSelectCoinForTrade = (coin: MarketCoin, type: 'BUY' | 'SELL' = 'BUY') => {
    setSelectedSymbol(coin.symbol);
    setTradeType(type);
    setTradeAmount('');
    setTradeSuccessMsg(null);
    setActiveTab('trade');
  };

  const handleExecuteTrade = async () => {
    if (!selectedCoin || !tradeAmount || parseFloat(tradeAmount) <= 0) return;
    setTrading(true);
    setTradeSuccessMsg(null);
    setError(null);
    try {
      const response = await fetch(`${backendUrl}/api/market/trade`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${initData}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          symbol: selectedCoin.symbol,
          tradeType,
          amount: parseFloat(tradeAmount),
        }),
      });

      const resData = await response.json();
      if (!response.ok) throw new Error(resData.error || resData.message || 'Handel fehlgeschlagen');

      setTradeSuccessMsg(resData.message);
      setTradeAmount('');
      await fetchMarket();
      if (selectedCoin?.symbol) await fetchChart(selectedCoin.symbol);
      if (onBalanceUpdate) onBalanceUpdate();
    } catch (err: any) {
      setError(err.message || 'Fehler beim Ausführen des Orders');
    } finally {
      setTrading(false);
    }
  };

  // Calculate totals for portfolio
  const portfolioTotalValue = data?.portfolio.reduce((sum, item) => sum + item.currentValue, 0) || 0;
  const portfolioTotalInvested = data?.portfolio.reduce((sum, item) => sum + item.totalInvested, 0) || 0;
  const portfolioPnlCash = portfolioTotalValue - portfolioTotalInvested;
  const portfolioPnlPercent = portfolioTotalInvested > 0 ? (portfolioPnlCash / portfolioTotalInvested) * 100 : 0;

  // Gas Fee estimate (0.0005 Game$ + 0.1%)
  const numAmount = parseFloat(tradeAmount) || 0;
  const estimatedGas = numAmount > 0 ? Math.max(0.0001, Math.round((0.0005 + (tradeType === 'BUY' ? numAmount : numAmount * (selectedCoin?.currentPrice || 1)) * 0.001) * 10000) / 10000) : 0.0005;

  // Render SVG Live Candlestick (OHLC) Chart
  const renderCandlestickChart = () => {
    if (loadingChart && (!chartData || chartData.length === 0)) {
      return (
        <div style={{ height: '140px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.3)', fontSize: '11px' }}>
          {t.market.loadingCandles}
        </div>
      );
    }

    if (!chartData || chartData.length === 0) {
      return (
        <div style={{ height: '140px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.3)', fontSize: '11px' }}>
          {t.market.noCandles}
        </div>
      );
    }

    const highs = chartData.map((c) => c.high);
    const lows = chartData.map((c) => c.low);
    let minPrice = Math.min(...lows);
    let maxPrice = Math.max(...highs);

    if (minPrice === maxPrice) {
      minPrice = minPrice > 0 ? minPrice * 0.95 : 0.00000001;
      maxPrice = maxPrice > 0 ? maxPrice * 1.05 : 0.00000002;
    }

    const range = maxPrice - minPrice || 0.00000001;
    const width = 340;
    const height = 130;
    const paddingLeft = 10;
    const paddingRight = 45; // Room for price badge
    const paddingTop = 12;
    const paddingBottom = 16;

    const availableWidth = width - paddingLeft - paddingRight;
    const availableHeight = height - paddingTop - paddingBottom;

    const getY = (val: number) => {
      return height - paddingBottom - ((val - minPrice) / range) * availableHeight;
    };

    const candleWidth = Math.max(3, (availableWidth / chartData.length) * 0.65);
    const step = availableWidth / chartData.length;

    const activeCandle = hoveredCandle || chartData[chartData.length - 1];
    const livePrice = chartData[chartData.length - 1]?.close || selectedCoin?.currentPrice || 0.00000001;
    const liveY = getY(livePrice);
    const isLiveBullish = chartData[chartData.length - 1]?.isBullish ?? true;

    return (
      <div style={{ position: 'relative', width: '100%' }}>
        {/* OHLC Bar Header */}
        <div style={{
          display: 'flex', gap: '8px', flexWrap: 'wrap',
          fontSize: '9px', fontFamily: 'monospace',
          color: 'rgba(255,255,255,0.4)', marginBottom: '8px',
          background: 'rgba(0,0,0,0.2)', padding: '4px 8px', borderRadius: '8px',
        }}>
          <span>O: <strong style={{ color: '#fff' }}>{formatPrice(activeCandle.open)}</strong></span>
          <span>H: <strong style={{ color: '#4ade80' }}>{formatPrice(activeCandle.high)}</strong></span>
          <span>L: <strong style={{ color: '#f87171' }}>{formatPrice(activeCandle.low)}</strong></span>
          <span>C: <strong style={{ color: activeCandle.isBullish ? '#4ade80' : '#f87171' }}>{formatPrice(activeCandle.close)}</strong></span>
        </div>

        <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: '140px', overflow: 'visible' }}>
          {/* Horizontal Grid lines */}
          <line x1={paddingLeft} y1={paddingTop} x2={width - paddingRight} y2={paddingTop} stroke="rgba(255,255,255,0.05)" strokeDasharray="2 2" />
          <line x1={paddingLeft} y1={paddingTop + availableHeight / 2} x2={width - paddingRight} y2={paddingTop + availableHeight / 2} stroke="rgba(255,255,255,0.05)" strokeDasharray="2 2" />
          <line x1={paddingLeft} y1={height - paddingBottom} x2={width - paddingRight} y2={height - paddingBottom} stroke="rgba(255,255,255,0.05)" strokeDasharray="2 2" />

          {/* Render Candlesticks */}
          {chartData.map((c, index) => {
            const x = paddingLeft + index * step + step / 2;
            const yHigh = getY(c.high);
            const yLow = getY(c.low);
            const yOpen = getY(c.open);
            const yClose = getY(c.close);

            const bodyY = Math.min(yOpen, yClose);
            const bodyHeight = Math.max(2, Math.abs(yOpen - yClose));
            const color = c.isBullish ? '#4ade80' : '#f87171';

            return (
              <g
                key={index}
                onMouseEnter={() => setHoveredCandle(c)}
                onMouseLeave={() => setHoveredCandle(null)}
                style={{ cursor: 'pointer' }}
              >
                {/* Wick line (High to Low) */}
                <line
                  x1={x} y1={yHigh}
                  x2={x} y2={yLow}
                  stroke={color} strokeWidth="1.2"
                />

                {/* Candle Body */}
                <rect
                  x={x - candleWidth / 2}
                  y={bodyY}
                  width={candleWidth}
                  height={bodyHeight}
                  fill={color}
                  rx="1"
                  style={{ transition: 'all 0.2s' }}
                />
              </g>
            );
          })}

          {/* Live Price Line & Pulsating Dot */}
          <line
            x1={paddingLeft} y1={liveY}
            x2={width - paddingRight + 5} y2={liveY}
            stroke={isLiveBullish ? '#4ade80' : '#f87171'}
            strokeWidth="1"
            strokeDasharray="3 3"
          />

          {/* Live Dot on rightmost candle */}
          <circle
            cx={width - paddingRight}
            cy={liveY}
            r="3"
            fill={isLiveBullish ? '#4ade80' : '#f87171'}
          />
        </svg>

        {/* Timeline Bottom Bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: 'rgba(255,255,255,0.3)', marginTop: '4px' }}>
          <span>
            {timeframe === '30m' ? t.market.timeframe30m : timeframe === '60m' ? t.market.timeframe60m : timeframe === '12h' ? t.market.timeframe12h : t.market.timeframe24h}
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#4ade80' }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#4ade80', display: 'inline-block' }} className="animate-ping" />
            {t.market.liveUpdated}
          </span>
        </div>
      </div>
    );
  };

  /* ──────────────────────────────────────────────────────────────────────── */
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', paddingBottom: '24px' }}>
      
      {/* ── Brand Header ─────────────────────────────────────────────────── */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(74,222,128,0.08) 0%, rgba(0,242,254,0.05) 100%)',
        border: '1px solid rgba(74,222,128,0.2)',
        borderRadius: '22px',
        padding: '20px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        position: 'relative', overflow: 'hidden',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{
            width: '50px', height: '50px', borderRadius: '50%', flexShrink: 0,
            background: 'linear-gradient(135deg, rgba(74,222,128,0.2), rgba(0,242,254,0.15))',
            border: '2px solid rgba(74,222,128,0.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '22px', boxShadow: '0 0 20px rgba(74,222,128,0.15)',
          }}>📈</div>
          <div>
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 900, color: '#fff' }}>{t.market.title}</h2>
            <p style={{ margin: 0, fontSize: '12px', color: 'rgba(255,255,255,0.4)', marginTop: '3px' }}>
              {t.market.subtitle}
            </p>
          </div>
        </div>

        {/* User Game$ Cash pill */}
        {data && (
          <div style={{
            background: 'rgba(74,222,128,0.1)',
            border: '1px solid rgba(74,222,128,0.3)',
            borderRadius: '14px', padding: '8px 14px',
            textAlign: 'right', flexShrink: 0,
          }}>
            <div style={{ fontSize: '9px', fontWeight: 800, color: 'rgba(74,222,128,0.7)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              {t.market.cashBalance}
            </div>
            <div style={{ fontSize: '16px', fontWeight: 900, color: '#4ade80', fontFamily: 'monospace' }}>
              {data.userCash.toFixed(2)} $
            </div>
          </div>
        )}
      </div>

      {/* ── Sub Navigation Tabs ─────────────────────────────────────────── */}
      <div style={{
        display: 'flex', gap: '6px',
        background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: '16px', padding: '5px',
      }}>
        <button
          onClick={() => setActiveTab('market')}
          style={{
            flex: 1, padding: '10px 4px', borderRadius: '12px', border: 'none',
            background: activeTab === 'market' ? 'rgba(255,255,255,0.1)' : 'transparent',
            color: activeTab === 'market' ? '#fff' : 'rgba(255,255,255,0.4)',
            fontSize: '12px', fontWeight: 800, cursor: 'pointer', transition: 'all 0.2s',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px',
          }}
        >
          <BarChart2 size={14} /> {t.nav.market}
        </button>
        <button
          onClick={() => setActiveTab('trade')}
          style={{
            flex: 1, padding: '10px 4px', borderRadius: '12px', border: 'none',
            background: activeTab === 'trade' ? 'rgba(74,222,128,0.15)' : 'transparent',
            color: activeTab === 'trade' ? '#4ade80' : 'rgba(255,255,255,0.4)',
            fontSize: '12px', fontWeight: 800, cursor: 'pointer', transition: 'all 0.2s',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px',
          }}
        >
          <TrendingUp size={14} /> {t.market.trading}
        </button>
        <button
          onClick={() => setActiveTab('portfolio')}
          style={{
            flex: 1, padding: '10px 4px', borderRadius: '12px', border: 'none',
            background: activeTab === 'portfolio' ? 'rgba(0,242,254,0.15)' : 'transparent',
            color: activeTab === 'portfolio' ? 'var(--accent-cyan)' : 'rgba(255,255,255,0.4)',
            fontSize: '12px', fontWeight: 800, cursor: 'pointer', transition: 'all 0.2s',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px',
          }}
        >
          <DollarSign size={14} /> {t.market.portfolio}
        </button>
      </div>

      {/* Error alert */}
      {error && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 16px',
          background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
          borderRadius: '14px', fontSize: '12px', color: '#f87171',
        }}>
          <ShieldAlert size={16} />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-400" style={{ borderBottomColor: '#4ade80' }}></div>
          <span className="text-xs text-gray-400">{t.market.loadingMarket}</span>
        </div>
      ) : (
        <>
          {/* ════════════════════════════════════════════════════════════════ */}
          {/* ── TAB 1: MARKT ÜBERSICHT ────────────────────────────────────── */}
          {activeTab === 'market' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              
              {/* ⚡ Live Markt Triggers Feed */}
              {data?.events && data.events.length > 0 && (
                <div style={{
                  background: 'linear-gradient(135deg, rgba(251,191,36,0.08) 0%, rgba(245,158,11,0.03) 100%)',
                  border: '1px solid rgba(251,191,36,0.25)',
                  borderRadius: '18px', padding: '14px',
                  display: 'flex', flexDirection: 'column', gap: '8px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: 900, color: '#fbbf24', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                      <Zap size={13} className="animate-pulse" /> {t.market.liveTriggersTitle}
                    </div>
                    <div style={{
                      display: 'inline-flex', alignItems: 'center', gap: '4px',
                      background: 'rgba(239, 68, 68, 0.15)',
                      border: '1px solid rgba(239, 68, 68, 0.35)',
                      borderRadius: '9999px', padding: '2px 7px',
                      color: '#f87171', fontSize: '9px', fontWeight: 900,
                      letterSpacing: '0.08em', textTransform: 'uppercase',
                    }}>
                      <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#ef4444', boxShadow: '0 0 6px #ef4444' }} className="animate-pulse" />
                      LIVE
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '140px', overflowY: 'auto' }}>
                    {(() => {
                      const uniqueEvents = (data.events || []).filter((evt, index, self) =>
                        index === self.findIndex((e) =>
                          e.id === evt.id ||
                          (e.coinSymbol === evt.coinSymbol && e.title === evt.title && e.description === evt.description)
                        )
                      );

                      return uniqueEvents.slice(0, 4).map((evt) => {
                        const isPositive = evt.priceImpactPercent >= 0;
                        return (
                          <div
                            key={evt.id}
                            style={{
                              background: 'rgba(0,0,0,0.25)',
                              border: '1px solid rgba(255,255,255,0.05)',
                              borderRadius: '10px', padding: '8px 10px',
                              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                              fontSize: '11px',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span style={{
                                fontWeight: 900, fontSize: '10px', padding: '2px 6px', borderRadius: '6px',
                                background: isPositive ? 'rgba(74,222,128,0.15)' : 'rgba(248,113,113,0.15)',
                                color: isPositive ? '#4ade80' : '#f87171',
                                border: `1px solid ${isPositive ? 'rgba(74,222,128,0.3)' : 'rgba(248,113,113,0.3)'}`,
                              }}>
                                ${evt.coinSymbol}
                              </span>
                              <div>
                                <strong style={{ color: '#fff', fontSize: '11px' }}>{evt.title}</strong>
                                <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.4)' }}>{evt.description}</div>
                              </div>
                            </div>

                            <div style={{
                              fontWeight: 900, fontSize: '11px', fontFamily: 'monospace',
                              color: isPositive ? '#4ade80' : '#f87171', flexShrink: 0,
                            }}>
                              {isPositive ? '+' : ''}{evt.priceImpactPercent.toFixed(2)}%
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>
                </div>
              )}

              {/* 🎯 Stock Price Mechanics Info Banner */}
              <div style={{
                background: 'rgba(0,242,254,0.04)', border: '1px solid rgba(0,242,254,0.15)',
                borderRadius: '14px', padding: '10px 14px', fontSize: '10px', color: 'rgba(255,255,255,0.5)',
                display: 'flex', alignItems: 'center', gap: '8px',
              }}>
                <Target size={16} style={{ color: 'var(--accent-cyan)', flexShrink: 0 }} />
                <span>
                  <strong>{t.games.dynamicAvg}:</strong> {t.market.dynamicsExplanation}
                </span>
              </div>

              {/* Coins List */}
              {sortedCoins.map((coin) => {
                const isPositive = coin.change24hPercent >= 0;
                return (
                  <div
                    key={coin.symbol}
                    onClick={() => handleSelectCoinForTrade(coin)}
                    style={{
                      background: 'rgba(255,255,255,0.02)',
                      border: '1px solid rgba(255,255,255,0.07)',
                      borderRadius: '18px', padding: '16px',
                      cursor: 'pointer', transition: 'all 0.2s',
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{
                        width: '42px', height: '42px', borderRadius: '14px', flexShrink: 0,
                        background: 'rgba(74,222,128,0.1)',
                        border: '1px solid rgba(74,222,128,0.2)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '14px', fontWeight: 900, color: '#4ade80', fontFamily: 'monospace',
                      }}>
                        ${coin.symbol[0]}
                      </div>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontSize: '15px', fontWeight: 900, color: '#fff' }}>${coin.symbol}</span>
                          <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)' }}>{coin.name}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '4px', fontSize: '10px', color: 'rgba(255,255,255,0.35)' }}>
                          <span style={{ color: 'var(--accent-cyan)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '2px' }}>
                            <Target size={10} /> {t.market.liveAverage} {coin.targetScore ? coin.targetScore.toLocaleString() : '---'} Pkt.
                          </span>
                          <span style={{ display: 'flex', alignItems: 'center', gap: '2px', color: '#fbbf24' }}>
                            <Flame size={10} /> {formatBurnedTokens(coin.totalBurned)} {t.market.burned}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '16px', fontWeight: 900, color: '#fff', fontFamily: 'monospace' }}>
                        {formatPrice(coin.currentPrice)}
                      </div>
                      <div style={{
                        display: 'inline-flex', alignItems: 'center', gap: '2px',
                        fontSize: '11px', fontWeight: 800,
                        color: isPositive ? '#4ade80' : '#f87171',
                        marginTop: '3px',
                      }}>
                        {isPositive ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
                        <span>{isPositive ? '+' : ''}{coin.change24hPercent.toFixed(2)}%</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ════════════════════════════════════════════════════════════════ */}
          {/* ── TAB 2: TRADING & CHART ────────────────────────────────────── */}
          {activeTab === 'trade' && selectedCoin && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              
              {/* Coin Selector Bar */}
              <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '4px' }}>
                {sortedCoins.map((c) => (
                  <button
                    key={c.symbol}
                    onClick={() => setSelectedSymbol(c.symbol)}
                    style={{
                      padding: '8px 14px', borderRadius: '12px',
                      border: selectedCoin.symbol === c.symbol ? '1px solid rgba(74,222,128,0.4)' : '1px solid rgba(255,255,255,0.06)',
                      background: selectedCoin.symbol === c.symbol ? 'rgba(74,222,128,0.15)' : 'rgba(255,255,255,0.02)',
                      color: selectedCoin.symbol === c.symbol ? '#4ade80' : 'rgba(255,255,255,0.4)',
                      fontSize: '11px', fontWeight: 800, cursor: 'pointer', flexShrink: 0,
                    }}
                  >
                    ${c.symbol}
                  </button>
                ))}
              </div>

              {/* Chart Card */}
              <div style={{
                background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)',
                borderRadius: '20px', padding: '18px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '18px', fontWeight: 900, color: '#fff' }}>${selectedCoin.symbol}</span>
                      <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)' }}>{selectedCoin.name}</span>
                    </div>
                    {selectedCoin.hourlyBoost && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '6px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '10px', fontWeight: 800, color: '#fbbf24', flexWrap: 'wrap' }}>
                          <span>⚡ 1h Power: {selectedCoin.hourlyBoost.label}</span>
                          <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.45)', background: 'rgba(255,255,255,0.06)', padding: '1px 5px', borderRadius: '4px' }}>
                            {(selectedCoin.hourlyBoost.hourlyPoints ?? Math.round((selectedCoin.hourlyBoost.hourlyRounds || 0) * (selectedCoin.targetScore || 1000))).toLocaleString()} Pkt/Std
                          </span>
                          {selectedCoin.hourlyBoost.difficultyFactor > 1.0 && (
                            <span style={{ fontSize: '9px', color: '#f87171', background: 'rgba(248,113,113,0.12)', border: '1px solid rgba(248,113,113,0.25)', padding: '1px 5px', borderRadius: '4px' }}>
                              +{Math.round((selectedCoin.hourlyBoost.difficultyFactor - 1.0) * 100)}% Diff
                            </span>
                          )}
                        </div>
                        {selectedCoin.hourlyBoost.tier !== 'PLATIN' && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px' }}>
                            <div style={{ flex: 1, height: '4px', background: 'rgba(255,255,255,0.08)', borderRadius: '9999px', overflow: 'hidden' }}>
                              <div style={{ width: `${selectedCoin.hourlyBoost.progressPercent}%`, height: '100%', background: 'linear-gradient(90deg, #f59e0b, #fbbf24)', borderRadius: '9999px', transition: 'width 0.3s' }} />
                            </div>
                            <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.4)', fontWeight: 700, flexShrink: 0 }}>
                              Ziel: {selectedCoin.hourlyBoost.nextTierLabel}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <div style={{ fontSize: '18px', fontWeight: 900, color: '#4ade80', fontFamily: 'monospace' }}>
                    {formatPrice(selectedCoin.currentPrice)}
                  </div>
                </div>

                {/* Timeframe Switcher (30m default, 60m, 12h, 24h) */}
                <div style={{ display: 'flex', gap: '4px', marginBottom: '12px', background: 'rgba(0,0,0,0.3)', padding: '3px', borderRadius: '10px', width: 'fit-content' }}>
                  {(['30m', '60m', '12h', '24h'] as const).map((tf) => (
                    <button
                      key={tf}
                      onClick={() => {
                        setTimeframe(tf);
                        fetchChart(selectedCoin.symbol, tf);
                      }}
                      style={{
                        padding: '4px 10px', borderRadius: '7px', border: 'none',
                        background: timeframe === tf ? 'rgba(74,222,128,0.2)' : 'transparent',
                        color: timeframe === tf ? '#4ade80' : 'rgba(255,255,255,0.4)',
                        fontSize: '10px', fontWeight: 800, cursor: 'pointer', transition: 'all 0.15s',
                      }}
                    >
                      {tf}
                    </button>
                  ))}
                </div>

                {renderCandlestickChart()}
              </div>

              {/* Order Form */}
              <div style={{
                background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)',
                borderRadius: '20px', padding: '18px', display: 'flex', flexDirection: 'column', gap: '12px',
              }}>
                {/* BUY / SELL Switcher */}
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={() => setTradeType('BUY')}
                    style={{
                      flex: 1, padding: '12px', borderRadius: '12px', border: 'none',
                      background: tradeType === 'BUY' ? '#4ade80' : 'rgba(255,255,255,0.05)',
                      color: tradeType === 'BUY' ? '#000' : 'rgba(255,255,255,0.4)',
                      fontSize: '13px', fontWeight: 900, cursor: 'pointer', transition: 'all 0.2s',
                    }}
                  >
                    {t.market.buyDollars}
                  </button>
                  <button
                    onClick={() => setTradeType('SELL')}
                    style={{
                      flex: 1, padding: '12px', borderRadius: '12px', border: 'none',
                      background: tradeType === 'SELL' ? '#f87171' : 'rgba(255,255,255,0.05)',
                      color: tradeType === 'SELL' ? '#000' : 'rgba(255,255,255,0.4)',
                      fontSize: '13px', fontWeight: 900, cursor: 'pointer', transition: 'all 0.2s',
                    }}
                  >
                    {t.market.sellTokens} (${selectedCoin.symbol})
                  </button>
                </div>

                {/* Success Banner */}
                {tradeSuccessMsg && (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px',
                    background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.3)',
                    borderRadius: '12px', fontSize: '11px', color: '#4ade80', fontWeight: 700,
                  }}>
                    <CheckCircle2 size={14} />
                    <span>{tradeSuccessMsg}</span>
                  </div>
                )}

                {/* Amount Input */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'rgba(255,255,255,0.4)', marginBottom: '6px' }}>
                    <span>{tradeType === 'BUY' ? 'Betrag in Game$' : `Tokens ($${selectedCoin.symbol})`}</span>
                    <span>
                      {t.market.available}: {tradeType === 'BUY'
                        ? `${(data?.userCash || 0).toFixed(2)} Game$`
                        : `${(data?.portfolio.find(p => p.coinSymbol === selectedCoin.symbol)?.amount || 0).toFixed(4)} $${selectedCoin.symbol}`}
                    </span>
                  </div>
                  <div style={{ position: 'relative' }}>
                    <input
                      type="number"
                      value={tradeAmount}
                      onChange={(e) => setTradeAmount(e.target.value)}
                      placeholder="0.00"
                      style={{
                        width: '100%', padding: '14px 16px', borderRadius: '14px',
                        background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)',
                        color: '#fff', fontSize: '16px', fontWeight: 800, fontFamily: 'monospace',
                        outline: 'none', boxSizing: 'border-box',
                      }}
                    />
                    <button
                      onClick={() => {
                        if (tradeType === 'BUY') {
                          const maxCash = Math.max(0, (data?.userCash || 0) - 0.02);
                          setTradeAmount(maxCash.toFixed(2));
                        } else {
                          const maxTokens = data?.portfolio.find(p => p.coinSymbol === selectedCoin.symbol)?.amount || 0;
                          setTradeAmount(maxTokens.toString());
                        }
                      }}
                      style={{
                        position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)',
                        background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '8px',
                        padding: '4px 8px', color: 'var(--accent-cyan)', fontSize: '10px', fontWeight: 900, cursor: 'pointer',
                      }}
                    >
                      MAX
                    </button>
                  </div>
                </div>

                {/* Calculation Summary */}
                {(() => {
                  const k = selectedCoin.constantProductK || 1e18;
                  const x = selectedCoin.virtualGameReserve || 100000.0;
                  const y = selectedCoin.virtualTokenReserve || 10000000000000.0;

                  let tokensOut = 0;
                  let cashOut = 0;
                  let impactPercent = 0;

                  if (numAmount > 0) {
                    if (tradeType === 'BUY') {
                      const newX = x + numAmount;
                      const newY = k / newX;
                      tokensOut = Math.max(0, y - newY);
                      const spotAfter = newX / newY;
                      impactPercent = ((spotAfter - selectedCoin.currentPrice) / selectedCoin.currentPrice) * 100;
                    } else {
                      const newY = y + numAmount;
                      const newX = k / newY;
                      const grossCash = Math.max(0, x - newX);
                      cashOut = Math.max(0, grossCash - estimatedGas);
                      const spotAfter = newX / newY;
                      impactPercent = ((spotAfter - selectedCoin.currentPrice) / selectedCoin.currentPrice) * 100;
                    }
                  }

                  return (
                    <div style={{
                      background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.05)',
                      borderRadius: '12px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '6px',
                      fontSize: '11px', color: 'rgba(255,255,255,0.5)',
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>{tradeType === 'BUY' ? t.market.receivedTokens : t.market.receivedCash}</span>
                        <span style={{ color: '#fff', fontWeight: 800, fontFamily: 'monospace' }}>
                          {tradeType === 'BUY'
                            ? `${numAmount > 0 ? formatTokens(tokensOut) : '0'} $${selectedCoin.symbol}`
                            : `${numAmount > 0 ? cashOut.toFixed(4) : '0.0000'} Game$`}
                        </span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>{t.market.estimatedGas}</span>
                        <span style={{ color: '#fbbf24', fontWeight: 700 }}>{estimatedGas.toFixed(4)} Game$</span>
                      </div>
                      {numAmount > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '4px', marginTop: '2px' }}>
                          <span>{t.market.estimatedImpact}</span>
                          <span style={{
                            color: impactPercent >= 0 ? '#4ade80' : '#f87171',
                            fontWeight: 700,
                            fontFamily: 'monospace',
                          }}>
                            {impactPercent >= 0 ? `+${impactPercent.toFixed(2)}% 🟢` : `${impactPercent.toFixed(2)}% 🔴`}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Action Submit Button */}
                <button
                  onClick={handleExecuteTrade}
                  disabled={trading || !tradeAmount || parseFloat(tradeAmount) <= 0}
                  style={{
                    width: '100%', padding: '16px', borderRadius: '14px', border: 'none',
                    background: tradeType === 'BUY' ? '#4ade80' : '#f87171',
                    color: '#000', fontWeight: 900, fontSize: '14px',
                    cursor: trading || !tradeAmount ? 'not-allowed' : 'pointer',
                    opacity: trading || !tradeAmount ? 0.5 : 1,
                    transition: 'all 0.2s', marginTop: '4px',
                  }}
                >
                  {trading ? t.market.executingOrder : `${tradeType === 'BUY' ? t.market.buyNow : t.market.sellNow}`}
                </button>
              </div>

            </div>
          )}

          {/* ════════════════════════════════════════════════════════════════ */}
          {/* ── TAB 3: MEIN PORTFOLIO ─────────────────────────────────────── */}
          {activeTab === 'portfolio' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              
              {/* Portfolio Total Summary Card */}
              <div style={{
                background: 'linear-gradient(135deg, rgba(0,242,254,0.08) 0%, rgba(139,92,246,0.05) 100%)',
                border: '1px solid rgba(0,242,254,0.2)',
                borderRadius: '20px', padding: '18px',
              }}>
                <div style={{ fontSize: '10px', fontWeight: 800, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                  {t.market.totalPortfolioValue}
                </div>
                <div style={{ fontSize: '24px', fontWeight: 900, color: '#fff', fontFamily: 'monospace', marginTop: '4px' }}>
                  {portfolioTotalValue.toFixed(2)} Game$
                </div>

                <div style={{ display: 'flex', gap: '16px', marginTop: '12px', paddingTop: '12px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                  <div>
                    <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', fontWeight: 700 }}>{t.market.totalPnl}</div>
                    <div style={{ fontSize: '13px', fontWeight: 900, color: portfolioPnlCash >= 0 ? '#4ade80' : '#f87171' }}>
                      {portfolioPnlCash >= 0 ? '+' : ''}{portfolioPnlCash.toFixed(2)} $
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', fontWeight: 700 }}>{t.market.totalReturn}</div>
                    <div style={{ fontSize: '13px', fontWeight: 900, color: portfolioPnlPercent >= 0 ? '#4ade80' : '#f87171' }}>
                      {portfolioPnlPercent >= 0 ? '+' : ''}{portfolioPnlPercent.toFixed(2)}%
                    </div>
                  </div>
                </div>
              </div>

              {/* Holdings List */}
              <div style={{ fontSize: '11px', fontWeight: 800, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                {t.market.yourPositions}
              </div>

              {(!data?.portfolio || data.portfolio.length === 0) ? (
                <div style={{
                  padding: '32px 16px', textAlign: 'center',
                  background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)',
                  borderRadius: '18px', color: 'rgba(255,255,255,0.4)', fontSize: '12px',
                }}>
                  {t.market.noCoinsYet}<br />{t.market.playOrTrade}
                </div>
              ) : (
                data.portfolio.map((item) => {
                  const isProfitable = item.pnlCash >= 0;
                  const coinMatch = data.coins.find(c => c.symbol === item.coinSymbol);
                  return (
                    <div
                      key={item.coinSymbol}
                      style={{
                        background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)',
                        borderRadius: '18px', padding: '16px',
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontSize: '15px', fontWeight: 900, color: '#fff' }}>${item.coinSymbol}</span>
                          <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)' }}>{item.coinName}</span>
                        </div>
                        <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', marginTop: '4px', fontFamily: 'monospace' }}>
                          {formatTokens(item.amount)} Tokens @ {formatPrice(item.avgBuyPrice)}
                        </div>
                      </div>

                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '15px', fontWeight: 900, color: '#fff', fontFamily: 'monospace' }}>
                          {item.currentValue.toFixed(2)} Game$
                        </div>
                        <div style={{ fontSize: '11px', fontWeight: 800, color: isProfitable ? '#4ade80' : '#f87171', marginTop: '3px' }}>
                          {isProfitable ? '+' : ''}{item.pnlCash.toFixed(2)} $ ({isProfitable ? '+' : ''}{item.pnlPercent.toFixed(2)}%)
                        </div>
                        {coinMatch && (
                          <button
                            onClick={() => handleSelectCoinForTrade(coinMatch, 'SELL')}
                            style={{
                              marginTop: '6px', background: 'rgba(248,113,113,0.15)', border: '1px solid rgba(248,113,113,0.3)',
                              borderRadius: '8px', padding: '3px 8px', color: '#f87171', fontSize: '10px', fontWeight: 800, cursor: 'pointer',
                            }}
                          >
                            {t.market.sellTokens}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}

            </div>
          )}
        </>
      )}

    </div>
  );
}
