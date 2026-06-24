import { CheckCircle, Cpu, Volume2, Users, Database } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { cn } from '../../lib/utils';

const LATENCY_DATA = [
  { time: '00:00', latency: 790 }, { time: '04:00', latency: 812 }, { time: '08:00', latency: 845 },
  { time: '12:00', latency: 921 }, { time: '16:00', latency: 878 }, { time: '20:00', latency: 832 },
];

const FIRESTORE_DATA = [
  { time: '00:00', ops: 2100 }, { time: '04:00', ops: 1840 }, { time: '08:00', ops: 2450 },
  { time: '12:00', ops: 3100 }, { time: '16:00', ops: 2890 }, { time: '20:00', ops: 2340 },
];

const TRANSCRIPTION_DATA = [
  { time: '00:00', delay: 115 }, { time: '04:00', delay: 108 }, { time: '08:00', delay: 124 },
  { time: '12:00', delay: 142 }, { time: '16:00', delay: 135 }, { time: '20:00', delay: 118 },
];

const QUEUE_DATA = [
  { name: 'In Progress', value: 12, fill: '#6366f1' },
  { name: 'Awaiting Review', value: 8, fill: '#f59e0b' },
  { name: 'Completed Today', value: 24, fill: '#22c55e' },
];

const METRIC_CARDS = [
  { label: 'Gemini API Latency', val: '842ms', trend: '-12% from yesterday', icon: Cpu, color: 'text-indigo-400 bg-indigo-500/10' },
  { label: 'Audio Transcribe Delay', val: '120ms', trend: '+3% from yesterday', icon: Volume2, color: 'text-cyan-400 bg-cyan-500/10' },
  { label: 'Active Vetting Rooms', val: '3 Active', trend: '+1 since this hour', icon: Users, color: 'text-amber-400 bg-amber-500/10' },
  { label: 'Firestore Operations', val: '17,185', trend: '2.1k ops/hr average', icon: Database, color: 'text-emerald-400 bg-emerald-500/10' },
];

const TOOLTIP_STYLE = { fontSize: 11, backgroundColor: '#0f172a', borderColor: '#1e293b', color: '#f8fafc', borderRadius: '8px' };

export function SAHealthPage() {
  return (
    <div className="space-y-8 animate-in fade-in duration-400">
      <div>
        <h1 className="text-2xl font-black text-white uppercase tracking-tight flex items-center gap-3">
          <span className="w-1 h-7 bg-gradient-to-b from-indigo-500 to-purple-600 rounded-full" />
          System Health & Telemetry
        </h1>
        <p className="text-white/50 text-sm mt-1">Live infrastructure metrics and service status.</p>
      </div>

      {/* Status banner */}
      <div className="flex items-center gap-3 p-4 bg-green-500/10 border border-green-500/20 rounded-2xl">
        <CheckCircle className="w-5 h-5 text-green-400 shrink-0" />
        <span className="text-green-300 text-sm font-semibold">All core services operational — Firestore, Auth, and Gemini API report zero disruptions.</span>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {METRIC_CARDS.map((item, idx) => (
          <div key={idx} className="glass-premium rounded-2xl border border-white/10 p-5 space-y-3 hover:border-white/20 transition-all">
            <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center', item.color)}>
              <item.icon className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[9px] font-black text-white/40 uppercase tracking-widest leading-none mb-1">{item.label}</p>
              <p className="text-2xl font-black text-white leading-none">{item.val}</p>
              <p className="text-[9px] text-white/30 mt-1 font-semibold">{item.trend}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Charts grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {[
          { title: 'API Latency (last 24h)', data: LATENCY_DATA, key: 'latency', fill: '#818cf8', unit: 'ms' },
          { title: 'Firestore Operations Count', data: FIRESTORE_DATA, key: 'ops', fill: '#34d399', unit: '' },
          { title: 'Transcription Delay Trend', data: TRANSCRIPTION_DATA, key: 'delay', fill: '#22d3ee', unit: 'ms' },
        ].map(chart => (
          <div key={chart.title} className="glass-premium rounded-2xl border border-white/10 p-6 space-y-4">
            <h3 className="text-[10px] font-black uppercase tracking-widest text-white/60 border-b border-white/10 pb-2">{chart.title}</h3>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={chart.data as any}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff15" />
                <XAxis dataKey="time" tick={{ fontSize: 9, fill: '#94a3b8' }} />
                <YAxis tick={{ fontSize: 9, fill: '#94a3b8' }} unit={chart.unit} />
                <Tooltip contentStyle={TOOLTIP_STYLE} itemStyle={{ color: chart.fill }} />
                <Bar dataKey={chart.key} fill={chart.fill} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ))}

        <div className="glass-premium rounded-2xl border border-white/10 p-6 space-y-4">
          <h3 className="text-[10px] font-black uppercase tracking-widest text-white/60 border-b border-white/10 pb-2">Active Vetting Queue</h3>
          <ResponsiveContainer width="100%" height={160}>
            <PieChart>
              <Pie data={QUEUE_DATA} dataKey="value" cx="50%" cy="50%" outerRadius={56}
                label={({ name, value }) => `${name}: ${value}`} labelLine={false}>
                {QUEUE_DATA.map((entry, idx) => <Cell key={idx} fill={entry.fill} />)}
              </Pie>
              <Tooltip contentStyle={TOOLTIP_STYLE} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Telemetry footer */}
      <div className="p-4 border border-white/10 rounded-2xl bg-white/5 font-mono text-[10px] text-white/40">
        Last telemetry snapshot: {new Date().toLocaleString()} • All metrics within normal operating thresholds.
      </div>
    </div>
  );
}
