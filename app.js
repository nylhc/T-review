/**
 * CryptoView — TradingView-style Candlestick Chart
 * Data source: Binance Public REST API + WebSocket
 */

'use strict';

/* ============================================================
   ① 常量 & 工具函数
   ============================================================ */

// 平台配置
const PLATFORMS = {
  binance: {
    name: '币安',
    spot: { rest: 'https://api.binance.com/api/v3', ws: 'wss://stream.binance.com:9443/stream' },
    futures: { rest: 'https://fapi.binance.com/fapi/v1', ws: 'wss://fstream.binance.com/stream' },
  },
  // 未来可扩展其他平台
  // okx: {
  //   name: 'OKX',
  //   spot: { rest: 'https://www.okx.com/api/v5/market', ws: 'wss://ws.okx.com:8443/ws/v5/public' },
  // },
};

// 交易对所属平台映射
const SYMBOL_PLATFORM = {
  // 币安现货
  BTCUSDT: 'binance_spot',
  BNBUSDT: 'binance_spot',
  SOLUSDT: 'binance_spot',
  XRPUSDT: 'binance_spot',
  DOGEUSDT: 'binance_spot',
  ADAUSDT: 'binance_spot',
  AVAXUSDT: 'binance_spot',
  DOTUSDT: 'binance_spot',
  MATICUSDT: 'binance_spot',
  // 币安永续合约
  ETHUSDT: 'binance_futures',
  XAUUSDT: 'binance_futures',
  XAGUSDT: 'binance_futures',
  TSLAUSDT: 'binance_futures',
  AAPLUSDT: 'binance_futures',
  NVDAUSDT: 'binance_futures',
  MSFTUSDT: 'binance_futures',
  AMZNUSDT: 'binance_futures',
  GOOGLUSDT: 'binance_futures',
  METAUSDT: 'binance_futures',
  AMDUSDT: 'binance_futures',
};

// 获取交易对的平台信息
function getSymbolPlatform(symbol) {
  const key = SYMBOL_PLATFORM[symbol];
  if (!key) return { platform: 'binance', type: 'spot' };

  const [platform, type] = key.split('_');
  return { platform, type, key };
}

// 获取交易对的显示标签
function getSymbolBadge(symbol, platformKey) {
  const key = platformKey || SYMBOL_PLATFORM[symbol] || 'binance_spot';
  const [platform, type] = key.split('_');
  const platformName = PLATFORMS[platform]?.name || platform;
  const platformBadge = ` <span style="font-size:9px;padding:1px 4px;border-radius:3px;font-weight:600;background:rgba(33,150,243,0.2);color:#2196f3;">${platformName}</span>`;
  if (type === 'futures') {
    const futuresBadge = ` <span style="font-size:9px;padding:1px 4px;border-radius:3px;font-weight:600;background:rgba(255,152,0,0.2);color:#ff9800;">永续</span>`;
    return platformBadge + futuresBadge;
  }
  return platformBadge;
}

// 获取交易对的 API URL
function getSymbolRestUrl(symbol, endpoint = '/klines', platformKey) {
  const key = platformKey || SYMBOL_PLATFORM[symbol] || 'binance_spot';
  const [platform, type] = key.split('_');
  const base = PLATFORMS[platform]?.[type]?.rest || PLATFORMS.binance.spot.rest;
  return `${base}${endpoint}`;
}

function getSymbolWsUrl(symbol, platformKey) {
  const key = platformKey || SYMBOL_PLATFORM[symbol] || 'binance_spot';
  const [platform, type] = key.split('_');
  const base = PLATFORMS[platform]?.[type]?.ws || PLATFORMS.binance.spot.ws;
  return base;
}

const INTERVALS = {
  '1m': '1m',
  '5m': '5m',
  '15m': '15m',
  '1h': '1h',
  '4h': '4h',
  '1d': '1d',
  '1w': '1w',
};

const POPULAR_SYMBOLS = [
  'BTCUSDT',
  'ETHUSDT',
  'XAUUSDT',
  'XAGUSDT',
  'BNBUSDT',
  'SOLUSDT',
  'XRPUSDT',
  'DOGEUSDT',
  'ADAUSDT',
  'AVAXUSDT',
  'DOTUSDT',
  'MATICUSDT',
  'LTCUSDT',
  'LINKUSDT',
  'UNIUSDT',
  'SHIBUSDT',
  'ATOMUSDT',
  'NEARUSDT',
  'FTMUSDT',
  'AAVEUSDT',
];

const fmt = (n, d = 2) => {
  if (n == null || isNaN(n)) return '--';
  if (Math.abs(n) >= 1e9) return (n / 1e9).toFixed(2) + 'B';
  if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(2) + 'K';
  return n.toFixed(d);
};

const fmtPrice = (n) => {
  if (n == null || isNaN(n)) return '--';
  if (n >= 10000) return n.toFixed(1);
  if (n >= 100) return n.toFixed(2);
  if (n >= 1) return n.toFixed(4);
  return n.toFixed(6);
};

