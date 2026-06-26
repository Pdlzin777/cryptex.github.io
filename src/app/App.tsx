import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, Cell, ReferenceLine, ReferenceDot,
} from "recharts";
import {
  Search, TrendingUp, TrendingDown, LogIn, UserPlus, X, RefreshCw,
  Activity, Eye, EyeOff, LogOut, User, ChevronUp, ChevronDown, Star,
  Bell, Sun, Moon, Calculator, Trophy, Newspaper, ArrowUpRight, Zap,
  BarChart2, Plus, DollarSign,
} from "lucide-react";
import { toast, Toaster } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────────────
type Tab = "market" | "favorites" | "calculator" | "best";
type ScaleMode = "linear" | "log" | "logret";
type Timeframe = "1D" | "1W" | "1M" | "3M" | "1Y";
type Currency = "usd" | "brl" | "eur";
type AuthTab = "login" | "register";
type CalcMode = "simple" | "dca" | "target";

interface UserRecord { name: string; email: string; password: string }
interface Session { name: string; email: string }
interface CoinMarket {
  id: string; symbol: string; name: string; image: string;
  current_price: number;
  price_change_percentage_24h: number;
  price_change_percentage_7d_in_currency: number;
  price_change_percentage_1y_in_currency: number;
  market_cap: number; total_volume: number; market_cap_rank: number;
  sparkline_in_7d: { price: number[] };
}
interface ChartPoint { label: string; price: number; logRet: number; cumLogRet: number }
interface NewsItem { id: string; title: string; url: string; imageurl: string; source: string; published_on: number; body: string }
interface ScoredCoin extends CoinMarket { score: number; signals: string[]; category: string }
interface Notification { id: string; title: string; body: string; type: "up" | "down" | "news"; ts: number }

