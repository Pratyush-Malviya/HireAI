import re

def main():
    with open('src/App.tsx', 'r', encoding='utf-8') as f:
        content = f.read()

    new_sections = """
        {/* Workflow Section */}
        <section className="py-24 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto border-t border-white/5 relative">
          <div className="absolute inset-0 bg-gradient-to-b from-indigo-900/10 to-transparent pointer-events-none"></div>
          <div className="text-center mb-20 relative z-10">
            <h2 className="text-3xl md:text-5xl font-black tracking-tighter text-white mb-4 font-display">The HireNow Workflow.</h2>
            <p className="text-slate-400 max-w-xl mx-auto font-medium">From ATS integration to candidate deployment in three autonomous steps.</p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative z-10">
             <div className="hidden md:block absolute top-12 left-[15%] right-[15%] h-0.5 bg-gradient-to-r from-transparent via-indigo-500/30 to-transparent"></div>
             
             {/* Step 1 */}
             <div className="relative flex flex-col items-center text-center">
               <div className="w-24 h-24 rounded-3xl bg-[#0A0A0B] border border-white/10 shadow-[0_0_30px_rgba(79,70,229,0.15)] flex items-center justify-center mb-6 relative overflow-hidden group">
                 <div className="absolute inset-0 bg-indigo-500/10 translate-y-full group-hover:translate-y-0 transition-transform duration-500"></div>
                 <span className="text-3xl font-black text-white font-display">01</span>
               </div>
               <h3 className="text-xl font-black text-white mb-3">Connect Client ATS</h3>
               <p className="text-slate-400 text-sm max-w-xs leading-relaxed">Sync directly with Greenhouse, Lever, or Workday. HireNow ingests job requirements automatically.</p>
             </div>
             
             {/* Step 2 */}
             <div className="relative flex flex-col items-center text-center">
               <div className="w-24 h-24 rounded-3xl bg-indigo-950/40 border border-indigo-500/20 shadow-[0_0_50px_rgba(79,70,229,0.25)] flex items-center justify-center mb-6 relative overflow-hidden group">
                 <div className="absolute inset-0 bg-indigo-500/20 translate-y-full group-hover:translate-y-0 transition-transform duration-500"></div>
                 <span className="text-3xl font-black text-indigo-400 font-display">02</span>
               </div>
               <h3 className="text-xl font-black text-white mb-3">Autonomous Screening</h3>
               <p className="text-slate-400 text-sm max-w-xs leading-relaxed">Candidates enter the branded HireNow lobby for a dynamic, 30-minute conversational technical interview.</p>
             </div>
             
             {/* Step 3 */}
             <div className="relative flex flex-col items-center text-center">
               <div className="w-24 h-24 rounded-3xl bg-[#0A0A0B] border border-white/10 shadow-[0_0_30px_rgba(79,70,229,0.15)] flex items-center justify-center mb-6 relative overflow-hidden group">
                 <div className="absolute inset-0 bg-indigo-500/10 translate-y-full group-hover:translate-y-0 transition-transform duration-500"></div>
                 <span className="text-3xl font-black text-white font-display">03</span>
               </div>
               <h3 className="text-xl font-black text-white mb-3">Deploy Top Talent</h3>
               <p className="text-slate-400 text-sm max-w-xs leading-relaxed">Review the top 5% of candidates based on multidimensional scorecard metrics, completely bias-free.</p>
             </div>
          </div>
        </section>

        {/* Pricing Section */}
        <section className="py-24 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto border-t border-white/5 relative">
           <div className="text-center mb-16 relative z-10">
            <h2 className="text-3xl md:text-5xl font-black tracking-tighter text-white mb-4 font-display">Transparent Agency Pricing.</h2>
            <p className="text-slate-400 max-w-xl mx-auto font-medium">Scale your recruiting margins with predictable, usage-based licensing.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto relative z-10">
             {/* Starter */}
             <div className="rounded-3xl bg-[#0A0A0B] border border-white/10 p-8 flex flex-col hover:border-white/20 transition-colors">
               <h3 className="text-xl font-black text-white mb-2">Starter</h3>
               <p className="text-slate-400 text-sm mb-6">For boutique agencies.</p>
               <div className="mb-6">
                 <span className="text-4xl font-black text-white font-display">$499</span>
                 <span className="text-slate-500 font-medium"> / mo</span>
               </div>
               <ul className="space-y-4 mb-8 flex-1">
                 <li className="flex items-start gap-3 text-sm text-slate-300 font-medium"><CheckCircle className="w-5 h-5 text-indigo-400 shrink-0" /> Up to 500 candidate interviews/mo</li>
                 <li className="flex items-start gap-3 text-sm text-slate-300 font-medium"><CheckCircle className="w-5 h-5 text-indigo-400 shrink-0" /> Standard ATS integrations</li>
                 <li className="flex items-start gap-3 text-sm text-slate-300 font-medium"><CheckCircle className="w-5 h-5 text-indigo-400 shrink-0" /> Standard scorecard reports</li>
               </ul>
               <button onClick={signIn} className="w-full py-3.5 rounded-xl bg-white/5 text-white text-xs font-black uppercase tracking-widest hover:bg-white/10 transition-colors border border-white/10">Start Free Trial</button>
             </div>

             {/* Pro */}
             <div className="rounded-3xl bg-indigo-950/40 border border-indigo-500/30 p-8 flex flex-col relative overflow-hidden transform md:-translate-y-4 shadow-[0_0_50px_rgba(79,70,229,0.2)]">
               <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-indigo-500 to-cyan-400"></div>
               <div className="absolute top-4 right-4 bg-indigo-500/20 text-indigo-300 text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full border border-indigo-500/30">Most Popular</div>
               
               <h3 className="text-xl font-black text-white mb-2">Agency Pro</h3>
               <p className="text-indigo-200/60 text-sm mb-6">For scaling recruitment firms.</p>
               <div className="mb-6">
                 <span className="text-4xl font-black text-white font-display">$1,299</span>
                 <span className="text-indigo-300/50 font-medium"> / mo</span>
               </div>
               <ul className="space-y-4 mb-8 flex-1">
                 <li className="flex items-start gap-3 text-sm text-slate-300 font-medium"><CheckCircle className="w-5 h-5 text-indigo-400 shrink-0" /> Unlimited candidate interviews</li>
                 <li className="flex items-start gap-3 text-sm text-slate-300 font-medium"><CheckCircle className="w-5 h-5 text-indigo-400 shrink-0" /> Advanced Anti-Cheat protocols</li>
                 <li className="flex items-start gap-3 text-sm text-slate-300 font-medium"><CheckCircle className="w-5 h-5 text-indigo-400 shrink-0" /> White-label portal capabilities</li>
                 <li className="flex items-start gap-3 text-sm text-slate-300 font-medium"><CheckCircle className="w-5 h-5 text-indigo-400 shrink-0" /> Custom scoring dimensions</li>
               </ul>
               <button onClick={signIn} className="w-full py-3.5 rounded-xl bg-indigo-600 text-white text-xs font-black uppercase tracking-widest hover:bg-indigo-500 hover:scale-[1.02] transition-all shadow-[0_0_20px_rgba(79,70,229,0.4)]">Upgrade to Pro</button>
             </div>

             {/* Enterprise */}
             <div className="rounded-3xl bg-[#0A0A0B] border border-white/10 p-8 flex flex-col hover:border-white/20 transition-colors">
               <h3 className="text-xl font-black text-white mb-2">Enterprise</h3>
               <p className="text-slate-400 text-sm mb-6">For global talent enterprises.</p>
               <div className="mb-6">
                 <span className="text-4xl font-black text-white font-display">Custom</span>
               </div>
               <ul className="space-y-4 mb-8 flex-1">
                 <li className="flex items-start gap-3 text-sm text-slate-300 font-medium"><CheckCircle className="w-5 h-5 text-indigo-400 shrink-0" /> Custom Reseller Pricing Margins</li>
                 <li className="flex items-start gap-3 text-sm text-slate-300 font-medium"><CheckCircle className="w-5 h-5 text-indigo-400 shrink-0" /> Dedicated Account Manager</li>
                 <li className="flex items-start gap-3 text-sm text-slate-300 font-medium"><CheckCircle className="w-5 h-5 text-indigo-400 shrink-0" /> SLA Guarantees</li>
                 <li className="flex items-start gap-3 text-sm text-slate-300 font-medium"><CheckCircle className="w-5 h-5 text-indigo-400 shrink-0" /> On-premise deployment options</li>
               </ul>
               <button onClick={signIn} className="w-full py-3.5 rounded-xl bg-white text-black text-xs font-black uppercase tracking-widest hover:bg-slate-200 transition-colors">Contact Sales</button>
             </div>
          </div>
        </section>
"""

    # Inject the new sections right before the Footer CTA
    footer_idx = content.find('{/* Footer CTA */}')
    if footer_idx != -1:
        content = content[:footer_idx] + new_sections + '\n        ' + content[footer_idx:]
    else:
        print("Failed to find Footer CTA")
        return

    # Add CheckCircle to imports if not present
    if 'CheckCircle' not in content:
        # Just prepend import { CheckCircle } from 'lucide-react';
        # Find first lucide import
        lucide_idx = content.find("from 'lucide-react';")
        if lucide_idx != -1:
            # We can just add it manually at the top to be safe.
            import_statement = "import { CheckCircle } from 'lucide-react';\n"
            content = import_statement + content

    with open('src/App.tsx', 'w', encoding='utf-8') as f:
        f.write(content)
        
    print("Injected new landing page sections")

if __name__ == '__main__':
    main()
