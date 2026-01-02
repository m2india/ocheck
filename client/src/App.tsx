import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { calculateAISentiment } from './utils/AITradingStrategy';
import OptionChainTable from './OptionChainTable';
// import SimpleOptionChainTable from './SimpleOptionChainTable';
import MarketSentiment from './MarketSentiment2';
import PredictionChart from './PredictionChart';

import SelectionStrategy from './SelectionStrategy';
import IntradayChart from './IntradayChart';
import QuoteAnalysisWidget from './QuoteAnalysisWidget';
import LiveQuote from './LiveQuote';


import { SCRIPS } from './constants/scrips';
import { useDhanSocket } from './hooks/useDhanSocket';
import './App.css';
import { BASE_URL } from './config';

interface OptionChainData {
  [key: string]: any;
}

const getNextExpiry = (scripName: string = 'NIFTY') => {
  const d = new Date();
  const currentDay = d.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat

  // Default to Thursday (NIFTY, BANKNIFTY)
  let targetDay = 4;

  if (['SENSEX', 'BANKEX'].includes(scripName)) {
    targetDay = 5; // Friday
  } else if (['FINNIFTY'].includes(scripName)) {
    targetDay = 2; // Tuesday
  } else if (['MIDCPNIFTY'].includes(scripName)) {
    targetDay = 1; // Monday
  }

  // Calculate days until next target day. 
  let daysToAdd = (targetDay - currentDay + 7) % 7;
  // If today is the expiry day, we usually want today. 
  // If market is closed (e.g. late evening), logic might need adjustment, but for now allow Today.

  d.setDate(d.getDate() + daysToAdd);
  const dateStr = d.toISOString().split('T')[0];

  // Handle New Year Holiday (NIFTY/BANKNIFTY Expiry adjustment)
  if (dateStr === '2026-01-01') return '2025-12-31';

  return dateStr;
};

