import { cn } from "../../lib/utils";
import React, { useState, useRef, useEffect, forwardRef, useImperativeHandle, useMemo, useCallback, createContext } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { ArrowRight, Key, Globe, Shield, ArrowLeft, X, AlertCircle, PartyPopper, Loader, Brain } from "lucide-react";
import { AnimatePresence, motion, useInView, Variants, Transition } from "framer-motion";
import confetti from "canvas-confetti";
import { Button } from "./button";

// --- CONFETTI LOGIC ---
type Api = { fire: (options?: confetti.Options) => void }
export type ConfettiRef = Api | null;

const Confetti = forwardRef<ConfettiRef, React.ComponentPropsWithRef<"canvas"> & { options?: confetti.Options; globalOptions?: confetti.GlobalOptions; manualstart?: boolean }>((props, ref) => {
  const { options, globalOptions = { resize: true, useWorker: true }, manualstart = false, ...rest } = props;
  const instanceRef = useRef<confetti.CreateTypes | null>(null);
  
  const canvasRef = useCallback((node: HTMLCanvasElement) => {
    if (node !== null) {
      if (!instanceRef.current) {
        instanceRef.current = confetti.create(node, { ...globalOptions, resize: true });
      }
    } else {
      if (instanceRef.current) {
        instanceRef.current.reset();
        instanceRef.current = null;
      }
    }
  }, [globalOptions]);

  const fire = useCallback((opts = {}) => instanceRef.current?.({ ...options, ...opts }), [options]);
  const api = useMemo(() => ({ fire }), [fire]);
  useImperativeHandle(ref, () => api, [api]);

  useEffect(() => {
    if (!manualstart) fire();
  }, [manualstart, fire]);

  return <canvas ref={canvasRef} {...rest} />;
});
Confetti.displayName = "Confetti";

// --- TEXT LOOP ANIMATION COMPONENT ---
type TextLoopProps = {
  children: React.ReactNode[];
  className?: string;
  interval?: number;
  transition?: Transition;
  variants?: Variants;
  onIndexChange?: (index: number) => void;
  stopOnEnd?: boolean;
};

