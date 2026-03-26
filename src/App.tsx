import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  onAuthStateChanged, 
  User as FirebaseUser,
  signInWithPopup,
  signOut,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendEmailVerification,
  reload
} from 'firebase/auth';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  serverTimestamp,
  orderBy,
  setDoc,
  getDoc
} from 'firebase/firestore';
import { useEditor, EditorContent } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import StarterKit from '@tiptap/starter-kit';
import BoldExtension from '@tiptap/extension-bold';
import ItalicExtension from '@tiptap/extension-italic';
import HeadingExtension from '@tiptap/extension-heading';
import BulletListExtension from '@tiptap/extension-bullet-list';
import OrderedListExtension from '@tiptap/extension-ordered-list';
import CodeBlockExtension from '@tiptap/extension-code-block';
import { Placeholder } from '@tiptap/extension-placeholder';
import { TaskList } from '@tiptap/extension-task-list';
import { TaskItem } from '@tiptap/extension-task-item';
import { CharacterCount } from '@tiptap/extension-character-count';
import { 
  Plus, 
  ClipboardList,
  Search, 
  User as UserIcon, 
  LogOut, 
  FileText, 
  Users, 
  ChevronRight, 
  Mic, 
  MicOff, 
  Sparkles, 
  Save, 
  Trash2, 
  ArrowLeft,
  Calendar,
  Clock,
  AlertCircle,
  Layout,
  Copy,
  Upload,
  MessageSquare,
  Send,
  X,
  Stethoscope,
  Shield,
  Zap,
  Brain,
  Play,
  Mail,
  CheckCircle,
  CheckCircle2,
  Sun,
  Moon,
  BarChart3,
  Activity,
  TrendingUp,
  TrendingDown,
  Minus,
  Rocket,
  Loader2,
  Bold as BoldIcon,
  Italic as ItalicIcon,
  Heading1,
  Heading2,
  List,
  ListOrdered,
  Quote,
  Code,
  CheckSquare,
  Wand2,
  Eraser,
  Type,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Undo,
  Redo,
  Globe,
  Image as ImageIcon,
  Volume2,
  SearchCode,
  History,
  FileSearch,
  Check
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { GoogleGenAI, Modality, LiveServerMessage, Type as GenAIType } from "@google/genai";
import { WeeklyStats, EvaluationReport } from "./types";
import { generateEvaluation } from "./services/evaluatorService";

import { auth, db, googleProvider } from './firebase';

// --- Types ---

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
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

interface Patient {
  id: string;
  name: string;
  dateOfBirth?: string;
  gender?: string;
  contactInfo?: string;
  createdBy: string;
  createdAt: any;
}

interface ClinicalNote {
  id: string;
  patientId: string;
  title: string;
  type?: 'General  SOAP  Note' | 'Admission Note' | 'Discharge Summary' | 'Mental Status Exam' | 'Other';
  content: string;
  transcript?: string;
  analysis?: string;
  status: 'draft' | 'finalized';
  createdBy: string;
  createdAt: any;
  updatedAt: any;
  // Performance metrics
  wordCount?: number;
  typingTimeMs?: number;
  structureScore?: number;
  reasoningScore?: number;
  errorRate?: number;
}

interface NoteTemplate {
  id: string;
  name: string;
  type?: ClinicalNote['type'];
  content: string;
  category?: string;
  description?: string;
  createdBy: string;
  createdAt: any;
}


// --- Utils ---

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

function getWeekNumber(d: Date): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return weekNo;
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// --- Components ---

const ErrorBoundary: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      try {
        const parsed = JSON.parse(event.error.message);
        if (parsed.error) {
          setError(`Firestore Error: ${parsed.error} (${parsed.operationType} at ${parsed.path})`);
        }
      } catch {
        setError(event.error.message);
      }
    };
    window.addEventListener('error', handleError);
    return () => window.removeEventListener('error', handleError);
  }, []);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white dark:bg-black p-4">
        <div className="max-w-md w-full bg-white dark:bg-black rounded-2xl shadow-xl p-8 border border-zinc-200 dark:border-zinc-800 text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-zinc-900 dark:text-white mb-2">Something went wrong</h2>
          <p className="text-zinc-500 dark:text-zinc-400 mb-6 text-sm">{error}</p>
          <button 
            onClick={() => window.location.reload()}
            className="w-full py-3 bg-sky-600 text-white rounded-xl font-medium hover:bg-sky-500 transition-colors shadow-lg shadow-sky-600/20"
          >
            Reload Application
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

const Button = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger' }>(
  ({ className, variant = 'primary', ...props }, ref) => {
    const variants = {
      primary: 'bg-sky-600 text-white hover:bg-sky-500 shadow-lg shadow-sky-600/20',
      secondary: 'bg-white text-sky-600 border border-zinc-200 hover:bg-zinc-50 dark:bg-zinc-900 dark:text-sky-400 dark:border-zinc-800 dark:hover:bg-zinc-800',
      ghost: 'bg-transparent text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-white',
      danger: 'bg-red-500/10 text-red-500 hover:bg-red-500/20 border border-red-500/20',
    };
    return (
      <button
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center rounded-full px-5 py-2.5 text-sm font-medium transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none gap-2',
          variants[variant],
          className
        )}
        {...props}
      />
    );
  }
);

const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'flex h-11 w-full rounded-full border border-zinc-200 bg-white px-5 py-2 text-sm ring-offset-white file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-zinc-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/20 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:ring-offset-black dark:placeholder:text-zinc-600 dark:text-white',
        className
      )}
      {...props}
    />
  )
);

const Modal = ({ isOpen, onClose, title, children }: { isOpen: boolean; onClose: () => void; title: string; children: React.ReactNode }) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative w-full max-w-md bg-white dark:bg-black rounded-[40px] p-10 shadow-2xl border border-zinc-200 dark:border-zinc-800"
          >
            <div className="flex items-center justify-between mb-8">
              <h3 className="text-2xl font-sans font-bold text-zinc-900 dark:text-white">{title}</h3>
              <Button variant="ghost" className="p-2 h-auto rounded-full" onClick={onClose}>
                <X className="w-5 h-5" />
              </Button>
            </div>
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

const AuthModal = ({ isOpen, onClose, onGoogleLogin, onEmailSignUp, onEmailLogin, isDark }: { 
  isOpen: boolean; 
  onClose: () => void; 
  onGoogleLogin: () => void;
  onEmailSignUp: (email: string, pass: string) => Promise<void>;
  onEmailLogin: (email: string, pass: string) => Promise<void>;
  isDark: boolean;
}) => {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (mode === 'login') {
        await onEmailLogin(email, password);
      } else {
        await onEmailSignUp(email, password);
      }
      onClose();
    } catch (err: any) {
      setError(err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={mode === 'login' ? 'Welcome Back' : 'Create Account'}>
      <div className="space-y-6">
        <Button onClick={onGoogleLogin} variant="secondary" className="w-full h-14 rounded-2xl text-lg">
          <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="w-5 h-5 mr-3" />
          Continue with Google
        </Button>
        
        <div className="relative flex items-center justify-center">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-zinc-200 dark:border-zinc-800"></div>
          </div>
          <span className={cn("relative px-4 text-xs font-bold uppercase tracking-widest transition-colors", isDark ? "bg-black text-zinc-600" : "bg-white text-zinc-400")}>Or with email</span>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className={cn("text-xs font-bold uppercase tracking-widest ml-4", isDark ? "text-zinc-500" : "text-zinc-400")}>Email Address</label>
            <Input 
              type="email" 
              placeholder="doctor@hospital.com" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <label className={cn("text-xs font-bold uppercase tracking-widest ml-4", isDark ? "text-zinc-500" : "text-zinc-400")}>Password</label>
            <Input 
              type="password" 
              placeholder="••••••••" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          
          {error && <p className="text-red-500 text-xs ml-4 font-medium">{error}</p>}
          
          <Button type="submit" disabled={loading} className="w-full h-14 rounded-2xl text-lg mt-4">
            {loading ? 'Processing...' : mode === 'login' ? 'Log In' : 'Sign Up'}
          </Button>
        </form>

        <p className="text-center text-sm text-zinc-500 dark:text-zinc-400">
          {mode === 'login' ? "Don't have an account?" : "Already have an account?"}{' '}
          <button 
            onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}
            className="text-sky-500 font-bold hover:underline"
          >
            {mode === 'login' ? 'Sign Up' : 'Log In'}
          </button>
        </p>
      </div>
    </Modal>
  );
};

const TiptapEditor = ({ 
  value, 
  onChange, 
  isDark, 
  placeholder,
  className,
  minHeight = "600px"
}: { 
  value: string; 
  onChange: (val: string) => void; 
  isDark: boolean;
  placeholder?: string;
  className?: string;
  minHeight?: string;
}) => {
  const [isAiProcessing, setIsAiProcessing] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        bold: false,
        italic: false,
        heading: false,
        bulletList: false,
        orderedList: false,
        codeBlock: false,
      }),
      BoldExtension,
      ItalicExtension,
      HeadingExtension.configure({ levels: [1, 2, 3] }),
      BulletListExtension,
      OrderedListExtension,
      CodeBlockExtension,
      Placeholder.configure({
        placeholder: placeholder || 'Start writing...',
      }),
      TaskList,
      TaskItem.configure({
        nested: true,
      }),
      CharacterCount,
    ],
    content: value,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML())
    },
    editorProps: {
      attributes: {
        class: cn(
          "focus:outline-none max-w-none p-10 font-sans leading-relaxed prose prose-sm sm:prose lg:prose-lg xl:prose-2xl",
          isDark ? "text-zinc-200 prose-invert" : "text-zinc-900"
        ),
        style: `min-height: ${minHeight};`,
      },
    },
  })

  useEffect(() => {
    if (editor && value !== editor.getHTML()) {
      editor.commands.setContent(value)
    }
  }, [value, editor])

  if (!editor) return null

  const handleAiAction = async (action: 'refine' | 'summarize' | 'soap' | 'expand') => {
    const selection = editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to, ' ')
    const contentToProcess = selection || editor.getHTML()
    
    setIsAiProcessing(true)
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const prompts = {
        refine: "Refine the following clinical text for professional medical documentation. Correct grammar, improve phrasing, and ensure clinical accuracy while maintaining the original meaning.",
        summarize: "Provide a concise clinical summary of the following text, highlighting key findings and plans.",
        soap: "Reformat the following clinical information into a structured SOAP (Subjective, Objective, Assessment, Plan) format. Use clear Markdown headers and add extra vertical space (multiple newlines) between sections. If information is missing for a section, leave it blank or use 'Not recorded'.",
        expand: "Expand the following brief clinical notes into more detailed, professional documentation. Add standard clinical context where appropriate based on the provided information."
      }

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `${prompts[action]}\n\nText:\n${contentToProcess}`,
        config: {
          systemInstruction: "You are a senior clinical documentation assistant. Your goal is to help healthcare providers write better, more accurate, and professionally formatted clinical notes. Return the result in clean HTML format suitable for a rich text editor. Do not include markdown code blocks like ```html. Just the HTML content.",
        }
      });

      if (response.text) {
        const cleanHtml = response.text.replace(/```html/g, '').replace(/```/g, '').trim()
        if (selection) {
          editor.chain().focus().insertContent(cleanHtml).run()
        } else {
          editor.chain().focus().setContent(cleanHtml).run()
        }
      }
    } catch (error) {
      console.error("AI Writing Action failed:", error)
    } finally {
      setIsAiProcessing(false)
    }
  }

  const toolbarItems = [
    { 
      icon: <BoldIcon className="w-4 h-4" />, 
      action: () => editor.chain().focus().toggleBold().run(), 
      isActive: editor.isActive('bold'),
      label: 'Bold' 
    },
    { 
      icon: <ItalicIcon className="w-4 h-4" />, 
      action: () => editor.chain().focus().toggleItalic().run(), 
      isActive: editor.isActive('italic'),
      label: 'Italic' 
    },
    { 
      icon: <Heading1 className="w-4 h-4" />, 
      action: () => editor.chain().focus().toggleHeading({ level: 1 }).run(), 
      isActive: editor.isActive('heading', { level: 1 }),
      label: 'H1' 
    },
    { 
      icon: <Heading2 className="w-4 h-4" />, 
      action: () => editor.chain().focus().toggleHeading({ level: 2 }).run(), 
      isActive: editor.isActive('heading', { level: 2 }),
      label: 'H2' 
    },
    { 
      icon: <List className="w-4 h-4" />, 
      action: () => editor.chain().focus().toggleBulletList().run(), 
      isActive: editor.isActive('bulletList'),
      label: 'Bullet List' 
    },
    { 
      icon: <ListOrdered className="w-4 h-4" />, 
      action: () => editor.chain().focus().toggleOrderedList().run(), 
      isActive: editor.isActive('orderedList'),
      label: 'Numbered List' 
    },
    { 
      icon: <CheckSquare className="w-4 h-4" />, 
      action: () => editor.chain().focus().toggleTaskList().run(), 
      isActive: editor.isActive('taskList'),
      label: 'Task List' 
    },
    { 
      icon: <Code className="w-4 h-4" />, 
      action: () => editor.chain().focus().toggleCodeBlock().run(), 
      isActive: editor.isActive('codeBlock'),
      label: 'Code' 
    },
    { 
      icon: <Undo className="w-4 h-4" />, 
      action: () => editor.chain().focus().undo().run(), 
      isActive: false,
      label: 'Undo' 
    },
    { 
      icon: <Redo className="w-4 h-4" />, 
      action: () => editor.chain().focus().redo().run(), 
      isActive: false,
      label: 'Redo' 
    },
  ];

  const aiActions = [
    { label: 'Refine Phrasing', action: () => handleAiAction('refine'), icon: <Wand2 className="w-3.5 h-3.5" /> },
    { label: 'Summarize', action: () => handleAiAction('summarize'), icon: <AlignLeft className="w-3.5 h-3.5" /> },
    { label: 'Format as SOAP', action: () => handleAiAction('soap'), icon: <Layout className="w-3.5 h-3.5" /> },
    { label: 'Expand Brief', action: () => handleAiAction('expand'), icon: <Plus className="w-3.5 h-3.5" /> },
  ]

  return (
    <div className={cn(
      "flex flex-col rounded-[40px] border shadow-2xl overflow-hidden transition-all",
      isDark ? "bg-zinc-900/50 border-zinc-800" : "bg-white border-zinc-200",
      className
    )}>
      <div className={cn(
        "flex flex-col p-3 border-b transition-colors",
        isDark ? "bg-zinc-900/80 border-zinc-800" : "bg-zinc-50/80 border-zinc-200"
      )}>
        <div className="flex flex-wrap items-center gap-1 mb-2">
          {toolbarItems.slice(0, -2).map((item, idx) => (
            <button
              key={idx}
              onClick={(e) => { e.preventDefault(); item.action(); }}
              title={item.label}
              className={cn(
                "p-2 rounded-xl transition-all",
                item.isActive 
                  ? "bg-sky-500 text-white shadow-lg shadow-sky-500/20" 
                  : isDark ? "text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200" : "text-zinc-400 hover:bg-white hover:text-zinc-900"
              )}
            >
              {item.icon}
            </button>
          ))}
          
          <div className="w-px h-6 mx-2 bg-zinc-800/50" />

          <div className="relative group/ai">
            <button
              disabled={isAiProcessing}
              onClick={(e) => e.preventDefault()}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-xl transition-all font-sans font-bold text-xs uppercase tracking-widest",
                isAiProcessing 
                  ? "bg-zinc-800 text-zinc-600 cursor-wait" 
                  : "bg-sky-500/10 text-sky-400 hover:bg-sky-500 hover:text-white shadow-lg shadow-sky-500/10"
              )}
            >
              <Sparkles className={cn("w-4 h-4", isAiProcessing && "animate-spin")} />
              {isAiProcessing ? 'Processing...' : 'AI Assistant'}
            </button>
            
            <div className={cn(
              "absolute left-0 top-full mt-2 w-56 border rounded-[24px] shadow-2xl opacity-0 invisible group-hover/ai:opacity-100 group-hover/ai:visible transition-all z-50 py-3",
              isDark ? "bg-zinc-900 border-zinc-800" : "bg-white border-zinc-200"
            )}>
              {aiActions.map((ai, idx) => (
                <button
                  key={idx}
                  onClick={(e) => { e.preventDefault(); ai.action(); }}
                  className={cn(
                    "w-full text-left px-5 py-2.5 text-sm transition-colors font-sans flex items-center gap-3",
                    isDark ? "hover:bg-zinc-800 text-zinc-300" : "hover:bg-zinc-50 text-zinc-600"
                  )}
                >
                  {ai.icon}
                  {ai.label}
                </button>
              ))}
            </div>
          </div>

          <div className="ml-auto px-4 text-[10px] font-bold uppercase tracking-widest text-zinc-500 font-sans">
            {editor.storage.characterCount.characters()} chars
          </div>
        </div>

        <div className="flex items-center gap-1 pt-2 border-t border-zinc-800/30 dark:border-zinc-700/30">
          {toolbarItems.slice(-2).map((item, idx) => (
            <button
              key={idx}
              onClick={(e) => { e.preventDefault(); item.action(); }}
              title={item.label}
              className={cn(
                "p-2 rounded-xl transition-all",
                item.isActive 
                  ? "bg-sky-500 text-white shadow-lg shadow-sky-500/20" 
                  : isDark ? "text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200" : "text-zinc-400 hover:bg-white hover:text-zinc-900"
              )}
            >
              {item.icon}
            </button>
          ))}
          <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 ml-2">History</span>
        </div>
      </div>

      <BubbleMenu editor={editor}>
        <div className={cn(
          "flex items-center gap-1 p-1.5 rounded-2xl border shadow-2xl backdrop-blur-md",
          isDark ? "bg-zinc-900/90 border-zinc-800" : "bg-white/90 border-zinc-200"
        )}>
          <button
            onClick={(e) => { e.preventDefault(); editor.chain().focus().toggleBold().run(); }}
            className={cn(
              "p-1.5 rounded-lg transition-all",
              editor.isActive('bold') ? "bg-sky-500 text-white" : isDark ? "text-zinc-400 hover:bg-zinc-800" : "text-zinc-600 hover:bg-zinc-100"
            )}
          >
            <BoldIcon className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={(e) => { e.preventDefault(); editor.chain().focus().toggleItalic().run(); }}
            className={cn(
              "p-1.5 rounded-lg transition-all",
              editor.isActive('italic') ? "bg-sky-500 text-white" : isDark ? "text-zinc-400 hover:bg-zinc-800" : "text-zinc-600 hover:bg-zinc-100"
            )}
          >
            <ItalicIcon className="w-3.5 h-3.5" />
          </button>
          <div className="w-px h-4 mx-1 bg-zinc-800/50" />
          <button
            onClick={(e) => { e.preventDefault(); handleAiAction('refine'); }}
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all text-[10px] font-bold uppercase tracking-widest",
              isDark ? "text-sky-400 hover:bg-zinc-800" : "text-sky-600 hover:bg-zinc-100"
            )}
          >
            <Sparkles className="w-3 h-3" />
            Refine
          </button>
        </div>
      </BubbleMenu>

      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
};

