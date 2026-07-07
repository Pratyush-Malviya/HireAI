import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { ShieldCheck, LayoutGrid, Globe, CreditCard, Activity, Cpu, Palette, BookOpen, ChevronLeft, Loader2, Trash2, MessageSquare, FileX2, ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { cn } from '../../lib/utils';
import { useProfile, useNotification } from '../../lib/appContext';
import { collection, getDocs, writeBatch, query, where, doc, updateDoc } from 'firebase/firestore';
import { db, auth } from '../../lib/firebase';

const NAV_ITEMS = [
  { to: '/admin/overview',      label: 'Overview',        icon: LayoutGrid },
  { to: '/admin/organizations', label: 'Organizations',   icon: Globe },
  { to: '/admin/payments',      label: 'Payments',        icon: CreditCard },
  { to: '/admin/health',        label: 'System Health',   icon: Activity },
  { to: '/admin/llm',           label: 'LLM Playground',  icon: Cpu },
  { to: '/admin/white-label',   label: 'White-Label',     icon: Palette },
  { to: '/admin/manual',        label: 'User Manual',     icon: BookOpen },
  { to: '/admin/feedback',      label: 'User Feedback',   icon: MessageSquare },
];

export function SuperAdminLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const { isAdmin } = useProfile();
  const { confirm, notify } = useNotification();
  const [clearing, setClearing] = useState(false);
  const [clearingResumes, setClearingResumes] = useState(false);

  if (!isAdmin) {
    return (
      <div className="h-[60vh] flex flex-col items-center justify-center p-12 text-center">
        <ShieldCheck className="w-16 h-16 text-white mb-6" />
        <h2 className="text-2xl font-black text-white uppercase">Access Restricted</h2>
        <p className="text-white mt-2">Only platform super-administrators can access this registry.</p>
        <button
          onClick={() => navigate('/')}
          className="mt-8 px-6 py-2.5 border border-white/10 rounded-xl text-xs font-black uppercase tracking-widest text-white hover:bg-white/5 transition-all"
        >
          Return to Workspace
        </button>
      </div>
    );
  }

  const handleGlobalClear = async () => {
    if (!auth.currentUser) return;
    const ok = await confirm('DANGER: This will permanently delete ALL jobs and candidates. Do you want to proceed?');
    if (!ok) return;
    setClearing(true);
    try {
      const [jobsSnap, candidatesSnap] = await Promise.all([
        getDocs(collection(db, 'jobs')),
        getDocs(collection(db, 'candidates')),
      ]);
      const allDocs = [...jobsSnap.docs, ...candidatesSnap.docs];
      for (let i = 0; i < allDocs.length; i += 450) {
        const batch = writeBatch(db);
        allDocs.slice(i, i + 450).forEach(d => batch.delete(d.ref));
        await batch.commit();
      }
      notify(`Platform cleared. ${allDocs.length} records removed.`, 'success');
      navigate('/');
      setTimeout(() => window.location.reload(), 1500);
    } catch (err) {
      notify('Failed to clear platform: ' + (err instanceof Error ? err.message : 'Unknown'), 'error');
    } finally {
      setClearing(false);
    }
  };

  return (
    <div className="flex flex-col lg:flex-row min-h-[calc(100vh-80px)]">
      {/* Sidebar */}
      <aside className={cn(
        "hidden lg:flex flex-col shrink-0 border-r border-white/10 transition-all duration-300 bg-[#0d1117]/40 backdrop-blur-sm",
        sidebarCollapsed ? "w-[60px]" : "w-56"
      )}>
        {/* Header */}
        <div className={cn(
          "flex items-center gap-3 px-4 py-5 border-b border-white/10",
          sidebarCollapsed && "justify-center px-2"
        )}>
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shrink-0 shadow-lg shadow-indigo-500/30">
            <ShieldCheck className="w-4 h-4 text-white" />
          </div>
          {!sidebarCollapsed && (
            <div className="min-w-0">
              <p className="text-[9px] font-black text-white/40 uppercase tracking-widest leading-none">System</p>
              <p className="text-[11px] font-black text-white leading-tight truncate">Super Admin</p>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 py-4 space-y-0.5 px-2">
          {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) => cn(
                "flex items-center gap-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all duration-200 group",
                sidebarCollapsed ? "justify-center px-0 py-3" : "px-3 py-2.5",
                isActive
                  ? "bg-gradient-to-r from-indigo-500/20 to-purple-500/10 text-indigo-400 border border-indigo-500/20 shadow-sm"
                  : "text-white/40 hover:text-white hover:bg-white/5 border border-transparent"
              )}
              title={sidebarCollapsed ? label : undefined}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {!sidebarCollapsed && <span className="truncate">{label}</span>}
            </NavLink>
          ))}
        </nav>

        {/* Footer actions */}
        <div className="p-2 border-t border-white/10 space-y-1">
          {/* Danger: Delete All Resumes */}
          {!sidebarCollapsed && (
            <button
              onClick={async () => {
                if (!auth.currentUser) return;
                const ok = await confirm('DANGER: This will permanently delete ALL candidates/resumes, their interviews, and screening cache. Jobs & organizations will be kept. Proceed?');
                if (!ok) return;
                setClearingResumes(true);
                try {
                  const [candidatesSnap, interviewsSnap, cacheSnap] = await Promise.all([
                    getDocs(collection(db, 'candidates')),
                    getDocs(collection(db, 'interviews')),
                    getDocs(collection(db, 'screening_cache')),
                  ]);
                  const allDocs = [...candidatesSnap.docs, ...interviewsSnap.docs, ...cacheSnap.docs];
                  for (let i = 0; i < allDocs.length; i += 450) {
                    const batch = writeBatch(db);
                    allDocs.slice(i, i + 450).forEach(d => batch.delete(d.ref));
                    await batch.commit();
                  }
                  notify(`All resumes cleared. ${candidatesSnap.size} candidates, ${interviewsSnap.size} interviews, ${cacheSnap.size} cache entries removed.`, 'success');
                  setTimeout(() => window.location.reload(), 1500);
                } catch (err) {
                  notify('Failed to delete resumes: ' + (err instanceof Error ? err.message : 'Unknown'), 'error');
                } finally {
                  setClearingResumes(false);
                }
              }}
              disabled={clearingResumes}
              className="flex items-center gap-2 w-full px-3 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest text-orange-400/60 hover:text-orange-400 hover:bg-orange-500/10 transition-all"
            >
              {clearingResumes ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileX2 className="w-3.5 h-3.5" />}
              Delete All Resumes
            </button>
          )}

          {/* Danger: Clear Platform */}
          {!sidebarCollapsed && (
            <button
              onClick={handleGlobalClear}
              disabled={clearing}
              className="flex items-center gap-2 w-full px-3 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest text-red-400/60 hover:text-red-400 hover:bg-red-500/10 transition-all"
            >
              {clearing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              Clear Platform
            </button>
          )}

          {/* Back to App */}
          <button
            onClick={() => navigate('/')}
            className={cn(
              "flex items-center gap-2 w-full rounded-xl text-[10px] font-black uppercase tracking-widest text-white/30 hover:text-white hover:bg-white/5 transition-all py-2",
              sidebarCollapsed ? "justify-center px-0" : "px-3"
            )}
            title="Back to App"
          >
            <ChevronLeft className="w-4 h-4 shrink-0" />
            {!sidebarCollapsed && "Back to App"}
          </button>

          {/* Collapse toggle */}
          <button
            onClick={() => setSidebarCollapsed(c => !c)}
            className={cn(
              "flex items-center gap-2 w-full rounded-xl text-[10px] font-black uppercase tracking-widest text-white/20 hover:text-white/50 hover:bg-white/5 transition-all py-2",
              sidebarCollapsed ? "justify-center px-0" : "px-3"
            )}
          >
            <div className="w-4 h-4 shrink-0 flex flex-col justify-center gap-0.5">
              <span className="block h-0.5 bg-current rounded-full w-4" />
              <span className="block h-0.5 bg-current rounded-full w-3" />
              <span className="block h-0.5 bg-current rounded-full w-4" />
            </div>
            {!sidebarCollapsed && "Collapse"}
          </button>
        </div>
      </aside>

      {/* Main Content Area Wrapper */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile Sub-Navigation Header / Selector */}
        <div className="lg:hidden bg-[#0d1117]/80 border-b border-white/10 p-4 shrink-0 flex items-center justify-between gap-4 backdrop-blur-sm relative z-30">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-indigo-400" />
            <span className="text-xs font-black uppercase tracking-widest text-white">System Admin</span>
          </div>
          <div className="relative flex-1 max-w-[200px]">
            <select
              value={location.pathname}
              onChange={(e) => navigate(e.target.value)}
              className="w-full bg-[#0d1117] border border-white/10 rounded-xl px-3 py-2 text-xs font-bold text-white focus:outline-none appearance-none pr-8 cursor-pointer"
            >
              {NAV_ITEMS.map((item) => (
                <option key={item.to} value={item.to}>
                  {item.label}
                </option>
              ))}
            </select>
            <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none text-white/50">
              <ChevronDown className="w-3.5 h-3.5" />
            </div>
          </div>
        </div>

        {/* Main Content */}
        <main className="flex-1 min-w-0 p-6 md:p-8 space-y-8 overflow-auto animate-in fade-in duration-300">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
