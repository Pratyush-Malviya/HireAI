import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Search, Users, Globe, Loader2, ExternalLink, Sparkles, Filter, Download, CheckCircle2, AlertCircle } from 'lucide-react';
import { cn } from '../../lib/utils';

interface Props { organizationId?: string; onNotify: (msg: string, type: 'success' | 'error' | 'info' | 'warn') => void; }

export function SourcingPanel({ organizationId, onNotify }: Props) {
  const [jobTitle, setJobTitle] = useState('');
  const [skills, setSkills] = useState('');
  const [location, setLocation] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<any[]>([]);
  const [totalFound, setTotalFound] = useState(0);

  const handleSearch = async () => {
    if (!jobTitle) { onNotify('Enter a job title to search', 'warn'); return; }
    setLoading(true);
    setResults([]);
    try {
      const queries = [
        { q: `site:linkedin.com/in "${jobTitle}" ${skills ? `"${skills}"` : ''}`, source: 'linkedin' },
        { q: `site:github.com ${skills || jobTitle} developer`, source: 'github' },
        { q: `"${jobTitle}" ${skills} resume ${location}`, source: 'indeed' },
      ];
      const allResults: any[] = [];
      for (const { q, source } of queries) {
        const resp = await fetch('/api/ai/source-candidates', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: q, source, maxResults: 15 })
        });
        if (resp.ok) {
          const data = await resp.json();
          allResults.push(...data.map((r: any) => ({ ...r, matchScore: calculateMatch(r, jobTitle, skills) })));
        }
      }
      allResults.sort((a, b) => b.matchScore - a.matchScore);
      setResults(allResults.slice(0, 30));
      setTotalFound(allResults.length);
      onNotify(`Found ${allResults.length} potential candidates`, allResults.length > 0 ? 'success' : 'info');
    } catch (err: any) {
      onNotify(`Search failed: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  function calculateMatch(profile: any, title: string, skillsStr: string): number {
    let score = 30;
    const profileTitle = (profile.currentRole || profile.fullName || '').toLowerCase();
    const searchTitle = title.toLowerCase();
    if (profileTitle.includes(searchTitle) || searchTitle.split(' ').some((w: string) => w.length > 3 && profileTitle.includes(w))) score += 30;
    const skillList = skillsStr.toLowerCase().split(',').map((s: string) => s.trim());
    const profileLower = (profile.summary || '').toLowerCase() + ' ' + (profile.fullName || '').toLowerCase();
    const matchedSkills = skillList.filter((s: string) => s && profileLower.includes(s));
    score += (matchedSkills.length / Math.max(skillList.filter(Boolean).length, 1)) * 25;
    return Math.min(100, score);
  }

  return (
    <div className="space-y-6">
      <div className="glass-premium p-6 rounded-2xl border border-white/10">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="md:col-span-2">
            <label className="block text-[10px] font-black text-white/60 uppercase tracking-widest mb-1.5">Job Title</label>
            <input value={jobTitle} onChange={e => setJobTitle(e.target.value)} placeholder="e.g., Senior Frontend Engineer" className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:border-brand/50 transition-colors placeholder:text-white/20" />
          </div>
          <div>
            <label className="block text-[10px] font-black text-white/60 uppercase tracking-widest mb-1.5">Key Skills</label>
            <input value={skills} onChange={e => setSkills(e.target.value)} placeholder="React, TypeScript, Node.js" className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:border-brand/50 transition-colors placeholder:text-white/20" />
          </div>
          <div>
            <label className="block text-[10px] font-black text-white/60 uppercase tracking-widest mb-1.5">Location</label>
            <input value={location} onChange={e => setLocation(e.target.value)} placeholder="Remote, New York, etc." className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:border-brand/50 transition-colors placeholder:text-white/20" />
          </div>
        </div>
        <div className="flex items-center gap-3 mt-4">
          <button onClick={handleSearch} disabled={loading} className="flex items-center gap-2 px-6 py-2.5 bg-brand hover:bg-brand/80 disabled:opacity-50 rounded-xl text-white text-xs font-black uppercase tracking-widest transition-all">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            {loading ? 'Searching...' : 'Source Candidates'}
          </button>
          <div className="flex items-center gap-2 text-xs text-white/60">
            <Globe className="w-3.5 h-3.5" />
            <span>LinkedIn · GitHub · Indeed</span>
          </div>
        </div>
      </div>

      {results.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold text-white"><span className="text-brand">{totalFound}</span> candidates found — showing top {results.length}</p>
          </div>
          <div className="space-y-2">
            {results.map((profile, idx) => (
              <motion.div key={idx} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.03 }}
                className="glass-premium p-4 rounded-xl border border-white/10 flex items-start gap-4 hover:bg-white/10 transition-colors"
              >
                <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center text-xs font-black text-white shrink-0 bg-gradient-to-br", profile.matchScore >= 70 ? 'from-green-500 to-emerald-500' : profile.matchScore >= 40 ? 'from-amber-500 to-orange-500' : 'from-gray-500 to-gray-600')}>{profile.matchScore}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-bold text-white truncate">{profile.fullName}</p>
                    <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-bold uppercase", profile.source === 'linkedin' ? 'bg-blue-500/20 text-blue-300' : profile.source === 'github' ? 'bg-purple-500/20 text-purple-300' : 'bg-amber-500/20 text-amber-300')}>{profile.source}</span>
                  </div>
                  {profile.currentRole && <p className="text-xs text-white/70 mt-0.5">{profile.currentRole}</p>}
                  <p className="text-[11px] text-white/50 mt-1 line-clamp-2">{profile.summary}</p>
                </div>
                <a href={profile.profileUrl} target="_blank" rel="noopener noreferrer" className="p-2 hover:bg-white/10 rounded-lg transition-colors shrink-0">
                  <ExternalLink className="w-4 h-4 text-white/40 hover:text-white/70" />
                </a>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {!loading && results.length === 0 && (
        <div className="text-center py-12">
          <Users className="w-12 h-12 text-white/20 mx-auto mb-3" />
          <p className="text-sm font-bold text-white/60">Enter a job title and click "Source Candidates" to start searching</p>
        </div>
      )}
    </div>
  );
}
