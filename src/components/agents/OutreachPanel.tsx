import React, { useState } from 'react';
import { Mail, Send, MessageSquare, Loader2, CheckCircle2, Clock, Users, Sparkles, FileText } from 'lucide-react';
import { cn } from '../../lib/utils';
import { getTemplates, fillTemplate, createOutreachMessage, sendOutreach, getNextFollowUp } from '../../services/agents/outreachAgent';

interface Props { organizationId?: string; onNotify: (msg: string, type: 'success' | 'error' | 'info' | 'warn') => void; }

export function OutreachPanel({ organizationId, onNotify }: Props) {
  const [candidateName, setCandidateName] = useState('');
  const [candidateEmail, setCandidateEmail] = useState('');
  const [candidateSkills, setCandidateSkills] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [company, setCompany] = useState('');
  const [channel, setChannel] = useState<'email' | 'linkedin'>('email');
  const [messageBody, setMessageBody] = useState('');
  const [messageSubject, setMessageSubject] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const templates = getTemplates(channel);

  const handleGenerate = async () => {
    if (!candidateName || !jobTitle) { onNotify('Enter candidate name and job title', 'warn'); return; }
    setLoading(true);
    try {
      const resp = await fetch('/api/ai/generate-outreach', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          candidateInfo: { name: candidateName, currentRole: '', currentCompany: '', skills: candidateSkills.split(',').map(s => s.trim()), profileSummary: '' },
          jobInfo: { title: jobTitle, company, description: '' },
          channel
        })
      });
      if (resp.ok) {
        const data = await resp.json();
        setMessageSubject(data.subject || '');
        setMessageBody(data.body || '');
      } else {
        // Fallback to template
        const template = templates.find(t => t.sequence === 'initial');
        if (template) {
          const filled = fillTemplate(template, { candidateName, jobTitle, company, skills: candidateSkills, recruiterName: 'Recruiting Team', recruiterTitle: 'Talent Acquisition' });
          setMessageSubject(filled.subject);
          setMessageBody(filled.body);
        }
      }
      onNotify('Message generated', 'success');
    } catch (err: any) {
      onNotify(`Generation failed: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSend = async () => {
    if (!candidateEmail) { onNotify('Enter candidate email', 'warn'); return; }
    setSending(true);
    try {
      const msg = createOutreachMessage({ candidateId: '', candidateName, candidateEmail, jobTitle, company, channel, subject: messageSubject, body: messageBody });
      const ok = await sendOutreach(msg);
      if (ok) { setSent(true); onNotify('Message sent successfully!', 'success'); }
      else onNotify('Failed to send message', 'error');
    } catch (err: any) {
      onNotify(`Send failed: ${err.message}`, 'error');
    } finally {
      setSending(false);
    }
  };

  const applyTemplate = (templateId: string) => {
    const template = templates.find(t => t.id === templateId);
    if (!template) return;
    const filled = fillTemplate(template, { candidateName, jobTitle, company, skills: candidateSkills, recruiterName: 'Recruiting Team', recruiterTitle: 'Talent Acquisition' });
    setMessageSubject(filled.subject);
    setMessageBody(filled.body);
  };

  return (
    <div className="space-y-6">
      <div className="glass-premium p-6 rounded-2xl border border-white/10">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <label className="block text-[10px] font-black text-white/60 uppercase tracking-widest mb-1.5">Candidate Name</label>
            <input value={candidateName} onChange={e => setCandidateName(e.target.value)} placeholder="John Doe" className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:border-brand/50 placeholder:text-white/20" />
          </div>
          <div>
            <label className="block text-[10px] font-black text-white/60 uppercase tracking-widest mb-1.5">Candidate Email</label>
            <input value={candidateEmail} onChange={e => setCandidateEmail(e.target.value)} placeholder="john@example.com" className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:border-brand/50 placeholder:text-white/20" />
          </div>
          <div>
            <label className="block text-[10px] font-black text-white/60 uppercase tracking-widest mb-1.5">Skills</label>
            <input value={candidateSkills} onChange={e => setCandidateSkills(e.target.value)} placeholder="React, TypeScript" className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:border-brand/50 placeholder:text-white/20" />
          </div>
          <div>
            <label className="block text-[10px] font-black text-white/60 uppercase tracking-widest mb-1.5">Job Title</label>
            <input value={jobTitle} onChange={e => setJobTitle(e.target.value)} placeholder="Senior Engineer" className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:border-brand/50 placeholder:text-white/20" />
          </div>
          <div>
            <label className="block text-[10px] font-black text-white/60 uppercase tracking-widest mb-1.5">Company</label>
            <input value={company} onChange={e => setCompany(e.target.value)} placeholder="Acme Inc" className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:border-brand/50 placeholder:text-white/20" />
          </div>
          <div>
            <label className="block text-[10px] font-black text-white/60 uppercase tracking-widest mb-1.5">Channel</label>
            <div className="flex gap-2">
              <button onClick={() => setChannel('email')} className={cn("flex-1 px-4 py-3 rounded-xl text-xs font-black uppercase tracking-wider transition-all", channel === 'email' ? 'bg-brand text-white' : 'bg-white/5 text-white/60 hover:bg-white/10')}><Mail className="w-3.5 h-3.5 inline mr-1.5" /> Email</button>
              <button onClick={() => setChannel('linkedin')} className={cn("flex-1 px-4 py-3 rounded-xl text-xs font-black uppercase tracking-wider transition-all", channel === 'linkedin' ? 'bg-brand text-white' : 'bg-white/5 text-white/60 hover:bg-white/10')}><MessageSquare className="w-3.5 h-3.5 inline mr-1.5" /> LinkedIn</button>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 mt-4">
          <button onClick={handleGenerate} disabled={loading} className="flex items-center gap-2 px-6 py-2.5 bg-brand hover:bg-brand/80 disabled:opacity-50 rounded-xl text-white text-xs font-black uppercase tracking-widest">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {loading ? 'Generating...' : 'Generate Message'}
          </button>
        </div>
      </div>

      {templates.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {templates.filter(t => t.sequence === 'initial').map(t => (
            <button key={t.id} onClick={() => applyTemplate(t.id)} className="px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-[10px] font-bold text-white/70 hover:text-white transition-all uppercase tracking-wider">{t.name}</button>
          ))}
        </div>
      )}

      {(messageBody || messageSubject) && (
        <div className="glass-premium p-6 rounded-2xl border border-white/10 space-y-4">
          {channel === 'email' && (
            <div>
              <label className="block text-[10px] font-black text-white/60 uppercase tracking-widest mb-1">Subject</label>
              <input value={messageSubject} onChange={e => setMessageSubject(e.target.value)} className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white text-sm" />
            </div>
          )}
          <div>
            <label className="block text-[10px] font-black text-white/60 uppercase tracking-widest mb-1">Message Body</label>
            <textarea value={messageBody} onChange={e => setMessageBody(e.target.value)} rows={8} className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:border-brand/50 font-mono resize-y" />
          </div>
          <div className="flex items-center gap-3">
            <button onClick={handleSend} disabled={sending || !candidateEmail} className="flex items-center gap-2 px-6 py-2.5 bg-green-500/80 hover:bg-green-500 disabled:opacity-50 rounded-xl text-white text-xs font-black uppercase tracking-widest">
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : sent ? <CheckCircle2 className="w-4 h-4" /> : <Send className="w-4 h-4" />}
              {sending ? 'Sending...' : sent ? 'Sent!' : 'Send Message'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
