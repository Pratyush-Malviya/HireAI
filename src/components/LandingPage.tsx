"use client"

import { ShieldCheck, Brain, Target, MessageSquare, Video, Clock, LayoutGrid, Zap, CheckCircle2, ChevronRight, BarChart3, Users, Star, ArrowRight, Search, Building2, Lightbulb, Shield, Globe, Cpu, FileText } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { motion } from "motion/react"
import { Particles } from "./magic-ui/particles"
import { BorderBeam } from "./magic-ui/border-beam"
import { Meteors } from "./magic-ui/meteors"
import { AnimatedGradientText } from "./magic-ui/animated-gradient-text"
import { NumberTicker } from "./magic-ui/number-ticker"
import { Marquee } from "./magic-ui/marquee"
import { WordRotate } from "./magic-ui/word-rotate"
import { BlurFade } from "./magic-ui/blur-fade"
import { GridPattern } from "./magic-ui/grid-pattern"
import { DotPattern } from "./magic-ui/dot-pattern"
import { SparklesText } from "./magic-ui/sparkles-text"
import { ShimmerButton } from "./magic-ui/shimmer-button"
import { RainbowButton } from "./magic-ui/rainbow-button"
import { Ripple } from "./magic-ui/ripple"
import { cn } from "../lib/utils"

const features = [
  {
    icon: Brain,
    title: "AI-Powered Screening",
    description: "Advanced LLM engines analyze resumes against job requirements with 95%+ accuracy across 15+ dimensions.",
    gradient: "from-brand to-violet-600",
  },
  {
    icon: MessageSquare,
    title: "Autonomous Interviews",
    description: "Voice-enabled AI interviewer conducts natural conversations with real-time proctoring and speech analysis.",
    gradient: "from-blue-500 to-brand",
  },
  {
    icon: Shield,
    title: "Integrity Monitoring",
    description: "Real-time face detection, tab focus tracking, and ambient noise analysis for tamper-proof evaluations.",
    gradient: "from-emerald-500 to-teal-600",
  },
  {
    icon: BarChart3,
    title: "D6 Scorecard Analytics",
    description: "Multi-dimensional scoring with weighted custom criteria, red-flag detection, and PDF report generation.",
    gradient: "from-amber-500 to-orange-600",
  },
  {
    icon: Globe,
    title: "Multi-Lingual Support",
    description: "Interview in 8+ languages with neural TTS voices. Global talent, local experience.",
    gradient: "from-sky-500 to-brand",
  },
  {
    icon: Cpu,
    title: "Custom Screening Matrix",
    description: "Configure custom criteria weights, thresholds, and evaluation dimensions per role type.",
    gradient: "from-violet-500 to-purple-600",
  },
]

const testimonials = [
  { name: "Sarah Chen", role: "CTO at TechFlow", content: "HireNow cut our screening time by 80%. The AI interviews are remarkably human-like.", avatar: "SC" },
  { name: "Marcus Johnson", role: "VP People at ScaleUp", content: "The proctoring and integrity features give us confidence in remote hiring decisions.", avatar: "MJ" },
  { name: "Elena Rodriguez", role: "HR Director at GlobalCorp", content: "We hired 3 senior engineers in one week using HireNow. Game changer for our recruiting.", avatar: "ER" },
  { name: "David Kim", role: "Founder at NextStart", content: "As a startup, we can now screen hundreds of applicants without a dedicated HR team.", avatar: "DK" },
  { name: "Aisha Patel", role: "Talent Lead at InnovateLabs", content: "The D6 scorecard gives us deep insights we never had before. Absolutely essential tool.", avatar: "AP" },
  { name: "James Wilson", role: "CEO at DataDriven", content: "Fair, unbiased, and incredibly thorough. This is the future of talent acquisition.", avatar: "JW" },
]