const fmtTime = (ts, interval) => {
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, '0');
  if (interval === '1d' || interval === '1w') {
    return `${d.getMonth() + 1}/${d.getDate()}`;
  }
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const fmtDateFull = (ts) => {
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, '0');
  const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
  return `周${weekdays[d.getDay()]} ${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/* ============================================================
   ② 指标计算
   ============================================================ */
const Indicators = {
  sma(closes, period) {
    const result = new Array(closes.length).fill(null);
    for (let i = period - 1; i < closes.length; i++) {
      let sum = 0;
      for (let j = i - period + 1; j <= i; j++) sum += closes[j];
      result[i] = sum / period;
    }
    return result;
  },

  ema(closes, period) {
    const result = new Array(closes.length).fill(null);
    const k = 2 / (period + 1);
    let ema = null;
    for (let i = 0; i < closes.length; i++) {
      if (ema === null) {
        if (i < period - 1) continue;
        let sum = 0;
        for (let j = 0; j < period; j++) sum += closes[j];
        ema = sum / period;
      } else {
        ema = closes[i] * k + ema * (1 - k);
      }
      result[i] = ema;
    }
    return result;
  },

  bollinger(closes, period = 20, mult = 2) {
    const mid = this.sma(closes, period);
    const upper = [],
      lower = [];
    for (let i = 0; i < closes.length; i++) {
      if (mid[i] == null) {
        upper.push(null);
        lower.push(null);
        continue;
      }
      let variance = 0;
      for (let j = i - period + 1; j <= i; j++) variance += Math.pow(closes[j] - mid[i], 2);
      const std = Math.sqrt(variance / period);
      upper.push(mid[i] + mult * std);
      lower.push(mid[i] - mult * std);
    }
    return { mid, upper, lower };
  },

  // MACD 指标计算 (12, 26, 9)
  macd(closes, fast = 12, slow = 26, signal = 9) {
    const emaFast = this.ema(closes, fast);
    const emaSlow = this.ema(closes, slow);
    const dif = closes.map((_, i) =>
      emaFast[i] != null && emaSlow[i] != null ? emaFast[i] - emaSlow[i] : null,
    );
    const dea = this.ema(
      dif.map((v) => v ?? 0),
      signal,
    ).map((v, i) => (dif[i] != null ? v : null));
    const macd = dif.map((v, i) => (v != null && dea[i] != null ? (v - dea[i]) * 2 : null));
    return { dif, dea, macd };
  },

  rsi(closes, period = 14) {
    const result = new Array(closes.length).fill(null);
    if (closes.length < period + 1) return result;
    let gains = 0,
      losses = 0;
    for (let i = 1; i <= period; i++) {
      const diff = closes[i] - closes[i - 1];
      if (diff > 0) gains += diff;
      else losses -= diff;
    }
    let avgGain = gains / period,
      avgLoss = losses / period;
    result[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
    for (let i = period + 1; i < closes.length; i++) {
      const diff = closes[i] - closes[i - 1];
      avgGain = (avgGain * (period - 1) + Math.max(diff, 0)) / period;
      avgLoss = (avgLoss * (period - 1) + Math.max(-diff, 0)) / period;
      result[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
    }
    return result;
  },

  // 超级趋势指标 (SuperTrend) - 标准实现
  // period: ATR周期, multiplier: 倍数
  superTrend(data, period = 10, multiplier = 3) {
    const len = data.length;
    const result = {
      upper: new Array(len).fill(null),
      lower: new Array(len).fill(null),
      trend: new Array(len).fill(null), // 1 = 上涨, -1 = 下跌
      value: new Array(len).fill(null), // 当前趋势线值
    };

    if (len < period) return result;

    // 计算 ATR (使用 Wilder's RMA)
    const atr = this._atrWilder(data, period);

    // 计算基础上下轨 (HL2 ± multiplier * ATR)
    for (let i = period; i < len; i++) {
      const hl2 = (data[i].high + data[i].low) / 2;
      const upper = hl2 + multiplier * atr[i];
      const lower = hl2 - multiplier * atr[i];

      if (i === period) {
        // 初始化
        result.upper[i] = upper;
        result.lower[i] = lower;
        result.trend[i] = data[i].close > upper ? -1 : 1;
        result.value[i] = result.trend[i] === 1 ? lower : upper;
      } else {
        // 计算上轨：取当前上轨和前一个上轨的较小值（但不超过当前计算值）
        // 如果收盘价突破上轨，则重置
        if (data[i - 1].close > result.upper[i - 1]) {
          result.upper[i] = upper;
        } else {
          result.upper[i] = Math.min(upper, result.upper[i - 1]);
        }

        // 计算下轨：取当前下轨和前一个下轨的较大值（但不低于当前计算值）
        // 如果收盘价跌破下轨，则重置
        if (data[i - 1].close < result.lower[i - 1]) {
          result.lower[i] = lower;
        } else {
          result.lower[i] = Math.max(lower, result.lower[i - 1]);
        }

        // 判断趋势
        if (data[i].close > result.upper[i - 1]) {
          result.trend[i] = 1; // 上涨
        } else if (data[i].close < result.lower[i - 1]) {
          result.trend[i] = -1; // 下跌
        } else {
          result.trend[i] = result.trend[i - 1];
        }

        result.value[i] = result.trend[i] === 1 ? result.lower[i] : result.upper[i];
      }
    }

    return result;
  },

  // ATR (Average True Range) 辅助计算 - SMA 版本
  _atr(data, period) {
    const len = data.length;
    const tr = new Array(len).fill(0);
    const atr = new Array(len).fill(null);

    for (let i = 0; i < len; i++) {
      if (i === 0) {
        tr[i] = data[i].high - data[i].low;
      } else {
        const tr1 = data[i].high - data[i].low;
        const tr2 = Math.abs(data[i].high - data[i - 1].close);
        const tr3 = Math.abs(data[i].low - data[i - 1].close);
        tr[i] = Math.max(tr1, tr2, tr3);
      }
    }

    // 使用 SMA 计算 ATR
    for (let i = period - 1; i < len; i++) {
      let sum = 0;
      for (let j = i - period + 1; j <= i; j++) {
        sum += tr[j];
      }
      atr[i] = sum / period;
    }

    return atr;
  },

  // ATR (Average True Range) - Wilder's RMA 版本 (更平滑，主流图表常用)
  _atrWilder(data, period) {
    const len = data.length;
    const tr = new Array(len).fill(0);
    const atr = new Array(len).fill(null);

    // 计算 True Range
    for (let i = 0; i < len; i++) {
      if (i === 0) {
        tr[i] = data[i].high - data[i].low;
      } else {
        const tr1 = data[i].high - data[i].low;
        const tr2 = Math.abs(data[i].high - data[i - 1].close);
        const tr3 = Math.abs(data[i].low - data[i - 1].close);
        tr[i] = Math.max(tr1, tr2, tr3);
      }
    }

    // 使用 Wilder's RMA 计算 ATR
    // RMA = (前一日 RMA * (period - 1) + 当日 TR) / period
    for (let i = period - 1; i < len; i++) {
      if (i === period - 1) {
        // 第一个值使用 SMA
        let sum = 0;
        for (let j = 0; j < period; j++) {
          sum += tr[j];
        }
        atr[i] = sum / period;
      } else {
        // 后续使用 RMA
        atr[i] = (atr[i - 1] * (period - 1) + tr[i]) / period;
      }
    }

    return atr;
  },

  // SuperTrend Avg (Exact) 指标
  // 基于 SuperTrend 轨道的动态平均值
  superTrendAvg(data, period = 10, multiplier = 3) {
    const len = data.length;
    const result = {
      avg: new Array(len).fill(null), // 最终的平均值线
      max: new Array(len).fill(null), // 最大值追踪
      min: new Array(len).fill(null), // 最小值追踪
      upper: new Array(len).fill(null), // 上轨
      lower: new Array(len).fill(null), // 下轨
      trend: new Array(len).fill(null), // 趋势状态 (1=多头, 0=空头)
      spt: new Array(len).fill(null), // SuperTrend 线
    };

    if (len < period) return result;

    // 计算 ATR
    const atr = this._atrWilder(data, period);

    // 初始化变量
    let upper = 0;
    let lower = 0;
    let maxVal = 0;
    let minVal = 0;
    let os = 0; // 趋势状态
    let spt = 0; // SuperTrend 线

    for (let i = period; i < len; i++) {
      const hl2 = (data[i].high + data[i].low) / 2;
      const atrVal = atr[i];
      const up = hl2 + multiplier * atrVal;
      const dn = hl2 - multiplier * atrVal;

      if (i === period) {
        // 初始化
        upper = up;
        lower = dn;
        os = data[i].close > upper ? 1 : 0;
        spt = os === 1 ? lower : upper;
        maxVal = data[i].close;
        minVal = data[i].close;
      } else {
        // 计算上轨
        upper = data[i - 1].close < result.upper[i - 1] ? Math.min(up, result.upper[i - 1]) : up;
        // 计算下轨
        lower = data[i - 1].close > result.lower[i - 1] ? Math.max(dn, result.lower[i - 1]) : dn;
        // 判断趋势
        os =
          data[i].close > result.upper[i - 1]
            ? 1
            : data[i].close < result.lower[i - 1]
              ? 0
              : result.trend[i - 1];
        // SuperTrend 线
        spt = os === 1 ? lower : upper;

        // 计算 max
        if (
          data[i].close === spt ||
          (data[i].close > spt && data[i - 1].close <= spt) ||
          (data[i].close < spt && data[i - 1].close >= spt)
        ) {
          // 交叉时
          maxVal = Math.max(result.max[i - 1] || data[i].close, data[i].close);
        } else if (os === 1) {
          // 多头趋势
          maxVal = Math.max(data[i].close, result.max[i - 1] || data[i].close);
        } else {
          // 空头趋势
          maxVal = Math.min(spt, result.max[i - 1] || spt);
        }

        // 计算 min
        if (
          data[i].close === spt ||
          (data[i].close > spt && data[i - 1].close <= spt) ||
          (data[i].close < spt && data[i - 1].close >= spt)
        ) {
          // 交叉时
          minVal = Math.min(result.min[i - 1] || data[i].close, data[i].close);
        } else if (os === 0) {
          // 空头趋势
          minVal = Math.min(data[i].close, result.min[i - 1] || data[i].close);
        } else {
          // 多头趋势
          minVal = Math.max(spt, result.min[i - 1] || spt);
        }
      }

      // 存储结果
      result.upper[i] = upper;
      result.lower[i] = lower;
      result.trend[i] = os;
      result.spt[i] = spt;
      result.max[i] = maxVal;
      result.min[i] = minVal;
      result.avg[i] = (maxVal + minVal) / 2;
    }

    return result;
  },

  // Pi Cycle Bottom 指标
  // 长均线：SMA(close, 471) * 0.745
  // 短均线：EMA(close, 150)
  // 当短 EMA 向下穿越长 SMA 时产生卖出信号
  piCycleBottom(data) {
    const closes = data.map((b) => b.close);
    const len = closes.length;

    // 计算 SMA(471) * 0.745
    const sma471 = this.sma(closes, 471);
    const longMA = sma471.map((v) => (v !== null ? v * 0.745 : null));

    // 计算 EMA(150)
    const shortMA = this.ema(closes, 150);

    // 计算交叉信号
    // cross = 1 表示死亡交叉（短均线从上方穿越到下方）
    // cross = -1 表示黄金交叉（短均线从下方穿越到上方）
    const cross = new Array(len).fill(null);

    for (let i = 1; i < len; i++) {
      if (
        longMA[i] === null ||
        shortMA[i] === null ||
        longMA[i - 1] === null ||
        shortMA[i - 1] === null
      ) {
        cross[i] = null;
        continue;
      }

      // 死亡交叉：短均线从上方穿越到下方
      // 即：前一时刻 short > long，当前时刻 short <= long
      const prevCross = shortMA[i - 1] > longMA[i - 1];
      const currCross = shortMA[i] <= longMA[i];
      if (prevCross && currCross) {
        cross[i] = 1;
      }
      // 黄金交叉：短均线从下方穿越到上方
      // 即：前一时刻 short < long，当前时刻 short >= long
      else if (!prevCross && !currCross && shortMA[i] >= longMA[i]) {
        cross[i] = -1;
      } else {
        cross[i] = null;
      }
    }

    return { longMA, shortMA, cross };
  },
};

/* ============================================================
   ③ 画布渲染引擎
   ============================================================ */
class ChartRenderer {
  constructor() {
    this.mainCanvas = document.getElementById('mainChart');
    this.volCanvas = document.getElementById('volChart');
    this.macdCanvas = document.getElementById('macdChart');
    this.rsiCanvas = document.getElementById('rsiChart');

    this.mainCtx = this.mainCanvas.getContext('2d');
    this.volCtx = this.volCanvas.getContext('2d');
    this.macdCtx = this.macdCanvas.getContext('2d');
    this.rsiCtx = this.rsiCanvas.getContext('2d');

    // viewport
    this.offset = 0; // 从右端偏移的 bars 数量（整数）
    this.offsetF = 0; // 浮点精度 offset，用于平滑动画
    this.zoom = 1.0; // candleWidth 缩放
    this.baseCandleW = 8;
    this.priceAxisW = 72;
    this.timeLabelH = 22;

    // 惯性滑动状态
    this._inertiaVelocity = 0; // 像素/帧 速度
    this._inertiaRAF = null; // requestAnimationFrame id
    this._velocitySamples = []; // 最近几帧速度采样 [{dx, t}]

    // 鼠标状态
    this.mouseX = -1;
    this.mouseY = -1;
    this.mouseBar = -1;
    this.isDragging = false;
    this.isDraggingY = false;
    this.dragStartX = 0;
    this.dragStartY = 0;
    this.dragStartOffset = 0;
    this.dragStartPriceRange = null;

    // 十字光标显示状态（点击切换）
    this.showCrosshair = false;

    // 子图拖拽状态
    this.isResizingSubChart = false;
    this.resizingSubChart = null;
    this.resizeStartY = 0;
    this.resizeStartHeight = 0;

    // 实时价格线
    this.showLastPriceLine = true;
    this.lastPrice = null;

    // Y轴自动缩放
    this.autoScaleY = true;
    this.fixedPriceRange = null; // {min, max} 固定价格范围

    // 主图展开状态
    this.isChartExpanded = false;

    // 指标显示状态
    this.showMA = true;
    this.showBB = false;
    this.showVol = false;
    this.showMACD = true;
    this.showRSI = false;
    this.showSuperTrend = true;
    this.showSuperTrendAvg = true;
    this.showPiCycleBottom = false;
    this.showMATips = true;

    // 测量工具
    this.measureMode = false; // 测量模式
    this.measureStart = null; // 测量起点 {x, y, price, time}
    this.measureEnd = null; // 测量终点 {x, y, price, time}
    this.measurements = []; // 保存的测量结果数组

    // 磁铁模式
    this.magnetMode = false; // 磁铁吸附模式

    // 画图工具
    this.drawMode = false; // 画图模式
    this.drawTool = 'horizontal'; // 当前画图工具: horizontal, vertical, trendline, rectangle
    this.drawings = []; // 保存的绘图数组
    this.drawStart = null; // 绘图起点
    this.drawPreview = null; // 绘图预览
    this._loadDrawings(); // 从本地存储加载绘图

    // 指标参数
    this.bollPeriod = 55;
    this.bollMult = 2;
    // BOLL颜色设置
    this.bollColorUpper = '#9e9e9e';
    this.bollColorMiddle = '#9e9e9e';
    this.bollColorLower = '#9e9e9e';
    this.bollColorBackground = 'rgba(158,158,158,0.05)';
    this.bollShowBackground = false;
    this.rsiPeriod = 14;
    this.macdFast = 12;
    this.macdSlow = 26;
    this.macdSignal = 9;

    this.dpr = window.devicePixelRatio || 1;

    // 动态加载历史数据相关
    this._isLoadingHistory = false;
    this._hasReachedHistoryEnd = false; // 是否已经到达历史数据尽头
    this._loadHistoryCallback = null;
    this._historyLoadThreshold = 5; // 距离左侧多少根K线时触发加载

    this._bindEvents();
    this._bindResize();
    this._startCountdownTimer();
    this._startTooltipRefreshTimer();
  }

  /**
   * 设置历史数据加载回调
   * @param {Function} callback - 加载回调函数，返回 Promise
   */
  setLoadHistoryCallback(callback) {
    this._loadHistoryCallback = callback;
  }

  /**
   * 检查是否需要加载更多历史数据
   * 当用户滚动到最左侧（可见起始索引接近0）时触发
   */
  _checkNeedLoadHistory() {
    if (!this.data || this.data.length === 0) return;
    if (this._isLoadingHistory) return;
    if (!this._loadHistoryCallback) return;
    if (this._hasReachedHistoryEnd) return; // 已经到达历史数据尽头，不再加载

    const { startIdx } = this._getVisibleRange();

    // 当可见区域的起始索引小于阈值时，触发历史数据加载
    if (startIdx < this._historyLoadThreshold) {
      // 将 offset 钳位到刚好触达阈值的位置，防止惯性滑过头后位置错乱
      const safeOffset = this.data.length - this._visibleBars() - this._historyLoadThreshold + 1;
      if (this.offset > safeOffset) {
        this.offset = safeOffset;
        this.offsetF = safeOffset;
      }
      this._triggerLoadHistory();
    }
  }

  /**
   * 触发历史数据加载
   * 触发时立即停止惯性动画，防止 offset 继续滑动导致位置错乱
   */
  async _triggerLoadHistory() {
    if (this._isLoadingHistory) return;
    this._isLoadingHistory = true;

    // 立即停止惯性，锁住当前 offset，避免加载期间继续位移
    this._stopInertia();

    try {
      await this._loadHistoryCallback();
    } catch (e) {
      console.warn('加载历史数据失败:', e);
    } finally {
      // 延迟重置标志，避免频繁触发
      setTimeout(() => {
        this._isLoadingHistory = false;
      }, 500);
    }
  }

  // 启动倒计时定时器
  _startCountdownTimer() {
    this._countdownTimer = setInterval(() => {
      if (this.interval && this.data?.length) {
        this._renderPriceAxis();
      }
    }, 1000);
  }

  // 启动 tooltip 刷新定时器（用于最新 K 线实时更新）
  _startTooltipRefreshTimer() {
    // 清除已有定时器
    if (this._tooltipRefreshTimer) {
      clearInterval(this._tooltipRefreshTimer);
    }
    // 每 500ms 检查一次是否需要刷新 tooltip
    this._tooltipRefreshTimer = setInterval(() => {
      if (this.mouseX >= 0 && this.mouseBar >= 0 && this.data?.length) {
        const isLastBar = this.mouseBar === this.data.length - 1;
        if (isLastBar) {
          // 鼠标悬停在最新 K 线上，刷新 tooltip
          const bar = this.data[this.data.length - 1];
          this._showTooltip(bar, true);
          this._updateOHLCVInfo(bar);
        }
      }
    }, 500);
  }

  // 清理资源
  destroy() {
    if (this._countdownTimer) {
      clearInterval(this._countdownTimer);
      this._countdownTimer = null;
    }
    if (this._tooltipRefreshTimer) {
      clearInterval(this._tooltipRefreshTimer);
      this._tooltipRefreshTimer = null;
    }
    this._stopInertia();
  }

  get candleW() {
    return Math.max(1, Math.round(this.baseCandleW * this.zoom));
  }
  get candleGap() {
    return Math.max(0, Math.round(this.candleW * 0.18));
  }
  get barW() {
    return this.candleW + this.candleGap;
  }

  resize() {
    const dpr = this.dpr;
    const resizeCanvas = (canvas) => {
      const parent = canvas.parentElement;
      const rect = parent.getBoundingClientRect();
      const w = Math.floor(rect.width);
      const h = Math.floor(rect.height);
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
      const ctx = canvas.getContext('2d');
      ctx.scale(dpr, dpr);
      return { w, h };
    };

    this.mainSize = resizeCanvas(this.mainCanvas);
    this.volSize = resizeCanvas(this.volCanvas);
    this.macdSize = resizeCanvas(this.macdCanvas);
    this.rsiSize = resizeCanvas(this.rsiCanvas);
  }

  _bindResize() {
    const ro = new ResizeObserver(() => {
      this.resize();
      this.renderAll();
    });
    ro.observe(document.getElementById('canvasWrapper'));
    ro.observe(document.getElementById('volWrapper'));
    ro.observe(document.getElementById('macdWrapper'));
    ro.observe(document.getElementById('rsiWrapper'));
    this.resize();

    // 监听移动端横屏翻转
    window.addEventListener('orientationchange', () => {
      // 延迟执行以确保屏幕尺寸已更新
      setTimeout(() => {
        this.resize();
        this.renderAll();
      }, 100);
    });
  }

  // 磁铁吸附功能：找到最接近的OHLC价格
  _getMagnetPrice(price, barIndex) {
    if (!this.data || barIndex < 0 || barIndex >= this.data.length) {
      return price;
    }

    const bar = this.data[barIndex];
    const ohlc = [bar.open, bar.high, bar.low, bar.close];

    // 找到最接近的OHLC价格
    let closestPrice = price;
    let minDiff = Infinity;

    for (const p of ohlc) {
      const diff = Math.abs(p - price);
      if (diff < minDiff) {
        minDiff = diff;
        closestPrice = p;
      }
    }

    return closestPrice;
  }

  // 获取K线索引从X坐标（支持未来区域）
  _getBarIndexFromX(x) {
    if (!this.mainSize || !this.barW) return 0;
    const { startIdx } = this._getVisibleRange();
    // 使用 Math.round 代替 Math.floor 避免浮点数精度问题
    return Math.round(x / this.barW) + startIdx;
  }

  // 通过时间戳获取K线索引（二分查找，支持未来时间）
  _getBarIndexFromTime(time) {
    if (!this.data || this.data.length === 0) return 0;

    // 如果是未来时间，返回估算的索引
    const lastTime = this.data[this.data.length - 1].time;
    if (time > lastTime) {
      // 计算平均K线间隔
      const avgInterval =
        this.data.length > 1 ? (lastTime - this.data[0].time) / (this.data.length - 1) : 3600000;
      // 估算未来索引
      return this.data.length - 1 + Math.ceil((time - lastTime) / avgInterval);
    }

    // 历史时间：使用二分查找
    let left = 0;
    let right = this.data.length - 1;
    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      if (this.data[mid].time < time) {
        left = mid + 1;
      } else if (this.data[mid].time > time) {
        right = mid - 1;
      } else {
        return mid;
      }
    }
    // 如果没有精确匹配，返回最接近的索引
    if (left >= this.data.length) return this.data.length - 1;
    if (right < 0) return 0;
    return Math.abs(time - this.data[left]?.time) < Math.abs(time - this.data[right]?.time)
      ? left
      : right;
  }

  // 获取价格从Y坐标
  _getPriceFromY(y) {
    if (!this.mainSize || !this.mainSize.h) return 0;
    const priceRange = this._getPriceRange();
    if (!priceRange || priceRange.max === priceRange.min) return 0;
    return priceRange.max - (y / this.mainSize.h) * (priceRange.max - priceRange.min);
  }

  // 保存绘图到本地存储
  _saveDrawings() {
    try {
      localStorage.setItem('kline_drawings', JSON.stringify(this.drawings));
    } catch (e) {
      console.warn('Failed to save drawings:', e);
    }
  }

  // 从本地存储加载绘图
  _loadDrawings() {
    try {
      const saved = localStorage.getItem('kline_drawings');
      if (saved) {
        this.drawings = JSON.parse(saved);
      }
    } catch (e) {
      console.warn('Failed to load drawings:', e);
      this.drawings = [];
    }
  }

  // 更新绘图列表面板
  _updateDrawingsPanel() {
    const drawingsList = document.getElementById('drawingsList');
    const drawingsPanel = document.getElementById('drawingsPanel');
    if (!drawingsList || !drawingsPanel) return;

    if (this.drawings.length === 0) {
      drawingsList.innerHTML = '<div class="drawings-empty">暂无绘图</div>';
      return;
    }

    const typeNames = {
      horizontal: '水平线',
      vertical: '垂直线',
      trendline: '趋势线',
      rectangle: '矩形',
      fibonacci: '斐波那契回调',
    };

    const fmtPrice = (p) => {
      if (p >= 1000) return p.toFixed(2);
      if (p >= 1) return p.toFixed(4);
      return p.toFixed(6);
    };

    drawingsList.innerHTML = this.drawings
      .map((d, i) => {
        let details = '';
        if (d.type === 'horizontal' || d.type === 'vertical') {
          details = `价格: ${fmtPrice(d.start.price)}`;
        } else if (d.type === 'trendline') {
          details = `${fmtPrice(d.start.price)} → ${fmtPrice(d.end.price)}`;
        } else if (d.type === 'rectangle') {
          details = `${fmtPrice(d.start.price)} - ${fmtPrice(d.end.price)}`;
        } else if (d.type === 'fibonacci') {
          details = `${fmtPrice(d.start.price)} → ${fmtPrice(d.end.price)}`;
        }
        return `
          <div class="drawing-item" data-index="${i}">
            <div class="drawing-info">
              <span class="drawing-type">${typeNames[d.type] || d.type}</span>
              <span class="drawing-details">${details}</span>
            </div>
            <button class="drawing-delete" data-index="${i}">删除</button>
          </div>
        `;
      })
      .join('');

    // 绑定删除按钮事件
    drawingsList.querySelectorAll('.drawing-delete').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const index = parseInt(e.target.dataset.index);
        this.drawings.splice(index, 1);
        this._saveDrawings();
        this._updateDrawingsPanel();
        this.renderAll();
      });
    });
  }

  _bindEvents() {
    const wrapper = document.getElementById('canvasWrapper');

    // 主图展开/收起按钮事件
    const btnExpand = document.getElementById('btnExpandChart');
    if (btnExpand) {
      // 统一使用触摸事件处理，避免移动端点击延迟
      const handleExpand = (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.toggleChartExpand();
      };
      btnExpand.addEventListener('click', handleExpand);
      btnExpand.addEventListener('touchend', (e) => {
        e.preventDefault();
        btnExpand.style.transform = 'scale(1)';
        handleExpand(e);
      });
      btnExpand.addEventListener(
        'touchstart',
        () => {
          btnExpand.style.transform = 'scale(0.95)';
        },
        { passive: true },
      );
    }

    // Mouse move → crosshair（桌面端：鼠标悬停显示）
    wrapper.addEventListener('mousemove', (e) => {
      const rect = wrapper.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      // 始终更新鼠标坐标，这样十字光标就能正常移动
      this.mouseX = x;
      this.mouseY = y;

      if (this.measureMode && this.measureStart) {
        // 测量模式：预览终点
        if (!this.mainSize || !this.mainSize.h || !this.barW) return;
        const priceRange = this._getPriceRange();
        if (!priceRange || priceRange.max === priceRange.min) return;
        const { startIdx } = this._getVisibleRange();
        // 计算最近的K线索引并对齐到K线中心
        const barIndex = Math.floor(x / this.barW) + startIdx;
        // 计算K线中心的X坐标
        let barCenterX = (barIndex - startIdx) * this.barW + this.candleW / 2;
        // 根据K线中心的X坐标重新计算Y坐标和价格
        let barCenterY = y;
        let price =
          priceRange.max - (barCenterY / this.mainSize.h) * (priceRange.max - priceRange.min);

        // 磁铁模式：吸附到最近的OHLC价格
        if (this.magnetMode && barIndex >= 0 && barIndex < this.data.length) {
          price = this._getMagnetPrice(price, barIndex);
          // 更新Y坐标为吸附后的价格对应的位置
          barCenterY =
            this.mainSize.h -
            ((price - priceRange.min) / (priceRange.max - priceRange.min)) * this.mainSize.h;
        }

        const time = this.data[barIndex]?.time;

        this.measureEnd = {
          x: barCenterX,
          y: barCenterY,
          price,
          time,
          barIndex,
        };
      }

      this._updateCrosshair();
      this.renderAll();
    });

    wrapper.addEventListener('mouseleave', () => {
      this.mouseX = -1;
      this.mouseY = -1;
      document.getElementById('tooltip').style.display = 'none';
      this.renderAll();
    });

    // Drag to pan (X轴/Y轴平移)
    wrapper.addEventListener('mousedown', (e) => {
      const rect = wrapper.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      if (this.measureMode) {
        if (!this.mainSize || !this.mainSize.h || !this.barW) return;
        const priceRange = this._getPriceRange();
        if (!priceRange || priceRange.max === priceRange.min) return;
        const barIndex = this._getBarIndexFromX(x);
        let barCenterX =
          (barIndex - this._getVisibleRange().startIdx) * this.barW + this.candleW / 2;
        let barCenterY = y;
        let price =
          priceRange.max - (barCenterY / this.mainSize.h) * (priceRange.max - priceRange.min);

        // 磁铁模式：吸附到最近的OHLC价格（仅在有数据时）
        if (this.magnetMode && barIndex >= 0 && barIndex < this.data.length) {
          price = this._getMagnetPrice(price, barIndex);
          // 更新Y坐标为吸附后的价格对应的位置
          barCenterY =
            this.mainSize.h -
            ((price - priceRange.min) / (priceRange.max - priceRange.min)) * this.mainSize.h;
        }

        // 获取时间戳（如果索引超出范围，使用估算值）
        let time;
        if (barIndex >= 0 && barIndex < this.data.length) {
          time = this.data[barIndex].time;
        } else if (barIndex >= this.data.length && this.data.length > 0) {
          // 未来区域：使用最后一个K线的时间加预估间隔
          const lastBar = this.data[this.data.length - 1];
          const avgInterval =
            this.data.length > 1
              ? (lastBar.time - this.data[0].time) / (this.data.length - 1)
              : 3600000;
          time = lastBar.time + avgInterval * (barIndex - this.data.length + 1);
        } else {
          time = Date.now();
        }

        if (!this.measureStart) {
          // 第一次点击：设置起点
          this.measureStart = {
            x: barCenterX,
            y: barCenterY,
            price,
            time,
            barIndex,
          };
          this.measureEnd = null;
        } else if (this.measureEnd) {
          // 第二次点击：设置终点并保存测量结果
          // 计算测量数据
          const start = this.measureStart;
          const end = {
            x: barCenterX,
            y: barCenterY,
            price,
            time,
            barIndex,
          };
          const priceDiff = end.price - start.price;
          const priceDiffPercent = start.price !== 0 ? (priceDiff / start.price) * 100 : 0;
          const timeDiff = end.time - start.time;
          const timeDiffHours = timeDiff / (1000 * 60 * 60);

          // 保存测量结果（保存K线索引而不是像素坐标，以便缩放时重新计算）
          this.measurements.push({
            start: {
              barIndex: start.barIndex,
              price: start.price,
              time: start.time,
            },
            end: {
              barIndex: end.barIndex,
              price: end.price,
              time: end.time,
            },
            priceDiff,
            priceDiffPercent,
            timeDiff,
            timeDiffHours,
          });

          // 清除当前测量状态
          this.measureStart = null;
          this.measureEnd = null;

          // 自动关闭测量模式
          this.measureMode = false;

          // 更新测量按钮状态
          const measureBtn = document.getElementById('btnMeasure');
          if (measureBtn) {
            measureBtn.dataset.active = 'false';
            measureBtn.classList.remove('active');
          }
        }
        return;
      }

      // 画图模式
      if (this.drawMode) {
        if (!this.mainSize || !this.mainSize.h || !this.barW) return;
        const priceRange = this._getPriceRange();
        if (!priceRange || priceRange.max === priceRange.min) return;
        const barIndex = this._getBarIndexFromX(x);
        let barCenterX =
          (barIndex - this._getVisibleRange().startIdx) * this.barW + this.candleW / 2;
        let barCenterY = y;
        let price =
          priceRange.max - (barCenterY / this.mainSize.h) * (priceRange.max - priceRange.min);

        // 磁铁模式：吸附到最近的OHLC价格（仅在有数据时）
        if (this.magnetMode && barIndex >= 0 && barIndex < this.data.length) {
          price = this._getMagnetPrice(price, barIndex);
          // 更新Y坐标为吸附后的价格对应的位置
          barCenterY =
            this.mainSize.h -
            ((price - priceRange.min) / (priceRange.max - priceRange.min)) * this.mainSize.h;
        }

        // 获取时间戳（如果索引超出范围，使用估算值）
        let time;
        if (barIndex >= 0 && barIndex < this.data.length) {
          time = this.data[barIndex].time;
        } else if (barIndex >= this.data.length && this.data.length > 0) {
          // 未来区域：使用最后一个K线的时间加预估间隔
          const lastBar = this.data[this.data.length - 1];
          const avgInterval =
            this.data.length > 1
              ? (lastBar.time - this.data[0].time) / (this.data.length - 1)
              : 3600000; // 默认1小时
          time = lastBar.time + avgInterval * (barIndex - this.data.length + 1);
        } else {
          time = Date.now();
        }

        if (!this.drawStart) {
          // 第一次点击：设置起点
          this.drawStart = {
            x: barCenterX,
            y: barCenterY,
            price,
            time,
            barIndex,
          };

          // 水平线和垂直线只需要一次点击
          if (this.drawTool === 'horizontal' || this.drawTool === 'vertical') {
            const drawing = {
              type: this.drawTool,
              start: {
                barIndex: this.drawStart.barIndex,
                price: this.drawStart.price,
                time: this.drawStart.time,
              },
              end: {
                barIndex: barIndex,
                price: price,
                time: time,
              },
            };
            this.drawings.push(drawing);
            this._saveDrawings();
            this.drawStart = null;
            this.drawPreview = null;

            // 自动关闭画图模式
            this.drawMode = false;

            // 取消按钮高亮
            const toolBtns = document.querySelectorAll('.draw-tool-btn');
            toolBtns.forEach((b) => b.classList.remove('active'));
            return;
          }
        } else if (this.drawStart) {
          // 第二次点击：完成绘图（趋势线、矩形、斐波那契）
          const drawing = {
            type: this.drawTool,
            start: {
              barIndex: this.drawStart.barIndex,
              price: this.drawStart.price,
              time: this.drawStart.time,
            },
            end: {
              barIndex: barIndex,
              price: price,
              time: time,
            },
          };
          this.drawings.push(drawing);
          this._saveDrawings();
          this.drawStart = null;
          this.drawPreview = null;

          // 自动关闭画图模式
          this.drawMode = false;

          // 取消按钮高亮
          const toolBtns = document.querySelectorAll('.draw-tool-btn');
          toolBtns.forEach((b) => b.classList.remove('active'));
        }
        return;
      }

      // 非测量模式：点击图表清除测量结果
      if (this.measurements.length > 0) {
        this.measurements = [];
        this.renderAll();
      }

      // 拖动/平移图表
      this.dragStartX = e.clientX;
      this.dragStartY = e.clientY;

      // 停止正在进行的惯性动画
      this._stopInertia();
      this.offsetF = this.offset;

      // 检查是否在价格轴区域（右侧72px）
      const isPriceAxis = x > rect.width - this.priceAxisW;

      if (isPriceAxis) {
        // Y轴拖拽模式（价格轴区域拖动）
        this.isDraggingY = true;
        // 如果没有fixedPriceRange，从当前可见范围创建
        if (!this.fixedPriceRange) {
          const priceRange = this._getPriceRange();
          this.fixedPriceRange = { min: priceRange.min, max: priceRange.max };
        }
        this.dragStartPriceRange = { ...this.fixedPriceRange };
        wrapper.style.cursor = 'ns-resize';
      } else {
        // X轴拖拽模式
        this.isDragging = true;
        this.dragStartOffset = this.offset;
        // 初始化价格范围用于Y轴平移
        if (!this.fixedPriceRange) {
          const priceRange = this._getPriceRange();
          this.fixedPriceRange = { min: priceRange.min, max: priceRange.max };
        }
        this.dragStartPriceRange = { ...this.fixedPriceRange };
        wrapper.style.cursor = 'grabbing';
      }
    });

    // 子图拖拽事件处理
    const resizers = document.querySelectorAll('.sub-chart-resizer');
    resizers.forEach((resizer) => {
      resizer.addEventListener('mousedown', (e) => {
        e.preventDefault();
        this.isResizingSubChart = true;
        this.resizingSubChart = resizer.parentElement;
        this.resizeStartY = e.clientY;
        this.resizeStartHeight = this.resizingSubChart.offsetHeight;
        document.body.style.cursor = 'ns-resize';
      });
    });

    // MACD 幅图鼠标事件（光标线）
    const macdWrapper = document.getElementById('macdWrapper');
    if (macdWrapper) {
      macdWrapper.addEventListener('mousemove', (e) => {
        // 如果正在调整子图大小，不处理鼠标移动事件
        if (this.isResizingSubChart) return;
        const canvasRect = wrapper.getBoundingClientRect();
        const macdRect = macdWrapper.getBoundingClientRect();
        // 计算相对于主图的 X 坐标
        let mouseX = e.clientX - canvasRect.left;
        // 计算步进式鼠标位置（以barW为步长）
        const stepX = Math.round(mouseX / this.barW) * this.barW + this.candleW / 2;
        this.mouseX = stepX;
        // 计算相对于 MACD 幅图的 Y 坐标
        this.mouseY = e.clientY - canvasRect.top;
        this.renderAll();
      });

      macdWrapper.addEventListener('mouseleave', () => {
        // 不重置 mouseX，保持竖线显示，只重置 mouseY
        this.mouseY = -1;
        this.renderAll();
      });

      macdWrapper.addEventListener('mouseenter', (e) => {
        const canvasRect = wrapper.getBoundingClientRect();
        let mouseX = e.clientX - canvasRect.left;
        // 计算步进式鼠标位置（以barW为步长）
        const stepX = Math.round(mouseX / this.barW) * this.barW + this.candleW / 2;
        this.mouseX = stepX;
        this.renderAll();
      });

      // MACD 幅图滚轮事件（缩放）
      macdWrapper.addEventListener(
        'wheel',
        (e) => {
          e.preventDefault();
          if (e.ctrlKey || Math.abs(e.deltaX) < Math.abs(e.deltaY)) {
            // Zoom
            const zoomFactor = e.deltaY > 0 ? 0.85 : 1.18;
            this.zoom = Math.min(8, Math.max(0.1, this.zoom * zoomFactor));
          } else {
            // Horizontal pan
            if (!this.data) return;
            const delta = Math.round(e.deltaX / this.barW);
            const maxOffset = this.data.length - this._visibleBars() + 5;
            // 允许负数offset（用于居中显示），但限制最大偏移量
            this.offset = Math.max(
              -this._visibleBars() + 1,
              Math.min(maxOffset, this.offset - delta),
            );
          }
          this.renderAll();
        },
        { passive: false },
      );
    }

    // 成交量幅图鼠标事件（光标线）
    const volWrapper = document.getElementById('volWrapper');
    if (volWrapper) {
      volWrapper.addEventListener('mousemove', (e) => {
        // 如果正在调整子图大小，不处理鼠标移动事件
        if (this.isResizingSubChart) return;
        const canvasRect = wrapper.getBoundingClientRect();
        // 计算相对于主图的 X 坐标
        let mouseX = e.clientX - canvasRect.left;
        // 计算步进式鼠标位置（以barW为步长）
        const stepX = Math.round(mouseX / this.barW) * this.barW + this.candleW / 2;
        this.mouseX = stepX;
        // 计算相对于成交量幅图的 Y 坐标
        this.mouseY = e.clientY - canvasRect.top;
        this.renderAll();
      });

      volWrapper.addEventListener('mouseleave', () => {
        // 不重置 mouseX，保持竖线显示，只重置 mouseY
        this.mouseY = -1;
        this.renderAll();
      });

      volWrapper.addEventListener('mouseenter', (e) => {
        const canvasRect = wrapper.getBoundingClientRect();
        let mouseX = e.clientX - canvasRect.left;
        // 计算步进式鼠标位置（以barW为步长）
        const stepX = Math.round(mouseX / this.barW) * this.barW + this.candleW / 2;
        this.mouseX = stepX;
        this.renderAll();
      });

      // 成交量幅图滚轮事件（缩放）
      volWrapper.addEventListener(
        'wheel',
        (e) => {
          e.preventDefault();
          if (e.ctrlKey || Math.abs(e.deltaX) < Math.abs(e.deltaY)) {
            // Zoom
            const zoomFactor = e.deltaY > 0 ? 0.85 : 1.18;
            this.zoom = Math.min(8, Math.max(0.1, this.zoom * zoomFactor));
          } else {
            // Horizontal pan
            if (!this.data) return;
            const delta = Math.round(e.deltaX / this.barW);
            const maxOffset = this.data.length - this._visibleBars() + 5;
            // 允许负数offset（用于居中显示），但限制最大偏移量
            this.offset = Math.max(
              -this._visibleBars() + 1,
              Math.min(maxOffset, this.offset - delta),
            );
          }
          this.renderAll();
        },
        { passive: false },
      );
    }

    // RSI 幅图鼠标事件（光标线）
    const rsiWrapper = document.getElementById('rsiWrapper');
    if (rsiWrapper) {
      rsiWrapper.addEventListener('mousemove', (e) => {
        // 如果正在调整子图大小，不处理鼠标移动事件
        if (this.isResizingSubChart) return;
        const canvasRect = wrapper.getBoundingClientRect();
        // 计算相对于主图的 X 坐标
        let mouseX = e.clientX - canvasRect.left;
        // 计算步进式鼠标位置（以barW为步长）
        const stepX = Math.round(mouseX / this.barW) * this.barW + this.candleW / 2;
        this.mouseX = stepX;
        // 计算相对于 RSI 幅图的 Y 坐标
        this.mouseY = e.clientY - canvasRect.top;
        this.renderAll();
      });

      rsiWrapper.addEventListener('mouseleave', () => {
        // 不重置 mouseX，保持竖线显示，只重置 mouseY
        this.mouseY = -1;
        this.renderAll();
      });

      rsiWrapper.addEventListener('mouseenter', (e) => {
        const canvasRect = wrapper.getBoundingClientRect();
        let mouseX = e.clientX - canvasRect.left;
        // 计算步进式鼠标位置（以barW为步长）
        const stepX = Math.round(mouseX / this.barW) * this.barW + this.candleW / 2;
        this.mouseX = stepX;
        this.renderAll();
      });

      // RSI 幅图滚轮事件（缩放）
      rsiWrapper.addEventListener(
        'wheel',
        (e) => {
          e.preventDefault();
          if (e.ctrlKey || Math.abs(e.deltaX) < Math.abs(e.deltaY)) {
            // Zoom
            const zoomFactor = e.deltaY > 0 ? 0.85 : 1.18;
            this.zoom = Math.min(8, Math.max(0.1, this.zoom * zoomFactor));
          } else {
            // Horizontal pan
            if (!this.data) return;
            const delta = Math.round(e.deltaX / this.barW);
            const maxOffset = this.data.length - this._visibleBars() + 5;
            // 允许负数offset（用于居中显示），但限制最大偏移量
            this.offset = Math.max(
              -this._visibleBars() + 1,
              Math.min(maxOffset, this.offset - delta),
            );
          }
          this.renderAll();
        },
        { passive: false },
      );
    }

    window.addEventListener('mouseup', () => {
      if (this.isDragging || this.isDraggingY) {
        this.isDragging = false;
        this.isDraggingY = false;
        document.getElementById('canvasWrapper').style.cursor = 'crosshair';
      }
      if (this.isResizingSubChart) {
        this.isResizingSubChart = false;
        this.resizingSubChart = null;
        document.body.style.cursor = '';
      }
      // 测量模式：保存测量结果
      if (this.measureMode && this.measureStart && this.measureEnd) {
        // 计算测量数据
        const start = this.measureStart;
        const end = this.measureEnd;
        const priceDiff = end.price - start.price;
        const priceDiffPercent = start.price !== 0 ? (priceDiff / start.price) * 100 : 0;
        const timeDiff = end.time - start.time;
        const timeDiffHours = timeDiff / (1000 * 60 * 60);

        // 保存测量结果
        this.measurements.push({
          start: { ...start },
          end: { ...end },
          priceDiff,
          priceDiffPercent,
          timeDiff,
          timeDiffHours,
        });

        // 清除当前测量状态
        this.measureStart = null;
        this.measureEnd = null;

        // 自动关闭测量模式
        this.measureMode = false;

        // 更新测量按钮状态
        const measureBtn = document.getElementById('btnMeasure');
        if (measureBtn) {
          measureBtn.dataset.active = 'false';
          measureBtn.classList.remove('active');
        }
      }
    });

    window.addEventListener('mousemove', (e) => {
      if (!this.data) return;

      if (this.isDragging) {
        const dx = e.clientX - this.dragStartX;
        const dy = e.clientY - this.dragStartY;

        // 检测拖拽方向
        if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 5) {
          // 垂直拖拽：Y轴平移（上下移动价格范围）
          if (this.dragStartPriceRange) {
            const { h } = this.mainSize || { h: 400 };
            const priceRange = this.dragStartPriceRange.max - this.dragStartPriceRange.min;
            const priceDelta = (dy / h) * priceRange;
            this.fixedPriceRange = {
              min: this.dragStartPriceRange.min + priceDelta,
              max: this.dragStartPriceRange.max + priceDelta,
            };
          }
        } else if (Math.abs(dx) > 5) {
          // 水平拖拽：X轴平移（左右移动K线）
          const delta = Math.round(dx / this.barW);
          const maxOffset = this.data.length - this._visibleBars() + 5;
          this.offset = Math.max(
            -this._visibleBars() + 1,
            Math.min(maxOffset, this.dragStartOffset + delta),
          );
          // 检查是否需要加载历史数据
          this._checkNeedLoadHistory();
        }
        this.renderAll();
      } else if (this.isDraggingY && this.dragStartPriceRange) {
        // Y轴缩放（价格轴区域拖动）
        const dy = this.dragStartY - e.clientY; // 反转方向，向上拖动放大
        const { h } = this.mainSize || { h: 400 };
        const priceRange = this.dragStartPriceRange.max - this.dragStartPriceRange.min;
        const midPrice = (this.dragStartPriceRange.max + this.dragStartPriceRange.min) / 2;
        // 缩放因子：向上拖动缩小范围（放大），向下拖动放大范围（缩小）
        const scaleFactor = 1 + dy / h;
        const newRange = Math.max(priceRange * 0.1, priceRange * scaleFactor);
        this.fixedPriceRange = {
          min: midPrice - newRange / 2,
          max: midPrice + newRange / 2,
        };
        this.renderAll();
      } else if (this.isResizingSubChart) {
        // 子图高度调整
        const dy = this.resizeStartY - e.clientY; // 反转方向，使向上拖拽增加高度
        const newHeight = Math.max(40, this.resizeStartHeight + dy); // 最小高度40px
        this.resizingSubChart.style.height = newHeight + 'px';
        this.resize();
        this.renderAll();
      }
    });

    // Wheel to zoom + pan
    wrapper.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        if (e.ctrlKey || Math.abs(e.deltaX) < Math.abs(e.deltaY)) {
          // Zoom centered on mouse position
          if (!this.data || !this.mainSize) return;
          const canvasRect = wrapper.getBoundingClientRect();
          const mouseX = e.clientX - canvasRect.left;
          const chartW = this.mainSize.w - this.priceAxisW;
          if (mouseX < 0 || mouseX > chartW) return;

          const zoomFactor = e.deltaY > 0 ? 0.85 : 1.18;
          const newZoom = Math.min(8, Math.max(0.1, this.zoom * zoomFactor));

          // Get current visible range before zoom
          const total = this.data.length;
          const oldVisible = this._visibleBars();
          const oldStartIdx = Math.max(0, total - oldVisible - this.offset);

          // Calculate which bar the mouse is pointing at
          const oldBarW = chartW / oldVisible;
          const mouseBarIdx = oldStartIdx + Math.floor(mouseX / oldBarW);

          // Calculate new visible bars after zoom
          const newVisible = Math.floor(oldVisible * (this.zoom / newZoom));

          // Calculate new start index to keep same bar under mouse
          const newStartIdx =
            mouseBarIdx - Math.floor((mouseX / oldBarW) * (newVisible / oldVisible));
          const newOffset = total - newVisible - newStartIdx;

          // Apply zoom and offset
          this.zoom = newZoom;
          this.offset = Math.max(-newVisible, Math.min(total - newVisible + 5, newOffset));
          this.offsetF = this.offset;
        } else {
          // Horizontal pan
          if (!this.data) return;
          const delta = Math.round(e.deltaX / this.barW);
          const maxOffset = this.data.length - this._visibleBars() + 5;
          // 允许负数offset（用于居中显示），但限制最大偏移量
          this.offset = Math.max(
            -this._visibleBars() + 1,
            Math.min(maxOffset, this.offset - delta),
          );
          // 检查是否需要加载历史数据
          this._checkNeedLoadHistory();
        }
        this.renderAll();
      },
      { passive: false },
    );

    // Touch support with mobile optimization
    let lastTouchX = null,
      lastTouchY = null,
      lastPinchDist = null,
      touchStartTime = 0,
      touchStartX = 0,
      touchStartY = 0;

    // 防止触摸时页面滚动
    wrapper.addEventListener(
      'touchstart',
      (e) => {
        e.preventDefault();
        touchStartTime = Date.now();
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;

        // 停止正在进行的惯性动画
        this._stopInertia();
        // 重置速度采样
        this._velocitySamples = [];

        if (e.touches.length === 1) {
          lastTouchX = e.touches[0].clientX;
          lastTouchY = e.touches[0].clientY;
          // 同步浮点offset
          this.offsetF = this.offset;

          // 测量模式：触摸开始时设置起点或终点
          if (this.measureMode) {
            // 重置预览数据
            this.measurePreview = null;
            // 已经有起点了，这次触摸应该设置终点
            if (this.measureStart && this.measureEnd) {
              // 重置测量状态，开始新的测量
              this.measureStart = null;
              this.measureEnd = null;
            }
          }
        }
        if (e.touches.length === 2) {
          lastPinchDist = Math.hypot(
            e.touches[0].clientX - e.touches[1].clientX,
            e.touches[0].clientY - e.touches[1].clientY,
          );
        }

        // 添加触摸反馈
        wrapper.style.cursor = 'grabbing';
      },
      { passive: false },
    );

    wrapper.addEventListener(
      'touchmove',
      (e) => {
        e.preventDefault();

        if (e.touches.length === 1 && lastTouchX != null) {
          const dx = e.touches[0].clientX - lastTouchX;
          const dy = e.touches[0].clientY - lastTouchY;
          lastTouchX = e.touches[0].clientX;
          lastTouchY = e.touches[0].clientY;

          if (!this.data) return;

          const rect = wrapper.getBoundingClientRect();

          // 测量模式：始终更新鼠标坐标用于预览
          if (this.measureMode) {
            this.mouseX = e.touches[0].clientX - rect.left;
            this.mouseY = e.touches[0].clientY - rect.top;

            // 步进式光标：吸附到K线中心
            if (!this.mainSize || !this.mainSize.h || !this.barW) return;
            const priceRange = this._getPriceRange();
            if (!priceRange || priceRange.max === priceRange.min) return;
            const { startIdx } = this._getVisibleRange();
            // 使用 Math.round 找到最近的K线索引
            const barIndex = Math.round(this.mouseX / this.barW) + startIdx;

            // X轴步进：吸附到K线中心
            this.mouseX = (barIndex - startIdx) * this.barW + this.candleW / 2;

            // Y轴步进：如果开启磁铁模式，吸附到最近的OHLC价格
            if (this.magnetMode && barIndex >= 0 && barIndex < this.data.length) {
              let price =
                priceRange.max -
                (this.mouseY / this.mainSize.h) * (priceRange.max - priceRange.min);
              price = this._getMagnetPrice(price, barIndex);
              this.mouseY =
                this.mainSize.h -
                ((price - priceRange.min) / (priceRange.max - priceRange.min)) * this.mainSize.h;
            }

            // 预览测量终点
            if (this.measureStart) {
              if (!this.mainSize || !this.mainSize.h || !this.barW) return;
              const priceRange = this._getPriceRange();
              if (!priceRange || priceRange.max === priceRange.min) return;
              const { startIdx } = this._getVisibleRange();
              // 使用 Math.round 找到最近的K线索引
              const barIndex = Math.round(this.mouseX / this.barW) + startIdx;
              let barCenterX = (barIndex - startIdx) * this.barW + this.candleW / 2;
              let barCenterY = this.mouseY;
              let price =
                priceRange.max - (barCenterY / this.mainSize.h) * (priceRange.max - priceRange.min);

              if (this.magnetMode && barIndex >= 0 && barIndex < this.data.length) {
                price = this._getMagnetPrice(price, barIndex);
                barCenterY =
                  this.mainSize.h -
                  ((price - priceRange.min) / (priceRange.max - priceRange.min)) * this.mainSize.h;
              }

              const time = this.data[barIndex]?.time;

              // 使用临时变量进行预览，不直接设置 measureEnd
              this.measurePreview = {
                x: barCenterX,
                y: barCenterY,
                price,
                time,
                barIndex,
              };
            }

            this.renderAll();
          } else if (this.drawMode) {
            // 画图模式：更新鼠标坐标用于预览
            this.mouseX = e.touches[0].clientX - rect.left;
            this.mouseY = e.touches[0].clientY - rect.top;

            // 步进式光标：吸附到K线中心
            if (!this.mainSize || !this.mainSize.h || !this.barW) return;
            const priceRange = this._getPriceRange();
            if (!priceRange || priceRange.max === priceRange.min) return;
            const { startIdx } = this._getVisibleRange();
            // 使用 Math.round 找到最近的K线索引，而不是 Math.floor
            const barIndex = Math.round(this.mouseX / this.barW) + startIdx;

            // X轴步进：吸附到K线中心
            this.mouseX = (barIndex - startIdx) * this.barW + this.candleW / 2;

            // Y轴步进：如果开启磁铁模式，吸附到最近的OHLC价格
            if (this.magnetMode && barIndex >= 0 && barIndex < this.data.length) {
              let price =
                priceRange.max -
                (this.mouseY / this.mainSize.h) * (priceRange.max - priceRange.min);
              price = this._getMagnetPrice(price, barIndex);
              this.mouseY =
                this.mainSize.h -
                ((price - priceRange.min) / (priceRange.max - priceRange.min)) * this.mainSize.h;
            }

            // 预览画图终点
            if (this.drawStart) {
              if (!this.mainSize || !this.mainSize.h || !this.barW) return;
              const priceRange = this._getPriceRange();
              if (!priceRange || priceRange.max === priceRange.min) return;
              const { startIdx } = this._getVisibleRange();
              // 使用 Math.round 找到最近的K线索引
              const barIndex = Math.round(this.mouseX / this.barW) + startIdx;
              let barCenterX = (barIndex - startIdx) * this.barW + this.candleW / 2;
              let barCenterY = this.mouseY;
              let price =
                priceRange.max - (barCenterY / this.mainSize.h) * (priceRange.max - priceRange.min);

              if (this.magnetMode && barIndex >= 0 && barIndex < this.data.length) {
                price = this._getMagnetPrice(price, barIndex);
                barCenterY =
                  this.mainSize.h -
                  ((price - priceRange.min) / (priceRange.max - priceRange.min)) * this.mainSize.h;
              }

              // 获取时间戳（如果索引超出范围，使用估算值）
              let time;
              if (barIndex >= 0 && barIndex < this.data.length) {
                time = this.data[barIndex].time;
              } else if (barIndex >= this.data.length && this.data.length > 0) {
                const lastBar = this.data[this.data.length - 1];
                const avgInterval =
                  this.data.length > 1
                    ? (lastBar.time - this.data[0].time) / (this.data.length - 1)
                    : 3600000;
                time = lastBar.time + avgInterval * (barIndex - this.data.length + 1);
              } else {
                time = Date.now();
              }

              this.drawPreview = {
                x: barCenterX,
                y: barCenterY,
                price,
                time,
                barIndex,
              };
            }

            this.renderAll();
          } else if (this.showCrosshair) {
            // 十字光标显示状态下：拖动仅移动光标，不平移图表
            // 更新十字光标位置
            this.mouseX = e.touches[0].clientX - rect.left;
            this.mouseY = e.touches[0].clientY - rect.top;

            this._updateCrosshair();
            this.renderAll();
          } else {
            // 记录速度采样（保留最近 5 帧，用于惯性计算）
            const now = Date.now();
            this._velocitySamples.push({ dx, t: now });
            if (this._velocitySamples.length > 5) this._velocitySamples.shift();

            // 使用浮点 offset 实现亚像素精度平移
            const deltaF = dx / this.barW;
            const maxOffset = this.data.length - this._visibleBars() + 5;
            const minOffset = -this._visibleBars() + 1;
            this.offsetF = Math.max(minOffset, Math.min(maxOffset, this.offsetF + deltaF));
            this.offset = Math.round(this.offsetF);

            // 垂直拖动 - 仅在非自动缩放模式下调整价格范围
            if (!this.autoScaleY && this.fixedPriceRange) {
              const { h } = this.mainSize || { h: 400 };
              const priceRange = this.fixedPriceRange.max - this.fixedPriceRange.min;
              const priceDelta = (dy / h) * priceRange;

              this.fixedPriceRange = {
                min: this.fixedPriceRange.min + priceDelta,
                max: this.fixedPriceRange.max + priceDelta,
              };
            }

            this._checkNeedLoadHistory();
            this.renderAll();
          }
        }

        if (e.touches.length === 2 && lastPinchDist != null) {
          // 双指缩放时停止惯性
          this._stopInertia();
          const dist = Math.hypot(
            e.touches[0].clientX - e.touches[1].clientX,
            e.touches[0].clientY - e.touches[1].clientY,
          );
          const ratio = dist / lastPinchDist;
          // 优化缩放灵敏度
          const zoomFactor = 1 + (ratio - 1) * 0.5;
          this.zoom = Math.min(8, Math.max(0.1, this.zoom * zoomFactor));
          lastPinchDist = dist;
          this.renderAll();
        }
      },
      { passive: false },
    );

    wrapper.addEventListener('touchend', (e) => {
      // 检测是否为点击（轻触时间短且移动距离小）
      const touchDuration = Date.now() - touchStartTime;
      const rect = wrapper.getBoundingClientRect();
      // 使用 changedTouches 获取结束的触摸点
      const touch = e.changedTouches[0];
      const moveDistance = touch
        ? Math.hypot(touch.clientX - touchStartX, touch.clientY - touchStartY)
        : Infinity;

      // 点击判定参数
      const clickThreshold = this.showCrosshair ? 10 : 15;
      const timeThreshold = this.showCrosshair ? 250 : 300;

      // 测量模式：触摸结束时设置起点或终点
      if (this.measureMode) {
        const x = touch.clientX - rect.left;
        const y = touch.clientY - rect.top;

        if (!this.mainSize || !this.mainSize.h || !this.barW) return;
        const priceRange = this._getPriceRange();
        if (!priceRange || priceRange.max === priceRange.min) return;
        const barIndex = this._getBarIndexFromX(x);
        let barCenterX =
          (barIndex - this._getVisibleRange().startIdx) * this.barW + this.candleW / 2;
        let barCenterY = y;
        let price =
          priceRange.max - (barCenterY / this.mainSize.h) * (priceRange.max - priceRange.min);

        // 磁铁模式：吸附到最近的OHLC价格（仅在有数据时）
        if (this.magnetMode && barIndex >= 0 && barIndex < this.data.length) {
          price = this._getMagnetPrice(price, barIndex);
          // 更新Y坐标为吸附后的价格对应的位置
          barCenterY =
            this.mainSize.h -
            ((price - priceRange.min) / (priceRange.max - priceRange.min)) * this.mainSize.h;
        }

        // 获取时间戳（如果索引超出范围，使用估算值）
        let time;
        if (barIndex >= 0 && barIndex < this.data.length) {
          time = this.data[barIndex].time;
        } else if (barIndex >= this.data.length && this.data.length > 0) {
          // 未来区域：使用最后一个K线的时间加预估间隔
          const lastBar = this.data[this.data.length - 1];
          const avgInterval =
            this.data.length > 1
              ? (lastBar.time - this.data[0].time) / (this.data.length - 1)
              : 3600000;
          time = lastBar.time + avgInterval * (barIndex - this.data.length + 1);
        } else {
          time = Date.now();
        }

        // 第一次触摸结束：设置起点
        if (!this.measureStart) {
          this.measureStart = {
            x: barCenterX,
            y: barCenterY,
            price,
            time,
            barIndex,
          };
          this.measureEnd = null;
        }
        // 第二次触摸结束：设置终点并保存测量结果
        else if (!this.measureEnd) {
          this.measureEnd = {
            x: barCenterX,
            y: barCenterY,
            price,
            time,
            barIndex,
          };

          // 计算测量数据
          const start = this.measureStart;
          const end = this.measureEnd;
          const priceDiff = end.price - start.price;
          const priceDiffPercent = start.price !== 0 ? (priceDiff / start.price) * 100 : 0;
          const timeDiff = end.time - start.time;
          const timeDiffHours = timeDiff / (1000 * 60 * 60);

          // 保存测量结果（保存K线索引而不是像素坐标，以便缩放时重新计算）
          this.measurements.push({
            start: {
              barIndex: start.barIndex,
              price: start.price,
              time: start.time,
            },
            end: {
              barIndex: end.barIndex,
              price: end.price,
              time: end.time,
            },
            priceDiff,
            priceDiffPercent,
            timeDiffHours,
          });

          // 保存测量结果后关闭测量模式
          this.measureStart = null;
          this.measureEnd = null;
          this.measurePreview = null;
          this.measureMode = false;
          this.showCrosshair = false;

          // 更新测量按钮状态
          const measureBtn = document.getElementById('btnMeasure');
          if (measureBtn) {
            measureBtn.dataset.active = 'false';
            measureBtn.classList.remove('active');
          }
        }

        this.renderAll();
      } else if (this.drawMode) {
        // 画图模式：处理触摸结束
        const x = touch.clientX - rect.left;
        const y = touch.clientY - rect.top;

        if (!this.mainSize || !this.mainSize.h || !this.barW) return;
        const priceRange = this._getPriceRange();
        if (!priceRange || priceRange.max === priceRange.min) return;
        const barIndex = this._getBarIndexFromX(x);
        let barCenterX =
          (barIndex - this._getVisibleRange().startIdx) * this.barW + this.candleW / 2;
        let barCenterY = y;
        let price =
          priceRange.max - (barCenterY / this.mainSize.h) * (priceRange.max - priceRange.min);

        // 磁铁模式：吸附到最近的OHLC价格（仅在有数据时）
        if (this.magnetMode && barIndex >= 0 && barIndex < this.data.length) {
          price = this._getMagnetPrice(price, barIndex);
          // 更新Y坐标为吸附后的价格对应的位置
          barCenterY =
            this.mainSize.h -
            ((price - priceRange.min) / (priceRange.max - priceRange.min)) * this.mainSize.h;
        }

        // 获取时间戳（如果索引超出范围，使用估算值）
        let time;
        if (barIndex >= 0 && barIndex < this.data.length) {
          time = this.data[barIndex].time;
        } else if (barIndex >= this.data.length && this.data.length > 0) {
          // 未来区域：使用最后一个K线的时间加预估间隔
          const lastBar = this.data[this.data.length - 1];
          const avgInterval =
            this.data.length > 1
              ? (lastBar.time - this.data[0].time) / (this.data.length - 1)
              : 3600000;
          time = lastBar.time + avgInterval * (barIndex - this.data.length + 1);
        } else {
          time = Date.now();
        }

        // 水平线和垂直线：一次拖动完成（使用当前光标位置）
        if (this.drawTool === 'horizontal' || this.drawTool === 'vertical') {
          const drawing = {
            type: this.drawTool,
            start: {
              x: barCenterX,
              y: this.drawTool === 'horizontal' ? barCenterY : 0,
              price: price,
              time: time,
              barIndex: barIndex,
            },
            end: {
              x: this.drawTool === 'vertical' ? barCenterX : this.mainSize.w,
              y: this.drawTool === 'horizontal' ? barCenterY : this.mainSize.h,
              price: price,
              time: time,
              barIndex: barIndex,
            },
          };
          this.drawings.push(drawing);
          this._saveDrawings();
          this.drawMode = false;
          this.showCrosshair = false;
          // 移除按钮高亮
          const drawToolsGroup = document.getElementById('drawToolsGroup');
          if (drawToolsGroup) {
            drawToolsGroup
              .querySelectorAll('.draw-tool-btn')
              .forEach((btn) => btn.classList.remove('active'));
          }
          this.renderAll();
          return;
        }

        // 需要两个点的画图工具：第一次触摸结束设置起点，第二次触摸结束设置终点
        if (!this.drawStart) {
          // 第一次触摸结束：设置起点
          this.drawStart = {
            x: barCenterX,
            y: barCenterY,
            price: price,
            time: time,
            barIndex: barIndex,
          };
          this.drawPreview = null;
          this.renderAll();
        } else {
          // 第二次触摸结束：设置终点并保存绘图
          const drawing = {
            type: this.drawTool,
            start: this.drawStart,
            end: {
              x: barCenterX,
              y: barCenterY,
              price: price,
              time: time,
              barIndex: barIndex,
            },
          };
          this.drawings.push(drawing);
          this._saveDrawings();
          this.drawStart = null;
          this.drawPreview = null;
          this.drawMode = false;
          this.showCrosshair = false;
          // 移除按钮高亮
          const drawToolsGroup = document.getElementById('drawToolsGroup');
          if (drawToolsGroup) {
            drawToolsGroup
              .querySelectorAll('.draw-tool-btn')
              .forEach((btn) => btn.classList.remove('active'));
          }
          this.renderAll();
        }
      } else if (touchDuration < timeThreshold && moveDistance < clickThreshold && touch) {
        // 非测量模式：点击切换十字光标显示/隐藏，或清除测量结果
        const x = touch.clientX - rect.left;
        const y = touch.clientY - rect.top;

        // 检查是否在价格轴区域
        const isPriceAxis = x > rect.width - this.priceAxisW;
        if (!isPriceAxis) {
          // 如果有测量结果，点击清除测量
          if (this.measurements.length > 0) {
            this.measurements = [];
            this.renderAll();
          } else {
            // 切换十字光标显示状态
            this.showCrosshair = !this.showCrosshair;

            if (this.showCrosshair) {
              this.mouseX = x;
              this.mouseY = y;
              this._updateCrosshair();
            } else {
              this.mouseX = -1;
              this.mouseY = -1;
              document.getElementById('tooltip').style.display = 'none';
            }
            this.renderAll();
          }
        }
      } else if (!this.showCrosshair && this._velocitySamples.length >= 2) {
        // 非点击 & 非十字光标模式 → 启动惯性滑动
        this._startInertia();
      }

      lastTouchX = null;
      lastTouchY = null;
      lastPinchDist = null;

      // 恢复默认光标
      wrapper.style.cursor = 'crosshair';
    });

    // 优化触摸设备上的按钮点击
    const buttons = wrapper.querySelectorAll('.action-btn');
    buttons.forEach((button) => {
      button.addEventListener('touchstart', () => {
        button.style.transform = 'scale(0.95)';
        button.style.transition = 'transform 0.1s';
      });
      button.addEventListener('touchend', () => {
        button.style.transform = 'scale(1)';
      });
    });
  }

  /**
   * 停止惯性动画
   */
  _stopInertia() {
    if (this._inertiaRAF) {
      cancelAnimationFrame(this._inertiaRAF);
      this._inertiaRAF = null;
    }
    this._inertiaVelocity = 0;
  }

  /**
   * 启动惯性滑动动画
   * 根据最近几帧的 dx 计算初始速度，然后以 0.88 的摩擦系数逐帧减速
   */
  _startInertia() {
    this._stopInertia();
    if (!this.data || this._velocitySamples.length < 2) return;

    // 取最近 ~100ms 内的样本计算加权平均速度（像素/ms）
    const now = Date.now();
    const recent = this._velocitySamples.filter((s) => now - s.t < 120);
    if (!recent.length) return;

    let totalDx = 0;
    recent.forEach((s) => (totalDx += s.dx));
    // 将像素速度转换为 bars/frame（60fps ≈ 16.67ms/frame）
    const pxPerMs = totalDx / (recent.length * 16.67);
    let velocity = pxPerMs / this.barW; // bars/frame

    const FRICTION = 0.88; // 摩擦系数（越小减速越快）
    const MIN_VELOCITY = 0.02; // 速度低于此值时停止动画

    const animate = () => {
      if (Math.abs(velocity) < MIN_VELOCITY || !this.data) {
        this._inertiaRAF = null;
        return;
      }

      // 正在加载历史数据时暂停惯性，等待加载完成
      if (this._isLoadingHistory) {
        this._inertiaRAF = null;
        return;
      }

      velocity *= FRICTION;

      const maxOffset = this.data.length - this._visibleBars() + 5;
      const minOffset = -this._visibleBars() + 1;
      this.offsetF = Math.max(minOffset, Math.min(maxOffset, this.offsetF + velocity));
      const newOffset = Math.round(this.offsetF);

      if (newOffset !== this.offset) {
        this.offset = newOffset;
        this._checkNeedLoadHistory();
        this.renderAll();
      }

      // 到达边界时停止
      if (this.offsetF <= minOffset || this.offsetF >= maxOffset) {
        this._inertiaRAF = null;
        return;
      }

      this._inertiaRAF = requestAnimationFrame(animate);
    };

    this._inertiaRAF = requestAnimationFrame(animate);
  }

  _visibleBars() {
    if (!this.mainSize) return 100;
    const chartW = this.mainSize.w - this.priceAxisW;
    return Math.floor(chartW / this.barW);
  }

  setData(
    data,
    indicators,
    interval,
    chartType,
    maSettings,
    showMATips = true,
    bollPeriod = 55,
    bollMult = 2,
    bollColorUpper = '#ffc107',
    bollColorMiddle = '#ffc107',
    bollColorLower = '#ffc107',
    bollColorBackground = 'rgba(255,193,7,0.05)',
    bollShowBackground = true,
    rsiPeriod = 14,
    macdFast = 12,
    macdSlow = 26,
    macdSignal = 9,
    resetOffset = true,
  ) {
    this.data = data;
    this.indicators = indicators;
    this.interval = interval;
    this.chartType = chartType || 'candle';
    this.maSettings = maSettings;
    this.showMATips = showMATips;
    // 存储指标参数
    this.bollPeriod = bollPeriod;
    this.bollMult = bollMult;
    // 存储BOLL颜色设置
    this.bollColorUpper = bollColorUpper;
    this.bollColorMiddle = bollColorMiddle;
    this.bollColorLower = bollColorLower;
    this.bollColorBackground = bollColorBackground;
    this.bollShowBackground = bollShowBackground;
    this.rsiPeriod = rsiPeriod;
    this.macdFast = macdFast;
    this.macdSlow = macdSlow;
    this.macdSignal = macdSignal;
    // Auto-scroll to latest (center position)
    if (resetOffset) {
      const visibleBars = this._visibleBars();
      this.offset = -Math.floor(visibleBars * 0.3);
    }
    // 更新实时价格
    if (data && data.length > 0) {
      this.lastPrice = data[data.length - 1].close;
    }
  }

  /**
   * 增量更新最后一根K线（WS 实时推送专用）
   * 仅替换 data 末尾元素及对应指标末位值，不触发全量 setData
   * @param {Object} bar - 最新 bar 数据
   * @param {Object} incIndicators - 末位指标增量 { ma, bb, macd, rsi, superTrend }
   */
  updateLastBar(bar, incIndicators) {
    if (!this.data || !this.data.length) return;

    const isNewBar = bar.time !== this.data[this.data.length - 1].time;

    if (isNewBar) {
      // 新K线：追加并截断
      this.data.push(bar);
      if (this.data.length > 2000) this.data.shift();

      // 同步追加指标末位（用增量值填充，其余保持不变）
      if (this.indicators) {
        this._appendIndicatorValues(incIndicators);
      }
    } else {
      // 同一根K线：原地更新
      this.data[this.data.length - 1] = bar;

      // 更新指标末位
      if (this.indicators) {
        this._updateLastIndicatorValues(incIndicators);
      }
    }

    this.lastPrice = bar.close;
  }

  /** 追加指标数组末尾（新K线） */
  _appendIndicatorValues(inc) {
    const ind = this.indicators;
    if (!ind) return;

    // MA
    if (ind.ma && inc.ma) {
      for (const key of Object.keys(inc.ma)) {
        if (ind.ma[key]) ind.ma[key].push(inc.ma[key]);
      }
    }
    // BB
    if (ind.bb && inc.bb) {
      ind.bb.mid.push(inc.bb.mid);
      ind.bb.upper.push(inc.bb.upper);
      ind.bb.lower.push(inc.bb.lower);
    }
    // MACD
    if (ind.macd && inc.macd) {
      ind.macd.dif.push(inc.macd.dif);
      ind.macd.dea.push(inc.macd.dea);
      ind.macd.macd.push(inc.macd.macd);
    }
    // RSI
    if (ind.rsi && inc.rsi != null) {
      ind.rsi.push(inc.rsi);
    }
    // SuperTrend
    if (ind.superTrend && inc.superTrend) {
      ind.superTrend.upper.push(inc.superTrend.upper);
      ind.superTrend.lower.push(inc.superTrend.lower);
      ind.superTrend.trend.push(inc.superTrend.trend);
      ind.superTrend.value.push(inc.superTrend.value);
    }
    // SuperTrend Avg
    if (ind.superTrendAvg && inc.superTrendAvg) {
      ind.superTrendAvg.avg.push(inc.superTrendAvg.avg);
      ind.superTrendAvg.max.push(inc.superTrendAvg.max);
      ind.superTrendAvg.min.push(inc.superTrendAvg.min);
      ind.superTrendAvg.upper.push(inc.superTrendAvg.upper);
      ind.superTrendAvg.lower.push(inc.superTrendAvg.lower);
      ind.superTrendAvg.trend.push(inc.superTrendAvg.trend);
      ind.superTrendAvg.spt.push(inc.superTrendAvg.spt);
    }
  }

  /** 更新指标数组末位（同一根K线） */
  _updateLastIndicatorValues(inc) {
    const ind = this.indicators;
    if (!ind) return;
    const setLast = (arr, v) => {
      if (arr && arr.length) arr[arr.length - 1] = v;
    };

    if (ind.ma && inc.ma) {
      for (const key of Object.keys(inc.ma)) {
        if (ind.ma[key]) setLast(ind.ma[key], inc.ma[key]);
      }
    }
    if (ind.bb && inc.bb) {
      setLast(ind.bb.mid, inc.bb.mid);
      setLast(ind.bb.upper, inc.bb.upper);
      setLast(ind.bb.lower, inc.bb.lower);
    }
    if (ind.macd && inc.macd) {
      setLast(ind.macd.dif, inc.macd.dif);
      setLast(ind.macd.dea, inc.macd.dea);
      setLast(ind.macd.macd, inc.macd.macd);
    }
    if (ind.rsi && inc.rsi != null) {
      setLast(ind.rsi, inc.rsi);
    }
    if (ind.superTrend && inc.superTrend) {
      setLast(ind.superTrend.upper, inc.superTrend.upper);
      setLast(ind.superTrend.lower, inc.superTrend.lower);
      setLast(ind.superTrend.trend, inc.superTrend.trend);
      setLast(ind.superTrend.value, inc.superTrend.value);
    }
    // SuperTrend Avg
    if (ind.superTrendAvg && inc.superTrendAvg) {
      setLast(ind.superTrendAvg.avg, inc.superTrendAvg.avg);
      setLast(ind.superTrendAvg.max, inc.superTrendAvg.max);
      setLast(ind.superTrendAvg.min, inc.superTrendAvg.min);
      setLast(ind.superTrendAvg.upper, inc.superTrendAvg.upper);
      setLast(ind.superTrendAvg.lower, inc.superTrendAvg.lower);
      setLast(ind.superTrendAvg.trend, inc.superTrendAvg.trend);
      setLast(ind.superTrendAvg.spt, inc.superTrendAvg.spt);
    }
  }

  setLastPrice(price) {
    this.lastPrice = price;
  }

  autoScale() {
    if (!this.data || !this.data.length) return;
    const vis = this._getVisibleBars();
    if (!vis.length) return;
    // Reset zoom to fit ~100 bars (more compact)
    const targetBars = 150;
    const chartW = (this.mainSize?.w || 800) - this.priceAxisW;
    this.zoom = Math.max(0.1, Math.min(8, chartW / (targetBars * (this.baseCandleW + 1.5))));
    // 最新K线显示在屏幕中心（从左侧开始显示，让右侧留空）
    const visibleBars = this._visibleBars();
    this.offset = -Math.floor(visibleBars * 0.3);
    this.renderAll();
  }

  // 切换Y轴自动缩放
  toggleAutoScaleY() {
    this.autoScaleY = !this.autoScaleY;
    // 关闭自动缩放时，保存当前价格范围作为固定范围
    if (!this.autoScaleY && this._priceHi != null) {
      this.fixedPriceRange = {
        min: this._priceLo,
        max: this._priceHi,
      };
    }
    this.renderAll();
    return this.autoScaleY;
  }

  // 切换主图展开/收起
  toggleChartExpand() {
    this.isChartExpanded = !this.isChartExpanded;

    // 切换子图的显示状态
    const volWrapper = document.getElementById('volWrapper');
    const macdWrapper = document.getElementById('macdWrapper');
    const rsiWrapper = document.getElementById('rsiWrapper');
    const timeAxis = document.getElementById('timeAxis');

    if (this.isChartExpanded) {
      // 展开主图：隐藏所有子图和时间轴
      if (volWrapper) volWrapper.classList.add('hidden');
      if (macdWrapper) macdWrapper.classList.add('hidden');
      if (rsiWrapper) rsiWrapper.classList.add('hidden');
      if (timeAxis) timeAxis.classList.add('hidden');
    } else {
      // 收起主图：恢复子图的显示状态
      // 直接从DOM元素的状态恢复，而不是依赖内部状态
      if (volWrapper) {
        const volBtn = document.getElementById('toggleVOL');
        const shouldShowVol = volBtn && volBtn.dataset.active === 'true';
        volWrapper.classList.toggle('hidden', !shouldShowVol);
      }
      if (macdWrapper) {
        const macdBtn = document.getElementById('toggleMACD');
        const shouldShowMACD = macdBtn && macdBtn.dataset.active === 'true';
        macdWrapper.classList.toggle('hidden', !shouldShowMACD);
      }
      if (rsiWrapper) {
        const rsiBtn = document.getElementById('toggleRSI');
        const shouldShowRSI = rsiBtn && rsiBtn.dataset.active === 'true';
        rsiWrapper.classList.toggle('hidden', !shouldShowRSI);
      }
      if (timeAxis) timeAxis.classList.remove('hidden');
    }

    // 更新按钮状态
    const btnExpand = document.getElementById('btnExpandChart');
    if (btnExpand) {
      if (this.isChartExpanded) {
        btnExpand.classList.add('active');
        btnExpand.innerHTML = `
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="15 21 21 21 21 15" />
            <polyline points="9 3 3 3 3 9" />
            <line x1="21" y1="21" x2="14" y2="14" />
            <line x1="3" y1="3" x2="10" y2="10" />
          </svg>
        `;
      } else {
        btnExpand.classList.remove('active');
        btnExpand.innerHTML = `
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="15 3 21 3 21 9" />
            <polyline points="9 21 3 21 3 15" />
            <line x1="21" y1="3" x2="14" y2="10" />
            <line x1="3" y1="21" x2="10" y2="14" />
          </svg>
        `;
      }
    }

    // 重新调整大小并渲染
    this.resize();
    this.renderAll();

    return this.isChartExpanded;
  }

  // 设置固定价格范围
  setFixedPriceRange(min, max) {
    this.fixedPriceRange = { min, max };
    this.autoScaleY = false;
    this.renderAll();
  }

  // 重置图表
  resetChart() {
    // 重置Y轴为自动缩放
    this.autoScaleY = true;
    this.fixedPriceRange = null;
    // 自动调整缩放以适应屏幕
    if (this.data && this.data.length > 0) {
      // 根据屏幕宽度调整目标K线数量（移动端显示更少K线）
      const isMobile = window.innerWidth <= 768;
      const targetBars = isMobile ? 60 : 100;
      const chartW = (this.mainSize?.w || 800) - this.priceAxisW;
      this.zoom = Math.max(0.1, Math.min(8, chartW / (targetBars * (this.baseCandleW + 1.5))));
      // 最新K线显示在屏幕中心（从左侧开始显示，让右侧留空）
      const visibleBars = this._visibleBars();
      this.offset = -Math.floor(visibleBars * 0.3);
    } else {
      this.zoom = 1.0;
      this.offset = 0;
    }
    this.renderAll();
  }

  _getVisibleBars() {
    if (!this.data) return [];
    const total = this.data.length;
    const visible = this._visibleBars();
    const startIdx = Math.max(0, total - visible - this.offset);
    const endIdx = Math.max(0, total - this.offset);
    return this.data.slice(startIdx, endIdx);
  }

  _getVisibleRange() {
    if (!this.data) return { startIdx: 0, endIdx: 0 };
    const total = this.data.length;
    const visible = this._visibleBars();
    const startIdx = Math.max(0, total - visible - this.offset);
    const endIdx = Math.max(0, total - this.offset);
    return { startIdx, endIdx };
  }

  // 获取当前价格范围
  _getPriceRange() {
    if (!this.data || !this.data.length) {
      return { min: 0, max: 10000 };
    }

    const { startIdx, endIdx } = this._getVisibleRange();
    const bars = this.data.slice(startIdx, endIdx);
    if (!bars.length) {
      return { min: 0, max: 10000 };
    }

    let priceHi, priceLo;
    if (this.autoScaleY) {
      // 自动缩放：根据可见K线计算价格范围
      const highs = bars.map((b) => b.high);
      const lows = bars.map((b) => b.low);
      const pMin = Math.min(...lows);
      const pMax = Math.max(...highs);
      const padding = (pMax - pMin) * 0.02 || pMax * 0.01;
      priceHi = pMax + padding;
      priceLo = pMin - padding;
    } else if (this.fixedPriceRange) {
      // 固定价格范围
      priceHi = this.fixedPriceRange.max;
      priceLo = this.fixedPriceRange.min;
    } else {
      // 默认使用自动缩放
      const highs = bars.map((b) => b.high);
      const lows = bars.map((b) => b.low);
      const pMin = Math.min(...lows);
      const pMax = Math.max(...highs);
      const padding = (pMax - pMin) * 0.02 || pMax * 0.01;
      priceHi = pMax + padding;
      priceLo = pMin - padding;
    }

    return { min: priceLo, max: priceHi };
  }

  _updateCrosshair() {
    if (!this.data || this.mouseX < 0) return;
    const { startIdx, endIdx } = this._getVisibleRange();
    const chartW = (this.mainSize?.w || 0) - this.priceAxisW;
    // 计算步进式鼠标位置（以barW为步长）
    const stepX = Math.round(this.mouseX / this.barW) * this.barW + this.candleW / 2;
    this.mouseX = stepX;
    // 根据步进后的鼠标位置计算K线索引
    const barIdx = Math.floor(this.mouseX / this.barW);
    this.mouseBar = startIdx + barIdx;
    // 检查是否在有效K线范围内
    const isInValidRange = this.mouseBar >= 0 && this.mouseBar < this.data.length;
    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    if (isInValidRange && isTouchDevice) {
      // 如果鼠标悬停在最新 K 线上，使用实时数据
      const isLastBar = this.mouseBar === this.data.length - 1;
      const bar = isLastBar ? this.data[this.data.length - 1] : this.data[this.mouseBar];
      this._showTooltip(bar, isLastBar);
      this._updateOHLCVInfo(bar);
    } else {
      // PC端不显示tooltip，或鼠标位置没有K线，隐藏tooltip
      document.getElementById('tooltip').style.display = 'none';
    }
    // 更新指标面板，确保数据绑定正确
    this._updateIndicatorPanel();
  }

  _showTooltip(bar, isLastBar = false) {
    const tooltip = document.getElementById('tooltip');
    const chg = (((bar.close - bar.open) / bar.open) * 100).toFixed(2);
    const sign = chg >= 0 ? '+' : '';
    const amplitude = (((bar.high - bar.low) / bar.open) * 100).toFixed(2);
    const changeAmount = (bar.close - bar.open).toFixed(6);
    const changeAmountSign = changeAmount >= 0 ? '+' : '';
    const turnover = (bar.close * bar.volume).toFixed(2);
    const lastBarIndicator = isLastBar
      ? '<span style="color:#f0b90b;font-size:10px;margin-left:4px;">●</span>'
      : '';
    tooltip.innerHTML = `
      <div style="margin-bottom:4px;color:#787b86;">${fmtDateFull(
        bar.time,
      )}${lastBarIndicator}</div>
      <div>开 <span style="color:var(--text-primary)">${fmtPrice(bar.open)}</span></div>
      <div>高 <span style="color:var(--up)">${fmtPrice(bar.high)}</span></div>
      <div>低 <span style="color:var(--dn)">${fmtPrice(bar.low)}</span></div>
      <div>收 <span style="color:var(--text-primary)">${fmtPrice(bar.close)}</span></div>
      <div>量 <span style="color:#f0b90b">${fmt(bar.volume)}</span></div>
      <div>涨跌 <span style="${
        chg >= 0 ? 'color:var(--up)' : 'color:var(--dn)'
      }">${sign}${chg}%</span></div>
      <div>涨跌额 <span style="${
        changeAmount >= 0 ? 'color:var(--up)' : 'color:var(--dn)'
      }">${changeAmountSign}${fmtPrice(parseFloat(changeAmount))}</span></div>
      <div>振幅 <span style="color:${
        amplitude > 5
          ? 'var(--accent)'
          : amplitude > 2
            ? 'var(--text-primary)'
            : 'var(--text-secondary)'
      }">${amplitude}%</span></div>
      <div>交易额 <span style="color:var(--text-primary)">${fmt(parseFloat(turnover))}</span></div>
    `;
    const x = this.mouseX + 16;
    const y = Math.min(this.mouseY - 10, (this.mainSize?.h || 400) - 220);
    tooltip.style.left = (x + 150 > (this.mainSize?.w || 800) ? x - 170 : x) + 'px';
    tooltip.style.top = Math.max(4, y) + 'px';
    tooltip.style.display = 'block';
  }

  _updateOHLCVInfo(bar) {
    document.getElementById('infoO').textContent = fmtPrice(bar.open);
    document.getElementById('infoH').textContent = fmtPrice(bar.high);
    document.getElementById('infoL').textContent = fmtPrice(bar.low);
    document.getElementById('infoC').textContent = fmtPrice(bar.close);
    document.getElementById('infoV').textContent = fmt(bar.volume);
  }

  renderAll() {
    this._renderMain();

    // 只有在非展开状态下才渲染子图
    if (!this.isChartExpanded) {
      this._renderVol();
      if (!document.getElementById('macdWrapper').classList.contains('hidden')) this._renderMACD();
      if (!document.getElementById('rsiWrapper').classList.contains('hidden')) this._renderRSI();
      this._renderTimeAxis();
    }

    this._renderPriceAxis();
    this._updateIndicatorPanel();
    this._updateVolIndicatorPanel();
    this._updateMacdIndicatorPanel();
    this._updateRsiIndicatorPanel();

    // 复盘模式交易标记叠加渲染
    if (this.reviewTrades && this.reviewTrades.length > 0) this._renderReviewTrades();
    if (this.reviewPosition) this._renderReviewPosition();
  }

  /**
   * 更新指标信息面板
   */
  _updateIndicatorPanel() {
    const panel = document.getElementById('indicatorPanel');
    const content = document.querySelector('.indicator-panel-content');
    if (!panel || !content) return;

    // 清空面板
    content.innerHTML = '';

    // 获取当前选中的K线索引
    let selectedBarIndex = -1;
    if (this.mouseBar >= 0 && this.mouseBar < this.data?.length) {
      selectedBarIndex = this.mouseBar;
    } else {
      // 如果没有选中K线，使用最后一个K线
      selectedBarIndex = this.data?.length - 1 || -1;
    }

    // 显示K线数据（OHLCV）
    if (selectedBarIndex >= 0 && this.data?.[selectedBarIndex]) {
      const bar = this.data[selectedBarIndex];
      const chg = (((bar.close - bar.open) / bar.open) * 100).toFixed(2);
      const sign = chg >= 0 ? '+' : '';
      const amplitude = (((bar.high - bar.low) / bar.open) * 100).toFixed(2);
      const changeAmount = (bar.close - bar.open).toFixed(6);
      const changeAmountSign = changeAmount >= 0 ? '+' : '';
      const turnover = (bar.close * bar.volume).toFixed(2);

      const ohlcvGroup = document.createElement('div');
      ohlcvGroup.className = 'indicator-item ohlcv-group';
      ohlcvGroup.innerHTML = `
        <span style="color:var(--text-secondary);font-size:9px;">开</span>
        <span style="color:var(--text-primary);margin-right:2px;">${fmtPrice(bar.open)}</span>
        <span style="color:var(--text-secondary);font-size:9px;">高</span>
        <span style="color:var(--up);margin-right:2px;">${fmtPrice(bar.high)}</span>
        <span style="color:var(--text-secondary);font-size:9px;">低</span>
        <span style="color:var(--dn);margin-right:2px;">${fmtPrice(bar.low)}</span>
        <span style="color:var(--text-secondary);font-size:9px;">收</span>
        <span style="color:${chg >= 0 ? 'var(--up)' : 'var(--dn)'};margin-right:2px;">${fmtPrice(bar.close)}</span>
        <span style="color:var(--text-secondary);font-size:9px;">量</span>
        <span style="color:#f0b90b;margin-right:4px;">${fmt(bar.volume)}</span>
        <span style="color:var(--text-secondary);font-size:9px;">涨跌</span>
        <span style="color:${chg >= 0 ? 'var(--up)' : 'var(--dn)'};margin-right:2px;">${sign}${chg}%</span>
        <span style="color:var(--text-secondary);font-size:9px;">涨跌额</span>
        <span style="color:${parseFloat(changeAmount) >= 0 ? 'var(--up)' : 'var(--dn)'};margin-right:2px;">${changeAmountSign}${fmtPrice(parseFloat(changeAmount))}</span>
        <span style="color:var(--text-secondary);font-size:9px;">振幅</span>
        <span style="color:${amplitude > 5 ? 'var(--accent)' : amplitude > 2 ? 'var(--text-primary)' : 'var(--text-secondary)'};margin-right:2px;">${amplitude}%</span>
        <span style="color:var(--text-secondary);font-size:9px;">交易额</span>
        <span style="color:var(--text-primary);">${fmt(parseFloat(turnover))}</span>
      `;
      content.appendChild(ohlcvGroup);
    }

    // 显示MA指标（作为一个组合）
    if (this.showMA && this.indicators?.ma && selectedBarIndex >= 0) {
      // 获取可见的MA设置
      const visibleMASettings = this.maSettings.filter((setting) => setting.visible);
      if (visibleMASettings.length > 0) {
        const maGroup = document.createElement('div');
        maGroup.className = 'indicator-item ma-group';

        // 颜色点
        const colorEl = document.createElement('div');
        colorEl.className = 'indicator-color';
        colorEl.style.backgroundColor = visibleMASettings[0].color;
        maGroup.appendChild(colorEl);

        // 指标名称 - 动态显示MA参数
        const nameEl = document.createElement('span');
        nameEl.className = 'indicator-name';
        const maPeriods = visibleMASettings.map((setting) => setting.period).join(',');
        nameEl.textContent = `MA(${maPeriods})`;
        maGroup.appendChild(nameEl);

        // 指标值容器
        const valuesContainer = document.createElement('span');
        valuesContainer.className = 'indicator-values';

        // 定义MA键名到设置的映射
        const maKeyMap = {
          0: 'ma5', // 对应第一个MA设置
          1: 'ma25', // 对应第二个MA设置
          2: 'ma99', // 对应第三个MA设置
          3: 'ma200', // 对应第四个MA设置
        };

        // 构建MA值
        visibleMASettings.forEach((setting, index) => {
          const key = maKeyMap[index];
          const values = this.indicators.ma[key];
          if (values && values[selectedBarIndex] != null) {
            const value = values[selectedBarIndex];
            const valueSpan = document.createElement('span');
            valueSpan.style.color = setting.color;
            valueSpan.textContent = fmtPrice(value);
            valuesContainer.appendChild(valueSpan);
            if (index < visibleMASettings.length - 1) {
              const spaceSpan = document.createElement('span');
              spaceSpan.textContent = '  ';
              valuesContainer.appendChild(spaceSpan);
            }
          }
        });

        maGroup.appendChild(valuesContainer);

        // 设置按钮
        const settingsEl = document.createElement('span');
        settingsEl.className = 'indicator-settings';
        settingsEl.innerHTML =
          '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>';
        // 添加点击事件
        settingsEl.addEventListener('click', (e) => {
          e.stopPropagation();
          // 填充当前设置到表单
          for (let i = 0; i < this.maSettings.length; i++) {
            const setting = this.maSettings[i];
            document.getElementById(`ma${i + 1}Period`).value = setting.period;
            document.getElementById(`ma${i + 1}Color`).value = setting.color;
            document.getElementById(`ma${i + 1}Visible`).checked = setting.visible;
          }
          // 填充MA提示设置
          document.getElementById('maTipsVisible').checked = this.showMATips;
          document.getElementById('maModal').classList.remove('hidden');
        });

        // 添加触摸事件支持，确保移动端可点击
        settingsEl.addEventListener(
          'touchstart',
          (e) => {
            e.stopPropagation();
            e.preventDefault();
          },
          { passive: false },
        );

        settingsEl.addEventListener(
          'touchend',
          (e) => {
            e.stopPropagation();
            e.preventDefault();
            // 填充当前设置到表单
            for (let i = 0; i < this.maSettings.length; i++) {
              const setting = this.maSettings[i];
              document.getElementById(`ma${i + 1}Period`).value = setting.period;
              document.getElementById(`ma${i + 1}Color`).value = setting.color;
              document.getElementById(`ma${i + 1}Visible`).checked = setting.visible;
            }
            // 填充MA提示设置
            document.getElementById('maTipsVisible').checked = this.showMATips;
            document.getElementById('maModal').classList.remove('hidden');
          },
          { passive: false },
        );
        maGroup.appendChild(settingsEl);

        content.appendChild(maGroup);
      }
    }

    // 显示BOLL指标
    if (this.showBB && this.indicators?.bb && selectedBarIndex >= 0) {
      const bb = this.indicators.bb;
      if (bb.mid && bb.mid[selectedBarIndex] != null) {
        const midValue = bb.mid[selectedBarIndex];
        const upperValue = bb.upper[selectedBarIndex];
        const lowerValue = bb.lower[selectedBarIndex];
        if (upperValue != null && lowerValue != null) {
          const item = document.createElement('div');
          item.className = 'indicator-item';

          // 颜色点
          const colorEl = document.createElement('div');
          colorEl.className = 'indicator-color';
          colorEl.style.backgroundColor = '#ffc107';
          item.appendChild(colorEl);

          // 指标名称 - 使用实际参数
          const nameEl = document.createElement('span');
          nameEl.className = 'indicator-name';
          // 使用实际的BOLL参数
          nameEl.textContent = `BOLL(${this.bollPeriod},${this.bollMult})`;
          item.appendChild(nameEl);

          // 指标值
          const valueEl = document.createElement('span');
          valueEl.className = 'indicator-value';

          const ubSpan = document.createElement('span');
          ubSpan.style.color = this.bollColorUpper;
          ubSpan.textContent = `UB: ${fmtPrice(upperValue)}`;
          valueEl.appendChild(ubSpan);

          const space1 = document.createElement('span');
          space1.textContent = '  ';
          valueEl.appendChild(space1);

          const midSpan = document.createElement('span');
          midSpan.style.color = this.bollColorMiddle;
          midSpan.textContent = `MB: ${fmtPrice(midValue)}`;
          valueEl.appendChild(midSpan);

          const space2 = document.createElement('span');
          space2.textContent = '  ';
          valueEl.appendChild(space2);

          const lbSpan = document.createElement('span');
          lbSpan.style.color = this.bollColorLower;
          lbSpan.textContent = `LB: ${fmtPrice(lowerValue)}`;
          valueEl.appendChild(lbSpan);

          item.appendChild(valueEl);

          // 设置按钮
          const settingsEl = document.createElement('span');
          settingsEl.className = 'indicator-settings';
          settingsEl.innerHTML =
            '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>';
          // 添加点击事件
          settingsEl.addEventListener('click', (e) => {
            e.stopPropagation();
            // 填充当前设置到表单
            document.getElementById('bollPeriod').value = this.bollPeriod;
            document.getElementById('bollMult').value = this.bollMult;
            // 填充颜色设置
            document.getElementById('bollColorUpper').value = this.bollColorUpper;
            document.getElementById('bollColorMiddle').value = this.bollColorMiddle;
            document.getElementById('bollColorLower').value = this.bollColorLower;
            // 处理背景颜色和透明度
            const bgColor = this.bollColorBackground;
            // 从rgba字符串中提取颜色和透明度
            const match = bgColor.match(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/);
            if (match) {
              const r = parseInt(match[1]);
              const g = parseInt(match[2]);
              const b = parseInt(match[3]);
              const opacity = parseFloat(match[4]);
              // 将rgb转换为十六进制
              const hexColor = `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
              document.getElementById('bollColorBackground').value = hexColor;
              document.getElementById('bollColorOpacity').value = opacity;
            } else {
              // 如果不是rgba格式，使用默认值
              document.getElementById('bollColorBackground').value = '#ffc107';
              document.getElementById('bollColorOpacity').value = 0.05;
            }
            // 填充背景显示开关设置
            document.getElementById('bollShowBackground').checked = this.bollShowBackground;
            document.getElementById('bollModal')?.classList.remove('hidden');
          });

          // 添加触摸事件支持，确保移动端可点击
          settingsEl.addEventListener(
            'touchstart',
            (e) => {
              e.stopPropagation();
              e.preventDefault();
            },
            { passive: false },
          );

          settingsEl.addEventListener(
            'touchend',
            (e) => {
              e.stopPropagation();
              e.preventDefault();
              // 填充当前设置到表单
              document.getElementById('bollPeriod').value = this.bollPeriod;
              document.getElementById('bollMult').value = this.bollMult;
              // 填充颜色设置
              document.getElementById('bollColorUpper').value = this.bollColorUpper;
              document.getElementById('bollColorMiddle').value = this.bollColorMiddle;
              document.getElementById('bollColorLower').value = this.bollColorLower;
              // 处理背景颜色和透明度
              const bgColor = this.bollColorBackground;
              // 从rgba字符串中提取颜色和透明度
              const match = bgColor.match(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/);
              if (match) {
                const r = parseInt(match[1]);
                const g = parseInt(match[2]);
                const b = parseInt(match[3]);
                const opacity = parseFloat(match[4]);
                // 将rgb转换为十六进制
                const hexColor = `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
                document.getElementById('bollColorBackground').value = hexColor;
                document.getElementById('bollColorOpacity').value = opacity;
              } else {
                // 如果不是rgba格式，使用默认值
                document.getElementById('bollColorBackground').value = '#ffc107';
                document.getElementById('bollColorOpacity').value = 0.05;
              }
              document.getElementById('bollModal')?.classList.remove('hidden');
            },
            { passive: false },
          );
          item.appendChild(settingsEl);

          content.appendChild(item);
        }
      }
    }

    // 显示SuperTrend指标
    if (this.showSuperTrend && this.indicators?.superTrend && selectedBarIndex >= 0) {
      const st = this.indicators.superTrend;
      if (st.value && st.value[selectedBarIndex] != null) {
        const value = st.value[selectedBarIndex];
        const trend = st.trend[selectedBarIndex];
        if (trend != null) {
          const item = document.createElement('div');
          item.className = 'indicator-item';

          // 颜色点
          const colorEl = document.createElement('div');
          colorEl.className = 'indicator-color';
          colorEl.style.backgroundColor = trend === 1 ? '#26a69a' : '#ef5350';
          item.appendChild(colorEl);

          // 指标名称
          const nameEl = document.createElement('span');
          nameEl.className = 'indicator-name';
          nameEl.textContent = 'SuperTrend';
          item.appendChild(nameEl);

          // 指标值
          const valueEl = document.createElement('span');
          valueEl.className = 'indicator-value';
          valueEl.textContent = fmtPrice(value);
          item.appendChild(valueEl);

          // 设置按钮
          const settingsEl = document.createElement('span');
          settingsEl.className = 'indicator-settings';
          settingsEl.innerHTML =
            '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>';
          // 添加点击事件
          settingsEl.addEventListener('click', (e) => {
            e.stopPropagation();
            document.getElementById('superTrendModal').classList.remove('hidden');
          });

          // 添加触摸事件支持，确保移动端可点击
          settingsEl.addEventListener(
            'touchstart',
            (e) => {
              e.stopPropagation();
              e.preventDefault();
            },
            { passive: false },
          );

          settingsEl.addEventListener(
            'touchend',
            (e) => {
              e.stopPropagation();
              e.preventDefault();
              document.getElementById('superTrendModal').classList.remove('hidden');
            },
            { passive: false },
          );
          item.appendChild(settingsEl);

          content.appendChild(item);
        }
      }
    }

    // 显示Pi Cycle Bottom指标
    if (this.showPiCycleBottom && this.indicators?.piCycleBottom && selectedBarIndex >= 0) {
      const pb = this.indicators.piCycleBottom;
      if (pb.longMA[selectedBarIndex] != null && pb.shortMA[selectedBarIndex] != null) {
        const longValue = pb.longMA[selectedBarIndex];
        const shortValue = pb.shortMA[selectedBarIndex];
        const crossValue = pb.cross[selectedBarIndex];

        const item = document.createElement('div');
        item.className = 'indicator-item';

        // 颜色点 - 根据交叉状态显示颜色
        const colorEl = document.createElement('div');
        colorEl.className = 'indicator-color';
        if (crossValue === 1) {
          colorEl.style.backgroundColor = '#00c853';
        } else if (shortValue > longValue) {
          colorEl.style.backgroundColor = 'rgba(33, 150, 243, 0.8)';
        } else {
          colorEl.style.backgroundColor = 'rgba(255, 152, 0, 0.8)';
        }
        item.appendChild(colorEl);

        // 指标名称
        const nameEl = document.createElement('span');
        nameEl.className = 'indicator-name';
        nameEl.textContent = 'PI';
        item.appendChild(nameEl);

        // 指标值 - 显示长线和短线的值
        const valueEl = document.createElement('span');
        valueEl.className = 'indicator-value';
        valueEl.textContent = fmtPrice(shortValue) + ' / ' + fmtPrice(longValue);
        item.appendChild(valueEl);

        content.appendChild(item);
      }
    }

    // 显示SuperTrend Avg指标
    if (this.showSuperTrendAvg && this.indicators?.superTrendAvg && selectedBarIndex >= 0) {
      const sta = this.indicators.superTrendAvg;
      if (sta.avg[selectedBarIndex] != null) {
        const value = sta.avg[selectedBarIndex];
        const trend = sta.trend[selectedBarIndex];

        const item = document.createElement('div');
        item.className = 'indicator-item';

        // 颜色点
        const colorEl = document.createElement('div');
        colorEl.className = 'indicator-color';
        colorEl.style.backgroundColor = '#ff9800'; // 橙色
        item.appendChild(colorEl);

        // 指标名称
        const nameEl = document.createElement('span');
        nameEl.className = 'indicator-name';
        nameEl.textContent = 'STA';
        item.appendChild(nameEl);

        // 指标值
        const valueEl = document.createElement('span');
        valueEl.className = 'indicator-value';
        valueEl.textContent = fmtPrice(value);
        item.appendChild(valueEl);

        content.appendChild(item);
      }
    }

    // 如果没有指标，隐藏面板
    if (content.children.length === 0) {
      panel.style.display = 'none';
    } else {
      panel.style.display = 'block';
    }
  }

  /**
   * 更新成交量指标信息面板
   */
  _updateVolIndicatorPanel() {
    const panel = document.getElementById('volIndicatorPanel');
    const content = panel?.querySelector('.indicator-panel-content');
    if (!panel || !content) return;

    // 清空面板
    content.innerHTML = '';

    // 获取当前选中的K线索引
    let selectedBarIndex = -1;
    if (this.mouseBar >= 0 && this.mouseBar < this.data?.length) {
      selectedBarIndex = this.mouseBar;
    } else {
      // 如果没有选中K线，使用最后一个K线
      selectedBarIndex = this.data?.length - 1 || -1;
    }

    // 显示成交量指标
    if (this.showVol && this.data && selectedBarIndex >= 0) {
      const bar = this.data[selectedBarIndex];
      if (bar && bar.volume != null) {
        const item = document.createElement('div');
        item.className = 'indicator-item';

        // 颜色点
        const colorEl = document.createElement('div');
        colorEl.className = 'indicator-color';
        colorEl.style.backgroundColor = '#f0b90b';
        item.appendChild(colorEl);

        // 指标名称
        const nameEl = document.createElement('span');
        nameEl.className = 'indicator-name';
        nameEl.textContent = 'Volume';
        item.appendChild(nameEl);

        // 指标值
        const valueEl = document.createElement('span');
        valueEl.className = 'indicator-value';
        valueEl.textContent = fmt(bar.volume);
        item.appendChild(valueEl);

        // 设置按钮
        const settingsEl = document.createElement('span');
        settingsEl.className = 'indicator-settings';
        settingsEl.innerHTML =
          '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>';
        // 添加点击事件
        settingsEl.addEventListener('click', (e) => {
          e.stopPropagation();
          // 填充当前设置到表单
          document.getElementById('volumeType').value = 'bar'; // 默认值
          document.getElementById('volumeModal')?.classList.remove('hidden');
        });

        // 添加触摸事件支持，确保移动端可点击
        settingsEl.addEventListener(
          'touchstart',
          (e) => {
            e.stopPropagation();
            e.preventDefault();
          },
          { passive: false },
        );

        settingsEl.addEventListener(
          'touchend',
          (e) => {
            e.stopPropagation();
            e.preventDefault();
            // 填充当前设置到表单
            document.getElementById('volumeType').value = 'bar'; // 默认值
            document.getElementById('volumeModal')?.classList.remove('hidden');
          },
          { passive: false },
        );
        item.appendChild(settingsEl);

        content.appendChild(item);
      }
    }

    // 如果没有指标，隐藏面板
    if (content.children.length === 0) {
      panel.style.display = 'none';
    } else {
      panel.style.display = 'block';
    }
  }

  /**
   * 更新MACD指标信息面板
   */
  _updateMacdIndicatorPanel() {
    const panel = document.getElementById('macdIndicatorPanel');
    const content = panel?.querySelector('.indicator-panel-content');
    if (!panel || !content) return;

    // 清空面板
    content.innerHTML = '';

    // 获取当前选中的K线索引
    let selectedBarIndex = -1;
    if (this.mouseBar >= 0 && this.mouseBar < this.data?.length) {
      selectedBarIndex = this.mouseBar;
    } else {
      // 如果没有选中K线，使用最后一个K线
      selectedBarIndex = this.data?.length - 1 || -1;
    }

    // 显示MACD指标
    if (this.showMACD && this.indicators?.macd && selectedBarIndex >= 0) {
      const macd = this.indicators.macd;
      if (macd.dif && macd.dea && macd.macd && selectedBarIndex >= 0) {
        const difValue = macd.dif[selectedBarIndex];
        const deaValue = macd.dea[selectedBarIndex];
        const macdValue = macd.macd[selectedBarIndex];
        if (difValue != null && deaValue != null && macdValue != null) {
          const item = document.createElement('div');
          item.className = 'indicator-item';

          // 颜色点
          const colorEl = document.createElement('div');
          colorEl.className = 'indicator-color';
          colorEl.style.backgroundColor = '#42a5f5';
          item.appendChild(colorEl);

          // 指标名称 - 使用实际参数
          const nameEl = document.createElement('span');
          nameEl.className = 'indicator-name';
          nameEl.textContent = `MACD(${this.macdFast},${this.macdSlow},${this.macdSignal})`;
          item.appendChild(nameEl);

          // 指标值
          const valueEl = document.createElement('span');
          valueEl.className = 'indicator-value';

          const difSpan = document.createElement('span');
          difSpan.style.color = '#f0b90b';
          difSpan.textContent = `DIF: ${fmtPrice(difValue)}`;
          valueEl.appendChild(difSpan);

          const space1 = document.createElement('span');
          space1.textContent = '  ';
          valueEl.appendChild(space1);

          const deaSpan = document.createElement('span');
          deaSpan.style.color = '#2962ff';
          deaSpan.textContent = `DEA: ${fmtPrice(deaValue)}`;
          valueEl.appendChild(deaSpan);

          const space2 = document.createElement('span');
          space2.textContent = '  ';
          valueEl.appendChild(space2);

          const macdSpan = document.createElement('span');
          macdSpan.style.color = macdValue >= 0 ? '#26a69a' : '#ef5350';
          macdSpan.textContent = `MACD: ${fmtPrice(macdValue)}`;
          valueEl.appendChild(macdSpan);

          item.appendChild(valueEl);

          // 设置按钮
          const settingsEl = document.createElement('span');
          settingsEl.className = 'indicator-settings';
          settingsEl.innerHTML =
            '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>';
          // 添加点击事件
          settingsEl.addEventListener('click', (e) => {
            e.stopPropagation();
            // 填充当前设置到表单
            document.getElementById('macdFast').value = this.macdFast;
            document.getElementById('macdSlow').value = this.macdSlow;
            document.getElementById('macdSignal').value = this.macdSignal;
            document.getElementById('macdModal')?.classList.remove('hidden');
          });

          // 添加触摸事件支持，确保移动端可点击
          settingsEl.addEventListener(
            'touchstart',
            (e) => {
              e.stopPropagation();
              e.preventDefault();
            },
            { passive: false },
          );

          settingsEl.addEventListener(
            'touchend',
            (e) => {
              e.stopPropagation();
              e.preventDefault();
              // 填充当前设置到表单
              document.getElementById('macdFast').value = this.macdFast;
              document.getElementById('macdSlow').value = this.macdSlow;
              document.getElementById('macdSignal').value = this.macdSignal;
              document.getElementById('macdModal')?.classList.remove('hidden');
            },
            { passive: false },
          );
          item.appendChild(settingsEl);

          content.appendChild(item);
        }
      }
    }

    // 如果没有指标，隐藏面板
    if (content.children.length === 0) {
      panel.style.display = 'none';
    } else {
      panel.style.display = 'block';
    }
  }

  /**
   * 更新RSI指标信息面板
   */
  _updateRsiIndicatorPanel() {
    const panel = document.getElementById('rsiIndicatorPanel');
    const content = panel?.querySelector('.indicator-panel-content');
    if (!panel || !content) return;

    // 清空面板
    content.innerHTML = '';

    // 获取当前选中的K线索引
    let selectedBarIndex = -1;
    if (this.mouseBar >= 0 && this.mouseBar < this.data?.length) {
      selectedBarIndex = this.mouseBar;
    } else {
      // 如果没有选中K线，使用最后一个K线
      selectedBarIndex = this.data?.length - 1 || -1;
    }

    // 显示RSI指标
    if (this.showRSI && this.indicators?.rsi && selectedBarIndex >= 0) {
      const rsi = this.indicators.rsi;
      if (rsi[selectedBarIndex] != null) {
        const rsiValue = rsi[selectedBarIndex];
        const item = document.createElement('div');
        item.className = 'indicator-item';

        // 颜色点
        const colorEl = document.createElement('div');
        colorEl.className = 'indicator-color';
        colorEl.style.backgroundColor = '#9c27b0';
        item.appendChild(colorEl);

        // 指标名称 - 使用实际参数
        const nameEl = document.createElement('span');
        nameEl.className = 'indicator-name';
        nameEl.textContent = `RSI(${this.rsiPeriod})`;
        item.appendChild(nameEl);

        // 指标值
        const valueEl = document.createElement('span');
        valueEl.className = 'indicator-value';
        valueEl.style.color = '#9c27b0';
        valueEl.textContent = rsiValue.toFixed(2);
        item.appendChild(valueEl);

        // 设置按钮
        const settingsEl = document.createElement('span');
        settingsEl.className = 'indicator-settings';
        settingsEl.innerHTML =
          '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>';
        // 添加点击事件
        settingsEl.addEventListener('click', (e) => {
          e.stopPropagation();
          // 填充当前设置到表单
          document.getElementById('rsiPeriod').value = this.rsiPeriod;
          document.getElementById('rsiModal')?.classList.remove('hidden');
        });

        // 添加触摸事件支持，确保移动端可点击
        settingsEl.addEventListener(
          'touchstart',
          (e) => {
            e.stopPropagation();
            e.preventDefault();
          },
          { passive: false },
        );

        settingsEl.addEventListener(
          'touchend',
          (e) => {
            e.stopPropagation();
            e.preventDefault();
            // 填充当前设置到表单
            document.getElementById('rsiPeriod').value = this.rsiPeriod;
            document.getElementById('rsiModal')?.classList.remove('hidden');
          },
          { passive: false },
        );
        item.appendChild(settingsEl);

        content.appendChild(item);
      }
    }

    // 如果没有指标，隐藏面板
    if (content.children.length === 0) {
      panel.style.display = 'none';
    } else {
      panel.style.display = 'block';
    }
  }

  /* ---- Main Chart ---- */
  _renderMain() {
    const ctx = this.mainCtx;
    const { w, h } = this.mainSize || { w: 0, h: 0 };
    const chartW = w - this.priceAxisW;
    ctx.clearRect(0, 0, w, h);

    if (!this.data || !this.data.length) return;

    const { startIdx, endIdx } = this._getVisibleRange();
    const bars = this.data.slice(startIdx, endIdx);
    if (!bars.length) return;

    // Price range
    let priceHi, priceLo, priceRange;
    if (this.autoScaleY) {
      // 自动缩放：根据可见K线计算价格范围
      const highs = bars.map((b) => b.high);
      const lows = bars.map((b) => b.low);
      const pMin = Math.min(...lows);
      const pMax = Math.max(...highs);
      const padding = (pMax - pMin) * 0.02 || pMax * 0.01;
      priceHi = pMax + padding;
      priceLo = pMin - padding;
    } else if (this.fixedPriceRange) {
      // 固定价格范围
      priceHi = this.fixedPriceRange.max;
      priceLo = this.fixedPriceRange.min;
    } else {
      // 默认使用自动缩放
      const highs = bars.map((b) => b.high);
      const lows = bars.map((b) => b.low);
      const pMin = Math.min(...lows);
      const pMax = Math.max(...highs);
      const padding = (pMax - pMin) * 0.02 || pMax * 0.01;
      priceHi = pMax + padding;
      priceLo = pMin - padding;
    }
    priceRange = priceHi - priceLo;

    this._priceHi = priceHi;
    this._priceLo = priceLo;
    this._startIdx = startIdx;

    const px = (price) => h - ((price - priceLo) / priceRange) * h;

    // Grid
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 1;
    const gridLines = 6;
    for (let i = 0; i <= gridLines; i++) {
      const y = Math.round((h / gridLines) * i) + 0.5;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(chartW, y);
      ctx.stroke();
    }
    const barCount = Math.ceil(chartW / (this.barW * 4));
    for (let i = 0; i <= barCount; i++) {
      const x = Math.round(i * this.barW * 4) + 0.5;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }

    const ind = this.indicators;

    // Bollinger Bands
    if (ind?.bb && this.showBB) {
      const drawBollLine = (arr, color) => {
        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.lineWidth = 0.8;
        let started = false;
        bars.forEach((b, i) => {
          const val = arr[startIdx + i];
          if (val == null) {
            started = false;
            return;
          }
          const x = i * this.barW + this.candleW / 2;
          if (!started) {
            ctx.moveTo(x, px(val));
            started = true;
          } else ctx.lineTo(x, px(val));
        });
        ctx.stroke();
      };
      // Fill between upper and lower
      if (this.bollShowBackground) {
        ctx.beginPath();
        ctx.fillStyle = this.bollColorBackground;
        let firstValid = true;
        for (let i = 0; i < bars.length; i++) {
          const upper = ind.bb.upper[startIdx + i];
          if (upper == null) continue;
          const x = i * this.barW + this.candleW / 2;
          if (firstValid) {
            ctx.moveTo(x, px(upper));
            firstValid = false;
          } else ctx.lineTo(x, px(upper));
        }
        for (let i = bars.length - 1; i >= 0; i--) {
          const lower = ind.bb.lower[startIdx + i];
          if (lower == null) continue;
          const x = i * this.barW + this.candleW / 2;
          ctx.lineTo(x, px(lower));
        }
        ctx.closePath();
        ctx.fill();
      }
      drawBollLine(ind.bb.upper, this.bollColorUpper);
      drawBollLine(ind.bb.mid, this.bollColorMiddle);
      drawBollLine(ind.bb.lower, this.bollColorLower);
    }

    if (this.chartType === 'line' || this.chartType === 'area') {
      // Line / Area chart
      const closes = bars.map((b) => b.close);
      ctx.beginPath();
      bars.forEach((b, i) => {
        const x = i * this.barW + this.candleW / 2;
        const y = px(b.close);
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      });

      if (this.chartType === 'area') {
        ctx.lineTo((bars.length - 1) * this.barW + this.candleW / 2, h);
        ctx.lineTo(0, h);
        ctx.closePath();
        const grad = ctx.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, 'rgba(41,98,255,0.25)');
        grad.addColorStop(1, 'rgba(41,98,255,0.01)');
        ctx.fillStyle = grad;
        ctx.fill();
        ctx.beginPath();
        bars.forEach((b, i) => {
          const x = i * this.barW + this.candleW / 2;
          const y = px(b.close);
          i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        });
      }

      ctx.strokeStyle = '#2962ff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    } else {
      // Candlestick
      bars.forEach((bar, i) => {
        const x = i * this.barW;
        const up = bar.close >= bar.open;
        const color = up ? '#26a69a' : '#ef5350';
        const bodyTop = px(Math.max(bar.open, bar.close));
        const bodyBot = px(Math.min(bar.open, bar.close));
        const bodyH = Math.max(1, bodyBot - bodyTop);
        const wickX = x + this.candleW / 2;

        // Wick
        ctx.strokeStyle = color;
        ctx.lineWidth = Math.max(1, this.candleW < 4 ? 0.8 : 1);
        ctx.beginPath();
        ctx.moveTo(wickX, px(bar.high));
        ctx.lineTo(wickX, bodyTop);
        ctx.moveTo(wickX, bodyBot);
        ctx.lineTo(wickX, px(bar.low));
        ctx.stroke();

        // Body
        if (this.candleW >= 3) {
          ctx.fillStyle = up ? 'rgba(38,166,154,0.9)' : 'rgba(239,83,80,0.9)';
          if (up && bodyH <= 1) {
            ctx.strokeStyle = color;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(x, bodyTop);
            ctx.lineTo(x + this.candleW, bodyTop);
            ctx.stroke();
          } else {
            ctx.fillRect(x, bodyTop, this.candleW, bodyH);
            if (this.candleW >= 5) {
              ctx.strokeStyle = color;
              ctx.lineWidth = 0.5;
              ctx.strokeRect(x, bodyTop, this.candleW, bodyH);
            }
          }
        } else {
          ctx.fillStyle = color;
          ctx.fillRect(x, Math.min(bodyTop, px(bar.high)), 1, Math.abs(px(bar.high) - px(bar.low)));
        }
      });
    }

    // MA Lines
    if (ind?.ma && this.showMA) {
      // 定义MA键名到设置索引的映射
      const maKeyToIndex = {
        ma5: 0,
        ma25: 1,
        ma99: 2,
        ma200: 3,
      };

      Object.entries(ind.ma).forEach(([key, values]) => {
        if (!values) return;
        // 获取对应的颜色设置
        const index = maKeyToIndex[key];
        let color = '#f0b90b'; // 默认颜色
        if (this.maSettings && this.maSettings[index]) {
          color = this.maSettings[index].color;
        }
        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.2;
        let started = false;
        bars.forEach((b, i) => {
          const val = values[startIdx + i];
          if (val == null) {
            started = false;
            return;
          }
          const x = i * this.barW + this.candleW / 2;
          if (!started) {
            ctx.moveTo(x, px(val));
            started = true;
          } else ctx.lineTo(x, px(val));
        });
        ctx.stroke();
      });
    }

    // K线上穿MA25时显示B字符
    if (ind?.ma?.ma25 && this.showMA && this.showMATips) {
      const ma25 = ind.ma.ma25;
      bars.forEach((bar, i) => {
        const idx = startIdx + i;
        if (idx > 0 && ma25[idx] != null && ma25[idx - 1] != null) {
          // 检查是否上穿：当前K线收盘价高于MA25，前一根K线收盘价低于MA25
          if (bar.close > ma25[idx] && this.data[idx - 1].close < ma25[idx - 1]) {
            const x = i * this.barW + this.candleW / 2;
            const y = px(Math.max(bar.high, ma25[idx])) - 10;
            ctx.fillStyle = '#26a69a';
            ctx.font = 'bold 12px SF Pro, monospace';
            ctx.textAlign = 'center';
            ctx.fillText('B', x, y);
            ctx.textAlign = 'left';
          }
        }
      });
    }

    // MA7上穿MA25形成金叉时显示X字符
    if (ind?.ma?.ma5 && ind?.ma?.ma25 && this.showMA && this.showMATips) {
      const ma7 = ind.ma.ma5; // ma5对应ma7设置
      const ma25 = ind.ma.ma25;
      bars.forEach((bar, i) => {
        const idx = startIdx + i;
        if (
          idx > 0 &&
          ma7[idx] != null &&
          ma25[idx] != null &&
          ma7[idx - 1] != null &&
          ma25[idx - 1] != null
        ) {
          // 检查是否金叉：当前MA7高于MA25，前一根MA7低于MA25
          if (ma7[idx] > ma25[idx] && ma7[idx - 1] < ma25[idx - 1]) {
            const x = i * this.barW + this.candleW / 2;
            const y = px(Math.max(bar.high, ma7[idx], ma25[idx])) - 15;
            ctx.fillStyle = '#ff6b9d';
            ctx.font = 'bold 12px SF Pro, monospace';
            ctx.textAlign = 'center';
            ctx.fillText('X', x, y);
            ctx.textAlign = 'left';
          }
        }
      });
    }

    // 超级趋势指标 (SuperTrend)
    if (ind?.superTrend && this.showSuperTrend) {
      const st = ind.superTrend;

      // 绘制背景色（只在K线到趋势线之间）
      bars.forEach((b, i) => {
        const idx = startIdx + i;
        if (st.trend[idx] == null || st.value[idx] == null) return;

        const trend = st.trend[idx];
        const stValue = st.value[idx];
        const x = i * this.barW;
        const barWidth = this.barW;

        // 计算K线的最高和最低价格
        const kHigh = b.high;
        const kLow = b.low;

        // 计算对应的Y坐标
        const kHighY = px(kHigh);
        const kLowY = px(kLow);
        const stY = px(stValue);

        // 确定填充区域的上下边界
        let fillTop, fillBottom;
        if (stValue > b.high) {
          // 趋势线在K线上方：填充K线顶部到趋势线之间
          fillTop = Math.min(kHighY, stY);
          fillBottom = Math.max(kHighY, stY);
        } else if (stValue < b.low) {
          // 趋势线在K线下方：填充K线底部到趋势线之间
          fillTop = Math.min(kLowY, stY);
          fillBottom = Math.max(kLowY, stY);
        } else {
          // 趋势线在K线范围内：不填充背景色
          return;
        }

        // 填充背景色
        const bgColor = trend === 1 ? 'rgba(38, 166, 154, 0.1)' : 'rgba(239, 83, 80, 0.1)';
        ctx.fillStyle = bgColor;
        ctx.fillRect(x, fillTop, barWidth, fillBottom - fillTop);
      });

      // 绘制趋势线
      ctx.beginPath();
      ctx.lineWidth = 2;
      let started = false;
      let lastTrend = null;
      bars.forEach((b, i) => {
        const idx = startIdx + i;
        if (st.value[idx] == null) return;
        const x = i * this.barW + this.candleW / 2;
        const y = px(st.value[idx]);
        const trend = st.trend[idx];
        // 根据趋势改变颜色
        const color = trend === 1 ? '#26a69a' : '#ef5350'; // 上涨绿色，下跌红色
        if (trend !== lastTrend || !started) {
          if (started) ctx.stroke();
          ctx.beginPath();
          ctx.strokeStyle = color;
          started = true;
        }
        ctx.lineTo(x, y);
        lastTrend = trend;
      });
      if (started) ctx.stroke();
    }

    // Pi Cycle Bottom 指标
    if (this.showPiCycleBottom && ind?.piCycleBottom) {
      const pb = ind.piCycleBottom;

      // 绘制长均线 SMA(471) * 0.745
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(255, 152, 0, 0.6)';
      ctx.lineWidth = 1.5;
      let started = false;
      bars.forEach((b, i) => {
        const idx = startIdx + i;
        if (pb.longMA[idx] == null) return;
        const x = i * this.barW + this.candleW / 2;
        const y = px(pb.longMA[idx]);
        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else {
          ctx.lineTo(x, y);
        }
      });
      if (started) ctx.stroke();

      // 绘制短均线 EMA(150)
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(33, 150, 243, 0.6)';
      ctx.lineWidth = 1.5;
      started = false;
      bars.forEach((b, i) => {
        const idx = startIdx + i;
        if (pb.shortMA[idx] == null) return;
        const x = i * this.barW + this.candleW / 2;
        const y = px(pb.shortMA[idx]);
        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else {
          ctx.lineTo(x, y);
        }
      });
      if (started) ctx.stroke();

      // 绘制死亡交叉信号（绿色三角形）
      bars.forEach((b, i) => {
        const idx = startIdx + i;
        if (pb.cross[idx] === 1) {
          const x = i * this.barW + this.candleW / 2;
          const y = px(b.low) + 15;
          ctx.fillStyle = '#00c853';
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x - 6, y - 10);
          ctx.lineTo(x + 6, y - 10);
          ctx.closePath();
          ctx.fill();
        }
      });
    }

    // SuperTrend Avg (Exact) 指标
    if (this.showSuperTrendAvg && ind?.superTrendAvg) {
      const sta = ind.superTrendAvg;

      // 绘制平均线
      ctx.beginPath();
      ctx.strokeStyle = '#ff9800'; // 橙色
      ctx.lineWidth = 2;
      let started = false;
      bars.forEach((b, i) => {
        const idx = startIdx + i;
        if (sta.avg[idx] == null) return;
        const x = i * this.barW + this.candleW / 2;
        const y = px(sta.avg[idx]);
        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else {
          ctx.lineTo(x, y);
        }
      });
      if (started) ctx.stroke();
    }

    // 实时价格线
    if (this.showLastPriceLine && this.lastPrice != null) {
      const lastPriceY = px(this.lastPrice);
      ctx.beginPath();
      ctx.strokeStyle = '#2962ff';
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 3]);
      ctx.moveTo(0, lastPriceY);
      ctx.lineTo(chartW, lastPriceY);
      ctx.stroke();
      ctx.setLineDash([]);

      // 价格标签
      ctx.fillStyle = 'rgba(41, 98, 255, 0.9)';
      const labelWidth = 68;
      const labelHeight = 16;
      ctx.fillRect(chartW + 1, lastPriceY - labelHeight / 2, labelWidth, labelHeight);
      ctx.fillStyle = '#fff';
      ctx.font = '11px SF Pro, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(fmtPrice(this.lastPrice), chartW + 1 + labelWidth / 2, lastPriceY + 4);
      ctx.textAlign = 'left';
    }

    // 测量工具
    if (this.measureMode && this.measureStart) {
      const start = this.measureStart;
      // 使用 measurePreview 进行预览，measureEnd 用于最终保存
      const end = this.measureEnd || this.measurePreview;

      if (end) {
        // 绘制测量背景（蓝色透明）
        ctx.fillStyle = 'rgba(41, 98, 255, 0.1)';
        const minX = Math.min(start.x, end.x);
        const maxX = Math.max(start.x, end.x);
        const minY = Math.min(start.y, end.y);
        const maxY = Math.max(start.y, end.y);
        ctx.fillRect(minX, minY, maxX - minX, maxY - minY);

        // 绘制测量线（只在测量起始位之内）
        ctx.beginPath();
        ctx.strokeStyle = '#ff9800';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 3]);
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(end.x, end.y);
        ctx.stroke();
        ctx.setLineDash([]);

        // 计算中心点
        const centerX = (start.x + end.x) / 2;
        const centerY = (start.y + end.y) / 2;

        // 绘制中心点十字线（只在测量起始位之内）
        ctx.beginPath();
        ctx.strokeStyle = '#ff9800';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([3, 2]);
        // 水平线：从测量线左侧延伸到右侧
        ctx.moveTo(Math.min(start.x, end.x), centerY);
        ctx.lineTo(Math.max(start.x, end.x), centerY);
        // 垂直线：从测量线上方延伸到下方
        ctx.moveTo(centerX, Math.min(start.y, end.y));
        ctx.lineTo(centerX, Math.max(start.y, end.y));
        ctx.stroke();
        ctx.setLineDash([]);

        // 计算测量数据
        const priceDiff = end.price - start.price;
        const priceDiffPercent = start.price !== 0 ? (priceDiff / start.price) * 100 : 0;
        const timeDiff = end.time - start.time;
        const timeDiffHours = timeDiff / (1000 * 60 * 60);

        // 绘制测量标签
        const labelX = centerX;
        // 将标签显示在最高点上方
        const labelY = minY - 20;

        ctx.fillStyle = 'rgba(255, 152, 0, 0.9)';
        ctx.font = '12px SF Pro, monospace';
        ctx.textAlign = 'center';

        // 价格变化
        const priceChangeText = `${priceDiff >= 0 ? '+' : ''}${fmtPrice(priceDiff)} (${priceDiffPercent >= 0 ? '+' : ''}${priceDiffPercent.toFixed(2)}%)`;
        ctx.fillText(priceChangeText, labelX, labelY);

        // 时间变化
        const timeChangeText = `${timeDiffHours.toFixed(1)}h`;
        ctx.fillText(timeChangeText, labelX, labelY + 16);

        ctx.textAlign = 'left';
      }
    }

    // 渲染保存的测量结果
    if (this.measurements.length > 0) {
      this.measurements.forEach((measurement) => {
        const start = measurement.start;
        const end = measurement.end;

        // 根据K线索引和当前可见范围计算像素坐标
        const { startIdx } = this._getVisibleRange();
        const startX = (start.barIndex - startIdx) * this.barW + this.candleW / 2;
        const endX = (end.barIndex - startIdx) * this.barW + this.candleW / 2;

        // 根据价格计算Y坐标
        const priceRange = this._getPriceRange();
        if (!priceRange || priceRange.max === priceRange.min) return;
        const startY =
          this.mainSize.h -
          ((start.price - priceRange.min) / (priceRange.max - priceRange.min)) * this.mainSize.h;
        const endY =
          this.mainSize.h -
          ((end.price - priceRange.min) / (priceRange.max - priceRange.min)) * this.mainSize.h;

        // 绘制测量背景（蓝色透明）
        ctx.fillStyle = 'rgba(41, 98, 255, 0.1)';
        const minX = Math.min(startX, endX);
        const maxX = Math.max(startX, endX);
        const minY = Math.min(startY, endY);
        const maxY = Math.max(startY, endY);
        ctx.fillRect(minX, minY, maxX - minX, maxY - minY);

        // 绘制测量线（只在测量起始位之内）
        ctx.beginPath();
        ctx.strokeStyle = '#ff9800';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 3]);
        ctx.moveTo(startX, startY);
        ctx.lineTo(endX, endY);
        ctx.stroke();
        ctx.setLineDash([]);

        // 计算中心点
        const centerX = (startX + endX) / 2;
        const centerY = (startY + endY) / 2;

        // 绘制中心点十字线（只在测量起始位之内）
        ctx.beginPath();
        ctx.strokeStyle = '#ff9800';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([3, 2]);
        // 水平线：从测量线左侧延伸到右侧
        ctx.moveTo(Math.min(startX, endX), centerY);
        ctx.lineTo(Math.max(startX, endX), centerY);
        // 垂直线：从测量线上方延伸到下方
        ctx.moveTo(centerX, Math.min(startY, endY));
        ctx.lineTo(centerX, Math.max(startY, endY));
        ctx.stroke();
        ctx.setLineDash([]);

        // 绘制测量标签
        const labelX = centerX;
        // 将标签显示在最高点上方
        const labelY = minY - 20;

        ctx.fillStyle = 'rgba(255, 152, 0, 0.9)';
        ctx.font = '12px SF Pro, monospace';
        ctx.textAlign = 'center';

        // 价格变化
        const priceChangeText = `${measurement.priceDiff >= 0 ? '+' : ''}${fmtPrice(measurement.priceDiff)} (${measurement.priceDiffPercent >= 0 ? '+' : ''}${measurement.priceDiffPercent.toFixed(2)}%)`;
        ctx.fillText(priceChangeText, labelX, labelY);

        // 时间变化
        const timeChangeText = `${measurement.timeDiffHours.toFixed(1)}h`;
        ctx.fillText(timeChangeText, labelX, labelY + 16);

        ctx.textAlign = 'left';
      });
    }

    // 渲染保存的绘图
    if (this.drawings.length > 0) {
      this.drawings.forEach((drawing) => {
        // 使用时间戳获取正确的K线索引（支持周期切换）
        const startBarIndex = this._getBarIndexFromTime(drawing.start.time);
        const endBarIndex = this._getBarIndexFromTime(drawing.end.time);

        const { startIdx } = this._getVisibleRange();
        const startX = (startBarIndex - startIdx) * this.barW + this.candleW / 2;
        const endX = (endBarIndex - startIdx) * this.barW + this.candleW / 2;
        const startY = h - ((drawing.start.price - priceLo) / priceRange) * h;
        const endY = h - ((drawing.end.price - priceLo) / priceRange) * h;

        ctx.strokeStyle = '#ff5722';
        ctx.lineWidth = 1.5;

        if (drawing.type === 'horizontal') {
          // 水平线
          ctx.setLineDash([]);
          ctx.beginPath();
          ctx.moveTo(0, startY);
          ctx.lineTo(chartW, startY);
          ctx.stroke();
          // 价格标签
          ctx.fillStyle = 'rgba(255, 87, 34, 0.9)';
          ctx.font = '11px SF Pro, monospace';
          ctx.fillText(fmtPrice(drawing.start.price), chartW + 4, startY + 4);
        } else if (drawing.type === 'vertical') {
          // 垂直线
          ctx.setLineDash([]);
          ctx.beginPath();
          ctx.moveTo(startX, 0);
          ctx.lineTo(startX, h);
          ctx.stroke();
        } else if (drawing.type === 'trendline') {
          // 趋势线
          ctx.setLineDash([]);
          ctx.beginPath();
          ctx.moveTo(startX, startY);
          ctx.lineTo(endX, endY);
          ctx.stroke();
        } else if (drawing.type === 'rectangle') {
          // 矩形
          ctx.setLineDash([]);
          const minX = Math.min(startX, endX);
          const maxX = Math.max(startX, endX);
          const minY = Math.min(startY, endY);
          const maxY = Math.max(startY, endY);
          // 绘制透明浅蓝背景
          ctx.fillStyle = 'rgba(41, 98, 255, 0.15)';
          ctx.fillRect(minX, minY, maxX - minX, maxY - minY);
          // 绘制矩形边框
          ctx.strokeRect(minX, minY, maxX - minX, maxY - minY);
        } else if (drawing.type === 'fibonacci') {
          // 斐波那契回调线
          const fibLevels = [0, 0.382, 0.5, 0.618, 0.786, 1, 1.272, 1.382, 1.618, 2, 2.618];
          const fibLabels = [
            '0%',
            '38.2%',
            '50%',
            '61.8%',
            '78.6%',
            '100%',
            '127.2%',
            '138.2%',
            '161.8%',
            '200%',
            '261.8%',
          ];
          const fibColors = [
            '#ffffff',
            '#ff00bbff',
            '#2196f3',
            '#2196f3',
            '#f34821ff',
            '#ffffff',
            '#4caf50',
            '#4caf50',
            '#00ff22ff',
            '#ff9800',
            '#ff9800',
          ];

          const topY = Math.min(startY, endY);
          const bottomY = Math.max(startY, endY);
          const height = bottomY - topY;
          const topPrice = Math.max(drawing.start.price, drawing.end.price);
          const bottomPrice = Math.min(drawing.start.price, drawing.end.price);
          const leftX = Math.min(startX, endX);

          const fmtPrice = (p) => {
            if (p >= 1000) return p.toFixed(2);
            if (p >= 1) return p.toFixed(4);
            return p.toFixed(6);
          };

          // 绘制对角虚线（连接起点和终点）
          ctx.setLineDash([5, 5]);
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(startX, startY);
          ctx.lineTo(endX, endY);
          ctx.stroke();

          ctx.setLineDash([]);
          fibLevels.forEach((level, i) => {
            const y = topY + height * level;
            const fibPrice = topPrice - level * (topPrice - bottomPrice);
            ctx.strokeStyle = fibColors[i];
            ctx.lineWidth = 1;
            // 先绘制标签（放在左侧，线从标签右侧开始）
            ctx.fillStyle = fibColors[i];
            ctx.font = '10px SF Pro, monospace';
            ctx.textAlign = 'left';
            ctx.fillText(`${fibLabels[i]} ${fmtPrice(fibPrice)}`, leftX - 4, y + 3);
            // 计算文字宽度，让线从文字后面开始
            const textWidth = ctx.measureText(`${fibLabels[i]} ${fmtPrice(fibPrice)}`).width;
            // 绘制线段向右延伸到图表边缘
            ctx.beginPath();
            ctx.moveTo(leftX - 4 + textWidth + 4, y);
            ctx.lineTo(chartW, y);
            ctx.stroke();
          });
        }
      });
    }

    // 渲染画图预览（水平线和垂直线不需要预览，因为一次点击就完成）
    if (
      this.drawMode &&
      this.drawStart &&
      this.drawTool !== 'horizontal' &&
      this.drawTool !== 'vertical'
    ) {
      const chartW = this.mainSize.w - this.priceAxisW;
      const { startIdx } = this._getVisibleRange();
      const barIndex = this._getBarIndexFromX(this.mouseX);
      let currentX = (barIndex - startIdx) * this.barW + this.candleW / 2;
      let currentY = this.mouseY;
      let currentPrice = this._getPriceFromY(currentY);

      // 磁铁模式：吸附到最近的OHLC价格
      if (this.magnetMode && barIndex >= 0 && barIndex < this.data.length) {
        currentPrice = this._getMagnetPrice(currentPrice, barIndex);
        // 更新Y坐标为吸附后的价格对应的位置
        const priceRange = this._getPriceRange();
        currentY =
          this.mainSize.h -
          ((currentPrice - priceRange.min) / (priceRange.max - priceRange.min)) * this.mainSize.h;
      }

      ctx.strokeStyle = '#ff5722';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 5]);

      if (this.drawTool === 'horizontal') {
        ctx.beginPath();
        ctx.moveTo(0, currentY);
        ctx.lineTo(chartW, currentY);
        ctx.stroke();
      } else if (this.drawTool === 'vertical') {
        ctx.beginPath();
        ctx.moveTo(currentX, 0);
        ctx.lineTo(currentX, h);
        ctx.stroke();
      } else if (this.drawTool === 'trendline') {
        ctx.beginPath();
        ctx.moveTo(this.drawStart.x, this.drawStart.y);
        ctx.lineTo(currentX, currentY);
        ctx.stroke();
      } else if (this.drawTool === 'rectangle') {
        // 矩形预览
        const rectX = Math.min(this.drawStart.x, currentX);
        const rectY = Math.min(this.drawStart.y, currentY);
        const rectW = Math.abs(currentX - this.drawStart.x);
        const rectH = Math.abs(currentY - this.drawStart.y);
        // 绘制透明浅蓝背景
        ctx.fillStyle = 'rgba(41, 98, 255, 0.15)';
        ctx.fillRect(rectX, rectY, rectW, rectH);
        // 绘制矩形边框
        ctx.strokeRect(rectX, rectY, rectW, rectH);
      } else if (this.drawTool === 'fibonacci') {
        // 斐波那契回调线预览
        const fibLevels = [0, 0.382, 0.5, 0.618, 0.786, 1, 1.272, 1.382, 1.618, 2, 2.618];
        const fibLabels = [
          '0%',
          '38.2%',
          '50%',
          '61.8%',
          '78.6%',
          '100%',
          '127.2%',
          '138.2%',
          '161.8%',
          '200%',
          '261.8%',
        ];
        const fibColors = [
          '#ffffff',
          '#ff00bbff',
          '#2196f3',
          '#2196f3',
          '#f34821ff',
          '#ffffff',
          '#4caf50',
          '#4caf50',
          '#00ff22ff',
          '#ff9800',
          '#ff9800',
        ];

        const startX = this.drawStart.x;
        const endX = currentX;
        const topY = Math.min(this.drawStart.y, currentY);
        const bottomY = Math.max(this.drawStart.y, currentY);
        const height = bottomY - topY;
        const leftX = Math.min(startX, endX);
        const topPrice = Math.max(this.drawStart.price, currentPrice);
        const bottomPrice = Math.min(this.drawStart.price, currentPrice);

        const fmtPrice = (p) => {
          if (p >= 1000) return p.toFixed(2);
          if (p >= 1) return p.toFixed(4);
          return p.toFixed(6);
        };

        // 绘制对角虚线（连接起点和终点）
        ctx.setLineDash([5, 5]);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(this.drawStart.x, this.drawStart.y);
        ctx.lineTo(currentX, currentY);
        ctx.stroke();

        ctx.setLineDash([]);
        fibLevels.forEach((level, i) => {
          const y = topY + height * level;
          const fibPrice = topPrice - level * (topPrice - bottomPrice);
          ctx.strokeStyle = fibColors[i];
          ctx.lineWidth = 1;
          // 先绘制标签（放在左侧，线从标签右侧开始）
          ctx.fillStyle = fibColors[i];
          ctx.font = '10px SF Pro, monospace';
          ctx.textAlign = 'left';
          ctx.fillText(`${fibLabels[i]} ${fmtPrice(fibPrice)}`, leftX - 4, y + 3);
          // 计算文字宽度，让线从文字后面开始
          const textWidth = ctx.measureText(`${fibLabels[i]} ${fmtPrice(fibPrice)}`).width;
          // 绘制线段向右延伸到图表边缘
          ctx.beginPath();
          ctx.moveTo(leftX - 4 + textWidth + 4, y);
          ctx.lineTo(chartW, y);
          ctx.stroke();
        });
      }
      ctx.setLineDash([]);
    }

    // Crosshair
    // 桌面端：鼠标悬停时自动显示（mouseX >= 0）
    // 移动端：点击切换 showCrosshair 状态
    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    const shouldShowCrosshair = isTouchDevice ? this.showCrosshair : this.mouseX >= 0;
    if (shouldShowCrosshair && this.mouseX >= 0 && this.mouseX < chartW) {
      ctx.strokeStyle = 'rgba(120,123,134,0.6)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(this.mouseX + 0.5, 0);
      ctx.lineTo(this.mouseX + 0.5, h);
      ctx.stroke();
      if (this.mouseY >= 0 && this.mouseY < h) {
        let displayY = this.mouseY;
        let price = priceHi - (this.mouseY / h) * priceRange;

        // 磁铁模式：吸附到最近的OHLC价格
        if (this.magnetMode) {
          // 计算最近的K线索引
          const barIdx = Math.floor(this.mouseX / this.barW);
          const barIndex = startIdx + barIdx;
          if (barIndex >= 0 && barIndex < this.data.length) {
            // 找到最接近的OHLC价格
            const closestPrice = this._getMagnetPrice(price, barIndex);
            // 计算对应的Y坐标
            displayY = h - ((closestPrice - priceLo) / priceRange) * h;
            price = closestPrice;
          }
        }

        ctx.beginPath();
        ctx.moveTo(0, displayY + 0.5);
        ctx.lineTo(chartW, displayY + 0.5);
        ctx.stroke();
        // Price label on right (crosshair)
        ctx.fillStyle = 'rgba(120,123,134,0.9)';
        const lw = 68;
        const lh = 16;
        ctx.fillRect(chartW + 1, displayY - lh / 2, lw, lh);
        ctx.fillStyle = '#fff';
        ctx.font = '11px SF Pro, monospace';
        ctx.textAlign = 'center';
        ctx.fillText(fmtPrice(price), chartW + 1 + lw / 2, displayY + 4);
        ctx.textAlign = 'left';
      }
      ctx.setLineDash([]);
    }

    // 光标处价格线（水平虚线）
    if (shouldShowCrosshair && this.mouseY >= 0 && this.mouseY < h && this.mouseX >= 0) {
      let displayY = this.mouseY;

      // 磁铁模式：吸附到最近的OHLC价格
      if (this.magnetMode) {
        // 计算最近的K线索引
        const barIdx = Math.floor(this.mouseX / this.barW);
        const barIndex = startIdx + barIdx;
        if (barIndex >= 0 && barIndex < this.data.length) {
          // 计算当前价格
          const price = priceHi - (this.mouseY / h) * priceRange;
          // 找到最接近的OHLC价格
          const closestPrice = this._getMagnetPrice(price, barIndex);
          // 计算对应的Y坐标
          displayY = h - ((closestPrice - priceLo) / priceRange) * h;
        }
      }

      ctx.strokeStyle = 'rgba(255,255,255,0.4)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(0, displayY + 0.5);
      ctx.lineTo(chartW, displayY + 0.5);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  /* ---- Volume Sub Chart ---- */
  _renderVol() {
    const ctx = this.volCtx;
    const { w, h } = this.volSize || { w: 0, h: 0 };
    const chartW = w - this.priceAxisW;
    ctx.clearRect(0, 0, w, h);
    if (!this.data || !this.showVol) return;

    const { startIdx, endIdx } = this._getVisibleRange();
    const bars = this.data.slice(startIdx, endIdx);
    const vMax = Math.max(...bars.map((b) => b.volume)) * 1.1 || 1;
    const innerH = h - this.timeLabelH;

    // MA Vol line
    const vols = this.data.map((b) => b.volume);
    const maVol5 = Indicators.sma(vols, 5);
    const maVol10 = Indicators.sma(vols, 10);

    bars.forEach((bar, i) => {
      const x = i * this.barW;
      const bh = (bar.volume / vMax) * innerH;
      const y = innerH - bh;
      ctx.fillStyle = bar.close >= bar.open ? 'rgba(38,166,154,0.6)' : 'rgba(239,83,80,0.6)';
      ctx.fillRect(x, y, this.candleW, bh);
    });

    // Draw MA lines on volume
    const drawVolMA = (arr, color) => {
      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      let started = false;
      bars.forEach((b, i) => {
        const val = arr[startIdx + i];
        if (val == null) {
          started = false;
          return;
        }
        const x = i * this.barW + this.candleW / 2;
        const y = innerH - (val / vMax) * innerH;
        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else ctx.lineTo(x, y);
      });
      ctx.stroke();
    };
    drawVolMA(maVol5, 'rgba(240,185,11,0.7)');
    drawVolMA(maVol10, 'rgba(41,98,255,0.7)');

    // Crosshair vertical on vol
    if (this.mouseX >= 0 && this.mouseX < chartW) {
      ctx.strokeStyle = 'rgba(120,123,134,0.4)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(this.mouseX + 0.5, 0);
      ctx.lineTo(this.mouseX + 0.5, innerH);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  /* ---- MACD Sub Chart ---- */
  _renderMACD() {
    const ctx = this.macdCtx;
    const { w, h } = this.macdSize || { w: 0, h: 0 };
    const chartW = w - this.priceAxisW;
    ctx.clearRect(0, 0, w, h);
    if (!this.data || !this.indicators?.macd) return;

    const { startIdx, endIdx } = this._getVisibleRange();
    const bars = this.data.slice(startIdx, endIdx);
    const { dif, dea, macd } = this.indicators.macd;

    // 计算数值范围（只使用可视窗口内的数据）
    const visibleDif = dif.slice(startIdx, endIdx).filter((v) => v != null);
    const visibleDea = dea.slice(startIdx, endIdx).filter((v) => v != null);
    const visibleMacd = macd.slice(startIdx, endIdx).filter((v) => v != null);
    const allVals = [...visibleDif, ...visibleDea, ...visibleMacd];
    if (!allVals.length) return;

    const valMin = Math.min(...allVals);
    const valMax = Math.max(...allVals);
    const valRange = valMax - valMin;
    // 减小padding让能量柱拉伸显示，保留最小边距确保线条可见
    const padding = valRange * 0.02 || 0.5;
    const minVal = valMin - padding;
    const maxVal = valMax + padding;
    const range = maxVal - minVal;

    const py = (v) => (range > 0 ? h - ((v - minVal) / range) * h : h / 2);

    // 背景网格
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      const y = (h / 4) * i;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(chartW, y);
      ctx.stroke();
    }

    // 零轴线
    const zeroY = py(0);
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, zeroY);
    ctx.lineTo(chartW, zeroY);
    ctx.stroke();

    // MACD 柱状图 (DIF - DEA) * 2
    bars.forEach((b, i) => {
      const val = macd[startIdx + i];
      if (val == null) return;
      const x = i * this.barW;
      const barY = py(val);
      const barH = Math.abs(barY - zeroY);
      const y = val >= 0 ? barY : zeroY;

      // 根据正负值使用不同颜色，根据与前一个值的比较决定深浅
      const prevVal = i > 0 ? macd[startIdx + i - 1] : null;
      const isGrowing = prevVal != null && val >= prevVal;

      if (val >= 0) {
        ctx.fillStyle = isGrowing ? '#26a69a' : 'rgba(38,166,154,0.5)';
      } else {
        ctx.fillStyle = isGrowing ? 'rgba(239,83,80,0.5)' : '#ef5350';
      }
      ctx.fillRect(x, y, Math.max(1, this.candleW), barH);
    });

    // 绘制 DIF 线（快线）
    ctx.beginPath();
    ctx.strokeStyle = '#f0b90b';
    ctx.lineWidth = 1.5;
    let started = false;
    bars.forEach((b, i) => {
      const val = dif[startIdx + i];
      if (val == null) {
        started = false;
        return;
      }
      const x = i * this.barW + this.candleW / 2;
      const y = py(val);
      if (!started) {
        ctx.moveTo(x, y);
        started = true;
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.stroke();

    // 绘制 DEA 线（慢线）
    ctx.beginPath();
    ctx.strokeStyle = '#2962ff';
    ctx.lineWidth = 1.5;
    started = false;
    bars.forEach((b, i) => {
      const val = dea[startIdx + i];
      if (val == null) {
        started = false;
        return;
      }
      const x = i * this.barW + this.candleW / 2;
      const y = py(val);
      if (!started) {
        ctx.moveTo(x, y);
        started = true;
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.stroke();

    // 右侧数值标签
    ctx.fillStyle = 'rgba(120,123,134,0.7)';
    ctx.font = '10px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('0', chartW + 4, zeroY - 2);

    // 光标线（与主图同步）
    if (this.mouseX >= 0 && this.mouseX < chartW) {
      // 竖线
      ctx.strokeStyle = 'rgba(120,123,134,0.6)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(this.mouseX + 0.5, 0);
      ctx.lineTo(this.mouseX + 0.5, h);
      ctx.stroke();

      // 横线（当鼠标在MACD区域内时）
      const macdWrapper = document.getElementById('macdWrapper');
      const macdRect = macdWrapper.getBoundingClientRect();
      const mouseYInMacd =
        this.mouseY -
        (macdRect.top - document.getElementById('canvasWrapper').getBoundingClientRect().top);

      if (mouseYInMacd >= 0 && mouseYInMacd < h) {
        ctx.beginPath();
        ctx.moveTo(0, mouseYInMacd + 0.5);
        ctx.lineTo(chartW, mouseYInMacd + 0.5);
        ctx.stroke();

        // 数值标签
        const val = minVal + (1 - mouseYInMacd / h) * range;
        ctx.fillStyle = 'rgba(120,123,134,0.9)';
        const lw = 50;
        const lh = 14;
        ctx.fillRect(chartW + 1, mouseYInMacd - lh / 2, lw, lh);
        ctx.fillStyle = '#fff';
        ctx.font = '10px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(val.toFixed(4), chartW + 1 + lw / 2, mouseYInMacd + 3);
        ctx.textAlign = 'left';
      }
      ctx.setLineDash([]);
    }
  }

  /* ---- RSI Sub Chart ---- */
  _renderRSI() {
    const ctx = this.rsiCtx;
    const { w, h } = this.rsiSize || { w: 0, h: 0 };
    const chartW = w - this.priceAxisW;
    ctx.clearRect(0, 0, w, h);
    if (!this.data || !this.indicators?.rsi) return;

    const { startIdx } = this._getVisibleRange();
    const bars = this.data.slice(startIdx, startIdx + this._visibleBars());

    const py = (v) => (1 - v / 100) * h;

    // Overbought / Oversold bands
    ctx.fillStyle = 'rgba(239,83,80,0.06)';
    ctx.fillRect(0, py(70), chartW, py(100) - py(70));
    ctx.fillStyle = 'rgba(38,166,154,0.06)';
    ctx.fillRect(0, py(0), chartW, py(30) - py(0));

    [30, 50, 70].forEach((level) => {
      ctx.strokeStyle = level === 50 ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.12)';
      ctx.lineWidth = 1;
      ctx.setLineDash(level === 50 ? [] : [3, 3]);
      ctx.beginPath();
      ctx.moveTo(0, py(level));
      ctx.lineTo(chartW, py(level));
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(120,123,134,0.7)';
      ctx.font = '10px monospace';
      ctx.fillText(level, 4, py(level) - 2);
    });

    // RSI line
    ctx.beginPath();
    ctx.strokeStyle = '#7b61ff';
    ctx.lineWidth = 1.5;
    let started = false;
    bars.forEach((b, i) => {
      const val = this.indicators.rsi[startIdx + i];
      if (val == null) {
        started = false;
        return;
      }
      const x = i * this.barW + this.candleW / 2;
      const y = py(val);
      if (!started) {
        ctx.moveTo(x, y);
        started = true;
      } else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }

  /* ---- 复盘交易标记渲染 ---- */
  _renderReviewTrades() {
    const ctx = this.mainCtx;
    const { w, h } = this.mainSize || { w: 0, h: 0 };
    if (!this.data || !this._priceHi) return;

    const { startIdx } = this._getVisibleRange();
    const priceRange = this._priceHi - this._priceLo;
    const px = (price) => h - ((price - this._priceLo) / priceRange) * h;
    const bx = (barIdx) => (barIdx - startIdx) * this.barW + this.candleW / 2;

    this.reviewTrades.forEach((trade) => {
      if (!trade.exitBarIdx) return;
      const x1 = bx(trade.entryBarIdx);
      const x2 = bx(trade.exitBarIdx);
      const y1 = px(trade.entryPrice);
      const y2 = px(trade.exitPrice);
      const isLong = trade.direction === 'long';

      // 持仓区间背景
      if (x1 < w && x2 > 0) {
        ctx.fillStyle = isLong ? 'rgba(38,166,154,0.06)' : 'rgba(239,83,80,0.06)';
        ctx.fillRect(Math.max(0, x1), 0, Math.min(w, x2) - Math.max(0, x1), h);
      }

      // 连线
      if (x1 >= -20 && x1 <= w + 20) {
        ctx.strokeStyle = isLong ? 'rgba(38,166,154,0.5)' : 'rgba(239,83,80,0.5)';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // 开仓箭头
      this._drawTradeArrow(ctx, x1, px(trade.entryPrice), isLong, true);
      // 平仓圆点
      this._drawTradeClose(ctx, x2, y2, trade.pnl >= 0);
    });
  }

  _renderReviewPosition() {
    const ctx = this.mainCtx;
    const { w, h } = this.mainSize || { w: 0, h: 0 };
    if (!this.data || !this._priceHi || !this.reviewPosition) return;

    const pos = this.reviewPosition;
    const { startIdx } = this._getVisibleRange();
    const priceRange = this._priceHi - this._priceLo;
    const px = (price) => h - ((price - this._priceLo) / priceRange) * h;
    const bx = (barIdx) => (barIdx - startIdx) * this.barW + this.candleW / 2;
    const isLong = pos.direction === 'long';

    const x1 = bx(pos.entryBarIdx);
    const x2 = (this.data.length - startIdx - 1) * this.barW + this.candleW / 2;

    // 持仓区间背景
    if (x1 < w && x2 > 0) {
      ctx.fillStyle = isLong ? 'rgba(38,166,154,0.08)' : 'rgba(239,83,80,0.08)';
      ctx.fillRect(Math.max(0, x1), 0, Math.min(w - this.priceAxisW, x2) - Math.max(0, x1), h);
    }

    // 开仓价线
    ctx.strokeStyle = isLong ? 'rgba(38,166,154,0.7)' : 'rgba(239,83,80,0.7)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 3]);
    ctx.beginPath();
    ctx.moveTo(Math.max(0, x1), px(pos.entryPrice));
    ctx.lineTo(w - this.priceAxisW, px(pos.entryPrice));
    ctx.stroke();
    ctx.setLineDash([]);

    // 止盈线
    if (pos.tp) {
      ctx.strokeStyle = 'rgba(38,166,154,0.5)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(Math.max(0, x1), px(pos.tp));
      ctx.lineTo(w - this.priceAxisW, px(pos.tp));
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(38,166,154,0.8)';
      ctx.font = '10px monospace';
      ctx.fillText(`TP ${fmtPrice(pos.tp)}`, Math.max(4, x1 + 4), px(pos.tp) - 4);
    }

    // 止损线
    if (pos.sl) {
      ctx.strokeStyle = 'rgba(239,83,80,0.5)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(Math.max(0, x1), px(pos.sl));
      ctx.lineTo(w - this.priceAxisW, px(pos.sl));
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(239,83,80,0.8)';
      ctx.font = '10px monospace';
      ctx.fillText(`SL ${fmtPrice(pos.sl)}`, Math.max(4, x1 + 4), px(pos.sl) + 12);
    }

    // 开仓箭头
    if (x1 >= -20 && x1 <= w) this._drawTradeArrow(ctx, x1, px(pos.entryPrice), isLong, true);

    // 浮动盈亏标签（显示在最新 K 线位置）
    const lastBar = this.data[this.data.length - 1];
    if (lastBar) {
      const floatPnl = isLong
        ? ((lastBar.close - pos.entryPrice) / pos.entryPrice) * 100
        : ((pos.entryPrice - lastBar.close) / pos.entryPrice) * 100;
      const labelX = Math.min(w - this.priceAxisW - 80, x2 - 10);
      const labelY = px(lastBar.close);
      const color = floatPnl >= 0 ? '#26a69a' : '#ef5350';
      ctx.fillStyle = color;
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'right';
      ctx.fillText((floatPnl >= 0 ? '+' : '') + floatPnl.toFixed(2) + '%', labelX, labelY - 6);
      ctx.textAlign = 'left';
    }
  }

  _drawTradeArrow(ctx, x, y, isLong, isEntry) {
    const color = isLong ? '#26a69a' : '#ef5350';
    const size = 8;
    ctx.fillStyle = color;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    ctx.beginPath();
    if (isLong) {
      // 上箭头（多头开仓）
      ctx.moveTo(x, y + size * 2.5);
      ctx.lineTo(x - size, y + size * 1.2);
      ctx.lineTo(x - size / 2, y + size * 1.2);
      ctx.lineTo(x - size / 2, y);
      ctx.lineTo(x + size / 2, y);
      ctx.lineTo(x + size / 2, y + size * 1.2);
      ctx.lineTo(x + size, y + size * 1.2);
    } else {
      // 下箭头（空头开仓）
      ctx.moveTo(x, y - size * 2.5);
      ctx.lineTo(x - size, y - size * 1.2);
      ctx.lineTo(x - size / 2, y - size * 1.2);
      ctx.lineTo(x - size / 2, y);
      ctx.lineTo(x + size / 2, y);
      ctx.lineTo(x + size / 2, y - size * 1.2);
      ctx.lineTo(x + size, y - size * 1.2);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  _drawTradeClose(ctx, x, y, isProfit) {
    const color = isProfit ? '#26a69a' : '#ef5350';
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  /* ---- Price Axis ---- */
  _renderPriceAxis() {
    const axis = document.getElementById('priceAxis');
    if (!axis || this._priceHi == null) return;
    const { h } = this.mainSize || { h: 400 };
    const steps = 7;
    let html = '';
    for (let i = 0; i <= steps; i++) {
      const frac = i / steps;
      const price = this._priceHi - frac * (this._priceHi - this._priceLo);
      html += `<div class="price-tick" style="position:absolute;left:6px;top:${
        Math.round(frac * h) - 8
      }px">${fmtPrice(price)}</div>`;
    }
    // Current price + 倒计时
    const lastBar = this.data?.[this.data.length - 1];
    if (lastBar) {
      const frac = 1 - (lastBar.close - this._priceLo) / (this._priceHi - this._priceLo);
      const top = Math.round(Math.max(0, Math.min(h - 16, frac * h - 8)));
      const up = lastBar.close >= lastBar.open;
      const priceColor = up ? '#26a69a' : '#ef5350';
      // 价格标签
      html += `<div style="position:absolute;left:0;top:${top}px;background:${priceColor};color:#fff;font-size:11px;padding:1px 5px;border-radius:0 2px 2px 0;font-variant-numeric:tabular-nums;white-space:nowrap;z-index:900">${fmtPrice(
        lastBar.close,
      )}</div>`;
      // K线倒计时（跟随价格线，复盘模式下不显示）
      if (!document.body.classList.contains('review-mode')) {
        const countdown = this._getBarCountdown();
        if (countdown) {
          const countdownHeight = 16; // 倒计时标签高度
          const priceLabelHeight = 16; // 价格标签高度

          // 计算倒计时标签位置
          let countdownTop;
          if (top + 20 + countdownHeight > h) {
            // 如果在下方会超出画布，显示在价格标签上方
            countdownTop = Math.max(0, top - countdownHeight - 4);
          } else {
            // 正常显示在价格标签下方
            countdownTop = top + priceLabelHeight + 4;
          }

          html += `<div style="position:absolute;left:0;top:${countdownTop}px;font-size:10px;color:${priceColor};font-weight:600;background:rgba(19,23,34,0.9);padding:1px 5px;border-radius:0 2px 2px 0;border:1px solid ${priceColor};white-space:nowrap;z-index:900">${countdown}</div>`;
        }
      }
    }
    // 光标处价格标签（鼠标在图表上时显示）
    if (this.mouseY >= 0 && this.mouseY < h && this.mouseX >= 0) {
      const priceRange = this._priceHi - this._priceLo;
      const cursorPrice = this._priceHi - (this.mouseY / h) * priceRange;
      const labelTop = Math.round(Math.max(0, Math.min(h - 18, this.mouseY - 9)));
      html += `<div style="position:absolute;left:0;top:${labelTop}px;background:rgba(38,166,154,0.95);color:#fff;font-size:11px;font-weight:600;padding:2px 6px;border-radius:0 2px 2px 0;border:1px solid #26a69a;font-variant-numeric:tabular-nums;white-space:nowrap;z-index:1000">${fmtPrice(
        cursorPrice,
      )}</div>`;
    }
    // 画图工具背景填充
    if (this.drawings && this.drawings.length > 0) {
      const priceRange = this._priceHi - this._priceLo;
      
      // 渲染画图工具背景填充
      this.drawings.forEach((drawing) => {
        if (drawing.type === 'horizontal') {
          // 水平线背景
          const price = drawing.start.price;
          if (price >= this._priceLo && price <= this._priceHi) {
            const frac = 1 - (price - this._priceLo) / priceRange;
            const top = Math.round(frac * h);
            html += `<div style="position:absolute;left:0;top:${top - 1}px;width:100%;height:2px;background:#ff5722;opacity:0.3;z-index:1"></div>`;
          }
        } else if (drawing.type === 'trendline') {
          // 趋势线背景
          const startPrice = drawing.start.price;
          const endPrice = drawing.end.price;
          if (startPrice >= this._priceLo && startPrice <= this._priceHi && endPrice >= this._priceLo && endPrice <= this._priceHi) {
            const startFrac = 1 - (startPrice - this._priceLo) / priceRange;
            const endFrac = 1 - (endPrice - this._priceLo) / priceRange;
            const startTop = Math.round(startFrac * h);
            const endTop = Math.round(endFrac * h);
            const minTop = Math.min(startTop, endTop);
            const maxTop = Math.max(startTop, endTop);
            html += `<div style="position:absolute;left:0;top:${minTop}px;width:100%;height:${maxTop - minTop}px;background:#ff5722;opacity:0.1;z-index:1"></div>`;
          }
        } else if (drawing.type === 'rectangle') {
          // 矩形背景
          const startPrice = drawing.start.price;
          const endPrice = drawing.end.price;
          if (startPrice >= this._priceLo && startPrice <= this._priceHi && endPrice >= this._priceLo && endPrice <= this._priceHi) {
            const startFrac = 1 - (startPrice - this._priceLo) / priceRange;
            const endFrac = 1 - (endPrice - this._priceLo) / priceRange;
            const minTop = Math.round(Math.min(startFrac, endFrac) * h);
            const maxTop = Math.round(Math.max(startFrac, endFrac) * h);
            html += `<div style="position:absolute;left:0;top:${minTop}px;width:100%;height:${maxTop - minTop}px;background:#2962ff;opacity:0.15;z-index:1"></div>`;
          }
        } else if (drawing.type === 'fibonacci') {
          // 斐波那契背景
          const startPrice = drawing.start.price;
          const endPrice = drawing.end.price;
          if (startPrice >= this._priceLo && startPrice <= this._priceHi && endPrice >= this._priceLo && endPrice <= this._priceHi) {
            const fibLevels = [0, 0.382, 0.5, 0.618, 0.786, 1, 1.272, 1.382, 1.618, 2, 2.618];
            const startFrac = 1 - (startPrice - this._priceLo) / priceRange;
            const endFrac = 1 - (endPrice - this._priceLo) / priceRange;
            const minTop = Math.round(Math.min(startFrac, endFrac) * h);
            const maxTop = Math.round(Math.max(startFrac, endFrac) * h);
            const height = maxTop - minTop;
            
            for (let i = 0; i < fibLevels.length - 1; i++) {
              const level1 = fibLevels[i];
              const level2 = fibLevels[i + 1];
              const y1 = minTop + level1 * height;
              const y2 = minTop + level2 * height;
              html += `<div style="position:absolute;left:0;top:${y1}px;width:100%;height:${y2 - y1}px;background:#4caf50;opacity:${0.05 + (i % 2) * 0.05};z-index:1"></div>`;
            }
          }
        }
      });
    }
    
    // 画图工具价格标签
    if (this.drawings && this.drawings.length > 0) {
      const priceRange = this._priceHi - this._priceLo;
      const labelHeight = 16; // 标签高度
      const labelSpacing = 4; // 标签间距

      // 收集所有画图工具的价格信息
      const priceLabels = [];
      this.drawings.forEach((drawing) => {
        if (drawing.type === 'horizontal') {
          // 水平线
          const price = drawing.start.price;
          // 检查价格是否在可见范围内
          if (price >= this._priceLo && price <= this._priceHi) {
            const frac = 1 - (price - this._priceLo) / priceRange;
            const top = Math.round(
              Math.max(0, Math.min(h - labelHeight, frac * h - labelHeight / 2)),
            );
            priceLabels.push({ price, top, type: 'horizontal', color: '#ff5722' });
          }
        } else if (drawing.type === 'trendline') {
          // 趋势线
          const startPrice = drawing.start.price;
          const endPrice = drawing.end.price;
          // 检查价格是否在可见范围内
          if (startPrice >= this._priceLo && startPrice <= this._priceHi) {
            const frac = 1 - (startPrice - this._priceLo) / priceRange;
            const top = Math.round(
              Math.max(0, Math.min(h - labelHeight, frac * h - labelHeight / 2)),
            );
            priceLabels.push({ price: startPrice, top, type: 'trendline', color: '#ff5722' });
          }
          if (endPrice >= this._priceLo && endPrice <= this._priceHi) {
            const frac = 1 - (endPrice - this._priceLo) / priceRange;
            const top = Math.round(
              Math.max(0, Math.min(h - labelHeight, frac * h - labelHeight / 2)),
            );
            priceLabels.push({ price: endPrice, top, type: 'trendline', color: '#ff5722' });
          }
        } else if (drawing.type === 'rectangle') {
          // 矩形
          const startPrice = drawing.start.price;
          const endPrice = drawing.end.price;
          // 检查价格是否在可见范围内
          if (startPrice >= this._priceLo && startPrice <= this._priceHi) {
            const frac = 1 - (startPrice - this._priceLo) / priceRange;
            const top = Math.round(
              Math.max(0, Math.min(h - labelHeight, frac * h - labelHeight / 2)),
            );
            priceLabels.push({ price: startPrice, top, type: 'rectangle', color: '#2962ff' });
          }
          if (endPrice >= this._priceLo && endPrice <= this._priceHi) {
            const frac = 1 - (endPrice - this._priceLo) / priceRange;
            const top = Math.round(
              Math.max(0, Math.min(h - labelHeight, frac * h - labelHeight / 2)),
            );
            priceLabels.push({ price: endPrice, top, type: 'rectangle', color: '#2962ff' });
          }
        } else if (drawing.type === 'fibonacci') {
          // 斐波那契
          const startPrice = drawing.start.price;
          const endPrice = drawing.end.price;
          // 检查价格是否在可见范围内
          if (startPrice >= this._priceLo && startPrice <= this._priceHi) {
            const frac = 1 - (startPrice - this._priceLo) / priceRange;
            const top = Math.round(
              Math.max(0, Math.min(h - labelHeight, frac * h - labelHeight / 2)),
            );
            priceLabels.push({ price: startPrice, top, type: 'fibonacci', color: '#4caf50' });
          }
          if (endPrice >= this._priceLo && endPrice <= this._priceHi) {
            const frac = 1 - (endPrice - this._priceLo) / priceRange;
            const top = Math.round(
              Math.max(0, Math.min(h - labelHeight, frac * h - labelHeight / 2)),
            );
            priceLabels.push({ price: endPrice, top, type: 'fibonacci', color: '#4caf50' });
          }
        }
      });

      // 按top位置排序
      priceLabels.sort((a, b) => a.top - b.top);

      // 调整重叠的标签位置
      for (let i = 1; i < priceLabels.length; i++) {
        const current = priceLabels[i];
        const previous = priceLabels[i - 1];

        // 检查是否重叠
        if (current.top < previous.top + labelHeight + labelSpacing) {
          // 调整当前标签位置，确保不重叠
          current.top = previous.top + labelHeight + labelSpacing;
          // 确保标签不会超出画布
          if (current.top > h - labelHeight) {
            current.top = h - labelHeight;
          }
        }
      }

      // 渲染调整后的标签
      priceLabels.forEach((label) => {
        html += `<div style="position:absolute;left:0;top:${label.top}px;background:${label.color};color:#fff;font-size:11px;padding:1px 5px;border-radius:0 2px 2px 0;font-variant-numeric:tabular-nums;white-space:nowrap;z-index:5">${fmtPrice(label.price)}</div>`;
      });
    }
    axis.innerHTML = html;
  }

  // 获取K线倒计时
  _getBarCountdown() {
    if (!this.interval) return null;
    const intervalMs = this._getIntervalMs(this.interval);
    if (!intervalMs) return null;
    const now = Date.now();
    const nextBarTime = Math.ceil(now / intervalMs) * intervalMs;
    const remaining = nextBarTime - now;
    if (remaining <= 0) return null;
    const seconds = Math.floor(remaining / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    if (days > 0) {
      return `${days}d ${hours % 24}h ${minutes % 60}m ${seconds % 60}s`;
    }
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    }
    if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    }
    return `${seconds}s`;
  }

  // 时间周期转毫秒
  _getIntervalMs(interval) {
    const map = {
      '1m': 60000,
      '5m': 300000,
      '15m': 900000,
      '1h': 3600000,
      '4h': 14400000,
      '1d': 86400000,
      '1w': 604800000,
    };
    return map[interval] || null;
  }

  /* ---- Time Axis ---- */
  _renderTimeAxis() {
    const axis = document.getElementById('timeAxis');
    if (!axis || !this.data) return;
    const { startIdx, endIdx } = this._getVisibleRange();
    const bars = this.data.slice(startIdx, endIdx);
    const chartW = (this.mainSize?.w || 800) - this.priceAxisW;
    const intervalMs = this._getIntervalMs(this.interval);

    // 优化步长计算，确保标签之间有足够的间距（至少minLabelSpacing像素）
    const minLabelSpacing = 30;
    const estimatedLabelWidth = 40;
    const minPixelStep = minLabelSpacing + estimatedLabelWidth;
    const rawStep = Math.ceil(minPixelStep / this.barW);
    let step = Math.max(2, rawStep);
    // 当可见K线很少时，进一步增大step避免重叠
    if (bars.length > 0 && bars.length < 5) {
      step = Math.max(step, Math.ceil(bars.length / 2));
    }

    let html = '';
    let lastX = -Infinity;
    bars.forEach((bar, i) => {
      if (i % step !== 0) return;
      const x = i * this.barW + this.candleW / 2;
      if (x < 0 || x > chartW || x - lastX < minLabelSpacing) return;
      lastX = x;
      html += `<div class="time-tick" style="left:${x}px">${fmtTime(
        bar.time,
        this.interval,
      )}</div>`;
    });

    // 延伸未来时间线
    const lastBar = this.data[this.data.length - 1];
    if (intervalMs && this.data.length > 0) {
      const lastTime = lastBar.time;
      const nextBarTime = Math.ceil(Date.now() / intervalMs) * intervalMs;
      const visibleEndTime = lastTime + (endIdx - this.data.length) * intervalMs;
      let futureIdx = bars.length;
      const remainder = futureIdx % step;
      if (remainder !== 0) futureIdx += step - remainder;
      let futureTime = nextBarTime + (futureIdx - bars.length) * intervalMs;
      while (futureTime <= visibleEndTime + intervalMs * step * 2) {
        const x = futureIdx * this.barW + this.candleW / 2;
        if (x >= 0 && x <= chartW && x - lastX >= minLabelSpacing) {
          lastX = x;
          html += `<div class="time-tick future" style="left:${x}px">${fmtTime(
            futureTime,
            this.interval,
          )}</div>`;
        }
        futureTime += intervalMs * step;
        futureIdx += step;
      }
    }

    // 光标处时间标签（底部居中）
    if (this.mouseX >= 0 && this.mouseX < chartW) {
      const barIdx = Math.floor(this.mouseX / this.barW);
      const barIndex = startIdx + barIdx;
      let cursorTime;
      if (barIndex >= 0 && barIndex < this.data.length) {
        cursorTime = this.data[barIndex].time;
      } else if (barIndex >= this.data.length && intervalMs) {
        const excessIdx = barIndex - this.data.length + 1;
        cursorTime = lastBar.time + excessIdx * intervalMs;
      }
      if (cursorTime) {
        const cursorX = barIdx * this.barW + this.candleW / 2;
        if (cursorX >= 0 && cursorX <= chartW) {
          html += `<div class="time-tick cursor-time" style="left:${cursorX}px;transform:translateX(-50%);bottom:0;background:rgba(38,166,154,0.95);color:#fff;padding:2px 6px;border-radius:3px;font-size:11px;font-weight:500;z-index:1000;">${fmtDateFull(cursorTime)}</div>`;
        }
      }
    }

    // 垂直线时间标签
    if (this.drawings && this.drawings.length > 0) {
      const labelHeight = 20; // 标签高度
      const labelSpacing = 6; // 标签间距

      // 收集所有垂直线的信息
      const verticalLines = [];
      this.drawings.forEach((drawing) => {
        if (drawing.type === 'vertical') {
          // 使用时间戳获取正确的K线索引（支持周期切换）
          const barIndex = this._getBarIndexFromTime(drawing.start.time);
          // 检查时间是否在可见范围内
          if (barIndex >= startIdx && barIndex < endIdx) {
            const relativeIdx = barIndex - startIdx;
            const x = relativeIdx * this.barW + this.candleW / 2;
            if (x >= 0 && x <= chartW) {
              verticalLines.push({
                time: drawing.start.time,
                x,
                barIndex,
              });
            }
          }
        }
      });

      // 按x位置排序
      verticalLines.sort((a, b) => a.x - b.x);

      // 调整重叠的标签位置
      let lastEndX = -Infinity;
      verticalLines.forEach((line) => {
        // 计算当前标签的起始位置
        const labelStartX = line.x - 60; // 标签宽度约120px，所以起始位置是中心减60

        // 如果与前一个标签重叠，调整位置
        if (labelStartX < lastEndX) {
          line.offset = lastEndX - labelStartX + 10; // 10px间距
        } else {
          line.offset = 0;
        }

        // 更新最后一个标签的结束位置
        lastEndX = line.x + 60 + (line.offset || 0);
      });

      // 渲染调整后的标签
      verticalLines.forEach((line) => {
        const leftOffset = line.offset || 0;
        html += `<div class="time-tick vertical-time" style="left:${line.x + leftOffset}px;transform:translateX(-50%);bottom:0;background:rgba(33,150,243,0.9);color:#fff;padding:2px 6px;border-radius:3px;font-size:11px;font-weight:500;white-space:nowrap;z-index:10;">${fmtDateFull(line.time)}</div>`;
      });
    }

    axis.innerHTML = html;
  }
}

