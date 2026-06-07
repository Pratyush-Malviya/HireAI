import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, updateDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { db, auth } from '../lib/firebase';
import { Organization } from '../types';
import { Loader2, Lock, ShieldCheck, ArrowRight, CheckCircle2 } from 'lucide-react';
import { RainbowButton } from './magic-ui/rainbow-button';
import { BorderBeam } from './magic-ui/border-beam';

export function PaymentGateway() {
  const { orgId } = useParams();
  const navigate = useNavigate();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [org, setOrg] = useState<Organization | null>(null);
  const [loading, setLoading] = useState(true);
  const [processingPayment, setProcessingPayment] = useState(false);
  const [paymentComplete, setPaymentComplete] = useState(false);

  useEffect(() => {
    if (!orgId) return;
    
    getDoc(doc(db, 'organizations', orgId))
      .then(docSnap => {
        if (docSnap.exists()) {
          const data = docSnap.data() as Organization;
          if (data.status === 'pending_payment') {
            setOrg({ id: docSnap.id, ...data });
          } else {
            setErrorMsg('This invoice has already been paid or is invalid.');
            setTimeout(() => navigate('/'), 3000);
          }
        } else {
          setErrorMsg('Organization invoice not found.');
          setTimeout(() => navigate('/'), 3000);
        }
      })
      .catch(err => {
        console.error(err);
        setErrorMsg('Failed to load invoice.');
      })
      .finally(() => setLoading(false));
  }, [orgId, navigate]);

  const getTierPrice = (tier?: string) => {
    switch (tier) {
      case 'starter': return 49;
      case 'enterprise': return 199;
      case 'pro':
      default:
        return 99;
    }
  };

  const handlePay = () => {
    setProcessingPayment(true);
    // Simulate secure payment processing
    setTimeout(async () => {
      try {
        if (!orgId) return;
        await updateDoc(doc(db, 'organizations', orgId), {
          status: 'active'
        });
        setPaymentComplete(true);
        setSuccessMsg('Payment successful! Please claim your workspace.');
      } catch (err) {
        setErrorMsg('Payment failed. Please try again.');
      } finally {
        setProcessingPayment(false);
      }
    }, 2500);
  };

  const handleStartTrial = async () => {
    setProcessingPayment(true);
    try {
      if (!orgId) return;
      const trialEnds = new Date();
      trialEnds.setDate(trialEnds.getDate() + 7);
      
      await updateDoc(doc(db, 'organizations', orgId), {
        status: 'active',
        trialEndsAt: trialEnds
      });
      setPaymentComplete(true);
      setSuccessMsg('7-Day Free Trial activated! Please claim your workspace.');
    } catch (err) {
      setErrorMsg('Failed to start trial. Please try again.');
    } finally {
      setProcessingPayment(false);
    }
  };

  const handleClaimWorkspace = async () => {
    try {
      setProcessingPayment(true);
      let user = auth.currentUser;
      
      if (!user) {
        const provider = new GoogleAuthProvider();
        const result = await signInWithPopup(auth, provider);
        user = result.user;
      }
      
      await setDoc(doc(db, 'users', user.uid), {
        uid: user.uid,
        email: user.email,
        organizationId: orgId,
        role: 'owner',
        fullName: user.displayName || '',
        createdAt: serverTimestamp()
      });
      
      setSuccessMsg('Workspace claimed successfully! Welcome to HireNow.');
      setTimeout(() => {
        navigate('/');
        window.location.reload(); // Hard reload to refresh profile context
      }, 1500);
    } catch (err) {
      console.error(err);
      setErrorMsg('Failed to sign in. You must sign in to claim this workspace.');
      setProcessingPayment(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-4 animate-pulse">
          <Loader2 className="w-8 h-8 text-brand animate-spin" />
          <p className="text-[10px] font-black text-white uppercase tracking-widest">Securing Invoice...</p>
        </div>
      </div>
    );
  }

  if (!org) return null;

  const price = getTierPrice(org.tier);
  const total = price * (org.seatCount || 1);

  return (
    <div className="min-h-screen flex items-center justify-center p-6 relative font-sans">
      <div className="absolute inset-0 z-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-brand-dark/20 via-slate-950 to-[#030712] opacity-80 pointer-events-none" />
      
      <div className="relative z-10 w-full max-w-lg space-y-8 animate-in fade-in slide-in-from-bottom-4">
        
        <div className="text-center space-y-2">
          <div className="w-16 h-16 rounded-2xl bg-brand/10 border-2 border-brand/20 flex items-center justify-center mx-auto mb-6 shadow-[0_0_30px_rgba(99,102,241,0.2)]">
            <Lock className="w-8 h-8 text-brand" />
          </div>
          <h1 className="text-3xl font-black text-white tracking-tight uppercase">Secure Checkout</h1>
          <p className="text-white/60 text-sm font-medium">Complete payment to activate your organization workspace.</p>
        </div>
        
        {errorMsg && (
          <div className="p-4 rounded-xl bg-red-500/20 border border-red-500/50 text-red-200 text-sm font-bold text-center">
            {errorMsg}
          </div>
        )}
        {successMsg && !paymentComplete && (
          <div className="p-4 rounded-xl bg-emerald-500/20 border border-emerald-500/50 text-emerald-200 text-sm font-bold text-center">
            {successMsg}
          </div>
        )}

        <div className="relative p-8 rounded-3xl border border-white/10 glass-premium overflow-hidden">
          {!paymentComplete ? (
            <div className="space-y-6">
              <div className="pb-6 border-b border-white/10">
                <p className="text-[10px] font-black text-brand uppercase tracking-widest mb-1">Organization</p>
                <h2 className="text-2xl font-bold text-white">{org.name}</h2>
                {org.adminEmail && <p className="text-sm text-white/50">{org.adminEmail}</p>}
              </div>

              <div className="space-y-4 pb-6 border-b border-white/10">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-white/70">Plan Tier</span>
                  <span className="font-bold text-white capitalize">{org.tier || 'Pro'}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-white/70">Seat Count</span>
                  <span className="font-bold text-white">{org.seatCount || 1} {org.seatCount === 1 ? 'seat' : 'seats'}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-white/70">Price per Seat</span>
                  <span className="font-bold text-white">${price}/mo</span>
                </div>
              </div>

              <div className="flex justify-between items-end">
                <span className="text-[10px] font-black text-white/50 uppercase tracking-widest pb-1">Total Due</span>
                <span className="text-4xl font-black text-white">${total}</span>
              </div>

              <div className="space-y-3 mt-4">
                <RainbowButton 
                  onClick={handlePay} 
                  disabled={processingPayment}
                  className="w-full py-4 font-bold"
                >
                  {processingPayment ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="w-5 h-5 animate-spin" /> Processing Payment...
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      Pay ${total} <ArrowRight className="w-4 h-4" />
                    </span>
                  )}
                </RainbowButton>

                <button
                  onClick={handleStartTrial}
                  disabled={processingPayment}
                  className="w-full py-3.5 rounded-xl border-2 border-white/10 hover:border-white/30 hover:bg-white/5 text-white font-bold transition-all flex justify-center items-center gap-2 text-sm"
                >
                  Start 7-Day Free Trial
                </button>
              </div>

              <div className="flex items-center justify-center gap-2 text-[10px] text-white/40 uppercase font-black tracking-widest mt-4">
                <ShieldCheck className="w-3.5 h-3.5" /> Secure 256-bit SSL Encryption
              </div>
            </div>
          ) : (
            <div className="space-y-8 text-center animate-in fade-in zoom-in-95 duration-500">
              <BorderBeam size={150} duration={4} />
              
              <div className="w-20 h-20 bg-emerald-500/10 border-2 border-emerald-500/20 rounded-full flex items-center justify-center mx-auto text-emerald-400 shadow-[0_0_30px_rgba(16,185,129,0.2)]">
                <CheckCircle2 className="w-10 h-10" />
              </div>

              <div className="space-y-2">
                <h3 className="text-2xl font-black text-white tracking-tight uppercase">Payment Successful!</h3>
                <p className="text-sm text-white/70">
                  Your workspace <strong>{org.name}</strong> is now active.
                  <br /> Claim it by signing in with your Google account.
                </p>
              </div>

              {successMsg && (
                <div className="p-3 rounded-lg bg-emerald-500/20 border border-emerald-500/50 text-emerald-200 text-sm font-bold text-center mb-4">
                  {successMsg}
                </div>
              )}
              {errorMsg && (
                <div className="p-3 rounded-lg bg-red-500/20 border border-red-500/50 text-red-200 text-sm font-bold text-center mb-4">
                  {errorMsg}
                </div>
              )}

              <button
                onClick={handleClaimWorkspace}
                disabled={processingPayment}
                className="w-full group relative flex items-center justify-center gap-3 bg-white hover:bg-slate-50 text-slate-900 rounded-xl px-6 py-4 transition-all hover:scale-[1.02] active:scale-[0.98] shadow-xl shadow-white/5"
              >
                {processingPayment ? (
                   <Loader2 className="w-5 h-5 animate-spin text-slate-900" />
                ) : (
                  <>
                    <svg className="w-5 h-5" viewBox="0 0 24 24">
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                    </svg>
                    <span className="font-bold text-sm tracking-wide">{auth.currentUser ? 'Claim Workspace' : 'Sign In to Claim Workspace'}</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
