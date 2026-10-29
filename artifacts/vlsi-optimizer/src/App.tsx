import { type FormEvent, type ReactNode, useEffect, useMemo, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  Activity, Check, ChevronDown, ChevronRight, CircleHelp, Clock3, Cpu,
  FlaskConical, Gauge, Menu, RotateCcw, Search, ShieldCheck, TriangleAlert, X, Zap,
} from 'lucide-react';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ErrorBoundary } from '@/components/error-boundary';
import NotFound from '@/pages/not-found';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';

const queryClient = new QueryClient();
const FAMILIES = ['Adder', 'Comparator', 'Multiplier', 'ALU'] as const;
const WIDTHS = [8, 16, 24, 32] as const;
const ARCHITECTURE_COUNTS: Record<typeof FAMILIES[number], number> = { Adder: 3, Comparator: 2, Multiplier: 2, ALU: 2 };
type Family = typeof FAMILIES[number];
type Workload = 'random' | 'low-toggle' | 'arithmetic';
type Constraints = {
  clockPeriodNs: number;
  inputDelayNs: number;
  outputDelayNs: number;
  [key: string]: unknown;
};
type EdaResult = {
  family?: string;
  architecture: string;
  bitWidth: number;
  areaUm2: number;
  routedDelayNs: number;
  totalPowerW: number;
  detailedRouteDrcViolations: number;
  workloadActivity: string | number;
  simulation: string;
  timingSource: string;
  powerActivity: string;
  pareto: boolean;
};
type EdaRun = {
  status: 'complete';
  id: string;
  createdAt: string;
  platform: string;
  toolVersions: Record<string, string>;
  constraints?: Constraints;
  results: EdaResult[];
  history?: EdaRun[];
};

function fmt(value: number, digits = 3) {
  return Number.isFinite(value) ? value.toFixed(digits) : '—';
}

function SectionLabel({ children }: { children: ReactNode }) {
  return <p className="font-mono-ui tracking-console text-[10px] uppercase text-slate-500">{children}</p>;
}

function PanelHeading({ icon: Icon, eyebrow, title, detail }: { icon: typeof Cpu; eyebrow: string; title: string; detail?: string }) {
  return <div className="panel-header flex items-start gap-3 px-5 py-4">
    <div className="mt-0.5 rounded-md border border-cyan-400/20 bg-cyan-400/10 p-2 text-cyan-300"><Icon size={15} /></div>
    <div><SectionLabel>{eyebrow}</SectionLabel><h2 className="mt-1 text-sm font-semibold text-slate-100">{title}</h2>{detail && <p className="mt-1 text-[11px] leading-relaxed text-slate-500">{detail}</p>}</div>
  </div>;
}

function Field({ label, hint, value, onChange, min, max, step = 0.05 }: {
  label: string; hint: string; value: number; onChange: (value: number) => void; min: number; max: number; step?: number;
}) {
  return <label className="block">
    <span className="mb-1.5 flex items-center justify-between gap-2 text-[11px] font-medium text-slate-400"><span>{label}</span><span className="font-mono-ui text-[10px] text-cyan-300">{fmt(value, 2)} ns</span></span>
    <input className="input-console w-full font-mono-ui text-xs" type="number" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
    <span className="mt-1 block text-[9px] text-slate-600">{hint}</span>
  </label>;
}

