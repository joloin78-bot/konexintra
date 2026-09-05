import { useEffect, useRef, useState, useCallback } from 'react';
import { Mic, Sparkles, X, Square, Check, FileText, CircleDollarSign, Mail, TrendingUp, ClipboardList, ArrowRight, Download, Eye, Send } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

export type OperatorAction = { type: string; label: string; data?: Record<string, unknown> };

type ChatMessage = { role: 'user' | 'assistant'; text: string; timestamp: number };

type LiveStep = { id: string; label: string; status: 'pending' | 'active' | 'done' };

type SpeechRecognitionEvent = { results: { [key: number]: { [key: number]: { transcript: string } } } };
type SpeechRecognitionInstance = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: (event: SpeechRecognitionEvent) => void;
  onerror: () => void;
  onend: () => void;
};

export function OperatorView({ onAction }: { onAction: (action: OperatorAction) => void }) {
  const { profile, session } = useAuth();
  const [mode, setMode] = useState<'idle' | 'listening' | 'thinking' | 'speaking'>('idle');
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [liveSteps, setLiveSteps] = useState<LiveStep[]>([]);
  const [pendingDoc, setPendingDoc] = useState<{ id: string; title: string; kind: string; client: string; amount: number; status: string; date: string } | null>(null);
  const [textInput, setTextInput] = useState('');
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const firstName = (profile?.full_name || 'Nathan').split(' ')[0];
  const voicesRef = useRef<SpeechSynthesisVoice[]>([]);
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const conversationActiveRef = useRef(false);
  const askOperatorRef = useRef<(msg: string) => void>(() => {});
  const startListeningRef = useRef<() => void>(() => {});
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, liveSteps]);

  useEffect(() => {
    const loadVoices = () => {
      const voices = window.speechSynthesis?.getVoices() || [];
      voicesRef.current = voices;
    };
    loadVoices();
    if ('speechSynthesis' in window) {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
    return () => {
      recognitionRef.current?.stop();
      window.speechSynthesis?.cancel();
    };
  }, []);

  const speak = useCallback((text: string) => {
    if (!('speechSynthesis' in window)) {
      setMode('idle');
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'fr-FR';
    utterance.rate = 1.0;
    utterance.pitch = 1.0;

    const voices = voicesRef.current.length > 0
      ? voicesRef.current
      : window.speechSynthesis?.getVoices() || [];

    const frVoices = voices.filter((v) => v.lang.startsWith('fr'));
    const preferred = frVoices.find((v) => /google/i.test(v.name))
      || frVoices.find((v) => /natural|amelie|audrey|marie|celine|thomas|julie/i.test(v.name))
      || frVoices.find((v) => v.lang === 'fr-FR')
      || frVoices[0];
    if (preferred) utterance.voice = preferred;

    utterance.onstart = () => setMode('speaking');
    utterance.onend = () => {
      if (conversationActiveRef.current) {
        startListeningRef.current();
      } else {
        setMode('idle');
      }
    };
    utterance.onerror = () => {
      if (conversationActiveRef.current) {
        startListeningRef.current();
      } else {
        setMode('idle');
      }
    };
    window.speechSynthesis.speak(utterance);
  }, []);

  const stopSession = () => {
    conversationActiveRef.current = false;
    recognitionRef.current?.stop();
    window.speechSynthesis?.cancel();
    setMode('idle');
  };

  const addLiveSteps = (steps: string[]) => {
    setLiveSteps(steps.map((s, i) => ({ id: `step-${i}`, label: s, status: i === 0 ? 'active' : 'pending' as const })));
  };

  const advanceLiveStep = () => {
    setLiveSteps((prev) => {
      const next = [...prev];
      const activeIdx = next.findIndex((s) => s.status === 'active');
      if (activeIdx >= 0) next[activeIdx].status = 'done';
      if (activeIdx + 1 < next.length) next[activeIdx + 1].status = 'active';
      return next;
    });
  };

  const askOperator = useCallback(async (message: string) => {
    const trimmed = message.trim();
    if (!trimmed) return;
    setTranscript(trimmed);
    setError(null);
    setMode('thinking');
    setMessages((prev) => [...prev, { role: 'user', text: trimmed, timestamp: Date.now() }]);

    try {
      const accessToken = session?.access_token;
      if (!accessToken) throw new Error('no-session');
      const responseData = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-operator`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message: trimmed }),
      });
      if (!responseData.ok) throw new Error('request-failed');
      const data: { response?: string; action?: OperatorAction; live_steps?: string[]; pending_doc?: Record<string, unknown> | null } = await responseData.json();
      if (!data.response) throw new Error('invalid-response');

      setMessages((prev) => [...prev, { role: 'assistant', text: data.response!, timestamp: Date.now() }]);

      if (data.live_steps && data.live_steps.length > 0) {
        addLiveSteps(data.live_steps);
        for (let i = 0; i < data.live_steps.length; i++) {
          await new Promise((r) => setTimeout(r, 700));
          advanceLiveStep();
        }
        setTimeout(() => setLiveSteps([]), 1000);
      }

      if (data.pending_doc) {
        setPendingDoc(data.pending_doc as typeof pendingDoc);
      }

      speak(data.response!);

      if (data.action) {
        window.setTimeout(() => onAction(data.action as OperatorAction), 800);
      }
    } catch {
      setMode('idle');
      setError("Je n'ai pas pu joindre l'opérateur. Vérifiez votre connexion puis réessayez.");
    }
  }, [session, speak, onAction]);

  askOperatorRef.current = askOperator;

  const startListening = () => {
    if (mode === 'speaking' || mode === 'thinking') {
      stopSession();
      return;
    }
    if (mode === 'idle') conversationActiveRef.current = true;
    const SpeechRecognition = (window as Window & { webkitSpeechRecognition?: new () => SpeechRecognitionInstance }).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError("La commande vocale n'est pas disponible dans ce navigateur. Utilisez Chrome ou Edge.");
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = 'fr-FR';
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      setMode('thinking');
      void askOperatorRef.current(event.results[0][0].transcript);
    };
    recognition.onerror = () => {
      if (conversationActiveRef.current) {
        setMode('idle');
        setTimeout(() => {
          if (conversationActiveRef.current) startListeningRef.current();
        }, 500);
      } else {
        setMode('idle');
      }
    };
    recognition.onend = () => {
      if (modeRef.current === 'listening') setMode('idle');
    };
    recognitionRef.current = recognition;
    setError(null);
    setMode('listening');
    recognition.start();
  };
  startListeningRef.current = startListening;

  const handleTextSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!textInput.trim()) return;
    conversationActiveRef.current = false;
    void askOperator(textInput);
    setTextInput('');
  };

  const confirmPendingDoc = async () => {
    if (!pendingDoc || !supabase || !session?.user) return;
    const { error: insertError } = await supabase.from('operator_items').insert({ kind: 'document', title: pendingDoc.title, payload: pendingDoc, user_id: session.user.id });
    if (!insertError) {
      setMessages((prev) => [...prev, { role: 'assistant', text: `Parfait ! Le ${pendingDoc.kind.toLowerCase()} ${pendingDoc.id} a été créé pour ${pendingDoc.client}. Vous pouvez le retrouver dans la section Documents.`, timestamp: Date.now() }]);
      onAction({ type: 'document_created', label: 'Voir le document', data: { document: pendingDoc } });
    }
    setPendingDoc(null);
  };

  const cancelPendingDoc = () => {
    setPendingDoc(null);
    setMessages((prev) => [...prev, { role: 'assistant', text: "D'accord, j'annule la création. Dites-moi si vous voulez modifier quelque chose.", timestamp: Date.now() }]);
  };

  const statusText = mode === 'listening' ? 'Je vous écoute...' : mode === 'thinking' ? 'Je réfléchis...' : mode === 'speaking' ? 'Je vous réponds...' : (conversationActiveRef.current ? 'Appuyez pour continuer' : 'Appuyez pour parler');
  const quickActions = ['Crée un devis', 'Crée une facture', 'Quels sont mes mails non lus ?', 'Montre-moi mon CA', 'Ajoute une tâche', 'Mes rendez-vous'];

  return (
    <div className="voice-operator anim-fade-in">
      <div className="voice-topbar">
        <div className="voice-brand"><div className="operator-logo"><Sparkles size={17} /></div><div><strong>IA Operator</strong><span><i className="status-dot" /> En ligne</span></div></div>
        <div className="voice-topbar-right">
          <span className="voice-privacy"><Sparkles size={12} /> Session privée</span>
          {conversationActiveRef.current && mode !== 'idle' && (
            <button className="stop-voice" onClick={stopSession}><Square size={12} /> Arrêter</button>
          )}
        </div>
      </div>
      <div className="voice-stage">
        <div className="voice-chat-area">
          {messages.length === 0 ? (
            <div className="voice-welcome">
              <span className="eyebrow">VOTRE ASSISTANT VOCAL</span>
              <h1>Bonjour {firstName}, qu'est-ce que je peux faire pour vous aujourd'hui ?</h1>
              <p className="voice-welcome-sub">Parlez naturellement ou écrivez — je crée vos documents, gère vos emails et bien plus.</p>
            </div>
          ) : (
            <div className="voice-chat-messages">
              {messages.map((msg, i) => (
                <div key={i} className={`voice-chat-msg ${msg.role} anim-msg-in`}>
                  {msg.role === 'assistant' && <div className="voice-chat-avatar"><Sparkles size={12} /></div>}
                  <div className="voice-chat-bubble">
                    <p>{msg.text}</p>
                  </div>
                </div>
              ))}
              {liveSteps.length > 0 && (
                <div className="voice-live-steps anim-fade-in">
                  {liveSteps.map((step) => (
                    <div key={step.id} className={`live-step live-step-${step.status}`}>
                      <span className="live-step-icon">
                        {step.status === 'done' ? <Check size={12} /> : step.status === 'active' ? <span className="live-step-spinner" /> : <span className="live-step-dot" />}
                      </span>
                      <span>{step.label}</span>
                    </div>
                  ))}
                </div>
              )}
              {pendingDoc && (
                <div className="voice-pending-doc anim-pop">
                  <div className="pending-doc-header">
                    <div className={`pending-doc-icon ${pendingDoc.kind === 'Devis' ? 'doc-blue' : 'doc-orange'}`}>
                      {pendingDoc.kind === 'Devis' ? <FileText size={18} /> : <CircleDollarSign size={18} />}
                    </div>
                    <div>
                      <strong>{pendingDoc.kind} {pendingDoc.id}</strong>
                      <span>{pendingDoc.title}</span>
                    </div>
                  </div>
                  <div className="pending-doc-details">
                    <div><span>Client</span><strong>{pendingDoc.client}</strong></div>
                    <div><span>Montant HT</span><strong>{new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(pendingDoc.amount)}</strong></div>
                    <div><span>Statut</span><strong>{pendingDoc.status}</strong></div>
                  </div>
                  <p className="pending-doc-question">Ce document vous convient-il ?</p>
                  <div className="pending-doc-actions">
                    <button className="primary-action" onClick={confirmPendingDoc}><Check size={15} /> Confirmer</button>
                    <button className="secondary-action" onClick={cancelPendingDoc}><X size={15} /> Annuler</button>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
          )}
          {transcript && mode !== 'speaking' && messages.length === 0 && (
            <p className="heard-text">« {transcript} »</p>
          )}
          {error && <div className="voice-error"><X size={14} /> {error}</div>}
        </div>
        <div className="voice-orb-section">
          <button className={`voice-orb orb-${mode}`} onClick={startListening} aria-label={statusText}>
            <span className="orb-halo halo-one" /><span className="orb-halo halo-two" />
            <span className="orb-core">
              {mode === 'speaking' ? <Square size={28} /> : mode === 'thinking' ? <Sparkles size={34} className="orb-spin-icon" /> : <Mic size={34} />}
            </span>
          </button>
          <div className={`voice-status status-${mode}`}><span className="voice-status-dot" /> {statusText}</div>
          {mode === 'idle' && !error && messages.length === 0 && (
            <div className="quick-actions">
              <span>Suggestions — cliquez pour parler</span>
              {quickActions.map((action) => (
                <button key={action} onClick={() => { conversationActiveRef.current = false; void askOperator(action); }}>{action}</button>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="voice-controls">
        <form className="voice-text-form" onSubmit={handleTextSubmit}>
          <input
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            placeholder="Écrivez votre message..."
          />
          <button type="submit" className="voice-text-send"><ArrowRight size={18} /></button>
        </form>
        <div className="voice-control-row">
          <button className={`voice-mic-btn mic-${mode}`} onClick={startListening} aria-label={statusText}>
            {mode === 'speaking' || mode === 'thinking' ? <Square size={18} /> : <Mic size={18} />}
          </button>
          {conversationActiveRef.current && mode !== 'idle' && (
            <button className="stop-voice" onClick={stopSession}><Square size={14} /> Arrêter la conversation</button>
          )}
        </div>
        <div className="voice-hint">
          <Mic size={14} /> {mode === 'listening' ? 'Parlez naturellement, je m’occupe du reste.' : 'Votre voix reste privée et n’est pas enregistrée.'}
        </div>
      </div>
    </div>
  );
}