export function TextLoop({ children, className, interval = 2, transition = { duration: 0.3 }, variants, onIndexChange, stopOnEnd = false }: TextLoopProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const items = React.Children.toArray(children);

  useEffect(() => {
    const intervalMs = interval * 1000;
    const timer = setInterval(() => {
      setCurrentIndex((current) => {
        if (stopOnEnd && current === items.length - 1) {
          clearInterval(timer);
          return current;
        }
        const next = (current + 1) % items.length;
        onIndexChange?.(next);
        return next;
      });
    }, intervalMs);
    return () => clearInterval(timer);
  }, [items.length, interval, onIndexChange, stopOnEnd]);

  const motionVariants: Variants = {
    initial: { y: 20, opacity: 0 },
    animate: { y: 0, opacity: 1 },
    exit: { y: -20, opacity: 0 },
  };

  return (
    <div className={cn('relative inline-block whitespace-nowrap', className)}>
      <AnimatePresence mode='popLayout' initial={false}>
        <motion.div key={currentIndex} initial='initial' animate='animate' exit='exit' transition={transition} variants={variants || motionVariants}>
          {items[currentIndex]}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

// --- BUILT-IN BLUR FADE ANIMATION COMPONENT ---
interface BlurFadeProps {
  children: React.ReactNode;
  className?: string;
  variant?: { hidden: { y: number }; visible: { y: number } };
  duration?: number;
  delay?: number;
  yOffset?: number;
  inView?: boolean;
  inViewMargin?: string;
  blur?: string;
}

function BlurFade({ children, className, variant, duration = 0.4, delay = 0, yOffset = 6, inView = true, inViewMargin = "-50px", blur = "6px" }: BlurFadeProps) {
  const ref = useRef(null);
  const inViewResult = useInView(ref, { once: true, margin: inViewMargin as any });
  const isInView = !inView || inViewResult;

  const defaultVariants: Variants = {
    hidden: { y: yOffset, opacity: 0, filter: `blur(${blur})` },
    visible: { y: -yOffset, opacity: 1, filter: `blur(0px)` },
  };

  const combinedVariants = variant || defaultVariants;

  return (
    <motion.div ref={ref} initial="hidden" animate={isInView ? "visible" : "hidden"} exit="hidden" variants={combinedVariants} transition={{ delay: 0.04 + delay, duration, ease: "easeOut" }} className={className}>
      {children}
    </motion.div>
  );
}

// --- BUILT-IN GLASS BUTTON COMPONENT ---
const glassButtonVariants = cva("relative isolate all-unset cursor-pointer rounded-full transition-all", {
  variants: {
    size: {
      default: "text-base font-medium",
      sm: "text-sm font-medium",
      lg: "text-lg font-medium",
      icon: "h-10 w-10"
    }
  },
  defaultVariants: {
    size: "default"
  }
});

const glassButtonTextVariants = cva("glass-button-text relative block select-none tracking-tighter", {
  variants: {
    size: {
      default: "px-6 py-3.5",
      sm: "px-4 py-2",
      lg: "px-8 py-4",
      icon: "flex h-10 w-10 items-center justify-center"
    }
  },
  defaultVariants: {
    size: "default"
  }
});

export interface GlassButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof glassButtonVariants> {
  contentClassName?: string;
}

const GlassButton = React.forwardRef<HTMLButtonElement, GlassButtonProps>(
  ({ className, children, size, contentClassName, onClick, ...props }, ref) => {
    const handleWrapperClick = (e: React.MouseEvent<HTMLDivElement>) => {
      const button = e.currentTarget.querySelector('button');
      if (button && e.target !== button) button.click();
    };
    return (
      <div className={cn("glass-button-wrap cursor-pointer rounded-full relative", className)} onClick={handleWrapperClick}>
        <button className={cn("glass-button relative z-10", glassButtonVariants({ size }))} ref={ref} onClick={onClick} {...props}>
          <span className={cn(glassButtonTextVariants({ size }), contentClassName)}>{children}</span>
        </button>
        <div className="glass-button-shadow rounded-full pointer-events-none"></div>
      </div>
    );
  }
);
GlassButton.displayName = "GlassButton";

// --- SVG GRADIENT BACKGROUND ---
const GradientBackground = () => (
  <>
    <style>
      {`
        @keyframes float1 {
          0% { transform: translate(0, 0); }
          50% { transform: translate(-10px, 10px); }
          100% { transform: translate(0, 0); }
        }
        @keyframes float2 {
          0% { transform: translate(0, 0); }
          50% { transform: translate(10px, -10px); }
          100% { transform: translate(0, 0); }
        }
      `}
    </style>
    <svg width="100%" height="100%" viewBox="0 0 800 600" fill="none" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice" className="absolute top-0 left-0 w-full h-full">
      <defs>
        <linearGradient id="rev_grad1" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style={{stopColor: 'var(--color-primary, #f97316)', stopOpacity:0.8}} />
          <stop offset="100%" style={{stopColor: '#3b82f6', stopOpacity:0.6}} />
        </linearGradient>
        <linearGradient id="rev_grad2" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style={{stopColor: '#10b981', stopOpacity:0.9}} />
          <stop offset="50%" style={{stopColor: '#f43f5e', stopOpacity:0.7}} />
          <stop offset="100%" style={{stopColor: '#8b5cf6', stopOpacity:0.6}} />
        </linearGradient>
        <radialGradient id="rev_grad3" cx="50%" cy="50%" r="50%">
          <stop offset="0%" style={{stopColor: '#ef4444', stopOpacity:0.8}} />
          <stop offset="100%" style={{stopColor: '#eab308', stopOpacity:0.4}} />
        </radialGradient>
        <filter id="rev_blur1" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="35"/></filter>
        <filter id="rev_blur2" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="25"/></filter>
        <filter id="rev_blur3" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="45"/></filter>
      </defs>
      <g style={{ animation: 'float1 20s ease-in-out infinite' }}>
        <ellipse cx="200" cy="500" rx="250" ry="180" fill="url(#rev_grad1)" filter="url(#rev_blur1)" transform="rotate(-30 200 500)"/>
        <rect x="500" y="100" width="300" height="250" rx="80" fill="url(#rev_grad2)" filter="url(#rev_blur2)" transform="rotate(15 650 225)"/>
      </g>
      <g style={{ animation: 'float2 25s ease-in-out infinite' }}>
        <circle cx="650" cy="450" r="150" fill="url(#rev_grad3)" filter="url(#rev_blur3)" opacity="0.7"/>
        <ellipse cx="50" cy="150" rx="180" ry="120" fill="#facc15" filter="url(#rev_blur2)" opacity="0.8"/>
      </g>
    </svg>
  </>
);

const GoogleIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" className="w-5 h-5 flex-shrink-0">
    <g fillRule="evenodd" fill="none">
      <g fillRule="nonzero" transform="translate(3, 2)">
        <path fill="#4285F4" d="M57.8123233,30.1515267 C57.8123233,27.7263183 57.6155321,25.9565533 57.1896408,24.1212666 L29.4960833,24.1212666 L29.4960833,35.0674653 L45.7515771,35.0674653 C45.4239683,37.7877475 43.6542033,41.8844383 39.7213169,44.6372555 L39.6661883,45.0037254 L48.4223791,51.7870338 L49.0290201,51.8475849 C54.6004021,46.7020943 57.8123233,39.1313952 57.8123233,30.1515267"></path>
        <path fill="#34A853" d="M29.4960833,58.9921667 C37.4599129,58.9921667 44.1456164,56.3701671 49.0290201,51.8475849 L39.7213169,44.6372555 C37.2305867,46.3742596 33.887622,47.5868638 29.4960833,47.5868638 C21.6960582,47.5868638 15.0758763,42.4415991 12.7159637,35.3297782 L12.3700541,35.3591501 L3.26524241,42.4054492 L3.14617358,42.736447 C7.9965904,52.3717589 17.959737,58.9921667 29.4960833,58.9921667"></path>
        <path fill="#FBBC05" d="M12.7159637,35.3297782 C12.0932812,33.4944915 11.7329116,31.5279353 11.7329116,29.4960833 C11.7329116,27.4640054 12.0932812,25.4976752 12.6832029,23.6623884 L12.6667095,23.2715173 L3.44779955,16.1120237 L3.14617358,16.2554937 C1.14708246,20.2539019 0,24.7439491 0,29.4960833 C0,34.2482175 1.14708246,38.7380388 3.14617358,42.736447 L12.7159637,35.3297782"></path>
        <path fill="#EB4335" d="M29.4960833,11.4050769 C35.0347044,11.4050769 38.7707997,13.7975244 40.9011602,15.7968415 L49.2255853,7.66898166 C44.1130815,2.91684746 37.4599129,0 29.4960833,0 C17.959737,0 7.9965904,6.62018183 3.14617358,16.2554937 L12.6832029,23.6623884 C15.0758763,16.5505675 21.6960582,11.4050769 29.4960833,11.4050769"></path>
      </g>
    </g>
  </svg>
);

const modalSteps = [
  { message: "Securing keys...", icon: <Loader className="w-12 h-12 text-primary animate-spin" /> },
  { message: "Onboarding...", icon: <Loader className="w-12 h-12 text-primary animate-spin" /> },
  { message: "Finishing up...", icon: <Loader className="w-12 h-12 text-primary animate-spin" /> },
  { message: "Welcome to Actra!", icon: <PartyPopper className="w-12 h-12 text-green-500" /> }
];

const TEXT_LOOP_INTERVAL = 1.2;

interface OnboardingProps {
  onComplete: (data: { cloudflareAccountId: string; cloudflareApiKey: string; groqKey: string }) => void;
  onGoogleSignIn: () => Promise<void>;
  userProfile: { displayName?: string; avatarUrl?: string } | null;
}

export function OnboardingStepper({ onComplete, onGoogleSignIn, userProfile }: OnboardingProps) {
  const [currentStep, setCurrentStep] = useState<"google" | "cloudflare" | "groq">("google");
  const [cloudflareAccountId, setCloudflareAccountId] = useState("");
  const [cloudflareApiKey, setCloudflareApiKey] = useState("");
  const [groqKey, setGroqKey] = useState("");
  
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [modalStatus, setModalStatus] = useState<'closed' | 'loading' | 'error' | 'success'>('closed');
  const [modalErrorMessage, setModalErrorMessage] = useState('');
  const confettiRef = useRef<ConfettiRef>(null);

  const progressPct = currentStep === "google" ? 0 : currentStep === "cloudflare" ? 50 : 100;

  const fireSideCanons = () => {
    const fire = confettiRef.current?.fire;
    if (fire) {
      const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 100 };
      const particleCount = 50;
      fire({ ...defaults, particleCount, origin: { x: 0, y: 1 }, angle: 60 });
      fire({ ...defaults, particleCount, origin: { x: 1, y: 1 }, angle: 120 });
    }
  };

  const handleGoogleSignIn = async () => {
    setIsSigningIn(true);
    try {
      await onGoogleSignIn();
      setCurrentStep("cloudflare");
    } catch (err: any) {
      console.error("Google sign in failed", err);
      setModalErrorMessage(err.message || "Failed to authenticate with Google.");
      setModalStatus('error');
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleFinalSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (modalStatus !== 'closed') return;
    
    setModalStatus('loading');
    const loadingStepsCount = modalSteps.length - 1;
    const totalDuration = loadingStepsCount * TEXT_LOOP_INTERVAL * 1000;

    setTimeout(() => {
      fireSideCanons();
      setModalStatus('success');
      
      // Delay final completion slightly to show success checkmark & confetti
      setTimeout(() => {
        onComplete({ cloudflareAccountId, cloudflareApiKey, groqKey });
      }, 1500);
    }, totalDuration);
  };

  const handleNext = () => {
    if (currentStep === "google") {
      if (!userProfile) {
        handleGoogleSignIn();
      } else {
        setCurrentStep("cloudflare");
      }
    } else if (currentStep === "cloudflare") {
      setCurrentStep("groq");
    }
  };

  const handleGoBack = () => {
    if (currentStep === "groq") {
      setCurrentStep("cloudflare");
    } else if (currentStep === "cloudflare") {
      setCurrentStep("google");
    }
  };

  const isNextDisabled = () => {
    if (currentStep === "google" && !userProfile) return true;
    if (currentStep === "cloudflare" && (!cloudflareAccountId.trim() || !cloudflareApiKey.trim())) return true;
    return false;
  };

  const closeModal = () => {
    setModalStatus('closed');
    setModalErrorMessage('');
  };

  useEffect(() => {
    if (modalStatus === 'success') {
      fireSideCanons();
    }
  }, [modalStatus]);

  const Modal = () => (
    <AnimatePresence>
      {modalStatus !== 'closed' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="relative bg-white border border-zinc-200 rounded-2xl p-8 w-full max-w-sm flex flex-col items-center gap-4 mx-4 shadow-2xl">
            {modalStatus === 'error' && (
              <button onClick={closeModal} className="absolute top-2 right-2 p-1 text-zinc-400 hover:text-zinc-600 transition-colors">
                <X className="w-5 h-5" />
              </button>
            )}
            {modalStatus === 'error' && (
              <>
                <AlertCircle className="w-12 h-12 text-rose-500 animate-bounce" />
                <p className="text-lg font-semibold text-zinc-900 text-center">{modalErrorMessage}</p>
                <GlassButton onClick={closeModal} size="sm" className="mt-4 bg-zinc-900 hover:bg-zinc-800 text-white font-medium">Try Again</GlassButton>
              </>
            )}
            {modalStatus === 'loading' && (
              <TextLoop interval={TEXT_LOOP_INTERVAL} stopOnEnd={true}>
                {modalSteps.slice(0, -1).map((step, i) => (
                  <div key={i} className="flex flex-col items-center gap-4">
                    {step.icon}
                    <p className="text-lg font-semibold text-zinc-800 animate-pulse">{step.message}</p>
                  </div>
                ))}
              </TextLoop>
            )}
            {modalStatus === 'success' && (
              <div className="flex flex-col items-center gap-4">
                {modalSteps[modalSteps.length - 1].icon}
                <p className="text-lg font-bold text-zinc-900 animate-bounce">{modalSteps[modalSteps.length - 1].message}</p>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return (
    <div className="bg-[#FDFBF7] min-h-screen w-screen flex flex-col justify-center items-center relative overflow-hidden select-none">
      <style>{`
        input[type="password"]::-ms-reveal,
        input[type="password"]::-ms-clear {
          display: none !important;
        }
        input:-webkit-autofill,
        input:-webkit-autofill:hover,
        input:-webkit-autofill:focus {
          -webkit-box-shadow: 0 0 0 30px transparent inset !important;
          -webkit-text-fill-color: var(--color-zinc-900) !important;
          transition: background-color 5000s ease-in-out 0s !important;
        }
        @property --angle-1 {
          syntax: "<angle>";
          inherits: false;
          initial-value: -75deg;
        }
        @property --angle-2 {
          syntax: "<angle>";
          inherits: false;
          initial-value: -45deg;
        }
        .glass-button-wrap {
          --anim-time: 400ms;
          --anim-ease: cubic-bezier(0.25, 1, 0.5, 1);
          --border-width: clamp(1px, 0.0625em, 4px);
          position: relative;
          z-index: 2;
          transform-style: preserve-3d;
          transition: transform var(--anim-time) var(--anim-ease);
        }
        .glass-button-wrap:has(.glass-button:active) {
          transform: rotateX(25deg);
        }
        .glass-button-shadow {
          --shadow-cutoff-fix: 2em;
          position: absolute;
          width: calc(100% + var(--shadow-cutoff-fix));
          height: calc(100% + var(--shadow-cutoff-fix));
          top: calc(0% - var(--shadow-cutoff-fix) / 2);
          left: calc(0% - var(--shadow-cutoff-fix) / 2);
          filter: blur(clamp(2px, 0.125em, 12px));
          transition: filter var(--anim-time) var(--anim-ease);
          pointer-events: none;
          z-index: 0;
        }
        .glass-button-shadow::after {
          content: "";
          position: absolute;
          inset: 0;
          border-radius: 9999px;
          background: linear-gradient(180deg, rgba(24, 24, 27, 0.15), rgba(24, 24, 27, 0.05));
          width: calc(100% - var(--shadow-cutoff-fix) - 0.25em);
          height: calc(100% - var(--shadow-cutoff-fix) - 0.25em);
          top: calc(var(--shadow-cutoff-fix) - 0.5em);
          left: calc(var(--shadow-cutoff-fix) - 0.875em);
          padding: 0.125em;
          box-sizing: border-box;
          mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
          mask-composite: exclude;
          transition: all var(--anim-time) var(--anim-ease);
          opacity: 1;
        }
        .glass-button {
          backdrop-filter: blur(4px);
          transition: all var(--anim-time) var(--anim-ease);
          background: linear-gradient(-75deg, rgba(24, 24, 27, 0.03), rgba(24, 24, 27, 0.1), rgba(24, 24, 27, 0.03));
          box-shadow: inset 0 0.125em 0.125em rgba(255, 255, 255, 0.6), inset 0 -0.125em 0.125em rgba(0, 0, 0, 0.05);
        }
        .glass-button:hover {
          transform: scale(0.975);
          backdrop-filter: blur(2px);
          box-shadow: inset 0 0.125em 0.125em rgba(255, 255, 255, 0.8), inset 0 -0.125em 0.125em rgba(0, 0, 0, 0.1);
        }
        .glass-button-text {
          color: #18181b;
        }
        .glass-input-wrap {
          position: relative;
          z-index: 2;
          transform-style: preserve-3d;
          border-radius: 9999px;
        }
        .glass-input {
          display: flex;
          position: relative;
          width: 100%;
          align-items: center;
          gap: 0.5rem;
          border-radius: 9999px;
          padding: 0.5rem 1rem;
          backdrop-filter: blur(4px);
          transition: all 400ms cubic-bezier(0.25, 1, 0.5, 1);
          background: linear-gradient(-75deg, rgba(24, 24, 27, 0.02), rgba(24, 24, 27, 0.06), rgba(24, 24, 27, 0.02));
          box-shadow: inset 0 0.125em 0.125em rgba(0, 0, 0, 0.05), inset 0 -0.125em 0.125em rgba(255, 255, 255, 0.8);
          border: 1px solid rgba(24, 24, 27, 0.08);
        }
      `}</style>
      
      <Confetti ref={confettiRef} manualstart className="fixed top-0 left-0 w-full h-full pointer-events-none z-[999]" />
      <Modal />

      <div className="absolute inset-0 z-0 opacity-40"><GradientBackground /></div>

      <div className="relative z-10 w-full max-w-md bg-white/70 backdrop-blur-md rounded-3xl border border-zinc-200/50 p-8 shadow-2xl space-y-8 flex flex-col">
        <div className="text-center space-y-2">
          <div className="mx-auto w-12 h-12 bg-orange-100 text-orange-600 rounded-full flex items-center justify-center mb-2 shadow-inner">
            <Brain className="w-6 h-6" />
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-zinc-950 font-serif">Welcome to Actra</h2>
          <p className="text-xs text-zinc-500 uppercase tracking-widest font-semibold">Let's configure your workspace</p>
        </div>

        {/* Progress bar */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs font-semibold text-zinc-600">
            <span>Step {currentStep === "google" ? 1 : currentStep === "cloudflare" ? 2 : 3} of 3</span>
            <span>{progressPct}%</span>
          </div>
          <div className="h-1.5 w-full bg-zinc-100 rounded-full overflow-hidden">
            <motion.div className="h-full bg-orange-500" animate={{ width: `${progressPct}%` }} transition={{ duration: 0.3 }} />
          </div>
        </div>

        {/* Step Content */}
        <div className="min-h-[180px] flex flex-col justify-center">
          <AnimatePresence mode="wait">
            {currentStep === "google" && (
              <motion.div key="google" initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -10, opacity: 0 }} className="space-y-6 text-center flex flex-col items-center">
                <BlurFade delay={0.1} className="w-full">
                  <div className="mx-auto w-14 h-14 bg-zinc-50 rounded-2xl flex items-center justify-center shadow-md border border-zinc-200/30">
                    <Globe className="w-7 h-7 text-blue-500 animate-pulse" />
                  </div>
                </BlurFade>
                <BlurFade delay={0.2}>
                  <h3 className="font-semibold text-lg text-zinc-900">Connect Google Workspace</h3>
                  <p className="text-xs text-zinc-500 max-w-xs mx-auto mt-1">
                    Sign in to allow the AI to securely access emails, search drives, and manage calendar events.
                  </p>
                </BlurFade>

                {userProfile ? (
                  <BlurFade delay={0.3}>
                    <div className="bg-[#FDFBF7] rounded-full py-2.5 px-5 flex items-center justify-center space-x-3 border border-zinc-300/60 mt-2 shadow-sm animate-in zoom-in-95 duration-300">
                      {userProfile.avatarUrl ? (
                        <img src={userProfile.avatarUrl} className="w-8 h-8 rounded-full border border-zinc-300" alt="Avatar" />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center text-orange-600 font-bold text-sm">
                          {userProfile.displayName?.[0] || 'G'}
                        </div>
                      )}
                      <div className="text-left leading-tight">
                        <p className="text-xs font-semibold text-emerald-600 flex items-center gap-1">Connected ✓</p>
                        <p className="text-[11px] text-zinc-500 font-medium">{userProfile.displayName}</p>
                      </div>
                    </div>
                  </BlurFade>
                ) : (
                  <BlurFade delay={0.3}>
                    <Button
                      onClick={handleGoogleSignIn}
                      disabled={isSigningIn}
                      variant="outline"
                      className="mt-4 w-full max-w-[280px] h-12 flex items-center justify-center gap-3 bg-white hover:bg-zinc-50 text-zinc-800 font-medium border border-zinc-200 shadow-sm rounded-lg transition-all cursor-pointer"
                    >
                      {isSigningIn ? (
                        <span className="text-zinc-500 flex items-center gap-2">
                          <Loader className="w-4 h-4 animate-spin" />
                          Connecting...
                        </span>
                      ) : (
                        <>
                          <GoogleIcon />
                          <span>Sign in with Google</span>
                        </>
                      )}
                    </Button>
                  </BlurFade>
                )}
              </motion.div>
            )}

            {currentStep === "cloudflare" && (
              <motion.div key="cloudflare" initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -10, opacity: 0 }} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-sm font-bold text-zinc-800 flex items-center gap-2">
                    <Globe className="w-4 h-4 text-orange-500" /> Cloudflare Credentials <span className="text-xs text-orange-500 font-normal">(Important)</span>
                  </label>
                  <p className="text-xs text-zinc-500 leading-normal">
                    This powers the local visual reasoning engine (Qwen3-30B). You can retrieve these from your Cloudflare dashboard.
                  </p>
                </div>
                
                <div className="space-y-3 pt-2">
                  <div className="glass-input-wrap">
                    <div className="glass-input">
                      <input 
                        type="text" 
                        placeholder="Cloudflare Account ID" 
                        value={cloudflareAccountId}
                        onChange={(e) => setCloudflareAccountId(e.target.value)}
                        className="w-full bg-transparent border-none text-sm text-zinc-900 placeholder-zinc-400 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="glass-input-wrap">
                    <div className="glass-input">
                      <input 
                        type="password" 
                        placeholder="Cloudflare API Token" 
                        value={cloudflareApiKey}
                        onChange={(e) => setCloudflareApiKey(e.target.value)}
                        className="w-full bg-transparent border-none text-sm text-zinc-900 placeholder-zinc-400 focus:outline-none"
                      />
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {currentStep === "groq" && (
              <motion.div key="groq" initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -10, opacity: 0 }} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-sm font-bold text-zinc-800 flex items-center gap-2">
                    <Key className="w-4 h-4 text-zinc-400" /> Groq API Key <span className="text-xs text-zinc-400 font-normal">(Optional Fallback)</span>
                  </label>
                  <p className="text-xs text-zinc-500 leading-normal">
                    Used as a fail-safe backup if Cloudflare endpoints encounter rate-limits or become temporarily unavailable.
                  </p>
                </div>
                
                <div className="glass-input-wrap pt-2">
                  <div className="glass-input">
                    <input 
                      type="password" 
                      placeholder="gsk_..." 
                      value={groqKey}
                      onChange={(e) => setGroqKey(e.target.value)}
                      className="w-full bg-transparent border-none text-sm text-zinc-900 placeholder-zinc-400 focus:outline-none"
                    />
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Footer Navigation */}
        <div className="flex items-center justify-between border-t border-zinc-200/50 pt-6">
          <Button
            variant="outline"
            size="sm"
            onClick={handleGoBack}
            disabled={currentStep === "google" || isSigningIn}
            className="cursor-pointer font-medium hover:bg-zinc-50"
          >
            <ArrowLeft className="w-4 h-4 mr-2" /> Back
          </Button>

          {currentStep === "groq" ? (
            <form onSubmit={handleFinalSubmit}>
              <Button
                type="submit"
                size="sm"
                className="cursor-pointer bg-orange-500 text-white hover:bg-orange-600 px-6 font-bold flex items-center gap-2 shadow-lg"
              >
                <span>Finish Setup</span>
                <PartyPopper className="w-4 h-4" />
              </Button>
            </form>
          ) : (
            <Button
              size="sm"
              onClick={handleNext}
              disabled={isNextDisabled() || isSigningIn}
              className="cursor-pointer bg-zinc-950 text-white hover:bg-zinc-800 px-6 font-bold flex items-center gap-2"
            >
              {currentStep === "google" && !userProfile ? (
                <>
                  <span>Connect Google</span>
                  <Globe className="w-4 h-4" />
                </>
              ) : (
                <>
                  <span>Next</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