/* ============================================================
   ③.⑤ 复盘训练模式
   ============================================================ */
class ReviewMode {
  constructor(app) {
    this.app = app;
    this.active = false;
    this.reviewData = []; // 全量加载的历史数据
    this.revealedCount = 0; // 当前揭露的 K 线数量
    this.isPlaying = false;
    this.playSpeed = 1;
    this.playTimer = null;
    this.balance = 10000; // 初始资金 USDT
    this.position = null; // 当前持仓 {direction, entryPrice, entryBarIdx, entryTime, tp, sl}
    this.trades = []; // 已完成交易记录
    this.maxBalance = 10000; // 用于计算最大回撤
    this._pendingDir = null; // 等待用户确认的开仓方向
    this._tradeId = 0;
    this._bindKeys();
  }

  /* ---- 进入复盘模式 ---- */
  enter() {
    this.active = true;
    // 停止实时数据
    this.app.dataService.close();
    clearInterval(this.app._obTimer);
    clearInterval(this.app._tradesTimer);
    if (this.app._tickerWS) {
      this.app._tickerWS.close();
      this.app._tickerWS = null;
    }

    // UI 切换
    document.body.classList.add('review-mode');
    document.getElementById('reviewPanel').classList.remove('hidden');
    document.getElementById('connStatus').style.display = 'none';

    // 隐藏盘口相关元素，显示统计面板
    const obElements = ['obAsks', 'obBids', 'obSpread'];
    obElements.forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });
    document.querySelector('.trades-header') &&
      (document.querySelector('.trades-header').style.display = 'none');
    document.getElementById('tradesList') &&
      (document.getElementById('tradesList').style.display = 'none');
    document.getElementById('statsPanel') &&
      (document.getElementById('statsPanel').style.display = 'none');
    document.getElementById('reviewStatsPanel').classList.remove('hidden');
    document.querySelector('.orderbook-header').style.display = 'flex';

    // 重置状态
    this.balance = 10000;
    this.maxBalance = 10000;
    this.position = null;
    this.trades = [];
    this._tradeId = 0;
    this.reviewData = [];
    this.revealedCount = 0;
    this._bgCount = 0;
    // 重置历史数据尽头标志，确保可以重新加载历史数据
    this.app.renderer._hasReachedHistoryEnd = false;

    // 检查当前页面是否为训练页面
    const isTrainingPage = window.location.pathname.includes('training.html');

    if (isTrainingPage) {
      // 训练页面：随机选择交易对
      const { symbol: randomSymbol, platformKey: randomPlatformKey } = this.app._getRandomSymbol();
      this.app.symbol = randomSymbol;
      this.app.symbolPlatform = randomPlatformKey;

      // 更新交易对显示
      const symbolNameEl = document.getElementById('symbolName');
      if (symbolNameEl) {
        symbolNameEl.innerHTML =
          randomSymbol.replace('USDT', '/USDT') + getSymbolBadge(randomSymbol, randomPlatformKey);
      }
      const obSymbolEl = document.getElementById('obSymbol');
      if (obSymbolEl) {
        obSymbolEl.textContent = randomSymbol;
      }

      // 随机选择日期（在交易对的有效时间范围内）
      this.app._getRandomDate(randomSymbol, randomPlatformKey).then((randomDate) => {
        document.getElementById('reviewDate').value = randomDate;
      });

      // 随机选择周期
      const intervals = ['1m', '5m', '15m', '1h', '4h', '1d', '1w'];
      const randomInterval = intervals[Math.floor(Math.random() * intervals.length)];
      document.getElementById('reviewIntervalSelect').value = randomInterval;
      this.app.interval = randomInterval;

      // 同步工具栏显示
      document.querySelectorAll('.interval-btn').forEach((b) => {
        b.classList.toggle('active', b.dataset.interval === randomInterval);
      });
    } else {
      // 行情页面：保持当前交易对和周期
      // 同步工具栏显示
      document.querySelectorAll('.interval-btn').forEach((b) => {
        b.classList.toggle('active', b.dataset.interval === this.app.interval);
      });
      // 同步复盘周期选择
      document.getElementById('reviewIntervalSelect').value = this.app.interval;
      // 设置默认日期为当前日期
      const today = new Date();
      const year = today.getFullYear();
      const month = String(today.getMonth() + 1).padStart(2, '0');
      const day = String(today.getDate()).padStart(2, '0');
      const defaultDate = `${year}-${month}-${day}`;
      document.getElementById('reviewDate').value = defaultDate;
    }

    this._updateStatsPanel();
    document.getElementById('btnReview').title = '退出复盘';
    document.getElementById('btnReview').querySelector('span').textContent = '退出复盘';
  }

  /* ---- 退出复盘模式 ---- */
  exit() {
    this.active = false;
    this._stopAutoPlay();

    // UI 还原
    document.body.classList.remove('review-mode');
    document.getElementById('reviewPanel').classList.add('hidden');
    document.getElementById('reviewControls').style.display = 'none';
    document.getElementById('connStatus').style.display = '';

    const obElements = ['obAsks', 'obBids', 'obSpread'];
    obElements.forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.style.display = '';
    });
    document.querySelector('.trades-header') &&
      (document.querySelector('.trades-header').style.display = '');
    document.getElementById('tradesList') &&
      (document.getElementById('tradesList').style.display = '');
    document.getElementById('statsPanel') &&
      (document.getElementById('statsPanel').style.display = '');
    document.getElementById('reviewStatsPanel').classList.add('hidden');

    // 清除渲染标记
    this.app.renderer.reviewTrades = null;
    this.app.renderer.reviewPosition = null;

    document.getElementById('btnReview').title = '进入复盘训练模式';
    document.getElementById('btnReview').querySelector('span').textContent = '复盘';

    // 恢复实时行情
    this.app._loadChart();
    this.app._startWS();
    this.app._startTickerWS();
    this.app._startOrderbookPoll();
    this.app._startTradesPoll();
  }

  /* ---- 加载复盘数据 ---- */
  async loadData() {
    const dateStr = document.getElementById('reviewDate').value;
    const interval = document.getElementById('reviewIntervalSelect').value;
    if (!dateStr) {
      alert('请选择复盘起始日期');
      return;
    }

    this.app.interval = interval;
    // 同步工具栏显示
    document.querySelectorAll('.interval-btn').forEach((b) => {
      b.classList.toggle('active', b.dataset.interval === interval);
    });

    // 重置历史数据尽头标志，确保可以重新加载历史数据
    this.app.renderer._hasReachedHistoryEnd = false;

    // 计算用户选择的日期
    let selectedDate = new Date(dateStr);

    // 获取当前时间
    const now = new Date();

    // 计算K线周期的毫秒数
    let intervalMs = 0;
    switch (interval) {
      case '1m':
        intervalMs = 60000;
        break;
      case '5m':
        intervalMs = 300000;
        break;
      case '15m':
        intervalMs = 900000;
        break;
      case '1h':
        intervalMs = 3600000;
        break;
      case '4h':
        intervalMs = 14400000;
        break;
      case '1d':
        intervalMs = 86400000;
        break;
      case '1w':
        intervalMs = 604800000;
        break;
    }

    // 确保选择的日期至少比当前时间早一个完整的K线周期
    // 这样可以确保获取到完整的K线数据，避免"当前时间没有K线"的问题
    const minStartTime = now.getTime() - intervalMs * 2; // 预留两个周期的缓冲区
    if (selectedDate.getTime() > minStartTime) {
      // 如果选择的日期太接近当前时间，自动调整到更早的时间
      selectedDate = new Date(minStartTime);
      // 更新UI上的日期选择器
      document.getElementById('reviewDate').value = selectedDate.toISOString().slice(0, 10);
    }

    const startTime = selectedDate.getTime();
    document.getElementById('chartLoading').classList.remove('hidden');
    try {
      // ① 先加载 startTime 之前的 200 根作为"背景历史"（用 endTime 参数）
      const bgUrl = `${getSymbolRestUrl(this.app.symbol, '/klines', this.app.symbolPlatform)}?symbol=${
        this.app.symbol
      }&interval=${interval}&endTime=${startTime - 1}&limit=200`;
      // ② 再加载从 startTime 开始往后的 500 根作为"待复盘数据"
      const fwUrl = `${getSymbolRestUrl(this.app.symbol, '/klines', this.app.symbolPlatform)}?symbol=${this.app.symbol}&interval=${interval}&startTime=${startTime}&limit=500`;

      const [bgRes, fwRes] = await Promise.all([fetch(bgUrl), fetch(fwUrl)]);
      const [bgRaw, fwRaw] = await Promise.all([bgRes.json(), fwRes.json()]);

      const parse = (raw) =>
        raw.map((k) => ({
          time: k[0],
          open: parseFloat(k[1]),
          high: parseFloat(k[2]),
          low: parseFloat(k[3]),
          close: parseFloat(k[4]),
          volume: parseFloat(k[5]),
        }));

      const bgData = parse(bgRaw); // 背景数据，全部可见
      const fwData = parse(fwRaw); // 复盘数据，逐根揭露

      if (!fwData.length) {
        // 该时间段没有数据，可能是因为交易对在该时间还不存在
        // 尝试随机选择另一个交易对
        const { symbol: randomSymbol, platformKey: randomPlatformKey } =
          this.app._getRandomSymbol();
        this.app.symbol = randomSymbol;
        this.app.symbolPlatform = randomPlatformKey;

        // 更新交易对显示
        const symbolNameEl = document.getElementById('symbolName');
        if (symbolNameEl) {
          symbolNameEl.innerHTML =
            randomSymbol.replace('USDT', '/USDT') + getSymbolBadge(randomSymbol, randomPlatformKey);
        }
        const obSymbolEl = document.getElementById('obSymbol');
        if (obSymbolEl) {
          obSymbolEl.textContent = randomSymbol;
        }

        // 递归调用，尝试加载新的交易对数据
        // 不显示提示，直接再次随机
        this.loadData();
        return;
      }

      // 合并：背景 + 复盘，记录分界点
      this.reviewData = [...bgData, ...fwData];
      this._bgCount = bgData.length; // 背景根数（已全部可见）
      // revealedCount 初始 = 背景数据全部 + 复盘第一根（让用户看到起始状态）
      this.revealedCount = this._bgCount + 1;

      this._updateChart(false);
      document.getElementById('reviewControls').style.display = 'flex';
      this._updateProgress();
    } catch (e) {
      alert('加载数据失败: ' + e.message);
    } finally {
      document.getElementById('chartLoading').classList.add('hidden');
    }
  }

  /* ---- 下一根 K 线 ---- */
  async next() {
    if (this.revealedCount >= this.reviewData.length) {
      // 尝试获取更多数据
      await this._fetchMore();
      return;
    }
    this.revealedCount++;
    const newBar = this.reviewData[this.revealedCount - 1];
    this._checkTPSL(newBar);
    this._updateChart(false);
    this._updateProgress();
    this._updateStatsPanel();
  }

  /* ---- 上一根 K 线 ---- */
  prev() {
    if (this.position) return; // 持仓时不允许回退
    const bg = this._bgCount || 0;
    if (this.revealedCount <= bg + 1) return; // 不能回退到背景数据之前
    this.revealedCount--;
    this._updateChart(false);
    this._updateProgress();
  }

  /* ---- 自动播放 ---- */
  playPause() {
    this.isPlaying = !this.isPlaying;
    const btn = document.getElementById('btnPlayPause');
    if (this.isPlaying) {
      btn.textContent = '⏸ 暂停';
      btn.classList.add('active');
      this._startAutoPlay();
    } else {
      btn.textContent = '▶ 播放';
      btn.classList.remove('active');
      this._stopAutoPlay();
    }
  }

  _startAutoPlay() {
    this._stopAutoPlay();
    const speed = parseFloat(document.getElementById('reviewSpeed').value) || 1;
    // 每 bar 的时间间隔（毫秒），限制在 200ms ~ 3000ms
    const interval = Math.max(200, Math.min(3000, 1000 / speed));
    this.playTimer = setInterval(() => this.next(), interval);
  }

  _stopAutoPlay() {
    if (this.playTimer) {
      clearInterval(this.playTimer);
      this.playTimer = null;
    }
  }

  /* ---- 获取更多历史数据 ---- */
  async _fetchMore() {
    if (this._isFetchingMore) return;
    this._isFetchingMore = true;
    this._stopAutoPlay();
    if (this.isPlaying) {
      this.isPlaying = false;
      document.getElementById('btnPlayPause').textContent = '▶ 播放';
      document.getElementById('btnPlayPause').classList.remove('active');
    }
    try {
      const lastBar = this.reviewData[this.reviewData.length - 1];
      const url = `${getSymbolRestUrl(this.app.symbol, '/klines')}?symbol=${this.app.symbol}&interval=${
        this.app.interval
      }&startTime=${lastBar.time + 1}&limit=300`;
      const res = await fetch(url);
      const raw = await res.json();
      if (!raw.length) {
        alert('已到达最新 K 线，没有更多历史数据');
        return;
      }
      const newBars = raw.map((k) => ({
        time: k[0],
        open: parseFloat(k[1]),
        high: parseFloat(k[2]),
        low: parseFloat(k[3]),
        close: parseFloat(k[4]),
        volume: parseFloat(k[5]),
      }));
      this.reviewData = [...this.reviewData, ...newBars];
      this.revealedCount++;
      this._updateChart(false);
      this._updateProgress();
    } catch (e) {
      console.warn('fetchMore failed', e);
    } finally {
      this._isFetchingMore = false;
    }
  }

  /* ---- 开仓 ---- */
  openPosition(direction) {
    if (this.position) {
      alert('请先平仓后再开仓');
      return;
    }
    if (!this.reviewData.length || this.revealedCount === 0) {
      alert('请先加载复盘数据');
      return;
    }
    this._pendingDir = direction;
    const title = direction === 'long' ? '▲ 做多开仓' : '▼ 做空开仓';
    document.getElementById('tpSlTitle').textContent = title;
    document.getElementById('inputTP').value = '';
    document.getElementById('inputSL').value = '';
    const overlay = document.getElementById('tpSlOverlay');
    // 挂载到 review-panel
    overlay.classList.remove('hidden');
  }

  _confirmOpen() {
    if (!this._pendingDir) return;
    const currentBar = this.reviewData[this.revealedCount - 1];
    const tp = parseFloat(document.getElementById('inputTP').value) || null;
    const sl = parseFloat(document.getElementById('inputSL').value) || null;
    this.position = {
      direction: this._pendingDir,
      entryPrice: currentBar.close,
      entryBarIdx: this.revealedCount - 1,
      entryTime: currentBar.time,
      tp,
      sl,
    };
    document.getElementById('tpSlOverlay').classList.add('hidden');
    document.getElementById('btnClosePos').classList.remove('hidden');
    document.getElementById('btnLong').disabled = true;
    document.getElementById('btnShort').disabled = true;
    this._pendingDir = null;
    this._updateChart();
    this._updateStatsPanel();
  }

  /* ---- 平仓 ---- */
  closePosition(exitPrice, reason = 'manual') {
    if (!this.position) return;
    const currentBar = this.reviewData[this.revealedCount - 1];
    const ep = exitPrice ?? currentBar.close;
    const isLong = this.position.direction === 'long';
    const pnlPct = isLong
      ? ((ep - this.position.entryPrice) / this.position.entryPrice) * 100
      : ((this.position.entryPrice - ep) / this.position.entryPrice) * 100;
    const pnl = (this.balance * 0.1 * pnlPct) / 100; // 用 10% 仓位计算
    this.balance += pnl;
    if (this.balance > this.maxBalance) this.maxBalance = this.balance;

    this.trades.push({
      id: ++this._tradeId,
      direction: this.position.direction,
      entryTime: this.position.entryTime,
      entryPrice: this.position.entryPrice,
      entryBarIdx: this.position.entryBarIdx,
      exitTime: currentBar.time,
      exitPrice: ep,
      exitBarIdx: this.revealedCount - 1,
      exitReason: reason,
      pnl,
      pnlPct,
    });

    this.position = null;
    document.getElementById('btnClosePos').classList.add('hidden');
    document.getElementById('btnLong').disabled = false;
    document.getElementById('btnShort').disabled = false;
    this._updateChart();
    this._updateStatsPanel();
  }

  /* ---- 止盈止损自动检查 ---- */
  _checkTPSL(newBar) {
    if (!this.position) return;
    const isLong = this.position.direction === 'long';
    const { tp, sl } = this.position;
    if (isLong) {
      if (tp != null && newBar.high >= tp) {
        this.closePosition(tp, 'tp');
        return;
      }
      if (sl != null && newBar.low <= sl) {
        this.closePosition(sl, 'sl');
        return;
      }
    } else {
      if (tp != null && newBar.low <= tp) {
        this.closePosition(tp, 'tp');
        return;
      }
      if (sl != null && newBar.high >= sl) {
        this.closePosition(sl, 'sl');
        return;
      }
    }
  }

  /* ---- 更新图表 ---- */
  _updateChart(preserveOffset = true) {
    const slice = this.reviewData.slice(0, this.revealedCount);
    if (!slice.length) return;
    const ind = this.app._buildIndicators(slice);
    const renderer = this.app.renderer;
    renderer.showMA = this.app.showMA;
    renderer.showBB = this.app.showBB;
    renderer.showVol = this.app.showVol;
    renderer.showSuperTrend = this.app.showSuperTrend;
    renderer.chartType = this.app.chartType;
    renderer.reviewTrades = this.trades.slice();
    renderer.reviewPosition = this.position;
    renderer.setData(
      slice,
      ind,
      this.app.interval,
      this.app.chartType,
      this.app.maSettings,
      this.app.showMATips,
      this.app.bollPeriod,
      this.app.bollMult,
      this.app.bollColorUpper,
      this.app.bollColorMiddle,
      this.app.bollColorLower,
      this.app.bollColorBackground,
      this.app.bollShowBackground,
      this.app.rsiPeriod,
      this.app.macdFast,
      this.app.macdSlow,
      this.app.macdSignal,
      false, // 不重置 offset，由下面逻辑控制
    );
    // 只有在明确指定不保持偏移量时，才将最新K线定位到屏幕中心偏右位置
    if (!preserveOffset) {
      const visibleBars = renderer._visibleBars();
      renderer.offset = -Math.floor(visibleBars * 0.3);
    }
    renderer.renderAll();
    // 更新顶部价格信息
    const lastBar = slice[slice.length - 1];
    document.getElementById('currentPrice').textContent = fmtPrice(lastBar.close);
    const chg = ((lastBar.close - slice[0].open) / slice[0].open) * 100;
    const el = document.getElementById('priceChange');
    el.textContent = (chg >= 0 ? '+' : '') + chg.toFixed(2) + '%';
    el.className = `price-change ${chg >= 0 ? 'up' : 'dn'}`;
  }

  /* ---- 更新进度条 ---- */
  _updateProgress() {
    const bg = this._bgCount || 0;
    const total = this.reviewData.length - bg; // 复盘部分总数
    const cur = Math.max(0, this.revealedCount - bg); // 当前复盘进度
    const pct = total > 0 ? ((cur / total) * 100).toFixed(1) : 0;
    document.getElementById('reviewProgressBar').style.width = pct + '%';
    document.getElementById('reviewProgressLabel').textContent = `${cur} / ${total}`;
    // 不能回退到背景部分以前，且持仓时禁止回退
    document.getElementById('btnPrev').disabled =
      this.position != null || this.revealedCount <= bg + 1;
  }

  /* ---- 更新统计面板 ---- */
  _updateStatsPanel() {
    // 余额
    document.getElementById('rsBalance').textContent = `${this.balance.toFixed(2)} USDT`;
    const returnPct = ((this.balance - 10000) / 10000) * 100;
    document.getElementById('rsBalance').className = `rs-balance ${returnPct >= 0 ? 'up' : 'dn'}`;

    // 浮动盈亏
    if (this.position) {
      const lastBar = this.reviewData[this.revealedCount - 1];
      if (lastBar) {
        const isLong = this.position.direction === 'long';
        const floatPct = isLong
          ? ((lastBar.close - this.position.entryPrice) / this.position.entryPrice) * 100
          : ((this.position.entryPrice - lastBar.close) / this.position.entryPrice) * 100;
        const floatPnl = (this.balance * 0.1 * floatPct) / 100;
        const el = document.getElementById('rsFloatPnl');
        el.textContent = `${floatPnl >= 0 ? '+' : ''}${floatPnl.toFixed(2)} USDT (${
          floatPnl >= 0 ? '+' : ''
        }${floatPct.toFixed(2)}%)`;
        el.className = `rs-float ${floatPnl >= 0 ? 'up' : 'dn'}`;
      }
    } else {
      document.getElementById('rsFloatPnl').textContent = '--';
      document.getElementById('rsFloatPnl').className = 'rs-float';
    }

    // 当前持仓
    const posEl = document.getElementById('rsPosition');
    if (this.position) {
      const isLong = this.position.direction === 'long';
      const lastBar = this.reviewData[this.revealedCount - 1];
      const curPrice = lastBar ? lastBar.close : this.position.entryPrice;
      const floatPct = isLong
        ? ((curPrice - this.position.entryPrice) / this.position.entryPrice) * 100
        : ((this.position.entryPrice - curPrice) / this.position.entryPrice) * 100;
      posEl.innerHTML = `<div class="rs-pos-detail">
        <div class="rs-pos-dir ${isLong ? 'up' : 'dn'}">${isLong ? '▲ 做多' : '▼ 做空'}</div>
        <div class="rs-pos-row"><span>开仓价</span><span>${fmtPrice(
          this.position.entryPrice,
        )}</span></div>
        <div class="rs-pos-row"><span>当前价</span><span>${fmtPrice(curPrice)}</span></div>
        <div class="rs-pos-row"><span>浮动</span><span class="${floatPct >= 0 ? 'up' : 'dn'}">${
          floatPct >= 0 ? '+' : ''
        }${floatPct.toFixed(2)}%</span></div>
        ${
          this.position.tp
            ? `<div class="rs-pos-row"><span>止盈</span><span class="up">${fmtPrice(
                this.position.tp,
              )}</span></div>`
            : ''
        }
        ${
          this.position.sl
            ? `<div class="rs-pos-row"><span>止损</span><span class="dn">${fmtPrice(
                this.position.sl,
              )}</span></div>`
            : ''
        }
      </div>`;
    } else {
      posEl.innerHTML = '<div class="rs-no-pos">暂无持仓</div>';
    }

    // 统计数据
    const trades = this.trades;
    const wins = trades.filter((t) => t.pnl > 0).length;
    const losses = trades.filter((t) => t.pnl <= 0).length;
    const winRate = trades.length ? ((wins / trades.length) * 100).toFixed(1) : '--';
    const totalReturn = (((this.balance - 10000) / 10000) * 100).toFixed(2);

    // 最大回撤
    let maxDD = 0,
      peak = 10000;
    let runBalance = 10000;
    trades.forEach((t) => {
      runBalance += t.pnl;
      if (runBalance > peak) peak = runBalance;
      const dd = ((peak - runBalance) / peak) * 100;
      if (dd > maxDD) maxDD = dd;
    });

    document.getElementById('rsTotalTrades').textContent = trades.length;
    document.getElementById('rsWinRate').textContent = trades.length ? winRate + '%' : '--%';
    document.getElementById('rsWinCount').textContent = wins;
    document.getElementById('rsLossCount').textContent = losses;
    document.getElementById('rsTotalReturn').textContent = trades.length
      ? (totalReturn >= 0 ? '+' : '') + totalReturn + '%'
      : '--%';
    document.getElementById('rsTotalReturn').className = `${
      parseFloat(totalReturn) >= 0 ? 'up' : 'dn'
    }`;
    document.getElementById('rsMaxDD').textContent = trades.length ? maxDD.toFixed(2) + '%' : '--%';

    // 交易记录
    this._updateTradeList();
  }

  _updateTradeList() {
    const list = document.getElementById('rsTradesList');
    if (!this.trades.length) {
      list.innerHTML = '<div class="rs-no-trades">暂无交易记录</div>';
      return;
    }
    const rows = [...this.trades]
      .reverse()
      .slice(0, 20)
      .map((t) => {
        const isLong = t.direction === 'long';
        const pnlSign = t.pnl >= 0 ? '+' : '';
        const reasonLabel = { tp: '止盈', sl: '止损', manual: '手动' }[t.exitReason] || '平仓';
        return `<div class="rs-trade-row">
        <div class="rs-trade-top">
          <span class="rs-trade-dir ${isLong ? 'long' : 'short'}">${isLong ? '▲ 多' : '▼ 空'}</span>
          <span class="rs-trade-pnl ${t.pnl >= 0 ? 'up' : 'dn'}">${pnlSign}${t.pnl.toFixed(
            2,
          )} U</span>
          <span class="rs-trade-reason ${t.exitReason}">${reasonLabel}</span>
        </div>
        <div class="rs-trade-bottom">
          <span>${fmtPrice(t.entryPrice)} → ${fmtPrice(t.exitPrice)}</span>
          <span class="${t.pnlPct >= 0 ? 'up' : 'dn'}">${
            t.pnlPct >= 0 ? '+' : ''
          }${t.pnlPct.toFixed(2)}%</span>
        </div>
      </div>`;
      })
      .join('');
    list.innerHTML = rows;
  }

  /* ---- 键盘快捷键 ---- */
  _bindKeys() {
    document.addEventListener('keydown', (e) => {
      if (!this.active) return;
      // 阻止输入框触发
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;
      if (e.code === 'Space' || e.code === 'ArrowRight') {
        e.preventDefault();
        this.next();
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        this.prev();
      } else if (e.code === 'KeyP') {
        this.playPause();
      }
    });
  }

  /* ---- 绑定 DOM 事件 ---- */
  bindUI() {
    document.getElementById('btnReview').addEventListener('click', () => {
      if (this.active) this.exit();
      else this.enter();
    });
    document.getElementById('btnLoadReview').addEventListener('click', () => this.loadData());
    document.getElementById('btnExitReview').addEventListener('click', () => this.exit());
    document.getElementById('btnNext').addEventListener('click', () => this.next());
    document.getElementById('btnPrev').addEventListener('click', () => this.prev());
    document.getElementById('btnPlayPause').addEventListener('click', () => this.playPause());
    document.getElementById('reviewSpeed').addEventListener('change', () => {
      if (this.isPlaying) {
        this._stopAutoPlay();
        this._startAutoPlay();
      }
    });
    document.getElementById('btnLong').addEventListener('click', () => this.openPosition('long'));
    document.getElementById('btnShort').addEventListener('click', () => this.openPosition('short'));
    document
      .getElementById('btnClosePos')
      .addEventListener('click', () => this.closePosition(null, 'manual'));
    document.getElementById('btnConfirmOpen').addEventListener('click', () => this._confirmOpen());
    document.getElementById('btnCancelOpen').addEventListener('click', () => {
      document.getElementById('tpSlOverlay').classList.add('hidden');
      this._pendingDir = null;
    });
    document.getElementById('btnRandomTime').addEventListener('click', async () => {
      if (this.isPlaying) {
        this.playPause();
      }
      if (!this.active) {
        this.enter();
      }
      const randomDate = await this.app._getRandomDate(this.app.symbol, this.app.symbolPlatform);
      document.getElementById('reviewDate').value = randomDate;
      this.loadData();
    });
  }
}