// ─── Constants ────────────────────────────────────────────────────────────────
const TIMEFRAMES: Timeframe[] = ["1D", "1W", "1M", "3M", "1Y"];
const TF_DAYS: Record<Timeframe, number> = { "1D": 1, "1W": 7, "1M": 30, "3M": 90, "1Y": 365 };
const CURRENCIES: { key: Currency; label: string; sym: string }[] = [
  { key: "usd", label: "USD", sym: "$" },
  { key: "brl", label: "BRL", sym: "R$" },
  { key: "eur", label: "EUR", sym: "€" },
];
const GREEN = "#02C076";
const RED = "#F6465D";
const YELLOW = "#F0B90B";
const PAGE_SIZE = 20;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtPrice(n: number, sym: string): string {
  const d = n < 0.01 ? 6 : n < 1 ? 4 : n < 100 ? 2 : 0;
  return sym + n.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
}
function fmtCompact(n: number, sym: string): string {
  if (n >= 1e12) return `${sym}${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `${sym}${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${sym}${(n / 1e6).toFixed(2)}M`;
  return `${sym}${n.toLocaleString("pt-BR")}`;
}
function pctColor(n: number) { return n >= 0 ? GREEN : RED; }
function pctText(n: number) { return `${n >= 0 ? "+" : ""}${(n ?? 0).toFixed(2)}%`; }
function timeAgo(ts: number): string {
  const diff = Date.now() / 1000 - ts;
  if (diff < 3600) return `${Math.floor(diff / 60)}min atrás`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h atrás`;
  return `${Math.floor(diff / 86400)}d atrás`;
}

// ─── Sparkline ────────────────────────────────────────────────────────────────
function Sparkline({ prices, up }: { prices: number[]; up: boolean }) {
  const pts = prices.slice(-30);
  if (pts.length < 2) return <div className="w-18 h-6" />;
  const min = Math.min(...pts), max = Math.max(...pts), range = max - min || 1;
  const W = 72, H = 24;
  const d = pts.map((p, i) => {
    const x = (i / (pts.length - 1)) * W;
    const y = H - ((p - min) / range) * (H - 2) - 1;
    return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  return (
    <svg width={W} height={H} className="flex-shrink-0">
      <path d={d} fill="none" stroke={up ? GREEN : RED} strokeWidth={1.5} strokeLinecap="round" />
    </svg>
  );
}

// ─── Score coins ──────────────────────────────────────────────────────────────
function scoreCoins(coins: CoinMarket[]): ScoredCoin[] {
  return coins.map((c) => {
    let score = 0;
    const signals: string[] = [];
    const p24 = c.price_change_percentage_24h ?? 0;
    const p7 = c.price_change_percentage_7d_in_currency ?? 0;
    const p1y = c.price_change_percentage_1y_in_currency ?? 0;
    const vRatio = c.total_volume / (c.market_cap || 1);

    if (c.market_cap_rank <= 10) { score += 30; signals.push("Top 10 global"); }
    else if (c.market_cap_rank <= 50) { score += 15; signals.push("Top 50"); }
    else if (c.market_cap_rank <= 100) { score += 5; }

    if (p24 > 5) { score += 25; signals.push(`+${p24.toFixed(1)}% hoje`); }
    else if (p24 > 2) { score += 12; signals.push(`Alta ${p24.toFixed(1)}% (24h)`); }
    else if (p24 > 0) score += 5;
    else if (p24 < -5) score -= 10;

    if (p7 > 10) { score += 20; signals.push(`+${p7.toFixed(0)}% na semana`); }
    else if (p7 > 5) { score += 10; }

    if (vRatio > 0.15) { score += 18; signals.push("Liquidez muito alta"); }
    else if (vRatio > 0.08) { score += 9; signals.push("Boa liquidez"); }

    if (p1y > 200) { score += 25; signals.push(`+${p1y.toFixed(0)}% em 1 ano`); }
    else if (p1y > 50) { score += 12; signals.push(`+${p1y.toFixed(0)}% em 1 ano`); }
    else if (p1y > 0) score += 5;
    else if (p1y < -50) score -= 15;

    let category = "⚠️ Cautela";
    if (score >= 75) category = "🔥 Hot agora";
    else if (score >= 55) category = "💎 Sólida";
    else if (score >= 35) category = "🚀 Potencial";

    return { ...c, score: Math.max(0, Math.min(100, score)), signals: signals.slice(0, 3), category };
  }).sort((a, b) => b.score - a.score).slice(0, 20);
}

// ─── Auth Page ────────────────────────────────────────────────────────────────
function AuthPage({ onAuth }: { onAuth: () => void }) {
  const [tab, setTab] = useState<AuthTab>("login");
  const [form, setForm] = useState({ name: "", email: "", password: "", confirm: "" });
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState("");

  function field(k: keyof typeof form, v: string) { setForm((f) => ({ ...f, [k]: v })); setError(""); }

  function login(e: React.FormEvent) {
    e.preventDefault();
    const users: UserRecord[] = JSON.parse(localStorage.getItem("cx_users") ?? "[]");
    const u = users.find((u) => u.email === form.email && u.password === form.password);
    if (!u) { setError("E-mail ou senha incorretos."); return; }
    localStorage.setItem("cx_session", JSON.stringify({ name: u.name, email: u.email }));
    onAuth();
  }

  function register(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name || !form.email || !form.password) { setError("Preencha todos os campos."); return; }
    if (form.password !== form.confirm) { setError("As senhas não coincidem."); return; }
    if (form.password.length < 6) { setError("Mínimo 6 caracteres na senha."); return; }
    const users: UserRecord[] = JSON.parse(localStorage.getItem("cx_users") ?? "[]");
    if (users.find((u) => u.email === form.email)) { setError("E-mail já cadastrado."); return; }
    users.push({ name: form.name, email: form.email, password: form.password });
    localStorage.setItem("cx_users", JSON.stringify(users));
    localStorage.setItem("cx_session", JSON.stringify({ name: form.name, email: form.email }));
    onAuth();
  }

  const inp = "w-full bg-muted border border-border rounded-xl px-4 py-3 text-sm text-foreground outline-none focus:border-accent transition-colors placeholder-muted-foreground";

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center gap-3 mb-8">
          <div className="w-14 h-14 rounded-2xl bg-accent/15 border border-accent/25 flex items-center justify-center">
            <Activity size={28} className="text-accent" />
          </div>
          <span className="text-2xl font-bold tracking-widest text-foreground"
            style={{ fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.18em" }}>CRYPTEX</span>
          <p className="text-muted-foreground text-sm">Análise profissional de criptoativos</p>
        </div>

        <div className="bg-card rounded-2xl border border-border p-8 shadow-2xl">
          <div className="flex border-b border-border mb-7 -mx-8 px-8">
            {(["login", "register"] as AuthTab[]).map((t) => (
              <button key={t} onClick={() => { setTab(t); setError(""); }}
                className={`flex-1 pb-4 text-sm font-semibold transition-colors border-b-2 -mb-px flex items-center justify-center gap-2 ${
                  tab === t ? "border-accent text-accent" : "border-transparent text-muted-foreground hover:text-foreground"
                }`}>
                {t === "login" ? <LogIn size={15} /> : <UserPlus size={15} />}
                {t === "login" ? "Entrar" : "Cadastrar"}
              </button>
            ))}
          </div>

          {tab === "login" ? (
            <form onSubmit={login} className="space-y-4">
              <div><label className="text-xs font-semibold text-muted-foreground block mb-2 uppercase tracking-wider">E-mail</label>
                <input type="email" required value={form.email} onChange={(e) => field("email", e.target.value)}
                  className={inp} placeholder="voce@email.com" /></div>
              <div><label className="text-xs font-semibold text-muted-foreground block mb-2 uppercase tracking-wider">Senha</label>
                <div className="relative">
                  <input type={showPass ? "text" : "password"} required value={form.password}
                    onChange={(e) => field("password", e.target.value)} className={inp + " pr-11"} placeholder="••••••••" />
                  <button type="button" onClick={() => setShowPass((v) => !v)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div></div>
              {error && <p className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">{error}</p>}
              <button type="submit"
                className="w-full bg-accent text-accent-foreground py-3 rounded-xl text-sm font-bold hover:opacity-90 transition-opacity mt-2">
                Entrar na conta
              </button>
            </form>
          ) : (
            <form onSubmit={register} className="space-y-4">
              {[
                { k: "name" as const, label: "Nome completo", type: "text", ph: "Seu nome" },
                { k: "email" as const, label: "E-mail", type: "email", ph: "voce@email.com" },
              ].map(({ k, label, type, ph }) => (
                <div key={k}><label className="text-xs font-semibold text-muted-foreground block mb-2 uppercase tracking-wider">{label}</label>
                  <input type={type} required value={form[k]} onChange={(e) => field(k, e.target.value)}
                    className={inp} placeholder={ph} /></div>
              ))}
              {[
                { k: "password" as const, label: "Senha", ph: "Mínimo 6 caracteres" },
                { k: "confirm" as const, label: "Confirmar senha", ph: "Repita a senha" },
              ].map(({ k, label, ph }) => (
                <div key={k}><label className="text-xs font-semibold text-muted-foreground block mb-2 uppercase tracking-wider">{label}</label>
                  <div className="relative">
                    <input type={showPass ? "text" : "password"} required value={form[k]}
                      onChange={(e) => field(k, e.target.value)} className={inp + " pr-11"} placeholder={ph} />
                    <button type="button" onClick={() => setShowPass((v) => !v)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div></div>
              ))}
              {error && <p className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">{error}</p>}
              <button type="submit"
                className="w-full bg-accent text-accent-foreground py-3 rounded-xl text-sm font-bold hover:opacity-90 transition-opacity mt-2">
                Criar conta gratuita
              </button>
            </form>
          )}
        </div>
        <p className="text-center text-xs text-muted-foreground mt-5">
          Dados em tempo real via CoinGecko · CryptoCompare
        </p>
      </div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [session, setSession] = useState<Session | null>(() => {
    try { return JSON.parse(localStorage.getItem("cx_session") ?? "null"); } catch { return null; }
  });
  const [isDark, setIsDark] = useState(true);
  const [tab, setTab] = useState<Tab>("market");

  // Market state
  const [coins, setCoins] = useState<CoinMarket[]>([]);
  const [coinsLoading, setCoinsLoading] = useState(false);
  const [selected, setSelected] = useState<CoinMarket | null>(null);
  const [chartData, setChartData] = useState<ChartPoint[]>([]);
  const [chartLoading, setChartLoading] = useState(false);
  const [fxRates, setFxRates] = useState({ brl: 5.15, eur: 0.92 });
  const [news, setNews] = useState<NewsItem[]>([]);
  const [newsLoading, setNewsLoading] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showNotifs, setShowNotifs] = useState(false);
  const [unread, setUnread] = useState(0);

  // UI state
  const [search, setSearch] = useState("");
  const [currency, setCurrency] = useState<Currency>("usd");
  const [tf, setTf] = useState<Timeframe>("1M");
  const [scale, setScale] = useState<ScaleMode>("linear");
  const [showCount, setShowCount] = useState(PAGE_SIZE);
  const [favorites, setFavorites] = useState<string[]>(() =>
    JSON.parse(localStorage.getItem("cx_favs") ?? "[]")
  );
  const [showFiat, setShowFiat] = useState(false);

  // Calculator state
  const [calcMode, setCalcMode] = useState<CalcMode>("simple");
  const [calcCoin, setCalcCoin] = useState<CoinMarket | null>(null);
  const [buyPrice, setBuyPrice] = useState("");
  const [buyAmount, setBuyAmount] = useState("1000");
  const [targetPrice, setTargetPrice] = useState("");
  const [dcaAmount, setDcaAmount] = useState("200");
  const [dcaMonths, setDcaMonths] = useState("12");

  const prevPricesRef = useRef<Map<string, number>>(new Map());
  const shownNewsRef = useRef<Set<string>>(new Set());

  const { sym } = CURRENCIES.find((c) => c.key === currency)!;
  const fxRate = currency === "usd" ? 1 : currency === "brl" ? fxRates.brl : fxRates.eur;

  // ── Theme ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const root = document.documentElement;
    if (isDark) { root.classList.remove("light"); }
    else { root.classList.add("light"); }
  }, [isDark]);

  // ── Favorite helpers ───────────────────────────────────────────────────────
  function toggleFav(id: string) {
    setFavorites((prev) => {
      const next = prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id];
      localStorage.setItem("cx_favs", JSON.stringify(next));
      return next;
    });
  }

  // ── API: Coins ─────────────────────────────────────────────────────────────
  const fetchCoins = useCallback(async () => {
    setCoinsLoading(true);
    try {
      const res = await fetch(
        "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&page=1&sparkline=true&price_change_percentage=24h,7d,1y"
      );
      if (!res.ok) throw new Error(`${res.status}`);
      const data: CoinMarket[] = await res.json();
      setCoins(data);
      if (!selected && data.length > 0) { setSelected(data[0]); setCalcCoin(data[0]); }

      // Price change notifications
      data.forEach((coin) => {
        const prev = prevPricesRef.current.get(coin.id);
        if (prev && prev > 0) {
          const chg = ((coin.current_price - prev) / prev) * 100;
          if (Math.abs(chg) >= 3) {
            const up = chg > 0;
            const msg = `${coin.symbol.toUpperCase()} ${up ? "subiu" : "caiu"} ${Math.abs(chg).toFixed(1)}%`;
            toast[up ? "success" : "error"](msg, {
              description: fmtPrice(coin.current_price, "$"),
              icon: up ? "📈" : "📉",
            });
            const notif: Notification = {
              id: `price-${coin.id}-${Date.now()}`,
              title: msg,
              body: fmtPrice(coin.current_price, "$"),
              type: up ? "up" : "down",
              ts: Date.now(),
            };
            setNotifications((n) => [notif, ...n].slice(0, 20));
            setUnread((u) => u + 1);
          }
        }
        prevPricesRef.current.set(coin.id, coin.current_price);
      });
    } catch { /* silent */ }
    finally { setCoinsLoading(false); }
  }, [selected]);

  // ── API: FX rates ──────────────────────────────────────────────────────────
  const fetchFx = useCallback(async () => {
    try {
      const res = await fetch("https://open.er-api.com/v6/latest/USD");
      const data = await res.json();
      if (data.rates) setFxRates({ brl: data.rates.BRL, eur: data.rates.EUR });
    } catch { /* keep defaults */ }
  }, []);

  // ── API: Chart ─────────────────────────────────────────────────────────────
  const fetchChart = useCallback(async (coinId: string, days: number) => {
    setChartLoading(true);
    setChartData([]);
    try {
      const res = await fetch(
        `https://api.coingecko.com/api/v3/coins/${coinId}/market_chart?vs_currency=usd&days=${days}`
      );
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      const prices: [number, number][] = data.prices ?? [];
      let prev = prices[0]?.[1] ?? 1, cum = 0;
      setChartData(prices.map(([ts, price]) => {
        const lr = Math.log(price / (prev || 1)) * 100;
        cum += lr;
        prev = price;
        const d = new Date(ts);
        const label = days <= 1
          ? d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
          : days <= 7 ? d.toLocaleDateString("pt-BR", { weekday: "short", day: "numeric" })
          : days <= 90 ? d.toLocaleDateString("pt-BR", { day: "numeric", month: "short" })
          : d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });
        return { label, price, logRet: lr, cumLogRet: cum };
      }));
    } catch { /* empty */ }
    finally { setChartLoading(false); }
  }, []);

  // ── API: News ──────────────────────────────────────────────────────────────
  const fetchNews = useCallback(async (symbol: string) => {
    setNewsLoading(true);
    setNews([]);
    try {
      const res = await fetch(
        `https://min-api.cryptocompare.com/data/v2/news/?categories=${symbol.toUpperCase()}&extraParams=Cryptex&lang=PT`
      );
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      const items: NewsItem[] = (data.Data ?? []).slice(0, 12);
      setNews(items);
      // New news notification
      const first = items[0];
      if (first && !shownNewsRef.current.has(first.id)) {
        shownNewsRef.current.add(first.id);
        toast.info(`📰 ${first.title.slice(0, 80)}${first.title.length > 80 ? "..." : ""}`, {
          description: `via ${first.source}`,
        });
        const notif: Notification = {
          id: `news-${first.id}`, title: first.title.slice(0, 80), body: `via ${first.source}`,
          type: "news", ts: first.published_on * 1000,
        };
        setNotifications((n) => [notif, ...n].slice(0, 20));
        setUnread((u) => u + 1);
      }
    } catch { setNews([]); }
    finally { setNewsLoading(false); }
  }, []);

  // ── Effects ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!session) return;
    fetchCoins(); fetchFx();
    const t = setInterval(fetchCoins, 60000);
    return () => clearInterval(t);
  }, [session]);

  useEffect(() => {
    if (selected) { fetchChart(selected.id, TF_DAYS[tf]); fetchNews(selected.symbol); }
  }, [selected?.id, tf]);

  // ── Derived ────────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? coins.filter((c) => c.name.toLowerCase().includes(q) || c.symbol.toLowerCase().includes(q)) : coins;
  }, [coins, search]);

  const visibleCoins = useMemo(() => filtered.slice(0, showCount), [filtered, showCount]);
  const hasMore = filtered.length > showCount;

  const scores = useMemo(() => scoreCoins(coins), [coins]);

  const change24h = selected?.price_change_percentage_24h ?? 0;
  const coinUp = change24h >= 0;
  const selectedColor = coinUp ? GREEN : RED;

  const yKey = scale === "logret" ? "cumLogRet" : "price";
  const yDomain = useMemo((): [any, any] => {
    if (scale !== "log" || chartData.length === 0) return ["auto", "auto"];
    const prices = chartData.map((d) => d.price).filter((p) => p > 0);
    if (prices.length === 0) return ["auto", "auto"];
    return [Math.min(...prices) * 0.98, Math.max(...prices) * 1.02];
  }, [scale, chartData]);

  const yFormatter = (v: number) => {
    if (scale === "logret") return v.toFixed(1) + "%";
    const base = selected?.current_price ?? 1;
    if (base < 0.01) return "$" + v.toFixed(6);
    if (base < 1) return "$" + v.toFixed(3);
    if (base < 100) return "$" + v.toFixed(1);
    return "$" + (v / 1000).toFixed(1) + "k";
  };

  const tickInterval = Math.max(1, Math.floor(chartData.length / 7));
  const gradId = `grad-${selected?.id ?? "x"}`;

  // Chart peaks
  const chartPeak = useMemo(() =>
    chartData.length > 0 ? chartData.reduce((m, d) => d.price > m.price ? d : m, chartData[0]) : null,
    [chartData]);
  const chartValley = useMemo(() =>
    chartData.length > 0 ? chartData.reduce((m, d) => d.price < m.price ? d : m, chartData[0]) : null,
    [chartData]);

  // Calculator derived
  const calcResult = useMemo(() => {
    if (!calcCoin) return null;
    const bp = parseFloat(buyPrice) || calcCoin.current_price;
    const amount = parseFloat(buyAmount) || 1000;
    const coins2 = amount / bp;
    const currentVal = coins2 * calcCoin.current_price * fxRate;
    const invested = amount * fxRate;
    const profit = currentVal - invested;
    const roi = ((currentVal - invested) / invested) * 100;
    const tp = parseFloat(targetPrice) || 0;
    const targetVal = tp > 0 ? coins2 * tp * fxRate : 0;
    const targetProfit = tp > 0 ? targetVal - invested : 0;
    const targetRoi = tp > 0 ? ((targetVal - invested) / invested) * 100 : 0;
    return { coins2, currentVal, invested, profit, roi, targetVal, targetProfit, targetRoi };
  }, [calcCoin, buyPrice, buyAmount, targetPrice, fxRate]);

  // DCA
  const dcaResult = useMemo(() => {
    if (!calcCoin || !calcCoin.sparkline_in_7d?.price?.length) return null;
    const mo = Math.max(1, Math.min(24, parseInt(dcaMonths) || 12));
    const monthly = parseFloat(dcaAmount) || 200;
    const totalInvested = mo * monthly * fxRate;
    const pct1y = calcCoin.price_change_percentage_1y_in_currency ?? 0;
    const monthlyGrowth = Math.pow(1 + pct1y / 100, 1 / 12);
    let total = 0;
    const rows = Array.from({ length: mo }, (_, i) => {
      const growth = Math.pow(monthlyGrowth, mo - i);
      total += monthly * fxRate * growth;
      const d = new Date();
      d.setMonth(d.getMonth() - (mo - 1 - i));
      return { label: d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }), value: total };
    });
    return { rows, total, totalInvested, profit: total - totalInvested };
  }, [calcCoin, dcaMonths, dcaAmount, fxRate]);

  const fiatItems = [
    { sym2: "USD/BRL", name: "Dólar Americano", value: fxRates.brl, change: 0.45 },
    { sym2: "EUR/BRL", name: "Euro", value: fxRates.brl / fxRates.eur, change: -0.12 },
    { sym2: "BRL/USD", name: "Real Brasileiro", value: 1 / fxRates.brl, change: -0.45 },
  ];

  // ── Auth guard ─────────────────────────────────────────────────────────────
  if (!session) return <AuthPage onAuth={() => {
    setSession(JSON.parse(localStorage.getItem("cx_session") ?? "null"));
  }} />;

  function logout() {
    localStorage.removeItem("cx_session");
    setSession(null); setCoins([]); setSelected(null); setChartData([]);
  }

  // ── RENDER: Header ─────────────────────────────────────────────────────────
  function renderHeader() {
    return (
      <header className="border-b border-border bg-card/80 backdrop-blur-sm flex items-center gap-3 px-5 py-3 flex-shrink-0 flex-wrap gap-y-2 sticky top-0 z-30">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-accent/15 flex items-center justify-center">
            <Activity size={16} className="text-accent" />
          </div>
          <span className="text-base font-bold tracking-widest text-foreground hidden sm:block"
            style={{ fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.15em" }}>CRYPTEX</span>
        </div>

        {/* Search */}
        <div className="flex-1 min-w-44 max-w-md relative">
          <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input type="text" value={search} onChange={(e) => { setSearch(e.target.value); setShowCount(PAGE_SIZE); }}
            placeholder="Pesquisar cripto... Bitcoin, ETH, DOGE, SOL..."
            className="w-full bg-muted rounded-xl pl-9 pr-8 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-accent/30 transition-all placeholder-muted-foreground" />
          {search && <button onClick={() => setSearch("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
            <X size={13} /></button>}
        </div>

        {/* Currency toggle */}
        <div className="flex items-center bg-muted rounded-xl overflow-hidden p-1 gap-0.5">
          {CURRENCIES.map((c) => (
            <button key={c.key} onClick={() => setCurrency(c.key)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                currency === c.key ? "bg-accent text-accent-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}>{c.sym} {c.label}</button>
          ))}
        </div>

        {/* Refresh */}
        <button onClick={fetchCoins} disabled={coinsLoading}
          className="p-2.5 rounded-xl bg-muted text-muted-foreground hover:text-foreground transition-colors" title="Atualizar">
          <RefreshCw size={14} className={coinsLoading ? "animate-spin" : ""} />
        </button>

        {/* Notifications */}
        <div className="relative">
          <button onClick={() => { setShowNotifs((v) => !v); setUnread(0); }}
            className="relative p-2.5 rounded-xl bg-muted text-muted-foreground hover:text-foreground transition-colors">
            <Bell size={14} />
            {unread > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-destructive text-white text-xs rounded-full flex items-center justify-center font-bold">
                {unread > 9 ? "9+" : unread}
              </span>
            )}
          </button>
          {showNotifs && (
            <div className="absolute right-0 top-full mt-2 w-80 bg-card border border-border rounded-2xl shadow-2xl z-50 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                <span className="text-sm font-semibold">Notificações</span>
                <button onClick={() => setShowNotifs(false)}><X size={14} className="text-muted-foreground" /></button>
              </div>
              <div className="max-h-80 overflow-y-auto">
                {notifications.length === 0
                  ? <p className="text-xs text-muted-foreground text-center py-6">Sem notificações ainda</p>
                  : notifications.map((n) => (
                    <div key={n.id} className={`px-4 py-3 border-b border-border/50 flex gap-3 items-start hover:bg-muted/50 transition-colors`}>
                      <span className="text-lg">{n.type === "up" ? "📈" : n.type === "down" ? "📉" : "📰"}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-foreground line-clamp-2">{n.title}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{n.body}</p>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>

        {/* Theme toggle */}
        <button onClick={() => setIsDark((v) => !v)}
          className="p-2.5 rounded-xl bg-muted text-muted-foreground hover:text-foreground transition-colors">
          {isDark ? <Sun size={14} /> : <Moon size={14} />}
        </button>

        {/* Live dot */}
        <div className="flex items-center gap-1.5">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#02C076] opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-[#02C076]" />
          </span>
          <span className="text-[#02C076] text-xs font-semibold hidden md:block">AO VIVO</span>
        </div>

        {/* User */}
        <div className="flex items-center gap-2 ml-auto border-l border-border pl-3">
          <div className="w-8 h-8 rounded-xl bg-accent/15 border border-accent/20 flex items-center justify-center">
            <User size={14} className="text-accent" />
          </div>
          <span className="text-sm font-medium hidden md:block">{session.name.split(" ")[0]}</span>
          <button onClick={logout} title="Sair"
            className="p-2 rounded-lg text-muted-foreground hover:text-destructive transition-colors">
            <LogOut size={14} />
          </button>
        </div>
      </header>
    );
  }

  // ── RENDER: Tab navigation ─────────────────────────────────────────────────
  function renderTabNav() {
    const tabs = [
      { key: "market" as Tab, icon: <BarChart2 size={15} />, label: "Mercado" },
      { key: "favorites" as Tab, icon: <Star size={15} />, label: "Favoritas" },
      { key: "calculator" as Tab, icon: <Calculator size={15} />, label: "Calculadora" },
      { key: "best" as Tab, icon: <Trophy size={15} />, label: "Melhores Hoje" },
    ];
    return (
      <div className="border-b border-border bg-card/60 flex px-5 flex-shrink-0">
        {tabs.map(({ key, icon, label }) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex items-center gap-2 px-4 py-3.5 text-sm font-semibold transition-colors border-b-2 -mb-px whitespace-nowrap ${
              tab === key ? "border-accent text-accent" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}>
            {icon} {label}
          </button>
        ))}
      </div>
    );
  }

  // ── RENDER: Sidebar ────────────────────────────────────────────────────────
  function renderSidebar(filterFavs = false) {
    const list = filterFavs ? visibleCoins.filter((c) => favorites.includes(c.id)) : visibleCoins;
    const totalFiltered = filterFavs ? filtered.filter((c) => favorites.includes(c.id)).length : filtered.length;

    return (
      <aside className="w-72 xl:w-80 flex-shrink-0 border-r border-border flex flex-col overflow-hidden bg-card/30">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between flex-shrink-0">
          <span className="text-sm font-semibold">{filterFavs ? "Minhas Favoritas" : `Mercado (${totalFiltered})`}</span>
          {coinsLoading && <RefreshCw size={12} className="animate-spin text-muted-foreground" />}
        </div>

        <div className="px-3 py-1.5 border-b border-border grid grid-cols-[1fr_auto_auto] gap-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider flex-shrink-0">
          <span>Ativo</span>
          <span className="text-right pr-1">Preço</span>
          <span className="text-right w-16">24H</span>
        </div>

        <div className="overflow-y-auto flex-1 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-border [&::-webkit-scrollbar-thumb]:rounded-full">
          {/* Fiat toggle */}
          {!filterFavs && (
            <>
              <button onClick={() => setShowFiat((v) => !v)}
                className="w-full px-4 py-2.5 border-b border-border/60 flex items-center justify-between text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors">
                <span className="flex items-center gap-1.5"><DollarSign size={11} /> Moedas Fiat (USD · EUR · BRL)</span>
                {showFiat ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              </button>
              {showFiat && fiatItems.map(({ sym2, name, value, change }) => {
                const up = change >= 0;
                return (
                  <div key={sym2} className={`px-4 py-2.5 border-b border-border/40 grid grid-cols-[1fr_auto_auto] gap-1 items-center ${!up ? "bg-destructive/5" : ""}`}>
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-7 h-7 rounded-full bg-accent/15 flex items-center justify-center text-xs font-bold text-accent flex-shrink-0">
                        {sym2[0]}
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-bold truncate">{sym2}</div>
                        <div className="text-xs text-muted-foreground truncate">{name}</div>
                      </div>
                    </div>
                    <div className="text-xs font-semibold text-right pr-1">{value.toFixed(4)}</div>
                    <div className={`text-xs font-bold w-16 text-right flex items-center justify-end gap-0.5 ${up ? "text-[#02C076]" : "text-[#F6465D]"}`}>
                      {up ? <ChevronUp size={10} /> : <ChevronDown size={10} />}{Math.abs(change).toFixed(2)}%
                    </div>
                  </div>
                );
              })}
            </>
          )}

          {/* Empty states */}
          {coins.length === 0 && coinsLoading && (
            <div className="p-8 text-center text-sm text-muted-foreground">
              <RefreshCw size={20} className="animate-spin mx-auto mb-3" />Carregando mercado...
            </div>
          )}
          {filterFavs && list.length === 0 && (
            <div className="p-8 text-center text-sm text-muted-foreground">
              <Star size={20} className="mx-auto mb-3 opacity-40" />
              <p>Sem favoritas ainda.</p>
              <p className="text-xs mt-1 opacity-60">Toque ★ em qualquer moeda para adicionar.</p>
            </div>
          )}

          {/* Coin rows */}
          {list.map((coin) => {
            const chg = coin.price_change_percentage_24h ?? 0;
            const up = chg >= 0;
            const active = selected?.id === coin.id;
            const isFav = favorites.includes(coin.id);
            return (
              <button key={coin.id} onClick={() => setSelected(coin)}
                className={`w-full px-3 py-2.5 border-b border-border/30 grid grid-cols-[1fr_auto_auto] gap-1 items-center text-left transition-all rounded-lg mx-1 my-0.5 w-[calc(100%-8px)]
                  ${active ? "bg-accent/10 border-l-4 border-l-accent" : "hover:bg-muted/60"}
                  ${!up && !active ? "bg-destructive/5" : ""}`}
                style={{ width: "calc(100% - 8px)" }}>
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="relative">
                    <img src={coin.image} alt={coin.symbol} className="w-7 h-7 rounded-full flex-shrink-0"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleFav(coin.id); }}
                      className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full flex items-center justify-center transition-colors"
                      style={{ background: "transparent" }}>
                      <Star size={10} fill={isFav ? YELLOW : "none"} stroke={isFav ? YELLOW : "#848E9C"} />
                    </button>
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-bold uppercase">{coin.symbol}</div>
                    <div className="text-xs text-muted-foreground truncate">{coin.name}</div>
                  </div>
                  <Sparkline prices={coin.sparkline_in_7d?.price ?? []} up={up} />
                </div>
                <div className="text-xs font-semibold text-right pr-1">
                  {fmtPrice(coin.current_price * fxRate, sym)}
                </div>
                <div className={`text-xs font-bold w-16 text-right flex items-center justify-end gap-0.5 ${up ? "text-[#02C076]" : "text-[#F6465D]"}`}>
                  {up ? <ChevronUp size={10} /> : <ChevronDown size={10} />}{Math.abs(chg).toFixed(2)}%
                </div>
              </button>
            );
          })}

          {/* Load more */}
          {!filterFavs && hasMore && (
            <button onClick={() => setShowCount((n) => n + PAGE_SIZE)}
              className="w-full py-3 flex items-center justify-center gap-2 text-xs font-semibold text-accent hover:bg-accent/10 transition-colors border-t border-border">
              <Plus size={13} /> Mostrar mais ({filtered.length - showCount} restantes)
            </button>
          )}
        </div>
      </aside>
    );
  }

  // ── RENDER: Market tab ─────────────────────────────────────────────────────
  function renderMarket() {
    if (!selected) return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        {coinsLoading ? <div className="text-center"><RefreshCw size={24} className="animate-spin mx-auto mb-3" /><p>Carregando mercado...</p></div>
          : <p>Selecione uma moeda na lista</p>}
      </div>
    );

    return (
      <main className="flex-1 overflow-y-auto p-5 space-y-5 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-border [&::-webkit-scrollbar-thumb]:rounded-full">
        {/* Coin header */}
        <div className="flex flex-wrap items-start gap-4 justify-between">
          <div className="flex items-center gap-4">
            <img src={selected.image} alt={selected.name} className="w-12 h-12 rounded-full" />
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-lg font-bold">{selected.symbol.toUpperCase()}/USDT</h1>
                <span className="text-sm text-muted-foreground">{selected.name}</span>
                <span className="text-xs bg-muted rounded-lg px-2 py-1 font-semibold">#{selected.market_cap_rank}</span>
              </div>
              <div className="flex items-center gap-3 mt-1">
                <span className="text-3xl font-bold" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                  {fmtPrice(selected.current_price * fxRate, sym)}
                </span>
                <span className={`flex items-center gap-1 text-base font-bold px-2 py-1 rounded-lg ${coinUp ? "bg-[#02C076]/15 text-[#02C076]" : "bg-[#F6465D]/15 text-[#F6465D]"}`}>
                  {coinUp ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
                  {pctText(change24h)} (24h)
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            {[
              { label: "Cap. Mercado", value: fmtCompact(selected.market_cap * fxRate, sym) },
              { label: "Volume 24H", value: fmtCompact(selected.total_volume * fxRate, sym) },
              { label: "7 Dias", value: pctText(selected.price_change_percentage_7d_in_currency ?? 0), color: pctColor(selected.price_change_percentage_7d_in_currency ?? 0) },
              { label: "1 Ano", value: pctText(selected.price_change_percentage_1y_in_currency ?? 0), color: pctColor(selected.price_change_percentage_1y_in_currency ?? 0) },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-card border border-border rounded-xl px-4 py-3 min-w-28">
                <div className="text-xs text-muted-foreground font-semibold">{label}</div>
                <div className="text-base font-bold mt-1" style={{ color: color ?? undefined }}>{value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-3 justify-between">
          <div className="flex items-center bg-muted rounded-xl p-1 gap-0.5">
            {TIMEFRAMES.map((t) => (
              <button key={t} onClick={() => setTf(t)}
                className={`px-4 py-2 text-sm font-semibold rounded-lg transition-all ${
                  tf === t ? "bg-accent text-accent-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}>{t}</button>
            ))}
          </div>
          <div className="flex items-center gap-2.5">
            <span className="text-sm text-muted-foreground font-medium hidden sm:block">Escala:</span>
            <div className="flex items-center bg-muted rounded-xl p-1 gap-0.5">
              {([["linear", "Linear"], ["log", "LOG"], ["logret", "Log Ret"]] as [ScaleMode, string][]).map(([k, l]) => (
                <button key={k} onClick={() => setScale(k)}
                  className={`px-3 py-2 text-sm font-semibold rounded-lg transition-all ${
                    scale === k ? "bg-accent text-accent-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                  }`}>{l}</button>
              ))}
            </div>
          </div>
        </div>

        {scale !== "linear" && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground bg-accent/10 border border-accent/20 rounded-xl px-4 py-2.5">
            <Zap size={14} className="text-accent flex-shrink-0" />
            {scale === "log"
              ? "Escala logarítmica: distâncias iguais representam variações percentuais iguais — ideal para histórico longo."
              : "Retorno logarítmico acumulado ln(Pt/P0) × 100 — mede performance simétrica, base da teoria financeira moderna."}
          </div>
        )}

        {/* Main chart */}
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-5 pt-4 pb-2">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full" style={{ background: selectedColor }} />
              <span className="text-sm font-bold">
                {selected.symbol.toUpperCase()} · {scale === "logret" ? "Retorno Log Acumulado" : `Preço (${sym})`}
              </span>
            </div>
            <div className="flex items-center gap-3">
              {chartLoading && <RefreshCw size={13} className="animate-spin text-muted-foreground" />}
              {chartData.length > 0 && scale !== "logret" && (
                <div className="flex items-center gap-3 text-xs">
                  <span className="flex items-center gap-1" style={{ color: GREEN }}>
                    <span className="w-2 h-2 rounded-full" style={{ background: GREEN }} /> Máx: {fmtPrice((chartPeak?.price ?? 0) * fxRate, sym)}
                  </span>
                  <span className="flex items-center gap-1" style={{ color: RED }}>
                    <span className="w-2 h-2 rounded-full" style={{ background: RED }} /> Mín: {fmtPrice((chartValley?.price ?? 0) * fxRate, sym)}
                  </span>
                </div>
              )}
            </div>
          </div>

          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={chartData} margin={{ top: 10, right: 20, left: 5, bottom: 5 }}>
              <defs>
                <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={selectedColor} stopOpacity={0.25} />
                  <stop offset="80%" stopColor={selectedColor} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 8" stroke="rgba(255,255,255,0.04)" vertical={false} />
              <XAxis dataKey="label"
                tick={{ fill: "#848E9C", fontSize: 11, fontFamily: "'JetBrains Mono', monospace" }}
                axisLine={false} tickLine={false} interval={tickInterval} />
              <YAxis scale={scale === "log" ? "log" : "auto"} domain={yDomain} tickFormatter={yFormatter}
                tick={{ fill: "#848E9C", fontSize: 11, fontFamily: "'JetBrains Mono', monospace" }}
                axisLine={false} tickLine={false} width={64} allowDataOverflow />
              <Tooltip cursor={{ stroke: "rgba(255,255,255,0.12)", strokeWidth: 1 }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0]?.payload as ChartPoint;
                  return (
                    <div className="bg-card border border-border rounded-xl px-4 py-3 shadow-xl text-sm"
                      style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                      <div className="text-muted-foreground text-xs mb-1.5">{d?.label}</div>
                      {scale === "logret"
                        ? <div className="font-bold" style={{ color: (d?.cumLogRet ?? 0) >= 0 ? GREEN : RED }}>
                            {(d?.cumLogRet ?? 0) >= 0 ? "+" : ""}{(d?.cumLogRet ?? 0).toFixed(3)}%
                          </div>
                        : <div className="font-bold text-base text-foreground">{fmtPrice((d?.price ?? 0) * fxRate, sym)}</div>
                      }
                    </div>
                  );
                }} />
              {scale === "logret" && <ReferenceLine y={0} stroke="rgba(255,255,255,0.18)" strokeDasharray="4 6" />}

              {/* Peak and valley markers */}
              {chartData.length > 5 && scale !== "logret" && chartPeak && (
                <ReferenceDot x={chartPeak.label} y={chartPeak.price} r={6}
                  fill={GREEN} stroke="#0B0E11" strokeWidth={2}
                  label={{ value: "▲ MÁX", position: "top", fontSize: 10, fill: GREEN, fontFamily: "'JetBrains Mono', monospace" }} />
              )}
              {chartData.length > 5 && scale !== "logret" && chartValley && (
                <ReferenceDot x={chartValley.label} y={chartValley.price} r={6}
                  fill={RED} stroke="#0B0E11" strokeWidth={2}
                  label={{ value: "▼ MÍN", position: "bottom", fontSize: 10, fill: RED, fontFamily: "'JetBrains Mono', monospace" }} />
              )}

              <Area type="monotone" dataKey={yKey} stroke={selectedColor} strokeWidth={2}
                fill={`url(#${gradId})`} dot={false}
                activeDot={{ r: 4, fill: selectedColor, strokeWidth: 0 }} isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Retorno no Período", val: pctText(((selected.current_price - (chartData[0]?.price ?? selected.current_price)) / (chartData[0]?.price || selected.current_price)) * 100), color: pctColor(((selected.current_price - (chartData[0]?.price ?? selected.current_price)) / (chartData[0]?.price || 1)) * 100) },
            { label: "Variação Log", val: `${Math.log(selected.current_price / (chartData[0]?.price || selected.current_price)) >= 0 ? "+" : ""}${(Math.log(selected.current_price / (chartData[0]?.price || selected.current_price)) * 100).toFixed(2)}%`, color: pctColor(Math.log(selected.current_price / (chartData[0]?.price || selected.current_price))) },
            { label: "Amplitude", val: chartData.length > 0 ? pctText((((chartPeak?.price ?? 0) - (chartValley?.price ?? 0)) / (chartValley?.price || 1)) * 100) : "—", color: "#848E9C" },
            { label: "Volatilidade Anual", val: `${(selected.price_change_percentage_7d_in_currency ? Math.abs(selected.price_change_percentage_7d_in_currency) * Math.sqrt(52) : 0).toFixed(1)}%`, color: "#848E9C" },
          ].map(({ label, val, color }) => (
            <div key={label} className="bg-card border border-border rounded-xl px-4 py-4">
              <div className="text-xs text-muted-foreground font-semibold mb-1.5">{label}</div>
              <div className="text-xl font-bold" style={{ fontFamily: "'JetBrains Mono', monospace", color }}>{val}</div>
            </div>
          ))}
        </div>

        {/* News section */}
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="flex items-center gap-2.5 px-5 py-4 border-b border-border">
            <Newspaper size={16} className="text-accent" />
            <span className="text-base font-bold">Notícias · {selected.name}</span>
            {newsLoading && <RefreshCw size={12} className="animate-spin text-muted-foreground ml-auto" />}
          </div>
          {news.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-muted-foreground">
              {newsLoading ? "Carregando notícias..." : "Nenhuma notícia disponível no momento."}
            </div>
          ) : (
            <div className="divide-y divide-border/50">
              {news.map((item) => (
                <a key={item.id} href={item.url} target="_blank" rel="noopener noreferrer"
                  className="flex gap-4 p-4 hover:bg-muted/50 transition-colors group">
                  {item.imageurl && (
                    <img src={item.imageurl} alt="" className="w-16 h-16 rounded-xl object-cover flex-shrink-0 opacity-80 group-hover:opacity-100 transition-opacity" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground line-clamp-2 group-hover:text-accent transition-colors">{item.title}</p>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{item.body}</p>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-xs font-semibold text-muted-foreground">{item.source}</span>
                      <span className="text-xs text-muted-foreground">·</span>
                      <span className="text-xs text-muted-foreground">{timeAgo(item.published_on)}</span>
                      <ArrowUpRight size={11} className="text-muted-foreground ml-auto group-hover:text-accent transition-colors" />
                    </div>
                  </div>
                </a>
              ))}
            </div>
          )}
        </div>
      </main>
    );
  }

  // ── RENDER: Favorites tab ──────────────────────────────────────────────────
  function renderFavorites() {
    const favCoins = coins.filter((c) => favorites.includes(c.id));
    if (favCoins.length === 0) return (
      <main className="flex-1 flex flex-col items-center justify-center p-8 text-center gap-4">
        <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center">
          <Star size={28} className="text-muted-foreground opacity-40" />
        </div>
        <h2 className="text-lg font-bold">Sem favoritas ainda</h2>
        <p className="text-muted-foreground text-sm max-w-xs">Toque no ícone ★ em qualquer moeda na lista do mercado para adicioná-la aqui.</p>
      </main>
    );

    return (
      <main className="flex-1 overflow-y-auto p-5">
        <h2 className="text-lg font-bold mb-4">Minhas Favoritas ({favCoins.length})</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {favCoins.map((coin) => {
            const chg = coin.price_change_percentage_24h ?? 0;
            const up = chg >= 0;
            const active = selected?.id === coin.id;
            return (
              <button key={coin.id} onClick={() => { setSelected(coin); setTab("market"); }}
                className={`bg-card border rounded-2xl p-4 text-left hover:border-accent/40 transition-all hover:shadow-lg ${active ? "border-accent" : "border-border"}`}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <img src={coin.image} alt={coin.symbol} className="w-10 h-10 rounded-full" />
                    <div>
                      <div className="text-sm font-bold uppercase">{coin.symbol}</div>
                      <div className="text-xs text-muted-foreground">{coin.name}</div>
                    </div>
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); toggleFav(coin.id); }}
                    className="p-1.5 rounded-lg hover:bg-muted transition-colors">
                    <Star size={14} fill={YELLOW} stroke={YELLOW} />
                  </button>
                </div>
                <div className="flex items-end justify-between">
                  <div>
                    <div className="text-xl font-bold" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                      {fmtPrice(coin.current_price * fxRate, sym)}
                    </div>
                    <div className={`text-sm font-bold flex items-center gap-0.5 ${up ? "text-[#02C076]" : "text-[#F6465D]"}`}>
                      {up ? <ChevronUp size={13} /> : <ChevronDown size={13} />}{Math.abs(chg).toFixed(2)}%
                    </div>
                  </div>
                  <Sparkline prices={coin.sparkline_in_7d?.price ?? []} up={up} />
                </div>
              </button>
            );
          })}
        </div>
      </main>
    );
  }

  // ── RENDER: Calculator tab ─────────────────────────────────────────────────
  function renderCalculator() {
    const calcModes: { key: CalcMode; label: string; icon: React.ReactNode }[] = [
      { key: "simple", label: "Lucro/Prejuízo", icon: <TrendingUp size={14} /> },
      { key: "target", label: "Calculadora de Meta", icon: <Zap size={14} /> },
      { key: "dca", label: "DCA Mensal", icon: <BarChart2 size={14} /> },
    ];

    return (
      <main className="flex-1 overflow-y-auto p-5 space-y-5">
        <h2 className="text-xl font-bold flex items-center gap-2"><Calculator size={20} className="text-accent" /> Calculadora de Investimento</h2>

        {/* Coin selector */}
        <div className="bg-card border border-border rounded-2xl p-5">
          <label className="text-sm font-bold text-muted-foreground block mb-3">Selecionar Criptomoeda</label>
          <div className="flex flex-wrap gap-2">
            {coins.slice(0, 15).map((c) => (
              <button key={c.id} onClick={() => setCalcCoin(c)}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold border transition-all ${
                  calcCoin?.id === c.id ? "border-accent bg-accent/15 text-accent" : "border-border bg-muted hover:border-accent/40 text-foreground"
                }`}>
                <img src={c.image} alt={c.symbol} className="w-5 h-5 rounded-full" />
                {c.symbol.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {/* Mode tabs */}
        <div className="flex bg-muted rounded-xl p-1 gap-1">
          {calcModes.map(({ key, label, icon }) => (
            <button key={key} onClick={() => setCalcMode(key)}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-semibold rounded-lg transition-all ${
                calcMode === key ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}>
              {icon} <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>

        {calcCoin && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Inputs */}
            <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
              <div className="flex items-center gap-3 mb-2">
                <img src={calcCoin.image} alt={calcCoin.name} className="w-8 h-8 rounded-full" />
                <div>
                  <div className="text-sm font-bold">{calcCoin.name}</div>
                  <div className="text-xs text-muted-foreground">Preço atual: {fmtPrice(calcCoin.current_price * fxRate, sym)}</div>
                </div>
              </div>

              {(calcMode === "simple" || calcMode === "target") && (
                <>
                  <div>
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-2">Preço de Compra ({sym})</label>
                    <input type="number" value={buyPrice} onChange={(e) => setBuyPrice(e.target.value)}
                      placeholder={fmtPrice(calcCoin.current_price * fxRate, "").replace(",", ".")}
                      className="w-full bg-muted border border-border rounded-xl px-4 py-3 text-sm font-semibold outline-none focus:ring-2 focus:ring-accent/30 transition-all" />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-2">Valor Investido ({sym})</label>
                    <input type="number" value={buyAmount} onChange={(e) => setBuyAmount(e.target.value)}
                      className="w-full bg-muted border border-border rounded-xl px-4 py-3 text-sm font-semibold outline-none focus:ring-2 focus:ring-accent/30 transition-all" />
                  </div>
                  {calcMode === "target" && (
                    <div>
                      <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-2">Preço Alvo ({sym})</label>
                      <input type="number" value={targetPrice} onChange={(e) => setTargetPrice(e.target.value)}
                        placeholder="Ex: 100000"
                        className="w-full bg-muted border border-border rounded-xl px-4 py-3 text-sm font-semibold outline-none focus:ring-2 focus:ring-accent/30 transition-all" />
                    </div>
                  )}
                </>
              )}

              {calcMode === "dca" && (
                <>
                  <div>
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-2">Aporte Mensal ({sym})</label>
                    <input type="number" value={dcaAmount} onChange={(e) => setDcaAmount(e.target.value)}
                      className="w-full bg-muted border border-border rounded-xl px-4 py-3 text-sm font-semibold outline-none focus:ring-2 focus:ring-accent/30 transition-all" />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-2">Duração (meses)</label>
                    <input type="number" value={dcaMonths} min="1" max="24" onChange={(e) => setDcaMonths(e.target.value)}
                      className="w-full bg-muted border border-border rounded-xl px-4 py-3 text-sm font-semibold outline-none focus:ring-2 focus:ring-accent/30 transition-all" />
                  </div>
                  <p className="text-xs text-muted-foreground">Baseado na performance anual de {pctText(calcCoin.price_change_percentage_1y_in_currency ?? 0)}</p>
                </>
              )}
            </div>

            {/* Results */}
            <div className="space-y-3">
              {(calcMode === "simple" || calcMode === "target") && calcResult && (
                <>
                  {[
                    { label: "Moedas compradas", val: calcResult.coins2.toFixed(6), color: undefined },
                    { label: "Valor atual", val: fmtPrice(calcResult.currentVal, sym), color: undefined },
                    { label: "Lucro / Prejuízo", val: `${calcResult.profit >= 0 ? "+" : ""}${fmtPrice(calcResult.profit, sym)}`, color: pctColor(calcResult.profit) },
                    { label: "ROI", val: pctText(calcResult.roi), color: pctColor(calcResult.roi) },
                    ...(calcMode === "target" && calcResult.targetVal > 0 ? [
                      { label: "Valor no alvo", val: fmtPrice(calcResult.targetVal, sym), color: pctColor(calcResult.targetRoi) },
                      { label: "Lucro no alvo", val: `+${fmtPrice(calcResult.targetProfit, sym)}`, color: GREEN },
                      { label: "ROI no alvo", val: pctText(calcResult.targetRoi), color: pctColor(calcResult.targetRoi) },
                    ] : []),
                  ].map(({ label, val, color }) => (
                    <div key={label} className="bg-card border border-border rounded-xl px-5 py-4 flex items-center justify-between">
                      <span className="text-sm text-muted-foreground font-medium">{label}</span>
                      <span className="text-lg font-bold" style={{ fontFamily: "'JetBrains Mono', monospace", color: color ?? undefined }}>{val}</span>
                    </div>
                  ))}
                </>
              )}

              {calcMode === "dca" && dcaResult && (
                <>
                  {[
                    { label: "Total investido", val: fmtPrice(dcaResult.totalInvested, sym), color: undefined },
                    { label: "Valor final estimado", val: fmtPrice(dcaResult.total, sym), color: undefined },
                    { label: "Lucro estimado", val: `${dcaResult.profit >= 0 ? "+" : ""}${fmtPrice(dcaResult.profit, sym)}`, color: pctColor(dcaResult.profit) },
                    { label: "ROI total", val: pctText(((dcaResult.total - dcaResult.totalInvested) / dcaResult.totalInvested) * 100), color: pctColor(dcaResult.total - dcaResult.totalInvested) },
                  ].map(({ label, val, color }) => (
                    <div key={label} className="bg-card border border-border rounded-xl px-5 py-4 flex items-center justify-between">
                      <span className="text-sm text-muted-foreground font-medium">{label}</span>
                      <span className="text-lg font-bold" style={{ fontFamily: "'JetBrains Mono', monospace", color: color ?? undefined }}>{val}</span>
                    </div>
                  ))}

                  {/* DCA bar chart */}
                  <div className="bg-card border border-border rounded-2xl p-4">
                    <p className="text-xs font-bold text-muted-foreground mb-3 uppercase tracking-wider">Evolução do Portfólio DCA</p>
                    <ResponsiveContainer width="100%" height={160}>
                      <BarChart data={dcaResult.rows} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 8" stroke="rgba(255,255,255,0.04)" vertical={false} />
                        <XAxis dataKey="label" tick={{ fill: "#848E9C", fontSize: 10 }} axisLine={false} tickLine={false} />
                        <YAxis tickFormatter={(v) => v >= 1000 ? `${sym}${(v / 1000).toFixed(0)}k` : `${sym}${v.toFixed(0)}`}
                          tick={{ fill: "#848E9C", fontSize: 10 }} axisLine={false} tickLine={false} width={52} />
                        <ReferenceLine y={dcaResult.totalInvested} stroke="rgba(255,255,255,0.2)" strokeDasharray="4 6" />
                        <Tooltip cursor={{ fill: "rgba(255,255,255,0.03)" }}
                          content={({ active, payload }) => {
                            if (!active || !payload?.length) return null;
                            const d = payload[0]?.payload;
                            return (
                              <div className="bg-card border border-border rounded-xl px-3 py-2 text-xs shadow-xl">
                                <div className="text-muted-foreground">{d?.label}</div>
                                <div className="font-bold text-foreground">{fmtPrice(d?.value, sym)}</div>
                              </div>
                            );
                          }} />
                        <Bar dataKey="value" radius={[6, 6, 0, 0]} isAnimationActive={false}>
                          {dcaResult.rows.map((entry, i) => (
                            <Cell key={i} fill={entry.value >= dcaResult.totalInvested ? GREEN : RED} fillOpacity={0.8} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        <p className="text-xs text-muted-foreground border border-border rounded-xl px-4 py-3 bg-muted/30">
          ⚠️ Simulação com base em dados históricos. Rentabilidade passada não garante resultados futuros. Não é recomendação de investimento.
        </p>
      </main>
    );
  }

  // ── RENDER: Best Invest tab ────────────────────────────────────────────────
  function renderBestInvest() {
    return (
      <main className="flex-1 overflow-y-auto p-5 space-y-5">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2 mb-1">
            <Trophy size={20} className="text-accent" /> Melhores para Investir Hoje
          </h2>
          <p className="text-sm text-muted-foreground">Score calculado com base em momentum, liquidez, dominância e performance histórica.</p>
        </div>

        {scores.length === 0 ? (
          <div className="flex items-center justify-center h-48 text-muted-foreground">
            <RefreshCw size={20} className="animate-spin mr-2" /> Analisando mercado...
          </div>
        ) : (
          <div className="space-y-3">
            {scores.map((coin, i) => {
              const chg = coin.price_change_percentage_24h ?? 0;
              const up = chg >= 0;
              return (
                <button key={coin.id} onClick={() => { setSelected(coin); setTab("market"); }}
                  className="w-full bg-card border border-border rounded-2xl p-4 hover:border-accent/40 transition-all hover:shadow-lg text-left group">
                  <div className="flex items-center gap-4">
                    {/* Rank */}
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm flex-shrink-0 ${
                      i === 0 ? "bg-yellow-500/20 text-yellow-400" : i === 1 ? "bg-gray-400/20 text-gray-300" : i === 2 ? "bg-orange-600/20 text-orange-400" : "bg-muted text-muted-foreground"
                    }`}>#{i + 1}</div>

                    <img src={coin.image} alt={coin.name} className="w-10 h-10 rounded-full flex-shrink-0" />

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-base font-bold">{coin.symbol.toUpperCase()}</span>
                        <span className="text-sm text-muted-foreground">{coin.name}</span>
                        <span className="text-xs font-bold px-2 py-0.5 rounded-lg" style={{
                          background: coin.score >= 75 ? `${YELLOW}25` : coin.score >= 55 ? `${GREEN}20` : `${RED}15`,
                          color: coin.score >= 75 ? YELLOW : coin.score >= 55 ? GREEN : "#848E9C"
                        }}>{coin.category}</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        {coin.signals.map((s) => (
                          <span key={s} className="text-xs bg-muted rounded-lg px-2 py-0.5 text-muted-foreground">{s}</span>
                        ))}
                      </div>
                    </div>

                    <div className="text-right flex-shrink-0">
                      <div className="text-base font-bold" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                        {fmtPrice(coin.current_price * fxRate, sym)}
                      </div>
                      <div className={`text-sm font-bold flex items-center justify-end gap-0.5 ${up ? "text-[#02C076]" : "text-[#F6465D]"}`}>
                        {up ? <ChevronUp size={12} /> : <ChevronDown size={12} />}{Math.abs(chg).toFixed(2)}%
                      </div>
                    </div>

                    {/* Score bar */}
                    <div className="w-16 hidden sm:block">
                      <div className="text-xs text-muted-foreground text-center mb-1 font-semibold">{coin.score}pts</div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all" style={{
                          width: `${coin.score}%`,
                          background: coin.score >= 75 ? YELLOW : coin.score >= 55 ? GREEN : RED
                        }} />
                      </div>
                    </div>

                    <ArrowUpRight size={16} className="text-muted-foreground group-hover:text-accent transition-colors flex-shrink-0" />
                  </div>
                </button>
              );
            })}
          </div>
        )}

        <p className="text-xs text-muted-foreground border border-border rounded-xl px-4 py-3 bg-muted/30">
          ⚠️ Score é informativo e baseado em dados históricos e momentum atual. Não constitui recomendação financeira.
        </p>
      </main>
    );
  }

  // ── ROOT ──────────────────────────────────────────────────────────────────
  const showSidebar = tab === "market" || tab === "favorites";

  return (
    <div className={`min-h-screen bg-background text-foreground flex flex-col ${isDark ? "" : "light"}`}
      style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <Toaster theme={isDark ? "dark" : "light"} position="top-right" richColors closeButton />
      {renderHeader()}
      {renderTabNav()}
      <div className="flex flex-1 overflow-hidden min-h-0">
        {showSidebar && renderSidebar(tab === "favorites")}
        {tab === "market" && renderMarket()}
        {tab === "favorites" && renderFavorites()}
        {tab === "calculator" && renderCalculator()}
        {tab === "best" && renderBestInvest()}
      </div>
    </div>
  );
}
