import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Copy, Loader2, Users, Ban, AlertTriangle } from 'lucide-react';
import {
  collection, addDoc, getDocs, updateDoc, doc, serverTimestamp, writeBatch
} from 'firebase/firestore';
import { db, auth } from '../../lib/firebase';
import { cn } from '../../lib/utils';
import { useProfile, useNotification } from '../../lib/appContext';
import type { Organization } from '../../types';

// ── Onboard Modal ─────────────────────────────────────────────────────────────

function OnboardModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (org: Organization) => void }) {
  const { confirm, notify } = useNotification();
  const [mode, setMode] = useState<'single' | 'bulk'>('single');
  const [name, setName] = useState(''); const [domain, setDomain] = useState('');
  const [industry, setIndustry] = useState('Technology'); const [size, setSize] = useState('11-50');
  const [location, setLocation] = useState(''); const [phone, setPhone] = useState('');
  const [desc, setDesc] = useState(''); const [adminEmail, setAdminEmail] = useState('');
  const [tier, setTier] = useState('pro'); const [seats, setSeats] = useState(1);
  const [provision, setProvision] = useState(false);
  const [bulkNames, setBulkNames] = useState('');
  const [saving, setSaving] = useState(false);

  if (!open) return null;

  const handleSingle = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const data: any = {
        name: name.trim(), domain: domain.trim() || null, industry, companySize: size,
        location: location.trim(), phone: phone.trim(), description: desc.trim(),
        createdAt: serverTimestamp(), createdBy: auth.currentUser?.uid, status: 'active',
      };
      if (provision) { data.adminEmail = adminEmail.trim(); data.tier = tier; data.seatCount = seats; data.status = 'pending_payment'; }
      const ref = await addDoc(collection(db, 'organizations'), data);
      if (provision) {
        const link = `${window.location.origin}/pay/${ref.id}`;
        navigator.clipboard.writeText(link);
        notify('Payment link copied to clipboard!', 'success');
      } else {
        notify('Organization created!', 'success');
      }
      onCreated({ id: ref.id, ...data, createdAt: new Date() } as Organization);
      onClose();
    } catch (err) {
      notify('Failed: ' + (err instanceof Error ? err.message : 'error'), 'error');
    } finally { setSaving(false); }
  };

  const handleBulk = async (e: React.FormEvent) => {
    e.preventDefault();
    const names = bulkNames.split('\n').map(n => n.trim()).filter(Boolean);
    if (!names.length) return;
    setSaving(true);
    try {
      for (let i = 0; i < names.length; i += 400) {
        const batch = writeBatch(db);
        names.slice(i, i + 400).forEach(n => {
          const ref = doc(collection(db, 'organizations'));
          batch.set(ref, { name: n, createdAt: serverTimestamp(), createdBy: auth.currentUser?.uid, status: 'active' });
        });
        await batch.commit();
      }
      notify(`${names.length} organizations created!`, 'success');
      onClose();
    } catch (err) {
      notify('Bulk failed: ' + (err instanceof Error ? err.message : 'error'), 'error');
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="glass-premium rounded-3xl border border-white/10 w-full max-w-lg shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        <div className="p-6 border-b border-white/10 flex items-center justify-between">
          <h3 className="font-black text-lg text-white uppercase tracking-tight">
            {mode === 'bulk' ? 'Bulk Onboard' : provision ? 'Provision Payment Link' : 'New Organization'}
          </h3>
          <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-xl transition-all text-white/50 hover:text-white">✕</button>
        </div>
        <div className="p-6 space-y-5">
          {/* Mode toggle */}
          <div className="flex gap-1 p-1 bg-white/5 rounded-xl">
            {(['single', 'bulk'] as const).map(m => (
              <button key={m} onClick={() => setMode(m)}
                className={cn('flex-1 py-2 text-[9px] font-black uppercase tracking-widest rounded-lg transition-all',
                  mode === m ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/20' : 'text-white/40 hover:text-white'
                )}>
                {m === 'single' ? 'Single Entry' : 'Bulk Upload'}
              </button>
            ))}
          </div>

          {mode === 'single' ? (
            <form onSubmit={handleSingle} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[9px] font-black text-white/50 uppercase tracking-widest">Company Name *</label>
                <input required value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Acme Corporation"
                  className="w-full border border-white/10 rounded-xl px-4 py-2.5 text-sm font-bold text-white bg-white/5 focus:border-indigo-500/50 focus:outline-none placeholder:text-white/20 transition-all" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-white/50 uppercase tracking-widest">Industry</label>
                  <select value={industry} onChange={e => setIndustry(e.target.value)}
                    className="w-full border border-white/10 rounded-xl px-3 py-2.5 text-sm font-bold text-white bg-[#0d1117] focus:border-indigo-500/50 focus:outline-none transition-all">
                    {['Technology','Finance','Healthcare','Education','Retail','Non-Profit','Other'].map(v => <option key={v}>{v}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-white/50 uppercase tracking-widest">Size</label>
                  <select value={size} onChange={e => setSize(e.target.value)}
                    className="w-full border border-white/10 rounded-xl px-3 py-2.5 text-sm font-bold text-white bg-[#0d1117] focus:border-indigo-500/50 focus:outline-none transition-all">
                    {['1-10','11-50','51-200','201-500','501-1000','1000+'].map(v => <option key={v}>{v} employees</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-white/50 uppercase tracking-widest">Location</label>
                  <input value={location} onChange={e => setLocation(e.target.value)} placeholder="San Francisco"
                    className="w-full border border-white/10 rounded-xl px-3 py-2.5 text-sm font-bold text-white bg-white/5 focus:border-indigo-500/50 focus:outline-none placeholder:text-white/20 transition-all" />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-white/50 uppercase tracking-widest">Email Domain</label>
                  <input value={domain} onChange={e => setDomain(e.target.value)} placeholder="acme.com (optional)"
                    className="w-full border border-white/10 rounded-xl px-3 py-2.5 text-sm font-bold text-white bg-white/5 focus:border-indigo-500/50 focus:outline-none placeholder:text-white/20 transition-all font-mono" />
                </div>
              </div>

              {/* Provision toggle */}
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={provision} onChange={e => setProvision(e.target.checked)} className="w-4 h-4 accent-indigo-500" />
                <span className="text-[10px] font-black text-white/60 uppercase tracking-widest">Generate Payment Link</span>
              </label>

              {provision && (
                <div className="grid grid-cols-2 gap-3 p-3 bg-white/5 rounded-xl border border-white/10">
                  <div className="space-y-1 col-span-2">
                    <label className="text-[9px] font-black text-white/50 uppercase tracking-widest">Admin Email *</label>
                    <input type="email" required value={adminEmail} onChange={e => setAdminEmail(e.target.value)} placeholder="founder@acme.com"
                      className="w-full border border-white/10 rounded-xl px-3 py-2.5 text-sm font-bold text-white bg-white/5 focus:border-indigo-500/50 focus:outline-none placeholder:text-white/20 transition-all" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-white/50 uppercase tracking-widest">Tier</label>
                    <select value={tier} onChange={e => setTier(e.target.value)}
                      className="w-full border border-white/10 rounded-xl px-3 py-2 text-sm font-bold text-white bg-[#0d1117] focus:outline-none">
                      <option value="starter">Starter ($49/seat)</option>
                      <option value="pro">Professional ($99/seat)</option>
                      <option value="enterprise">Enterprise ($199/seat)</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-white/50 uppercase tracking-widest">Seats</label>
                    <input type="number" min="1" max="999" value={seats} onChange={e => setSeats(parseInt(e.target.value))}
                      className="w-full border border-white/10 rounded-xl px-3 py-2 text-sm font-bold text-white bg-white/5 focus:outline-none" />
                  </div>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={onClose}
                  className="flex-1 py-2.5 border border-white/10 rounded-xl text-[10px] font-black uppercase tracking-widest text-white/50 hover:text-white hover:bg-white/5 transition-all">
                  Cancel
                </button>
                <button type="submit" disabled={saving || !name}
                  className="flex-1 py-2.5 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-xl text-[10px] font-black uppercase tracking-widest text-white hover:opacity-90 shadow-lg shadow-indigo-500/20 disabled:opacity-40 transition-all">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : provision ? 'Generate Link' : 'Create'}
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleBulk} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[9px] font-black text-white/50 uppercase tracking-widest">Company Names (one per line)</label>
                <textarea required rows={8} value={bulkNames} onChange={e => setBulkNames(e.target.value)}
                  placeholder={"Acme Corp\nGlobex Ltd\nSoylent Inc"}
                  className="w-full border border-white/10 rounded-xl px-4 py-3 font-bold text-white bg-white/5 focus:border-indigo-500/50 focus:outline-none placeholder:text-white/20 transition-all resize-none" />
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={onClose}
                  className="flex-1 py-2.5 border border-white/10 rounded-xl text-[10px] font-black uppercase tracking-widest text-white/50 hover:text-white hover:bg-white/5 transition-all">
                  Cancel
                </button>
                <button type="submit" disabled={saving || !bulkNames}
                  className="flex-1 py-2.5 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-xl text-[10px] font-black uppercase tracking-widest text-white hover:opacity-90 shadow-lg shadow-indigo-500/20 disabled:opacity-40 transition-all">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Bulk Create'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Organizations Page ────────────────────────────────────────────────────────

export function SAOrganizationsPage() {
  const { isAdmin } = useProfile();
  const { confirm, notify } = useNotification();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);

  useEffect(() => {
    if (!isAdmin) { setLoading(false); return; }
    getDocs(collection(db, 'organizations')).then(snap => {
      setOrganizations(snap.docs.map(d => ({ id: d.id, ...d.data() } as Organization)));
    }).finally(() => setLoading(false));
  }, [isAdmin]);

  const selectedOrg = organizations.find(o => o.id === selectedOrgId);

  if (loading) return <div className="h-64 flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-indigo-400" /></div>;

  return (
    <div className="space-y-6 animate-in fade-in duration-400">
      <OnboardModal open={modalOpen} onClose={() => setModalOpen(false)}
        onCreated={(org) => { setOrganizations(prev => [org, ...prev]); }} />

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-white uppercase tracking-tight flex items-center gap-3">
            <span className="w-1 h-7 bg-gradient-to-b from-indigo-500 to-purple-600 rounded-full" />
            Organization Registry
          </h1>
          <p className="text-white/50 text-sm mt-1">{organizations.length} registered tenants.</p>
        </div>
        <button onClick={() => setModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-xl text-[10px] font-black uppercase tracking-widest text-white hover:opacity-90 shadow-lg shadow-indigo-500/20 transition-all">
          <Plus className="w-3.5 h-3.5" /> Onboard
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Org list */}
        <div className="xl:col-span-2 glass-premium rounded-2xl border border-white/10 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px]">
              <thead className="border-b border-white/10 bg-white/5">
                <tr>
                  {['Organization', 'Industry & Size', 'Status', 'Actions'].map((h, i) => (
                    <th key={h} className={cn('px-5 py-4 text-[9px] font-black text-white/50 uppercase tracking-widest', i === 3 ? 'text-right' : 'text-left')}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {organizations.map(org => (
                  <tr key={org.id}
                    onClick={() => setSelectedOrgId(selectedOrgId === org.id ? null : org.id)}
                    className={cn('cursor-pointer transition-colors hover:bg-white/5', selectedOrgId === org.id && 'bg-indigo-500/5')}>
                    <td className="px-5 py-3.5">
                      <div className="font-bold text-xs text-white uppercase tracking-tight">{org.name}</div>
                      <div className="text-[9px] text-white/30 font-mono mt-0.5">ID: {org.id.slice(0, 10)}...</div>
                      {org.domain && <div className="text-[9px] text-indigo-400 font-mono mt-0.5">{org.domain}</div>}
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="text-[11px] font-bold text-white">{org.industry || 'Technology'}</div>
                      <div className="text-[9px] text-white/30 mt-0.5">{org.companySize || '11-50 employees'}</div>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={cn('text-[9px] font-black px-2 py-0.5 rounded uppercase tracking-widest border',
                        org.status === 'active' ? 'bg-green-500/10 text-green-400 border-green-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20'
                      )}>{org.status}</span>
                    </td>
                    <td className="px-5 py-3.5 text-right" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/join/${org.id}`); notify(`Invite link for ${org.name} copied!`, 'success'); }}
                          className="flex items-center gap-1 h-7 px-2.5 border border-white/10 rounded-lg text-[9px] font-black uppercase tracking-widest text-white/60 hover:text-white hover:bg-white/10 transition-all">
                          <Copy className="w-3 h-3" /> Link
                        </button>
                        <button
                          onClick={async () => {
                            const isSuspended = org.status === 'suspended';
                            const ok = await confirm(`${isSuspended ? 'Reactivate' : 'Suspend'} ${org.name}?`);
                            if (!ok) return;
                            await updateDoc(doc(db, 'organizations', org.id), { status: isSuspended ? 'active' : 'suspended' });
                            setOrganizations(prev => prev.map(x => x.id === org.id ? { ...x, status: isSuspended ? 'active' : 'suspended' } : x));
                            notify(`Organization ${isSuspended ? 'reactivated' : 'suspended'}.`, 'success');
                          }}
                          className={cn('h-7 px-2.5 border rounded-lg text-[9px] font-black uppercase tracking-widest transition-all',
                            org.status === 'active' ? 'text-red-400 hover:bg-red-500/10 border-red-500/20' : 'text-green-400 hover:bg-green-500/10 border-green-500/20'
                          )}>
                          {org.status === 'active' ? 'Suspend' : 'Activate'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {organizations.length === 0 && (
                  <tr><td colSpan={4} className="px-5 py-12 text-center text-[10px] font-black text-white/30 uppercase tracking-widest">No organizations yet</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Org details panel */}
        <div>
          {selectedOrg ? (
            <div className="glass-premium rounded-2xl border border-white/10 p-6 space-y-5 animate-in slide-in-from-right-4 duration-300">
              <div>
                <span className="text-[9px] font-black text-indigo-400 uppercase tracking-widest">Selected Tenant</span>
                <h3 className="text-lg font-black text-white mt-1">{selectedOrg.name}</h3>
              </div>

              {/* Allocate credits */}
              <div className="p-4 border border-white/10 rounded-xl space-y-3">
                <h4 className="text-[9px] font-black uppercase text-white/50 tracking-widest">Allocate Credits</h4>
                <div className="flex gap-2">
                  <input type="number" id={`credits-${selectedOrg.id}`} defaultValue="50" placeholder="Credits"
                    className="w-24 border border-white/10 rounded-xl px-3 py-1.5 text-xs font-bold text-white bg-white/5 focus:outline-none" />
                  <button onClick={async () => {
                    const el = document.getElementById(`credits-${selectedOrg.id}`) as HTMLInputElement;
                    const amount = parseInt(el?.value || '0');
                    if (!amount) return;
                    const ok = await confirm(`Allocate ${amount} credits to ${selectedOrg.name}?`);
                    if (ok) notify(`${amount} credits allocated!`, 'success');
                  }}
                    className="px-4 py-1.5 bg-indigo-500/20 border border-indigo-500/20 text-indigo-400 rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-indigo-500/30 transition-all">
                    Allocate
                  </button>
                </div>
              </div>

              {/* Seat override */}
              <div className="p-4 border border-white/10 rounded-xl space-y-3">
                <h4 className="text-[9px] font-black uppercase text-white/50 tracking-widest">Seat Override</h4>
                <p className="text-[9px] text-white/40">Current: {selectedOrg.seatCount || 0} | Members: {selectedOrg.memberCount || 0}</p>
                <div className="flex gap-2">
                  <input type="number" id={`seats-${selectedOrg.id}`} defaultValue={selectedOrg.seatCount || 5} min="1" max="999"
                    className="w-24 border border-white/10 rounded-xl px-3 py-1.5 text-xs font-bold text-white bg-white/5 focus:outline-none" />
                  <button onClick={async () => {
                    const el = document.getElementById(`seats-${selectedOrg.id}`) as HTMLInputElement;
                    const seats = parseInt(el?.value || '0');
                    if (!seats) return;
                    const ok = await confirm(`Override seat limit to ${seats} for ${selectedOrg.name}?`);
                    if (!ok) return;
                    await updateDoc(doc(db, 'organizations', selectedOrg.id), { seatCount: seats });
                    setOrganizations(prev => prev.map(x => x.id === selectedOrg.id ? { ...x, seatCount: seats } : x));
                    notify('Seat limit updated!', 'success');
                  }}
                    className="px-4 py-1.5 bg-indigo-500/20 border border-indigo-500/20 text-indigo-400 rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-indigo-500/30 transition-all">
                    Override
                  </button>
                </div>
              </div>

              {/* Nuclear reset */}
              <div className="p-4 border border-red-500/20 rounded-xl space-y-3">
                <h4 className="text-[9px] font-black uppercase text-red-400/80 tracking-widest flex items-center gap-2">
                  <AlertTriangle className="w-3.5 h-3.5" /> Nuclear Reset
                </h4>
                <div className="flex gap-2">
                  <input type="text" id={`nuclear-${selectedOrg.id}`} placeholder={`Type "${selectedOrg.name}"`}
                    className="flex-1 border border-red-500/30 rounded-xl px-3 py-1.5 text-xs font-bold text-white bg-white/5 focus:border-red-500 focus:outline-none placeholder:text-white/20" />
                  <button onClick={async () => {
                    const el = document.getElementById(`nuclear-${selectedOrg.id}`) as HTMLInputElement;
                    if (el?.value !== selectedOrg.name) { notify(`Type the exact name "${selectedOrg.name}"`, 'error'); return; }
                    const ok = await confirm(`DANGER: Delete ALL data for ${selectedOrg.name}?`);
                    if (!ok) return;
                    const batch = writeBatch(db);
                    const [jobsSnap, candidatesSnap] = await Promise.all([
                      getDocs(collection(db, 'jobs')),
                      getDocs(collection(db, 'candidates')),
                    ]);
                    jobsSnap.docs.filter(d => d.data().organizationId === selectedOrg.id).forEach(d => batch.delete(d.ref));
                    candidatesSnap.docs.filter(d => d.data().organizationId === selectedOrg.id).forEach(d => batch.delete(d.ref));
                    await batch.commit();
                    await updateDoc(doc(db, 'organizations', selectedOrg.id), { status: 'suspended', memberCount: 0, jobCount: 0, candidateCount: 0 });
                    setOrganizations(prev => prev.map(x => x.id === selectedOrg.id ? { ...x, status: 'suspended' } : x));
                    notify('Nuclear reset complete.', 'success');
                    setSelectedOrgId(null);
                  }}
                    className="px-4 py-1.5 bg-red-500/20 border border-red-500/30 text-red-400 rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-red-500/30 transition-all flex items-center gap-1">
                    <Ban className="w-3 h-3" /> Reset
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="glass-premium rounded-2xl border border-dashed border-white/10 p-10 text-center flex flex-col items-center gap-4">
              <Users className="w-12 h-12 text-white/20" />
              <div>
                <h4 className="font-black text-xs uppercase tracking-wider text-white/40">Select an Organization</h4>
                <p className="text-[10px] text-white/25 max-w-[180px] leading-relaxed mt-1">Click any row to inspect and manage the tenant workspace.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
