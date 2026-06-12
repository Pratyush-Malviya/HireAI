import { Download, FileText, Printer, BookOpen, Target } from 'lucide-react';
import { useNotification } from '../../lib/appContext';

// ── Download helpers (from original App.tsx) ──────────────────────────────────

function downloadFile(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = filename; link.click();
  URL.revokeObjectURL(url);
}

function buildManualHTML() {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
  <title>AI Hire Operations Manual</title>
  <style>body{font-family:system-ui,sans-serif;max-width:820px;margin:0 auto;padding:48px 24px;line-height:1.7;color:#1e293b}
  h1{font-size:2rem;font-weight:900;text-transform:uppercase;letter-spacing:-.04em;margin-bottom:8px}
  h2{font-size:1rem;font-weight:900;text-transform:uppercase;letter-spacing:.1em;color:#6366f1;margin-top:40px;border-bottom:2px solid #e2e8f0;padding-bottom:8px}
  p{color:#475569;margin:12px 0}.step{display:flex;gap:16px;padding:16px;background:#f8fafc;border-radius:12px;margin:12px 0}
  .num{background:#6366f1;color:white;border-radius:50%;width:32px;height:32px;display:flex;align-items:center;justify-content:center;font-weight:900;flex-shrink:0}
  .dim{padding:16px;border:1px solid #e2e8f0;border-radius:12px;margin:8px 0}</style>
  </head><body>
  <h1>AI Hire Operations & Onboarding Manual</h1>
  <p>Enterprise-grade hiring platform documentation covering screening philosophy, operational blueprint, and system configuration.</p>
  <h2>01 — The D6 Screening Philosophy</h2>
  <div class="dim"><strong>D1 — Technical Core:</strong> Evaluates languages, libraries, and ecosystem expertise.</div>
  <div class="dim"><strong>D2 — Pragmatic Tenure:</strong> Inspects career length, title alignment, and sector longevity.</div>
  <div class="dim"><strong>D3 — Educational Foundation:</strong> Academic credentials, major alignment, institution ranking.</div>
  <div class="dim"><strong>D4 — Quantifiable Outcomes:</strong> Metric-driven bullet points, cost reductions, scale indicators.</div>
  <div class="dim"><strong>D5 — Cultural Coherence:</strong> Timeline gaps, tenure patterns, career trajectory stability.</div>
  <div class="dim"><strong>D6 — Generative Sincerity:</strong> Forensic audit for templated language, padding, copy-paste indicators.</div>
  <h2>02 — Operational Action Blueprint</h2>
  <div class="step"><div class="num">1</div><div><strong>Register Workspace</strong><p>Use the tenant invitation link from the Organization list to establish a business identity.</p></div></div>
  <div class="step"><div class="num">2</div><div><strong>Publish Screening Campaigns</strong><p>Click "New Job" to instantiate campaigns with title, seniority, and job description.</p></div></div>
  <div class="step"><div class="num">3</div><div><strong>Fine-tune Grading Weights</strong><p>Adjust D1-D5 weight ratios via Evaluation Settings. Recalculates match scoring automatically.</p></div></div>
  <div class="step"><div class="num">4</div><div><strong>Batch Ingestion</strong><p>Drag and drop resumes (.pdf, .docx). Parallel pipelines parse simultaneously.</p></div></div>
  </body></html>`;
}

// ── Manual Page ───────────────────────────────────────────────────────────────

const DIMENSIONS = [
  { name: 'Technical Core (D1)', desc: 'Analyzes knowledge of languages, libraries, platforms, and package ecosystems demanded by the target Job Specification.' },
  { name: 'Pragmatic Tenure (D2)', desc: 'Inspects career length, closeness of previous job titles, management seniority, and sector-related longevity.' },
  { name: 'Educational Foundation (D3)', desc: 'Grades academic credentials, major alignment, and university ranking filters.' },
  { name: 'Quantifiable Outcomes (D4)', desc: 'Reviews bullet points for metric KPI improvements, cost reductions, system scale, and quantitative awards.' },
  { name: 'Cultural Coherence (D5)', desc: 'Flags chronological professional timeline gaps, tenure patterns, and career trajectory stability.' },
  { name: 'Generative Sincerity (D6)', desc: 'Audits the resume forensically for templated generic explanations, resume padding, and copy-paste indicators.' },
];

const STEPS = [
  { step: '1', title: 'Register Workspace Space', text: 'Onboarded teams use the Super Admin\'s tenant invitation link to securely establish their business identity and connect with shared DB clusters.' },
  { step: '2', title: 'Publish Screening Campaigns', text: 'Corporate recruiters click "New Job" to instantiate campaigns. Specify title, seniority tier, and standard Job descriptions. The system parses structural requirements immediately.' },
  { step: '3', title: 'Fine-tune Grading Weights', text: 'Click "Evaluation Settings" on any job to modify weight ratios of D1-D5 criteria. Adjusting thresholds recalculates match categorization rules automatically.' },
  { step: '4', title: 'Batch Ingestion Files', text: 'Drag and drop candidate resumes (.pdf, .docx). Parallel pipelines parse files simultaneously, caching texts for re-evaluation runs.' },
];

export function SAManualPage() {
  const { notify } = useNotification();

  const handleDownloadHTML = () => {
    downloadFile(buildManualHTML(), 'HireAI-Operations-Manual.html', 'text/html');
    notify('HTML manual downloaded!', 'success');
  };

  const handleDownloadPDF = () => {
    notify('Generating PDF — your browser will open the print dialog.', 'info');
    window.print();
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-400">
      {/* Header row */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-6 glass-premium rounded-3xl border border-white/10">
        <div>
          <h1 className="text-xl font-black text-white uppercase tracking-tight flex items-center gap-3">
            <BookOpen className="w-5 h-5 text-indigo-400" />
            HR Operations Handbook
          </h1>
          <p className="text-white/50 text-sm mt-1">Download and send this complete onboarding kit to corporate organizations.</p>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <button onClick={handleDownloadPDF}
            className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-xl text-[10px] font-black uppercase tracking-widest text-white hover:opacity-90 shadow-lg shadow-indigo-500/20 transition-all">
            <Download className="w-3.5 h-3.5" /> PDF Manual
          </button>
          <button onClick={handleDownloadHTML}
            className="flex items-center gap-2 px-4 py-2.5 border border-white/10 rounded-xl text-[10px] font-black uppercase tracking-widest text-white/70 hover:text-white hover:bg-white/5 transition-all">
            <FileText className="w-3.5 h-3.5" /> HTML Manual
          </button>
          <button onClick={() => { notify('Opening print layout...', 'info'); window.print(); }}
            className="flex items-center gap-2 px-4 py-2.5 border border-white/10 rounded-xl text-[10px] font-black uppercase tracking-widest text-white/70 hover:text-white hover:bg-white/5 transition-all">
            <Printer className="w-3.5 h-3.5" /> Print
          </button>
        </div>
      </div>

      {/* Document preview */}
      <div className="glass-premium rounded-3xl border border-white/10 p-8 md:p-12 space-y-12 max-h-[72vh] overflow-y-auto">
        {/* Visual header */}
        <div className="text-center pb-8 border-b border-white/10 space-y-3">
          <span className="px-3.5 py-1 bg-indigo-500/10 border border-indigo-500/20 rounded-full text-[9px] font-black uppercase tracking-widest text-indigo-400 inline-block font-mono">Enterprise HR Kit</span>
          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">AI Hire Operations & Onboarding Manual</h1>
          <p className="text-white/50 text-sm max-w-xl mx-auto">This official guide details the integrated calibration, batch sourcing pipeline, and custom grading frameworks for registered HR organizations.</p>
        </div>

        {/* Section 01 — D6 Philosophy */}
        <div className="space-y-4">
          <h3 className="text-sm font-black uppercase tracking-wider text-white flex items-center gap-2">
            <span className="text-white bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 rounded text-xs font-mono">01</span>
            The D6 Screening Philosophy
          </h3>
          <p className="text-white/60 text-sm leading-relaxed">The platform evaluates candidate resumes across six deep screening dimensions. Rather than matching flat keywords, language parsing engines grade professional experiences dynamically:</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {DIMENSIONS.map(dim => (
              <div key={dim.name} className="p-4 bg-white/5 border border-white/10 rounded-2xl hover:border-indigo-500/20 transition-all">
                <h4 className="text-xs font-black uppercase tracking-wider text-white mb-1.5 flex items-center gap-1.5">
                  <Target className="w-3.5 h-3.5 text-indigo-400 shrink-0" /> {dim.name}
                </h4>
                <p className="text-[11px] text-white/50 leading-relaxed">{dim.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Section 02 — Blueprint */}
        <div className="space-y-4">
          <h3 className="text-sm font-black uppercase tracking-wider text-white flex items-center gap-2">
            <span className="text-white bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 rounded text-xs font-mono">02</span>
            Operational Action Blueprint
          </h3>
          <p className="text-white/60 text-sm leading-relaxed">Onboard new hiring teams to live status within minutes by walking them through these 4 primary operational phases:</p>
          <div className="space-y-3">
            {STEPS.map(st => (
              <div key={st.step} className="flex gap-4 p-4 bg-indigo-500/5 border border-indigo-500/10 rounded-2xl">
                <div className="w-8 h-8 bg-indigo-500/20 text-indigo-400 border border-indigo-500/20 rounded-full font-black text-xs flex items-center justify-center shrink-0">{st.step}</div>
                <div>
                  <h4 className="text-xs font-black uppercase tracking-wider text-white">{st.title}</h4>
                  <p className="text-[11px] text-white/50 leading-relaxed mt-1">{st.text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Section 03 — Calibration */}
        <div className="space-y-4">
          <h3 className="text-sm font-black uppercase tracking-wider text-white flex items-center gap-2">
            <span className="text-white bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 rounded text-xs font-mono">03</span>
            Grading Settings & Calibration
          </h3>
          <p className="text-white/60 text-sm leading-relaxed">Recruitment managers can completely overrule standard weights to map criteria directly with physical job types:</p>
          <div className="p-4 bg-emerald-500/5 border border-emerald-500/20 rounded-2xl text-[11px] text-emerald-300 leading-relaxed">
            💡 <strong>IMPORTANT:</strong> Aggregate weights of custom D1-D5 dimensions must equal exactly 100%. Adjusting Job thresholds sets visual match guidelines directly. Saving configurations allows triggering immediate bulk re-scoring for all past uploaded applicants with a single button!
          </div>
        </div>

        {/* Section 04 — Dashboards */}
        <div className="space-y-4">
          <h3 className="text-sm font-black uppercase tracking-wider text-white flex items-center gap-2">
            <span className="text-white bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 rounded text-xs font-mono">04</span>
            Reading Interactive Candidate Dashboards
          </h3>
          <ul className="list-disc pl-5 text-sm text-white/50 space-y-2 leading-relaxed">
            <li><span className="text-white font-black">Executive Verdict Narrative:</span> A objective 3-sentence summary analyzing qualifications and job suitability.</li>
            <li><span className="text-white font-black">Chronological Padding Checklists:</span> Spots gaps in tenure, rapid employer changes, or suspiciously generic candidate summaries.</li>
            <li><span className="text-white font-black">Tailored Interview Prompts:</span> 3 intelligent templates custom-built for interviewers to probe exact weaknesses identified during parsing.</li>
          </ul>
        </div>

        {/* Section 05 — SMTP */}
        <div className="space-y-4 pt-4 border-t border-white/10">
          <h3 className="text-sm font-black uppercase tracking-wider text-white flex items-center gap-2">
            <span className="text-white bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 rounded text-xs font-mono">05</span>
            Configuration of SMTP Outgoing Servers
          </h3>
          <p className="text-white/60 text-sm leading-relaxed">Shortlisted candidates receive automated invite emails dispatched directly from the organization's domain setup:</p>
          <ol className="list-decimal pl-5 text-sm text-white/50 space-y-2 leading-relaxed">
            <li>Visit the <strong className="text-white">Super Admin Registry</strong> settings panel to specify outgoing details.</li>
            <li>Enter SMTP server address (e.g., <code className="font-mono text-indigo-300">smtp.gmail.com</code>) with authorized credentials. Select Secure SSL (Port 465) or TLS (Port 587).</li>
            <li>Verify setup using the inline connection verification test block before rolling out to recruiting staff.</li>
          </ol>
        </div>
      </div>
    </div>
  );
}
