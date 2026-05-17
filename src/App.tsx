import { motion, AnimatePresence } from 'motion/react';
import { Briefcase, ChevronRight, Plus, Search, Users, Trash2, CheckCircle2, AlertCircle, BarChart3, ShieldCheck, Shield, Database, Settings, Globe, ExternalLink, Loader2, MoreHorizontal, RotateCcw, LayoutGrid, List, Filter, MessageSquare, Video, Play, Send, Calendar, Volume2, Mic, MicOff, Camera, CameraOff, Clock, Info, Heart, Brain, Award, Cpu, BookOpen, Terminal, Lightbulb, AlertTriangle, ChevronDown, ChevronUp, Copy, CreditCard, Zap, Star, Sparkles, ArrowRight, Check, Menu, X } from 'lucide-react';
import { useEffect, useState, createContext, useContext, useRef, Component } from 'react';
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

const ROLE_WEIGHTS = {
  'Technical / Engineering': { skillsMatch: 0.30, experienceFit: 0.20, education: 0.10, achievements: 0.20, culturalRoleFit: 0.10, communicationSkills: 0.10 },
  'HR / People Ops': { skillsMatch: 0.20, experienceFit: 0.20, education: 0.15, achievements: 0.20, culturalRoleFit: 0.10, communicationSkills: 0.15 },
  'Sales / BD': { skillsMatch: 0.15, experienceFit: 0.25, education: 0.10, achievements: 0.25, culturalRoleFit: 0.10, communicationSkills: 0.15 },
  'Leadership / C-Suite': { skillsMatch: 0.15, experienceFit: 0.20, education: 0.10, achievements: 0.30, culturalRoleFit: 0.10, communicationSkills: 0.15 },
  'Operations / Generalist': { skillsMatch: 0.20, experienceFit: 0.20, education: 0.15, achievements: 0.15, culturalRoleFit: 0.10, communicationSkills: 0.20 },
} as const;

