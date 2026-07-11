import React, { useState } from 'react';
import { MessageSquare, Send, Loader2, CheckCircle2, ClipboardList, Users, Sparkles, BarChart3 } from 'lucide-react';
import { cn } from '../../lib/utils';
import { getPreScreenQuestions, calculateScores, isQualified, generateSummary, PreScreenResponse } from '../../services/agents/preScreenAgent';

interface Props { organizationId?: string; onNotify: (msg: string, type: 'success' | 'error' | 'info' | 'warn') => void; }

export function PreScreenPanel({ organizationId, onNotify }: Props) {
  const [candidateName, setCandidateName] = useState('');
  const [candidateEmail, setCandidateEmail] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [step, setStep] = useState<'setup' | 'questions' | 'results'>('setup');
  const [responses, setResponses] = useState<Record<string, string>>({});
  const [scores, setScores] = useState<any>(null);
  const [qualified, setQualified] = useState(false);
  const [summary, setSummary] = useState('');

  const questions = getPreScreenQuestions(jobTitle);

  const handleStart = () => {
    if (!candidateName || !candidateEmail || !jobTitle) {
      onNotify('Fill in all candidate details', 'warn');
      return;
    }
    setStep('questions');
    const initial: Record<string, string> = {};
    questions.forEach(q => { initial[q.id] = ''; });
    setResponses(initial);
  };

  const handleSubmit = () => {
    const preScreenResponses: PreScreenResponse[] = questions.map(q => ({
      questionId: q.id,
      question: q.question,
      response: responses[q.id] || '',
    }));

    const calculatedScores = calculateScores(preScreenResponses, questions);
    const isQual = isQualified(calculatedScores);
    setScores(calculatedScores);
    setQualified(isQual);

    const result = {
      candidateId: '',
      candidateName,
      jobId: '',
      jobTitle,
      status: 'completed' as const,
      invitedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      responses: preScreenResponses,
      scores: calculatedScores,
      qualified: isQual,
      summary: '',
      recruiterNotes: '',
    };
    setSummary(generateSummary(result));
    setStep('results');
    onNotify(isQual ? 'Candidate qualifies! Review the scores.' : 'Candidate does not meet minimum threshold.', isQual ? 'success' : 'warn');
  };

  const getScoreColor = (score: number) => {
    if (score >= 70) return 'text-green-400';
    if (score >= 50) return 'text-amber-400';
    return 'text-red-400';
  };

  return (
    <div className="space-y-6">
      {step === 'setup' && (
        <div className="glass-premium p-6 rounded-2xl border border-white/10 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-[10px] font-black text-white/60 uppercase tracking-widest mb-1.5">Candidate Name</label>
              <input value={candidateName} onChange={e => setCandidateName(e.target.value)} placeholder="John Doe" className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:border-brand/50 placeholder:text-white/20" />
            </div>
            <div>
              <label className="block text-[10px] font-black text-white/60 uppercase tracking-widest mb-1.5">Candidate Email</label>
              <input value={candidateEmail} onChange={e => setCandidateEmail(e.target.value)} placeholder="john@example.com" className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:border-brand/50 placeholder:text-white/20" />
            </div>
            <div>
              <label className="block text-[10px] font-black text-white/60 uppercase tracking-widest mb-1.5">Job Title</label>
              <input value={jobTitle} onChange={e => setJobTitle(e.target.value)} placeholder="Software Engineer" className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:border-brand/50 placeholder:text-white/20" />
            </div>
          </div>
          <button onClick={handleStart} className="flex items-center gap-2 px-6 py-2.5 bg-brand hover:bg-brand/80 rounded-xl text-white text-xs font-black uppercase tracking-widest">
            <ClipboardList className="w-4 h-4" /> Start Pre-Screening
          </button>
        </div>
      )}

      {step === 'questions' && (
        <div className="space-y-4">
          <p className="text-sm font-bold text-white">Answering as: <span className="text-brand">{candidateName}</span> for <span className="text-brand">{jobTitle}</span></p>
          {questions.map((q, idx) => (
            <div key={q.id} className="glass-premium p-5 rounded-2xl border border-white/10">
              <div className="flex items-start gap-3">
                <span className="text-[10px] font-black text-white/30 mt-1 shrink-0">{idx + 1}.</span>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <p className="text-sm font-bold text-white">{q.question}</p>
                    {q.required && <span className="text-[10px] text-red-400 font-bold">*</span>}
                    <span className={cn("text-[9px] px-1.5 py-0.5 rounded font-bold uppercase ml-auto", q.category === 'availability' ? 'bg-blue-500/20 text-blue-300' : q.category === 'salary' ? 'bg-green-500/20 text-green-300' : q.category === 'qualifying' ? 'bg-purple-500/20 text-purple-300' : 'bg-amber-500/20 text-amber-300')}>{q.category}</span>
                  </div>
                  {q.type === 'multiple_choice' && q.options ? (
                    <div className="flex flex-wrap gap-2">
                      {q.options.map(opt => (
                        <button key={opt} onClick={() => setResponses(prev => ({ ...prev, [q.id]: opt }))}
                          className={cn("px-4 py-2 rounded-lg text-xs font-bold transition-all border", responses[q.id] === opt ? 'bg-brand/20 border-brand/50 text-brand' : 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10')}>{opt}</button>
                      ))}
                    </div>
                  ) : q.type === 'yes_no' ? (
                    <div className="flex gap-2">
                      <button onClick={() => setResponses(prev => ({ ...prev, [q.id]: 'Yes' }))} className={cn("px-4 py-2 rounded-lg text-xs font-bold transition-all border", responses[q.id] === 'Yes' ? 'bg-green-500/20 border-green-500/50 text-green-400' : 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10')}>Yes</button>
                      <button onClick={() => setResponses(prev => ({ ...prev, [q.id]: 'No' }))} className={cn("px-4 py-2 rounded-lg text-xs font-bold transition-all border", responses[q.id] === 'No' ? 'bg-red-500/20 border-red-500/50 text-red-400' : 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10')}>No</button>
                    </div>
                  ) : (
                    <textarea value={responses[q.id] || ''} onChange={e => setResponses(prev => ({ ...prev, [q.id]: e.target.value }))}
                      placeholder="Type your answer..." rows={3}
                      className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:border-brand/50 placeholder:text-white/20 resize-y" />
                  )}
                </div>
              </div>
            </div>
          ))}
          <button onClick={handleSubmit} className="flex items-center gap-2 px-6 py-2.5 bg-green-500/80 hover:bg-green-500 rounded-xl text-white text-xs font-black uppercase tracking-widest">
            <Send className="w-4 h-4" /> Submit & Score
          </button>
        </div>
      )}

      {step === 'results' && scores && (
        <div className="space-y-6">
          <div className="glass-premium p-6 rounded-2xl border border-white/10">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-sm font-black text-white uppercase tracking-tight">Pre-Screening Results</h3>
              <span className={cn("text-xs font-black px-3 py-1 rounded-lg uppercase", qualified ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400')}>{qualified ? 'Qualified' : 'Not Qualified'}</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
              {[
                { label: 'Availability', score: scores.availability },
                { label: 'Salary Fit', score: scores.salaryFit },
                { label: 'Notice Period', score: scores.noticePeriod },
                { label: 'Skill Match', score: scores.skillMatch },
                { label: 'Experience', score: scores.experience },
                { label: 'Cultural Fit', score: scores.culturalFit },
              ].map(item => (
                <div key={item.label} className="bg-white/5 rounded-xl p-4 text-center">
                  <p className={cn("text-2xl font-black", getScoreColor(item.score))}>{item.score}%</p>
                  <p className="text-[10px] font-bold text-white/60 uppercase tracking-wider mt-1">{item.label}</p>
                </div>
              ))}
            </div>
            <div className="bg-white/5 rounded-xl p-4">
              <p className="text-[10px] font-black text-white/60 uppercase tracking-widest mb-2">Overall Score</p>
              <p className={cn("text-4xl font-black", getScoreColor(scores.overall))}>{scores.overall}%</p>
              <p className="text-xs text-white/70 mt-2">{summary}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