const HtmlRenderer = ({ html, className }: { html: string; className?: string }) => {
  return (
    <div 
      className={cn("markdown-body", className)} 
      dangerouslySetInnerHTML={{ __html: html }} 
    />
  );
};

const VerificationScreen = ({ onResend, onCheck, onLogout, user, isDark }: { onResend: () => void; onCheck: () => void; onLogout: () => void; user: FirebaseUser; isDark: boolean }) => {
  return (
    <div className={cn("min-h-screen flex items-center justify-center p-6 transition-colors", isDark ? "bg-black text-white" : "bg-zinc-50 text-zinc-900")}>
      <motion.div 
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className={cn("max-w-md w-full rounded-[40px] p-12 shadow-2xl border text-center transition-colors", isDark ? "bg-zinc-900 border-zinc-800" : "bg-white border-zinc-200")}
      >
        <div className="w-20 h-20 bg-sky-600/10 rounded-[32px] flex items-center justify-center mx-auto mb-8 border border-sky-600/20">
          <Mail className="w-10 h-10 text-sky-500" />
        </div>
        <h2 className="text-3xl font-sans font-bold mb-4">Verify your email</h2>
        <p className={cn("text-lg mb-10 leading-relaxed font-sans", isDark ? "text-zinc-400" : "text-zinc-500")}>
          We've sent a verification link to <span className="font-bold text-sky-500">{user.email}</span>. Please check your inbox and follow the instructions.
        </p>
        <div className="space-y-4">
          <Button onClick={onCheck} className="w-full h-14 rounded-2xl text-lg">
            I've verified my email
          </Button>
          <Button onClick={onResend} variant="secondary" className="w-full h-14 rounded-2xl text-lg">
            Resend verification link
          </Button>
          <Button onClick={onLogout} variant="ghost" className="w-full h-14 rounded-2xl text-lg">
            Log out
          </Button>
        </div>
      </motion.div>
    </div>
  );
};

const ConfirmationModal = ({ 
  isOpen, 
  onClose, 
  onConfirm, 
  title, 
  message 
}: { 
  isOpen: boolean; 
  onClose: () => void; 
  onConfirm: () => void; 
  title: string; 
  message: string;
}) => (
  <AnimatePresence>
    {isOpen && (
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-black/60 backdrop-blur-md"
          onClick={onClose}
        />
        <motion.div 
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          className="relative w-full max-w-md bg-white dark:bg-black rounded-[48px] p-12 shadow-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden"
        >
          <div className="absolute top-0 left-0 w-full h-2 bg-red-500/20" />
          <div className="flex flex-col items-center text-center">
            <div className="w-20 h-20 bg-red-500/10 rounded-[32px] flex items-center justify-center mb-8 border border-red-500/20">
              <Trash2 className="w-10 h-10 text-red-500" />
            </div>
            <h3 className="text-3xl font-sans font-bold text-zinc-900 dark:text-white mb-4">{title}</h3>
            <p className="text-lg text-zinc-500 dark:text-zinc-400 font-sans leading-relaxed mb-10">
              {message}
            </p>
            <div className="flex gap-4 w-full">
              <Button variant="ghost" className="flex-1 h-14 rounded-3xl" onClick={onClose}>
                Cancel
              </Button>
              <Button variant="danger" className="flex-1 h-14 rounded-3xl" onClick={onConfirm}>
                Delete
              </Button>
            </div>
          </div>
        </motion.div>
      </div>
    )}
  </AnimatePresence>
);

// --- Main App ---

