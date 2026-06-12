import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useNotification } from '../../lib/appContext';

export function SAPaymentsPage() {
  const { notify } = useNotification();
  const [stripeSecretKey, setStripeSecretKey] = useState('sk_test_51N....89h');
  const [stripePublishableKey, setStripePublishableKey] = useState('pk_test_51N....9d2');
  const [stripeWebhookSecret, setStripeWebhookSecret] = useState('whsec_abc123...');
  const [saving, setSaving] = useState(false);

  const INVOICES = [
    { inv: 'Inv-9812', name: 'Zeta Software Solutions', credits: 500, amount: '$499.00', date: 'June 2, 2026', status: 'Paid' },
    { inv: 'Inv-9813', name: 'Stellar Tech Labs', credits: 1000, amount: '$1,299.00', date: 'May 28, 2026', status: 'Paid' },
    { inv: 'Inv-9814', name: 'Infinity Healthcare Corp', credits: 200, amount: '$250.00', date: 'May 20, 2026', status: 'Manual' },
  ];

  return (
    <div className="space-y-8 animate-in fade-in duration-400">
      <div>
        <h1 className="text-2xl font-black text-white uppercase tracking-tight flex items-center gap-3">
          <span className="w-1 h-7 bg-gradient-to-b from-indigo-500 to-purple-600 rounded-full" />
          Revenue & Billing
        </h1>
        <p className="text-white/50 text-sm mt-1">Configure Stripe gateway keys and review recent invoices.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Stripe config */}
        <div className="lg:col-span-2 glass-premium rounded-2xl border border-white/10 p-6 space-y-6">
          <h3 className="text-[10px] font-black uppercase tracking-widest text-white/60 border-b border-white/10 pb-3">Stripe Gateway Keys</h3>
          <div className="space-y-4">
            {[
              { label: 'Stripe Secret Key', value: stripeSecretKey, setter: setStripeSecretKey, type: 'password' },
              { label: 'Stripe Publishable Key', value: stripePublishableKey, setter: setStripePublishableKey, type: 'text' },
              { label: 'Stripe Webhook Secret', value: stripeWebhookSecret, setter: setStripeWebhookSecret, type: 'password' },
            ].map(field => (
              <div key={field.label}>
                <label className="text-[9px] font-black text-white/50 uppercase tracking-widest">{field.label}</label>
                <input
                  type={field.type}
                  value={field.value}
                  onChange={e => field.setter(e.target.value)}
                  className="mt-1.5 block w-full border border-white/10 bg-white/5 rounded-xl px-4 py-3 text-xs font-mono text-white focus:border-indigo-500/50 focus:outline-none transition-all min-h-[44px]"
                />
              </div>
            ))}
          </div>
          <button
            onClick={async () => { setSaving(true); await new Promise(r => setTimeout(r, 600)); setSaving(false); notify('Stripe credentials saved!', 'success'); }}
            disabled={saving}
            className="w-full py-3 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-xl text-[10px] font-black uppercase tracking-widest text-white hover:opacity-90 shadow-lg shadow-indigo-500/20 transition-all disabled:opacity-40 flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save Stripe Credentials'}
          </button>
        </div>

        {/* Invoices */}
        <div className="glass-premium rounded-2xl border border-white/10 p-6 space-y-4">
          <h3 className="text-[10px] font-black uppercase tracking-widest text-white/60 border-b border-white/10 pb-3">Recent Invoices</h3>
          <div className="space-y-3">
            {INVOICES.map(inv => (
              <div key={inv.inv} className="bg-white/5 rounded-xl border border-white/10 p-4 space-y-2 hover:border-white/20 transition-all">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-black text-white truncate">{inv.inv} • {inv.name}</span>
                  <span className="text-xs font-black text-white shrink-0 ml-2">{inv.amount}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[10px] text-white/40 font-semibold">{inv.credits} Credits • {inv.date}</span>
                  <span className={`text-[9px] font-black px-2 py-0.5 rounded uppercase tracking-widest ${inv.status === 'Paid' ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'}`}>
                    {inv.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