function ResultTable({ run }: { run: EdaRun }) {
  const rows = run.results;
  if (!rows.length) return <div className="px-5 py-12 text-center"><div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full border border-slate-700 bg-slate-900 text-slate-500"><Search size={17} /></div><h3 className="mt-4 text-sm font-medium text-slate-300">No candidates returned</h3><p className="mt-1 text-[11px] text-slate-500">This completed search produced no measured candidate rows.</p></div>;
  return <div className="mobile-scroll">
    <table className="w-full min-w-[1040px] text-left">
      <thead><tr className="border-b border-slate-800 text-[9px] uppercase tracking-wider text-slate-600">
        {['Family / architecture', 'Width', 'Mapped area', 'Routed delay', 'Total power', 'Route DRC', 'Workload activity', 'Timing source', 'Power activity', 'Simulation', 'PPA'].map((label) => <th key={label} className="px-3 py-3 first:pl-5 last:pr-5 font-medium">{label}</th>)}
      </tr></thead>
      <tbody>{rows.map((item, index) => <tr key={`${item.family}-${item.architecture}-${item.bitWidth}-${index}`} className="border-b border-slate-800/70 last:border-0 hover:bg-slate-800/25">
        <td className="px-5 py-3.5"><p className="text-[11px] text-slate-200">{item.family ?? 'Adder'} <span className="text-slate-600">/</span> {item.architecture}</p><p className="mt-1 font-mono-ui text-[9px] text-slate-600">MEASURED · {String(index + 1).padStart(2, '0')}</p></td>
        <td className="px-3 py-3.5 font-mono-ui text-[11px] text-slate-300">{item.bitWidth} bit</td>
        <td className="metric-value px-3 py-3.5 text-[11px] text-violet-200">{fmt(item.areaUm2)} <span className="font-sans text-[9px] text-slate-600">µm²</span></td>
        <td className="metric-value px-3 py-3.5 text-[11px] text-amber-200">{fmt(item.routedDelayNs)} <span className="font-sans text-[9px] text-slate-600">ns</span></td>
        <td className="metric-value px-3 py-3.5 text-[11px] text-cyan-200">{(item.totalPowerW * 1000).toPrecision(4)} <span className="font-sans text-[9px] text-slate-600">mW</span></td>
        <td className={`px-3 py-3.5 font-mono-ui text-[11px] ${item.detailedRouteDrcViolations === 0 ? 'text-emerald-300' : 'text-amber-200'}`}>{item.detailedRouteDrcViolations}</td>
        <td className="px-3 py-3.5 text-[10px] text-slate-400">{String(item.workloadActivity)}</td>
        <td className="px-3 py-3.5 text-[9px] text-slate-400">{item.timingSource || 'Not provided'}</td>
        <td className="px-3 py-3.5 text-[9px] text-slate-400">{item.powerActivity || 'Not provided'}</td>
        <td className="px-3 py-3.5 text-[10px] text-slate-300">{item.simulation}</td>
        <td className="px-3 py-3.5">{item.pareto ? <span className="rounded border border-cyan-300/20 bg-cyan-300/5 px-1.5 py-1 font-mono-ui text-[8px] text-cyan-200">FRONTIER</span> : <span className="text-slate-700">—</span>}</td>
      </tr>)}</tbody>
    </table>
    <div className="border-t border-slate-800 px-5 py-3 text-[9px] text-slate-500">Timing and power activity provenance are reported per candidate. Detailed-route DRC count is the returned routing validation metric.</div>
  </div>;
}

function RunSummary({ run }: { run: EdaRun }) {
  const tools = Object.entries(run.toolVersions ?? {});
  return <section className="panel reveal rounded-lg" data-testid="panel-eda-results">
    <div className="flex flex-col gap-3 border-b border-slate-800 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex items-start gap-3"><div className="mt-0.5 rounded-md border border-emerald-300/20 bg-emerald-300/10 p-2 text-emerald-300"><ShieldCheck size={15} /></div><div><SectionLabel>Measured EDA / search {run.id?.slice(0, 8)}</SectionLabel><h2 className="mt-1 text-sm font-semibold text-slate-100">Returned candidate results</h2><p className="mt-1 text-[11px] text-slate-500">{run.platform} · {run.results.length} measured candidate{run.results.length === 1 ? '' : 's'} · {new Date(run.createdAt).toLocaleString()}</p></div></div>
      <span className="w-fit rounded border border-emerald-300/20 bg-emerald-300/5 px-2 py-1 font-mono-ui text-[9px] text-emerald-200">EDA RESPONSE</span>
    </div>
    <div className="grid grid-cols-2 gap-px bg-slate-800/70 sm:grid-cols-4">
      <div className="bg-[#121b27] px-4 py-3"><p className="text-[9px] uppercase tracking-wider text-slate-600">Clock target</p><p className="metric-value mt-1 text-sm text-slate-200">{fmt(run.constraints?.clockPeriodNs ?? Number.NaN, 2)} ns</p></div>
      <div className="bg-[#121b27] px-4 py-3"><p className="text-[9px] uppercase tracking-wider text-slate-600">Input delay</p><p className="metric-value mt-1 text-sm text-slate-200">{fmt(run.constraints?.inputDelayNs ?? Number.NaN, 2)} ns</p></div>
      <div className="bg-[#121b27] px-4 py-3"><p className="text-[9px] uppercase tracking-wider text-slate-600">Output delay</p><p className="metric-value mt-1 text-sm text-slate-200">{fmt(run.constraints?.outputDelayNs ?? Number.NaN, 2)} ns</p></div>
      <div className="bg-[#121b27] px-4 py-3"><p className="text-[9px] uppercase tracking-wider text-slate-600">Platform</p><p className="mt-1 truncate text-xs text-slate-200">{run.platform}</p></div>
    </div>
    <ResultTable run={run} />
    <div className="border-t border-slate-800 px-5 py-3 text-[9px] text-slate-600">{tools.length ? tools.map(([name, version]) => `${name} ${version}`).join(' · ') : 'Tool versions were not included in the response.'} · Values shown are returned EDA results; no local estimates are displayed.</div>
  </section>;
}

