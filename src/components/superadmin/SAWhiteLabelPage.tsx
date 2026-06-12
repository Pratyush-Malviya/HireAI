import { useState } from 'react';
import { Globe, Loader2 } from 'lucide-react';
import { doc, updateDoc } from 'firebase/firestore';
import { db, auth } from '../../lib/firebase';
import { useProfile, useNotification } from '../../lib/appContext';

export function SAWhiteLabelPage() {
  const { whiteLabelBrandingName, setWhiteLabelBrandingName, whiteLabelMarkupFactor, setWhiteLabelMarkupFactor, whiteLabelLogoUrl, setWhiteLabelLogoUrl } = useProfile();
  const { notify } = useNotification();
  const [primaryColor, setPrimaryColor] = useState('#4f46e5');
  const [resellerModel, setResellerModel] = useState<'per_seat' | 'per_interview'>('per_interview');
  const [saving, setSaving] = useState(false);
  const [clientTenants, setClientTenants] = useState([
    { id: 'ct-1', name: 'Zeta Software Solutions', jobs: 6, candidates: 184, billableAmt: 5400, markup: 1.30 },
    { id: 'ct-2', name: 'Stellar Tech Labs', jobs: 3, candidates: 49, billableAmt: 1950, markup: 1.40 },
    { id: 'ct-3', name: 'Infinity Healthcare Corp', jobs: 8, candidates: 298, billableAmt: 11200, markup: 1.25 },
  ]);
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editMarkup, setEditMarkup] = useState(1.35);

  const saveToFirestore = async () => {
    setSaving(true);
    try {
      await updateDoc(doc(db, 'settings', 'white_label'), {
        brandingName: whiteLabelBrandingName, logoUrl: whiteLabelLogoUrl,
        primaryColor, markupFactor: whiteLabelMarkupFactor,
        updatedAt: new Date().toISOString(), updatedBy: auth.currentUser?.uid,
      });
      notify('White-label config saved!', 'success');
    } catch (err) {
      notify('Failed to save config.', 'error');
    } finally { setSaving(false); }
  };

  const INPUT_CLS = 'mt-1.5 block w-full border border-white/10 bg-white/5 rounded-xl px-4 py-3 text-sm text-white focus:border-indigo-500/50 focus:outline-none transition-all min-h-[44px]';
  const LABEL_CLS = 'text-[9px] font-black text-white/50 uppercase tracking-widest';

  return (
    <div className="space-y-8 animate-in fade-in duration-400">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-white uppercase tracking-tight flex items-center gap-3">
            <span className="w-1 h-7 bg-gradient-to-b from-indigo-500 to-purple-600 rounded-full" />
            White-Label & Reseller
          </h1>
          <p className="text-white/50 text-sm mt-1">Customize workspace branding and reseller pricing margins.</p>
        </div>
        <button onClick={saveToFirestore} disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-xl text-[10px] font-black uppercase tracking-widest text-white hover:opacity-90 shadow-lg shadow-indigo-500/20 disabled:opacity-40 transition-all">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Globe className="w-4 h-4" />}
          Save to Firestore
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Portal Identity */}
        <div className="glass-premium rounded-2xl border border-white/10 p-6 space-y-4">
          <h3 className="text-[10px] font-black uppercase tracking-widest text-white/60">Portal Identity</h3>
          <div>
            <label className={LABEL_CLS}>Application Brand Name</label>
            <input type="text" value={whiteLabelBrandingName} onChange={e => setWhiteLabelBrandingName(e.target.value)} className={INPUT_CLS} />
          </div>
          <div>
            <label className={LABEL_CLS}>Custom Logo URL</label>
            <input type="text" value={whiteLabelLogoUrl} onChange={e => setWhiteLabelLogoUrl(e.target.value)} className={INPUT_CLS} />
            {whiteLabelLogoUrl && (
              <img src={whiteLabelLogoUrl} alt="Logo preview" className="mt-2 h-10 rounded-lg object-contain bg-white/5 p-1" onError={() => {}} />
            )}
          </div>
          <div>
            <label className={LABEL_CLS}>Primary Color</label>
            <div className="flex gap-2 mt-1.5">
              <input type="color" value={primaryColor} onChange={e => setPrimaryColor(e.target.value)}
                className="w-12 h-12 rounded-xl border border-white/10 cursor-pointer bg-transparent" />
              <input type="text" value={primaryColor} onChange={e => setPrimaryColor(e.target.value)}
                className="flex-1 border border-white/10 bg-white/5 rounded-xl px-4 py-3 text-sm text-white font-mono focus:border-indigo-500/50 focus:outline-none transition-all" />
            </div>
          </div>
          <div>
            <label className={LABEL_CLS}>Favicon URL</label>
            <input type="text" placeholder="https://yourdomain.com/favicon.ico" className={INPUT_CLS} />
          </div>
          <div>
            <label className={LABEL_CLS}>Custom Domain</label>
            <input type="text" placeholder="app.yourcompany.com" className={INPUT_CLS} />
          </div>
        </div>

        {/* Reseller policies */}
        <div className="glass-premium rounded-2xl border border-white/10 p-6 space-y-4">
          <h3 className="text-[10px] font-black uppercase tracking-widest text-white/60">Reseller Markup Policies</h3>
          <div>
            <label className={LABEL_CLS}>Markup Multiplier ({whiteLabelMarkupFactor}x)</label>
            <input type="range" min="1" max="3" step="0.05" value={whiteLabelMarkupFactor}
              onChange={e => setWhiteLabelMarkupFactor(parseFloat(e.target.value))}
              className="mt-3 block w-full cursor-pointer accent-indigo-500" />
            <span className="text-[10px] text-white/30 mt-1 block">Multiplies landing page pricing for reseller margins.</span>
          </div>
          <div>
            <label className={LABEL_CLS}>Billing Currency</label>
            <select className="mt-1.5 block w-full border border-white/10 bg-[#0d1117] rounded-xl px-3 py-3 text-sm text-white focus:border-indigo-500/50 focus:outline-none min-h-[44px]">
              <option>USD ($)</option><option>EUR (€)</option><option>GBP (£)</option><option>INR (₹)</option>
            </select>
          </div>
          <div>
            <label className={LABEL_CLS}>Reseller Model</label>
            <select value={resellerModel} onChange={e => setResellerModel(e.target.value as any)}
              className="mt-1.5 block w-full border border-white/10 bg-[#0d1117] rounded-xl px-3 py-3 text-sm text-white focus:border-indigo-500/50 focus:outline-none min-h-[44px]">
              <option value="per_seat">Per Seat</option>
              <option value="per_interview">Per Interview</option>
            </select>
          </div>
        </div>

        {/* Client tenants */}
        <div className="glass-premium rounded-2xl border border-white/10 p-6 space-y-4">
          <h3 className="text-[10px] font-black uppercase tracking-widest text-white/60">Client Tenants</h3>
          <div className="space-y-3">
            {clientTenants.map(ct => (
              <div key={ct.id} className="bg-white/5 border border-white/10 rounded-xl p-3 space-y-1.5 hover:border-white/20 transition-all">
                {editId === ct.id ? (
                  <div className="space-y-2">
                    <input type="text" value={editName} onChange={e => setEditName(e.target.value)}
                      className="w-full text-xs font-bold px-2 py-1.5 rounded-lg border border-white/10 bg-white/5 text-white focus:outline-none" />
                    <div className="flex gap-2">
                      <input type="number" step="0.05" value={editMarkup} onChange={e => setEditMarkup(parseFloat(e.target.value))}
                        className="w-20 text-xs font-bold px-2 py-1.5 rounded-lg border border-white/10 bg-white/5 text-white focus:outline-none" />
                      <button onClick={() => { setClientTenants(prev => prev.map(t => t.id === ct.id ? { ...t, name: editName, markup: editMarkup } : t)); setEditId(null); }}
                        className="px-3 py-1.5 bg-indigo-500/20 border border-indigo-500/20 text-indigo-400 rounded-lg text-[9px] font-black uppercase tracking-widest hover:bg-indigo-500/30 transition-all">
                        Save
                      </button>
                      <button onClick={() => setEditId(null)}
                        className="px-3 py-1.5 border border-white/10 text-white/40 rounded-lg text-[9px] font-black uppercase tracking-widest hover:text-white hover:bg-white/5 transition-all">
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-black text-white">{ct.name}</span>
                      <span className="text-[10px] font-black text-indigo-400">{ct.markup}x</span>
                    </div>
                    <div className="flex justify-between text-[9px] text-white/40">
                      <span>{ct.jobs} jobs • {ct.candidates} candidates</span>
                      <span>${ct.billableAmt.toLocaleString()}</span>
                    </div>
                    <button onClick={() => { setEditId(ct.id); setEditName(ct.name); setEditMarkup(ct.markup); }}
                      className="text-[8px] font-black text-indigo-400 uppercase tracking-widest hover:underline">
                      Edit Markup
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
