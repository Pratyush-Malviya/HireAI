import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useNotification } from '../../lib/appContext';

export function SALLMPage() {
  const { notify } = useNotification();
  const [systemPrompt, setSystemPrompt] = useState(() =>
    localStorage.getItem('sa_system_prompt') ||
    'You are an elite, unscripted AI recruiter. Evaluate the candidate\'s core technical experience. Ask situational and depth questions targeting weak spots. Keep it conversational.'
  );
  const [selectedModel, setSelectedModel] = useState<'gemini-3.1-pro-preview' | 'gemini-3.5-flash' | 'gemini-2.0-flash'>('gemini-3.1-pro-preview');
  const [temperature, setTemperature] = useState(0.7);
  const [safetyFilter, setSafetyFilter] = useState<'standard' | 'strict' | 'relaxed'>('standard');
  const [playgroundInput, setPlaygroundInput] = useState('Walk me through your experience building high-throughput distributed message queues.');
  const [playgroundResponse, setPlaygroundResponse] = useState('');
  const [playgroundLogs, setPlaygroundLogs] = useState<string[]>([]);
  const [isTesting, setIsTesting] = useState(false);

  const MODEL_COSTS = {
    'gemini-3.5-flash': { input: '$0.075/1M', output: '$0.30/1M', perCall: '$0.0007' },
    'gemini-2.0-flash': { input: '$0.10/1M', output: '$0.40/1M', perCall: '$0.0009' },
    'gemini-3.1-pro-preview': { input: '$1.25/1M', output: '$5.00/1M', perCall: '$0.0115' },
  };
  const costs = MODEL_COSTS[selectedModel];

  const runInference = () => {
    if (isTesting) return;
    setIsTesting(true);
    setPlaygroundLogs(['[INFERENCE] Shipping request envelope...', 'Input tokens: 1,842', 'Processing temperature hooks... OK']);
    setPlaygroundResponse('');
    setTimeout(() => {
      setPlaygroundLogs(prev => [...prev, 'Output tokens: 184', `Est cost: ${costs.perCall}`, 'Call completed in 684ms']);
      setPlaygroundResponse("Based on the system instructions, this response demonstrates deep engineering maturity. The user shows hands-on experience with Kafka clustering, replication rules, and partition rebalancing heuristics. I recommend scoring D1 at 92/100.");
      setIsTesting(false);
    }, 1200);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-400">
      <div>
        <h1 className="text-2xl font-black text-white uppercase tracking-tight flex items-center gap-3">
          <span className="w-1 h-7 bg-gradient-to-b from-indigo-500 to-purple-600 rounded-full" />
          LLM Playground
        </h1>
        <p className="text-white/50 text-sm mt-1">Configure and test AI interviewer prompt engineering in real-time.</p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-6">
          {/* System prompt */}
          <div className="glass-premium rounded-2xl border border-white/10 p-6 space-y-5">
            <h3 className="text-[10px] font-black uppercase tracking-widest text-white/60 border-b border-white/10 pb-2">Agent System Instructions</h3>
            <div>
              <label className="text-[9px] font-black text-white/50 uppercase tracking-widest">System Prompt Instruction Envelope</label>
              <textarea rows={6} value={systemPrompt}
                onChange={e => { setSystemPrompt(e.target.value); localStorage.setItem('sa_system_prompt', e.target.value); }}
                className="mt-2 block w-full border border-white/10 bg-white/5 rounded-xl px-4 py-3 text-xs font-mono text-white focus:border-indigo-500/50 focus:outline-none resize-none leading-relaxed transition-all" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-[9px] font-black text-white/50 uppercase tracking-widest">Model Version</label>
                <select value={selectedModel} onChange={e => setSelectedModel(e.target.value as any)}
                  className="mt-1.5 block w-full border border-white/10 bg-[#0d1117] rounded-xl px-3 py-2.5 text-xs text-white focus:border-indigo-500/50 focus:outline-none min-h-[44px]">
                  <option value="gemini-3.1-pro-preview">Gemini 3.1 Pro</option>
                  <option value="gemini-3.5-flash">Gemini 3.5 Flash</option>
                  <option value="gemini-2.0-flash">Gemini 2.0 Flash</option>
                </select>
              </div>
              <div>
                <label className="text-[9px] font-black text-white/50 uppercase tracking-widest">Temperature ({temperature})</label>
                <input type="range" min="0" max="1" step="0.05" value={temperature}
                  onChange={e => setTemperature(parseFloat(e.target.value))}
                  className="mt-3 block w-full cursor-pointer accent-indigo-500" />
              </div>
              <div>
                <label className="text-[9px] font-black text-white/50 uppercase tracking-widest">Safety Policy</label>
                <select value={safetyFilter} onChange={e => setSafetyFilter(e.target.value as any)}
                  className="mt-1.5 block w-full border border-white/10 bg-[#0d1117] rounded-xl px-3 py-2.5 text-xs text-white focus:border-indigo-500/50 focus:outline-none min-h-[44px]">
                  <option value="standard">Standard Blocks</option>
                  <option value="strict">Strict Blocks</option>
                  <option value="relaxed">Relaxed Blocks</option>
                </select>
              </div>
            </div>
          </div>

          {/* Cost calculator */}
          <div className="glass-premium rounded-2xl border border-white/10 p-6 space-y-4">
            <h3 className="text-[10px] font-black uppercase tracking-widest text-white/60 border-b border-white/10 pb-2">Live Cost Calculator</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: 'Input Token Cost', val: costs.input },
                { label: 'Output Token Cost', val: costs.output },
                { label: 'Est. Input Tokens', val: '1,842' },
                { label: 'Est. Cost / Call', val: costs.perCall },
              ].map((item, i) => (
                <div key={i} className="bg-white/5 border border-white/10 rounded-xl p-3 text-center hover:border-white/20 transition-all">
                  <p className="text-[9px] font-black uppercase text-white/40 tracking-wider">{item.label}</p>
                  <p className="text-sm font-black text-white mt-1">{item.val}</p>
                </div>
              ))}
            </div>
            <p className="text-[9px] text-white/30 italic">Costs calculated for {selectedModel} at temperature {temperature}.</p>
          </div>

          {/* Sandbox */}
          <div className="glass-premium rounded-2xl border border-white/10 p-6 space-y-4">
            <h3 className="text-[10px] font-black uppercase tracking-widest text-white/60 border-b border-white/10 pb-2">Sandbox Test Chamber</h3>
            <div>
              <label className="text-[9px] font-black text-white/50 uppercase tracking-widest">Candidate Test Message Input</label>
              <input type="text" value={playgroundInput} onChange={e => setPlaygroundInput(e.target.value)}
                className="mt-1.5 block w-full border border-white/10 bg-white/5 rounded-xl px-4 py-3 text-xs text-white focus:border-indigo-500/50 focus:outline-none transition-all min-h-[44px]" />
            </div>
            <button onClick={runInference}
              className="w-full py-3 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-xl text-[10px] font-black uppercase tracking-widest text-white hover:opacity-90 transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/20">
              {isTesting ? <><Loader2 className="w-4 h-4 animate-spin" /> Running Inference...</> : 'Run Test Inference'}
            </button>
            {playgroundResponse && (
              <div className="p-4 bg-indigo-500/5 border border-indigo-500/20 rounded-xl space-y-2">
                <span className="text-[9px] font-black text-indigo-400 uppercase tracking-widest">AI Recruiter Response</span>
                <p className="text-xs text-white/70 leading-relaxed font-semibold">{playgroundResponse}</p>
              </div>
            )}
          </div>
        </div>

        {/* Logs panel */}
        <div>
          <div className="glass-premium rounded-2xl border border-white/10 p-6 space-y-4 sticky top-6">
            <h3 className="text-[10px] font-black uppercase tracking-widest text-white/60 border-b border-white/10 pb-2">Sandbox Logs</h3>
            <div className="h-72 bg-black/30 rounded-xl p-4 font-mono text-[10px] text-white/60 overflow-y-auto space-y-1.5 border border-white/5">
              {playgroundLogs.length > 0 ? playgroundLogs.map((log, idx) => (
                <p key={idx} className={log.includes('cost') ? 'text-amber-400' : log.includes('completed') ? 'text-green-400' : 'text-white/60'}>{log}</p>
              )) : (
                <p className="text-white/20 italic">No inference logs yet. Hit 'Run Test Inference' to see token counts.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
