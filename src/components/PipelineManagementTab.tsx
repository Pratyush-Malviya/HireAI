import React, { useMemo } from 'react';
import { Job } from '../types';
import { Briefcase, Clock, DollarSign, AlertCircle } from 'lucide-react';
import { cn } from '../lib/utils';
import { motion } from 'motion/react';

interface PipelineManagementTabProps {
  jobs: Job[];
}

export function PipelineManagementTab({ jobs }: PipelineManagementTabProps) {
  const activeJobs = jobs.filter(j => j.status === 'active');

  const prioritizedJobs = useMemo(() => {
    return [...activeJobs].sort((a, b) => {
      let scoreA = 0;
      let scoreB = 0;

      // Urgency
      if (a.urgency === 'high') scoreA += 1000;
      else if (a.urgency === 'medium') scoreA += 500;

      if (b.urgency === 'high') scoreB += 1000;
      else if (b.urgency === 'medium') scoreB += 500;

      // Fee Size
      if (a.feeSize) scoreA += a.feeSize / 100;
      if (b.feeSize) scoreB += b.feeSize / 100;

      // Deadline (closer deadline = higher score)
      const now = new Date().getTime();
      if (a.deadline) {
        const daysLeftA = (new Date(a.deadline).getTime() - now) / (1000 * 3600 * 24);
        if (daysLeftA > 0) scoreA += (100 / Math.max(1, daysLeftA)) * 50;
      }
      if (b.deadline) {
        const daysLeftB = (new Date(b.deadline).getTime() - now) / (1000 * 3600 * 24);
        if (daysLeftB > 0) scoreB += (100 / Math.max(1, daysLeftB)) * 50;
      }

      return scoreB - scoreA;
    });
  }, [activeJobs]);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 border-b border-white/10 pb-6">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight uppercase leading-none mb-1">
            Pipeline Prioritization
          </h2>
          <p className="text-white text-xs sm:text-sm">
            Active requisitions prioritized by urgency, deadline, and fee size. Focus your sourcing here.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {prioritizedJobs.length === 0 ? (
          <div className="text-center py-12 flex flex-col items-center justify-center bg-white/5 rounded-3xl border border-white/10">
            <Briefcase className="w-12 h-12 text-white/30 mb-3" />
            <p className="text-sm font-bold text-white uppercase tracking-widest">No Active Jobs</p>
            <p className="text-xs text-white/70">Create a new job campaign to see it here.</p>
          </div>
        ) : (
          prioritizedJobs.map((job, idx) => (
            <motion.div 
              key={job.id} 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05 }}
              className="glass-premium p-6 rounded-3xl border border-white/10 flex flex-col md:flex-row justify-between gap-6 hover:bg-white/10 transition-colors"
            >
              <div className="space-y-2 flex-1">
                <div className="flex items-center gap-3">
                  <h3 className="text-lg font-black text-white uppercase tracking-tight">{job.title}</h3>
                  {job.urgency === 'high' && (
                    <span className="bg-red-500/20 text-red-300 text-[10px] px-2 py-1 rounded border border-red-500/30 uppercase font-bold flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" /> High Urgency
                    </span>
                  )}
                  {idx === 0 && (
                    <span className="bg-brand/20 text-brand text-[10px] px-2 py-1 rounded border border-brand/30 uppercase font-bold">
                      Top Priority
                    </span>
                  )}
                </div>
                {job.company && <p className="text-sm text-white/80 font-semibold">{job.company}</p>}
                
                <div className="flex flex-wrap gap-4 mt-4 pt-2">
                  <div className="flex items-center gap-2 text-xs text-white/70">
                    <DollarSign className="w-4 h-4 text-emerald-400" />
                    <span>Fee: {job.feeSize ? `$${job.feeSize.toLocaleString()}` : 'Not Specified'}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-white/70">
                    <Clock className="w-4 h-4 text-orange-400" />
                    <span>Deadline: {job.deadline ? new Date(job.deadline).toLocaleDateString() : 'No Deadline'}</span>
                  </div>
                </div>
              </div>
              
              <div className="flex items-center justify-end">
                 <a href={`/jobs/${job.id}`} className="saas-button px-6 py-3 text-sm">
                   View Requisition
                 </a>
              </div>
            </motion.div>
          ))
        )}
      </div>
    </div>
  );
}
