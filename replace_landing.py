import sys

def main():
    with open('src/App.tsx', 'r', encoding='utf-8') as f:
        content = f.read()

    start_idx = content.find('function LandingPage() {')
    end_idx = content.find('export default function App() {')

    if start_idx == -1 or end_idx == -1:
        print("Could not find boundaries")
        return

    new_landing = """function LandingPage() {
  const { signIn, notify } = useNotification();
  const [activeRole, setActiveRole] = useState<'ai-engineer' | 'cloud-architect' | 'security-lead'>('ai-engineer');
  const [simulationStep, setSimulationStep] = useState<number>(0);
  const [isSimulating, setIsSimulating] = useState<boolean>(false);
  const [simLog, setSimLog] = useState<string[]>([
    "Initial connection handshakes... Completed",
    "Loading vetting telemetry parameters..."
  ]);

  const roleData = {
    'ai-engineer': {
      title: "Staff AI Engineer",
      salary: "$210,000 - $260,000",
      skills: ["Gemini SDK", "Retrieval Augmented Generation", "Distributed Training"],
      steps: [
        {
          question: "How do you mitigate prompt injection and data exfiltration vectors in consumer-facing agent tools?",
          answer: "We deploy layered defensive sandboxing. All system prompts are isolated through structured XML delimiters, reinforced by secondary verification agents inspecting output token sequences prior to outbound socket transmission. Enterprise documents are vectorized using private tenant namespaces with absolute context boundary constraints.",
          grading: { coding: 94, architecture: 98, security: 97, comms: 92 },
          log: "Verifying contextual sanitization heuristics... OK [Pass]"
        },
        {
          question: "What strategies do you employ to manage latency and rate limits when running multi-agent reasoning loops against major LLM endpoints?",
          answer: "I implement semantic caching layers utilizing vector DBs for immediate query matching. For distinct requests, I deploy async concurrent batching with exponential back-off strategies, governed by a global token bucket rate-limiter running on a Redis cluster to prevent endpoint throttling.",
          grading: { coding: 96, architecture: 95, security: 89, comms: 94 },
          log: "Validating caching architecture & rate-limit strategies... OK [Pass]"
        }
      ]
    },
    'cloud-architect': {
      title: "Principal Cloud Architect",
      salary: "$190,000 - $240,000",
      skills: ["Kubernetes", "Terraform", "Multi-Cloud Infra"],
      steps: [
        {
          question: "Describe your approach to designing a zero-trust multi-region active-active deployment on AWS.",
          answer: "I utilize AWS Transit Gateway interconnected with strictly peered VPCs, ensuring no public subnets exist. All internal traffic is routed via PrivateLink and encrypted via KMS. Compute layers run on EKS clusters spanning 3 regions with Route53 latency-based routing orchestrating failover, backed by Aurora Global Databases.",
          grading: { coding: 88, architecture: 99, security: 96, comms: 91 },
          log: "Analyzing zero-trust network topologies... OK [Pass]"
        },
        {
          question: "How do you manage infrastructure drift and state locking in large engineering teams?",
          answer: "We enforce strict GitOps pipelines using Atlantis. Direct AWS console access is revoked. Terraform state is locked via DynamoDB and stored in version-controlled S3 buckets. Drift detection runs nightly via chron jobs, alerting the platform team via PagerDuty on state misalignment.",
          grading: { coding: 92, architecture: 94, security: 95, comms: 93 },
          log: "Evaluating IAC state management protocols... OK [Pass]"
        }
      ]
    },
    'security-lead': {
      title: "Head of AppSec",
      salary: "$200,000 - $250,000",
      skills: ["DevSecOps", "Pen Testing", "Cryptographic Protocols"],
      steps: [
        {
          question: "Explain how you would secure a microservices architecture handling sensitive PII financial data.",
          answer: "I mandate mutual TLS (mTLS) across all service meshes (e.g., Istio). Secrets are injected at runtime via HashiCorp Vault. All PII is tokenized at the edge before hitting core services. We implement strict RBAC mapped to JWT claims, and run continuous SAST/DAST checks on CI/CD pipelines.",
          grading: { coding: 90, architecture: 95, security: 98, comms: 94 },
          log: "Assessing cryptographic boundaries & edge sanitization... OK [Pass]"
        },
        {
          question: "Walk me through your incident response protocol for a suspected zero-day breach.",
          answer: "Immediate containment via network segmentation and blocking compromised CIDR blocks. We preserve forensic artifacts (disk images, memory dumps) without alerting the adversary. Concurrently, the IR team spins up a clean communication channel, assesses blast radius, and initiates parallel patching and regulatory disclosure protocols.",
          grading: { coding: 85, architecture: 92, security: 99, comms: 96 },
          log: "Simulating incident response lifecycle... OK [Pass]"
        }
      ]
    }
  };

  useEffect(() => {
    if (!isSimulating) return;
    
    const maxSteps = roleData[activeRole].steps.length;
    
    if (simulationStep >= maxSteps) {
      setTimeout(() => {
        setSimLog(prev => [...prev, "Finalizing aggregate scoring model...", "Candidate Approved. Generating technical scorecard."]);
        setIsSimulating(false);
      }, 1000);
      return;
    }
    
    const step = roleData[activeRole].steps[simulationStep];
    let timing = 0;
    
    // Animate AI Question
    setTimeout(() => {
      setSimLog(prev => [...prev, `[AI Interviewer]: ${step.question}`]);
    }, timing += 800);
    
    // Animate Candidate Answer
    setTimeout(() => {
      setSimLog(prev => [...prev, `[Candidate Voice Transcript]: ${step.answer}`]);
    }, timing += 2500);
    
    // Animate Telemetry & Evaluation
    setTimeout(() => {
      setSimLog(prev => [...prev, step.log, "Computing multidimensional skill matrices..."]);
    }, timing += 1500);
    
    // Advance to next step
    setTimeout(() => {
      setSimulationStep(s => s + 1);
    }, timing += 1000);
    
  }, [isSimulating, simulationStep, activeRole]);

  const startSimulation = (role: 'ai-engineer' | 'cloud-architect' | 'security-lead') => {
    if (isSimulating) return;
    setActiveRole(role);
    setSimulationStep(0);
    setSimLog([
      `Initializing neural vetting sequence for: ${roleData[role].title}`,
      "Establishing secure bidirectional audio channels... OK",
      "Calibrating technical assessment matrices... OK"
    ]);
    setIsSimulating(true);
  };

  return (
    <div className="min-h-screen bg-[#050505] text-slate-300 font-sans selection:bg-indigo-500/30 overflow-x-hidden">
      
      {/* Dynamic Background */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-violet-600/10 blur-[120px] mix-blend-screen animate-pulse"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-cyan-600/10 blur-[150px] mix-blend-screen animate-pulse" style={{ animationDelay: '2s' }}></div>
        <div className="absolute top-[40%] left-[60%] w-[30%] h-[30%] rounded-full bg-indigo-600/10 blur-[100px] mix-blend-screen animate-pulse" style={{ animationDelay: '4s' }}></div>
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-[0.03]"></div>
      </div>

      <div className="relative z-10">
        
        {/* Navigation */}
        <header className="sticky top-0 z-50 border-b border-white/5 bg-black/40 backdrop-blur-2xl">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 h-20 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 via-violet-600 to-cyan-500 p-[1px]">
                <div className="w-full h-full bg-[#050505] rounded-[11px] flex items-center justify-center">
                  <Cpu className="w-5 h-5 text-white" />
                </div>
              </div>
              <span className="font-display font-black text-2xl tracking-tighter text-white">HireFlow<span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-400 to-cyan-400">.OS</span></span>
            </div>
            
            <nav className="hidden md:flex items-center gap-8">
              <a href="#features" className="text-xs font-bold text-slate-400 hover:text-white transition-colors uppercase tracking-widest">Platform</a>
              <a href="#simulation" className="text-xs font-bold text-slate-400 hover:text-white transition-colors uppercase tracking-widest">Simulation</a>
              <a href="#trusted" className="text-xs font-bold text-slate-400 hover:text-white transition-colors uppercase tracking-widest">Enterprise</a>
            </nav>

            <div className="flex items-center gap-4">
              <button onClick={signIn} className="text-xs font-bold text-slate-300 hover:text-white transition-colors uppercase tracking-widest">
                Log In
              </button>
              <button onClick={signIn} className="px-5 py-2.5 rounded-lg bg-white text-black text-xs font-black uppercase tracking-widest hover:bg-slate-200 transition-colors shadow-[0_0_20px_rgba(255,255,255,0.2)]">
                Deploy Now
              </button>
            </div>
          </div>
        </header>

        {/* Hero Section */}
        <section className="relative pt-32 pb-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto flex flex-col items-center text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 mb-8 backdrop-blur-md">
            <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-300">v2.0 Autonomous Engine Live</span>
          </div>
          
          <h1 className="text-5xl md:text-7xl lg:text-8xl font-black tracking-tighter text-white leading-[1.1] mb-8 font-display max-w-5xl mx-auto">
            Scale your engineering team with <br className="hidden md:block"/>
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-400 via-indigo-400 to-cyan-400">Autonomous AI Screening.</span>
          </h1>
          
          <p className="text-lg md:text-xl text-slate-400 max-w-2xl mx-auto mb-12 font-medium leading-relaxed">
            Stop wasting engineering hours on initial technical screens. Deploy our conversational AI agents to conduct rigorous, multi-dimensional technical interviews at infinite scale.
          </p>
          
          <div className="flex flex-col sm:flex-row items-center gap-4 w-full sm:w-auto">
            <button onClick={signIn} className="w-full sm:w-auto px-8 py-4 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 text-white text-sm font-black uppercase tracking-widest hover:scale-105 transition-transform shadow-[0_0_30px_rgba(79,70,229,0.3)]">
              Start Building Team
            </button>
            <a href="#simulation" className="w-full sm:w-auto px-8 py-4 rounded-xl bg-white/5 border border-white/10 text-white text-sm font-black uppercase tracking-widest hover:bg-white/10 transition-colors backdrop-blur-md">
              Watch Simulation
            </a>
          </div>
        </section>

        {/* Trusted By Ticker */}
        <section id="trusted" className="py-12 border-y border-white/5 bg-black/20 overflow-hidden backdrop-blur-md">
          <p className="text-center text-[10px] font-black uppercase tracking-widest text-slate-500 mb-8">Trusted by Elite Engineering Teams</p>
          <div className="flex w-full overflow-hidden">
            <div className="flex animate-[marquee_30s_linear_infinite] min-w-full items-center justify-around gap-16 px-8 opacity-40 grayscale">
              {['Acme Corp', 'Zeta Labs', 'Stellar Tech', 'Infinity AI', 'Nexus Data', 'Quantum Systems', 'Apex Cloud', 'Vertex Dynamics'].map((company, i) => (
                <span key={i} className="text-xl md:text-2xl font-black uppercase tracking-tighter font-display whitespace-nowrap text-white">{company}</span>
              ))}
            </div>
            <div className="flex animate-[marquee_30s_linear_infinite] min-w-full items-center justify-around gap-16 px-8 opacity-40 grayscale" aria-hidden="true">
              {['Acme Corp', 'Zeta Labs', 'Stellar Tech', 'Infinity AI', 'Nexus Data', 'Quantum Systems', 'Apex Cloud', 'Vertex Dynamics'].map((company, i) => (
                <span key={i} className="text-xl md:text-2xl font-black uppercase tracking-tighter font-display whitespace-nowrap text-white">{company}</span>
              ))}
            </div>
          </div>
        </section>

        {/* Interactive Simulation Terminal */}
        <section id="simulation" className="py-24 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-5xl font-black tracking-tighter text-white mb-4">See the AI in Action.</h2>
            <p className="text-slate-400 max-w-xl mx-auto">Experience how our agent evaluates senior talent through adaptive, unscripted technical dialogue.</p>
          </div>

          <div className="bg-[#0A0A0B] rounded-2xl border border-white/10 shadow-[0_0_50px_rgba(0,0,0,0.5)] overflow-hidden max-w-5xl mx-auto">
            {/* Terminal Header */}
            <div className="h-12 border-b border-white/10 bg-[#121214] flex items-center px-4 justify-between">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-red-500/80"></div>
                <div className="w-3 h-3 rounded-full bg-yellow-500/80"></div>
                <div className="w-3 h-3 rounded-full bg-green-500/80"></div>
              </div>
              <div className="text-[10px] font-mono text-slate-500 flex items-center gap-2">
                <Terminal className="w-3 h-3" />
                hireflow-os-engine // live-eval
              </div>
              <div className="w-16"></div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3">
              {/* Sidebar Controls */}
              <div className="border-r border-white/10 bg-[#121214]/50 p-6 flex flex-col gap-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Select Target Persona</p>
                
                {(Object.keys(roleData) as Array<keyof typeof roleData>).map(role => (
                  <button
                    key={role}
                    onClick={() => startSimulation(role)}
                    disabled={isSimulating}
                    className={`flex flex-col text-left p-4 rounded-xl border ${activeRole === role ? 'bg-indigo-500/10 border-indigo-500/30' : 'bg-white/5 border-transparent hover:bg-white/10'} transition-all disabled:opacity-50`}
                  >
                    <span className="text-sm font-bold text-white mb-1">{roleData[role].title}</span>
                    <span className="text-[10px] text-slate-400 font-mono">{roleData[role].salary}</span>
                  </button>
                ))}
                
                <div className="mt-auto pt-6">
                   <Button 
                    onClick={() => startSimulation(activeRole)} 
                    disabled={isSimulating}
                    className="w-full bg-white text-black hover:bg-slate-200 text-xs font-black uppercase tracking-widest"
                   >
                     {isSimulating ? 'Processing...' : 'Run Simulation'}
                   </Button>
                </div>
              </div>

              {/* Terminal Output */}
              <div className="lg:col-span-2 p-6 font-mono text-sm h-[500px] overflow-y-auto bg-black relative flex flex-col">
                {simLog.map((log, i) => (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    key={i} 
                    className={`mb-3 ${log.includes('[AI Interviewer]') ? 'text-indigo-400' : log.includes('[Candidate Voice') ? 'text-slate-300 pl-4 border-l-2 border-slate-700' : log.includes('[Pass]') ? 'text-green-400' : 'text-slate-500'}`}
                  >
                    {log.includes('OK') ? (
                      <span className="flex items-start gap-2">
                        <Check className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
                        <span>{log}</span>
                      </span>
                    ) : (
                      <span className="flex items-start gap-2">
                        <ChevronRight className="w-4 h-4 opacity-50 shrink-0 mt-0.5" />
                        <span className="leading-relaxed">{log}</span>
                      </span>
                    )}
                  </motion.div>
                ))}
                
                {isSimulating && (
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: [0, 1, 0] }}
                    transition={{ repeat: Infinity, duration: 1.5 }}
                    className="mt-4"
                  >
                    <span className="w-2 h-4 bg-indigo-500 inline-block"></span>
                  </motion.div>
                )}
                
                {!isSimulating && simLog.length > 2 && (
                   <div className="mt-auto pt-6">
                      <div className="p-4 border border-green-500/30 bg-green-500/10 rounded-xl flex items-center justify-between">
                         <div className="flex flex-col">
                            <span className="text-green-400 font-bold uppercase text-[10px] tracking-widest">Simulation Concluded</span>
                            <span className="text-white text-sm">Scorecard Generated Successfully</span>
                         </div>
                         <Button onClick={signIn} variant="ghost" className="text-green-400 hover:bg-green-500/20 text-[10px] uppercase font-black tracking-widest">
                           View Details
                         </Button>
                      </div>
                   </div>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Bento Grid Features */}
        <section id="features" className="py-24 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
           <div className="text-center mb-16">
            <h2 className="text-3xl md:text-5xl font-black tracking-tighter text-white mb-4">Enterprise Architecture.</h2>
            <p className="text-slate-400 max-w-xl mx-auto">Built from the ground up to support high-volume hiring operations with uncompromised accuracy and compliance.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 auto-rows-[250px]">
             {/* Feature 1 - Large */}
             <div className="md:col-span-2 md:row-span-2 rounded-3xl bg-white/5 border border-white/10 p-8 flex flex-col relative overflow-hidden group">
               <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/20 rounded-full blur-[80px] -translate-y-1/2 translate-x-1/2 group-hover:scale-150 transition-transform duration-700"></div>
               <div className="w-12 h-12 rounded-xl bg-indigo-500/20 flex items-center justify-center mb-6">
                 <Cpu className="w-6 h-6 text-indigo-400" />
               </div>
               <h3 className="text-2xl font-black text-white mb-3">Adaptive Neural Assessment</h3>
               <p className="text-slate-400 font-medium max-w-md">Our AI doesn't ask static questions. It parses the candidate's resume and dynamically generates deep, contextual technical challenges that adapt based on their real-time responses.</p>
               
               <div className="mt-auto border border-white/10 bg-black/40 rounded-xl p-4 flex items-center gap-4 backdrop-blur-md">
                 <div className="flex-1 space-y-2">
                   <div className="h-2 bg-white/10 rounded-full w-full overflow-hidden">
                     <div className="h-full bg-gradient-to-r from-indigo-500 to-cyan-400 w-[85%]"></div>
                   </div>
                   <div className="flex justify-between text-[10px] font-mono text-slate-500">
                     <span>System Architecture Evaluation</span>
                     <span className="text-cyan-400 font-bold">94/100</span>
                   </div>
                 </div>
               </div>
             </div>

             {/* Feature 2 - Small */}
             <div className="rounded-3xl bg-white/5 border border-white/10 p-8 flex flex-col relative overflow-hidden group">
               <div className="w-10 h-10 rounded-xl bg-violet-500/20 flex items-center justify-center mb-4">
                 <Database className="w-5 h-5 text-violet-400" />
               </div>
               <h3 className="text-lg font-black text-white mb-2">ATS Integrations</h3>
               <p className="text-sm text-slate-400">Seamless bidirectional sync with Greenhouse, Lever, and Workday. Webhook support for custom workflows.</p>
             </div>

             {/* Feature 3 - Small */}
             <div className="rounded-3xl bg-white/5 border border-white/10 p-8 flex flex-col relative overflow-hidden group">
               <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center mb-4">
                 <ShieldCheck className="w-5 h-5 text-emerald-400" />
               </div>
               <h3 className="text-lg font-black text-white mb-2">Anti-Cheat Protocols</h3>
               <p className="text-sm text-slate-400">Real-time eye tracking, tab-switch monitoring, and ambient audio analysis ensure candidate integrity.</p>
             </div>

             {/* Feature 4 - Medium */}
             <div className="md:col-span-3 rounded-3xl bg-gradient-to-r from-indigo-900/40 via-violet-900/40 to-black border border-white/10 p-8 flex flex-col sm:flex-row items-center gap-8 relative overflow-hidden group">
               <div className="flex-1">
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 border border-white/20 mb-4">
                     <Globe className="w-3 h-3 text-white" />
                     <span className="text-[10px] font-bold uppercase tracking-widest text-white">White-Label OS</span>
                  </div>
                  <h3 className="text-2xl font-black text-white mb-3">Enterprise Reseller Capabilities</h3>
                  <p className="text-slate-400 text-sm max-w-2xl">Operate HireFlow as your own product. Embed the screening lobby directly into your corporate domain with fully customized branding, color schemes, and dynamic pricing matrices for your sub-tenants.</p>
               </div>
               <div className="w-full sm:w-auto shrink-0 flex items-center gap-4">
                  <button onClick={signIn} className="px-6 py-3 rounded-xl bg-white text-black font-black uppercase tracking-widest text-xs hover:bg-slate-200 transition-colors">
                    Explore Enterprise
                  </button>
               </div>
             </div>
          </div>
        </section>

        {/* Footer CTA */}
        <section className="py-32 px-4 border-t border-white/5 text-center relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-b from-transparent to-indigo-900/20 pointer-events-none"></div>
          <h2 className="text-4xl md:text-6xl font-black tracking-tighter text-white mb-6 relative z-10">
            Ready to upgrade your hiring?
          </h2>
          <p className="text-slate-400 text-lg mb-10 max-w-2xl mx-auto relative z-10">
            Join the top 1% of engineering teams using autonomous agents to discover world-class talent faster.
          </p>
          <button onClick={signIn} className="relative z-10 px-10 py-5 rounded-2xl bg-white text-black text-sm font-black uppercase tracking-widest hover:scale-105 transition-transform shadow-[0_0_50px_rgba(255,255,255,0.3)]">
            Deploy HireFlow Today
          </button>
        </section>
        
        <footer className="py-8 border-t border-white/10 text-center">
           <p className="text-[10px] font-bold uppercase tracking-widest text-slate-600">© 2026 HireFlow OS Inc. All systems operational.</p>
        </footer>

      </div>
    </div>
  );
}
"""
    
    new_content = content[:start_idx] + new_landing + '\n\n' + content[end_idx:]
    
    # Let's add tailwind keyframes for marquee if they don't exist in index.css
    # (Actually we can just assume tailwind can handle standard marquee or use inline styles if needed, 
    # but I used `animate-[marquee_30s_linear_infinite]` which requires tailwind config. 
    # Since I don't want to touch tailwind config right now, I'll add inline css style block in the document head or inside LandingPage)
    
    # Wait, instead of standard CSS config, I will just add a <style> tag at the top of the return for LandingPage
    style_tag = """
      <style>
        @keyframes marquee {
          0% { transform: translateX(0%); }
          100% { transform: translateX(-100%); }
        }
        .animate-\\[marquee_30s_linear_infinite\\] {
          animation: marquee 30s linear infinite;
        }
      </style>
"""
    new_content = new_content.replace('<div className="min-h-screen bg-[#050505]', style_tag + '      <div className="min-h-screen bg-[#050505]')

    with open('src/App.tsx', 'w', encoding='utf-8') as f:
        f.write(new_content)
    print("Landing page successfully replaced!")

if __name__ == '__main__':
    main()
