import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  Activity,
  ArrowDown,
  ArrowUp,
  BarChart3,
  Bell,
  Check,
  ChevronRight,
  CircleHelp,
  Clock3,
  Cpu,
  Database,
  Gauge,
  Layers3,
  LineChart,
  ListFilter,
  Menu,
  MoreHorizontal,
  Play,
  RotateCcw,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Target,
  TriangleAlert,
  X,
  Zap,
} from 'lucide-react';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ErrorBoundary } from '@/components/error-boundary';
import NotFound from '@/pages/not-found';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';

const queryClient = new QueryClient();

type CircuitConfig = {
  family: string;
  architecture: string;
  bitWidth: number;
  pipelineDepth: number;
  clockPeriod: number;
  toggleActivity: number;
};

type Prediction = {
  power: number;
  energy: number;
  area: number;
  delay: number;
  wns: number;
  confidence: number;
  modelName: string;
};

type ViolationFlag = {
  metric: string;
  severity: 'warning' | 'critical';
  message: string;
};

type Candidate = CircuitConfig & Prediction & { id: string; pareto: boolean };

type ModelScore = {
  name: string;
  mae: string;
  rmse: string;
  r2: string;
  inference: string;
  color: string;
};

const models: ModelScore[] = [
  { name: 'CatBoost', mae: '0.071', rmse: '0.118', r2: '0.943', inference: '7 ms', color: 'hsl(182 88% 55%)' },
  { name: 'XGBoost', mae: '0.084', rmse: '0.139', r2: '0.926', inference: '8 ms', color: 'hsl(33 94% 63%)' },
  { name: 'LightGBM', mae: '0.091', rmse: '0.148', r2: '0.918', inference: '6 ms', color: 'hsl(145 64% 62%)' },
  { name: 'Random Forest', mae: '0.103', rmse: '0.166', r2: '0.901', inference: '11 ms', color: 'hsl(210 80% 72%)' },
  { name: 'Linear Regression', mae: '0.177', rmse: '0.249', r2: '0.782', inference: '2 ms', color: 'hsl(45 88% 68%)' },
  { name: 'ANN / MLP', mae: '0.126', rmse: '0.204', r2: '0.871', inference: '3 ms', color: 'hsl(270 72% 72%)' },
];

const defaultConfig: CircuitConfig = {
  family: 'Adder',
  architecture: 'Ripple-carry',
  bitWidth: 16,
  pipelineDepth: 1,
  clockPeriod: 2.5,
  toggleActivity: 38,
};

const familyOptions: Record<string, string[]> = {
  Adder: ['Ripple-carry', 'Carry-lookahead', 'Carry-select'],
  ALU: ['Carry-lookahead', 'Ripple carry', 'Kogge-Stone'],
  MAC: ['Wallace tree', 'Array multiplier', 'Booth radix-4'],
  'FIR filter': ['Systolic', 'Transposed', 'Distributed arithmetic'],
  Comparator: ['Magnitude', 'Equality', 'Priority'],
};

function predict(config: CircuitConfig, model: string, offset = 0): Prediction {
  const familyFactor = { Adder: 0.68, ALU: 0.82, MAC: 1, 'FIR filter': 1.2, Comparator: 0.54 }[config.family as keyof typeof familyOptions] ?? 1;
  const architectureFactor = config.architecture.includes('Wallace') || config.architecture.includes('Kogge') || config.architecture.includes('Carry-lookahead') ? 1.12 : config.architecture.includes('Ripple') ? 0.86 : 1;
  const widthFactor = config.bitWidth / 16;
  const power = (1.17 * familyFactor * widthFactor * architectureFactor) * (1 + config.toggleActivity / 170) * (1 + config.pipelineDepth * 0.045) + offset;
  const delay = (1.38 * familyFactor * architectureFactor * (config.bitWidth / 24)) / (1 + config.pipelineDepth * 0.13);
  const area = 26.4 * familyFactor * widthFactor * architectureFactor * (1 + config.pipelineDepth * 0.035) + offset * 7;
  const energy = power * config.clockPeriod * 0.78;
  const confidence = Math.max(0.82, 0.974 - Math.abs(config.bitWidth - 16) * 0.006 - config.pipelineDepth * 0.006 - (model === 'ANN / MLP' ? 0.055 : model === 'Linear Regression' ? 0.07 : model === 'XGBoost' || model === 'LightGBM' ? 0.022 : 0));
  return { power, energy, area, delay, wns: config.clockPeriod - delay, confidence, modelName: model };
}

