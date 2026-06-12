import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Check, Zap, Shield, Mail, Sparkles, Loader2, Eye, EyeOff, User, Building2, Globe, MapPin, Phone, Lock, ArrowLeft } from 'lucide-react';
import { RainbowButton } from './magic-ui/rainbow-button';
import { BorderBeam } from './magic-ui/border-beam';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { auth, db } from '../lib/firebase';
import { doc, setDoc, addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';

interface PricingStepProps {
  onPaymentComplete?: (tier: string, seats: number) => void;
}

export function PricingStep({ onPaymentComplete }: PricingStepProps) {
  const navigate = useNavigate();
  const [step, setStep] = useState<'plans' | 'register'>('plans');
  const [seats, setSeats] = useState<number>(1);
  const [selectedPlan, setSelectedPlan] = useState<string>('free');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fullName, setFullName] = useState('');
  const [orgName, setOrgName] = useState('');
  const [orgDomain, setOrgDomain] = useState('');
  const [orgIndustry, setOrgIndustry] = useState('Technology');
  const [orgCompanySize, setOrgCompanySize] = useState('11-50');
  const [orgLocation, setOrgLocation] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const plans = [
    {
      id: 'free',
      name: 'Free',
      price: 0,
      icon: <Zap className="w-5 h-5 text-blue-400" />,
      features: ['1 seat included', 'Basic AI Screening', 'Standard Support', '7-day free trial of Pro'],
      maxSeats: 1,
      popular: true
    },
    {
      id: 'enterprise',
      name: 'Enterprise',
      price: null,
      icon: <Shield className="w-5 h-5 text-emerald-400" />,
      features: ['Unlimited seats', 'Dedicated Account Manager', 'SSO Integration', 'Custom AI Models', 'Custom contract terms'],
      maxSeats: Infinity
    }
  ];

  const isEnterprise = selectedPlan === 'enterprise';

  const handleGetStarted = () => {
    setStep('register');
  };

  const handleContactSales = () => {
    window.location.href = 'mailto:sales@hirenow.ai?subject=Enterprise%20Plan%20Inquiry';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!fullName.trim()) {
      setError('Full name is required.');
      return;
    }
    if (!orgName.trim()) {
      setError('Organization name is required.');
      return;
    }
    if (!phone.trim()) {
      setError('Phone number is required.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    setLoading(true);
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);

      const orgRef = await addDoc(collection(db, 'organizations'), {
        name: orgName.trim(),
        domain: orgDomain.trim() || null,
        industry: orgIndustry,
        companySize: orgCompanySize,
        location: orgLocation.trim() || null,
        phone: phone.trim() || null,
        createdAt: serverTimestamp(),
        createdBy: cred.user.uid,
        status: 'active',
        tier: selectedPlan,
        seatCount: seats,
        ...(selectedPlan === 'free' && {
          trialEndsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        })
      });

      await setDoc(doc(db, 'users', cred.user.uid), {
        uid: cred.user.uid,
        email: cred.user.email,
        organizationId: orgRef.id,
        role: 'owner',
        fullName: fullName.trim(),
        phone: phone.trim() || null,
        createdAt: serverTimestamp()
      });

      navigate('/');
    } catch (err: any) {
      console.error('Registration failed:', err);
      if (err.code === 'auth/email-already-in-use') {
        setError('An account with this email already exists.');
      } else if (err.code === 'auth/weak-password') {
        setError('Password should be at least 6 characters.');
      } else if (err.code === 'auth/invalid-email') {
        setError('Invalid email address.');
      } else {
        setError(err.message || 'Registration failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  if (step === 'register') {
    return (
      <div className="w-full max-w-2xl mx-auto animate-in fade-in slide-in-from-bottom-4">
        <button
          onClick={() => setStep('plans')}
          className="flex items-center gap-2 text-white/40 hover:text-white/70 transition-colors mb-8 group"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
          <span className="text-xs font-bold uppercase tracking-widest">Back to Plans</span>
        </button>

        <div className="text-center space-y-3 mb-10">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-brand/10 border border-brand/20 text-brand text-[10px] font-black uppercase tracking-widest mb-2">
            <Zap className="w-3 h-3" />
            {selectedPlan === 'free' ? 'Free Plan' : 'Enterprise Plan'}
          </div>
          <h2 className="text-4xl font-black text-white tracking-tight">Create Your Account</h2>
          <p className="text-white/50 text-base">Fill in the details below to set up your workspace.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-sm font-bold text-red-300 flex items-start gap-3"
            >
              <Shield className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </motion.div>
          )}

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="rounded-2xl border border-white/[0.06] bg-gradient-to-b from-white/[0.04] to-transparent overflow-hidden"
          >
            <div className="px-6 pt-5 pb-1">
              <div className="flex items-center gap-2.5 mb-1">
                <div className="w-7 h-7 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
                  <User className="w-3.5 h-3.5 text-blue-400" />
                </div>
                <h3 className="text-xs font-black text-white/70 uppercase tracking-widest">Personal Information</h3>
              </div>
              <p className="text-[10px] text-white/30 font-medium ml-[38px]">Who is the primary contact for this account?</p>
            </div>
            <div className="px-6 pt-4 pb-6 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-white/60 uppercase tracking-widest px-1 flex items-center gap-1">
                  <User className="w-3 h-3" /> Full Name
                </label>
                <div className="relative">
                  <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
                  <input
                    type="text" required value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-white/10 focus:border-brand focus:ring-1 focus:ring-brand/30 transition-all text-white placeholder:text-white/20 text-sm bg-white/[0.03] font-medium outline-none"
                    placeholder="John Doe"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-white/60 uppercase tracking-widest px-1 flex items-center gap-1">
                  <Phone className="w-3 h-3" /> Phone Number
                </label>
                <div className="relative">
                  <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
                  <input
                    type="tel" required value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-white/10 focus:border-brand focus:ring-1 focus:ring-brand/30 transition-all text-white placeholder:text-white/20 text-sm bg-white/[0.03] font-medium outline-none"
                    placeholder="+1 (555) 123-4567"
                  />
                </div>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="rounded-2xl border border-white/[0.06] bg-gradient-to-b from-white/[0.04] to-transparent overflow-hidden"
          >
            <div className="px-6 pt-5 pb-1">
              <div className="flex items-center gap-2.5 mb-1">
                <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                  <Building2 className="w-3.5 h-3.5 text-emerald-400" />
                </div>
                <h3 className="text-xs font-black text-white/70 uppercase tracking-widest">Organization Details</h3>
              </div>
              <p className="text-[10px] text-white/30 font-medium ml-[38px]">Tell us about your company.</p>
            </div>
            <div className="px-6 pt-4 pb-6 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-white/60 uppercase tracking-widest px-1 flex items-center gap-1">
                  <Building2 className="w-3 h-3" /> Organization Name
                </label>
                <div className="relative">
                  <Building2 className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
                  <input
                    type="text" required value={orgName}
                    onChange={(e) => setOrgName(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-white/10 focus:border-brand focus:ring-1 focus:ring-brand/30 transition-all text-white placeholder:text-white/20 text-sm bg-white/[0.03] font-medium outline-none"
                    placeholder="Acme Corp"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-white/60 uppercase tracking-widest px-1 flex items-center gap-1">
                  <Globe className="w-3 h-3" /> Email Domain
                </label>
                <div className="relative">
                  <Globe className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
                  <input
                    type="text" value={orgDomain}
                    onChange={(e) => setOrgDomain(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-white/10 focus:border-brand focus:ring-1 focus:ring-brand/30 transition-all text-white placeholder:text-white/20 text-sm bg-white/[0.03] font-medium outline-none"
                    placeholder="acme.com (optional)"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-white/60 uppercase tracking-widest px-1 flex items-center gap-1">
                  Industry
                </label>
                <select value={orgIndustry} onChange={(e) => setOrgIndustry(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-white/10 focus:border-brand focus:ring-1 focus:ring-brand/30 transition-all text-white text-sm bg-white/[0.03] font-medium outline-none"
                >
                  <option value="Technology">Technology</option>
                  <option value="Finance">Finance</option>
                  <option value="Healthcare">Healthcare</option>
                  <option value="Education">Education</option>
                  <option value="Retail">Retail</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-white/60 uppercase tracking-widest px-1 flex items-center gap-1">
                  Company Size
                </label>
                <select value={orgCompanySize} onChange={(e) => setOrgCompanySize(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-white/10 focus:border-brand focus:ring-1 focus:ring-brand/30 transition-all text-white text-sm bg-white/[0.03] font-medium outline-none"
                >
                  <option value="1-10">1-10 employees</option>
                  <option value="11-50">11-50 employees</option>
                  <option value="51-200">51-200 employees</option>
                  <option value="201-500">201-500 employees</option>
                  <option value="501-1000">501-1000 employees</option>
                  <option value="1000+">1000+ employees</option>
                </select>
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <label className="text-[10px] font-black text-white/60 uppercase tracking-widest px-1 flex items-center gap-1">
                  <MapPin className="w-3 h-3" /> Headquarters Location
                </label>
                <div className="relative">
                  <MapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
                  <input
                    type="text" value={orgLocation}
                    onChange={(e) => setOrgLocation(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-white/10 focus:border-brand focus:ring-1 focus:ring-brand/30 transition-all text-white placeholder:text-white/20 text-sm bg-white/[0.03] font-medium outline-none"
                    placeholder="San Francisco, CA"
                  />
                </div>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="rounded-2xl border border-white/[0.06] bg-gradient-to-b from-white/[0.04] to-transparent overflow-hidden"
          >
            <div className="px-6 pt-5 pb-1">
              <div className="flex items-center gap-2.5 mb-1">
                <div className="w-7 h-7 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
                  <Lock className="w-3.5 h-3.5 text-purple-400" />
                </div>
                <h3 className="text-xs font-black text-white/70 uppercase tracking-widest">Account Credentials</h3>
              </div>
              <p className="text-[10px] text-white/30 font-medium ml-[38px]">Secure your account with a strong password.</p>
            </div>
            <div className="px-6 pt-4 pb-6 space-y-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-white/60 uppercase tracking-widest px-1 flex items-center gap-1">
                  <Mail className="w-3 h-3" /> Email Address
                </label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
                  <input
                    type="email" required value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-white/10 focus:border-brand focus:ring-1 focus:ring-brand/30 transition-all text-white placeholder:text-white/20 text-sm bg-white/[0.03] font-medium outline-none"
                    placeholder="name@company.com"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-white/60 uppercase tracking-widest px-1 flex items-center gap-1">
                    <Lock className="w-3 h-3" /> Password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
                    <input
                      type={showPassword ? 'text' : 'password'} required value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-white/10 focus:border-brand focus:ring-1 focus:ring-brand/30 transition-all text-white placeholder:text-white/20 text-sm bg-white/[0.03] font-medium outline-none"
                      placeholder="Min 6 characters"
                    />
                    <button type="button" onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-white/60 uppercase tracking-widest px-1 flex items-center gap-1">
                    <Lock className="w-3 h-3" /> Confirm Password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
                    <input
                      type={showConfirmPassword ? 'text' : 'password'} required value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-white/10 focus:border-brand focus:ring-1 focus:ring-brand/30 transition-all text-white placeholder:text-white/20 text-sm bg-white/[0.03] font-medium outline-none"
                      placeholder="Confirm your password"
                    />
                    <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors"
                    >
                      {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 pt-2"
          >
            <button type="button" onClick={() => setStep('plans')}
              className="px-6 py-3.5 rounded-2xl border border-white/10 text-white/60 hover:text-white hover:border-white/20 font-bold text-sm transition-all flex items-center justify-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" /> Back
            </button>
            <RainbowButton type="submit" disabled={loading} className="flex-1 py-3.5 font-bold text-sm">
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="w-5 h-5 animate-spin" /> Creating Account...
                </span>
              ) : (
                <span className="flex items-center justify-center gap-2">
                  Create Account <Check className="w-4 h-4" />
                </span>
              )}
            </RainbowButton>
          </motion.div>
        </form>
      </div>
    );
  }

  return (
    <div className="w-full max-w-4xl mx-auto space-y-10 animate-in fade-in slide-in-from-bottom-4">
      <div className="text-center space-y-3">
        <h2 className="text-4xl font-black text-white tracking-tight">Choose Your Plan</h2>
        <p className="text-white/60 text-base">Start free and scale as you grow.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {plans.map((plan) => {
          const isSelected = selectedPlan === plan.id;
          const isEnt = plan.id === 'enterprise';
          return (
            <motion.div
              key={plan.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              whileHover={{ y: -4 }}
              onClick={() => setSelectedPlan(plan.id)}
              className={`relative flex flex-col rounded-3xl border-2 transition-all cursor-pointer overflow-hidden ${
                isSelected
                  ? 'border-brand bg-brand/[0.08] shadow-[0_0_40px_rgba(99,102,241,0.15)]'
                  : 'border-white/[0.06] bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.05]'
              }`}
            >
              {isSelected && <BorderBeam duration={8} size={300} />}
              {plan.popular && (
                <div className="absolute top-0 right-0 bg-brand text-[10px] font-black uppercase tracking-widest px-4 py-1.5 rounded-bl-2xl z-10">
                  Most Popular
                </div>
              )}

              <div className="p-8 flex flex-col flex-1">
                <div className="flex items-center gap-3 mb-5">
                  <div className={`w-11 h-11 rounded-2xl flex items-center justify-center border ${
                    isSelected ? 'bg-brand/20 border-brand/30' : 'bg-white/5 border-white/10'
                  }`}>
                    {isEnt ? <Shield className="w-5 h-5 text-emerald-400" /> : <Zap className="w-5 h-5 text-blue-400" />}
                  </div>
                  <h3 className="text-xl font-bold text-white">{plan.name}</h3>
                </div>

                <div className="mb-5">
                  {isEnt ? (
                    <div>
                      <span className="text-3xl font-black text-white">Custom</span>
                      <div className="text-white/50 text-sm mt-0.5">Tailored for your team</div>
                    </div>
                  ) : (
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-4xl font-black text-white">$0</span>
                      <span className="text-white/50 text-sm">/ month</span>
                    </div>
                  )}
                </div>

                {!isEnt && (
                  <div className="mb-5">
                    <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-black uppercase tracking-widest">
                      <Sparkles className="w-3 h-3" /> No credit card required
                    </span>
                  </div>
                )}

                <div className="pt-5 border-t border-white/10 space-y-3 flex-1">
                  {plan.features.map((feature, i) => (
                    <div key={i} className="flex items-start gap-3">
                      <Check className="w-4 h-4 text-brand shrink-0 mt-0.5" />
                      <span className="text-sm text-white/80">{feature}</span>
                    </div>
                  ))}
                </div>

                <div className="mt-8">
                  {isEnt ? (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleContactSales(); }}
                      className="w-full py-3.5 rounded-2xl border-2 border-white/20 text-white font-bold text-sm hover:bg-white/10 hover:border-white/30 transition-all flex items-center justify-center gap-2"
                    >
                      <Mail className="w-4 h-4" /> Talk to Sales
                    </button>
                  ) : (
                    <RainbowButton
                      onClick={(e) => { e.stopPropagation(); handleGetStarted(); }}
                      className="w-full py-3.5 font-bold text-sm"
                    >
                      Get Started Free
                    </RainbowButton>
                  )}
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      {!isEnterprise && (
        <div className="p-6 rounded-2xl border border-white/[0.06] bg-white/[0.02]">
          <div className="text-center">
            <p className="text-xs font-black text-emerald-400 uppercase tracking-widest flex items-center justify-center gap-1.5 mb-1">
              <Sparkles className="w-3.5 h-3.5" /> Free Forever
            </p>
            <p className="text-[10px] text-white/50 font-bold">1 seat included. No credit card needed.</p>
          </div>
        </div>
      )}
    </div>
  );
}
