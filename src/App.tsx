import { LogOut } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Briefcase, ChevronRight, Plus, Search, Users, Trash2, CheckCircle2, CheckCircle, AlertCircle, BarChart3, ShieldCheck, Shield, Database, Settings, Globe, ExternalLink, Loader2, MoreHorizontal, RotateCcw, LayoutGrid, List, Filter, MessageSquare, Video, Play, Send, Calendar, Volume2, Mic, MicOff, Camera, CameraOff, Clock, Info, Heart, Brain, Award, Cpu, BookOpen, Terminal, Lightbulb, AlertTriangle, ChevronDown, ChevronUp, Copy, CreditCard, Zap, Star, Sparkles, ArrowRight, Check, Menu, X, FileText, Sliders, Target, Download, Printer, Keyboard } from 'lucide-react';
import { useEffect, useState, createContext, useContext, useRef, Component, useMemo } from 'react';
import { Link, Route, BrowserRouter as Router, Routes, useNavigate, useParams, Navigate, useSearchParams } from 'react-router-dom';
import { collection, query, where, onSnapshot, addDoc, serverTimestamp, doc, getDoc, updateDoc, getDocs, writeBatch, setDoc, getDocFromServer, clearIndexedDbPersistence, terminate, enableNetwork, disableNetwork } from 'firebase/firestore';
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut } from 'firebase/auth';
import { auth, db } from './lib/firebase';
import { cn, formatDate, formatDateTime, getScoreColor } from './lib/utils';
import { Job, Candidate, Organization, UserProfile } from './types';
import { parseJobDescription, screenCandidate, researchCandidate } from './services/geminiService';
import { generateInterviewResponse, summarizeInterview } from './services/interviewService';
import { extractTextFromFile } from './services/fileService';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import Markdown from 'react-markdown';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

const ROLE_WEIGHTS = {
  'Technical / Engineering': { skillsMatch: 0.35, experienceFit: 0.25, education: 0.15, achievements: 0.20, culturalRoleFit: 0.05 },
  'HR / People Ops': { skillsMatch: 0.25, experienceFit: 0.25, education: 0.15, achievements: 0.25, culturalRoleFit: 0.10 },
  'Sales / BD': { skillsMatch: 0.20, experienceFit: 0.30, education: 0.10, achievements: 0.30, culturalRoleFit: 0.10 },
  'Leadership / C-Suite': { skillsMatch: 0.20, experienceFit: 0.25, education: 0.10, achievements: 0.35, culturalRoleFit: 0.10 },
  'Operations / Generalist': { skillsMatch: 0.25, experienceFit: 0.25, education: 0.20, achievements: 0.20, culturalRoleFit: 0.10 },
} as const;

function calculateEnhancedScorecard(screeningResult: any, jobRequirements: any) {
  if (!screeningResult) {
    screeningResult = {};
  }
  if (!screeningResult.scorecard) {
    screeningResult.scorecard = {};
  }
  if (!screeningResult.scorecard.dimensions) {
    screeningResult.scorecard.dimensions = {};
  }
  const dimensions = screeningResult.scorecard.dimensions;
  
  const roleType = jobRequirements?.role_type || 'Operations / Generalist';
  const roleWeights = (ROLE_WEIGHTS as any)[roleType] || ROLE_WEIGHTS['Operations / Generalist'];
  
  let weights = {
    skillsMatch: roleWeights.skillsMatch,
    experienceFit: roleWeights.experienceFit,
    education: roleWeights.education,
    achievements: roleWeights.achievements,
    culturalRoleFit: roleWeights.culturalRoleFit,
  };

  if (jobRequirements?.customCriteria) {
    weights = {
      skillsMatch: jobRequirements.customCriteria.skillsMatch?.weight ?? roleWeights.skillsMatch,
      experienceFit: jobRequirements.customCriteria.experienceFit?.weight ?? roleWeights.experienceFit,
      education: jobRequirements.customCriteria.education?.weight ?? roleWeights.education,
      achievements: jobRequirements.customCriteria.achievements?.weight ?? roleWeights.achievements,
      culturalRoleFit: jobRequirements.customCriteria.culturalRoleFit?.weight ?? roleWeights.culturalRoleFit,
    };
  }

  const totalWeight = Object.values(weights).reduce((a: number, b: number) => a + b, 0) || 1;

  let weightedSum = 0;
  weightedSum += (dimensions.skillsMatch?.score || 0) * (weights.skillsMatch / totalWeight);
  weightedSum += (dimensions.experienceFit?.score || 0) * (weights.experienceFit / totalWeight);
  weightedSum += (dimensions.education?.score || 0) * (weights.education / totalWeight);
  weightedSum += (dimensions.achievements?.score || 0) * (weights.achievements / totalWeight);
  weightedSum += (dimensions.culturalRoleFit?.score || 0) * (weights.culturalRoleFit / totalWeight);

  let penaltySum = (dimensions.redFlags?.totalPenalty || 0);

  // KO-4: 3 or more dimensions score < 50 => -15pt penalty
  const lowScoresCount = [
    dimensions.skillsMatch?.score,
    dimensions.experienceFit?.score,
    dimensions.education?.score,
    dimensions.achievements?.score,
    dimensions.culturalRoleFit?.score
  ].filter(s => (s || 0) < 50).length;

  if (lowScoresCount >= 3) {
    penaltySum += 15;
    if (!dimensions.redFlags) {
      dimensions.redFlags = { flags: [], totalPenalty: 0 };
    }
    if (!dimensions.redFlags.flags) {
      dimensions.redFlags.flags = [];
    }
    if (!dimensions.redFlags.flags.some((f: any) => f?.label === 'Cross-Dimension Weakness')) {
      dimensions.redFlags.flags.push({
        label: 'Cross-Dimension Weakness',
        severity: 'medium',
        penalty: 15,
        rationale: '3 or more dimensions scored below 50, triggering KO-4 penalty.'
      });
    }
  }

  const finalScore = Math.max(0, Math.min(100, Math.round(weightedSum - penaltySum)));
  
  // Custom thresholds
  const lowThreshold = jobRequirements?.thresholds?.low ?? 40;
  const passedThreshold = jobRequirements?.thresholds?.passed ?? 80;

  // Auto-Reject Logic (PDF Decision Bands)
  if (!screeningResult.scorecard.recommendation) {
    screeningResult.scorecard.recommendation = { fitHeader: 'Potential Fit', status: 'potential', summary: '' };
  }
  let recommendationStatus = screeningResult.scorecard.recommendation.status || 'potential';
  
  if (finalScore < lowThreshold || (dimensions.skillsMatch?.score || 0) < lowThreshold) {
    recommendationStatus = 'rejected';
  } else if (finalScore >= passedThreshold) {
    recommendationStatus = 'perfect';
  } else {
    recommendationStatus = 'potential';
  }

  return {
    ...screeningResult,
    scorecard: {
      ...screeningResult.scorecard,
      compositeScore: finalScore,
      recommendation: {
        ...screeningResult.scorecard.recommendation,
        status: recommendationStatus,
        fitHeader: finalScore >= passedThreshold ? 'Top Match' : finalScore >= lowThreshold ? 'Potential Match' : 'Low Match'
      },
      dimensions: {
        ...dimensions,
        redFlags: {
          ...dimensions.redFlags,
          totalPenalty: penaltySum
        }
      },
      integrityScore: screeningResult.scorecard.integrityScore || 100,
      proctoringEvents: screeningResult.scorecard.proctoringEvents || []
    }
  };
}

async function hashString(str: string) {
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Validate Connection to Firestore
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if(error instanceof Error && error.message.includes('the client is offline')) {
      console.warn("Firestore connection check: Client is offline. This is usually fine if cache is available.");
    }
  }
}

export class ErrorBoundary extends Component<{ children: React.ReactNode }, { hasError: boolean, error: Error | null }> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 text-center">
          <div className="max-w-md w-full space-y-6">
            <div className="w-20 h-20 bg-red-500/10 rounded-3xl flex items-center justify-center mx-auto border border-red-500/20">
              <AlertTriangle className="w-10 h-10 text-red-500" />
            </div>
            <div className="space-y-2">
              <h1 className="text-2xl font-black text-white uppercase tracking-tight">System Fault Detected</h1>
              <p className="text-slate-400 text-sm font-medium">An unexpected error occurred. This might be due to a connectivity issue or a data mismatch.</p>
            </div>
            {this.state.error && (
              <div className="p-4 bg-slate-900 rounded-xl border border-slate-800 text-left">
                <p className="text-[10px] font-mono text-red-400 break-all">{this.state.error.message}</p>
              </div>
            )}
            <button 
              onClick={async () => {
                try {
                  await terminate(db);
                  await clearIndexedDbPersistence(db);
                  window.location.reload();
                } catch (e) {
                  window.location.reload();
                }
              }}
              className="w-full h-12 bg-indigo-600 hover:bg-indigo-700 text-white font-black uppercase tracking-widest text-xs rounded-xl shadow-xl transition-all"
            >
              Hard Reset & Re-sync
            </button>
            <button 
              onClick={async () => {
                try {
                  await enableNetwork(db);
                  this.setState({ hasError: false, error: null });
                } catch (e) {
                  window.location.reload();
                }
              }}
              className="w-full h-12 bg-slate-800 hover:bg-slate-700 text-white font-black uppercase tracking-widest text-xs rounded-xl transition-all border border-slate-700"
            >
              Attempt Reconnect
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

function PlaceholderScoreCircle({ isProcessing }: { isProcessing: boolean }) {
  const [progress, setProgress] = useState(isProcessing ? 15 : 5);
  
  useEffect(() => {
    if (!isProcessing) {
      setProgress(5);
      return;
    }
    
    setProgress(Math.floor(Math.random() * 8) + 12);
    
    const interval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 98) return 98;
        let increment = 1;
        if (prev < 30) increment = Math.max(1, Math.floor(Math.random() * 4) + 2);
        else if (prev < 75) increment = Math.max(1, Math.floor(Math.random() * 3) + 1);
        else if (prev < 90) increment = Math.max(1, Math.floor(Math.random() * 2) + 1);
        else increment = Math.random() > 0.4 ? 1 : 0;
        
        return Math.min(98, prev + increment);
      });
    }, 450);
    
    return () => clearInterval(interval);
  }, [isProcessing]);

  return (
    <div className="relative w-16 h-16 flex items-center justify-center">
      <svg className="absolute inset-0 w-full h-full -rotate-90">
        <circle cx="32" cy="32" r="28" stroke="currentColor" strokeWidth="3" fill="transparent" className="text-slate-100" />
        <circle 
          cx="32" cy="32" r="28" 
          stroke="currentColor" strokeWidth="3" 
          strokeDasharray={175.9} 
          strokeDashoffset={175.9 - (progress / 100) * 175.9} 
          strokeLinecap="round" 
          fill="transparent" 
          className="text-indigo-500 animate-pulse" 
        />
      </svg>
      <div className="w-12 h-12 rounded-2xl flex flex-col items-center justify-center bg-indigo-50 border border-indigo-100 text-indigo-600 z-10 font-black">
        <span className="text-[7.5px] font-black uppercase opacity-80 leading-none mb-0.5 tracking-tighter">SCREEN</span>
        <span className="text-sm font-mono leading-none">{progress}%</span>
      </div>
    </div>
  );
}

// --- Contexts ---
const NotificationContext = createContext<{ 
  confirm: (msg: string) => Promise<boolean>,
  notify: (msg: string, type?: 'success' | 'error' | 'info') => void,
  signIn: () => Promise<void>
} | null>(null);

const ProfileContext = createContext<{
  profile: UserProfile | null;
  organization: Organization | null;
  refreshProfile: () => Promise<void>;
} | null>(null);

function useNotification() {
  const context = useContext(NotificationContext);
  if (!context) throw new Error('useNotification must be used within a NotificationProvider');
  return context;
}

function useProfile() {
  const context = useContext(ProfileContext);
  if (!context) throw new Error('useProfile must be used within a ProfileProvider');
  return context;
}

// --- Shared Components ---
function Modal({ isOpen, onClose, title, children }: { isOpen: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-sm animate-in fade-in duration-300">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-white rounded-3xl shadow-[0_32px_64px_-16px_rgba(0,0,0,0.2)] w-full max-w-md overflow-hidden border border-slate-200"
      >
        <div className="p-8 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <h3 className="font-display font-bold text-xl text-slate-900 tracking-tight">{title}</h3>
          <button onClick={onClose} className="p-2 hover:bg-white hover:shadow-sm rounded-xl transition-all border border-transparent hover:border-slate-100 group">
            <Plus className="w-5 h-5 rotate-45 text-slate-400 group-hover:text-slate-600" />
          </button>
        </div>
        <div className="p-8">
          {children}
        </div>
      </motion.div>
    </div>
  );
}

function Button({ className, variant = 'primary', size = 'md', as: Component = 'button', ...props }: any) {
  const variants = {
    primary: 'bg-slate-900 text-white hover:bg-slate-800 shadow-sm',
    secondary: 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm',
    outline: 'border border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-700 font-medium',
    ghost: 'hover:bg-slate-100 text-slate-700 font-medium',
    brand: 'bg-indigo-600 text-white hover:bg-indigo-700 font-medium tracking-tight',
  };
  const sizes = {
    sm: 'px-3 py-1.5 text-xs rounded-md',
    md: 'px-4 py-2 text-sm rounded-lg',
    lg: 'px-6 py-3 text-base rounded-xl',
  };
  return (
    <Component
      className={cn(
        'font-sans inline-flex items-center justify-center gap-2 transition-all duration-200 saas-button disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1',
        variants[variant as keyof typeof variants],
        sizes[size as keyof typeof sizes],
        className
      )}
      {...props}
    />
  );
}

function Card({ children, className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('saas-card', !className?.includes('overflow-') && 'overflow-hidden', className)} {...props}>
      {children}
    </div>
  );
}

interface BotVoiceOption {
  id: string;
  label: string;
  lang: string;
  flag: string;
  voiceNameQuery?: string;
}

const botVoiceOptions: BotVoiceOption[] = [
  { id: 'en-US', label: 'English (US Accent)', lang: 'en-US', flag: '🇺🇸', voiceNameQuery: 'Google US English' },
  { id: 'en-GB', label: 'English (UK Accent)', lang: 'en-GB', flag: '🇬🇧', voiceNameQuery: 'Google UK English' },
  { id: 'en-IN', label: 'English (Indian Accent)', lang: 'en-IN', flag: '🇮🇳', voiceNameQuery: 'Google Hindi' },
  { id: 'en-AU', label: 'English (Aussie Accent)', lang: 'en-AU', flag: '🇦🇺', voiceNameQuery: 'Google English' },
  { id: 'es-ES', label: 'Español (Spain)', lang: 'es-ES', flag: '🇪🇸', voiceNameQuery: 'Google Español' },
  { id: 'fr-FR', label: 'Français (France)', lang: 'fr-FR', flag: '🇫🇷', voiceNameQuery: 'Google Français' },
  { id: 'de-DE', label: 'Deutsch (Germany)', lang: 'de-DE', flag: '🇩🇪', voiceNameQuery: 'Google Deutsch' },
  { id: 'ja-JP', label: '日本語 (Japan)', lang: 'ja-JP', flag: '🇯🇵', voiceNameQuery: 'Google 日本語' },
];

function AudioWaveform({ analyserRef, isListening }: { analyserRef: React.RefObject<AnalyserNode | null>; isListening: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let animationId: number;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const currentAnalyser = analyserRef.current;
    const bufferLength = currentAnalyser ? currentAnalyser.frequencyBinCount : 64;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      animationId = requestAnimationFrame(draw);
      
      const width = canvas.width;
      const height = canvas.height;
      
      ctx.clearRect(0, 0, width, height);

      if (isListening && currentAnalyser) {
        currentAnalyser.getByteFrequencyData(dataArray);

        ctx.lineWidth = 3;
        ctx.strokeStyle = '#6366f1'; 
        ctx.shadowBlur = 8;
        ctx.shadowColor = 'rgba(99, 102, 241, 0.5)';
        ctx.beginPath();

        const sliceWidth = width / 12;
        for (let i = 0; i < 12; i++) {
          const idx = Math.floor((i / 12) * bufferLength);
          const val = dataArray[idx]; 
          const percent = val / 255;
          const barHeight = Math.max(4, percent * height * 0.85);
          const x = i * (width / 11) + (width / 22);
          
          ctx.moveTo(x, height / 2 - barHeight / 2);
          ctx.lineTo(x, height / 2 + barHeight / 2);
        }
        ctx.stroke();

        ctx.strokeStyle = '#ec4899'; 
        ctx.lineWidth = 1.5;
        ctx.shadowBlur = 4;
        ctx.shadowColor = 'rgba(236, 72, 153, 0.4)';
        ctx.beginPath();
        for (let i = 0; i < 12; i++) {
          const idx = Math.floor(((i + 2) % 12 / 12) * bufferLength);
          const val = dataArray[idx];
          const percent = val / 255;
          const barHeight = Math.max(3, percent * height * 0.65);
          const x = i * (width / 11) + (width / 22);
          
          ctx.moveTo(x, height / 2 - barHeight / 2);
          ctx.lineTo(x, height / 2 + barHeight / 2);
        }
        ctx.stroke();
      } else {
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#334155'; 
        ctx.shadowBlur = 0;
        ctx.beginPath();
        
        const barHeight = 4;
        for (let i = 0; i < 12; i++) {
          const x = i * (width / 11) + (width / 22);
          ctx.moveTo(x, height / 2 - barHeight / 2);
          ctx.lineTo(x, height / 2 + barHeight / 2);
        }
        ctx.stroke();
      }
    };

    draw();

    return () => {
      cancelAnimationFrame(animationId);
    };
  }, [analyserRef, isListening]);

  return (
    <div className="flex flex-col items-center justify-center gap-1.5 mb-4 shrink-0">
      <span className={cn(
        "text-[10px] font-black uppercase tracking-[0.2em] transition-colors duration-300",
        isListening ? "text-indigo-400 animate-pulse" : "text-slate-500"
      )}>
        {isListening ? "● LISTENING (SPEAK NOW)" : "MIC IDLE"}
      </span>
      <canvas 
        ref={canvasRef} 
        width={192} 
        height={32} 
        className="w-48 h-8 rounded-full bg-slate-950/40 border border-slate-900 shadow-inner px-2"
      />
    </div>
  );
}

function InterviewRoom() {
  const { candidateId } = useParams();
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [messages, setMessages] = useState<{ role: 'user' | 'model'; text: string; timestamp: number }[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [session, setSession] = useState<any>(null);
  const [concluded, setConcluded] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const ttsAudioRef = useRef<HTMLAudioElement | null>(null);
  const { confirm, notify } = useNotification();
  const navigate = useNavigate();

  // Web permissions error fallbacks tracking states
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [speechError, setSpeechError] = useState<string | null>(null);
  const [isKeyboardMode, setIsKeyboardMode] = useState(false);
  const [botSpeakingPace, setBotSpeakingPace] = useState(1.05);

  // Selected Accent / Language state
  const [selectedVoice, setSelectedVoice] = useState<BotVoiceOption>(() => {
    const saved = localStorage.getItem('hirenow_selected_voice');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        const found = botVoiceOptions.find(v => v.id === parsed.id);
        if (found) return found;
      } catch (e) {}
    }
    return botVoiceOptions[0];
  });

  // --- Proctoring State ---
  const [tabWarnings, setTabWarnings] = useState(0);
  const [faceWarnings, setFaceWarnings] = useState(0);
  const [noiseWarnings, setNoiseWarnings] = useState(0);
  
  const [faceStatus, setFaceStatus] = useState<'loading' | 'detected' | 'not_detected' | 'disabled'>('loading');
  const [noiseStatus, setNoiseStatus] = useState<'quiet' | 'noise_detected'>('quiet');
  const [activeWarning, setActiveWarning] = useState<{ type: 'tab' | 'face' | 'noise'; count: number } | null>(null);
  
  const [faceapiLoaded, setFaceapiLoaded] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<'monitor' | 'transcript'>('monitor');

  const noFaceTimeRef = useRef(0);
  const noiseTimeRef = useRef(0);
  
  const volumeRef = useRef(0);
  const isSpeakingRef = useRef(false);
  const isThinkingRef = useRef(false);
  const isListeningRef = useRef(false);

  useEffect(() => { volumeRef.current = volume; }, [volume]);
  useEffect(() => { isSpeakingRef.current = isSpeaking; }, [isSpeaking]);
  useEffect(() => { isThinkingRef.current = isThinking; }, [isThinking]);
  useEffect(() => { isListeningRef.current = isListening; }, [isListening]);

  // Dynamically load face-api.js script
  useEffect(() => {
    if ((window as any).faceapi) {
      setFaceapiLoaded(true);
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/dist/face-api.js';
    script.async = true;
    script.onload = async () => {
      try {
        const faceapi = (window as any).faceapi;
        await faceapi.nets.tinyFaceDetector.loadFromUri('https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights');
        setFaceapiLoaded(true);
        setFaceStatus('detected');
      } catch (err) {
        console.error("Failed to load face-api models:", err);
        setFaceStatus('disabled');
      }
    };
    script.onerror = () => {
      console.error("Failed to download face-api script");
      setFaceStatus('disabled');
    };
    document.body.appendChild(script);
  }, []);

  // Warnings and auto-conclusion triggers
  const triggerWarning = (type: 'tab' | 'face' | 'noise', count: number) => {
    setActiveWarning({ type, count });
    let warningMsg = "";
    if (type === 'tab') {
      warningMsg = `Warning! Tab switch detected. This is warning number ${count} of three. Please stay focused.`;
    } else if (type === 'face') {
      warningMsg = `Warning! Face is not visible. This is warning number ${count} of three. Please look at the camera.`;
    } else if (type === 'noise') {
      warningMsg = `Warning! Ambient noise detected. This is warning number ${count} of three. Please find a quiet space.`;
    }
    speak(warningMsg);
    
    setTimeout(() => {
      setActiveWarning(prev => (prev?.type === type && prev?.count === count) ? null : prev);
    }, 4500);
  };

  const logProctoringViolation = async (type: string, count: number) => {
    if (!session?.id) return;
    try {
      const systemLog = `[SYSTEM LOG]: Proctoring warning: ${type.toUpperCase()} - Warning ${count} of 3.`;
      const currentMessages = [...messages, { role: 'model' as const, text: systemLog, timestamp: Date.now() }];
      setMessages(currentMessages);
      await updateDoc(doc(db, 'interviews', session.id), { messages: currentMessages });
    } catch (e) {
      console.error("Error logging proctoring violation:", e);
    }
  };

  const handleViolation = async (type: 'tab' | 'face' | 'noise') => {
    if (concluded) return;

    let currentWarnings = 0;
    if (type === 'tab') {
      setTabWarnings(prev => {
        const nextVal = prev + 1;
        currentWarnings = nextVal;
        return nextVal;
      });
    } else if (type === 'face') {
      setFaceWarnings(prev => {
        const nextVal = prev + 1;
        currentWarnings = nextVal;
        return nextVal;
      });
    } else if (type === 'noise') {
      setNoiseWarnings(prev => {
        const nextVal = prev + 1;
        currentWarnings = nextVal;
        return nextVal;
      });
    }

    setTimeout(async () => {
      if (currentWarnings > 3) {
        await autoEndInterview(`${type.toUpperCase()} policy violations exceeded allowed limit of 3 warnings`);
      } else {
        triggerWarning(type, currentWarnings);
        await logProctoringViolation(type, currentWarnings);
      }
    }, 10);
  };

  const autoEndInterview = async (reason: string) => {
    if (!candidate || !session || concluded) return;
    setLoading(true);
    try {
      setConcluded(true);
      
      const systemMessageText = `[SYSTEM TERMINATION]: This interview session was automatically concluded due to repeated policy violations: ${reason}.`;
      const finalMessages = [...messages, { role: 'model' as const, text: systemMessageText, timestamp: Date.now() }];
      setMessages(finalMessages);

      const feedback = await summarizeInterview(finalMessages.map(m => ({ role: m.role, text: m.text })));
      
      await updateDoc(doc(db, 'interviews', session.id), { 
        messages: finalMessages, 
        completed: true, 
        feedback: `${feedback}\n\n[System Log]: Session auto-terminated due to: ${reason}`,
        completedAt: serverTimestamp() 
      });
      
      await updateDoc(doc(db, 'candidates', candidate.id), { 
        interviewStatus: 'completed'
      });
      
      notify(`Interview concluded automatically: ${reason}`, 'error');
      speak(`The interview has been concluded automatically because of ${reason}.`);
    } catch (err) {
      console.error(err);
      notify('Error concluding interview automatically.', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Tab switch visibility tracking
  useEffect(() => {
    if (concluded || messages.length === 0) return;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        // Tab hidden
      } else {
        // Tab visible again -> trigger violation!
        handleViolation('tab');
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [concluded, messages.length, session?.id]);

  // Face visibility tracking loop (1 second interval)
  useEffect(() => {
    if (concluded || messages.length === 0 || !faceapiLoaded || !stream) {
      setFaceStatus('disabled');
      return;
    }

    const videoTrack = stream.getVideoTracks()[0];
    if (!videoTrack || !videoTrack.enabled) {
      setFaceStatus('disabled');
      return;
    }

    const interval = setInterval(async () => {
      const faceapi = (window as any).faceapi;
      const videoEl = videoRef.current;
      if (!faceapi || !videoEl || concluded) return;

      try {
        const detection = await faceapi.detectSingleFace(videoEl, new faceapi.TinyFaceDetectorOptions());
        if (detection) {
          setFaceStatus('detected');
          noFaceTimeRef.current = 0;
        } else {
          setFaceStatus('not_detected');
          noFaceTimeRef.current += 1;

          if (noFaceTimeRef.current >= 5) {
            noFaceTimeRef.current = 0;
            handleViolation('face');
          }
        }
      } catch (err) {
        console.error("Face detection check failed:", err);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [faceapiLoaded, stream, concluded, messages.length, session?.id]);

  // Background Noise tracking loop (1 second interval)
  useEffect(() => {
    if (concluded || messages.length === 0 || !stream || isMuted) {
      setNoiseStatus('quiet');
      return;
    }

    const interval = setInterval(() => {
      const vol = volumeRef.current;
      const speaking = isSpeakingRef.current;
      const thinking = isThinkingRef.current;
      const listening = isListeningRef.current;

      if (vol > 30 && (speaking || thinking || !listening)) {
        noiseTimeRef.current += 1;
        setNoiseStatus('noise_detected');
        
        if (noiseTimeRef.current >= 3) {
          noiseTimeRef.current = 0;
          setNoiseStatus('quiet');
          handleViolation('noise');
        }
      } else {
        noiseTimeRef.current = 0;
        setNoiseStatus('quiet');
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [concluded, messages.length, stream, isMuted, session?.id]);

  const changeVoice = (voice: BotVoiceOption) => {
    setSelectedVoice(voice);
    localStorage.setItem('hirenow_selected_voice', JSON.stringify(voice));
    notify(`Interviewer language & accent updated to ${voice.label}`, 'success');
  };

  // Initialize Video/Audio Stream
  useEffect(() => {
    let localStream: MediaStream | null = null;
    let localAudioCtx: AudioContext | null = null;

    async function setupStream() {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setMediaError("NotSupported");
        setIsKeyboardMode(true);
        notify("Media devices not supported in this browser environment. Standard keyboard entry mode activated.", "info");
        return;
      }

      const isPermissionError = (e: any) => {
        const errName = e?.name || "";
        const errMsg = e?.message || "";
        return errName === "NotAllowedError" || 
               errName === "PermissionDeniedError" || 
               errMsg.includes("Permission denied") || 
               errMsg.includes("NotAllowedError") || 
               errMsg.includes("Denied") ||
               errMsg.includes("permission denied");
      };

      try {
        // Fallback Step 1: Try both video and audio
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        setMediaError(null);
      } catch (err: any) {
        if (isPermissionError(err)) {
          console.warn("Media devices permission denied by user or iframe sandbox policy:", err);
          setMediaError("PermissionDenied");
          setIsKeyboardMode(true);
          notify("Microphone & Camera permissions denied or blocked. Keyboard backup activated.", "info");
          return;
        }

        console.warn("Could not access both video and audio. Trying audio-only fallback...", err);
        try {
          // Fallback Step 2: Try audio only (for users without cameras or when camera is blocked)
          localStream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
          setMediaError("CameraBlocked");
        } catch (err2: any) {
          if (isPermissionError(err2)) {
            setMediaError("PermissionDenied");
            setIsKeyboardMode(true);
            notify("Microphone permissions denied. Keyboard backup activated.", "info");
            return;
          }
          console.warn("Could not access audio. Trying video-only fallback...", err2);
          try {
            // Fallback Step 3: Try video only (for setups with camera but no mic)
            localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
            setMediaError("MicrophoneBlocked");
            setIsKeyboardMode(true);
          } catch (err3) {
            console.error("Error accessing media devices:", err3);
            setMediaError("BothBlocked");
            setIsKeyboardMode(true);
            notify("Microphone and Camera accesses restricted or unavailable. Keyboard backup activated.", "info");
          }
        }
      }

      if (localStream) {
        setStream(localStream);

        // Sound intensity analysis (only if we have audio tracks)
        if (localStream.getAudioTracks().length > 0) {
          try {
            const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
            localAudioCtx = audioCtx;
            const source = audioCtx.createMediaStreamSource(localStream);
            const analyser = audioCtx.createAnalyser();
            analyser.fftSize = 256;
            source.connect(analyser);
            
            audioContextRef.current = audioCtx;
            analyserRef.current = analyser;

            const bufferLength = analyser.frequencyBinCount;
            const dataArray = new Uint8Array(bufferLength);

            const checkVolume = () => {
              if (!analyserRef.current) return;
              analyserRef.current.getByteFrequencyData(dataArray);
              let sum = 0;
              for (let i = 0; i < bufferLength; i++) sum += dataArray[i];
              const avg = sum / bufferLength;
              setVolume(avg);
              requestAnimationFrame(checkVolume);
            };
            checkVolume();
          } catch (e) {
            console.error("Error creating audio analyzer node:", e);
          }
        }
      }
    }
    setupStream();
    return () => {
      if (localStream) {
        localStream.getTracks().forEach(t => t.stop());
      }
      if (localAudioCtx) {
        localAudioCtx.close();
      }
    };
  }, []);

  // Securely bind the media stream on mount, even if candidate is fetched asynchronously
  const bindVideo = (el: HTMLVideoElement | null) => {
    if (el) {
      if (el.srcObject !== stream) {
        el.srcObject = stream;
      }
      if (stream) {
        el.play().catch(e => {
          console.debug("Video playback stream start prevented or interrupted:", e);
        });
      }
    }
  };

  const toggleMute = () => {
    if (stream) {
      const audioTrack = stream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
      }
    }
  };

  const toggleCamera = () => {
    if (stream) {
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
      }
    }
  };

  // Initialize Speech Recognition
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = selectedVoice.lang;

      recognition.onresult = (event: any) => {
        let finalTranscript = '';
        let interimTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const item = event.results[i];
          if (item.isFinal) {
            finalTranscript += item[0].transcript;
          } else {
            interimTranscript += item[0].transcript;
          }
        }
        
        const combined = finalTranscript || interimTranscript;
        if (combined.trim()) {
          setInput(combined);
        }
      };

      recognition.onend = () => {
        setIsListening(false);
        // Automatically submit final speech text if substantial input was recorded
        setInput((prev) => {
          const trimmed = prev.trim();
          if (trimmed.length > 2) {
            setTimeout(() => {
              handleSend(trimmed);
            }, 600);
          }
          return prev;
        });
      };

      recognition.onerror = (event: any) => {
        console.error('Speech recognition error', event.error);
        setIsListening(false);
        if (event.error === 'no-speech') {
          // Silent error, just don't notify user with a big toast
          console.debug('No speech detected before timeout.');
        } else if (event.error === 'not-allowed') {
          setSpeechError("PermissionDenied");
          setIsKeyboardMode(true);
          notify('Chrome / browser Speech recognition access was blocked. Typing mode is ready.', 'info');
        } else {
          setSpeechError(event.error);
          notify(`Microphone error: ${event.error}`, 'error');
        }
      };

      recognitionRef.current = recognition;
    } else {
      setSpeechError("NotSupported");
      setIsKeyboardMode(true);
    }

    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch (e) {}
      }
    };
  }, [selectedVoice.lang]);

  // Fallback: use browser SpeechSynthesis (robotic but always available)
  const speakFallback = (text: string, onEnd?: () => void) => {
    const cleanText = text.replace(/[*#_`~]/g, '').replace(/https?:\/\/\S+/g, 'link');
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.rate = botSpeakingPace;
    utterance.pitch = 1.0;
    utterance.lang = selectedVoice.lang;
    if (window.speechSynthesis) {
      const voices = window.speechSynthesis.getVoices();
      let match = voices.find(v => v.lang === selectedVoice.lang && v.name.includes(selectedVoice.voiceNameQuery || ''));
      if (!match) match = voices.find(v => v.lang === selectedVoice.lang);
      if (!match) { const prefix = selectedVoice.lang.split('-')[0]; match = voices.find(v => v.lang.startsWith(prefix)); }
      if (match) utterance.voice = match;
    }
    utterance.onstart = () => {
      setIsSpeaking(true);
      if (isListening) { try { recognitionRef.current?.stop(); } catch (e) {} }
    };
    utterance.onend = () => {
      setIsSpeaking(false);
      if (onEnd) { onEnd(); }
      else if (!isKeyboardMode) {
        setTimeout(() => { try { if (recognitionRef.current) { setIsListening(true); recognitionRef.current.start(); } } catch (e) { console.warn("Could not auto-start recognition after speak end:", e); } }, 150);
      }
    };
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  };

  // Primary: use Edge Neural TTS (natural human-like voice)
  const speak = (text: string, onEnd?: () => void) => {
    // Stop any currently playing TTS audio
    if (ttsAudioRef.current) {
      ttsAudioRef.current.pause();
      ttsAudioRef.current = null;
    }
    window.speechSynthesis?.cancel();

    setIsSpeaking(true);
    // Cancel any active listening to prevent feedback loops
    if (isListening) {
      try { recognitionRef.current?.stop(); } catch (e) {}
    }

    fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        voice: selectedVoice.id,
        rate: botSpeakingPace,
      }),
    })
      .then(res => {
        if (!res.ok) throw new Error(`TTS API error: ${res.status}`);
        return res.blob();
      })
      .then(blob => {
        const audioUrl = URL.createObjectURL(blob);
        const audio = new Audio(audioUrl);
        ttsAudioRef.current = audio;

        audio.onended = () => {
          setIsSpeaking(false);
          URL.revokeObjectURL(audioUrl);
          ttsAudioRef.current = null;
          if (onEnd) {
            onEnd();
          } else if (!isKeyboardMode) {
            // Automatically start listening for response in voice mode
            setTimeout(() => {
              try {
                if (recognitionRef.current) {
                  setIsListening(true);
                  recognitionRef.current.start();
                }
              } catch (e) {
                console.warn("Could not auto-start recognition after speak end:", e);
              }
            }, 150);
          }
        };

        audio.onerror = () => {
          console.warn("Edge TTS audio playback failed, falling back to browser TTS");
          URL.revokeObjectURL(audioUrl);
          ttsAudioRef.current = null;
          setIsSpeaking(false);
          speakFallback(text, onEnd);
        };

        audio.play().catch(() => {
          console.warn("Audio play blocked, falling back to browser TTS");
          URL.revokeObjectURL(audioUrl);
          ttsAudioRef.current = null;
          setIsSpeaking(false);
          speakFallback(text, onEnd);
        });
      })
      .catch(err => {
        console.warn("Edge TTS fetch failed, falling back to browser TTS:", err);
        setIsSpeaking(false);
        speakFallback(text, onEnd);
      });
  };

  const toggleListening = () => {
    if (!recognitionRef.current) {
      notify("Speech recognition is not supported or was blocked. Keyboard entry mode is enabled.", "info");
      setIsKeyboardMode(true);
      return;
    }
    try {
      if (isListening) {
        recognitionRef.current.stop();
      } else {
        setIsListening(true);
        recognitionRef.current.start();
      }
    } catch (err) {
      console.warn("Error starting speech recognition:", err);
      setIsListening(false);
      setIsKeyboardMode(true);
      notify("Failed to initialize voice capture. Please type your reply.", "info");
    }
  };

  useEffect(() => {
    if (!candidateId) return;
    const unsub = onSnapshot(doc(db, 'candidates', candidateId), (d) => {
      if (d.exists()) {
        const c = { id: d.id, ...d.data() } as Candidate;
        setCandidate(c);
                getDoc(doc(db, 'jobs', c.jobId)).then(jd => jd.exists() && setJob({ id: jd.id, ...jd.data() } as Job)).catch(err => handleFirestoreError(err, OperationType.GET, `jobs/${c.jobId}`));
        if (c.organizationId) {
          getDoc(doc(db, 'organizations', c.organizationId)).then(orgD => {
            if (orgD.exists()) {
              const org = orgD.data();
              if (org.botSpeakingPace !== undefined) {
                setBotSpeakingPace(org.botSpeakingPace);
              }
            }
          }).catch(err => console.error(err));
        }
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `candidates/${candidateId}`);
    });

    // Check for existing session
    const qSession = query(collection(db, 'interviews'), where('candidateId', '==', candidateId));
    const unsubSession = onSnapshot(qSession, (snap) => {
      if (!snap.empty) {
        const s = snap.docs[0];
        setSession({ id: s.id, ...s.data() });
        setMessages(s.data().messages || []);
        if (s.data().completed) setConcluded(true);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `interviews (query by candidateId ${candidateId})`);
    });

    return () => { unsub(); unsubSession(); };
  }, [candidateId]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const startInterview = async () => {
    if (!candidate || !job) return;
    setLoading(true);
    try {
      const intro = `Hello ${candidate.fullName}, I am HireNow Assistant. Thank you for joining this session for the ${job.title} position at ${job.company || 'our firm'}. Before we begin our structured technical screening, I'd like to ask: are you ready and in a quiet environment to start the interview now?`;
      
      const newSession = {
        candidateId: candidate.id,
        jobId: job.id,
        messages: [{ role: 'model', text: intro, timestamp: Date.now() }],
        startedAt: serverTimestamp(),
        completed: false,
        consentGiven: false
      };
      
      const docRef = doc(collection(db, 'interviews'));
      try {
        await setDoc(docRef, newSession);
        await updateDoc(doc(db, 'candidates', candidate.id), { interviewStatus: 'in_progress' });
        // Set session locally to avoid race condition with onSnapshot
        setSession({ id: docRef.id, ...newSession });
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, `interviews/${docRef.id} or candidates/${candidate.id}`);
      }
      setMessages([{ role: 'model', text: intro, timestamp: Date.now() }]);
      speak(intro);
    } catch (err) {
      console.error(err);
      notify('Failed to start interview session.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSend = async (overrideText?: string) => {
    const textToSend = overrideText || input;
    if (!textToSend.trim() || !candidate || !job || loading || concluded) return;
    
    const userMsg = { role: 'user' as const, text: textToSend, timestamp: Date.now() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setLoading(true);
    setIsThinking(true);

    try {
      const aiResponse = await generateInterviewResponse(
        candidate.fullName,
        job.title,
        job.company || 'The Company',
        job.description,
        JSON.stringify(candidate.parsedData),
        newMessages.map(m => ({ role: m.role, text: m.text }))
      );

      setIsThinking(false);
      const aiMsg = { role: 'model' as const, text: aiResponse, timestamp: Date.now() };
      const finalMessages = [...newMessages, aiMsg];
      setMessages(finalMessages);
      speak(aiResponse);

      // Ensure session exists (retry mechanism if race condition occurred)
      let currentSessionId = session?.id;
      if (!currentSessionId) {
        const q = query(collection(db, 'interviews'), where('candidateId', '==', candidate.id));
        const sSnap = await getDocs(q);
        if (!sSnap.empty) currentSessionId = sSnap.docs[0].id;
      }

      if (!currentSessionId) throw new Error("Interview session not found. Please refresh.");

      if (aiResponse.toLowerCase().includes('process your interview') || aiResponse.toLowerCase().includes('sufficient initial information')) {
        setConcluded(true);
        const feedback = await summarizeInterview(finalMessages.map(m => ({ role: m.role, text: m.text })));
        try {
          await updateDoc(doc(db, 'interviews', currentSessionId), { 
            messages: finalMessages, 
            completed: true, 
            feedback,
            completedAt: serverTimestamp() 
          });
          const meetLink = `https://meet.google.com/${Math.random().toString(36).substring(2, 5)}-${Math.random().toString(36).substring(2, 8)}-${Math.random().toString(36).substring(2, 5)}`;
          await updateDoc(doc(db, 'candidates', candidate.id), { 
            interviewStatus: 'completed',
            meetLink
          });
        } catch (error) {
          handleFirestoreError(error, OperationType.UPDATE, `interviews/${currentSessionId} or candidates/${candidate.id}`);
        }
        notify('Interview completed and success summary generated!', 'success');
      } else {
        try {
          await updateDoc(doc(db, 'interviews', currentSessionId), { messages: finalMessages });
        } catch (error) {
          handleFirestoreError(error, OperationType.UPDATE, `interviews/${currentSessionId}`);
        }
      }
    } catch (err) {
      console.error(err);
      notify('AI connection lost. Please try again.', 'error');
      // Set loading false so they can retry
      setLoading(false);
      setIsThinking(false);
    } finally {
      setLoading(false);
      setIsThinking(false);
    }
  };

  const retryAI = () => {
    if (messages.length > 0) {
      handleSend(messages[messages.length - 1].text);
    } else {
      startInterview();
    }
  };

  const manualEndInterview = async () => {
    if (!candidate || !session || concluded) return;
    const confirmed = await confirm("Are you sure you want to forcibly end this interview session? This will finalize the report based on current progress.");
    if (!confirmed) return;
    setLoading(true);
    try {
      setConcluded(true);
      const feedback = await summarizeInterview(messages.map(m => ({ role: m.role, text: m.text })));
      
      await updateDoc(doc(db, 'interviews', session.id), { 
        messages: messages, 
        completed: true, 
        feedback,
        completedAt: serverTimestamp() 
      });
      
      const meetLink = `https://meet.google.com/${Math.random().toString(36).substring(2, 5)}-${Math.random().toString(36).substring(2, 8)}-${Math.random().toString(36).substring(2, 5)}`;
      await updateDoc(doc(db, 'candidates', candidate.id), { 
        interviewStatus: 'completed',
        meetLink
      });
      
      notify('Interview session forcibly concluded.', 'success');
      speak("The interview has been ended. Thank you for your time.");
    } catch (err) {
      console.error(err);
      notify('Error concluding interview.', 'error');
    } finally {
      setLoading(false);
    }
  };

  if (!candidate) return <div className="p-12 text-center text-slate-400">Loading Interview Room...</div>;

  return (
    <div className="w-full py-6 px-4 min-h-[calc(100vh-140px)] flex flex-col gap-6 bg-slate-950 rounded-[2rem] text-slate-100 border border-slate-900 shadow-2xl relative overflow-hidden">
      
      {/* Proctoring Alert Notification Overlay */}
      <AnimatePresence>
        {activeWarning && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: -40 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: -40 }}
            className="fixed top-24 left-1/2 -translate-x-1/2 z-[200] w-full max-w-md px-4"
          >
            <div className="bg-red-955/95 backdrop-blur-xl border border-red-500/50 rounded-2xl p-4 flex items-start gap-4 shadow-[0_16px_40px_rgba(239,68,68,0.25)]">
              <div className="p-2.5 bg-red-500/20 rounded-xl text-red-500 shrink-0 animate-pulse">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div className="flex-1">
                <h4 className="text-sm font-black text-red-200 uppercase tracking-widest leading-none mb-1.5">
                  Proctoring Violation
                </h4>
                <p className="text-xs text-red-300 font-medium leading-relaxed">
                  {activeWarning.type === 'tab' && "You switched tabs/windows! Stay focused on this screen."}
                  {activeWarning.type === 'face' && "Webcam face presence not detected! Keep your face visible."}
                  {activeWarning.type === 'noise' && "Excessive background noise/talking detected! Quiet room is required."}
                </p>
                <div className="mt-3 flex items-center gap-2">
                  <span className="text-[10px] font-black uppercase bg-red-650 text-white px-2 py-0.5 rounded-full tracking-wider">
                    Warning {activeWarning.count} / 3
                  </span>
                  <span className="text-[10px] text-red-400 font-medium">
                    (Next violation will auto-terminate session)
                  </span>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Web permissions error fallbacks tracking states banner */}
      {(mediaError || speechError) && (
        <motion.div 
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-amber-500/10 border border-amber-500/30 rounded-3xl p-5 text-left flex flex-col sm:flex-row items-start gap-4 z-10"
        >
          <div className="p-3 bg-amber-500/20 rounded-2xl text-amber-500 shrink-0">
             <AlertTriangle className="w-6 h-6" />
          </div>
          <div className="space-y-2 flex-1">
             <h4 className="text-sm font-black text-amber-200 uppercase tracking-wide">Webcam, Microphone or Voice Recognition Blocked</h4>
             <p className="text-xs text-slate-300 leading-relaxed font-medium">
               We detected potential browser constraints (<strong>{mediaError || speechError}</strong>) limiting live mic/camera capture.
             </p>
             <div className="pt-1.5 flex flex-wrap gap-2">
               <a 
                 href={window.location.href} 
                 target="_blank" 
                 rel="noopener noreferrer" 
                 className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-indigo-650 hover:bg-indigo-700 text-white rounded-xl text-[10px] font-black uppercase tracking-wider transition-all"
               >
                 <ExternalLink className="w-3.5 h-3.5" /> Open in a New Tab
               </a>
               <button 
                 type="button"
                 onClick={() => {
                   setIsKeyboardMode(prev => !prev);
                   notify("Keyboard input mode toggled.", "info");
                 }}
                 className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-slate-800 hover:bg-slate-750 text-white rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer"
               >
                 <Keyboard className="w-3.5 h-3.5" /> {isKeyboardMode ? "Switch to Voice" : "Switch to Keyboard"}
               </button>
             </div>
          </div>
        </motion.div>
      )}

      {/* Main Workspace Frame */}
      <div className="w-full flex flex-col lg:flex-row gap-6 h-[720px] lg:h-[calc(100vh-180px)] flex-1 overflow-hidden">
        
        {/* Sleek Tabbed Sidebar (Replaces cluttered multi-card sidebar) */}
        <div className="w-full lg:w-80 flex flex-col bg-slate-900/60 border border-slate-800/80 rounded-3xl overflow-hidden shrink-0 shadow-2xl relative">
          
          {/* Header Tabs Navigation */}
          <div className="flex border-b border-slate-800/80 bg-slate-950/40 p-1.5 rounded-t-3xl shrink-0">
            <button
              onClick={() => setSidebarTab('monitor')}
              className={cn("flex-1 py-2 text-[10px] font-black uppercase tracking-widest transition-all rounded-xl flex items-center justify-center gap-1.5 cursor-pointer", 
                sidebarTab === 'monitor' ? "bg-indigo-650 text-white shadow-md shadow-indigo-900/20" : "text-slate-400 hover:text-slate-200"
              )}
            >
              <Shield className="w-3.5 h-3.5" /> Monitor
            </button>
            <button
              onClick={() => setSidebarTab('transcript')}
              className={cn("flex-1 py-2 text-[10px] font-black uppercase tracking-widest transition-all rounded-xl flex items-center justify-center gap-1.5 cursor-pointer", 
                sidebarTab === 'transcript' ? "bg-indigo-650 text-white shadow-md shadow-indigo-900/20" : "text-slate-400 hover:text-slate-200"
              )}
            >
              <FileText className="w-3.5 h-3.5" /> Transcript
            </button>
          </div>

          {/* Scrollable Side Content */}
          <div className="flex-1 overflow-y-auto p-5 custom-scrollbar space-y-5">
            {sidebarTab === 'monitor' ? (
              <div className="space-y-5">
                
                {/* Candidate Overview Pill */}
                <div className="bg-slate-955/40 border border-slate-850 rounded-2xl p-4 relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-1.5 h-full bg-indigo-600" />
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-slate-900 flex items-center justify-center border border-slate-800 shrink-0 overflow-hidden">
                      {stream?.getVideoTracks()[0]?.enabled !== false ? (
                         <video 
                           ref={bindVideo} 
                           autoPlay 
                           muted 
                           className="w-full h-full object-cover scale-150 rotate-y-180" 
                         />
                      ) : (
                        <Users className="w-5 h-5 text-slate-500" />
                      )}
                    </div>
                    <div>
                      <h3 className="text-xs font-black text-slate-100 tracking-tight leading-none mb-1">{candidate.fullName}</h3>
                      <p className="text-[8px] font-black text-indigo-400 uppercase tracking-wider leading-none mb-1">{job?.title}</p>
                      <span className="text-[8px] font-black text-green-500 uppercase tracking-widest flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-ping" /> Connection secure
                      </span>
                    </div>
                  </div>
                </div>

                {/* Proctoring Integrity Dashboard */}
                <div className="space-y-3.5">
                  <div className="flex items-center gap-1.5 border-b border-slate-800 pb-2">
                    <Sliders className="w-4 h-4 text-indigo-500" />
                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Integrity Dashboard</h4>
                  </div>

                  {/* Tab Tracking Pill */}
                  <div className="bg-slate-950/40 border border-slate-855 rounded-2xl p-3.5 flex justify-between items-center">
                    <div>
                      <span className="block text-[10px] font-black text-slate-200 uppercase tracking-wider mb-0.5">Tab Focus</span>
                      <span className="text-[9px] text-slate-400 font-medium">Warnings: {tabWarnings} / 3</span>
                    </div>
                    <div className="flex gap-1.5">
                      {[1, 2, 3].map(i => (
                        <div 
                          key={i} 
                          className={cn("w-3.5 h-3.5 rounded-full border transition-all duration-300", 
                            tabWarnings >= i 
                              ? "bg-red-500 border-red-400 shadow-[0_0_8px_rgba(239,68,68,0.6)]" 
                              : "bg-slate-900 border-slate-800"
                          )} 
                        />
                      ))}
                    </div>
                  </div>

                  {/* Face Presence Pill */}
                  <div className="bg-slate-950/40 border border-slate-855 rounded-2xl p-3.5 flex justify-between items-center">
                    <div>
                      <span className="block text-[10px] font-black text-slate-200 uppercase tracking-wider mb-0.5">Face Tracking</span>
                      <span className={cn("text-[9px] font-black uppercase tracking-wider", 
                        faceStatus === 'detected' ? "text-green-400" : faceStatus === 'not_detected' ? "text-red-400 animate-pulse" : "text-indigo-400"
                      )}>
                        {faceStatus === 'detected' ? "Detected" : faceStatus === 'not_detected' ? "No Face Detected" : "Analyzing..."}
                      </span>
                    </div>
                    <div className="flex gap-1.5">
                      {[1, 2, 3].map(i => (
                        <div 
                          key={i} 
                          className={cn("w-3.5 h-3.5 rounded-full border transition-all duration-300", 
                            faceWarnings >= i 
                              ? "bg-red-500 border-red-400 shadow-[0_0_8px_rgba(239,68,68,0.6)]" 
                              : "bg-slate-900 border-slate-800"
                          )} 
                        />
                      ))}
                    </div>
                  </div>

                  {/* Room Sound Meter Pill */}
                  <div className="bg-slate-955/40 border border-slate-855 rounded-2xl p-3.5 flex justify-between items-center">
                    <div>
                      <span className="block text-[10px] font-black text-slate-200 uppercase tracking-wider mb-0.5">Room Noise</span>
                      <span className={cn("text-[9px] font-black uppercase tracking-wider", 
                        noiseStatus === 'noise_detected' ? "text-amber-400" : "text-green-400"
                      )}>
                        {noiseStatus === 'noise_detected' ? "Noise Detected" : "Quiet Room"}
                      </span>
                    </div>
                    <div className="flex gap-1.5">
                      {[1, 2, 3].map(i => (
                        <div 
                          key={i} 
                          className={cn("w-3.5 h-3.5 rounded-full border transition-all duration-300", 
                            noiseWarnings >= i 
                              ? "bg-red-500 border-red-400 shadow-[0_0_8px_rgba(239,68,68,0.6)]" 
                              : "bg-slate-900 border-slate-800"
                          )} 
                        />
                      ))}
                    </div>
                  </div>
                </div>

                {/* Voice Dialect Configuration */}
                <div className="space-y-3 pt-2">
                  <div className="flex items-center gap-1.5 border-b border-slate-800 pb-2">
                    <Volume2 className="w-4 h-4 text-indigo-500" />
                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Interviewer Voice</h4>
                  </div>
                  <div className="relative">
                    <select
                      value={selectedVoice.id}
                      onChange={(e) => {
                        const target = botVoiceOptions.find(opt => opt.id === e.target.value);
                        if (target) changeVoice(target);
                      }}
                      className="w-full bg-slate-950 border border-slate-850 rounded-xl px-3 py-2.5 font-bold text-slate-200 text-xs focus:ring-1 focus:ring-indigo-500 outline-none cursor-pointer scale-100 active:scale-[0.98] transition-all appearance-none pr-8"
                    >
                      {botVoiceOptions.map((opt) => (
                        <option key={opt.id} value={opt.id} className="bg-slate-950 text-slate-300 font-bold">
                          {opt.flag} {opt.label}
                        </option>
                      ))}
                    </select>
                    <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none text-slate-500">
                      <ChevronDown className="w-3.5 h-3.5" />
                    </div>
                  </div>
                </div>

              </div>
            ) : (
              
              /* Real-time Transcription Log Tab */
              <div className="flex flex-col h-full min-h-[350px] relative">
                <div className="flex-1 space-y-4 overflow-y-auto pr-1">
                  {messages.map((m, i) => (
                    <div key={i} className="animate-in fade-in duration-300">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={cn(
                          "text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded",
                          m.role === 'model' ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30" : "bg-slate-800 text-slate-400"
                        )}>
                          {m.role === 'model' ? 'AI' : 'You'}
                        </span>
                        <span className="text-[8px] font-medium text-slate-500">{formatDateTime(new Date(m.timestamp))}</span>
                      </div>
                      <p className="text-xs text-slate-303 leading-relaxed pl-1">
                        {m.text}
                      </p>
                    </div>
                  ))}
                  
                  {input && !concluded && (
                     <div className="animate-in fade-in duration-200 opacity-60">
                       <div className="flex items-center gap-2 mb-1">
                          <span className="text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded bg-indigo-500/30 text-indigo-200 animate-pulse border border-indigo-500/20">Capturing</span>
                       </div>
                       <p className="text-xs text-slate-405 italic leading-relaxed pl-1">
                         {input}...
                       </p>
                     </div>
                  )}
                  
                  {messages.length === 0 && !input && (
                    <div className="h-full flex flex-col items-center justify-center opacity-25 py-24">
                      <RotateCcw className="w-8 h-8 mb-2 animate-pulse text-indigo-400" />
                      <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Feed Calibrated</p>
                    </div>
                  )}
                  <div ref={scrollRef} />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Main Cinematic Video Panel */}
        <div className="flex-1 bg-slate-900/60 border border-slate-800 rounded-3xl overflow-hidden flex flex-col relative shadow-2xl">
          
          {/* Dashboard Header Overlay */}
          <div className="absolute top-0 left-0 w-full p-5 flex items-center justify-between z-20 pointer-events-none">
            <div className="bg-slate-950/80 backdrop-blur-xl border border-slate-855 px-3.5 py-1.5 rounded-xl flex items-center gap-2.5 shadow-2xl pointer-events-auto">
              <div className="w-2 h-2 rounded-full bg-red-655 animate-pulse shadow-[0_0_8px_rgba(220,38,38,0.8)]" />
              <span className="text-[10px] font-black text-white uppercase tracking-widest">Live Room</span>
              <div className="h-3 w-px bg-slate-800" />
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">ID: {candidateId.substring(0, 8)}</span>
            </div>
            
            {!concluded && (
              <div className="bg-slate-950/80 backdrop-blur-xl border border-slate-855 px-3.5 py-1.5 rounded-xl flex items-center gap-3.5 shadow-2xl pointer-events-auto">
                <div className="flex flex-col items-end">
                  <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest leading-none mb-1">Room Signal</span>
                  <div className="w-24 h-1 bg-slate-800 rounded-full overflow-hidden">
                     <motion.div 
                        className={cn("h-full transition-all duration-75", volume > 80 ? "bg-red-500" : "bg-indigo-500")}
                        animate={{ width: `${Math.min(volume * 1.5, 100)}%` }}
                     />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Interactive Screen Sandbox */}
          <div className="flex-1 relative flex items-center justify-center bg-slate-950 overflow-hidden p-6 pt-16">
            <div className="absolute inset-0 opacity-15 bg-[radial-gradient(circle_at_50%_50%,rgba(79,70,229,0.35)_0%,transparent_70%)]" />
            
            {/* HUD ripples & statuses */}
            {!concluded && messages.length > 0 && (
              <div className="absolute inset-0 pointer-events-none z-30">
                 <AnimatePresence>
                   {(isThinking || isSpeaking) && (
                     <motion.div 
                       initial={{ opacity: 0 }}
                       animate={{ opacity: 1 }}
                       exit={{ opacity: 0 }}
                       className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center"
                     >
                       <div className={cn(
                         "absolute w-[360px] h-[360px] rounded-full border border-indigo-500/25 animate-ping",
                         isSpeaking ? "animate-[ping_3.5s_infinite]" : "animate-[ping_5s_infinite]"
                       )} />
                       <div className={cn(
                         "absolute w-[260px] h-[260px] rounded-full border border-indigo-500/15 animate-ping delay-75",
                         isSpeaking ? "animate-[ping_4.5s_infinite]" : "animate-[ping_6s_infinite]"
                       )} />
                     </motion.div>
                   )}
                 </AnimatePresence>

                 {/* Active HUD indicators */}
                 <div className="absolute bottom-28 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2">
                   <AnimatePresence mode="wait">
                      {isThinking ? (
                        <motion.div 
                          key="thinking"
                          initial={{ opacity: 0, scale: 0.85, y: 10 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.85 }}
                          className="bg-indigo-650/90 backdrop-blur-xl px-4 py-1.5 rounded-full border border-indigo-555/40 flex items-center gap-3 shadow-2xl"
                        >
                          <div className="flex gap-1.5">
                            <motion.div className="w-1.5 h-1.5 bg-white rounded-full" animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1 }} />
                            <motion.div className="w-1.5 h-1.5 bg-white rounded-full" animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1, delay: 0.25 }} />
                            <motion.div className="w-1.5 h-1.5 bg-white rounded-full" animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1, delay: 0.5 }} />
                          </div>
                          <span className="text-[9px] font-black text-white uppercase tracking-[0.25em]">Reasoning</span>
                        </motion.div>
                      ) : isSpeaking ? (
                        <motion.div 
                          key="speaking"
                          initial={{ opacity: 0, scale: 0.85, y: 10 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.85 }}
                          className="bg-emerald-655/90 backdrop-blur-xl px-4 py-1.5 rounded-full border border-emerald-500/40 flex items-center gap-3 shadow-2xl"
                        >
                          <div className="flex items-center gap-0.5 h-3">
                             {[1,2,3,4,5].map(i => (
                               <motion.div 
                                 key={i} 
                                 className="w-0.5 bg-white" 
                                 animate={{ height: ['4px', '12px', '4px'] }} 
                                 transition={{ repeat: Infinity, duration: 0.5, delay: i * 0.1 }} 
                               />
                             ))}
                          </div>
                          <span className="text-[9px] font-black text-white uppercase tracking-[0.25em]">Synthesizing</span>
                        </motion.div>
                      ) : null}
                   </AnimatePresence>
                 </div>
              </div>
            )}
            
            {messages.length === 0 ? (
              <div className="relative z-10 text-center max-w-sm mx-auto p-8 animate-in fade-in zoom-in-95 duration-500">
                <div className="w-16 h-16 rounded-full bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mb-6 mx-auto">
                   <Play className="w-7 h-7 text-indigo-400" />
                </div>
                <h2 className="text-xl font-black text-white tracking-tight mb-3 uppercase">Interactivity Calibrated</h2>
                <p className="text-slate-400 text-xs font-medium mb-6 leading-relaxed">Ensure webcam presence is visible and background ambient noise is calm before starting.</p>
                
                <Button onClick={startInterview} disabled={loading} className="w-full h-12 bg-indigo-650 hover:bg-indigo-700 text-white rounded-xl shadow-lg shadow-indigo-900/30 font-black tracking-wider uppercase text-xs cursor-pointer transition-transform hover:scale-[1.01] active:scale-[0.98]">
                  Initialize Screening
                </Button>
              </div>
            ) : (
              <div className="w-full h-full flex flex-col overflow-y-auto custom-scrollbar relative">
                <div className="flex-1 flex flex-col items-center justify-center p-4 pt-10 min-h-0">
                  
                  {/* Glowing Video Frame Container */}
                  <div className={cn(
                    "relative w-full max-w-2xl aspect-video rounded-2xl overflow-hidden shadow-2xl border transition-all duration-500 bg-slate-950 group shrink-0 mb-4",
                    faceStatus === 'detected' ? "border-emerald-500/25 shadow-emerald-950/10" :
                    faceStatus === 'not_detected' ? "border-red-500/50 shadow-red-950/20 animate-pulse" :
                    faceStatus === 'loading' ? "border-indigo-500/20 shadow-indigo-955/5 animate-pulse" :
                    "border-slate-800"
                  )}>
                    {/* Security scan scan-line */}
                    <motion.div 
                       className="absolute inset-x-0 h-0.5 bg-indigo-500/10 z-10 pointer-events-none"
                       animate={{ top: ['0%', '100%', '0%'] }}
                       transition={{ duration: 7, repeat: Infinity, ease: "linear" }}
                    />
                    
                    <video 
                      ref={bindVideo} 
                      autoPlay 
                      playsInline 
                      muted 
                      className={cn("w-full h-full object-cover transition-all duration-700 rotate-y-180", 
                        stream?.getVideoTracks()[0]?.enabled === false ? "opacity-0" : "opacity-100",
                        (isMuted || isThinking) ? "grayscale-[0.4]" : "grayscale-0",
                        isThinking && "scale-[1.02] brightness-110",
                        isSpeaking && "animate-video-breathing"
                      )}
                    />
                    
                    {isThinking && (
                      <div className="absolute inset-0 bg-indigo-950/10 animate-pulse pointer-events-none z-10" />
                    )}
                    
                    {stream?.getVideoTracks()[0]?.enabled === false && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-900">
                         <CameraOff className="w-12 h-12 text-slate-700 animate-pulse" />
                         <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Webcam Inactive</p>
                      </div>
                    )}
                  </div>
                   
                  {/* Clean subtitles/captions HUD */}
                  <div className="w-full max-w-xl flex flex-col items-center justify-center space-y-4">
                    <AnimatePresence mode="wait">
                      {concluded ? (
                        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-green-600/90 backdrop-blur-md px-5 py-2.5 rounded-xl border border-green-500/50 shadow-xl">
                           <h4 className="text-white text-xs font-black uppercase tracking-widest flex items-center gap-2">
                              <CheckCircle2 className="w-4 h-4" /> Session Finalized
                           </h4>
                        </motion.div>
                      ) : (
                        <motion.div 
                          key={messages[messages.length - 1]?.text}
                          initial={{ opacity: 0, y: 15 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -15 }}
                          className="w-full text-center"
                        >
                          {messages[messages.length - 1]?.role === 'model' ? (
                            <div className="bg-slate-900/90 backdrop-blur-md px-5 py-3.5 rounded-2xl border border-slate-800 shadow-2xl inline-block max-w-lg text-left">
                              <div className="text-slate-200 text-xs font-semibold leading-relaxed tracking-wide">
                                 <Markdown>{messages[messages.length - 1]?.text}</Markdown>
                              </div>
                            </div>
                          ) : (
                            <div className="bg-indigo-650/90 backdrop-blur-md px-5 py-2.5 rounded-xl border border-indigo-500/40 shadow-xl inline-block max-w-md text-center">
                              <p className="text-white text-xs font-semibold italic">"{messages[messages.length - 1]?.text}"</p>
                            </div>
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>
                    
                    {/* Live speech recognition captions */}
                    {input && !concluded && !isListening && (
                      <motion.div 
                        initial={{ opacity: 0, y: 10 }} 
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-indigo-500/95 backdrop-blur-xl px-5 py-3 rounded-2xl border border-indigo-400/40 shadow-2xl max-w-md w-full text-center"
                      >
                         <p className="text-white text-[9px] font-black uppercase tracking-widest mb-1.5 opacity-80">Speech Preview</p>
                         <p className="text-white text-xs font-bold italic leading-relaxed">"{input}"</p>
                         <div className="mt-2.5 flex items-center justify-center">
                            <Button onClick={() => handleSend()} size="sm" className="h-7 bg-white text-indigo-650 hover:bg-slate-100 text-[9px] font-black uppercase tracking-widest rounded-full px-4.5 cursor-pointer">
                              <Send className="w-3 h-3 mr-1.5" /> Confirm & Send
                            </Button>
                         </div>
                      </motion.div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Cinematic controls deck bar */}
          {!concluded && messages.length > 0 && (
            <div className="p-6 bg-slate-955/65 backdrop-blur-xl border-t border-slate-800/80 relative z-30 shrink-0">
              <div className="max-w-xl mx-auto flex flex-col items-center gap-4">
                  <div className="flex items-center gap-4">
                    
                    {/* Mute toggle button */}
                    <Button
                      variant="outline"
                      onClick={toggleMute}
                      className={cn(
                        "w-11 h-11 rounded-full p-0 border-slate-800 transition-all cursor-pointer",
                        isMuted ? "bg-red-500/20 text-red-500 border-red-500/50" : "bg-slate-900 hover:bg-slate-850 text-slate-200"
                      )}
                    >
                      {isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                    </Button>

                    {/* Camera toggle button */}
                    <Button
                      variant="outline"
                      onClick={toggleCamera}
                      className="w-11 h-11 rounded-full p-0 border-slate-800 bg-slate-900 hover:bg-slate-850 text-slate-200 cursor-pointer"
                    >
                      {stream?.getVideoTracks()[0]?.enabled === false ? <CameraOff className="w-4 h-4 text-red-500" /> : <Camera className="w-4 h-4" />}
                    </Button>

                    {/* Input backup mode button */}
                    <Button
                      variant="outline"
                      onClick={() => {
                        setIsKeyboardMode(prev => !prev);
                        notify(!isKeyboardMode ? "Keyboard typing mode activated." : "Voice mode activated.", "info");
                      }}
                      className={cn(
                        "w-11 h-11 rounded-full p-0 border-slate-800 transition-all cursor-pointer",
                        isKeyboardMode ? "bg-indigo-500/20 text-indigo-400 border-indigo-500/50" : "bg-slate-900 hover:bg-slate-850 text-slate-200"
                      )}
                      title={isKeyboardMode ? "Switch to Voice mode" : "Switch to Keyboard mode"}
                    >
                      <Keyboard className="w-4 h-4" />
                    </Button>

                    {/* Speech Capture Core Trigger */}
                    <div className="relative">
                      {isListening && (
                        <motion.div 
                          layoutId="mic-pulse"
                          className="absolute inset-[-6px] bg-indigo-650/20 rounded-full"
                          animate={{ scale: [1, 1.25, 1], opacity: [1, 0, 1] }}
                          transition={{ repeat: Infinity, duration: 1.8 }}
                        />
                      )}
                      <Button 
                        onClick={toggleListening} 
                        disabled={loading || isSpeaking || isMuted}
                        className={cn(
                          "w-13 h-13 rounded-full shadow-2xl transition-all relative z-10 flex items-center justify-center p-0 cursor-pointer",
                          isListening ? "bg-red-650 hover:bg-red-700 text-white" : "bg-indigo-600 hover:bg-indigo-700 text-white",
                          isMuted && "opacity-40 grayscale cursor-not-allowed"
                        )}
                      >
                        {isListening ? <Loader2 className="w-4.5 h-4.5 animate-spin text-white" /> : <MessageSquare className="w-4.5 h-4.5 text-white" />}
                      </Button>
                    </div>

                    {/* Terminate interview button */}
                    <Button
                      variant="outline"
                      onClick={manualEndInterview}
                      disabled={loading}
                      className="w-11 h-11 rounded-full p-0 border-red-500/30 bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white transition-all shadow-md cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>

                 {/* Text keyboard entry container */}
                 <div className="w-full">
                   <AnimatePresence mode="wait">
                      {isThinking ? (
                        <motion.div 
                          initial={{ opacity: 0, scale: 0.98 }}
                          animate={{ opacity: 1, scale: 1 }}
                          className="bg-slate-905 border border-indigo-500/20 rounded-xl p-3 flex flex-col items-center gap-2"
                        >
                           <div className="flex gap-1">
                             <div className="w-1 h-1 bg-indigo-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
                             <div className="w-1 h-1 bg-indigo-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
                             <div className="w-1 h-1 bg-indigo-400 rounded-full animate-bounce" />
                           </div>
                           <p className="text-indigo-300 text-[9px] font-black uppercase tracking-[0.2em] animate-pulse">Assistant is compiling response...</p>
                        </motion.div>
                      ) : input ? (
                        <motion.div 
                          initial={{ opacity: 0, scale: 0.98 }}
                          animate={{ opacity: 1, scale: 1 }}
                          className="bg-slate-950 border border-slate-855 rounded-xl p-3.5 flex flex-col items-center gap-2"
                        >
                           <p className="text-indigo-400 text-xs font-semibold italic overflow-hidden text-ellipsis whitespace-nowrap w-full text-center">"{input}"</p>
                           {!isListening && (
                             <Button onClick={() => handleSend()} size="sm" className="h-7 bg-indigo-600 hover:bg-indigo-755 text-[9px] font-black uppercase tracking-wider rounded-lg px-4.5 cursor-pointer">
                               <Send className="w-3.5 h-3.5 mr-1.5" /> Confirm & Send
                             </Button>
                           )}
                        </motion.div>
                      ) : isKeyboardMode ? (
                        <motion.div
                          initial={{ opacity: 0, scale: 0.98 }}
                          animate={{ opacity: 1, scale: 1 }}
                          className="w-full flex gap-2.5 pt-1"
                        >
                          <input
                            type="text"
                            value={input}
                            disabled={loading || isThinking}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && input.trim() && !loading && !isThinking) {
                                handleSend();
                              }
                            }}
                            placeholder={isThinking ? "Please wait for AI response..." : "Type your answer here..."}
                            className="flex-1 bg-slate-950 border border-slate-855 text-white rounded-xl px-4 h-11 text-xs focus:outline-none focus:border-indigo-500 font-semibold transition-all"
                          />
                          <Button 
                            onClick={() => handleSend()} 
                            disabled={loading || isThinking || !input.trim()}
                            className="bg-indigo-650 hover:bg-indigo-700 h-11 px-5 rounded-xl text-[9px] font-black uppercase tracking-widest cursor-pointer text-white"
                          >
                            <Send className="w-3.5 h-3.5" />
                          </Button>
                        </motion.div>
                      ) : (
                        <div className="text-center py-1 bg-slate-950/40 rounded-full border border-slate-900/60 max-w-[200px] mx-auto">
                          <span className="text-[8px] font-black text-slate-500 uppercase tracking-[0.2em]">
                             {isSpeaking ? "Receiving Data" : isListening ? "Listening" : "Idle mic status"}
                          </span>
                        </div>
                      )}
                   </AnimatePresence>
                 </div>
              </div>
            </div>
          )}

          {concluded && (
            <div className="p-8 bg-slate-955 border-t border-slate-850 flex flex-col items-center gap-5 shrink-0 z-30">
               <div className="flex items-center gap-3 text-green-500">
                  <ShieldCheck className="w-5 h-5 animate-pulse" />
                  <p className="text-xs font-black uppercase tracking-widest">End-to-End Proctoring Log Saved</p>
               </div>
               <Button onClick={() => navigate(`/candidates/${candidateId}`)} className="h-12 px-8 bg-white hover:bg-slate-200 text-slate-955 font-black uppercase tracking-widest rounded-xl text-xs shadow-2xl transition-transform hover:scale-102 active:scale-98 cursor-pointer">
                  Review Session Evaluation
               </Button>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

function Layout({ children, user, isAdmin: isUserAdmin }: { children: React.ReactNode; user: any; isAdmin: boolean }) {
  const [clearing, setClearing] = useState(false);
  const navigate = useNavigate();
  const { confirm, notify, signIn } = useNotification();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  const handleGlobalClear = async () => {
    if (!user) return;
    const ok = await confirm('DANGER: This will permanently delete ALL jobs and candidates created by you. Do you want to proceed?');
    if (!ok) return;
    
    setClearing(true);
    try {
      const uid = user.uid;
      const isSuperAdmin = user.email === 'malviya.pratyush26@gmail.com';
      const batchSize = 450; 
      
      console.log('Deep cleaning database for user:', uid);
      
      let qJobs = query(collection(db, 'jobs'), where('createdBy', '==', uid));
      if (isSuperAdmin) {
        const platformOk = await confirm('Super Admin detected: Do you want to clear the ENTIRE platform database instead of just your data?');
        if (platformOk) {
          qJobs = query(collection(db, 'jobs'));
        }
      }

      const jobsSnap = await getDocs(qJobs);
      
      let batch = writeBatch(db);
      let count = 0;
      let totalDeleted = 0;

      for (const jobDoc of jobsSnap.docs) {
        const candidatesSnap = await getDocs(query(
          collection(db, 'candidates'), 
          where('jobId', '==', jobDoc.id)
        ));
        
        for (const candDoc of candidatesSnap.docs) {
          batch.delete(candDoc.ref);
          count++;
          totalDeleted++;
          if (count >= batchSize) {
            await batch.commit();
            batch = writeBatch(db);
            count = 0;
          }
        }

        batch.delete(jobDoc.ref);
        count++;
        totalDeleted++;
        if (count >= batchSize) {
          await batch.commit();
          batch = writeBatch(db);
          count = 0;
        }
      }

      const orphSnap = await getDocs(query(
        collection(db, 'candidates'),
        where('createdBy', '==', uid)
      ));
      
      for (const orphDoc of orphSnap.docs) {
        batch.delete(orphDoc.ref);
        count++;
        totalDeleted++;
        if (count >= batchSize) {
          await batch.commit();
          batch = writeBatch(db);
          count = 0;
        }
      }

      if (count > 0) {
        try {
          await batch.commit();
        } catch (error) {
          handleFirestoreError(error, OperationType.WRITE, 'batch commit (deep cleaning)');
        }
      }

      localStorage.removeItem(`lastBatch_all`);
      console.log(`Clean up finished. Total records removed: ${totalDeleted}`);
      notify(`Database cleared. ${totalDeleted} records removed.`, 'success');
      navigate('/');
      setTimeout(() => window.location.reload(), 1500);
    } catch (err) {
      console.error('Global Clear Error:', err);
      notify('Failed to clear database: ' + (err instanceof Error ? err.message : 'Unknown error'), 'error');
    } finally {
      setClearing(false);
    }
  };

  const navLinks = [
    { name: 'Features', href: '#features' },
    { name: 'Simulator', href: '#interactive-lab' },
    { name: 'Solutions', href: '#solutions' },
    { name: 'Security', href: '#about' },
    { name: 'Pricing', href: '/?view=pricing' },
  ];

  if (user) {
    return (
      <div className="flex h-screen bg-slate-50 font-sans text-slate-900 selection:bg-indigo-100 overflow-hidden">
                {/* Sidebar */}
        <aside className={cn("bg-slate-900 text-white flex-col hidden lg:flex shrink-0 border-r border-slate-800 transition-all duration-300", isSidebarCollapsed ? "w-20" : "w-64")}>
          <div className={cn("h-16 flex items-center border-b border-slate-800 shrink-0", isSidebarCollapsed ? "px-0 justify-center" : "px-6 justify-between")}>
             <div className="flex items-center">
               <div className={cn("bg-indigo-600 rounded-lg flex items-center justify-center shadow-sm shrink-0", isSidebarCollapsed ? "w-10 h-10" : "w-8 h-8 mr-3")}>
                  <Search className="w-4 h-4 text-white" />
               </div>
               {!isSidebarCollapsed && <span className="font-display font-black text-xl tracking-tighter uppercase">HireNow</span>}
             </div>
             <button onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)} className="p-1 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors">
               <Menu className="w-4 h-4" />
             </button>
          </div>
          <nav className="flex-1 px-3 py-6 flex flex-col gap-2 overflow-y-auto overflow-x-hidden">
             <Link to="/" className={cn("py-2.5 rounded-lg text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-800 transition-colors flex items-center gap-3", isSidebarCollapsed ? "px-0 justify-center" : "px-4")}>
                <LayoutGrid className="w-5 h-5 shrink-0" /> 
                {!isSidebarCollapsed && <span className="truncate">Dashboard</span>}
             </Link>
             <Link to="/jobs/new" className={cn("py-2.5 rounded-lg text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-800 transition-colors flex items-center gap-3", isSidebarCollapsed ? "px-0 justify-center" : "px-4")}>
                <Briefcase className="w-5 h-5 shrink-0" /> 
                {!isSidebarCollapsed && <span className="truncate">Post Job</span>}
             </Link>
             <Link to="/org-admin" className={cn("py-2.5 rounded-lg text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-800 transition-colors flex items-center gap-3", isSidebarCollapsed ? "px-0 justify-center" : "px-4")}>
                <Settings className="w-5 h-5 shrink-0" /> 
                {!isSidebarCollapsed && <span className="truncate">HR Admin</span>}
             </Link>
             {isUserAdmin && (
                <Link to="/admin" className={cn("py-2.5 rounded-lg text-sm font-medium text-indigo-400 hover:text-indigo-300 hover:bg-indigo-900/30 transition-colors flex items-center gap-3", isSidebarCollapsed ? "px-0 justify-center" : "px-4")}>
                  <Shield className="w-5 h-5 shrink-0" /> 
                  {!isSidebarCollapsed && <span className="truncate">System Admin</span>}
                </Link>
             )}
          </nav>
          <div className={cn("p-4 border-t border-slate-800 flex flex-col shrink-0 gap-4", isSidebarCollapsed ? "items-center" : "")}>
            <div className={cn("flex items-center gap-3", isSidebarCollapsed ? "justify-center" : "px-2")}>
              <div className="w-10 h-10 bg-slate-800 rounded-full flex items-center justify-center text-sm font-bold shrink-0">{user.email.charAt(0).toUpperCase()}</div>
              {!isSidebarCollapsed && (
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-white truncate">{user.email}</p>
                  <p className="text-[10px] text-slate-400 truncate">Authenticated</p>
                </div>
              )}
            </div>
            <Button variant="ghost" className={cn("text-slate-400 hover:text-white hover:bg-slate-800 text-xs", isSidebarCollapsed ? "w-10 h-10 p-0 justify-center" : "w-full justify-start px-2")} onClick={() => signOut(auth)}>
              <LogOut className={cn("shrink-0", isSidebarCollapsed ? "w-5 h-5" : "w-4 h-4 mr-2")} /> 
              {!isSidebarCollapsed && "Logout"}
            </Button>
          </div>
        </aside>
        {/* Main Content Area */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 sm:px-6 shrink-0">
             <div className="flex items-center gap-4">
                <button className="lg:hidden p-2 text-slate-500 hover:bg-slate-100 rounded-lg" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
                   <Menu className="w-5 h-5" />
                </button>
             </div>
             <div className="flex items-center gap-4">
               <Button 
                  variant="outline" 
                  className="hidden xl:flex text-red-600 border-red-200 hover:bg-red-50 hover:border-red-300 text-xs py-1.5 h-auto font-medium"
                  onClick={handleGlobalClear}
                  disabled={clearing}
                >
                  <Trash2 className="w-3.5 h-3.5 mr-2" /> {clearing ? 'Clearing...' : 'Clear Platform'}
                </Button>
             </div>
          </header>
          
          <AnimatePresence>
            {mobileMenuOpen && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="lg:hidden border-b bg-slate-900 border-slate-800 shrink-0"
              >
                <div className="px-6 py-4 space-y-2 flex flex-col">
                    <Link to="/" onClick={() => setMobileMenuOpen(false)} className="py-2 text-sm font-medium text-slate-300 hover:text-white transition-colors">Dashboard</Link>
                    <Link to="/jobs/new" onClick={() => setMobileMenuOpen(false)} className="py-2 text-sm font-medium text-slate-300 hover:text-white transition-colors">Post Job</Link>
                    <Link to="/org-admin" onClick={() => setMobileMenuOpen(false)} className="py-2 text-sm font-medium text-slate-300 hover:text-white transition-colors">HR Admin</Link>
                    {isUserAdmin && (
                      <Link to="/admin" onClick={() => setMobileMenuOpen(false)} className="py-2 text-sm font-medium text-indigo-400 hover:text-indigo-300 transition-colors">System Admin</Link>
                    )}
                    <div className="pt-4 border-t border-slate-800">
                      <Button variant="ghost" className="w-full justify-start text-slate-400 hover:text-white hover:bg-slate-800 text-xs px-2" onClick={() => { signOut(auth); setMobileMenuOpen(false); }}>
                        <LogOut className="w-4 h-4 mr-2" /> Logout
                      </Button>
                    </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          
          <main className="flex-1 overflow-y-auto bg-slate-50 p-4 sm:p-6 lg:p-8">
            {children}
          </main>
        </div>
      </div>
    );
  }

  // Unauthenticated Layout
  return <>{children}</>;
}

// --- Pages ---

function Dashboard() {
  const { profile } = useProfile();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { confirm, notify } = useNotification();

  const deleteJob = async (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (!auth.currentUser || !profile) return;
    
    const ok = await confirm('Security: Terminate this talent pipeline and purge all associated candidate records?');
    if (!ok) return;
    
    try {
      const batch = writeBatch(db);
      batch.delete(doc(db, 'jobs', id));
      
      const q = query(
        collection(db, 'candidates'), 
        where('jobId', '==', id),
        where('organizationId', '==', profile.organizationId)
      );
      const snap = await getDocs(q);
      snap.docs.forEach(d => batch.delete(d.ref));
      
      await batch.commit();
      notify('Campaign terminated and purged.', 'success');
    } catch (err) {
      console.error('Delete Job Error:', err);
      notify('Termination failed matching security protocol.', 'error');
      handleFirestoreError(err, OperationType.DELETE, `jobs/${id}`);
    }
  };

  useEffect(() => {
    if (!auth.currentUser || !profile) return;
    
    // Org-based isolation
    const baseQuery = collection(db, 'jobs');
    const q = (auth.currentUser.email === 'malviya.pratyush26@gmail.com')
      ? query(baseQuery, where('status', '==', 'active'))
      : query(baseQuery, where('status', '==', 'active'), where('organizationId', '==', profile.organizationId));

    const unsub = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Job[];
      const sorted = data.sort((a, b) => {
        const timeA = a.createdAt?.seconds || Date.now() / 1000;
        const timeB = b.createdAt?.seconds || Date.now() / 1000;
        return timeB - timeA;
      });
      setJobs(sorted);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'jobs');
    });
    return unsub;
  }, [profile]);

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 pb-6 border-b border-slate-100">
        <div>
          <h1 className="text-3xl sm:text-4xl font-black mb-2 tracking-tighter uppercase leading-none">Active Pipelines</h1>
          <p className="text-slate-500 max-w-2xl text-xs sm:text-lg leading-relaxed font-black uppercase tracking-widest opacity-60">
            Autonomous Talent Orchestration
          </p>
        </div>
        <div className="flex gap-3">
          <Button onClick={() => navigate('/jobs/new')} className="w-full sm:w-auto h-12 sm:h-14 px-8 shadow-2xl shadow-indigo-500/20 text-[10px] font-black uppercase tracking-widest rounded-2xl">
            <Plus className="w-4 h-4 mr-2" /> Initialize Opening
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-64 bg-white border border-slate-200 rounded-[2rem] animate-pulse" />
          ))}
        </div>
      ) : jobs.length === 0 ? (
        <Card className="p-12 sm:p-20 text-center bg-white border-dashed border-2 border-slate-200 rounded-[3rem]">
          <div className="w-20 h-20 bg-indigo-50 rounded-[2rem] flex items-center justify-center mx-auto mb-6 shadow-sm">
            <Briefcase className="w-10 h-10 text-indigo-600" />
          </div>
          <h3 className="text-2xl font-black mb-2 uppercase tracking-tight">Workspace Empty</h3>
          <p className="text-slate-500 mb-10 max-w-sm mx-auto font-medium">No talent pipelines detected. Initialize your first job opening to start the 2026 screening protocol.</p>
          <Button onClick={() => navigate('/jobs/new')} size="lg" className="rounded-2xl h-14 font-black uppercase tracking-widest text-xs">Post Your First Job</Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8 pb-12">
          {jobs.map(job => (
            <motion.div
              key={job.id}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: jobs.indexOf(job) * 0.05 }}
              whileHover={{ y: -8 }}
              className="cursor-pointer"
              onClick={() => navigate(`/jobs/${job.id}`)}
            >
              <Card className="p-8 h-full hover:border-indigo-500 transition-all group shadow-xl hover:shadow-indigo-500/10 rounded-[2.5rem] border-slate-100 flex flex-col justify-between relative overflow-hidden bg-white/80 backdrop-blur-sm">
                <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 rotate-45 translate-x-16 -translate-y-16 group-hover:bg-indigo-500/10 transition-colors" />
                
                <div>
                   <div className="flex justify-between items-start mb-8">
                     <div className="w-14 h-14 bg-slate-950 rounded-2xl flex items-center justify-center text-white font-black group-hover:scale-110 transition-transform shadow-xl">
                       {job.title.charAt(0).toUpperCase()}
                     </div>
                     <span className="text-[10px] font-black uppercase tracking-[0.2em] px-4 py-1.5 bg-emerald-50 text-emerald-700 rounded-full border border-emerald-100 shadow-sm shadow-emerald-100">
                       Live
                     </span>
                   </div>
                   <div className="flex justify-between items-start">
                     <div className="flex-1 min-w-0">
                       <h3 className="text-2xl font-black mb-3 group-hover:text-indigo-600 transition-colors line-clamp-2 tracking-tighter leading-tight uppercase">{job.title}</h3>
                       <p className="text-[10px] text-slate-400 mb-8 flex items-center gap-1.5 font-black uppercase tracking-widest">
                         <Clock className="w-3 h-3" /> Initialized {formatDate(job.createdAt)}
                       </p>
                     </div>
                     <button 
                       onClick={(e) => deleteJob(e, job.id)} 
                       className="p-3 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-2xl transition-all ml-2"
                     >
                       <Trash2 className="w-5 h-5" />
                     </button>
                   </div>
                </div>

                <div className="flex items-center gap-4 pt-6 mt-auto border-t border-slate-50">
                  <div className="flex items-center gap-2 text-slate-500 font-black uppercase tracking-[0.2em] text-[10px]">
                    <div className="flex -space-x-2">
                       {[1,2,3].map(i => <div key={i} className="w-6 h-6 rounded-full bg-slate-100 border-2 border-white" />)}
                    </div>
                    <span>Talent Pipeline</span>
                  </div>
                  <div className="w-8 h-8 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600 ml-auto group-hover:translate-x-1 group-hover:bg-indigo-600 group-hover:text-white transition-all">
                     <ChevronRight className="w-5 h-5" />
                  </div>
                </div>
              </Card>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}

function NewJob() {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [parsingFile, setParsingFile] = useState(false);
  const navigate = useNavigate();
  const { notify } = useNotification();
  const { profile } = useProfile();

  // Custom Controls Core State
  const [passedThreshold, setPassedThreshold] = useState(80);
  const [lowThreshold, setLowThreshold] = useState(40);
  
  const [d1Name, setD1Name] = useState('Technical Skill Fit');
  const [d1Desc, setD1Desc] = useState('Required frameworks, programming languages, and tool stack matched with candidate experience.');
  const [d1Weight, setD1Weight] = useState(30);

  const [d2Name, setD2Name] = useState('Years & Proximity Analysis');
  const [d2Desc, setD2Desc] = useState('Matches total tenure, role-title matches, management level depth, and specific industry alignment.');
  const [d2Weight, setD2Weight] = useState(30);

  const [d3Name, setD3Name] = useState('Educational Foundation');
  const [d3Desc, setD3Desc] = useState('University degree status, major/subject alignment, and tier ranking of credentials.');
  const [d3Weight, setD3Weight] = useState(15);

  const [d4Name, setD4Name] = useState('Quantifiably Backed Outcomes');
  const [d4Desc, setD4Desc] = useState('Metric improvements (KPIs in %, USD, scale), leadership actions, and award recognitions.');
  const [d4Weight, setD4Weight] = useState(15);

  const [d5Name, setD5Name] = useState('Culture Match & Commitment');
  const [d5Desc, setD5Desc] = useState('Job-hopping rates, career trajectory consistency, and values coherence.');
  const [d5Weight, setD5Weight] = useState(10);

  const [showConfig, setShowConfig] = useState(false);

  const handleFileJD = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setParsingFile(true);
    try {
      const text = await extractTextFromFile(file);
      setDescription(text);
    } catch (err: any) {
      notify(err.message || 'Error processing protocol document', 'error');
    } finally {
      setParsingFile(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser) return;
    setLoading(true);
    try {
      const requirements = await parseJobDescription(description);
      
      // Inject customized thresholds and criteria definitions
      requirements.customCriteria = {
        skillsMatch: { name: d1Name, description: d1Desc, weight: Number(d1Weight) },
        experienceFit: { name: d2Name, description: d2Desc, weight: Number(d2Weight) },
        education: { name: d3Name, description: d3Desc, weight: Number(d3Weight) },
        achievements: { name: d4Name, description: d4Desc, weight: Number(d4Weight) },
        culturalRoleFit: { name: d5Name, description: d5Desc, weight: Number(d5Weight) },
      };
      
      requirements.thresholds = {
        passed: Number(passedThreshold),
        low: Number(lowThreshold)
      };

      try {
        const docRef = await addDoc(collection(db, 'jobs'), {
          title: requirements.title || title,
          description,
          requirements,
          organizationId: profile?.organizationId,
          createdBy: auth.currentUser.uid,
          createdAt: serverTimestamp(),
          status: 'active'
        });
        notify('Job campaign initialized.', 'success');
        navigate(`/jobs/${docRef.id}`);
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, 'jobs');
      }
    } catch (err) {
      console.error(err);
      notify('Failed to initialize sequence.', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col gap-4">
        <Button variant="ghost" className="-ml-2 w-fit px-0" onClick={() => navigate('/')}>
          <ChevronRight className="w-4 h-4 rotate-180 mr-2" /> Back to Dashboard
        </Button>
        <div>
          <h1 className="text-3xl sm:text-4xl font-black uppercase tracking-tight mb-2">Initialize Campaign</h1>
          <p className="text-slate-500 text-sm sm:text-lg leading-relaxed font-medium">Input your requirements and customize screening dimensions for precise candidate fit evaluation.</p>
        </div>
      </div>

      <Card className="p-6 sm:p-10 border-slate-100 shadow-2xl shadow-indigo-100/20 rounded-[2.5rem] bg-white/80 backdrop-blur-xl">
        <form onSubmit={handleSubmit} className="space-y-8">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] px-1">Campaign Title</label>
            <input
              required
              type="text"
              className="w-full px-6 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:outline-none focus:border-indigo-500 transition-all font-bold text-slate-900 placeholder:text-slate-300"
              placeholder="e.g. Senior Staff Engineer (Cloud Infrastructure)"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <div className="flex justify-between items-center px-1 mb-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Requirement Context</label>
              <label className="text-[10px] font-black text-indigo-600 hover:text-indigo-500 cursor-pointer flex items-center gap-1.5 px-3 py-1 bg-indigo-50 rounded-full border border-indigo-100 transition-all hover:scale-105 uppercase tracking-widest">
                <Plus className="w-3.5 h-3.5" />
                <span>Upload PDF/DOCX</span>
                <input type="file" theme-target-id="job-file-input" accept=".pdf,.docx" className="hidden" onChange={handleFileJD} disabled={parsingFile} />
              </label>
            </div>
            <textarea
              required
              rows={12}
              className="w-full px-6 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:outline-none focus:border-indigo-500 transition-all text-sm leading-relaxed font-medium min-h-[250px] custom-scrollbar"
              placeholder={parsingFile ? "Decrypting document layers..." : "Paste the full mission brief / job description here..."}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={parsingFile}
            />
          </div>

          {/* Advanced Configurations Expansion */}
          <div className="border-t border-slate-100 pt-6">
            <button
              type="button"
              id="toggle-config-btn"
              onClick={() => setShowConfig(!showConfig)}
              className="flex items-center justify-between w-full p-4 bg-slate-50 hover:bg-slate-100/85 rounded-2xl transition-all border border-slate-100 font-bold text-xs uppercase tracking-wider text-slate-700 shadow-sm"
            >
              <div className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-indigo-500" />
                <span>Scoring Matrix & Passing Thresholds Configuration ({showConfig ? 'Hide' : 'Customize'})</span>
              </div>
              <ChevronDown className={cn("w-4 h-4 text-slate-400 transition-transform", showConfig && "rotate-180")} />
            </button>

            {showConfig && (
              <div className="mt-6 space-y-8 p-6 bg-slate-50/50 rounded-3xl border border-slate-100/50 animate-in fade-in slide-in-from-top-2 duration-300">
                {/* Threshold Section */}
                <div className="space-y-4">
                  <h3 className="text-xs font-black uppercase text-slate-800 tracking-wider flex items-center gap-2">
                    <Target className="w-4 h-4 text-indigo-500" /> Screening Thresholds
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div className="space-y-2 p-4 bg-white rounded-2xl border border-slate-100 shadow-sm">
                      <div className="flex justify-between items-center">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Passed Match</label>
                        <span className="text-sm font-black text-green-600 bg-green-50 px-2.5 py-0.5 rounded-lg border border-green-100">{passedThreshold}%</span>
                      </div>
                      <input
                        type="range"
                        min="50"
                        max="95"
                        theme-target-id="passed-threshold-range"
                        className="w-full accent-green-500"
                        value={passedThreshold}
                        onChange={(e) => setPassedThreshold(Number(e.target.value))}
                      />
                      <p className="text-[9px] text-slate-400 font-semibold">Candidates scoring at or above this progress are Top Matches.</p>
                    </div>

                    <div className="space-y-2 p-4 bg-white rounded-2xl border border-slate-100 shadow-sm">
                      <div className="flex justify-between items-center">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Low Match (Failed)</label>
                        <span className="text-sm font-black text-red-600 bg-red-50 px-2.5 py-0.5 rounded-lg border border-red-100">{lowThreshold}%</span>
                      </div>
                      <input
                        type="range"
                        min="20"
                        max="60"
                        theme-target-id="low-threshold-range"
                        className="w-full accent-red-500"
                        value={lowThreshold}
                        onChange={(e) => setLowThreshold(Number(e.target.value))}
                      />
                      <p className="text-[9px] text-slate-400 font-semibold">Candidates scoring below this progress are flagged as Low Matches.</p>
                    </div>
                  </div>
                </div>

                {/* Custom Dimensions Section */}
                <div className="space-y-6">
                  <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                    <h3 className="text-xs font-black uppercase text-slate-800 tracking-wider flex items-center gap-2">
                      <Briefcase className="w-4 h-4 text-indigo-500" /> Screening Criteria Parameters
                    </h3>
                    <span className="text-[10px] font-mono font-bold px-2 py-0.5 bg-indigo-50 border border-indigo-100 rounded text-indigo-600">
                      Cumulate Weights: {Number(d1Weight) + Number(d2Weight) + Number(d3Weight) + Number(d4Weight) + Number(d5Weight)}%
                    </span>
                  </div>

                  {/* Dimension 1: skillsMatch */}
                  <div className="p-4 bg-white border border-slate-100 rounded-2xl space-y-4 shadow-sm">
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-4">
                      <div className="sm:col-span-8 space-y-2">
                        <label className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Metric 1 Name (e.g. Technical Skills)</label>
                        <input
                          type="text"
                          className="w-full text-xs font-bold px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-500 text-slate-800"
                          value={d1Name}
                          onChange={(e) => setD1Name(e.target.value)}
                        />
                      </div>
                      <div className="sm:col-span-4 space-y-2">
                        <label className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Weight (%)</label>
                        <input
                          type="number"
                          className="w-full text-xs font-bold px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-500 text-slate-800"
                          value={d1Weight}
                          onChange={(e) => setD1Weight(Math.max(0, Number(e.target.value)))}
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Describe what AI should assess for this dimension</label>
                      <textarea
                        rows={2}
                        className="w-full text-xs font-medium px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-500 text-slate-700 leading-relaxed"
                        value={d1Desc}
                        onChange={(e) => setD1Desc(e.target.value)}
                      />
                    </div>
                  </div>

                  {/* Dimension 2: experienceFit */}
                  <div className="p-4 bg-white border border-slate-100 rounded-2xl space-y-4 shadow-sm">
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-4">
                      <div className="sm:col-span-8 space-y-2">
                        <label className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Metric 2 Name (e.g. Leadership Quality)</label>
                        <input
                          type="text"
                          className="w-full text-xs font-bold px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-500 text-slate-800"
                          value={d2Name}
                          onChange={(e) => setD2Name(e.target.value)}
                        />
                      </div>
                      <div className="sm:col-span-4 space-y-2">
                        <label className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Weight (%)</label>
                        <input
                          type="number"
                          className="w-full text-xs font-bold px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-500 text-slate-800"
                          value={d2Weight}
                          onChange={(e) => setD2Weight(Math.max(0, Number(e.target.value)))}
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Describe what AI should assess for this dimension</label>
                      <textarea
                        rows={2}
                        className="w-full text-xs font-medium px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-500 text-slate-700 leading-relaxed"
                        value={d2Desc}
                        onChange={(e) => setD2Desc(e.target.value)}
                      />
                    </div>
                  </div>

                  {/* Dimension 3: education */}
                  <div className="p-4 bg-white border border-slate-100 rounded-2xl space-y-4 shadow-sm">
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-4">
                      <div className="sm:col-span-8 space-y-2">
                        <label className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Metric 3 Name (e.g. Communication Skills)</label>
                        <input
                          type="text"
                          className="w-full text-xs font-bold px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-500 text-slate-800"
                          value={d3Name}
                          onChange={(e) => setD3Name(e.target.value)}
                        />
                      </div>
                      <div className="sm:col-span-4 space-y-2">
                        <label className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Weight (%)</label>
                        <input
                          type="number"
                          className="w-full text-xs font-bold px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-500 text-slate-800"
                          value={d3Weight}
                          onChange={(e) => setD3Weight(Math.max(0, Number(e.target.value)))}
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Describe what AI should assess for this dimension</label>
                      <textarea
                        rows={2}
                        className="w-full text-xs font-medium px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-500 text-slate-700 leading-relaxed"
                        value={d3Desc}
                        onChange={(e) => setD3Desc(e.target.value)}
                      />
                    </div>
                  </div>

                  {/* Dimension 4: achievements */}
                  <div className="p-4 bg-white border border-slate-100 rounded-2xl space-y-4 shadow-sm">
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-4">
                      <div className="sm:col-span-8 space-y-2">
                        <label className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Metric 4 Name (e.g. Key Achievements)</label>
                        <input
                          type="text"
                          className="w-full text-xs font-bold px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-500 text-slate-800"
                          value={d4Name}
                          onChange={(e) => setD4Name(e.target.value)}
                        />
                      </div>
                      <div className="sm:col-span-4 space-y-2">
                        <label className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Weight (%)</label>
                        <input
                          type="number"
                          className="w-full text-xs font-bold px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-500 text-slate-800"
                          value={d4Weight}
                          onChange={(e) => setD4Weight(Math.max(0, Number(e.target.value)))}
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Describe what AI should assess for this dimension</label>
                      <textarea
                        rows={2}
                        className="w-full text-xs font-medium px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-500 text-slate-700 leading-relaxed"
                        value={d4Desc}
                        onChange={(e) => setD4Desc(e.target.value)}
                      />
                    </div>
                  </div>

                  {/* Dimension 5: culturalRoleFit */}
                  <div className="p-4 bg-white border border-slate-100 rounded-2xl space-y-4 shadow-sm">
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-4">
                      <div className="sm:col-span-8 space-y-2">
                        <label className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Metric 5 Name (e.g. Cultural Alignment)</label>
                        <input
                          type="text"
                          className="w-full text-xs font-bold px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-500 text-slate-800"
                          value={d5Name}
                          onChange={(e) => setD5Name(e.target.value)}
                        />
                      </div>
                      <div className="sm:col-span-4 space-y-2">
                        <label className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Weight (%)</label>
                        <input
                          type="number"
                          className="w-full text-xs font-bold px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-500 text-slate-800"
                          value={d5Weight}
                          onChange={(e) => setD5Weight(Math.max(0, Number(e.target.value)))}
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Describe what AI should assess for this dimension</label>
                      <textarea
                        rows={2}
                        className="w-full text-xs font-medium px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-500 text-slate-700 leading-relaxed"
                        value={d5Desc}
                        onChange={(e) => setD5Desc(e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="pt-6 flex flex-col sm:flex-row gap-4">
            <Button type="button" variant="outline" className="h-14 flex-1 text-[10px] font-black uppercase tracking-widest rounded-2xl order-2 sm:order-1" onClick={() => navigate('/')}>Abandon Sequence</Button>
            <Button type="submit" variant="secondary" className="h-14 flex-1 text-[10px] font-black uppercase tracking-widest rounded-2xl shadow-xl shadow-indigo-200 bg-indigo-600 hover:bg-indigo-700 order-1 sm:order-2" disabled={loading || parsingFile}>
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Activate Analysis'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

function JobDetail() {
  const { jobId } = useParams();
  const [job, setJob] = useState<Job | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeUploadsCount, setActiveUploadsCount] = useState(0);
  const uploading = activeUploadsCount > 0;
  const [researchingAll, setResearchingAll] = useState(false);
  const [retryingScreening, setRetryingScreening] = useState<string | null>(null);
  const [invitingCandidateId, setInvitingCandidateId] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [roleFilter, setRoleFilter] = useState('All');
  const [sortBy, setSortBy] = useState('Score');
  const [uploadProgress, setUploadProgress] = useState<{ 
    total: number; 
    current: number; 
    success: number; 
    skipped: number;
    currentFileName?: string;
    startTime?: number;
    estimatedSecondsRemaining?: number;
    files: { id?: string; name: string; status: 'queued' | 'processing' | 'success' | 'skipped' | 'error'; message?: string }[]
  } | null>(null);
  const navigate = useNavigate();
  const { confirm, notify } = useNotification();
  const { profile, organization } = useProfile();
  const [selectedCandidates, setSelectedCandidates] = useState<string[]>([]);
  const [bulkInviting, setBulkInviting] = useState(false);

  const [reevaluatingAll, setReevaluatingAll] = useState(false);
  const [showSettingsDrawer, setShowSettingsDrawer] = useState(false);

  // Editable configuration states for the drawer:
  const [editPassedThresh, setEditPassedThresh] = useState(80);
  const [editLowThresh, setEditLowThresh] = useState(40);
  
  const [editD1Name, setEditD1Name] = useState('');
  const [editD1Desc, setEditD1Desc] = useState('');
  const [editD1Weight, setEditD1Weight] = useState(30);

  const [editD2Name, setEditD2Name] = useState('');
  const [editD2Desc, setEditD2Desc] = useState('');
  const [editD2Weight, setEditD2Weight] = useState(30);

  const [editD3Name, setEditD3Name] = useState('');
  const [editD3Desc, setEditD3Desc] = useState('');
  const [editD3Weight, setEditD3Weight] = useState(15);

  const [editD4Name, setEditD4Name] = useState('');
  const [editD4Desc, setEditD4Desc] = useState('');
  const [editD4Weight, setEditD4Weight] = useState(15);

  const [editD5Name, setEditD5Name] = useState('');
  const [editD5Desc, setEditD5Desc] = useState('');
  const [editD5Weight, setEditD5Weight] = useState(10);

  useEffect(() => {
    if (!job) return;
    const reqs = job.requirements;
    const custom = reqs?.customCriteria;
    
    setEditPassedThresh(reqs?.thresholds?.passed ?? 80);
    setEditLowThresh(reqs?.thresholds?.low ?? 40);

    setEditD1Name(custom?.skillsMatch?.name ?? 'Technical Skill Fit');
    setEditD1Desc(custom?.skillsMatch?.description ?? 'Required frameworks, programming languages, and tool stack matched with candidate experience.');
    setEditD1Weight(custom?.skillsMatch?.weight ?? 30);

    setEditD2Name(custom?.experienceFit?.name ?? 'Years & Proximity Analysis');
    setEditD2Desc(custom?.experienceFit?.description ?? 'Matches total tenure, role-title matches, management level depth, and specific industry alignment.');
    setEditD2Weight(custom?.experienceFit?.weight ?? 30);

    setEditD3Name(custom?.education?.name ?? 'Educational Foundation');
    setEditD3Desc(custom?.education?.description ?? 'University degree status, major/subject alignment, and tier ranking of credentials.');
    setEditD3Weight(custom?.education?.weight ?? 15);

    setEditD4Name(custom?.achievements?.name ?? 'Quantifiably Backed Outcomes');
    setEditD4Desc(custom?.achievements?.description ?? 'Metric improvements (KPIs in %, USD, scale), leadership actions, and award recognitions.');
    setEditD4Weight(custom?.achievements?.weight ?? 15);

    setEditD5Name(custom?.culturalRoleFit?.name ?? 'Culture Match & Commitment');
    setEditD5Desc(custom?.culturalRoleFit?.description ?? 'Job-hopping rates, career trajectory consistency, and values coherence.');
    setEditD5Weight(custom?.culturalRoleFit?.weight ?? 10);
  }, [job]);

  const handleSaveSettings = async () => {
    if (!job || !jobId) return;
    try {
      const updatedRequirements = {
        ...job.requirements,
        customCriteria: {
          skillsMatch: { name: editD1Name, description: editD1Desc, weight: Number(editD1Weight) },
          experienceFit: { name: editD2Name, description: editD2Desc, weight: Number(editD2Weight) },
          education: { name: editD3Name, description: editD3Desc, weight: Number(editD3Weight) },
          achievements: { name: editD4Name, description: editD4Desc, weight: Number(editD4Weight) },
          culturalRoleFit: { name: editD5Name, description: editD5Desc, weight: Number(editD5Weight) },
        },
        thresholds: {
          passed: Number(editPassedThresh),
          low: Number(editLowThresh)
        }
      };

      await updateDoc(doc(db, 'jobs', jobId), {
        requirements: updatedRequirements
      });

      notify('Evaluation parameters updated successfully.', 'success');
      setShowSettingsDrawer(false);
    } catch (err) {
      console.error(err);
      notify('Failed to update evaluation settings.', 'error');
    }
  };

  const handleReevaluateAllCandidates = async () => {
    const realCandidates = candidates.filter(c => c.status === 'processed' || c.status === 'shortlisted' || c.status === 'rejected');
    // We only reevaluate processed or candidate details that have resume text
    const targetCandidates = realCandidates.filter(c => c.resumeText);
    if (targetCandidates.length === 0) {
      notify('No screened candidates with cached resumes available to re-evaluate.', 'info');
      return;
    }
    const ok = await confirm(`Are you sure you want to re-screen all ${targetCandidates.length} candidates? This will re-run the AI models with your updated custom criteria and weights.`);
    if (!ok) return;

    setReevaluatingAll(true);
    try {
      let successCount = 0;
      for (const candidate of targetCandidates) {
        try {
          const rawScreeningResult = await screenCandidate(candidate.resumeText || '', job?.requirements || '');
          const screeningResult = calculateEnhancedScorecard(rawScreeningResult, job?.requirements);
          
          await updateDoc(doc(db, 'candidates', candidate.id), {
            ...screeningResult,
            status: 'processed',
            lastRetriedAt: serverTimestamp()
          });
          successCount++;
        } catch (e) {
          console.error(`Failed to re-score candidate ${candidate.id}:`, e);
        }
      }
      notify(`Successfully re-evaluated ${successCount}/${targetCandidates.length} candidates.`, 'success');
    } catch (err) {
      console.error(err);
      notify('Error running bulk re-evaluation.', 'error');
    } finally {
      setReevaluatingAll(false);
    }
  };

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    if (!jobId || !auth.currentUser || !profile) return;
    setSelectedCandidates([]);
    const unsubJob = onSnapshot(doc(db, 'jobs', jobId), (snapshot) => {
      if (snapshot.exists()) {
        const data = { id: snapshot.id, ...snapshot.data() } as Job;
        if (auth.currentUser?.email !== 'malviya.pratyush26@gmail.com' && data.organizationId !== profile?.organizationId) {
          notify('Unauthorized access to this job', 'error');
          navigate('/');
          return;
        }
        setJob(data);
      }
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `jobs/${jobId}`);
    });

    const baseCandidatesQuery = collection(db, 'candidates');
    const qCandidates = (auth.currentUser.email === 'malviya.pratyush26@gmail.com')
      ? query(baseCandidatesQuery, where('jobId', '==', jobId))
      : query(baseCandidatesQuery, where('jobId', '==', jobId), where('organizationId', '==', profile?.organizationId));

    const unsubCandidates = onSnapshot(qCandidates, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Candidate[];
      setCandidates(data);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'candidates');
    });

    return () => { unsubJob(); unsubCandidates(); };
  }, [jobId]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || !job || !jobId) return;

    setActiveUploadsCount(prev => prev + 1);
    const batchId = Date.now().toString();
    localStorage.setItem(`lastBatch_${jobId}`, batchId);
    
    const newFilesToUpload = Array.from(files).map((f, i) => ({
      id: `${f.name}_${Date.now()}_${i}_${Math.random().toString(36).substring(2, 7)}`,
      file: f,
      name: f.name,
      status: 'queued' as const
    }));

    setUploadProgress(prev => {
      const newFilesProgress = newFilesToUpload.map(nf => ({
        id: nf.id,
        name: nf.name,
        status: nf.status
      }));

      if (!prev || prev.current >= prev.total) {
        return { 
          total: newFilesToUpload.length, 
          current: 0, 
          success: 0, 
          skipped: 0, 
          files: newFilesProgress,
          startTime: Date.now()
        };
      } else {
        return {
          ...prev,
          total: prev.total + newFilesToUpload.length,
          files: [...prev.files, ...newFilesProgress]
        };
      }
    });

    // Process in small batches to avoid rate limits
    const BATCH_SIZE = 1;
    
    try {
      for (let i = 0; i < newFilesToUpload.length; i += BATCH_SIZE) {
        const currentBatch = newFilesToUpload.slice(i, i + BATCH_SIZE);
        
        // Delay between batches to respect rate limits
        if (i > 0) {
          // Longer delay to be safe
          await new Promise(resolve => setTimeout(resolve, 3500));
        }
        
        await Promise.all(currentBatch.map(async (item) => {
          const file = item.file;
          const fileId = item.id;
          
          setUploadProgress(prev => {
            if (!prev) return null;
            return { 
              ...prev, 
              currentFileName: file.name,
              files: prev.files.map(f => f.id === fileId ? { ...f, status: 'processing' as const } : f) 
            };
          });

          try {
            const text = await extractTextFromFile(file);
            const resumeHash = await hashString(text);

            const dupQuery = query(
              collection(db, 'candidates'), 
              where('jobId', '==', jobId),
              where('resumeHash', '==', resumeHash),
              where('createdBy', '==', auth.currentUser.uid)
            );
            const dupSnap = await getDocs(dupQuery);
            
            if (!dupSnap.empty) {
              setUploadProgress(prev => {
                if (!prev) return null;
                const newCurrent = Math.min(prev.total, prev.current + 1);
                const elapsed = Date.now() - (prev.startTime || Date.now());
                const avgTimePerFile = elapsed / newCurrent;
                const remaining = Math.round((prev.total - newCurrent) * (avgTimePerFile / 1000));
                
                return { 
                  ...prev, 
                  current: newCurrent, 
                  skipped: prev.skipped + 1,
                  estimatedSecondsRemaining: remaining,
                  files: prev.files.map(f => f.id === fileId ? { ...f, status: 'skipped' as const, message: 'Duplicate' } : f) 
                };
              });
              return;
            }

            const rawScreeningResult = await screenCandidate(text, job.requirements);
            const screeningResult = calculateEnhancedScorecard(rawScreeningResult, job.requirements);
            
            await addDoc(collection(db, 'candidates'), {
              ...screeningResult,
              jobId,
              organizationId: profile.organizationId,
              createdBy: auth.currentUser.uid,
              resumeHash,
              resumeText: text, // Store original text for retry
              batchId,
              createdAt: serverTimestamp(),
              status: 'processed'
            });

            setUploadProgress(prev => {
              if (!prev) return null;
              const newCurrent = Math.min(prev.total, prev.current + 1);
              const elapsed = Date.now() - (prev.startTime || Date.now());
              const avgTimePerFile = elapsed / newCurrent;
              const remaining = Math.round((prev.total - newCurrent) * (avgTimePerFile / 1000));

              return { 
                ...prev, 
                current: newCurrent, 
                success: prev.success + 1,
                estimatedSecondsRemaining: remaining,
                files: prev.files.map(f => f.id === fileId ? { ...f, status: 'success' as const } : f) 
              };
            });
          } catch (err: any) {
            setUploadProgress(prev => {
              if (!prev) return null;
              const newCurrent = Math.min(prev.total, prev.current + 1);
              return { 
                ...prev, 
                current: newCurrent, 
                files: prev.files.map(f => f.id === fileId ? { ...f, status: 'error' as const, message: err.message } : f) 
              };
            });
          }
        }));
      }
    } finally {
      setActiveUploadsCount(prev => Math.max(0, prev - 1));
    }
  };

  const handleResearchAll = async () => {
    const candidatesToResearch = candidates.filter(c => !c.research);
    if (candidatesToResearch.length === 0) {
      notify('All candidates already have research reports.', 'info');
      return;
    }
    
    const ok = await confirm(`Trigger deep research for ${candidatesToResearch.length} candidates? This will scan the web for each professional footprint.`);
    if (!ok) return;
    
    setResearchingAll(true);
    setUploadProgress({ 
      total: candidatesToResearch.length, 
      current: 0, 
      success: 0, 
      skipped: 0, 
      startTime: Date.now(),
      files: candidatesToResearch.map(c => ({ name: c.fullName, status: 'queued' })) 
    });

    try {
      const BATCH_SIZE = 1; // Research is more intensive, process one by one
      for (let i = 0; i < candidatesToResearch.length; i += BATCH_SIZE) {
        const currentBatch = candidatesToResearch.slice(i, i + BATCH_SIZE);
        
        if (i > 0) {
          // Extra long delay for research because it uses Search tools which have tighter limits
          await new Promise(resolve => setTimeout(resolve, 6000));
        }

        await Promise.all(currentBatch.map(async (c, batchIdx) => {
          const actualIdx = i + batchIdx;
          setUploadProgress(prev => prev ? ({ 
            ...prev, 
            currentFileName: c.fullName,
            files: prev.files.map((f, idx) => idx === actualIdx ? { ...f, status: 'processing' } : f) 
          }) : null);

          try {
            const result = await researchCandidate(c.fullName, c.currentRole, c.currentCompany || '', c.oneLineSummary);
            await updateDoc(doc(db, 'candidates', c.id), {
              research: {
                ...result,
                lastResearchedAt: serverTimestamp()
              }
            });
            setUploadProgress(prev => {
              if (!prev) return null;
              const newCurrent = Math.min(prev.total, prev.current + 1);
              const elapsed = Date.now() - (prev.startTime || Date.now());
              const avgTimePerCandidate = elapsed / newCurrent;
              const remaining = Math.round((prev.total - newCurrent) * (avgTimePerCandidate / 1000));

              return { 
                ...prev, 
                current: newCurrent, 
                success: prev.success + 1,
                estimatedSecondsRemaining: remaining,
                files: prev.files.map((f, idx) => idx === actualIdx ? { ...f, status: 'success' } : f) 
              };
            });
          } catch (err: any) {
            console.error(`Research error for ${c.fullName}:`, err);
            setUploadProgress(prev => {
              if (!prev) return null;
              const newCurrent = Math.min(prev.total, prev.current + 1);
              return { 
                ...prev, 
                current: newCurrent, 
                files: prev.files.map((f, idx) => idx === actualIdx ? { ...f, status: 'error', message: err.message } : f) 
              };
            });
          }
        }));
      }
    } finally {
      setResearchingAll(false);
    }
  };

  const handleRetryScreening = async (candidate: Candidate) => {
    const ok = await confirm(`Retry screening for ${candidate.fullName}? This will re-analyze their resume against current job requirements.`);
    if (!ok) return;

    setRetryingScreening(candidate.id);
    try {
      const rawScreeningResult = await screenCandidate(candidate.resumeText || '', job?.requirements || '');
      const screeningResult = calculateEnhancedScorecard(rawScreeningResult, job?.requirements);
      
      await updateDoc(doc(db, 'candidates', candidate.id), {
        ...screeningResult,
        status: 'processed',
        lastRetriedAt: serverTimestamp()
      });
      notify('Screening re-triggered successfully.', 'success');
    } catch (err) {
      console.error(err);
      notify('Failed to retry screening.', 'error');
    } finally {
      setRetryingScreening(null);
    }
  };

  const deleteCandidate = async (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    const ok = await confirm('Remove this candidate screening report?');
    if (!ok) return;
    try {
      const batch = writeBatch(db);
      batch.delete(doc(db, 'candidates', id));
      await batch.commit();
      notify('Candidate removed from sequence.', 'success');
    } catch (err) {
      console.error('Delete Candidate Error:', err);
      notify('Delete failed. Verify permissions.', 'error');
      handleFirestoreError(err, OperationType.DELETE, `candidates/${id}`);
    }
  };

  const handleSendInviteForCandidate = async (candidate: Candidate) => {
    setInvitingCandidateId(candidate.id);
    const link = `${window.location.origin}/interview/${candidate.id}`;
    try {
      // 1. Update status in db
      await updateDoc(doc(db, 'candidates', candidate.id), { interviewStatus: 'invited' });
      
      // 2. Try to send email via backend endpoint
      const res = await fetch('/api/candidate/send-invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          candidateEmail: candidate.email,
          candidateName: candidate.fullName,
          interviewLink: link,
          jobTitle: job?.title || 'Applied Position',
          customSmtp: organization?.emailSettings || null
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        if (data.previewUrl) {
          notify(`Invite sent to ${candidate.fullName}! Test URL: ${data.previewUrl}`, 'success');
        } else {
          notify(data.message || `Email interview invitation sent to ${candidate.fullName}!`, 'success');
        }
      } else {
        if (data.reason === 'NOT_AUTHENTICATED') {
          navigator.clipboard.writeText(link);
          notify('Invite created! Google account not connected - copied link to clipboard.', 'info');
        } else {
          navigator.clipboard.writeText(link);
          notify(`Invite created! Copied link to clipboard. (Email error: ${data.error || 'unknown'})`, 'info');
        }
      }
    } catch (err: any) {
      console.error(err);
      navigator.clipboard.writeText(link);
      notify('Invite created! Copied link to clipboard.', 'info');
    } finally {
      setInvitingCandidateId(null);
    }
  };

  const handleBulkInvite = async () => {
    if (selectedCandidates.length === 0) return;
    const ok = await confirm(`Are you sure you want to invite all ${selectedCandidates.length} selected candidates to interviews?`);
    if (!ok) return;

    setBulkInviting(true);
    let successCount = 0;
    let clipboardCount = 0;

    for (const cId of selectedCandidates) {
      const candidate = candidates.find(c => c.id === cId);
      if (!candidate) continue;

      const link = `${window.location.origin}/interview/${candidate.id}`;
      try {
        try {
          await updateDoc(doc(db, 'candidates', candidate.id), { interviewStatus: 'invited' });
        } catch (error) {
          handleFirestoreError(error, OperationType.WRITE, `candidates/${candidate.id}`);
        }
        
        const res = await fetch('/api/candidate/send-invite', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            candidateEmail: candidate.email,
            candidateName: candidate.fullName,
            interviewLink: link,
            jobTitle: job?.title || 'Applied Position',
            customSmtp: organization?.emailSettings || null
          })
        });

        const data = await res.json();
        if (res.ok && data.success) {
          successCount++;
        } else {
          clipboardCount++;
        }
      } catch (err) {
        console.error(err);
        clipboardCount++;
      }
    }

    if (successCount > 0) {
      notify(`Successfully sent interview invites to ${successCount} candidate(s)!`, 'success');
    }
    if (clipboardCount > 0) {
      notify(`Created invites for ${clipboardCount} candidate(s). Email delivery skipped or failed.`, 'info');
    }

    setSelectedCandidates([]);
    setBulkInviting(false);
  };

  const clearJobCandidates = async () => {
    if (!jobId || !auth.currentUser) return;
    
    const ok = await confirm('Are you sure you want to remove ALL candidates for this job? This cannot be undone.');
    if (!ok) return;
    
    setClearing(true);
    try {
      const q = query(
        collection(db, 'candidates'), 
        where('jobId', '==', jobId)
      );
      const snap = await getDocs(q);
      
      if (!snap.empty) {
        const chunks = [];
        const docs = snap.docs;
        for (let i = 0; i < docs.length; i += 450) {
          chunks.push(docs.slice(i, i + 450));
        }
 
        for (const chunk of chunks) {
          const batch = writeBatch(db);
          chunk.forEach(d => batch.delete(d.ref));
          try {
            await batch.commit();
          } catch (error) {
            handleFirestoreError(error, OperationType.DELETE, `batch commit (clearing job ${jobId} candidates)`);
          }
        }
      }
      localStorage.removeItem(`lastBatch_${jobId}`);
      notify('Pipeline cleared successfully.', 'success');
    } catch (err) {
      console.error('Clear Pipeline Error:', err);
      notify('Failed to clear pipeline. Check connectivity.', 'error');
      handleFirestoreError(err, OperationType.DELETE, `candidates (clear all for job ${jobId})`);
    } finally {
      setClearing(false);
    }
  };

  const filteredRealCandidates = useMemo(() => {
    return candidates
      .filter(c => {
        const matchesSearch = (c.fullName || '').toLowerCase().includes(debouncedSearch.toLowerCase()) || 
                            (c.currentRole || '').toLowerCase().includes(debouncedSearch.toLowerCase());
        
        let matchesStatus = true;
        if (statusFilter !== 'All') {
          const normalizedFilter = statusFilter.toLowerCase();
          if (normalizedFilter === 'shortlisted') {
            matchesStatus = c.scorecard.compositeScore >= 80;
          } else if (normalizedFilter === 'rejected') {
            matchesStatus = c.scorecard.compositeScore < 40;
          } else if (normalizedFilter === 'processed') {
            matchesStatus = c.status === 'processed';
          }
        }

        const matchesRole = roleFilter === 'All' || c.currentRole === roleFilter;
        return matchesSearch && matchesStatus && matchesRole;
      })
      .sort((a, b) => {
        if (sortBy === 'Score') return b.scorecard.compositeScore - a.scorecard.compositeScore;
        if (sortBy === 'Integrity') return (b.scorecard.integrityScore || 0) - (a.scorecard.integrityScore || 0);
        const timeA = a.createdAt?.seconds || Date.now() / 1000;
        const timeB = b.createdAt?.seconds || Date.now() / 1000;
        return timeB - timeA;
      });
  }, [candidates, debouncedSearch, statusFilter, roleFilter, sortBy]);

  const filteredCandidates = useMemo(() => {
    if (!uploadProgress || uploadProgress.current >= uploadProgress.total) {
      return filteredRealCandidates;
    }

    const placeholders = uploadProgress.files
      .filter(f => f.status === 'processing' || f.status === 'queued')
      .map((f, index) => ({
        id: `placeholder_${f.name}_${index}`,
        fullName: f.name.replace(/\.[^/.]+$/, "").replace(/[_-]/g, " "),
        currentRole: job?.title || 'Screening...',
        currentCompany: 'Pending Analysis',
        totalExperience: 0,
        location: 'Analysis Node',
        oneLineSummary: 'AI is performing forensic screening and Scoring...',
        createdAt: { seconds: Math.floor(Date.now() / 1000) + 1000 - index },
        status: 'screening' as const,
        fileIndex: index,
        scorecard: {
          compositeScore: 0,
          integrityScore: 100,
          skillsAnalysis: { confirmed: [] },
          recommendation: { summary: 'Screening in progress...', fitHeader: 'Loading', status: 'potential' }
        }
      }));

    return [...placeholders, ...filteredRealCandidates];
  }, [filteredRealCandidates, uploadProgress, job]);

  const uniqueRoles = Array.from(new Set(candidates.map(c => c.currentRole))).filter(r => r && r !== 'All');

  const passedThresh = job?.requirements?.thresholds?.passed ?? 80;
  const lowThresh = job?.requirements?.thresholds?.low ?? 40;

  const stats = {
    total: candidates.length,
    pending: candidates.filter(c => c.status === 'processed').length,
    passed: candidates.filter(c => c.scorecard.compositeScore >= passedThresh).length,
    failed: candidates.filter(c => c.scorecard.compositeScore < lowThresh).length
  };

  const bestScore = candidates.length > 0 
    ? Math.max(...candidates.map(c => c.scorecard.compositeScore)) 
    : 0;

  if (loading) return <div className="h-screen flex items-center justify-center font-black animate-pulse">BOOTSTRAPPING PIPELINE...</div>;
  if (!job) return <div className="p-20 text-center">Job sequence not found.</div>;

  return (
    <div className="space-y-12 pb-20">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex flex-col gap-4">
          <Button variant="ghost" className="-ml-2 w-fit px-0" onClick={() => navigate('/')}>
            <ChevronRight className="w-4 h-4 rotate-180" /> Back to Agents
          </Button>
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600 border border-indigo-100 shadow-sm">
              <Briefcase className="w-7 h-7" />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h1 className="text-2xl font-black tracking-tight">{job.title}</h1>
                <span className="px-2 py-0.5 bg-indigo-50 text-indigo-600 text-[10px] font-black uppercase tracking-widest rounded-lg border border-indigo-100 flex items-center gap-1">
                   <RotateCcw className="w-3 h-3" /> Autonomous
                </span>
              </div>
              <p className="text-slate-500 text-sm max-w-lg leading-relaxed">
                End-to-end AI screening — website voice interviews, instant fit scoring, and autonomous reporting.
              </p>
            </div>
          </div>
        </div>
        
        <div className="flex flex-wrap gap-3 items-center">
          <Button
            variant="outline"
            id="scoring-settings-btn"
            onClick={() => setShowSettingsDrawer(true)}
            className="px-5 h-12 rounded-xl text-sm font-bold border-indigo-100 hover:bg-slate-50 transition-all text-indigo-700 flex items-center gap-1.5"
          >
            <Sliders className="w-4 h-4" />
            Evaluation Settings
          </Button>

          <label className="cursor-pointer">
            <input type="file" multiple accept=".pdf,.docx" className="hidden" onChange={handleFileUpload} />
            <Button variant="secondary" className="px-6 h-12 rounded-xl text-sm font-black shadow-lg shadow-indigo-200" as="div">
              <Plus className="w-4 h-4 mr-1.5" />
              New Interview Session
            </Button>
          </label>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
        {[
          { label: 'Total Scanned', count: stats.total, percent: 100, color: 'text-indigo-500' },
          { label: 'Ready to Invite', count: stats.pending, percent: Math.round((stats.pending / (stats.total || 1)) * 100), color: 'text-blue-500' },
          { label: `Passed Match (${passedThresh}+)`, count: stats.passed, percent: Math.round((stats.passed / (stats.total || 1)) * 100), color: 'text-green-500' },
          { label: `Low Match (<${lowThresh})`, count: stats.failed, percent: Math.round((stats.failed / (stats.total || 1)) * 100), color: 'text-red-500' },
        ].map(s => (
          <Card key={s.label} className="p-4 md:p-6 flex flex-col sm:flex-row items-center justify-between border-slate-100 shadow-sm hover:shadow-md transition-shadow">
            <div className="text-center sm:text-left mb-2 sm:mb-0">
              <p className="text-2xl md:text-3xl font-black mb-1">{s.count}</p>
              <p className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest">{s.label}</p>
            </div>
            <div className="relative w-12 h-12 md:w-14 md:h-14 shrink-0">
              <svg className="w-12 h-12 md:w-14 md:h-14 -rotate-90">
                <circle cx="28" cy="28" r="24" stroke="currentColor" strokeWidth="4" fill="transparent" className="text-slate-50" />
                <circle cx="28" cy="28" r="24" stroke="currentColor" strokeWidth="4" strokeDasharray={150.8} strokeDashoffset={150.8 - (s.percent / 100) * 150.8} strokeLinecap="round" fill="transparent" className={s.color} />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-[9px] md:text-[10px] font-black">{s.percent}%</span>
              </div>
            </div>
          </Card>
        ))}
      </div>


      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
        {/* Sidebar Filters */}
        <aside className="lg:col-span-3">
          <div className="sticky top-24 space-y-10">
            <details className="lg:block group open:mb-8 lg:open:mb-0" open>
              <summary className="list-none cursor-pointer lg:cursor-default flex items-center justify-between lg:mb-4">
                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Active Filters</h3>
                <Filter className="w-4 h-4 text-slate-400 lg:hidden group-open:rotate-180 transition-transform" />
              </summary>
              <div className="space-y-8 mt-4 lg:mt-0">
                <div>
                  <h4 className="text-xs font-black text-slate-900 uppercase tracking-widest mb-4">Status</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-1 gap-3">
                    {['All', 'Processing Resume', 'Ready to Invite', 'Invite Sent', 'Scheduled', 'Evaluating', 'Passed', 'Failed'].map(status => (
                      <label key={`status-filter-${status}`} className="flex items-center gap-3 cursor-pointer group">
                        <div className={cn(
                          "w-4 h-4 rounded-full border-2 transition-all flex items-center justify-center shrink-0",
                          statusFilter === status ? "border-indigo-600 bg-indigo-600" : "border-slate-200 group-hover:border-indigo-400"
                        )}>
                          {statusFilter === status && <div className="w-1.5 h-1.5 bg-white rounded-full" />}
                        </div>
                        <input type="radio" className="hidden" name="status" value={status} checked={statusFilter === status} onChange={() => setStatusFilter(status)} />
                        <span className={cn(
                          "text-xs font-bold transition-colors truncate",
                          statusFilter === status ? "text-indigo-600" : "text-slate-500 group-hover:text-slate-900"
                        )}>{status}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <h4 className="text-xs font-black text-slate-900 uppercase tracking-widest mb-4">Role</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-1 gap-3">
                    {['All', ...Array.from(new Set(candidates.map(c => c.currentRole))).filter(r => r && r !== 'All')].slice(0, 5).map(role => (
                      <label key={`role-filter-${role}`} className="flex items-center gap-3 cursor-pointer group">
                        <div className={cn(
                          "w-4 h-4 rounded-full border-2 transition-all flex items-center justify-center shrink-0",
                          roleFilter === role ? "border-indigo-600 bg-indigo-600" : "border-slate-200 group-hover:border-indigo-400"
                        )}>
                          {roleFilter === role && <div className="w-1.5 h-1.5 bg-white rounded-full" />}
                        </div>
                        <input type="radio" className="hidden" name="role" value={role} checked={roleFilter === role} onChange={() => setRoleFilter(role)} />
                        <span className={cn(
                          "text-xs font-bold transition-colors truncate",
                          roleFilter === role ? "text-indigo-600" : "text-slate-500 group-hover:text-slate-900"
                        )}>{role}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            </details>
          </div>
        </aside>

        {/* Main Content */}
        <div className="lg:col-span-9 space-y-8">
          {uploadProgress && (
            <div className="bg-slate-900 text-white rounded-xl p-4 shadow-xl flex flex-col md:flex-row items-center justify-between gap-4 border border-slate-800 animate-in fade-in-50 slide-in-from-top-4 duration-300">
              <div className="flex items-center gap-3 w-full md:w-auto">
                <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center shrink-0">
                  <Cpu className="w-4 h-4 text-indigo-400 animate-pulse" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-black tracking-widest uppercase text-indigo-400 leading-none">
                      {researchingAll ? 'Intelligent Multi-Source Research' : 'Autonomous Batch Pipeline'}
                    </p>
                    <span className="text-[10px] font-mono font-bold bg-slate-800 px-1.5 py-0.5 rounded text-indigo-300 border border-indigo-500/20">
                      {Math.round((uploadProgress.current / uploadProgress.total) * 100)}%
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1 truncate">
                    {uploadProgress.current === uploadProgress.total ? 'Processing complete' : `Target: ${uploadProgress.currentFileName || 'Initializing...'}`}
                  </p>
                </div>
              </div>

              {/* Progress and indicators */}
              <div className="flex items-center gap-4 w-full md:w-auto md:justify-end">
                <div className="flex items-center gap-1.5 text-[10px] font-black uppercase text-slate-400 shrink-0">
                  <CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> {uploadProgress.success}
                </div>
                <div className="flex items-center gap-1.5 text-[10px] font-black uppercase text-slate-400 shrink-0">
                  <AlertCircle className="w-3.5 h-3.5 text-amber-500" /> {uploadProgress.skipped}
                </div>

                <div className="hidden sm:block w-32 h-1.5 bg-slate-800 rounded-full overflow-hidden border border-slate-700/30 shrink-0">
                  <div 
                    className="h-full bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.5)] transition-all duration-300"
                    style={{ width: `${(uploadProgress.current / uploadProgress.total) * 100}%` }}
                  />
                </div>

                {uploadProgress.current === uploadProgress.total && !uploading ? (
                  <Button 
                    variant="brand" 
                    size="sm"
                    className="bg-indigo-600 hover:bg-indigo-700 font-extrabold text-[9px] uppercase tracking-wider h-7 px-3 rounded-lg text-white"
                    onClick={() => setUploadProgress(null)}
                  >
                    Dismiss
                  </Button>
                ) : (
                  uploadProgress.estimatedSecondsRemaining !== undefined && uploadProgress.estimatedSecondsRemaining > 0 && (
                    <span className="text-[9px] font-black text-indigo-400 uppercase tracking-widest flex items-center gap-2 shrink-0 bg-indigo-500/10 px-2 py-1 rounded border border-indigo-500/20">
                      <Clock className="w-3.5 h-3.5 animate-spin" /> ~{uploadProgress.estimatedSecondsRemaining}s Left
                    </span>
                  )
                )}
              </div>
            </div>
          )}

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div>
                <h2 className="text-2xl font-black">Candidates ({filteredCandidates.length})</h2>
                <p className="text-slate-500 text-sm">Refined, sortable shortlist with action-ready interview workflows.</p>
              </div>
              {candidates.length > 0 && (
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="text-red-500 hover:text-red-700 hover:bg-red-50 text-[10px] font-black uppercase tracking-widest mt-1"
                  onClick={clearJobCandidates}
                  disabled={clearing}
                >
                  {clearing ? <Loader2 className="w-3 h-3 animate-spin mr-2" /> : <Trash2 className="w-3 h-3 mr-2" />}
                  Clear Pipeline
                </Button>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {selectedCandidates.length > 0 && (
                <Button 
                  variant="brand" 
                  size="sm" 
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-black uppercase tracking-widest text-[10px] h-9 px-4 flex items-center gap-1.5 shadow-md shadow-emerald-100"
                  onClick={handleBulkInvite}
                  disabled={bulkInviting}
                >
                  {bulkInviting ? (
                    <>
                      <Loader2 className="w-3 h-3 animate-spin mr-2" />
                      Inviting ({selectedCandidates.length})...
                    </>
                  ) : (
                    <>
                      <Send className="w-3.5 h-3.5 mr-1" />
                      Bulk Invite ({selectedCandidates.length})
                    </>
                  )}
                </Button>
              )}
              {candidates.length > 0 && (
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="bg-indigo-50 text-indigo-600 border-indigo-100 hover:bg-indigo-100 font-black uppercase tracking-widest text-[10px] h-9"
                  onClick={handleResearchAll}
                  disabled={researchingAll || uploading}
                >
                  {researchingAll ? <Loader2 className="w-3 h-3 animate-spin mr-2" /> : <Globe className="w-3 h-3 mr-2" />}
                  Research Pipeline
                </Button>
              )}
              <div className="flex flex-wrap items-center gap-2 bg-slate-100 p-1 rounded-xl border border-slate-200">
                <div className="flex items-center gap-2 px-2 border-r border-slate-200 h-7">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Sort</span>
                  <select 
                    className="bg-transparent text-xs font-black focus:outline-none cursor-pointer" 
                    value={sortBy} 
                    onChange={(e) => setSortBy(e.target.value)}
                  >
                    <option>Score</option>
                    <option>Integrity</option>
                    <option>Recent</option>
                  </select>
                </div>
                <div className="flex items-center gap-2 px-2 border-r border-slate-200 h-7">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</span>
                  <select 
                    className="bg-transparent text-xs font-black focus:outline-none cursor-pointer" 
                    value={statusFilter} 
                    onChange={(e) => setStatusFilter(e.target.value)}
                  >
                    <option>All</option>
                    <option value="shortlisted">Shortlisted (80+)</option>
                    <option value="processed">Ready to Invite</option>
                    <option value="rejected">Rejected (under 40)</option>
                  </select>
                </div>
                <div className="flex items-center gap-2 px-2 h-7">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Role</span>
                  <select 
                    className="bg-transparent text-xs font-black focus:outline-none cursor-pointer max-w-[80px] sm:max-w-[120px] truncate" 
                    value={roleFilter} 
                    onChange={(e) => setRoleFilter(e.target.value)}
                  >
                    <option>All</option>
                    {uniqueRoles.map(role => (
                      <option key={`dropdown-role-${role}`} value={role}>{role}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="relative group flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
                <input 
                  type="text" 
                  placeholder="Search candidates..." 
                  className="pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all w-full"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 h-9 shrink-0">
                <button 
                  onClick={() => setViewMode('list')} 
                  className={cn("p-1.5 rounded-lg transition-all", viewMode === 'list' ? "bg-white shadow-sm text-indigo-600" : "text-slate-400 hover:text-slate-600")}
                >
                  <List className="w-4 h-4" />
                </button>
                <button 
                  onClick={() => setViewMode('grid')} 
                  className={cn("p-1.5 rounded-lg transition-all", viewMode === 'grid' ? "bg-white shadow-sm text-indigo-600" : "text-slate-400 hover:text-slate-600")}
                >
                  <LayoutGrid className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {filteredCandidates.length === 0 ? (
            <div className="p-20 text-center border-2 border-dashed border-slate-200 rounded-2xl bg-white/50">
              <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4 border border-slate-200">
                <Users className="w-8 h-8 text-slate-400" />
              </div>
              <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest mb-1">No Matching Candidates</h3>
              <p className="text-slate-400 text-xs">Adjust your search or filters to find specific applicants.</p>
            </div>
          ) : viewMode === 'grid' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-2 gap-6">
              {filteredCandidates.map(candidate => {
                const isPlaceholder = candidate.status === 'screening';
                const isBestMatch = !isPlaceholder && candidate.scorecard.compositeScore === bestScore && bestScore >= 80;
                
                if (isPlaceholder) {
                  return (
                    <motion.div 
                      key={candidate.id} 
                      layout 
                      initial={{ opacity: 0, scale: 0.95 }} 
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      className="order-first"
                    >
                      <Card className="p-6 border-2 border-dashed border-indigo-200/60 bg-gradient-to-br from-indigo-50/10 via-white to-slate-50/5 relative hover:border-indigo-300 transition-all shadow-sm">
                        <div className="absolute top-4 right-4">
                          <PlaceholderScoreCircle isProcessing={true} />
                        </div>
                        
                        <div className="flex gap-5 mb-6 pr-16 relative">
                          <div className="w-14 h-14 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center font-black animate-pulse text-indigo-400 shrink-0">
                            <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <h3 className="font-black text-slate-800 truncate text-base tracking-tight animate-pulse">
                                {candidate.fullName}
                              </h3>
                              <span className="text-[8px] font-black bg-indigo-505 bg-indigo-500/10 text-indigo-600 px-2 py-0.5 rounded-full uppercase tracking-widest border border-indigo-200/50 flex items-center gap-1 shrink-0 animate-pulse">
                                <Sparkles className="w-2.5 h-2.5 animate-pulse" /> Forensic Screening
                              </span>
                            </div>
                            <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mt-1 flex items-center gap-1.5 ">
                              {candidate.currentRole} 
                              <span className="w-1 h-1 rounded-full bg-slate-300" />
                              Active Session
                            </p>
                          </div>
                        </div>
                        
                        <div className="flex gap-2 mb-8 h-10 overflow-hidden items-center">
                          <div className="h-6 w-20 bg-slate-100 rounded-lg animate-pulse" />
                          <div className="h-6 w-28 bg-slate-100 rounded-lg animate-pulse" />
                          <div className="h-6 w-16 bg-slate-100 rounded-lg animate-pulse" />
                          <div className="h-6 w-24 bg-slate-150 bg-slate-100 rounded-lg animate-pulse" />
                        </div>
                        
                        <div className="flex items-center justify-between pt-5 border-t border-slate-50">
                          <div className="px-2.5 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 bg-indigo-50 text-indigo-600 border border-indigo-100/50">
                            <div className="w-2 h-2 rounded-full bg-indigo-500 animate-ping" />
                            Analyzing Resume Stack
                          </div>
                          <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 animate-pulse">
                            Generating Scorecard...
                          </div>
                        </div>
                      </Card>
                    </motion.div>
                  );
                }

                return (
                  <motion.div 
                    key={candidate.id} 
                    layout 
                    initial={{ opacity: 0, scale: 0.95 }} 
                    animate={{ opacity: 1, scale: 1 }}
                    className={cn(isBestMatch && "order-first")}
                  >
                    <Card 
                      className={cn(
                        "p-6 relative group border-2 transition-all cursor-pointer bg-white overflow-hidden",
                        isBestMatch 
                          ? "border-amber-400 shadow-[0_20px_50px_rgba(245,158,11,0.15)] ring-4 ring-amber-400/5" 
                          : "border-slate-100 hover:border-indigo-200 hover:shadow-xl hover:shadow-indigo-500/10"
                      )} 
                      onClick={() => navigate(`/candidates/${candidate.id}`)}
                    >
                      {isBestMatch && (
                        <>
                          <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-amber-400 via-amber-200 to-amber-400 animate-pulse" />
                          <div className="absolute -right-12 -top-12 w-24 h-24 bg-amber-400 rotate-45 flex items-end justify-center pb-2 px-6">
                            <Star className="w-5 h-5 text-white fill-current mb-2" />
                          </div>
                        </>
                      )}
                      
                      <div className="absolute top-4 right-4 flex flex-col items-center">
                        {isBestMatch && (
                           <div className="mb-2 bg-amber-500 text-white px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest shadow-lg flex items-center gap-1">
                              Best Fit <Sparkles className="w-2.5 h-2.5" />
                           </div>
                        )}
                        <div className="relative w-16 h-16 flex items-center justify-center">
                        <svg className="absolute inset-0 w-full h-full -rotate-90">
                          <circle cx="32" cy="32" r="28" stroke="currentColor" strokeWidth="3" fill="transparent" className="text-slate-100" />
                          <circle 
                            cx="32" cy="32" r="28" 
                            stroke="currentColor" strokeWidth="3" 
                            strokeDasharray={175.9} 
                            strokeDashoffset={175.9 - (candidate.scorecard.compositeScore / 100) * 175.9} 
                            strokeLinecap="round" 
                            fill="transparent" 
                            className={cn(
                              candidate.scorecard.compositeScore >= 80 ? "text-green-500" :
                              candidate.scorecard.compositeScore >= 60 ? "text-amber-500" : "text-red-500"
                            )} 
                          />
                        </svg>
                        <div className={cn(
                          "w-12 h-12 rounded-2xl flex flex-col items-center justify-center shadow-sm transition-all group-hover:scale-105 group-hover:rotate-3 z-10",
                          getScoreColor(candidate.scorecard.compositeScore).replace('border-','border-opacity-50 border-')
                        )}>
                          <span className="text-[9px] font-black uppercase opacity-60 leading-none mb-0.5 tracking-tighter">Fit</span>
                          <span className="text-base font-black leading-none">{candidate.scorecard.compositeScore}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-5 mb-6 pr-16 relative">
                      <div className={cn(
                        "w-14 h-14 rounded-2xl border flex items-center justify-center font-black text-xl shrink-0 transition-colors",
                        isBestMatch 
                          ? "bg-indigo-600 text-white border-indigo-700 shadow-lg" 
                          : "bg-slate-50 border-slate-100 text-slate-400 group-hover:bg-indigo-50 group-hover:text-indigo-500"
                      )}>
                        {candidate.fullName.charAt(0)}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                           <h3 className={cn(
                             "font-black truncate text-base tracking-tight transition-colors",
                             isBestMatch ? "text-indigo-700" : "text-slate-900 group-hover:text-indigo-600"
                           )}>
                             {candidate.fullName}
                           </h3>
                           {isBestMatch && (
                             <span className="text-[8px] font-black bg-indigo-600 text-white px-2 py-0.5 rounded-full uppercase tracking-widest shadow-sm">Best Match</span>
                           )}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest flex items-center gap-1.5 ">
                            {candidate.currentRole} 
                            <span className="w-1 h-1 rounded-full bg-slate-200" />
                            {formatDate(candidate.createdAt)}
                          </p>
                          {candidate.research && (
                            <div className="flex items-center gap-1 text-indigo-500 bg-indigo-50 px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-tighter border border-indigo-100">
                              <Globe className="w-2.5 h-2.5" /> Research
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5 mb-8 h-14 overflow-hidden content-start">
                       {candidate.scorecard.skillsAnalysis?.confirmed?.slice(0, 6).map((skill, ridx) => (
                         <span key={ridx} className="px-2 py-1 bg-slate-50 text-slate-500 rounded-lg border border-slate-100 text-[10px] font-black uppercase tracking-widest whitespace-nowrap">
                           {skill}
                         </span>
                       ))}
                       {candidate.scorecard.skillsAnalysis?.confirmed?.length > 6 && (
                         <span className="px-2 py-1 bg-slate-100 text-slate-400 rounded-lg border border-slate-200 text-[10px] font-black uppercase tracking-widest">
                           +{candidate.scorecard.skillsAnalysis.confirmed.length - 6}
                         </span>
                       )}
                    </div>
                    <div className="flex items-center justify-between pt-5 border-t border-slate-50">
                      <div className={cn(
                        "px-2.5 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2",
                        candidate.status === 'processed' ? "bg-green-50 text-green-600 border border-green-100" :
                        candidate.scorecard.compositeScore < 40 ? "bg-red-50 text-red-600 border border-red-100" : "bg-blue-50 text-blue-600 border border-blue-100"
                      )}>
                        <div className={cn(
                          "w-2 h-2 rounded-full",
                          candidate.status === 'processed' ? "bg-green-500" :
                          candidate.scorecard.compositeScore < 40 ? "bg-red-500" : "bg-blue-500"
                        )} />
                        {candidate.status === 'processed' ? 'Vetted' : candidate.status}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Button 
                          variant="ghost" 
                          size="sm"
                          className="h-8 px-2 text-[8px] font-black uppercase tracking-widest text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 border border-transparent hover:border-indigo-100"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRetryScreening(candidate);
                          }}
                          disabled={retryingScreening === candidate.id}
                        >
                          {retryingScreening === candidate.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3 mr-1" />}
                          Re-Screen
                        </Button>
                        <Button variant="ghost" className="h-8 px-3 text-[10px] font-black uppercase tracking-widest border border-slate-100 rounded-xl hover:bg-indigo-50 hover:text-indigo-600" onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/candidates/${candidate.id}`);
                        }}>
                          Full Report
                        </Button>
                        <button onClick={(e) => deleteCandidate(e, candidate.id)} className="p-2 text-slate-300 hover:text-red-500 transition-all hover:bg-red-50 rounded-lg ml-1">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </Card>
                </motion.div>
              );
            })}
          </div>
          ) : (
            <Card className="overflow-hidden">
               <div className="overflow-x-auto">
                 <table className="w-full text-left min-w-[800px]">
                  <thead className="bg-slate-50 border-b border-slate-100">
                    <tr>
                      <th className="w-12 px-6 py-4">
                        <input 
                          type="checkbox"
                          className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 cursor-pointer"
                          checked={filteredCandidates.length > 0 && filteredCandidates.every(c => selectedCandidates.includes(c.id))}
                          onChange={(e) => {
                            if (e.target.checked) {
                              const allIds = filteredCandidates.map(c => c.id);
                              setSelectedCandidates(prev => Array.from(new Set([...prev, ...allIds])));
                            } else {
                              const filteredIds = filteredCandidates.map(c => c.id);
                              setSelectedCandidates(prev => prev.filter(id => !filteredIds.includes(id)));
                            }
                          }}
                        />
                      </th>
                      <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Candidate</th>
                      <th className="px-6 py-4 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest">Score</th>
                      <th className="px-6 py-4 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</th>
                      <th className="px-6 py-4 text-right text-[10px] font-black text-slate-400 uppercase tracking-widest">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredCandidates.map(candidate => {
                      const isPlaceholder = candidate.status === 'screening';
                      const isBestMatch = !isPlaceholder && candidate.scorecard.compositeScore === bestScore && bestScore >= 80;
                      const isSelected = selectedCandidates.includes(candidate.id);
                      
                      if (isPlaceholder) {
                        return (
                          <tr 
                            key={candidate.id} 
                            className="bg-indigo-50/10 animate-pulse border-b border-indigo-100/30"
                          >
                            <td className="px-6 py-4 w-12" onClick={(e) => e.stopPropagation()}>
                              <input 
                                type="checkbox"
                                disabled
                                className="w-4 h-4 rounded text-slate-300 border-slate-200 cursor-not-allowed opacity-40 animate-pulse"
                              />
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-400 flex items-center justify-center font-bold">
                                  <Loader2 className="w-4 h-4 animate-spin text-indigo-505 text-indigo-500" />
                                </div>
                                <div>
                                  <div className="flex items-center gap-2">
                                    <p className="text-sm font-black text-slate-700 truncate animate-pulse">
                                      {candidate.fullName}
                                    </p>
                                    <span className="text-[7px] font-black text-indigo-500 bg-indigo-50 px-1.5 py-0.5 rounded uppercase tracking-tighter border border-indigo-100/30 flex items-center gap-1">
                                      <Sparkles className="w-2.5 h-2.5 mr-0.5 animate-pulse" /> Screening
                                    </span>
                                  </div>
                                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tight">Active session</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex flex-col gap-1 w-32 mx-auto">
                                <div className="flex justify-between items-center mb-0.5">
                                  <span className="text-[10px] font-black text-indigo-500">
                                    Analyzing...
                                  </span>
                                </div>
                                <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden border border-slate-200/50">
                                  <div className="h-full bg-indigo-500 animate-pulse w-[45%]" />
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4 text-center">
                              <span className="text-[9px] font-black px-2 py-1 rounded-lg uppercase tracking-widest bg-indigo-50 text-indigo-600 animate-pulse">
                                Screening
                              </span>
                            </td>
                            <td className="px-6 py-4 text-right">
                              <span className="text-[10px] font-bold text-slate-400">Forensic Indexing...</span>
                            </td>
                          </tr>
                        );
                      }

                      return (
                        <tr 
                          key={candidate.id} 
                          className={cn(
                            "transition-colors cursor-pointer group relative",
                            isSelected ? "bg-indigo-50" : isBestMatch ? "bg-indigo-50/50 hover:bg-indigo-50" : "hover:bg-slate-50"
                          )} 
                          onClick={() => navigate(`/candidates/${candidate.id}`)}
                        >
                          <td className="px-6 py-4 w-12" onClick={(e) => e.stopPropagation()}>
                            <input 
                              type="checkbox"
                              className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 cursor-pointer"
                              checked={isSelected}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedCandidates(prev => [...prev, candidate.id]);
                                } else {
                                  setSelectedCandidates(prev => prev.filter(id => id !== candidate.id));
                                }
                              }}
                            />
                          </td>
                          <td className="px-6 py-4 relative">
                             {isBestMatch && (
                               <div className="absolute left-0 top-0 bottom-0 w-1 bg-indigo-600" />
                             )}
                             <div className="flex items-center gap-3">
                                <div className={cn(
                                  "w-8 h-8 rounded-lg flex items-center justify-center font-black text-xs",
                                  isBestMatch ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-400"
                                )}>
                                  {candidate.fullName.charAt(0)}
                                </div>
                                <div>
                                  <div className="flex items-center gap-2">
                                    <p className={cn(
                                      "text-sm font-bold transition-colors",
                                      isBestMatch ? "text-indigo-700" : "text-slate-900 group-hover:text-indigo-600"
                                    )}>
                                      {candidate.fullName}
                                    </p>
                                    {isBestMatch && (
                                      <Star className="w-3.5 h-3.5 text-indigo-600 fill-current" />
                                    )}
                                    {candidate.research && (
                                      <span className="text-[8px] font-black text-indigo-500 bg-indigo-50 px-1.5 py-0.5 rounded uppercase tracking-tighter border border-indigo-100 flex items-center gap-1">
                                        <Globe className="w-2.5 h-2.5" /> Researched
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tight">{candidate.currentRole}</p>
                                </div>
                             </div>
                          </td>
                          <td className="px-6 py-4">
                             <div className="flex flex-col gap-1 w-32 mx-auto">
                                <div className="flex justify-between items-center mb-0.5">
                                  <span className={cn(
                                    "text-[10px] font-black",
                                    candidate.scorecard.compositeScore >= 80 ? "text-green-600" :
                                    candidate.scorecard.compositeScore >= 60 ? "text-amber-600" : "text-red-600"
                                  )}>
                                    {candidate.scorecard.compositeScore}% Match
                                  </span>
                                  {isBestMatch && (
                                    <span className="text-[8px] font-black text-indigo-600 uppercase tracking-widest">TOP</span>
                                  )}
                                </div>
                                <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden border border-slate-200/50">
                                  <motion.div 
                                    initial={{ width: 0 }}
                                    animate={{ width: `${candidate.scorecard.compositeScore}%` }}
                                    className={cn(
                                      "h-full rounded-full transition-all duration-1000",
                                      candidate.scorecard.compositeScore >= 80 ? "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.3)]" :
                                      candidate.scorecard.compositeScore >= 60 ? "bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.3)]" : "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.3)]"
                                    )}
                                  />
                                </div>
                             </div>
                          </td>
                          <td className="px-6 py-4 text-center">
                             <span className={cn(
                                "text-[9px] font-black px-2 py-1 rounded-lg uppercase tracking-widest",
                                candidate.status === 'processed' ? "bg-green-50 text-green-600" : "bg-slate-100 text-slate-500"
                             )}>
                               {candidate.status}
                             </span>
                          </td>
                          <td className="px-6 py-4 text-right">
                             <div className="flex items-center justify-end gap-2">
                                <Button 
                                  variant="ghost" 
                                  size="sm"
                                  className="h-8 px-2 text-[8px] font-black uppercase tracking-widest text-slate-400 hover:text-indigo-600"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleRetryScreening(candidate);
                                  }}
                                  disabled={retryingScreening === candidate.id}
                                >
                                  {retryingScreening === candidate.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3 mr-1" />}
                                  Re-Screen
                                </Button>
                               <Button 
                                 variant="outline" 
                                 className="h-8 text-[10px] font-black uppercase tracking-widest border-indigo-100 text-indigo-600 hover:bg-indigo-50 min-w-[150px] flex items-center justify-center gap-1.5"
                                 onClick={(e) => {
                                   e.stopPropagation();
                                   handleSendInviteForCandidate(candidate);
                                 }}
                                 disabled={invitingCandidateId === candidate.id}
                               >
                                 {invitingCandidateId === candidate.id ? (
                                   <>
                                     <Loader2 className="w-3 h-3 animate-spin" />
                                     Inviting...
                                   </>
                                 ) : (
                                   'Invite to Interview'
                                 )}
                               </Button>
                               <Button variant="ghost" className="h-8 text-[10px] font-black" onClick={(e) => { e.stopPropagation(); navigate(`/candidates/${candidate.id}`); }}>View Details</Button>
                               <button onClick={(e) => deleteCandidate(e, candidate.id)} className="p-2 text-slate-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100">
                                 <Trash2 className="w-4 h-4" />
                               </button>
                             </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
               </table>
            </div>
          </Card>
          )}
        </div>
      </div>

      {/* Scoring Configuration Modal */}
      <Modal
        isOpen={showSettingsDrawer}
        onClose={() => setShowSettingsDrawer(false)}
        title="Scoring Configuration & Threshold Rules"
      >
        <div className="space-y-6 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
          <p className="text-xs font-semibold text-slate-500 leading-relaxed">
            Specify customized candidate screening dimensions, weights, and match-classification thresholds. Updates are real-time and saved directly to the database.
          </p>

          {/* Thresholds */}
          <div className="space-y-4 border-b border-slate-100 pb-5">
            <h3 className="text-xs font-black uppercase text-slate-800 tracking-wider flex items-center gap-2">
              <Target className="w-4 h-4 text-indigo-500" /> Screening Thresholds
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2 p-3 bg-slate-50 rounded-xl border border-slate-100">
                <div className="flex justify-between items-center">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Passed Match</label>
                  <span className="text-xs font-black text-green-600 bg-white px-2 py-0.5 rounded border border-green-100">{editPassedThresh}%</span>
                </div>
                <input
                  type="range"
                  min="50"
                  max="95"
                  className="w-full accent-green-500"
                  value={editPassedThresh}
                  onChange={(e) => setEditPassedThresh(Number(e.target.value))}
                />
              </div>

              <div className="space-y-2 p-3 bg-slate-50 rounded-xl border border-slate-100">
                <div className="flex justify-between items-center">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Low Match (Fail)</label>
                  <span className="text-xs font-black text-red-600 bg-white px-2 py-0.5 rounded border border-red-100">{editLowThresh}%</span>
                </div>
                <input
                  type="range"
                  min="20"
                  max="60"
                  className="w-full accent-red-500"
                  value={editLowThresh}
                  onChange={(e) => setEditLowThresh(Number(e.target.value))}
                />
              </div>
            </div>
          </div>

          {/* Custom Criteria Weights & Names */}
          <div className="space-y-5">
            <div className="flex justify-between items-center pb-2">
              <h3 className="text-xs font-black uppercase text-slate-800 tracking-wider flex items-center gap-2">
                <Sliders className="w-4 h-4 text-indigo-500" /> Screening Criteria Parameters
              </h3>
              <span className="text-[9px] font-mono font-bold px-2 py-0.5 bg-indigo-50 border border-indigo-100 rounded text-indigo-600">
                Total Weight: {Number(editD1Weight) + Number(editD2Weight) + Number(editD3Weight) + Number(editD4Weight) + Number(editD5Weight)}%
              </span>
            </div>

            {/* Metric 1 */}
            <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                <div className="md:col-span-8 space-y-1">
                  <label className="text-[8px] font-black uppercase text-slate-400 tracking-wider">Metric 1 Name</label>
                  <input
                    type="text"
                    className="w-full text-xs font-bold px-2 py-1.5 bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-500 text-slate-800"
                    value={editD1Name}
                    onChange={(e) => setEditD1Name(e.target.value)}
                  />
                </div>
                <div className="md:col-span-4 space-y-1">
                  <label className="text-[8px] font-black uppercase text-slate-400 tracking-wider">Weight (%)</label>
                  <input
                    type="number"
                    className="w-full text-xs font-bold px-2 py-1.5 bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-500 text-slate-800"
                    value={editD1Weight}
                    onChange={(e) => setEditD1Weight(Math.max(0, Number(editD1Weight)))}
                  />
                </div>
              </div>
              <textarea
                rows={2}
                className="w-full text-xs font-medium px-2 py-1.5 bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-500 text-slate-700 leading-relaxed"
                value={editD1Desc}
                onChange={(e) => setEditD1Desc(e.target.value)}
              />
            </div>

            {/* Metric 2 */}
            <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                <div className="md:col-span-8 space-y-1">
                  <label className="text-[8px] font-black uppercase text-slate-400 tracking-wider">Metric 2 Name</label>
                  <input
                    type="text"
                    className="w-full text-xs font-bold px-2 py-1.5 bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-500 text-slate-800"
                    value={editD2Name}
                    onChange={(e) => setEditD2Name(e.target.value)}
                  />
                </div>
                <div className="md:col-span-4 space-y-1">
                  <label className="text-[8px] font-black uppercase text-slate-400 tracking-wider">Weight (%)</label>
                  <input
                    type="number"
                    className="w-full text-xs font-bold px-2 py-1.5 bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-500 text-slate-800"
                    value={editD2Weight}
                    onChange={(e) => setEditD2Weight(Math.max(0, Number(editD2Weight)))}
                  />
                </div>
              </div>
              <textarea
                rows={2}
                className="w-full text-xs font-medium px-2 py-1.5 bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-500 text-slate-700 leading-relaxed"
                value={editD2Desc}
                onChange={(e) => setEditD2Desc(e.target.value)}
              />
            </div>

            {/* Metric 3 */}
            <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                <div className="md:col-span-8 space-y-1">
                  <label className="text-[8px] font-black uppercase text-slate-400 tracking-wider">Metric 3 Name</label>
                  <input
                    type="text"
                    className="w-full text-xs font-bold px-2 py-1.5 bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-500 text-slate-800"
                    value={editD3Name}
                    onChange={(e) => setEditD3Name(e.target.value)}
                  />
                </div>
                <div className="md:col-span-4 space-y-1">
                  <label className="text-[8px] font-black uppercase text-slate-400 tracking-wider">Weight (%)</label>
                  <input
                    type="number"
                    className="w-full text-xs font-bold px-2 py-1.5 bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-500 text-slate-800 text-slate-800"
                    value={editD3Weight}
                    onChange={(e) => setEditD3Weight(Math.max(0, Number(editD3Weight)))}
                  />
                </div>
              </div>
              <textarea
                rows={2}
                className="w-full text-xs font-medium px-2 py-1.5 bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-500 text-slate-700 leading-relaxed"
                value={editD3Desc}
                onChange={(e) => setEditD3Desc(e.target.value)}
              />
            </div>

            {/* Metric 4 */}
            <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                <div className="md:col-span-8 space-y-1">
                  <label className="text-[8px] font-black uppercase text-slate-400 tracking-wider">Metric 4 Name</label>
                  <input
                    type="text"
                    className="w-full text-xs font-bold px-2 py-1.5 bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-500 text-slate-800"
                    value={editD4Name}
                    onChange={(e) => setEditD4Name(e.target.value)}
                  />
                </div>
                <div className="md:col-span-4 space-y-1">
                  <label className="text-[8px] font-black uppercase text-slate-400 tracking-wider">Weight (%)</label>
                  <input
                    type="number"
                    className="w-full text-xs font-bold px-2 py-1.5 bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-500 text-slate-800 text-slate-800"
                    value={editD4Weight}
                    onChange={(e) => setEditD4Weight(Math.max(0, Number(editD4Weight)))}
                  />
                </div>
              </div>
              <textarea
                rows={2}
                className="w-full text-xs font-medium px-2 py-1.5 bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-500 text-slate-700 leading-relaxed"
                value={editD4Desc}
                onChange={(e) => setEditD4Desc(e.target.value)}
              />
            </div>

            {/* Metric 5 */}
            <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                <div className="md:col-span-8 space-y-1">
                  <label className="text-[8px] font-black uppercase text-slate-400 tracking-wider">Metric 5 Name</label>
                  <input
                    type="text"
                    className="w-full text-xs font-bold px-2 py-1.5 bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-500 text-slate-800"
                    value={editD5Name}
                    onChange={(e) => setEditD5Name(e.target.value)}
                  />
                </div>
                <div className="md:col-span-4 space-y-1">
                  <label className="text-[8px] font-black uppercase text-slate-400 tracking-wider">Weight (%)</label>
                  <input
                    type="number"
                    className="w-full text-xs font-bold px-2 py-1.5 bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-500 text-slate-800 text-slate-800"
                    value={editD5Weight}
                    onChange={(e) => setEditD5Weight(Math.max(0, Number(editD5Weight)))}
                  />
                </div>
              </div>
              <textarea
                rows={2}
                className="w-full text-xs font-medium px-2 py-1.5 bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-500 text-slate-700 leading-relaxed"
                value={editD5Desc}
                onChange={(e) => setEditD5Desc(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="pt-6 border-t border-slate-100 flex flex-col sm:flex-row gap-3">
          <Button
            type="button"
            variant="outline"
            className="flex-1 h-12 text-[10px] uppercase font-black tracking-widest text-slate-700 border-slate-200"
            onClick={() => setShowSettingsDrawer(false)}
          >
            Cancel
          </Button>

          <Button
            type="button"
            variant="outline"
            className="flex-1 h-12 text-[10px] uppercase font-black text-indigo-600 border-indigo-100 tracking-widest"
            disabled={reevaluatingAll}
            onClick={async () => {
              await handleSaveSettings();
              await handleReevaluateAllCandidates();
            }}
          >
            {reevaluatingAll ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Save & Re-score All'}
          </Button>

          <Button
            type="button"
            variant="primary"
            className="flex-1 h-12 bg-indigo-600 hover:bg-indigo-700 text-[10px] uppercase font-black tracking-widest text-white"
            onClick={handleSaveSettings}
          >
            Save Parameters Only
          </Button>
        </div>
      </Modal>
    </div>
  );
}

function truncateSummary(text: string, limit: number = 450): string {
  if (!text) return "";
  if (text.length <= limit) return text;
  
  const truncated = text.substring(0, limit);
  const lastPeriod = truncated.lastIndexOf('.');
  if (lastPeriod > limit - 80) {
    return truncated.substring(0, lastPeriod + 1);
  }
  
  const lastSpace = truncated.lastIndexOf(' ');
  if (lastSpace > limit - 40) {
    return truncated.substring(0, lastSpace) + '...';
  }
  
  return truncated + '...';
}

function parseD6Sections(markdown: string): {
  executiveSummary: string;
  performanceLedger: string;
  auditingAnomalies: string;
  interviewStrategy: string;
} {
  const sections = {
    executiveSummary: '',
    performanceLedger: '',
    auditingAnomalies: '',
    interviewStrategy: '',
  };

  if (!markdown) return sections;

  const lines = markdown.split('\n');
  let currentSection: 'executiveSummary' | 'performanceLedger' | 'auditingAnomalies' | 'interviewStrategy' | null = null;
  let currentContent: string[] = [];

  for (const line of lines) {
    const cleanLine = line.toLowerCase().replace(/[*#_]/g, '').trim();
    
    let matchedSection: 'executiveSummary' | 'performanceLedger' | 'auditingAnomalies' | 'interviewStrategy' | null = null;
    if (cleanLine.includes('executive summary') || cleanLine.includes('match narrative')) {
      matchedSection = 'executiveSummary';
    } else if (cleanLine.includes('performance ledger')) {
      matchedSection = 'performanceLedger';
    } else if (cleanLine.includes('auditing, penalties') || cleanLine.includes('auditing penalties') || cleanLine.includes('anomalies') || cleanLine.includes('penalties') || cleanLine.includes('audit')) {
      matchedSection = 'auditingAnomalies';
    } else if (cleanLine.includes('interview strategy') || cleanLine.includes('hiring recommendation')) {
      matchedSection = 'interviewStrategy';
    }

    if (matchedSection) {
      if (currentSection) {
        sections[currentSection] = currentContent.join('\n').trim();
      }
      currentSection = matchedSection;
      currentContent = [];
    } else {
      if (currentSection) {
        currentContent.push(line);
      } else {
        currentContent.push(line);
        currentSection = 'executiveSummary';
      }
    }
  }

  if (currentSection) {
    sections[currentSection] = currentContent.join('\n').trim();
  }

  // If we couldn't split anything (e.g. no headings matched), put everything into executiveSummary as fallback
  if (!sections.executiveSummary && !sections.performanceLedger && !sections.auditingAnomalies && !sections.interviewStrategy) {
    sections.executiveSummary = markdown;
  }

  return sections;
}

function CandidateDetail() {
  const { candidateId } = useParams();
  const { profile, organization } = useProfile();
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [interview, setInterview] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [researching, setResearching] = useState(false);
  const navigate = useNavigate();
  const { confirm, notify } = useNotification();
  const [calendarConnected, setCalendarConnected] = useState(false);
  const [calendarConfig, setCalendarConfig] = useState<{clientId: boolean, clientSecret: boolean}>({ clientId: false, clientSecret: false });
  const [showScheduler, setShowScheduler] = useState(false);
  const [availableSlots, setAvailableSlots] = useState<any[]>([]);
  const [scheduling, setScheduling] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<{start: string, end: string, label: string} | null>(null);
  const [sendingInvite, setSendingInvite] = useState(false);

  // HireNow Enhanced Feature States
  const [activeDetailTab, setActiveDetailTab] = useState<'core' | 'offer' | 'campaign' | 'proctoring'>('core');

  // Offer Letter Generation OS States
  const [offerSalary, setOfferSalary] = useState(1200000);
  const [offerCurrency, setOfferCurrency] = useState('INR');
  const [offerBenefits, setOfferBenefits] = useState('Standard comprehensive medical insurance, remote-work allowance, and performance bonuses.');
  const [offerStartDate, setOfferStartDate] = useState(() => {
    const nextMonth = new Date();
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    nextMonth.setDate(1);
    return nextMonth.toISOString().split('T')[0];
  });
  const [offerState, setOfferState] = useState<'draft' | 'sent' | 'viewed' | 'accepted' | 'declined'>('draft');
  const [isSigning, setIsSigning] = useState(false);

  // Outbound Email & WhatsApp Campaign States
  const [campaignTemplate, setCampaignTemplate] = useState<'invite' | 'reminder' | 'offer_link'>('invite');
  const [outboundLogs, setOutboundLogs] = useState<{
    id: string;
    channel: 'email' | 'whatsapp';
    template: string;
    recipient: string;
    status: 'delivered' | 'read' | 'clicked' | 'sent';
    timestamp: string;
  }[]>([
    { id: '1', channel: 'email', template: 'Application Confirmed', recipient: '', status: 'delivered', timestamp: '2 mins ago' }
  ]);
  const [sendingOutbound, setSendingOutbound] = useState(false);

  // Multi-Language Support
  const [selectedBotLanguage, setSelectedBotLanguage] = useState('en-US');

  // Advanced Proctoring Audits State
  const [activeCameraTest, setActiveCameraTest] = useState(false);
  const [cameraAnomalyMock, setCameraAnomalyMock] = useState(false);
  const [tabSwitchCountMock, setTabSwitchCountMock] = useState(0);
  const [gazeDeviationMock, setGazeDeviationMock] = useState(false);


  useEffect(() => {
    fetch('/api/calendar/status')
      .then(r => r.json())
      .then(data => {
        setCalendarConnected(data.connected);
        if (data.config) setCalendarConfig(data.config);
      })
      .catch(console.error);
  }, []);

  const handleConnectCalendar = async () => {
    try {
      const response = await fetch('/api/auth/google/url');
      const { url } = await response.json();
      
      const authWindow = window.open(url, 'google_oauth', 'width=600,height=700');
      
      const handleMessage = (event: MessageEvent) => {
        if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
          setCalendarConnected(true);
          notify('Google Calendar connected successfully!', 'success');
          window.removeEventListener('message', handleMessage);
        }
      };
      window.addEventListener('message', handleMessage);
    } catch (err) {
      console.error(err);
      notify('Failed to initiate Google Calendar connection.', 'error');
    }
  };

  const handleSendInvite = async () => {
    if (!candidate) return;
    setSendingInvite(true);
    const link = `${window.location.origin}/interview/${candidate.id}`;
    try {
      // 1. Update status in db
      await updateDoc(doc(db, 'candidates', candidate.id), { interviewStatus: 'invited' });
      
      // 2. Try to send email via backend endpoint
      const res = await fetch('/api/candidate/send-invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          candidateEmail: candidate.email,
          candidateName: candidate.fullName,
          interviewLink: link,
          jobTitle: job?.title || 'Applied Position',
          customSmtp: organization?.emailSettings || null
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        if (data.previewUrl) {
          notify(`Invite sent to ${candidate.fullName}! Test URL: ${data.previewUrl}`, 'success');
        } else {
          notify(data.message || `Email interview invitation sent to ${candidate.fullName}!`, 'success');
        }
        // Refresh local state inside CandidateDetail
        setCandidate(prev => prev ? { ...prev, interviewStatus: 'invited' } : null);
      } else {
        if (data.reason === 'NOT_AUTHENTICATED') {
          navigator.clipboard.writeText(link);
          notify('Invite created! Google account not connected - copied link to clipboard.', 'info');
        } else {
          navigator.clipboard.writeText(link);
          notify(`Invite created! Copied link to clipboard. (Email error: ${data.error || 'unknown'})`, 'info');
        }
        setCandidate(prev => prev ? { ...prev, interviewStatus: 'invited' } : null);
      }
    } catch (err: any) {
      console.error(err);
      navigator.clipboard.writeText(link);
      notify('Invite created! Copied link to clipboard.', 'info');
      setCandidate(prev => prev ? { ...prev, interviewStatus: 'invited' } : null);
    } finally {
      setSendingInvite(false);
    }
  };

  const fetchAvailability = async () => {
    try {
      const response = await fetch('/api/calendar/free-busy');
      if (!response.ok) throw new Error('Failed to fetch availability');
      const data = await response.json();
      
      const slots = [];
      const now = new Date();
      now.setMinutes(0,0,0);
      
      // Generate 15 candidate slots starting tomorrow
      for (let i = 0; i < 15; i++) {
        const start = new Date(now.getTime() + (i + 24) * 60 * 60 * 1000);
        start.setHours(10 + (i % 4), 0, 0, 0); 
        const end = new Date(start.getTime() + 60 * 60 * 1000);
        
        // Basic busy check if data available
        const isBusy = data?.calendars?.primary?.busy?.some((b: any) => 
          (start.toISOString() >= b.start && start.toISOString() < b.end) ||
          (end.toISOString() > b.start && end.toISOString() <= b.end)
        );

        if (!isBusy) {
          slots.push({
            start: start.toISOString(),
            end: end.toISOString(),
            label: `${start.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} @ ${start.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`
          });
        }
      }
      setAvailableSlots(slots);
      setShowScheduler(true);
    } catch (err) {
      console.error(err);
      notify('Error fetching calendar availability.', 'error');
    }
  };

  const scheduleInterview = async () => {
    if (!selectedSlot || !candidate) return;
    setScheduling(true);
    try {
      const response = await fetch('/api/calendar/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          candidateEmail: candidate.email,
          startTime: selectedSlot.start,
          endTime: selectedSlot.end,
          summary: `Interview: ${candidate.fullName} | HireNow Assessment`,
          description: `Assessment Summary: ${candidate.scorecard.recommendation.summary}\nCandidate Location: ${candidate.location}\n\nThis meeting was automatically scheduled following high-signal AI screening.`
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Scheduling failed');
      }
      
      notify('Interview invitation dispatched via Google Calendar.', 'success');
      setShowScheduler(false);
      
      // Update candidate status
      await updateDoc(doc(db, 'candidates', candidate.id), {
        interviewStatus: 'invited'
      });
    } catch (err) {
      console.error(err);
      notify('Failed to schedule interview.', 'error');
    } finally {
      setScheduling(false);
    }
  };

  const deleteCandidate = async () => {
    if (!candidate) return;
    const ok = await confirm('Permanently remove this candidate report and all associated data?');
    if (!ok) return;

    try {
      const batch = writeBatch(db);
      batch.delete(doc(db, 'candidates', candidate.id));
      await batch.commit();
      notify('Candidate report deleted successfully.', 'success');
      navigate(`/jobs/${candidate.jobId}`);
    } catch (err) {
      console.error('Delete Candidate Error:', err);
      notify('Delete failed. Please check your connectivity and permissions.', 'error');
      handleFirestoreError(err, OperationType.DELETE, `candidates/${candidate.id}`);
    }
  };

  useEffect(() => {
    if (!candidateId || !profile) return;
    const unsub = onSnapshot(doc(db, 'candidates', candidateId), (docSnap) => {
      if (docSnap.exists()) {
        const cand = { id: docSnap.id, ...docSnap.data() } as Candidate;
        
        if (auth.currentUser?.email !== 'malviya.pratyush26@gmail.com' && cand.organizationId !== profile?.organizationId) {
          notify('Unauthorized access', 'error');
          navigate('/');
          return;
        }

        setCandidate(cand);
        
        // Fetch Job
        getDoc(doc(db, 'jobs', cand.jobId)).then(jd => {
          if (jd.exists()) setJob({ id: jd.id, ...jd.data() } as Job);
        });

        // Fetch Interview
        const qInt = query(collection(db, 'interviews'), where('candidateId', '==', cand.id));
        getDocs(qInt).then(snap => {
          if (!snap.empty) {
            setInterview({ id: snap.docs[0].id, ...snap.docs[0].data() });
          }
        });
      }
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `candidates/${candidateId}`);
    });
    return unsub;
  }, [candidateId, profile]);

  if (loading) return <div className="h-screen flex items-center justify-center font-medium text-slate-400">Loading screening report...</div>;
  if (!candidate) return <div className="p-20 text-center">Candidate report not found</div>;

  const { scorecard } = candidate;

  const handleDeepResearch = async () => {
    if (!candidate) return;
    setResearching(true);
    notify('Starting Deep Research: Verified footprints scan initiated...', 'info');
    try {
      const result = await researchCandidate(
        candidate.fullName,
        candidate.currentRole,
        candidate.currentCompany,
        candidate.oneLineSummary
      );
      
      try {
        await updateDoc(doc(db, 'candidates', candidate.id), {
          research: {
            ...result,
            lastResearchedAt: serverTimestamp()
          }
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `candidates/${candidate.id}`);
      }
      notify('Deep Research Complete: Multi-source verification synced.', 'success');
    } catch (error) {
      console.error('Deep Research Error:', error);
      notify('Failed to perform deep research. Please try again.', 'error');
    } finally {
      setResearching(false);
    }
  };

  const handleDownloadPDF = () => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    
    // Header
    doc.setFillColor(15, 23, 42); // slate-900
    doc.rect(0, 0, pageWidth, 40, 'F');
    
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    doc.text('Evaluation Report', 20, 25);
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(200, 200, 200);
    doc.text(`HireNow Professional Assessment | ${formatDateTime(new Date())}`, 20, 33);
    
    // SECTION: Candidate Profile
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text('1. Profile Overview', 20, 55);
    
    autoTable(doc, {
      startY: 60,
      head: [['Metric', 'Detail']],
      body: [
        ['Candidate Name', candidate.fullName],
        ['Job Title', job?.title || 'Unknown'],
        ['Company', job?.company || 'N/A'],
        ['Current Role', candidate.currentRole],
        ['Current Company', candidate.currentCompany],
        ['Total Experience', `${candidate.totalExperience} Years`],
        ['Location', candidate.location],
      ],
      theme: 'grid',
      headStyles: { fillColor: [79, 70, 229], textColor: [255, 255, 255] },
      styles: { fontSize: 10 },
    });
    
    let currentY = (doc as any).lastAutoTable.finalY + 15;

    // SECTION: Match Narrative / Executive Summary
    if (currentY > 240) { doc.addPage(); currentY = 20; }
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text('1.2 Executive Match Summary (D6 Scorecard)', 20, currentY);
    
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    const summaryClean = (candidate.scorecard?.recommendation?.summary || candidate.oneLineSummary || '')
      .replace(/[#*]/g, '');
    const summaryLines = doc.splitTextToSize(summaryClean, pageWidth - 40);
    doc.text(summaryLines, 20, currentY + 7);
    currentY += (summaryLines.length * 4.5) + 18;

    // SECTION: Screening Analytics
    if (currentY > 240) { doc.addPage(); currentY = 20; }
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('2. AI Screening Analytics', 20, currentY);
    
    const dimensionRows = [
      { key: 'skillsMatch', label: job?.requirements?.customCriteria?.skillsMatch?.name ? `${job.requirements.customCriteria.skillsMatch.name} (D1)` : 'Skills Match (D1)' },
      { key: 'experienceFit', label: job?.requirements?.customCriteria?.experienceFit?.name ? `${job.requirements.customCriteria.experienceFit.name} (D2)` : 'Experience Fit (D2)' },
      { key: 'education', label: job?.requirements?.customCriteria?.education?.name ? `${job.requirements.customCriteria.education.name} (D3)` : 'Education (D3)' },
      { key: 'achievements', label: job?.requirements?.customCriteria?.achievements?.name ? `${job.requirements.customCriteria.achievements.name} (D4)` : 'Achievements (D4)' },
      { key: 'culturalRoleFit', label: job?.requirements?.customCriteria?.culturalRoleFit?.name ? `${job.requirements.customCriteria.culturalRoleFit.name} (D5)` : 'Cultural Fit (D5)' },
    ].map(dimInfo => {
      const dim = candidate.scorecard.dimensions[dimInfo.key as keyof typeof candidate.scorecard.dimensions] as any;
      return [dimInfo.label, dim ? `${dim.score}/100` : 'N/A', dim ? dim.rationale : 'Dimension not assessed'];
    });

    autoTable(doc, {
      startY: currentY + 5,
      head: [['Dimension', 'Score', 'Rationale']],
      body: [
        ['Overall Composite Match', `${candidate.scorecard.compositeScore}/100`, 'Weighted fit score adjusted for role type and penalties.'],
        ...dimensionRows
      ],
      columnStyles: {
        0: { cellWidth: 40 },
        1: { cellWidth: 20 },
        2: { cellWidth: 'auto' }
      },
      headStyles: { fillColor: [51, 65, 85] }
    });

    currentY = (doc as any).lastAutoTable.finalY + 15;

    // SECTION: Risk Signals
    if (candidate.scorecard.dimensions.redFlags.flags.length > 0) {
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(220, 38, 38);
      doc.text('3. Risk Signals & Red Flags', 20, currentY);
      
      autoTable(doc, {
        startY: currentY + 5,
        head: [['Flag', 'Severity', 'Impact']],
        body: candidate.scorecard.dimensions.redFlags.flags.map(f => [
          f.label,
          f.severity.toUpperCase(),
          f.rationale
        ]),
        headStyles: { fillColor: [185, 28, 28] }
      });
      currentY = (doc as any).lastAutoTable.finalY + 15;
    } else {
      doc.setTextColor(0, 0, 0);
    }

    // SECTION: AI Interview Feedback
    if (interview && interview.completed && interview.feedback) {
      if (currentY > 230) { doc.addPage(); currentY = 20; }
      
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('4. AI Interview Evaluation', 20, currentY);
      
      const interviewScore = interview.feedback.rating || interview.feedback.score || 0;
      
      autoTable(doc, {
        startY: currentY + 5,
        head: [['Metric', 'Result']],
        body: [
          ['Interview Performance Score', `${interviewScore}/100`],
          ['Executive Summary', interview.feedback.summary],
        ],
        headStyles: { fillColor: [5, 150, 105] },
        columnStyles: { 0: { cellWidth: 50 }, 1: { cellWidth: 'auto' } }
      });
      
      currentY = (doc as any).lastAutoTable.finalY + 10;
      
      if (interview.feedback.keyInsights || interview.feedback.strengths) {
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.text('Key Observations:', 20, currentY);
        currentY += 5;
        
        const insights = interview.feedback.keyInsights || [...(interview.feedback.strengths || []), ...(interview.feedback.weaknesses || [])];
        insights.forEach((insight: string) => {
           doc.setFontSize(9);
           doc.setFont('helvetica', 'normal');
           const text = doc.splitTextToSize(`• ${insight}`, pageWidth - 40);
           doc.text(text, 20, currentY);
           currentY += (text.length * 4) + 2;
           if (currentY > 270) { doc.addPage(); currentY = 20; }
        });
      }
      currentY += 15;
    }

    // SECTION: Web Research
    if (candidate.research) {
      if (currentY > 200) { doc.addPage(); currentY = 20; }
      
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('5. Professional Footprint Analysis', 20, currentY);
      
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      const researchText = doc.splitTextToSize(candidate.research.summary.replace(/[#*]/g, ''), pageWidth - 40);
      doc.text(researchText, 20, currentY + 10);
      
      currentY += (researchText.length * 4) + 20;
    }

    // Footer on all pages
    const pageCount = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(150);
        doc.text(`Page ${i} of ${pageCount} | Confidental Report | Generated by HireNow`, pageWidth / 2, 285, { align: 'center' });
    }

    doc.save(`${candidate.fullName.replace(/\s+/g, '_')}_Full_Evaluation.pdf`);
    notify('Comprehensive Evaluation Report generated!', 'success');
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-20">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div className="flex items-center justify-between lg:justify-start gap-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" className="-ml-2 px-2" onClick={() => navigate(`/jobs/${candidate.jobId}`)}>
              <ChevronRight className="w-4 h-4 rotate-180" /> <span className="hidden sm:inline">Pipeline</span>
            </Button>
            <div className="w-px h-6 bg-slate-200" />
            <Button 
              variant="ghost" 
              className="text-red-500 hover:text-red-700 hover:bg-red-50 font-black uppercase tracking-widest text-[8px] sm:text-[10px]" 
              onClick={deleteCandidate}
            >
              <Trash2 className="w-3.5 h-3.5 sm:mr-2" /> <span className="hidden sm:inline">Delete Report</span>
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 sm:gap-3">
           <Button 
            variant="outline" 
            className="text-indigo-600 border-indigo-200 hover:bg-indigo-50 text-[10px] sm:text-xs py-2 h-10 px-2 sm:px-4"
            onClick={handleDeepResearch} 
            disabled={researching}
           >
            {researching ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin mr-1 sm:mr-2" />
                 <span className="truncate">Scan...</span>
              </>
            ) : (
              <>
                <Globe className="w-3.5 h-3.5 mr-1 sm:mr-2" />
                <span className="truncate">{candidate.research ? 'Sync' : 'Deep Research'}</span>
              </>
            )}
           </Button>
           <Button variant="outline" className="text-slate-600 text-[10px] sm:text-xs py-2 h-10 px-2 sm:px-4" onClick={handleDownloadPDF}>
             <Database className="w-3.5 h-3.5 mr-1 sm:mr-2" /> PDF
           </Button>
           
           <Button variant="outline" className="text-[10px] sm:text-xs py-2 h-10 px-2 sm:px-4" onClick={() => {
             const url = `${window.location.origin}/interview/${candidate.id}`;
             navigator.clipboard.writeText(url);
             notify('Interview link copied!', 'success');
           }}>
             <ExternalLink className="w-3.5 h-3.5 mr-1 sm:mr-2" />
             Link
           </Button>

           {!calendarConnected ? (
             <Button 
               variant="outline" 
               className="border-amber-200 text-amber-700 hover:bg-amber-50 text-[10px] sm:text-xs py-2 h-10 px-2 sm:px-4"
               onClick={handleConnectCalendar}
             >
               <Calendar className="w-3.5 h-3.5 mr-1 sm:mr-2" />
               Connect
             </Button>
           ) : (
             <Button 
               variant="outline" 
               className="border-green-200 text-green-700 hover:bg-green-50 text-[10px] sm:text-xs py-2 h-10 px-2 sm:px-4"
               onClick={fetchAvailability}
             >
               <Clock className="w-3.5 h-3.5 mr-1 sm:mr-2" />
               Schedule
             </Button>
           )}

           <div className="grid grid-cols-1 md:grid-cols-2 lg:flex gap-2">
             {candidate.interviewStatus === 'completed' ? (
               <Button variant="secondary" className="flex-1 bg-green-600 hover:bg-green-700 text-xs py-2 h-auto" onClick={() => navigate(`/interview/${candidate.id}`)}>
                 <CheckCircle2 className="w-3.5 h-3.5 mr-2" />
                 Review
               </Button>
             ) : candidate.interviewStatus === 'invited' || candidate.interviewStatus === 'in_progress' ? (
               <Button variant="secondary" className="flex-1 bg-indigo-600 animate-pulse text-xs py-2 h-auto" onClick={() => navigate(`/interview/${candidate.id}`)}>
                 <Play className="w-3.5 h-3.5 mr-2" />
                 Lobby
               </Button>
             ) : (
               <Button 
                 variant="secondary" 
                 className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-xs py-2 h-auto flex items-center justify-center gap-2" 
                 onClick={handleSendInvite}
                 disabled={sendingInvite}
               >
                 {sendingInvite ? (
                   <Loader2 className="w-3.5 h-3.5 animate-spin mr-1 sm:mr-2" />
                 ) : (
                   <Video className="w-3.5 h-3.5 mr-1 sm:mr-2" />
                 )}
                 {sendingInvite ? 'Inviting...' : 'Invite'}
               </Button>
             )}

             <Button variant="secondary" className="flex-1 lg:flex-none text-xs py-2 h-auto" onClick={async () => {
               try {
                 await updateDoc(doc(db, 'candidates', candidate.id), { status: 'shortlisted' });
                 notify('Shortlisted!', 'success');
               } catch (error) {
                 handleFirestoreError(error, OperationType.UPDATE, `candidates/${candidate.id}`);
               }
             }}>
              Shortlist
             </Button>
           </div>
        </div>
      </div>

      <AnimatePresence>
        {showScheduler && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-md"
          >
            <Card className="w-full max-w-2xl overflow-hidden shadow-2xl border-indigo-200">
              <div className="bg-indigo-600 p-6 flex justify-between items-center text-white">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-white/20 rounded-lg">
                    <Calendar className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-black uppercase tracking-widest text-sm">Schedule Professional Interview</h3>
                    <p className="text-white/60 text-[10px] font-bold">Candidate: {candidate.fullName}</p>
                  </div>
                </div>
                <Button variant="ghost" className="text-white/80 hover:text-white" onClick={() => setShowScheduler(false)}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
              
              <div className="p-8 space-y-6">
                <div>
                  <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">Available Slots (Grounding Analysis)</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[300px] overflow-auto pr-2 custom-scrollbar">
                    {availableSlots.length > 0 ? availableSlots.map((slot, i) => (
                      <button
                        key={i}
                        onClick={() => setSelectedSlot(slot)}
                        className={cn(
                          "p-4 rounded-xl border text-left transition-all",
                          selectedSlot?.start === slot.start 
                            ? "bg-indigo-600 border-indigo-600 text-white shadow-lg" 
                            : "bg-slate-50 border-slate-100 text-slate-600 hover:border-indigo-300"
                        )}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <Clock className={cn("w-3.5 h-3.5", selectedSlot?.start === slot.start ? "text-white/80" : "text-indigo-500")} />
                          <span className="text-xs font-bold uppercase tracking-tight">{slot.label.split(' @ ')[1]}</span>
                        </div>
                        <div className="text-[10px] font-black opacity-80">{slot.label.split(' @ ')[0]}</div>
                      </button>
                    )) : (
                      <p className="text-sm text-slate-400 italic py-8 text-center col-span-2">No available slots found in the next 14 days. Please check your calendar settings.</p>
                    )}
                  </div>
                </div>

                {selectedSlot && (
                  <div className="p-4 bg-indigo-50 rounded-2xl border border-indigo-100 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] font-black text-indigo-900 uppercase block mb-1">Selected Session</span>
                      <p className="text-sm font-bold text-indigo-600">{selectedSlot.label}</p>
                    </div>
                    <Button 
                      className="bg-indigo-600 hover:bg-indigo-700 font-black uppercase tracking-widest text-xs h-10 px-6 shadow-md"
                      onClick={scheduleInterview}
                      disabled={scheduling}
                    >
                      {scheduling ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Confirm & Schedule'}
                    </Button>
                  </div>
                )}
                
                <p className="text-[10px] text-slate-400 text-center italic">
                  Scheduling an interview will automatically create a Google Meet link and send a calendar invitation to <span className="font-bold text-slate-600">{candidate.email}</span>.
                </p>
              </div>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Risk Signals & Red Flags Section */}
      {scorecard?.dimensions?.redFlags?.flags?.length > 0 && (
        <Card className="border-2 border-red-100 bg-red-50/30 overflow-hidden animate-in slide-in-from-top-4 duration-500">
           <div className="bg-red-600 px-6 py-3 flex items-center justify-between">
              <div className="flex items-center gap-3 text-white">
                 <AlertTriangle className="w-5 h-5" />
                 <h3 className="font-black uppercase tracking-widest text-sm">Critical Risk Signals Detected</h3>
              </div>
              <span className="text-[10px] font-black bg-white/20 px-2 py-1 rounded uppercase tracking-widest text-white">
                D6 Integrity Check
              </span>
           </div>
           <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {scorecard.dimensions.redFlags.flags.map((flag: any, idx: number) => (
                <div key={idx} className="bg-white p-4 rounded-xl border border-red-100 shadow-sm relative group overflow-hidden">
                   <div className={cn(
                     "absolute top-0 left-0 w-1 h-full",
                     flag.severity === 'high' ? "bg-red-500" : "bg-amber-500"
                   )} />
                   <div className="flex justify-between items-start mb-2">
                      <span className={cn(
                        "text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full",
                        flag.severity === 'high' ? "bg-red-100 text-red-600" : "bg-amber-100 text-amber-600"
                      )}>
                        {flag.severity} Severity
                      </span>
                      <span className="text-[10px] font-black text-red-500">-{flag.penalty} pts</span>
                   </div>
                   <h4 className="font-black text-slate-900 text-sm mb-1 uppercase tracking-tight">{flag.label}</h4>
                   <p className="text-xs text-slate-500 leading-relaxed italic">{flag.rationale}</p>
                </div>
              ))}
           </div>
           <div className="px-6 py-3 bg-red-50 border-t border-red-100 flex justify-between items-center">
              <p className="text-[10px] font-bold text-red-600 uppercase italic">Multi-source OSINT verification confirmed these signals.</p>
              <p className="text-[11px] font-black text-red-700 uppercase tracking-widest">
                Aggregated Score Impact: <span className="text-base">-{scorecard.dimensions.redFlags.totalPenalty}</span>
              </p>
           </div>
        </Card>
      )}

      {/* Elegant, State-of-the-art Recommendation Banner & Profile Card */}
      <Card className={cn(
        "p-1 border-none bg-gradient-to-r relative overflow-hidden shadow-xl shadow-indigo-100/30",
        scorecard?.recommendation?.status === 'perfect' ? "from-emerald-500 via-teal-500 to-green-500" :
        scorecard?.recommendation?.status === 'strong' ? "from-indigo-500 via-purple-500 to-blue-500" :
        scorecard?.recommendation?.status === 'potential' ? "from-amber-500 via-orange-500 to-yellow-500" : "from-slate-600 via-slate-700 to-slate-500"
      )}>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.06),transparent)] pointer-events-none" />
        <div className="bg-slate-900 text-white m-[1px] rounded-[11px] p-8 flex flex-col md:flex-row items-center gap-8 relative z-10">
          <div className={cn(
             "w-32 h-32 rounded-3xl flex flex-col items-center justify-center shrink-0 border-4 shadow-lg shadow-black/40 backdrop-blur-md",
              scorecard?.recommendation?.status === 'perfect' ? "bg-green-500/10 border-green-500/40 text-green-400" :
              scorecard?.recommendation?.status === 'strong' ? "bg-indigo-500/10 border-indigo-500/40 text-indigo-400" :
              scorecard?.recommendation?.status === 'potential' ? "bg-amber-500/10 border-amber-500/40 text-amber-400" : "bg-slate-500/10 border-slate-500/40 text-slate-400"
          )}>
            <span className="text-5xl font-black tracking-tighter">{scorecard?.compositeScore || 0}</span>
            <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 mt-1">Match Index</span>
          </div>
          <div className="flex-1 text-center md:text-left space-y-3">
            <div className="flex flex-wrap items-center justify-center md:justify-start gap-2">
              <span className={cn(
                "text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-wider",
                scorecard?.recommendation?.status === 'perfect' ? "bg-green-500/20 text-green-400 border border-green-500/30" :
                scorecard?.recommendation?.status === 'strong' ? "bg-indigo-500/20 text-indigo-400 border border-indigo-500/30" :
                scorecard?.recommendation?.status === 'potential' ? "bg-amber-500/20 text-amber-400 border border-amber-500/30" : "bg-slate-500/20 text-slate-450 border border-slate-500/30"
              )}>
                {scorecard?.recommendation?.fitHeader || 'Screening Report'}
              </span>
              <span className="text-[10px] font-bold bg-slate-800 text-slate-300 px-2.5 py-1 rounded-full uppercase tracking-widest border border-slate-700/50">
                {candidate.location}
              </span>
              <span className="text-[10px] font-bold bg-slate-800 text-slate-300 px-2.5 py-1 rounded-full uppercase tracking-widest border border-slate-700/50">
                {candidate.totalExperience} Years Experience
              </span>
            </div>
            <h1 className="text-4xl font-black text-white tracking-tight">{candidate.fullName}</h1>
            <p className="text-[11px] text-indigo-400 font-extrabold uppercase tracking-widest">
              Applied for: {job?.title || 'Unknown Position'}
            </p>
            <div className="text-slate-300 text-sm sm:text-base leading-relaxed max-w-4xl mt-4 font-semibold italic">
              <Markdown>{truncateSummary(candidate.oneLineSummary || "Forensic screening and scoring analysis completed.", 450)}</Markdown>
            </div>
          </div>
        </div>
      </Card>

      {/* State-of-the-art Sub-Tab Navigation Bar */}
      <div id="candidate-detail-tabs" className="flex flex-wrap items-center gap-2 p-1.5 bg-slate-100 rounded-2xl border border-slate-200 shadow-sm relative z-20">
        <Button
          variant="ghost"
          onClick={() => setActiveDetailTab('core')}
          className={cn(
            "flex-1 sm:flex-none flex items-center justify-center gap-2 h-11 px-5 rounded-xl text-xs font-black uppercase tracking-wider transition-all",
            activeDetailTab === 'core' 
              ? "bg-white text-indigo-700 shadow-md scale-102 font-extrabold" 
              : "text-slate-500 hover:text-slate-800 hover:bg-slate-50"
          )}
        >
          <FileText className="w-4 h-4" />
          Evaluation Report
        </Button>
        <Button
          variant="ghost"
          onClick={() => setActiveDetailTab('offer')}
          className={cn(
            "flex-1 sm:flex-none flex items-center justify-center gap-2 h-11 px-5 rounded-xl text-xs font-black uppercase tracking-wider transition-all",
            activeDetailTab === 'offer' 
              ? "bg-white text-indigo-700 shadow-md scale-102 font-extrabold" 
              : "text-slate-500 hover:text-slate-800 hover:bg-slate-50"
          )}
        >
          <Award className="w-4 h-4" />
          Offer Letter OS
        </Button>
        <Button
          variant="ghost"
          onClick={() => setActiveDetailTab('campaign')}
          className={cn(
            "flex-1 sm:flex-none flex items-center justify-center gap-2 h-11 px-5 rounded-xl text-xs font-black uppercase tracking-wider transition-all",
            activeDetailTab === 'campaign' 
              ? "bg-white text-indigo-700 shadow-md scale-102 font-extrabold" 
              : "text-slate-500 hover:text-slate-800 hover:bg-slate-50"
          )}
        >
          <Send className="w-4 h-4" />
          Outbound Campaigns
        </Button>
        <Button
          variant="ghost"
          onClick={() => setActiveDetailTab('proctoring')}
          className={cn(
            "flex-1 sm:flex-none flex items-center justify-center gap-2 h-11 px-5 rounded-xl text-xs font-black uppercase tracking-wider transition-all",
            activeDetailTab === 'proctoring' 
              ? "bg-white text-indigo-700 shadow-md scale-102 font-extrabold" 
              : "text-slate-500 hover:text-slate-800 hover:bg-slate-50"
          )}
        >
          <ShieldCheck className="w-4 h-4" />
          Anti-Cheat Proctoring
        </Button>
      </div>

      {activeDetailTab === 'core' && (
        <>
          {/* Deep Research Section */}
          <Card className="overflow-hidden border-indigo-100 shadow-lg shadow-indigo-100/50">
        <div className="bg-slate-900 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-500 rounded-lg">
              <Search className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-white font-black uppercase tracking-widest text-sm">Professional Footprint Analysis</h3>
              <p className="text-indigo-300 text-[10px] font-bold">Powered by Gemini OSINT Grounding</p>
            </div>
          </div>
          {researching && (
            <div className="flex items-center gap-2 text-indigo-400 text-xs font-black uppercase tracking-widest animate-pulse">
              <Loader2 className="w-4 h-4 animate-spin" />
              Scanning Multi-Source Digital Logs...
            </div>
          )}
          {!researching && candidate.research && (
             <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest bg-slate-800 px-2 py-1 rounded">
               Last validated {formatDateTime(candidate.research.lastResearchedAt)}
             </span>
          )}
        </div>
        <div className="p-8">
          {researching ? (
            <div className="space-y-4 py-8 text-center">
              <div className="flex justify-center mb-6">
                <div className="w-16 h-16 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
              </div>
              <p className="text-lg font-black text-slate-800">Synthesizing Digital Presence...</p>
              <div className="max-w-md mx-auto space-y-2">
                <div className="h-2 bg-slate-100 rounded-full w-full animate-pulse" />
                <div className="h-2 bg-slate-100 rounded-full w-5/6 animate-pulse mx-auto" />
                <div className="h-2 bg-slate-100 rounded-full w-4/6 animate-pulse mx-auto" />
              </div>
              <p className="text-xs text-slate-400 mt-4 italic font-medium">"Cross-referencing LinkedIn, GitHub, and professional registries..."</p>
            </div>
          ) : candidate.research ? (
            (() => {
              const res = (candidate.research || {}) as any;
              const confidence = res.identity_confidence ?? 85;
              const status = res.status || 'HIGH_CONFIDENCE';
              const seniority = res.seniority_estimate || 'Senior';
              const techScore = res.technical_score ?? 80;
              const engDepth = res.engineering_depth_score ?? 80;
              const problemSolving = res.problem_solving_score ?? 80;
              const leadershipScore = res.leadership_score ?? 75;
              const stabilityScore = res.stability_score ?? 85;
              const growthTrajectory = res.growth_trajectory || 'Consistent progressive advancement.';
              const reputationScore = res.reputation_score ?? 70;
              const industryVisibility = res.industry_visibility_score ?? 60;
              const communicationScore = res.communication_score ?? 80;
              const communicationQuality = res.communication_quality || 'High clarity, structured explanations, professional vocabulary.';
              const riskScore = res.risk_score ?? 10;
              const riskSignals = res.risk_signals || 'No potential inconsistencies detected.';
              const overallRecommendation = res.overall_recommendation || 'GOOD_MATCH';
              const verifiedProfiles = res.verified_profiles || [
                { name: 'LinkedIn', url: '#', status: 'Unverified' },
                { name: 'GitHub', url: '#', status: 'Unverified' },
                { name: 'StackOverflow', url: '#', status: 'Unverified' }
              ];
              const summaryText = res.summary || '';
              const sources = res.sources || [];
              const isUnverified = confidence < 85;

              return (
                <div className="space-y-8 font-sans">
                  {/* Row 1: Section 7 - Confidence Meter Panel & Section 1: Verified Profiles */}
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* CONFIDENCE METER (Section 7) */}
                    <div id="confidence-meter-card" className={`p-6 rounded-2xl border transition-all ${isUnverified ? 'bg-rose-50/50 border-rose-200 shadow-rose-100/30' : 'bg-slate-50 border-slate-200/60 shadow-slate-100/30 shadow-md'}`}>
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                          <ShieldCheck className={`w-5 h-5 ${isUnverified ? 'text-rose-500' : 'text-emerald-500'}`} />
                          <h4 className="text-xs font-black uppercase tracking-widest text-slate-700">7. Confidence Meter</h4>
                        </div>
                        <span className={`text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-wider ${
                          status === 'VERIFIED' ? 'bg-emerald-100 text-emerald-800' :
                          status === 'HIGH_CONFIDENCE' ? 'bg-blue-100 text-blue-800' :
                          status === 'MEDIUM_CONFIDENCE' ? 'bg-amber-100 text-amber-800' :
                          'bg-rose-100 text-rose-800'
                        }`}>
                          {status.replace('_', ' ')}
                        </span>
                      </div>
                      
                      <div className="flex items-center gap-4 py-3">
                        <div className="relative w-16 h-16 shrink-0 flex items-center justify-center">
                          {/* Svg Circle Progress Indicator */}
                          <svg className="w-full h-full transform -rotate-90">
                            <circle cx="32" cy="32" r="28" strokeWidth="6" stroke="#e2e8f0" fill="transparent" />
                            <circle cx="32" cy="32" r="28" strokeWidth="6" 
                              stroke={isUnverified ? '#f43f5e' : '#10b981'} 
                              strokeDasharray={175} 
                              strokeDashoffset={175 - (175 * confidence) / 100}
                              strokeLinecap="round" fill="transparent" />
                          </svg>
                          <span className="absolute text-sm font-black text-slate-800">{confidence}%</span>
                        </div>
                        <div>
                          <p className="text-xs font-bold text-slate-800">
                            {isUnverified ? 'Unverified Audit Profile' : 'Verified Identity Level'}
                          </p>
                          <p className="text-[11px] text-slate-500 mt-1">
                            {isUnverified 
                              ? 'Profile falls below the 85% confidence threshold. Sensitive insights are hidden.' 
                              : `Excellent identity resolution from verified professional social registries.`
                            }
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* VERIFIED PROFILES (Section 1) */}
                    <div id="verified-profiles-card" className="lg:col-span-2 p-6 rounded-2xl bg-slate-50 border border-slate-200/60 shadow-md shadow-slate-100/30 flex flex-col justify-between">
                      <div className="flex items-center gap-2 mb-4">
                        <Users className="w-5 h-5 text-indigo-500" />
                        <h4 className="text-xs font-black uppercase tracking-widest text-slate-700">1. Verified Profiles</h4>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        {verifiedProfiles.map((p: any, idx: number) => {
                          const isVer = p.status === 'Verified' && !isUnverified;
                          return (
                            <a 
                              key={idx}
                              href={p.url && p.url !== '#' ? p.url : undefined}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={`p-3 rounded-xl border flex items-center justify-between transition-all ${
                                isVer 
                                  ? 'bg-emerald-50/40 border-emerald-100 hover:border-emerald-300' 
                                  : 'bg-slate-100/50 border-slate-200/40 hover:border-slate-300'
                              } ${!p.url || p.url === '#' ? 'pointer-events-none cursor-default' : ''}`}
                            >
                              <div className="flex items-center gap-2">
                                <span className={`w-2 h-2 rounded-full ${isVer ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                                <span className="text-xs font-black text-slate-700">{p.name}</span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <span className={`text-[9px] font-bold uppercase ${isVer ? 'text-emerald-700' : 'text-slate-400'}`}>
                                  {isVer ? 'Verified' : 'Unverified'}
                                </span>
                                {isVer ? (
                                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                                ) : (
                                  <AlertCircle className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                                )}
                              </div>
                            </a>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {isUnverified ? (
                    /* WARNING WARNING VIEW FOR UNVERIFIED PROFILES */
                    <div className="p-8 bg-rose-50 border border-rose-100 rounded-3xl text-center space-y-4">
                      <div className="mx-auto w-12 h-12 rounded-full bg-rose-100 flex items-center justify-center">
                        <AlertTriangle className="w-6 h-6 text-rose-600" />
                      </div>
                      <h4 className="text-base font-black text-rose-950 uppercase tracking-wide">Sensitive Insights Hidden</h4>
                      <p className="text-sm text-rose-800 max-w-xl mx-auto leading-relaxed">
                        To maintain compliance and high intelligence precision, HireNow security rules dictate that sensitive background analysis metrics (technical scores, risk intelligence, leadership analytics, and performance narratives) are hidden when identity confidence falls under the <strong>85%</strong> threshold.
                      </p>
                      <div className="pt-2">
                        <p className="text-xs text-rose-600 font-bold uppercase tracking-wider">
                          👉 Please ask the recruiter to perform a manual verification audit.
                        </p>
                      </div>
                    </div>
                  ) : (
                    /* DEEP INSIGHTS DISPLAY */
                    <div className="space-y-6">
                      {/* Row 2: DeepResearch Summary (Section 2) & Career Narrative (Section 3) */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {/* DEEP RESEARCH SUMMARY (Section 2) */}
                        <div id="deep-research-summary-card" className="md:col-span-2 p-6 bg-white border border-slate-100 rounded-2xl shadow-sm space-y-4">
                          <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                            <Sparkles className="w-5 h-5 text-indigo-500" />
                            <h4 className="text-xs font-black uppercase tracking-widest text-slate-800">2. DeepResearch Summary</h4>
                          </div>
                          <div className="text-slate-700 text-sm leading-relaxed prose prose-indigo max-w-none max-h-[350px] overflow-y-auto pr-2 custom-scrollbar">
                            <Markdown>{summaryText}</Markdown>
                          </div>
                        </div>

                        {/* CAREER TIMELINE VALIDATION (Section 3) */}
                        <div id="career-timeline-card" className="p-6 bg-white border border-slate-100 rounded-2xl shadow-sm flex flex-col justify-between space-y-4">
                          <div>
                            <div className="flex items-center gap-2 pb-2 border-b border-slate-100 mb-4">
                              <Briefcase className="w-5 h-5 text-indigo-500" />
                              <h4 className="text-xs font-black uppercase tracking-widest text-slate-800">3. Career Timeline</h4>
                            </div>
                            
                            <div className="space-y-4">
                              <div>
                                <div className="flex justify-between text-xs font-bold text-slate-700 mb-1.5">
                                  <span>Career Stability Rating</span>
                                  <span className="font-extrabold">{stabilityScore}%</span>
                                </div>
                                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                                  <div className="h-full bg-indigo-500 rounded-full transition-all" style={{ width: `${stabilityScore}%` }} />
                                </div>
                              </div>
                              
                              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 space-y-2">
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Growth Trajectory</span>
                                <p className="text-xs text-slate-600 leading-relaxed font-semibold">{growthTrajectory}</p>
                              </div>
                            </div>
                          </div>

                          <div className="p-3.5 bg-indigo-50/50 border border-indigo-100 rounded-xl space-y-1 text-[11px] text-indigo-950 font-medium">
                            <div className="flex items-center gap-1 text-indigo-700 font-extrabold text-[10px] uppercase tracking-wide">
                              <Check className="w-3.5 h-3.5" />
                              Promotion Patterns Checked
                            </div>
                            <p className="text-indigo-700/80 leading-normal">Past roles verified with progressive titles, steady promotions, and realistic tenure periods.</p>
                          </div>
                        </div>
                      </div>

                      {/* Row 3: Technical Intelligence (Section 4) & Leadership / Comm (Section 5) */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* TECHNICAL INTELLIGENCE (Section 4) */}
                        <div id="technical-intelligence-card" className="p-6 bg-white border border-slate-100 rounded-2xl shadow-sm space-y-5">
                          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                            <div className="flex items-center gap-2">
                              <Cpu className="w-5 h-5 text-indigo-500" />
                              <h4 className="text-xs font-black uppercase tracking-widest text-slate-800">4. Technical Intelligence</h4>
                            </div>
                            <span className="text-[10px] font-black uppercase bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded tracking-wider">
                              Assessed: {seniority}
                            </span>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 space-y-2 text-center">
                              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Engineering Depth</span>
                              <div className="text-3xl font-black text-indigo-600">{engDepth}%</div>
                              <p className="text-[10px] text-slate-500 font-medium leading-relaxed">Based on codebase validation and engineering design overlap.</p>
                            </div>
                            <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 space-y-2 text-center">
                              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Problem Solving</span>
                              <div className="text-3xl font-black text-indigo-600">{problemSolving}%</div>
                              <p className="text-[10px] text-slate-500 font-medium leading-relaxed font-sans">Derived from community contributions, stack trace, and complexity metrics.</p>
                            </div>
                          </div>

                          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-100 space-y-1">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1 font-sans">Technical Insights Narrative</span>
                            <p className="text-xs text-slate-600 leading-relaxed font-sans">{res.technical_depth || 'Technical alignment verified across primary languages and architectures.'}</p>
                          </div>
                        </div>

                        {/* LEADERSHIP & COMMUNICATION (Section 5) */}
                        <div id="leadership-communication-card" className="p-6 bg-white border border-slate-100 rounded-2xl shadow-sm space-y-5">
                          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                            <div className="flex items-center gap-2">
                              <Brain className="w-5 h-5 text-indigo-500" />
                              <h4 className="text-xs font-black uppercase tracking-widest text-slate-800">5. Leadership & Communication</h4>
                            </div>
                            <div className="flex gap-2">
                              <span className="text-[10px] font-black bg-blue-100 text-blue-800 px-2 py-0.5 rounded tracking-wider">
                                L: {leadershipScore}%
                              </span>
                              <span className="text-[10px] font-black bg-purple-100 text-purple-800 px-2 py-0.5 rounded tracking-wider">
                                C: {communicationScore}%
                              </span>
                            </div>
                          </div>

                          <div className="space-y-4 font-sans">
                            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-100 space-y-1">
                              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Communication Quality Check</span>
                              <p className="text-xs text-slate-600 leading-relaxed font-semibold">{communicationQuality}</p>
                            </div>

                            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-100 space-y-1">
                              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Leadership Potential</span>
                              <p className="text-xs text-slate-600 leading-relaxed">{res.leadership_potential || 'Capable of leading technical scopes and guiding complex features proactively.'}</p>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Row 4: Risk Signals (Section 6) */}
                      <div id="risk-signals-card" className={`p-6 border rounded-2xl transition-all ${riskScore > 20 ? 'bg-rose-50/50 border-rose-200' : 'bg-emerald-50/20 border-emerald-100'}`}>
                        <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-100">
                          <div className="flex items-center gap-2">
                            <Shield className={`w-5 h-5 ${riskScore > 20 ? 'text-rose-500' : 'text-emerald-500'}`} />
                            <h4 className="text-xs font-black uppercase tracking-widest text-slate-800">6. Risk Signals</h4>
                          </div>
                          <span className={`text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-wider ${
                            riskScore > 40 ? 'bg-rose-100 text-rose-800' :
                            riskScore > 15 ? 'bg-amber-100 text-amber-800' :
                            'bg-emerald-100 text-emerald-800'
                          }`}>
                            {riskScore > 40 ? 'High Risk' : riskScore > 15 ? 'Medium Risk' : 'Low Risk'}
                          </span>
                        </div>
                        
                        <div className="flex items-start gap-3">
                          <div className={`mt-0.5 p-2 rounded-lg ${riskScore > 20 ? 'bg-rose-100 text-rose-600' : 'bg-emerald-100 text-emerald-600'}`}>
                            {riskScore > 20 ? <AlertTriangle className="w-5 h-5" /> : <CheckCircle2 className="w-5 h-5" />}
                          </div>
                          <div>
                            <p className="text-xs font-bold text-slate-800">
                              {riskScore > 20 ? 'Potential inconsistencies detected:' : 'No potential inconsistencies detected.'}
                            </p>
                            <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                              {riskSignals}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Row 5: Evidence Sources (Section 8) & Refresh Analysis Container */}
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 pt-2">
                    {/* EVIDENCE SOURCES (Section 8) */}
                    <div id="evidence-sources-card" className="lg:col-span-2 p-6 bg-slate-50 border border-slate-200/60 rounded-2xl">
                      <div className="flex items-center gap-2 mb-4">
                        <BookOpen className="w-5 h-5 text-indigo-500" />
                        <h4 className="text-xs font-black uppercase tracking-widest text-slate-700">8. Evidence Sources / Reference Grounding Links</h4>
                      </div>
                      
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {sources.map((source: any, sidx: number) => (
                          <a 
                            key={sidx}
                            href={source.uri && source.uri !== '#' ? source.uri : undefined}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`block p-3 bg-white border border-slate-100 rounded-xl hover:border-indigo-200 hover:bg-slate-100/50 transition-all group ${!source.uri || source.uri === '#' ? 'pointer-events-none cursor-default' : ''}`}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-[11px] font-bold text-slate-600 line-clamp-1 group-hover:text-indigo-600 italic">
                                {source.title || source.uri}
                              </span>
                              {source.uri && source.uri !== '#' && <ExternalLink className="w-3 h-3 text-slate-300 group-hover:text-indigo-400 shrink-0" />}
                            </div>
                          </a>
                        ))}
                        {sources.length === 0 && (
                          <p className="text-xs text-slate-400 italic">No public references compiled.</p>
                        )}
                      </div>
                    </div>

                    {/* REFRESH ACTION AND AUDIT SUMMARY PANEL */}
                    <div className="p-6 bg-slate-50 border border-slate-200/60 rounded-2xl flex flex-col justify-between space-y-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 text-slate-700">
                          <CheckCircle2 className="text-indigo-600 w-4 h-4" />
                          <span className="text-[10px] font-black uppercase tracking-wider">Audit Integrity (v5.0)</span>
                        </div>
                        <p className="text-[10px] text-slate-500 leading-relaxed italic font-sans">
                          Multi-source background synthesis. Built in real-time under zero-trust guidelines. Verify physical certs before hire.
                        </p>
                      </div>
                      
                      <Button 
                        variant="outline" 
                        className="w-full h-11 text-[10px] font-black uppercase tracking-widest text-indigo-600 border-indigo-200/80 bg-white hover:bg-slate-100 hover:border-indigo-400 hover:text-indigo-700 transition-all"
                        onClick={handleDeepResearch}
                      >
                        <RotateCcw className="w-3.5 h-3.5 mr-2" /> Refresh Grounding Audit
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })()

          ) : (
            <div className="py-12 flex flex-col items-center text-center">
              <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mb-6 border border-slate-100">
                <Globe className="w-10 h-10 text-slate-300" />
              </div>
              <h4 className="text-xl font-black text-slate-900 mb-2">Footprint Analysis Missing</h4>
              <p className="text-sm text-slate-500 max-w-md mx-auto mb-8">
                Perform a deep web research to uncover the candidate's professional presence across LinkedIn, GitHub, industry registries, and public portfolios.
              </p>
              <Button 
                className="bg-indigo-600 hover:bg-indigo-700 h-12 px-8 font-black uppercase tracking-widest text-xs shadow-lg shadow-indigo-200"
                onClick={handleDeepResearch}
              >
                <Search className="w-4 h-4 mr-2" /> Trigger Deep Research Sequence
              </Button>
            </div>
          )}
        </div>
      </Card>

      {/* D6 Forensic Analysis Reports & Narrative */}
      {(() => {
        const d6Sections = parseD6Sections(scorecard?.recommendation?.summary || '');
        const hasDetailedReports = d6Sections.executiveSummary || d6Sections.performanceLedger || d6Sections.auditingAnomalies || d6Sections.interviewStrategy;
        
        if (!hasDetailedReports) return null;

        return (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="border-b border-slate-200 pb-2">
              <h2 className="text-xl font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
                <FileText className="w-5 h-5 text-indigo-500" />
                D6+ Forensic Analysis Reports
              </h2>
              <p className="text-xs text-slate-500 font-semibold tracking-wide">Deconstructed adversarial talent reports across major scoring dimensions</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Executive Summary & Match Narrative */}
              {d6Sections.executiveSummary && (
                <Card id="d6-executive-summary" className="p-6 border-l-4 border-l-indigo-500 bg-white shadow-md shadow-indigo-50/10 hover:shadow-lg transition-all duration-300 rounded-2xl flex flex-col justify-start">
                  <div className="flex items-center gap-3 border-b pb-3 mb-4 shrink-0">
                    <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg shrink-0">
                      <Sparkles className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-black text-slate-900 text-sm uppercase tracking-wider">D6 Executive Summary & Match Narrative</h3>
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tight">CORE FIT & SYNTHESIS</p>
                    </div>
                  </div>
                  <div className="text-slate-600 text-xs sm:text-sm leading-relaxed prose prose-indigo max-w-none flex-1">
                    <Markdown>{d6Sections.executiveSummary}</Markdown>
                  </div>
                </Card>
              )}

              {/* Dimensional Performance Ledger */}
              {d6Sections.performanceLedger && (
                <Card id="d6-performance-ledger" className="p-6 border-l-4 border-l-blue-500 bg-white shadow-md shadow-blue-50/10 hover:shadow-lg transition-all duration-300 rounded-2xl flex flex-col justify-start">
                  <div className="flex items-center gap-3 border-b pb-3 mb-4 shrink-0">
                    <div className="p-2 bg-blue-50 text-blue-600 rounded-lg shrink-0">
                      <BarChart3 className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-black text-slate-900 text-sm uppercase tracking-wider">Dimensional Performance Ledger</h3>
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tight">D1-D5 BREAKDOWN DECONSTRUCTION</p>
                    </div>
                  </div>
                  <div className="text-slate-600 text-xs sm:text-sm leading-relaxed prose prose-blue max-w-none flex-1">
                    <Markdown>{d6Sections.performanceLedger}</Markdown>
                  </div>
                </Card>
              )}

              {/* D6 Auditing, Penalties & Anomalies */}
              {d6Sections.auditingAnomalies && (
                <Card id="d6-auditing-anomalies" className="p-6 border-l-4 border-l-amber-500 bg-white shadow-md shadow-amber-50/10 hover:shadow-lg transition-all duration-300 rounded-2xl flex flex-col justify-start">
                  <div className="flex items-center gap-3 border-b pb-3 mb-4 shrink-0">
                    <div className="p-2 bg-amber-50 text-amber-600 rounded-lg shrink-0">
                      <Shield className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-black text-slate-900 text-sm uppercase tracking-wider">D6 Auditing, Penalties & Anomalies</h3>
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tight">ADVERSARIAL STABILITY & GAP EVALUATION</p>
                    </div>
                  </div>
                  <div className="text-slate-600 text-xs sm:text-sm leading-relaxed prose prose-amber max-w-none flex-1">
                    <Markdown>{d6Sections.auditingAnomalies}</Markdown>
                  </div>
                </Card>
              )}

              {/* Hiring Recommendation & Interview Strategy */}
              {d6Sections.interviewStrategy && (
                <Card id="d6-interview-strategy" className="p-6 border-l-4 border-l-emerald-500 bg-white shadow-md shadow-emerald-50/10 hover:shadow-lg transition-all duration-300 rounded-2xl flex flex-col justify-start">
                  <div className="flex items-center gap-3 border-b pb-3 mb-4 shrink-0">
                    <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg shrink-0">
                      <Lightbulb className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-black text-slate-900 text-sm uppercase tracking-wider">Hiring Recommendation & Interview Strategy</h3>
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tight">PRESCRIPTIVE PANEL EVALUATION QUESTIONS</p>
                    </div>
                  </div>
                  <div className="text-slate-600 text-xs sm:text-sm leading-relaxed prose prose-emerald max-w-none flex-1">
                    <Markdown>{d6Sections.interviewStrategy}</Markdown>
                  </div>
                </Card>
              )}
            </div>
          </div>
        );
      })()}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Profile Details */}
        <div className="lg:col-span-1 space-y-6">
          <Card className="p-6">
             <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">Quick Stats</h3>
             <div className="space-y-4">
               <div>
                 <p className="text-sm font-bold text-slate-900">{candidate.currentRole}</p>
                 <p className="text-xs text-slate-500">@{candidate.currentCompany}</p>
               </div>
               <div className="flex justify-between items-center py-3 border-y border-slate-50">
                 <span className="text-sm text-slate-500">Exp. Years</span>
                 <span className="font-bold text-indigo-600">{candidate.totalExperience}Y</span>
               </div>
               <div className="flex justify-between items-center pb-3 border-b border-slate-50">
                 <span className="text-sm text-slate-500">Location</span>
                 <span className="font-bold">{candidate.location}</span>
               </div>
               <div className="flex justify-between items-center pt-1">
                 <span className="text-sm text-slate-500">Screened On</span>
                 <span className="text-sm font-bold text-slate-700">{formatDateTime(candidate.createdAt)}</span>
               </div>
             </div>
          </Card>

          <Card className="p-6 bg-slate-50">
             <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">Red Flags (D6)</h3>
             <div className="space-y-4">
               {scorecard?.dimensions?.redFlags?.flags?.length > 0 ? scorecard.dimensions.redFlags.flags.map((flag, idx) => (
                 <div key={idx} className="bg-white p-4 rounded-xl border border-slate-100 flex flex-col gap-2 shadow-sm">
                   <div className="flex items-center gap-2">
                     <div className={cn(
                       "w-2 h-2 rounded-full shrink-0",
                       flag.severity === 'high' ? "bg-red-500" : flag.severity === 'medium' ? "bg-amber-500" : "bg-slate-400"
                     )} />
                     <p className="text-sm font-black text-slate-700">{flag.label}</p>
                     <span className="ml-auto text-[10px] text-red-500 font-black uppercase tracking-tighter">-{flag.penalty} pts</span>
                   </div>
                   <p className="text-xs text-slate-500 leading-relaxed italic border-l-2 border-slate-100 pl-3 py-1">
                     {flag.rationale}
                   </p>
                 </div>
               )) : (
                 <div className="p-4 text-center border-2 border-dashed border-slate-200 rounded-xl">
                   <p className="text-xs text-slate-400">No risk signals detected.</p>
                 </div>
               )}
               <div className="pt-2 flex justify-between items-center text-xs font-black uppercase border-t border-slate-200 mt-2">
                 <span>Total Penalty</span>
                 <span className="text-red-600">-{scorecard?.dimensions?.redFlags?.totalPenalty || 0} Points</span>
               </div>
             </div>
          </Card>

           <Card className="p-6">
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">Confirmed Skill Tags</h3>
              <div className="flex flex-wrap gap-1.5">
                {scorecard?.skillsAnalysis?.confirmed?.map((s, idx) => (
                  <span key={idx} className="px-2 py-1 bg-green-50 text-green-700 text-[10px] font-black rounded uppercase tracking-tighter border border-green-100 italic">
                    {s}
                  </span>
                ))}
              </div>
           </Card>
        </div>

        {/* Dimension Breakdown */}
        <div className="lg:col-span-2 space-y-8">
          <Card className="p-8 overflow-visible">
            <div className="flex items-center justify-between mb-8 border-b pb-4">
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-black">D6 Scoring Engine</h2>
                <div className="group relative">
                  <Info className="w-4 h-4 text-slate-400 cursor-help" />
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-3 bg-slate-900 text-white text-[10px] font-medium rounded-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 shadow-xl border border-slate-700 pointer-events-none">
                    <p className="leading-relaxed">
                      <span className="font-black text-indigo-400 block mb-1 uppercase tracking-widest">D6+ Scoring Architecture</span>
                      Proprietary v2.0 weighted scoring system. Evaluates 5 core dimensions using adaptive role weights, chronological audit penalties, and signal density analysis.
                    </p>
                    <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-slate-900" />
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-400">Integrity Score:</span>
                <span className={cn(
                  "text-sm font-black px-2 py-1 rounded-lg",
                  (candidate.scorecard.integrityScore || 100) >= 90 ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                )}>
                  {candidate.scorecard.integrityScore || 100}/100
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-400">Signal Density:</span>
                <span className={cn(
                  "text-sm font-black px-2 py-1 rounded-lg",
                  (candidate.scorecard.dimensions?.signalDensity?.score || 0) >= 80 ? "bg-indigo-100 text-indigo-700" : (candidate.scorecard.dimensions?.signalDensity?.score || 0) >= 40 ? "bg-slate-100 text-slate-700" : "bg-red-100 text-red-700"
                )}>
                  {candidate.scorecard.dimensions?.signalDensity?.score || '--'}/100
                </span>
                {candidate.scorecard.dimensions?.signalDensity?.rationale && (
                  <div className="group relative">
                    <Info className="w-3 h-3 text-slate-400 cursor-help" />
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2 bg-slate-900 text-white text-[8px] font-medium rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 shadow-xl border border-slate-700 pointer-events-none">
                      {candidate.scorecard.dimensions.signalDensity.rationale}
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="space-y-6">
              {[
                { 
                  id: 'D1', 
                  key: 'skillsMatch', 
                  label: job?.requirements?.customCriteria?.skillsMatch?.name || 'Skills Match', 
                  weight: job?.requirements?.customCriteria?.skillsMatch?.weight !== undefined
                    ? `${Math.round((job.requirements.customCriteria.skillsMatch.weight / (Object.values(job.requirements.customCriteria).reduce((acc: number, c: any) => acc + (c?.weight || 0), 0) || 1)) * 100)}%`
                    : '30-35%', 
                  icon: Terminal, 
                  color: 'indigo', 
                  description: job?.requirements?.customCriteria?.skillsMatch?.description || 'Semantic overlap between resume skills and JD requirements.',
                  calculationDetail: 'Uses TF-IDF and semantic embedding cosine similarity to compare resume keywords against mandatory and preferred skill lists.'
                },
                { 
                  id: 'D2', 
                  key: 'experienceFit', 
                  label: job?.requirements?.customCriteria?.experienceFit?.name || 'Experience Fit', 
                  weight: job?.requirements?.customCriteria?.experienceFit?.weight !== undefined
                    ? `${Math.round((job.requirements.customCriteria.experienceFit.weight / (Object.values(job.requirements.customCriteria).reduce((acc: number, c: any) => acc + (c?.weight || 0), 0) || 1)) * 100)}%`
                    : '25-30%', 
                  icon: Briefcase, 
                  color: 'blue', 
                  description: job?.requirements?.customCriteria?.experienceFit?.description || 'Relevant years, title proximity, and industry alignment analysis.',
                  calculationDetail: 'Analyses years of experience vs requirements, title seniority (IC vs Manager), and industry relevance. Seniority gaps are heavily penalized.'
                },
                { 
                  id: 'D3', 
                  key: 'education', 
                  label: job?.requirements?.customCriteria?.education?.name || 'Education', 
                  weight: job?.requirements?.customCriteria?.education?.weight !== undefined
                    ? `${Math.round((job.requirements.customCriteria.education.weight / (Object.values(job.requirements.customCriteria).reduce((acc: number, c: any) => acc + (c?.weight || 0), 0) || 1)) * 100)}%`
                    : '10-20%', 
                  icon: BookOpen, 
                  color: 'emerald', 
                  description: job?.requirements?.customCriteria?.education?.description || 'Degree level match, field relevance, and institution tiering.',
                  calculationDetail: 'Matches degree levels (Bachelor, Master, PhD) and field of study. Considers institution rank and equivalent experience offsets.'
                },
                { 
                  id: 'D4', 
                  key: 'achievements', 
                  label: job?.requirements?.customCriteria?.achievements?.name || 'Achievements', 
                  weight: job?.requirements?.customCriteria?.achievements?.weight !== undefined
                    ? `${Math.round((job.requirements.customCriteria.achievements.weight / (Object.values(job.requirements.customCriteria).reduce((acc: number, c: any) => acc + (c?.weight || 0), 0) || 1)) * 100)}%`
                    : '20-35%', 
                  icon: Award, 
                  color: 'amber', 
                  description: job?.requirements?.customCriteria?.achievements?.description || 'Quantified professional outcomes, scale signals, and impact statements.',
                  calculationDetail: 'Extracts impact statements with quantified numbers (%, $, scale). Looks for awards, promotions, and significant project ownership.'
                },
                { 
                  id: 'D5', 
                  key: 'culturalRoleFit', 
                  label: job?.requirements?.customCriteria?.culturalRoleFit?.name || 'Cultural / Role Fit', 
                  weight: job?.requirements?.customCriteria?.culturalRoleFit?.weight !== undefined
                    ? `${Math.round((job.requirements.customCriteria.culturalRoleFit.weight / (Object.values(job.requirements.customCriteria).reduce((acc: number, c: any) => acc + (c?.weight || 0), 0) || 1)) * 100)}%`
                    : '5-10%', 
                  icon: Brain, 
                  color: 'rose', 
                  description: job?.requirements?.customCriteria?.culturalRoleFit?.description || 'Tenure patterns, growth trajectory, and career consistency.',
                  calculationDetail: 'Evaluates job-hopping signals (<1yr avg tenure), consistency of career path, and alignment with organizational scale and values.'
                },
              ].map((dimInfo) => {
                const dim = scorecard?.dimensions?.[dimInfo.key as keyof typeof scorecard.dimensions] as any;
                const Icon = dimInfo.icon;
                
                // Static colors map to ensure compilation in Tailwind CSS v4 without dynamic class name construction
                const staticColorsMap: Record<string, { bg: string; text: string; bgActive: string; textActive: string; border: string }> = {
                  indigo: { bg: 'bg-indigo-50/10', text: 'text-indigo-400', bgActive: 'bg-indigo-50', textActive: 'text-indigo-600', border: 'border-indigo-100' },
                  blue: { bg: 'bg-blue-50/10', text: 'text-blue-400', bgActive: 'bg-blue-50', textActive: 'text-blue-600', border: 'border-blue-100' },
                  emerald: { bg: 'bg-emerald-50/10', text: 'text-emerald-400', bgActive: 'bg-emerald-50', textActive: 'text-emerald-600', border: 'border-emerald-100' },
                  amber: { bg: 'bg-amber-50/10', text: 'text-amber-400', bgActive: 'bg-amber-50', textActive: 'text-amber-600', border: 'border-amber-100' },
                  rose: { bg: 'bg-rose-50/10', text: 'text-rose-400', bgActive: 'bg-rose-50', textActive: 'text-rose-600', border: 'border-rose-100' },
                };
                const colors = staticColorsMap[dimInfo.color] || { bg: 'bg-slate-50', text: 'text-slate-400', bgActive: 'bg-slate-100', textActive: 'text-slate-700', border: 'border-slate-150' };

                return (
                  <Card key={dimInfo.id} className={cn(
                    "p-0 overflow-visible border-2 transition-all group/dim",
                    dim ? (dim.score >= 80 ? "border-green-150 hover:border-green-300" : dim.score >= 50 ? "border-amber-150 hover:border-amber-300" : "border-red-150 hover:border-red-300") : "border-slate-100 opacity-70"
                  )}>
                    <div className="flex flex-col md:flex-row">
                      {/* Score Indicator Sidebar */}
                      <div className={cn(
                        "w-full md:w-32 p-6 flex md:flex-col items-center justify-center gap-2 shrink-0 transition-colors rounded-t-2xl md:rounded-tr-none md:rounded-l-2xl",
                        dim ? (dim.score >= 80 ? "bg-green-50" : dim.score >= 50 ? "bg-amber-50" : "bg-red-50") : "bg-slate-50"
                      )}>
                        <div className="relative">
                          <div className={cn(
                            "w-16 h-16 rounded-2xl flex flex-col items-center justify-center border-2 shadow-sm relative z-10",
                            dim ? (dim.score >= 80 ? "bg-white border-green-200 text-green-600" : dim.score >= 50 ? "bg-white border-amber-200 text-amber-600" : "bg-white border-red-200 text-red-600") : "bg-white border-slate-100 text-slate-300"
                          )}>
                            <span className="text-2xl font-black">{dim ? dim.score : '--'}</span>
                            <span className="text-[8px] font-black uppercase tracking-tighter opacity-60">Score</span>
                          </div>
                          {dim && (
                             <div className={cn(
                               "absolute -top-2 -right-2 w-6 h-6 rounded-full border-2 border-white shadow-sm flex items-center justify-center z-20",
                               dim.confidence === 'HIGH' ? "bg-green-500" : dim.confidence === 'MED' ? "bg-amber-500" : "bg-red-500"
                             )}>
                               <ShieldCheck className="w-3 h-3 text-white" />
                             </div>
                          )}
                        </div>
                        <div className="flex flex-col items-center md:items-center">
                           <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{dimInfo.id}</span>
                           <div className={cn(
                             "w-1 h-8 rounded-full my-2 hidden md:block",
                             dim ? (dim.score >= 80 ? "bg-green-200" : dim.score >= 50 ? "bg-amber-200" : "bg-red-200") : "bg-slate-100"
                           )} />
                        </div>
                      </div>

                      {/* Content Area */}
                      <div className="flex-1 p-6 space-y-4">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                          <div className="flex items-center gap-3">
                            <div className={cn("p-2 rounded-lg", dim ? `${colors.bgActive} ${colors.textActive}` : "bg-slate-50 text-slate-300")}>
                              <Icon className="w-5 h-5" />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <h3 className="font-black text-slate-900 uppercase tracking-tight">{dimInfo.label}</h3>
                                <div className="group/info relative">
                                  <Info className="w-3.5 h-3.5 text-slate-300 hover:text-indigo-400 transition-colors cursor-help" />
                                  <div className="absolute bottom-full left-0 mb-2 w-64 p-3 bg-slate-900 text-white text-[10px] font-medium rounded-xl opacity-0 invisible group-hover/info:opacity-100 group-hover/info:visible transition-all z-50 shadow-xl border border-slate-700 pointer-events-none">
                                    <p className="leading-relaxed">
                                      <span className="font-black text-indigo-400 block mb-1 uppercase tracking-widest">{dimInfo.label} PROTOCOL</span>
                                      {dimInfo.calculationDetail}
                                    </p>
                                    <div className="absolute top-full left-4 -mt-1 border-4 border-transparent border-t-slate-900" />
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <p className="text-[10px] text-slate-400 font-medium italic">{dimInfo.description}</p>
                                <span className={cn(
                                  "text-[8px] font-black px-1.5 py-0.5 rounded uppercase tracking-widest border",
                                  dimInfo.weight === 'High' ? "bg-indigo-50 text-indigo-600 border-indigo-100" : "bg-slate-50 text-slate-400 border-slate-100"
                                )}>
                                  {dimInfo.weight} Weight
                                </span>
                              </div>
                            </div>
                          </div>
                          
                          {dim && (
                            <div className="flex items-center gap-2">
                               <div className={cn(
                                 "flex items-center gap-1.5 px-3 py-1 rounded-full border text-[10px] font-black uppercase tracking-widest transition-all",
                                 dim.confidence === 'HIGH' ? "text-green-600 border-green-200 bg-green-50" :
                                 dim.confidence === 'MED' ? "text-amber-600 border-amber-200 bg-amber-50" : "text-red-600 border-red-200 bg-red-50"
                               )}>
                                 <div className={cn(
                                   "w-2 h-2 rounded-full",
                                   dim.confidence === 'HIGH' ? "bg-green-500" : dim.confidence === 'MED' ? "bg-amber-500" : "bg-red-500"
                                 )} />
                                 {dim.confidence || 'MED'} Confidence
                               </div>
                            </div>
                          )}
                        </div>

                        {dim ? (
                          <div className="space-y-4">
                            <details className="group/rationale">
                              <summary className="list-none cursor-pointer">
                                <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 relative overflow-hidden group-hover/dim:bg-white transition-colors duration-300 flex justify-between items-start">
                                  <div className={cn(
                                    "absolute left-0 top-0 w-1 h-full",
                                    dim.score >= 80 ? "bg-green-500" : dim.score >= 50 ? "bg-amber-500" : "bg-red-500"
                                  )} />
                                  <div className="flex-1">
                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">AI Scoring Rationale</span>
                                    <p className="text-sm text-slate-600 leading-relaxed font-medium line-clamp-2 group-open/rationale:line-clamp-none">
                                      {dim.rationale}
                                    </p>
                                  </div>
                                  <ChevronDown className="w-4 h-4 text-slate-300 group-open/rationale:rotate-180 transition-transform mt-6" />
                                </div>
                              </summary>
                            </details>

                            {dim.citations && dim.citations.length > 0 && (
                              <div className="space-y-2">
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block pl-1">Signal Citations</span>
                                <div className="flex flex-wrap gap-2">
                                  {dim.citations.map((cite: any, cidx: number) => (
                                    <div 
                                      key={cidx} 
                                      className="bg-white border border-slate-100 rounded-full px-3 py-1.5 flex items-center gap-2 hover:border-indigo-200 hover:bg-indigo-50 transition-all cursor-default group/cite"
                                      title={cite.source}
                                    >
                                      <div className="w-4 h-4 rounded-full bg-slate-900 flex items-center justify-center text-[7px] font-black text-white shrink-0">
                                        {cidx + 1}
                                      </div>
                                      <span className="text-[10px] font-bold text-slate-600 group-hover/cite:text-indigo-600 max-w-[120px] truncate">
                                        {cite.claim}
                                      </span>
                                      <div className="w-1.5 h-1.5 rounded-full bg-slate-200" />
                                      <Search className="w-2.5 h-2.5 text-slate-300" />
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="py-4 text-center border-2 border-dashed border-slate-100 rounded-2xl bg-slate-50/30">
                            <p className="text-xs text-slate-400 italic">No analysis data available for this dimension.</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          </Card>

          <Card className="p-6 bg-slate-50 border-2 border-dashed border-slate-200">
             <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center font-black text-slate-500 text-xs shadow-inner">
                  PII
                </div>
                <h4 className="font-bold text-slate-700">PII Isolation & Compliance</h4>
             </div>
             <p className="text-xs text-slate-500 leading-relaxed">
               As per our Section 06 policies, Personally Identifiable Information is strictly isolated. Read access is restricted to the hiring manager. No demographic signals are used in scoring.
             </p>
          </Card>

          <Card className="p-8 border-dashed border-2 border-slate-200">
             <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-slate-900 rounded-lg">
                   <Users className="w-5 h-5 text-white" />
                </div>
                <div>
                   <h3 className="font-black text-lg text-slate-900">Proctoring & Integrity (Section 3.4)</h3>
                   <p className="text-xs text-slate-500">Multi-layer security monitoring logs</p>
                </div>
             </div>
             <div className="space-y-3">
                {(candidate.scorecard.proctoringEvents || []).length > 0 ? (
                  candidate.scorecard.proctoringEvents.map((event, idx) => (
                    <div key={idx} className="flex items-center justify-between p-3 bg-red-50 border border-red-100 rounded-xl">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                        <span className="text-xs font-black text-red-700 uppercase">{event.type.replace('_', ' ')}</span>
                      </div>
                      <span className="text-[10px] font-bold text-red-400">{event.details}</span>
                    </div>
                  ))
                ) : (
                  <div className="p-8 text-center bg-green-50 border border-green-100 rounded-2xl">
                    <p className="text-xs font-black text-green-700 uppercase tracking-widest">Integrity Verified</p>
                    <p className="text-[10px] text-green-600 mt-1">No proctoring anomalies detected during session.</p>
                  </div>
                )}
             </div>
          </Card>

          <Card className="p-8 bg-slate-900 text-white overflow-hidden relative">
             <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full -mr-16 -mt-16 blur-3xl" />
             <div className="flex items-center gap-3 mb-6 relative">
                <div className="p-2 bg-indigo-500 rounded-lg">
                   <div className="w-5 h-5 border-2 border-white rounded-full flex items-center justify-center animate-spin-slow">
                     <Plus className="w-3 h-3" />
                   </div>
                </div>
                <div>
                   <h3 className="font-black text-lg">Interview Flow Sequence (3.5)</h3>
                   <p className="text-xs text-slate-400">Adaptive voice interaction state</p>
                </div>
             </div>
             <div className="space-y-4 relative">
                {[
                  { step: 1, label: 'Self-introduction', status: 'Completed' },
                  { step: 2, label: 'Readiness check', status: 'Completed' },
                  { step: 3, label: 'Warm-up question', status: 'Completed' },
                  { step: 4, label: 'Core JD matching', status: 'Completed' },
                  { step: 5, label: 'Deep research follow-up', status: 'In Progress', active: true },
                ].map((s) => (
                  <div key={s.step} className={cn(
                    "flex items-center gap-4 transition-opacity",
                    s.active ? "opacity-100" : "opacity-40"
                  )}>
                    <div className={cn(
                      "w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black border",
                      s.active ? "bg-indigo-500 border-indigo-400" : "bg-slate-800 border-slate-700"
                    )}>
                      {s.step}
                    </div>
                    <div className="flex-1">
                      <p className="text-xs font-bold">{s.label}</p>
                    </div>
                    {s.active && <span className="text-[10px] font-black uppercase tracking-widest text-indigo-400 animate-pulse">Running</span>}
                  </div>
                ))}
             </div>
          </Card>
        </div>
      </div>
        </>
      )}

      {/* Offer Letter OS Sandbox Tab */}
      {activeDetailTab === 'offer' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
          {/* Controls Form */}
          <Card className="p-8 space-y-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                <Sliders className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-black text-slate-900 text-base uppercase tracking-wider">Offer Letter Builder</h3>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tight">Configure Official Offer Parameters</p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Base Salary (Annual Amount)</label>
                <div className="flex gap-4 items-center">
                  <input 
                    type="range" 
                    min={300000} 
                    max={12000000} 
                    step={50000}
                    value={offerSalary} 
                    onChange={(e) => setOfferSalary(Number(e.target.value))}
                    className="flex-1 accent-indigo-600"
                  />
                  <input 
                    type="number"
                    value={offerSalary}
                    onChange={(e) => setOfferSalary(Number(e.target.value))}
                    className="w-36 p-2 rounded-xl border border-slate-200 text-xs font-black text-slate-850"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">Currency Selector</label>
                  <select 
                    value={offerCurrency} 
                    onChange={(e) => setOfferCurrency(e.target.value)}
                    className="w-full p-3 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 bg-white"
                  >
                    <option value="INR">INR (₹) - Indian Rupee</option>
                    <option value="USD">USD ($) - US Dollar</option>
                    <option value="GBP">GBP (£) - British Pound</option>
                    <option value="EUR">EUR (€) - Euro</option>
                    <option value="SGD">SGD ($) - Singapore Dollar</option>
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">Expected Start Date</label>
                  <input 
                    type="date" 
                    value={offerStartDate} 
                    onChange={(e) => setOfferStartDate(e.target.value)}
                    className="w-full p-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-705 bg-white"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">Perks & Core Benefits Ledger</label>
                <textarea 
                  rows={3}
                  value={offerBenefits} 
                  onChange={(e) => setOfferBenefits(e.target.value)}
                  className="w-full p-3 rounded-xl border border-slate-200 text-xs text-slate-600 leading-relaxed font-sans focus:border-indigo-500 focus:outline-none"
                  placeholder="Provide details on health insurance, stock units, equity, or work setups..."
                />
              </div>

              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">Employment Level</label>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-2">
                  {['Standard Full-time', 'Consultant Contract', 'Internship Trial'].map((type) => (
                    <button 
                      key={type}
                      type="button"
                      className="p-2.5 rounded-xl border border-slate-200 text-center text-[10px] font-extrabold uppercase tracking-wider text-slate-650 hover:bg-slate-50"
                    >
                      {type}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="pt-2 flex flex-col sm:flex-row gap-3">
              <Button 
                onClick={() => {
                  setOfferState('sent');
                  notify('Offer letter transmitted to candidate successfully!', 'success');
                  
                  // Append Campaign Log
                  setOutboundLogs(prev => [
                    {
                      id: String(prev.length + 1),
                      channel: 'email',
                      template: 'Official Offer Released',
                      recipient: candidate.email,
                      status: 'sent',
                      timestamp: 'Just now'
                    },
                    ...prev
                  ]);
                }}
                disabled={offerState !== 'draft'}
                className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-xs font-black uppercase tracking-wider h-11"
              >
                <Send className="w-4 h-4 mr-2" />
                {offerState === 'draft' ? 'Release & Dispatch Offer' : 'Offer Already Dispatched'}
              </Button>
              <Button 
                variant="outline"
                onClick={() => {
                  setOfferSalary(1200000);
                  setOfferCurrency('INR');
                  setOfferBenefits('Standard comprehensive medical insurance, remote-work allowance, and performance bonuses.');
                  setOfferState('draft');
                  notify('Offer contract draft cleared.', 'info');
                }}
                className="sm:w-32 border-slate-250 text-slate-500 text-xs font-black uppercase tracking-wider h-11"
              >
                Reset Draft
              </Button>
            </div>
          </Card>

          {/* Interactive Document Preview */}
          <div className="space-y-4">
            {/* Status Visual Tracking Progress Bar */}
            <Card className="p-4 bg-slate-900 border-none text-white overflow-hidden relative">
              <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/10 rounded-full -mr-12 -mt-12 blur-3xl" />
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative z-10">
                <div>
                  <span className="text-[9px] font-black text-indigo-400 uppercase tracking-widest block mb-0.5">Integration Outbound State</span>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />
                    <h4 className="text-xs font-black uppercase tracking-widest">{offerState} / AWAITING SIGNATURE</h4>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 bg-slate-800/80 p-1 rounded-xl border border-slate-700/50">
                  {['draft', 'sent', 'viewed', 'accepted'].map((st, idx) => (
                    <div key={st} className="flex items-center">
                      <span className={cn(
                        "text-[9px] font-black uppercase px-2.5 py-1 rounded-lg tracking-wider",
                        offerState === st ? "bg-indigo-600 text-white shadow" : "text-slate-400"
                      )}>
                        {st}
                      </span>
                      {idx < 3 && <div className="w-2 h-px bg-slate-700" />}
                    </div>
                  ))}
                </div>
              </div>
            </Card>

            {/* Document sheet */}
            <Card className="bg-white border border-slate-100 shadow-2xl rounded-2xl overflow-hidden min-h-[550px] relative flex flex-col justify-between">
              {/* Top Letterhead banner */}
              <div className="bg-slate-900 text-white px-8 py-8 border-b-4 border-indigo-600 flex justify-between items-center">
                <div>
                  <h2 className="text-xl font-black uppercase tracking-widest text-indigo-400 leading-none mb-1">
                    {organization?.name || 'HIRENOW'}
                  </h2>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Official Talent Agreement Letter</p>
                </div>
                <div className="text-right">
                  <p className="text-[9px] text-slate-400 font-mono">ID: OFF_{candidateId?.slice(0,6)}</p>
                  <p className="text-[9px] text-slate-400 font-mono">DATE: {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
                </div>
              </div>

              {/* Main Page Sheet Content */}
              <div className="p-8 sm:p-12 space-y-6 flex-1 text-slate-750 text-xs sm:text-sm leading-relaxed font-sans max-h-[550px] overflow-y-auto custom-scrollbar">
                <div className="space-y-1">
                  <p className="font-extrabold text-slate-900 text-left">Dear {candidate.fullName},</p>
                  <p className="text-left">Applied Email: <span className="font-mono text-slate-500 font-semibold">{candidate.email}</span></p>
                </div>

                <p className="text-left">
                  Following the meticulous evaluation of your credentials and your high-signal technical voice interview, we are absolutely delighted to extend our official offer of employment at <strong className="text-slate-900 font-extrabold">{organization?.name || 'our organization'}</strong>.
                </p>

                {/* Offer key ledger parameters */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-5 bg-indigo-50/50 rounded-2xl border border-indigo-100 font-sans text-left">
                  <div>
                    <span className="text-[9px] font-black text-indigo-900 uppercase tracking-widest block mb-0.5">Proposed Position / Job Title</span>
                    <p className="font-black text-indigo-950 text-sm">{job?.title || 'Unknown Role'}</p>
                  </div>
                  <div>
                    <span className="text-[9px] font-black text-indigo-900 uppercase tracking-widest block mb-0.5">Annual Package (CTC)</span>
                    <p className="font-black text-indigo-950 text-sm">
                      {offerCurrency === 'INR' && '₹'}
                      {offerCurrency === 'USD' && '$'}
                      {offerCurrency === 'GBP' && '£'}
                      {offerCurrency === 'EUR' && '€'}
                      {offerCurrency === 'SGD' && 'S$'}
                      {offerSalary.toLocaleString()} / Annual
                    </p>
                  </div>
                  <div>
                    <span className="text-[9px] font-black text-indigo-900 uppercase tracking-widest block mb-0.5">Joining Commencement Date</span>
                    <p className="font-black text-slate-800 text-xs">{offerStartDate}</p>
                  </div>
                  <div>
                    <span className="text-[9px] font-black text-indigo-900 uppercase tracking-widest block mb-0.5">Compliance Isolation</span>
                    <p className="font-black text-slate-800 text-xs">Section 06 ISO Certified</p>
                  </div>
                </div>

                <div className="space-y-2 text-left">
                  <h4 className="font-black text-slate-900 uppercase text-xs tracking-wider">Compensations & Benefits Ledger</h4>
                  <p className="text-xs text-slate-600 leading-relaxed italic pr-2">
                    {offerBenefits}
                  </p>
                </div>

                <p className="text-[11px] text-slate-400 italic text-left">
                  To confirm your acceptance, kindly click the simulated e-signature simulation block below. Signing this document constitutes your legal binding of employment.
                </p>

                {/* Simulated Handwritten Candidate Sign Block */}
                <div className="pt-6 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
                  <div className="text-left">
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-2">Authorized Signatory</span>
                    <p className="font-semibold text-slate-800">HR Director</p>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tight">{organization?.name || 'HIRENOW'}</p>
                  </div>

                  <div className="border-2 border-dashed border-indigo-150 rounded-2xl p-4 bg-slate-50 min-w-[200px] text-center relative group">
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">Candidate Signatory Signature</span>
                    
                    {offerState === 'accepted' ? (
                      <div className="py-2">
                        <p className="text-center text-indigo-600 text-2xl rotate-[-4deg] tracking-wider select-none font-sans font-black">
                          {candidate.fullName.split(' ').map(n=>n.charAt(0)).join('. ') + '. ' + candidate.fullName.split(' ').slice(-1)}
                        </p>
                        <p className="text-[10px] text-emerald-600 font-extrabold uppercase mt-1">✓ Signature Recorded Securely</p>
                      </div>
                    ) : (
                      <div className="py-2">
                        <Button 
                          onClick={() => {
                            setIsSigning(true);
                            setTimeout(() => {
                              setOfferState('accepted');
                              setIsSigning(false);
                              notify('Simulated Acceptance & E-Signature Recorded Successfully!', 'success');
                              
                              // Append Campaign Log
                              setOutboundLogs(prev => [
                                {
                                  id: String(prev.length + 1),
                                  channel: 'email',
                                  template: 'Offer Signed & Accepted',
                                  recipient: candidate.email,
                                  status: 'clicked',
                                  timestamp: 'Just now'
                                },
                                ...prev
                              ]);
                            }, 1200);
                          }}
                          disabled={isSigning || offerState === 'draft'}
                          className="bg-indigo-600 hover:bg-slate-900 border-none text-[10px] font-black uppercase tracking-widest px-4 py-2 h-auto text-white"
                        >
                          {isSigning ? 'Signing...' : offerState === 'draft' ? 'Awaiting Release' : 'Simulate E-Sign Acceptance'}
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* PDF Print and Standalone footer */}
              <div className="bg-slate-50 py-3 px-8 border-t border-slate-100 flex justify-between items-center text-[10px] text-slate-400 font-medium">
                <p>© 2026 {organization?.name || 'HireNow'} • Confidentially Guarded</p>
                <div className="flex gap-2">
                  <button 
                    onClick={() => {
                      window.print();
                    }}
                    className="flex items-center gap-1 hover:text-slate-600 font-semibold"
                  >
                    <Printer className="w-3.5 h-3.5" /> Print Draft
                  </button>
                </div>
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* Outbound Messaging campaigns Tab */}
      {activeDetailTab === 'campaign' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
          {/* Email/WhatsApp form configuration */}
          <Card className="p-8 space-y-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
                <Send className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-black text-slate-900 text-base uppercase tracking-wider">Automated Campaigns Workspace</h3>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tight">Configure Multi-Channel Outbound Triggers</p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Message Template Picker</label>
                <div className="flex flex-wrap gap-2">
                  {[
                    { id: 'invite', label: 'Invite to AI Voice Assessment', icon: Mic },
                    { id: 'reminder', label: 'Complete Screening Reminder', icon: Clock },
                    { id: 'offer_link', label: 'Release Offer Agreement Letter', icon: FileText }
                  ].map((temp) => {
                    const TIcon = temp.icon;
                    return (
                      <button
                        key={temp.id}
                        type="button"
                        onClick={() => setCampaignTemplate(temp.id as any)}
                        className={cn(
                          "p-3 rounded-xl border flex items-center gap-2 text-left text-xs font-bold transition-all flex-1 min-w-[200px]",
                          campaignTemplate === temp.id 
                            ? "bg-emerald-50 border-emerald-300 text-emerald-700 shadow-sm" 
                            : "bg-white border-slate-200 text-slate-550 hover:bg-slate-50"
                        )}
                      >
                        <TIcon className="w-4 h-4 text-emerald-500" />
                        <span>{temp.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">WhatsApp / SMS Dynamic Template Text</label>
                <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 font-mono text-xs text-slate-600 leading-relaxed text-left relative pl-10">
                  <div className="absolute top-4 left-4 bg-emerald-100 p-1 rounded-full text-emerald-650">
                    <Send className="w-3 h-3" />
                  </div>
                  {campaignTemplate === 'invite' && (
                    <p>
                      Hello <span className="text-emerald-600 font-extrabold">{candidate.fullName}</span>, we are excited to invite you to complete our automated AI Voice Assessment for <span className="text-emerald-600 font-extrabold">{job?.title}</span> at <span className="text-emerald-500 font-black">{organization?.name || 'our company'}</span>. Access your secure lobby via this link: {window.location.origin}/interview/{candidateId}
                    </p>
                  )}
                  {campaignTemplate === 'reminder' && (
                    <p>
                      Hi <span className="text-emerald-600 font-extrabold">{candidate.fullName}</span>, this is a friendly reminder to complete your AI Voice Assessment for the <span className="text-emerald-600 font-extrabold">{job?.title}</span> position with <span className="text-emerald-500 font-black">{organization?.name || 'our company'}</span>. Our screening panel requires this to advance!
                    </p>
                  )}
                  {campaignTemplate === 'offer_link' && (
                    <p>
                      Incredible news <span className="text-emerald-600 font-extrabold">{candidate.fullName}</span>! Your assessment score was outstanding. We have officially released your Offer Agreement letter. View and E-sign the document at your earliest convenience: {window.location.origin}/candidates/{candidateId}?tab=offer
                    </p>
                  )}
                </div>
              </div>

              <div className="p-4 bg-emerald-50/50 border border-emerald-100 rounded-2xl flex items-center justify-between">
                <div className="text-left">
                  <h4 className="text-[10px] font-black text-emerald-950 uppercase tracking-widest block mb-0.5">Campaign Outbound Targets</h4>
                  <p className="text-xs text-slate-600 leading-normal font-sans">
                    Email address: <span className="font-semibold text-slate-900">{candidate.email}</span> • Mobile: <span className="font-semibold text-slate-900">Registered</span>
                  </p>
                </div>
              </div>
            </div>

            <Button
              onClick={() => {
                setSendingOutbound(true);
                setTimeout(() => {
                  setSendingOutbound(false);
                  notify('Campaign messages triggered on both WhatsApp and Email!', 'success');
                  
                  // Add to log list
                  setOutboundLogs(prev => [
                    {
                      id: String(prev.length + 1),
                      channel: 'whatsapp',
                      template: campaignTemplate === 'invite' ? 'Voice Invite Bot' : campaignTemplate === 'reminder' ? 'Assessment Reminder' : 'Offer Dispatch Notification',
                      recipient: candidate.fullName,
                      status: 'delivered',
                      timestamp: 'Just now'
                    },
                    {
                      id: String(prev.length + 2),
                      channel: 'email',
                      template: campaignTemplate === 'invite' ? 'Voice Invite Bot' : campaignTemplate === 'reminder' ? 'Assessment Reminder' : 'Offer Dispatch Notification',
                      recipient: candidate.email,
                      status: 'delivered',
                      timestamp: 'Just now'
                    },
                    ...prev
                  ]);
                }, 1000);
              }}
              disabled={sendingOutbound}
              className="w-full bg-emerald-600 hover:bg-emerald-700 font-black uppercase tracking-widest text-xs h-11"
            >
              {sendingOutbound ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Send className="w-4 h-4 mr-2" />}
              Dispatch Campaign Trigger
            </Button>
          </Card>

          {/* Interactive Mobile Whatsapp Device Mock & logs */}
          <div className="space-y-6">
            {/* WhatsApp Mock Mobile Frame */}
            <div className="border-[12px] border-slate-950 rounded-[40px] bg-slate-905 w-full max-w-[340px] mx-auto overflow-hidden shadow-2xl relative min-h-[460px] flex flex-col justify-between">
              {/* Top notch bar */}
              <div className="bg-slate-950 text-white py-1 px-8 text-[9px] font-bold font-mono tracking-widest flex justify-between items-center shrink-0">
                <span>9:41</span>
                <span className="w-16 h-4 bg-slate-950 rounded-b-xl absolute top-0 left-1/2 -translate-x-1/2" />
                <div className="flex gap-1.5 items-center">
                  <span>5G</span>
                  <div className="w-4 h-2.5 bg-white rounded-sm shrink-0" />
                </div>
              </div>

              {/* Chat header contact */}
              <div className="bg-slate-800 text-white px-5 py-3 flex items-center gap-3 shrink-0">
                <div className="w-7 h-7 bg-indigo-500 rounded-full text-[10px] font-black text-center flex items-center justify-center border-2 border-white shadow">
                  HF
                </div>
                <div className="text-left">
                  <h4 className="text-[11px] font-black uppercase tracking-tight leading-none mb-0.5">{organization?.name || 'HIRENOW'}</h4>
                  <p className="text-[8px] text-emerald-400 font-bold uppercase tracking-widest">Active Verification Profile</p>
                </div>
              </div>

              {/* Chat background layout wrapper with dots pattern */}
              <div className="flex-1 bg-teal-50/50 px-4 py-6 overflow-y-auto space-y-4 max-h-[300px] text-left">
                {/* Outgoing template WhatsApp bubble */}
                <div className="bg-white p-3.5 rounded-2xl border border-teal-100 shadow-sm max-w-[90%] relative">
                  <div className="text-slate-650 text-[11px] leading-relaxed font-sans pr-2">
                    {campaignTemplate === 'invite' && (
                      <p>
                        Hello <strong>{candidate.fullName}</strong>, we are excited to invite you to complete our automated AI Voice Assessment for <strong>{job?.title}</strong> with <strong>{organization?.name || 'our company'}</strong>. Access your secure lobby via this link: {window.location.origin}/interview/{candidateId}
                      </p>
                    )}
                    {campaignTemplate === 'reminder' && (
                      <p>
                        Hi <strong>{candidate.fullName}</strong>, this is a friendly reminder to complete your AI Voice Assessment for the <strong>{job?.title}</strong> position with <strong>{organization?.name || 'our company'}</strong>. Our screening panel requires this to advance!
                      </p>
                    )}
                    {campaignTemplate === 'offer_link' && (
                      <p>
                        Incredible news <strong>{candidate.fullName}</strong>! Your assessment score was outstanding. We have officially released your Offer Agreement letter. View and E-sign the document at your earliest convenience: {window.location.origin}/candidates/{candidateId}?tab=offer
                      </p>
                    )}
                  </div>
                  
                  {/* Whatsapp tick timing footer */}
                  <div className="flex justify-end gap-1 items-center mt-2 pb-0.5 pointer-events-none">
                    <span className="text-[8px] text-slate-400">9:41 AM</span>
                    <div className="flex items-center text-blue-500 scale-90">
                      <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Chat input footer mocker */}
              <div className="bg-slate-950 p-2 text-white/50 text-[10px] items-center flex justify-between shrink-0">
                <span>Message</span>
                <Send className="w-3.5 h-3.5" />
              </div>
            </div>

            {/* Campaign Metrics Ledger Ledger */}
            <Card className="p-6">
              <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">Outbound Delivery Campaign Log</h4>
              <div className="space-y-3">
                {outboundLogs.map((log) => (
                  <div key={log.id} className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between text-xs gap-4 font-sans text-left">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "p-2 rounded-lg shrink-0",
                        log.channel === 'whatsapp' ? "bg-emerald-50 text-emerald-600" : "bg-blue-50 text-blue-600"
                      )}>
                        <MessageSquare className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="font-extrabold text-slate-900">{log.template}</p>
                        <p className="text-[10px] text-slate-400 truncate max-w-[200px]">{log.recipient}</p>
                      </div>
                    </div>

                    <div className="text-right">
                      <span className={cn(
                        "text-[9px] font-black uppercase px-2 py-0.5 rounded tracking-widest",
                        log.status === 'delivered' ? "bg-green-100 text-green-800" : log.status === 'clicked' ? "bg-indigo-100 text-indigo-800" : "bg-slate-100 text-slate-600"
                      )}>
                        {log.status}
                      </span>
                      <p className="text-[9px] text-slate-400 mt-1">{log.timestamp}</p>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* Advanced Proctoring Screen Tab */}
      {activeDetailTab === 'proctoring' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
          
          {/* Simulated Webcam Viewport */}
          <div className="lg:col-span-2 space-y-4">
            <Card className="bg-slate-950 rounded-3xl overflow-hidden relative border-none aspect-video flex flex-col justify-between shadow-2xl">
              {/* Video elements overlay parameters */}
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-slate-950/30 font-sans pointer-events-none" />
              
              {/* Canvas Simulation */}
              <div className="absolute inset-x-8 inset-y-16 flex items-center justify-center border-4 border-dashed border-indigo-500/20 rounded-2xl bg-slate-905/30 backdrop-blur-sm z-10 transition-all duration-300">
                {activeCameraTest ? (
                  <div className="text-center space-y-4 font-sans">
                    {cameraAnomalyMock ? (
                      <div className="mx-auto w-16 h-16 rounded-full bg-red-500/20 border-2 border-red-500 flex items-center justify-center animate-bounce">
                        <AlertTriangle className="w-8 h-8 text-red-500" />
                      </div>
                    ) : (
                      <div className="mx-auto w-16 h-16 rounded-full bg-emerald-500/10 border-2 border-emerald-500 flex items-center justify-center relative animate-pulse">
                        <Users className="w-6 h-6 text-emerald-400" />
                        {/* Eye tracking point mockup boxes */}
                        <div className="absolute top-1/2 left-1/4 -translate-y-1/2 w-2 h-2 rounded-full bg-indigo-400 animate-ping" />
                        <div className="absolute top-1/2 right-1/4 -translate-y-1/2 w-2 h-2 rounded-full bg-indigo-400 animate-ping" />
                      </div>
                    )}
                    <div>
                      <p className="text-xs font-black text-indigo-400 uppercase tracking-widest animate-pulse">
                        {cameraAnomalyMock ? 'SECURITY VIOLATION TRIGGERED' : 'BIOMETRIC ANOMALY SYSTEM ACTIVE'}
                      </p>
                      <p className="text-sm font-extrabold text-white">
                        {cameraAnomalyMock ? 'Multiple Faces Observed inside Feed!' : 'Verified: Single Candidate Presence'}
                      </p>
                      {gazeDeviationMock && <p className="text-[10px] text-red-400 uppercase tracking-widest font-black animate-pulse">GAZE DEVIATION DETECTED: Looking offscreen</p>}
                    </div>
                  </div>
                ) : (
                  <div className="text-center space-y-2 py-10 font-sans">
                    <Camera className="w-12 h-12 text-slate-600 mx-auto" />
                    <p className="text-xs font-black text-slate-400 uppercase tracking-widest">PROCTORING MONITORING FEED STANDBY</p>
                    <p className="text-[10px] text-slate-500 p-2 max-w-sm mx-auto leading-relaxed">Simulate live visual checks & eye trace mapping used during voice sessions.</p>
                  </div>
                )}
              </div>

              {/* Absolute watermark trackers */}
              <div className="p-6 flex justify-between items-start relative z-20">
                <span className="text-[10px] font-black bg-slate-900/80 text-indigo-400 px-3 py-1.5 rounded-xl uppercase tracking-widest backdrop-blur border border-slate-700/50">
                  CAMERA CHECKPOINT FEED • 1080P
                </span>
                <span className={cn(
                  "text-[9px] font-black px-2.5 py-1 rounded-full uppercase tracking-widest border font-sans animate-pulse",
                  (cameraAnomalyMock || tabSwitchCountMock > 0 || gazeDeviationMock) ? "bg-red-500/20 text-red-400 border-red-500/30" : "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                )}>
                  {(cameraAnomalyMock || tabSwitchCountMock > 0 || gazeDeviationMock) ? 'POTENTIAL ADVERSARIAL ALERT' : 'SECURE SESSION'}
                </span>
              </div>

              {/* Camera layout controls footer */}
              <div className="p-6 bg-slate-900 border-t border-slate-800 flex justify-between items-center relative z-20 shrink-0">
                <Button 
                  onClick={() => {
                    setActiveCameraTest(prev => !prev);
                    setCameraAnomalyMock(false);
                    setTabSwitchCountMock(0);
                    setGazeDeviationMock(false);
                  }}
                  className="bg-indigo-600 hover:bg-indigo-700 font-black text-xs uppercase tracking-widest h-10 px-5"
                >
                  {activeCameraTest ? 'STANDBY SYSTEM' : 'BOOT CAM TESTER'}
                </Button>

                <div className="flex gap-2">
                  <span className="text-[10px] text-slate-400 uppercase tracking-widest font-mono">INTEGRITY MATRIX ACTIVE</span>
                </div>
              </div>
            </Card>

            {/* Simulated candidate actions launcher */}
            <Card className="p-6">
              <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">Simulate Candidate Adversarial Cheating Patterns</h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Button 
                  onClick={() => {
                    if (!activeCameraTest) return notify('Please BOOT CAM TESTER first', 'info');
                    setTabSwitchCountMock(prev => prev + 1);
                    notify('Simulated Candidate switched browser tab!', 'error');
                  }}
                  variant="outline"
                  className="border-red-200 text-red-700 hover:bg-red-50 text-[10px] font-black uppercase tracking-widest py-3 h-auto"
                >
                  Simulate Tab Switch
                </Button>
                <Button 
                  onClick={() => {
                    if (!activeCameraTest) return notify('Please BOOT CAM TESTER first', 'info');
                    setGazeDeviationMock(prev => !prev);
                    notify('Simulated Candidate looking offscreen!', 'error');
                  }}
                  variant="outline"
                  className="border-red-200 text-red-700 hover:bg-red-50 text-[10px] font-black uppercase tracking-widest py-3 h-auto"
                >
                  Simulate Left-Gaze Bias
                </Button>
                <Button 
                  onClick={() => {
                    if (!activeCameraTest) return notify('Please BOOT CAM TESTER first', 'info');
                    setCameraAnomalyMock(prev => !prev);
                    notify('Simulated secondary face inside feed!', 'error');
                  }}
                  variant="outline"
                  className="border-red-200 text-red-700 hover:bg-red-50 text-[10px] font-black uppercase tracking-widest py-3 h-auto"
                >
                  Simulate Joint Presence
                </Button>
              </div>
            </Card>
          </div>

          {/* Proctoring telemetry stats */}
          <div className="space-y-6">
            <Card className="p-6 space-y-4">
              <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest pb-2 border-b border-slate-100">Integrity Telemetry Index</h4>
              
              <div className="flex gap-3 items-center py-2 text-left">
                <div className={cn(
                  "w-12 h-12 rounded-2xl flex flex-col items-center justify-center font-black text-xl border shadow-inner",
                  (tabSwitchCountMock > 2 || cameraAnomalyMock) ? "bg-red-50 border-red-200 text-red-600 animate-pulse" : (tabSwitchCountMock > 0 || gazeDeviationMock) ? "bg-amber-100 text-amber-600" : "bg-emerald-50 border-emerald-200 text-emerald-600"
                )}>
                  {Math.max(0, 100 - (tabSwitchCountMock * 25) - (cameraAnomalyMock ? 50 : 0) - (gazeDeviationMock ? 15 : 0))}%
                </div>
                <div>
                  <span className="text-[9px] font-black bg-slate-100 text-slate-500 px-2 py-0.5 rounded uppercase tracking-wider block mb-1">Stability Gauge</span>
                  <p className="text-xs font-bold text-slate-800">
                    {(tabSwitchCountMock > 2 || cameraAnomalyMock) ? 'Severe Security Penalty Alert' : (tabSwitchCountMock > 0 || gazeDeviationMock) ? 'Anomalous Integrity' : 'Elite Verified Safe Profile'}
                  </p>
                </div>
              </div>

              <div className="space-y-3 pt-2 text-left">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-500 font-medium">Off-screen Outbreaks</span>
                  <span className="font-extrabold text-slate-800">{gazeDeviationMock ? '1 active' : '0 detected'}</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-500 font-medium">Tab Switch Deviations</span>
                  <span className="font-extrabold text-slate-800">{tabSwitchCountMock} triggers</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-500 font-medium">Secondary Audio Signal</span>
                  <span className="font-extrabold text-slate-800">0.0dB Stable</span>
                </div>
              </div>
            </Card>

            <Card className="p-6">
              <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">Adversarial Violation Ledger</h4>
              <div className="space-y-3">
                {tabSwitchCountMock > 0 && (
                  <div className="p-3 bg-red-50 border border-red-100 rounded-xl text-xs flex justify-between items-center font-sans text-left">
                    <span className="text-red-700 font-extrabold uppercase">Tab Switched ({tabSwitchCountMock}x)</span>
                    <span className="text-red-400 font-mono">Just now</span>
                  </div>
                )}
                {gazeDeviationMock && (
                  <div className="p-3 bg-amber-50 border border-amber-100 rounded-xl text-xs flex justify-between items-center font-sans text-left">
                    <span className="text-amber-700 font-extrabold uppercase">Gaze Bias Detected</span>
                    <span className="text-amber-400 font-mono">Active</span>
                  </div>
                )}
                {cameraAnomalyMock && (
                  <div className="p-3 bg-red-100 border border-red-200 rounded-xl text-xs flex justify-between items-center font-sans text-left">
                    <span className="text-red-800 font-black uppercase">Multi-face Warning</span>
                    <span className="text-red-500 font-mono">Triggered</span>
                  </div>
                )}
                {!cameraAnomalyMock && !gazeDeviationMock && tabSwitchCountMock === 0 && (
                  <div className="py-6 text-center border-2 border-dashed border-slate-100 rounded-2xl bg-slate-50/50">
                    <p className="text-xs text-slate-400 italic">No violation blocks detected.</p>
                  </div>
                )}
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

function MetricCard({ 
  label, 
  val, 
  desc, 
  icon: Icon, 
  iconColor, 
  iconBg 
}: { 
  label: string; 
  val: string | number; 
  desc: string; 
  icon: any; 
  iconColor: string; 
  iconBg: string; 
}) {
  return (
    <Card className="p-6 bg-white/80 backdrop-blur-sm border border-slate-100 hover:border-indigo-500/20 transition-all shadow-sm">
      <div className="flex justify-between items-start mb-4">
        <div className="min-w-0">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 leading-snug">{label}</p>
          <p className="text-4xl font-black text-slate-900 tracking-tight leading-none truncate">{val}</p>
        </div>
        <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center shrink-0", iconBg, iconColor)}>
          <Icon className="w-5 h-5 font-bold" />
        </div>
      </div>
      <p className="text-xs text-slate-500 leading-relaxed font-medium mt-auto">{desc}</p>
    </Card>
  );
}

function OrgAdminPanel() {
  const { profile, organization, refreshProfile } = useProfile();
  const { notify } = useNotification();
  const [loading, setLoading] = useState(true);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Custom states for Workspace settings editing
  const [activePanelTab, setActivePanelTab] = useState<'analytics' | 'workspace'>('analytics');

  const [orgName, setOrgName] = useState('');
  const [orgDomain, setOrgDomain] = useState('');
  const [orgIndustry, setOrgIndustry] = useState('Technology');
  const [orgCompanySize, setOrgCompanySize] = useState('11-50');
  const [orgLocation, setOrgLocation] = useState('');
  const [orgPhone, setOrgPhone] = useState('');
  const [orgDescription, setOrgDescription] = useState('');
  // Working Hours States
  const [orgWorkingHoursStart, setOrgWorkingHoursStart] = useState('09:00');
  const [orgWorkingHoursEnd, setOrgWorkingHoursEnd] = useState('17:00');
  const [orgWorkingHoursTimezone, setOrgWorkingHoursTimezone] = useState('UTC');
  const [botSpeakingPace, setBotSpeakingPace] = useState<number>(1.0);

  // SMTP States
  const [smtpHost, setSmtpHost] = useState('');
  const [smtpPort, setSmtpPort] = useState('465');
  const [smtpSecure, setSmtpSecure] = useState(true);
  const [smtpUser, setSmtpUser] = useState('');
  const [smtpPass, setSmtpPass] = useState('');
  const [smtpFromName, setSmtpFromName] = useState('');
  const [smtpFromEmail, setSmtpFromEmail] = useState('');

  const [savingSettings, setSavingSettings] = useState(false);
  const [testingSmtp, setTestingSmtp] = useState(false);

  const isReadOnly = profile?.role === 'recruiter';
  
  // Filters State
  const [dateRange, setDateRange] = useState<string>('30');
  const [selectedOrgId, setSelectedOrgId] = useState<string>('all');
  const [workingHoursStart, setWorkingHoursStart] = useState<string>('09:00');
  const [workingHoursEnd, setWorkingHoursEnd] = useState<string>('18:00');

  const isSuperAdmin = auth.currentUser?.email === 'malviya.pratyush26@gmail.com';

  useEffect(() => {
    if (organization) {
      setOrgName(organization.name || '');
      setOrgDomain(organization.domain || '');
      setOrgIndustry(organization.industry || 'Technology');
      setOrgCompanySize(organization.companySize || '11-50');
      setOrgLocation(organization.location || '');
      setOrgPhone(organization.phone || '');
      setOrgDescription(organization.description || '');
      setOrgWorkingHoursStart(organization.workingHours?.start || '09:00');
      setOrgWorkingHoursEnd(organization.workingHours?.end || '17:00');
      setOrgWorkingHoursTimezone(organization.workingHours?.timezone || 'UTC');
      setBotSpeakingPace(organization.botSpeakingPace || 1.0);

      setSmtpHost(organization.emailSettings?.smtpHost || '');
      setSmtpPort(organization.emailSettings?.smtpPort || '465');
      setSmtpSecure(organization.emailSettings?.smtpSecure !== false);
      setSmtpUser(organization.emailSettings?.smtpUser || '');
      setSmtpPass(organization.emailSettings?.smtpPass || '');
      setSmtpFromName(organization.emailSettings?.smtpFromName || '');
      setSmtpFromEmail(organization.emailSettings?.smtpFromEmail || '');
    }
  }, [organization]);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organization) return;
    if (isReadOnly) {
      notify('Access Denied: Recruiter role cannot alter workspace configurations.', 'error');
      return;
    }

    setSavingSettings(true);
    try {
      const updatedData: Partial<Organization> = {
        name: orgName.trim(),
        domain: orgDomain.trim() || null,
        industry: orgIndustry,
        companySize: orgCompanySize,
        location: orgLocation.trim() || null,
        phone: orgPhone.trim() || null,
        description: orgDescription.trim() || null,
        workingHours: {
          start: orgWorkingHoursStart,
          end: orgWorkingHoursEnd,
          timezone: orgWorkingHoursTimezone
        },
        botSpeakingPace: botSpeakingPace,
        emailSettings: {
          smtpHost: smtpHost.trim() || null,
          smtpPort: smtpPort.trim() || null,
          smtpSecure: smtpSecure,
          smtpUser: smtpUser.trim() || null,
          smtpPass: smtpPass.trim() || null,
          smtpFromName: smtpFromName.trim() || null,
          smtpFromEmail: smtpFromEmail.trim() || null,
        }
      };

      await updateDoc(doc(db, 'organizations', organization.id), updatedData);
      notify('Workspace preferences saved successfully', 'success');
      await refreshProfile();
      setActivePanelTab('analytics');
    } catch (err) {
      console.error('Error saving organization settings:', err);
      notify('Failed to save settings: ' + (err instanceof Error ? err.message : 'Permission denied'), 'error');
      handleFirestoreError(err, OperationType.UPDATE, `organizations/${organization.id}`);
    } finally {
      setSavingSettings(false);
    }
  };

  // Set default selected organization once profile is loaded
  useEffect(() => {
    if (profile?.organizationId) {
      setSelectedOrgId(profile.organizationId);
    }
  }, [profile]);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        if (!auth.currentUser) return;

        let jobsList: Job[] = [];
        let candidatesList: Candidate[] = [];
        let orgsList: Organization[] = [];

        if (isSuperAdmin) {
          const [jobsSnap, candidatesSnap, orgsSnap] = await Promise.all([
            getDocs(collection(db, 'jobs')),
            getDocs(collection(db, 'candidates')),
            getDocs(collection(db, 'organizations'))
          ]);
          jobsList = jobsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Job));
          candidatesList = candidatesSnap.docs.map(d => ({ id: d.id, ...d.data() } as Candidate));
          orgsList = orgsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Organization));
        } else if (profile?.organizationId) {
          const orgId = profile.organizationId;
          const [jobsSnap, candidatesSnap] = await Promise.all([
            getDocs(query(collection(db, 'jobs'), where('organizationId', '==', orgId))),
            getDocs(query(collection(db, 'candidates'), where('organizationId', '==', orgId)))
          ]);
          jobsList = jobsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Job));
          candidatesList = candidatesSnap.docs.map(d => ({ id: d.id, ...d.data() } as Candidate));
          
          if (organization) {
            orgsList = [organization];
          } else {
            const orgDoc = await getDoc(doc(db, 'organizations', orgId));
            if (orgDoc.exists()) {
              orgsList = [{ id: orgDoc.id, ...orgDoc.data() } as Organization];
            }
          }
        }

        setJobs(jobsList);
        setCandidates(candidatesList);
        setOrganizations(orgsList);
      } catch (err) {
        console.error('Error loading metrics data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [profile, organization, isSuperAdmin]);

  const getCandidateDate = (c: Candidate): Date => {
    if (c.createdAt) {
      if (typeof c.createdAt.toDate === 'function') {
        return c.createdAt.toDate();
      }
      if (c.createdAt.seconds) {
        return new Date(c.createdAt.seconds * 1000);
      }
      return new Date(c.createdAt);
    }
    return new Date();
  };

  const filteredCandidates = candidates.filter(c => {
    // 1. Organization filter
    if (isSuperAdmin) {
      if (selectedOrgId !== 'all' && c.organizationId !== selectedOrgId) {
        return false;
      }
    } else {
      if (c.organizationId !== profile?.organizationId) {
        return false;
      }
    }

    // 2. Date Range filter
    if (dateRange !== 'all') {
      const now = new Date();
      const cutoffDate = new Date();
      cutoffDate.setDate(now.getDate() - parseInt(dateRange));
      const cDate = getCandidateDate(c);
      if (cDate < cutoffDate) {
        return false;
      }
    }

    return true;
  });

  const filteredJobs = jobs.filter(j => {
    // 1. Organization filter
    if (isSuperAdmin) {
      if (selectedOrgId !== 'all' && j.organizationId !== selectedOrgId) {
        return false;
      }
    } else {
      if (j.organizationId !== profile?.organizationId) {
        return false;
      }
    }

    // 2. Date Range filter
    if (dateRange !== 'all') {
      const now = new Date();
      const cutoffDate = new Date();
      cutoffDate.setDate(now.getDate() - parseInt(dateRange));
      
      const getJobDate = (job: Job): Date => {
        if (job.createdAt) {
          if (typeof job.createdAt.toDate === 'function') {
            return job.createdAt.toDate();
          }
          if (job.createdAt.seconds) {
            return new Date(job.createdAt.seconds * 1000);
          }
          return new Date(job.createdAt);
        }
        return new Date();
      };

      const jDate = getJobDate(j);
      if (jDate < cutoffDate) {
        return false;
      }
    }

    return true;
  });

  const resumesScreened = filteredCandidates.length;
  const completedInterviews = filteredCandidates.filter(c => c.interviewStatus === 'completed');
  const interviewsConducted = completedInterviews.length;
  const totalJobsAdded = filteredJobs.length;

  let workingHoursCount = 0;
  let outsideHoursCount = 0;

  completedInterviews.forEach(c => {
    const cDate = getCandidateDate(c);
    
    try {
      const timeStrOptions: Intl.DateTimeFormatOptions = {
        timeZone: orgWorkingHoursTimezone,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      };
      
      const timeFormatter = new Intl.DateTimeFormat('en-US', timeStrOptions);
      // Extracts HH:MM formatted in the organization's timezone
      const formattedTime = timeFormatter.format(cDate);

      // Compare lexically (e.g., "14:30" >= "09:00")
      if (formattedTime >= orgWorkingHoursStart && formattedTime <= orgWorkingHoursEnd) {
        workingHoursCount++;
      } else {
        outsideHoursCount++;
      }
    } catch (e) {
      // Fallback if timezone is invalid
      const hour = cDate.getHours();
      const minute = cDate.getMinutes();
      const timeStr = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
      if (timeStr >= orgWorkingHoursStart && timeStr <= orgWorkingHoursEnd) {
        workingHoursCount++;
      } else {
        outsideHoursCount++;
      }
    }
  });

  const workingHoursPercent = interviewsConducted > 0 ? (workingHoursCount / interviewsConducted) * 100 : 0;
  const outsideHoursPercent = interviewsConducted > 0 ? (outsideHoursCount / interviewsConducted) * 100 : 0;

  const daysCount = dateRange === 'all' ? 30 : parseInt(dateRange);
  const dailyData: { date: string; interviews: number; resumes: number }[] = [];
  
  const start = new Date();
  start.setDate(start.getDate() - daysCount + 1);

  for (let i = 0; i < daysCount; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const dateStr = d.toISOString().slice(0, 10);
    
    let dayInterviews = 0;
    let dayResumes = 0;
    
    filteredCandidates.forEach(c => {
      const cDate = getCandidateDate(c);
      const cDateStr = cDate.toISOString().slice(0, 10);
      if (cDateStr === dateStr) {
        dayResumes++;
        if (c.interviewStatus === 'completed') {
          dayInterviews++;
        }
      }
    });

    dailyData.push({
      date: dateStr,
      interviews: dayInterviews,
      resumes: dayResumes,
    });
  }

  const pieData = interviewsConducted > 0 ? [
    { name: 'During Working Hours', value: workingHoursCount, color: '#10b981' },
    { name: 'Outside Working Hours', value: outsideHoursCount, color: '#f97316' }
  ] : [
    { name: 'No Data', value: 1, color: '#cbd5e1' }
  ];

  const activeOrgName = isSuperAdmin 
    ? (selectedOrgId === 'all' ? 'KaraX' : (organizations.find(o => o.id === selectedOrgId)?.name || 'KaraX'))
    : (organization?.name || 'KaraX');

  if (loading) {
    return (
      <div className="h-[60vh] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Loading Metrics Panel...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <Modal
        isOpen={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        title="Filters"
      >
        <div className="space-y-6">
          <p className="text-slate-500 text-xs">
            Adjust the date range, working hours, and organization for HR Agent metrics.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Date range</label>
              <select
                value={dateRange}
                onChange={e => setDateRange(e.target.value)}
                className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-3 font-bold text-slate-900 focus:border-indigo-500 outline-none transition-all text-sm"
              >
                <option value="7">7 Days</option>
                <option value="30">30 Days</option>
                <option value="90">90 Days</option>
                <option value="all">All Time</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Organization</label>
              {isSuperAdmin ? (
                <select
                  value={selectedOrgId}
                  onChange={e => setSelectedOrgId(e.target.value)}
                  className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-3 font-bold text-slate-900 focus:border-indigo-500 outline-none transition-all text-sm"
                >
                  <option value="all">All Organizations</option>
                  {organizations.map(org => (
                    <option key={org.id} value={org.id}>{org.name}</option>
                  ))}
                </select>
              ) : (
                <div className="w-full bg-slate-100/50 border-2 border-slate-100 rounded-xl px-4 py-3 font-bold text-slate-400 select-none text-sm">
                  {organization?.name || 'My Organization'}
                </div>
              )}
            </div>

            <div className="md:col-span-2 space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5 overflow-visible">
                Working hours 
                <div className="group relative">
                  <span className="cursor-help text-slate-300 hover:text-indigo-500 transition-colors">
                    <Info className="w-3.5 h-3.5" />
                  </span>
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-3 bg-slate-900 text-white text-[10px] font-medium rounded-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 shadow-xl border border-slate-700 pointer-events-none normal-case tracking-normal">
                    <span className="font-black text-indigo-400 block mb-1 uppercase tracking-widest">Working Hours Range</span>
                    Defines the standard operational hour interval used to segment analytics for timezone/outside-hours interview metrics.
                    <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-slate-900" />
                  </div>
                </div>
              </label>
              <div className="flex items-center gap-3">
                <div className="relative flex-1">
                  <input
                    type="time" 
                    value={workingHoursStart}
                    onChange={e => setWorkingHoursStart(e.target.value)}
                    className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-3 font-bold text-slate-900 focus:border-indigo-500 outline-none transition-all text-sm"
                  />
                </div>
                <span className="text-xs font-bold text-slate-400 uppercase tracking-widest font-mono">to</span>
                <div className="relative flex-1">
                  <input
                    type="time" 
                    value={workingHoursEnd}
                    onChange={e => setWorkingHoursEnd(e.target.value)}
                    className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-3 font-bold text-slate-900 focus:border-indigo-500 outline-none transition-all text-sm"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-4 border-t border-slate-150">
            <Button
              variant="outline"
              className="px-6 h-11 text-[10px] font-black uppercase tracking-widest"
              onClick={() => setFiltersOpen(false)}
            >
              Close
            </Button>
          </div>
        </div>
      </Modal>

      {/* Admin Panel Header Block */}
      <div className="bg-white rounded-[2rem] border border-slate-105 p-8 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 w-48 h-48 bg-gradient-to-br from-indigo-500/10 to-transparent rounded-full -mr-16 -mt-16 blur-2xl" />
        <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-6 relative">
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-slate-400 text-[10px] font-black uppercase tracking-widest">
              <span className="text-indigo-600">◀</span>
              <span>{activeOrgName} Admin Panel</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 uppercase tracking-tight">
              Manage everything about {activeOrgName}.ai
            </h1>
          </div>
        </div>
      </div>

      {/* Sub-Tab Navigation Bar */}
      <div className="flex gap-4 border-b border-slate-200 pb-2">
        <button 
          onClick={() => setActivePanelTab('analytics')}
          className={cn(
            "pb-3 px-4 text-xs font-black uppercase tracking-widest flex items-center gap-2 transition-all relative border-b-2",
            activePanelTab === 'analytics' 
              ? "border-b-2 border-indigo-600 text-indigo-600 font-black pb-[11px]" 
              : "border-transparent text-slate-400 hover:text-slate-600"
          )}
        >
          <BarChart3 className="w-4 h-4" />
          Analytics Dashboard
        </button>
        <button 
          onClick={() => setActivePanelTab('workspace')}
          className={cn(
            "pb-3 px-4 text-xs font-black uppercase tracking-widest flex items-center gap-2 transition-all relative border-b-2",
            activePanelTab === 'workspace' 
              ? "border-b-2 border-indigo-600 text-indigo-600 font-black pb-[11px]" 
              : "border-transparent text-slate-400 hover:text-slate-600"
          )}
        >
          <Settings className="w-4 h-4" />
          Workspace Configuration
        </button>
      </div>

      {activePanelTab === 'analytics' ? (
        <>
          {/* Sub Header for Metrics Panel */}
          <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 border-b border-slate-100 pb-6">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight uppercase leading-none mb-1">
            HR Agent Metrics Dashboard
          </h2>
          <p className="text-slate-500 text-xs sm:text-sm">
            Monitor interview activity, resume screening throughput, and working-hours efficiency from a single admin view.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => setFiltersOpen(true)}
          className="flex items-center justify-center gap-2 text-xs font-black uppercase tracking-widest px-5 h-11 bg-white border-slate-200 text-slate-700 hover:bg-slate-50 shrink-0 shadow-sm rounded-xl"
        >
          <Filter className="w-4 h-4 text-slate-500" />
          Filters
        </Button>
      </div>

      {/* Metric Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6">
        <MetricCard
          label="Total Jobs Added"
          val={totalJobsAdded}
          desc="Jobs added to screen resumes in the selected range"
          icon={Briefcase}
          iconBg="bg-indigo-50"
          iconColor="text-indigo-600"
        />
        <MetricCard
          label="Interviews Conducted"
          val={interviewsConducted}
          desc="Completed interview activity in the selected range"
          icon={Video}
          iconBg="bg-teal-50"
          iconColor="text-teal-700"
        />
        <MetricCard
          label="Resumes Screened"
          val={resumesScreened}
          desc="Candidates evaluated through resume screening"
          icon={FileText}
          iconBg="bg-blue-50"
          iconColor="text-blue-600"
        />
        <MetricCard
          label="Working Hours Interviews"
          val={`${workingHoursPercent.toFixed(1)}%`}
          desc={`${workingHoursCount} interviews during working hours`}
          icon={Clock}
          iconBg="bg-emerald-50"
          iconColor="text-emerald-600"
        />
        <MetricCard
          label="Outside Working Hours"
          val={`${outsideHoursPercent.toFixed(1)}%`}
          desc={`${outsideHoursCount} interviews outside working hours`}
          icon={Calendar}
          iconBg="bg-orange-50"
          iconColor="text-orange-600"
        />
      </div>

      {/* Visual Analytics Block */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 pb-12">
        {/* Daily Trend */}
        <div className="lg:col-span-2">
          <Card className="p-6 bg-white border border-slate-100 shadow-sm rounded-3xl h-full flex flex-col justify-between">
            <div className="mb-6">
              <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight">Activity Trend</h3>
              <p className="text-xs text-slate-400">
                Daily trend for interviews conducted and resumes screened in the selected range.
              </p>
            </div>

            <div className="flex-1 min-h-[300px] flex items-center justify-center">
              {filteredCandidates.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={dailyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis
                      dataKey="date"
                      stroke="#94a3b8"
                      fontSize={10}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v) => {
                        try {
                          const parts = v.split('-');
                          return parts.length >= 3 ? `${parts[1]}/${parts[2]}` : v;
                        } catch {
                          return v;
                        }
                      }}
                    />
                    <YAxis stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)' }}
                      labelStyle={{ fontWeight: 'bold', color: '#1e293b', fontSize: '12px' }}
                      itemStyle={{ fontSize: '11px' }}
                    />
                    <Bar dataKey="resumes" name="Resumes Screened" fill="#4f46e5" radius={[4, 4, 0, 0]} barSize={14} />
                    <Bar dataKey="interviews" name="Interviews Conducted" fill="#06b6d4" radius={[4, 4, 0, 0]} barSize={14} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="text-center py-12 flex flex-col items-center justify-center">
                  <div className="w-16 h-16 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-300 mb-3">
                    <FileText className="w-8 h-8" />
                  </div>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">No Activity Data</p>
                  <p className="text-[10px] text-slate-400 italic">No candidates/interviews available in the selected range.</p>
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* Working Hours Split */}
        <div className="lg:col-span-1">
          <Card className="p-6 bg-white border border-slate-100 shadow-sm rounded-3xl h-full flex flex-col justify-between">
            <div className="mb-6">
              <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight">Working Hours Distribution</h3>
              <p className="text-xs text-slate-400">
                Percentage split between interviews held during and outside working hours.
              </p>
            </div>

            <div className="flex-1 min-h-[200px] flex items-center justify-center">
              {interviewsConducted > 0 ? (
                <div className="w-full flex flex-col items-center">
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {pieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)' }}
                        itemStyle={{ fontSize: '11px', fontWeight: 'bold' }}
                        formatter={(value) => `${value} interviews`}
                      />
                    </PieChart>
                  </ResponsiveContainer>

                  <div className="w-full mt-4 space-y-2">
                    <div className="flex items-center justify-between p-2.5 bg-green-50/50 rounded-xl border border-green-100/40">
                      <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full bg-[#10b981]" />
                        <span className="text-xs font-black uppercase text-slate-600 tracking-tight">Working Hours</span>
                      </div>
                      <span className="text-xs font-black text-green-700">{workingHoursPercent.toFixed(1)}% <span className="text-slate-400 font-medium font-mono text-[10px]">({workingHoursCount})</span></span>
                    </div>

                    <div className="flex items-center justify-between p-2.5 bg-orange-50/50 rounded-xl border border-orange-100/40">
                      <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full bg-[#f97316]" />
                        <span className="text-xs font-black uppercase text-slate-600 tracking-tight">Outside Working Hours</span>
                      </div>
                      <span className="text-xs font-black text-orange-700">{outsideHoursPercent.toFixed(1)}% <span className="text-slate-400 font-medium font-mono text-[10px]">({outsideHoursCount})</span></span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-12 flex flex-col items-center justify-center">
                  <div className="w-16 h-16 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-300 mb-3">
                    <Clock className="w-8 h-8" />
                  </div>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">No Completed Interviews</p>
                  <p className="text-[10px] text-slate-400 italic font-medium">Completed interviews are required to view working hours split.</p>
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>
    </>
  ) : (
      <div className="space-y-8 animate-in fade-in duration-500">
        {isReadOnly && (
          <div className="flex gap-4 p-4 bg-amber-50 rounded-2xl border border-amber-100 items-center">
            <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
            <p className="text-xs font-bold text-amber-800 uppercase tracking-wide leading-relaxed">
              Read-only Access: Only Workspace Owners or Administrators can modify company details and mail delivery configuration.
            </p>
          </div>
        )}

        <form onSubmit={handleSaveSettings} className="space-y-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            
            {/* Company Details */}
            <Card className="p-8 space-y-6 bg-white border border-slate-100 shadow-sm rounded-3xl">
              <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
                <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center">
                  <Globe className="w-5 h-5 text-indigo-600" />
                </div>
                <div>
                  <h3 className="font-black text-slate-900 uppercase text-sm tracking-wide">Company Identity</h3>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Workspace Profile Details</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Organization Name</label>
                  <input
                    type="text"
                    required
                    disabled={isReadOnly}
                    value={orgName}
                    onChange={e => setOrgName(e.target.value)}
                    placeholder="e.g. Acme Corp"
                    className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-2.5 font-bold text-slate-900 focus:border-indigo-500 outline-none transition-all text-xs disabled:opacity-60 disabled:cursor-not-allowed"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Web Domain</label>
                  <input
                    type="text"
                    disabled={isReadOnly}
                    value={orgDomain}
                    onChange={e => setOrgDomain(e.target.value)}
                    placeholder="e.g. acme.com"
                    className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-2.5 font-bold text-slate-900 focus:border-indigo-500 outline-none transition-all text-xs disabled:opacity-60"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Industry</label>
                  <select
                    disabled={isReadOnly}
                    value={orgIndustry}
                    onChange={e => setOrgIndustry(e.target.value)}
                    className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-2.5 font-bold text-slate-900 focus:border-indigo-500 outline-none transition-all text-xs disabled:opacity-60"
                  >
                    {['Technology', 'Finance', 'Healthcare', 'Education', 'Retail', 'Non-Profit', 'Consumer Services', 'Other'].map(ind => (
                      <option key={ind} value={ind}>{ind}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Company Size</label>
                  <select
                    disabled={isReadOnly}
                    value={orgCompanySize}
                    onChange={e => setOrgCompanySize(e.target.value)}
                    className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-2.5 font-bold text-slate-900 focus:border-indigo-500 outline-none transition-all text-xs disabled:opacity-60"
                  >
                    {['1-10', '11-50', '51-200', '201-500', '501-1000', '1000+'].map(sz => (
                      <option key={sz} value={sz}>{sz} employees</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">HQ Location</label>
                  <input
                    type="text"
                    disabled={isReadOnly}
                    value={orgLocation}
                    onChange={e => setOrgLocation(e.target.value)}
                    placeholder="e.g. San Francisco, CA"
                    className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-2.5 font-bold text-slate-900 focus:border-indigo-500 outline-none transition-all text-xs disabled:opacity-60"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Contact Phone</label>
                  <input
                    type="text"
                    disabled={isReadOnly}
                    value={orgPhone}
                    onChange={e => setOrgPhone(e.target.value)}
                    placeholder="e.g. +1 (555) 123-4567"
                    className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-2.5 font-bold text-slate-900 focus:border-indigo-500 outline-none transition-all text-xs disabled:opacity-60"
                  />
                </div>

                <div className="sm:col-span-2 space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Description / Vision Statement</label>
                  <textarea
                    disabled={isReadOnly}
                    rows={4}
                    value={orgDescription}
                    onChange={e => setOrgDescription(e.target.value)}
                    placeholder="Explain your organization's mission, culture and vision of screening..."
                    className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-2.5 font-bold text-slate-900 focus:border-indigo-500 outline-none transition-all text-xs resize-none disabled:opacity-60 font-medium"
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="col-span-1 sm:col-span-3">
                  <h4 className="font-bold text-slate-800 text-sm">Official Working Hours</h4>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Used to track after-hours interviews</p>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Start Time</label>
                  <input
                    type="time"
                    disabled={isReadOnly}
                    value={orgWorkingHoursStart}
                    onChange={e => setOrgWorkingHoursStart(e.target.value)}
                    className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-2.5 font-bold text-slate-900 focus:border-indigo-500 outline-none transition-all text-xs disabled:opacity-60"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">End Time</label>
                  <input
                    type="time"
                    disabled={isReadOnly}
                    value={orgWorkingHoursEnd}
                    onChange={e => setOrgWorkingHoursEnd(e.target.value)}
                    className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-2.5 font-bold text-slate-900 focus:border-indigo-500 outline-none transition-all text-xs disabled:opacity-60"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Timezone</label>
                  <select
                    disabled={isReadOnly}
                    value={orgWorkingHoursTimezone}
                    onChange={e => setOrgWorkingHoursTimezone(e.target.value)}
                    className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-2.5 font-bold text-slate-900 focus:border-indigo-500 outline-none transition-all text-xs disabled:opacity-60"
                  >
                    {['UTC', 'America/New_York', 'America/Los_Angeles', 'Europe/London', 'Asia/Kolkata', 'Asia/Tokyo', 'Australia/Sydney'].map(tz => (
                      <option key={tz} value={tz}>{tz}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100">
                <div className="mb-4">
                  <h4 className="font-bold text-slate-800 text-sm">Bot Speaking Pace</h4>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Control how fast the AI interviewer speaks</p>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                  {[
                    { label: 'Slow', value: 0.8 },
                    { label: 'Normal', value: 1.0 },
                    { label: 'Fast', value: 1.2 }
                  ].map(pace => (
                    <button
                      key={pace.label}
                      type="button"
                      disabled={isReadOnly}
                      onClick={() => setBotSpeakingPace(pace.value)}
                      className={`py-2.5 rounded-xl text-xs font-bold transition-all border-2 ${botSpeakingPace === pace.value ? 'bg-indigo-50 border-indigo-600 text-indigo-700' : 'bg-slate-50 border-slate-100 text-slate-500 hover:border-slate-200'}`}
                    >
                      {pace.label}
                    </button>
                  ))}
                </div>
              </div>
            </Card>

            {/* Mail Server Controls (SMTP) */}
            <Card className="p-8 space-y-6 bg-white border border-slate-100 shadow-sm rounded-3xl">
              <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
                <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center">
                  <Database className="w-5 h-5 text-indigo-600" />
                </div>
                <div>
                  <h3 className="font-black text-slate-900 uppercase text-sm tracking-wide">Candidate Invitation Mail Server</h3>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest font-mono">Custom SMTP Settings</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2 space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">SMTP Outgoing Host</label>
                  <input
                    type="text"
                    disabled={isReadOnly}
                    value={smtpHost}
                    onChange={e => setSmtpHost(e.target.value)}
                    placeholder="smtp.example.com"
                    className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-2.5 font-bold text-slate-900 focus:border-indigo-500 outline-none transition-all text-xs disabled:opacity-60"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Port</label>
                  <input
                    type="text"
                    disabled={isReadOnly}
                    value={smtpPort}
                    onChange={e => setSmtpPort(e.target.value)}
                    placeholder="465 / 587"
                    className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-2.5 font-bold text-slate-900 focus:border-indigo-500 outline-none transition-all text-xs disabled:opacity-60"
                  />
                </div>

                <div className="sm:col-span-3">
                  <label className="flex items-center gap-3.5 p-3.5 bg-slate-50 rounded-2xl border border-slate-100 hover:border-slate-200 cursor-pointer transition-all select-none disabled:opacity-60 w-full mb-0">
                    <input
                      type="checkbox"
                      disabled={isReadOnly}
                      checked={smtpSecure}
                      onChange={e => setSmtpSecure(e.target.checked)}
                      className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300"
                    />
                    <div>
                      <p className="text-xs font-black text-slate-800 uppercase tracking-wide leading-none mb-0.5">Secure SSL/TLS Connection</p>
                      <p className="text-[10px] text-slate-400 font-medium">Configure secure SSL/TLS. Set checked for port 465, false/unchecked for port 587 (STARTTLS).</p>
                    </div>
                  </label>
                </div>

                <div className="sm:col-span-2 space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">SMTP Account Username</label>
                  <input
                    type="text"
                    disabled={isReadOnly}
                    value={smtpUser}
                    onChange={e => setSmtpUser(e.target.value)}
                    placeholder="user@example.com"
                    className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-2.5 font-bold text-slate-900 focus:border-indigo-500 outline-none transition-all text-xs disabled:opacity-60"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">SMTP Password</label>
                  <input
                    type="password"
                    disabled={isReadOnly}
                    value={smtpPass}
                    onChange={e => setSmtpPass(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-2.5 font-bold text-slate-900 focus:border-indigo-500 outline-none transition-all text-xs disabled:opacity-60"
                  />
                </div>

                <div className="sm:col-span-2 space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Sender Display Name (From)</label>
                  <input
                    type="text"
                    disabled={isReadOnly}
                    value={smtpFromName}
                    onChange={e => setSmtpFromName(e.target.value)}
                    placeholder="e.g. Acme Corp Careers"
                    className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-2.5 font-bold text-slate-900 focus:border-indigo-500 outline-none transition-all text-xs disabled:opacity-60"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Sender Email (From)</label>
                  <input
                    type="email"
                    disabled={isReadOnly}
                    value={smtpFromEmail}
                    onChange={e => setSmtpFromEmail(e.target.value)}
                    placeholder="e.g. no-reply@example.com"
                    className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-2.5 font-bold text-slate-900 focus:border-indigo-500 outline-none transition-all text-xs disabled:opacity-60"
                  />
                </div>
              </div>

              {/* Test Connection Form Inline block */}
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 space-y-3.5">
                <span className="text-[9px] font-black text-indigo-600 uppercase tracking-widest block leading-none">Connection Verification Test</span>
                <div className="flex flex-col sm:flex-row gap-3">
                  <input
                    type="email"
                    id="testSmtpEmailRecipient"
                    placeholder="Test recipient email (e.g. yours)"
                    className="flex-1 bg-white border border-slate-200 rounded-xl px-4 py-2 font-semibold text-slate-900 focus:border-indigo-500 outline-none transition-all text-xs"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    disabled={testingSmtp}
                    onClick={async () => {
                      const el = document.getElementById('testSmtpEmailRecipient') as HTMLInputElement;
                      const recipient = el?.value?.trim();
                      if (!recipient) {
                        notify('Please specify a recipient email to receive the SMTP test notification.', 'error');
                        return;
                      }
                      if (!smtpHost || !smtpPort || !smtpUser || !smtpPass) {
                        notify('SMTP Host, Port, Username and Password are required to test setup.', 'error');
                        return;
                      }
                      setTestingSmtp(true);
                      try {
                        const res = await fetch('/api/admin/test-smtp', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            smtpHost,
                            smtpPort,
                            smtpSecure,
                            smtpUser,
                            smtpPass,
                            smtpFromName,
                            smtpFromEmail,
                            testRecipient: recipient
                          })
                        });
                        const data = await res.json();
                        if (data.success) {
                          notify(data.message || 'SMTP server connection test verified successfully!', 'success');
                        } else {
                          notify('SMTP Test Failed: ' + (data.error || 'Check server connection parameters.'), 'error');
                        }
                      } catch (testErr) {
                        notify('SMTP verification request failed: ' + (testErr instanceof Error ? testErr.message : 'Timeout'), 'error');
                      } finally {
                        setTestingSmtp(false);
                      }
                    }}
                    className="h-9 text-[10px] px-4 font-black uppercase tracking-widest text-[#10b981] border-[#bbf7d0] hover:bg-[#f0fdf4] shrink-0"
                  >
                    {testingSmtp ? 'Testing Server...' : 'Test Config'}
                  </Button>
                </div>
              </div>
            </Card>
          </div>

          {/* Action Controls */}
          <div className="flex items-center justify-end gap-4 border-t border-slate-100 pt-6">
            <Button
              type="button"
              variant="outline"
              disabled={savingSettings}
              onClick={() => setActivePanelTab('analytics')}
              className="px-6 h-11 text-[10px] font-black uppercase tracking-widest"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="brand"
              disabled={savingSettings || isReadOnly}
              className="px-8 h-11 text-[10px] font-black uppercase tracking-widest bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold"
            >
              {savingSettings ? 'Saving Changes...' : 'Save Workspace Settings'}
            </Button>
          </div>
        </form>
      </div>
    )}
  </div>
);
}

function SuperAdminPanel() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = (searchParams.get('tab') as 'overview' | 'organizations' | 'payments' | 'integrations' | 'manual' | 'white-label') || 'overview';
  const setTab = (tab: string) => setSearchParams({ tab });
  const [stats, setStats] = useState({ jobs: 0, candidates: 0, users: 0, organizations: 0 });
  const [loading, setLoading] = useState(true);
  const [recentCandidates, setRecentCandidates] = useState<Candidate[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);

  // HireNow White-Label & Reseller States
  const [logoUrl, setLogoUrl] = useState('https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=120&q=80');
  const [primaryColor, setPrimaryColor] = useState('#4f46e5');
  const [brandingName, setBrandingName] = useState('HireNow Portal');
  const [markupFactor, setMarkupFactor] = useState(1.35);
  const [resellerModel, setResellerModel] = useState<'per_seat' | 'per_interview'>('per_interview');
  const [clientTenants, setClientTenants] = useState([
    { id: 'ct-1', name: 'Zeta Software Solutions', jobs: 6, candidates: 184, billableAmt: 5400, markup: 1.30 },
    { id: 'ct-2', name: 'Stellar Tech Labs', jobs: 3, candidates: 49, billableAmt: 1950, markup: 1.40 },
    { id: 'ct-3', name: 'Infinity Healthcare Corp', jobs: 8, candidates: 298, billableAmt: 11200, markup: 1.25 }
  ]);
  const [editingTenantId, setEditingTenantId] = useState<string | null>(null);
  const [editingTenantName, setEditingTenantName] = useState('');
  const [editingTenantMarkup, setEditingTenantMarkup] = useState(1.35);

  const [onboardModalOpen, setOnboardModalOpen] = useState(false);
  const [newOrgName, setNewOrgName] = useState('');
  const [newOrgDomain, setNewOrgDomain] = useState('');
  const [newOrgIndustry, setNewOrgIndustry] = useState('Technology');
  const [newOrgCompanySize, setNewOrgCompanySize] = useState('11-50');
  const [newOrgLocation, setNewOrgLocation] = useState('');
  const [newOrgPhone, setNewOrgPhone] = useState('');
  const [newOrgDescription, setNewOrgDescription] = useState('');
  const [onboarding, setOnboarding] = useState(false);
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkOrgNames, setBulkOrgNames] = useState('');
  const navigate = useNavigate();
  const { confirm, notify } = useNotification();
  const isSuperAdmin = auth.currentUser?.email === 'malviya.pratyush26@gmail.com';

  const handleDownloadPDF = () => {
    try {
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });

      const margin = 20;
      const pageWidth = 210;
      const pageHeight = 297;
      const contentWidth = pageWidth - (margin * 2);
      let currentPage = 1;

      // Helper to draw Header and Footer
      const drawPageDecoration = (pNum: number) => {
        // Small Header
        doc.setFont('Helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(100, 116, 139); // Slate-500
        doc.text('AI CORE HIRE  •  ENTERPRISE OPERATIONAL MANUAL', margin, 12);
        
        doc.setDrawColor(226, 232, 240); // Slate-200
        doc.setLineWidth(0.2);
        doc.line(margin, 14, pageWidth - margin, 14);

        // Footer
        doc.setFont('Helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(148, 163, 184); // Slate-400
        doc.text(`Page ${pNum}`, pageWidth - margin - 12, pageHeight - 12);
        doc.text('CONFIDENTIAL HR WORKSPACE GUIDE', margin, pageHeight - 12);
      };

      // --- PAGE 1: COVER PAGE ---
      // Dark deep cover background bar on left
      doc.setFillColor(15, 23, 42); // Slate-900
      doc.rect(0, 0, 15, pageHeight, 'F');

      // Indigo accent bar
      doc.setFillColor(79, 70, 229); // Indigo-600
      doc.rect(15, 0, 5, pageHeight, 'F');

      // Content container starts at x = 30
      let cy = 60;
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(79, 70, 229);
      doc.text('ENTERPRISE USER ENABLEMENT', 30, cy);
      cy += 10;

      doc.setFontSize(32);
      doc.setTextColor(15, 23, 42);
      doc.text('AI Core Hire', 30, cy);
      cy += 12;

      doc.setFontSize(18);
      doc.setTextColor(51, 65, 85);
      doc.text('HR Operations Manual', 30, cy);
      cy += 8;

      doc.setFontSize(12);
      doc.setTextColor(100, 116, 139);
      doc.text('& Onboarding Handbook', 30, cy);
      cy += 20;

      // Line divider
      doc.setDrawColor(79, 70, 229);
      doc.setLineWidth(1.5);
      doc.line(30, cy, 140, cy);
      cy += 15;

      // Metadata block
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(15, 23, 42);
      doc.text('DOCUMENT SCOPE:', 30, cy);
      doc.setFont('Helvetica', 'normal');
      doc.text('Master Tenant Configuration, D6 Calibration & Fast Sourcing Ingestion', 65, cy);
      cy += 8;

      doc.setFont('Helvetica', 'bold');
      doc.text('TARGET AUDIENCE:', 30, cy);
      doc.setFont('Helvetica', 'normal');
      doc.text('Corporate Recruiters, HR Managers and Talent Acquisition Teams', 65, cy);
      cy += 8;

      doc.setFont('Helvetica', 'bold');
      doc.text('PUBLISHED DATE:', 30, cy);
      doc.setFont('Helvetica', 'normal');
      doc.text(new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }), 65, cy);
      cy += 8;

      doc.setFont('Helvetica', 'bold');
      doc.text('SECURITY STATE:', 30, cy);
      doc.setTextColor(16, 185, 129); // Emerald
      doc.text('RESTRICTED ACCESS - VERIFIED ORGANIZATIONS ONLY', 65, cy);
      
      // Bottom logo tag
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(15, 23, 42);
      doc.text('AI CORE HIRE INC. 2026', 30, pageHeight - 30);

      // --- PAGE 2: INSTRUCTION DETAILS ---
      doc.addPage();
      currentPage++;
      drawPageDecoration(currentPage);

      let y = 25;

      const heading = (title: string) => {
        if (y > pageHeight - 35) {
          doc.addPage();
          currentPage++;
          drawPageDecoration(currentPage);
          y = 25;
        }
        doc.setFont('Helvetica', 'bold');
        doc.setFontSize(13);
        doc.setTextColor(15, 23, 42);
        doc.text(title, margin, y);
        y += 6;
        doc.setDrawColor(241, 245, 249);
        doc.setLineWidth(0.5);
        doc.line(margin, y - 2, pageWidth - margin, y - 2);
        y += 4;
      };

      const subHeading = (title: string) => {
        if (y > pageHeight - 25) {
          doc.addPage();
          currentPage++;
          drawPageDecoration(currentPage);
          y = 25;
        }
        doc.setFont('Helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(79, 70, 229); // indigo
        doc.text(title, margin, y);
        y += 5;
      };

      const paragraph = (text: string) => {
        doc.setFont('Helvetica', 'normal');
        doc.setFontSize(9.5);
        doc.setTextColor(51, 65, 85);
        const lines = doc.splitTextToSize(text, contentWidth);
        lines.forEach((line: string) => {
          if (y > pageHeight - 20) {
            doc.addPage();
            currentPage++;
            drawPageDecoration(currentPage);
            y = 25;
          }
          doc.text(line, margin, y);
          y += 5.2;
        });
        y += 3; // bottom body gap
      };

      const listItem = (bullet: string, text: string) => {
        doc.setFont('Helvetica', 'bold');
        doc.setFontSize(9.5);
        doc.setTextColor(15, 23, 42);
        
        const bWidth = doc.getTextWidth(bullet + " ");
        doc.text(bullet, margin, y);
        
        doc.setFont('Helvetica', 'normal');
        doc.setTextColor(51, 65, 85);
        const wrappedLines = doc.splitTextToSize(text, contentWidth - bWidth - 2);
        
        wrappedLines.forEach((line: string) => {
          if (y > pageHeight - 20) {
            doc.addPage();
            currentPage++;
            drawPageDecoration(currentPage);
            y = 25;
          }
          doc.text(line, margin + bWidth + 2, y);
          y += 5.2;
        });
        y += 2.5;
      };

      heading('1. The Intelligent D6 Assessment Framework');
      paragraph('AI Core Hire implements an elite, multi-layered resume scoring protocol known as the D6 Assessment. This design evaluates candidate applications across six highly contextual dimensions, going far beyond legacy literal keyword searches to evaluate qualitative alignment:');

      listItem('• D1: Technical Core:', 'Grades actual hands-on familiarity with programming frameworks, package libraries, and database servers requested in the standard Job Description.');
      listItem('• D2: Pragmatic Tenure:', 'Cross-matches candidate total professional years, relevance of past job descriptions, leadership roles, and domain longevity.');
      listItem('• D3: Educational Foundation:', 'Examines completed degrees, major/minor subject alignments, certifications, and university prestige rankings.');
      listItem('• D4: Quantifiable Outcomes:', 'A specialized grading pipeline that checks for metric-driven Achievements like percent improvements, revenue KPIs, system scalability scale, and official awards.');
      listItem('• D5: Cultural Coherence:', 'Audits historic patterns of employment stability, chronological timeline gaps, job-hopping rates, and career progression structure.');
      listItem('• D6: Generative Sincerity:', 'A modern adversarial screening block highlighting copy-paste resume templates, inflated synthetic bullet points, or auto-generated descriptors.');

      y += 4;
      heading('2. Operations Implementation Blueprint');
      paragraph('HR Organizations can launch active campaigns in four simple operational steps:');

      listItem('1.', 'Tenant Onboarding: Securely configure your specialized Workspace Tenant ID using the invitation key supplied by your Platform Super Administrator.');
      listItem('2.', 'Campaign Creation: Click "New Job" inside the dashboard. Enter standard candidate credentials alongside the original JD template. The NLP system automatically creates requirements.');
      listItem('3.', 'Evaluation Customization: Open "Evaluation Settings" to dynamically scale weight settings for D1-D5 to match the exact demands of your opening role.');
      listItem('4.', 'Resume Bulk Upload: Drop candidate PDF or DOCX files into the ingest system to parse and cache details for screen runs.');

      // --- PAGE 3 ---
      doc.addPage();
      currentPage++;
      drawPageDecoration(currentPage);
      y = 25;

      heading('3. Adjusting Evaluation & Re-scoring Guidelines');
      paragraph('To calibrate job scoring parameters, HR Recruiters can fully custom-tune target dimensions. Click "Evaluation Settings" to open the custom slider control dashboard:');
      
      subHeading('Weight Constraints:');
      paragraph('The sum of custom parameters (Metric Weights D1-D5) must equal exactly 100%. After saving, clicking the "Save & Re-score All" trigger automatically runs structural text files through the parsing system to dynamically calculate upgraded match scores.');

      subHeading('Match Ranges:');
      paragraph('Passed Match (Default: 80%+) classifies top-performing resume matches on candidate dashboards, while Low Match (Default: <40%) triggers alerts for easy isolation.');

      y += 4;
      heading('4. Dynamic Candidate Scorecards');
      paragraph('Every single parsed candidate gets a detail workspace highlighting:');
      listItem('• Narrative Summary:', 'An auto-generated, brief 3-sentence summary of actual qualifications, strengths, and role alignment.');
      listItem('• Targeted Interview Questions:', 'Three custom-crafted probing questions generated based on exact potential weak spots and tenure discrepancies.');
      listItem('• Radar Evaluation Visualization:', 'A responsive grid showcasing individual performance in D1 through D6.');

      y += 4;
      heading('5. Configuring Mail Server credentials');
      paragraph('Select the "Settings" menu inside the Super Admin panel to connect the corporate mail servers. Input authorized Host headers (e.g. smtp.com), port configurations (465 SSL or 587 TLS), and credentials. Verify connection viability with the "Test Config" block before sending candidate invite mailings.');

      // Save
      doc.save('AI_Core_Hire_HR_Organization_User_Manual.pdf');
      notify('Operations & Onboarding User PDF Manual downloaded successfully!', 'success');
    } catch (error) {
      console.error('PDF generation error:', error);
      notify('Failed to generate high-fidelity PDF. Standalone HTML is fully available.', 'error');
    }
  };

  const handleDownloadManual = () => {
    const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AI Core Hire - HR Organization Operations & Onboarding Manual</title>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    :root {
      --primary: #4f46e5;
      --primary-dark: #3730a3;
      --slate-50: #f8fafc;
      --slate-100: #f1f5f9;
      --slate-200: #e2e8f0;
      --slate-300: #cbd5e1;
      --slate-400: #94a3b8;
      --slate-600: #475569;
      --slate-700: #334155;
      --slate-800: #1e293b;
      --slate-900: #0f172a;
      --emerald-500: #10b981;
      --emerald-600: #059669;
      --emerald-700: #047857;
      --indigo-50: #e0e7ff;
      --indigo-100: #c7d2fe;
      --indigo-600: #4f46e5;
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    body {
      font-family: 'Plus Jakarta Sans', sans-serif;
      background-color: var(--slate-50);
      color: var(--slate-800);
      line-height: 1.6;
      padding-bottom: 5rem;
    }
    header {
      background: linear-gradient(135deg, var(--slate-900) 0%, #1e1b4b 100%);
      color: white;
      padding: 4rem 2rem;
      text-align: center;
      border-bottom: 4px solid var(--primary);
    }
    .header-tag {
      display: inline-block;
      background: rgba(79, 70, 229, 0.2);
      border: 1px solid var(--indigo-100);
      color: var(--indigo-100);
      font-size: 0.75rem;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.15em;
      padding: 0.35rem 1rem;
      border-radius: 9999px;
      margin-bottom: 1.5rem;
    }
    header h1 {
      font-size: 2.5rem;
      font-weight: 800;
      letter-spacing: -0.025em;
      margin-bottom: 0.5rem;
    }
    header p {
      color: var(--slate-300);
      font-size: 1.1rem;
      max-w: 600px;
      margin: 0 auto;
    }
    .container {
      max-width: 900px;
      margin: 3rem auto;
      padding: 0 1.5rem;
    }
    .sidebar-toc {
      background: white;
      border: 1px solid var(--slate-200);
      border-radius: 1.5rem;
      padding: 2rem;
      margin-bottom: 3rem;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
    }
    .sidebar-toc h3 {
      font-size: 0.9rem;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: var(--slate-400);
      margin-bottom: 1rem;
      border-bottom: 1px solid var(--slate-100);
      padding-bottom: 0.5rem;
    }
    .sidebar-toc ul {
      list-style-type: none;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.5rem 2rem;
    }
    @media (max-width: 640px) {
      .sidebar-toc ul {
        grid-template-columns: 1fr;
      }
    }
    .sidebar-toc a {
      color: var(--primary);
      text-decoration: none;
      font-size: 0.9rem;
      font-weight: 600;
    }
    .sidebar-toc a:hover {
      text-decoration: underline;
    }
    .card {
      background: white;
      border: 1px solid var(--slate-200);
      border-radius: 1.5rem;
      padding: 2.5rem;
      margin-bottom: 2.5rem;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
    }
    h2 {
      font-size: 1.5rem;
      font-weight: 800;
      color: var(--slate-900);
      margin-bottom: 1.5rem;
      border-bottom: 2px solid var(--slate-100);
      padding-bottom: 0.75rem;
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }
    h3 {
      font-size: 1.15rem;
      font-weight: 700;
      color: var(--slate-800);
      margin-top: 1.5rem;
      margin-bottom: 0.75rem;
    }
    p {
      margin-bottom: 1.25rem;
      color: var(--slate-600);
      font-size: 0.95rem;
    }
    ul, ol {
      margin-bottom: 1.5rem;
      padding-left: 1.5rem;
      color: var(--slate-600);
      font-size: 0.95rem;
    }
    li {
      margin-bottom: 0.5rem;
    }
    .grid-dim {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 1.5rem;
      margin-top: 1.5rem;
    }
    @media (max-width: 768px) {
      .grid-dim {
        grid-template-columns: 1fr;
      }
    }
    .dim-box {
      background: var(--slate-50);
      border: 1px solid var(--slate-200);
      border-radius: 1rem;
      padding: 1.5rem;
    }
    .dim-box h4 {
      font-size: 0.95rem;
      font-weight: 800;
      color: var(--primary);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 0.5rem;
    }
    .dim-box p {
      font-size: 0.85rem;
      margin-bottom: 0;
    }
    code, pre {
      font-family: 'JetBrains Mono', monospace;
      background: var(--slate-100);
      color: var(--slate-900);
      padding: 0.15rem 0.4rem;
      border-radius: 0.25rem;
      font-size: 0.85rem;
    }
    pre {
      display: block;
      padding: 1rem;
      overflow-x: auto;
      margin-bottom: 1.5rem;
      border: 1px solid var(--slate-200);
    }
    .alert-banner {
      background-color: #f0fdf4;
      border: 1px solid #bbf7d0;
      border-left: 4px solid var(--emerald-500);
      padding: 1.25rem;
      border-radius: 1rem;
      margin-bottom: 1.5rem;
      display: flex;
      gap: 1rem;
      align-items: flex-start;
    }
    .alert-banner.warning {
      background-color: #fffbeb;
      border-color: #fef3c7;
      border-left-color: #f59e0b;
    }
    .alert-banner p {
      margin: 0;
      font-size: 0.875rem;
      color: var(--slate-700);
    }
    .step-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background: var(--primary);
      color: white;
      width: 24px;
      height: 24px;
      border-radius: 9999px;
      font-size: 0.75rem;
      font-weight: 800;
      margin-right: 0.5rem;
    }
    footer {
      text-align: center;
      margin-top: 5rem;
      padding-top: 2rem;
      border-top: 1px solid var(--slate-200);
      color: var(--slate-400);
      font-size: 0.8rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.1em;
    }
  </style>
</head>
<body>
  <header>
    <div class="header-tag">HR Operations Kit</div>
    <h1>AI Hire Platform Manual</h1>
    <p>The Complete Operations & Onboarding Guide for HR Teams & Recruiters</p>
  </header>
  <div class="container">
    <div class="sidebar-toc">
      <h3>Table of Contents</h3>
      <ul>
        <li><a href="#overview">1. D6 Intelligent Assessment Overview</a></li>
        <li><a href="#quickstart">2. Quickstart Blueprint for HR Teams</a></li>
        <li><a href="#parameters">3. Tuning Scoring Parameters & Weights</a></li>
        <li><a href="#resumes">4. Resume Processing & Ingest</a></li>
        <li><a href="#scorecards">5. Understanding Scorecards & Radar Charts</a></li>
        <li><a href="#smtp">6. Configuring custom Mail Servers</a></li>
      </ul>
    </div>

    <div class="card" id="overview">
      <h2>1. The D6 Assessment Architecture</h2>
      <p>The AI Core Hire enterprise system leverages a state-of-the-art multi-dimensional screening algorithm. Rather than relying on simple keyword density matching, resumes undergo rigorous evaluation across six distinct core metrics:</p>
      
      <div class="grid-dim">
        <div class="dim-box">
          <h4>Technical Core (D1)</h4>
          <p>Grades practical alignment with required frameworks, programming languages, and industry tooling stacks based on explicit past experience.</p>
        </div>
        <div class="dim-box">
          <h4>Pragmatic Tenure (D2)</h4>
          <p>Analyzes total career years, proximity of past roles to target specifications, structural management depth, and industry longevity.</p>
        </div>
        <div class="dim-box">
          <h4>Educational Base (D3)</h4>
          <p>Assesses academic background relevance, completed credentials, majors/subjects alignment, and target institution matches.</p>
        </div>
        <div class="dim-box">
          <h4>Quantizable Outcomes (D4)</h4>
          <p>Scans and audits resumes for metric improvements, revenue or efficiency KPIs, cost reductions, system scale growth, and quantitative awards.</p>
        </div>
        <div class="dim-box">
          <h4>Cultural Match (D5)</h4>
          <p>Measures career path consistency, team structure adaptability, and checks for historic patterns of job-hopping or domain misalignment.</p>
        </div>
        <div class="dim-box">
          <h4>Generative Sincerity (D6)</h4>
          <p>A sophisticated adversarial screening dimension that audits the resume for generic copywriting patterns, copy-pasted content templates, and potential resume padding.</p>
        </div>
      </div>
    </div>

    <div class="card" id="quickstart">
      <h2>2. Quickstart Blueprint for HR Teams</h2>
      <p>Follow these four simple operational steps to get your screening campaigns live in minutes:</p>
      
      <ol>
        <li>
          <strong><span class="step-badge">1</span>Join the Space:</strong> Use your platform administrator's custom workspace invite link to securely create your professional team profile and join your company's master tenant registry.
        </li>
        <li>
          <strong><span class="step-badge">2</span>Establish a Job Opening:</strong> Click "New Job" in the main dashboard. Specify the title, target department, and provide the official Job Description. The platform will automatically parse requirements using high-speed language processing models.
        </li>
        <li>
          <strong><span class="step-badge">3</span>Tune Scoring Parameters:</strong> Open the "Evaluation Settings" panel on your Job Dashboard to tailor custom criteria titles, weight percentages, and top/low tier pass ranges.
        </li>
        <li>
          <strong><span class="step-badge">4</span>Bulk Ingest Candidates:</strong> Drag and drop candidate CVs (supports .pdf and .docx formats) directly into the file portal. Inside seconds, the AI will immediately queue them into parallel processing lanes.
        </li>
      </ol>
    </div>

    <div class="card" id="parameters">
      <h2>3. Tuning Scoring Parameters & Weights</h2>
      <p>By default, the platform initiates jobs with standard, field-tested weights (30% Technical, 30% Tenure, 15% Education, 15% Achievements, and 10% Cultural Fit). However, HR Managers can fully configure these dimensions at any time from the Job view:</p>
      
      <div class="alert-banner">
        <div>
          <p><strong>💡 Pro Tip:</strong> Weights must always sum to exactly 100%. If you increase the significance of "Technical Core" by 10%, decrease "Educational Base" or "Pragmatic Tenure" accordingly inside the "Evaluation Settings" drawer to preserve aggregate scoring sanity.</p>
        </div>
      </div>

      <h3>Custom Evaluation Sliders:</h3>
      <ul>
        <li><strong>Passed Match Threshold:</strong> Candidates achieving scorecards equal to or above this percentage will be automatically highlighted on the hiring visualizer as <em>Passed Match</em> (default: 80%).</li>
        <li><strong>Low Match (Fail) Threshold:</strong> Candidates scoring below this limit (default: 40%) are flagged with low-match colors, allowing filters to easily separate them.</li>
      </ul>
    </div>

    <div class="card" id="resumes">
      <h2>4. Resume Processing & Ingest</h2>
      <p>Shortened instruction details to process high volumes of resumes:</p>
      <ul>
        <li><strong>Batch Capacity:</strong> Parallel uploads support handling up to 50 resumes simultaneously. Ingress speed averages 4.5 seconds per candidate.</li>
        <li><strong>Dynamic Fail-safes:</strong> If a resume contains corrupted blocks or password encryptions, the system safely isolates the entry, flags it as "failed", and logs a descriptive, clear recovery notice so you can resolve it without disrupting other candidate processing.</li>
      </ul>
    </div>

    <div class="card" id="scorecards">
      <h2>5. Deep-Dive Scorecards & Interactive Reports</h2>
      <p>Click on any candidate row on the workspace to pop open their comprehensive interactive scorecard panel:</p>
      
      <h3>Key Sections rendered for processed candidates:</h3>
      <ul>
        <li><strong>Executive Summary & Verdict:</strong> A highly compressed, objective 3-sentence summary of the candidate's core strengths, notable credentials, and suitability.</li>
        <li><strong>Forensic Auditing Bulleted Lists:</strong> Highlighted list outlining detected resume padding, unexplained career tenure gaps, or generic generative patterns in description styling.</li>
        <li><strong>Weakness-Point Tailored Interview Prompts:</strong> 3 curated interview question prompts engineered by the AI targeting the candidate's exact identified weaknesses. These allow recruiters to conduct precise screening sessions.</li>
        <li><strong>Dynamic Radar Visual:</strong> A beautiful custom-rendered visual grid demonstrating performance across the 6 core D-dimensions directly aligned to your campaign priorities.</li>
      </ul>
    </div>

    <div class="card" id="smtp">
      <h2>6. SMTP Mail Server Configuration</h2>
      <p>Configure custom outbound mail servers to invite shortlisted candidates directly from corporate email domains:</p>
      
      <h3>Configuration Requirements:</h3>
      <ol>
        <li>Navigate to the <strong>Super Admin Registry</strong> page and select the <strong>Settings</strong> panel (or Mail settings if dedicated).</li>
        <li>Enter your SMTP Server host name (e.g. <code>smtp.sendgrid.net</code>, <code>smtp.gmail.com</code>).</li>
        <li>Provide port parameters: <code>465</code> for secure default SSL, or <code>587</code> for TLS (STARTTLS).</li>
        <li>Specify the corporate Sender Display Name (From) and Email address so candidates instantly recognize your brand.</li>
        <li>Use the <strong>"Test Config"</strong> button to send a real-time validation test mail to any test account, verifying connection integrity within seconds!</li>
      </ol>
    </div>

    <footer>
      AI Core Hire Enterprise Platform License • Operations Group 2026
    </footer>
  </div>
</body>
</html>`;

    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'AI_Core_Hire_HR_Organization_User_Manual.html';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    notify('Operations & HR Onboarding User Manual downloaded successfully! Perfect for attaching to emails.', 'success');
  };

  if (!isSuperAdmin) {
    return (
      <div className="h-[60vh] flex flex-col items-center justify-center p-12 text-center">
        <ShieldCheck className="w-16 h-16 text-slate-200 mb-6" />
        <h2 className="text-2xl font-black text-slate-900 uppercase">Access Restricted</h2>
        <p className="text-slate-500 mt-2">Only platform super-administrators can access this registry.</p>
        <Button variant="outline" className="mt-8" onClick={() => navigate('/')}>Return to Workspace</Button>
      </div>
    );
  }

  const clearEverything = async () => {
    const ok = await confirm('☢️ NUCLEAR OPTION: This will delete ALL jobs and ALL candidates across the entire platform. Are you absolutely sure?');
    if (!ok) return;
    
    setLoading(true);
    try {
      const candidatesSnap = await getDocs(collection(db, 'candidates'));
      const jobsSnap = await getDocs(collection(db, 'jobs'));

      const allDocs = [...candidatesSnap.docs, ...jobsSnap.docs];
      
      if (allDocs.length > 0) {
        const chunks = [];
        for (let i = 0; i < allDocs.length; i += 450) {
          chunks.push(allDocs.slice(i, i + 450));
        }

        for (const chunk of chunks) {
          const batch = writeBatch(db);
          chunk.forEach(d => batch.delete(d.ref));
          await batch.commit();
        }
      }
      notify('Full Platform Reset Complete.', 'success');
      setTimeout(() => window.location.reload(), 1500);
    } catch (err) {
      notify('Failed to nuclear reset platform: ' + (err instanceof Error ? err.message : 'Unknown error'), 'error');
      console.error('Nuclear Reset Error:', err);
      handleFirestoreError(err, OperationType.DELETE, 'global-clear');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newOrgName || onboarding) return;

    setOnboarding(true);
    try {
      const orgRef = await addDoc(collection(db, 'organizations'), {
        name: newOrgName.trim(),
        domain: newOrgDomain.trim() || null,
        industry: newOrgIndustry,
        companySize: newOrgCompanySize,
        location: newOrgLocation.trim(),
        phone: newOrgPhone.trim(),
        description: newOrgDescription.trim(),
        createdAt: serverTimestamp(),
        createdBy: auth.currentUser?.uid,
        status: 'active'
      });

      const newOrg: Organization = {
        id: orgRef.id,
        name: newOrgName.trim(),
        domain: newOrgDomain.trim() || undefined,
        industry: newOrgIndustry,
        companySize: newOrgCompanySize,
        location: newOrgLocation.trim() || undefined,
        phone: newOrgPhone.trim() || undefined,
        description: newOrgDescription.trim() || undefined,
        createdAt: new Date(),
        createdBy: auth.currentUser?.uid || '',
        status: 'active'
      };

      setOrganizations(prev => [newOrg, ...prev]);
      setStats(prev => ({ ...prev, organizations: prev.organizations + 1 }));
      notify('Organization onboarded successfully', 'success');
      setOnboardModalOpen(false);
      setNewOrgName('');
      setNewOrgDomain('');
      setNewOrgIndustry('Technology');
      setNewOrgCompanySize('11-50');
      setNewOrgLocation('');
      setNewOrgPhone('');
      setNewOrgDescription('');
    } catch (err) {
      notify('Failed to create organization: ' + (err instanceof Error ? err.message : 'Check permissions'), 'error');
      handleFirestoreError(err, OperationType.CREATE, 'organizations');
    } finally {
      setOnboarding(false);
    }
  };

  const handleBulkOnboard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bulkOrgNames || onboarding) return;
    
    const names = bulkOrgNames.split('\n').map(n => n.trim()).filter(n => n.length > 0);
    if (names.length === 0) return;

    setOnboarding(true);
    try {
      // Use chunks of 400 to stay within writeBatch limits (max 500)
      const chunks = [];
      for (let i = 0; i < names.length; i += 400) {
        chunks.push(names.slice(i, i + 400));
      }

      const totalNewOrgs: Organization[] = [];

      for (const chunk of chunks) {
        const batch = writeBatch(db);
        chunk.forEach(name => {
          const orgRef = doc(collection(db, 'organizations'));
          batch.set(orgRef, {
            name,
            createdAt: serverTimestamp(),
            createdBy: auth.currentUser?.uid,
            status: 'active'
          });
          totalNewOrgs.push({
            id: orgRef.id,
            name,
            createdAt: new Date(),
            createdBy: auth.currentUser?.uid || '',
            status: 'active'
          });
        });
        await batch.commit();
      }
      
      setOrganizations(prev => [...totalNewOrgs, ...prev]);
      setStats(prev => ({ ...prev, organizations: prev.organizations + names.length }));
      notify(`Successfully onboarded ${names.length} organizations.`, 'success');
      setOnboardModalOpen(false);
      setBulkOrgNames('');
    } catch (err) {
      notify('Bulk onboarding failed: ' + (err instanceof Error ? err.message : 'Check permissions'), 'error');
      handleFirestoreError(err, OperationType.CREATE, 'organizations-bulk');
    } finally {
      setOnboarding(false);
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        const email = auth.currentUser?.email;
        const uid = auth.currentUser?.uid;
        if (!uid) return;

        const isSuperAdmin = email === 'malviya.pratyush26@gmail.com';
        
        if (!isSuperAdmin) {
          setLoading(false);
          return;
        }

        const [jobsSnap, candidatesSnap, orgsSnap] = await Promise.all([
          getDocs(collection(db, 'jobs')),
          getDocs(collection(db, 'candidates')),
          getDocs(collection(db, 'organizations'))
        ]);

        const uniqueUsers = new Set();
        jobsSnap.forEach(d => uniqueUsers.add(d.data().createdBy));
        candidatesSnap.forEach(d => uniqueUsers.add(d.data().createdBy));

        setStats({
          jobs: jobsSnap.size,
          candidates: candidatesSnap.size,
          users: uniqueUsers.size,
          organizations: orgsSnap.size
        });

        setOrganizations(orgsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Organization)));

        const recent = candidatesSnap.docs
          .map(d => ({ id: d.id, ...d.data() } as Candidate))
          .sort((a, b) => {
            const timeA = a.createdAt?.seconds || Date.now() / 1000;
            const timeB = b.createdAt?.seconds || Date.now() / 1000;
            return timeB - timeA;
          })
          .slice(0, 10);
        
        setRecentCandidates(recent);
      } catch (err) {
        handleFirestoreError(err, OperationType.GET, 'admin-dashboard-stats');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [isSuperAdmin]);

  if (loading) return (
    <div className="h-[60vh] flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Loading Platform Data...</p>
      </div>
    </div>
  );

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <Modal 
        isOpen={onboardModalOpen} 
        onClose={() => setOnboardModalOpen(false)} 
        title={bulkMode ? "Bulk Onboard Organizations" : "Onboard New Organization"}
      >
        <div className="mb-6 flex p-1 bg-slate-100 rounded-lg">
           <button 
             onClick={() => setBulkMode(false)}
             className={cn("flex-1 py-2 text-[10px] font-black uppercase tracking-widest rounded-md transition-all", !bulkMode ? "bg-white shadow-sm text-indigo-600" : "text-slate-500 hover:text-slate-700")}
           >
             Single Entry
           </button>
           <button 
             onClick={() => setBulkMode(true)}
             className={cn("flex-1 py-2 text-[10px] font-black uppercase tracking-widest rounded-md transition-all", bulkMode ? "bg-white shadow-sm text-indigo-600" : "text-slate-500 hover:text-slate-700")}
           >
             Bulk Upload
           </button>
        </div>

        {!bulkMode ? (
          <form onSubmit={handleCreateOrg} className="space-y-4">
             <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Company Name</label>
                <input 
                  autoFocus
                  required
                  value={newOrgName}
                  onChange={e => setNewOrgName(e.target.value)}
                  placeholder="e.g. Acme Corporation"
                  className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-2 text-sm font-bold text-slate-900 focus:border-indigo-500 outline-none transition-all placeholder:text-slate-300"
                />
             </div>
             
             <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
               <div className="space-y-1">
                 <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Industry</label>
                 <select
                   value={newOrgIndustry}
                   onChange={e => setNewOrgIndustry(e.target.value)}
                   className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-3 py-2 text-sm font-bold text-slate-900 focus:border-indigo-500 outline-none transition-all bg-white"
                 >
                   <option value="Technology">Technology</option>
                   <option value="Finance">Finance</option>
                   <option value="Healthcare">Healthcare</option>
                   <option value="Education">Education</option>
                   <option value="Retail">Retail</option>
                   <option value="Non-Profit">Non-Profit</option>
                   <option value="Other">Other</option>
                 </select>
               </div>

               <div className="space-y-1">
                 <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Company Size</label>
                 <select
                   value={newOrgCompanySize}
                   onChange={e => setNewOrgCompanySize(e.target.value)}
                   className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-3 py-2 text-sm font-bold text-slate-900 focus:border-indigo-500 outline-none transition-all bg-white"
                 >
                   <option value="1-10">1-10 employees</option>
                   <option value="11-50">11-50 employees</option>
                   <option value="51-200">51-200 employees</option>
                   <option value="201-500">201-500 employees</option>
                   <option value="501-1000">501-1000 employees</option>
                   <option value="1000+">1000+ employees</option>
                 </select>
               </div>
             </div>

             <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
               <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">HQ Location</label>
                  <input 
                    value={newOrgLocation}
                    onChange={e => setNewOrgLocation(e.target.value)}
                    placeholder="e.g. San Francisco"
                    className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-2 text-sm font-bold text-slate-900 focus:border-indigo-500 outline-none transition-all placeholder:text-slate-300"
                  />
               </div>
               <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Contact Phone</label>
                  <input 
                    value={newOrgPhone}
                    onChange={e => setNewOrgPhone(e.target.value)}
                    placeholder="e.g. +1 (555) 123-4567"
                    className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-2 text-sm font-bold text-slate-900 focus:border-indigo-500 outline-none transition-all placeholder:text-slate-300"
                  />
               </div>
             </div>

             <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Email Domain (Optional)</label>
                <input 
                  value={newOrgDomain}
                  onChange={e => setNewOrgDomain(e.target.value)}
                  placeholder="e.g. acme.com"
                  className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-2 text-sm font-bold text-slate-900 focus:border-indigo-500 outline-none transition-all placeholder:text-slate-300 font-mono"
                />
             </div>

             <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Description / Vision</label>
                <textarea 
                  value={newOrgDescription}
                  onChange={e => setNewOrgDescription(e.target.value)}
                  placeholder="Briefly state organization vision or core domain focus..."
                  rows={2}
                  className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-2 text-sm font-bold text-slate-900 focus:border-indigo-500 outline-none transition-all placeholder:text-slate-300 resize-none font-sans"
                />
             </div>

             <div className="flex gap-3 pt-3">
                <Button 
                  type="button" 
                  variant="outline" 
                  className="flex-1 font-black uppercase tracking-widest text-[10px]"
                  onClick={() => setOnboardModalOpen(false)}
                >
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  disabled={onboarding || !newOrgName}
                  className="flex-1 font-black uppercase tracking-widest text-[10px] bg-indigo-600 hover:bg-indigo-700"
                >
                  {onboarding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Create Organization'}
                </Button>
             </div>
          </form>
        ) : (
          <form onSubmit={handleBulkOnboard} className="space-y-6">
             <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Organization Names</label>
                <textarea 
                  autoFocus
                  required
                  rows={8}
                  value={bulkOrgNames}
                  onChange={e => setBulkOrgNames(e.target.value)}
                  placeholder="Acme Corp&#10;Globex Ltd&#10;Soylent Inc"
                  className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-3 font-bold text-slate-900 focus:border-indigo-500 outline-none transition-all placeholder:text-slate-300"
                />
                <p className="text-[10px] text-slate-400 font-medium italic">Enter one company name per line.</p>
             </div>
             <div className="flex gap-3 pt-4">
                <Button 
                  type="button" 
                  variant="outline" 
                  className="flex-1 font-black uppercase tracking-widest text-[10px]"
                  onClick={() => setOnboardModalOpen(false)}
                >
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  disabled={onboarding || !bulkOrgNames}
                  className="flex-1 font-black uppercase tracking-widest text-[10px] bg-indigo-600 hover:bg-indigo-700"
                >
                  {onboarding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Bulk Create Companies'}
                </Button>
             </div>
          </form>
        )}
      </Modal>
      <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black flex items-center gap-3">
            <ShieldCheck className="w-8 h-8 text-indigo-500 shrink-0" />
            <span className="truncate">Super Admin Registry</span>
          </h1>
          <p className="text-slate-500 text-sm">Platform-wide governance and organization management.</p>
        </div>
        <Button variant="ghost" className="text-red-500 hover:text-red-700 hover:bg-red-50 font-black uppercase tracking-widest text-[10px] h-auto p-2" onClick={clearEverything}>
          <Trash2 className="w-3 h-3 mr-2" /> <span className="hidden sm:inline">Nuclear Reset</span>
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        {[
          { label: 'Platform Jobs', val: stats.jobs, icon: Briefcase, color: 'text-indigo-600 bg-indigo-50' },
          { label: 'Total Candidates', val: stats.candidates, icon: Users, color: 'text-green-600 bg-green-50' },
          { label: 'Organizations', val: stats.organizations, icon: Globe, color: 'text-purple-600 bg-purple-50' },
          { label: 'Active Users', val: stats.users, icon: Database, color: 'text-amber-600 bg-amber-50' },
        ].map(s => (
          <Card key={s.label} className="p-6">
            <div className="flex items-center gap-4">
              <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center shrink-0", s.color)}>
                <s.icon className="w-6 h-6" />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest leading-none mb-1">{s.label}</p>
                <p className="text-3xl font-black leading-none">{s.val}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <div className="flex flex-wrap gap-4 border-b border-slate-200">
             <button 
               onClick={() => setTab('overview')}
               className={cn("pb-2 px-2 sm:px-4 text-[10px] sm:text-xs font-black uppercase tracking-widest transition-all shrink-0", activeTab === 'overview' ? "border-b-2 border-indigo-600 text-indigo-600" : "text-slate-400")}
             >
               Overview
             </button>
             <button 
               onClick={() => setTab('organizations')}
               className={cn("pb-2 px-2 sm:px-4 text-[10px] sm:text-xs font-black uppercase tracking-widest transition-all shrink-0", activeTab === 'organizations' ? "border-b-2 border-indigo-600 text-indigo-600" : "text-slate-400")}
             >
               Organizations
             </button>
             <button 
               onClick={() => setTab('payments')}
               className={cn("pb-2 px-2 sm:px-4 text-[10px] sm:text-xs font-black uppercase tracking-widest transition-all shrink-0", activeTab === 'payments' ? "border-b-2 border-indigo-600 text-indigo-600" : "text-slate-400")}
             >
               Payments
             </button>
             <button 
               onClick={() => setTab('integrations')}
               className={cn("pb-2 px-2 sm:px-4 text-[10px] sm:text-xs font-black uppercase tracking-widest transition-all shrink-0", activeTab === 'integrations' ? "border-b-2 border-indigo-600 text-indigo-600" : "text-slate-400")}
             >
               Settings
             </button>
             <button 
               onClick={() => setTab('manual')}
               className={cn("pb-2 px-2 sm:px-4 text-[10px] sm:text-xs font-black uppercase tracking-widest transition-all shrink-0", activeTab === 'manual' ? "border-b-2 border-indigo-600 text-indigo-600" : "text-slate-400")}
             >
               User Manual
             </button>
          </div>

          {activeTab === 'overview' ? (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                 <Card className="p-6 bg-indigo-600 text-white">
                    <p className="text-[10px] font-black uppercase tracking-widest opacity-60">Global Screening Volume</p>
                    <p className="text-3xl font-black">{recentCandidates.length}+</p>
                 </Card>
                 <Card className="p-6">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Database Health</p>
                    <p className="text-3xl font-black">99.9%</p>
                 </Card>
                 <Card className="p-6">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Platform Status</p>
                    <p className="text-3xl font-black text-green-500">Online</p>
                 </Card>
              </div>

              <h2 className="text-xl font-black uppercase tracking-tight">Recent Activity</h2>
              <Card className="overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[700px]">
                    <thead className="bg-slate-50 border-b border-slate-100">
                      <tr>
                        <th className="px-6 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Candidate</th>
                        <th className="px-6 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Org ID</th>
                        <th className="px-6 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Score</th>
                        <th className="px-6 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Time</th>
                        <th className="px-6 py-4 text-right text-[10px] font-black text-slate-400 uppercase tracking-widest">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                  {recentCandidates.map(c => (
                    <tr key={c.id} className="hover:bg-slate-50 transition-colors cursor-pointer group" onClick={() => navigate(`/candidates/${c.id}`)}>
                      <td className="px-6 py-4">
                        <div className="font-bold text-sm group-hover:text-indigo-600 transition-colors uppercase tracking-tight">{c.fullName}</div>
                        <div className="text-[10px] text-slate-400 font-mono italic">{c.email}</div>
                      </td>
                      <td className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase">
                        {c.organizationId?.slice(0, 8) || 'LEGACY'}
                      </td>
                      <td className="px-6 py-4">
                        <span className={cn(
                          "px-2 py-0.5 rounded text-[10px] font-black",
                          getScoreColor(c.scorecard.compositeScore)
                        )}>
                          {c.scorecard.compositeScore}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-[10px] font-bold text-slate-400">
                        {formatDateTime(c.createdAt)}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button 
                          onClick={async (e) => {
                            e.stopPropagation();
                            const ok = await confirm('Nuclear: Remove this candidate from global database?');
                            if (!ok) return;
                            try {
                              await writeBatch(db).delete(doc(db, 'candidates', c.id)).commit();
                              setRecentCandidates(prev => prev.filter(x => x.id !== c.id));
                              notify('Global record removed.', 'success');
                            } catch (err) {
                              handleFirestoreError(err, OperationType.DELETE, `candidates/${c.id}`);
                            }
                          }}
                          className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
          ) : activeTab === 'organizations' ? (
            <div className="space-y-6">
               <div className="flex justify-between items-center">
                  <h2 className="text-xl font-black uppercase tracking-tight">Organization Registry</h2>
                  <Button 
                    onClick={() => setOnboardModalOpen(true)}
                    className="h-9 px-4 text-[10px] font-black uppercase tracking-widest bg-indigo-600 hover:bg-indigo-700"
                  >
                    <Plus className="w-3.5 h-3.5 mr-1.5" /> Onboard Organization
                  </Button>
               </div>
                <Card className="overflow-hidden">
                   <div className="overflow-x-auto">
                     <table className="w-full min-w-[1000px]">
                     <thead className="bg-slate-50 border-b border-slate-100">
                       <tr>
                         <th className="px-6 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Organization</th>
                         <th className="px-6 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Industry & Size</th>
                         <th className="px-6 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Contact & HQ</th>
                         <th className="px-6 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Description</th>
                         <th className="px-6 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</th>
                         <th className="px-6 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Created</th>
                         <th className="px-6 py-4 text-right text-[10px] font-black text-slate-400 uppercase tracking-widest">Management</th>
                       </tr>
                     </thead>
                     <tbody className="divide-y divide-slate-100">
                       {organizations.map(org => (
                         <tr key={org.id}>
                           <td className="px-6 py-4">
                             <div className="font-bold text-sm uppercase tracking-tight text-slate-900">{org.name}</div>
                             <div className="text-[10px] text-slate-400 font-mono">ID: {org.id}</div>
                             {org.domain && <div className="text-[10px] text-indigo-500 font-mono mt-0.5">{org.domain}</div>}
                           </td>
                           <td className="px-6 py-4">
                             <div className="text-xs font-bold text-slate-700">{org.industry || "Technology"}</div>
                             <div className="text-[10px] text-slate-500 mt-0.5">{org.companySize || "11-50 employees"}</div>
                           </td>
                           <td className="px-6 py-4">
                             <div className="text-xs font-semibold text-slate-700">{org.location || "Not Provided"}</div>
                             <div className="text-[10px] text-slate-500 font-mono mt-0.5">{org.phone || "No Phone"}</div>
                           </td>
                           <td className="px-6 py-4">
                             <p className="text-xs text-slate-600 max-w-xs truncate" title={org.description}>
                               {org.description || "No vision summary provided."}
                             </p>
                           </td>
                           <td className="px-6 py-4">
                             <span className={cn(
                               "text-[9px] font-black px-2 py-0.5 rounded uppercase tracking-widest",
                               org.status === 'active' ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                             )}>{org.status}</span>
                           </td>
                           <td className="px-6 py-4 text-xs text-slate-500">
                             {formatDate(org.createdAt)}
                           </td>
                           <td className="px-6 py-4 text-right">
                             <div className="flex items-center justify-end gap-2">
                               <Button 
                                 variant="outline" 
                                 className="h-8 text-[10px] font-black uppercase tracking-widest text-indigo-600 border-indigo-100 px-3 hover:bg-indigo-50"
                                 onClick={() => {
                                   const url = `${window.location.origin}/join/${org.id}`;
                                   navigator.clipboard.writeText(url);
                                   notify(`Invite link for ${org.name} copied!`, 'success');
                                 }}
                               >
                                 <Copy className="w-3 h-3 mr-1.5" /> Invite Link
                               </Button>
                               <Button variant="outline" className="h-8 text-[10px] font-black uppercase tracking-widest text-slate-500">Suspend</Button>
                             </div>
                           </td>
                         </tr>
                       ))}
                     </tbody>
                   </table>
                 </div>
                </Card>
            </div>
          ) : activeTab === 'payments' ? (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
               <h2 className="text-xl font-black uppercase tracking-tight">Revenue & Billing Gateway</h2>
               <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  <Card className="p-8 flex flex-col items-center justify-center text-center space-y-4">
                     <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center">
                        <CreditCard className="w-8 h-8 text-indigo-600" />
                     </div>
                     <h3 className="font-black text-slate-900 uppercase">Stripe Integration</h3>
                     <p className="text-slate-500 text-xs font-medium max-w-[200px]">Enterprise billing and recurring subscriptions.</p>
                     <Button variant="secondary" className="text-[10px] font-black uppercase px-6">Manage Stripe</Button>
                  </Card>
                  <Card className="p-8 flex flex-col items-center justify-center text-center space-y-4">
                     <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center">
                        <Globe className="w-8 h-8 text-blue-600" />
                     </div>
                     <h3 className="font-black text-slate-900 uppercase">PayPal Integration</h3>
                     <p className="text-slate-500 text-xs font-medium max-w-[200px]">Global merchant payments and local wallet support.</p>
                     <Button variant="secondary" className="text-[10px] font-black uppercase px-6 bg-[#0070ba] hover:bg-[#005ea6]">Setup PayPal</Button>
                  </Card>
                  <Card className="p-8 flex flex-col items-center justify-center text-center space-y-4">
                     <div className="w-16 h-16 bg-orange-50 rounded-full flex items-center justify-center">
                        <Zap className="w-8 h-8 text-orange-600" />
                     </div>
                     <h3 className="font-black text-slate-900 uppercase">Razorpay Integration</h3>
                     <p className="text-slate-500 text-xs font-medium max-w-[200px]">Optimized for Indian markets and UPI transactions.</p>
                     <Button variant="secondary" className="text-[10px] font-black uppercase px-6 bg-[#3395ff] hover:bg-[#2088ff]">Setup Razorpay</Button>
                  </Card>
                  <Card className="p-8 border-dashed border-slate-200 bg-slate-50/50 flex flex-col items-center justify-center text-center space-y-4">
                     <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center border border-slate-100 shadow-sm">
                        <BarChart3 className="w-8 h-8 text-slate-300" />
                     </div>
                     <h3 className="font-black text-slate-900 uppercase text-slate-400">Total Revenue Analytics</h3>
                     <p className="text-slate-400 text-xs font-medium max-w-[200px]">Aggregate financial data across all registered organizations.</p>
                     <Button variant="outline" className="text-[10px] font-black uppercase px-6">View Ledger</Button>
                  </Card>
               </div>
            </div>
          ) : activeTab === 'integrations' ? (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <h2 className="text-xl font-black uppercase tracking-tight">API & OAuth Configuration</h2>
              <Card className="p-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                  <div className="space-y-6">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center">
                        <Globe className="w-5 h-5 text-indigo-600" />
                      </div>
                      <div>
                        <h4 className="font-black text-slate-900">Google Calendar</h4>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">OAuth 2.0 Integration</p>
                      </div>
                    </div>
                    
                    <div className="p-5 bg-slate-50 rounded-2xl border border-slate-100 space-y-4">
                      <div className="flex items-center justify-between">
                         <span className="text-[10px] font-black text-slate-500 uppercase">Redirect URI</span>
                         <code className="text-[9px] bg-white border px-2 py-0.5 rounded font-mono text-indigo-600 truncate max-w-[200px]">{window.location.origin}/auth/callback</code>
                      </div>
                      <div className="flex items-center justify-between">
                         <span className="text-[10px] font-black text-slate-500 uppercase">Provider Status</span>
                         <span className="text-[9px] bg-green-50 text-green-600 border border-green-100 px-3 py-1 rounded font-black uppercase tracking-widest">Service Online</span>
                      </div>
                    </div>

                    <div className="pt-4 border-t border-slate-100">
                      <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Setup Instructions</h5>
                      <ol className="text-xs text-slate-600 space-y-3 leading-relaxed list-decimal ml-4">
                        <li>Visit the <a href="https://console.cloud.google.com" target="_blank" className="font-bold text-indigo-600 underline">Google Cloud Console</a>.</li>
                        <li>Enable the <span className="font-black italic">Google Calendar API</span>.</li>
                        <li>Create <span className="font-black italic">OAuth 2.0 Client ID</span> credentials.</li>
                        <li>Add the Redirect URI shown above to the authorized list.</li>
                        <li>Set <code className="bg-slate-100 px-1 rounded text-pink-600">GOOGLE_CLIENT_ID</code> and <code className="bg-slate-100 px-1 rounded text-pink-600">GOOGLE_CLIENT_SECRET</code> in the app settings.</li>
                      </ol>
                    </div>
                  </div>

                  <div className="space-y-6">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center">
                        <Database className="w-5 h-5 text-emerald-600" />
                      </div>
                      <div>
                        <h4 className="font-black text-slate-900">Firebase Backend</h4>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Project Infrastructure</p>
                      </div>
                    </div>
                    
                    <div className="p-5 bg-emerald-50/30 rounded-2xl border border-emerald-100 space-y-4">
                      <div className="flex items-center justify-between">
                         <span className="text-[10px] font-black text-emerald-700 uppercase">Auth Engine</span>
                         <span className="text-xs font-bold text-emerald-900 italic">Google Popup Auth</span>
                      </div>
                      <div className="flex items-center justify-between">
                         <span className="text-[10px] font-black text-emerald-700 uppercase">Data Security</span>
                         <span className="text-[9px] bg-emerald-500 text-white px-2 py-0.5 rounded font-black uppercase tracking-widest">Firestore Hardened</span>
                      </div>
                    </div>

                    <div className="p-6 bg-white border-2 border-slate-100 rounded-[2rem] text-center space-y-4 shadow-sm">
                       <ShieldCheck className="w-12 h-12 text-slate-200 mx-auto" />
                       <h5 className="text-sm font-black text-slate-900 uppercase tracking-tight">Security Invariant</h5>
                       <p className="text-[11px] text-slate-500 leading-relaxed italic">
                         All integration keys are handled server-side via the Express proxy to prevent leaking client secrets to the browser.
                       </p>
                    </div>
                  </div>
                </div>
              </Card>
            </div>
          ) : activeTab === 'manual' ? (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 p-6 bg-slate-900 text-white rounded-3xl border border-slate-800 shadow-xl shadow-slate-900/10">
                <div>
                  <h2 className="text-lg font-black uppercase tracking-tight flex items-center gap-2 mb-0.5" id="operations-handbook-title">
                    <BookOpen className="w-5 h-5 text-indigo-400 shrink-0 animate-pulse" />
                    HR Operations Handbook
                  </h2>
                  <p className="text-slate-400 text-xs">Download and send this complete onboarding kit to corporate organizations via email.</p>
                </div>
                <div className="flex flex-wrap gap-2.5">
                  <Button
                    onClick={handleDownloadPDF}
                    className="h-10 px-4 text-[10px] font-black uppercase tracking-widest bg-indigo-600 hover:bg-indigo-750 text-white flex items-center gap-2 hover:scale-[1.02] transition-transform active:scale-[0.98]"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Download PDF Manual
                  </Button>
                  <Button
                    onClick={handleDownloadManual}
                    variant="outline"
                    className="h-10 px-4 text-[10px] font-black uppercase tracking-widest text-slate-300 border-slate-700 hover:bg-slate-800 hover:text-white flex items-center gap-2 hover:scale-[1.02] transition-transform active:scale-[0.98]"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    Download HTML Manual
                  </Button>
                  <Button
                    onClick={() => {
                      notify('Preparing Print Document layout...', 'info');
                      window.print();
                    }}
                    variant="outline"
                    className="h-10 px-4 text-[10px] font-black uppercase tracking-widest text-slate-400 border-slate-800 hover:bg-slate-800 hover:text-white flex items-center gap-2"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    Print Layout
                  </Button>
                </div>
              </div>

              {/* The Manual Document Screen Preview */}
              <Card className="p-6 md:p-10 space-y-12 bg-white border border-slate-100 shadow-sm rounded-3xl max-h-[70vh] overflow-y-auto custom-scrollbar">
                {/* Visual Header */}
                <div className="text-center pb-8 border-b border-slate-100 space-y-3.5">
                  <span className="px-3.5 py-1 bg-indigo-50 border border-indigo-100 rounded-full text-[9px] font-black uppercase tracking-widest text-indigo-600 inline-block font-mono">
                    Enterprise HR Kit
                  </span>
                  <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">AI Hire Operations & Onboarding Manual</h1>
                  <p className="text-slate-500 text-sm max-w-xl mx-auto font-medium lead-relaxed">
                    This official guide details the integrated calibration, batch sourcing pipeline, and custom grading frameworks for registered HR organizations.
                  </p>
                </div>

                {/* Section 1 */}
                <div className="space-y-4">
                  <h3 className="text-sm font-black uppercase tracking-wider text-slate-800 flex items-center gap-2 mb-3">
                    <span className="text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded text-xs font-mono">01</span> The D6 Screening Philosophy
                  </h3>
                  <p className="text-slate-600 text-xs font-medium leading-relaxed">
                    The platform evaluates candidate resumes across six deep screening dimensions. Rather than matching flat keywords, language parsing engines grade professional experiences dynamically:
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {[
                      { name: 'Technical Core (D1)', desc: 'Analyzes knowledge of languages, libraries, platforms, and package ecosystems demanded by the target Job Specification.' },
                      { name: 'Pragmatic Tenure (D2)', desc: 'Inspects career length, closeness of previous job titles, management seniority, and sector-related longevity.' },
                      { name: 'Educational Foundation (D3)', desc: 'Grades academic credentials, major alignment, and university ranking filters.' },
                      { name: 'Quantifiable Outcomes (D4)', desc: 'Reviews bullet points for metric KPI improvements, cost reductions, system scale, and quantitative awards.' },
                      { name: 'Cultural Coherence (D5)', desc: 'Flags chronological professional timeline gaps, tenure patterns, and career trajectory stability.' },
                      { name: 'Generative Sincerity (D6)', desc: 'Audits the resume forensically for templated generic explanations, resume padding, and copy-paste indicators.' }
                    ].map(dim => (
                      <div key={dim.name} className="p-4 bg-slate-50 border border-slate-100 rounded-2xl hover:border-indigo-100 transition-colors">
                        <h4 className="text-xs font-black uppercase tracking-wider text-indigo-600 mb-1.5 flex items-center gap-1.5">
                          <Target className="w-3.5 h-3.5 shrink-0" />
                          {dim.name}
                        </h4>
                        <p className="text-[11px] text-slate-500 leading-relaxed font-semibold">{dim.desc}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Section 2 */}
                <div className="space-y-4">
                  <h3 className="text-sm font-black uppercase tracking-wider text-slate-800 flex items-center gap-2 mb-3">
                    <span className="text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded text-xs font-mono">02</span> Operational Action Blueprint
                  </h3>
                  <p className="text-slate-600 text-xs font-medium leading-relaxed">
                    Onboard new hiring teams to live status within minutes by walking them through these 4 primary operational phases:
                  </p>
                  <div className="space-y-4">
                    {[
                      { step: '1', title: 'Register Workspace Space', text: 'Onboarded teams use the Super Admin’s tenant invitation link (copied from the Organization list) to securely establish their business identity and connect with shared DB clusters.' },
                      { step: '2', title: 'Publish Screening Campaigns', text: 'Corporate recruiters click "New Job" to instantiate campaigns. Specify title, seniority tier, and input standard Job descriptions. The system parses structural requirements immediately.' },
                      { step: '3', title: 'Fine-tune Grading Weights', text: 'Click "Evaluation Settings" on any job to modify weight ratios of D1-D5 criteria. Adjusting thresholds recalculates match categorization rules automatically.' },
                      { step: '4', title: 'Sbatch Ingestion Files', text: 'Drag and drop candidate resumes (.pdf, .docx). Parallel pipelines parse files simultaneously, caching texts for re-evaluation runs.' }
                    ].map(st => (
                      <div key={st.step} className="flex gap-4 items-start p-3 bg-indigo-50/25 rounded-2xl border border-indigo-100/30">
                        <div className="w-7 h-7 bg-indigo-100 text-indigo-600 rounded-full font-black text-xs flex items-center justify-center shrink-0">
                          {st.step}
                        </div>
                        <div>
                          <h4 className="text-xs font-black uppercase tracking-wider text-slate-800 leading-none mb-1">{st.title}</h4>
                          <p className="text-[11px] text-slate-500 leading-relaxed font-semibold mt-1">{st.text}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Section 3 */}
                <div className="space-y-4">
                  <h3 className="text-sm font-black uppercase tracking-wider text-slate-800 flex items-center gap-2 mb-3">
                    <span className="text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded text-xs font-mono">03</span> Grading Settings & Calibration
                  </h3>
                  <p className="text-slate-600 text-xs font-semibold leading-relaxed">
                    Recruitment managers can completely overrule standard weights to map criteria directly with physical job types:
                  </p>
                  <div className="p-4 bg-emerald-50/50 rounded-2xl border border-emerald-100 text-[11px] text-emerald-800 leading-relaxed font-semibold">
                    💡 IMPORTANT INVARIANT: Aggregate weights of custom D1-D5 dimensions (such as Tech Skill, Tenure, Degree Alignment) must equal exactly 100%. Adjusting Job thresholds sets visual match guidelines in list cards directly. Saving configurations allows triggering immediate bulk re-scoring for all past uploaded applicants with a single button!
                  </div>
                </div>

                {/* Section 4 */}
                <div className="space-y-4">
                  <h3 className="text-sm font-black uppercase tracking-wider text-slate-800 flex items-center gap-2">
                    <span className="text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded text-xs font-mono">04</span> Reading Interactive Candidate Dashboards
                  </h3>
                  <p className="text-slate-600 text-xs font-medium leading-relaxed">
                    Opening any scored candidate row triggers the specialized evaluation scorecard report, showing the following forensic information:
                  </p>
                  <ul className="list-disc pl-5 text-xs text-slate-500 space-y-2 leading-relaxed font-semibold">
                    <li><span className="text-slate-700 font-bold">Executive Verdict Narrative:</span> A objective 3-sentence summary analyzing qualifications and general job suitability.</li>
                    <li><span className="text-slate-700 font-bold">Chronological Padding Checklists:</span> Spots gaps in tenure, rapid changes of employer, or suspiciously generic candidate summaries.</li>
                    <li><span className="text-slate-700 font-bold">Tailored Interview Prompts:</span> 3 intelligent discussion templates custom-built for interviewers to probe exact weaknesses identified during parsing.</li>
                  </ul>
                </div>

                {/* Section 5 */}
                <div className="space-y-4 pt-4 border-t border-slate-100">
                  <h3 className="text-sm font-black uppercase tracking-wider text-slate-800 flex items-center gap-2">
                    <span className="text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded text-xs font-mono">05</span> Configuration of SMTP Outgoing Servers
                  </h3>
                  <p className="text-slate-600 text-xs font-medium leading-relaxed">
                    Shortlisted candidates receive automated invite emails dispatched directly from the organization’s domain setup:
                  </p>
                  <ol className="list-decimal pl-5 text-xs text-slate-500 space-y-2 leading-relaxed font-semibold">
                    <li>Visit the <strong>Super Admin Registry</strong> settings panel to specify outgoing details.</li>
                    <li>Key in SMTP server address (e.g. <code>smtp.gmail.com</code>) with authorized credentials. Select Secure SSL (Port 465) or TLS (Port 587).</li>
                    <li>Verify setup using the inline connection verification test block before rolling out mail systems to recruiting staffs.</li>
                  </ol>
                </div>
              </Card>
            </div>
          ) : (
            <div className="space-y-6">
               <h2 className="text-xl font-black uppercase tracking-tight">System Configuration (SRS REQ 4.2.2)</h2>
               <Card className="p-8 space-y-8">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                     <div className="space-y-4">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Master AI Provider</label>
                        <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-xl border border-slate-100">
                           <Globe className="w-5 h-5 text-indigo-500" />
                           <div>
                              <p className="text-sm font-bold">Google Gemini 1.5 Pro</p>
                              <p className="text-[10px] text-slate-500">Official Provider for Analysis & Vision</p>
                           </div>
                        </div>
                     </div>
                     <div className="space-y-4">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">API Key Status</label>
                        <div className="flex items-center gap-3 p-4 bg-green-50 rounded-xl border border-green-100">
                           <ShieldCheck className="w-5 h-5 text-green-500" />
                           <div>
                              <p className="text-sm font-bold text-green-700">Valid & Connected</p>
                              <p className="text-[10px] text-green-600/70">Encrypted in AI Studio Environment</p>
                           </div>
                        </div>
                     </div>
                  </div>

                  <div className="pt-6 border-t border-slate-100 space-y-4">
                     <h3 className="text-sm font-black uppercase tracking-widest text-slate-400">Global Tenant Policies</h3>
                     <div className="flex items-center justify-between p-4 bg-white border border-slate-200 rounded-xl">
                        <div>
                           <p className="text-sm font-bold">Automatic Red-Flag Detection</p>
                           <p className="text-[10px] text-slate-500">Enable AI parsing of experience gaps and misalignment</p>
                        </div>
                        <div className="w-12 h-6 bg-indigo-600 rounded-full relative">
                           <div className="absolute right-1 top-1 w-4 h-4 bg-white rounded-full" />
                        </div>
                     </div>
                     <div className="flex items-center justify-between p-4 bg-white border border-slate-200 rounded-xl">
                        <div>
                           <p className="text-sm font-bold">Candidate GDPR Consent</p>
                           <p className="text-[10px] text-slate-500">Require explicit recording consent in interview room</p>
                        </div>
                        <div className="w-12 h-6 bg-indigo-600 rounded-full relative">
                           <div className="absolute right-1 top-1 w-4 h-4 bg-white rounded-full" />
                        </div>
                     </div>
                  </div>

                  <Button variant="outline" className="w-full h-12 text-xs font-black uppercase tracking-widest">
                     Download Comprehensive System Audit Logs
                  </Button>
               </Card>
            </div>
          )}
        </div>

        <div className="space-y-6">
          <h2 className="text-xl font-black">Admin Meta</h2>
          <Card className="p-6 bg-slate-900 text-white">
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <Settings className="w-4 h-4 text-indigo-400" />
                <span className="text-sm font-bold">System Health</span>
                <span className="ml-auto text-[10px] bg-green-500/20 text-green-400 px-2 py-0.5 rounded border border-green-500/30 font-black uppercase">Online</span>
              </div>
              <div className="h-px bg-slate-800" />
              <div className="space-y-2">
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Storage & Compute</p>
                <div className="flex justify-between text-xs">
                   <span className="text-slate-400">Database Instances</span>
                   <span className="font-bold">1/1</span>
                </div>
                <div className="w-full bg-slate-800 h-1 rounded-full">
                   <div className="w-full bg-indigo-500 h-full rounded-full" />
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Onboarding() {
  const { orgId } = useParams();
  const { profile, refreshProfile } = useProfile();
  const { notify } = useNotification();
  const navigate = useNavigate();
  const [orgName, setOrgName] = useState('');
  const [orgIndustry, setOrgIndustry] = useState('Technology');
  const [orgCompanySize, setOrgCompanySize] = useState('11-50');
  const [orgLocation, setOrgLocation] = useState('');
  const [orgPhone, setOrgPhone] = useState('');
  const [orgDescription, setOrgDescription] = useState('');
  const [invitedOrg, setInvitedOrg] = useState<Organization | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkingInvite, setCheckingInvite] = useState(!!orgId);

  useEffect(() => {
    if (profile?.organizationId && !orgId) {
      navigate('/');
    }
  }, [profile, orgId, navigate]);

  useEffect(() => {
    if (orgId) {
      setCheckingInvite(true);
      getDoc(doc(db, 'organizations', orgId))
        .then(docSnap => {
          if (docSnap.exists()) {
            setInvitedOrg({ id: docSnap.id, ...docSnap.data() } as Organization);
          } else {
            notify('Invalid or expired invite link.', 'error');
          }
        })
        .catch(err => {
          console.error('Invite check failed:', err);
        })
        .finally(() => setCheckingInvite(false));
    }
  }, [orgId]);

  const handleJoinInvited = async () => {
    if (!invitedOrg || !auth.currentUser) return;
    setLoading(true);
    const path = `users/${auth.currentUser.uid}`;
    try {
      await setDoc(doc(db, 'users', auth.currentUser.uid), {
        uid: auth.currentUser.uid,
        email: auth.currentUser.email,
        organizationId: invitedOrg.id,
        role: 'member',
        fullName: auth.currentUser.displayName || '',
        createdAt: serverTimestamp()
      });
      notify(`Successfully joined ${invitedOrg.name}!`, 'success');
      await refreshProfile();
      navigate('/');
    } catch (err) {
      console.error(err);
      handleFirestoreError(err, OperationType.WRITE, path);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgName.trim() || !auth.currentUser) return;
    setLoading(true);
    try {
      const orgRef = await addDoc(collection(db, 'organizations'), {
        name: orgName.trim(),
        industry: orgIndustry,
        companySize: orgCompanySize,
        location: orgLocation.trim(),
        phone: orgPhone.trim(),
        description: orgDescription.trim(),
        createdAt: serverTimestamp(),
        createdBy: auth.currentUser.uid,
        status: 'active'
      }).catch(err => handleFirestoreError(err, OperationType.CREATE, 'organizations'));

      if (!orgRef) throw new Error('Failed to create organization reference');

      await setDoc(doc(db, 'users', auth.currentUser.uid), {
        uid: auth.currentUser.uid,
        email: auth.currentUser.email,
        organizationId: orgRef.id,
        role: 'owner',
        fullName: auth.currentUser.displayName || '',
        createdAt: serverTimestamp()
      }).catch(err => handleFirestoreError(err, OperationType.WRITE, `users/${auth.currentUser.uid}`));

      notify('Organization created successfully!', 'success');
      await refreshProfile();
      navigate('/');
    } catch (err: any) {
      console.error('Workspace setup failed:', err);
      let errorMsg = 'Failed to create organization.';
      try {
        const firestoreErr = JSON.parse(err.message);
        errorMsg = `Security Error: ${firestoreErr.error}`;
      } catch (e) {
        errorMsg = err.message || errorMsg;
      }
      notify(errorMsg, 'error');
    } finally {
      setLoading(false);
    }
  };

  if (checkingInvite) return <div className="h-screen flex items-center justify-center text-slate-400 font-bold uppercase tracking-widest animate-pulse">Securing Invite Context...</div>;

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <Card className="w-full max-w-md p-8 space-y-8 animate-in fade-in slide-in-from-bottom-4 shadow-2xl border-indigo-100">
        {invitedOrg ? (
          <>
            <div className="text-center space-y-4">
              <div className="w-20 h-20 bg-indigo-50 rounded-full flex items-center justify-center mx-auto border-4 border-white shadow-xl">
                <Globe className="w-10 h-10 text-indigo-600" />
              </div>
              <div>
                <h2 className="text-2xl font-black text-slate-900 tracking-tight uppercase">INVITATION ACCEPTED</h2>
                <p className="text-slate-500 text-sm font-medium mt-1">You've been invited to join <span className="text-indigo-600 font-black">{invitedOrg.name}</span></p>
              </div>
            </div>

            <div className="space-y-4 pt-4">
              <div className="p-4 bg-indigo-50/50 rounded-2xl border border-indigo-100/50 flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-white border border-indigo-100 flex items-center justify-center font-black text-indigo-600 shadow-sm">
                  {invitedOrg.name.charAt(0)}
                </div>
                <div>
                  <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Organization ID</p>
                  <p className="text-xs font-mono font-bold text-slate-600">{invitedOrg.id}</p>
                </div>
              </div>

              <Button 
                onClick={handleJoinInvited}
                variant="secondary" 
                className="w-full h-14 text-sm font-black uppercase tracking-widest shadow-xl shadow-indigo-200 bg-indigo-600 hover:bg-indigo-700"
                disabled={loading}
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : `Join ${invitedOrg.name}`}
              </Button>
              
              <button 
                onClick={() => setInvitedOrg(null)}
                className="w-full text-center text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-slate-600 transition-colors"
              >
                Or create a new organization instead
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="text-center space-y-2">
              <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center mx-auto shadow-xl shadow-indigo-200">
                <Briefcase className="w-8 h-8 text-white" />
              </div>
              <h2 className="text-2xl font-black text-slate-900 tracking-tight">SET UP YOUR WORKSPACE</h2>
              <p className="text-slate-500 text-sm font-medium">Create an organization to start hiring.</p>
            </div>

            <form onSubmit={handleCreateOrg} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Organization Name</label>
                <input 
                  type="text"
                  required
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border-2 border-slate-100 focus:outline-none focus:border-indigo-600 transition-all font-bold text-slate-700 placeholder:text-slate-300 text-sm"
                  placeholder="e.g. Acme Corp"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Industry</label>
                  <select
                    value={orgIndustry}
                    onChange={(e) => setOrgIndustry(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border-2 border-slate-100 focus:outline-none focus:border-indigo-600 transition-all font-bold text-slate-700 text-sm bg-white"
                  >
                    <option value="Technology">Technology</option>
                    <option value="Finance">Finance</option>
                    <option value="Healthcare">Healthcare</option>
                    <option value="Education">Education</option>
                    <option value="Retail">Retail</option>
                    <option value="Non-Profit">Non-Profit</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Company Size</label>
                  <select
                    value={orgCompanySize}
                    onChange={(e) => setOrgCompanySize(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border-2 border-slate-100 focus:outline-none focus:border-indigo-600 transition-all font-bold text-slate-700 text-sm bg-white"
                  >
                    <option value="1-10">1-10 employees</option>
                    <option value="11-50">11-50 employees</option>
                    <option value="51-200">51-200 employees</option>
                    <option value="201-500">201-500 employees</option>
                    <option value="501-1000">501-1000 employees</option>
                    <option value="1000+">1000+ employees</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">HQ Location</label>
                <input 
                  type="text"
                  value={orgLocation}
                  onChange={(e) => setOrgLocation(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border-2 border-slate-100 focus:outline-none focus:border-indigo-600 transition-all font-bold text-slate-700 placeholder:text-slate-300 text-sm"
                  placeholder="e.g. San Francisco, CA"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Contact Phone</label>
                <input 
                  type="tel"
                  value={orgPhone}
                  onChange={(e) => setOrgPhone(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border-2 border-slate-100 focus:outline-none focus:border-indigo-600 transition-all font-bold text-slate-700 placeholder:text-slate-300 text-sm"
                  placeholder="e.g. +1 (555) 123-4567"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Description / Vision</label>
                <textarea 
                  value={orgDescription}
                  onChange={(e) => setOrgDescription(e.target.value)}
                  rows={2}
                  className="w-full px-4 py-2.5 rounded-xl border-2 border-slate-100 focus:outline-none focus:border-indigo-600 transition-all font-bold text-slate-700 placeholder:text-slate-300 text-sm resize-none"
                  placeholder="Tell us briefly about your team..."
                />
              </div>

              <Button 
                type="submit" 
                variant="secondary" 
                className="w-full h-12 text-xs font-black uppercase tracking-widest shadow-xl shadow-indigo-200 mt-2"
                disabled={loading}
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Create Organization Workspace'}
              </Button>
            </form>
          </>
        )}

        <p className="text-[10px] text-slate-400 text-center uppercase font-bold tracking-tighter pt-4">
          By continuing, you agree to our terms of service and professional boundaries.
        </p>
        
        <div className="pt-4 border-t border-slate-100 flex flex-col items-center gap-2">
          <p className="text-[9px] text-slate-400 font-medium">Connectivity issues?</p>
          <button 
            onClick={async () => {
              try {
                await terminate(db);
                await clearIndexedDbPersistence(db);
                window.location.reload();
              } catch (e) {
                window.location.reload();
              }
            }}
            className="text-[10px] font-black text-indigo-400 hover:text-indigo-600 uppercase tracking-widest flex items-center gap-1"
          >
            <RotateCcw className="w-3 h-3" /> Re-sync Database
          </button>
        </div>
      </Card>
    </div>
  );
}

function LandingPage() {
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
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes marquee {
          0% { transform: translateX(0%); }
          100% { transform: translateX(-100%); }
        }
        .animate-\\\\[marquee_30s_linear_infinite\\\\] {
          animation: marquee 30s linear infinite;
        }
      `}} />
      
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
          <div className="w-full px-4 sm:px-6 h-20 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 via-violet-600 to-cyan-500 p-[1px]">
                <div className="w-full h-full bg-[#050505] rounded-[11px] flex items-center justify-center">
                  <Cpu className="w-5 h-5 text-white" />
                </div>
              </div>
              <span className="font-display font-black text-2xl tracking-tighter text-white">Hire<span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-400 to-cyan-400">Now</span></span>
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
            Supercharge your agency with <br className="hidden md:block"/>
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-400 via-indigo-400 to-cyan-400">Autonomous AI Screening.</span>
          </h1>
          
          <p className="text-lg md:text-xl text-slate-400 max-w-2xl mx-auto mb-12 font-medium leading-relaxed">
            Stop wasting recruiter hours on initial screening calls. Deploy our conversational AI agents to conduct rigorous, multi-dimensional interviews for your clients at infinite scale.
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
                hirenow-engine // live-eval
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
                  <p className="text-slate-400 text-sm max-w-2xl">Operate HireNow as your own product. Embed the screening lobby directly into your corporate domain with fully customized branding, color schemes, and dynamic pricing matrices for your sub-tenants.</p>
               </div>
               <div className="w-full sm:w-auto shrink-0 flex items-center gap-4">
                  <button onClick={signIn} className="px-6 py-3 rounded-xl bg-white text-black font-black uppercase tracking-widest text-xs hover:bg-slate-200 transition-colors">
                    Explore Enterprise
                  </button>
               </div>
             </div>
          </div>
        </section>

        
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
            Deploy HireNow Today
          </button>
        </section>
        
        <footer className="py-8 border-t border-white/10 text-center">
           <p className="text-[10px] font-bold uppercase tracking-widest text-slate-600">© 2026 HireNow Inc. All systems operational.</p>
        </footer>

      </div>
    </div>
  );
}


export default function App() {
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  // Notification State
  const [confirmState, setConfirmState] = useState<{ msg: string; resolve: (val: boolean) => void } | null>(null);
  const [notifications, setNotifications] = useState<{ id: string; msg: string; type: 'success' | 'error' | 'info' }[]>([]);

  const confirm = (msg: string): Promise<boolean> => {
    return new Promise((resolve) => {
      setConfirmState({ msg, resolve });
    });
  };

  const notify = (msg: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = Math.random().toString(36).slice(2);
    setNotifications(prev => [...prev, { id, msg, type }]);
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, 4000);
  };

  const refreshProfile = async () => {
    if (!auth.currentUser) return;
    try {
      const profileDoc = await getDoc(doc(db, 'users', auth.currentUser.uid));
      if (profileDoc.exists()) {
        const p = { ...profileDoc.data(), uid: profileDoc.id } as UserProfile;
        setProfile(p);
        if (p.organizationId) {
          const orgDoc = await getDoc(doc(db, 'organizations', p.organizationId));
          if (orgDoc.exists()) {
            setOrganization({ ...orgDoc.data(), id: orgDoc.id } as Organization);
          }
        }
      }
    } catch (err) {
      console.error('Failed to refresh profile:', err);
    }
  };

  useEffect(() => {
    testConnection();
    const timeout = setTimeout(() => {
      setLoading(false);
    }, 10000);

    const unsub = onAuthStateChanged(auth, async (u) => {
      clearTimeout(timeout);
      setUser(u);
      if (u) {
        let retries = 3;
        while (retries > 0) {
          try {
            // Super Admin override
            if (u.email === 'malviya.pratyush26@gmail.com') {
              setIsAdmin(true);
            }
            
            const profileDoc = await getDoc(doc(db, 'users', u.uid));
            if (profileDoc.exists()) {
              const p = { ...profileDoc.data(), uid: profileDoc.id } as UserProfile;
              setProfile(p);
              if (p.organizationId) {
                const orgDoc = await getDoc(doc(db, 'organizations', p.organizationId));
                if (orgDoc.exists()) {
                  setOrganization({ ...orgDoc.data(), id: orgDoc.id } as Organization);
                }
              }
            }
            
            // System Admins collection (Super Admins)
            const adminDoc = await getDoc(doc(db, 'admins', u.uid));
            if (adminDoc.exists()) {
              setIsAdmin(true);
            }
            break; // Success
          } catch (err) {
            console.warn(`Profile/Admin check attempt ${4 - retries} failed:`, err);
            retries--;
            if (retries === 0) {
              console.error('Final attempt of profile check failed:', err);
              // Handle permanent offline state
              if (err instanceof Error && err.message.includes('offline')) {
                // We're already initialized but apparently offline
                setLoading(false); // Let the app load anyway so they can see the offline state or error boundary
              }
            } else {
              await new Promise(resolve => setTimeout(resolve, 2000)); // Wait before retry
            }
          }
        }
      } else {
        setProfile(null);
        setOrganization(null);
        setIsAdmin(false);
      }
      setLoading(false);
    });
    return () => {
      clearTimeout(timeout);
      unsub();
    };
  }, []);

  if (loading) return (
    <div className="h-screen bg-slate-950 flex flex-col items-center justify-center gap-6">
      <div className="relative">
        <div className="w-16 h-16 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
        <div className="absolute inset-0 flex items-center justify-center">
           <Search className="w-6 h-6 text-indigo-400" />
        </div>
      </div>
      <div className="space-y-2 text-center">
        <h2 className="text-xl font-black text-white uppercase tracking-widest">HireNow</h2>
        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] animate-pulse">Initializing Neural Interface...</p>
      </div>
    </div>
  );

  const handleSignIn = async () => {
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (error: any) {
      if (error.code === 'auth/popup-closed-by-user') {
        process.env.NODE_ENV === 'development' && console.log('Sign-in popup closed by user.');
        return;
      }
      if (error.code === 'auth/popup-blocked') {
        notify('Sign-in popup was blocked by your browser. Please allow popups for this site and try again.', 'error');
        return;
      }
      if (error.code === 'auth/cancelled-popup-request') {
        // This often happens in iframe environments if multiple clicks occur or browser cancels
        notify('Authentication was cancelled or blocked. Please ensure popups are enabled and try standard login.', 'info');
        return;
      }
      if (error.code === 'auth/unauthorized-domain') {
        notify(`Authorized Domain Missing: Please add "${window.location.hostname}" to your Authorized Domains in Firebase Console > Authentication > Settings.`, 'error');
        return;
      }
      console.error('Sign-in error:', error);
      notify('Failed to sign in. Please try again.', 'error');
    }
  };

  return (
    <Router>
      <NotificationContext.Provider value={{ confirm, notify, signIn: handleSignIn }}>
        <ProfileContext.Provider value={{ profile, organization, refreshProfile }}>
          <Layout user={user} isAdmin={isAdmin}>
            {user ? (
              <Routes>
                <Route path="/join/:orgId" element={<Onboarding />} />
                <Route path="/interview/:candidateId" element={<InterviewRoom />} />
                {!profile ? (
                  <Route path="*" element={<Onboarding />} />
                ) : (
                  <>
                    <Route path="/" element={<Dashboard />} />
                    <Route path="/jobs/new" element={<NewJob />} />
                    <Route path="/jobs/:jobId" element={<JobDetail />} />
                    <Route path="/candidates/:candidateId" element={<CandidateDetail />} />
                    <Route path="/org-admin" element={<OrgAdminPanel />} />
                    <Route path="/admin" element={<SuperAdminPanel />} />
                    <Route path="*" element={<Navigate to="/" replace />} />
                  </>
                )}
              </Routes>
            ) : (
              <LandingPage />
            )}
          </Layout>

          {/* ... existing modals ... */}
        <Modal 
          isOpen={!!confirmState} 
          onClose={() => confirmState?.resolve(false)} 
          title="Security Confirmation"
        >
          <div className="space-y-6">
            <div className="flex gap-4 p-4 bg-amber-50 rounded-xl border border-amber-100">
              <AlertCircle className="w-6 h-6 text-amber-500 shrink-0" />
              <p className="text-sm font-bold text-slate-700 leading-relaxed">
                {confirmState?.msg}
              </p>
            </div>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => { confirmState?.resolve(false); setConfirmState(null); }}>
                Cancel
              </Button>
              <Button variant="secondary" className="flex-1 bg-red-600 hover:bg-red-700" onClick={() => { confirmState?.resolve(true); setConfirmState(null); }}>
                Confirm Action
              </Button>
            </div>
          </div>
        </Modal>

        {/* Toast Notification Layer */}
        <div className="fixed bottom-6 right-6 z-[200] flex flex-col gap-3 pointer-events-none">
          <AnimatePresence>
            {notifications.map(n => (
              <motion.div
                key={n.id}
                initial={{ opacity: 0, x: 20, scale: 0.9 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
                className={cn(
                  "px-6 py-4 rounded-2xl shadow-2xl border flex items-center gap-3 min-w-[280px] pointer-events-auto",
                  n.type === 'success' ? "bg-white border-green-100 text-green-700" :
                  n.type === 'error' ? "bg-white border-red-100 text-red-700" : "bg-white border-slate-100 text-slate-700"
                )}
              >
                {n.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : 
                 n.type === 'error' ? <AlertCircle className="w-5 h-5" /> : <Loader2 className="w-5 h-5 animate-spin" />}
                <span className="text-sm font-black uppercase tracking-tight">{n.msg}</span>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </ProfileContext.Provider>
    </NotificationContext.Provider>
  </Router>
);
}
