import { useState, useMemo, useEffect, useCallback } from "react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, Cell, ReferenceLine,
} from "recharts";
import {
  Search, TrendingUp, TrendingDown, LogIn, UserPlus, X,
  RefreshCw, Zap, Activity, Eye, EyeOff, LogOut, User,
  ChevronUp, ChevronDown, DollarSign, Calculator,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
type ScaleMode = "linear" | "log" | "logret";
type Timeframe = "1D" | "1W" | "1M" | "3M" | "1Y";
type Currency = "usd" | "brl" | "eur";
type AuthTab = "login" | "register";

interface UserRecord { name: string; email: string; password: string }
interface Session { name: string; email: string }

interface CoinMarket {
  id: string;
  symbol: string;
  name: string;
  image: string;
  current_price: number;
  price_change_percentage_24h: number;
  price_change_percentage_7d_in_currency: number;
  price_change_percentage_1y_in_currency: number;
  market_cap: number;
  total_volume: number;
  market_cap_rank: number;
  sparkline_in_7d: { price: number[] };
}

interface ChartPoint {
  label: string;
  price: number;
  logRet: number;
  cumLogRet: number;
}

interface GainPoint {
  label: string;
  pct: number;
  value: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const TIMEFRAMES: Timeframe[] = ["1D", "1W", "1M", "3M", "1Y"];
const TF_DAYS: Record<Timeframe, number> = { "1D": 1, "1W": 7, "1M": 30, "3M": 90, "1Y": 365 };

const CURRENCIES: { key: Currency; label: string; sym: string }[] = [
  { key: "usd", label: "Dólar", sym: "$" },
  { key: "brl", label: "Real", sym: "R$" },
  { key: "eur", label: "Euro", sym: "€" },
];

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

function pctColor(n: number) { return n >= 0 ? "#10b981" : "#f43f5e"; }
function pctText(n: number) { return `${n >= 0 ? "+" : ""}${(n ?? 0).toFixed(2)}%`; }

// ─── Auth Page ────────────────────────────────────────────────────────────────
function AuthPage({ onAuth }: { onAuth: () => void }) {
  const [tab, setTab] = useState<AuthTab>("login");
  const [form, setForm] = useState({ name: "", email: "", password: "", confirm: "" });
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState("");

  function field(k: keyof typeof form, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
    setError("");
  }

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
    if (form.password.length < 6) { setError("Senha deve ter no mínimo 6 caracteres."); return; }
    const users: UserRecord[] = JSON.parse(localStorage.getItem("cx_users") ?? "[]");
    if (users.find((u) => u.email === form.email)) { setError("E-mail já cadastrado."); return; }
    users.push({ name: form.name, email: form.email, password: form.password });
    localStorage.setItem("cx_users", JSON.stringify(users));
    localStorage.setItem("cx_session", JSON.stringify({ name: form.name, email: form.email }));
    onAuth();
  }

  const inputCls =
    "w-full bg-secondary border border-border px-3 py-2.5 text-sm text-foreground outline-none focus:border-accent transition-colors placeholder-muted-foreground";

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-center gap-2 mb-8">
          <Activity size={18} className="text-accent" />
          <span className="text-base font-semibold tracking-widest uppercase text-foreground"
            style={{ fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.22em" }}>
            CRYPTEX
          </span>
        </div>

        <div className="bg-card border border-border p-6">
          {/* Tabs */}
          <div className="flex border-b border-border mb-6 -mx-6 px-6">
            {(["login", "register"] as AuthTab[]).map((t) => (
              <button key={t} onClick={() => { setTab(t); setError(""); }}
                className={`flex-1 pb-3 text-xs font-medium transition-colors border-b-2 -mb-px flex items-center justify-center gap-1.5 ${
                  tab === t ? "border-accent text-accent" : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
                style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                {t === "login" ? <LogIn size={13} /> : <UserPlus size={13} />}
                {t === "login" ? "ENTRAR" : "CADASTRAR"}
              </button>
            ))}
          </div>

          {tab === "login" ? (
            <form onSubmit={login} className="space-y-4">
              <div>
                <label className="text-xs text-muted-foreground block mb-1.5"
                  style={{ fontFamily: "'JetBrains Mono', monospace" }}>E-MAIL</label>
                <input type="email" required value={form.email} onChange={(e) => field("email", e.target.value)}
                  className={inputCls} style={{ fontFamily: "'JetBrains Mono', monospace" }} placeholder="voce@email.com" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1.5"
                  style={{ fontFamily: "'JetBrains Mono', monospace" }}>SENHA</label>
                <div className="relative">
                  <input type={showPass ? "text" : "password"} required value={form.password}
                    onChange={(e) => field("password", e.target.value)}
                    className={inputCls + " pr-10"} style={{ fontFamily: "'JetBrains Mono', monospace" }} placeholder="••••••••" />
                  <button type="button" onClick={() => setShowPass((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    {showPass ? <EyeOff size={13} /> : <Eye size={13} />}
                  </button>
                </div>
              </div>
              {error && <p className="text-xs text-[#f43f5e]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{error}</p>}
              <button type="submit"
                className="w-full bg-accent text-accent-foreground py-2.5 text-xs font-semibold hover:opacity-90 transition-opacity"
                style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                ENTRAR
              </button>
              <p className="text-xs text-center text-muted-foreground leading-relaxed"
                style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                Sem conta? Cadastre-se na aba acima.
              </p>
            </form>
          ) : (
            <form onSubmit={register} className="space-y-4">
              {[
                { k: "name" as const, label: "NOME COMPLETO", type: "text", ph: "Seu nome" },
                { k: "email" as const, label: "E-MAIL", type: "email", ph: "voce@email.com" },
              ].map(({ k, label, type, ph }) => (
                <div key={k}>
                  <label className="text-xs text-muted-foreground block mb-1.5"
                    style={{ fontFamily: "'JetBrains Mono', monospace" }}>{label}</label>
                  <input type={type} required value={form[k]} onChange={(e) => field(k, e.target.value)}
                    className={inputCls} style={{ fontFamily: "'JetBrains Mono', monospace" }} placeholder={ph} />
                </div>
              ))}
              {[
                { k: "password" as const, label: "SENHA", ph: "••••••••" },
                { k: "confirm" as const, label: "CONFIRMAR SENHA", ph: "••••••••" },
              ].map(({ k, label, ph }) => (
                <div key={k}>
                  <label className="text-xs text-muted-foreground block mb-1.5"
                    style={{ fontFamily: "'JetBrains Mono', monospace" }}>{label}</label>
                  <div className="relative">
                    <input type={showPass ? "text" : "password"} required value={form[k]}
                      onChange={(e) => field(k, e.target.value)}
                      className={inputCls + " pr-10"} style={{ fontFamily: "'JetBrains Mono', monospace" }} placeholder={ph} />
                    <button type="button" onClick={() => setShowPass((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      {showPass ? <EyeOff size={13} /> : <Eye size={13} />}
                    </button>
                  </div>
                </div>
              ))}
              {error && <p className="text-xs text-[#f43f5e]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{error}</p>}
              <button type="submit"
                className="w-full bg-accent text-accent-foreground py-2.5 text-xs font-semibold hover:opacity-90 transition-opacity"
                style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                CRIAR CONTA
              </button>
            </form>
          )}
        </div>

        <p className="text-center text-xs text-muted-foreground mt-4"
          style={{ fontFamily: "'JetBrains Mono', monospace" }}>
          Dados via CoinGecko API · Preços em tempo real
        </p>
      </div>
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────
export default function App() {
  const [session, setSession] = useState<Session | null>(() => {
    try { return JSON.parse(localStorage.getItem("cx_session") ?? "null"); } catch { return null; }
  });

  const [coins, setCoins] = useState<CoinMarket[]>([]);
  const [coinsLoading, setCoinsLoading] = useState(false);
  const [coinsError, setCoinsError] = useState("");
  const [selected, setSelected] = useState<CoinMarket | null>(null);
  const [chartData, setChartData] = useState<ChartPoint[]>([]);
  const [chartLoading, setChartLoading] = useState(false);
  const [fxRates, setFxRates] = useState({ brl: 5.15, eur: 0.92 });

  const [search, setSearch] = useState("");
  const [currency, setCurrency] = useState<Currency>("usd");
  const [tf, setTf] = useState<Timeframe>("1M");
  const [scale, setScale] = useState<ScaleMode>("linear");
  const [investment, setInvestment] = useState("1000");
  const [showFiat, setShowFiat] = useState(false);

  const { sym } = CURRENCIES.find((c) => c.key === currency)!;
  const fxRate = currency === "usd" ? 1 : currency === "brl" ? fxRates.brl : fxRates.eur;

  // ── API calls ──────────────────────────────────────────────────────────────
  const fetchCoins = useCallback(async () => {
    setCoinsLoading(true);
    setCoinsError("");
    try {
      const res = await fetch(
        "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&page=1&sparkline=true&price_change_percentage=24h,7d,1y"
      );
      if (!res.ok) throw new Error(`${res.status}`);
      const data: CoinMarket[] = await res.json();
      setCoins(data);
      if (!selected && data.length > 0) setSelected(data[0]);
    } catch {
      setCoinsError("Falha ao carregar dados. A API pode estar com limite de requisições. Tentando novamente em 60s.");
    } finally {
      setCoinsLoading(false);
    }
  }, [selected]);

  const fetchFx = useCallback(async () => {
    try {
      const res = await fetch("https://open.er-api.com/v6/latest/USD");
      const data = await res.json();
      if (data.rates) setFxRates({ brl: data.rates.BRL, eur: data.rates.EUR });
    } catch { /* keep defaults */ }
  }, []);

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
      let prev = prices[0]?.[1] ?? 1;
      let cum = 0;
      const pts = prices.map(([ts, price]) => {
        const lr = Math.log(price / (prev || 1)) * 100;
        cum += lr;
        prev = price;
        const d = new Date(ts);
        const label = days <= 1
          ? d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
          : days <= 7
          ? d.toLocaleDateString("pt-BR", { weekday: "short", day: "numeric" })
          : days <= 90
          ? d.toLocaleDateString("pt-BR", { day: "numeric", month: "short" })
          : d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });
        return { label, price, logRet: lr, cumLogRet: cum };
      });
      setChartData(pts);
    } catch { /* empty chart */ }
    finally { setChartLoading(false); }
  }, []);

  useEffect(() => {
    if (!session) return;
    fetchCoins();
    fetchFx();
    const t = setInterval(fetchCoins, 60000);
    return () => clearInterval(t);
  }, [session]);

  useEffect(() => {
    if (selected) fetchChart(selected.id, TF_DAYS[tf]);
  }, [selected?.id, tf]);

  // ── Derived ────────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return coins;
    return coins.filter((c) => c.name.toLowerCase().includes(q) || c.symbol.toLowerCase().includes(q));
  }, [coins, search]);

  const change24h = selected?.price_change_percentage_24h ?? 0;
  const coinUp = change24h >= 0;
  const selectedColor = coinUp ? "#10b981" : "#f43f5e";

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
    if (base < 0.01) return "$" + v.toFixed(5);
    if (base < 1) return "$" + v.toFixed(3);
    if (base < 100) return "$" + v.toFixed(1);
    return "$" + (v / 1000).toFixed(1) + "k";
  };

  const tickInterval = Math.max(1, Math.floor(chartData.length / 8));
  const gradId = `grad-${selected?.id ?? "x"}`;

  const invest = parseFloat(investment) || 1000;

  const projectedData = useMemo((): GainPoint[] => {
    if (!selected || chartData.length < 12) return [];
    const seg = Math.floor(chartData.length / 12);
    if (seg < 1) return [];
    const base = chartData[0].price;
    return Array.from({ length: 12 }, (_, i) => {
      const idx = Math.min((i + 1) * seg, chartData.length - 1);
      const pct = ((chartData[idx].price - base) / base) * 100;
      const d = new Date();
      d.setMonth(d.getMonth() - (11 - i));
      return {
        label: d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }),
        pct,
        value: invest * fxRate * (1 + pct / 100),
      };
    });
  }, [selected, chartData, invest, fxRate]);

  const annualPct = selected?.price_change_percentage_1y_in_currency ?? 0;
  const annualValue = invest * fxRate * (1 + annualPct / 100);

  // ── Auth guard ─────────────────────────────────────────────────────────────
  if (!session) {
    return <AuthPage onAuth={() => {
      const s = JSON.parse(localStorage.getItem("cx_session") ?? "null");
      setSession(s);
    }} />;
  }

  function logout() {
    localStorage.removeItem("cx_session");
    setSession(null);
    setCoins([]);
    setSelected(null);
    setChartData([]);
  }

  // ── Fiat data ──────────────────────────────────────────────────────────────
  const fiatItems = [
    { sym2: "USD", name: "Dólar Americano", value: fxRates.brl, unit: "BRL por 1 USD", change: 0.45 },
    { sym2: "EUR", name: "Euro", value: fxRates.brl / fxRates.eur, unit: "BRL por 1 EUR", change: -0.12 },
    { sym2: "BRL", name: "Real Brasileiro", value: 1 / fxRates.brl, unit: "USD por 1 BRL", change: -0.45 },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col"
      style={{ fontFamily: "'DM Sans', sans-serif" }}>

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <header className="border-b border-border flex items-center gap-3 px-4 py-2.5 flex-shrink-0 flex-wrap gap-y-2">
        <div className="flex items-center gap-2">
          <Activity size={15} className="text-accent" />
          <span className="text-sm font-semibold tracking-widest uppercase"
            style={{ fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.2em" }}>
            CRYPTEX
          </span>
        </div>

        {/* Search */}
        <div className="flex-1 min-w-44 max-w-lg relative">
          <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Pesquisar cripto... Bitcoin, ETH, DOGE, SOL..."
            className="w-full bg-secondary border border-border pl-8 pr-8 py-2 text-xs text-foreground outline-none focus:border-accent transition-colors placeholder-muted-foreground"
            style={{ fontFamily: "'JetBrains Mono', monospace" }}
          />
          {search && (
            <button onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X size={11} />
            </button>
          )}
        </div>

        {/* Currency toggle */}
        <div className="flex items-center bg-secondary border border-border overflow-hidden">
          {CURRENCIES.map((c) => (
            <button key={c.key} onClick={() => setCurrency(c.key)}
              className={`px-2.5 py-1.5 text-xs font-medium transition-colors ${
                currency === c.key ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
              style={{ fontFamily: "'JetBrains Mono', monospace" }}>
              {c.sym} {c.label}
            </button>
          ))}
        </div>

        <button onClick={fetchCoins} disabled={coinsLoading}
          className="p-1.5 text-muted-foreground hover:text-foreground transition-colors"
          title="Atualizar dados">
          <RefreshCw size={13} className={coinsLoading ? "animate-spin" : ""} />
        </button>

        {/* Live indicator */}
        <div className="flex items-center gap-1.5">
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#10b981] opacity-75" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-[#10b981]" />
          </span>
          <span className="text-[#10b981] text-xs hidden sm:block"
            style={{ fontFamily: "'JetBrains Mono', monospace" }}>AO VIVO</span>
        </div>

        {/* User */}
        <div className="ml-auto flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-accent/15 border border-accent/25 flex items-center justify-center">
            <User size={11} className="text-accent" />
          </div>
          <span className="text-xs text-muted-foreground hidden sm:block"
            style={{ fontFamily: "'JetBrains Mono', monospace" }}>
            {session.name.split(" ")[0]}
          </span>
          <button onClick={logout} title="Sair"
            className="text-muted-foreground hover:text-[#f43f5e] transition-colors ml-1">
            <LogOut size={13} />
          </button>
        </div>
      </header>

      {/* API error banner */}
      {coinsError && (
        <div className="bg-[#f43f5e]/10 border-b border-[#f43f5e]/20 px-4 py-2 flex items-center gap-2 text-xs text-[#f43f5e] flex-shrink-0"
          style={{ fontFamily: "'JetBrains Mono', monospace" }}>
          <Zap size={11} /> {coinsError}
          <button onClick={fetchCoins} className="ml-2 underline opacity-80 hover:opacity-100">Tentar agora</button>
        </div>
      )}

      {/* ── Body ──────────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden min-h-0">

        {/* ── Sidebar ─────────────────────────────────────────────────────────── */}
        <aside className="w-64 xl:w-72 flex-shrink-0 border-r border-border flex flex-col overflow-hidden">
          <div className="px-3 py-2 border-b border-border flex items-center justify-between flex-shrink-0">
            <span className="text-xs text-muted-foreground" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
              MERCADO {filtered.length > 0 && `(${filtered.length})`}
            </span>
            {coinsLoading && <RefreshCw size={10} className="animate-spin text-muted-foreground" />}
          </div>

          {/* Column labels */}
          <div className="px-3 py-1.5 border-b border-border grid grid-cols-[1fr_auto_auto] gap-1 text-xs text-muted-foreground flex-shrink-0"
            style={{ fontFamily: "'JetBrains Mono', monospace" }}>
            <span>ATIVO</span>
            <span className="text-right pr-1">PREÇO</span>
            <span className="text-right w-14">24H</span>
          </div>

          <div className="overflow-y-auto flex-1 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-border">

            {/* Fiat toggle */}
            <button onClick={() => setShowFiat((v) => !v)}
              className="w-full px-3 py-2 border-b border-border flex items-center justify-between text-xs hover:bg-secondary/50 transition-colors"
              style={{ fontFamily: "'JetBrains Mono', monospace" }}>
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <DollarSign size={10} /> MOEDAS (USD · EUR · BRL)
              </span>
              {showFiat ? <ChevronUp size={11} className="text-muted-foreground" /> : <ChevronDown size={11} className="text-muted-foreground" />}
            </button>

            {showFiat && fiatItems.map(({ sym2, name, value, unit, change }) => {
              const up = change >= 0;
              return (
                <div key={sym2}
                  className={`px-3 py-2 border-b border-border/50 grid grid-cols-[1fr_auto_auto] gap-1 items-center ${
                    !up ? "bg-[#f43f5e]/5" : ""
                  }`}>
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-5 h-5 rounded-full bg-accent/15 flex items-center justify-center text-xs font-bold text-accent flex-shrink-0"
                      style={{ fontFamily: "'JetBrains Mono', monospace" }}>{sym2[0]}</div>
                    <div className="min-w-0">
                      <div className="text-xs font-medium truncate" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{sym2}</div>
                      <div className="text-xs text-muted-foreground truncate" style={{ fontSize: "10px" }}>{unit}</div>
                    </div>
                  </div>
                  <div className="text-right pr-1">
                    <span className="text-xs" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                      {value.toFixed(4)}
                    </span>
                  </div>
                  <div className={`text-xs w-14 text-right flex items-center justify-end gap-0.5 ${up ? "text-[#10b981]" : "text-[#f43f5e]"}`}
                    style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                    {up ? <ChevronUp size={9} /> : <ChevronDown size={9} />}
                    {Math.abs(change).toFixed(2)}%
                  </div>
                </div>
              );
            })}

            {/* Crypto list */}
            {coins.length === 0 && coinsLoading && (
              <div className="p-6 text-center text-xs text-muted-foreground"
                style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                <RefreshCw size={14} className="animate-spin mx-auto mb-2" />
                Carregando mercado...
              </div>
            )}

            {filtered.length === 0 && coins.length > 0 && (
              <div className="p-6 text-center text-xs text-muted-foreground"
                style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                Nenhuma moeda encontrada para "{search}"
              </div>
            )}

            {filtered.map((coin) => {
              const change = coin.price_change_percentage_24h ?? 0;
              const up = change >= 0;
              const active = selected?.id === coin.id;
              return (
                <button key={coin.id} onClick={() => setSelected(coin)}
                  className={`w-full px-3 py-2 border-b border-border/40 grid grid-cols-[1fr_auto_auto] gap-1 items-center text-left transition-colors
                    ${active ? "bg-accent/10 border-l-2 border-l-accent pl-2.5" : "hover:bg-secondary/40"}
                    ${!up && !active ? "bg-[#f43f5e]/5" : ""}`}>
                  <div className="flex items-center gap-2 min-w-0">
                    <img src={coin.image} alt={coin.symbol} className="w-5 h-5 rounded-full flex-shrink-0"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                    <div className="min-w-0">
                      <div className="text-xs font-medium uppercase truncate"
                        style={{ fontFamily: "'JetBrains Mono', monospace" }}>{coin.symbol}</div>
                      <div className="text-muted-foreground truncate" style={{ fontSize: "10px" }}>{coin.name}</div>
                    </div>
                  </div>
                  <div className="text-right pr-1">
                    <span className="text-xs" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                      {fmtPrice(coin.current_price * fxRate, sym)}
                    </span>
                  </div>
                  <div className={`text-xs w-14 text-right flex items-center justify-end gap-0.5 ${up ? "text-[#10b981]" : "text-[#f43f5e]"}`}
                    style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                    {up ? <ChevronUp size={9} /> : <ChevronDown size={9} />}
                    {Math.abs(change).toFixed(2)}%
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        {/* ── Main area ──────────────────────────────────────────────────────── */}
        <main className="flex-1 overflow-y-auto p-4 space-y-4 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-border">
          {!selected ? (
            <div className="flex flex-col items-center justify-center h-64 gap-2 text-muted-foreground"
              style={{ fontFamily: "'JetBrains Mono', monospace" }}>
              {coinsLoading
                ? <><RefreshCw size={18} className="animate-spin" /><span className="text-xs">Carregando mercado...</span></>
                : <span className="text-xs">Selecione uma moeda na lista</span>}
            </div>
          ) : (
            <>
              {/* ── Coin header ─────────────────────────────────────────────── */}
              <div className="flex flex-wrap items-start gap-4 justify-between">
                <div className="flex items-center gap-3">
                  <img src={selected.image} alt={selected.name} className="w-9 h-9 rounded-full" />
                  <div>
                    <div className="flex items-center gap-2">
                      <h1 className="text-base font-semibold" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                        {selected.symbol.toUpperCase()}/USDT
                      </h1>
                      <span className="text-xs text-muted-foreground">{selected.name}</span>
                      <span className="text-xs text-muted-foreground border border-border px-1.5 py-0.5">
                        #{selected.market_cap_rank}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className="text-xl font-medium" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                        {fmtPrice(selected.current_price * fxRate, sym)}
                      </span>
                      <span className={`text-sm flex items-center gap-0.5 ${coinUp ? "text-[#10b981]" : "text-[#f43f5e]"}`}
                        style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                        {coinUp ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
                        {pctText(change24h)} (24h)
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {[
                    { label: "CAP. MERCADO", value: fmtCompact(selected.market_cap * fxRate, sym) },
                    { label: "VOLUME 24H", value: fmtCompact(selected.total_volume * fxRate, sym) },
                    { label: "7 DIAS", value: pctText(selected.price_change_percentage_7d_in_currency ?? 0), color: pctColor(selected.price_change_percentage_7d_in_currency ?? 0) },
                    { label: "1 ANO", value: pctText(selected.price_change_percentage_1y_in_currency ?? 0), color: pctColor(selected.price_change_percentage_1y_in_currency ?? 0) },
                  ].map(({ label, value, color }) => (
                    <div key={label} className="bg-card border border-border px-3 py-2">
                      <div className="text-xs text-muted-foreground" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{label}</div>
                      <div className="text-sm font-medium mt-0.5" style={{ fontFamily: "'JetBrains Mono', monospace", color: color ?? undefined }}>{value}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* ── Chart controls ──────────────────────────────────────────── */}
              <div className="flex flex-wrap items-center gap-2 justify-between">
                <div className="flex items-center bg-secondary border border-border overflow-hidden">
                  {TIMEFRAMES.map((t) => (
                    <button key={t} onClick={() => setTf(t)}
                      className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                        tf === t ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"
                      }`}
                      style={{ fontFamily: "'JetBrains Mono', monospace" }}>{t}</button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground hidden sm:block"
                    style={{ fontFamily: "'JetBrains Mono', monospace" }}>ESCALA:</span>
                  <div className="flex items-center bg-secondary border border-border overflow-hidden">
                    {([["linear", "LINEAR"], ["log", "LOG"], ["logret", "LOG RET"]] as [ScaleMode, string][]).map(([k, l]) => (
                      <button key={k} onClick={() => setScale(k)}
                        className={`px-2.5 py-1.5 text-xs font-medium transition-colors ${
                          scale === k ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"
                        }`}
                        style={{ fontFamily: "'JetBrains Mono', monospace" }}>{l}</button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Scale hint */}
              {scale !== "linear" && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground border-l-2 border-accent pl-3"
                  style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                  <Zap size={10} className="text-accent flex-shrink-0" />
                  {scale === "log"
                    ? "Escala logarítmica: distâncias iguais = variações percentuais iguais. Ideal para ativos com grande amplitude histórica."
                    : "Retorno Logarítmico Acumulado: ln(Pt/P0) × 100. Base da teoria financeira moderna — simetria perfeita entre ganhos e perdas."}
                </div>
              )}

              {/* ── Main chart ──────────────────────────────────────────────── */}
              <div className="bg-card border border-border relative" style={{ height: 290 }}>
                {chartLoading && (
                  <div className="absolute inset-0 flex items-center justify-center bg-card/80 z-10">
                    <RefreshCw size={16} className="animate-spin text-accent" />
                  </div>
                )}
                <div className="flex items-center justify-between px-4 pt-3 pb-0">
                  <span className="text-xs font-medium" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                    {selected.symbol.toUpperCase()} ·{" "}
                    {scale === "logret" ? "Retorno Log Acumulado" : `Preço (${sym})`}
                  </span>
                  <span className={`text-xs px-1.5 py-0.5 border ${coinUp ? "border-[#10b981]/30 text-[#10b981]" : "border-[#f43f5e]/30 text-[#f43f5e]"}`}
                    style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                    {coinUp ? "▲" : "▼"} {pctText(change24h)}
                  </span>
                </div>
                <ResponsiveContainer width="100%" height={252}>
                  <AreaChart data={chartData} margin={{ top: 8, right: 16, left: 8, bottom: 4 }}>
                    <defs>
                      <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={selectedColor} stopOpacity={0.18} />
                        <stop offset="100%" stopColor={selectedColor} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="2 8" stroke="rgba(255,255,255,0.04)" vertical={false} />
                    <XAxis dataKey="label"
                      tick={{ fill: "#5a7394", fontSize: 9, fontFamily: "'JetBrains Mono', monospace" }}
                      axisLine={false} tickLine={false} interval={tickInterval} />
                    <YAxis
                      scale={scale === "log" ? "log" : "auto"}
                      domain={yDomain}
                      tickFormatter={yFormatter}
                      tick={{ fill: "#5a7394", fontSize: 9, fontFamily: "'JetBrains Mono', monospace" }}
                      axisLine={false} tickLine={false} width={58} allowDataOverflow />
                    <Tooltip
                      cursor={{ stroke: "rgba(255,255,255,0.08)", strokeWidth: 1 }}
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const d = payload[0]?.payload as ChartPoint;
                        return (
                          <div className="bg-card border border-border px-3 py-2 text-xs"
                            style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                            <div className="text-muted-foreground mb-1">{d?.label}</div>
                            {scale === "logret"
                              ? <div style={{ color: (d?.cumLogRet ?? 0) >= 0 ? "#10b981" : "#f43f5e" }}>
                                  Ret. Log: {(d?.cumLogRet ?? 0) >= 0 ? "+" : ""}{(d?.cumLogRet ?? 0).toFixed(3)}%
                                </div>
                              : <div className="text-foreground font-medium">{fmtPrice((d?.price ?? 0) * fxRate, sym)}</div>
                            }
                          </div>
                        );
                      }}
                    />
                    {scale === "logret" && (
                      <ReferenceLine y={0} stroke="rgba(255,255,255,0.15)" strokeDasharray="3 5" />
                    )}
                    <Area type="monotone" dataKey={yKey} stroke={selectedColor} strokeWidth={1.5}
                      fill={`url(#${gradId})`} dot={false}
                      activeDot={{ r: 3, fill: selectedColor, strokeWidth: 0 }}
                      isAnimationActive={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              {/* ── Projected gains ─────────────────────────────────────────── */}
              <div className="bg-card border border-border p-4">
                <div className="flex items-center gap-2 mb-4">
                  <Calculator size={13} className="text-accent" />
                  <span className="text-sm font-medium" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                    SIMULAÇÃO DE GANHO — {selected.symbol.toUpperCase()}
                  </span>
                </div>

                {/* Input + summary */}
                <div className="flex flex-wrap items-end gap-3 mb-5">
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1.5"
                      style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                      INVESTIMENTO ({sym})
                    </label>
                    <input type="number" value={investment} onChange={(e) => setInvestment(e.target.value)} min="1"
                      className="bg-secondary border border-border px-3 py-2 text-sm text-foreground outline-none focus:border-accent transition-colors w-32"
                      style={{ fontFamily: "'JetBrains Mono', monospace" }} />
                  </div>

                  {/* Annual summary cards */}
                  {[
                    {
                      label: "VALOR APÓS 1 ANO",
                      val: `${sym}${annualValue.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                      sub: `Baseado em ${pctText(annualPct)} (12m)`,
                      color: pctColor(annualPct),
                    },
                    {
                      label: "LUCRO / PREJUÍZO",
                      val: `${annualValue - invest * fxRate >= 0 ? "+" : ""}${sym}${Math.abs(annualValue - invest * fxRate).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                      sub: annualValue >= invest * fxRate ? "Lucro estimado" : "Prejuízo estimado",
                      color: pctColor(annualPct),
                    },
                    {
                      label: "RETORNO MENSAL MÉD.",
                      val: `${pctText(annualPct / 12)}`,
                      sub: "Média aritmética",
                      color: pctColor(annualPct / 12),
                    },
                  ].map(({ label, val, sub, color }) => (
                    <div key={label} className="bg-secondary border border-border px-3 py-2.5">
                      <div className="text-xs text-muted-foreground" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{label}</div>
                      <div className="text-base font-medium mt-0.5" style={{ fontFamily: "'JetBrains Mono', monospace", color }}>{val}</div>
                      <div className="text-xs text-muted-foreground mt-0.5" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{sub}</div>
                    </div>
                  ))}
                </div>

                {/* Monthly bar chart */}
                {projectedData.length > 0 ? (
                  <>
                    <div className="text-xs text-muted-foreground mb-2" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                      EVOLUÇÃO MENSAL DO PORTFÓLIO ({sym}) — linha pontilhada = investimento inicial
                    </div>
                    <div style={{ height: 150 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={projectedData} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="2 6" stroke="rgba(255,255,255,0.04)" vertical={false} />
                          <XAxis dataKey="label"
                            tick={{ fill: "#5a7394", fontSize: 9, fontFamily: "'JetBrains Mono', monospace" }}
                            axisLine={false} tickLine={false} />
                          <YAxis
                            tickFormatter={(v) => v >= 1000 ? `${sym}${(v / 1000).toFixed(0)}k` : `${sym}${v.toFixed(0)}`}
                            tick={{ fill: "#5a7394", fontSize: 9, fontFamily: "'JetBrains Mono', monospace" }}
                            axisLine={false} tickLine={false} width={52} />
                          <ReferenceLine y={invest * fxRate} stroke="rgba(255,255,255,0.2)" strokeDasharray="3 5" />
                          <Tooltip
                            cursor={{ fill: "rgba(255,255,255,0.03)" }}
                            content={({ active, payload }) => {
                              if (!active || !payload?.length) return null;
                              const d = payload[0]?.payload as GainPoint;
                              return (
                                <div className="bg-card border border-border px-3 py-2 text-xs"
                                  style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                                  <div className="text-muted-foreground mb-1">{d?.label}</div>
                                  <div style={{ color: d?.pct >= 0 ? "#10b981" : "#f43f5e" }}>
                                    {sym}{d?.value?.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                                  </div>
                                  <div style={{ color: d?.pct >= 0 ? "#10b981" : "#f43f5e" }}>
                                    {d?.pct >= 0 ? "+" : ""}{d?.pct?.toFixed(2)}%
                                  </div>
                                </div>
                              );
                            }}
                          />
                          <Bar dataKey="value" radius={[2, 2, 0, 0]} isAnimationActive={false}>
                            {projectedData.map((entry, i) => (
                              <Cell key={i} fill={entry.pct >= 0 ? "#10b981" : "#f43f5e"} fillOpacity={0.75} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>

                    {/* Monthly table */}
                    <div className="mt-3 grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-1.5">
                      {projectedData.map(({ label, pct: p, value: v }) => (
                        <div key={label}
                          className={`border px-2 py-2 text-center ${p >= 0 ? "border-[#10b981]/20 bg-[#10b981]/5" : "border-[#f43f5e]/20 bg-[#f43f5e]/5"}`}>
                          <div className="text-xs text-muted-foreground" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "10px" }}>{label}</div>
                          <div className={`text-xs font-medium mt-0.5 ${p >= 0 ? "text-[#10b981]" : "text-[#f43f5e]"}`}
                            style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                            {p >= 0 ? "+" : ""}{p.toFixed(1)}%
                          </div>
                          <div className="text-xs text-foreground/80 mt-0.5" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "10px" }}>
                            {sym}{v >= 1000 ? (v / 1000).toFixed(1) + "k" : v.toFixed(0)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="text-xs text-muted-foreground py-4 text-center border border-border"
                    style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                    {chartLoading ? "Carregando dados históricos..." : "Selecione 1Y ou 3M para ver a evolução mensal."}
                  </div>
                )}

                <p className="text-xs text-muted-foreground mt-3 border-t border-border pt-3"
                  style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                  ⚠ Simulação baseada em performance histórica. Rentabilidade passada não garante resultados futuros.
                </p>
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
