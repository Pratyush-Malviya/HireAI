import React, { useState } from 'react';
import { Menu, X } from 'lucide-react';
import { useNavigate, Link } from 'react-router-dom';
import { PricingStep } from './PricingStep';

export function PricingPage() {
  const navigate = useNavigate();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
    <div className="relative min-h-screen bg-[#030712] overflow-hidden">
      <div className="absolute inset-0 z-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-brand-dark/30 via-slate-950 to-slate-950" />
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-brand/10 rounded-full blur-[120px] pointer-events-none" />
      
      <nav className="relative z-50 border-b border-slate-800/50 bg-transparent/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2 cursor-pointer" onClick={() => navigate('/')}>
              <div className="w-8 h-8 rounded-lg overflow-hidden shadow-lg shadow-brand/20 bg-black flex items-center justify-center">
                <img src="/logo.jpg" alt="Logo" className="w-full h-full object-cover" />
              </div>
              <span className="text-lg font-bold text-white tracking-tight">HireNow</span>
            </div>
            <div className="flex items-center gap-4">
              <div className="hidden md:flex items-center gap-8 mr-4">
                <Link to="/#features" className="text-sm text-white/70 hover:text-white transition-colors font-medium">Features</Link>
                <Link to="/pricing" className="text-sm text-brand font-medium">Pricing</Link>
                <Link to="/#testimonials" className="text-sm text-white/70 hover:text-white transition-colors font-medium">Testimonials</Link>
              </div>
              <Link to="/pricing" className="hidden sm:block glass-premium text-brand px-5 py-2 rounded-xl text-sm font-bold hover:bg-white/5 transition-all shadow-lg shadow-white/10 text-center">
                Get Started
              </Link>
              <button 
                className="md:hidden p-2 text-white hover:bg-white/10 rounded-lg transition-colors"
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              >
                {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
              </button>
            </div>
          </div>
        </div>

        {isMobileMenuOpen && (
          <div className="md:hidden border-t border-slate-800/50 bg-[#030712]/95 backdrop-blur-xl absolute top-full left-0 w-full shadow-2xl">
            <div className="px-4 py-6 flex flex-col gap-4">
              <Link to="/#features" onClick={() => setIsMobileMenuOpen(false)} className="text-lg text-white font-medium p-2 hover:bg-white/5 rounded-lg transition-colors">Features</Link>
              <Link to="/pricing" onClick={() => setIsMobileMenuOpen(false)} className="text-lg text-brand font-medium p-2 hover:bg-white/5 rounded-lg transition-colors">Pricing</Link>
              <Link to="/#testimonials" onClick={() => setIsMobileMenuOpen(false)} className="text-lg text-white font-medium p-2 hover:bg-white/5 rounded-lg transition-colors">Testimonials</Link>
              <Link to="/pricing" onClick={() => setIsMobileMenuOpen(false)} className="w-full mt-4 glass-premium text-brand px-5 py-3 rounded-xl text-center text-lg font-bold hover:bg-white/5 transition-all block">
                Get Started
              </Link>
            </div>
          </div>
        )}
      </nav>

      <main className="relative z-10 pt-16 pb-32 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        <PricingStep />
      </main>
    </div>
  );
}
