import sys

def main():
    with open('src/App.tsx', 'r', encoding='utf-8') as f:
        content = f.read()

    # 1. Add sidebar collapse state
    state_injection = "const [mobileMenuOpen, setMobileMenuOpen] = useState(false);"
    new_state = "  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);"
    content = content.replace(state_injection, state_injection + '\n' + new_state)

    # 2. Update Sidebar rendering
    old_sidebar = """        {/* Sidebar */}
        <aside className="w-64 bg-slate-900 text-white flex-col hidden lg:flex shrink-0 border-r border-slate-800">
          <div className="h-16 flex items-center px-6 border-b border-slate-800 shrink-0">
             <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center mr-3 shadow-sm">
                <Search className="w-4 h-4 text-white" />
             </div>
             <span className="font-display font-black text-xl tracking-tighter uppercase">HireNow</span>
          </div>
          <nav className="flex-1 px-4 py-6 flex flex-col gap-2 overflow-y-auto">
             <Link to="/" className="px-4 py-2.5 rounded-lg text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-800 transition-colors flex items-center gap-3"><LayoutGrid className="w-4 h-4 shrink-0" /> Dashboard</Link>
             <Link to="/jobs/new" className="px-4 py-2.5 rounded-lg text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-800 transition-colors flex items-center gap-3"><Briefcase className="w-4 h-4 shrink-0" /> Post Job</Link>
             <Link to="/org-admin" className="px-4 py-2.5 rounded-lg text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-800 transition-colors flex items-center gap-3"><Settings className="w-4 h-4 shrink-0" /> HR Admin</Link>
             {isUserAdmin && (
                <Link to="/admin" className="px-4 py-2.5 rounded-lg text-sm font-medium text-indigo-400 hover:text-indigo-300 hover:bg-indigo-900/30 transition-colors flex items-center gap-3"><Shield className="w-4 h-4 shrink-0" /> System Admin</Link>
             )}
          </nav>
          <div className="p-4 border-t border-slate-800 space-y-4 shrink-0">
            <div className="flex items-center gap-3 px-2">
              <div className="w-8 h-8 bg-slate-800 rounded-full flex items-center justify-center text-xs font-bold shrink-0">{user.email.charAt(0).toUpperCase()}</div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-white truncate">{user.email}</p>
                <p className="text-[10px] text-slate-400 truncate">Authenticated</p>
              </div>
            </div>
            <Button variant="ghost" className="w-full justify-start text-slate-400 hover:text-white hover:bg-slate-800 text-xs px-2" onClick={() => signOut(auth)}>
              <LogOut className="w-4 h-4 mr-2 shrink-0" /> Logout
            </Button>
          </div>
        </aside>"""

    new_sidebar = """        {/* Sidebar */}
        <aside className={cn("bg-slate-900 text-white flex-col hidden lg:flex shrink-0 border-r border-slate-800 transition-all duration-300", isSidebarCollapsed ? "w-20" : "w-64")}>
          <div className={cn("h-16 flex items-center border-b border-slate-800 shrink-0", isSidebarCollapsed ? "px-0 justify-center" : "px-6 justify-between")}>
             <div className="flex items-center">
               <div className={cn("bg-indigo-600 rounded-lg flex items-center justify-center shadow-sm shrink-0", isSidebarCollapsed ? "w-10 h-10" : "w-8 h-8 mr-3")}>
                  <Search className="w-4 h-4 text-white" />
               </div>
               {!isSidebarCollapsed && <span className="font-display font-black text-xl tracking-tighter uppercase">HireNow</span>}
             </div>
             <button onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)} className="p-1 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors">
               <Menu className="w-4 h-4" />
             </button>
          </div>
          <nav className="flex-1 px-3 py-6 flex flex-col gap-2 overflow-y-auto overflow-x-hidden">
             <Link to="/" className={cn("py-2.5 rounded-lg text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-800 transition-colors flex items-center gap-3", isSidebarCollapsed ? "px-0 justify-center" : "px-4")}>
                <LayoutGrid className="w-5 h-5 shrink-0" /> 
                {!isSidebarCollapsed && <span className="truncate">Dashboard</span>}
             </Link>
             <Link to="/jobs/new" className={cn("py-2.5 rounded-lg text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-800 transition-colors flex items-center gap-3", isSidebarCollapsed ? "px-0 justify-center" : "px-4")}>
                <Briefcase className="w-5 h-5 shrink-0" /> 
                {!isSidebarCollapsed && <span className="truncate">Post Job</span>}
             </Link>
             <Link to="/org-admin" className={cn("py-2.5 rounded-lg text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-800 transition-colors flex items-center gap-3", isSidebarCollapsed ? "px-0 justify-center" : "px-4")}>
                <Settings className="w-5 h-5 shrink-0" /> 
                {!isSidebarCollapsed && <span className="truncate">HR Admin</span>}
             </Link>
             {isUserAdmin && (
                <Link to="/admin" className={cn("py-2.5 rounded-lg text-sm font-medium text-indigo-400 hover:text-indigo-300 hover:bg-indigo-900/30 transition-colors flex items-center gap-3", isSidebarCollapsed ? "px-0 justify-center" : "px-4")}>
                  <Shield className="w-5 h-5 shrink-0" /> 
                  {!isSidebarCollapsed && <span className="truncate">System Admin</span>}
                </Link>
             )}
          </nav>
          <div className={cn("p-4 border-t border-slate-800 flex flex-col shrink-0 gap-4", isSidebarCollapsed ? "items-center" : "")}>
            <div className={cn("flex items-center gap-3", isSidebarCollapsed ? "justify-center" : "px-2")}>
              <div className="w-10 h-10 bg-slate-800 rounded-full flex items-center justify-center text-sm font-bold shrink-0">{user.email.charAt(0).toUpperCase()}</div>
              {!isSidebarCollapsed && (
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-white truncate">{user.email}</p>
                  <p className="text-[10px] text-slate-400 truncate">Authenticated</p>
                </div>
              )}
            </div>
            <Button variant="ghost" className={cn("text-slate-400 hover:text-white hover:bg-slate-800 text-xs", isSidebarCollapsed ? "w-10 h-10 p-0 justify-center" : "w-full justify-start px-2")} onClick={() => signOut(auth)}>
              <LogOut className={cn("shrink-0", isSidebarCollapsed ? "w-5 h-5" : "w-4 h-4 mr-2")} /> 
              {!isSidebarCollapsed && "Logout"}
            </Button>
          </div>
        </aside>"""

    # We might have missed `shrink-0` on some icons in my previous script, so I'll replace dynamically.
    # The safest way is to find the bounds using indices.
    idx_sidebar_start = content.find('{/* Sidebar */}')
    idx_sidebar_end = content.find('        {/* Main Content Area */}')
    if idx_sidebar_start != -1 and idx_sidebar_end != -1:
        content = content[:idx_sidebar_start] + new_sidebar + '\n' + content[idx_sidebar_end:]
    else:
        print("Failed to replace sidebar")

    # 3. Unauthenticated Layout removal (remove duplicate nav)
    idx_unauth_start = content.find('  // Unauthenticated Layout')
    idx_unauth_end = content.find('// --- Pages ---')
    if idx_unauth_start != -1 and idx_unauth_end != -1:
        new_unauth = """  // Unauthenticated Layout
  return <>{children}</>;
}

"""
        content = content[:idx_unauth_start] + new_unauth + content[idx_unauth_end:]
    else:
        print("Failed to replace unauthenticated layout")

    # 4. Make Dashboard full width
    idx_dashboard = content.find('function Dashboard(')
    idx_dash_return = content.find('  return (', idx_dashboard)
    idx_dash_div = content.find('<div className="max-w-7xl mx-auto', idx_dash_return)
    if idx_dash_div != -1:
        # replace `max-w-7xl mx-auto ` with `w-full `
        content = content[:idx_dash_div] + content[idx_dash_div:].replace('max-w-7xl mx-auto', 'w-full', 1)
    
    with open('src/App.tsx', 'w', encoding='utf-8') as f:
        f.write(content)
    print("Done")

if __name__ == '__main__':
    main()
