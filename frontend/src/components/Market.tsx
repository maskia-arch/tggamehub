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
  if (price === undefined || price === null || isNaN(price)) return '0.00 $';
  const num = Number(price);
  if (num === 0) return '0.00 $';
  if (num < 0.0000001) {
    return num.toFixed(12) + ' $';
  } else if (num < 0.0001) {
    return num.toFixed(8) + ' $';
  } else if (num < 0.01) {
    return num.toFixed(6) + ' $';
  } else if (num < 1) {
    return num.toFixed(4) + ' $';
  }
  return num.toFixed(2) + ' $';
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
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [timeframe, setTimeframe] = useState<'30m' | '1h' | '12h' | '24h' | '7d'>('24h');
  const [chartMode, setChartMode] = useState<'candles' | 'area'>('candles');

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
  const fetchMarket = useCallback(async (isBackground = false) => {
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
      setError(null); // Clear error on successful fetch
    } catch (err: any) {
      console.warn('Market fetch warning:', err.message || err);
      // Only show error alert if we don't have any cached data or on initial load
      if (!isBackground) {
        setError(err.message || 'Verbindung zur Börse fehlgeschlagen');
      }
    } finally {
      setLoading(false);
    }
  }, [initData, backendUrl]);

  // Chart data fetch with race-condition guard ensuring responses only apply to the currently selected symbol
  const fetchChart = useCallback(async (symbol: string, tf: string = timeframeRef.current) => {
    if (!initData || !symbol) return;
    const cleanSymbol = symbol.replace('$', '').toUpperCase();
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
      console.warn('Chart fetch warning:', err);
    } finally {
      setLoadingChart(false);
    }
  }, [initData, backendUrl]);

  // Fetch chart instantly when user selects a different coin or timeframe
  useEffect(() => {
    if (selectedSymbol) {
      setError(null);
      setLoadingChart(true);
      fetchChart(selectedSymbol, timeframe);
    }
  }, [selectedSymbol, timeframe, fetchChart]);

  // Visibility-aware background polling (pauses when backgrounded/locked, auto-resumes & fetches immediately upon return)
  useEffect(() => {
    fetchMarket(false);
    if (selectedSymbolRef.current) {
      fetchChart(selectedSymbolRef.current, timeframeRef.current);
    }

    let intervalId: any = null;

    const startPolling = () => {
      if (intervalId) clearInterval(intervalId);
      intervalId = setInterval(() => {
        if (document.visibilityState === 'visible') {
          fetchMarket(true);
          if (selectedSymbolRef.current) {
            fetchChart(selectedSymbolRef.current, timeframeRef.current);
          }
        }
      }, 3000);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        setError(null);
        fetchMarket(false);
        if (selectedSymbolRef.current) {
          fetchChart(selectedSymbolRef.current, timeframeRef.current);
        }
        startPolling();
      } else {
        if (intervalId) clearInterval(intervalId);
      }
    };

    const handleFocus = () => {
      setError(null);
      fetchMarket(false);
      if (selectedSymbolRef.current) {
        fetchChart(selectedSymbolRef.current, timeframeRef.current);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);
    startPolling();

    return () => {
      if (intervalId) clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, [fetchMarket, fetchChart]);

  const handleSelectCoinForTrade = (coin: MarketCoin, type: 'BUY' | 'SELL' = 'BUY', defaultAmount?: number | string) => {
    setSelectedSymbol(coin.symbol);
    setTradeType(type);
    if (defaultAmount !== undefined && defaultAmount !== null && defaultAmount !== '') {
      setTradeAmount(String(defaultAmount));
    } else {
      setTradeAmount('');
    }
    setTradeSuccessMsg(null);
    setError(null);
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

  // Render High-Precision SVG Crypto Chart (Supports Candlestick & Smooth Area Modes)
  const renderCandlestickChart = () => {
    if (loadingChart && (!chartData || chartData.length === 0)) {
      return (
        <div style={{ height: '170px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.4)', fontSize: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#00f2fe' }} className="animate-ping" />
            {t.market.loadingCandles}
          </div>
        </div>
      );
    }

    if (!chartData || chartData.length === 0) {
      return (
        <div style={{ height: '170px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.4)', fontSize: '12px' }}>
          {t.market.noCandles}
        </div>
      );
    }

    const allPrices = chartData.flatMap((c) => [c.open, c.high, c.low, c.close]).filter((p) => !isNaN(p) && p > 0);
    const minVal = allPrices.length > 0 ? Math.min(...allPrices) : (selectedCoin?.currentPrice || 1e-8);
    const maxVal = allPrices.length > 0 ? Math.max(...allPrices) : (selectedCoin?.currentPrice || 1e-8);

    const priceDelta = maxVal - minVal;
    // Add dynamic vertical margin so candles never touch the border
    const margin = Math.max(priceDelta * 0.15, maxVal * 0.02, 1e-12);
    const minPrice = Math.max(0, minVal - margin);
    const maxPrice = maxVal + margin;
    const range = maxPrice - minPrice || 1e-12;

    const width = 360;
    const height = 160;
    const paddingLeft = 8;
    const paddingRight = 74; // Room for price scale text & live pill
    const paddingTop = 14;
    const paddingBottom = 22;

    const availableWidth = width - paddingLeft - paddingRight;
    const availableHeight = height - paddingTop - paddingBottom;

    const getY = (val: number) => {
      const clamped = Math.min(maxPrice, Math.max(minPrice, val));
      return paddingTop + (1 - (clamped - minPrice) / range) * availableHeight;
    };

    const step = availableWidth / chartData.length;
    const candleWidth = Math.max(3.5, Math.min(8.5, step * 0.70));

    const activeIdx = hoverIndex !== null && hoverIndex >= 0 && hoverIndex < chartData.length ? hoverIndex : (chartData.length - 1);
    const activeCandle = chartData[activeIdx] || chartData[chartData.length - 1];

    const candleChangePercent = activeCandle && activeCandle.open > 0
      ? ((activeCandle.close - activeCandle.open) / activeCandle.open) * 100
      : 0;
    const isCandleBullish = activeCandle ? activeCandle.close >= activeCandle.open : true;

    const livePrice = chartData[chartData.length - 1]?.close || selectedCoin?.currentPrice || 1e-8;
    const liveY = getY(livePrice);
    const isLiveBullish = chartData[chartData.length - 1]?.isBullish ?? true;

    // Build SVG Path for Area & Line Mode
    let linePathD = '';
    let areaPathD = '';
    if (chartData.length > 0) {
      const points = chartData.map((c, i) => {
        const x = paddingLeft + i * step + step / 2;
        const y = getY(c.close);
        return { x, y };
      });
      linePathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');
      const firstX = points[0].x.toFixed(2);
      const lastX = points[points.length - 1].x.toFixed(2);
      const bottomY = (height - paddingBottom).toFixed(2);
      areaPathD = `${linePathD} L ${lastX},${bottomY} L ${firstX},${bottomY} Z`;
    }

    const midPrice = minVal + priceDelta / 2;

    const handleSvgMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const clickX = ((e.clientX - rect.left) / rect.width) * width;
      if (clickX >= paddingLeft && clickX <= width - paddingRight) {
        const idx = Math.floor((clickX - paddingLeft) / step);
        if (idx >= 0 && idx < chartData.length) {
          setHoverIndex(idx);
        }
      }
    };

    const handleSvgTouchMove = (e: React.TouchEvent<SVGSVGElement>) => {
      if (e.touches && e.touches[0]) {
        const rect = e.currentTarget.getBoundingClientRect();
        const clickX = ((e.touches[0].clientX - rect.left) / rect.width) * width;
        if (clickX >= paddingLeft && clickX <= width - paddingRight) {
          const idx = Math.floor((clickX - paddingLeft) / step);
          if (idx >= 0 && idx < chartData.length) {
            setHoverIndex(idx);
          }
        }
      }
    };

    return (
      <div style={{ position: 'relative', width: '100%' }}>
        {/* Rich Interactive OHLC Bar Header */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap',
          gap: '6px', fontSize: '9.5px', fontFamily: 'monospace',
          color: 'rgba(255,255,255,0.55)', marginBottom: '8px',
          background: 'rgba(0,0,0,0.35)', padding: '6px 10px', borderRadius: '10px',
          border: '1px solid rgba(255,255,255,0.06)',
        }}>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <span>O: <strong style={{ color: '#fff' }}>{formatPrice(activeCandle.open)}</strong></span>
            <span>H: <strong style={{ color: '#4ade80' }}>{formatPrice(activeCandle.high)}</strong></span>
            <span>L: <strong style={{ color: '#f87171' }}>{formatPrice(activeCandle.low)}</strong></span>
            <span>C: <strong style={{ color: isCandleBullish ? '#4ade80' : '#f87171' }}>{formatPrice(activeCandle.close)}</strong></span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{
              color: isCandleBullish ? '#4ade80' : '#f87171',
              fontWeight: 800,
              background: isCandleBullish ? 'rgba(74,222,128,0.12)' : 'rgba(248,113,113,0.12)',
              padding: '1px 5px', borderRadius: '4px',
            }}>
              {candleChangePercent >= 0 ? '+' : ''}{candleChangePercent.toFixed(2)}%
            </span>
            {activeCandle.volume > 0 && (
              <span style={{ color: '#00f2fe' }}>
                Vol: {formatTokens(activeCandle.volume)}
              </span>
            )}
          </div>
        </div>

        {/* SVG Chart Element */}
        <svg
          viewBox={`0 0 ${width} ${height}`}
          style={{ width: '100%', height: '170px', overflow: 'visible', userSelect: 'none', touchAction: 'none' }}
          onMouseMove={handleSvgMouseMove}
          onMouseLeave={() => setHoverIndex(null)}
          onTouchMove={handleSvgTouchMove}
          onTouchEnd={() => setHoverIndex(null)}
        >
          <defs>
            {/* Neon Area Gradient */}
            <linearGradient id="neonAreaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={isLiveBullish ? '#00f2fe' : '#f43f5e'} stopOpacity="0.32" />
              <stop offset="100%" stopColor={isLiveBullish ? '#00f2fe' : '#f43f5e'} stopOpacity="0.0" />
            </linearGradient>
            {/* Subtle Glow Filter */}
            <filter id="neonGlowFilter" x="-10%" y="-10%" width="120%" height="120%">
              <feDropShadow dx="0" dy="0" stdDeviation="2.5" floodColor={isLiveBullish ? '#00f2fe' : '#f43f5e'} floodOpacity="0.5" />
            </filter>
          </defs>

          {/* Horizontal Reference Grid lines */}
          <line x1={paddingLeft} y1={paddingTop} x2={width - paddingRight} y2={paddingTop} stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
          <line x1={paddingLeft} y1={paddingTop + availableHeight / 2} x2={width - paddingRight} y2={paddingTop + availableHeight / 2} stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
          <line x1={paddingLeft} y1={height - paddingBottom} x2={width - paddingRight} y2={height - paddingBottom} stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />

          {/* Right Y-Axis Price Scale Labels */}
          <text x={width - paddingRight + 6} y={paddingTop + 3} fill="rgba(255,255,255,0.4)" fontSize="8.5" fontFamily="monospace" textAnchor="start">
            {formatPrice(maxVal)}
          </text>
          <text x={width - paddingRight + 6} y={paddingTop + availableHeight / 2 + 3} fill="rgba(255,255,255,0.3)" fontSize="8.5" fontFamily="monospace" textAnchor="start">
            {formatPrice(midPrice)}
          </text>
          <text x={width - paddingRight + 6} y={height - paddingBottom + 3} fill="rgba(255,255,255,0.4)" fontSize="8.5" fontFamily="monospace" textAnchor="start">
            {formatPrice(minVal)}
          </text>

          {/* Volume Bars at Bottom */}
          {chartData.map((c, index) => {
            if (!c.volume || c.volume <= 0) return null;
            const x = paddingLeft + index * step + step / 2;
            const maxVol = Math.max(...chartData.map((d) => d.volume || 0), 1);
            const barH = Math.min(22, (c.volume / maxVol) * 22);
            return (
              <rect
                key={`vol-${index}`}
                x={x - candleWidth / 2}
                y={height - paddingBottom - barH}
                width={candleWidth}
                height={barH}
                fill={c.isBullish ? 'rgba(74,222,128,0.2)' : 'rgba(248,113,113,0.2)'}
                rx="0.5"
              />
            );
          })}

          {/* Render Area/Line Mode */}
          {chartMode === 'area' && areaPathD && (
            <>
              <path d={areaPathD} fill="url(#neonAreaGrad)" />
              <path d={linePathD} fill="none" stroke={isLiveBullish ? '#00f2fe' : '#f43f5e'} strokeWidth="1.8" filter="url(#neonGlowFilter)" />
            </>
          )}

          {/* Render Candlesticks Mode */}
          {chartMode === 'candles' && chartData.map((c, index) => {
            const x = paddingLeft + index * step + step / 2;
            const yHigh = getY(c.high);
            const yLow = getY(c.low);
            const yOpen = getY(c.open);
            const yClose = getY(c.close);

            const bodyY = Math.min(yOpen, yClose);
            const bodyHeight = Math.max(2, Math.abs(yOpen - yClose));
            const color = c.isBullish ? '#22c55e' : '#ef4444';
            const isHovered = hoverIndex === index;

            return (
              <g key={index}>
                {/* Wick line (High to Low) */}
                <line
                  x1={x} y1={yHigh}
                  x2={x} y2={yLow}
                  stroke={color} strokeWidth={isHovered ? '1.8' : '1.2'}
                  opacity={isHovered ? 1 : 0.85}
                />

                {/* Candle Body */}
                <rect
                  x={x - candleWidth / 2}
                  y={bodyY}
                  width={candleWidth}
                  height={bodyHeight}
                  fill={color}
                  rx="1.5"
                  stroke={isHovered ? '#fff' : 'none'}
                  strokeWidth="0.8"
                  style={{ transition: 'fill 0.15s' }}
                />
              </g>
            );
          })}

          {/* Active Hover Crosshair */}
          {hoverIndex !== null && (
            <>
              {/* Vertical Crosshair Line */}
              <line
                x1={paddingLeft + hoverIndex * step + step / 2}
                y1={paddingTop}
                x2={paddingLeft + hoverIndex * step + step / 2}
                y2={height - paddingBottom}
                stroke="rgba(255,255,255,0.4)"
                strokeWidth="1"
                strokeDasharray="2 2"
              />
              {/* Point on active price */}
              <circle
                cx={paddingLeft + hoverIndex * step + step / 2}
                cy={getY(activeCandle.close)}
                r="3.5"
                fill="#fff"
                stroke={isCandleBullish ? '#22c55e' : '#ef4444'}
                strokeWidth="2"
              />
            </>
          )}

          {/* Live Price Horizontal Line & Right Pill Badge */}
          <line
            x1={paddingLeft} y1={liveY}
            x2={width - paddingRight} y2={liveY}
            stroke={isLiveBullish ? '#22c55e' : '#ef4444'}
            strokeWidth="1"
            strokeDasharray="3 3"
            opacity="0.8"
          />

          {/* Live Price Pill on Right Edge */}
          <g transform={`translate(${width - paddingRight + 4}, ${liveY - 7})`}>
            <rect
              width="66" height="14" rx="4"
              fill={isLiveBullish ? '#22c55e' : '#ef4444'}
              filter="drop-shadow(0 0 6px rgba(0,0,0,0.5))"
            />
            <text
              x="33" y="10"
              fill="#000"
              fontSize="7.5"
              fontWeight="900"
              fontFamily="monospace"
              textAnchor="middle"
            >
              {formatPrice(livePrice)}
            </text>
          </g>
        </svg>

        {/* Timeline Bottom Bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: 'rgba(255,255,255,0.35)', marginTop: '6px' }}>
          <span>
            {timeframe === '30m' ? t.market.timeframe30m : timeframe === '1h' ? t.market.timeframe1h : timeframe === '12h' ? t.market.timeframe12h : timeframe === '7d' ? t.market.timeframe7d : t.market.timeframe24h}
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

                {/* Timeframe & Chart Mode Switcher */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6px', marginBottom: '12px', flexWrap: 'wrap' }}>
                  {/* Timeframe Selector */}
                  <div style={{ display: 'flex', gap: '3px', background: 'rgba(0,0,0,0.35)', padding: '3px', borderRadius: '10px' }}>
                    {(['30m', '1h', '12h', '24h', '7d'] as const).map((tf) => (
                      <button
                        key={tf}
                        onClick={() => {
                          setTimeframe(tf);
                          fetchChart(selectedCoin.symbol, tf);
                        }}
                        style={{
                          padding: '4px 9px', borderRadius: '7px', border: 'none',
                          background: timeframe === tf ? 'rgba(74,222,128,0.2)' : 'transparent',
                          color: timeframe === tf ? '#4ade80' : 'rgba(255,255,255,0.4)',
                          fontSize: '10px', fontWeight: 800, cursor: 'pointer', transition: 'all 0.15s',
                        }}
                      >
                        {tf}
                      </button>
                    ))}
                  </div>

                  {/* Mode Toggle: Candles vs Line */}
                  <div style={{ display: 'flex', gap: '3px', background: 'rgba(0,0,0,0.35)', padding: '3px', borderRadius: '10px' }}>
                    <button
                      onClick={() => setChartMode('candles')}
                      style={{
                        padding: '4px 8px', borderRadius: '7px', border: 'none',
                        background: chartMode === 'candles' ? 'rgba(0,242,254,0.2)' : 'transparent',
                        color: chartMode === 'candles' ? '#00f2fe' : 'rgba(255,255,255,0.4)',
                        fontSize: '10px', fontWeight: 800, cursor: 'pointer', transition: 'all 0.15s',
                      }}
                    >
                      🕯️ {t.market.candlesMode || 'Kerzen'}
                    </button>
                    <button
                      onClick={() => setChartMode('area')}
                      style={{
                        padding: '4px 8px', borderRadius: '7px', border: 'none',
                        background: chartMode === 'area' ? 'rgba(0,242,254,0.2)' : 'transparent',
                        color: chartMode === 'area' ? '#00f2fe' : 'rgba(255,255,255,0.4)',
                        fontSize: '10px', fontWeight: 800, cursor: 'pointer', transition: 'all 0.15s',
                      }}
                    >
                      📈 {t.market.lineMode || 'Linie'}
                    </button>
                  </div>
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
                        : `${formatTokens(data?.portfolio.find(p => p.coinSymbol === selectedCoin.symbol)?.amount || 0)} $${selectedCoin.symbol}`}
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
                      type="button"
                      onClick={() => {
                        if (tradeType === 'BUY') {
                          const maxCash = Math.max(0, (data?.userCash || 0));
                          setTradeAmount(maxCash.toFixed(2));
                        } else {
                          const maxTokens = data?.portfolio.find(p => p.coinSymbol === selectedCoin.symbol)?.amount || 0;
                          setTradeAmount(maxTokens.toString());
                        }
                      }}
                      style={{
                        position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)',
                        background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '8px',
                        padding: '4px 8px', color: '#00f2fe', fontSize: '10px', fontWeight: 900, cursor: 'pointer',
                      }}
                    >
                      MAX
                    </button>
                  </div>

                  {/* Quick Percentage Presets */}
                  <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
                    {[25, 50, 75, 100].map((pct) => (
                      <button
                        key={pct}
                        type="button"
                        onClick={() => {
                          if (tradeType === 'BUY') {
                            const userCash = data?.userCash || 0;
                            if (pct === 100) {
                              setTradeAmount(userCash.toFixed(2));
                            } else {
                              const cash = (userCash * pct) / 100;
                              setTradeAmount(cash.toFixed(2));
                            }
                          } else {
                            const holdingTokens = data?.portfolio.find(p => p.coinSymbol === selectedCoin.symbol)?.amount || 0;
                            if (pct === 100) {
                              setTradeAmount(holdingTokens.toString());
                            } else {
                              const tokens = (holdingTokens * pct) / 100;
                              setTradeAmount(tokens.toString());
                            }
                          }
                        }}
                        style={{
                          flex: 1, padding: '5px 0', borderRadius: '8px',
                          border: '1px solid rgba(255,255,255,0.08)',
                          background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.65)',
                          fontSize: '10px', fontWeight: 800, cursor: 'pointer', transition: 'all 0.15s',
                        }}
                      >
                        {pct === 100 ? '100% (MAX)' : `${pct}%`}
                      </button>
                    ))}
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
                        display: 'flex', flexDirection: 'column', gap: '12px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ fontSize: '16px', fontWeight: 900, color: '#fff' }}>${item.coinSymbol}</span>
                            <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)' }}>{item.coinName}</span>
                          </div>
                          <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', marginTop: '4px', fontFamily: 'monospace' }}>
                            {formatTokens(item.amount)} Tokens @ {formatPrice(item.avgBuyPrice)}
                          </div>
                        </div>

                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: '16px', fontWeight: 900, color: '#fff', fontFamily: 'monospace' }}>
                            {item.currentValue.toFixed(2)} Game$
                          </div>
                          <div style={{ fontSize: '11px', fontWeight: 800, color: isProfitable ? '#4ade80' : '#f87171', marginTop: '3px' }}>
                            {isProfitable ? '+' : ''}{item.pnlCash.toFixed(2)} $ ({isProfitable ? '+' : ''}{item.pnlPercent.toFixed(2)}%)
                          </div>
                        </div>
                      </div>

                      {/* Direct Buy & Sell Action Buttons */}
                      {coinMatch && (
                        <div style={{ display: 'flex', gap: '8px', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '10px' }}>
                          <button
                            type="button"
                            onClick={() => handleSelectCoinForTrade(coinMatch, 'BUY')}
                            style={{
                              flex: 1, padding: '7px 0', borderRadius: '10px', border: '1px solid rgba(74,222,128,0.25)',
                              background: 'rgba(74,222,128,0.1)', color: '#4ade80', fontSize: '11px', fontWeight: 800, cursor: 'pointer',
                              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px',
                            }}
                          >
                            <span>+</span> {t.market.buyDollars || 'Kaufen'}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSelectCoinForTrade(coinMatch, 'SELL', item.amount)}
                            style={{
                              flex: 1, padding: '7px 0', borderRadius: '10px', border: '1px solid rgba(248,113,113,0.25)',
                              background: 'rgba(248,113,113,0.1)', color: '#f87171', fontSize: '11px', fontWeight: 800, cursor: 'pointer',
                              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px',
                            }}
                          >
                            <span>⚡</span> {t.market.sellTokens || 'Verkaufen'} (MAX)
                          </button>
                        </div>
                      )}
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
