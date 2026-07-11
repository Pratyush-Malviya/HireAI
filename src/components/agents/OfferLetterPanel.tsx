import React, { useState } from 'react';
import { FileSignature, Download, Loader2, CheckCircle2, Eye, Sparkles, FileText } from 'lucide-react';
import { cn } from '../../lib/utils';
import { createOfferLetter, generateOfferLetterDocument, buildOfferLetterContent, validateOfferLetter } from '../../services/agents/offerLetterAgent';

interface Props { organizationId?: string; onNotify: (msg: string, type: 'success' | 'error' | 'info' | 'warn') => void; }

export function OfferLetterPanel({ organizationId, onNotify }: Props) {
  const [candidateName, setCandidateName] = useState('');
  const [candidateEmail, setCandidateEmail] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [department, setDepartment] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [companyAddress, setCompanyAddress] = useState('');
  const [startDate, setStartDate] = useState('');
  const [workLocation, setWorkLocation] = useState('');
  const [salary, setSalary] = useState('');
  const [recruiterName, setRecruiterName] = useState('');
  const [recruiterTitle, setRecruiterTitle] = useState('');
  const [loading, setLoading] = useState(false);
  const [letter, setLetter] = useState<string | null>(null);
  const [offerLetter, setOfferLetter] = useState<any>(null);

  const handleGenerate = async () => {
    if (!candidateName || !jobTitle || !companyName || !salary) {
      onNotify('Fill in required fields (Name, Title, Company, Salary)', 'warn');
      return;
    }

    setLoading(true);
    try {
      const data = {
        candidateName,
        candidateEmail,
        jobTitle,
        department: department || 'Engineering',
        companyName,
        companyAddress: companyAddress || companyName,
        startDate: startDate || new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
        employmentType: 'full-time' as const,
        compensation: {
          baseSalary: parseInt(salary) || 0,
          currency: 'USD',
          payFrequency: 'annually' as const,
        },
        workLocation: workLocation || 'Remote',
        remotePolicy: workLocation?.toLowerCase().includes('remote') ? 'Remote' : 'On-site',
        offerExpiryDate: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
        recruiterName: recruiterName || 'Recruiting Team',
        recruiterTitle: recruiterTitle || 'Talent Acquisition',
      };

      const errors = validateOfferLetter(data);
      if (errors.length > 0) {
        onNotify(`Validation: ${errors.join(', ')}`, 'warn');
        setLoading(false);
        return;
      }

      const content = buildOfferLetterContent(data);
      setLetter(content);

      const offer = createOfferLetter('', '', data);
      setOfferLetter(offer);

      onNotify('Offer letter generated', 'success');
    } catch (err: any) {
      onNotify(`Failed: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = () => {
    if (!letter) return;
    const blob = new Blob([letter], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `offer-letter-${candidateName.replace(/\s+/g, '-').toLowerCase()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    onNotify('Offer letter downloaded', 'success');
  };

  return (
    <div className="space-y-6">
      <div className="glass-premium p-6 rounded-2xl border border-white/10">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <label className="block text-[10px] font-black text-white/60 uppercase tracking-widest mb-1.5">Candidate Name *</label>
            <input value={candidateName} onChange={e => setCandidateName(e.target.value)} placeholder="John Doe" className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:border-brand/50 placeholder:text-white/20" />
          </div>
          <div>
            <label className="block text-[10px] font-black text-white/60 uppercase tracking-widest mb-1.5">Candidate Email</label>
            <input value={candidateEmail} onChange={e => setCandidateEmail(e.target.value)} placeholder="john@example.com" className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:border-brand/50 placeholder:text-white/20" />
          </div>
          <div>
            <label className="block text-[10px] font-black text-white/60 uppercase tracking-widest mb-1.5">Job Title *</label>
            <input value={jobTitle} onChange={e => setJobTitle(e.target.value)} placeholder="Senior Engineer" className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:border-brand/50 placeholder:text-white/20" />
          </div>
          <div>
            <label className="block text-[10px] font-black text-white/60 uppercase tracking-widest mb-1.5">Department</label>
            <input value={department} onChange={e => setDepartment(e.target.value)} placeholder="Engineering" className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:border-brand/50 placeholder:text-white/20" />
          </div>
          <div>
            <label className="block text-[10px] font-black text-white/60 uppercase tracking-widest mb-1.5">Company Name *</label>
            <input value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="Acme Inc" className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:border-brand/50 placeholder:text-white/20" />
          </div>
          <div>
            <label className="block text-[10px] font-black text-white/60 uppercase tracking-widest mb-1.5">Company Address</label>
            <input value={companyAddress} onChange={e => setCompanyAddress(e.target.value)} placeholder="123 Main St, City" className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:border-brand/50 placeholder:text-white/20" />
          </div>
          <div>
            <label className="block text-[10px] font-black text-white/60 uppercase tracking-widest mb-1.5">Start Date</label>
            <input value={startDate} onChange={e => setStartDate(e.target.value)} type="date" className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:border-brand/50" />
          </div>
          <div>
            <label className="block text-[10px] font-black text-white/60 uppercase tracking-widest mb-1.5">Location</label>
            <input value={workLocation} onChange={e => setWorkLocation(e.target.value)} placeholder="San Francisco / Remote" className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:border-brand/50 placeholder:text-white/20" />
          </div>
          <div>
            <label className="block text-[10px] font-black text-white/60 uppercase tracking-widest mb-1.5">Annual Salary (USD) *</label>
            <input value={salary} onChange={e => setSalary(e.target.value)} type="number" placeholder="120000" className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:border-brand/50" />
          </div>
          <div>
            <label className="block text-[10px] font-black text-white/60 uppercase tracking-widest mb-1.5">Recruiter Name</label>
            <input value={recruiterName} onChange={e => setRecruiterName(e.target.value)} placeholder="HR Manager" className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:border-brand/50 placeholder:text-white/20" />
          </div>
          <div>
            <label className="block text-[10px] font-black text-white/60 uppercase tracking-widest mb-1.5">Recruiter Title</label>
            <input value={recruiterTitle} onChange={e => setRecruiterTitle(e.target.value)} placeholder="Talent Acquisition Lead" className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:border-brand/50 placeholder:text-white/20" />
          </div>
        </div>
        <button onClick={handleGenerate} disabled={loading} className="flex items-center gap-2 px-6 py-2.5 bg-brand hover:bg-brand/80 disabled:opacity-50 rounded-xl text-white text-xs font-black uppercase tracking-widest mt-4">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          {loading ? 'Generating...' : 'Generate Offer Letter'}
        </button>
      </div>

      {letter && (
        <div className="glass-premium p-6 rounded-2xl border border-white/10 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <FileText className="w-5 h-5 text-brand" />
              <h3 className="text-sm font-black text-white uppercase tracking-tight">Offer Letter — {candidateName}</h3>
            </div>
            <button onClick={handleDownload} className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-white text-xs font-black uppercase tracking-widest">
              <Download className="w-3.5 h-3.5" /> Download
            </button>
          </div>
          <div className="bg-white/5 rounded-xl p-6 max-h-[500px] overflow-y-auto">
            <pre className="text-xs text-white/80 whitespace-pre-wrap font-sans leading-relaxed">{letter}</pre>
          </div>
        </div>
      )}
    </div>
  );
}