const DemoModal = ({ isOpen, onClose, isDark }: { isOpen: boolean; onClose: () => void; isDark: boolean }) => {
  const [step, setStep] = useState(0);
  const [transcript, setTranscript] = useState('');
  const [note, setNote] = useState('');
  
  const demoSteps = [
    {
      title: "Ambient Scribe",
      description: "Start the recording during your patient encounter. mednotes listens and transcribes in real-time.",
      action: "Simulating Recording..."
    },
    {
      title: "AI Analysis",
      description: "Our advanced AI models analyze the conversation to extract clinical facts.",
      action: "Analyzing Conversation..."
    },
    {
      title: "Structured SOAP Note",
      description: "A perfectly formatted SOAP note is generated instantly, ready for your EMR.",
      action: "Generating Note..."
    }
  ];

  useEffect(() => {
    if (!isOpen) {
      setStep(0);
      setTranscript('');
      setNote('');
      return;
    }

    let timer: any;
    if (step === 0) {
      const fullTranscript = "Patient: I've been having this sharp pain in my lower back for about a week now. It's worse when I sit for long periods. Doctor: Does it radiate down your leg? Patient: Yes, sometimes down to my right knee.";
      let i = 0;
      timer = setInterval(() => {
        setTranscript(fullTranscript.substring(0, i));
        i++;
        if (i > fullTranscript.length) {
          clearInterval(timer);
          setTimeout(() => setStep(1), 1500);
        }
      }, 30);
    } else if (step === 1) {
      timer = setTimeout(() => setStep(2), 2000);
    } else if (step === 2) {
      const fullNote = "### Subjective\nPatient reports sharp lower back pain x 1 week. Pain is exacerbated by prolonged sitting. Radiation noted to right knee.\n\n### Objective\nPhysical exam reveals tenderness over L4-L5 region. Straight leg raise test positive on the right side.\n\n### Assessment\n1. Lumbar Radiculopathy\n2. Acute Low Back Pain\n\n### Plan\n- Physical therapy referral\n- NSAIDs for pain management\n- Follow up in 2 weeks";
      let i = 0;
      timer = setInterval(() => {
        setNote(fullNote.substring(0, i));
        i += 2;
        if (i > fullNote.length) {
          clearInterval(timer);
        }
      }, 20);
    }

    return () => {
      if (timer) clearInterval(timer);
      if (timer) clearTimeout(timer);
    };
  }, [isOpen, step]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      />
      <motion.div 
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        className={cn("relative w-full max-w-4xl rounded-[40px] border shadow-2xl overflow-hidden flex flex-col md:flex-row transition-colors", isDark ? "bg-zinc-900 border-zinc-800" : "bg-white border-zinc-200")}
      >
        <button onClick={onClose} className="absolute top-6 right-6 p-2 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors z-10">
          <X className="w-5 h-5" />
        </button>

        {/* Left Side: Steps */}
        <div className={cn("w-full md:w-80 p-10 border-r flex flex-col justify-between transition-colors", isDark ? "bg-zinc-950/50 border-zinc-800" : "bg-zinc-50/50 border-zinc-200")}>
          <div className="space-y-10">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-sky-600 rounded-lg flex items-center justify-center">
                <Stethoscope className="w-4 h-4 text-white" />
              </div>
              <span className="font-bold tracking-tight">mednotes demo</span>
            </div>
            
            <div className="space-y-8">
              {demoSteps.map((s, i) => (
                <div key={i} className={cn("transition-all duration-500", step === i ? "opacity-100 scale-100" : "opacity-30 scale-95")}>
                  <div className="flex items-center gap-3 mb-3">
                    <div className={cn("w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold border", step >= i ? "bg-sky-600 border-sky-600 text-white" : "border-zinc-500 text-zinc-500")}>
                      {step > i ? <CheckCircle className="w-3 h-3" /> : i + 1}
                    </div>
                    <h4 className="font-bold text-sm uppercase tracking-widest">{s.title}</h4>
                  </div>
                  <p className={cn("text-xs leading-relaxed", isDark ? "text-zinc-400" : "text-zinc-600")}>{s.description}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="pt-10">
            <Button onClick={onClose} className="w-full rounded-2xl bg-sky-600 hover:bg-sky-500 text-white">
              Close Demo
            </Button>
          </div>
        </div>

        {/* Right Side: Visualizer */}
        <div className="flex-1 p-10 flex flex-col">
          <div className="flex-1 rounded-3xl border border-dashed border-zinc-300 dark:border-zinc-800 p-8 flex flex-col gap-6 overflow-hidden relative">
            <AnimatePresence mode="wait">
              {step === 0 && (
                <motion.div 
                  key="step0"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex-1 flex flex-col"
                >
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
                    <span className="text-xs font-bold uppercase tracking-widest text-red-500">Live Recording</span>
                  </div>
                  <div className={cn("flex-1 p-6 rounded-2xl font-mono text-sm leading-relaxed overflow-y-auto", isDark ? "bg-black/40 text-zinc-400" : "bg-zinc-50 text-zinc-600")}>
                    {transcript}
                    <span className="w-2 h-4 bg-sky-500 inline-block ml-1 animate-pulse" />
                  </div>
                </motion.div>
              )}

              {step === 1 && (
                <motion.div 
                  key="step1"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex-1 flex items-center justify-center flex-col gap-6"
                >
                  <div className="relative">
                    <div className="absolute inset-0 bg-sky-600/20 blur-2xl rounded-full animate-pulse" />
                    <Brain className="w-20 h-20 text-sky-400 relative animate-bounce" />
                  </div>
                  <div className="text-center">
                    <h3 className="text-xl font-bold mb-2">Analyzing Clinical Facts</h3>
                    <p className={cn("text-sm", isDark ? "text-zinc-500" : "text-zinc-400")}>Extracting symptoms, history, and findings...</p>
                  </div>
                </motion.div>
              )}

              {step === 2 && (
                <motion.div 
                  key="step2"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex-1 flex flex-col"
                >
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                      <Sparkles className="w-4 h-4 text-sky-400" />
                      <span className="text-xs font-bold uppercase tracking-widest text-sky-400">Generated SOAP Note</span>
                    </div>
                    <div className="flex gap-2">
                      <div className="w-2 h-2 rounded-full bg-sky-600" />
                      <div className="w-2 h-2 rounded-full bg-sky-600/40" />
                      <div className="w-2 h-2 rounded-full bg-sky-600/20" />
                    </div>
                  </div>
                  <div className={cn("flex-1 p-8 rounded-2xl font-sans text-sm leading-relaxed overflow-y-auto border", isDark ? "bg-zinc-900 border-zinc-800 text-zinc-300" : "bg-white border-zinc-100 text-zinc-700")}>
                    <HtmlRenderer html={note} />
                    {note.length < 300 && <span className="w-2 h-4 bg-sky-500 inline-block ml-1 animate-pulse" />}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

const LandingPage = ({ 
  onGoogleLogin, 
  onEmailSignUp, 
  onEmailLogin, 
  theme, 
  toggleTheme 
}: { 
  onGoogleLogin: () => void; 
  onEmailSignUp: (email: string, pass: string) => Promise<void>;
  onEmailLogin: (email: string, pass: string) => Promise<void>;
  theme: 'dark' | 'light'; 
  toggleTheme: () => void 
}) => {
  const isDark = theme === 'dark';
  const [isDemoOpen, setIsDemoOpen] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [toast, setToast] = useState<{ message: string, type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  return (
    <div className={cn("min-h-screen font-sans overflow-x-hidden transition-colors duration-300", isDark ? "bg-black text-white" : "bg-white text-zinc-900")}>
      <DemoModal isOpen={isDemoOpen} onClose={() => setIsDemoOpen(false)} isDark={isDark} />
      <AuthModal 
        isOpen={isAuthModalOpen} 
        onClose={() => setIsAuthModalOpen(false)} 
        onGoogleLogin={onGoogleLogin}
        onEmailSignUp={onEmailSignUp}
        onEmailLogin={onEmailLogin}
        isDark={isDark}
      />
      {/* Navigation */}
      <nav className={cn("fixed top-0 left-0 right-0 z-50 backdrop-blur-md border-b transition-colors duration-300", isDark ? "bg-black/80 border-zinc-800" : "bg-white/80 border-zinc-200")}>
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-sky-600 rounded-xl flex items-center justify-center shadow-lg shadow-sky-600/20">
              <Stethoscope className="w-6 h-6 text-white" />
            </div>
            <span className={cn("text-xl font-bold tracking-tight", isDark ? "text-white" : "text-zinc-900")}>
              med<span className="text-sky-500">notes</span>
            </span>
          </div>
          <div className="hidden md:flex items-center gap-8">
            <a href="#features" className={cn("text-sm font-medium transition-colors", isDark ? "text-zinc-400 hover:text-sky-400" : "text-zinc-600 hover:text-sky-600")}>Features</a>
            <a href="#security" className={cn("text-sm font-medium transition-colors", isDark ? "text-zinc-400 hover:text-sky-400" : "text-zinc-600 hover:text-sky-600")}>Security</a>
            <a href="#contact" className={cn("text-sm font-medium transition-colors", isDark ? "text-zinc-400 hover:text-sky-400" : "text-zinc-600 hover:text-sky-600")}>Contact</a>
            <Button onClick={toggleTheme} variant="ghost" className="p-2.5 h-auto rounded-full">
              {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </Button>
            <Button onClick={() => setIsAuthModalOpen(true)} variant="ghost" className={cn("rounded-full px-6", isDark ? "text-white hover:bg-zinc-900" : "text-zinc-900 hover:bg-zinc-100")}>Log In</Button>
            <Button onClick={() => setIsAuthModalOpen(true)} className="rounded-full px-8 bg-sky-600 hover:bg-sky-500 text-white shadow-lg shadow-sky-600/20">Get Started</Button>
          </div>
          <div className="flex items-center gap-4 md:hidden">
            <Button onClick={toggleTheme} variant="ghost" className="p-2.5 h-auto rounded-full">
              {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </Button>
            <Button onClick={() => setIsAuthModalOpen(true)} className="rounded-full px-6 bg-sky-600 hover:bg-sky-500 text-white">Get Started</Button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-40 pb-20 px-6">
        <div className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-20 items-center">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6 }}
          >
            <div className={cn("inline-flex items-center gap-2 px-4 py-2 rounded-full border mb-8", isDark ? "bg-zinc-900 border-zinc-800" : "bg-sky-50 border-sky-100")}>
              <Sparkles className="w-4 h-4 text-sky-400" />
              <span className="text-xs font-bold text-sky-400 uppercase tracking-wider">AI-Powered Documentation</span>
            </div>
            <h1 className="text-6xl lg:text-7xl font-bold leading-[1.1] tracking-tight mb-8">
              Focus on the <span className="text-sky-400">Patient</span>, not the Paperwork.
            </h1>
            <p className={cn("text-xl leading-relaxed mb-12 max-w-xl", isDark ? "text-zinc-400" : "text-zinc-600")}>
              mednotes transforms clinical conversations into structured SOAP notes in seconds. Secure, HIPAA-ready, and built for modern healthcare.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <Button onClick={() => setIsAuthModalOpen(true)} className="h-16 px-10 text-lg rounded-2xl bg-sky-600 hover:bg-sky-500 text-white shadow-xl shadow-sky-600/20">
                Start Free Trial
              </Button>
              <Button 
                variant="ghost" 
                onClick={() => setIsDemoOpen(true)}
                className={cn("h-16 px-10 text-lg rounded-2xl border transition-colors", isDark ? "border-zinc-800 text-white hover:bg-zinc-900" : "border-zinc-200 text-zinc-900 hover:bg-zinc-50")}
              >
                <Play className="w-4 h-4 mr-2 fill-current" />
                Watch Demo
              </Button>
            </div>
            <div className="mt-12 flex items-center gap-6">
              <div className="flex -space-x-3">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className={cn("w-10 h-10 rounded-full border-2 flex items-center justify-center overflow-hidden", isDark ? "border-black bg-zinc-800" : "border-white bg-zinc-100")}>
                    <img src={`https://picsum.photos/seed/doc${i}/100/100`} alt="Doctor" referrerPolicy="no-referrer" />
                  </div>
                ))}
              </div>
              <p className={cn("text-sm font-medium", isDark ? "text-zinc-500" : "text-zinc-400")}>Trusted by 500+ clinicians worldwide</p>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="relative"
          >
            <div className="absolute -inset-4 bg-sky-600/10 rounded-[60px] blur-3xl" />
            <div className={cn("relative rounded-[48px] border shadow-2xl overflow-hidden transition-colors", isDark ? "bg-zinc-900 border-zinc-800" : "bg-white border-zinc-200")}>
              <div className={cn("p-8 border-b flex items-center justify-between transition-colors", isDark ? "bg-zinc-950/50 border-zinc-800" : "bg-zinc-50/50 border-zinc-200")}>
                <div className="flex gap-2">
                  <div className="w-3 h-3 rounded-full bg-red-500/50" />
                  <div className="w-3 h-3 rounded-full bg-amber-500/50" />
                  <div className="w-3 h-3 rounded-full bg-emerald-500/50" />
                </div>
                <div className={cn("px-4 py-1 rounded-full border text-[10px] font-bold text-sky-400 uppercase tracking-widest", isDark ? "bg-zinc-900 border-zinc-800" : "bg-white border-zinc-200")}>
                  Live Transcription
                </div>
              </div>
              <div className="p-10 space-y-6">
                <div className="flex gap-4">
                  <div className={cn("w-10 h-10 rounded-full flex items-center justify-center shrink-0", isDark ? "bg-zinc-800" : "bg-sky-50")}>
                    <Mic className="w-5 h-5 text-sky-400" />
                  </div>
                  <div className="space-y-2 flex-1">
                    <div className={cn("h-4 rounded-full w-3/4 animate-pulse", isDark ? "bg-zinc-800" : "bg-zinc-100")} />
                    <div className={cn("h-4 rounded-full w-1/2 animate-pulse", isDark ? "bg-zinc-800" : "bg-zinc-100")} />
                  </div>
                </div>
                <div className={cn("pt-6 border-t", isDark ? "border-zinc-800" : "border-zinc-100")}>
                  <div className="flex items-center gap-2 mb-4">
                    <Sparkles className="w-4 h-4 text-sky-400" />
                    <span className="text-xs font-bold text-sky-400 uppercase tracking-widest">AI Structured Note</span>
                  </div>
                  <div className="space-y-4">
                    <div className={cn("p-4 rounded-2xl border transition-colors", isDark ? "bg-zinc-950/50 border-zinc-800" : "bg-zinc-50/50 border-zinc-200")}>
                      <p className={cn("text-xs font-bold uppercase mb-2", isDark ? "text-zinc-600" : "text-zinc-400")}>Subjective</p>
                      <p className={cn("text-sm leading-relaxed", isDark ? "text-zinc-400" : "text-zinc-600")}>Patient reports persistent cough for 3 days, worsening at night. No fever noted.</p>
                    </div>
                    <div className={cn("p-4 rounded-2xl border transition-colors", isDark ? "bg-zinc-950/50 border-zinc-800" : "bg-zinc-50/50 border-zinc-200")}>
                      <p className={cn("text-xs font-bold uppercase mb-2", isDark ? "text-zinc-600" : "text-zinc-400")}>Objective</p>
                      <p className={cn("text-sm leading-relaxed", isDark ? "text-zinc-400" : "text-zinc-600")}>Vitals stable. Lung sounds clear bilaterally. No signs of respiratory distress.</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Features Grid */}
      <section id="features" className={cn("py-32 transition-colors", isDark ? "bg-black" : "bg-zinc-50")}>
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center max-w-2xl mx-auto mb-20">
            <h2 className="text-4xl font-bold mb-6 tracking-tight">Built for Clinical Excellence</h2>
            <p className={cn("text-lg", isDark ? "text-zinc-500" : "text-zinc-600")}>Everything you need to streamline your workflow and focus on what matters most.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                icon: <Mic className="w-8 h-8" />,
                title: "Ambient Scribe",
                desc: "Manage your documentation and patient records with AI-powered clinical insights."
              },
              {
                icon: <Brain className="w-8 h-8" />,
                title: "Smart Analysis",
                desc: "Get instant differential diagnoses and follow-up suggestions based on your notes."
              },
              {
                icon: <Layout className="w-8 h-8" />,
                title: "Custom Templates",
                desc: "Create and reuse templates for different specialties and visit types."
              },
              {
                icon: <Shield className="w-8 h-8" />,
                title: "HIPAA Compliant",
                desc: "Enterprise-grade security ensuring patient data is always protected and encrypted."
              },
              {
                icon: <Zap className="w-8 h-8" />,
                title: "Instant Export",
                desc: "Copy formatted notes directly into your EMR with a single click."
              },
              {
                icon: <Users className="w-8 h-8" />,
                title: "Patient Registry",
                desc: "Keep all patient records organized and easily accessible in one secure place."
              }
            ].map((feature, i) => (
              <motion.div
                key={i}
                whileHover={{ y: -5 }}
                className={cn("p-10 rounded-[40px] border shadow-sm hover:shadow-xl transition-all", isDark ? "bg-zinc-900 border-zinc-800 hover:shadow-sky-900/5" : "bg-white border-zinc-200 hover:shadow-sky-600/5")}
              >
                <div className={cn("w-16 h-16 rounded-2xl flex items-center justify-center text-sky-400 mb-8", isDark ? "bg-zinc-800" : "bg-sky-50")}>
                  {feature.icon}
                </div>
                <h3 className="text-xl font-bold mb-4">{feature.title}</h3>
                <p className={cn("leading-relaxed", isDark ? "text-zinc-500" : "text-zinc-600")}>{feature.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Security Section */}
      <section id="security" className="py-32">
        <div className="max-w-7xl mx-auto px-6">
          <div className={cn("rounded-[60px] p-12 lg:p-24 overflow-hidden relative border transition-colors", isDark ? "bg-zinc-900 border-zinc-800" : "bg-zinc-950 border-zinc-800")}>
            <div className="absolute top-0 right-0 w-1/2 h-full bg-sky-900/10 blur-3xl rounded-full translate-x-1/2" />
            <div className="relative z-10 grid lg:grid-cols-2 gap-20 items-center">
              <div>
                <div className={cn("inline-flex items-center gap-2 px-4 py-2 rounded-full border mb-8", isDark ? "bg-zinc-800 border-zinc-700" : "bg-zinc-800 border-zinc-700")}>
                  <Shield className="w-4 h-4 text-sky-400" />
                  <span className="text-xs font-bold text-sky-400 uppercase tracking-wider">Enterprise Security</span>
                </div>
                <h2 className="text-4xl lg:text-5xl font-bold mb-8 leading-tight text-white">Your Data Security is Our Priority</h2>
                <div className="space-y-6">
                  {[
                    "End-to-end encryption for all patient data",
                    "HIPAA & GDPR compliant processing",
                    "Regular third-party security audits",
                    "No data used for training public models"
                  ].map((item, i) => (
                    <div key={i} className="flex items-center gap-4">
                      <div className="w-6 h-6 rounded-full bg-sky-400/10 flex items-center justify-center shrink-0">
                        <CheckCircle className="w-4 h-4 text-sky-400" />
                      </div>
                      <span className="text-lg text-zinc-300">{item}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-12">
                  <Button 
                    variant="ghost" 
                    className="text-white border-zinc-800 hover:bg-zinc-800 rounded-2xl px-8 h-14 border"
                    onClick={() => window.location.href = 'mailto:snsb767@gmail.com'}
                  >
                    <Mail className="w-4 h-4 mr-2 text-sky-400" />
                    Contact Security Officer
                  </Button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-6">
                <div className="p-8 bg-zinc-950 rounded-3xl border border-zinc-800 backdrop-blur-sm">
                  <p className="text-4xl font-bold mb-2 text-white">99.9%</p>
                  <p className="text-sm text-zinc-600 uppercase tracking-widest font-bold">Uptime</p>
                </div>
                <div className="p-8 bg-zinc-950 rounded-3xl border border-zinc-800 backdrop-blur-sm">
                  <p className="text-4xl font-bold mb-2 text-white">256-bit</p>
                  <p className="text-sm text-zinc-600 uppercase tracking-widest font-bold">Encryption</p>
                </div>
                <div className="p-8 bg-zinc-950 rounded-3xl border border-zinc-800 backdrop-blur-sm">
                  <p className="text-4xl font-bold mb-2 text-white">SOC2</p>
                  <p className="text-sm text-zinc-600 uppercase tracking-widest font-bold">Certified</p>
                </div>
                <div className="p-8 bg-zinc-950 rounded-3xl border border-zinc-800 backdrop-blur-sm">
                  <p className="text-4xl font-bold mb-2 text-white">BAA</p>
                  <p className="text-sm text-zinc-600 uppercase tracking-widest font-bold">Available</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Contact & Recommendations Section */}
      <section id="contact" className={cn("py-32 transition-colors", isDark ? "bg-black" : "bg-zinc-50")}>
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid lg:grid-cols-2 gap-20 items-center">
            <div>
              <div className={cn("inline-flex items-center gap-2 px-4 py-2 rounded-full border mb-8", isDark ? "bg-zinc-900 border-zinc-800" : "bg-sky-50 border-sky-100")}>
                <MessageSquare className="w-4 h-4 text-sky-400" />
                <span className="text-xs font-bold text-sky-400 uppercase tracking-wider">Feedback & Recommendations</span>
              </div>
              <h2 className="text-4xl lg:text-5xl font-bold mb-8 leading-tight">Help us build the <span className="text-sky-400">future</span> of mednotes.</h2>
              <p className={cn("text-lg mb-12", isDark ? "text-zinc-500" : "text-zinc-600")}>
                We're always looking for ways to improve. Share your recommendations, feature requests, or feedback directly with our team.
              </p>
              <div className="flex items-center gap-6">
                <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center", isDark ? "bg-zinc-900 text-sky-400" : "bg-white text-sky-400 shadow-sm")}>
                  <Mail className="w-6 h-6" />
                </div>
                <div>
                  <p className={cn("text-xs font-bold uppercase tracking-widest mb-1", isDark ? "text-zinc-600" : "text-zinc-400")}>Direct Email</p>
                  <p className="font-bold">snsb767@gmail.com</p>
                </div>
              </div>
            </div>

            <div className={cn("p-10 rounded-[48px] border shadow-xl transition-colors", isDark ? "bg-zinc-900 border-zinc-800" : "bg-white border-zinc-200")}>
              {isSubmitted ? (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="h-full flex flex-col items-center justify-center text-center py-12"
                >
                  <div className="w-20 h-20 bg-emerald-500/10 rounded-full flex items-center justify-center mb-6">
                    <CheckCircle className="w-10 h-10 text-emerald-500" />
                  </div>
                  <h3 className="text-2xl font-bold mb-4">Thank You!</h3>
                  <p className={cn("text-lg max-w-xs", isDark ? "text-zinc-500" : "text-zinc-600")}>
                    Your recommendation has been sent directly to our team. We appreciate your feedback!
                  </p>
                  <Button 
                    variant="ghost" 
                    onClick={() => setIsSubmitted(false)}
                    className="mt-8 rounded-xl border border-zinc-200 dark:border-zinc-800"
                  >
                    Send Another
                  </Button>
                </motion.div>
              ) : (
                <form 
                  onSubmit={async (e) => {
                    e.preventDefault();
                    setIsSubmitting(true);
                    const formData = new FormData(e.currentTarget);
                    const data = {
                      name: formData.get('name'),
                      email: formData.get('email'),
                      recommend: formData.get('recommend'),
                    };

                    try {
                      const response = await fetch('/api/recommendation', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(data),
                      });
                      
                      if (response.ok) {
                        setIsSubmitted(true);
                        setToast({ message: "Thank you for your feedback!", type: 'success' });
                      } else {
                        // Fallback to mailto if API fails
                        const body = `Name: ${data.name}\nEmail: ${data.email}\n\nRecommendation:\n${data.recommend}`;
                        window.location.href = `mailto:snsb767@gmail.com?subject=mednotes Recommendation&body=${encodeURIComponent(body)}`;
                        setIsSubmitted(true); // Show thank you even if it falls back
                      }
                    } catch (error) {
                      console.error("Error submitting recommendation:", error);
                      // Fallback to mailto
                      const body = `Name: ${data.name}\nEmail: ${data.email}\n\nRecommendation:\n${data.recommend}`;
                      window.location.href = `mailto:snsb767@gmail.com?subject=mednotes Recommendation&body=${encodeURIComponent(body)}`;
                      setIsSubmitted(true);
                    } finally {
                      setIsSubmitting(false);
                    }
                  }}
                  className="space-y-6"
                >
                  <div className="space-y-2">
                    <label className={cn("text-[11px] font-bold uppercase tracking-widest ml-4", isDark ? "text-zinc-500" : "text-zinc-400")}>Your Name</label>
                    <Input name="name" placeholder="John Doe" required />
                  </div>
                  <div className="space-y-2">
                    <label className={cn("text-[11px] font-bold uppercase tracking-widest ml-4", isDark ? "text-zinc-500" : "text-zinc-400")}>Your Email</label>
                    <Input name="email" type="email" placeholder="john@example.com" required />
                  </div>
                  <div className="space-y-2">
                    <label className={cn("text-[11px] font-bold uppercase tracking-widest ml-4", isDark ? "text-zinc-500" : "text-zinc-400")}>Your Recommendation</label>
                    <textarea 
                      name="recommend"
                      required
                      className={cn(
                        "w-full h-40 rounded-[32px] border p-6 text-sm focus:ring-2 focus:ring-sky-500/20 focus:outline-none resize-none transition-colors",
                        isDark ? "bg-black border-zinc-800 text-white" : "bg-zinc-50 border-zinc-200 text-zinc-900"
                      )}
                      placeholder="Tell us how we can improve..."
                    />
                  </div>
                  <Button 
                    type="submit" 
                    disabled={isSubmitting}
                    className="w-full h-16 rounded-2xl bg-sky-600 hover:bg-sky-500 text-white shadow-lg shadow-sky-600/20 disabled:opacity-50"
                  >
                    {isSubmitting ? (
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Sending...
                      </div>
                    ) : (
                      <>
                        <Send className="w-4 h-4 mr-2" />
                        Send Recommendation
                      </>
                    )}
                  </Button>
                </form>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Landing Page Footer Removed */}

      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.9 }}
            className={cn(
              "fixed bottom-8 right-8 z-[100] px-6 py-4 rounded-2xl shadow-2xl border flex items-center gap-3",
              isDark ? "bg-zinc-900 border-zinc-800" : "bg-white border-zinc-200"
            )}
          >
            <div className={cn(
              "w-8 h-8 rounded-full flex items-center justify-center",
              toast.type === 'success' ? "bg-emerald-500/10 text-emerald-500" : "bg-rose-500/10 text-rose-500"
            )}>
              {toast.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
            </div>
            <p className="text-sm font-bold font-sans">{toast.message}</p>
            <button 
              onClick={() => setToast(null)}
              className={cn("ml-4 p-1 rounded-lg transition-colors", isDark ? "hover:bg-zinc-800" : "hover:bg-zinc-100")}
            >
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const CreativeCheckbox = ({ checked, onChange, isDark, className }: { checked: boolean, onChange: (checked: boolean) => void, isDark: boolean, className?: string }) => {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onChange(!checked);
      }}
      className={cn(
        "relative flex items-center justify-center rounded-full border transition-all duration-300 overflow-hidden group",
        checked 
          ? "bg-sky-500 border-sky-500 shadow-lg shadow-sky-500/30" 
          : isDark ? "bg-zinc-950 border-zinc-800 hover:border-zinc-700" : "bg-white border-zinc-200 hover:border-zinc-300",
        className
      )}
    >
      <AnimatePresence mode="wait">
        {checked ? (
          <motion.div
            key="checked"
            initial={{ scale: 0, rotate: -45 }}
            animate={{ scale: 1, rotate: 0 }}
            exit={{ scale: 0, rotate: 45 }}
            transition={{ type: "spring", stiffness: 400, damping: 25 }}
          >
            <Check className="w-3 h-3 text-white stroke-[3.5]" />
          </motion.div>
        ) : (
          <motion.div
            key="unchecked"
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.5 }}
            className={cn("w-1 h-1 rounded-full transition-colors", isDark ? "bg-zinc-800 group-hover:bg-zinc-700" : "bg-zinc-100 group-hover:bg-zinc-200")}
          />
        )}
      </AnimatePresence>
    </button>
  );
};

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    const saved = localStorage.getItem('mednotes-theme');
    return (saved as 'dark' | 'light') || 'dark';
  });
  const [patients, setPatients] = useState<Patient[]>([]);
  const [notes, setNotes] = useState<ClinicalNote[]>([]);
  const [templates, setTemplates] = useState<NoteTemplate[]>([]);
  const [toast, setToast] = useState<{ message: string, type: 'success' | 'error' } | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<'welcome' | 'patients' | 'notes' | 'templates' | 'performance' | 'research' | 'image-analysis'>('welcome');

  useEffect(() => {
    localStorage.setItem('mednotes-theme', theme);
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  useEffect(() => {
    setSelectedIds([]);
  }, [activeTab]);

  const toggleTheme = () => setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  const [performanceData, setPerformanceData] = useState<{
    current: WeeklyStats;
    previous: WeeklyStats;
  }>({
    current: {
      week_number: getWeekNumber(new Date()),
      notes_written: 0,
      typing_speed_wpm: 0,
      error_rate: 0,
      structure_score: 0,
      clinical_reasoning_score: 0,
      timestamp: null,
    },
    previous: {
      week_number: getWeekNumber(new Date()) - 1,
      notes_written: 0,
      typing_speed_wpm: 0,
      error_rate: 0,
      structure_score: 0,
      clinical_reasoning_score: 0,
      timestamp: null,
    },
  });
  const [performanceReport, setPerformanceReport] = useState<EvaluationReport | null>(null);
  const [isGeneratingPerformance, setIsGeneratingPerformance] = useState(false);
  
  // New AI Features State
  const [researchQuery, setResearchQuery] = useState('');
  const [researchResult, setResearchResult] = useState('');
  const [isResearching, setIsResearching] = useState(false);
  
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [imageAnalysis, setImageAnalysis] = useState('');
  const [isAnalyzingImage, setIsAnalyzingImage] = useState(false);
  
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isRefining, setIsRefining] = useState(false);

  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [editingNote, setEditingNote] = useState<ClinicalNote | null>(null);
  const [noteStartTime, setNoteStartTime] = useState<number | null>(null);
  const [analysisGenerating, setAnalysisGenerating] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showWelcomeSquare, setShowWelcomeSquare] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setShowWelcomeSquare(false);
    }, 30000);
    return () => clearTimeout(timer);
  }, []);
  const [isAddPatientModalOpen, setIsAddPatientModalOpen] = useState(false);
  const [isAddTemplateModalOpen, setIsAddTemplateModalOpen] = useState(false);
  const [isDemoOpen, setIsDemoOpen] = useState(false);
  const [newPatientName, setNewPatientName] = useState('');
  const [newPatientDOB, setNewPatientDOB] = useState('');
  const [newPatientGender, setNewPatientGender] = useState('');
  const [newPatientContact, setNewPatientContact] = useState('');
  const [newTemplateName, setNewTemplateName] = useState('');
  const [newTemplateCategory, setNewTemplateCategory] = useState('General');
  const [newTemplateDescription, setNewTemplateDescription] = useState('');
  const [newTemplateContent, setNewTemplateContent] = useState('');

  const [confirmDelete, setConfirmDelete] = useState<{
    type: 'note' | 'patient' | 'template' | null;
    id: string | null;
    title: string | null;
  }>({ type: null, id: null, title: null });

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        // Sync user to Firestore
        const userRef = doc(db, 'users', user.uid);
        try {
          await setDoc(userRef, {
            uid: user.uid,
            email: user.email,
            displayName: user.displayName,
            photoURL: user.photoURL,
            emailVerified: user.emailVerified,
            updatedAt: serverTimestamp(),
          }, { merge: true });
        } catch (error) {
          console.error("Error syncing user:", error);
        }
        setUser(user);
      } else {
        setUser(null);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  // Data Listeners
  useEffect(() => {
    if (!user) return;

    const patientsQuery = query(
      collection(db, 'patients'),
      where('createdBy', '==', user.uid),
      orderBy('createdAt', 'desc')
    );

    const unsubscribePatients = onSnapshot(patientsQuery, (snapshot) => {
      setPatients(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Patient)));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'patients'));

    const notesQuery = query(
      collection(db, 'notes'),
      where('createdBy', '==', user.uid),
      orderBy('updatedAt', 'desc')
    );

    const unsubscribeNotes = onSnapshot(notesQuery, (snapshot) => {
      setNotes(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ClinicalNote)));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'notes'));

    const templatesQuery = query(
      collection(db, 'templates'),
      where('createdBy', '==', user.uid),
      orderBy('createdAt', 'desc')
    );

    const unsubscribeTemplates = onSnapshot(templatesQuery, (snapshot) => {
      setTemplates(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as NoteTemplate)));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'templates'));

    return () => {
      unsubscribePatients();
      unsubscribeNotes();
      unsubscribeTemplates();
    };
  }, [user]);

  useEffect(() => {
    if (notes.length === 0) return;

    const currentWeek = 13;
    const previousWeek = 12;

    const calculateStats = (weekNum: number): WeeklyStats => {
      const weekNotes = notes.filter(n => {
        const noteDate = n.createdAt?.toDate ? n.createdAt.toDate() : new Date(n.createdAt);
        return getWeekNumber(noteDate) === weekNum && n.status === 'finalized';
      });

      if (weekNotes.length === 0) {
        return {
          week_number: weekNum,
          notes_written: 0,
          typing_speed_wpm: 0,
          error_rate: 0,
          structure_score: 0,
          clinical_reasoning_score: 0,
          timestamp: null,
        };
      }

      const totalNotes = weekNotes.length;
      let totalWpm = 0;
      let totalError = 0;
      let totalStructure = 0;
      let totalReasoning = 0;

      weekNotes.forEach(n => {
        const wpm = (n.wordCount || 0) / ((n.typingTimeMs || 1) / 60000);
        totalWpm += wpm;
        totalError += (n.errorRate || 0);
        totalStructure += (n.structureScore || 0);
        totalReasoning += (n.reasoningScore || 0);
      });

      return {
        week_number: weekNum,
        notes_written: totalNotes,
        typing_speed_wpm: Math.round(totalWpm / totalNotes),
        error_rate: Math.round(totalError / totalNotes),
        structure_score: Math.round(totalStructure / totalNotes),
        clinical_reasoning_score: Math.round(totalReasoning / totalNotes),
        timestamp: null,
      };
    };

    setPerformanceData({
      current: calculateStats(currentWeek),
      previous: calculateStats(previousWeek),
    });
  }, [notes]);

  const handleGoogleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error("Google login failed:", error);
    }
  };

  const handleEmailSignUp = async (email: string, pass: string) => {
    const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
    await sendEmailVerification(userCredential.user);
  };

  const handleEmailLogin = async (email: string, pass: string) => {
    await signInWithEmailAndPassword(auth, email, pass);
  };

  const handleLogout = () => signOut(auth);

  const resendVerification = async () => {
    if (user) {
      try {
        await sendEmailVerification(user);
      } catch (error: any) {
        console.error("Resend failed:", error.message);
      }
    }
  };

  const checkVerification = async () => {
    if (user) {
      try {
        await reload(user);
        const updatedUser = auth.currentUser;
        if (updatedUser) {
          setUser({ ...updatedUser } as FirebaseUser);
          // Sync to Firestore
          const userRef = doc(db, 'users', updatedUser.uid);
          await setDoc(userRef, {
            emailVerified: updatedUser.emailVerified,
            updatedAt: serverTimestamp(),
          }, { merge: true });
        }
      } catch (error: any) {
        console.error("Check failed:", error.message);
      }
    }
  };

  const createPatient = async (name: string, dob?: string, gender?: string, contact?: string) => {
    if (!user) return;
    try {
      await addDoc(collection(db, 'patients'), {
        name,
        dateOfBirth: dob || '',
        gender: gender || '',
        contactInfo: contact || '',
        createdBy: user.uid,
        createdAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'patients');
    }
  };

  const evaluateNoteQuality = async (content: string) => {
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Evaluate the quality of this clinical note. Provide a JSON response with structureScore (0-100), reasoningScore (0-100), and errorRate (0-100).
        Note Content: ${content}`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: GenAIType.OBJECT,
            properties: {
              structureScore: { type: GenAIType.NUMBER },
              reasoningScore: { type: GenAIType.NUMBER },
              errorRate: { type: GenAIType.NUMBER },
            },
            required: ["structureScore", "reasoningScore", "errorRate"],
          },
        },
      });
      return JSON.parse(response.text || "{}");
    } catch (error) {
      console.error("Note evaluation failed:", error);
      return { structureScore: 70, reasoningScore: 70, errorRate: 10 };
    }
  };

  const createNote = async (patientId: string, type?: ClinicalNote['type'], initialContent?: string) => {
    if (!user) return;
    try {
      const docRef = await addDoc(collection(db, 'notes'), {
        patientId,
        title: type || 'New Clinical Note',
        type: type || 'Other',
        content: initialContent || '',
        status: 'draft',
        createdBy: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      const newNote = {
        id: docRef.id,
        patientId,
        title: type || 'New Clinical Note',
        type: type || 'Other',
        content: initialContent || '',
        status: 'draft' as const,
        createdBy: user.uid,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      setEditingNote(newNote);
      setNoteStartTime(Date.now());
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'notes');
    }
  };

  const saveNote = async (note: ClinicalNote) => {
    try {
      const noteRef = doc(db, 'notes', note.id);
      
      let metrics = {};
      if (noteStartTime) {
        const endTime = Date.now();
        const durationMs = endTime - noteStartTime;
        const wordCount = note.content.trim().split(/\s+/).length;
        
        metrics = {
          wordCount,
          typingTimeMs: durationMs,
        };

        if (note.status === 'finalized') {
          const evaluation = await evaluateNoteQuality(note.content);
          metrics = {
            ...metrics,
            structureScore: evaluation.structureScore,
            reasoningScore: evaluation.reasoningScore,
            errorRate: evaluation.errorRate,
          };
        }
      }

      await updateDoc(noteRef, {
        title: note.title,
        content: note.content,
        transcript: note.transcript || '',
        analysis: note.analysis || '',
        status: note.status,
        updatedAt: serverTimestamp(),
        ...metrics
      });
      setEditingNote(null);
      setNoteStartTime(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `notes/${note.id}`);
    }
  };

  const deletePatient = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'patients', id));
      if (selectedPatient?.id === id) setSelectedPatient(null);
      setConfirmDelete({ type: null, id: null, title: null });
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `patients/${id}`);
    }
  };

  const deleteNote = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'notes', id));
      if (editingNote?.id === id) setEditingNote(null);
      setConfirmDelete({ type: null, id: null, title: null });
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `notes/${id}`);
    }
  };

  const createTemplate = async (name: string, content: string, type?: ClinicalNote['type'], category?: string, description?: string) => {
    if (!user) return;
    try {
      await addDoc(collection(db, 'templates'), {
        name,
        content,
        type: type || 'Other',
        category: category || 'General',
        description: description || '',
        createdBy: user.uid,
        createdAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'templates');
    }
  };

  const deleteTemplate = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'templates', id));
      setConfirmDelete({ type: null, id: null, title: null });
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `templates/${id}`);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    
    const collectionName = activeTab === 'patients' ? 'patients' : activeTab === 'notes' ? 'notes' : activeTab === 'templates' ? 'templates' : null;
    if (!collectionName) return;

    try {
      const deletePromises = selectedIds.map(id => deleteDoc(doc(db, collectionName, id)));
      await Promise.all(deletePromises);
      setToast({ message: `Successfully deleted ${selectedIds.length} ${collectionName}`, type: 'success' });
      setSelectedIds([]);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, collectionName);
    }
  };

  const addDefaultTemplates = async () => {
    const defaults = [
      {
        name: 'General SOAP Note',
        type: 'General  SOAP  Note' as const,
        category: 'Clinical',
        description: 'Standard Subjective, Objective, Assessment, and Plan note for general visits.',
        content: `
<h1>SOAP Clinical Note</h1>
<br/>
<h2>Subjective</h2>
<ul>
  <li><strong>Chief Complaint:</strong> </li>
  <li><strong>History of Presenting Illness:</strong> </li>
  <li><strong>Review of Systems:</strong> </li>
  <li><strong>Past Medical History:</strong> </li>
</ul>
<br/>
<h2>Objective</h2>
<ul>
  <li><strong>Vitals:</strong> </li>
  <li><strong>Physical Examination:</strong> </li>
  <li><strong>Diagnostic Results:</strong> </li>
</ul>
<br/>
<h2>Assessment</h2>
<ul>
  <li><strong>Diagnosis:</strong> </li>
  <li><strong>Differential Diagnosis:</strong> </li>
</ul>
<br/>
<h2>Plan</h2>
<ul>
  <li><strong>Medications:</strong> </li>
  <li><strong>Referrals:</strong> </li>
  <li><strong>Follow-up:</strong> </li>
  <li><strong>Patient Education:</strong> </li>
</ul>
`
      },
      {
        name: 'Admission Note',
        type: 'Admission Note' as const,
        category: 'Inpatient',
        description: 'Comprehensive note for hospital admission.',
        content: `
<h1>Admission Note</h1>
<br/>
<h2>Reason for Admission</h2>
<ul>
  <li></li>
</ul>
<br/>
<h2>History of Present Illness</h2>
<ul>
  <li></li>
</ul>
<br/>
<h2>Past Medical History</h2>
<ul>
  <li></li>
</ul>
<br/>
<h2>Medications & Allergies</h2>
<ul>
  <li><strong>Current Medications:</strong> </li>
  <li><strong>Allergies:</strong> </li>
</ul>
<br/>
<h2>Physical Exam</h2>
<ul>
  <li><strong>General Appearance:</strong> </li>
  <li><strong>HEENT:</strong> </li>
  <li><strong>Cardiovascular:</strong> </li>
  <li><strong>Respiratory:</strong> </li>
  <li><strong>Abdomen:</strong> </li>
  <li><strong>Neurological:</strong> </li>
</ul>
<br/>
<h2>Assessment & Plan</h2>
<ul>
  <li><strong>Primary Diagnosis:</strong> </li>
  <li><strong>Management Plan:</strong> </li>
</ul>
`
      },
      {
        name: 'Discharge Summary',
        type: 'Discharge Summary' as const,
        category: 'Inpatient',
        description: 'Summary of hospital course and discharge instructions.',
        content: `
<h1>Discharge Summary</h1>
<br/>
<h2>Patient Information</h2>
<ul>
  <li><strong>Date of Admission:</strong> </li>
  <li><strong>Date of Discharge:</strong> </li>
</ul>
<br/>
<h2>Diagnoses</h2>
<ul>
  <li><strong>Admission Diagnosis:</strong> </li>
  <li><strong>Discharge Diagnosis:</strong> </li>
</ul>
<br/>
<h2>Hospital Course</h2>
<ul>
  <li><strong>Summary of Procedures/Treatments:</strong> </li>
  <li><strong>Complications:</strong> </li>
</ul>
<br/>
<h2>Discharge Plan</h2>
<ul>
  <li><strong>Condition at Discharge:</strong> </li>
  <li><strong>Discharge Medications:</strong> </li>
  <li><strong>Follow-up Instructions:</strong> </li>
  <li><strong>Pending Results:</strong> </li>
</ul>
`
      },
      {
        name: 'Mental Status Exam',
        type: 'Mental Status Exam' as const,
        category: 'Psychiatry',
        description: 'Detailed assessment of mental state and behavioral observations.',
        content: `
<h1>Mental Status Examination</h1>
<br/>
<h2>Appearance & Behavior</h2>
<ul>
  <li><strong>Appearance:</strong> </li>
  <li><strong>Eye Contact:</strong> </li>
  <li><strong>Psychomotor Activity:</strong> </li>
</ul>
<br/>
<h2>Speech & Language</h2>
<ul>
  <li><strong>Rate/Volume/Tone:</strong> </li>
</ul>
<br/>
<h2>Mood & Affect</h2>
<ul>
  <li><strong>Patient's Reported Mood:</strong> </li>
  <li><strong>Observed Affect:</strong> </li>
</ul>
<br/>
<h2>Thought Process & Content</h2>
<ul>
  <li><strong>Thought Process:</strong> </li>
  <li><strong>Thought Content:</strong> </li>
  <li><strong>Suicidal/Homicidal Ideation:</strong> </li>
</ul>
<br/>
<h2>Cognition</h2>
<ul>
  <li><strong>Orientation:</strong> </li>
  <li><strong>Memory:</strong> </li>
  <li><strong>Attention/Concentration:</strong> </li>
</ul>
<br/>
<h2>Insight & Judgment</h2>
<ul>
  <li><strong>Insight:</strong> </li>
  <li><strong>Judgment:</strong> </li>
</ul>
`
      },
      {
        name: 'Pediatric Well-Visit',
        type: 'Other' as const,
        category: 'Pediatrics',
        description: 'Template for routine pediatric developmental assessments.',
        content: `
<h1>Pediatric Well-Visit</h1>
<br/>
<h2>Developmental Milestones</h2>
<ul>
  <li><strong>Gross Motor:</strong> </li>
  <li><strong>Fine Motor:</strong> </li>
  <li><strong>Social/Language:</strong> </li>
</ul>
<br/>
<h2>Nutrition & Growth</h2>
<ul>
  <li><strong>Dietary Intake:</strong> </li>
  <li><strong>Growth Percentiles:</strong> </li>
</ul>
<br/>
<h2>Immunizations</h2>
<ul>
  <li><strong>Due Today:</strong> </li>
  <li><strong>Administered:</strong> </li>
</ul>
<br/>
<h2>Anticipatory Guidance</h2>
<ul>
  <li><strong>Safety:</strong> </li>
  <li><strong>Development:</strong> </li>
</ul>
`
      }
    ];

    for (const t of defaults) {
      await createTemplate(t.name, t.content, t.type, t.category, t.description);
    }
  };

  const handleTemplateUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const content = event.target?.result as string;
      const name = file.name.replace(/\.[^/.]+$/, ""); // Remove extension
      await createTemplate(name, content);
    };
    reader.readAsText(file);
    // Reset input
    e.target.value = '';
  };

  const analyzeNote = async () => {
    if (!editingNote?.content) return;
    setAnalysisGenerating(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Analyze the following clinical note specifically according to SOAP (Subjective, Objective, Assessment, Plan) criteria. 
        
        Provide a structured evaluation that:
        1. Evaluates the 'Subjective' section for completeness of patient history and symptoms.
        2. Checks the 'Objective' section for clear clinical findings and vital signs.
        3. Assesses the 'Assessment' for logical clinical reasoning and differential diagnoses.
        4. Reviews the 'Plan' for specific, actionable follow-up steps.
        5. Identifies any missing critical information or inconsistencies.
        
        Include a strong disclaimer that this is AI-generated and not a medical diagnosis.
        
        Clinical Note:
        ${editingNote.content}`,
        config: {
          systemInstruction: "You are a senior clinical auditor. Your goal is to ensure clinical notes meet the highest SOAP documentation standards. Be critical, precise, and helpful. Always include a clear disclaimer that your analysis is for informational purposes only and does not constitute medical advice or diagnosis.",
        }
      });
      
      if (response.text) {
        setEditingNote(prev => prev ? ({ ...prev, analysis: response.text || '' }) : null);
      }
    } catch (error) {
      console.error("Analysis failed:", error);
    } finally {
      setAnalysisGenerating(false);
    }
  };

  const handleGeneratePerformanceReport = async () => {
    setIsGeneratingPerformance(true);
    try {
      const result = await generateEvaluation(performanceData.current, performanceData.previous);
      setPerformanceReport(result);
      if (user) {
        await addDoc(collection(db, 'performance_reports'), {
          ...result,
          metrics: performanceData,
          createdBy: user.uid,
          createdAt: serverTimestamp()
        });
      }
    } catch (error) {
      console.error("Performance report generation failed:", error);
    } finally {
      setIsGeneratingPerformance(false);
    }
  };

  const handleResearch = async () => {
    if (!researchQuery) return;
    setIsResearching(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Research the following medical topic for clinical documentation purposes: ${researchQuery}`,
        config: {
          tools: [{ googleSearch: {} }],
        },
      });
      setResearchResult(response.text || "No results found.");
    } catch (error) {
      console.error("Research failed:", error);
    } finally {
      setIsResearching(false);
    }
  };

  const handleAnalyzeImage = async (base64Data: string) => {
    setIsAnalyzingImage(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: [
          {
            inlineData: {
              data: base64Data.split(',')[1],
              mimeType: "image/png",
            },
          },
          { text: "Analyze this medical document or image. Extract key clinical findings and provide a summary for documentation." },
        ],
      });
      setImageAnalysis(response.text || "Analysis failed.");
    } catch (error) {
      console.error("Image analysis failed:", error);
    } finally {
      setIsAnalyzingImage(false);
    }
  };

  const handleTTS = async (text: string) => {
    if (!text) return;
    setIsSpeaking(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text: `Read this clinical report: ${text}` }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Kore' },
            },
          },
        },
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (base64Audio) {
        // Decode base64 to Uint8Array
        const binaryString = window.atob(base64Audio);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        
        // Create AudioContext
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        
        // Convert Uint8Array to Int16Array (16-bit PCM)
        // Since we're using bytes.buffer, we should ensure the length is even
        const int16Data = new Int16Array(bytes.buffer);
        
        // Create AudioBuffer (Mono, 24kHz)
        const audioBuffer = audioContext.createBuffer(1, int16Data.length, 24000);
        const channelData = audioBuffer.getChannelData(0);
        
        // Normalize Int16 to Float32 (-1.0 to 1.0)
        for (let i = 0; i < int16Data.length; i++) {
          channelData[i] = int16Data[i] / 32768.0;
        }
        
        // Play the buffer
        const source = audioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(audioContext.destination);
        source.onended = () => {
          setIsSpeaking(false);
          audioContext.close();
        };
        source.start();
      } else {
        setIsSpeaking(false);
      }
    } catch (error) {
      console.error("TTS failed:", error);
      setIsSpeaking(false);
    }
  };

  const handleRefineNote = async () => {
    if (!editingNote?.content) return;
    setIsRefining(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-3.1-flash-lite-preview",
        contents: `Refine this clinical note for clarity, professionalism, and medical accuracy while maintaining the original meaning: ${editingNote.content}`,
        config: {
          systemInstruction: "You are a professional medical scribe. Your goal is to refine clinical notes to be more professional and accurate.",
        }
      });
      if (response.text) {
        setEditingNote(prev => prev ? ({ ...prev, content: response.text || '' }) : null);
      }
    } catch (error) {
      console.error("Refinement failed:", error);
    } finally {
      setIsRefining(true);
      setTimeout(() => setIsRefining(false), 1000); // Visual feedback
    }
  };

  if (loading) {
    return (
      <div className={cn("min-h-screen flex items-center justify-center transition-colors", theme === 'dark' ? "bg-black" : "bg-white")}>
        <div className="flex flex-col items-center gap-6">
          <div className="w-16 h-16 bg-sky-600 rounded-2xl flex items-center justify-center animate-bounce shadow-xl shadow-sky-600/20">
            <Stethoscope className="w-10 h-10 text-white" />
          </div>
          <div className="flex gap-2">
            <div className="w-2 h-2 rounded-full bg-sky-600 animate-pulse" />
            <div className="w-2 h-2 rounded-full bg-sky-600 animate-pulse delay-75" />
            <div className="w-2 h-2 rounded-full bg-sky-600 animate-pulse delay-150" />
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <LandingPage 
        onGoogleLogin={handleGoogleLogin} 
        onEmailSignUp={handleEmailSignUp}
        onEmailLogin={handleEmailLogin}
        theme={theme} 
        toggleTheme={toggleTheme} 
      />
    );
  }

  if (!user.emailVerified) {
    return (
      <VerificationScreen 
        user={user} 
        onResend={resendVerification} 
        onCheck={checkVerification} 
        onLogout={handleLogout} 
        isDark={theme === 'dark'} 
      />
    );
  }

  const isDark = theme === 'dark';

  return (
    <ErrorBoundary>
      <DemoModal isOpen={isDemoOpen} onClose={() => setIsDemoOpen(false)} isDark={isDark} />
      <div className={cn("min-h-screen flex flex-col font-sans relative transition-colors duration-300", isDark ? "bg-black text-white" : "bg-zinc-50 text-zinc-900")}>
        <div className={cn("bg-noise opacity-[0.03]", isDark ? "opacity-[0.03]" : "opacity-[0.01]")} />
        {/* Header */}
        <header className={cn("h-20 backdrop-blur-md border-b px-8 flex items-center justify-between sticky top-0 z-30 transition-colors duration-300", isDark ? "bg-black/80 border-zinc-800" : "bg-white/80 border-zinc-200")}>
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-sky-600 rounded-2xl flex items-center justify-center shadow-lg shadow-sky-600/20">
              <Stethoscope className="w-5 h-5 text-white" />
            </div>
            <span className={cn("font-sans text-2xl font-bold tracking-tight transition-colors", isDark ? "text-white" : "text-zinc-900")}>
              med<span className="text-sky-500">notes</span>
            </span>
          </div>
          
          <div className="flex items-center gap-6">
            <Button variant="ghost" className="p-2.5 h-auto rounded-full" onClick={toggleTheme}>
              {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </Button>
            <div className={cn("flex items-center gap-3 px-4 py-2 rounded-full border transition-colors", isDark ? "bg-zinc-900 border-zinc-800" : "bg-white border-zinc-200")}>
              <img src={user.photoURL || ''} alt="" className="w-7 h-7 rounded-full" />
              <span className={cn("text-sm font-medium transition-colors", isDark ? "text-zinc-400" : "text-zinc-600")}>{user.displayName}</span>
            </div>
            <Button variant="ghost" className={cn("p-2.5 h-auto rounded-full transition-colors", isDark ? "text-zinc-400 hover:text-white hover:bg-zinc-900" : "text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100")} onClick={handleLogout}>
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </header>

        <main className="flex-1 flex overflow-hidden">
          {/* Sidebar */}
          <aside className={cn("w-72 border-r backdrop-blur-sm hidden md:flex flex-col transition-colors duration-300", isDark ? "border-zinc-800 bg-black/40" : "border-zinc-200 bg-white/40")}>
            <nav className="p-6 space-y-2">
              <button 
                onClick={() => { setActiveTab('welcome'); setSelectedPatient(null); setEditingNote(null); }}
                className={cn(
                  "w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl text-sm font-medium transition-all",
                  activeTab === 'welcome' 
                    ? "bg-sky-600 text-white shadow-lg shadow-sky-600/20" 
                    : isDark ? "text-zinc-500 hover:bg-zinc-900 hover:text-zinc-300" : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
                )}
              >
                <Sparkles className="w-4 h-4" />
                Welcome
              </button>
              <button 
                onClick={() => { setActiveTab('patients'); setSelectedPatient(null); setEditingNote(null); }}
                className={cn(
                  "w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl text-sm font-medium transition-all",
                  activeTab === 'patients' 
                    ? "bg-sky-600 text-white shadow-lg shadow-sky-600/20" 
                    : isDark ? "text-zinc-500 hover:bg-zinc-900 hover:text-zinc-300" : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
                )}
              >
                <Users className="w-4 h-4" />
                Patients
              </button>
              <button 
                onClick={() => { setActiveTab('notes'); setSelectedPatient(null); setEditingNote(null); }}
                className={cn(
                  "w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl text-sm font-medium transition-all",
                  activeTab === 'notes' 
                    ? "bg-sky-600 text-white shadow-lg shadow-sky-600/20" 
                    : isDark ? "text-zinc-500 hover:bg-zinc-900 hover:text-zinc-300" : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
                )}
              >
                <FileText className="w-4 h-4" />
                All Notes
              </button>
              <button 
                onClick={() => { setActiveTab('templates'); setSelectedPatient(null); setEditingNote(null); }}
                className={cn(
                  "w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl text-sm font-medium transition-all",
                  activeTab === 'templates' 
                    ? "bg-sky-600 text-white shadow-lg shadow-sky-600/20" 
                    : isDark ? "text-zinc-500 hover:bg-zinc-900 hover:text-zinc-300" : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
                )}
              >
                <Layout className="w-4 h-4" />
                Templates
              </button>
              <button 
                onClick={() => { setActiveTab('performance'); setSelectedPatient(null); setEditingNote(null); }}
                className={cn(
                  "w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl text-sm font-medium transition-all",
                  activeTab === 'performance' 
                    ? "bg-sky-600 text-white shadow-lg shadow-sky-600/20" 
                    : isDark ? "text-zinc-500 hover:bg-zinc-900 hover:text-zinc-300" : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
                )}
              >
                <BarChart3 className="w-4 h-4" />
                Performance
              </button>

              <div className="pt-4 mt-4 border-t border-zinc-100 dark:border-zinc-800 space-y-2">
                <p className="px-4 text-[10px] font-bold uppercase tracking-widest text-zinc-400 dark:text-zinc-600">AI Clinical Tools</p>
                <button 
                  onClick={() => { setActiveTab('research'); setSelectedPatient(null); setEditingNote(null); }}
                  className={cn(
                    "w-full flex items-center gap-4 px-4 py-3 rounded-2xl text-xs font-medium transition-all",
                    activeTab === 'research' 
                      ? "bg-sky-600 text-white shadow-lg shadow-sky-600/20" 
                      : isDark ? "text-zinc-500 hover:bg-zinc-900 hover:text-zinc-300" : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
                  )}
                >
                  <Globe className="w-4 h-4" />
                  Clinical Research
                </button>
                <button 
                  onClick={() => { setActiveTab('image-analysis'); setSelectedPatient(null); setEditingNote(null); }}
                  className={cn(
                    "w-full flex items-center gap-4 px-4 py-3 rounded-2xl text-xs font-medium transition-all",
                    activeTab === 'image-analysis' 
                      ? "bg-sky-600 text-white shadow-lg shadow-sky-600/20" 
                      : isDark ? "text-zinc-500 hover:bg-zinc-900 hover:text-zinc-300" : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
                  )}
                >
                  <ImageIcon className="w-4 h-4" />
                  Image Analysis
                </button>
              </div>

              {selectedPatient && (
                <div className="pt-6 mt-6 border-t border-zinc-100 dark:border-zinc-800 space-y-4">
                  <p className={cn("px-4 text-[10px] font-bold uppercase tracking-widest transition-colors", isDark ? "text-zinc-600" : "text-zinc-400")}>Quick Notes</p>
                  <div className="space-y-1">
                    {[
                      { 
                        name: 'General  SOAP  Note', 
                        icon: FileText, 
                        content: `<h1>SOAP Clinical Note</h1><br/><h2>Subjective</h2><ul><li><strong>Chief Complaint:</strong> </li><li><strong>History of Presenting Illness:</strong> </li><li><strong>Review of Systems:</strong> </li><li><strong>Past Medical History:</strong> </li></ul><br/><h2>Objective</h2><ul><li><strong>Vitals:</strong> </li><li><strong>Physical Examination:</strong> </li><li><strong>Diagnostic Results:</strong> </li></ul><br/><h2>Assessment</h2><ul><li><strong>Diagnosis:</strong> </li><li><strong>Differential Diagnosis:</strong> </li></ul><br/><h2>Plan</h2><ul><li><strong>Medications:</strong> </li><li><strong>Referrals:</strong> </li><li><strong>Follow-up:</strong> </li><li><strong>Patient Education:</strong> </li></ul>` 
                      },
                      { 
                        name: 'Admission Note', 
                        icon: ClipboardList, 
                        content: `<h1>Admission Note</h1><br/><h2>Reason for Admission</h2><ul><li></li></ul><br/><h2>History of Present Illness</h2><ul><li></li></ul><br/><h2>Past Medical History</h2><ul><li></li></ul><br/><h2>Medications & Allergies</h2><ul><li><strong>Current Medications:</strong> </li><li><strong>Allergies:</strong> </li></ul><br/><h2>Physical Exam</h2><ul><li><strong>General Appearance:</strong> </li><li><strong>HEENT:</strong> </li><li><strong>Cardiovascular:</strong> </li><li><strong>Respiratory:</strong> </li><li><strong>Abdomen:</strong> </li><li><strong>Neurological:</strong> </li></ul><br/><h2>Assessment & Plan</h2><ul><li><strong>Primary Diagnosis:</strong> </li><li><strong>Management Plan:</strong> </li></ul>` 
                      },
                      { 
                        name: 'Discharge Summary', 
                        icon: LogOut, 
                        content: `<h1>Discharge Summary</h1><br/><h2>Patient Information</h2><ul><li><strong>Date of Admission:</strong> </li><li><strong>Date of Discharge:</strong> </li></ul><br/><h2>Diagnoses</h2><ul><li><strong>Admission Diagnosis:</strong> </li><li><strong>Discharge Diagnosis:</strong> </li></ul><br/><h2>Hospital Course</h2><ul><li><strong>Summary of Procedures/Treatments:</strong> </li><li><strong>Complications:</strong> </li></ul><br/><h2>Discharge Plan</h2><ul><li><strong>Condition at Discharge:</strong> </li><li><strong>Discharge Medications:</strong> </li><li><strong>Follow-up Instructions:</strong> </li><li><strong>Pending Results:</strong> </li></ul>` 
                      },
                      { 
                        name: 'Mental Status Exam', 
                        icon: Brain, 
                        content: `<h1>Mental Status Examination</h1><br/><h2>Appearance & Behavior</h2><ul><li><strong>Appearance:</strong> </li><li><strong>Eye Contact:</strong> </li><li><strong>Psychomotor Activity:</strong> </li></ul><br/><h2>Speech & Language</h2><ul><li><strong>Rate/Volume/Tone:</strong> </li></ul><br/><h2>Mood & Affect</h2><ul><li><strong>Patient's Reported Mood:</strong> </li><li><strong>Observed Affect:</strong> </li></ul><br/><h2>Thought Process & Content</h2><ul><li><strong>Thought Process:</strong> </li><li><strong>Thought Content:</strong> </li><li><strong>Suicidal/Homicidal Ideation:</strong> </li></ul><br/><h2>Cognition</h2><ul><li><strong>Orientation:</strong> </li><li><strong>Memory:</strong> </li><li><strong>Attention/Concentration:</strong> </li></ul><br/><h2>Insight & Judgment</h2><ul><li><strong>Insight:</strong> </li><li><strong>Judgment:</strong> </li></ul>` 
                      }
                    ].map((template) => (
                      <button
                        key={template.name}
                        onClick={() => createNote(selectedPatient.id, template.name as ClinicalNote['type'], template.content)}
                        className={cn(
                          "w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-xs font-medium transition-all group",
                          isDark ? "text-zinc-500 hover:bg-zinc-900 hover:text-zinc-300" : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
                        )}
                      >
                        <template.icon className={cn("w-3.5 h-3.5 transition-colors", isDark ? "text-zinc-700 group-hover:text-sky-400" : "text-zinc-300 group-hover:text-sky-600")} />
                        {template.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </nav>

            <div className="mt-auto p-6 space-y-4">
              <AnimatePresence>
                {showWelcomeSquare && (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className={cn("p-6 rounded-3xl border transition-colors text-right relative", isDark ? "bg-zinc-900/50 border-zinc-800" : "bg-white border-zinc-200 shadow-sm")} 
                    dir="rtl"
                  >
                    <button 
                      onClick={() => setShowWelcomeSquare(false)}
                      className="absolute top-4 left-4 p-1 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                    >
                      <X className="w-3 h-3" />
                    </button>
                    <h3 className="text-sm font-bold mb-2">مرحبًا بك في MedNote 👋</h3>
                    <p className={cn("text-[11px] leading-relaxed mb-3", isDark ? "text-zinc-500" : "text-zinc-600")}>
                      منصتنا تساعدك على كتابة ملاحظاتك الطبية بسهولة وسرعة، بحيث تستطيع ممارسة هذه المهارة في مكان واحد بشكل احترافي وواضح.
                    </p>
                    <p className="text-[11px] font-bold text-sky-500">
                      شكرًا لاستخدامك MedNote، ونتمنى لك تجربة مفيدة ومريحة دائمًا 💙
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
              <div className={cn("p-6 rounded-3xl border transition-colors", isDark ? "bg-zinc-900/50 border-zinc-800" : "bg-sky-50 border-sky-100")}>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-8 h-8 bg-sky-600 rounded-xl flex items-center justify-center">
                    <Play className="w-4 h-4 text-white fill-current" />
                  </div>
                  <span className="text-sm font-bold">Quick Demo</span>
                </div>
                <p className={cn("text-xs leading-relaxed mb-4", isDark ? "text-zinc-500" : "text-zinc-600")}>
                  See how mednotes works in 30 seconds.
                </p>
                <Button 
                  variant="ghost" 
                  onClick={() => setIsDemoOpen(true)}
                  className="w-full rounded-xl text-xs font-bold border border-zinc-200 dark:border-zinc-800"
                >
                  Watch Demo
                </Button>
              </div>
            </div>
          </aside>

          {/* Content Area */}
          <div className="flex-1 overflow-y-auto relative">
            <AnimatePresence mode="wait">
              {editingNote ? (
                <motion.div 
                  key="editor"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="p-8 max-w-4xl mx-auto"
                >
                  <div className="flex items-center justify-between mb-8">
                    <Button variant="ghost" onClick={() => setEditingNote(null)} className={isDark ? "" : "text-zinc-600 hover:text-zinc-900"}>
                      <ArrowLeft className="w-4 h-4" />
                      Back
                    </Button>
                    <div className="flex items-center gap-2">
                      <Button variant="danger" onClick={() => setConfirmDelete({ type: 'note', id: editingNote.id, title: editingNote.title })}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                      <Button onClick={() => saveNote(editingNote)}>
                        <Save className="w-4 h-4" />
                        Save Note
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-6">
                    <input 
                      value={editingNote.title}
                      onChange={(e) => setEditingNote({ ...editingNote, title: e.target.value })}
                      className={cn("text-4xl font-sans font-bold bg-transparent border-none focus:ring-0 w-full placeholder:text-zinc-800 transition-colors", isDark ? "text-white" : "text-zinc-900")}
                      placeholder="Note Title..."
                    />

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                      <div className="space-y-6">
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center gap-2">
                            <Button 
                              variant="secondary" 
                              className={cn("h-9 px-4 rounded-full", !isDark && "bg-white border-zinc-200 text-zinc-600 hover:bg-zinc-50")}
                              onClick={analyzeNote}
                              disabled={!editingNote.content || analysisGenerating}
                            >
                              <Search className={cn("w-4 h-4 text-sky-400", analysisGenerating && "animate-pulse")} />
                              Analyze
                            </Button>
                            {templates.length > 0 && (
                              <div className="relative group/templates">
                                <Button variant="secondary" className={cn("h-9 px-4 rounded-full", !isDark && "bg-white border-zinc-200 text-zinc-600 hover:bg-zinc-50")}>
                                  <Copy className="w-4 h-4 text-sky-400" />
                                  Template
                                </Button>
                                <div className={cn("absolute right-0 top-full mt-3 w-56 border rounded-[24px] shadow-2xl opacity-0 invisible group-hover/templates:opacity-100 group-hover/templates:visible transition-all z-50 py-3", isDark ? "bg-zinc-900 border-zinc-800" : "bg-white border-zinc-200")}>
                                  {templates.map(t => (
                                    <button
                                      key={t.id}
                                      onClick={() => setEditingNote({ ...editingNote, content: t.content })}
                                      className={cn("w-full text-left px-5 py-2.5 text-sm transition-colors font-sans", isDark ? "hover:bg-zinc-800 text-zinc-300" : "hover:bg-zinc-50 text-zinc-600")}
                                    >
                                      {t.name}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                        <TiptapEditor 
                          value={editingNote.content}
                          onChange={(val) => setEditingNote({ ...editingNote, content: val })}
                          isDark={isDark}
                          placeholder="Start typing or use AI Scribe..."
                        />
                      </div>

                      <div className="space-y-6">
                        <div className="flex items-center justify-between">
                          <h3 className={cn("text-xs font-bold uppercase tracking-widest font-sans", isDark ? "text-zinc-500" : "text-zinc-400")}>Preview & Analysis</h3>
                          <div className="flex gap-3">
                            <button 
                              onClick={() => handleTTS(editingNote.content)} 
                              disabled={isSpeaking}
                              className={cn(
                                "flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest transition-colors font-sans", 
                                isDark ? "text-zinc-500 hover:text-sky-400" : "text-zinc-400 hover:text-sky-600",
                                isSpeaking && "opacity-50 cursor-not-allowed"
                              )}
                            >
                              <Volume2 className={cn("w-3.5 h-3.5", isSpeaking && "animate-pulse")} />
                              {isSpeaking ? 'Speaking...' : 'Listen'}
                            </button>
                            <span className={isDark ? "text-zinc-800" : "text-zinc-200"}>|</span>
                            <button 
                              onClick={handleRefineNote} 
                              disabled={isRefining}
                              className={cn(
                                "flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest transition-colors font-sans", 
                                isDark ? "text-zinc-500 hover:text-sky-400" : "text-zinc-400 hover:text-sky-600",
                                isRefining && "opacity-50 cursor-not-allowed"
                              )}
                            >
                              <Zap className={cn("w-3.5 h-3.5", isRefining && "animate-pulse text-yellow-400")} />
                              {isRefining ? 'Refining...' : 'Refine'}
                            </button>
                            <span className={isDark ? "text-zinc-800" : "text-zinc-200"}>|</span>
                            <button 
                              onClick={() => {}} 
                              className={cn("text-[11px] font-bold uppercase tracking-widest transition-colors font-sans", isDark ? "text-zinc-500 hover:text-sky-400" : "text-zinc-400 hover:text-sky-600")}
                            >
                              Preview
                            </button>
                            <span className={isDark ? "text-zinc-800" : "text-zinc-200"}>|</span>
                            <button 
                              onClick={() => {}} 
                              className={cn("text-[11px] font-bold uppercase tracking-widest transition-colors font-sans", isDark ? "text-zinc-500 hover:text-sky-400" : "text-zinc-400 hover:text-sky-600")}
                            >
                              Analysis
                            </button>
                          </div>
                        </div>
                        <div className={cn("w-full min-h-[700px] p-10 rounded-[40px] border backdrop-blur-sm overflow-y-auto markdown-body shadow-inner transition-all", isDark ? "bg-zinc-900/30 border-zinc-800" : "bg-white border-zinc-200")}>
                          {editingNote.analysis ? (
                            <div className="space-y-10">
                              <div className={cn("pb-10 border-b", isDark ? "border-zinc-800" : "border-zinc-100")}>
                                <h4 className={cn("text-[11px] font-bold uppercase tracking-widest mb-6 font-sans", isDark ? "text-zinc-600" : "text-zinc-400")}>Clinical Note Preview</h4>
                                <HtmlRenderer html={editingNote.content} />
                              </div>
                              <div>
                                <div className="flex items-center justify-between mb-6">
                                  <div className="flex items-center gap-3">
                                    <Sparkles className="w-5 h-5 text-sky-400" />
                                    <h4 className={cn("text-[11px] font-bold uppercase tracking-widest font-sans", isDark ? "text-zinc-500" : "text-zinc-400")}>AI Analysis</h4>
                                  </div>
                                  <button 
                                    onClick={() => setEditingNote(prev => prev ? ({ ...prev, analysis: '' }) : null)}
                                    className={cn("text-[11px] font-bold hover:text-red-400 uppercase tracking-widest transition-colors font-sans", isDark ? "text-zinc-600" : "text-zinc-400")}
                                  >
                                    Clear
                                  </button>
                                </div>
                                <div className={cn("p-8 rounded-[32px] border shadow-sm transition-colors", isDark ? "bg-zinc-900 border-zinc-800" : "bg-zinc-50 border-zinc-200")}>
                                  <HtmlRenderer html={editingNote.analysis} />
                                </div>
                              </div>
                            </div>
                          ) : editingNote.content ? (
                            <HtmlRenderer html={editingNote.content} />
                          ) : (
                            <div className={cn("h-full flex flex-col items-center justify-center text-center p-10 transition-colors", isDark ? "text-zinc-800" : "text-zinc-300")}>
                              <Search className="w-10 h-10 mb-6 opacity-20" />
                              <p className="text-lg font-sans">Note preview will appear here. Use Analyze for clinical review.</p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ) : selectedPatient ? (
                <motion.div 
                  key="patient-detail"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-8 max-w-5xl mx-auto"
                >
                  <div className="flex items-center justify-between mb-8">
                    <div className="flex items-center gap-4">
                      <Button variant="ghost" onClick={() => setSelectedPatient(null)} className={isDark ? "" : "text-zinc-600 hover:text-zinc-900"}>
                        <ArrowLeft className="w-4 h-4" />
                      </Button>
                      <div>
                        <h2 className={cn("text-3xl font-sans font-bold transition-colors", isDark ? "text-white" : "text-zinc-900")}>{selectedPatient.name}</h2>
                        <p className={cn("text-sm font-sans transition-colors", isDark ? "text-zinc-500" : "text-zinc-400")}>Patient</p>
                      </div>
                    </div>
                    <Button onClick={() => createNote(selectedPatient.id)}>
                      <Plus className="w-4 h-4" />
                      New Note
                    </Button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
                    <div className="md:col-span-2 space-y-8">
                      {/* Quick Start Section */}
                      <div className="space-y-4">
                        <h3 className={cn("text-xl font-sans font-bold transition-colors", isDark ? "text-white" : "text-zinc-900")}>Quick Start</h3>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                          {[
                            { 
                              name: 'General  SOAP  Note', 
                              icon: FileText, 
                              content: `<h1>SOAP Clinical Note</h1><br/><h2>Subjective</h2><ul><li><strong>Chief Complaint:</strong> </li><li><strong>History of Presenting Illness:</strong> </li><li><strong>Review of Systems:</strong> </li><li><strong>Past Medical History:</strong> </li></ul><br/><h2>Objective</h2><ul><li><strong>Vitals:</strong> </li><li><strong>Physical Examination:</strong> </li><li><strong>Diagnostic Results:</strong> </li></ul><br/><h2>Assessment</h2><ul><li><strong>Diagnosis:</strong> </li><li><strong>Differential Diagnosis:</strong> </li></ul><br/><h2>Plan</h2><ul><li><strong>Medications:</strong> </li><li><strong>Referrals:</strong> </li><li><strong>Follow-up:</strong> </li><li><strong>Patient Education:</strong> </li></ul>` 
                            },
                            { 
                              name: 'Admission Note', 
                              icon: ClipboardList, 
                              content: `<h1>Admission Note</h1><br/><h2>Reason for Admission</h2><ul><li></li></ul><br/><h2>History of Present Illness</h2><ul><li></li></ul><br/><h2>Past Medical History</h2><ul><li></li></ul><br/><h2>Medications & Allergies</h2><ul><li><strong>Current Medications:</strong> </li><li><strong>Allergies:</strong> </li></ul><br/><h2>Physical Exam</h2><ul><li><strong>General Appearance:</strong> </li><li><strong>HEENT:</strong> </li><li><strong>Cardiovascular:</strong> </li><li><strong>Respiratory:</strong> </li><li><strong>Abdomen:</strong> </li><li><strong>Neurological:</strong> </li></ul><br/><h2>Assessment & Plan</h2><ul><li><strong>Primary Diagnosis:</strong> </li><li><strong>Management Plan:</strong> </li></ul>` 
                            },
                            { 
                              name: 'Discharge Summary', 
                              icon: LogOut, 
                              content: `<h1>Discharge Summary</h1><br/><h2>Patient Information</h2><ul><li><strong>Date of Admission:</strong> </li><li><strong>Date of Discharge:</strong> </li></ul><br/><h2>Diagnoses</h2><ul><li><strong>Admission Diagnosis:</strong> </li><li><strong>Discharge Diagnosis:</strong> </li></ul><br/><h2>Hospital Course</h2><ul><li><strong>Summary of Procedures/Treatments:</strong> </li><li><strong>Complications:</strong> </li></ul><br/><h2>Discharge Plan</h2><ul><li><strong>Condition at Discharge:</strong> </li><li><strong>Discharge Medications:</strong> </li><li><strong>Follow-up Instructions:</strong> </li><li><strong>Pending Results:</strong> </li></ul>` 
                            },
                            { 
                              name: 'Mental Status Exam', 
                              icon: Brain, 
                              content: `<h1>Mental Status Examination</h1><br/><h2>Appearance & Behavior</h2><ul><li><strong>Appearance:</strong> </li><li><strong>Eye Contact:</strong> </li><li><strong>Psychomotor Activity:</strong> </li></ul><br/><h2>Speech & Language</h2><ul><li><strong>Rate/Volume/Tone:</strong> </li></ul><br/><h2>Mood & Affect</h2><ul><li><strong>Patient's Reported Mood:</strong> </li><li><strong>Observed Affect:</strong> </li></ul><br/><h2>Thought Process & Content</h2><ul><li><strong>Thought Process:</strong> </li><li><strong>Thought Content:</strong> </li><li><strong>Suicidal/Homicidal Ideation:</strong> </li></ul><br/><h2>Cognition</h2><ul><li><strong>Orientation:</strong> </li><li><strong>Memory:</strong> </li><li><strong>Attention/Concentration:</strong> </li></ul><br/><h2>Insight & Judgment</h2><ul><li><strong>Insight:</strong> </li><li><strong>Judgment:</strong> </li></ul>` 
                            }
                          ].map((template) => (
                            <button
                              key={template.name}
                              onClick={() => createNote(selectedPatient.id, template.name as ClinicalNote['type'], template.content)}
                              className={cn(
                                "flex flex-col items-center justify-center p-6 rounded-3xl border transition-all hover:shadow-lg group",
                                isDark ? "bg-zinc-900 border-zinc-800 hover:border-zinc-700" : "bg-white border-zinc-200 hover:border-zinc-300"
                              )}
                            >
                              <div className={cn(
                                "w-10 h-10 rounded-2xl flex items-center justify-center mb-3 transition-colors",
                                isDark ? "bg-zinc-800 group-hover:bg-sky-500/10" : "bg-zinc-50 group-hover:bg-sky-50"
                              )}>
                                <template.icon className={cn("w-5 h-5 transition-colors", isDark ? "text-zinc-600 group-hover:text-sky-400" : "text-zinc-300 group-hover:text-sky-600")} />
                              </div>
                              <span className={cn("text-[10px] font-bold uppercase tracking-widest text-center", isDark ? "text-zinc-500 group-hover:text-zinc-300" : "text-zinc-400 group-hover:text-zinc-600")}>
                                {template.name}
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>

                      <h3 className={cn("text-xl font-sans font-bold transition-colors", isDark ? "text-white" : "text-zinc-900")}>Clinical History</h3>
                      <div className="space-y-4">
                        {notes.filter(n => n.patientId === selectedPatient.id).map(note => (
                          <div 
                            key={note.id}
                            onClick={() => { setEditingNote(note); setNoteStartTime(Date.now()); }}
                            className={cn("p-8 rounded-[32px] border hover:shadow-xl transition-all cursor-pointer group", isDark ? "bg-zinc-900 border-zinc-800 hover:border-zinc-700" : "bg-white border-zinc-200 hover:border-zinc-300")}
                          >
                            <div className="flex items-center justify-between mb-4">
                              <div className="flex items-center gap-3">
                                <h4 className={cn("text-xl font-sans font-bold transition-colors group-hover:text-sky-400", isDark ? "text-white" : "text-zinc-900")}>{note.title}</h4>
                                {note.type && note.type !== 'Other' && (
                                  <span className={cn(
                                    "text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full",
                                    isDark ? "bg-sky-500/10 text-sky-400" : "bg-sky-50 text-sky-600"
                                  )}>
                                    {note.type}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-3">
                                <span className={cn(
                                  "text-[11px] font-bold uppercase tracking-widest px-3 py-1 rounded-full",
                                  note.status === 'finalized' ? "bg-emerald-500/10 text-emerald-400" : isDark ? "bg-zinc-800 text-zinc-500" : "bg-zinc-100 text-zinc-400"
                                )}>
                                  {note.status}
                                </span>
                              </div>
                            </div>
                            <p className={cn("text-base line-clamp-2 mb-6 font-sans leading-relaxed transition-colors", isDark ? "text-zinc-400" : "text-zinc-600")}>
                              {note.content || "No content yet..."}
                            </p>
                            <div className={cn("flex items-center gap-6 text-[11px] font-sans uppercase tracking-widest transition-colors", isDark ? "text-zinc-600" : "text-zinc-400")}>
                              <div className="flex items-center gap-2">
                                <Calendar className="w-3.5 h-3.5" />
                                {new Date(note.updatedAt?.seconds * 1000).toLocaleDateString()}
                              </div>
                              <div className="flex items-center gap-2">
                                <Clock className="w-3.5 h-3.5" />
                                {new Date(note.updatedAt?.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </div>
                            </div>
                          </div>
                        ))}
                        {notes.filter(n => n.patientId === selectedPatient.id).length === 0 && (
                          <div className={cn("py-24 text-center rounded-[40px] border-2 border-dashed transition-colors", isDark ? "bg-zinc-900/40 border-zinc-800" : "bg-zinc-50/40 border-zinc-200")}>
                            <FileText className={cn("w-12 h-12 mx-auto mb-4 transition-colors", isDark ? "text-zinc-800" : "text-zinc-200")} />
                            <p className={cn("text-lg font-sans transition-colors", isDark ? "text-zinc-600" : "text-zinc-400")}>No notes recorded for this patient.</p>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="space-y-8">
                      <h3 className={cn("text-xl font-sans font-bold transition-colors", isDark ? "text-white" : "text-zinc-900")}>Patient Info</h3>
                      <div className={cn("p-8 rounded-[40px] border space-y-6 shadow-sm transition-colors", isDark ? "bg-zinc-900 border-zinc-800" : "bg-white border-zinc-200")}>
                        <div>
                          <p className={cn("text-[11px] font-bold uppercase tracking-widest mb-2 font-sans transition-colors", isDark ? "text-zinc-600" : "text-zinc-400")}>Full Name</p>
                          <p className={cn("text-lg font-sans font-bold transition-colors", isDark ? "text-white" : "text-zinc-900")}>{selectedPatient.name}</p>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <p className={cn("text-[11px] font-bold uppercase tracking-widest mb-2 font-sans transition-colors", isDark ? "text-zinc-600" : "text-zinc-400")}>Date of Birth</p>
                            <p className={cn("text-base font-sans transition-colors", isDark ? "text-zinc-300" : "text-zinc-600")}>{selectedPatient.dateOfBirth || 'Not recorded'}</p>
                          </div>
                          <div>
                            <p className={cn("text-[11px] font-bold uppercase tracking-widest mb-2 font-sans transition-colors", isDark ? "text-zinc-600" : "text-zinc-400")}>Gender</p>
                            <p className={cn("text-base font-sans transition-colors", isDark ? "text-zinc-300" : "text-zinc-600")}>{selectedPatient.gender || 'Not recorded'}</p>
                          </div>
                        </div>
                        <div>
                          <p className={cn("text-[11px] font-bold uppercase tracking-widest mb-2 font-sans transition-colors", isDark ? "text-zinc-600" : "text-zinc-400")}>Contact Info</p>
                          <p className={cn("text-base font-sans transition-colors", isDark ? "text-zinc-300" : "text-zinc-600")}>{selectedPatient.contactInfo || 'Not recorded'}</p>
                        </div>
                        <div>
                          <p className={cn("text-[11px] font-bold uppercase tracking-widest mb-2 font-sans transition-colors", isDark ? "text-zinc-600" : "text-zinc-400")}>Patient ID</p>
                          <p className={cn("text-sm font-mono transition-colors", isDark ? "text-zinc-600" : "text-zinc-400")}>{selectedPatient.id.slice(0, 8)}</p>
                        </div>
                        <div>
                          <p className={cn("text-[11px] font-bold uppercase tracking-widest mb-2 font-sans transition-colors", isDark ? "text-zinc-600" : "text-zinc-400")}>Registered On</p>
                          <p className={cn("text-lg font-sans font-bold transition-colors", isDark ? "text-white" : "text-zinc-900")}>
                            {new Date(selectedPatient.createdAt?.seconds * 1000).toLocaleDateString()}
                          </p>
                        </div>
                        <div className={cn("pt-6 border-t transition-colors", isDark ? "border-zinc-800" : "border-zinc-100")}>
                          <Button 
                            variant="danger" 
                            className="w-full h-12 rounded-2xl"
                            onClick={() => setConfirmDelete({ type: 'patient', id: selectedPatient.id, title: selectedPatient.name })}
                          >
                            <Trash2 className="w-4 h-4" />
                            Delete Patient
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ) : (
                <motion.div 
                  key="dashboard"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="p-8 max-w-6xl mx-auto"
                >
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-12">
                    <div>
                      <h2 className={cn("text-4xl font-sans font-bold transition-colors", isDark ? "text-white" : "text-zinc-900")}>
                        {activeTab === 'welcome' ? 'Welcome to MedNote' : activeTab === 'patients' ? 'Patients' : activeTab === 'notes' ? 'Clinical Notes' : 'Templates'}
                      </h2>
                      <p className={cn("text-sm mt-2 font-sans transition-colors", isDark ? "text-zinc-500" : "text-zinc-400")}>
                        {activeTab === 'welcome' ? 'Get started with your clinical documentation.' : 'Manage your documentation and patient records.'}
                      </p>
                    </div>
                    <div className="flex items-center gap-4">
                      {['patients', 'notes', 'templates'].includes(activeTab) && (
                        <div className="flex items-center gap-3 mr-6 transition-all">
                          <CreativeCheckbox 
                            checked={
                              activeTab === 'patients' ? (patients.length > 0 && selectedIds.length === patients.length) :
                              activeTab === 'notes' ? (notes.length > 0 && selectedIds.length === notes.length) :
                              activeTab === 'templates' ? (templates.length > 0 && selectedIds.length === templates.length) :
                              false
                            }
                            onChange={(checked) => {
                              if (checked) {
                                const ids = 
                                  activeTab === 'patients' ? patients.map(p => p.id) :
                                  activeTab === 'notes' ? notes.map(n => n.id) :
                                  activeTab === 'templates' ? templates.map(t => t.id) :
                                  [];
                                setSelectedIds(ids);
                              } else {
                                setSelectedIds([]);
                              }
                            }}
                            isDark={isDark}
                            className="w-6 h-6"
                          />
                          <span className={cn("text-[11px] font-bold uppercase tracking-[0.15em]", isDark ? "text-zinc-500" : "text-zinc-500")}>Select All</span>
                        </div>
                      )}
                      {selectedIds.length > 0 && (
                        <motion.div
                          initial={{ opacity: 0, x: 20 }}
                          animate={{ opacity: 1, x: 0 }}
                          className="flex items-center gap-3"
                        >
                          <span className={cn("text-xs font-bold uppercase tracking-widest", isDark ? "text-zinc-600" : "text-zinc-400")}>
                            {selectedIds.length} Selected
                          </span>
                          <Button 
                            variant="danger" 
                            onClick={handleBulkDelete}
                            className="h-10 px-4 rounded-xl shadow-lg shadow-red-500/20"
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Delete All
                          </Button>
                          <Button 
                            variant="ghost" 
                            onClick={() => setSelectedIds([])}
                            className={cn("h-10 px-4 rounded-xl", isDark ? "text-zinc-500 hover:text-white" : "text-zinc-400 hover:text-zinc-900")}
                          >
                            Cancel
                          </Button>
                        </motion.div>
                      )}
                      {activeTab !== 'welcome' && (
                        <div className="relative group">
                          <Search className={cn("w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 transition-colors", isDark ? "text-zinc-600 group-focus-within:text-sky-400" : "text-zinc-300 group-focus-within:text-sky-600")} />
                          <Input 
                            placeholder="Search..." 
                            className={cn("pl-11 w-72 transition-colors", isDark ? "bg-zinc-900 border-transparent focus:bg-zinc-900 focus:border-zinc-800 text-white" : "bg-white border-zinc-200 focus:bg-white focus:border-zinc-300 text-zinc-900")}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                          />
                        </div>
                      )}
                      {activeTab === 'patients' && (
                        <Button onClick={() => setIsAddPatientModalOpen(true)}>
                          <Plus className="w-4 h-4" />
                          Add Patient
                        </Button>
                      )}
                    </div>
                  </div>

                  {activeTab === 'welcome' ? (
                    <motion.div 
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={cn("p-12 rounded-[48px] border shadow-xl text-right", isDark ? "bg-zinc-900 border-zinc-800" : "bg-white border-zinc-200")}
                      dir="rtl"
                    >
                      <div className="flex items-center justify-end gap-4 mb-8">
                        <h3 className="text-3xl font-bold">مرحبًا بك في MedNote 👋</h3>
                        <div className="w-12 h-12 bg-sky-600 rounded-2xl flex items-center justify-center shadow-lg shadow-sky-600/20">
                          <Stethoscope className="w-6 h-6 text-white" />
                        </div>
                      </div>
                      <p className={cn("text-xl leading-relaxed mb-8", isDark ? "text-zinc-400" : "text-zinc-600")}>
                        منصتنا تساعدك على كتابة ملاحظاتك الطبية بسهولة وسرعة، بحيث تستطيع ممارسة هذه المهارة في مكان واحد بشكل احترافي وواضح.
                      </p>
                      <div className="pt-8 border-t border-zinc-100 dark:border-zinc-800">
                        <p className="text-xl font-bold text-sky-500">
                          شكرًا لاستخدامك MedNote، ونتمنى لك تجربة مفيدة ومريحة دائمًا 💙
                        </p>
                      </div>
                      <div className="mt-12 flex justify-end gap-4">
                        <Button onClick={() => setActiveTab('patients')} className="h-14 px-8 rounded-2xl">
                          ابدأ الآن
                        </Button>
                        <Button variant="secondary" onClick={() => setIsDemoOpen(true)} className="h-14 px-8 rounded-2xl">
                          مشاهدة العرض
                        </Button>
                      </div>
                    </motion.div>
                  ) : activeTab === 'patients' ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                      {patients.filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase())).map(patient => (
                        <motion.div 
                          layoutId={patient.id}
                          key={patient.id}
                          className={cn(
                            "p-8 rounded-[32px] border hover:shadow-xl transition-all cursor-pointer group relative", 
                            isDark ? "bg-zinc-900 border-zinc-800 hover:border-zinc-700" : "bg-white border-zinc-200 hover:border-zinc-300",
                            selectedIds.includes(patient.id) && (isDark ? "border-sky-500/50 bg-sky-500/5" : "border-sky-500/50 bg-sky-50")
                          )}
                          onClick={(e) => {
                            if (e.target instanceof HTMLInputElement && e.target.type === 'checkbox') return;
                            setSelectedPatient(patient);
                          }}
                        >
                          <div className="flex items-center justify-between mb-6">
                            <div className="flex items-center gap-4">
                              <CreativeCheckbox 
                                checked={selectedIds.includes(patient.id)}
                                onChange={(checked) => {
                                  if (checked) {
                                    setSelectedIds(prev => [...prev, patient.id]);
                                  } else {
                                    setSelectedIds(prev => prev.filter(id => id !== patient.id));
                                  }
                                }}
                                isDark={isDark}
                                className="w-4 h-4"
                              />
                              <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center transition-all", isDark ? "bg-zinc-800 group-hover:bg-sky-600" : "bg-zinc-50 group-hover:bg-sky-600")}>
                                <UserIcon className={cn("w-6 h-6 transition-colors", isDark ? "text-zinc-600 group-hover:text-white" : "text-zinc-300 group-hover:text-white")} />
                              </div>
                            </div>
                            <ChevronRight className={cn("w-5 h-5 transition-colors", isDark ? "text-zinc-800 group-hover:text-sky-400" : "text-zinc-200 group-hover:text-sky-600")} />
                          </div>
                          <h3 className={cn("text-xl font-sans font-bold transition-colors mb-2", isDark ? "text-white" : "text-zinc-900")}>{patient.name}</h3>
                          <p className={cn("text-sm font-sans transition-colors", isDark ? "text-zinc-500" : "text-zinc-400")}>
                            {notes.filter(n => n.patientId === patient.id).length} notes recorded
                          </p>
                        </motion.div>
                      ))}
                      {patients.length === 0 && (
                        <div className={cn("col-span-full py-24 text-center rounded-[40px] border-2 border-dashed transition-colors", isDark ? "bg-zinc-900/40 border-zinc-800" : "bg-zinc-50/40 border-zinc-200")}>
                          <Users className={cn("w-16 h-16 mx-auto mb-6 transition-colors", isDark ? "text-zinc-800" : "text-zinc-200")} />
                          <h3 className={cn("text-2xl font-sans font-bold transition-colors", isDark ? "text-white" : "text-zinc-900")}>No patients yet</h3>
                          <p className={cn("max-w-xs mx-auto mt-3 font-sans transition-colors", isDark ? "text-zinc-500" : "text-zinc-400")}>Start by adding your first patient to begin documentation.</p>
                        </div>
                      )}
                    </div>
                  ) : activeTab === 'notes' ? (
                    <div className="space-y-4">
                      {notes.filter(n => n.title.toLowerCase().includes(searchQuery.toLowerCase())).map(note => (
                        <div 
                          key={note.id}
                          className={cn(
                            "flex items-center justify-between p-6 rounded-[32px] border hover:shadow-xl transition-all cursor-pointer group", 
                            isDark ? "bg-zinc-900 border-zinc-800 hover:border-zinc-700" : "bg-white border-zinc-200 hover:border-zinc-300",
                            selectedIds.includes(note.id) && (isDark ? "border-sky-500/50 bg-sky-500/5" : "border-sky-500/50 bg-sky-50")
                          )}
                          onClick={(e) => {
                            if (e.target instanceof HTMLInputElement && e.target.type === 'checkbox') return;
                            setEditingNote(note); 
                            setNoteStartTime(Date.now());
                          }}
                        >
                          <div className="flex items-center gap-6">
                            <CreativeCheckbox 
                              checked={selectedIds.includes(note.id)}
                              onChange={(checked) => {
                                if (checked) {
                                  setSelectedIds(prev => [...prev, note.id]);
                                } else {
                                  setSelectedIds(prev => prev.filter(id => id !== note.id));
                                }
                              }}
                              isDark={isDark}
                              className="w-4 h-4"
                            />
                            <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center transition-all", isDark ? "bg-zinc-800 group-hover:bg-sky-600" : "bg-zinc-50 group-hover:bg-sky-600")}>
                              <FileText className={cn("w-6 h-6 transition-colors", isDark ? "text-zinc-600 group-hover:text-white" : "text-zinc-300 group-hover:text-white")} />
                            </div>
                            <div>
                              <div className="flex items-center gap-3">
                                <h4 className={cn("text-lg font-sans font-bold transition-colors", isDark ? "text-white" : "text-zinc-900")}>{note.title}</h4>
                                {note.type && note.type !== 'Other' && (
                                  <span className={cn(
                                    "text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full",
                                    isDark ? "bg-sky-500/10 text-sky-400" : "bg-sky-50 text-sky-600"
                                  )}>
                                    {note.type}
                                  </span>
                                )}
                              </div>
                              <p className={cn("text-sm font-sans transition-colors", isDark ? "text-zinc-500" : "text-zinc-400")}>
                                {patients.find(p => p.id === note.patientId)?.name || 'Unknown Patient'} • {new Date(note.updatedAt?.seconds * 1000).toLocaleDateString()}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-4">
                            <span className={cn(
                              "text-[11px] font-bold uppercase tracking-widest px-3 py-1 rounded-full",
                              note.status === 'finalized' ? "bg-emerald-500/10 text-emerald-400" : isDark ? "bg-zinc-800 text-zinc-500" : "bg-zinc-100 text-zinc-400"
                            )}>
                              {note.status}
                            </span>
                            <ChevronRight className={cn("w-5 h-5 transition-colors", isDark ? "text-zinc-800 group-hover:text-sky-400" : "text-zinc-200 group-hover:text-sky-600")} />
                          </div>
                        </div>
                      ))}
                      {notes.length === 0 && (
                        <div className={cn("py-24 text-center rounded-[40px] border-2 border-dashed transition-colors", isDark ? "bg-zinc-900/40 border-zinc-800" : "bg-zinc-50/40 border-zinc-200")}>
                          <FileText className={cn("w-16 h-16 mx-auto mb-6 transition-colors", isDark ? "text-zinc-800" : "text-zinc-200")} />
                          <h3 className={cn("text-2xl font-sans font-bold transition-colors", isDark ? "text-white" : "text-zinc-900")}>No notes found</h3>
                          <p className={cn("max-w-xs mx-auto mt-3 font-sans transition-colors", isDark ? "text-zinc-500" : "text-zinc-400")}>Notes will appear here once you start documenting patient visits.</p>
                        </div>
                      )}
                    </div>
                  ) : activeTab === 'performance' ? (
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
                      {/* Automated Metrics Section */}
                      <div className="lg:col-span-4 space-y-8">
                        <section className={cn("p-8 rounded-[40px] border shadow-sm transition-colors", isDark ? "bg-zinc-900 border-zinc-800" : "bg-white border-zinc-200")}>
                          <div className="flex items-center justify-between mb-6">
                            <h3 className={cn("text-[11px] font-bold uppercase tracking-widest font-sans transition-colors", isDark ? "text-zinc-600" : "text-zinc-400")}>Current Week (MINET)</h3>
                            <Zap className="w-4 h-4 text-sky-500" />
                          </div>
                          <div className="space-y-6">
                            {[
                              { label: "Notes Written", value: performanceData.current.notes_written, unit: "" },
                              { label: "Typing Speed", value: performanceData.current.typing_speed_wpm, unit: " WPM" },
                              { label: "Error Rate", value: performanceData.current.error_rate, unit: "%" },
                              { label: "Structure", value: performanceData.current.structure_score, unit: "/100" },
                              { label: "Clinical Reasoning", value: performanceData.current.clinical_reasoning_score, unit: "/100" },
                            ].map((item) => (
                              <div key={item.label} className="flex flex-col gap-1">
                                <label className={cn("text-[10px] uppercase font-mono tracking-wider transition-colors ml-4", isDark ? "text-zinc-600" : "text-zinc-400")}>
                                  {item.label}
                                </label>
                                <div className={cn("px-4 py-2 rounded-xl border font-sans font-bold transition-colors", isDark ? "bg-zinc-800/50 border-zinc-700 text-white" : "bg-zinc-50 border-zinc-100 text-zinc-900")}>
                                  {item.value}{item.unit}
                                </div>
                              </div>
                            ))}
                          </div>
                        </section>

                        <section className={cn("p-8 rounded-[40px] border shadow-sm transition-colors opacity-70", isDark ? "bg-zinc-900 border-zinc-800" : "bg-white border-zinc-200")}>
                          <h3 className={cn("text-[11px] font-bold uppercase tracking-widest mb-6 font-sans transition-colors", isDark ? "text-zinc-600" : "text-zinc-400")}>Previous Week (Week)</h3>
                          <div className="space-y-6">
                            {[
                              { label: "Typing Speed", value: performanceData.previous.typing_speed_wpm, unit: " WPM" },
                              { label: "Error Rate", value: performanceData.previous.error_rate, unit: "%" },
                              { label: "Structure", value: performanceData.previous.structure_score, unit: "/100" },
                              { label: "Clinical Reasoning", value: performanceData.previous.clinical_reasoning_score, unit: "/100" },
                            ].map((item) => (
                              <div key={`prev-${item.label}`} className="flex flex-col gap-1">
                                <label className={cn("text-[10px] uppercase font-mono tracking-wider transition-colors ml-4", isDark ? "text-zinc-600" : "text-zinc-400")}>
                                  {item.label}
                                </label>
                                <div className={cn("px-4 py-2 rounded-xl border font-sans font-bold transition-colors", isDark ? "bg-zinc-800/50 border-zinc-700 text-white" : "bg-zinc-50 border-zinc-100 text-zinc-900")}>
                                  {item.value}{item.unit}
                                </div>
                              </div>
                            ))}
                          </div>
                        </section>

                        <Button
                          onClick={handleGeneratePerformanceReport}
                          disabled={isGeneratingPerformance || performanceData.current.notes_written === 0}
                          className="w-full h-14 rounded-2xl text-lg"
                        >
                          {isGeneratingPerformance ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" />
                              Analyzing...
                            </>
                          ) : (
                            <>
                              Generate AI Report
                              <Sparkles className="w-4 h-4 ml-2" />
                            </>
                          )}
                        </Button>
                        {performanceData.current.notes_written === 0 && (
                          <p className={cn("text-[10px] text-center font-sans mt-2", isDark ? "text-zinc-600" : "text-zinc-400")}>
                            Complete at least one note this week to generate a report.
                          </p>
                        )}
                      </div>

                      {/* Report Section */}
                      <div className="lg:col-span-8">
                        <AnimatePresence mode="wait">
                          {!performanceReport && !isGeneratingPerformance ? (
                            <motion.div
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              exit={{ opacity: 0 }}
                              className={cn("h-full flex flex-col items-center justify-center border-2 border-dashed p-12 text-center rounded-[40px] transition-colors min-h-[600px]", isDark ? "bg-zinc-900/40 border-zinc-800" : "bg-zinc-50/40 border-zinc-200")}
                            >
                              <BarChart3 className={cn("w-16 h-16 mb-4 opacity-20 transition-colors", isDark ? "text-zinc-600" : "text-zinc-300")} />
                              <p className={cn("text-lg font-sans transition-colors", isDark ? "text-zinc-600" : "text-zinc-400")}>
                                Complete notes and generate a report to see your clinical performance analysis.
                              </p>
                            </motion.div>
                          ) : isGeneratingPerformance ? (
                            <motion.div
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              className="h-full flex flex-col items-center justify-center p-12 min-h-[600px]"
                            >
                              <div className="w-24 h-24 border-4 border-sky-600 border-t-transparent rounded-full animate-spin mb-8" />
                              <p className="font-sans font-bold uppercase tracking-[0.2em] text-xs animate-pulse text-sky-500">
                                Processing Clinical Data...
                              </p>
                            </motion.div>
                          ) : (
                            <motion.div
                              initial={{ opacity: 0, y: 20 }}
                              animate={{ opacity: 1, y: 0 }}
                              className="space-y-8"
                            >
                              {/* Overall Performance */}
                              <section className={cn("p-10 rounded-[48px] border shadow-xl transition-colors", isDark ? "bg-zinc-900 border-zinc-800" : "bg-white border-zinc-200")}>
                                <div className="flex justify-between items-start mb-8">
                                  <div>
                                    <h3 className={cn("text-[11px] font-bold uppercase tracking-widest mb-4 font-sans transition-colors", isDark ? "text-zinc-600" : "text-zinc-400")}>Weekly Performance Report (MINET)</h3>
                                    <div className={cn("text-7xl font-bold font-sans tracking-tighter transition-colors", isDark ? "text-white" : "text-zinc-900")}>
                                      {performanceReport?.final_score.toFixed(1)}<span className="text-2xl opacity-40">/100</span>
                                    </div>
                                    <div className="mt-4 flex items-center gap-2">
                                      <span className={cn("text-xs font-bold uppercase tracking-widest", isDark ? "text-zinc-500" : "text-zinc-400")}>Trend:</span>
                                      <span className={cn(
                                        "px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border",
                                        performanceReport?.performance_trend === 'Improving' ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" :
                                        performanceReport?.performance_trend === 'Declining' ? "bg-rose-500/10 text-rose-500 border-rose-500/20" :
                                        "bg-zinc-500/10 text-zinc-500 border-zinc-500/20"
                                      )}>
                                        {performanceReport?.performance_trend === 'Improving' ? '📈 Improving' : 
                                         performanceReport?.performance_trend === 'Declining' ? '📉 Declining' : 
                                         '➖ Stable'}
                                      </span>
                                    </div>
                                  </div>
                                  <div className="w-16 h-16 bg-sky-600/10 rounded-[32px] flex items-center justify-center border border-sky-600/20">
                                    <Activity className="w-8 h-8 text-sky-500" />
                                  </div>
                                </div>
                                <p className={cn("text-xl leading-relaxed font-sans italic transition-colors", isDark ? "text-zinc-300" : "text-zinc-600")}>
                                  "{performanceReport?.summary}"
                                </p>
                                {performanceReport?.insights && (
                                  <div className="mt-8 space-y-4">
                                    <h4 className={cn("text-[10px] font-bold uppercase tracking-widest font-sans transition-colors", isDark ? "text-zinc-600" : "text-zinc-400")}>Performance Insights</h4>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                      {performanceReport.insights.map((insight, idx) => (
                                        <div key={idx} className={cn("p-4 rounded-2xl border transition-colors", isDark ? "bg-zinc-800/50 border-zinc-700" : "bg-zinc-50 border-zinc-100")}>
                                          <p className={cn("text-sm font-sans transition-colors", isDark ? "text-zinc-400" : "text-zinc-500")}>{insight}</p>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </section>

                              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                {/* Strengths */}
                                <section className={cn("p-10 rounded-[48px] border shadow-xl transition-colors", isDark ? "bg-zinc-900 border-zinc-800" : "bg-white border-zinc-200")}>
                                  <div className="flex items-center gap-4 mb-8">
                                    <div className="w-10 h-10 bg-emerald-500/10 rounded-2xl flex items-center justify-center border border-emerald-500/20">
                                      <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                                    </div>
                                    <h3 className={cn("text-[11px] font-bold uppercase tracking-widest font-sans transition-colors", isDark ? "text-zinc-600" : "text-zinc-400")}>Key Strengths</h3>
                                  </div>
                                  <ul className="space-y-6">
                                    {performanceReport?.strengths.map((strength, idx) => (
                                      <li key={idx} className="flex gap-4 items-start">
                                        <span className="w-6 h-6 rounded-full bg-emerald-500/10 text-emerald-500 text-[10px] font-bold flex items-center justify-center flex-shrink-0 mt-1">
                                          {idx + 1}
                                        </span>
                                        <span className={cn("text-base font-sans leading-relaxed transition-colors", isDark ? "text-zinc-300" : "text-zinc-600")}>{strength}</span>
                                      </li>
                                    ))}
                                  </ul>
                                </section>

                                {/* Areas for Improvement */}
                                <section className={cn("p-10 rounded-[48px] border shadow-xl transition-colors", isDark ? "bg-zinc-900 border-zinc-800" : "bg-white border-zinc-200")}>
                                  <div className="flex items-center gap-4 mb-8">
                                    <div className="w-10 h-10 bg-rose-500/10 rounded-2xl flex items-center justify-center border border-rose-500/20">
                                      <AlertCircle className="w-5 h-5 text-rose-500" />
                                    </div>
                                    <h3 className={cn("text-[11px] font-bold uppercase tracking-widest font-sans transition-colors", isDark ? "text-zinc-600" : "text-zinc-400")}>Areas for Improvement</h3>
                                  </div>
                                  <ul className="space-y-6">
                                    {performanceReport?.areas_for_improvement.map((area, idx) => (
                                      <li key={idx} className="flex gap-4 items-start">
                                        <span className="w-6 h-6 rounded-full bg-rose-500/10 text-rose-500 text-[10px] font-bold flex items-center justify-center flex-shrink-0 mt-1">
                                          {idx + 1}
                                        </span>
                                        <span className={cn("text-base font-sans leading-relaxed transition-colors", isDark ? "text-zinc-300" : "text-zinc-600")}>{area}</span>
                                      </li>
                                    ))}
                                  </ul>
                                </section>
                              </div>

                              {/* Action Plan */}
                              <section className={cn("p-10 rounded-[48px] border shadow-xl transition-colors", isDark ? "bg-sky-500/5 border-sky-500/20" : "bg-sky-50 border-sky-100")}>
                                <div className="flex items-center gap-4 mb-8">
                                  <div className="w-10 h-10 bg-sky-500/10 rounded-2xl flex items-center justify-center border border-sky-500/20">
                                    <Rocket className="w-5 h-5 text-sky-500" />
                                  </div>
                                  <h3 className={cn("text-[11px] font-bold uppercase tracking-widest font-sans transition-colors", isDark ? "text-zinc-600" : "text-zinc-400")}>Action Plan (Next Week)</h3>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                  {performanceReport?.action_plan.map((step, idx) => (
                                    <div key={idx} className={cn("p-6 rounded-[32px] border transition-colors", isDark ? "bg-zinc-900 border-zinc-800" : "bg-white border-zinc-200 shadow-sm")}>
                                      <p className={cn("text-base font-sans leading-relaxed transition-colors", isDark ? "text-zinc-300" : "text-zinc-600")}>{step}</p>
                                    </div>
                                  ))}
                                </div>
                              </section>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </div>
                  ) : activeTab === 'research' ? (
                    <div className="max-w-4xl mx-auto space-y-8">
                      <section className={cn("p-10 rounded-[48px] border shadow-xl transition-colors", isDark ? "bg-zinc-900 border-zinc-800" : "bg-white border-zinc-200")}>
                        <div className="flex items-center gap-4 mb-8">
                          <div className="w-12 h-12 bg-sky-600/10 rounded-2xl flex items-center justify-center border border-sky-600/20">
                            <Globe className="w-6 h-6 text-sky-500" />
                          </div>
                          <div>
                            <h3 className="text-2xl font-sans font-bold">Clinical Research</h3>
                            <p className={cn("text-sm font-sans transition-colors", isDark ? "text-zinc-500" : "text-zinc-400")}>Search medical literature and guidelines with AI grounding.</p>
                          </div>
                        </div>
                        <div className="flex gap-4">
                          <div className="flex-1">
                            <Input 
                              placeholder="e.g., Latest hypertension guidelines for elderly patients" 
                              value={researchQuery}
                              onChange={(e) => setResearchQuery(e.target.value)}
                              onKeyDown={(e) => e.key === 'Enter' && handleResearch()}
                              className="h-14 text-lg"
                            />
                          </div>
                          <Button 
                            onClick={handleResearch} 
                            disabled={isResearching}
                            className="h-14 px-8 rounded-2xl"
                          >
                            {isResearching ? <Loader2 className="w-5 h-5 animate-spin" /> : <SearchCode className="w-5 h-5" />}
                            Search
                          </Button>
                        </div>
                      </section>

                      {researchResult && (
                        <motion.section 
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          className={cn("p-10 rounded-[48px] border shadow-xl transition-colors", isDark ? "bg-zinc-900 border-zinc-800" : "bg-white border-zinc-200")}
                        >
                          <div className="flex items-center justify-between mb-6">
                            <h4 className={cn("text-[11px] font-bold uppercase tracking-widest font-sans", isDark ? "text-zinc-600" : "text-zinc-400")}>Research Findings</h4>
                            <button 
                              onClick={() => handleTTS(researchResult)}
                              className={cn("flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest hover:text-sky-500 transition-colors", isDark ? "text-zinc-600" : "text-zinc-400")}
                            >
                              <Volume2 className="w-4 h-4" />
                              Listen
                            </button>
                          </div>
                          <div className={cn("prose prose-zinc dark:prose-invert max-w-none font-sans leading-relaxed", isDark ? "text-zinc-300" : "text-zinc-600")}>
                            <HtmlRenderer html={researchResult} />
                          </div>
                        </motion.section>
                      )}
                    </div>
                  ) : activeTab === 'image-analysis' ? (
                    <div className="max-w-4xl mx-auto space-y-8">
                      <section className={cn("p-10 rounded-[48px] border shadow-xl transition-colors", isDark ? "bg-zinc-900 border-zinc-800" : "bg-white border-zinc-200")}>
                        <div className="flex items-center gap-4 mb-8">
                          <div className="w-12 h-12 bg-purple-600/10 rounded-2xl flex items-center justify-center border border-purple-600/20">
                            <ImageIcon className="w-6 h-6 text-purple-500" />
                          </div>
                          <div>
                            <h3 className="text-2xl font-sans font-bold">Image Analysis</h3>
                            <p className={cn("text-sm font-sans transition-colors", isDark ? "text-zinc-500" : "text-zinc-400")}>Upload medical documents or images for AI-powered clinical analysis.</p>
                          </div>
                        </div>
                        
                        <div className="flex flex-col items-center justify-center p-12 border-2 border-dashed rounded-[40px] transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-900/40 cursor-pointer group relative">
                          <input 
                            type="file" 
                            accept="image/*" 
                            className="absolute inset-0 opacity-0 cursor-pointer"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                const reader = new FileReader();
                                reader.onloadend = () => {
                                  setSelectedImage(reader.result as string);
                                  handleAnalyzeImage(reader.result as string);
                                };
                                reader.readAsDataURL(file);
                              }
                            }}
                          />
                          <Upload className={cn("w-12 h-12 mb-4 transition-colors", isDark ? "text-zinc-800 group-hover:text-purple-400" : "text-zinc-200 group-hover:text-purple-600")} />
                          <p className={cn("text-lg font-sans font-bold transition-colors", isDark ? "text-zinc-600" : "text-zinc-400")}>
                            {isAnalyzingImage ? 'Analyzing Image...' : 'Click or Drag to Upload Image'}
                          </p>
                          <p className={cn("text-xs font-sans mt-2 transition-colors", isDark ? "text-zinc-700" : "text-zinc-300")}>Supports JPG, PNG, WEBP</p>
                        </div>
                      </section>

                      {selectedImage && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                          <motion.div 
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            className={cn("p-4 rounded-[40px] border transition-colors", isDark ? "bg-zinc-900 border-zinc-800" : "bg-white border-zinc-200")}
                          >
                            <img src={selectedImage} alt="Selected" className="w-full h-auto rounded-[32px] shadow-lg" referrerPolicy="no-referrer" />
                          </motion.div>
                          
                          {imageAnalysis && (
                            <motion.div 
                              initial={{ opacity: 0, x: 20 }}
                              animate={{ opacity: 1, x: 0 }}
                              className={cn("p-10 rounded-[48px] border shadow-xl transition-colors", isDark ? "bg-zinc-900 border-zinc-800" : "bg-white border-zinc-200")}
                            >
                              <div className="flex items-center justify-between mb-6">
                                <h4 className={cn("text-[11px] font-bold uppercase tracking-widest font-sans", isDark ? "text-zinc-600" : "text-zinc-400")}>Clinical Analysis</h4>
                                <button 
                                  onClick={() => handleTTS(imageAnalysis)}
                                  className={cn("flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest hover:text-sky-500 transition-colors", isDark ? "text-zinc-600" : "text-zinc-400")}
                                >
                                  <Volume2 className="w-4 h-4" />
                                  Listen
                                </button>
                              </div>
                              <div className={cn("prose prose-zinc dark:prose-invert max-w-none font-sans leading-relaxed", isDark ? "text-zinc-300" : "text-zinc-600")}>
                                <HtmlRenderer html={imageAnalysis} />
                              </div>
                            </motion.div>
                          )}
                        </div>
                      )}
                    </div>
                  ) : activeTab === 'templates' ? (
                    <div className="space-y-12">
                      <div className="flex items-center justify-between mb-8">
                        <div>
                          <h3 className={cn("text-3xl font-sans font-bold transition-colors", isDark ? "text-white" : "text-zinc-900")}>Clinical Templates</h3>
                          <p className={cn("text-sm mt-1 font-sans", isDark ? "text-zinc-500" : "text-zinc-400")}>Manage and organize your clinical documentation structure.</p>
                        </div>
                        <div className="flex gap-3">
                          <Button variant="secondary" onClick={addDefaultTemplates} className={!isDark ? "bg-white border-zinc-200 text-zinc-600 hover:bg-zinc-50" : ""}>
                            Load Defaults
                          </Button>
                          <div className="relative">
                            <input
                              type="file"
                              id="template-upload"
                              className="hidden"
                              accept=".txt,.md,.json"
                              onChange={handleTemplateUpload}
                            />
                            <Button variant="secondary" onClick={() => document.getElementById('template-upload')?.click()} className={!isDark ? "bg-white border-zinc-200 text-zinc-600 hover:bg-zinc-50" : ""}>
                              <Upload className="w-4 h-4" />
                              Upload
                            </Button>
                          </div>
                          <Button onClick={() => setIsAddTemplateModalOpen(true)} className="shadow-lg shadow-sky-600/20">
                            <Plus className="w-4 h-4 mr-2" />
                            New Template
                          </Button>
                        </div>
                      </div>
                      
                      {templates.length === 0 ? (
                        <div className={cn("py-32 text-center rounded-[48px] border-2 border-dashed transition-colors", isDark ? "bg-zinc-900/40 border-zinc-800" : "bg-zinc-50/40 border-zinc-200")}>
                          <div className={cn("w-20 h-20 mx-auto mb-6 rounded-3xl flex items-center justify-center transition-colors", isDark ? "bg-zinc-800" : "bg-zinc-100")}>
                            <Layout className={cn("w-10 h-10 transition-colors", isDark ? "text-zinc-600" : "text-zinc-300")} />
                          </div>
                          <h3 className={cn("text-2xl font-sans font-bold transition-colors", isDark ? "text-white" : "text-zinc-900")}>No templates yet</h3>
                          <p className={cn("max-w-xs mx-auto mt-3 font-sans transition-colors", isDark ? "text-zinc-500" : "text-zinc-400")}>Create custom templates or load defaults to speed up your clinical documentation.</p>
                        </div>
                      ) : (
                        <div className="space-y-16">
                          {Array.from(new Set(templates.map(t => t.category || 'General'))).sort().map(category => (
                            <div key={category} className="space-y-8">
                              <div className="flex items-center gap-4">
                                <h4 className={cn("text-[11px] font-bold uppercase tracking-[0.2em] font-sans", isDark ? "text-zinc-600" : "text-zinc-400")}>{category}</h4>
                                <div className={cn("h-px flex-1 transition-colors", isDark ? "bg-zinc-800" : "bg-zinc-100")} />
                              </div>
                              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                                {templates.filter(t => (t.category || 'General') === category).map(template => (
                                  <motion.div 
                                    layout
                                    key={template.id} 
                                    className={cn(
                                      "group p-6 rounded-[32px] border shadow-sm flex flex-col justify-between hover:shadow-2xl hover:-translate-y-1 transition-all duration-300 relative", 
                                      isDark ? "bg-zinc-900 border-zinc-800" : "bg-white border-zinc-200",
                                      selectedIds.includes(template.id) && (isDark ? "border-sky-500/50 bg-sky-500/5" : "border-sky-500/50 bg-sky-50")
                                    )}
                                  >
                                    <div>
                                      <div className="flex items-center justify-between mb-6">
                                        <div className="flex items-center gap-3">
                                          <CreativeCheckbox 
                                            checked={selectedIds.includes(template.id)}
                                            onChange={(checked) => {
                                              if (checked) {
                                                setSelectedIds(prev => [...prev, template.id]);
                                              } else {
                                                setSelectedIds(prev => prev.filter(id => id !== template.id));
                                              }
                                            }}
                                            isDark={isDark}
                                            className="w-4 h-4"
                                          />
                                          <div className={cn("w-12 h-12 rounded-[20px] flex items-center justify-center transition-colors", isDark ? "bg-zinc-800 group-hover:bg-sky-500/10" : "bg-zinc-50 group-hover:bg-sky-50")}>
                                            <Layout className={cn("w-6 h-6 transition-colors", isDark ? "text-zinc-600 group-hover:text-sky-400" : "text-zinc-300 group-hover:text-sky-600")} />
                                          </div>
                                        </div>
                                        <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                          <Button variant="ghost" className="text-red-400 hover:text-red-500 p-2 h-auto rounded-full hover:bg-red-500/10" onClick={() => setConfirmDelete({ type: 'template', id: template.id, title: template.name })}>
                                            <Trash2 className="w-3.5 h-3.5" />
                                          </Button>
                                        </div>
                                      </div>
                                      <h4 className={cn("text-lg font-sans font-bold transition-colors mb-2", isDark ? "text-white" : "text-zinc-900")}>{template.name}</h4>
                                      {template.description && (
                                        <p className={cn("text-[10px] font-sans mb-4 line-clamp-2", isDark ? "text-zinc-500" : "text-zinc-400")}>{template.description}</p>
                                      )}
                                      <div className={cn("text-[12px] line-clamp-4 p-4 rounded-[24px] font-sans leading-relaxed transition-colors border", isDark ? "text-zinc-400 bg-black/40 border-zinc-800" : "text-zinc-600 bg-zinc-50 border-zinc-100")}>
                                        <div className="prose prose-sm prose-zinc dark:prose-invert max-w-none scale-[0.9] origin-top-left">
                                          <HtmlRenderer html={template.content} />
                                        </div>
                                      </div>
                                    </div>
                                    <div className="mt-6 pt-4 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
                                      <span className={cn("text-[10px] font-bold uppercase tracking-widest", isDark ? "text-zinc-600" : "text-zinc-400")}>
                                        {template.type || 'Other'}
                                      </span>
                                      <Button 
                                        variant="ghost" 
                                        className="text-sky-500 hover:text-sky-600 p-0 h-auto font-bold text-[11px] uppercase tracking-widest"
                                        onClick={() => {
                                          if (selectedPatient) {
                                            createNote(selectedPatient.id, template.type || 'Other', template.content);
                                          } else {
                                            setActiveTab('patients');
                                            setToast({ message: "Select a patient first to use this template", type: 'error' });
                                          }
                                        }}
                                      >
                                        Use Template
                                      </Button>
                                    </div>
                                  </motion.div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : null}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </main>

        {/* Recording Overlay (Removed) */}

        {/* Modals */}
        <ConfirmationModal 
          isOpen={confirmDelete.type !== null}
          onClose={() => setConfirmDelete({ type: null, id: null, title: null })}
          onConfirm={() => {
            if (confirmDelete.type === 'note' && confirmDelete.id) deleteNote(confirmDelete.id);
            if (confirmDelete.type === 'patient' && confirmDelete.id) deletePatient(confirmDelete.id);
            if (confirmDelete.type === 'template' && confirmDelete.id) deleteTemplate(confirmDelete.id);
          }}
          title={confirmDelete.type === 'note' ? 'Delete Note' : confirmDelete.type === 'patient' ? 'Delete Patient' : 'Delete Template'}
          message={`Are you sure you want to delete "${confirmDelete.title}"? This action cannot be undone.`}
        />

        <Modal 
          isOpen={isAddPatientModalOpen} 
          onClose={() => { 
            setIsAddPatientModalOpen(false); 
            setNewPatientName(''); 
            setNewPatientDOB('');
            setNewPatientGender('');
            setNewPatientContact('');
          }}
          title="Add New Patient"
        >
          <div className="space-y-6">
            <div className="space-y-2">
              <label className={cn("text-[11px] font-bold uppercase tracking-widest font-sans ml-4 transition-colors", isDark ? "text-zinc-500" : "text-zinc-400")}>Patient Name</label>
              <Input 
                placeholder="Enter full name..." 
                value={newPatientName}
                onChange={(e) => setNewPatientName(e.target.value)}
                autoFocus
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className={cn("text-[11px] font-bold uppercase tracking-widest font-sans ml-4 transition-colors", isDark ? "text-zinc-500" : "text-zinc-400")}>Date of Birth</label>
                <Input 
                  type="date"
                  value={newPatientDOB}
                  onChange={(e) => setNewPatientDOB(e.target.value)}
                  className={isDark ? "[color-scheme:dark]" : ""}
                />
              </div>
              <div className="space-y-2">
                <label className={cn("text-[11px] font-bold uppercase tracking-widest font-sans ml-4 transition-colors", isDark ? "text-zinc-500" : "text-zinc-400")}>Gender</label>
                <select 
                  className={cn("flex h-11 w-full rounded-full border px-5 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/20 font-sans transition-colors", isDark ? "border-zinc-800 bg-zinc-900 text-white" : "border-zinc-200 bg-white text-zinc-900")}
                  value={newPatientGender}
                  onChange={(e) => setNewPatientGender(e.target.value)}
                >
                  <option value="">Select...</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                </select>
              </div>
            </div>
            <div className="space-y-2">
              <label className={cn("text-[11px] font-bold uppercase tracking-widest font-sans ml-4 transition-colors", isDark ? "text-zinc-500" : "text-zinc-400")}>Contact Information</label>
              <Input 
                placeholder="Email or Phone Number" 
                value={newPatientContact}
                onChange={(e) => setNewPatientContact(e.target.value)}
              />
            </div>
            <Button 
              className="w-full py-4 shadow-lg shadow-sky-600/20"
              onClick={() => {
                if (newPatientName) {
                  createPatient(newPatientName, newPatientDOB, newPatientGender, newPatientContact);
                  setIsAddPatientModalOpen(false);
                  setNewPatientName('');
                  setNewPatientDOB('');
                  setNewPatientGender('');
                  setNewPatientContact('');
                }
              }}
            >
              Create Patient
            </Button>
          </div>
        </Modal>

        <Modal 
          isOpen={isAddTemplateModalOpen} 
          onClose={() => { 
            setIsAddTemplateModalOpen(false); 
            setNewTemplateName(''); 
            setNewTemplateCategory('General');
            setNewTemplateDescription('');
            setNewTemplateContent(''); 
          }}
          title="New Note Template"
        >
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className={cn("text-[11px] font-bold uppercase tracking-widest font-sans ml-4 transition-colors", isDark ? "text-zinc-500" : "text-zinc-400")}>Template Name</label>
                <Input 
                  placeholder="e.g., SOAP Note..." 
                  value={newTemplateName}
                  onChange={(e) => setNewTemplateName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <label className={cn("text-[11px] font-bold uppercase tracking-widest font-sans ml-4 transition-colors", isDark ? "text-zinc-500" : "text-zinc-400")}>Category</label>
                <select 
                  className={cn("flex h-11 w-full rounded-full border px-5 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/20 font-sans transition-colors", isDark ? "border-zinc-800 bg-zinc-900 text-white" : "border-zinc-200 bg-white text-zinc-900")}
                  value={newTemplateCategory}
                  onChange={(e) => setNewTemplateCategory(e.target.value)}
                >
                  <option value="General">General</option>
                  <option value="Clinical">Clinical</option>
                  <option value="Inpatient">Inpatient</option>
                  <option value="Psychiatry">Psychiatry</option>
                  <option value="Pediatrics">Pediatrics</option>
                  <option value="Specialty">Specialty</option>
                </select>
              </div>
            </div>
            <div className="space-y-2">
              <label className={cn("text-[11px] font-bold uppercase tracking-widest font-sans ml-4 transition-colors", isDark ? "text-zinc-500" : "text-zinc-400")}>Description</label>
              <Input 
                placeholder="Briefly describe what this template is for..." 
                value={newTemplateDescription}
                onChange={(e) => setNewTemplateDescription(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className={cn("text-[11px] font-bold uppercase tracking-widest font-sans ml-4 transition-colors", isDark ? "text-zinc-500" : "text-zinc-400")}>Content (Rich Text)</label>
              <TiptapEditor 
                value={newTemplateContent}
                onChange={(val) => setNewTemplateContent(val)}
                isDark={isDark}
                placeholder="Enter template content..."
                minHeight="200px"
              />
            </div>
            <Button 
              className="w-full py-4 shadow-lg shadow-sky-600/20"
              onClick={() => {
                if (newTemplateName && newTemplateContent) {
                  createTemplate(newTemplateName, newTemplateContent, 'Other', newTemplateCategory, newTemplateDescription);
                  setIsAddTemplateModalOpen(false);
                  setNewTemplateName('');
                  setNewTemplateCategory('General');
                  setNewTemplateDescription('');
                  setNewTemplateContent('');
                }
              }}
            >
              Save Template
            </Button>
          </div>
        </Modal>

        {/* Toast Notification */}
        <AnimatePresence>
          {toast && (
            <motion.div
              initial={{ opacity: 0, y: 50, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.9 }}
              className={cn(
                "fixed bottom-8 right-8 z-[100] px-6 py-4 rounded-2xl shadow-2xl border flex items-center gap-3",
                isDark ? "bg-zinc-900 border-zinc-800" : "bg-white border-zinc-200"
              )}
            >
              <div className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center",
                toast.type === 'success' ? "bg-emerald-500/10 text-emerald-500" : "bg-rose-500/10 text-rose-500"
              )}>
                {toast.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
              </div>
              <p className="text-sm font-bold font-sans">{toast.message}</p>
              <button 
                onClick={() => setToast(null)}
                className={cn("ml-4 p-1 rounded-lg transition-colors", isDark ? "hover:bg-zinc-800" : "hover:bg-zinc-100")}
              >
                <X className="w-4 h-4" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </ErrorBoundary>
  );
}