/* ============================================================
   ④ 数据层
   ============================================================ */
class DataService {
  constructor() {
    this.ws = null;
    this.wsStreams = new Set();
    this.callbacks = {};
    this._reconnectTimer = null;
    this._currentStreams = [];
    this._currentSymbol = 'ETHUSDT';
    this._currentPlatformKey = 'binance_futures';
  }

  async fetchKlines(symbol, interval, limit = 500, platformKey) {
    const url = `${getSymbolRestUrl(symbol, '/klines', platformKey)}?symbol=${symbol}&interval=${interval}&limit=${limit}`;
    console.log('fetchKlines URL:', url, 'platformKey:', platformKey);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const raw = await res.json();
    return raw.map((k) => ({
      time: k[0],
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume: parseFloat(k[5]),
    }));
  }

  async fetchTicker24h(symbol, platformKey) {
    const url = getSymbolRestUrl(symbol, '/ticker/24hr', platformKey);
    const res = await fetch(`${url}?symbol=${symbol}`);
    return res.json();
  }

  async fetchOrderbook(symbol, limit = 20, platformKey) {
    const url = getSymbolRestUrl(symbol, '/depth', platformKey);
    const res = await fetch(`${url}?symbol=${symbol}&limit=${limit}`);
    return res.json();
  }

