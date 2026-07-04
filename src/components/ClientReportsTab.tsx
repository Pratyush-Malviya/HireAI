import React, { useState, useMemo } from 'react';
import { Job, Candidate } from '../types';
import { FileText, Download, Target, Users, Clock } from 'lucide-react';
import { cn } from '../lib/utils';
import { motion } from 'motion/react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface ClientReportsTabProps {
  jobs: Job[];
  candidates: Candidate[];
}

export function ClientReportsTab({ jobs, candidates }: ClientReportsTabProps) {
  const [selectedCompany, setSelectedCompany] = useState<string>('all');

  const companies = useMemo(() => {
    const set = new Set<string>();
    jobs.forEach(j => {
      if (j.company) set.add(j.company);
    });
    return Array.from(set).sort();
  }, [jobs]);

  const filteredJobs = useMemo(() => {
    if (selectedCompany === 'all') return jobs;
    return jobs.filter(j => j.company === selectedCompany);
  }, [jobs, selectedCompany]);

  const filteredCandidates = useMemo(() => {
    const jobIds = new Set(filteredJobs.map(j => j.id));
    return candidates.filter(c => jobIds.has(c.jobId));
  }, [candidates, filteredJobs]);

  const activeJobsCount = filteredJobs.filter(j => j.status === 'active').length;
  const closedJobsCount = filteredJobs.filter(j => j.status === 'closed').length;
  const totalCandidates = filteredCandidates.length;
  
  // Quality Metric: Average Composite Score of all candidates
  const averageScore = totalCandidates > 0 
    ? Math.round(filteredCandidates.reduce((acc, curr) => acc + (curr.scorecard?.compositeScore || 0), 0) / totalCandidates)
    : 0;

  // Time-to-fill metric: average days from created to closed
  const closedJobsWithDates = filteredJobs.filter(j => j.status === 'closed' && j.createdAt && j.closedAt);
  const avgTimeToFill = closedJobsWithDates.length > 0
    ? Math.round(closedJobsWithDates.reduce((acc, curr) => {
        const start = curr.createdAt.toDate ? curr.createdAt.toDate().getTime() : new Date(curr.createdAt).getTime();
        const end = curr.closedAt.toDate ? curr.closedAt.toDate().getTime() : new Date(curr.closedAt).getTime();
        return acc + ((end - start) / (1000 * 3600 * 24));
      }, 0) / closedJobsWithDates.length)
    : 0;

  const handleDownloadReport = () => {
    const doc = new jsPDF();
    
    // Header
    doc.setFillColor(99, 102, 241); // Brand color
    doc.rect(0, 0, 210, 40, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(24);
    doc.setFont('helvetica', 'bold');
    doc.text('Client Pipeline Report', 14, 25);
    
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    const companyText = selectedCompany === 'all' ? 'All Clients' : selectedCompany;
    doc.text(`Client: ${companyText}`, 14, 33);
    doc.text(`Date: ${new Date().toLocaleDateString()}`, 150, 33);

    // Summary Metrics
    doc.setTextColor(50, 50, 50);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Pipeline Status & Quality', 14, 55);

    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.text(`Active Requisitions: ${activeJobsCount}`, 14, 65);
    doc.text(`Closed Requisitions: ${closedJobsCount}`, 14, 72);
    doc.text(`Total Candidates Processed: ${totalCandidates}`, 14, 79);
    doc.text(`Average Candidate Quality Score: ${averageScore}%`, 14, 86);
    doc.text(`Average Time-to-Fill: ${avgTimeToFill > 0 ? avgTimeToFill + ' days' : 'N/A'}`, 14, 93);

    // Jobs Table
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Requisition Details', 14, 110);

    const tableData = filteredJobs.map(job => {
      const jobCandidates = filteredCandidates.filter(c => c.jobId === job.id);
      const avgJobScore = jobCandidates.length > 0 
        ? Math.round(jobCandidates.reduce((acc, c) => acc + (c.scorecard?.compositeScore || 0), 0) / jobCandidates.length)
        : 0;
      
      return [
        job.title,
        job.status.toUpperCase(),
        jobCandidates.length.toString(),
        `${avgJobScore}%`
      ];
    });

    autoTable(doc, {
      startY: 115,
      head: [['Job Title', 'Status', 'Candidates', 'Avg Quality Score']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [99, 102, 241] },
      styles: { fontSize: 10 }
    });

    doc.save(`Pipeline_Report_${companyText.replace(/\\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 border-b border-white/10 pb-6">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight uppercase leading-none mb-1">
            Client Reporting
          </h2>
          <p className="text-white text-xs sm:text-sm">
            Generate branded pipeline and quality metrics reports for your clients.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={selectedCompany}
            onChange={(e) => setSelectedCompany(e.target.value)}
            className="transparent border-2 border-white/10 rounded-xl px-4 py-2.5 font-bold text-white focus:border-brand outline-none transition-all text-xs uppercase tracking-widest"
          >
            <option value="all" className="text-black">All Clients</option>
            {companies.map(c => (
              <option key={c} value={c} className="text-black">{c}</option>
            ))}
          </select>
          <button
            onClick={handleDownloadReport}
            className="saas-button px-5 py-2.5 text-xs flex items-center gap-2"
          >
            <Download className="w-4 h-4" />
            Export PDF
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass-premium p-6 rounded-3xl border border-white/10 flex flex-col items-center text-center">
          <div className="w-12 h-12 bg-blue-500/10 rounded-2xl flex items-center justify-center mb-4">
            <Target className="w-6 h-6 text-blue-400" />
          </div>
          <span className="text-3xl font-black text-white">{activeJobsCount}</span>
          <span className="text-[10px] uppercase font-bold tracking-widest text-white/70 mt-1">Active Reqs</span>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="glass-premium p-6 rounded-3xl border border-white/10 flex flex-col items-center text-center">
          <div className="w-12 h-12 bg-emerald-500/10 rounded-2xl flex items-center justify-center mb-4">
            <Users className="w-6 h-6 text-emerald-400" />
          </div>
          <span className="text-3xl font-black text-white">{totalCandidates}</span>
          <span className="text-[10px] uppercase font-bold tracking-widest text-white/70 mt-1">Total Candidates</span>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="glass-premium p-6 rounded-3xl border border-white/10 flex flex-col items-center text-center">
          <div className="w-12 h-12 bg-purple-500/10 rounded-2xl flex items-center justify-center mb-4">
            <FileText className="w-6 h-6 text-purple-400" />
          </div>
          <span className="text-3xl font-black text-white">{averageScore}%</span>
          <span className="text-[10px] uppercase font-bold tracking-widest text-white/70 mt-1">Avg Quality Score</span>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="glass-premium p-6 rounded-3xl border border-white/10 flex flex-col items-center text-center">
          <div className="w-12 h-12 bg-orange-500/10 rounded-2xl flex items-center justify-center mb-4">
            <Clock className="w-6 h-6 text-orange-400" />
          </div>
          <span className="text-3xl font-black text-white">{avgTimeToFill > 0 ? avgTimeToFill : '-'} <span className="text-sm font-medium">days</span></span>
          <span className="text-[10px] uppercase font-bold tracking-widest text-white/70 mt-1">Avg Time-to-Fill</span>
        </motion.div>
      </div>

      <div className="glass-premium rounded-3xl border border-white/10 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-white/10 bg-white/5">
                <th className="p-4 text-[10px] font-black text-white uppercase tracking-widest">Requisition</th>
                <th className="p-4 text-[10px] font-black text-white uppercase tracking-widest">Status</th>
                <th className="p-4 text-[10px] font-black text-white uppercase tracking-widest">Candidates</th>
                <th className="p-4 text-[10px] font-black text-white uppercase tracking-widest">Quality Score</th>
              </tr>
            </thead>
            <tbody>
              {filteredJobs.length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-8 text-center text-white/50 text-xs italic">No data available</td>
                </tr>
              ) : (
                filteredJobs.map(job => {
                  const jobCandidates = filteredCandidates.filter(c => c.jobId === job.id);
                  const avgJobScore = jobCandidates.length > 0 
                    ? Math.round(jobCandidates.reduce((acc, c) => acc + (c.scorecard?.compositeScore || 0), 0) / jobCandidates.length)
                    : 0;
                  
                  return (
                    <tr key={job.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                      <td className="p-4 text-sm font-bold text-white">{job.title}</td>
                      <td className="p-4">
                        <span className={cn(
                          "px-2 py-1 text-[10px] font-black uppercase rounded",
                          job.status === 'active' ? "bg-emerald-500/20 text-emerald-300" : "bg-slate-500/20 text-slate-300"
                        )}>
                          {job.status}
                        </span>
                      </td>
                      <td className="p-4 text-sm font-medium text-white/80">{jobCandidates.length}</td>
                      <td className="p-4 text-sm font-medium text-white/80">{avgJobScore}%</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
