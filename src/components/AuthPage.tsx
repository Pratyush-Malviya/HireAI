import { Mail, Search, ArrowRight, ShieldCheck, Zap } from 'lucide-react';
import { ShimmerButton } from './magic-ui/shimmer-button';
import { Link } from 'react-router-dom';

interface AuthPageProps {
  onSignIn: () => void;
}

export function AuthPage({ onSignIn }: AuthPageProps) {
  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden font-sans">
      {/* Background container is provided by the global Layout, but if accessed directly without Layout, we ensure transparency */}
      <div className="absolute inset-0 z-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-brand-dark/20 via-slate-950 to-[#030712] opacity-80 pointer-events-none" />
      
      {/* Centered Glass Card */}
      <div className="relative z-10 w-full max-w-md px-4 sm:px-0">
        <div className="glass-premium rounded-3xl p-8 sm:p-12 shadow-2xl border border-white/10 flex flex-col items-center relative overflow-hidden">
          
          {/* Subtle glow effect behind the card */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[150%] h-[150%] bg-gradient-to-tr from-brand-dark/20 via-transparent to-violet-600/20 blur-3xl rounded-full -z-10" />

          {/* Logo */}
          <Link to="/" className="w-16 h-16 rounded-2xl overflow-hidden bg-black flex items-center justify-center shadow-lg shadow-brand/20 mb-8 transition-transform hover:scale-105">
            <img src="/logo.jpg" alt="HireNow Logo" className="w-full h-full object-cover" />
          </Link>

          {/* Messaging */}
          <h1 className="text-3xl font-display font-light text-white tracking-tight mb-2 text-center">
            Welcome to <span className="font-bold">HireNow</span>
          </h1>
          <p className="text-slate-400 text-sm text-center mb-10 max-w-xs">
            Authenticate to access your autonomous talent intelligence dashboard.
          </p>

          {/* Sign In Button */}
          <div className="w-full space-y-4">
            <button
              onClick={onSignIn}
              className="w-full group relative flex items-center justify-center gap-3 bg-white hover:bg-slate-50 text-slate-900 rounded-xl px-6 py-4 transition-all hover:scale-[1.02] active:scale-[0.98] shadow-xl shadow-white/5"
            >
              {/* Custom Google "G" icon using standard SVG */}
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  fill="#4285F4"
                />
                <path
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  fill="#34A853"
                />
                <path
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  fill="#FBBC05"
                />
                <path
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  fill="#EA4335"
                />
              </svg>
              <span className="font-bold text-sm tracking-wide">Continue with Google</span>
              <ArrowRight className="w-4 h-4 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all absolute right-6 text-slate-400" />
            </button>

            {/* Email placeholder for future */}
            <div className="relative flex items-center justify-center my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-white/10"></div>
              </div>
              <div className="relative bg-transparent px-4 text-[10px] uppercase font-bold tracking-widest text-slate-500 glass-premium rounded-full">
                Or
              </div>
            </div>

            <button
              disabled
              className="w-full flex items-center justify-center gap-2 bg-white/5 text-white/40 border border-white/10 rounded-xl px-6 py-4 text-sm font-bold cursor-not-allowed"
            >
              <Mail className="w-4 h-4" />
              <span>Email Sign-In (Coming Soon)</span>
            </button>
          </div>

          {/* Footer links */}
          <div className="mt-10 flex items-center justify-center gap-6 text-[10px] uppercase font-bold tracking-widest text-slate-500">
            <a href="#" className="hover:text-white transition-colors">Privacy</a>
            <span className="w-1 h-1 rounded-full bg-slate-800" />
            <a href="#" className="hover:text-white transition-colors">Terms</a>
          </div>
        </div>

        {/* Feature Highlights */}
        <div className="mt-8 flex items-center justify-center gap-8 px-4 text-slate-400">
          <div className="flex items-center gap-2 text-xs font-medium">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            Secure Access
          </div>
          <div className="flex items-center gap-2 text-xs font-medium">
            <Zap className="w-4 h-4 text-amber-400" />
            Instant Login
          </div>
        </div>
      </div>
    </div>
  );
}
