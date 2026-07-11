import React, { useState } from 'react';
import { Mail, Search, ArrowRight, ShieldCheck, Zap, Loader2, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { cn } from '../lib/utils';
import { RainbowButton } from './magic-ui/rainbow-button';

export function AuthPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const validateEmail = (val: string) => {
    if (!val.trim()) return 'Email is required';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) return 'Invalid email format';
    return '';
  };

  const validatePassword = (val: string) => {
    if (!val) return 'Password is required';
    if (!isLogin && val.length < 6) return 'Password must be at least 6 characters';
    return '';
  };

  const handleEmailChange = (val: string) => {
    setEmail(val);
    if (val) setFieldErrors(prev => ({ ...prev, email: validateEmail(val) }));
    else setFieldErrors(prev => ({ ...prev, email: '' }));
  };

  const handlePasswordChange = (val: string) => {
    setPassword(val);
    if (val) setFieldErrors(prev => ({ ...prev, password: validatePassword(val) }));
    else setFieldErrors(prev => ({ ...prev, password: '' }));
  };

  const isValid = () => {
    const e = validateEmail(email);
    const p = validatePassword(password);
    setFieldErrors({ email: e, password: p });
    return !e && !p;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    if (!isValid()) {
      setLoading(false);
      return;
    }
    try {
      if ((auth as any).isDummy) {
        throw new Error('Firebase is not configured. Please check your VITE_FIREBASE_API_KEY.');
      }
      if (isLogin) {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        await createUserWithEmailAndPassword(auth, email, password);
      }
      const plan = searchParams.get('plan');
      const seats = searchParams.get('seats');
      if (plan && seats) {
        navigate(`/?plan=${plan}&seats=${seats}`);
      } else {
        navigate('/');
      }
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
      if ((auth as any).isDummy) {
        throw new Error('Firebase is not configured. Please check your VITE_FIREBASE_API_KEY.');
      }
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
                    onChange={(e) => handleEmailChange(e.target.value)}
                    onBlur={() => setFieldErrors(prev => ({ ...prev, email: validateEmail(email) }))}
                    className={cn(
                      "w-full bg-white/5 border rounded-xl px-4 py-3.5 pl-12 text-white placeholder-white/30 focus:outline-none focus:ring-1 transition-all font-medium",
                      fieldErrors.email ? "border-red-500/50 focus:border-red-500 focus:ring-red-500/50" : "border-white/10 focus:border-brand/50 focus:ring-brand/50"
                    )}
                    placeholder="name@company.com"
                  />
                  {fieldErrors.email && <p className="text-[10px] font-medium text-red-400 pl-1 mt-1">{fieldErrors.email}</p>}
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
                <div className="relative">
                  <ShieldCheck className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/30" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => handlePasswordChange(e.target.value)}
                    onBlur={() => setFieldErrors(prev => ({ ...prev, password: validatePassword(password) }))}
                    className={cn(
                      "w-full bg-white/5 border rounded-xl px-4 py-3.5 pl-12 pr-12 text-white placeholder-white/30 focus:outline-none focus:ring-1 transition-all font-medium",
                      fieldErrors.password ? "border-red-500/50 focus:border-red-500 focus:ring-red-500/50" : "border-white/10 focus:border-brand/50 focus:ring-brand/50"
                    )}
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/70 transition-colors focus:outline-none"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
                {fieldErrors.password && <p className="text-[10px] font-medium text-red-400 pl-1 mt-1">{fieldErrors.password}</p>}
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
              onClick={() => { setIsLogin(!isLogin); setError(null); setFieldErrors({}); }}
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
