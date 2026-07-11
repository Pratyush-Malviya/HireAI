// Agent 4 — Job Description Writer
// Input: role brief, skills required, salary band
// Output: polished JD in DOCX + SEO-optimized version for job boards
// Handles multiple client templates

export interface JDBrief {
  title: string;
  department?: string;
  reportsTo?: string;
  location: string;
  remotePolicy: 'on-site' | 'hybrid' | 'remote';
  salaryMin?: number;
  salaryMax?: number;
  currency?: string;
  experienceMin: number;
  experienceMax: number;
  skills: string[];
  niceToHave: string[];
  responsibilities: string[];
  qualifications: string[];
  aboutCompany: string;
  cultureHighlights?: string[];
  benefits?: string[];
  employmentType: 'full-time' | 'part-time' | 'contract' | 'internship';
  urgency: 'low' | 'medium' | 'high';
  industry?: string;
}

export interface JDOutput {
  title: string;
  version: 'standard' | 'seo' | 'creative' | 'minimal';
  content: string;
  seoMeta: {
    metaTitle: string;
    metaDescription: string;
    keywords: string[];
  };
  sections: JDSection[];
  wordCount: number;
}

export interface JDSection {
  heading: string;
  content: string;
  order: number;
}

export type JDTemplate = 'standard' | 'startup' | 'enterprise' | 'creative' | 'minimal';

const TEMPLATES: Record<JDTemplate, { name: string; sections: string[]; style: string }> = {
  standard: {
    name: 'Standard Professional',
    sections: ['About Us', 'Role Overview', 'Key Responsibilities', 'Requirements', 'Nice to Have', 'Benefits', 'How to Apply'],
    style: 'Professional, clear, and comprehensive. Suitable for most organizations.'
  },
  startup: {
    name: 'Startup / High Growth',
    sections: ['About Us', 'The Mission', 'What You\'ll Build', 'Who You Are', 'Nice to Have', 'Why Join Us', 'Apply Now'],
    style: 'Energetic, mission-driven, focused on impact and growth opportunities.'
  },
  enterprise: {
    name: 'Enterprise / Corporate',
    sections: ['About the Company', 'Position Summary', 'Core Responsibilities', 'Qualifications', 'Preferred Qualifications', 'Compensation & Benefits', 'EEO Statement'],
    style: 'Formal, detailed, compliance-friendly. Suitable for large organizations.'
  },
  creative: {
    name: 'Creative / Modern',
    sections: ['The Vibe', 'The Gig', 'What You\'ll Do', 'Who You Are', 'Dream Skills', 'Perks & Vibes', 'Apply'],
    style: 'Casual, engaging, uses modern language. Great for creative roles and startups.'
  },
  minimal: {
    name: 'Minimal / Direct',
    sections: ['Role', 'Requirements', 'Responsibilities', 'Apply'],
    style: 'Concise, no-fluff, bullet-point heavy. Best for experienced hires who want quick facts.'
  }
};

export function getTemplates(): typeof TEMPLATES {
  return TEMPLATES;
}

// Build section content using AI or template fill
export async function generateJD(
  brief: JDBrief,
  template: JDTemplate = 'standard'
): Promise<JDOutput> {
  try {
    const response = await fetch('/api/ai/write-job-description', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ brief, template })
    });
    if (response.ok) {
      return response.json();
    }
  } catch (err) {
    console.error('[JDWriter] AI generation failed, using template fallback:', err);
  }
  return generateTemplateFallback(brief, template);
}

// Generate SEO metadata from brief
export function generateSEOMeta(brief: JDBrief): JDOutput['seoMeta'] {
  const title = `Hiring: ${brief.title} - ${brief.location} (${brief.employmentType})`;
  const description = `${brief.title} role in ${brief.location}. Requires ${brief.experienceMin}+ years experience. Skills: ${brief.skills.slice(0, 5).join(', ')}. ${brief.remotePolicy === 'remote' ? 'Remote-friendly. ' : ''}Apply now!`;
  return {
    metaTitle: title,
    metaDescription: description,
    keywords: [...brief.skills, brief.title, `${brief.title} job`, `${brief.title} ${brief.location}`, brief.industry || ''].filter(Boolean)
  };
}

