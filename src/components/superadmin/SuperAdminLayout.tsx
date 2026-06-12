import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { ShieldCheck, LayoutGrid, Globe, CreditCard, Activity, Cpu, Palette, BookOpen, ChevronLeft, Trash2, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { cn } from '../../lib/utils';
import { useProfile } from '../superadmin/superadminContext';

const NAV_ITEMS = [
  { to: '/admin/overview',     label: 'Overview',        icon: LayoutGrid },
  { to: '/admin/organizations', label: 'Organizations',   icon: Globe },
  { to: '/admin/payments',     label: 'Payments',        icon: CreditCard },
  { to: '/admin/health',       label: 'System Health',   icon: Activity },
  { to: '/admin/llm',          label: 'LLM Playground',  icon: Cpu },
  { to: '/admin/white-label',  label: 'White-Label',     icon: Palette },
  { to: '/admin/manual',       label: 'User Manual',     icon: BookOpen },
];

export function SuperAdminLayout() {
  const navigate = useNavigate();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <div className="flex min-h-[calc(100vh-80px)] gap-0">
      {/* Sidebar */}
      <aside className={cn(
        "flex flex-col shrink-0 border-r border-white/10 transition-all duration-300 bg-[#0d1117]/60 backdrop-blur-sm",
        sidebarCollapsed ? "w-16" : "w-56"
      )}>
        {/* Sidebar header */}
        <div className={cn(
          "flex items-center gap-3 px-4 py-5 border-b border-white/10",
          sidebarCollapsed && "justify-center px-2"
        )}>
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-4 h-4 text-white" />
          </div>
          {!sidebarCollapsed && (
            <div className="min-w-0">
              <p className="text-[9px] font-black text-white/50 uppercase tracking-widest leading-none">System</p>
              <p className="text-xs font-black text-white leading-tight truncate">Super Admin</p>
            </div>
          )}
        </div>

        {/* Nav links */}
        <nav className="flex-1 py-4 space-y-1 px-2">
          {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) => cn(
                "flex items-center gap-3 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all duration-200 group",
                sidebarCollapsed ? "justify-center px-0 py-3" : "px-3 py-2.5",
                isActive
                  ? "bg-gradient-to-r from-indigo-500/20 to-purple-500/10 text-indigo-400 border border-indigo-500/20"
                  : "text-white/50 hover:text-white hover:bg-white/5"
              )}
              title={sidebarCollapsed ? label : undefined}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {!sidebarCollapsed && <span className="truncate">{label}</span>}
            </NavLink>
          ))}
        </nav>

        {/* Collapse toggle + Back button */}
        <div className="p-2 border-t border-white/10 space-y-1">
          <button
            onClick={() => navigate('/')}
            className={cn(
              "flex items-center gap-2 w-full rounded-xl text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-white hover:bg-white/5 transition-all py-2",
              sidebarCollapsed ? "justify-center px-0" : "px-3"
            )}
            title="Back to App"
          >
            <ChevronLeft className="w-4 h-4 shrink-0" />
            {!sidebarCollapsed && "Back to App"}
          </button>
          <button
            onClick={() => setSidebarCollapsed(c => !c)}
            className={cn(
              "flex items-center gap-2 w-full rounded-xl text-[10px] font-black uppercase tracking-widest text-white/30 hover:text-white hover:bg-white/5 transition-all py-2",
              sidebarCollapsed ? "justify-center px-0" : "px-3"
            )}
          >
            <div className="w-4 h-4 shrink-0 flex flex-col justify-center gap-0.5">
              <span className="block h-0.5 bg-current rounded-full" />
              <span className="block h-0.5 bg-current rounded-full" />
              <span className="block h-0.5 bg-current rounded-full" />
            </div>
            {!sidebarCollapsed && "Collapse"}
          </button>
        </div>
      </aside>

      {/* Page content */}
      <main className="flex-1 min-w-0 p-6 md:p-8 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
