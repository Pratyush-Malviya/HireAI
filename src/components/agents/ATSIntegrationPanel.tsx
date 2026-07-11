import React, { useState } from 'react';
import { GitBranch, Plug, Loader2, CheckCircle2, AlertCircle, RefreshCw, ArrowRight, ExternalLink, Settings } from 'lucide-react';
import { cn } from '../../lib/utils';
import { ATSSystem, createATSConnection, testATSConnection, getMappingsForSystem } from '../../services/agents/atsIntegration';

interface Props { organizationId?: string; onNotify: (msg: string, type: 'success' | 'error' | 'info' | 'warn') => void; }

const ATS_SYSTEMS: { id: ATSSystem; name: string; description: string; color: string }[] = [
  { id: 'zoho_recruit', name: 'Zoho Recruit', description: 'Full-featured ATS with candidate management', color: 'from-blue-500 to-cyan-500' },
  { id: 'greenhouse', name: 'Greenhouse', description: 'Enterprise recruiting & onboarding', color: 'from-green-500 to-emerald-500' },
  { id: 'lever', name: 'Lever', description: 'Modern ATS with CRM capabilities', color: 'from-purple-500 to-pink-500' },
  { id: 'workday', name: 'Workday', description: 'Enterprise HR & talent management', color: 'from-amber-500 to-orange-500' },
  { id: 'bamboo', name: 'BambooHR', description: 'HR platform with recruiting module', color: 'from-rose-500 to-red-500' },
  { id: 'custom', name: 'Custom API', description: 'Connect any ATS via REST API', color: 'from-gray-500 to-slate-500' },
];

export function ATSIntegrationPanel({ organizationId, onNotify }: Props) {
  const [selectedSystem, setSelectedSystem] = useState<ATSSystem | null>(null);
  const [apiUrl, setApiUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [name, setName] = useState('');
  const [testing, setTesting] = useState(false);
  const [connected, setConnected] = useState(false);
  const [connection, setConnection] = useState<any>(null);
  const [syncing, setSyncing] = useState(false);

  const handleConnect = async () => {
    if (!selectedSystem || !apiUrl) {
      onNotify('Select an ATS system and enter API URL', 'warn');
      return;
    }
    setTesting(true);
    try {
      const conn = createATSConnection(
        organizationId || '',
        selectedSystem,
        name || `${selectedSystem} Connection`,
        { apiUrl, apiKey, syncInterval: 60, syncDirection: 'bidirectional' }
      );
      const result = await testATSConnection(conn);
      if (result.success) {
        setConnected(true);
        setConnection(conn);
        onNotify(`Connected to ${selectedSystem} successfully!`, 'success');
      } else {
        onNotify(`Connection failed: ${result.message}`, 'error');
      }
    } catch (err: any) {
      onNotify(`Error: ${err.message}`, 'error');
    } finally {
      setTesting(false);
    }
  };

  const handleSync = async () => {
    if (!connection) return;
    setSyncing(true);
    try {
      const resp = await fetch('/api/ats/sync', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connection, candidates: [] })
      });
      if (resp.ok) {
        const data = await resp.json();
        onNotify(`Sync completed: ${data.succeeded} succeeded`, 'success');
      }
    } catch (err: any) {
      onNotify(`Sync failed: ${err.message}`, 'error');
    } finally {
      setSyncing(false);
    }
  };

  if (selectedSystem) {
    const sysInfo = ATS_SYSTEMS.find(s => s.id === selectedSystem);
    return (
      <div className="space-y-6">
        <button onClick={() => { setSelectedSystem(null); setConnected(false); setConnection(null); }}
          className="text-white/60 hover:text-white transition-colors text-sm font-bold uppercase tracking-wider flex items-center gap-2">
          ← Back to ATS Selection
        </button>

        <div className="glass-premium p-6 rounded-2xl border border-white/10 space-y-4">
          <div className="flex items-center gap-3 mb-4">
            <div className={cn("p-2 rounded-lg bg-gradient-to-br", sysInfo?.color)}>
              <Plug className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-sm font-black text-white uppercase tracking-tight">{sysInfo?.name}</h3>
              <p className="text-[10px] text-white/60">{sysInfo?.description}</p>
            </div>
            {connected && <span className="ml-auto text-[10px] bg-green-500/20 text-green-400 px-2 py-1 rounded font-bold uppercase flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Connected</span>}
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-[10px] font-black text-white/60 uppercase tracking-widest mb-1.5">Connection Name</label>
              <input value={name} onChange={e => setName(e.target.value)} placeholder={`My ${sysInfo?.name} Connection`} className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:border-brand/50 placeholder:text-white/20" />
            </div>
            <div>
              <label className="block text-[10px] font-black text-white/60 uppercase tracking-widest mb-1.5">API URL *</label>
              <input value={apiUrl} onChange={e => setApiUrl(e.target.value)} placeholder={`https://${selectedSystem}.api.com/v2/...`} className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white text-sm font-mono focus:outline-none focus:border-brand/50 placeholder:text-white/20" />
            </div>
            <div>
              <label className="block text-[10px] font-black text-white/60 uppercase tracking-widest mb-1.5">API Key</label>
              <input value={apiKey} onChange={e => setApiKey(e.target.value)} type="password" placeholder="Enter your API key" className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white text-sm font-mono focus:outline-none focus:border-brand/50 placeholder:text-white/20" />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button onClick={handleConnect} disabled={testing} className="flex items-center gap-2 px-6 py-2.5 bg-brand hover:bg-brand/80 disabled:opacity-50 rounded-xl text-white text-xs font-black uppercase tracking-widest">
              {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plug className="w-4 h-4" />}
              {testing ? 'Testing...' : connected ? 'Reconnect' : 'Test & Connect'}
            </button>
            {connected && (
              <button onClick={handleSync} disabled={syncing} className="flex items-center gap-2 px-6 py-2.5 bg-green-500/80 hover:bg-green-500 disabled:opacity-50 rounded-xl text-white text-xs font-black uppercase tracking-widest">
                {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                {syncing ? 'Syncing...' : 'Sync Candidates'}
              </button>
            )}
          </div>

          {connected && (
            <div className="bg-white/5 rounded-xl p-4 mt-4">
              <p className="text-[10px] font-black text-white/60 uppercase tracking-widest mb-2">Field Mappings</p>
              <div className="space-y-1">
                {getMappingsForSystem(selectedSystem).map((m, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-[11px] text-white/70">
                    <span className="font-mono text-white/50">{m.sourceField}</span>
                    <ArrowRight className="w-3 h-3 text-white/30" />
                    <span className="font-mono">{m.targetField}</span>
                    {m.required && <span className="text-[9px] text-red-400 font-bold">*</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {ATS_SYSTEMS.map(sys => (
          <button key={sys.id} onClick={() => setSelectedSystem(sys.id)}
            className="glass-premium p-5 rounded-2xl border border-white/10 text-left hover:bg-white/10 transition-all group"
          >
            <div className={cn("p-2.5 rounded-xl bg-gradient-to-br inline-block mb-3", sys.color)}>
              <Plug className="w-5 h-5 text-white" />
            </div>
            <h3 className="text-sm font-black text-white uppercase tracking-tight mb-1">{sys.name}</h3>
            <p className="text-[11px] text-white/60 leading-relaxed">{sys.description}</p>
            <div className="flex items-center gap-1 mt-3 text-[10px] font-bold text-brand group-hover:gap-2 transition-all">
              Configure <ArrowRight className="w-3 h-3" />
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
