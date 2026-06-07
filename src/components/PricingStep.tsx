import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Check, Zap, Building2, Shield, Loader2 } from 'lucide-react';
import { RainbowButton } from './magic-ui/rainbow-button';
import { BorderBeam } from './magic-ui/border-beam';

interface PricingStepProps {
  onPaymentComplete: (tier: string, seats: number) => void;
}

export function PricingStep({ onPaymentComplete }: PricingStepProps) {
  const [seats, setSeats] = useState<number>(1);
  const [selectedPlan, setSelectedPlan] = useState<string>('pro');
  const [isProcessing, setIsProcessing] = useState(false);

  const plans = [
    {
      id: 'starter',
      name: 'Starter',
      price: 49,
      icon: <Zap className="w-5 h-5 text-blue-400" />,
      features: ['Up to 5 seats', 'Basic AI Screening', 'Standard Support'],
      maxSeats: 5
    },
    {
      id: 'pro',
      name: 'Professional',
      price: 99,
      icon: <Building2 className="w-5 h-5 text-purple-400" />,
      features: ['Up to 50 seats', 'Advanced AI Voice Interviews', 'Priority Support', 'Custom Branding'],
      maxSeats: 50,
      popular: true
    },
    {
      id: 'enterprise',
      name: 'Enterprise',
      price: 199,
      icon: <Shield className="w-5 h-5 text-emerald-400" />,
      features: ['Unlimited seats', 'Dedicated Account Manager', 'SSO Integration', 'Custom AI Models'],
      maxSeats: 999
    }
  ];

  const currentPlanDetails = plans.find(p => p.id === selectedPlan) || plans[1];
  const total = seats * currentPlanDetails.price;

  useEffect(() => {
    if (seats > currentPlanDetails.maxSeats) {
      setSeats(currentPlanDetails.maxSeats);
    }
  }, [selectedPlan, seats, currentPlanDetails.maxSeats]);

  const handleCheckout = () => {
    setIsProcessing(true);
    // Simulate checkout process
    setTimeout(() => {
      onPaymentComplete(selectedPlan, seats);
    }, 2500);
  };

  return (
    <div className="w-full max-w-5xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4">
      <div className="text-center space-y-2">
        <h2 className="text-3xl font-black text-white tracking-tight uppercase">Select Your Plan</h2>
        <p className="text-white/70 text-sm font-medium">Choose a tier and how many recruiter seats you need.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {plans.map((plan) => (
          <motion.div
            key={plan.id}
            whileHover={{ y: -5 }}
            onClick={() => setSelectedPlan(plan.id)}
            className={`relative p-6 rounded-3xl border-2 transition-all cursor-pointer overflow-hidden ${
              selectedPlan === plan.id 
                ? 'border-brand bg-brand/10 shadow-[0_0_30px_rgba(99,102,241,0.2)]' 
                : 'border-white/10 bg-white/5 hover:border-white/20'
            }`}
          >
            {selectedPlan === plan.id && <BorderBeam duration={8} size={200} />}
            {plan.popular && (
              <div className="absolute top-0 right-0 bg-brand text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-bl-xl">
                Most Popular
              </div>
            )}
            
            <div className="space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center border border-white/10">
                {plan.icon}
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">{plan.name}</h3>
                <div className="flex items-baseline gap-1 mt-1">
                  <span className="text-3xl font-black text-white">${plan.price}</span>
                  <span className="text-white/50 text-sm">/ seat / month</span>
                </div>
              </div>

              <div className="pt-4 border-t border-white/10 space-y-3">
                {plan.features.map((feature, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-brand shrink-0 mt-0.5" />
                    <span className="text-sm text-white/80">{feature}</span>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="p-6 rounded-3xl border border-white/10 bg-white/5 flex flex-col md:flex-row items-center justify-between gap-6 relative overflow-hidden">
        <div className="space-y-2 w-full md:w-auto">
          <label className="text-[10px] font-black text-white uppercase tracking-widest">Number of Seats</label>
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
            Max {currentPlanDetails.maxSeats} seats on this plan
          </p>
        </div>

        <div className="flex items-center gap-6 w-full md:w-auto justify-between md:justify-end">
          <div className="text-right">
            <p className="text-[10px] font-black text-brand uppercase tracking-widest mb-1 flex items-center justify-end gap-1">
              <Zap className="w-3 h-3" /> Includes 7-Day Free Trial
            </p>
            <p className="text-[10px] font-black text-white/50 uppercase tracking-widest">Total Due Today</p>
            <p className="text-3xl font-black text-white">$0</p>
            <p className="text-[10px] text-white/40 mt-1">${total}/mo after 7 days</p>
          </div>
          
          <RainbowButton 
            onClick={handleCheckout} 
            disabled={isProcessing}
            className="px-8 py-4 font-bold min-w-[200px]"
          >
            {isProcessing ? (
              <span className="flex items-center gap-2">
                <Loader2 className="w-5 h-5 animate-spin" /> Processing...
              </span>
            ) : (
              'Start Free Trial'
            )}
          </RainbowButton>
        </div>
      </div>
    </div>
  );
}