  async fetchRecentTrades(symbol, limit = 30, platformKey) {
    const url = getSymbolRestUrl(symbol, '/trades', platformKey);
    const res = await fetch(`${url}?symbol=${symbol}&limit=${limit}`);
    return res.json();
  }

  async fetchAllTickers() {
    const promises = [];
    const platformKeys = [];
    for (const [key, platform] of Object.entries(PLATFORMS)) {
      if (platform.spot) {
        promises.push(
          fetch(`${platform.spot.rest}/ticker/24hr`)
            .then((r) => r.json())
            .catch(() => []),
        );
        platformKeys.push({ key: `${key}_spot`, type: 'spot' });
      }
      if (platform.futures) {
        promises.push(
          fetch(`${platform.futures.rest}/ticker/24hr`)
            .then((r) => r.json())
            .catch(() => []),
        );
        platformKeys.push({ key: `${key}_futures`, type: 'futures' });
      }
    }
    const results = await Promise.all(promises);
    const allTickers = [];
    for (let i = 0; i < results.length; i++) {
      const tickers = Array.isArray(results[i]) ? results[i] : [];
      const platformKey = platformKeys[i];
      for (const t of tickers) {
        if (t.symbol && t.symbol.endsWith('USDT')) {
          t.platformKey = platformKey.key;
          t.platformType = platformKey.type;
          allTickers.push(t);
        }
      }
    }
    return allTickers;
  }