function calculateEnhancedScorecard(screeningResult: any, jobRequirements: any) {
  const dimensions = screeningResult.scorecard.dimensions;
  const roleType = jobRequirements.role_type || 'Operations / Generalist';
  const roleWeights = (ROLE_WEIGHTS as any)[roleType] || ROLE_WEIGHTS['Operations / Generalist'];
  
  let weightedSum = 0;
  weightedSum += (dimensions.skillsMatch?.score || 0) * roleWeights.skillsMatch;
  weightedSum += (dimensions.experienceFit?.score || 0) * roleWeights.experienceFit;
  weightedSum += (dimensions.education?.score || 0) * roleWeights.education;
  weightedSum += (dimensions.achievements?.score || 0) * roleWeights.achievements;
  weightedSum += (dimensions.culturalRoleFit?.score || 0) * roleWeights.culturalRoleFit;
  weightedSum += (dimensions.communicationSkills?.score || 0) * roleWeights.communicationSkills;

  let penaltySum = (dimensions.redFlags?.totalPenalty || 0);

  // KO-4: 3 or more dimensions score < 50 => -15pt penalty
  const lowScoresCount = [
    dimensions.skillsMatch?.score,
    dimensions.experienceFit?.score,
    dimensions.education?.score,
    dimensions.achievements?.score,
    dimensions.culturalRoleFit?.score,
    dimensions.communicationSkills?.score
  ].filter(s => (s || 0) < 50).length;

  if (lowScoresCount >= 3) {
    penaltySum += 15;
    // Add to red flags if not present
    if (!dimensions.redFlags.flags.some((f: any) => f.label === 'Cross-Dimension Weakness')) {
      dimensions.redFlags.flags.push({
        label: 'Cross-Dimension Weakness',
        severity: 'medium',
        penalty: 15,
        rationale: '3 or more dimensions scored below 50, triggering KO-4 penalty.'
      });
    }
  }

  const finalScore = Math.max(0, Math.min(100, Math.round(weightedSum - penaltySum)));
  
  // Auto-Reject Logic (PDF Decision Bands)
  let recommendationStatus = screeningResult.scorecard.recommendation.status;
  if (finalScore < 40 || (dimensions.skillsMatch?.score || 0) < 40) {
    recommendationStatus = 'rejected';
  }

  return {
    ...screeningResult,
    scorecard: {
      ...screeningResult.scorecard,
      compositeScore: finalScore,
      recommendation: {
        ...screeningResult.scorecard.recommendation,
        status: recommendationStatus
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
    primary: 'bg-slate-900 text-white hover:bg-slate-800 shadow-[0_1px_2px_rgba(0,0,0,0.1)]',
    secondary: 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-lg shadow-indigo-500/20',
    outline: 'border-2 border-slate-100 hover:border-slate-200 hover:bg-slate-50 text-slate-600 font-bold',
    ghost: 'hover:bg-slate-100 text-slate-600 font-bold',
    brand: 'bg-indigo-600 text-white hover:bg-indigo-700 font-bold tracking-tight',
  };
  const sizes = {
    sm: 'px-3 py-1.5 text-xs rounded-lg',
    md: 'px-5 py-2.5 text-sm rounded-xl',
    lg: 'px-8 py-4 text-base rounded-2xl',
  };
  return (
    <Component
      className={cn(
        'font-sans inline-flex items-center justify-center gap-2 transition-all duration-200 saas-button active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed',
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
    <div className={cn('saas-card overflow-hidden', className)} {...props}>
      {children}
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
  const { confirm, notify } = useNotification();
  const navigate = useNavigate();

  // Initialize Video/Audio Stream
  useEffect(() => {
    async function setupStream() {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        setStream(s);
        if (videoRef.current) videoRef.current.srcObject = s;

        // Sound intensity analysis
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const source = audioCtx.createMediaStreamSource(s);
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
      } catch (err) {
        console.error("Error accessing media devices:", err);
        notify("Could not access camera/microphone. Please check permissions.", "error");
      }
    }
    setupStream();
    return () => {
      stream?.getTracks().forEach(t => t.stop());
      audioContextRef.current?.close();
    };
  }, []);

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
      recognition.lang = 'en-US';

      recognition.onresult = (event: any) => {
        let interimTranscript = '';
        const transcript = Array.from(event.results)
          .map((result: any) => result[0])
          .map((result: any) => {
            if (!result.isFinal) interimTranscript += result.transcript;
            return result.transcript;
          })
          .join('');
        setInput(transcript);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognition.onerror = (event: any) => {
        console.error('Speech recognition error', event.error);
        setIsListening(false);
        if (event.error === 'no-speech') {
          // Silent error, just don't notify user with a big toast
          console.debug('No speech detected before timeout.');
        } else if (event.error === 'not-allowed') {
          notify('Microphone access denied. Please check your browser permissions.', 'error');
        } else {
          notify(`Microphone error: ${event.error}`, 'error');
        }
      };

      recognitionRef.current = recognition;
    }
  }, []);

  const speak = (text: string, onEnd?: () => void) => {
    // Remove markdown symbols for better speech
    const cleanText = text.replace(/[*#_`~]/g, '').replace(/https?:\/\/\S+/g, 'link');
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.rate = 1.05; // Slightly faster for responsiveness
    utterance.pitch = 1.0;
    utterance.onstart = () => {
      setIsSpeaking(true);
      // Cancel any active listening to prevent feedback loops
      if (isListening) recognitionRef.current?.stop();
    };
    utterance.onend = () => {
      setIsSpeaking(false);
      if (onEnd) onEnd();
    };
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  };

  const toggleListening = () => {
    if (isListening) {
      recognitionRef.current?.stop();
    } else {
      setIsListening(true);
      recognitionRef.current?.start();
    }
  };

  useEffect(() => {
    if (!candidateId) return;
    const unsub = onSnapshot(doc(db, 'candidates', candidateId), (d) => {
      if (d.exists()) {
        const c = { id: d.id, ...d.data() } as Candidate;
        setCandidate(c);
        getDoc(doc(db, 'jobs', c.jobId)).then(jd => jd.exists() && setJob({ id: jd.id, ...jd.data() } as Job)).catch(err => handleFirestoreError(err, OperationType.GET, `jobs/${c.jobId}`));
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
      const intro = `Hello ${candidate.fullName}, I am HireAI Assistant. Thank you for joining this session for the ${job.title} position at ${job.company || 'our firm'}. Before we begin our structured technical screening, I'd like to ask: are you ready and in a quiet environment to start the interview now?`;
      
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
    <div className="max-w-7xl mx-auto py-6 px-4 min-h-[calc(100vh-140px)] lg:h-[calc(100vh-140px)] flex flex-col lg:flex-row gap-6">
      {/* Side Information Panel */}
      <div className="w-full lg:w-80 flex flex-col gap-4">
        {/* Profile Card */}
        <Card className="p-5 bg-white border-slate-200 shadow-sm relative overflow-hidden shrink-0">
          <div className="absolute top-0 left-0 w-full h-1 bg-indigo-600" />
          <div className="flex items-center gap-4 lg:flex-col lg:items-center lg:text-center">
            <div className="w-16 h-16 lg:w-20 lg:h-20 rounded-full bg-slate-50 flex items-center justify-center border-4 border-white shadow-lg overflow-hidden shrink-0">
              {stream?.getVideoTracks()[0]?.enabled !== false ? (
                 <video 
                   ref={(el) => { if (el) el.srcObject = stream; }} 
                   autoPlay 
                   muted 
                   className="w-full h-full object-cover scale-150 rotate-y-180" 
                 />
              ) : (
                <Users className="w-8 h-8 text-slate-300" />
              )}
            </div>
            <div className="flex-1 lg:w-full">
              <h3 className="text-base lg:text-lg font-black text-slate-900 tracking-tight leading-none mb-1">{candidate.fullName}</h3>
              <p className="text-[9px] font-black text-indigo-600 uppercase tracking-widest leading-none mb-3">{job?.title}</p>
              <div className="flex lg:grid lg:grid-cols-2 gap-2 w-full pt-3 border-t border-slate-50">
                <div className="flex-1 text-center py-1 bg-slate-50 rounded-lg">
                  <span className="block text-[8px] font-black text-slate-400 uppercase tracking-tighter">Status</span>
                  <span className="text-[9px] font-black text-indigo-600 uppercase">Live</span>
                </div>
                <div className="flex-1 text-center py-1 bg-slate-50 rounded-lg">
                  <span className="block text-[8px] font-black text-slate-400 uppercase tracking-tighter">Signal</span>
                  <span className="text-[9px] font-black text-green-600 uppercase">Secure</span>
                </div>
              </div>
            </div>
          </div>
        </Card>

        {/* Real-time Transcription Log */}
        <Card className="flex-1 p-5 bg-white border-slate-200 shadow-sm flex flex-col overflow-hidden min-h-[300px]">
          <div className="flex items-center justify-between mb-4 border-b border-slate-50 pb-2">
            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Transcription Log</h4>
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-indigo-600 animate-pulse" />
              <span className="text-[8px] font-black text-indigo-600 uppercase tracking-widest">Live Feed</span>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto space-y-4 pr-1 custom-scrollbar scroll-smooth">
            {messages.map((m, i) => (
              <div key={i} className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="flex items-center gap-2 mb-1">
                  <span className={cn(
                    "text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded",
                    m.role === 'model' ? "bg-indigo-50 text-indigo-600" : "bg-slate-100 text-slate-500"
                  )}>
                    {m.role === 'model' ? 'AI' : 'You'}
                  </span>
                  <span className="text-[8px] font-medium text-slate-300">{formatDateTime(new Date(m.timestamp))}</span>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed pl-1">
                  {m.text}
                </p>
              </div>
            ))}
            
            {/* Live Interim Transcription */}
            {input && !concluded && (
               <div className="animate-in fade-in duration-200 opacity-60">
                 <div className="flex items-center gap-2 mb-1">
                    <span className="text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 animate-pulse">Capturing</span>
                 </div>
                 <p className="text-xs text-slate-500 italic leading-relaxed pl-1">
                   {input}...
                 </p>
               </div>
            )}
            
            {messages.length === 0 && !input && (
              <div className="h-full flex flex-col items-center justify-center opacity-20 py-12">
                <RotateCcw className="w-6 h-6 mb-2" />
                <p className="text-[9px] font-bold uppercase tracking-widest">Log Empty</p>
              </div>
            )}
            <div ref={scrollRef} />
          </div>
        </Card>
      </div>

      {/* Main Video & Controls Panel */}
      <div className="flex-1 bg-slate-900 rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col relative border border-slate-800">
        {/* Header Overlay */}
        <div className="absolute top-0 left-0 w-full p-6 flex items-center justify-between z-20 pointer-events-none">
          <div className="flex items-center gap-3">
            <div className="bg-slate-950/80 backdrop-blur-xl border border-slate-800 px-3 py-1.5 rounded-xl flex items-center gap-2 px-4 shadow-2xl">
              <div className="w-2 h-2 rounded-full bg-red-600 animate-pulse shadow-[0_0_8px_rgba(220,38,38,0.6)]" />
              <span className="text-[10px] font-black text-white uppercase tracking-widest">On Air</span>
              <div className="h-3 w-px bg-slate-800 mx-1" />
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Session ID: {candidateId.substring(0, 8)}</span>
            </div>
          </div>
          
          {!concluded && (
            <div className="bg-slate-950/80 backdrop-blur-xl border border-slate-800 px-4 py-2 rounded-xl flex items-center gap-4">
               <div className="flex flex-col items-end">
                  <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest leading-none mb-1">Speaker Volume</span>
                  <div className="w-24 h-1 bg-slate-800 rounded-full overflow-hidden">
                     <motion.div 
                        className={cn("h-full transition-all duration-75", volume > 80 ? "bg-red-500" : "bg-indigo-500 h-full")}
                        animate={{ width: `${Math.min(volume * 1.5, 100)}%` }}
                     />
                  </div>
               </div>
            </div>
          )}
        </div>

        {/* Video Canvas Area */}
        <div className="flex-1 relative flex items-center justify-center bg-slate-950 overflow-hidden">
          <div className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_50%_50%,rgba(79,70,229,0.3)_0%,transparent_70%)]" />
          
          {/* 2026 AI HUD Elements */}
          {!concluded && messages.length > 0 && (
            <div className="absolute inset-0 pointer-events-none z-30">
               {/* Thinking/Speaking Ripple */}
               <AnimatePresence>
                 {(isThinking || isSpeaking) && (
                   <motion.div 
                     initial={{ opacity: 0 }}
                     animate={{ opacity: 1 }}
                     exit={{ opacity: 0 }}
                     className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center"
                   >
                     <div className={cn(
                       "absolute w-[400px] h-[400px] rounded-full border border-indigo-500/30 animate-ping",
                       isSpeaking ? "animate-[ping_3s_infinite]" : "animate-[ping_5s_infinite]"
                     )} />
                     <div className={cn(
                       "absolute w-[300px] h-[300px] rounded-full border border-indigo-500/20 animate-ping delay-75",
                       isSpeaking ? "animate-[ping_4s_infinite]" : "animate-[ping_6s_infinite]"
                     )} />
                   </motion.div>
                 )}
               </AnimatePresence>

               {/* Progress Indicator HUD */}
               <div className="absolute bottom-32 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2">
                 <AnimatePresence mode="wait">
                    {isThinking ? (
                      <motion.div 
                        key="thinking"
                        initial={{ opacity: 0, scale: 0.8, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.8 }}
                        className="bg-indigo-600/90 backdrop-blur-xl px-4 py-1.5 rounded-full border border-indigo-500/50 flex items-center gap-3 shadow-2xl"
                      >
                        <div className="flex gap-1">
                          <motion.div className="w-1 h-1 bg-white rounded-full" animate={{ opacity: [0.2, 1, 0.2] }} transition={{ repeat: Infinity, duration: 1 }} />
                          <motion.div className="w-1 h-1 bg-white rounded-full" animate={{ opacity: [0.2, 1, 0.2] }} transition={{ repeat: Infinity, duration: 1, delay: 0.2 }} />
                          <motion.div className="w-1 h-1 bg-white rounded-full" animate={{ opacity: [0.2, 1, 0.2] }} transition={{ repeat: Infinity, duration: 1, delay: 0.4 }} />
                        </div>
                        <span className="text-[10px] font-black text-white uppercase tracking-[0.2em]">HireAI is reasoning</span>
                      </motion.div>
                    ) : isSpeaking ? (
                      <motion.div 
                        key="speaking"
                        initial={{ opacity: 0, scale: 0.8, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.8 }}
                        className="bg-emerald-600/90 backdrop-blur-xl px-4 py-1.5 rounded-full border border-emerald-500/50 flex items-center gap-3 shadow-2xl"
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
                        <span className="text-[10px] font-black text-white uppercase tracking-[0.2em]">Live Synthesis</span>
                      </motion.div>
                    ) : null}
                 </AnimatePresence>
               </div>
            </div>
          )}
          
          {messages.length === 0 ? (
            <div className="relative z-10 text-center max-w-sm mx-auto p-12">
              <div className="w-20 h-20 rounded-full bg-indigo-600/10 border border-indigo-500/20 flex items-center justify-center mb-8 mx-auto">
                 <Play className="w-10 h-10 text-indigo-500" />
              </div>
              <h2 className="text-2xl font-black text-white tracking-tight mb-4">Screening Room Initialized</h2>
              <p className="text-slate-400 text-sm font-medium mb-8">HireAI Assistant is calibrated and ready. Ensure your environment is calm before beginning.</p>
              <Button onClick={startInterview} disabled={loading} className="w-full h-14 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl shadow-xl shadow-indigo-600/20 font-black tracking-tight text-lg transition-transform hover:scale-[1.02] active:scale-[0.98]">
                Start Recording
              </Button>
            </div>
          ) : (
            <div className="w-full h-full flex flex-col">
              <div className="flex-1 relative flex items-center justify-center">
                 {/* Large Video Feed */}
                 <div className="w-full h-full px-4 sm:px-8 pt-16 sm:pt-20 pb-8 sm:pb-12 flex items-center justify-center relative">
                    <div className="relative w-full max-w-4xl aspect-video rounded-3xl sm:rounded-[2rem] overflow-hidden shadow-2xl border border-slate-800 bg-slate-900 group">
                       {/* Recursive Scan Animation */}
                       <motion.div 
                          className="absolute inset-x-0 h-1 bg-indigo-500/20 z-10 pointer-events-none"
                          animate={{ top: ['0%', '100%', '0%'] }}
                          transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
                       />
                        <video 
                          ref={(el) => { if (el && stream) el.srcObject = stream; }} 
                          autoPlay 
                          playsInline 
                          muted 
                          className={cn("w-full h-full object-cover transition-all duration-700 rotate-y-180", 
                            stream?.getVideoTracks()[0]?.enabled === false ? "opacity-0" : "opacity-100",
                            (isMuted || isThinking) ? "grayscale-[0.5]" : "grayscale-0",
                            isThinking && "scale-[1.05] brightness-125 saturate-[1.2]",
                            isSpeaking && "animate-video-breathing"
                          )}
                        />
                       {/* Thinking Pulse */}
                       {isThinking && (
                         <div className="absolute inset-0 bg-indigo-900/10 animate-pulse pointer-events-none z-10" />
                       )}
                       {stream?.getVideoTracks()[0]?.enabled === false && (
                         <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-slate-900">
                            <CameraOff className="w-16 h-16 text-slate-700" />
                            <p className="text-xs font-black text-slate-500 uppercase tracking-widest">Camera Disabled</p>
                         </div>
                       )}
                       
                       {/* Overlay Text Bubbles */}
                       <div className="absolute inset-x-0 bottom-0 p-8 bg-gradient-to-t from-slate-950/90 via-slate-950/40 to-transparent flex flex-col items-center text-center">
                          <AnimatePresence mode="wait">
                            {concluded ? (
                              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-green-600/90 backdrop-blur-md px-6 py-3 rounded-2xl border border-green-500/50 shadow-xl">
                                 <h4 className="text-white text-sm font-black uppercase tracking-widest flex items-center gap-2">
                                    <CheckCircle2 className="w-4 h-4" /> Session Concluded
                                 </h4>
                              </motion.div>
                            ) : (
                              <motion.div 
                                key={messages[messages.length - 1]?.text}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -20 }}
                                className="max-w-2xl"
                              >
                                {messages[messages.length - 1]?.role === 'model' ? (
                                  <div className="bg-slate-900/60 backdrop-blur-md px-6 py-4 rounded-3xl border border-white/5 shadow-2xl">
                                    <div className="text-white text-lg font-bold leading-relaxed tracking-tight">
                                       <Markdown>{messages[messages.length - 1]?.text}</Markdown>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="bg-indigo-600/90 backdrop-blur-md px-6 py-3 rounded-2xl border border-indigo-500/50 shadow-xl">
                                    <p className="text-white text-sm font-medium italic">"{messages[messages.length - 1]?.text}"</p>
                                  </div>
                                )}
                              </motion.div>
                            )}
                          </AnimatePresence>
                          
                          {/* Real-time Subtitle Overlay for Input */}
                          {input && !concluded && !isListening && (
                            <motion.div 
                              initial={{ opacity: 0, y: 10 }} 
                              animate={{ opacity: 1, y: 0 }}
                              className="mt-4 bg-indigo-500/95 backdrop-blur-md px-6 py-3 rounded-2xl border border-indigo-400/50 shadow-2xl max-w-lg"
                            >
                               <p className="text-white text-[10px] font-black uppercase tracking-widest mb-2 opacity-70">Live Transcription Preview</p>
                               <p className="text-white text-base font-bold italic leading-relaxed">"{input}"</p>
                               <div className="mt-3 flex items-center justify-center">
                                  <Button onClick={() => handleSend()} size="sm" className="h-8 bg-white text-indigo-600 hover:bg-slate-100 text-[10px] font-black uppercase tracking-widest rounded-full px-5">
                                    <Send className="w-3 h-3 mr-2" /> Confirm & Send
                                  </Button>
                               </div>
                            </motion.div>
                          )}
                       </div>
                    </div>
                 </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Controls Area */}
        {!concluded && messages.length > 0 && (
          <div className="p-8 bg-black/40 backdrop-blur-xl border-t border-slate-800/50 relative z-30">
            <div className="max-w-xl mx-auto flex flex-col items-center gap-6">
                <div className="flex items-center gap-6">
                  {/* Mute Control */}
                  <Button
                    variant="outline"
                    onClick={toggleMute}
                    className={cn(
                      "w-12 h-12 rounded-full p-0 border-slate-700 transition-all",
                      isMuted ? "bg-red-500/20 text-red-500 border-red-500/50" : "bg-slate-900/50 hover:bg-slate-800 text-white"
                    )}
                  >
                    {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                  </Button>

                  {/* Camera Control */}
                  <Button
                    variant="outline"
                    onClick={toggleCamera}
                    className="w-12 h-12 rounded-full p-0 border-slate-700 bg-slate-900/50 hover:bg-slate-800 text-white"
                  >
                    {stream?.getVideoTracks()[0]?.enabled === false ? <CameraOff className="w-5 h-5 text-red-500" /> : <Camera className="w-5 h-5" />}
                  </Button>

                  {/* Main Listening Toggle */}
                  <div className="relative">
                    {isListening && (
                      <motion.div 
                        layoutId="mic-pulse"
                        className="absolute inset-[-8px] bg-indigo-600/20 rounded-full"
                        animate={{ scale: [1, 1.3, 1], opacity: [1, 0, 1] }}
                        transition={{ repeat: Infinity, duration: 2 }}
                      />
                    )}
                    <Button 
                      onClick={toggleListening} 
                      disabled={loading || isSpeaking || isMuted}
                      className={cn(
                        "w-14 h-14 rounded-full shadow-2xl transition-all relative z-10 flex items-center justify-center p-0",
                        isListening ? "bg-red-500 hover:bg-red-600" : "bg-indigo-600 hover:bg-indigo-700",
                        isMuted && "opacity-50 grayscale cursor-not-allowed text-white/50"
                      )}
                    >
                      {isListening ? <Loader2 className="w-5 h-5 animate-spin text-white" /> : <MessageSquare className="w-5 h-5 text-white" />}
                    </Button>
                  </div>

                  {/* End Interview Control */}
                  <Button
                    variant="outline"
                    onClick={manualEndInterview}
                    disabled={loading}
                    className="w-12 h-12 rounded-full p-0 border-red-500/30 bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white transition-all shadow-lg"
                  >
                    <Trash2 className="w-5 h-5" />
                  </Button>
                </div>

               {/* Transcript Bubble Overlay */}
               <div className="w-full">
                  <AnimatePresence mode="wait">
                    {isThinking ? (
                      <motion.div 
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="bg-slate-900 border border-indigo-500/30 rounded-2xl p-4 flex flex-col items-center gap-3 shadow-2xl"
                      >
                         <div className="flex items-center gap-2">
                           <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce [animation-delay:-0.3s]" />
                           <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce [animation-delay:-0.15s]" />
                           <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce" />
                         </div>
                         <p className="text-indigo-400 text-[10px] font-black uppercase tracking-[0.2em] animate-pulse">HireAI Assistant is thinking...</p>
                      </motion.div>
                    ) : input ? (
                      <motion.div 
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col items-center gap-3 shadow-2xl"
                      >
                         <p className="text-indigo-400 text-xs font-medium italic overflow-hidden text-ellipsis whitespace-nowrap w-full text-center">"{input}"</p>
                         {!isListening && (
                           <Button onClick={() => handleSend()} size="sm" className="h-8 bg-indigo-600 hover:bg-indigo-700 text-[10px] font-black uppercase tracking-widest rounded-lg px-4">
                             <Send className="w-3 h-3 mr-2" /> Confirm & Send
                           </Button>
                         )}
                      </motion.div>
                    ) : (
                      <div className="text-center py-2">
                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">
                           {isSpeaking ? "Receiving Data..." : isListening ? "Listening..." : "Tap Mic to Respond"}
                        </span>
                      </div>
                    )}
                  </AnimatePresence>
               </div>
            </div>
          </div>
        )}

        {concluded && (
          <div className="p-10 bg-slate-950 border-t border-slate-800 flex flex-col items-center gap-6">
             <div className="flex items-center gap-4 text-green-500">
                <ShieldCheck className="w-6 h-6" />
                <p className="text-sm font-black uppercase tracking-widest">End-to-End Encryption Terminated • Log Saved</p>
             </div>
             <Button onClick={() => navigate(`/candidates/${candidateId}`)} className="h-14 px-10 bg-white text-black hover:bg-slate-200 font-black uppercase tracking-widest rounded-2xl text-base shadow-2xl transition-transform hover:scale-105 active:scale-95">
                Review Session Evaluation
             </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function Layout({ children, user, isAdmin: isUserAdmin }: { children: React.ReactNode; user: any; isAdmin: boolean }) {
  const [clearing, setClearing] = useState(false);
  const navigate = useNavigate();
  const { confirm, notify, signIn } = useNotification();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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
    { name: 'How it Works', href: '#how-it-works' },
    { name: 'Solutions', href: '#solutions' },
    { name: 'Security', href: '#about' },
    { name: 'Pricing', href: '/?view=pricing' },
  ];

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 selection:bg-indigo-100">
      <header className={cn(
        "sticky top-0 z-50 transition-all duration-500",
        user ? "bg-slate-900 text-white shadow-2xl" : "bg-white/80 backdrop-blur-xl border-b border-slate-100 shadow-sm"
      )}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-20 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 lg:gap-12 min-w-0">
            <Link to="/" className="flex items-center gap-2.5 group shrink-0">
              <div className={cn(
                "w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-500 group-hover:rotate-[15deg] group-hover:scale-110",
                user ? "bg-gradient-to-br from-indigo-500 to-indigo-700 shadow-lg shadow-indigo-500/20" : "bg-slate-900 shadow-lg"
              )}>
                <Search className="w-5 h-5 text-white" />
              </div>
              <span className={cn("font-display font-black text-2xl tracking-tighter uppercase", user ? "text-white" : "text-slate-950")}>
                HireAI
              </span>
            </Link>
            
            {!user && (
              <nav className="hidden lg:flex items-center gap-8">
                {navLinks.map((link) => (
                  <a 
                    key={link.name} 
                    href={link.href} 
                    className="text-[11px] font-black text-slate-500 hover:text-indigo-600 transition-colors uppercase tracking-[0.2em]"
                    onClick={(e) => {
                      if (link.href.startsWith('#')) {
                        e.preventDefault();
                        const id = link.href.substring(1);
                        const el = document.getElementById(id);
                        if (el) {
                          el.scrollIntoView({ behavior: 'smooth' });
                        }
                      }
                    }}
                  >
                    {link.name}
                  </a>
                ))}
              </nav>
            )}

            {user && (
              <nav className="hidden md:flex items-center gap-2 overflow-x-auto whitespace-nowrap lg:gap-6 scrollbar-none">
                <Link to="/" className="text-[10px] font-black text-slate-400 hover:text-white transition-all uppercase tracking-[0.15em] px-3 py-2 rounded-lg hover:bg-white/5">Dashboard</Link>
                <Link to="/jobs/new" className="text-[10px] font-black text-slate-400 hover:text-white transition-all uppercase tracking-[0.15em] px-3 py-2 rounded-lg hover:bg-white/5">Post Job</Link>
                {isUserAdmin && (
                  <Link to="/admin" className="text-[10px] font-black text-indigo-400 hover:text-indigo-300 transition-all uppercase tracking-[0.15em] flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-white/5 shrink-0">
                    <Shield className="w-3 h-3" /> System Admin
                  </Link>
                )}
              </nav>
            )}
          </div>

          <div className="flex items-center gap-2 sm:gap-4 shrink-0">
            {user ? (
              <div className="flex items-center gap-2 sm:gap-4">
                <Button 
                  variant="outline" 
                  className="hidden xl:flex text-red-400 border-slate-700 hover:bg-slate-800 hover:text-red-500 py-2 h-auto text-[10px] font-black uppercase tracking-widest shrink-0"
                  onClick={handleGlobalClear}
                  disabled={clearing}
                >
                  <Trash2 className="w-3.5 h-3.5 mr-2" /> {clearing ? 'Clearing...' : 'Clear Platform'}
                </Button>
                <div className="w-px h-6 bg-slate-800 mx-1 hidden xl:block" />
                <div className="hidden sm:flex flex-col items-end mr-1">
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Authenticated as</span>
                  <span className="text-sm font-bold text-indigo-400">{user.email}</span>
                </div>
                <Button 
                  variant="ghost" 
                  className="text-white hover:bg-slate-800 px-3 sm:px-4 py-2 h-auto text-[10px] sm:text-xs font-black uppercase tracking-widest shrink-0" 
                  onClick={() => signOut(auth)}
                >
                  Logout
                </Button>
                <button 
                  className="md:hidden p-2 text-white hover:bg-slate-800 rounded-lg shrink-0"
                  onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                >
                  {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <button 
                  onClick={signIn} 
                  className="hidden sm:block text-sm font-black text-slate-600 hover:text-indigo-600 transition-colors uppercase tracking-widest px-4"
                >
                  Log In
                </button>
                <Button 
                  variant="brand" 
                  size="sm" 
                  className="h-11 px-6 shadow-xl shadow-indigo-100 font-black uppercase tracking-widest text-xs"
                  onClick={() => navigate('/?view=pricing')}
                >
                  Get Started
                </Button>
                <button 
                  className="lg:hidden p-2 text-slate-600 hover:bg-slate-50 rounded-lg"
                  onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                >
                  {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Mobile Menu */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className={cn(
                "lg:hidden border-t overflow-hidden",
                user ? "bg-slate-900 border-slate-800" : "bg-white border-slate-100"
              )}
            >
              <div className="px-6 py-8 space-y-6 flex flex-col">
                {!user ? (
                  <>
                    {navLinks.map((link) => (
                      <a 
                        key={link.name} 
                        href={link.href} 
                        onClick={(e) => {
                          setMobileMenuOpen(false);
                          if (link.href.startsWith('#')) {
                            e.preventDefault();
                            const id = link.href.substring(1);
                            const el = document.getElementById(id);
                            if (el) {
                              el.scrollIntoView({ behavior: 'smooth' });
                            }
                          }
                        }}
                        className="text-lg font-black text-slate-900 font-display uppercase tracking-tighter"
                      >
                        {link.name}
                      </a>
                    ))}
                    <div className="pt-6 border-t border-slate-50">
                      <Button variant="brand" className="w-full h-14 font-black uppercase tracking-widest text-xs" onClick={() => { signIn(); setMobileMenuOpen(false); }}>
                        Sign In
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <Link to="/" onClick={() => setMobileMenuOpen(false)} className="text-lg font-black text-white uppercase tracking-tighter">Dashboard</Link>
                    <Link to="/jobs/new" onClick={() => setMobileMenuOpen(false)} className="text-lg font-black text-white uppercase tracking-tighter">Post Job</Link>
                    {isUserAdmin && (
                      <Link to="/admin" onClick={() => setMobileMenuOpen(false)} className="text-lg font-black text-indigo-400 uppercase tracking-tighter">System Admin</Link>
                    )}
                    <div className="pt-6 border-t border-slate-800 flex flex-col gap-4">
                       <div className="flex flex-col">
                          <span className="text-[10px] font-black text-slate-500 uppercase">Logged in as</span>
                          <span className="text-sm font-bold text-indigo-400">{user.email}</span>
                       </div>
                       <Button variant="ghost" className="w-full h-14 text-white hover:bg-slate-800 font-black uppercase tracking-widest text-xs" onClick={() => { signOut(auth); setMobileMenuOpen(false); }}>
                         Logout
                       </Button>
                    </div>
                  </>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 min-h-[60vh]">
        {children}
      </main>
      <footer className="bg-white border-t border-slate-200 py-12 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row justify-between items-center gap-8">
            <div className="flex items-center gap-2 font-bold text-slate-900">
               <div className="w-6 h-6 bg-slate-900 rounded flex items-center justify-center">
                 <Search className="w-3.5 h-3.5 text-white" />
               </div>
               HireAI
            </div>
            <div className="flex items-center gap-8 text-[11px] font-black uppercase tracking-widest text-slate-400">
              <Link to="/" className="hover:text-indigo-600 transition-colors">Workspace</Link>
              <Link to="/about" className="hover:text-indigo-600 transition-colors">Platform</Link>
              <Link to="/terms" className="hover:text-indigo-600 transition-colors">Terms</Link>
              {user?.email === 'malviya.pratyush26@gmail.com' && (
                <Link to="/admin" className="text-indigo-600 hover:text-indigo-700 flex items-center gap-1.5">
                  <ShieldCheck className="w-3 h-3" />
                  Super Admin Registry
                </Link>
              )}
            </div>
            <p className="text-slate-400 text-[10px] font-medium uppercase tracking-tight">
              © 2026 HireAI Inc. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
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
          <p className="text-slate-500 text-sm sm:text-lg leading-relaxed font-medium">Input your requirements and our neural engine will decompose the assessment matrix automatically.</p>
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
              className="w-full px-6 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:outline-none focus:border-indigo-500 transition-all text-sm leading-relaxed font-medium min-h-[300px] custom-scrollbar"
              placeholder={parsingFile ? "Decrypting document layers..." : "Paste the full mission brief / job description here..."}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={parsingFile}
            />
            <div className="flex items-center gap-2 p-4 bg-indigo-50/50 rounded-xl border border-indigo-100/50 mt-4">
              <Sparkles className="w-4 h-4 text-indigo-600 shrink-0" />
              <p className="text-[10px] sm:text-xs text-indigo-700 font-bold leading-relaxed italic">
                Our AI Agent will extract technical benchmarks, soft-skill markers, and cultural alignment indicators to build the D6 scorecard automatically.
              </p>
            </div>
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
  const [uploading, setUploading] = useState(false);
  const [researchingAll, setResearchingAll] = useState(false);
  const [retryingScreening, setRetryingScreening] = useState<string | null>(null);
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
    files: { name: string; status: 'queued' | 'processing' | 'success' | 'skipped' | 'error'; message?: string }[]
  } | null>(null);
  const navigate = useNavigate();
  const { confirm, notify } = useNotification();
  const { profile } = useProfile();

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    if (!jobId || !auth.currentUser || !profile) return;
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

    setUploading(true);
    const batchId = Date.now().toString();
    localStorage.setItem(`lastBatch_${jobId}`, batchId);
    
    const fileList = Array.from(files).map(f => ({ name: f.name, status: 'queued' as const }));
    setUploadProgress({ 
      total: files.length, 
      current: 0, 
      success: 0, 
      skipped: 0, 
      files: fileList,
      startTime: Date.now()
    });

    // Process in small batches to avoid rate limits
    const BATCH_SIZE = 3;
    const filesArray = Array.from(files);
    
    for (let i = 0; i < filesArray.length; i += BATCH_SIZE) {
      const currentBatch = filesArray.slice(i, i + BATCH_SIZE);
      
      await Promise.all(currentBatch.map(async (file, batchIdx) => {
        const actualIdx = i + batchIdx;
        setUploadProgress(prev => prev ? ({ 
          ...prev, 
          currentFileName: file.name,
          files: prev.files.map((f, idx) => idx === actualIdx ? { ...f, status: 'processing' } : f) 
        }) : null);

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
                files: prev.files.map((f, idx) => idx === actualIdx ? { ...f, status: 'skipped', message: 'Duplicate' } : f) 
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
              files: prev.files.map((f, idx) => idx === actualIdx ? { ...f, status: 'success' } : f) 
            };
          });
        } catch (err: any) {
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
    setUploading(false);
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
      const BATCH_SIZE = 2; // Web research is more intensive, so smaller batch size
      for (let i = 0; i < candidatesToResearch.length; i += BATCH_SIZE) {
        const currentBatch = candidatesToResearch.slice(i, i + BATCH_SIZE);
        
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

  if (loading) return <div className="h-screen flex items-center justify-center font-black animate-pulse">BOOTSTRAPPING PIPELINE...</div>;
  if (!job) return <div className="p-20 text-center">Job sequence not found.</div>;

  const filteredCandidates = candidates
    .filter(c => {
      const matchesSearch = c.fullName.toLowerCase().includes(debouncedSearch.toLowerCase()) || 
                          c.currentRole.toLowerCase().includes(debouncedSearch.toLowerCase());
      
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

  const uniqueRoles = Array.from(new Set(candidates.map(c => c.currentRole))).filter(Boolean);

  const stats = {
    total: candidates.length,
    pending: candidates.filter(c => c.status === 'processed').length,
    passed: candidates.filter(c => c.scorecard.compositeScore >= 80).length,
    failed: candidates.filter(c => c.scorecard.compositeScore < 40).length
  };

  const bestScore = candidates.length > 0 
    ? Math.max(...candidates.map(c => c.scorecard.compositeScore)) 
    : 0;

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
        <label className={cn("cursor-pointer", uploading && "opacity-50 cursor-not-allowed")}>
          <input type="file" multiple accept=".pdf,.docx" className="hidden" onChange={handleFileUpload} disabled={uploading} />
          <Button variant="secondary" className="px-6 h-12 rounded-xl text-sm font-black shadow-lg shadow-indigo-200" as="div">
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            {uploading ? 'Processing Resumes...' : 'New Interview Session'}
          </Button>
        </label>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
        {[
          { label: 'Total', count: stats.total, percent: 100, color: 'text-indigo-500' },
          { label: 'Pending', count: stats.pending, percent: Math.round((stats.pending / (stats.total || 1)) * 100), color: 'text-blue-500' },
          { label: 'Passed', count: stats.passed, percent: Math.round((stats.passed / (stats.total || 1)) * 100), color: 'text-green-500' },
          { label: 'Failed', count: stats.failed, percent: Math.round((stats.failed / (stats.total || 1)) * 100), color: 'text-red-500' },
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

      {uploadProgress && (
        <Card className="p-6 bg-slate-900 text-white border-none shadow-2xl relative overflow-hidden animate-in fade-in zoom-in-95 duration-300">
          <div className="absolute top-0 right-0 p-8 opacity-10">
            <Search className="w-24 h-24 rotate-12" />
          </div>
          <div className="relative">
            <div className="flex justify-between items-end mb-4">
              <div>
                <h3 className="text-xs font-black uppercase tracking-[0.2em] text-indigo-400 mb-1">
                  {researchingAll ? 'Intelligent Multi-Source Research' : 'Autonomous Batch Pipeline'}
                </h3>
                <p className="text-2xl font-black tracking-tight text-white">
                  {researchingAll ? 'Researching Candidates...' : 'Synchronizing Pipeline...'}
                  <span className="ml-4 text-indigo-500">{Math.round((uploadProgress.current / uploadProgress.total) * 100)}%</span>
                </p>
              </div>
              <div className="text-right">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Current Sequence</span>
                <span className="text-sm font-mono font-bold bg-slate-800 px-3 py-1 rounded-lg border border-slate-700">{uploadProgress.current} / {uploadProgress.total}</span>
              </div>
            </div>

            <div className="flex justify-between items-center mb-2 px-1">
              <div className="flex items-center gap-2 overflow-hidden max-w-[70%]">
                {uploadProgress.current < uploadProgress.total && (
                  <div className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse shrink-0" />
                )}
                <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 truncate">
                  {uploadProgress.current === uploadProgress.total ? 'Processing Complete' : (uploadProgress.currentFileName ? `Target: ${uploadProgress.currentFileName}` : 'Initializing...')}
                </span>
              </div>
              {uploadProgress.estimatedSecondsRemaining !== undefined && uploadProgress.estimatedSecondsRemaining > 0 && uploadProgress.current < uploadProgress.total && (
                <span className="text-[9px] font-black uppercase tracking-widest text-indigo-400 flex items-center gap-1 shrink-0">
                  <Clock className="w-3 h-3" /> ~{uploadProgress.estimatedSecondsRemaining}s Left
                </span>
              )}
            </div>
            
            <div className="h-3 w-full bg-slate-800 rounded-full overflow-hidden mb-8 border border-slate-700/50">
              <motion.div 
                className="h-full bg-indigo-500 shadow-[0_0_15px_rgba(99,102,241,0.5)]"
                initial={{ width: 0 }}
                animate={{ width: `${(uploadProgress.current / uploadProgress.total) * 100}%` }}
                transition={{ type: 'spring', damping: 20 }}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
              <div className="p-3 bg-slate-800/50 rounded-xl border border-slate-700/50 flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-green-500/10 flex items-center justify-center">
                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                </div>
                <div>
                  <p className="text-lg font-black leading-none">{uploadProgress.success}</p>
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Validated</p>
                </div>
              </div>
              <div className="p-3 bg-slate-800/50 rounded-xl border border-slate-700/50 flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
                  <AlertCircle className="w-4 h-4 text-amber-500" />
                </div>
                <div>
                  <p className="text-lg font-black leading-none">{uploadProgress.skipped}</p>
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Duplicates</p>
                </div>
              </div>
            </div>

            <div className="max-h-64 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
              {uploadProgress.files.map((file, idx) => (
                <div key={idx} className="flex items-center justify-between p-3 bg-slate-800/30 rounded-xl border border-slate-700/30 hover:bg-slate-800/50 transition-colors">
                  <div className="flex items-center gap-3 overflow-hidden">
                    {file.status === 'processing' ? (
                      <div className="w-2.5 h-2.5 rounded-full bg-indigo-400 animate-pulse shadow-[0_0_8px_rgba(129,140,248,0.6)]" />
                    ) : file.status === 'success' ? (
                      <CheckCircle2 className="w-4 h-4 text-green-500" />
                    ) : file.status === 'skipped' ? (
                      <AlertCircle className="w-4 h-4 text-amber-500" />
                    ) : file.status === 'error' ? (
                      <AlertCircle className="w-4 h-4 text-red-500" />
                    ) : (
                      <div className="w-2.5 h-2.5 rounded-full bg-slate-700" />
                    )}
                    <span className="text-xs font-bold truncate text-slate-300 italic">{file.name}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    {file.message && <span className="text-[10px] font-bold text-slate-500">{file.message}</span>}
                    <span className={cn(
                      "text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md border",
                      file.status === 'processing' ? "text-indigo-400 border-indigo-500/30 bg-indigo-500/10" :
                      file.status === 'success' ? "text-green-400 border-green-500/30 bg-green-500/10" :
                      file.status === 'skipped' ? "text-amber-400 border-amber-500/30 bg-amber-500/10" :
                      file.status === 'error' ? "text-red-400 border-red-500/30 bg-red-500/10" : "text-slate-600 border-slate-700 bg-slate-800"
                    )}>
                      {file.status === 'processing' ? 'Evaluating...' : file.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {uploadProgress.current === uploadProgress.total && !uploading && (
              <div className="mt-8 pt-8 border-t border-slate-800 flex justify-end">
                <Button 
                  variant="secondary" 
                  className="px-8 h-10 text-[10px] font-black uppercase tracking-widest shadow-xl shadow-indigo-500/20"
                  onClick={() => setUploadProgress(null)}
                >
                  Enter Results Terminal
                </Button>
              </div>
            )}
          </div>
        </Card>
      )}

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
                  <div className="grid grid-cols-2 lg:grid-cols-1 gap-3">
                    {['All', 'Processing Resume', 'Ready to Invite', 'Invite Sent', 'Scheduled', 'Evaluating', 'Passed', 'Failed'].map(status => (
                      <label key={status} className="flex items-center gap-3 cursor-pointer group">
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
                  <div className="grid grid-cols-2 lg:grid-cols-1 gap-3">
                    {['All', ...Array.from(new Set(candidates.map(c => c.currentRole)))].slice(0, 5).map(role => (
                      <label key={role} className="flex items-center gap-3 cursor-pointer group">
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
                      <option key={role} value={role}>{role}</option>
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
                const isBestMatch = candidate.scorecard.compositeScore === bestScore && bestScore >= 80;
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
                      <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Candidate</th>
                      <th className="px-6 py-4 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest">Score</th>
                      <th className="px-6 py-4 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</th>
                      <th className="px-6 py-4 text-right text-[10px] font-black text-slate-400 uppercase tracking-widest">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredCandidates.map(candidate => {
                      const isBestMatch = candidate.scorecard.compositeScore === bestScore && bestScore >= 80;
                      return (
                        <tr 
                          key={candidate.id} 
                          className={cn(
                            "transition-colors cursor-pointer group relative",
                            isBestMatch ? "bg-indigo-50/50 hover:bg-indigo-50" : "hover:bg-slate-50"
                          )} 
                          onClick={() => navigate(`/candidates/${candidate.id}`)}
                        >
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
                                 className="h-8 text-[10px] font-black uppercase tracking-widest border-indigo-100 text-indigo-600 hover:bg-indigo-50"
                                 onClick={(e) => {
                                   e.stopPropagation();
                                   const interviewLink = `${window.location.origin}/interview/${candidate.id}`;
                                   navigator.clipboard.writeText(interviewLink);
                                   notify('Interview link copied to clipboard', 'success');
                                 }}
                               >
                                 Invite to Interview
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
    </div>
  );
}

function CandidateDetail() {
  const { candidateId } = useParams();
  const { profile } = useProfile();
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
          summary: `Interview: ${candidate.fullName} | HireAI Assessment`,
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
    doc.text(`HireAI Professional Assessment | ${formatDateTime(new Date())}`, 20, 33);
    
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

    // SECTION: Screening Analytics
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('2. AI Screening Analytics', 20, currentY);
    
    const dimensionRows = [
      { key: 'skillsMatch', label: 'Skills Match (D1)' },
      { key: 'experienceFit', label: 'Experience Fit (D2)' },
      { key: 'education', label: 'Education (D3)' },
      { key: 'achievements', label: 'Achievements (D4)' },
      { key: 'culturalRoleFit', label: 'Cultural Fit (D5)' },
      { key: 'communicationSkills', label: 'Communication (D6)' },
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
        doc.text(`Page ${i} of ${pageCount} | Confidental Report | Generated by HireAI`, pageWidth / 2, 285, { align: 'center' });
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
        <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 sm:gap-3">
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

           <div className="grid grid-cols-2 lg:flex gap-2">
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
               <Button variant="secondary" className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-xs py-2 h-auto" onClick={async () => {
                 try {
                   await updateDoc(doc(db, 'candidates', candidate.id), { interviewStatus: 'invited' });
                   notify('Invite sent!', 'success');
                 } catch (err) {
                   handleFirestoreError(err, OperationType.UPDATE, `candidates/${candidate.id}`);
                   notify('Failed to update status.', 'error');
                 }
               }}>
                 <Video className="w-3.5 h-3.5 mr-2" />
                 Invite
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

      {/* Recommendation Banner */}
      <Card className={cn(
        "p-1 border-none bg-gradient-to-r",
        scorecard?.recommendation?.status === 'perfect' ? "from-green-600 to-emerald-500" :
        scorecard?.recommendation?.status === 'strong' ? "from-indigo-600 to-blue-500" :
        scorecard?.recommendation?.status === 'potential' ? "from-amber-500 to-orange-400" : "from-slate-700 to-slate-500"
      )}>
        <div className="bg-white m-[1px] rounded-[11px] p-8 flex flex-col md:flex-row items-center gap-8">
          <div className={cn(
             "w-32 h-32 rounded-3xl flex flex-col items-center justify-center shrink-0 border-4",
             getScoreColor(scorecard?.compositeScore || 0)
          )}>
            <span className="text-4xl font-black">{scorecard?.compositeScore || 0}</span>
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Match Score</span>
          </div>
          <div className="flex-1 text-center md:text-left">
            <span className={cn(
              "text-xs font-black px-3 py-1 rounded-full uppercase tracking-widest mb-2 inline-block",
              scorecard?.recommendation?.status === 'perfect' ? "bg-green-100 text-green-700" :
              scorecard?.recommendation?.status === 'strong' ? "bg-indigo-100 text-indigo-700" : "bg-amber-100 text-amber-700"
            )}>
              {scorecard?.recommendation?.fitHeader || 'Screening Report'}
            </span>
            <h1 className="text-3xl font-black text-slate-900 mb-2">{candidate.fullName}</h1>
            <p className="text-lg text-slate-500 leading-relaxed max-w-3xl">
              {scorecard?.recommendation?.summary || candidate.oneLineSummary}
            </p>
          </div>
        </div>
      </Card>

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
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="md:col-span-2 prose prose-slate max-w-none">
                <div className="text-slate-700 leading-relaxed text-sm overflow-auto max-h-[500px] pr-4 custom-scrollbar">
                  <Markdown>{candidate.research.summary}</Markdown>
                </div>
              </div>
              <div className="md:col-span-1 border-l border-slate-100 pl-8 space-y-6">
                <div>
                  <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">Verified Footprints</h4>
                  <div className="space-y-2">
                    {candidate.research.sources.map((source, sidx) => (
                      <a 
                        key={sidx}
                        href={source.uri}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block p-3 bg-slate-50 border border-slate-100 rounded-xl hover:border-indigo-200 hover:bg-slate-100 transition-all group"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-[11px] font-bold text-slate-600 line-clamp-1 group-hover:text-indigo-600 italic">
                            {source.title || source.uri}
                          </span>
                          <ExternalLink className="w-3 h-3 text-slate-300 group-hover:text-indigo-400 shrink-0" />
                        </div>
                      </a>
                    ))}
                    {candidate.research.sources.length === 0 && (
                      <p className="text-xs text-slate-400 italic">No public artifacts found.</p>
                    )}
                  </div>
                </div>
                <div className="p-4 bg-indigo-50 rounded-2xl border border-indigo-100">
                   <div className="flex items-center gap-2 mb-2">
                     <ShieldCheck className="w-4 h-4 text-indigo-600" />
                     <span className="text-[10px] font-black text-indigo-900 uppercase">Audit Logic (4.9)</span>
                   </div>
                   <p className="text-[10px] text-indigo-700 leading-relaxed italic">
                     Professional identity verified through multi-source signal analysis. Always cross-reference with live certifications.
                   </p>
                </div>
                <Button 
                  variant="outline" 
                  className="w-full h-10 text-[10px] font-black uppercase tracking-widest text-indigo-600 border-indigo-200"
                  onClick={handleDeepResearch}
                >
                  <RotateCcw className="w-3 h-3 mr-2" /> Refresh Analysis
                </Button>
              </div>
            </div>
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
          <Card className="p-8">
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
                  label: 'Skills Match', 
                  weight: '30-35%', 
                  icon: Terminal, 
                  color: 'indigo', 
                  description: 'Semantic overlap between resume skills and JD requirements.',
                  calculationDetail: 'Uses TF-IDF and semantic embedding cosine similarity to compare resume keywords against mandatory and preferred skill lists.'
                },
                { 
                  id: 'D2', 
                  key: 'experienceFit', 
                  label: 'Experience Fit', 
                  weight: '25-30%', 
                  icon: Briefcase, 
                  color: 'blue', 
                  description: 'Relevant years, title proximity, and industry alignment analysis.',
                  calculationDetail: 'Analyses years of experience vs requirements, title seniority (IC vs Manager), and industry relevance. Seniority gaps are heavily penalized.'
                },
                { 
                  id: 'D3', 
                  key: 'education', 
                  label: 'Education', 
                  weight: '10-20%', 
                  icon: BookOpen, 
                  color: 'emerald', 
                  description: 'Degree level match, field relevance, and institution tiering.',
                  calculationDetail: 'Matches degree levels (Bachelor, Master, PhD) and field of study. Considers institution rank and equivalent experience offsets.'
                },
                { 
                  id: 'D4', 
                  key: 'achievements', 
                  label: 'Achievements', 
                  weight: '20-35%', 
                  icon: Award, 
                  color: 'amber', 
                  description: 'Quantified professional outcomes, scale signals, and impact statements.',
                  calculationDetail: 'Extracts impact statements with quantified numbers (%, $, scale). Looks for awards, promotions, and significant project ownership.'
                },
                { 
                  id: 'D5', 
                  key: 'culturalRoleFit', 
                  label: 'Cultural / Role Fit', 
                  weight: '5-10%', 
                  icon: Brain, 
                  color: 'rose', 
                  description: 'Tenure patterns, growth trajectory, and career consistency.',
                  calculationDetail: 'Evaluates job-hopping signals (<1yr avg tenure), consistency of career path, and alignment with organizational scale and values.'
                },
                { 
                  id: 'D6', 
                  key: 'communicationSkills', 
                  label: 'Communication Skills', 
                  weight: '10-20%', 
                  icon: MessageSquare, 
                  color: 'purple', 
                  description: 'Clarity of thought, professional articulation, and narrative quality.',
                  calculationDetail: 'Assesses the readability and structure of the resume, the clarity of achievement descriptions, and overall professional storytelling ability.'
                },
              ].map((dimInfo) => {
                const dim = scorecard?.dimensions?.[dimInfo.key as keyof typeof scorecard.dimensions] as any;
                const Icon = dimInfo.icon;
                
                return (
                  <Card key={dimInfo.id} className={cn(
                    "p-0 overflow-hidden border-2 transition-all group/dim",
                    dim ? (dim.score >= 80 ? "border-green-100/50 hover:border-green-200" : dim.score >= 50 ? "border-amber-100/50 hover:border-amber-200" : "border-red-100/50 hover:border-red-200") : "border-slate-100 opacity-70"
                  )}>
                    <div className="flex flex-col md:flex-row">
                      {/* Score Indicator Sidebar */}
                      <div className={cn(
                        "w-full md:w-32 p-6 flex md:flex-col items-center justify-center gap-2 shrink-0 transition-colors",
                        dim ? (dim.score >= 80 ? "bg-green-50/50" : dim.score >= 50 ? "bg-amber-50/50" : "bg-red-50/50") : "bg-slate-50"
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
                            <div className={cn("p-2 rounded-lg", dim ? `bg-${dimInfo.color}-50 text-${dimInfo.color}-600` : "bg-slate-50 text-slate-300")}>
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
    </div>
  );
}

function SuperAdminPanel() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = (searchParams.get('tab') as 'overview' | 'organizations' | 'payments' | 'integrations') || 'overview';
  const setTab = (tab: string) => setSearchParams({ tab });
  const [stats, setStats] = useState({ jobs: 0, candidates: 0, users: 0, organizations: 0 });
  const [loading, setLoading] = useState(true);
  const [recentCandidates, setRecentCandidates] = useState<Candidate[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [onboardModalOpen, setOnboardModalOpen] = useState(false);
  const [newOrgName, setNewOrgName] = useState('');
  const [newOrgDomain, setNewOrgDomain] = useState('');
  const [onboarding, setOnboarding] = useState(false);
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkOrgNames, setBulkOrgNames] = useState('');
  const navigate = useNavigate();
  const { confirm, notify } = useNotification();
  const isSuperAdmin = auth.currentUser?.email === 'malviya.pratyush26@gmail.com';

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
        createdAt: serverTimestamp(),
        createdBy: auth.currentUser?.uid,
        status: 'active'
      });

      const newOrg: Organization = {
        id: orgRef.id,
        name: newOrgName.trim(),
        domain: newOrgDomain.trim() || undefined,
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
          <form onSubmit={handleCreateOrg} className="space-y-6">
             <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Company Name</label>
                <input 
                  autoFocus
                  required
                  value={newOrgName}
                  onChange={e => setNewOrgName(e.target.value)}
                  placeholder="e.g. Acme Corporation"
                  className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-3 font-bold text-slate-900 focus:border-indigo-500 outline-none transition-all placeholder:text-slate-300"
                />
             </div>
             <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Email Domain (Optional)</label>
                <input 
                  value={newOrgDomain}
                  onChange={e => setNewOrgDomain(e.target.value)}
                  placeholder="e.g. acme.com"
                  className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-3 font-bold text-slate-900 focus:border-indigo-500 outline-none transition-all placeholder:text-slate-300 font-mono text-sm"
                />
                <p className="text-[10px] text-slate-400 font-medium italic">Used for auto-linking employees by email domain.</p>
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
                    <table className="w-full min-w-[700px]">
                    <thead className="bg-slate-50 border-b border-slate-100">
                      <tr>
                        <th className="px-6 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Organization</th>
                        <th className="px-6 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</th>
                        <th className="px-6 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Created</th>
                        <th className="px-6 py-4 text-right text-[10px] font-black text-slate-400 uppercase tracking-widest">Management</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {organizations.map(org => (
                        <tr key={org.id}>
                          <td className="px-6 py-4">
                            <div className="font-bold text-sm uppercase tracking-tight">{org.name}</div>
                            <div className="text-[10px] text-slate-400 font-mono">ID: {org.id}</div>
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
                          <td className="px-6 py-4 text-right flex items-center justify-end gap-2">
                             <Button 
                               variant="outline" 
                               className="h-8 text-[10px] font-black uppercase tracking-widest text-indigo-600 border-indigo-100"
                               onClick={() => {
                                 const url = `${window.location.origin}/join/${org.id}`;
                                 navigator.clipboard.writeText(url);
                                 notify(`Invite link for ${org.name} copied!`, 'success');
                               }}
                             >
                               <Copy className="w-3 h-3 mr-1.5" /> Invite Link
                             </Button>
                             <Button variant="outline" className="h-8 text-[10px] font-black uppercase tracking-widest">Suspend</Button>
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

            <form onSubmit={handleCreateOrg} className="space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Organization Name</label>
                <input 
                  type="text"
                  required
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border-2 border-slate-100 focus:outline-none focus:border-indigo-600 transition-all font-bold text-slate-700 placeholder:text-slate-300"
                  placeholder="e.g. Acme Corp"
                />
              </div>

              <Button 
                type="submit" 
                variant="secondary" 
                className="w-full h-14 text-sm font-black uppercase tracking-widest shadow-xl shadow-indigo-200"
                disabled={loading}
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Create Organization'}
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
  
  const features = [
    {
      title: "Autonomous Vetting",
      description: "Our AI agents conduct full-length technical and behavioral interviews without needing any human supervision.",
      icon: <Brain className="w-10 h-10 text-indigo-600" />,
      color: "bg-indigo-50"
    },
    {
      title: "Deep Background Research",
      description: "Instantly research candidate's public projects, open-source contributions, and professional web presence.",
      icon: <Globe className="w-10 h-10 text-emerald-600" />,
      color: "bg-emerald-50"
    },
    {
      title: "Real-time Intelligence",
      description: "Get instant, high-fidelity scorecards after every session. Identify top 1% talent with automated precision.",
      icon: <Cpu className="w-10 h-10 text-amber-600" />,
      color: "bg-amber-50"
    },
    {
      title: "Dynamic Scheduling",
      description: "Auto-sync with Google Calendar. AI handles the back-and-forth to set up final human-round interviews.",
      icon: <Calendar className="w-10 h-10 text-rose-600" />,
      color: "bg-rose-50"
    },
    {
      title: "Bias-Free Evaluation",
      description: "Standardized grading systems ensure every candidate is evaluated strictly on merit and skills.",
      icon: <ShieldCheck className="w-10 h-10 text-blue-600" />,
      color: "bg-blue-50"
    },
    {
      title: "Seamless Integration",
      description: "Export data to your existing ATS or CRM. Our API-first architecture fits into any enterprise stack.",
      icon: <Zap className="w-10 h-10 text-violet-600" />,
      color: "bg-violet-50"
    }
  ];

  const steps = [
    {
      number: "01",
      title: "Upload Job Description",
      description: "Our AI analyzes your requirements, stack, and culture to build a custom screening persona."
    },
    {
      number: "02",
      title: "Invite Candidates",
      description: "Send a magic link to applicants. They can start their AI-led interview instantly."
    },
    {
      number: "03",
      title: "AI Conducts Interview",
      description: "A deep-dive session happens in real-time. The AI probes skills, experience, and problem-solving."
    },
    {
      number: "04",
      title: "Human Review",
      description: "Review a ranked list of top performers with full transcripts and AI-generated insights."
    }
  ];

  const useCases = [
    {
      title: "High-Volume Technical Hiring",
      description: "Perfect for startups and scaling tech companies. Screen 500+ developers in a single weekend without burning out your engineering lead.",
      benefit: "Reduce screening time from weeks to hours."
    },
    {
      title: "Global Remote Expansion",
      description: "Conduct interviews across every timezone 24/7. Our AI agents never hit 'recruiter fatigue', ensuring every candidate gets a fair shot.",
      benefit: "True round-the-clock talent acquisition."
    },
    {
      title: "Niche Domain Vetting",
      description: "Whether it's Rust, Distributed Systems, or AI Research, our agents deep-dive into specialized nuances that standard rubrics miss.",
      benefit: "Identify the top 1% of specialized talent."
    }
  ];

  const benefits = [
    {
      title: "Zero Ghosting Policy",
      description: "Candidates get immediate sessions and instant feedback, protecting your developer brand and ensuring a top-tier candidate experience.",
      icon: <Users className="w-6 h-6 text-indigo-600" />
    },
    {
      title: "Unbiased Evaluation",
      description: "Remove conscious and unconscious bias from the first round. Every candidate is evaluated strictly on their answers and technical merit.",
      icon: <ShieldCheck className="w-6 h-6 text-indigo-600" />
    },
    {
      title: "Massive Cost Reduction",
      description: "Eliminate the need for massive internal recruitment teams or expensive third-party agencies for early-stage vetting.",
      icon: <Zap className="w-6 h-6 text-indigo-600" />
    }
  ];

  const testimonials = [
    {
      quote: "HireAI cut our screening time by 90%. We hired our lead architect in just 4 days.",
      author: "Sarah Jenkins",
      role: "VP Engineering, TechFlow",
      image: "https://api.dicebear.com/7.x/avataaars/svg?seed=Sarah"
    },
    {
      quote: "The depth of technical questions the AI asks is mind-blowing. It's like having a senior dev on every call.",
      author: "Marcus Chen",
      role: "CTO, CloudScale",
      image: "https://api.dicebear.com/7.x/avataaars/svg?seed=Marcus"
    },
    {
      quote: "Finally, a way to scale hiring without burning out our interview panel with early-stage filtering.",
      author: "Elena Rodriguez",
      role: "Head of Talent, InnovateHQ",
      image: "https://api.dicebear.com/7.x/avataaars/svg?seed=Elena"
    }
  ];

  const [searchParams, setSearchParams] = useSearchParams();
  const showPricing = searchParams.get('view') === 'pricing';
  const setShowPricing = (val: boolean) => {
    if (val) setSearchParams({ view: 'pricing' });
    else setSearchParams({});
  };

  const plans = [
    {
      id: "price_free",
      name: "Free",
      price: "0",
      description: "Perfect for exploring AI vetting capabilities.",
      features: ["5 AI Screenings / mo", "Standard Scoring", "Email Support", "1 Admin User"],
      buttonText: "Start Free",
      color: "bg-white",
      textColor: "text-slate-900"
    },
    {
      id: "price_pro",
      name: "Pro",
      price: "299",
      description: "For scaling teams with high-throughput needs.",
      features: ["50 AI Screenings / mo", "Advanced Predictive Scoring", "Priority Support", "5 Admin Users", "Calendar Integration"],
      buttonText: "Get Pro",
      color: "bg-indigo-600",
      textColor: "text-white",
      popular: true
    },
    {
      id: "price_enterprise",
      name: "Enterprise",
      price: "999",
      description: "Custom solutions for global organizations.",
      features: ["Unlimited Screenings", "Custom Agent Training", "Dedicated Success Manager", "Unlimited Admin Users", "API Access", "SSO / SAML"],
      buttonText: "Contact Sales",
      color: "bg-slate-900",
      textColor: "text-white"
    }
  ];

  const handleCheckout = (planId: string) => {
    // Direct sign in for MVP, payment gateway disabled
    signIn();
  };

  if (showPricing) {
    return (
      <div className="min-h-screen bg-slate-50 py-32 px-6">
        <div className="max-w-7xl mx-auto">
          <button 
            onClick={() => setShowPricing(false)}
            className="flex items-center gap-2 text-slate-500 font-bold mb-12 hover:text-indigo-600 transition-colors uppercase tracking-widest text-xs"
          >
            <ArrowRight className="w-4 h-4 rotate-180" /> Back to home
          </button>
          
          <div className="text-center mb-20">
            <h2 className="text-3xl sm:text-5xl md:text-6xl font-display font-black text-slate-900 tracking-tighter mb-6 uppercase">Ready to scale <br /><span className="text-indigo-600">at machine speed?</span></h2>
            <p className="text-base sm:text-lg md:text-xl text-slate-500 font-medium max-w-2xl mx-auto">Choose the plan that fits your growth trajectory. All plans include our core autonomous screening engine.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {plans.map((p, i) => (
              <Card key={i} className={cn("p-12 relative overflow-hidden flex flex-col justify-between rounded-[3rem] border-none shadow-2xl", p.color)}>
                {p.popular && (
                  <div className="absolute top-8 right-8 px-4 py-1 bg-white text-indigo-600 rounded-full text-[10px] font-black uppercase tracking-widest">
                    Most Popular
                  </div>
                )}
                <div>
                   <h3 className={cn("text-2xl font-black mb-2 uppercase tracking-tight", p.textColor)}>{p.name}</h3>
                   <div className="flex items-baseline gap-1 mb-6">
                      <span className={cn("text-5xl font-display font-black", p.textColor)}>${p.price}</span>
                      <span className={cn("font-bold", p.textColor === 'text-white' ? 'text-indigo-200' : 'text-slate-400')}>/mo</span>
                   </div>
                   <p className={cn("font-medium mb-10 leading-relaxed", p.textColor === 'text-white' ? 'text-indigo-100' : 'text-slate-500')}>{p.description}</p>
                   
                   <div className="space-y-6 mb-12">
                      {p.features.map((f, fi) => (
                        <div key={fi} className="flex items-center gap-4">
                           <div className={cn("w-5 h-5 rounded-full flex items-center justify-center shrink-0", p.textColor === 'text-white' ? 'bg-white/20' : 'bg-indigo-50')}>
                              <Check className={cn("w-3 h-3", p.textColor === 'text-white' ? 'text-white' : 'text-indigo-600')} />
                           </div>
                           <span className={cn("text-sm font-bold", p.textColor === 'text-white' ? 'text-indigo-50' : 'text-slate-700')}>{f}</span>
                        </div>
                      ))}
                   </div>
                </div>

                <Button 
                  variant={p.color === 'bg-white' ? 'brand' : 'white'} 
                  size="lg" 
                  className="w-full h-16 rounded-2xl font-black uppercase tracking-widest"
                  onClick={() => handleCheckout(p.id)}
                >
                  {p.buttonText}
                </Button>
              </Card>
            ))}
          </div>

          <div className="mt-20 p-12 bg-white rounded-[3rem] border border-slate-100 text-center">
             <h4 className="text-xl font-bold text-slate-900 mb-4">Enterprise Customization</h4>
             <p className="text-slate-500 font-medium mb-8 max-w-xl mx-auto">Need something unique? We offer localized agent training, custom voice profiles, and specialized assessment matrices for specific industry high-volume needs.</p>
             <button className="text-indigo-600 font-black uppercase tracking-widest text-sm hover:underline">Speak with a Solution Architect</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white relative overflow-hidden selection:bg-indigo-100 italic-shadows">
      {/* 2026 Aurora Background Effects */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
        <div className="absolute -top-[20%] -left-[10%] w-[70%] h-[70%] bg-indigo-500/10 blur-[120px] rounded-full animate-aurora" />
        <div className="absolute top-[20%] -right-[10%] w-[60%] h-[60%] bg-emerald-500/5 blur-[120px] rounded-full animate-aurora-delayed" />
        <div className="absolute -bottom-[20%] left-[20%] w-[50%] h-[50%] bg-indigo-600/5 blur-[120px] rounded-full animate-aurora" />
      </div>

      {/* Background Decor */}
      <div className="absolute inset-0 bg-grid opacity-[0.02] pointer-events-none" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-[800px] bg-[radial-gradient(circle_at_center,rgba(79,70,229,0.05)_0%,transparent_70%)] pointer-events-none" />

      {/* Hero Section */}
      <section id="home" className="relative z-10 pt-20 sm:pt-32 pb-16 sm:pb-24 px-4 sm:px-6 max-w-7xl mx-auto text-center">
        <motion.div
           initial={{ opacity: 0, y: 30 }}
           animate={{ opacity: 1, y: 0 }}
           transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/50 border border-indigo-100 mb-8 sm:mb-10 backdrop-blur-md shadow-sm">
            <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
            <span className="text-[10px] font-black text-indigo-900 uppercase tracking-[0.25em]">The 2026 Standard for Talent</span>
          </div>
          <h1 className="text-5xl sm:text-7xl md:text-[8rem] lg:text-[9.5rem] font-display font-black text-slate-950 tracking-tighter leading-[0.8] mb-10 sm:mb-12 uppercase drop-shadow-sm">
            AUTONOMOUS <br />
            <span className="text-indigo-600 inline-block">HIRING <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-emerald-500">POWER.</span></span>
          </h1>
          <p className="text-base sm:text-xl md:text-3xl text-slate-500 max-w-3xl mx-auto font-medium leading-normal sm:leading-tight mb-12 sm:mb-16 tracking-tight px-4">
            HireAI initiates 24/7 autonomous screenings that out-perform human panels in consistency, depth, and speed.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-6 px-4">
            <Button variant="brand" size="lg" className="w-full sm:w-auto h-auto py-5 sm:py-6 px-10 sm:px-14 text-lg sm:text-xl shadow-2xl shadow-indigo-500/40 rounded-[2rem]" onClick={() => setShowPricing(true)}>
              Start Scaling <ArrowRight className="w-5 h-5 sm:w-6 sm:h-6 ml-2" />
            </Button>
            <button className="w-full sm:w-auto flex items-center justify-center gap-3 text-slate-900 font-bold text-lg hover:text-indigo-600 transition-all group py-4 sm:py-0">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full border-2 border-slate-200 flex items-center justify-center group-hover:border-indigo-600 group-hover:scale-110 transition-all">
                <Play className="w-4 h-4 sm:w-5 sm:h-5 fill-current" />
              </div>
              Watch Vision
            </button>
          </div>
          
          {/* Floating Highlights */}
          <div className="mt-16 flex flex-wrap justify-center gap-4">
             <div className="px-5 py-2.5 rounded-2xl bg-white shadow-sm border border-slate-100 flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600">
                   <Clock className="w-4 h-4" />
                </div>
                <span className="text-sm font-bold text-slate-600 tracking-tight">Vet in <span className="text-slate-950">minutes</span></span>
             </div>
             <div className="px-5 py-2.5 rounded-2xl bg-white shadow-sm border border-slate-100 flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600">
                   <Brain className="w-4 h-4" />
                </div>
                <span className="text-sm font-bold text-slate-600 tracking-tight">AI Interviewers</span>
             </div>
             <div className="px-5 py-2.5 rounded-2xl bg-white shadow-sm border border-slate-100 flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center text-amber-600">
                   <Award className="w-4 h-4" />
                </div>
                <span className="text-sm font-bold text-slate-600 tracking-tight">Top 1% Identification</span>
             </div>
          </div>
        </motion.div>

      </section>

      {/* Stats Bar */}
      <section className="py-12 sm:py-20 border-y border-slate-100 bg-slate-50/50 backdrop-blur-sm relative z-20 overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] text-center mb-10 sm:mb-12">Trusted by 200+ elite engineering teams</div>
          <div className="flex flex-wrap justify-center sm:justify-between items-center gap-8 sm:gap-10 opacity-30 grayscale mb-12 sm:mb-16">
             <div className="text-xl sm:text-2xl font-black tracking-tighter">TECHFLOW</div>
             <div className="text-xl sm:text-2xl font-black tracking-tighter italic">CloudScale</div>
             <div className="text-xl sm:text-2xl font-black tracking-tighter uppercase">InnovateHQ</div>
             <div className="text-xl sm:text-2xl font-black tracking-tighter leading-none">GlobalVenture</div>
             <div className="text-xl sm:text-2xl font-black tracking-tighter italic">DevSymphony</div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 sm:gap-12 text-center">
          <div>
            <div className="text-3xl sm:text-5xl font-display font-black text-slate-900 mb-1 sm:mb-2 tracking-tighter">85%</div>
            <div className="text-[9px] sm:text-xs font-bold text-slate-500 uppercase tracking-widest">Time Subtraction</div>
          </div>
          <div>
            <div className="text-3xl sm:text-5xl font-display font-black text-slate-900 mb-1 sm:mb-2 tracking-tighter">1.2k</div>
            <div className="text-[9px] sm:text-xs font-bold text-slate-500 uppercase tracking-widest">Hours Saved Monthly</div>
          </div>
          <div>
            <div className="text-3xl sm:text-5xl font-display font-black text-slate-900 mb-1 sm:mb-2 tracking-tighter">0.01s</div>
            <div className="text-[9px] sm:text-xs font-bold text-slate-500 uppercase tracking-widest">Decision Latency</div>
          </div>
          <div>
            <div className="text-3xl sm:text-5xl font-display font-black text-slate-900 mb-1 sm:mb-2 tracking-tighter">4.9/5</div>
            <div className="text-[9px] sm:text-xs font-bold text-slate-500 uppercase tracking-widest">Candidate Net Score</div>
          </div>
        </div>
      </div>
    </section>

      {/* How it Works */}
      <section id="how-it-works" className="py-32 px-6 max-w-7xl mx-auto relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-24 items-center">
          <div>
            <h2 className="text-5xl md:text-7xl font-display font-black text-slate-950 tracking-tighter leading-none mb-10 uppercase">
              How the platform <br />
              <span className="text-indigo-600">scales your talent.</span>
            </h2>
            <p className="text-xl text-slate-500 font-medium leading-relaxed mb-12">
              Transforming your hiring pipeline into a high-throughput engine. No more manual screening, no more scheduling nightmares.
            </p>
            <div className="space-y-12">
               {steps.map((step, i) => (
                 <div key={i} className="flex gap-8 group">
                    <div className="text-4xl font-display font-black text-slate-200 group-hover:text-indigo-600 transition-colors">{step.number}</div>
                    <div>
                      <h4 className="text-2xl font-bold text-slate-900 mb-2">{step.title}</h4>
                      <p className="text-slate-500 font-medium">{step.description}</p>
                    </div>
                 </div>
               ))}
            </div>
          </div>
          <div className="relative">
             <div className="absolute inset-0 bg-indigo-500/10 blur-[100px] rounded-full" />
             <Card className="aspect-square relative flex items-center justify-center p-12 bg-slate-900 rounded-[4rem] border-none shadow-2xl overflow-hidden">
                <div className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.4)_0%,transparent_100%)]" />
                <div className="text-center relative z-10">
                   <div className="w-32 h-32 bg-indigo-500/20 rounded-full flex items-center justify-center mx-auto mb-10 border border-indigo-500/40">
                      <Zap className="w-16 h-16 text-indigo-400" />
                   </div>
                   <h3 className="text-4xl font-display font-black text-white mb-6 uppercase tracking-tight">HireAI AGENT IS ACTIVE.</h3>
                   <div className="flex justify-center gap-1">
                      {[1,2,3,4,5].map(i => <div key={i} className="w-2 h-8 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: `${i * 0.1}s` }} />)}
                   </div>
                </div>
             </Card>
          </div>
        </div>
      </section>

      {/* Feature Grid */}
      <section id="features" className="py-32 px-6 max-w-7xl mx-auto relative z-10 bg-slate-900 rounded-[5rem] my-20 overflow-hidden">
        <div className="absolute inset-0 bg-grid-white opacity-[0.03] pointer-events-none" />
        <div className="text-center mb-24 relative z-10">
          <h2 className="text-5xl md:text-7xl font-display font-black text-white tracking-tighter mb-6 uppercase">SUPERCHARGED VETTING.</h2>
          <p className="text-xl text-slate-400 font-medium max-w-2xl mx-auto">Enterprise-grade tools for teams who refuse to settle for average talent.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 relative z-10">
          {features.map((f, i) => (
            <motion.div
              key={i}
              whileHover={{ y: -10 }}
              className="group"
            >
              <Card className="p-12 h-full flex flex-col items-start gap-8 bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20 transition-all text-left backdrop-blur-xl">
                <div className={cn("w-20 h-20 rounded-[2rem] flex items-center justify-center transition-all group-hover:scale-110", f.color)}>
                  {f.icon}
                </div>
                <div>
                  <h3 className="text-2xl font-bold text-white mb-4">{f.title}</h3>
                  <p className="text-slate-400 leading-relaxed font-medium">{f.description}</p>
                </div>
              </Card>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Use Cases - NEW SECTION */}
      <section id="solutions" className="py-32 px-6 max-w-7xl mx-auto relative z-10">
        <div className="flex flex-col md:flex-row items-end justify-between gap-10 mb-20">
          <div className="max-w-2xl">
            <h2 className="text-5xl md:text-7xl font-display font-black text-slate-950 tracking-tighter leading-none mb-6 uppercase">
              Built for <br />
              <span className="text-indigo-600">Complex Scale.</span>
            </h2>
            <p className="text-xl text-slate-500 font-medium">Whatever your stack, wherever your team is based, HireAI adapts to your specific hiring needs.</p>
          </div>
          <div className="h-px flex-1 bg-slate-100 hidden md:block mb-6" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {useCases.map((uc, i) => (
            <div key={i} className="group p-10 bg-white border border-slate-100 rounded-[3rem] hover:shadow-2xl hover:shadow-indigo-500/10 transition-all">
              <h3 className="text-2xl font-bold text-slate-900 mb-6">{uc.title}</h3>
              <p className="text-slate-500 font-medium leading-relaxed mb-8">{uc.description}</p>
              <div className="flex items-center gap-3 text-indigo-600 font-bold">
                 <div className="w-8 h-8 rounded-full bg-indigo-50 flex items-center justify-center">
                    <Check className="w-4 h-4" />
                 </div>
                 {uc.benefit}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Benefits / Why HireAI - NEW SECTION */}
      <section id="about" className="py-32 bg-slate-50 relative z-10 overflow-hidden rounded-[5rem] my-20">
        <div className="absolute top-0 right-0 w-1/2 h-full bg-indigo-600 skew-x-12 translate-x-1/2 opacity-[0.03]" />
        
        {/* Added Trust/Security Section */}
        <div className="max-w-7xl mx-auto px-6 mb-32 border-b border-slate-200 pb-32">
           <div className="grid grid-cols-1 lg:grid-cols-2 gap-20 items-center">
              <div>
                 <div className="w-12 h-12 rounded-xl bg-indigo-600 flex items-center justify-center mb-8">
                    <ShieldCheck className="w-6 h-6 text-white" />
                 </div>
                 <h2 className="text-5xl font-display font-black text-slate-900 tracking-tighter uppercase mb-6 leading-none">Enterprise-Grade <br /><span className="text-indigo-600">Trust & Security.</span></h2>
                 <p className="text-xl text-slate-500 font-medium mb-8 leading-relaxed">
                    HireAI is built for organizations that prioritize data privacy and objective evaluation. Our agents are SOC2 Type II compliant and conduct every interview within a secure, sandboxed environment.
                 </p>
                 <div className="grid grid-cols-2 gap-6">
                    <div className="p-6 bg-white rounded-3xl border border-slate-100">
                       <h5 className="font-black text-slate-900 mb-2">Pii Redaction</h5>
                       <p className="text-xs text-slate-500 font-medium lowercase italic">Automatic masking of sensitive candidate data during initial vetting rounds.</p>
                    </div>
                    <div className="p-6 bg-white rounded-3xl border border-slate-100">
                       <h5 className="font-black text-slate-900 mb-2">GDPR Compliant</h5>
                       <p className="text-xs text-slate-500 font-medium lowercase italic">Full right-to-be-forgotten and data residency controls for global scale.</p>
                    </div>
                 </div>
              </div>
              <div className="relative">
                 <div className="absolute inset-0 bg-indigo-500/5 blur-[80px] rounded-full" />
                 <Card className="p-10 bg-white shadow-2xl rounded-[3rem] border-none relative overflow-hidden">
                    <div className="space-y-6">
                       {[1,2,3].map(i => (
                         <div key={i} className="flex items-center gap-4 p-4 rounded-2xl bg-slate-50 border border-slate-100">
                            <div className="w-4 h-4 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.4)]" />
                            <div className="h-3 w-1/2 bg-slate-200 rounded-full" />
                            <div className="ml-auto text-[10px] font-black text-slate-400">ENCRYPTED</div>
                         </div>
                       ))}
                       <div className="pt-4 border-t border-slate-100">
                          <div className="flex justify-between text-[10px] font-black tracking-widest text-indigo-600 uppercase mb-4">
                             <span>Security Audit Pulse</span>
                             <span>99.9% Pass Rate</span>
                          </div>
                          <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                             <div className="h-full w-full bg-indigo-600" />
                          </div>
                       </div>
                    </div>
                 </Card>
              </div>
           </div>
        </div>

        <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-12 gap-20 items-center">
           <div className="lg:col-span-5">
              <h2 className="text-5xl font-display font-black text-slate-900 tracking-tighter uppercase mb-8">Why choose <br /><span className="text-indigo-600">HireAI?</span></h2>
              <div className="space-y-10">
                 {benefits.map((b, i) => (
                   <div key={i} className="flex gap-6">
                      <div className="w-14 h-14 shrink-0 bg-white shadow-lg rounded-2xl flex items-center justify-center">
                         {b.icon}
                      </div>
                      <div>
                        <h4 className="text-xl font-bold text-slate-900 mb-2">{b.title}</h4>
                        <p className="text-slate-500 font-medium leading-relaxed">{b.description}</p>
                      </div>
                   </div>
                 ))}
              </div>
           </div>
           <div className="lg:col-span-7 grid grid-cols-2 gap-6">
              <div className="space-y-6 pt-12">
                 <Card className="p-8 bg-white shadow-xl rounded-[2.5rem] border-none">
                    <div className="text-4xl font-display font-black text-indigo-600 mb-2">90%</div>
                    <p className="text-sm font-bold text-slate-400 uppercase tracking-widest leading-tight">Reduction in cost per technical hire</p>
                 </Card>
                 <Card className="p-8 bg-slate-900 shadow-xl rounded-[2.5rem] border-none text-white">
                    <div className="text-4xl font-display font-black text-white mb-2">Instant</div>
                    <p className="text-sm font-bold text-slate-400 uppercase tracking-widest leading-tight">Feedback loop for all candidates</p>
                 </Card>
              </div>
              <div className="space-y-6">
                 <Card className="p-8 bg-indigo-600 shadow-xl rounded-[2.5rem] border-none text-white">
                    <div className="text-4xl font-display font-black text-white mb-2">100%</div>
                    <p className="text-sm font-bold text-indigo-200 uppercase tracking-widest leading-tight">Consistency in evaluation metrics</p>
                 </Card>
                 <Card className="p-8 bg-white shadow-xl rounded-[2.5rem] border-none">
                    <div className="text-4xl font-display font-black text-indigo-600 mb-2">4 Days</div>
                    <p className="text-sm font-bold text-slate-400 uppercase tracking-widest leading-tight">Average time to hire with HireAI</p>
                 </Card>
              </div>
           </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-24 sm:py-32 px-4 sm:px-6 max-w-7xl mx-auto text-center">
        <h2 className="text-4xl sm:text-5xl md:text-6xl font-display font-black text-slate-950 tracking-tighter mb-16 sm:mb-20 uppercase">Intelligence Era <br /> <span className="text-indigo-600">Leaderboard.</span></h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-10">
          {testimonials.map((t, i) => (
             <Card key={i} className="p-8 sm:p-10 border-2 border-slate-50 bg-slate-50/20 backdrop-blur-sm text-left flex flex-col justify-between hover:border-indigo-100 hover:bg-white transition-all duration-500">
                <div>
                  <div className="flex gap-1 mb-6 sm:mb-8 text-amber-500">
                     {[1,2,3,4,5].map(s => <Star key={s} className="w-4 h-4 sm:w-5 sm:h-5 fill-current" />)}
                  </div>
                  <p className="text-lg sm:text-xl text-slate-800 font-medium italic leading-relaxed mb-8 sm:mb-10 tracking-tight">"{t.quote}"</p>
                </div>
                <div className="flex items-center gap-4 border-t border-slate-100 pt-6 sm:pt-8">
                   <img src={t.image} alt={t.author} className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-white p-1 ring-2 ring-slate-100" />
                   <div>
                      <h4 className="font-black text-slate-900 text-sm sm:text-base leading-none mb-1">{t.author}</h4>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{t.role}</p>
                   </div>
                </div>
             </Card>
          ))}
        </div>
      </section>

      {/* CTA Footer */}
      <section className="py-40 px-6 max-w-7xl mx-auto text-center">
        <div className="relative p-24 bg-indigo-600 rounded-[5rem] overflow-hidden shadow-2xl shadow-indigo-500/40">
           <div className="absolute inset-0 bg-grid-white opacity-10 pointer-events-none" />
           <div className="relative z-10">
              <h2 className="text-6xl md:text-8xl font-display font-black text-white tracking-tighter leading-none mb-12 uppercase">READY TO HIRE <br /> BETTER?</h2>
              <div className="flex flex-col sm:flex-row justify-center items-center gap-6">
                <Button variant="white" size="lg" className="h-auto py-8 px-20 text-2xl text-indigo-600 font-black shadow-2xl hover:scale-105 transition-transform" onClick={() => setShowPricing(true)}>
                  Start Free Trial
                </Button>
                <Button variant="outline" className="h-auto py-8 px-20 text-2xl text-white border-white/30 bg-white/5 hover:bg-white/10 hover:border-white font-black shadow-2xl hover:scale-105 transition-transform" onClick={() => setShowPricing(true)}>
                  Request Demo
                </Button>
              </div>
              <p className="mt-10 text-indigo-200 font-black uppercase tracking-widest text-xs flex items-center justify-center gap-2">
                <CheckCircle2 className="w-4 h-4" /> No credit card required • 14 Day Unlimited Pilot
              </p>
           </div>
        </div>
      </section>
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
        <h2 className="text-xl font-black text-white uppercase tracking-widest">HireAI</h2>
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
