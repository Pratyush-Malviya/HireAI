import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Check, Zap, Shield, Mail, Sparkles } from 'lucide-react';
import { RainbowButton } from './magic-ui/rainbow-button';
import { BorderBeam } from './magic-ui/border-beam';

interface PricingStepProps {
  onPaymentComplete: (tier: string, seats: number) => void;
}

export function PricingStep({ onPaymentComplete }: PricingStepProps) {
  const [seats, setSeats] = useState<number>(1);
  const [selectedPlan, setSelectedPlan] = useState<string>('free');

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

  const currentPlanDetails = plans.find(p => p.id === selectedPlan) || plans[0];
  const isEnterprise = selectedPlan === 'enterprise';

  const handleCheckout = () => {
    onPaymentComplete(selectedPlan, seats);
  };

  const handleContactSales = () => {
    window.location.href = 'mailto:sales@hirenow.ai?subject=Enterprise%20Plan%20Inquiry';
  };

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
                      onClick={(e) => { e.stopPropagation(); handleCheckout(); }}
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
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="space-y-2 w-full md:w-auto">
              <label className="text-[10px] font-black text-white/50 uppercase tracking-widest">Seats</label>
              <div className="flex items-center gap-4">
                <input
                  type="range"
                  min="1"
                  max={currentPlanDetails.maxSeats}
                  value={seats}
                  onChange={(e) => setSeats(parseInt(e.target.value))}
                  className="w-full md:w-48 accent-brand"
                />
                <input
                  type="number"
                  min="1"
                  max={currentPlanDetails.maxSeats}
                  value={seats}
                  onChange={(e) => setSeats(parseInt(e.target.value))}
                  className="w-16 px-3 py-2 rounded-xl bg-white/10 border border-white/20 text-white font-bold text-center focus:outline-none focus:border-brand"
                />
              </div>
              <p className="text-[10px] text-brand/80 font-bold uppercase">
                {currentPlanDetails.maxSeats} seat included
              </p>
            </div>

            <div className="text-right space-y-1">
              <p className="text-xs font-black text-emerald-400 uppercase tracking-widest flex items-center justify-end gap-1.5">
                <Sparkles className="w-3.5 h-3.5" /> Free Forever
              </p>
              <p className="text-[10px] font-black text-white/50 uppercase tracking-widest">Total Due Today</p>
              <p className="text-3xl font-black text-white">$0</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