function Home() {
  const [families, setFamilies] = useState<Family[]>(['Adder']);
  const [widths, setWidths] = useState<number[]>([8, 16, 24, 32]);
  const [clockPeriodNs, setClockPeriodNs] = useState(2.5);
  const [inputDelayNs, setInputDelayNs] = useState(0.2);
  const [outputDelayNs, setOutputDelayNs] = useState(0.2);
  const [workloadProfile, setWorkloadProfile] = useState<Workload>('random');
  const [run, setRun] = useState<EdaRun | null>(null);
  const [history, setHistory] = useState<EdaRun[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [activeSection, setActiveSection] = useState('Search setup');
  const candidateCount = families.reduce((count, family) => count + ARCHITECTURE_COUNTS[family], 0) * widths.length;
  useEffect(() => {
    let active = true;
    fetch('/api/benchmark/runs')
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data?.error ?? 'Could not load saved EDA runs.');
        if (active && Array.isArray(data.runs)) setHistory(data.runs);
      })
      .catch((reason) => {
        if (active) setError(reason instanceof Error ? reason.message : 'Could not load saved EDA runs.');
      });
    return () => { active = false; };
  }, []);
  const validation = useMemo(() => {
    if (!families.length) return 'Choose at least one supported circuit family.';
    if (!widths.length) return 'Choose at least one supported width.';
    if ([clockPeriodNs, inputDelayNs, outputDelayNs].some((value) => !Number.isFinite(value) || value < 0)) return 'Timing values must be valid non-negative numbers.';
    if (clockPeriodNs <= inputDelayNs + outputDelayNs) return 'Clock period must exceed the combined input and output delays.';
    if (candidateCount > 16) return 'Search is limited to 16 measured architectures.';
    return '';
  }, [families, widths, clockPeriodNs, inputDelayNs, outputDelayNs, candidateCount]);
  useEffect(() => { document.title = 'PPA/LAB — measured RTL exploration'; }, []);

  const toggleFamily = (family: Family) => setFamilies((current) => current.includes(family) ? current.filter((item) => item !== family) : FAMILIES.filter((item) => current.includes(item) || item === family));
  const toggleWidth = (width: number) => setWidths((current) => current.includes(width) ? current.filter((item) => item !== width) : WIDTHS.filter((item) => current.includes(item) || item === width));
  const reset = () => {
    setFamilies(['Adder']); setWidths([8, 16, 24, 32]); setClockPeriodNs(2.5);
    setInputDelayNs(0.2); setOutputDelayNs(0.2); setWorkloadProfile('random'); setError('');
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (validation || loading) return;
    setLoading(true); setError('');
    try {
      const response = await fetch('/api/benchmark/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ families, widths, clockPeriodNs, inputDelayNs, outputDelayNs, workloadProfile }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error ?? `Search failed (${response.status})`);
      if (data.status !== 'complete' || !Array.isArray(data.results)) throw new Error('The EDA service returned an incomplete or invalid search response.');
      setRun(data as EdaRun);
      if (Array.isArray(data.history)) setHistory(data.history);
      else setHistory((previous) => [data as EdaRun, ...previous.filter((item) => item.id !== data.id)].slice(0, 5));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'EDA search could not complete. Try again.');
    } finally { setLoading(false); }
  };

  const navigate = (name: string, id: string) => {
    setActiveSection(name);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setMobileOpen(false);
  };
  return <div className="console-shell console-grid flex min-h-[100dvh] text-slate-100">
    {mobileOpen && <button aria-label="Close navigation" onClick={() => setMobileOpen(false)} className="fixed inset-0 z-30 bg-slate-950/70 lg:hidden" />}
    <aside className={`${mobileOpen ? 'fixed inset-y-0 left-0 z-40 flex shadow-2xl' : 'hidden'} w-[230px] shrink-0 flex-col border-r border-slate-800/90 bg-[#0c121b] lg:static lg:flex`}>
      <div className="flex h-[72px] items-center gap-3 border-b border-slate-800/90 px-5"><div className="signal flex h-8 w-8 items-center justify-center rounded-md bg-cyan-300 text-[#0b1219]"><Cpu size={17} /></div><div><p className="text-sm font-extrabold tracking-tight text-slate-100">PPA<span className="text-cyan-300">/LAB</span></p><p className="font-mono-ui text-[9px] tracking-[.18em] text-slate-500">RTL EXPLORER</p></div><button onClick={() => setMobileOpen(false)} className="ml-auto rounded p-1 text-slate-500 lg:hidden" aria-label="Close menu"><X size={16} /></button></div>
      <div className="flex-1 px-3 py-6"><SectionLabel>Workspace</SectionLabel><nav className="mt-3 space-y-1">
        {[['Search setup', 'setup', FlaskConical], ['Measured results', 'results', Gauge], ['Run history', 'history', Clock3]].map(([name, id, Icon]) => {
          const NavIcon = Icon as typeof Cpu; const text = name as string;
          return <button key={text} onClick={() => navigate(text, id as string)} className={`button-console flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-xs ${activeSection === text ? 'bg-cyan-400/10 text-cyan-200' : 'text-slate-500 hover:bg-slate-800/60 hover:text-slate-300'}`}><NavIcon size={16} />{text}{activeSection === text && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-cyan-300" />}</button>;
        })}
      </nav><div className="mt-10"><SectionLabel>Supported scope</SectionLabel><div className="mt-3 rounded-md border border-slate-800 bg-slate-900/50 p-3"><div className="flex items-center gap-2"><span className="status-dot" /><span className="font-mono-ui text-[10px] text-cyan-200">4 FAMILIES · 4 WIDTHS</span></div><p className="mt-2 text-[11px] leading-relaxed text-slate-500">Adder, Comparator, Multiplier, ALU · 8–32 bit</p></div></div></div>
      <div className="border-t border-slate-800/90 px-5 py-4"><p className="font-mono-ui text-[9px] tracking-wider text-slate-600">MEASUREMENTS ONLY</p><p className="mt-1 text-[10px] text-slate-500">No surrogate preview in this workflow.</p></div>
    </aside>
    <main className="min-w-0 flex-1">
      <header className="flex min-h-[72px] items-center justify-between border-b border-slate-800/90 bg-[#0c121b]/90 px-4 backdrop-blur sm:px-7">
        <div className="flex items-center gap-3"><button onClick={() => setMobileOpen(true)} className="button-console rounded border border-slate-700 p-2 text-slate-400 lg:hidden" aria-label="Open navigation"><Menu size={16} /></button><div><div className="flex items-center gap-2"><span className="status-dot" /><span className="font-mono-ui text-[9px] tracking-[.18em] text-cyan-300">EDA SEARCH</span></div><p className="mt-1 text-[11px] text-slate-500">Built-in RTL families <span className="px-1 text-slate-700">/</span> measured flow</p></div></div>
        <button onClick={() => setError('Select families, widths, constraints and a workload profile, then submit the bounded EDA search.')} className="button-console flex items-center gap-2 rounded border border-slate-800 px-3 py-2 text-[10px] text-slate-500 hover:text-slate-300"><CircleHelp size={14} /><span className="hidden sm:inline">Workflow help</span></button>
      </header>
      <div className="mx-auto max-w-[1440px] px-4 py-6 sm:px-7 sm:py-8">
        <div className="mb-7 flex flex-col justify-between gap-4 lg:flex-row lg:items-end"><div><SectionLabel>OpenROAD / design-space exploration</SectionLabel><h1 className="mt-2 max-w-3xl text-2xl font-semibold tracking-tight text-slate-100 sm:text-3xl">Search the design space.<br className="hidden sm:block" /> <span className="text-cyan-300">Trust only what was measured.</span></h1><p className="mt-3 max-w-2xl text-xs leading-relaxed text-slate-500 sm:text-sm">Configure supported circuit families, widths, timing constraints and workload. Every candidate below comes from the EDA search response.</p></div>
           <div className="flex items-center gap-2 self-start rounded border border-slate-800 bg-slate-900/50 px-3 py-2 lg:self-auto"><Activity size={14} className="text-cyan-300" /><span className="font-mono-ui text-[10px] text-slate-400">MAX <span className="text-slate-200">16 measured designs</span></span></div>
        </div>
        <form id="setup" onSubmit={submit} className="panel scanline reveal rounded-lg">
           <div className="flex flex-col justify-between gap-3 border-b border-slate-800 px-5 py-4 sm:flex-row sm:items-start"><div className="flex items-start gap-3"><div className="mt-0.5 rounded-md border border-cyan-400/20 bg-cyan-400/10 p-2 text-cyan-300"><FlaskConical size={15} /></div><div><SectionLabel>01 / configure experiment</SectionLabel><h2 className="mt-1 text-sm font-semibold text-slate-100">Bounded EDA search</h2><p className="mt-1 text-[11px] text-slate-500">Select built-in families and widths. Searches run and measure up to 16 architectures.</p></div></div><button type="button" onClick={reset} className="button-console flex items-center gap-1.5 self-start rounded border border-slate-700 px-2.5 py-1.5 text-[10px] text-slate-500 hover:border-slate-500 hover:text-slate-300"><RotateCcw size={12} /> Reset</button></div>
          <div className="grid gap-x-8 gap-y-7 p-5 lg:grid-cols-[1fr_1fr]">
            <fieldset><legend className="mb-3 text-[11px] font-medium text-slate-400">Circuit families</legend><div className="grid grid-cols-2 gap-2">
              {FAMILIES.map((family) => <label key={family} className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-3 text-xs transition-colors ${families.includes(family) ? 'border-cyan-300/30 bg-cyan-300/[0.07] text-cyan-100' : 'border-slate-800 bg-slate-900/30 text-slate-500 hover:border-slate-700'}`}><input type="checkbox" checked={families.includes(family)} onChange={() => toggleFamily(family)} className="accent-cyan-300" />{family}</label>)}
            </div></fieldset>
            <fieldset><legend className="mb-3 text-[11px] font-medium text-slate-400">Bit widths</legend><div className="grid grid-cols-4 gap-2">
              {WIDTHS.map((width) => <label key={width} className={`flex cursor-pointer items-center justify-center gap-2 rounded-md border px-2 py-3 text-xs transition-colors ${widths.includes(width) ? 'border-cyan-300/30 bg-cyan-300/[0.07] text-cyan-100' : 'border-slate-800 bg-slate-900/30 text-slate-500 hover:border-slate-700'}`}><input type="checkbox" checked={widths.includes(width)} onChange={() => toggleWidth(width)} className="accent-cyan-300" />{width}</label>)}
             </div><p className="mt-2 font-mono-ui text-[9px] text-slate-600">{candidateCount} / 16 measured architectures selected</p></fieldset>
            <div className="grid gap-4 sm:grid-cols-3 lg:col-span-2">
              <Field label="Clock period" hint="Target clock period" value={clockPeriodNs} onChange={setClockPeriodNs} min={0.1} max={100} />
              <Field label="Input delay" hint="External input arrival" value={inputDelayNs} onChange={setInputDelayNs} min={0} max={99} />
              <Field label="Output delay" hint="External output requirement" value={outputDelayNs} onChange={setOutputDelayNs} min={0} max={99} />
            </div>
            <label className="block lg:col-span-2"><span className="mb-2 block text-[11px] font-medium text-slate-400">Workload profile</span><span className="relative block"><select value={workloadProfile} onChange={(event) => setWorkloadProfile(event.target.value as Workload)} className="select-console w-full text-xs"><option value="random">Random — broad switching activity</option><option value="low-toggle">Low-toggle — reduced switching workload</option><option value="arithmetic">Arithmetic — operand-focused workload</option></select><ChevronDown size={13} className="pointer-events-none absolute right-3 top-3 text-slate-600" /></span><span className="mt-1 block text-[9px] text-slate-600">Activity and power provenance are reported with returned results.</span></label>
          </div>
          <div className="flex flex-col gap-3 border-t border-slate-800 bg-slate-950/20 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"><div className="min-h-5 text-[10px]">{validation ? <span className="flex items-center gap-1.5 text-amber-200"><TriangleAlert size={13} />{validation}</span> : <span className="flex items-center gap-1.5 text-slate-500"><Check size={13} className="text-emerald-300" />Constraints valid · {candidateCount} measured candidates</span>}</div><button data-testid="button-search" type="submit" disabled={loading || !!validation} className="button-console signal flex items-center justify-center gap-2 rounded-md bg-cyan-300 px-4 py-2.5 text-xs font-bold text-[#0b1219] disabled:cursor-not-allowed disabled:opacity-50">{loading ? <Activity size={15} className="animate-pulse" /> : <Search size={15} />}{loading ? 'Running EDA search…' : 'Submit EDA search'}<ChevronRight size={14} /></button></div>
        </form>
        {error && <div role="alert" data-testid="status-search-error" className="mt-4 flex items-start gap-3 rounded-md border border-red-300/20 bg-red-300/5 px-4 py-3 text-[11px] text-red-100"><TriangleAlert size={15} className="mt-0.5 shrink-0 text-red-300" /><div className="flex-1"><p className="font-medium">Search needs attention</p><p className="mt-1 text-red-100/70">{error}</p></div><button onClick={() => setError('')} aria-label="Dismiss error" className="text-red-100/50 hover:text-red-100"><X size={14} /></button></div>}
        <section id="results" className="mt-6 scroll-mt-4 panel reveal rounded-lg" style={{ animationDelay: '90ms' }}>
          {run ? <RunSummary run={run} /> : <div><PanelHeading icon={Gauge} eyebrow="02 / measured results" title={loading ? 'EDA search in progress' : 'Results appear after a measured search'} detail={loading ? 'Submitting the configured search to the EDA service. No candidate estimates are shown.' : 'Candidate metrics are intentionally absent until the EDA service returns measured results.'} />
            {loading ? <div className="space-y-3 p-5" aria-label="Search loading"><div className="h-3 w-2/3 animate-pulse rounded bg-slate-800" /><div className="h-3 w-full animate-pulse rounded bg-slate-800" /><div className="h-3 w-4/5 animate-pulse rounded bg-slate-800" /></div> : <div className="flex items-center gap-4 px-5 py-9"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-800 bg-slate-900/60 text-slate-500"><Search size={16} /></div><div><p className="text-xs font-medium text-slate-300">No measured candidates yet</p><p className="mt-1 text-[10px] text-slate-600">Set up a search above to receive synthesis, routing, timing and power results.</p></div></div>}
          </div>}
        </section>
        {(run || history.length > 0) && <section id="history" className="mt-5 scroll-mt-4 panel reveal rounded-lg" style={{ animationDelay: '150ms' }}>
          <PanelHeading icon={Clock3} eyebrow="03 / saved runs" title="Search history" detail="Recent searches saved in the workspace." />
          <div className="divide-y divide-slate-800/70">{history.map((item) => <button key={item.id} onClick={() => setRun(item)} className={`flex w-full items-center justify-between gap-3 px-5 py-3 text-left hover:bg-slate-800/30 ${run?.id === item.id ? 'bg-cyan-300/[0.04]' : ''}`}><span className="min-w-0"><span className="block truncate font-mono-ui text-[10px] text-slate-300">{item.id.slice(0, 12)} · {new Date(item.createdAt).toLocaleString()}</span><span className="mt-1 block text-[9px] text-slate-600">{item.results.length} measured results · {item.platform}</span></span><span className="shrink-0 text-[10px] text-cyan-200">View</span></button>)}</div>
        </section>}
        <footer className="mt-6 flex flex-col gap-2 border-t border-slate-800/80 py-6 text-[10px] text-slate-600 sm:flex-row sm:items-center sm:justify-between"><p className="font-mono-ui">PPA/LAB · EDA SEARCH</p><p className="flex items-center gap-1.5"><Zap size={11} className="text-amber-300" />Measured outputs only · validation, routing and power provenance shown per run.</p></footer>
      </div>
    </main>
  </div>;
}

function Router() {
  return <RoutedErrorBoundary><Switch><Route path="/" component={Home} /><Route component={NotFound} /></Switch></RoutedErrorBoundary>;
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><Router /></WouterRouter><Toaster /></TooltipProvider></QueryClientProvider>;
}

export default App;
