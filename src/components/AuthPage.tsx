import React, { useState } from 'react';
import { Mail, Search, ArrowRight, ShieldCheck, Zap, Loader2, AlertCircle } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { RainbowButton } from './magic-ui/rainbow-button';

export function AuthPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (isLogin) {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        await createUserWithEmailAndPassword(auth, email, password);
      }
      navigate('/');
    } catch (err: any) {
      console.error('Auth error:', err);
      if (err.code === 'auth/invalid-credential' || err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
        setError('Invalid email or password.');
      } else if (err.code === 'auth/email-already-in-use') {
        setError('An account with this email already exists.');
      } else if (err.code === 'auth/weak-password') {
        setError('Password should be at least 6 characters.');
      } else {
        setError(err.message || 'Authentication failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email) {
      setError('Please enter your email address first to reset your password.');
      return;
    }
    setError(null);
    try {
      await sendPasswordResetEmail(auth, email);
      setError('Password reset email sent! Please check your inbox.');
    } catch (err: any) {
      console.error('Password reset error:', err);
      if (err.code === 'auth/user-not-found') {
        setError('No account found with this email.');
      } else {
        setError(err.message || 'Failed to send reset email. Please try again.');
      }
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden font-sans">
      <div className="absolute inset-0 z-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-brand-dark/20 via-slate-950 to-[#030712] opacity-80 pointer-events-none" />

      <div className="relative z-10 w-full max-w-md px-4 sm:px-0">
        <div className="glass-premium rounded-3xl p-8 sm:p-12 shadow-2xl border border-white/10 flex flex-col items-center relative overflow-hidden">

          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[150%] h-[150%] bg-gradient-to-tr from-brand-dark/20 via-transparent to-violet-600/20 blur-3xl rounded-full -z-10" />

          <Link to="/" className="w-16 h-16 rounded-2xl overflow-hidden bg-black flex items-center justify-center shadow-lg shadow-brand/20 mb-8 transition-transform hover:scale-105">
            <img src="/logo.jpg" alt="HireNow Logo" className="w-full h-full object-cover" />
          </Link>

          <h1 className="text-3xl font-display font-light text-white tracking-tight mb-2 text-center">
            {isLogin ? 'Welcome Back' : 'Create Account'}
          </h1>
          <p className="text-slate-400 text-sm text-center mb-8 max-w-xs">
            Authenticate to access your autonomous talent intelligence dashboard.
          </p>

          {error && (
            <div className="w-full mb-6 p-3 rounded-lg bg-red-500/20 border border-red-500/50 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
              <p className="text-sm font-bold text-red-200">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="w-full space-y-4">
            <div className="space-y-1">
              <label className="text-[10px] font-black text-white/50 uppercase tracking-widest pl-1">Email</label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/30" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3.5 pl-12 text-white placeholder-white/30 focus:outline-none focus:border-brand/50 focus:ring-1 focus:ring-brand/50 transition-all font-medium"
                  placeholder="name@company.com"
                />
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex justify-between items-center">
                <label className="text-[10px] font-black text-white/50 uppercase tracking-widest pl-1">Password</label>
                {isLogin && (
                  <button 
                    type="button" 
                    onClick={handleForgotPassword}
                    className="text-[10px] font-bold text-brand hover:text-brand-light transition-colors uppercase tracking-widest pr-1"
                  >
                    Forgot Password?
                  </button>
                )}
              </div>
              <div className="relative">
                <ShieldCheck className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/30" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3.5 pl-12 text-white placeholder-white/30 focus:outline-none focus:border-brand/50 focus:ring-1 focus:ring-brand/50 transition-all font-medium"
                  placeholder="••••••••"
                />
              </div>
            </div>

            <RainbowButton
              type="submit"
              disabled={loading}
              className="w-full py-4 mt-6 font-bold"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="w-5 h-5 animate-spin" /> {isLogin ? 'Signing In...' : 'Creating Account...'}
                </span>
              ) : (
                <span className="flex items-center justify-center gap-2">
                  {isLogin ? 'Sign In' : 'Create Account'} <ArrowRight className="w-4 h-4" />
                </span>
              )}
            </RainbowButton>
          </form>

          <div className="mt-6 text-center">
            <button
              onClick={() => { setIsLogin(!isLogin); setError(null); }}
              className="text-sm font-bold text-slate-400 hover:text-white transition-colors"
            >
              {isLogin ? "Don't have an account? Sign Up" : 'Already have an account? Sign In'}
            </button>
          </div>

          <div className="mt-10 flex items-center justify-center gap-6 text-[10px] uppercase font-bold tracking-widest text-slate-500">
            <a href="#" className="hover:text-white transition-colors">Privacy</a>
            <span className="w-1 h-1 rounded-full bg-slate-800" />
            <a href="#" className="hover:text-white transition-colors">Terms</a>
          </div>
        </div>

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