  connectWS(streams, onMessage, symbol = 'BTCUSDT', platformKey) {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    clearTimeout(this._reconnectTimer);
    this._currentStreams = streams;
    this._currentSymbol = symbol;
    this._currentPlatformKey = platformKey;
    this._onMessage = onMessage;

    const baseWs = getSymbolWsUrl(symbol, platformKey);
    const url = `${baseWs}?streams=${streams.join('/')}`;
    console.log('connectWS URL:', url, 'platformKey:', platformKey);
    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      document.querySelector('.dot').className = 'dot connected';
      document.querySelector('.conn-label').textContent = '已连接';
    };
    this.ws.onmessage = (e) => {
      try {
        onMessage(JSON.parse(e.data));
      } catch {}
    };
    this.ws.onerror = () => {
      document.querySelector('.dot').className = 'dot error';
      document.querySelector('.conn-label').textContent = '连接错误';
    };
    this.ws.onclose = () => {
      document.querySelector('.dot').className = 'dot connecting';
      document.querySelector('.conn-label').textContent = '重连中...';
      this._reconnectTimer = setTimeout(
        () =>
          this.connectWS(
            this._currentStreams,
            this._onMessage,
            this._currentSymbol,
            this._currentPlatformKey,
          ),
        3000,
      );
    };
  }

  close() {
    clearTimeout(this._reconnectTimer);
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

/* ============================================================
   ⑤ 主应用
   ============================================================ */
class App {
  constructor() {
    this.symbol = 'ETHUSDT';
    this.symbolPlatform = 'binance_futures';
    this.interval = '5m';
    this.chartType = 'candle';
    this.showMA = true;
    this.showBB = true;
    this.showVol = false;
    this.showMACD = true;
    this.showRSI = false;
    this.showSuperTrend = true;
    this.showSuperTrendAvg = true;
    this.showPiCycleBottom = false;
    this.superTrendPeriod = 10;
    this.superTrendMultiplier = 3;
    // MACD参数
    this.macdFast = 12;
    this.macdSlow = 26;
    this.macdSignal = 9;
    // BOLL参数
    this.bollPeriod = 55;
    this.bollMult = 2;
    // BOLL颜色设置
    this.bollColorUpper = '#9e9e9e';
    this.bollColorMiddle = '#9e9e9e';
    this.bollColorLower = '#9e9e9e';
    this.bollColorBackground = 'rgba(158,158,158,0.05)';
    // BOLL背景显示开关
    this.bollShowBackground = false;
    // RSI参数
    this.rsiPeriod = 14;
    // MA参数
    this.maSettings = [
      { period: 7, color: '#f0b90b', visible: true },
      { period: 25, color: '#ff6b9d', visible: true },
      { period: 99, color: '#7b61ff', visible: true },
      { period: 200, color: '#2962ff', visible: false },
    ];

    this.klineData = [];
    this.allTickers = [];
    this.sortMode = 'vol';

    // ── WS 缓冲区 & 渲染节流 ──────────────────────────────────
    // 每次 WS 推送只写入缓冲区，由定时器按帧率(200ms)统一刷新
    this._wsBuffer = null; // 最新待渲染的 bar（仅保留最新一条）
    this._wsRenderTimer = null; // setInterval 定时器 id
    this._WS_RENDER_INTERVAL = 200; // ms，约 5fps

    // ── 冻结标志 ─────────────────────────────────────────────
    // 加载历史数据或滚动期间暂停 WS 写入 klineData & 重绘
    this._wsFrozen = false;
    this._wsPendingBar = null; // 冻结期间缓存的最新 bar

    // ── 价格过滤器 ────────────────────────────────────────────
    // 过滤掉极小振幅波动（占当前价格的比例阈值，默认 0.002 = 0.2‰）
    this._priceFilterRatio = 0.0002;

    // ── MA提示设置 ────────────────────────────────────────────
    // 控制是否显示MA相关的提示（B和X字符）
    this.showMATips = true;

    this.renderer = new ChartRenderer();
    this.dataService = new DataService();
    this.reviewMode = null; // 将在 _init 中初始化

    // 检测移动端并添加标记
    this._detectMobile();

    this._init();
  }

  /**
   * 检测是否为移动端设备
   * 通过 User Agent 和屏幕尺寸综合判断
   */
  _detectMobile() {
    const userAgent = navigator.userAgent.toLowerCase();
    const isMobileUA =
      /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini|mobile|tablet/i.test(
        userAgent,
      );
    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    const isSmallScreen = window.innerWidth <= 1024;

    // 综合判断：User Agent 包含移动标识，或是触摸设备+小屏幕
    this.isMobile = isMobileUA || (isTouchDevice && isSmallScreen);

    // 为 body 添加/移除 mobile 类名
    if (this.isMobile) {
      document.body.classList.add('mobile');
      document.body.classList.remove('desktop');
    } else {
      document.body.classList.add('desktop');
      document.body.classList.remove('mobile');
    }

    // 移动端动态计算视口高度（解决底部工具栏遮挡问题）
    if (this.isMobile) {
      this._updateViewportHeight();
      window.addEventListener('resize', () => this._updateViewportHeight());
      // 监听方向变化
      window.addEventListener('orientationchange', () => {
        setTimeout(() => this._updateViewportHeight(), 100);
      });
    }

    // 监听屏幕变化，动态更新
    window.addEventListener('resize', () => {
      const newIsSmallScreen = window.innerWidth <= 1024;
      const newIsMobile = isMobileUA || (isTouchDevice && newIsSmallScreen);

      if (newIsMobile !== this.isMobile) {
        this.isMobile = newIsMobile;
        if (this.isMobile) {
          document.body.classList.add('mobile');
          document.body.classList.remove('desktop');
        } else {
          document.body.classList.add('desktop');
          document.body.classList.remove('mobile');
        }
        // 触发重新渲染以适应新布局
        if (this.renderer) {
          this.renderer.resize();
          this.renderer.renderAll();
        }
      }
    });
  }

  /**
   * 动态更新视口高度（解决移动端浏览器底部工具栏遮挡）
   */
  _updateViewportHeight() {
    const vh = window.innerHeight * 0.01;
    document.documentElement.style.setProperty('--vh', `${vh}px`);

    // 更新 app-layout 高度
    const appLayout = document.querySelector('.app-layout');
    if (appLayout) {
      const topbarHeight = document.querySelector('.topbar')?.offsetHeight || 46;
      appLayout.style.height = `calc(${window.innerHeight}px - ${topbarHeight}px)`;
    }

    // 触发图表重新渲染
    if (this.renderer) {
      this.renderer.resize();
      this.renderer.renderAll();
    }
  }

  // 随机获取交易对，优先选择历史较长的主流交易对
  _getRandomSymbol() {
    // 定义历史较长的主流交易对列表
    const majorSymbols = [
      'BTCUSDT',
      'ETHUSDT',
      'BNBUSDT',
      'XRPUSDT',
      'DOGEUSDT',
      'ADAUSDT',
      'LTCUSDT',
      'LINKUSDT',
      'BCHUSDT',
      'XLMUSDT',
    ];

    // 70%的概率选择主流交易对，30%的概率选择其他交易对
    if (Math.random() < 0.7) {
      // 从主流交易对中随机选择
      const symbol = majorSymbols[Math.floor(Math.random() * majorSymbols.length)];
      return { symbol, platformKey: 'binance_spot' };
    } else if (this.allTickers.length > 0) {
      // 从加载的交易对列表中随机选择
      const randomIndex = Math.floor(Math.random() * this.allTickers.length);
      const ticker = this.allTickers[randomIndex];
      return { symbol: ticker.symbol, platformKey: ticker.platformKey || 'binance_spot' };
    } else {
      // 如果没有加载到交易对列表，使用主流交易对列表
      const symbol = majorSymbols[Math.floor(Math.random() * majorSymbols.length)];
      return { symbol, platformKey: 'binance_spot' };
    }
  }

  // 获取交易对的最早和最晚时间
  async _getSymbolTimeRange(symbol, platformKey) {
    try {
      // 获取最新的K线数据，以确定最晚时间
      const latestUrl = `${getSymbolRestUrl(symbol, '/klines', platformKey)}?symbol=${symbol}&interval=1d&limit=1`;
      const latestRes = await fetch(latestUrl);
      const latestRaw = await latestRes.json();

      if (!latestRaw.length) {
        throw new Error('无法获取交易对数据');
      }

      const latestTime = latestRaw[0][0];

      // 尝试获取最早的K线数据
      // 从2017年开始查询，这是大多数主流交易对的上线时间
      const earliestUrl = `${getSymbolRestUrl(symbol, '/klines', platformKey)}?symbol=${symbol}&interval=1d&startTime=1483228800000&limit=1`;
      const earliestRes = await fetch(earliestUrl);
      const earliestRaw = await earliestRes.json();

      let earliestTime;
      if (earliestRaw.length) {
        earliestTime = earliestRaw[0][0];
      } else {
        // 如果没有数据，使用2017年1月1日作为默认最早时间
        earliestTime = 1483228800000;
      }

      return { earliestTime, latestTime };
    } catch (e) {
      console.warn('获取交易对时间范围失败:', e);
      // 出错时使用默认时间范围
      const now = new Date();
      const latestTime = now.getTime();
      const earliestTime = now.getTime() - 31536000000; // 一年前
      return { earliestTime, latestTime };
    }
  }

  // 随机获取时间段（在交易对的有效时间范围内）
  async _getRandomDate(symbol, platformKey) {
    // 获取交易对的时间范围
    const { earliestTime, latestTime } = await this._getSymbolTimeRange(symbol, platformKey);

    // 计算至少比最晚时间早两个K线周期的时间（确保有足够数据可看）
    const minTime = latestTime - 604800000 * 2; // 两周

    // 在整个历史时间范围内随机选择
    const start = earliestTime;
    const end = minTime;

    // 在有效时间范围内随机选择一个时间
    const randomTime = start + Math.random() * (end - start);
    const randomDate = new Date(randomTime);
    return randomDate.toISOString().slice(0, 10);
  }

  async _init() {
    this.reviewMode = new ReviewMode(this);
    this._bindUI();
    this.reviewMode.bindUI();
    await this._loadTickers();
    await this._loadChart();
    // 设置历史数据动态加载回调
    this.renderer.setLoadHistoryCallback(() => this._onLoadHistory());
    this._startWS();
    this._startTickerWS();
    this._startOrderbookPoll();
    this._startTradesPoll();
  }

  /**
   * 动态加载历史数据回调
   * 当用户滚动到最左侧时自动触发，直到没有更多历史数据
   * 加载期间冻结 WS 写入，防止历史数据被实时数据覆盖或引发重绘冲突
   */
  async _onLoadHistory() {
    // 复盘模式下使用 reviewData 加载历史数据
    if (this.reviewMode?.active) {
      await this._onLoadHistoryReview();
      return;
    }

    if (!this.klineData.length) return;

    // 记录加载前的视口锚点：当前屏幕最左侧可见 K 线的数据索引
    // 加载完成后用这个锚点重新计算 offset，确保视口位置完全不动
    const { startIdx: anchorIdx } = this.renderer._getVisibleRange();

    // 冻结 WS，暂停实时数据写入
    this._freezeWs();

    try {
      const { data, added } = await this._loadMoreKlines(1000, 3);
      if (!added) {
        console.log('已无更多历史数据');
        this.renderer._hasReachedHistoryEnd = true; // 标记已到达历史数据尽头
        return;
      }

      // 将历史数据静态前置
      this.klineData = [...data, ...this.klineData];

      // 用锚点反算新 offset，而不是简单 += added
      // 保证屏幕上看到的第一根 K 线（anchorIdx）在前置数据后映射到正确位置
      const newAnchorIdx = anchorIdx + added;
      const visible = this.renderer._visibleBars();
      const newOffset = this.klineData.length - newAnchorIdx - visible;
      this.renderer.offset = Math.max(0, newOffset);
      this.renderer.offsetF = this.renderer.offset;

      // 重新计算全量指标（历史数据变化需要完整重算）
      const ind = this._buildIndicators(this.klineData);
      this.renderer.setData(
        this.klineData,
        ind,
        this.interval,
        this.chartType,
        this.maSettings,
        this.showMATips, // 传递showMATips参数
        this.bollPeriod,
        this.bollMult,
        this.bollColorUpper,
        this.bollColorMiddle,
        this.bollColorLower,
        this.bollColorBackground,
        this.bollShowBackground,
        this.rsiPeriod,
        this.macdFast,
        this.macdSlow,
        this.macdSignal,
        false, // 不重置 offset
      );
      this.renderer.renderAll();

      console.log(`动态加载 ${added} 根历史 K 线，共 ${this.klineData.length} 根`);
    } catch (e) {
      console.warn('动态加载历史数据失败:', e);
    } finally {
      // 解冻 WS，补写冻结期间积累的最新 bar
      this._unfreezeWs();
    }
  }

  /**
   * 复盘模式下的历史数据加载
   */
  async _onLoadHistoryReview() {
    const reviewMode = this.reviewMode;
    if (!reviewMode?.reviewData?.length) return;

    // 记录加载前的视口锚点
    const { startIdx: anchorIdx } = this.renderer._getVisibleRange();

    try {
      // 获取当前可见的最左侧K线的时间
      const firstBar = reviewMode.reviewData[0];
      const endTime = firstBar.time - 1;

      // 加载更早的历史数据
      const baseUrl = getSymbolRestUrl(this.symbol, '/klines', this.symbolPlatform);
      const url = `${baseUrl}?symbol=${this.symbol}&interval=${this.interval}&endTime=${endTime}&limit=500`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const raw = await res.json();

      if (!raw.length) {
        console.log('复盘模式：已无更多历史数据');
        this.renderer._hasReachedHistoryEnd = true;
        return;
      }

      const older = raw.map((k) => ({
        time: k[0],
        open: parseFloat(k[1]),
        high: parseFloat(k[2]),
        low: parseFloat(k[3]),
        close: parseFloat(k[4]),
        volume: parseFloat(k[5]),
      }));

      const added = older.length;

      // 将历史数据前置到 reviewData
      reviewMode.reviewData = [...older, ...reviewMode.reviewData];
      reviewMode._bgCount += added;
      reviewMode.revealedCount += added;

      // 用锚点反算新 offset
      const newAnchorIdx = anchorIdx + added;
      const visible = this.renderer._visibleBars();
      const newOffset = reviewMode.reviewData.length - newAnchorIdx - visible;

      // 保存计算好的 offset，防止 _updateChart 重置
      const savedOffset = Math.max(0, newOffset);
      this.renderer.offset = savedOffset;
      this.renderer.offsetF = savedOffset;

      // 更新图表（保持当前视图位置）
      reviewMode._updateChart(true);

      console.log(`复盘模式：动态加载 ${added} 根历史 K 线，共 ${reviewMode.reviewData.length} 根`);
    } catch (e) {
      console.warn('复盘模式：动态加载历史数据失败:', e);
    }
  }

  _buildIndicators(data) {
    const closes = data.map((b) => b.close);
    const maData = {};
    // 生成固定键名的MA数据，与渲染器匹配
    if (this.maSettings[0].visible) maData.ma5 = Indicators.sma(closes, this.maSettings[0].period);
    if (this.maSettings[1].visible) maData.ma25 = Indicators.sma(closes, this.maSettings[1].period);
    if (this.maSettings[2].visible) maData.ma99 = Indicators.sma(closes, this.maSettings[2].period);
    if (this.maSettings[3].visible)
      maData.ma200 = Indicators.sma(closes, this.maSettings[3].period);

    return {
      ma: maData,
      bb: Indicators.bollinger(closes, this.bollPeriod, this.bollMult),
      macd: Indicators.macd(closes, this.macdFast, this.macdSlow, this.macdSignal),
      rsi: Indicators.rsi(closes, this.rsiPeriod),
      superTrend: Indicators.superTrend(data, this.superTrendPeriod, this.superTrendMultiplier),
      superTrendAvg: Indicators.superTrendAvg(
        data,
        this.superTrendPeriod,
        this.superTrendMultiplier,
      ),
      piCycleBottom: Indicators.piCycleBottom(data),
    };
  }

  /**
   * 增量计算最后一根K线的指标值（WS 实时更新专用）
   * 只对末尾少量数据切片重算，远比全量计算快
   * 返回格式与 _buildIndicators 末位元素一致
   */
  _buildIncrementalIndicators(data) {
    const len = data.length;
    if (len === 0) return null;

    // 取足够长的尾部切片用于计算（最长周期 200 + 安全余量）
    const TAIL = Math.min(len, 250);
    const tail = data.slice(len - TAIL);
    const closes = tail.map((b) => b.close);

    const getLast = (arr) => arr[arr.length - 1] ?? null;

    // MA 增量
    const maData = {};
    const maKeys = ['ma5', 'ma25', 'ma99', 'ma200'];
    this.maSettings.forEach((s, i) => {
      if (s.visible) {
        maData[maKeys[i]] = getLast(Indicators.sma(closes, s.period));
      }
    });

    // BB 增量
    const bb = Indicators.bollinger(closes, this.bollPeriod, this.bollMult);
    const bbInc = {
      mid: getLast(bb.mid),
      upper: getLast(bb.upper),
      lower: getLast(bb.lower),
    };

    // MACD 增量
    const macd = Indicators.macd(closes, this.macdFast, this.macdSlow, this.macdSignal);
    const macdInc = {
      dif: getLast(macd.dif),
      dea: getLast(macd.dea),
      macd: getLast(macd.macd),
    };

    // RSI 增量
    const rsiInc = getLast(Indicators.rsi(closes, this.rsiPeriod));

    // SuperTrend 增量
    const st = Indicators.superTrend(tail, this.superTrendPeriod, this.superTrendMultiplier);
    const stInc = {
      upper: getLast(st.upper),
      lower: getLast(st.lower),
      trend: getLast(st.trend),
      value: getLast(st.value),
    };

    // SuperTrend Avg 增量
    const sta = Indicators.superTrendAvg(tail, this.superTrendPeriod, this.superTrendMultiplier);
    const staInc = {
      avg: getLast(sta.avg),
      max: getLast(sta.max),
      min: getLast(sta.min),
      upper: getLast(sta.upper),
      lower: getLast(sta.lower),
      trend: getLast(sta.trend),
      spt: getLast(sta.spt),
    };

    return {
      ma: maData,
      bb: bbInc,
      macd: macdInc,
      rsi: rsiInc,
      superTrend: stInc,
      superTrendAvg: staInc,
    };
  }

  /**
   * 加载更多历史K线（带重试机制）
   * @param {number} limit - 每次加载数量
   * @param {number} maxRetries - 最大重试次数
   * @returns {Promise<{data: Array, added: number}>} - 加载的数据和新增数量
   */
  async _loadMoreKlines(limit = 1000, maxRetries = 3) {
    if (!this.klineData.length) return { data: [], added: 0 };

    const endTime = this.klineData[0].time - 1;
    const url = `${getSymbolRestUrl(this.symbol, '/klines', this.symbolPlatform)}?symbol=${this.symbol}&interval=${this.interval}&endTime=${endTime}&limit=${limit}`;

    let lastError = null;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const raw = await res.json();
        if (!raw.length) return { data: [], added: 0 };

        const older = raw.map((k) => ({
          time: k[0],
          open: parseFloat(k[1]),
          high: parseFloat(k[2]),
          low: parseFloat(k[3]),
          close: parseFloat(k[4]),
          volume: parseFloat(k[5]),
        }));

        return { data: older, added: older.length };
      } catch (e) {
        lastError = e;
        console.warn(`加载历史K线失败 (尝试 ${attempt + 1}/${maxRetries}):`, e.message);
        if (attempt < maxRetries - 1) {
          await new Promise((r) => setTimeout(r, 1000 * (attempt + 1))); // 指数退避
        }
      }
    }
    throw lastError;
  }

  /**
   * 更新加载状态显示
   * @param {string} message - 状态消息
   * @param {number|null} progress - 进度百分比 (0-100)
   */
  _updateLoadingStatus(message, progress = null) {
    const loadingEl = document.getElementById('chartLoading');
    const spanEl = loadingEl.querySelector('span');
    spanEl.textContent = message;

    // 如果有进度，添加进度条样式
    if (progress !== null) {
      const progressBar =
        loadingEl.querySelector('.loading-progress') || this._createProgressBar(loadingEl);
      progressBar.style.width = `${Math.min(100, Math.max(0, progress))}%`;
    }
  }

  /**
   * 创建进度条元素
   */
  _createProgressBar(parent) {
    const bar = document.createElement('div');
    bar.className = 'loading-progress';
    bar.style.cssText =
      'width: 0%; height: 3px; background: var(--accent); margin-top: 8px; border-radius: 2px; transition: width 0.3s;';
    parent.appendChild(bar);
    return bar;
  }

  async _loadChart(reset = true) {
    if (this.reviewMode?.active) return; // 复盘模式下禁止覆盖图表
    document.getElementById('chartLoading').classList.remove('hidden');
    if (reset) {
      this.klineData = [];
      this.renderer.offset = 0;
      this.renderer._hasReachedHistoryEnd = false; // 重置历史数据尽头标志
    }
    try {
      // 优化：初始只加载 1000 根，快速启动
      this._updateLoadingStatus('加载行情数据...');
      const data = await this.dataService.fetchKlines(
        this.symbol,
        this.interval,
        1000,
        this.symbolPlatform,
      );

      this.klineData = data;
      this._updateLoadingStatus(`已加载 ${data.length} 根 K 线`);

      const ind = this._buildIndicators(data);
      this.renderer.showMA = this.showMA;
      this.renderer.showBB = this.showBB;
      this.renderer.showVol = this.showVol;
      this.renderer.showMACD = this.showMACD;
      this.renderer.showRSI = this.showRSI;
      this.renderer.showSuperTrend = this.showSuperTrend;
      this.renderer.showSuperTrendAvg = this.showSuperTrendAvg;
      this.renderer.setData(
        data,
        ind,
        this.interval,
        this.chartType,
        this.maSettings,
        this.showMATips,
        this.bollPeriod,
        this.bollMult,
        this.bollColorUpper,
        this.bollColorMiddle,
        this.bollColorLower,
        this.bollColorBackground,
        this.bollShowBackground,
        this.rsiPeriod,
        this.macdFast,
        this.macdSlow,
        this.macdSignal,
      );
      // 如果Y轴缩放关闭，切换时间周期/商品后自动开启
      if (!this.renderer.autoScaleY) {
        this.renderer.autoScaleY = true;
        this.renderer.fixedPriceRange = null;
        const btn = document.getElementById('btnAutoScaleY');
        if (btn) {
          btn.classList.add('active');
          btn.title = 'Y轴自动缩放（已开启）';
        }
      }
      this.renderer.autoScale();
      this.renderer.renderAll();

      const ticker = await this.dataService.fetchTicker24h(this.symbol, this.symbolPlatform);
      this._updateHeaderStats(ticker);
      this._updateStats(ticker);
    } catch (e) {
      console.error('Load chart error', e);
      this._updateLoadingStatus('加载失败，请刷新重试');
    } finally {
      setTimeout(() => {
        document.getElementById('chartLoading').classList.add('hidden');
        this._resetLoadingUI();
      }, 500);
    }
  }

  /**
   * 重置加载UI
   */
  _resetLoadingUI() {
    const loadingEl = document.getElementById('chartLoading');
    const spanEl = loadingEl.querySelector('span');
    spanEl.textContent = '加载行情数据...';
    const progressBar = loadingEl.querySelector('.loading-progress');
    if (progressBar) progressBar.remove();
  }

  /**
   * @param {boolean} [full=false] 强制全量重算指标（切换指标、图表类型时使用）
   */
  _rerender(full = false) {
    if (this.reviewMode?.active) {
      this.reviewMode._updateChart();
      return;
    } // 复盘模式下代理给 reviewMode

    if (!this.klineData.length) return;

    this.renderer.showMA = this.showMA;
    this.renderer.showBB = this.showBB;
    this.renderer.showVol = this.showVol;
    this.renderer.showMACD = this.showMACD;
    this.renderer.showRSI = this.showRSI;
    this.renderer.showSuperTrend = this.showSuperTrend;
    this.renderer.showSuperTrendAvg = this.showSuperTrendAvg;
    this.renderer.showPiCycleBottom = this.showPiCycleBottom;
    this.renderer.chartType = this.chartType;

    // 全量模式：重算所有指标，保持 offset 不变
    // 注：始终使用全量模式以确保指标计算准确，避免增量计算导致的指标偏差
    const ind = this._buildIndicators(this.klineData);
    this.renderer.setData(
      this.klineData,
      ind,
      this.interval,
      this.chartType,
      this.maSettings,
      this.showMATips,
      this.bollPeriod,
      this.bollMult,
      this.bollColorUpper,
      this.bollColorMiddle,
      this.bollColorLower,
      this.bollColorBackground,
      this.bollShowBackground,
      this.rsiPeriod,
      this.macdFast,
      this.macdSlow,
      this.macdSignal,
      false,
    );

    this.renderer.renderAll();
  }

  _startWS() {
    if (this.reviewMode?.active) return; // 复盘模式下不启动 WS

    // 启动 WS 渲染缓冲定时器
    this._startWsRenderTimer();

    console.log(
      '_startWS - this.symbol:',
      this.symbol,
      'this.symbolPlatform:',
      this.symbolPlatform,
    );

    const streamName = `${this.symbol.toLowerCase()}@kline_${this.interval}`;
    this.dataService.connectWS(
      [streamName],
      (msg) => {
        if (!msg.data?.k) return;
        const k = msg.data.k;
        const bar = {
          time: k.t,
          open: parseFloat(k.o),
          high: parseFloat(k.h),
          low: parseFloat(k.l),
          close: parseFloat(k.c),
          volume: parseFloat(k.v),
        };

        // 价格过滤器：若是同一根K线，检查高低价变化是否超过阈值，避免微小波动触发重绘
        if (this.klineData.length && this.klineData[this.klineData.length - 1].time === bar.time) {
          const prev = this.klineData[this.klineData.length - 1];
          const threshold = prev.close * this._priceFilterRatio;
          const highDelta = Math.abs(bar.high - prev.high);
          const lowDelta = Math.abs(bar.low - prev.low);
          const closeDelta = Math.abs(bar.close - prev.close);

          // 收盘价、成交量变化 或 高低价超阈值时才接受更新
          const priceChanged =
            closeDelta > 0 ||
            bar.volume !== prev.volume ||
            highDelta > threshold ||
            lowDelta > threshold;

          if (!priceChanged) return; // 过滤微小波动
        }

        // 冻结期间缓存 bar，不立刻写入 klineData
        if (this._wsFrozen) {
          this._wsPendingBar = bar;
          this._updateLivePrice(bar.close, parseFloat(k.o));
          return;
        }

        // 写入 klineData（合并最新 bar 或追加新 bar）
        this._applyWsBar(bar);
        this._updateLivePrice(bar.close, parseFloat(k.o));

        // 将 bar 存入缓冲区，等待定时器统一渲染
        this._wsBuffer = bar;
      },
      this.symbol,
      this.symbolPlatform,
    );
  }

  /**
   * 启动 WS 渲染缓冲定时器（约 5fps）
   * 定时器读取 _wsBuffer，若有新数据才执行重绘，避免每条推送都触发全量渲染
   */
  _startWsRenderTimer() {
    this._stopWsRenderTimer();
    this._wsRenderTimer = setInterval(() => {
      if (!this._wsBuffer) return;
      if (this._wsFrozen) return;
      this._wsBuffer = null;
      this._rerender();
    }, this._WS_RENDER_INTERVAL);
  }

  /**
   * 停止 WS 渲染缓冲定时器
   */
  _stopWsRenderTimer() {
    if (this._wsRenderTimer) {
      clearInterval(this._wsRenderTimer);
      this._wsRenderTimer = null;
    }
  }

  /**
   * 将 WS bar 写入 klineData（合并或追加）
   */
  _applyWsBar(bar) {
    if (this.klineData.length && this.klineData[this.klineData.length - 1].time === bar.time) {
      this.klineData[this.klineData.length - 1] = bar;
    } else {
      this.klineData.push(bar);
      if (this.klineData.length > 2000) this.klineData.shift();
    }
  }

  /**
   * 冻结/解冻 WS 写入
   * 加载历史数据或用户滑动触发加载时调用，防止加载期间 WS 数据干扰数据集
   */
  _freezeWs() {
    this._wsFrozen = true;
    this._wsPendingBar = null;
  }

  _unfreezeWs() {
    this._wsFrozen = false;
    // 将冻结期间积累的最新 bar 补写回去
    if (this._wsPendingBar) {
      this._applyWsBar(this._wsPendingBar);
      this._wsPendingBar = null;
    }
  }

  _startTickerWS() {
    if (this.reviewMode?.active) return; // 复盘模式下不启动 ticker WS
    // 订阅 top tickers miniTicker
    const streams = POPULAR_SYMBOLS.slice(0, 12).map((s) => `${s.toLowerCase()}@miniTicker`);
    // Use separate WS for tickers (avoid conflicts)
    const baseWs = getSymbolWsUrl(this.symbol, this.symbolPlatform);
    const url = `${baseWs}?streams=${streams.join('/')}`;
    if (this._tickerWS) this._tickerWS.close();
    this._tickerWS = new WebSocket(url);
    this._tickerWS.onmessage = (e) => {
      try {
        if (this.reviewMode?.active) return; // 复盘中忽略 ticker 更新
        const msg = JSON.parse(e.data);
        if (msg.data?.e === '24hrMiniTicker') {
          this._updateTickerItem(msg.data);
        }
      } catch {}
    };
  }

  _updateTickerItem(ticker) {
    const sym = ticker.s;
    const price = parseFloat(ticker.c);
    const open = parseFloat(ticker.o);
    const chgPct = (((price - open) / open) * 100).toFixed(2);
    const vol = parseFloat(ticker.v);

    const row = document.getElementById(`ticker-${sym}`);
    if (!row) return;
    row.querySelector('.ti-price').textContent = fmtPrice(price);
    row.querySelector('.ti-price').className = `ti-price ${chgPct >= 0 ? 'up' : 'dn'}`;
    row.querySelector('.ti-change').textContent = (chgPct >= 0 ? '+' : '') + chgPct + '%';
    row.querySelector('.ti-change').className = `ti-change ${chgPct >= 0 ? 'up' : 'dn'}`;
  }

  _startOrderbookPoll() {
    if (this.reviewMode?.active) return; // 复盘模式下不启动盘口轮询
    const refresh = async () => {
      if (this.reviewMode?.active) return; // 双重守卫：interval 回调内也检查
      try {
        const ob = await this.dataService.fetchOrderbook(this.symbol, 20, this.symbolPlatform);
        this._renderOrderbook(ob);
      } catch (e) {
        console.warn('Orderbook fetch error:', e);
      }
    };
    refresh();
    this._obTimer = setInterval(refresh, 2000);
  }

  _startTradesPoll() {
    if (this.reviewMode?.active) return; // 复盘模式下不启动成交轮询
    const refresh = async () => {
      if (this.reviewMode?.active) return; // 双重守卫
      try {
        const trades = await this.dataService.fetchRecentTrades(
          this.symbol,
          25,
          this.symbolPlatform,
        );
        this._renderTrades(trades);
      } catch {}
    };
    refresh();
    this._tradesTimer = setInterval(refresh, 3000);
  }

  _renderOrderbook(ob) {
    if (!ob || !ob.asks || !ob.bids) return;
    const asks = ob.asks.slice(0, 12).reverse(); // show best ask last (closest to spread)
    const bids = ob.bids.slice(0, 12);

    const maxAsk = Math.max(...asks.map((a) => parseFloat(a[1])));
    const maxBid = Math.max(...bids.map((b) => parseFloat(b[1])));

    const renderRows = (rows, cls, maxQty) =>
      rows
        .map(([price, qty]) => {
          const p = parseFloat(price),
            q = parseFloat(qty);
          const pct = Math.round((q / maxQty) * 100);
          return `<div class="ob-row ${cls}">
        <span class="ob-price">${fmtPrice(p)}</span>
        <span class="ob-qty">${fmt(q)}</span>
        <span class="ob-total">${fmt(p * q)}</span>
        <div class="ob-fill" style="width:${pct}%"></div>
      </div>`;
        })
        .join('');

    const header = `<div class="ob-header-row"><span>价格</span><span>数量</span><span>总额</span></div>`;

    document.getElementById('obAsks').innerHTML = header + renderRows(asks, 'ask', maxAsk);
    document.getElementById('obBids').innerHTML = header + renderRows(bids, 'bid', maxBid);

    if (asks.length && bids.length) {
      const bestAsk = parseFloat(asks[asks.length - 1][0]);
      const bestBid = parseFloat(bids[0][0]);
      const spread = (bestAsk - bestBid).toFixed(2);
      const midPrice = (bestAsk + bestBid) / 2;
      document.getElementById('obPrice').textContent = fmtPrice(midPrice);
      document.getElementById('obSpreadVal').textContent = `差价 ${spread}`;
    }
  }

  _renderTrades(trades) {
    const list = document.getElementById('tradesList');
    const rows = trades
      .slice(0, 20)
      .map((t) => {
        const time = new Date(t.time);
        const pad = (n) => String(n).padStart(2, '0');
        const timeStr = `${pad(time.getHours())}:${pad(time.getMinutes())}:${pad(
          time.getSeconds(),
        )}`;
        return `<div class="trade-row">
        <span class="tr-price ${t.isBuyerMaker ? 'dn' : 'up'}">${fmtPrice(
          parseFloat(t.price),
        )}</span>
        <span class="tr-qty">${fmt(parseFloat(t.qty))}</span>
        <span class="tr-time">${timeStr}</span>
      </div>`;
      })
      .join('');
    list.innerHTML = rows;
  }

  _updateHeaderStats(ticker) {
    if (this.reviewMode?.active) return;
    const price = parseFloat(ticker.lastPrice);
    const chg = parseFloat(ticker.priceChangePercent);
    document.getElementById('currentPrice').textContent = fmtPrice(price);
    const el = document.getElementById('priceChange');
    el.textContent = (chg >= 0 ? '+' : '') + chg.toFixed(2) + '%';
    el.className = `price-change ${chg >= 0 ? 'up' : 'dn'}`;
    document.getElementById('symbolName').innerHTML =
      this.symbol.replace('USDT', '/USDT') + getSymbolBadge(this.symbol, this.symbolPlatform);
    document.getElementById('obSymbol').textContent = this.symbol;
  }

  _updateStats(ticker) {
    document.getElementById('stat24hH').textContent = fmtPrice(parseFloat(ticker.highPrice));
    document.getElementById('stat24hL').textContent = fmtPrice(parseFloat(ticker.lowPrice));
    document.getElementById('stat24hV').textContent = fmt(parseFloat(ticker.volume));
    document.getElementById('stat24hQ').textContent = fmt(parseFloat(ticker.quoteVolume));
  }

  _updateLivePrice(price, open) {
    if (this.reviewMode?.active) return;
    document.getElementById('currentPrice').textContent = fmtPrice(price);
    const chg = ((price - open) / open) * 100;
    const el = document.getElementById('priceChange');
    el.textContent = (chg >= 0 ? '+' : '') + chg.toFixed(2) + '%';
    el.className = `price-change ${chg >= 0 ? 'up' : 'dn'}`;
    // 更新实时价格线
    this.renderer.setLastPrice(price);
    // 更新顶部 OHLCV 标签栏（最新 K 线数据）
    const lastBar = this.klineData?.[this.klineData.length - 1];
    if (lastBar) {
      document.getElementById('infoO').textContent = fmtPrice(lastBar.open);
      document.getElementById('infoH').textContent = fmtPrice(lastBar.high);
      document.getElementById('infoL').textContent = fmtPrice(lastBar.low);
      document.getElementById('infoC').textContent = fmtPrice(lastBar.close);
      document.getElementById('infoV').textContent = fmt(lastBar.volume);
    }
  }

  async _loadTickers() {
    try {
      const tickers = await this.dataService.fetchAllTickers();
      this.allTickers = tickers.filter((t) => t.symbol.endsWith('USDT'));
      this._renderTickerList();
    } catch (e) {
      console.warn('fetchAllTickers failed', e);
      // fallback: show popular symbols
      this.allTickers = POPULAR_SYMBOLS.map((s) => ({
        symbol: s,
        lastPrice: '0',
        priceChangePercent: '0',
        quoteVolume: '0',
      }));
      this._renderTickerList();
    }
  }

  _renderTickerList() {
    let list = this.allTickers.slice();
    if (this.sortMode === 'vol') {
      list.sort((a, b) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume));
    } else {
      list.sort(
        (a, b) =>
          Math.abs(parseFloat(b.priceChangePercent)) - Math.abs(parseFloat(a.priceChangePercent)),
      );
    }
    // Show top 30 popular + current
    const shown = list
      .filter((t) => POPULAR_SYMBOLS.includes(t.symbol) || t.symbol === this.symbol)
      .slice(0, 30);

    const html = shown
      .map((t) => {
        const price = parseFloat(t.lastPrice);
        const chg = parseFloat(t.priceChangePercent);
        const vol = parseFloat(t.quoteVolume);
        const sym = t.symbol.replace('USDT', '');
        const platformKey = t.platformKey || 'binance_spot';
        const badge = getSymbolBadge(t.symbol, platformKey);
        return `<div class="ticker-item ${t.symbol === this.symbol && platformKey === this.symbolPlatform ? 'active' : ''}" id="ticker-${
          t.symbol
        }" data-symbol="${t.symbol}" data-platform="${platformKey}">
        <div class="ti-top">
          <span class="ti-sym">${sym}/USDT ${badge}</span>
          <span class="ti-price ${chg >= 0 ? 'up' : 'dn'}">${fmtPrice(price)}</span>
        </div>
        <div class="ti-bot">
          <span class="ti-vol">Vol ${fmt(vol)}</span>
          <span class="ti-change ${chg >= 0 ? 'up' : 'dn'}">${chg >= 0 ? '+' : ''}${chg.toFixed(
            2,
          )}%</span>
        </div>
      </div>`;
      })
      .join('');

    document.getElementById('tickerList').innerHTML = html;

    // Bind click
    document.querySelectorAll('.ticker-item').forEach((el) => {
      el.addEventListener('click', () => {
        this._selectSymbol(el.dataset.symbol, el.dataset.platform);
      });
    });
  }

  _selectSymbol(sym, platformKey) {
    if (this.reviewMode?.active) return; // 复盘模式下禁止切换交易对
    console.log(
      '_selectSymbol called - sym:',
      sym,
      'platformKey:',
      platformKey,
      'current this.symbolPlatform:',
      this.symbolPlatform,
    );
    if (sym === this.symbol && platformKey === this.symbolPlatform) return;
    this.symbol = sym;
    this.symbolPlatform = platformKey || getSymbolPlatform(sym).key;
    console.log('_selectSymbol - after assignment this.symbolPlatform:', this.symbolPlatform);
    clearInterval(this._obTimer);
    clearInterval(this._tradesTimer);
    // 停止旧 WS 渲染定时器，解冻状态，再重启
    this._stopWsRenderTimer();
    this._wsFrozen = false;
    this._wsPendingBar = null;
    this._wsBuffer = null;
    this.dataService.close();
    this._renderTickerList();
    this._loadChart();
    this._startWS();
    this._startTickerWS();
    this._startOrderbookPoll();
    this._startTradesPoll();
  }

  _bindUI() {
    // 指标面板收起/展开功能
    const btnToggleIndicators = document.getElementById('btnToggleIndicators');
    if (btnToggleIndicators) {
      btnToggleIndicators.addEventListener('click', () => {
        const content = document.querySelector('.indicator-panel-content');
        if (content) {
          content.classList.toggle('collapsed');
          btnToggleIndicators.classList.toggle('active');
        }
      });

      // 移动端触摸事件支持
      btnToggleIndicators.addEventListener(
        'touchstart',
        (e) => {
          e.preventDefault();
          btnToggleIndicators.style.transform = 'scale(0.95)';
        },
        { passive: false },
      );

      btnToggleIndicators.addEventListener(
        'touchend',
        (e) => {
          e.preventDefault();
          btnToggleIndicators.style.transform = 'scale(1)';
          const content = document.querySelector('.indicator-panel-content');
          if (content) {
            content.classList.toggle('collapsed');
            btnToggleIndicators.classList.toggle('active');
          }
        },
        { passive: false },
      );
    }

    // Interval buttons (desktop)
    document.querySelectorAll('.interval-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.interval-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.interval = btn.dataset.interval;

        if (this.reviewMode?.active) {
          // 复盘中
          // 暂停播放
          if (this.reviewMode.isPlaying) {
            this.reviewMode.playPause();
          }
          // 同步复盘周期选择
          document.getElementById('reviewIntervalSelect').value = this.interval;
          // 加载数据
          this.reviewMode.loadData();
        } else {
          // 实时行情
          this._stopWsRenderTimer();
          this._wsFrozen = false;
          this._wsPendingBar = null;
          this._wsBuffer = null;
          this._loadChart();
          this._startWS();
        }
      });
    });

    // Mobile interval select
    const mobileIntervalSelect = document.getElementById('mobileIntervalSelect');
    if (mobileIntervalSelect) {
      mobileIntervalSelect.addEventListener('change', (e) => {
        this.interval = e.target.value;

        if (this.reviewMode?.active) {
          // 复盘中
          // 暂停播放
          if (this.reviewMode.isPlaying) {
            this.reviewMode.playPause();
          }
          // 同步复盘周期选择
          document.getElementById('reviewIntervalSelect').value = this.interval;
          // 加载数据
          this.reviewMode.loadData();
        } else {
          // 实时行情
          this._stopWsRenderTimer();
          this._wsFrozen = false;
          this._wsPendingBar = null;
          this._wsBuffer = null;
          this._loadChart();
          this._startWS();
        }
      });
    }

    // Chart type (desktop)
    document.querySelectorAll('.chart-type-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.chart-type-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.chartType = btn.dataset.type;
        this._rerender(true);
      });
    });

    // Mobile chart type select
    const mobileChartTypeSelect = document.getElementById('mobileChartTypeSelect');
    if (mobileChartTypeSelect) {
      mobileChartTypeSelect.addEventListener('change', (e) => {
        this.chartType = e.target.value;
        this._rerender(true);
      });
    }

    // Indicator toggles
    document.getElementById('toggleMA').addEventListener('click', (e) => {
      this.showMA = !this.showMA;
      e.target.dataset.active = this.showMA.toString();
      this._rerender(true);
    });
    document.getElementById('toggleBB').addEventListener('click', (e) => {
      this.showBB = !this.showBB;
      e.target.dataset.active = this.showBB.toString();
      this._rerender(true);
    });
    document.getElementById('toggleVOL').addEventListener('click', (e) => {
      this.showVol = !this.showVol;
      e.target.dataset.active = this.showVol.toString();

      // 如果主图处于展开状态且要显示幅图，则自动收起主图
      if (this.showVol && this.renderer.isChartExpanded) {
        this.renderer.toggleChartExpand();
      }

      document.getElementById('volWrapper').classList.toggle('hidden', !this.showVol);
      this.renderer.showVol = this.showVol;
      this.renderer.renderAll();
    });
    // 初始化MACD显示状态
    document.getElementById('macdWrapper').classList.toggle('hidden', !this.showMACD);
    document.getElementById('toggleMACD').addEventListener('click', (e) => {
      this.showMACD = !this.showMACD;
      e.target.dataset.active = this.showMACD.toString();

      // 如果主图处于展开状态且要显示幅图，则自动收起主图
      if (this.showMACD && this.renderer.isChartExpanded) {
        this.renderer.toggleChartExpand();
      }

      document.getElementById('macdWrapper').classList.toggle('hidden', !this.showMACD);
      this._rerender(true);
    });
    document.getElementById('toggleRSI').addEventListener('click', (e) => {
      this.showRSI = !this.showRSI;
      e.target.dataset.active = this.showRSI.toString();

      // 如果主图处于展开状态且要显示幅图，则自动收起主图
      if (this.showRSI && this.renderer.isChartExpanded) {
        this.renderer.toggleChartExpand();
      }

      document.getElementById('rsiWrapper').classList.toggle('hidden', !this.showRSI);
      this._rerender(true);
    });
    document.getElementById('toggleSuperTrend').addEventListener('click', (e) => {
      this.showSuperTrend = !this.showSuperTrend;
      e.target.dataset.active = this.showSuperTrend.toString();
      this.renderer.showSuperTrend = this.showSuperTrend;
      // 显示/隐藏设置按钮
      const settingsBtn = document.getElementById('btnSuperTrendSettings');
      if (settingsBtn) {
        settingsBtn.style.display = this.showSuperTrend ? 'inline-flex' : 'none';
      }
      this._rerender(true);
    });
    document.getElementById('toggleSuperTrendAvg').addEventListener('click', (e) => {
      this.showSuperTrendAvg = !this.showSuperTrendAvg;
      e.target.dataset.active = this.showSuperTrendAvg.toString();
      this.renderer.showSuperTrendAvg = this.showSuperTrendAvg;
      this._rerender(true);
    });
    const piBtn = document.getElementById('togglePiCycleBottom');
    if (piBtn) {
      piBtn.addEventListener('click', (e) => {
        this.showPiCycleBottom = !this.showPiCycleBottom;
        e.target.dataset.active = this.showPiCycleBottom.toString();
        this.renderer.showPiCycleBottom = this.showPiCycleBottom;
        this._rerender(true);
      });
    }

    // Mobile indicator custom dropdown
    const mobileIndicatorDropdown = document.getElementById('mobileIndicatorDropdown');
    if (mobileIndicatorDropdown) {
      const trigger = mobileIndicatorDropdown.querySelector('.custom-select-trigger');
      const checkboxes = mobileIndicatorDropdown.querySelectorAll('input[type="checkbox"]');

      // Toggle dropdown
      trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        mobileIndicatorDropdown.classList.toggle('active');
      });

      // Close when clicking outside
      document.addEventListener('click', (e) => {
        if (!mobileIndicatorDropdown.contains(e.target)) {
          mobileIndicatorDropdown.classList.remove('active');
        }
      });

      // Handle checkbox changes
      checkboxes.forEach((checkbox) => {
        checkbox.addEventListener('change', () => {
          const selectedValues = Array.from(
            mobileIndicatorDropdown.querySelectorAll('input[type="checkbox"]:checked'),
          ).map((cb) => cb.value);

          // Update MA
          this.showMA = selectedValues.includes('MA');
          const maBtn = document.getElementById('toggleMA');
          if (maBtn) maBtn.dataset.active = this.showMA.toString();

          // Update BOLL
          this.showBB = selectedValues.includes('BB');
          const bbBtn = document.getElementById('toggleBB');
          if (bbBtn) bbBtn.dataset.active = this.showBB.toString();

          // Update VOL
          this.showVol = selectedValues.includes('VOL');
          const volWrapper = document.getElementById('volWrapper');
          if (volWrapper) {
            if (this.showVol && this.renderer.isChartExpanded) {
              this.renderer.toggleChartExpand();
            }
            volWrapper.classList.toggle('hidden', !this.showVol);
            this.renderer.showVol = this.showVol;
          }
          const volBtn = document.getElementById('toggleVOL');
          if (volBtn) volBtn.dataset.active = this.showVol.toString();

          // Update MACD
          this.showMACD = selectedValues.includes('MACD');
          const macdWrapper = document.getElementById('macdWrapper');
          if (macdWrapper) {
            if (this.showMACD && this.renderer.isChartExpanded) {
              this.renderer.toggleChartExpand();
            }
            macdWrapper.classList.toggle('hidden', !this.showMACD);
          }
          const macdBtn = document.getElementById('toggleMACD');
          if (macdBtn) macdBtn.dataset.active = this.showMACD.toString();

          // Update RSI
          this.showRSI = selectedValues.includes('RSI');
          const rsiWrapper = document.getElementById('rsiWrapper');
          if (rsiWrapper) {
            if (this.showRSI && this.renderer.isChartExpanded) {
              this.renderer.toggleChartExpand();
            }
            rsiWrapper.classList.toggle('hidden', !this.showRSI);
          }
          const rsiBtn = document.getElementById('toggleRSI');
          if (rsiBtn) rsiBtn.dataset.active = this.showRSI.toString();

          // Update SuperTrend
          this.showSuperTrend = selectedValues.includes('SuperTrend');
          this.renderer.showSuperTrend = this.showSuperTrend;
          const stBtn = document.getElementById('toggleSuperTrend');
          if (stBtn) stBtn.dataset.active = this.showSuperTrend.toString();
          const stSettingsBtn = document.getElementById('btnSuperTrendSettings');
          if (stSettingsBtn) {
            stSettingsBtn.style.display = this.showSuperTrend ? 'inline-flex' : 'none';
          }

          // Update SuperTrend Avg
          this.showSuperTrendAvg = selectedValues.includes('SuperTrendAvg');
          this.renderer.showSuperTrendAvg = this.showSuperTrendAvg;
          const staBtn = document.getElementById('toggleSuperTrendAvg');
          if (staBtn) staBtn.dataset.active = this.showSuperTrendAvg.toString();

          // Update Pi Cycle Bottom
          this.showPiCycleBottom = selectedValues.includes('PiCycleBottom');
          this.renderer.showPiCycleBottom = this.showPiCycleBottom;
          const piBtn = document.getElementById('togglePiCycleBottom');
          if (piBtn) {
            piBtn.dataset.active = this.showPiCycleBottom.toString();
          }

          this._rerender(true);
        });
      });
    }

    // 测量工具
    const measureBtn = document.getElementById('btnMeasure');
    measureBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      this.renderer.measureMode = !this.renderer.measureMode;
      measureBtn.dataset.active = this.renderer.measureMode.toString();
      measureBtn.classList.toggle('active', this.renderer.measureMode);

      // 进入测量模式时自动显示光标
      if (this.renderer.measureMode) {
        this.renderer.showCrosshair = true;
        // 重置测量状态
        this.renderer.measureStart = null;
        this.renderer.measureEnd = null;
        this.renderer.measurePreview = null;
        document.getElementById('tooltip').style.display = 'none';
      }

      if (!this.renderer.measureMode) {
        // 退出测量模式时只清除临时测量数据，保留保存的测量结果
        this.renderer.measureStart = null;
        this.renderer.measureEnd = null;
        this.renderer.measurePreview = null;
        this.renderer.showCrosshair = false;
      }
      this.renderer.renderAll();
    });

    // 磁铁吸附
    const magnetBtn = document.getElementById('btnMagnet');
    if (magnetBtn) {
      magnetBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        this.renderer.magnetMode = !this.renderer.magnetMode;
        magnetBtn.dataset.active = this.renderer.magnetMode.toString();
        magnetBtn.classList.toggle('active', this.renderer.magnetMode);
        this.renderer.renderAll();
      });
    }

    // 画图工具按钮组
    const drawToolsGroup = document.getElementById('drawToolsGroup');
    if (drawToolsGroup) {
      const toolBtns = drawToolsGroup.querySelectorAll('.draw-tool-btn');
      toolBtns.forEach((btn) => {
        btn.addEventListener('mousedown', (e) => {
          e.preventDefault();
          e.stopPropagation();
        });

        // 进入画图模式时自动显示光标
        if (this.renderer.drawMode) {
          this.renderer.showCrosshair = true;
        }

        const handleDrawToolClick = (e) => {
          e.stopPropagation();
          e.preventDefault();
          const tool = btn.dataset.tool;
          // 如果点击的是同一个工具按钮，切换画图模式
          if (this.renderer.drawTool === tool && this.renderer.drawMode) {
            this.renderer.drawMode = false;
            this.renderer.showCrosshair = false;
            toolBtns.forEach((b) => b.classList.remove('active'));
          } else {
            this.renderer.drawTool = tool;
            this.renderer.drawMode = true;
            this.renderer.showCrosshair = true;
            // 更新按钮激活状态
            toolBtns.forEach((b) => b.classList.remove('active'));
            btn.classList.add('active');
          }
          this.renderer.renderAll();
        };

        btn.addEventListener('click', handleDrawToolClick);
        btn.addEventListener('touchend', (e) => {
          e.preventDefault();
          e.stopPropagation();
          btn.style.transform = 'scale(1)';
          handleDrawToolClick(e);
        });
        btn.addEventListener(
          'touchstart',
          (e) => {
            e.stopPropagation();
            btn.style.transform = 'scale(0.95)';
          },
          { passive: true },
        );
      });
    }

    // 绘图面板关闭按钮
    const btnCloseDrawingsPanel = document.getElementById('btnCloseDrawingsPanel');
    if (btnCloseDrawingsPanel) {
      const handleCloseDrawings = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const drawingsPanel = document.getElementById('drawingsPanel');
        if (drawingsPanel) {
          drawingsPanel.classList.add('hidden');
        }
      };
      btnCloseDrawingsPanel.addEventListener('click', handleCloseDrawings);
      btnCloseDrawingsPanel.addEventListener('touchend', (e) => {
        e.preventDefault();
        handleCloseDrawings(e);
      });
    }

    // 打开绘图面板按钮
    const btnOpenDrawingsPanel = document.getElementById('btnOpenDrawingsPanel');
    if (btnOpenDrawingsPanel) {
      const handleOpenDrawings = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const drawingsPanel = document.getElementById('drawingsPanel');
        if (drawingsPanel) {
          this.renderer._updateDrawingsPanel();
          drawingsPanel.classList.remove('hidden');
        }
      };
      btnOpenDrawingsPanel.addEventListener('click', handleOpenDrawings);
      btnOpenDrawingsPanel.addEventListener('touchend', (e) => {
        e.preventDefault();
        btnOpenDrawingsPanel.style.transform = 'scale(1)';
        handleOpenDrawings(e);
      });
      btnOpenDrawingsPanel.addEventListener(
        'touchstart',
        () => {
          btnOpenDrawingsPanel.style.transform = 'scale(0.95)';
        },
        { passive: true },
      );
    }

    // 超级趋势参数设置

    document.getElementById('closeSuperTrendModal')?.addEventListener('click', () => {
      document.getElementById('superTrendModal').classList.add('hidden');
    });
    document.getElementById('cancelSuperTrendSettings')?.addEventListener('click', () => {
      document.getElementById('superTrendModal').classList.add('hidden');
    });
    document.getElementById('saveSuperTrendSettings')?.addEventListener('click', () => {
      this.superTrendPeriod = parseInt(document.getElementById('stPeriod').value) || 10;
      this.superTrendMultiplier = parseFloat(document.getElementById('stMultiplier').value) || 3;
      document.getElementById('superTrendModal').classList.add('hidden');
      this._rerender(true);
    });

    // MACD参数设置
    document.getElementById('closeMacdModal')?.addEventListener('click', () => {
      document.getElementById('macdModal').classList.add('hidden');
    });
    document.getElementById('cancelMacdSettings')?.addEventListener('click', () => {
      document.getElementById('macdModal').classList.add('hidden');
    });
    document.getElementById('saveMacdSettings')?.addEventListener('click', () => {
      this.macdFast = parseInt(document.getElementById('macdFast').value) || 12;
      this.macdSlow = parseInt(document.getElementById('macdSlow').value) || 26;
      this.macdSignal = parseInt(document.getElementById('macdSignal').value) || 9;
      document.getElementById('macdModal').classList.add('hidden');
      this._rerender(true);
    });

    // MA参数设置
    document.getElementById('closeMaModal')?.addEventListener('click', () => {
      document.getElementById('maModal').classList.add('hidden');
    });
    document.getElementById('cancelMaSettings')?.addEventListener('click', () => {
      document.getElementById('maModal').classList.add('hidden');
    });
    document.getElementById('saveMaSettings')?.addEventListener('click', () => {
      // 保存新设置
      for (let i = 0; i < this.maSettings.length; i++) {
        this.maSettings[i].period =
          parseInt(document.getElementById(`ma${i + 1}Period`).value) || 5;
        this.maSettings[i].color = document.getElementById(`ma${i + 1}Color`).value;
        this.maSettings[i].visible = document.getElementById(`ma${i + 1}Visible`).checked;
      }
      // 保存MA提示设置
      this.showMATips = document.getElementById('maTipsVisible').checked;
      document.getElementById('maModal').classList.add('hidden');
      this._rerender(true);
      // 更新指标面板，确保MA数据与顶部面板绑定
      this._updateIndicatorPanel();
    });

    // BOLL参数设置
    document.getElementById('closeBollModal')?.addEventListener('click', () => {
      document.getElementById('bollModal').classList.add('hidden');
    });
    document.getElementById('cancelBollSettings')?.addEventListener('click', () => {
      document.getElementById('bollModal').classList.add('hidden');
    });
    document.getElementById('saveBollSettings')?.addEventListener('click', () => {
      this.bollPeriod = parseInt(document.getElementById('bollPeriod').value) || 55;
      this.bollMult = parseFloat(document.getElementById('bollMult').value) || 2;
      // 保存颜色设置
      this.bollColorUpper = document.getElementById('bollColorUpper').value;
      this.bollColorMiddle = document.getElementById('bollColorMiddle').value;
      this.bollColorLower = document.getElementById('bollColorLower').value;
      // 处理背景颜色和透明度
      const bgColor = document.getElementById('bollColorBackground').value;
      const opacity = parseFloat(document.getElementById('bollColorOpacity').value) || 0.05;
      // 将十六进制颜色转换为rgba
      const r = parseInt(bgColor.slice(1, 3), 16);
      const g = parseInt(bgColor.slice(3, 5), 16);
      const b = parseInt(bgColor.slice(5, 7), 16);
      this.bollColorBackground = `rgba(${r}, ${g}, ${b}, ${opacity})`;
      // 保存背景显示开关设置
      this.bollShowBackground = document.getElementById('bollShowBackground').checked;
      document.getElementById('bollModal').classList.add('hidden');
      this._rerender(true);
    });

    // RSI参数设置
    document.getElementById('closeRsiModal')?.addEventListener('click', () => {
      document.getElementById('rsiModal').classList.add('hidden');
    });
    document.getElementById('cancelRsiSettings')?.addEventListener('click', () => {
      document.getElementById('rsiModal').classList.add('hidden');
    });
    document.getElementById('saveRsiSettings')?.addEventListener('click', () => {
      this.rsiPeriod = parseInt(document.getElementById('rsiPeriod').value) || 14;
      document.getElementById('rsiModal').classList.add('hidden');
      this._rerender(true);
    });

    // Volume参数设置
    document.getElementById('closeVolumeModal')?.addEventListener('click', () => {
      document.getElementById('volumeModal').classList.add('hidden');
    });
    document.getElementById('cancelVolumeSettings')?.addEventListener('click', () => {
      document.getElementById('volumeModal').classList.add('hidden');
    });
    document.getElementById('saveVolumeSettings')?.addEventListener('click', () => {
      // 这里可以添加Volume设置的保存逻辑
      document.getElementById('volumeModal').classList.add('hidden');
      this._rerender(true);
    });

    // 重置图表
    const btnResetChart = document.getElementById('btnResetChart');
    const handleResetChart = (e) => {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      this.renderer.resetChart();
      // 同步更新Y轴自动缩放按钮状态
      const btn = document.getElementById('btnAutoScaleY');
      if (btn) {
        btn.classList.add('active');
        btn.title = 'Y轴自动缩放（已开启）';
      }
    };
    btnResetChart.addEventListener('click', handleResetChart);
    // 移动端触摸事件
    btnResetChart.addEventListener(
      'touchstart',
      () => {
        btnResetChart.style.transform = 'scale(0.95)';
      },
      { passive: true },
    );
    btnResetChart.addEventListener('touchend', (e) => {
      e.preventDefault();
      btnResetChart.style.transform = 'scale(1)';
      handleResetChart(e);
    });

    // 更新布局
    const updateLayout = () => {
      const sidebar = document.querySelector('.sidebar');
      const orderbook = document.getElementById('orderbookAside');
      const chartMain = document.querySelector('.chart-main');

      // 确保所有元素都存在
      if (!sidebar || !orderbook || !chartMain) return;

      const sidebarHidden = sidebar.classList.contains('hidden');
      const orderbookHidden = orderbook.classList.contains('hidden');

      // 强制设置各元素的样式
      sidebar.style.width = '220px';
      sidebar.style.minWidth = '220px';
      sidebar.style.maxWidth = '220px';
      sidebar.style.flexShrink = '0';
      sidebar.style.flexGrow = '0';

      orderbook.style.width = '220px';
      orderbook.style.minWidth = '220px';
      orderbook.style.maxWidth = '220px';
      orderbook.style.flexShrink = '0';
      orderbook.style.flexGrow = '0';

      // 控制侧边栏的显示
      if (sidebarHidden) {
        sidebar.style.display = 'none';
      } else {
        sidebar.style.display = 'flex';
      }

      // 控制盘口的显示
      if (orderbookHidden) {
        orderbook.style.display = 'none';
      } else {
        orderbook.style.display = 'flex';
      }
    };

    // 切换左侧交易对显示
    document.getElementById('btnToggleSidebar').addEventListener('click', () => {
      const sidebar = document.querySelector('.sidebar');
      const btn = document.getElementById('btnToggleSidebar');
      if (sidebar.classList.contains('hidden')) {
        sidebar.classList.remove('hidden');
        sidebar.style.display = 'flex';
        btn.title = '隐藏左侧交易对';
        btn.innerHTML =
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15,18 9,12 15,6" /></svg>';
      } else {
        sidebar.classList.add('hidden');
        sidebar.style.display = 'none';
        btn.title = '显示左侧交易对';
        btn.innerHTML =
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9,18 15,12 9,6" /></svg>';
      }
      updateLayout();
    });

    // 切换右侧盘口显示
    document.getElementById('btnToggleOrderbook').addEventListener('click', () => {
      const orderbook = document.getElementById('orderbookAside');
      const btn = document.getElementById('btnToggleOrderbook');
      if (orderbook.classList.contains('hidden')) {
        orderbook.classList.remove('hidden');
        orderbook.style.display = 'flex';
        btn.title = '隐藏右侧盘口';
        btn.innerHTML =
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9,18 15,12 9,6" /></svg>';
      } else {
        orderbook.classList.add('hidden');
        orderbook.style.display = 'none';
        btn.title = '显示右侧盘口';
        btn.innerHTML =
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15,18 9,12 15,6" /></svg>';
      }
      updateLayout();
    });

    // Y轴自动缩放切换
    const btnAutoScaleY = document.getElementById('btnAutoScaleY');
    const handleAutoScaleY = (e) => {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      const isAuto = this.renderer.toggleAutoScaleY();
      btnAutoScaleY.classList.toggle('active', isAuto);
      btnAutoScaleY.title = isAuto ? 'Y轴自动缩放（已开启）' : 'Y轴自动缩放（已关闭）';
    };
    btnAutoScaleY.addEventListener('click', handleAutoScaleY);
    // 移动端触摸事件
    btnAutoScaleY.addEventListener(
      'touchstart',
      () => {
        btnAutoScaleY.style.transform = 'scale(0.95)';
      },
      { passive: true },
    );
    btnAutoScaleY.addEventListener('touchend', (e) => {
      e.preventDefault();
      btnAutoScaleY.style.transform = 'scale(1)';
      handleAutoScaleY(e);
    });

    // 专注模式切换
    const btnFocusMode = document.getElementById('btnFocusMode');
    if (btnFocusMode) {
      const handleFocusMode = (e) => {
        if (e) {
          e.preventDefault();
          e.stopPropagation();
        }
        document.body.classList.toggle('focus-mode');
        const isFocusMode = document.body.classList.contains('focus-mode');
        btnFocusMode.classList.toggle('active', isFocusMode);
        btnFocusMode.title = isFocusMode ? '退出专注模式' : '专注模式';
        // 触发图表重新渲染以适应新布局
        setTimeout(() => {
          this.renderer.resize();
          this.renderer.renderAll();
        }, 50);
      };

      // 统一使用 pointerdown 事件处理，避免移动端点击和触摸冲突
      btnFocusMode.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        btnFocusMode.style.transform = 'scale(0.95)';
      });

      btnFocusMode.addEventListener('pointerup', (e) => {
        e.preventDefault();
        e.stopPropagation();
        btnFocusMode.style.transform = 'scale(1)';
        handleFocusMode(e);
      });

      // 防止 pointer 事件被取消
      btnFocusMode.addEventListener('pointercancel', () => {
        btnFocusMode.style.transform = 'scale(1)';
      });
    }

    // Sort buttons
    document.querySelectorAll('.sort-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.sort-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.sortMode = btn.dataset.sort;
        this._renderTickerList();
      });
    });

    // Search
    const searchInput = document.getElementById('searchInput');
    const searchDropdown = document.getElementById('searchDropdown');
    searchInput.addEventListener('input', () => {
      const q = searchInput.value.trim().toUpperCase();
      if (!q) {
        searchDropdown.classList.add('hidden');
        return;
      }
      const matches = this.allTickers
        .filter((t) => t.symbol.includes(q))
        .sort((a, b) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume))
        .slice(0, 10);
      if (!matches.length) {
        searchDropdown.classList.add('hidden');
        return;
      }
      searchDropdown.innerHTML = matches
        .map((t) => {
          const platformKey = t.platformKey || 'binance_spot';
          const badge = getSymbolBadge(t.symbol, platformKey);
          return `
        <div class="search-item" data-symbol="${t.symbol}" data-platform="${platformKey}">
          <span class="sym">${t.symbol.replace('USDT', '/USDT')} ${badge}</span>
          <span class="vol-label">Vol ${fmt(parseFloat(t.quoteVolume))}</span>
        </div>
      `;
        })
        .join('');
      searchDropdown.classList.remove('hidden');
      searchDropdown.querySelectorAll('.search-item').forEach((el) => {
        el.addEventListener('click', () => {
          this._selectSymbol(el.dataset.symbol, el.dataset.platform);
          searchInput.value = '';
          searchDropdown.classList.add('hidden');
        });
      });
    });

    document.addEventListener('click', (e) => {
      if (!e.target.closest('.search-box')) searchDropdown.classList.add('hidden');
    });

    // 随机交易对按钮
    const btnRandomSymbol = document.getElementById('btnRandomSymbol');
    if (btnRandomSymbol) {
      btnRandomSymbol.addEventListener('click', async () => {
        // 暂停播放
        if (this.reviewMode?.active && this.reviewMode.isPlaying) {
          this.reviewMode.playPause();
        }

        // 随机选择交易对
        const { symbol: randomSymbol, platformKey: randomPlatformKey } = this._getRandomSymbol();
        this.symbol = randomSymbol;
        this.symbolPlatform = randomPlatformKey;

        // 更新交易对显示
        const symbolNameEl = document.getElementById('symbolName');
        if (symbolNameEl) {
          symbolNameEl.innerHTML =
            randomSymbol.replace('USDT', '/USDT') + getSymbolBadge(randomSymbol, randomPlatformKey);
        }
        const obSymbolEl = document.getElementById('obSymbol');
        if (obSymbolEl) {
          obSymbolEl.textContent = randomSymbol;
        }

        // 随机选择日期（在交易对的有效时间范围内）
        const randomDate = await this._getRandomDate(randomSymbol, randomPlatformKey);
        document.getElementById('reviewDate').value = randomDate;

        // 随机选择周期
        const intervals = ['1m', '5m', '15m', '1h', '4h', '1d', '1w'];
        const randomInterval = intervals[Math.floor(Math.random() * intervals.length)];
        document.getElementById('reviewIntervalSelect').value = randomInterval;
        this.interval = randomInterval;

        // 同步工具栏显示
        document.querySelectorAll('.interval-btn').forEach((b) => {
          b.classList.toggle('active', b.dataset.interval === randomInterval);
        });

        // 加载数据
        if (this.reviewMode?.active) {
          this.reviewMode.loadData();
        }
      });
    }

    // 时间周期选择
    const reviewIntervalSelect = document.getElementById('reviewIntervalSelect');
    if (reviewIntervalSelect) {
      reviewIntervalSelect.addEventListener('change', () => {
        // 暂停播放
        if (this.reviewMode?.active && this.reviewMode.isPlaying) {
          this.reviewMode.playPause();
        }

        // 加载数据
        if (this.reviewMode?.active) {
          this.reviewMode.loadData();
        }
      });
    }

    // 日期选择
    const reviewDate = document.getElementById('reviewDate');
    if (reviewDate) {
      reviewDate.addEventListener('change', () => {
        // 暂停播放
        if (this.reviewMode?.active && this.reviewMode.isPlaying) {
          this.reviewMode.playPause();
        }

        // 加载数据
        if (this.reviewMode?.active) {
          this.reviewMode.loadData();
        }
      });
    }
  }
}

/* ============================================================
   ⑥ Bootstrap
   ============================================================ */
window.addEventListener('DOMContentLoaded', () => {
  window._app = new App();
});