function App() {
  // Persistence Initialization
  const [selectedScrip, setSelectedScrip] = useState<any>(SCRIPS[2]);

  const [expiryDate, setExpiryDate] = useState('2026-01-22');

  const [selectedStrikes, setSelectedStrikes] = useState<{ strike: number, side: 'CE' | 'PE', entryPrice?: number }[]>(() => {
    // Persist selected strikes on refresh
    try {
      const saved = localStorage.getItem('savedSelectedStrikes');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });

  // Persist selected strikes whenever they change
  useEffect(() => {
    localStorage.setItem('savedSelectedStrikes', JSON.stringify(selectedStrikes));
  }, [selectedStrikes]);

  const [dataMode, setDataMode] = useState<'online' | 'offline'>('online');
  const [data, setData] = useState<OptionChainData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(false);

  const [isAutoRefresh] = useState(() => {
    const saved = localStorage.getItem('savedAutoRefresh');
    return saved !== null ? JSON.parse(saved) : true;
  });

  const [isDarkMode, setIsDarkMode] = useState(() => {
    const saved = localStorage.getItem('savedDarkMode');
    return saved !== null ? JSON.parse(saved) : true;
  });

  const [showCharts, setShowCharts] = useState(() => {
    const saved = localStorage.getItem('savedShowCharts');
    return saved !== null ? JSON.parse(saved) : false;
  });

  const [isCompact, setIsCompact] = useState(() => {
    const saved = localStorage.getItem('savedCompact');
    return saved !== null ? JSON.parse(saved) : false;
  });



  const [lastRequest, setLastRequest] = useState<string>('');
  const [viewMode, setViewMode] = useState<'all' | 'analysis'>(() => {
    const saved = localStorage.getItem('savedViewMode');
    return (saved as any) || 'all';
  });

  // Persistence Effects
  useEffect(() => { localStorage.setItem('savedScrip', JSON.stringify(selectedScrip)); }, [selectedScrip]);
  useEffect(() => { localStorage.setItem('savedExpiry', expiryDate); }, [expiryDate]);
  useEffect(() => { localStorage.setItem('savedAutoRefresh', JSON.stringify(isAutoRefresh)); }, [isAutoRefresh]);
  useEffect(() => { localStorage.setItem('savedDarkMode', JSON.stringify(isDarkMode)); }, [isDarkMode]);
  useEffect(() => { localStorage.setItem('savedShowCharts', JSON.stringify(showCharts)); }, [showCharts]);
  useEffect(() => { localStorage.setItem('savedCompact', JSON.stringify(isCompact)); }, [isCompact]);
  useEffect(() => { localStorage.setItem('savedViewMode', viewMode); }, [viewMode]);
  const [quoteData, setQuoteData] = useState<any>(null);
  const isFetching = useRef(false);

  const { latestData, setLatestData, latestChain, setLatestChain, subscribe, isConnected, reconnect } = useDhanSocket();

  // Initialize ref with current state to prevent immediate reset on load
  const prevContextRef = useRef<string>(selectedScrip ? `${selectedScrip.id}_${expiryDate}` : '');

  // Reset all states and clear socket buffers when context changes
  useEffect(() => {
    if (!selectedScrip) {
      setData(null);
      setQuoteData(null);
      setLatestChain(null);
      setLatestData({});
      setSelectedStrikes([]);
      prevContextRef.current = '';
      return;
    }
    const currentContext = `${selectedScrip.id}_${expiryDate}`;
    if (prevContextRef.current !== currentContext) {
      console.log("React: Context changed, resetting ephemeral state only:", currentContext);
      // setData(null); // Keep previous data for smooth transition
      setQuoteData(null);
      setLatestChain(null);
      setLatestData({});
      // Reset selectedStrikes ONLY if scrip ID changed significantly (not just a refresh)
      // Since we now persist selectedStrikes in localStorage, we should respect that on load.
      // We only clear if the USER explicitly changed the scrip in the UI.
      if (prevContextRef.current && prevContextRef.current.split('_')[0] !== selectedScrip.id.toString()) {
        setSelectedStrikes([]);
      }
      prevContextRef.current = currentContext;
    }
  }, [selectedScrip?.id, expiryDate, setLatestChain, setLatestData]);

  // Load initial selections from today's server logs
  // Load initial selections from today's server logs
  useEffect(() => {
    if (dataMode === 'offline') return;

    // Get locally removed items (blacklist)
    const removedRaw = localStorage.getItem('removedStrikes');
    const removedSet = new Set(removedRaw ? JSON.parse(removedRaw) : []);

    fetch(`${BASE_URL}/get-selections`)
      .then(res => res.json())
      .then(result => {
        if (result.success && Array.isArray(result.data) && result.data.length > 0) {
          // Get unique strikes by strike+side to avoid duplicates
          const uniqueStrikesMap = new Map();
          result.data.forEach((entry: any) => {
            const key = `${entry.strike}_${entry.side}`;

            // SKIP if user manually removed this before
            if (removedSet.has(key)) return;

            uniqueStrikesMap.set(key, {
              strike: entry.strike,
              side: entry.side,
              entryPrice: entry.entry || entry.price
            });
          });

          const loadedStrikes = Array.from(uniqueStrikesMap.values());
          console.log("React: Loading previous selections from server:", loadedStrikes.length);
          if (loadedStrikes.length > 0) {
            setSelectedStrikes(loadedStrikes);
          }
        }
      })
      .catch(err => console.error("Error fetching stored selections:", err));
  }, [BASE_URL, dataMode]);


  const isNaturalGasAnomaly = useCallback((ltp: number, current: number) => {
    if (selectedScrip?.name !== 'NATURALGAS') return false;
    if (ltp === 0) return false;
    // Specifically block the persistent 392.20 anomaly (Hard Block)
    // This value appears to be a stale or incorrect feed artifact for Natural Gas
    if (Math.abs(ltp - 392.2) < 1.0) {
      // console.warn("Blocking known bad value for Natural Gas:", ltp);
      return true;
    }

    // General extreme jump check (>20% to be safer against volatility)
    if (current > 0 && Math.abs(ltp - current) / current > 0.2) {
      return true;
    }
    return false;
  }, [selectedScrip?.name]);

  // Helper: Merge live WebSocket data into the Option Chain state
  const applyLiveFeedToChain = useCallback((prev: any, currentLatestData: any) => {
    // Detect structure: prev.oc (flat) or prev.data.oc (nested)
    const prevOc = prev?.oc || prev?.data?.oc;

    if (!prevOc || Object.keys(currentLatestData).length === 0) return prev;

    const newOc = { ...prevOc };
    let newUnderlyingPrice = prev.underlyingPrice;
    let newUnderlyingChange = prev.underlyingChange;
    let newUnderlyingChangePct = prev.underlyingChangePct;
    let hasChanges = false;

    Object.entries(currentLatestData).forEach(([secIdStr, update]: [string, any]) => {
      const secId = parseInt(secIdStr, 10);

      // Update underlying price and calculate changes
      // Flexible comparison for underlying ID
      const currentUnderlyingId = prev.underlying_id || prev.data?.underlying_id || selectedScrip?.id;
      if (currentUnderlyingId && (secId == currentUnderlyingId) && update.ltp) {
        const ltpVal = update.ltp;

        // STRICT SANITY CHECK for Natural Gas
        if (isNaturalGasAnomaly(ltpVal, prev.underlyingPrice || 0)) {
          console.warn(`[Sanity-WS] BLOCKING Natural Gas suspicious update to ${ltpVal} (Current: ${prev.underlyingPrice})`);
          return;
        }

        const prevClose = prev.underlyingPrevClose || (prev.underlyingPrice - (prev.underlyingChange || 0));

        newUnderlyingPrice = ltpVal;
        newUnderlyingChange = ltpVal - prevClose;
        newUnderlyingChangePct = prevClose !== 0 ? (newUnderlyingChange / prevClose) * 100 : 0;

        hasChanges = true;
      }

      // Search through strikes to find matching security ID
      Object.keys(newOc).forEach(strike => {
        const strikeData = newOc[strike];

        // Flexible comparison for Option Security IDs (String vs Number)
        if (strikeData.ce?.security_id && (strikeData.ce.security_id == secId)) {
          const prevPrice = strikeData.ce.previousPrice || strikeData.ce.previous_price || (strikeData.ce.lastPrice - (strikeData.ce.change || 0));
          newOc[strike] = {
            ...newOc[strike],
            ce: {
              ...strikeData.ce,
              last_price: update.ltp ?? strikeData.ce.last_price,
              lastPrice: update.ltp ?? strikeData.ce.lastPrice,
              changePct: (update.ltp && prevPrice)
                ? ((update.ltp - prevPrice) / prevPrice) * 100
                : strikeData.ce.changePct,
              oi: update.oi ?? strikeData.ce.oi,
              openInterest: update.oi ?? strikeData.ce.openInterest,
              volume: update.volume ?? strikeData.ce.volume,
              previousPrice: prevPrice // Persist or set it
            }
          };
          hasChanges = true;
        }

        if (strikeData.pe?.security_id && (strikeData.pe.security_id == secId)) {
          const prevPrice = strikeData.pe.previousPrice || strikeData.pe.previous_price || (strikeData.pe.lastPrice - (strikeData.pe.change || 0));
          newOc[strike] = {
            ...newOc[strike],
            pe: {
              ...strikeData.pe,
              last_price: update.ltp ?? strikeData.pe.last_price,
              lastPrice: update.ltp ?? strikeData.pe.lastPrice,
              changePct: (update.ltp && prevPrice)
                ? ((update.ltp - prevPrice) / prevPrice) * 100
                : strikeData.pe.changePct,
              oi: update.oi ?? strikeData.pe.oi,
              openInterest: update.oi ?? strikeData.pe.openInterest,
              volume: update.volume ?? strikeData.pe.volume,
              previousPrice: prevPrice // Persist or set it
            }
          };
          hasChanges = true;
        }
      });
    });

    // Console log to debug how many updates were applied
    // if (hasChanges) console.log("React: applyLiveFeedToChain applied updates.", { updates: Object.keys(currentLatestData).length });

    // ALSO sync to quoteData state if the update is for the main selected scrip
    if (selectedScrip) {
      const update = currentLatestData[selectedScrip.id.toString()] || currentLatestData[selectedScrip.id];
      if (update) {
        setQuoteData((prevQuote: any) => {
          if (!prevQuote) return prevQuote;
          const currentQPrice = prevQuote.last_price || prevQuote.ltp || 0;
          if (update.ltp && isNaturalGasAnomaly(update.ltp, currentQPrice)) {
            return prevQuote;
          }

          const hasPriceChange = update.ltp && update.ltp !== (prevQuote.last_price || prevQuote.ltp);
          const hasVolumeChange = update.volume && update.volume !== (prevQuote.volume || prevQuote.v);
          const hasOIChange = update.oi && update.oi !== (prevQuote.oi || prevQuote.open_interest);

          if (!hasPriceChange && !hasVolumeChange && !hasOIChange) return prevQuote;

          return {
            ...prevQuote,
            last_price: update.ltp ?? prevQuote.last_price ?? prevQuote.ltp,
            ltp: update.ltp ?? prevQuote.ltp,
            volume: update.volume ?? prevQuote.volume ?? prevQuote.v,
            v: update.volume ?? prevQuote.v,
            oi: update.oi ?? prevQuote.oi ?? prevQuote.open_interest,
            open_interest: update.oi ?? prevQuote.open_interest
          };
        });
      }
    }

    if (!hasChanges) return prev;

    return {
      ...prev,
      underlyingPrice: newUnderlyingPrice,
      underlyingChange: newUnderlyingChange,
      underlyingChangePct: newUnderlyingChangePct,
      underlyingPrevClose: prev.underlyingPrevClose || (newUnderlyingPrice - newUnderlyingChange),
      data: {
        ...prev.data,
        oc: newOc,
        last_price: newUnderlyingPrice
      }
    };
  }, [selectedScrip?.id]);

  // Handle full chain updates from backend polling
  useEffect(() => {
    if (latestChain && selectedScrip) {
      // Staleness check: Ensure incoming chain matches current selection
      const incomingId = latestChain.underlying_id || latestChain.underlying || '';
      const incomingExpiry = latestChain.expiryDate || '';
      const targetId = selectedScrip?.id?.toString();
      const targetOccId = selectedScrip?.occId?.toString();
      const currentId = incomingId.toString();

      if ((currentId !== targetId && currentId !== targetOccId) ||
        (incomingExpiry && incomingExpiry !== expiryDate)) {
        console.warn("React: Ignoring stale chain update for", incomingId, incomingExpiry);
        return;
      }

      console.log("React: Received full chain update. Merging with latest live data...");
      const prevClose = latestChain.underlyingPrevClose || (latestChain.underlyingPrice - (latestChain.underlyingChange || 0));
      const freshChain = {
        ...latestChain,
        underlyingPrevClose: prevClose
      };

      // Merge live data immediately onto the fresh chain
      setData(() => {
        // If we have existing data, we might want to prioritize its structure if needed, 
        // but 'freshChain' is the authority on structure, so we apply 'latestData' ON TOP of 'freshChain'.
        return applyLiveFeedToChain(freshChain, latestData);
      });

    }
  }, [latestChain, selectedScrip?.id, selectedScrip?.name, expiryDate, applyLiveFeedToChain, latestData]);

  // Handle real-time updates from WebSocket
  useEffect(() => {
    if (!data || Object.keys(latestData).length === 0) return;
    setData(prev => applyLiveFeedToChain(prev, latestData));
  }, [latestData, applyLiveFeedToChain]);

  const subscribedIdsRef = useRef<string>('');

  // Manage instrument subscriptions
  useEffect(() => {
    if (!data || !isConnected || dataMode === 'offline' || !selectedScrip) return;

    const instruments: { ExchangeSegment: string; SecurityId: string }[] = [];

    // Add underlying with specific mapping for BSE/NSE Indices
    let underlyingSeg = selectedScrip?.segment;
    if (selectedScrip?.segment === 'IDX_I') {
      underlyingSeg = selectedScrip?.name === 'SENSEX' ? 'BSE_IDX' : 'NSE_IDX';
    }

    // Dynamic Underlying ID lookup. Prefer the primary scrip id (used for quotes/spot)
    const underlyingId = selectedScrip?.id || data.data?.underlying_id || data.data?.underlying_scrip_id;

    instruments.push({
      ExchangeSegment: underlyingSeg,
      SecurityId: underlyingId.toString()
    });

    // Add all options
    const oc = data.data?.oc;
    if (oc) {
      Object.keys(oc).forEach(strike => {
        const strikeData = oc[strike];
        let optionSeg = 'NSE_FNO';
        if (selectedScrip?.segment === 'MCX_COMM') {
          optionSeg = 'MCX_COMM';
        } else if (selectedScrip?.name === 'SENSEX') {
          optionSeg = 'BSE_FNO';
        }

        if (strikeData.ce?.security_id) {
          instruments.push({ ExchangeSegment: optionSeg, SecurityId: strikeData.ce.security_id.toString() });
        }
        if (strikeData.pe?.security_id) {
          instruments.push({ ExchangeSegment: optionSeg, SecurityId: strikeData.pe.security_id.toString() });
        }
      });
    }

    if (instruments.length > 0) {
      const pollParams = {
        UnderlyingScrip: selectedScrip?.occId || selectedScrip?.id,
        UnderlyingSeg: selectedScrip?.segment,
        Expiry: expiryDate
      };

      // Avoid redundant subscriptions if nothing changed
      const currentIdsHash = JSON.stringify({ instruments, pollParams });
      if (subscribedIdsRef.current !== currentIdsHash) {
        console.log("React: Subscribing & starting poll for", instruments.length, "instruments");
        console.log("React: Sample Instrument:", instruments[0]); // Log the first one to check format
        subscribe({ instruments, pollParams });
        subscribedIdsRef.current = currentIdsHash;
      }
    }
  }, [data?.data?.oc, isConnected, subscribe, selectedScrip?.id, selectedScrip?.segment, dataMode, expiryDate]);

  // Keep a ref of latestData to merge inside fetchData without triggering re-renders/interval resets
  const latestDataRef = useRef(latestData);
  useEffect(() => {
    latestDataRef.current = latestData;
  }, [latestData]);

  const fetchData = useCallback(async (isBackground = false) => {
    if (!selectedScrip || !expiryDate) {
      console.log("React: Skipping fetch - Symbol or Expiry missing");
      return;
    }

    if (dataMode === 'offline') {
      if (!isBackground) setLoading(true);
      setTimeout(() => {
        import('./constants/dummyData').then(({ SAMPLE_DATA_USER }) => {
          setData(SAMPLE_DATA_USER as any);
          setIsOffline(true);
          setLoading(false);
          setLastRequest(`Showing User Sample Data (Offline Mode) | ${new Date().toLocaleTimeString()}`);
        });
      }, 300);
      return;
    }

    if (isFetching.current) {
      console.log("React: Fetch already in progress, skipping...");
      return;
    }

    if (!isBackground) setLoading(true);
    setError(null);
    isFetching.current = true;
    const payload = {
      UnderlyingScrip: selectedScrip?.occId || selectedScrip?.id,
      UnderlyingSeg: selectedScrip?.segment,
      Expiry: expiryDate
    };

    const logMsg = `Last request: ${new Date().toLocaleTimeString()} | Payload: ${JSON.stringify(payload)}`;
    setLastRequest(logMsg);
    // console.log("React: fetchTable triggered", payload);

    const contextAtStart = `${selectedScrip?.id}_${expiryDate}`;

    try {
      const response = await fetch(`${BASE_URL}/option-chain`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      // Context safety check
      const contextNow = `${selectedScrip?.id}_${expiryDate}`;
      if (contextNow !== contextAtStart) {
        console.warn("React: Ignoring response from previous context", contextAtStart);
        isFetching.current = false;
        return;
      }

      if (response.status === 204) {
        console.warn("React: API returned 204 No Content. Ignoring update. Current Data:", data ? "Exists" : "Null");
        isFetching.current = false;
        if (!isBackground) setLoading(false);
        return;
      }

      if (!response.ok) {
        const errText = await response.text();
        console.error(`React: API Error ${response.status}: ${errText}`);
        throw new Error(`Option Chain API Error ${response.status}: ${errText}`);
      }

      const marketData = await response.json();
      console.log("React: Data received. OC Keys:", marketData?.oc ? Object.keys(marketData.oc).length : 'Missing');

      // Guard: If background update (auto-refresh) and data is empty/invalid, DO NOT wipe existing data
      if (isBackground && (!marketData || !marketData.oc || Object.keys(marketData.oc).length === 0)) {
        console.warn("React: Background fetch returned empty/invalid data. Ignoring to preserve UI stability.");
        isFetching.current = false;
        setLoading(false);
        return;
      }

      const prevClose = marketData.underlyingPrevClose || (marketData.underlyingPrice - (marketData.underlyingChange || 0));

      const freshData = {
        ...marketData,
        underlyingPrevClose: prevClose,
        expiryDate: marketData.expiryDate || expiryDate
      };

      // STRICT SANITY CHECK for Natural Gas
      if (isNaturalGasAnomaly(marketData.underlyingPrice || 0, data?.underlyingPrice || 0)) {
        console.warn(`[Sanity-OC] BLOCKING Natural Gas suspicious fetch to ${marketData.underlyingPrice}`);
        isFetching.current = false;
        if (!isBackground) setLoading(false);
        return;
      }

      // User Request: Do NOT merge static data with live data.
      // Use purely the API snapshot for 'data', and let components overlay 'latestData'.
      // Only update if data actually changed significantly or it's first load
      setData((prev: any) => {
        if (!prev) return freshData;
        // Deep check on underlying price and change? 
        // For now, update always but ensure it's vetted.
        return freshData;
      });
      setLastUpdated(new Date().toLocaleTimeString());
      setIsOffline(false);
      setLoading(false);
      isFetching.current = false;
    } catch (err: any) {
      console.error("React: Market data fetch failed.", err);
      // Only show error toast if it's NOT a background refresh, to avoid annoyance
      if (!isBackground) setError("Market data unavailable");
      isFetching.current = false;
      setLoading(false);
    }
  }, [expiryDate, selectedScrip?.id, dataMode, applyLiveFeedToChain]);

  // Auto-refresh logic (kept as fallback or for fields not in WS)
  const [lastUpdated, setLastUpdated] = useState<string>('');

  const fetchCurrentMarketData = useCallback(async () => {
    if (!selectedScrip) return;
    const id = selectedScrip.id;
    const contextAtStart = `${id}_${expiryDate}`;

    try {
      const seg = selectedScrip.segment;

      const payload = { [seg]: [id] };

      const response = await fetch(`${BASE_URL}/quote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const contextNow = `${id}_${expiryDate}`;
      if (contextNow !== contextAtStart) {
        return;
      }

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Quote API Error ${response.status}: ${errText}`);
      }

      const result = await response.json();
      const responseData = result.data || result;

      let item = null;
      const targetIdStr = id.toString();

      // Recursive search function to find the object containing security_id or matching the key
      const findItem = (obj: any): any => {
        if (!obj || typeof obj !== 'object') return null;

        // If it's the target item itself
        if ((obj.security_id || obj.SecurityId || obj.s || obj.si)?.toString() === targetIdStr) {
          return obj;
        }

        // If it's a map containing the ID as a key
        if (obj[targetIdStr]) return obj[targetIdStr];
        if (obj[id]) return obj[id];

        // Search deeper
        for (const key in obj) {
          if (Object.prototype.hasOwnProperty.call(obj, key)) {
            const result = findItem(obj[key]);
            if (result) return result;
          }
        }
        return null;
      };

      item = findItem(responseData);

      if (item) {
        // SANITY CHECK for Natural Gas
        const currentLtp = item.last_price || item.lastPrice || item.ltp || (typeof item === 'number' ? item : 0);
        const existingQPrice = quoteData ? (quoteData.last_price || quoteData.ltp || 0) : 0;
        if (isNaturalGasAnomaly(currentLtp, existingQPrice)) {
          console.warn(`[Sanity-Quote] BLOCKING Natural Gas suspicious quote update to ${currentLtp}`);
          return;
        }

        console.log(`React: Successfully extracted quote for ${selectedScrip.name}:`, JSON.stringify(item).substring(0, 100) + '...');
        setQuoteData(item);

        // Update main data underlying price for ATM centering
        if (currentLtp) {
          setData((prev: any) => {
            if (!prev) return prev;

            // SANITY CHECK for Natural Gas
            if (isNaturalGasAnomaly(currentLtp, prev.underlyingPrice || 0)) {
              console.warn(`[Sanity-SetData] BLOCKING NG suspicious update to ${currentLtp} (Current: ${prev.underlyingPrice})`);
              return prev;
            }

            const prevClose = prev.underlyingPrevClose || (prev.underlyingPrice - (prev.underlyingChange || 0));
            return {
              ...prev,
              underlyingPrice: currentLtp,
              underlyingChange: currentLtp - prevClose,
              underlyingChangePct: prevClose !== 0 ? ((currentLtp - prevClose) / prevClose) * 100 : 0
            };
          });
        }
      }
      else {
        console.warn(`React: Could not find ${selectedScrip.name} (${id}) in response. Available Keys:`, Object.keys(responseData));
      }
    } catch (err) {
      console.error("Market data poll failed:", err);
    }
  }, [selectedScrip]);

  useEffect(() => {
    fetchData();
    if (selectedScrip) {
      fetchCurrentMarketData(); // Immediate fetch on scrip change
    }
    // Note: Auto-refresh data fetching is handled in the separate interval effect below
  }, [fetchData, fetchCurrentMarketData, selectedScrip]); // Removed isAutoRefresh dependency to avoid double-triggering

  // Single Master Auto-Refresh Interval
  useEffect(() => {
    let interval: any;
    if (isAutoRefresh && dataMode === 'online' && selectedScrip) {
      // If WebSocket is connected, we don't need manual polling every 2s.
      // We'll set a longer fallback interval (15s) for full structure sync.
      const syncInterval = isConnected ? 15000 : 3500;
      console.log(`React: Auto-Refresh Timer Started (${syncInterval}ms) - WS: ${isConnected}`);

      interval = setInterval(async () => {
        // Fetch Chain FIRST, then Quote to ensure sequence and sync
        await fetchData(true);
        await fetchCurrentMarketData();
      }, syncInterval);
    }
    return () => clearInterval(interval);
  }, [isAutoRefresh, fetchData, fetchCurrentMarketData, dataMode, selectedScrip, isConnected]);

  useEffect(() => {
    if (isDarkMode) {
      document.body.classList.add('dark');
    } else {
      document.body.classList.remove('dark');
    }
  }, [isDarkMode]);

  // Ensure expiry date updates or resets when scrip changes
  useEffect(() => {
    if (!selectedScrip) return;
    if (selectedScrip.name === 'NATURALGAS') {
      setExpiryDate('2026-01-22');
    } else {
      // Avoid resetting if we already have a valid date (prevents jumpiness)
      // but ensure index expiries are recalculated if scrip changes
      setExpiryDate(getNextExpiry(selectedScrip.name));
    }
  }, [selectedScrip?.id]);

  // Sanitize Expiry for Holiday (Hotfix for persisted local storage)
  useEffect(() => {
    if (expiryDate === '2026-01-01') {
      console.log("React: Correcting Holiday Expiry to 2025-12-31");
      setExpiryDate('2025-12-31');
    }
  }, [expiryDate]);

  const aiAnalysis = useMemo(() => {
    if (!data) return null;
    const underlyingPrice = data.underlyingPrice || data.data?.last_price || data.underlyingValue || 0;
    const ocData = data.oc || data.data?.oc || data.data?.options || {};
    if (underlyingPrice === 0 || Object.keys(ocData).length === 0) return null;

    let processedStrikes: any[] = [];
    if (Array.isArray(ocData)) {
      processedStrikes = ocData.map(s => {
        const ce = s.ce || {};
        const pe = s.pe || {};
        const ceLtp = ce.lastPrice || ce.last_price || 0;
        const peLtp = pe.lastPrice || pe.last_price || 0;

        // Robust Previous Price Calculation
        const derivePrev = (ltp: number, obj: any) => {
          if (obj.previousPrice || obj.prev_close) return obj.previousPrice || obj.prev_close;
          if (obj.change || obj.netChange) return ltp - (obj.change || obj.netChange);
          const pct = obj.changePct || obj.pChange;
          if (pct && ltp) return ltp / (1 + (pct / 100));
          return ltp;
        };

        const cePrev = derivePrev(ceLtp, ce);
        const pePrev = derivePrev(peLtp, pe);

        return {
          strike: parseFloat(s.strike_price || s.strikePrice || s.StrikePrice || 0),
          callOI: ce.oi || ce.openInterest || 0,
          putOI: pe.oi || pe.openInterest || 0,
          callVolume: ce.volume || 0,
          putVolume: pe.volume || 0,
          callOIChg: ce.changeinOpenInterest || ce.chnInOi || 0,
          putOIChg: pe.changeinOpenInterest || pe.chnInOi || 0,
          callLTP: ceLtp,
          putLTP: peLtp,
          callPrev: cePrev,
          putPrev: pePrev,
          callAsk: ce.ask || ce.askPrice || ceLtp,
          callBid: ce.bid || ce.bidPrice || ceLtp,
          putAsk: pe.ask || pe.askPrice || peLtp,
          putBid: pe.bid || pe.bidPrice || peLtp,
          callGamma: ce.gamma || ce.greeks?.gamma || 0,
          putGamma: pe.gamma || pe.greeks?.gamma || 0,
        };
      });
    } else {
      processedStrikes = Object.keys(ocData).map(k => {
        const s = ocData[k];
        const ce = s.ce || {};
        const pe = s.pe || {};
        const ceLtp = ce.lastPrice || ce.last_price || 0;
        const peLtp = pe.lastPrice || pe.last_price || 0;

        // Robust Previous Price Calculation
        const derivePrev = (ltp: number, obj: any) => {
          if (obj.previousPrice || obj.prev_close) return obj.previousPrice || obj.prev_close;
          if (obj.change || obj.netChange) return ltp - (obj.change || obj.netChange);
          const pct = obj.changePct || obj.pChange;
          if (pct && ltp) return ltp / (1 + (pct / 100));
          return ltp;
        };

        const cePrev = derivePrev(ceLtp, ce);
        const pePrev = derivePrev(peLtp, pe);

        return {
          strike: parseFloat(k),
          callOI: ce.oi || ce.openInterest || 0,
          putOI: pe.oi || pe.openInterest || 0,
          callVolume: ce.volume || 0,
          putVolume: pe.volume || 0,
          callOIChg: ce.changeinOpenInterest || ce.chnInOi || 0,
          putOIChg: pe.changeinOpenInterest || pe.chnInOi || 0,
          callLTP: ceLtp,
          putLTP: peLtp,
          callPrev: cePrev,
          putPrev: pePrev,
          callAsk: ce.ask || ce.askPrice || ceLtp,
          callBid: ce.bid || ce.bidPrice || ceLtp,
          putAsk: pe.ask || pe.askPrice || peLtp,
          putBid: pe.bid || pe.bidPrice || peLtp,
          callGamma: ce.gamma || ce.greeks?.gamma || 0,
          putGamma: pe.gamma || pe.greeks?.gamma || 0,
        };
      });
    }

    const result = calculateAISentiment(processedStrikes, selectedScrip?.name || 'COMMON', data.expiryDate || '', Date.now(), underlyingPrice);

    // Debugging AI Output
    if (result) {
      console.log(`[AI Debug] ${selectedScrip?.name} Sentiment: ${result.sentiment}`);
      console.log(`[AI Debug] Bullish Recs: ${result.bullishRecs.length}, Bearish Recs: ${result.bearishRecs.length}`);
      if (processedStrikes.length > 0) {
        const s = processedStrikes.find(x => Math.abs(x.strike - underlyingPrice) < 500) || processedStrikes[0];
        console.log(`[AI Debug] Sample Strike ${s.strike}: CallLTP=${s.callLTP}, CallPrev=${s.callPrev}, CallOIChg=${s.callOIChg}`);
      }
    }
    return result;
  }, [data, selectedScrip?.name]);

  // Handle visibility change (tab back in focus / computer wakeup)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        console.log("React: Tab visible - Triggering refresh in 1.5s...");

        // Debounce the refresh to allow network to stabilize after unlock/wake
        setTimeout(() => {
          console.log("React: Executing wake-up refresh...");
          // Force an immediate refresh of data
          fetchData(true);
          fetchCurrentMarketData();

          // If not connected, force a reconnect
          if (!isConnected) {
            reconnect();
          } else {
            // If connected, ensure our subscriptions are still active by clearing the ref
            // and letting the next useEffect loop handle it
            subscribedIdsRef.current = '';
          }
        }, 1500);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [fetchData, fetchCurrentMarketData, isConnected, reconnect]);

  const handleScripChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const scripId = parseInt(e.target.value, 10);
    if (!e.target.value) {
      setSelectedScrip(null);
      setData(null);
      setQuoteData(null);
      return;
    }
    const scrip = SCRIPS.find((s) => s.id === scripId);
    if (scrip) {
      // Clear data immediately when changing symbol to prevent UI ghosting
      setData(null);
      setQuoteData(null);
      setLatestChain(null);
      setLatestData({});
      setSelectedStrikes([]);
      setSelectedScrip(scrip);

      // Automated Expiry logic
      if (scrip.name === 'NATURALGAS') {
        setExpiryDate('2026-01-22');
      } else {
        setExpiryDate(getNextExpiry(scrip.name));
      }
    }
  };

  const isValid = !!selectedScrip && !!expiryDate;

  return (
    <div className={`page ${isCompact ? 'compact' : ''}`}>
      <div className="header-row">
        <h1>
          Option Chain <span className={`connection-status ${isConnected ? 'online' : 'offline'}`}></span>
        </h1>



        <div className="header-actions" style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <div className="mode-selector">
            <label className={`mode-btn ${dataMode === 'online' ? 'active' : ''}`} htmlFor="mode-online">
              <input
                id="mode-online"
                type="radio"
                name="dataMode"
                value="online"
                checked={dataMode === 'online'}
                onChange={() => setDataMode('online')}
              />
              <span>Online</span>
            </label>
            <label className={`mode-btn ${dataMode === 'offline' ? 'active' : ''}`} htmlFor="mode-offline">
              <input
                id="mode-offline"
                type="radio"
                name="dataMode"
                value="offline"
                checked={dataMode === 'offline'}
                onChange={() => setDataMode('offline')}
              />
              <span>Offline</span>
            </label>
          </div>

          <div className="view-mode-selector" style={{ display: 'flex', gap: '5px', background: 'rgba(255,255,255,0.05)', padding: '4px', borderRadius: '8px' }}>
            <button
              className={`view-btn ${viewMode === 'all' ? 'active' : ''}`}
              onClick={() => setViewMode('all')}
              style={{ padding: '6px 12px', fontSize: '12px', borderRadius: '6px', border: 'none', cursor: 'pointer', background: viewMode === 'all' ? '#0d47a1' : 'transparent', color: '#fff' }}
            >
              <i className="fa fa-th-large" style={{ marginRight: '6px' }}></i> All Data
            </button>
            <button
              className={`view-btn ${viewMode === 'analysis' ? 'active' : ''}`}
              onClick={() => setViewMode('analysis')}
              style={{ padding: '6px 12px', fontSize: '12px', borderRadius: '6px', border: 'none', cursor: 'pointer', background: viewMode === 'analysis' ? '#0d47a1' : 'transparent', color: '#fff' }}
            >
              <i className="fa fa-chart-line" style={{ marginRight: '6px' }}></i> Analysis View
            </button>
          </div>
        </div>
      </div>

      {
        lastRequest && (
          <div className="payload-status">
            {lastRequest}
          </div>
        )
      }

      <div className="card" style={{ position: 'relative' }}>
        {/* Top Right Floating Price Widget */}
        {selectedScrip && data && (
          <div className="app-corner-widget">
            <div className="widget-label">{selectedScrip.name}</div>
            <div className="widget-price">
              <span className="val">{data.underlyingPrice?.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
              <span className={`chg ${data.underlyingChange >= 0 ? 'text-green' : 'text-red'}`}>
                {data.underlyingChange > 0 ? '+' : ''}{data.underlyingChange?.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                ({data.underlyingChangePct?.toFixed(2)}%)
              </span>
            </div>
          </div>
        )}
        <div className="form-row single-line">
          <div className="field-item">
            <label htmlFor="symbol-select">Symbol</label>
            <select id="symbol-select" value={selectedScrip?.id || ''} onChange={handleScripChange} disabled={dataMode === 'offline'}>
              <option value="" disabled>Select Symbol</option>
              {SCRIPS.map((scrip) => (
                <option key={scrip.id} value={scrip.id}>
                  {scrip.name}
                </option>
              ))}
            </select>
          </div>

          <div className="field-item">
            <label htmlFor="expiry-input">Expiry</label>
            <div className="input-with-icon">
              <input
                id="expiry-input"
                type="date"
                value={expiryDate}
                onChange={(e) => setExpiryDate(e.target.value)}
                disabled={dataMode === 'offline' || selectedScrip?.name === 'NATURALGAS'}
              />
            </div>
          </div>

          <div className="actions-inline">
            {lastUpdated && <span style={{ fontSize: '11px', color: '#888', marginRight: '8px' }}>Updated: {lastUpdated}</span>}

            <div className="auto-refresh-label" style={{ marginRight: '12px', opacity: 0.8 }}>
              <span>Auto Refresh (Fast)</span>
              <i className="fa fa-sync-alt fa-spin" style={{ fontSize: '10px', color: '#00c853', marginLeft: '6px' }}></i>
            </div>

            <label className="toggle-switch disabled" title="Auto-Refresh is mandatory for fast data">
              <input
                type="checkbox"
                checked={true}
                disabled={true}
                readOnly={true}
              />
              <span className="slider" style={{ cursor: 'not-allowed', opacity: 0.6 }}></span>
            </label>



            <button className="secondary" onClick={() => { setData(null); setError(null); }} title="Clear">
              <i className="fa fa-trash"></i>
            </button>

            <button className="secondary" onClick={() => setIsCompact(!isCompact)} title="Toggle Layout">
              <i className={isCompact ? 'fa fa-expand' : 'fa fa-compress'}></i>
            </button>

            <button className={`secondary ${showCharts ? 'active' : ''}`} onClick={() => setShowCharts(!showCharts)} title="Toggle Charts">
              <i className="fa fa-chart-bar"></i>
            </button>

            <button className="secondary" onClick={() => setIsDarkMode(!isDarkMode)} title="Toggle Theme">
              <i className={isDarkMode ? 'fa fa-moon' : 'fa fa-sun'}></i>
            </button>

          </div>
        </div>
        <div className="status">{loading ? 'Loading...' : (error ? error : (!isValid ? 'Please select Symbol and Expiry' : 'Ready'))}</div>
      </div>

      <div className="results">
        {viewMode === 'all' && selectedScrip && (
          <LiveQuote
            scrip={selectedScrip}
            baseUrl={BASE_URL}
            data={quoteData || (data ? {
              last_price: data.underlyingPrice,
              net_change: data.underlyingChange,
              percentage_change: data.underlyingChangePct
            } : null)}
          />
        )}

        {viewMode === 'all' && selectedScrip && (
          <QuoteAnalysisWidget scrip={selectedScrip} quote={quoteData} scripName={selectedScrip.name} />
        )}

        {isOffline && (
          <div className="offline-banner">
            Market appears offline. Showing fallback data.
          </div>
        )}

        {viewMode === 'all' && selectedScrip && (
          <div className="sentiment2-container card" style={{ marginTop: '20px' }}>
            <IntradayChart
              scrip={selectedScrip}
              baseUrl={BASE_URL}
              isAutoRefresh={isAutoRefresh}
              livePrice={quoteData?.last_price || data?.underlyingPrice}
              liveVolume={quoteData?.volume || quoteData?.v || data?.volume}
            />
          </div>
        )}

        {viewMode === 'all' && (
          <>
            {showCharts && selectedScrip && (
              <PredictionChart
                scrip={selectedScrip}
                baseUrl={BASE_URL}
                livePrice={quoteData?.last_price || data?.underlyingPrice}
              />
            )}

            {data && <MarketSentiment data={data} scripName={selectedScrip?.name || ''} analysis={aiAnalysis} />}

            {data && selectedStrikes.length > 0 && (
              <SelectionStrategy
                data={data}
                selectedStrikes={selectedStrikes}
                onRemove={(k, s) => {
                  const key = `${k}_${s}`;
                  const removedRaw = localStorage.getItem('removedStrikes');
                  const removedList = removedRaw ? JSON.parse(removedRaw) : [];
                  if (!removedList.includes(key)) {
                    removedList.push(key);
                    localStorage.setItem('removedStrikes', JSON.stringify(removedList));
                  }
                  setSelectedStrikes(prev => prev.filter(p => !(p.strike === k && p.side === s)));
                }}
                scripName={selectedScrip?.name}
                liveData={latestData}
                baseUrl={BASE_URL}
              />
            )}

            {!data && !loading && isValid && (
              <div className="no-data-centered">
                <i className="fa fa-database" style={{ fontSize: '2rem', marginBottom: '1rem', opacity: 0.5 }}></i>
                <div>No data available for this selection.</div>
              </div>
            )}

            {!data && loading && (
              <div className="no-data-centered">
                <div className="classic-loader"></div>
                <div style={{ marginTop: '1rem' }}>Waiting for market data</div>
              </div>
            )}

            {data && (
              <OptionChainTable
                data={data}
                isOffline={isOffline}
                scripName={selectedScrip?.name || 'NIFTY'}
                selectedStrikes={selectedStrikes}
                liveData={latestData}
                onSelectionChange={setSelectedStrikes}
                strategy={aiAnalysis}
                onRefresh={() => {
                  fetchData(false);
                  fetchCurrentMarketData();
                }}
              />
            )}
          </>
        )}

        {viewMode === 'analysis' && selectedScrip && (
          <div className="analysis-view-grid">
            <div className="analysis-chart-main">
              <div className="sentiment2-container card">
                <IntradayChart
                  scrip={selectedScrip}
                  baseUrl={BASE_URL}
                  isAutoRefresh={isAutoRefresh}
                  livePrice={quoteData?.last_price || data?.underlyingPrice}
                  liveVolume={quoteData?.volume || quoteData?.v || data?.volume}
                />
              </div>
              {showCharts && (
                <div style={{ marginTop: '20px' }}>
                  <PredictionChart
                    scrip={selectedScrip}
                    baseUrl={BASE_URL}
                    livePrice={quoteData?.last_price || data?.underlyingPrice}
                  />
                </div>
              )}
            </div>
            <div className="analysis-sidebar">
              {/* {data && <MarketSentiment data={data} scripName={selectedScrip?.name || ''} analysis={aiAnalysis} />} */}
              {data && selectedStrikes.length > 0 && (
                <div style={{ marginTop: '20px' }}>
                  <SelectionStrategy
                    data={data}
                    selectedStrikes={selectedStrikes}
                    onRemove={(k, s) => {
                      const key = `${k}_${s}`;
                      const removedRaw = localStorage.getItem('removedStrikes');
                      const removedList = removedRaw ? JSON.parse(removedRaw) : [];
                      if (!removedList.includes(key)) {
                        removedList.push(key);
                        localStorage.setItem('removedStrikes', JSON.stringify(removedList));
                      }
                      setSelectedStrikes(prev => prev.filter(p => !(p.strike === k && p.side === s)));
                    }}
                    scripName={selectedScrip?.name}
                    liveData={latestData}
                    baseUrl={BASE_URL}
                  />
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
