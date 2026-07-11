import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Search, Mail, FileText, MessageSquare, BarChart3, FileSignature, GitBranch, Shield, Users, Briefcase, Sparkles, ArrowRight, CheckCircle2, Loader2, AlertCircle, ExternalLink } from 'lucide-react';
import { cn } from '../../lib/utils';
import { SourcingPanel } from './SourcingPanel';
import { OutreachPanel } from './OutreachPanel';
import { JDWriterPanel } from './JDWriterPanel';
import { PreScreenPanel } from './PreScreenPanel';
import { PipelineReportPanel } from './PipelineReportPanel';
import { OfferLetterPanel } from './OfferLetterPanel';
import { ATSIntegrationPanel } from './ATSIntegrationPanel';

interface Agent {
  id: string;
  name: string;
  description: string;
  icon: React.ElementType;
  color: string;
  category: string;
}

const AGENTS: Agent[] = [
  { id: 'sourcing', name: 'Candidate Sourcing', description: 'Search LinkedIn, GitHub, and job boards for candidates matching your JD.', icon: Users, color: 'from-blue-500 to-cyan-500', category: 'Sourcing' },
  { id: 'outreach', name: 'Candidate Outreach', description: 'Generate personalized emails and LinkedIn messages with follow-up sequences.', icon: Mail, color: 'from-purple-500 to-pink-500', category: 'Outreach' },
  { id: 'jd-writer', name: 'JD Writer', description: 'Create polished, SEO-optimized job descriptions with multiple templates.', icon: FileText, color: 'from-amber-500 to-orange-500', category: 'Content' },
  { id: 'pre-screen', name: 'Pre-Screening', description: 'Async text screening: availability, salary, notice period, qualifying questions.', icon: MessageSquare, color: 'from-green-500 to-emerald-500', category: 'Evaluation' },
  { id: 'pipeline-report', name: 'Pipeline Reports', description: 'Generate branded pipeline status reports in PDF and Excel formats.', icon: BarChart3, color: 'from-indigo-500 to-violet-500', category: 'Reporting' },
  { id: 'offer-letter', name: 'Offer Letters', description: 'Generate professional offer letters and contracts from templates.', icon: FileSignature, color: 'from-rose-500 to-red-500', category: 'Offers' },
  { id: 'ats', name: 'ATS Integration', description: 'Connect and sync with Zoho Recruit, Greenhouse, Lever, and more.', icon: GitBranch, color: 'from-sky-500 to-blue-500', category: 'Integration' },
];

interface Props {
  organizationId?: string;
  userId?: string;
  userEmail?: string;
  onNotify?: (msg: string, type: 'success' | 'error' | 'info' | 'warn') => void;
}

export function AgentHub({ organizationId, userId, userEmail, onNotify }: Props) {
  const [activeAgent, setActiveAgent] = useState<string | null>(null);
  const [hoveredAgent, setHoveredAgent] = useState<string | null>(null);

  const notify = onNotify || ((msg, type) => {});

  if (activeAgent) {
    const agent = AGENTS.find(a => a.id === activeAgent);
    return (
      <div className="space-y-6 animate-in fade-in duration-500">
        <div className="flex items-center gap-3">
          <button onClick={() => setActiveAgent(null)} className="text-white/60 hover:text-white transition-colors text-sm font-bold uppercase tracking-wider">
            ← Back to Agents
          </button>
          <span className="text-white/20">|</span>
          <div className={cn("p-1.5 rounded-lg bg-gradient-to-br", agent?.color)}>
            {agent && <agent.icon className="w-4 h-4 text-white" />}
          </div>
          <h2 className="text-lg font-black text-white uppercase tracking-tight">{agent?.name}</h2>
        </div>
        <AnimatePresence mode="wait">
          <motion.div key={activeAgent} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }}>
            {activeAgent === 'sourcing' && <SourcingPanel organizationId={organizationId} onNotify={notify} />}
            {activeAgent === 'outreach' && <OutreachPanel organizationId={organizationId} onNotify={notify} />}
            {activeAgent === 'jd-writer' && <JDWriterPanel onNotify={notify} />}
            {activeAgent === 'pre-screen' && <PreScreenPanel organizationId={organizationId} onNotify={notify} />}
            {activeAgent === 'pipeline-report' && <PipelineReportPanel organizationId={organizationId} userId={userId} userEmail={userEmail} onNotify={notify} />}
            {activeAgent === 'offer-letter' && <OfferLetterPanel organizationId={organizationId} onNotify={notify} />}
            {activeAgent === 'ats' && <ATSIntegrationPanel organizationId={organizationId} onNotify={notify} />}
          </motion.div>
        </AnimatePresence>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 border-b border-white/10 pb-6">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight uppercase leading-none mb-1">Recruitment Automation Hub</h2>
          <p className="text-white text-xs sm:text-sm">AI-powered agents to automate your entire recruitment workflow.</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-white/60">
          <Sparkles className="w-3.5 h-3.5 text-brand" />
          <span className="font-bold">{AGENTS.length} Agents Ready</span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {AGENTS.map((agent) => (
          <motion.button
            key={agent.id}
            onMouseEnter={() => setHoveredAgent(agent.id)}
            onMouseLeave={() => setHoveredAgent(null)}
            onClick={() => setActiveAgent(agent.id)}
            className="glass-premium p-5 rounded-2xl border border-white/10 text-left hover:bg-white/10 transition-all group relative overflow-hidden"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <div className={cn(
              "absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500",
              "bg-gradient-to-br", agent.color
            )} style={{ opacity: hoveredAgent === agent.id ? 0.05 : 0 }} />
            <div className="flex items-start gap-4">
              <div className={cn("p-2.5 rounded-xl bg-gradient-to-br shrink-0", agent.color)}>
                <agent.icon className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-black text-white/50 uppercase tracking-widest mb-1">{agent.category}</p>
                <h3 className="text-sm font-black text-white uppercase tracking-tight truncate">{agent.name}</h3>
                <p className="text-[11px] text-white/70 mt-1.5 leading-relaxed line-clamp-2">{agent.description}</p>
              </div>
              <ArrowRight className="w-4 h-4 text-white/30 group-hover:text-white/70 transition-colors shrink-0 mt-1" />
            </div>
          </motion.button>
        ))}
      </div>
    </div>
  );
}