export function LandingPage() {
  const navigate = useNavigate();
  return (
    <div className="relative min-h-screen bg-transparent overflow-hidden">
      {/* Hero Background Effects */}
      <div className="absolute inset-0 z-0">
        <Particles className="absolute inset-0" quantity={100} color="#818cf8" size={0.6} />
        <Meteors number={15} />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-brand-dark/30 via-slate-950 to-slate-950" />
      </div>

      {/* Navigation */}
      <nav className="relative z-50 border-b border-slate-800/50 bg-transparent/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg overflow-hidden shadow-lg shadow-brand/20 bg-black flex items-center justify-center">
                <img src="/logo.jpg" alt="Logo" className="w-full h-full object-cover" />
              </div>
              <span className="text-lg font-bold text-white tracking-tight">HireNow</span>
            </div>
            <div className="flex items-center gap-4">
              <div className="hidden md:flex items-center gap-8 mr-4">
                <a href="#features" className="text-sm text-white hover:text-white transition-colors font-medium">Features</a>
                <a href="#stats" className="text-sm text-white hover:text-white transition-colors font-medium">Stats</a>
                <a href="#testimonials" className="text-sm text-white hover:text-white transition-colors font-medium">Testimonials</a>
              </div>
              <button onClick={() => navigate('/auth')} className="glass-premium text-brand px-5 py-2 rounded-xl text-sm font-bold hover:bg-white/5 transition-all shadow-lg shadow-white/10">
                Get Started
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative z-10 pt-4 pb-40 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto text-center">
          <BlurFade delay={0.1} inView>
            <div className="inline-flex items-center gap-2 px-5 py-2 rounded-full border border-brand/20 bg-brand/5 backdrop-blur-xl text-white text-xs font-bold uppercase tracking-[0.2em] mb-6 shadow-2xl shadow-brand/10">
              <SparklesText sparklesCount={5} colors={{ first: "#818cf8", second: "#c084fc" }}>
                <span className="text-[10px]">AI-Powered Talent Intelligence</span>
              </SparklesText>
            </div>
          </BlurFade>

          <BlurFade delay={0.2} inView>
            <h1 className="text-5xl sm:text-6xl md:text-8xl font-black text-white leading-[1.05] tracking-tighter mb-8 font-display drop-shadow-2xl">
              Autonomous Hiring
              <br />
              <AnimatedGradientText speed={1.5} colorFrom="#818cf8" colorTo="#c084fc">
                <span className="text-5xl sm:text-6xl md:text-8xl font-black tracking-tighter">Powered by AI</span>
              </AnimatedGradientText>
            </h1>
          </BlurFade>

          <BlurFade delay={0.3} inView>
            <p className="text-lg sm:text-2xl text-slate-300 max-w-3xl mx-auto mb-14 leading-relaxed font-light tracking-wide">
              Screen, interview, and evaluate candidates autonomously with advanced LLM analysis,
              <span className="text-white font-medium"> real-time proctoring</span>, and{" "}
              <span className="text-white font-medium">neural voice synthesis</span>.
            </p>
          </BlurFade>

          <BlurFade delay={0.4} inView>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <RainbowButton onClick={() => navigate('/auth')} className="px-8 py-3.5 text-base font-bold">
                <Zap className="w-5 h-5" />
                Start Screening Now
              </RainbowButton>
              <ShimmerButton
                shimmerColor="rgba(99, 102, 241, 0.6)"
                background="rgba(30, 27, 75, 0.8)"
                borderRadius="12px"
                className="px-8 py-3.5 text-base font-bold"
                onClick={() => document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })}
              >
                <Lightbulb className="w-5 h-5" />
                Explore Features
              </ShimmerButton>
            </div>
          </BlurFade>

          <BlurFade delay={0.5} inView>
            <div className="mt-16 flex items-center justify-center gap-10 text-xs text-slate-400 font-bold uppercase tracking-widest">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                <span>No credit card</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                <span>Free credits included</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                <span>Cancel anytime</span>
              </div>
            </div>
          </BlurFade>
        </div>
      </section>

      {/* Stats Section */}
      <section id="stats" className="relative z-10 py-32 border-y border-slate-800/50 bg-black/20 backdrop-blur-3xl">
        <div className="absolute inset-0 bg-gradient-to-b from-slate-950 via-brand-dark/5 to-slate-950" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-12">
            {[
              { value: 50000, label: "Candidates Screened", suffix: "+" },
              { value: 98, label: "Accuracy Rate", suffix: "%" },
              { value: 80, label: "Time Saved", suffix: "%" },
              { value: 150, label: "Enterprise Clients", suffix: "+" },
            ].map((stat, i) => (
              <BlurFade key={i} delay={0.1 * i} inView>
                <div className="text-center group">
                  <div className="text-4xl sm:text-6xl font-black text-white mb-3 tracking-tighter drop-shadow-xl group-hover:scale-105 transition-transform">
                    <NumberTicker value={stat.value} className="text-white" />
                    <span className="text-brand">{stat.suffix}</span>
                  </div>
                  <div className="text-xs text-slate-400 font-bold uppercase tracking-[0.2em]">{stat.label}</div>
                </div>
              </BlurFade>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="relative z-10 py-32">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <BlurFade inView className="text-center mb-24">
            <h2 className="text-4xl sm:text-5xl md:text-6xl font-black text-white mb-6 tracking-tighter">
              Everything You Need to{" "}
              <AnimatedGradientText colorFrom="#818cf8" colorTo="#c084fc">
                Hire Smarter
              </AnimatedGradientText>
            </h2>
            <p className="text-slate-400 text-lg sm:text-xl max-w-2xl mx-auto font-light tracking-wide">
              From AI-powered screening to autonomous interviews, HireNow provides a complete talent intelligence platform.
            </p>
          </BlurFade>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature, i) => (
              <BlurFade key={i} delay={0.1 * i} inView>
                <div className="relative group h-full">
                  <div className="relative overflow-hidden rounded-[2rem] border border-white/5 bg-[#0a0a0a]/40 backdrop-blur-xl p-10 h-full transition-all duration-500 hover:border-brand/30 hover:bg-white/[0.02] hover:shadow-[0_0_40px_rgba(99,102,241,0.1)]">
                    <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${feature.gradient} flex items-center justify-center mb-8 shadow-xl`}>
                      <feature.icon className="w-7 h-7 text-white" />
                    </div>
                    <h3 className="text-2xl font-bold text-white mb-4 tracking-tight">{feature.title}</h3>
                    <p className="text-slate-400 text-base leading-relaxed font-light">{feature.description}</p>
                    <BorderBeam size={100} duration={12} delay={i * 2} colorFrom="#6366f1" colorTo="#a855f7" />
                  </div>
                </div>
              </BlurFade>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="relative z-10 py-32 border-y border-slate-800/50 bg-black/40 backdrop-blur-2xl">
        <div className="absolute inset-0 bg-gradient-to-b from-slate-950 via-brand-dark/10 to-slate-950" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <BlurFade inView className="text-center mb-24">
            <h2 className="text-4xl sm:text-5xl md:text-6xl font-black text-white mb-6 tracking-tighter">
              How It Works
            </h2>
            <p className="text-slate-400 text-lg sm:text-xl max-w-2xl mx-auto font-light tracking-wide">
              Three simple steps to transform your hiring process.
            </p>
          </BlurFade>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
            {[
              { step: "01", icon: FileText, title: "Post Requirements", desc: "Upload your job description or paste requirements. Our AI parses and structures them automatically." },
              { step: "02", icon: Users, title: "AI Screens Candidates", desc: "Resumes are analyzed across 15+ dimensions with weighted scoring and red-flag detection." },
              { step: "03", icon: Video, title: "Autonomous Interviews", desc: "AI interviewer conducts voice-based interviews with real-time proctoring and analysis." },
            ].map((item, i) => (
              <BlurFade key={i} delay={0.2 * i} inView>
                <div className="relative text-center p-10 rounded-[2.5rem] border border-white/5 bg-[#050505]/60 hover:bg-white/[0.02] transition-colors">
                  <div className="text-7xl font-black text-brand/10 mb-8 font-display tracking-tighter">{item.step}</div>
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-brand to-violet-600 flex items-center justify-center mx-auto mb-8 shadow-2xl shadow-brand/20">
                    <item.icon className="w-8 h-8 text-white" />
                  </div>
                  <h3 className="text-2xl font-bold text-white mb-4 tracking-tight">{item.title}</h3>
                  <p className="text-slate-400 text-base leading-relaxed font-light">{item.desc}</p>
                </div>
              </BlurFade>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section id="testimonials" className="relative z-10 py-32 overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mb-20">
          <BlurFade inView className="text-center">
            <h2 className="text-4xl sm:text-5xl md:text-6xl font-black text-white mb-6 tracking-tighter">
              Trusted by{" "}
              <AnimatedGradientText colorFrom="#60a5fa" colorTo="#a78bfa">
                Industry Leaders
              </AnimatedGradientText>
            </h2>
            <p className="text-slate-400 text-lg sm:text-xl max-w-2xl mx-auto font-light tracking-wide">
              See what hiring professionals are saying about HireNow.
            </p>
          </BlurFade>
        </div>

        <div className="relative">
          <Marquee pauseOnHover className="[--duration:40s]">
            {testimonials.map((t, i) => (
              <div key={i} className="w-[400px] p-8 rounded-[2rem] border border-white/5 bg-slate-900/40 backdrop-blur-xl hover:bg-slate-900/60 transition-colors">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-brand to-violet-600 flex items-center justify-center text-white text-sm font-bold shadow-lg">
                    {t.avatar}
                  </div>
                  <div>
                    <div className="text-base font-bold text-white tracking-tight">{t.name}</div>
                    <div className="text-xs text-slate-400 font-medium uppercase tracking-wider">{t.role}</div>
                  </div>
                </div>
                <p className="text-base text-slate-300 leading-relaxed font-light">"{t.content}"</p>
                <div className="flex gap-1 mt-3">
                  {[...Array(5)].map((_, j) => <Star key={j} className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />)}
                </div>
              </div>
            ))}
          </Marquee>
        </div>
      </section>

      {/* CTA Section */}
      <section className="relative z-10 py-40 border-t border-slate-800/50 overflow-hidden">
        <div className="absolute inset-0 bg-brand/5" />
        <div className="absolute inset-0">
          <Ripple mainCircleSize={400} numCircles={6} className="text-brand/20" />
          <DotPattern glow className="text-brand/10" />
        </div>
        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <BlurFade inView>
            <h2 className="text-5xl sm:text-7xl font-black text-white mb-8 leading-[1.05] tracking-tighter drop-shadow-2xl">
              Ready to Transform<br />Your Hiring Pipeline?
            </h2>
            <p className="text-xl text-slate-300 mb-12 max-w-2xl mx-auto font-light tracking-wide">
              Join 150+ forward-thinking companies that use HireNow to make smarter, autonomous hiring decisions.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-6">
              <RainbowButton onClick={() => navigate('/auth')} className="px-12 py-5 text-xl font-bold rounded-2xl">
                <Zap className="w-6 h-6" />
                Get Started Free
              </RainbowButton>
              <button
                onClick={() => navigate('/auth')}
                className="px-12 py-5 rounded-2xl border-2 border-white/10 text-white font-bold text-xl hover:bg-white/5 hover:border-white/20 transition-all backdrop-blur-sm"
              >
                <Building2 className="w-6 h-6 inline mr-2" />
                Book a Demo
              </button>
            </div>
            <p className="text-xs text-slate-400 mt-10 font-bold uppercase tracking-[0.2em]">No credit card required • Free credits included • Cancel anytime</p>
          </BlurFade>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-slate-800/50 py-8">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md overflow-hidden bg-black flex items-center justify-center">
              <img src="/logo.jpg" alt="Logo" className="w-full h-full object-cover" />
            </div>
            <span className="text-sm font-bold text-white">HireNow</span>
          </div>
          <div className="flex items-center gap-6 text-xs text-white">
            <span>© 2026 HireNow. All rights reserved.</span>
            <span>Privacy Policy</span>
            <span>Terms of Service</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
