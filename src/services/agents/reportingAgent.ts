// Agent 7 — Client Pipeline Reporting Agent
// Pulls live pipeline data from Firestore (sourced → screened → interviewed → offered)
// Builds a branded PDF/PPTX/Excel status report
// Supports weekly auto-delivery or on-demand

export interface PipelineReportData {
  organizationId: string;
  organizationName: string;
  reportDate: string;
  periodStart: string;
  periodEnd: string;
  generatedBy: string;
  summary: {
    totalJobs: number;
    activeJobs: number;
    totalCandidates: number;
    sourced: number;
    screened: number;
    interviewed: number;
    offered: number;
    placed: number;
    avgDaysToFill: number;
    topPerformingJob?: string;
  };
  jobBreakdown: JobPipelineRow[];
  recruiterPerformance: RecruiterMetric[];
  recentActivity: PipelineEvent[];
  trends: {
    weeklyApplications: { week: string; count: number }[];
    conversionRate: number;
    sourceEffectiveness: { source: string; applied: number; screened: number; hired: number }[];
  };
}

export interface JobPipelineRow {
  jobTitle: string;
  jobId: string;
  status: string;
  urgency: string;
  daysOpen: number;
  candidates: number;
  sourced: number;
  screened: number;
  shortlisted: number;
  interviewed: number;
  offered: number;
  placed: number;
  rejected: number;
  topCandidate?: string;
}

export interface RecruiterMetric {
  name: string;
  activeJobs: number;
  candidatesSourced: number;
  screeningsCompleted: number;
  interviewsCompleted: number;
  offersExtended: number;
  placements: number;
  conversionRate: number;
}

export interface PipelineEvent {
  date: string;
  type: 'candidate_sourced' | 'screening_completed' | 'interview_scheduled' | 'offer_extended' | 'placement' | 'rejection';
  description: string;
  candidateName?: string;
  jobTitle?: string;
}

// Build pipeline report from Firestore data
export async function generatePipelineReport(
  organizationId: string,
  startDate: Date,
  endDate: Date,
  generatedBy: string
): Promise<PipelineReportData> {
  try {
    const response = await fetch('/api/reports/generate-pipeline', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ organizationId, startDate: startDate.toISOString(), endDate: endDate.toISOString(), generatedBy })
    });
    if (response.ok) {
      return response.json();
    }
  } catch (err) {
    console.error('[ReportingAgent] Pipeline generation failed:', err);
  }
  return buildFallbackReport(organizationId, generatedBy);
}

// Generate summary metrics for dashboard widgets
export function computeDashboardMetrics(data: PipelineReportData) {
  return {
    totalPipeline: data.summary.totalCandidates,
    conversionFunnel: {
      sourced: data.summary.sourced,
      screened: data.summary.screened,
      interviewed: data.summary.interviewed,
      offered: data.summary.offered,
      placed: data.summary.placed,
    },
    conversionRate: data.trends.conversionRate || 
      (data.summary.totalCandidates > 0 
        ? Math.round((data.summary.placed / data.summary.totalCandidates) * 100) 
        : 0),
    avgDaysToFill: data.summary.avgDaysToFill,
    topJobs: data.jobBreakdown.slice(0, 5).map(j => ({
      title: j.jobTitle,
      urgency: j.urgency,
      daysOpen: j.daysOpen,
      pipeline: j.candidates
    })),
    recruiterRanking: [...data.recruiterPerformance].sort((a, b) => b.placements - a.placements),
    recentActivity: data.recentActivity.slice(0, 10),
  };
}

// Format report for PDF/PPTX export (returns report content string)
export function formatReportForExport(data: PipelineReportData, format: 'pdf' | 'pptx' | 'xlsx'): string {
  const header = `${data.organizationName} — Pipeline Status Report
Period: ${data.periodStart} to ${data.periodEnd}
Generated: ${data.reportDate}
  
=== EXECUTIVE SUMMARY ===
• Total Active Jobs: ${data.summary.activeJobs}
• Total Candidates: ${data.summary.totalCandidates}
• Placement Rate: ${data.trends.conversionRate}%
• Avg Days to Fill: ${data.summary.avgDaysToFill} days

=== PIPELINE FUNNEL ===
Sourced: ${data.summary.sourced}
Screened: ${data.summary.screened}
Interviewed: ${data.summary.interviewed}
Offered: ${data.summary.offered}
Placed: ${data.summary.placed}

=== JOB BREAKDOWN ===
${data.jobBreakdown.map(j => 
  `${j.jobTitle} (${j.urgency}): ${j.candidates} candidates | ${j.screened} screened | ${j.interviewed} interviewed | ${j.placed} placed`
).join('\n')}

=== RECRUITER PERFORMANCE ===
${data.recruiterPerformance.map(r =>
  `${r.name}: ${r.placements} placements (${r.conversionRate}% conversion)`
).join('\n')}

=== RECENT ACTIVITY ===
${data.recentActivity.slice(0, 5).map(a =>
  `[${a.date}] ${a.description}`
).join('\n')}
`;

  return header;
}

// Build a fallback report when API is unavailable
function buildFallbackReport(organizationId: string, generatedBy: string): PipelineReportData {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  return {
    organizationId,
    organizationName: 'Organization',
    reportDate: now.toISOString(),
    periodStart: weekAgo.toISOString(),
    periodEnd: now.toISOString(),
    generatedBy,
    summary: {
      totalJobs: 0,
      activeJobs: 0,
      totalCandidates: 0,
      sourced: 0,
      screened: 0,
      interviewed: 0,
      offered: 0,
      placed: 0,
      avgDaysToFill: 0,
    },
    jobBreakdown: [],
    recruiterPerformance: [],
    recentActivity: [],
    trends: {
      weeklyApplications: [],
      conversionRate: 0,
      sourceEffectiveness: [],
    }
  };
}

// Compute conversion rates between pipeline stages
export function computeConversionRates(data: PipelineReportData) {
  const { sourced, screened, interviewed, offered, placed } = data.summary;
  return {
    screenRate: sourced > 0 ? Math.round((screened / sourced) * 100) : 0,
    interviewRate: screened > 0 ? Math.round((interviewed / screened) * 100) : 0,
    offerRate: interviewed > 0 ? Math.round((offered / interviewed) * 100) : 0,
    placementRate: offered > 0 ? Math.round((placed / offered) * 100) : 0,
    overallConversion: sourced > 0 ? Math.round((placed / sourced) * 100) : 0,
  };
}