function num(value: number, digits = 2) {
  return value.toFixed(digits);
}

function SectionLabel({ children }: { children: ReactNode }) {
  return <p className="font-mono-ui tracking-console text-[10px] uppercase text-slate-500">{children}</p>;
}

function PanelTitle({ icon: Icon, eyebrow, title, detail, action }: { icon: typeof Activity; eyebrow: string; title: string; detail?: string; action?: ReactNode }) {
  return (
    <div className="panel-header flex items-start justify-between gap-4 px-5 py-4">
      <div className="flex min-w-0 items-start gap-3">
        <div className="mt-0.5 rounded-md border border-cyan-400/20 bg-cyan-400/10 p-2 text-cyan-300"><Icon size={15} /></div>
        <div className="min-w-0">
          <SectionLabel>{eyebrow}</SectionLabel>
          <h2 className="mt-1 truncate text-sm font-semibold text-slate-100">{title}</h2>
          {detail && <p className="mt-1 text-[11px] leading-relaxed text-slate-500">{detail}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

function AppSidebar({ active, onSelect, collapsed, onToggle, mobileOpen }: { active: string; onSelect: (label: string) => void; collapsed: boolean; onToggle: () => void; mobileOpen: boolean }) {
  const items = [
    { label: 'Overview', icon: Gauge },
    { label: 'Sweep queue', icon: Layers3 },
    { label: 'Model bench', icon: BarChart3 },
    { label: 'Dataset', icon: Database },
  ];
  return (
    <aside className={`${collapsed ? 'w-[72px]' : 'w-[230px]'} ${mobileOpen ? 'fixed inset-y-0 left-0 z-40 flex shadow-2xl shadow-black/50' : 'hidden'} shrink-0 flex-col border-r border-slate-800/90 bg-[#0c121b] transition-[width] duration-300 lg:static lg:flex`}>
      <div className="flex h-[72px] items-center gap-3 border-b border-slate-800/90 px-5">
        <div className="signal flex h-8 w-8 items-center justify-center rounded-md bg-cyan-300 text-[#0b1219]"><Cpu size={17} /></div>
        {!collapsed && <div><p className="text-sm font-extrabold tracking-tight text-slate-100">PPA<span className="text-cyan-300">/LAB</span></p><p className="font-mono-ui text-[9px] tracking-[.18em] text-slate-500">RTL EXPLORER</p></div>}
      </div>
      <div className="flex-1 px-3 py-6">
        {!collapsed && <SectionLabel>Workspace</SectionLabel>}
        <nav className="mt-3 space-y-1">
          {items.map(({ label, icon: Icon }) => (
            <button data-testid={`button-nav-${label.toLowerCase().replace(' ', '-')}`} key={label} onClick={() => onSelect(label)} className={`button-console flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-xs ${active === label ? 'bg-cyan-400/10 text-cyan-200' : 'text-slate-500 hover:bg-slate-800/60 hover:text-slate-300'}`}>
              <Icon size={16} className={active === label ? 'text-cyan-300' : ''} />
              {!collapsed && <span>{label}</span>}
              {!collapsed && active === label && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-cyan-300" />}
            </button>
          ))}
        </nav>
        {!collapsed && <div className="mt-10"><SectionLabel>Current run</SectionLabel><div className="mt-3 rounded-md border border-slate-800 bg-slate-900/50 p-3"><div className="flex items-center gap-2"><span className="status-dot" /><span className="font-mono-ui text-[10px] text-cyan-200">RUN 0247</span></div><p className="mt-2 text-[11px] leading-relaxed text-slate-500">Interactive prediction workspace</p><div className="mt-3 h-1 overflow-hidden rounded-full bg-slate-800"><div className="h-full w-[68%] rounded-full bg-cyan-400" /></div><p className="mt-1 text-right font-mono-ui text-[9px] text-slate-600">68% ready</p></div></div>}
      </div>
      <div className="border-t border-slate-800/90 p-3">
        <button data-testid="button-toggle-sidebar" onClick={onToggle} className="button-console flex w-full items-center gap-3 rounded-md px-3 py-2 text-xs text-slate-500 hover:bg-slate-800/60 hover:text-slate-300">
          {collapsed ? <ChevronRight size={16} /> : <X size={15} />}
          {!collapsed && <span>Collapse rail</span>}
        </button>
        <div className={`mt-3 flex items-center gap-2 px-2 ${collapsed ? 'justify-center' : ''}`}><div className="flex h-7 w-7 items-center justify-center rounded-full border border-amber-300/30 bg-amber-300/10 font-mono-ui text-[10px] text-amber-200">AK</div>{!collapsed && <div><p className="text-[11px] font-medium text-slate-300">A. Kulkarni</p><p className="text-[10px] text-slate-600">Faculty reviewer</p></div>}</div>
      </div>
    </aside>
  );
}

function ConfigurationPanel({ config, setConfig, onReset }: { config: CircuitConfig; setConfig: (next: CircuitConfig) => void; onReset: () => void }) {
  const set = <K extends keyof CircuitConfig>(key: K, value: CircuitConfig[K]) => setConfig({ ...config, [key]: value });
  return (
    <section className="panel scanline reveal rounded-lg" data-testid="panel-configuration">
      <PanelTitle icon={SlidersHorizontal} eyebrow="01 / input space" title="Circuit configuration" detail="Tune the design point before asking the surrogate models." action={<button data-testid="button-reset-config" onClick={onReset} className="button-console flex items-center gap-1.5 rounded border border-slate-700 px-2 py-1.5 text-[10px] text-slate-500 hover:border-slate-500 hover:text-slate-300"><RotateCcw size={12} /> Reset</button>} />
      <div className="space-y-5 p-5">
        <label className="block"><span className="mb-2 block text-[11px] font-medium text-slate-400">Circuit family</span><select data-testid="select-circuit-family" className="select-console w-full text-xs" value={config.family} onChange={(e) => setConfig({ ...config, family: e.target.value, architecture: familyOptions[e.target.value][0] })}>{Object.keys(familyOptions).map((family) => <option key={family}>{family}</option>)}</select></label>
        <label className="block"><span className="mb-2 block text-[11px] font-medium text-slate-400">Architecture</span><select data-testid="select-architecture" className="select-console w-full text-xs" value={config.architecture} onChange={(e) => set('architecture', e.target.value)}>{familyOptions[config.family].map((architecture) => <option key={architecture}>{architecture}</option>)}</select></label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block"><span className="mb-2 block text-[11px] font-medium text-slate-400">Bit width</span><select data-testid="select-bit-width" className="select-console w-full text-xs" value={config.bitWidth} onChange={(e) => set('bitWidth', Number(e.target.value))}>{[8, 16, 24, 32].map((width) => <option key={width} value={width}>{width} bit</option>)}</select></label>
          <label className="block"><span className="mb-2 block text-[11px] font-medium text-slate-400">Pipeline depth</span><select data-testid="select-pipeline-depth" className="select-console w-full text-xs" value={config.pipelineDepth} onChange={(e) => set('pipelineDepth', Number(e.target.value))}>{[0, 1, 2, 3, 4].map((depth) => <option key={depth} value={depth}>{depth} stage{depth === 1 ? '' : 's'}</option>)}</select></label>
        </div>
        <label className="block"><div className="mb-2 flex items-center justify-between"><span className="text-[11px] font-medium text-slate-400">Clock period</span><span className="font-mono-ui text-[11px] text-cyan-300">{num(config.clockPeriod)} ns</span></div><input data-testid="input-clock-period" className="range-console" type="range" min="1" max="5" step=".1" value={config.clockPeriod} onChange={(e) => set('clockPeriod', Number(e.target.value))} /><div className="mt-1 flex justify-between font-mono-ui text-[9px] text-slate-600"><span>1.0 ns</span><span>5.0 ns</span></div></label>
        <label className="block"><div className="mb-2 flex items-center justify-between"><span className="text-[11px] font-medium text-slate-400">Toggle activity</span><span className="font-mono-ui text-[11px] text-cyan-300">{config.toggleActivity}%</span></div><input data-testid="input-toggle-activity" className="range-console" type="range" min="5" max="90" step="1" value={config.toggleActivity} onChange={(e) => set('toggleActivity', Number(e.target.value))} /><div className="mt-1 flex justify-between font-mono-ui text-[9px] text-slate-600"><span>low activity</span><span>high activity</span></div></label>
      </div>
    </section>
  );
}

function PredictionPanel({ prediction, selectedModel, onModelChange }: { prediction: Prediction; selectedModel: string; onModelChange: (name: string) => void }) {
  const values = [
    { label: 'Dynamic power', value: `${num(prediction.power)} mW`, accent: 'text-cyan-300', sub: 'target < 1.60 mW' },
    { label: 'Energy / op', value: `${num(prediction.energy)} pJ`, accent: 'text-amber-200', sub: 'target < 3.80 pJ' },
    { label: 'Cell area', value: `${num(prediction.area)} µm²`, accent: 'text-violet-200', sub: 'target < 34.00 µm²' },
    { label: 'Critical delay', value: `${num(prediction.delay)} ns`, accent: prediction.wns < 0 ? 'text-red-300' : 'text-emerald-300', sub: `${prediction.wns >= 0 ? '+' : ''}${num(prediction.wns)} ns WNS` },
  ];
  return (
    <section className="panel scanline reveal rounded-lg" style={{ animationDelay: '60ms' }} data-testid="panel-prediction">
      <PanelTitle icon={Activity} eyebrow="02 / surrogate inference" title="Predicted PPA profile" detail="Estimated from the selected configuration and model." action={<div className="flex items-center gap-2 rounded border border-emerald-300/20 bg-emerald-300/5 px-2 py-1.5"><span className="status-dot !h-1.5 !w-1.5 !bg-emerald-300 !shadow-none" /><span className="font-mono-ui text-[9px] text-emerald-300">LIVE</span></div>} />
      <div className="grid grid-cols-2 gap-px bg-slate-800/70 sm:grid-cols-4">
        {values.map((item) => <div data-testid={`metric-${item.label.toLowerCase().replaceAll(' ', '-')}`} key={item.label} className="bg-[#121b27] px-4 py-5"><p className="text-[10px] text-slate-500">{item.label}</p><p className={`metric-value mt-2 text-xl font-medium ${item.accent}`}>{item.value}</p><p className="mt-2 font-mono-ui text-[9px] text-slate-600">{item.sub}</p></div>)}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <div><p className="text-[11px] text-slate-500">Active predictor</p><div className="mt-2 flex flex-wrap gap-1.5">{models.map((model) => <button data-testid={`button-model-${model.name}`} key={model.name} onClick={() => onModelChange(model.name)} className={`button-console rounded border px-2.5 py-1.5 font-mono-ui text-[10px] ${selectedModel === model.name ? 'border-cyan-300/50 bg-cyan-300/10 text-cyan-200' : 'border-slate-700 text-slate-500 hover:border-slate-500'}`}>{model.name}</button>)}</div></div>
        <div className="flex items-center gap-2 border-l border-slate-800 pl-4"><ShieldCheck size={15} className="text-cyan-300" /><div><p className="font-mono-ui text-sm text-slate-200">{(prediction.confidence * 100).toFixed(1)}%</p><p className="text-[9px] uppercase tracking-wider text-slate-600">confidence</p></div></div>
      </div>
    </section>
  );
}

function FlagsPanel({ flags, budgets, setBudgets }: { flags: ViolationFlag[]; budgets: { power: number; area: number; timing: number }; setBudgets: (next: { power: number; area: number; timing: number }) => void }) {
  return (
    <section className="panel reveal rounded-lg" style={{ animationDelay: '120ms' }} data-testid="panel-budget">
      <PanelTitle icon={TriangleAlert} eyebrow="03 / constraints" title="Budget & violations" detail="Adjust limits to see feasibility flags react." />
      <div className="grid gap-5 p-5 xl:grid-cols-[1fr_1.2fr]">
        <div className="grid grid-cols-3 gap-2">
          {([['power', 'Power', 'mW'], ['area', 'Area', 'µm²'], ['timing', 'WNS', 'ns']] as const).map(([key, label, unit]) => <label key={key} className="block"><span className="mb-2 block text-[10px] text-slate-500">{label} budget</span><div className="relative"><input data-testid={`input-budget-${key}`} className="input-console w-full pr-8 font-mono-ui text-[11px]" type="number" min="0" step=".1" value={budgets[key]} onChange={(e) => setBudgets({ ...budgets, [key]: Number(e.target.value) })} /><span className="pointer-events-none absolute right-2 top-3 font-mono-ui text-[9px] text-slate-600">{unit}</span></div></label>)}
        </div>
        <div className="min-h-[70px] space-y-2">
          {flags.length === 0 ? <div data-testid="status-no-violations" className="flex h-full items-center gap-2 rounded border border-emerald-300/20 bg-emerald-300/5 px-3 text-[11px] text-emerald-300"><Check size={15} /> All constraints pass at this design point.</div> : flags.map((flag, index) => <div data-testid={`status-violation-${index}`} key={flag.metric} className="flex items-start gap-2 rounded border border-red-300/15 bg-red-300/5 px-3 py-2"><TriangleAlert size={14} className="mt-0.5 shrink-0 text-red-300" /><div><p className="font-mono-ui text-[10px] uppercase text-red-200">{flag.metric} / {flag.severity}</p><p className="mt-0.5 text-[10px] text-slate-500">{flag.message}</p></div></div>)}
        </div>
      </div>
    </section>
  );
}

function CandidateTable({ candidates, onApply }: { candidates: Candidate[]; onApply: (candidate: Candidate) => void }) {
  return (
    <section className="panel reveal rounded-lg" style={{ animationDelay: '180ms' }} data-testid="panel-candidates">
      <PanelTitle icon={Target} eyebrow="04 / exploration output" title="Candidate frontier" detail="Design points returned by the local optimization run." action={<div className="flex items-center gap-2 text-[10px] text-slate-500"><ListFilter size={13} /> Pareto-ranked</div>} />
      <div className="mobile-scroll">
        <table className="w-full min-w-[720px] text-left">
          <thead><tr className="border-b border-slate-800 text-[9px] uppercase tracking-wider text-slate-600"><th className="px-5 py-3 font-medium">Candidate</th><th className="px-3 py-3 font-medium">Config</th><th className="px-3 py-3 font-medium">Power</th><th className="px-3 py-3 font-medium">Area</th><th className="px-3 py-3 font-medium">Delay</th><th className="px-3 py-3 font-medium">WNS</th><th className="px-5 py-3 text-right font-medium">Action</th></tr></thead>
          <tbody>{candidates.map((candidate, index) => <tr data-testid={`row-candidate-${candidate.id}`} key={candidate.id} className="border-b border-slate-800/70 last:border-0 hover:bg-slate-800/25"><td className="px-5 py-3.5"><div className="flex items-center gap-2"><span className={`h-1.5 w-1.5 rounded-full ${candidate.pareto ? 'bg-cyan-300' : 'bg-slate-600'}`} /><span className="font-mono-ui text-[11px] text-slate-300">C-{String(index + 1).padStart(2, '0')}</span>{candidate.pareto && <span className="rounded bg-cyan-300/10 px-1.5 py-0.5 font-mono-ui text-[8px] text-cyan-300">PARETO</span>}</div></td><td className="px-3 py-3.5"><p className="text-[11px] text-slate-300">{candidate.bitWidth}b / {candidate.pipelineDepth} stage</p><p className="mt-0.5 text-[9px] text-slate-600">{candidate.architecture}</p></td><td className="metric-value px-3 py-3.5 text-[11px] text-cyan-200">{num(candidate.power)} <span className="font-sans text-[9px] text-slate-600">mW</span></td><td className="metric-value px-3 py-3.5 text-[11px] text-violet-200">{num(candidate.area, 1)}</td><td className="metric-value px-3 py-3.5 text-[11px] text-slate-300">{num(candidate.delay)} <span className="font-sans text-[9px] text-slate-600">ns</span></td><td className={`metric-value px-3 py-3.5 text-[11px] ${candidate.wns >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>{candidate.wns >= 0 ? '+' : ''}{num(candidate.wns)}</td><td className="px-5 py-3.5 text-right"><button data-testid={`button-apply-${candidate.id}`} onClick={() => onApply(candidate)} className="button-console rounded border border-slate-700 px-2.5 py-1.5 text-[10px] text-slate-400 hover:border-cyan-300/40 hover:text-cyan-200">Load point</button></td></tr>)}</tbody>
        </table>
      </div>
    </section>
  );
}

function ModelPanel({ selected, toggleModel }: { selected: string[]; toggleModel: (name: string) => void }) {
  return (
    <section className="panel reveal rounded-lg" style={{ animationDelay: '240ms' }} data-testid="panel-models">
      <PanelTitle icon={LineChart} eyebrow="05 / model comparison" title="Validation bench" detail="Cross-validation scores on held-out RTL sweep samples." action={<span className="font-mono-ui text-[9px] text-slate-600">N = 2,480</span>} />
      <div className="flex flex-wrap gap-2 border-b border-slate-800 px-5 py-3">{models.map((model) => <button data-testid={`toggle-filter-${model.name}`} key={model.name} onClick={() => toggleModel(model.name)} className={`button-console flex items-center gap-2 rounded border px-2.5 py-1.5 font-mono-ui text-[9px] ${selected.includes(model.name) ? 'border-slate-600 bg-slate-800/70 text-slate-200' : 'border-slate-800 text-slate-600'}`}><span className="h-1.5 w-1.5 rounded-full" style={{ background: selected.includes(model.name) ? model.color : 'hsl(215 18% 35%)' }} />{model.name}</button>)}</div>
      {selected.length === 0 ? <div data-testid="status-models-empty" className="flex min-h-[170px] items-center justify-center px-5 text-center text-[11px] text-slate-600">Select a model above to restore its validation trace.</div> : <div className="divide-y divide-slate-800/80">{models.filter((model) => selected.includes(model.name)).map((model) => <div data-testid={`row-model-${model.name}`} key={model.name} className="grid grid-cols-[1.5fr_repeat(4,1fr)] items-center gap-3 px-5 py-3.5"><div className="flex min-w-0 items-center gap-2"><span className="h-2 w-2 rounded-full" style={{ background: model.color }} /><span className="truncate text-[11px] text-slate-300">{model.name}</span></div><div><p className="metric-value text-[11px] text-slate-300">{model.mae}</p><p className="text-[8px] text-slate-600">MAE</p></div><div><p className="metric-value text-[11px] text-slate-300">{model.rmse}</p><p className="text-[8px] text-slate-600">RMSE</p></div><div><p className="metric-value text-[11px] text-emerald-300">{model.r2}</p><p className="text-[8px] text-slate-600">R²</p></div><div><p className="metric-value text-[11px] text-slate-300">{model.inference}</p><p className="text-[8px] text-slate-600">latency</p></div></div>)}</div>}
    </section>
  );
}

function DatasetPanel({ refreshed, onRefresh }: { refreshed: string; onRefresh: () => void }) {
  return (
    <section className="panel reveal rounded-lg" style={{ animationDelay: '300ms' }} data-testid="panel-dataset">
      <PanelTitle icon={Database} eyebrow="06 / training substrate" title="Dataset health" detail="Versioned samples available to the inference layer." action={<button data-testid="button-refresh-dataset" onClick={onRefresh} className="button-console rounded border border-slate-700 p-1.5 text-slate-500 hover:border-slate-500 hover:text-slate-200"><RotateCcw size={13} /></button>} />
      <div className="grid grid-cols-2 gap-x-5 gap-y-4 p-5 sm:grid-cols-4"><div><p className="text-[9px] uppercase tracking-wider text-slate-600">Samples</p><p data-testid="text-dataset-samples" className="metric-value mt-1 text-lg text-slate-200">2,480</p></div><div><p className="text-[9px] uppercase tracking-wider text-slate-600">Families</p><p className="metric-value mt-1 text-lg text-slate-200">04</p></div><div><p className="text-[9px] uppercase tracking-wider text-slate-600">Validation</p><p className="metric-value mt-1 text-lg text-slate-200">20%</p></div><div><p className="text-[9px] uppercase tracking-wider text-slate-600">Last refresh</p><p data-testid="text-dataset-refresh" className="metric-value mt-1 text-sm text-cyan-200">{refreshed}</p></div></div>
    </section>
  );
}

function Home() {
  const [config, setConfig] = useState<CircuitConfig>(defaultConfig);
  const [selectedModel, setSelectedModel] = useState('CatBoost');
  const [selectedModels, setSelectedModels] = useState(models.map((model) => model.name));
  const [budgets, setBudgets] = useState({ power: 1.6, area: 34, timing: 0 });
  const [runId, setRunId] = useState(0);
  const [optimizing, setOptimizing] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [activeNav, setActiveNav] = useState('Overview');
  const [toast, setToast] = useState('');
  const [refreshed, setRefreshed] = useState('12 min ago');

  useEffect(() => { document.title = 'PPA/LAB — RTL design-space exploration'; }, []);

  const prediction = useMemo(() => predict(config, selectedModel), [config, selectedModel]);
  const flags = useMemo<ViolationFlag[]>(() => {
    const next: ViolationFlag[] = [];
    if (prediction.power > budgets.power) next.push({ metric: 'Power', severity: prediction.power > budgets.power * 1.18 ? 'critical' : 'warning', message: `${num(prediction.power - budgets.power)} mW above the active budget.` });
    if (prediction.area > budgets.area) next.push({ metric: 'Area', severity: prediction.area > budgets.area * 1.2 ? 'critical' : 'warning', message: `${num(prediction.area - budgets.area, 1)} µm² above the active budget.` });
    if (prediction.wns < budgets.timing) next.push({ metric: 'Timing', severity: prediction.wns < budgets.timing - .25 ? 'critical' : 'warning', message: `${num(Math.abs(prediction.wns - budgets.timing))} ns of slack required to close.` });
    return next;
  }, [budgets, prediction]);
  const candidates = useMemo<Candidate[]>(() => {
    const points = [
      { width: Math.max(8, config.bitWidth / 2), depth: Math.max(1, config.pipelineDepth - 1), period: Math.max(1.4, config.clockPeriod - .3), activity: Math.max(15, config.toggleActivity - 11), offset: -.14 },
      { width: config.bitWidth, depth: config.pipelineDepth, period: config.clockPeriod, activity: config.toggleActivity, offset: 0 },
      { width: config.bitWidth, depth: config.pipelineDepth + 1, period: config.clockPeriod + .2, activity: Math.max(10, config.toggleActivity - 6), offset: -.05 },
      { width: Math.min(32, config.bitWidth * 2), depth: config.pipelineDepth + 1, period: Math.max(1.2, config.clockPeriod - .4), activity: config.toggleActivity, offset: .12 },
      { width: Math.max(8, config.bitWidth / 2), depth: config.pipelineDepth + 2, period: config.clockPeriod + .5, activity: Math.max(8, config.toggleActivity - 15), offset: -.11 },
    ];
    return points.map((point, index) => {
      const pointConfig = { ...config, bitWidth: point.width, pipelineDepth: point.depth, clockPeriod: point.period, toggleActivity: point.activity };
      const result = predict(pointConfig, selectedModel, point.offset + runId * (index % 2 === 0 ? -.015 : .01));
      return { ...pointConfig, ...result, id: `${runId}-${index}`, pareto: index === 0 || index === 2 || index === 4 };
    });
  }, [config, runId, selectedModel]);

  const optimize = () => {
    setOptimizing(true);
    window.setTimeout(() => { setRunId((value) => value + 1); setOptimizing(false); setToast('Sweep complete — frontier refreshed'); }, 650);
  };
  const loadCandidate = (candidate: Candidate) => {
    setConfig({ family: candidate.family, architecture: candidate.architecture, bitWidth: candidate.bitWidth, pipelineDepth: candidate.pipelineDepth, clockPeriod: candidate.clockPeriod, toggleActivity: candidate.toggleActivity });
    setToast('Candidate loaded into the active workspace');
  };
  const toggleModel = (name: string) => setSelectedModels((current) => current.includes(name) ? current.filter((item) => item !== name) : [...current, name]);
  const refreshDataset = () => { setRefreshed('just now'); setToast('Dataset manifest refreshed locally'); };

  return (
    <div className="console-shell console-grid flex min-h-[100dvh] text-slate-100">
      <AppSidebar active={activeNav} onSelect={(label) => { setActiveNav(label); setToast(`${label} view selected — workspace data remains in local demo mode`); }} collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} mobileOpen={mobileOpen} />
      <main className="min-w-0 flex-1">
        <header className="flex min-h-[72px] items-center justify-between border-b border-slate-800/90 bg-[#0c121b]/90 px-4 backdrop-blur sm:px-7">
          <div className="flex items-center gap-3"><button data-testid="button-mobile-menu" onClick={() => setMobileOpen(!mobileOpen)} className="button-console rounded border border-slate-700 p-2 text-slate-400 lg:hidden"><Menu size={16} /></button><div><div className="flex items-center gap-2"><span className="status-dot" /><span className="font-mono-ui text-[9px] tracking-[.18em] text-cyan-300">LAB ONLINE</span></div><p className="mt-1 text-[11px] text-slate-500">/ {activeNav.toLowerCase()} <span className="px-1 text-slate-700">/</span> run 0247</p></div></div>
          <div className="flex items-center gap-2"><button data-testid="button-help" onClick={() => setToast('Help: adjust constraints, then run a local sweep')} className="button-console rounded border border-transparent p-2 text-slate-500 hover:border-slate-700 hover:text-slate-300"><CircleHelp size={16} /></button><button data-testid="button-notifications" onClick={() => setToast('No new reviewer annotations')} className="button-console relative rounded border border-transparent p-2 text-slate-500 hover:border-slate-700 hover:text-slate-300"><Bell size={16} /><span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-amber-300" /></button><button data-testid="button-settings" onClick={() => setToast('Workspace settings are fixed for this local demo')} className="button-console rounded border border-transparent p-2 text-slate-500 hover:border-slate-700 hover:text-slate-300"><Settings2 size={16} /></button></div>
        </header>
        <div className="mx-auto max-w-[1500px] px-4 py-6 sm:px-7 sm:py-8">
          <div className="mb-7 flex flex-col justify-between gap-5 xl:flex-row xl:items-end"><div><SectionLabel>Research instrument / PPA optimization</SectionLabel><h1 data-testid="text-page-title" className="mt-2 max-w-3xl text-2xl font-semibold tracking-tight text-slate-100 sm:text-3xl">Make the next RTL sweep <span className="text-cyan-300">worth synthesizing.</span></h1><p className="mt-2 max-w-2xl text-xs leading-relaxed text-slate-500 sm:text-sm">Explore parameterized circuits with fast surrogate predictions, then hand a defensible Pareto frontier to your reviewer.</p></div><div className="flex items-center gap-3"><div className="hidden items-center gap-2 rounded border border-slate-800 bg-slate-900/50 px-3 py-2 sm:flex"><Clock3 size={14} className="text-slate-500" /><span className="font-mono-ui text-[10px] text-slate-400">EST. SWEEP <span className="text-slate-200">42 sec</span></span></div><button data-testid="button-optimize" onClick={optimize} disabled={optimizing} className="button-console signal flex items-center gap-2 rounded-md bg-cyan-300 px-4 py-2.5 text-xs font-bold text-[#0b1219] disabled:cursor-wait disabled:opacity-70">{optimizing ? <Activity size={15} className="animate-pulse" /> : <Sparkles size={15} />}{optimizing ? 'Running sweep…' : 'Optimize frontier'}<ChevronRight size={14} /></button></div></div>
          <div className="grid gap-5 xl:grid-cols-[300px_minmax(0,1fr)]"><ConfigurationPanel config={config} setConfig={setConfig} onReset={() => { setConfig(defaultConfig); setToast('Configuration reset to the reference point'); }} /><div className="min-w-0 space-y-5"><PredictionPanel prediction={prediction} selectedModel={selectedModel} onModelChange={setSelectedModel} /><FlagsPanel flags={flags} budgets={budgets} setBudgets={setBudgets} /></div></div>
          <div className="mt-5"><CandidateTable candidates={candidates} onApply={loadCandidate} /></div>
          <div className="mt-5 grid gap-5 xl:grid-cols-[1.35fr_1fr]"><ModelPanel selected={selectedModels} toggleModel={toggleModel} /><DatasetPanel refreshed={refreshed} onRefresh={refreshDataset} /></div>
          <footer className="flex flex-col gap-2 border-t border-slate-800/80 py-6 text-[10px] text-slate-600 sm:flex-row sm:items-center sm:justify-between"><p className="font-mono-ui">PPA/LAB · LOCAL DEMO DATA · SYNOPSIS MODE</p><p className="flex items-center gap-1.5"><Zap size={11} className="text-amber-300" /> Predictions are directional until confirmed by synthesis.</p></footer>
        </div>
      </main>
      {toast && <div data-testid="status-toast" className="fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-md border border-cyan-300/20 bg-[#111d29] px-4 py-3 shadow-xl shadow-black/30"><Check size={14} className="text-cyan-300" /><span className="text-[11px] text-slate-300">{toast}</span><button data-testid="button-dismiss-toast" onClick={() => setToast('')} className="ml-2 text-slate-600 hover:text-slate-300"><X size={13} /></button></div>}
    </div>
  );
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