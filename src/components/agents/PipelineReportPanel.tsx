import React, { useState } from 'react';
import { BarChart3, Download, FileText, Loader2, Calendar, Building2, TrendingUp, Users, CheckCircle2 } from 'lucide-react';
import { cn } from '../../lib/utils';
import { generatePipelineReport, computeDashboardMetrics, formatReportForExport, computeConversionRates } from '../../services/agents/reportingAgent';

interface Props { organizationId?: string; userId?: string; userEmail?: string; onNotify: (msg: string, type: 'success' | 'error' | 'info' | 'warn') => void; }

export function PipelineReportPanel({ organizationId, userId, userEmail, onNotify }: Props) {
  const [days, setDays] = useState('7');
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<any>(null);
  const [exporting, setExporting] = useState(false);

  const handleGenerate = async () => {
    if (!organizationId) { onNotify('Organization ID required', 'warn'); return; }
    setLoading(true);
    try {
      const endDate = new Date();
      const startDate = new Date(endDate.getTime() - parseInt(days) * 24 * 60 * 60 * 1000);
      const data = await generatePipelineReport(organizationId, startDate, endDate, userEmail || 'system');
      setReport(data);
      onNotify('Pipeline report generated', 'success');
    } catch (err: any) {
      onNotify(`Failed: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async (format: 'pdf' | 'xlsx') => {
    if (!report) return;
    setExporting(true);
    try {
      const content = formatReportForExport(report, format);
      const blob = new Blob([content], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `pipeline-report-${new Date().toISOString().split('T')[0]}.${format === 'pdf' ? 'txt' : 'csv'}`;
      a.click();
      URL.revokeObjectURL(url);
      onNotify(`Report exported as ${format.toUpperCase()}`, 'success');
    } catch (err: any) {
      onNotify(`Export failed: ${err.message}`, 'error');
    } finally {
      setExporting(false);
    }
  };

  const dashboard = report ? computeDashboardMetrics(report) : null;
  const conversions = report ? computeConversionRates(report) : null;

  return (
    <div className="space-y-6">
      <div className="glass-premium p-6 rounded-2xl border border-white/10">
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <label className="block text-[10px] font-black text-white/60 uppercase tracking-widest mb-1.5">Report Period (days)</label>
            <input value={days} onChange={e => setDays(e.target.value)} type="number" min="1" max="365" className="w-32 px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:border-brand/50" />
          </div>
          <button onClick={handleGenerate} disabled={loading} className="flex items-center gap-2 px-6 py-3 bg-brand hover:bg-brand/80 disabled:opacity-50 rounded-xl text-white text-xs font-black uppercase tracking-widest mt-5">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <BarChart3 className="w-4 h-4" />}
            {loading ? 'Generating...' : 'Generate Report'}
          </button>
        </div>
      </div>

      {dashboard && report && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Active Jobs', value: report.summary.activeJobs, icon: BriefcaseIcon, color: 'from-blue-500 to-cyan-500' },
              { label: 'Total Pipeline', value: report.summary.totalCandidates, icon: Users, color: 'from-purple-500 to-pink-500' },
              { label: 'Conversion Rate', value: `${dashboard.conversionRate}%`, icon: TrendingUp, color: 'from-green-500 to-emerald-500' },
              { label: 'Avg Days to Fill', value: report.summary.avgDaysToFill, icon: Calendar, color: 'from-amber-500 to-orange-500' },
            ].map(stat => (
              <div key={stat.label} className="glass-premium p-4 rounded-2xl border border-white/10">
                <div className="flex items-center gap-3">
                  <div className={cn("p-2 rounded-lg bg-gradient-to-br", stat.color)}>
                    <stat.icon className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <p className="text-lg font-black text-white">{stat.value}</p>
                    <p className="text-[10px] font-bold text-white/60 uppercase tracking-wider">{stat.label}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="glass-premium p-6 rounded-2xl border border-white/10">
            <h3 className="text-xs font-black text-white uppercase tracking-widest mb-4">Pipeline Funnel</h3>
            <div className="space-y-3">
              {[
                { label: 'Sourced', value: report.summary.sourced, max: report.summary.totalCandidates || 1, color: 'bg-blue-500' },
                { label: 'Screened', value: report.summary.screened, max: report.summary.sourced || 1, color: 'bg-indigo-500' },
                { label: 'Interviewed', value: report.summary.interviewed, max: report.summary.screened || 1, color: 'bg-purple-500' },
                { label: 'Offered', value: report.summary.offered, max: report.summary.interviewed || 1, color: 'bg-amber-500' },
                { label: 'Placed', value: report.summary.placed, max: report.summary.offered || 1, color: 'bg-green-500' },
              ].map((item, idx) => (
                <div key={item.label} className="flex items-center gap-4">
                  <span className="text-xs font-bold text-white/60 w-24 shrink-0">{item.label}</span>
                  <div className="flex-1 h-5 bg-white/5 rounded-full overflow-hidden">
                    <div className={cn("h-full rounded-full transition-all duration-500", item.color)} style={{ width: `${Math.min(100, (item.value / item.max) * 100)}%` }} />
                  </div>
                  <span className="text-xs font-black text-white w-10 text-right">{item.value}</span>
                  {idx < 4 && conversions && (
                    <span className="text-[10px] text-white/40 w-14 text-right">
                      {Object.values(conversions)[idx] || 0}%
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {report.jobBreakdown.length > 0 && (
            <div className="glass-premium p-6 rounded-2xl border border-white/10">
              <h3 className="text-xs font-black text-white uppercase tracking-widest mb-4">Job Breakdown</h3>
              <div className="space-y-2">
                {report.jobBreakdown.map((job: any) => (
                  <div key={job.jobId} className="flex items-center justify-between p-3 bg-white/5 rounded-xl">
                    <div>
                      <p className="text-sm font-bold text-white">{job.jobTitle}</p>
                      <p className="text-[10px] text-white/50">{job.candidates} candidates · {job.daysOpen} days open</p>
                    </div>
                    <span className={cn("text-[10px] px-2 py-1 rounded font-bold uppercase", job.urgency === 'high' ? 'bg-red-500/20 text-red-300' : job.urgency === 'medium' ? 'bg-amber-500/20 text-amber-300' : 'bg-green-500/20 text-green-300')}>{job.urgency}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center gap-3">
            <button onClick={() => handleExport('pdf')} disabled={exporting} className="flex items-center gap-2 px-6 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-white text-xs font-black uppercase tracking-widest">
              {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
              Export PDF
            </button>
            <button onClick={() => handleExport('xlsx')} disabled={exporting} className="flex items-center gap-2 px-6 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-white text-xs font-black uppercase tracking-widest">
              <Download className="w-4 h-4" /> Export Excel
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function BriefcaseIcon(props: any) { return <Building2 {...props} />; }
