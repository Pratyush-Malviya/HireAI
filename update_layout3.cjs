const fs = require('fs');

let c = fs.readFileSync('src/App.tsx', 'utf8');

if (!c.includes('LogOut')) {
    c = "import { LogOut } from 'lucide-react';\n" + c;
}

const i1 = c.indexOf('function Layout(');
const returnStart = c.indexOf('  return (\n    <div className="min-h-screen', i1);
const pagesStart = c.indexOf('// --- Pages ---', i1);

if (i1 === -1 || returnStart === -1 || pagesStart === -1) {
    console.error('Could not find boundaries.');
    process.exit(1);
}

const newReturn = `  if (user) {
    return (
      <div className="flex h-screen bg-slate-50 font-sans text-slate-900 selection:bg-indigo-100 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-64 bg-slate-900 text-white flex-col hidden lg:flex shrink-0 border-r border-slate-800">
          <div className="h-16 flex items-center px-6 border-b border-slate-800 shrink-0">
             <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center mr-3 shadow-sm">
                <Search className="w-4 h-4 text-white" />
             </div>
             <span className="font-display font-black text-xl tracking-tighter uppercase">HireNow</span>
          </div>
          <nav className="flex-1 px-4 py-6 flex flex-col gap-2 overflow-y-auto">
             <Link to="/" className="px-4 py-2.5 rounded-lg text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-800 transition-colors flex items-center gap-3"><LayoutGrid className="w-4 h-4" /> Dashboard</Link>
             <Link to="/jobs/new" className="px-4 py-2.5 rounded-lg text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-800 transition-colors flex items-center gap-3"><Briefcase className="w-4 h-4" /> Post Job</Link>
             <Link to="/org-admin" className="px-4 py-2.5 rounded-lg text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-800 transition-colors flex items-center gap-3"><Settings className="w-4 h-4" /> HR Admin</Link>
             {isUserAdmin && (
                <Link to="/admin" className="px-4 py-2.5 rounded-lg text-sm font-medium text-indigo-400 hover:text-indigo-300 hover:bg-indigo-900/30 transition-colors flex items-center gap-3"><Shield className="w-4 h-4" /> System Admin</Link>
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
              <LogOut className="w-4 h-4 mr-2" /> Logout
            </Button>
          </div>
        </aside>
        
        {/* Main Content Area */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 sm:px-6 shrink-0">
             <div className="flex items-center gap-4">
                <button className="lg:hidden p-2 text-slate-500 hover:bg-slate-100 rounded-lg" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
                   <Menu className="w-5 h-5" />
                </button>
             </div>
             <div className="flex items-center gap-4">
               <Button 
                  variant="outline" 
                  className="hidden xl:flex text-red-600 border-red-200 hover:bg-red-50 hover:border-red-300 text-xs py-1.5 h-auto font-medium"
                  onClick={handleGlobalClear}
                  disabled={clearing}
                >
                  <Trash2 className="w-3.5 h-3.5 mr-2" /> {clearing ? 'Clearing...' : 'Clear Platform'}
                </Button>
             </div>
          </header>
          
          <AnimatePresence>
            {mobileMenuOpen && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="lg:hidden border-b bg-slate-900 border-slate-800 shrink-0"
              >
                <div className="px-6 py-4 space-y-2 flex flex-col">
                    <Link to="/" onClick={() => setMobileMenuOpen(false)} className="py-2 text-sm font-medium text-slate-300 hover:text-white transition-colors">Dashboard</Link>
                    <Link to="/jobs/new" onClick={() => setMobileMenuOpen(false)} className="py-2 text-sm font-medium text-slate-300 hover:text-white transition-colors">Post Job</Link>
                    <Link to="/org-admin" onClick={() => setMobileMenuOpen(false)} className="py-2 text-sm font-medium text-slate-300 hover:text-white transition-colors">HR Admin</Link>
                    {isUserAdmin && (
                      <Link to="/admin" onClick={() => setMobileMenuOpen(false)} className="py-2 text-sm font-medium text-indigo-400 hover:text-indigo-300 transition-colors">System Admin</Link>
                    )}
                    <div className="pt-4 border-t border-slate-800">
                      <Button variant="ghost" className="w-full justify-start text-slate-400 hover:text-white hover:bg-slate-800 text-xs px-2" onClick={() => { signOut(auth); setMobileMenuOpen(false); }}>
                        <LogOut className="w-4 h-4 mr-2" /> Logout
                      </Button>
                    </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          
          <main className="flex-1 overflow-y-auto bg-slate-50 p-4 sm:p-6 lg:p-8">
            {children}
          </main>
        </div>
      </div>
    );
  }

  // Unauthenticated Layout
  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 selection:bg-indigo-100 flex flex-col">
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-xl border-b border-slate-100 shadow-sm transition-all duration-500">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-20 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 lg:gap-12 min-w-0">
            <Link to="/" className="flex items-center gap-2.5 group shrink-0">
              <div className="w-10 h-10 rounded-xl bg-slate-900 shadow-lg flex items-center justify-center transition-all duration-500 group-hover:rotate-[15deg] group-hover:scale-110">
                <Search className="w-5 h-5 text-white" />
              </div>
              <span className="font-display font-black text-2xl tracking-tighter uppercase text-slate-950">
                HireNow
              </span>
            </Link>
            
            <nav className="hidden lg:flex items-center gap-8">
              {navLinks.map((link) => (
                <a 
                  key={link.name} 
                  href={link.href} 
                  className="text-[11px] font-black text-slate-500 hover:text-indigo-600 transition-colors uppercase tracking-[0.2em]"
                  onClick={(e) => {
                    if (link.href.startsWith('#')) {
                      e.preventDefault();
                      const el = document.getElementById(link.href.substring(1));
                      if (el) el.scrollIntoView({ behavior: 'smooth' });
                    }
                  }}
                >
                  {link.name}
                </a>
              ))}
            </nav>
          </div>

          <div className="flex items-center gap-3">
            <button 
              onClick={signIn} 
              className="hidden sm:block text-sm font-black text-slate-600 hover:text-indigo-600 transition-colors uppercase tracking-widest px-4"
            >
              Log In
            </button>
            <Button 
              variant="brand" 
              size="sm" 
              className="h-11 px-6 shadow-xl shadow-indigo-100 font-black uppercase tracking-widest text-xs"
              onClick={() => navigate('/?view=pricing')}
            >
              Get Started
            </Button>
            <button 
              className="lg:hidden p-2 text-slate-600 hover:bg-slate-50 rounded-lg"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>

        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="lg:hidden border-t border-slate-100 bg-white overflow-hidden"
            >
              <div className="px-6 py-8 space-y-6 flex flex-col">
                {navLinks.map((link) => (
                  <a 
                    key={link.name} 
                    href={link.href} 
                    onClick={(e) => {
                      setMobileMenuOpen(false);
                      if (link.href.startsWith('#')) {
                        e.preventDefault();
                        const el = document.getElementById(link.href.substring(1));
                        if (el) el.scrollIntoView({ behavior: 'smooth' });
                      }
                    }}
                    className="text-lg font-black text-slate-900 font-display uppercase tracking-tighter"
                  >
                    {link.name}
                  </a>
                ))}
                <div className="pt-6 border-t border-slate-50">
                  <Button variant="brand" className="w-full h-14 font-black uppercase tracking-widest text-xs" onClick={() => { signIn(); setMobileMenuOpen(false); }}>
                    Sign In
                  </Button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 min-h-[60vh]">
        {children}
      </main>

      <footer className="bg-white border-t border-slate-200 py-12 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row justify-between items-center gap-8">
            <div className="flex items-center gap-2 font-bold text-slate-900">
               <div className="w-6 h-6 bg-slate-900 rounded flex items-center justify-center">
                 <Search className="w-3.5 h-3.5 text-white" />
               </div>
               HireNow
            </div>
            <div className="flex items-center gap-8 text-[11px] font-black uppercase tracking-widest text-slate-400">
              <Link to="/" className="hover:text-indigo-600 transition-colors">Workspace</Link>
              <Link to="/about" className="hover:text-indigo-600 transition-colors">Platform</Link>
              <Link to="/terms" className="hover:text-indigo-600 transition-colors">Terms</Link>
            </div>
            <div className="flex flex-col items-center md:items-end gap-1.5">
              <p className="text-slate-400 text-[10px] font-medium uppercase tracking-tight">
                © 2026 HireNow Inc. All rights reserved.
              </p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );`;

c = c.substring(0, returnStart) + newReturn + '\n}\n\n' + c.substring(pagesStart);
fs.writeFileSync('src/App.tsx', c);
console.log('Layout successfully updated.');