// Fallback template-based JD generation
function generateTemplateFallback(brief: JDBrief, template: JDTemplate): JDOutput {
  const templateConfig = TEMPLATES[template];
  const sections: JDSection[] = templateConfig.sections.map((heading, idx) => {
    let content = '';
    switch (heading.toLowerCase()) {
      case 'about us':
      case 'about the company':
        content = brief.aboutCompany || `We are a leading organization in the ${brief.industry || 'technology'} industry, committed to innovation and excellence.`;
        break;
      case 'role overview':
      case 'the mission':
      case 'position summary':
      case 'the gig':
        content = `We are looking for an experienced ${brief.title} to join our ${brief.department || 'team'} department. This is a ${brief.employmentType}, ${brief.remotePolicy} position based in ${brief.location}. The ideal candidate will bring ${brief.experienceMin}+ years of experience and a passion for ${brief.skills.slice(0, 2).join(' and ')}.`;
        break;
      case 'key responsibilities':
      case 'what you\'ll do':
      case 'what you\'ll build':
      case 'core responsibilities':
        content = brief.responsibilities.length > 0
          ? brief.responsibilities.map(r => `• ${r}`).join('\n')
          : '• Responsibilities will be discussed during the interview process.';
        break;
      case 'requirements':
      case 'qualifications':
      case 'who you are':
        content = [
          ...brief.qualifications.map(q => `• ${q}`),
          ...brief.skills.map(s => `• Proficiency in ${s}`),
          `• ${brief.experienceMin}+ years of professional experience`,
          `• ${brief.location ? `Located in or willing to relocate to ${brief.location}` : 'Remote work capability'}`
        ].join('\n');
        break;
      case 'nice to have':
      case 'dream skills':
      case 'preferred qualifications':
        content = brief.niceToHave.length > 0
          ? brief.niceToHave.map(s => `• ${s}`).join('\n')
          : '• Additional complementary skills are a plus';
        break;
      case 'benefits':
      case 'perks & vibes':
      case 'compensation & benefits':
      case 'why join us':
        content = [
          ...(brief.salaryMin ? [`• Competitive salary: $${brief.salaryMin.toLocaleString()} - $${(brief.salaryMax || brief.salaryMin).toLocaleString()} ${brief.currency || 'USD'}`] : []),
          ...(brief.benefits || []).map(b => `• ${b}`),
          '• Professional development opportunities',
          '• Collaborative and innovative work environment',
        ].join('\n');
        break;
      case 'how to apply':
      case 'apply now':
      case 'apply':
        content = 'To apply, please submit your resume and a brief cover letter outlining your relevant experience. We look forward to hearing from you!';
        break;
      case 'eeo statement':
        content = 'We are an equal opportunity employer. We celebrate diversity and are committed to creating an inclusive environment for all employees.';
        break;
      case 'the vibe':
        content = brief.cultureHighlights?.map(h => `• ${h}`).join('\n') || 'We foster a culture of innovation, collaboration, and continuous learning.';
        break;
      default:
        content = 'Details to be provided during the recruitment process.';
    }
    return { heading, content, order: idx };
  });

  const content = sections.map(s => `## ${s.heading}\n\n${s.content}`).join('\n\n');
  const seoMeta = generateSEOMeta(brief);

  return {
    title: brief.title,
    version: template === 'standard' ? 'standard' : template === 'creative' ? 'creative' : template === 'minimal' ? 'minimal' : 'seo',
    content,
    seoMeta,
    sections,
    wordCount: content.split(/\s+/).length
  };
}

// Generate DOCX-compatible format (for server-side conversion)
export function generateDocxContent(jd: JDOutput): string {
  return `# ${jd.title}\n\n${jd.content}`;
}
