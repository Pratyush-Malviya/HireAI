import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Briefcase, Users, Globe, Database, Trash2, Loader2 } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell
} from 'recharts';
import { collection, getDocs, writeBatch, doc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { cn, formatDateTime, getScoreColor } from '../../lib/utils';
import { useProfile, useNotification } from '../../lib/appContext';
import type { Candidate } from '../../types';

const WEEKLY_DATA = [
  { day: 'Mon', screenings: 42 }, { day: 'Tue', screenings: 58 },
  { day: 'Wed', screenings: 73 }, { day: 'Thu', screenings: 61 },
  { day: 'Fri', screenings: 47 }, { day: 'Sat', screenings: 18 },
  { day: 'Sun', screenings: 12 },
];

const PASS_DATA = [
  { name: 'Pass', value: 156, fill: '#22c55e' },
  { name: 'Fail', value: 43, fill: '#ef4444' },
  { name: 'Borderline', value: 28, fill: '#f59e0b' },
];

export function SAOverviewPage() {
  const navigate = useNavigate();
  const { isAdmin } = useProfile();
  const { confirm, notify } = useNotification();

  const [stats, setStats] = useState({ jobs: 0, candidates: 0, users: 0, organizations: 0 });
  const [recentCandidates, setRecentCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAdmin) { setLoading(false); return; }
    const fetchData = async () => {
      try {
        const [jobsSnap, candidatesSnap, orgsSnap] = await Promise.all([
          getDocs(collection(db, 'jobs')),
          getDocs(collection(db, 'candidates')),
          getDocs(collection(db, 'organizations')),
        ]);
        const uniqueUsers = new Set<string>();
        jobsSnap.forEach(d => uniqueUsers.add(d.data().createdBy));
        candidatesSnap.forEach(d => uniqueUsers.add(d.data().createdBy));
        setStats({ jobs: jobsSnap.size, candidates: candidatesSnap.size, users: uniqueUsers.size, organizations: orgsSnap.size });
        const recent = candidatesSnap.docs
          .map(d => ({ id: d.id, ...d.data() } as Candidate))
          .sort((a, b) => ((b.createdAt as any)?.seconds || 0) - ((a.createdAt as any)?.seconds || 0))
          .slice(0, 10);
        setRecentCandidates(recent);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [isAdmin]);

  if (loading) return (
    <div className="h-64 flex items-center justify-center">
      <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
    </div>
  );

  const STAT_CARDS = [
    { label: 'Platform Jobs', val: stats.jobs, icon: Briefcase, color: 'text-indigo-400 bg-indigo-500/10' },
    { label: 'Total Candidates', val: stats.candidates, icon: Users, color: 'text-green-400 bg-green-500/10' },
    { label: 'Organizations', val: stats.organizations, icon: Globe, color: 'text-purple-400 bg-purple-500/10' },
    { label: 'Active Users', val: stats.users, icon: Database, color: 'text-amber-400 bg-amber-500/10' },
  ];

  return (
    <div className="space-y-8 animate-in fade-in duration-400">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-black text-white uppercase tracking-tight flex items-center gap-3">
          <span className="w-1 h-7 bg-gradient-to-b from-indigo-500 to-purple-600 rounded-full inline-block" />
          Platform Overview
        </h1>
        <p className="text-white/50 text-sm mt-1">Real-time platform-wide statistics and activity feed.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {STAT_CARDS.map(s => (
          <div key={s.label} className="glass-premium rounded-2xl border border-white/10 p-5 hover:border-white/20 transition-all duration-300 hover:scale-[1.02]">
            <div className="flex items-center gap-3">
              <div className={cn('w-11 h-11 rounded-xl flex items-center justify-center shrink-0', s.color)}>
                <s.icon className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[9px] font-black uppercase text-white/50 tracking-widest leading-none mb-1">{s.label}</p>
                <p className="text-3xl font-black text-white leading-none">{s.val}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Quick-pulse cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="glass-premium rounded-2xl border border-indigo-500/20 p-5 bg-indigo-500/5">
          <p className="text-[9px] font-black text-indigo-400 uppercase tracking-widest">Global Screening Volume</p>
          <p className="text-3xl font-black text-white mt-1">{recentCandidates.length}+</p>
        </div>
        <div className="glass-premium rounded-2xl border border-white/10 p-5">
          <p className="text-[9px] font-black text-white/50 uppercase tracking-widest">Database Health</p>
          <p className="text-3xl font-black text-white mt-1">99.9%</p>
        </div>
        <div className="glass-premium rounded-2xl border border-white/10 p-5">
          <p className="text-[9px] font-black text-white/50 uppercase tracking-widest">Platform Status</p>
          <p className="text-3xl font-black text-green-400 mt-1">Online</p>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="glass-premium rounded-2xl border border-white/10 p-6 space-y-4">
          <h3 className="text-[10px] font-black uppercase tracking-widest text-white/60">Weekly Screening Volume</h3>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={WEEKLY_DATA}>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff15" />
              <XAxis dataKey="day" tick={{ fontSize: 10, fill: '#94a3b8' }} />
              <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} />
              <Tooltip contentStyle={{ fontSize: 11, backgroundColor: '#0f172a', borderColor: '#1e293b', color: '#f8fafc', borderRadius: '8px' }} />
              <Bar dataKey="screenings" fill="#818cf8" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="glass-premium rounded-2xl border border-white/10 p-6 space-y-4">
          <h3 className="text-[10px] font-black uppercase tracking-widest text-white/60">Pass Rate Distribution</h3>
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie data={PASS_DATA} dataKey="value" cx="50%" cy="50%" outerRadius={65}
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                {PASS_DATA.map((entry, idx) => <Cell key={idx} fill={entry.fill} />)}
              </Pie>
              <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', color: '#f8fafc', borderRadius: '8px', fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Recent Activity Table */}
      <div className="space-y-3">
        <h2 className="text-lg font-black uppercase tracking-tight text-white">Recent Activity</h2>
        <div className="glass-premium rounded-2xl border border-white/10 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead className="border-b border-white/10 bg-white/5">
                <tr>
                  {['Candidate', 'Org ID', 'Score', 'Time', 'Actions'].map((h, i) => (
                    <th key={h} className={cn('px-5 py-4 text-[9px] font-black text-white/50 uppercase tracking-widest', i === 4 ? 'text-right' : 'text-left')}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {recentCandidates.map(c => (
                  <tr key={c.id} className="hover:bg-white/5 cursor-pointer transition-colors group" onClick={() => navigate(`/candidates/${c.id}`)}>
                    <td className="px-5 py-3.5">
                      <div className="font-bold text-xs text-white group-hover:text-indigo-300 transition-colors uppercase tracking-tight">{c.fullName}</div>
                      <div className="text-[9px] text-white/40 font-mono mt-0.5">{c.email}</div>
                    </td>
                    <td className="px-5 py-3.5 text-[9px] font-black text-white/40 uppercase font-mono">
                      {(c as any).organizationId?.slice(0, 8) || 'LEGACY'}
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={cn('px-2 py-0.5 rounded border text-[9px] font-black', getScoreColor(c.scorecard?.compositeScore))}>
                        {c.scorecard?.compositeScore ?? '—'}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-[9px] font-semibold text-white/40">
                      {formatDateTime(c.createdAt)}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          const ok = await confirm('Remove this candidate from the global database?');
                          if (!ok) return;
                          try {
                            const batch = writeBatch(db);
                            batch.delete(doc(db, 'candidates', c.id));
                            await batch.commit();
                            setRecentCandidates(prev => prev.filter(x => x.id !== c.id));
                            notify('Global record removed.', 'success');
                          } catch (err) {
                            notify('Failed to remove record.', 'error');
                          }
                        }}
                        className="p-1.5 text-white/30 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
                {recentCandidates.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-5 py-10 text-center text-[10px] font-black text-white/30 uppercase tracking-widest">
                      No candidates screened yet
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
