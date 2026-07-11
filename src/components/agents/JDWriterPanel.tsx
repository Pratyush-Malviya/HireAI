import React, { useState } from 'react';
import { FileText, Sparkles, Loader2, Download, Copy, CheckCircle2, Eye } from 'lucide-react';
import { cn } from '../../lib/utils';
import { JDTemplate, getTemplates } from '../../services/agents/jdWriterAgent';

interface Props { onNotify: (msg: string, type: 'success' | 'error' | 'info' | 'warn') => void; }

export function JDWriterPanel({ onNotify }: Props) {
  const [title, setTitle] = useState('');
  const [location, setLocation] = useState('');
  const [skills, setSkills] = useState('');
  const [experience, setExperience] = useState('3');
  const [about, setAbout] = useState('');
  const [responsibilities, setResponsibilities] = useState('');
  const [benefits, setBenefits] = useState('');
  const [template, setTemplate] = useState<JDTemplate>('standard');
  const [loading, setLoading] = useState(false);
  const [jd, setJD] = useState<any>(null);
  const [copied, setCopied] = useState(false);

  const handleGenerate = async () => {
    if (!title) { onNotify('Enter a job title', 'warn'); return; }
    setLoading(true);
    try {
      const brief = {
        title,
        location: location || 'Remote',
        remotePolicy: location?.toLowerCase().includes('remote') ? 'remote' as const : 'on-site' as const,
        experienceMin: parseInt(experience) || 3,
        experienceMax: (parseInt(experience) || 3) + 3,
        skills: skills.split(',').map(s => s.trim()).filter(Boolean),
        niceToHave: [],
        responsibilities: responsibilities.split('\n').filter(Boolean),
        qualifications: [],
        aboutCompany: about,
        benefits: benefits.split('\n').filter(Boolean),
        employmentType: 'full-time' as const,
        urgency: 'medium' as const,
      };
      const resp = await fetch('/api/ai/write-job-description', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brief, template })
      });
      if (resp.ok) {
        const data = await resp.json();
        setJD(data);
        onNotify('Job description generated!', 'success');
      } else throw new Error('API error');
    } catch (err: any) {
      onNotify(`Failed: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    if (jd?.content) {
      navigator.clipboard.writeText(jd.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      onNotify('Copied to clipboard', 'success');
    }
  };

  const templates = getTemplates();

  return (
    <div className="space-y-6">
      <div className="glass-premium p-6 rounded-2xl border border-white/10">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <label className="block text-[10px] font-black text-white/60 uppercase tracking-widest mb-1.5">Job Title</label>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Senior Software Engineer" className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:border-brand/50 placeholder:text-white/20" />
          </div>
          <div>
            <label className="block text-[10px] font-black text-white/60 uppercase tracking-widest mb-1.5">Location</label>
            <input value={location} onChange={e => setLocation(e.target.value)} placeholder="San Francisco / Remote" className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:border-brand/50 placeholder:text-white/20" />
          </div>
          <div>
            <label className="block text-[10px] font-black text-white/60 uppercase tracking-widest mb-1.5">Min Experience (years)</label>
            <input value={experience} onChange={e => setExperience(e.target.value)} type="number" min="0" className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:border-brand/50" />
          </div>
          <div className="md:col-span-2">
            <label className="block text-[10px] font-black text-white/60 uppercase tracking-widest mb-1.5">Required Skills (comma separated)</label>
            <input value={skills} onChange={e => setSkills(e.target.value)} placeholder="React, TypeScript, Node.js, AWS" className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:border-brand/50 placeholder:text-white/20" />
          </div>
          <div>
            <label className="block text-[10px] font-black text-white/60 uppercase tracking-widest mb-1.5">Template</label>
            <select value={template} onChange={e => setTemplate(e.target.value as JDTemplate)} className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:border-brand/50">
              {Object.entries(templates).map(([key, t]) => <option key={key} value={key}>{t.name}</option>)}
            </select>
          </div>
          <div className="md:col-span-3">
            <label className="block text-[10px] font-black text-white/60 uppercase tracking-widest mb-1.5">About Company</label>
            <input value={about} onChange={e => setAbout(e.target.value)} placeholder="Brief description of the company" className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:border-brand/50 placeholder:text-white/20" />
          </div>
          <div className="md:col-span-2">
            <label className="block text-[10px] font-black text-white/60 uppercase tracking-widest mb-1.5">Key Responsibilities (one per line)</label>
            <textarea value={responsibilities} onChange={e => setResponsibilities(e.target.value)} rows={4} placeholder="Lead development of core features&#10;Mentor junior engineers&#10;Design and implement APIs" className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:border-brand/50 placeholder:text-white/20 resize-y" />
          </div>
          <div>
            <label className="block text-[10px] font-black text-white/60 uppercase tracking-widest mb-1.5">Benefits (one per line)</label>
            <textarea value={benefits} onChange={e => setBenefits(e.target.value)} rows={4} placeholder="Competitive salary&#10;Equity package&#10;Health insurance" className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:border-brand/50 placeholder:text-white/20 resize-y" />
          </div>
        </div>
        <button onClick={handleGenerate} disabled={loading} className="flex items-center gap-2 px-6 py-2.5 bg-brand hover:bg-brand/80 disabled:opacity-50 rounded-xl text-white text-xs font-black uppercase tracking-widest mt-4">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          {loading ? 'Generating...' : 'Generate Job Description'}
        </button>
      </div>

      {jd && (
        <div className="glass-premium p-6 rounded-2xl border border-white/10 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <FileText className="w-5 h-5 text-brand" />
              <h3 className="text-sm font-black text-white uppercase tracking-tight">{jd.title || 'Job Description'}</h3>
              <span className="text-[10px] text-white/50 font-mono">{jd.wordCount} words</span>
              {jd.seoMeta?.keywords?.length > 0 && <span className="text-[10px] bg-brand/20 text-brand px-2 py-0.5 rounded font-bold uppercase">SEO Ready</span>}
            </div>
            <div className="flex items-center gap-2">
              <button onClick={handleCopy} className="p-2 hover:bg-white/10 rounded-lg transition-colors">{copied ? <CheckCircle2 className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4 text-white/60 hover:text-white" />}</button>
            </div>
          </div>
          <div className="bg-white/5 rounded-xl p-4 max-h-[500px] overflow-y-auto">
            <pre className="text-xs text-white/80 whitespace-pre-wrap font-sans leading-relaxed">{jd.content}</pre>
          </div>
        </div>
      )}
    </div>
  );
}
