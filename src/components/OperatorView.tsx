import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, CircleDollarSign, FileText, Mail, Mic, RefreshCw, Sparkles, Square, X } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

export type OperatorAction = { type: string; label: string; data?: Record<string, unknown> };
type ChatMessage = { role: 'user' | 'assistant'; text: string; timestamp: number };
type LiveStep = { id: string; label: string; status: 'pending' | 'active' | 'done' };
type Presentation = { type: 'emails' | 'documents' | 'tasks' | 'calendar' | 'revenue'; title: string; subtitle?: string; items: Array<Record<string, unknown>> };
type PendingDocument = { id: string; title: string; kind: string; client: string; amount: number; status: string; date: string };
type SpeechRecognitionEvent = { results: { [key: number]: { [key: number]: { transcript: string } } } };
type SpeechRecognitionInstance = { lang: string; continuous: boolean; interimResults: boolean; start: () => void; stop: () => void; onresult: (event: SpeechRecognitionEvent) => void; onerror: () => void; onend: () => void };

const conversationTitle = 'Conversation avec l’opérateur';

function formatCurrency(value: unknown) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(Number(value) || 0);
}

function PresentationCard({ presentation }: { presentation: Presentation }) {
  return (
    <section className="operator-presentation anim-pop">
      <div className="operator-presentation-heading">
        <div className="operator-presentation-icon"><Sparkles size={15} /></div>
        <div><strong>{presentation.title}</strong><span>{presentation.subtitle || 'Voici ce que j’ai trouvé pour vous.'}</span></div>
      </div>
      <div className="operator-presentation-items">
        {presentation.items.slice(0, 5).map((item, index) => (
          <div className="operator-presentation-item" key={`${String(item.id || item.subject || item.title || index)}`}>
            <div className="operator-presentation-item-icon">
              {presentation.type === 'emails' ? <Mail size={14} /> : presentation.type === 'documents' ? <FileText size={14} /> : presentation.type === 'revenue' ? <CircleDollarSign size={14} /> : <Sparkles size={14} />}
            </div>
            <div className="operator-presentation-item-copy">
              <strong>{String(item.subject || item.title || item.name || item.month || 'Élément')}</strong>
              <span>{String(item.sender || item.client || item.description || item.status || item.amount || '')}</span>
            </div>
            {item.amount !== undefined && <b>{formatCurrency(item.amount)}</b>}
          </div>
        ))}
      </div>
    </section>
  );
}

function PendingDocumentCard({ document, onConfirm, onCancel }: { document: PendingDocument; onConfirm: () => void; onCancel: () => void }) {
  return (
    <section className="voice-pending-doc anim-pop">
      <div className="pending-doc-header">
        <div className={`pending-doc-icon ${document.kind === 'Devis' ? 'doc-blue' : 'doc-orange'}`}>{document.kind === 'Devis' ? <FileText size={18} /> : <CircleDollarSign size={18} />}</div>
        <div><strong>{document.kind} {document.id}</strong><span>{document.title}</span></div>
      </div>
      <div className="pending-doc-details">
        <div><span>Client</span><strong>{document.client}</strong></div>
        <div><span>Montant HT</span><strong>{formatCurrency(document.amount)}</strong></div>
        <div><span>Statut</span><strong>{document.status}</strong></div>
      </div>
      <p className="pending-doc-question">Le document est prêt. Voulez-vous que je l’enregistre ?</p>
      <div className="pending-doc-actions">
        <button className="primary-action" onClick={onConfirm}><Check size={15} /> Enregistrer</button>
        <button className="secondary-action" onClick={onCancel}><X size={15} /> Annuler</button>
      </div>
    </section>
  );
}

export function OperatorView({ onAction }: { onAction: (action: OperatorAction) => void }) {
  const { profile, session } = useAuth();
  const [mode, setMode] = useState<'idle' | 'listening' | 'thinking' | 'speaking'>('idle');
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [liveSteps, setLiveSteps] = useState<LiveStep[]>([]);
  const [pendingDoc, setPendingDoc] = useState<PendingDocument | null>(null);
  const [presentation, setPresentation] = useState<Presentation | null>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const voicesRef = useRef<SpeechSynthesisVoice[]>([]);
  const modeRef = useRef(mode);
  const conversationActiveRef = useRef(false);
  const askOperatorRef = useRef<(message: string) => void>(() => {});
  const startListeningRef = useRef<() => void>(() => {});
  const messagesRef = useRef<ChatMessage[]>([]);
  const firstName = (profile?.full_name || 'Nathan').split(' ')[0];
  modeRef.current = mode;
  messagesRef.current = messages;

  useEffect(() => {
    const loadConversation = async () => {
      if (!supabase || !session?.user) return;
      const { data } = await supabase.from('operator_items').select('payload').eq('user_id', session.user.id).eq('kind', 'conversation').eq('title', conversationTitle).maybeSingle();
      const saved = data?.payload as { messages?: ChatMessage[] } | null;
      if (saved?.messages?.length) setMessages(saved.messages.slice(-30));
    };
    void loadConversation();
  }, [session?.user]);

  useEffect(() => {
    const loadVoices = () => { voicesRef.current = window.speechSynthesis?.getVoices() || []; };
    loadVoices();
    if ('speechSynthesis' in window) window.speechSynthesis.onvoiceschanged = loadVoices;
    return () => { recognitionRef.current?.stop(); window.speechSynthesis?.cancel(); };
  }, []);

  const persistConversation = useCallback(async (nextMessages: ChatMessage[]) => {
    if (!supabase || !session?.user) return;
    const payload = { messages: nextMessages.slice(-30) };
    const { data: existing } = await supabase.from('operator_items').select('id').eq('user_id', session.user.id).eq('kind', 'conversation').eq('title', conversationTitle).maybeSingle();
    if (existing?.id) {
      await supabase.from('operator_items').update({ payload, updated_at: new Date().toISOString() }).eq('id', existing.id);
    } else {
      await supabase.from('operator_items').insert({ kind: 'conversation', title: conversationTitle, payload });
    }
  }, [session?.user]);

  const speak = useCallback((text: string) => {
    if (!('speechSynthesis' in window)) { setMode('idle'); return; }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'fr-FR';
    utterance.rate = 0.94;
    utterance.pitch = 0.86;
    const voices = voicesRef.current.length ? voicesRef.current : window.speechSynthesis.getVoices();
    const french = voices.filter((voice) => voice.lang.toLowerCase().startsWith('fr'));
    const male = french.find((voice) => /homme|male|thomas|nicolas|pierre|paul|henri|google français/i.test(voice.name));
    if (male) utterance.voice = male;
    utterance.onstart = () => setMode('speaking');
    utterance.onend = () => conversationActiveRef.current ? window.setTimeout(() => startListeningRef.current(), 350) : setMode('idle');
    utterance.onerror = () => conversationActiveRef.current ? window.setTimeout(() => startListeningRef.current(), 350) : setMode('idle');
    window.speechSynthesis.speak(utterance);
  }, []);

  const stopSession = useCallback(() => {
    conversationActiveRef.current = false;
    recognitionRef.current?.stop();
    window.speechSynthesis?.cancel();
    setMode('idle');
  }, []);

  const addLiveSteps = (steps: string[]) => setLiveSteps(steps.map((label, index) => ({ id: `${Date.now()}-${index}`, label, status: index === 0 ? 'active' : 'pending' })));
  const advanceLiveStep = () => setLiveSteps((previous) => {
    const next = [...previous];
    const activeIndex = next.findIndex((step) => step.status === 'active');
    if (activeIndex >= 0) next[activeIndex].status = 'done';
    if (activeIndex + 1 < next.length) next[activeIndex + 1].status = 'active';
    return next;
  });

  const askOperator = useCallback(async (message: string) => {
    const trimmed = message.trim();
    if (!trimmed) return;
    setTranscript(trimmed);
    setError(null);
    setPresentation(null);
    setMode('thinking');
    const userMessage: ChatMessage = { role: 'user', text: trimmed, timestamp: Date.now() };
    const nextWithUser = [...messagesRef.current, userMessage];
    setMessages(nextWithUser);
    await persistConversation(nextWithUser);
    try {
      const accessToken = session?.access_token;
      if (!accessToken) throw new Error('no-session');
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-operator`, { method: 'POST', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ message: trimmed, conversation: nextWithUser.slice(-12) }) });
      if (!response.ok) throw new Error('request-failed');
      const data: { response?: string; action?: OperatorAction; live_steps?: string[]; pending_doc?: PendingDocument | null; presentation?: Presentation | null } = await response.json();
      if (!data.response) throw new Error('invalid-response');
      const nextMessages = [...nextWithUser, { role: 'assistant' as const, text: data.response, timestamp: Date.now() }];
      setMessages(nextMessages);
      await persistConversation(nextMessages);
      if (data.live_steps?.length) {
        addLiveSteps(data.live_steps);
        for (let index = 0; index < data.live_steps.length; index += 1) { await new Promise((resolve) => setTimeout(resolve, 550)); advanceLiveStep(); }
        window.setTimeout(() => setLiveSteps([]), 900);
      }
      if (data.pending_doc) setPendingDoc(data.pending_doc);
      if (data.presentation) setPresentation(data.presentation);
      speak(data.response);
      if (data.action) window.setTimeout(() => onAction(data.action as OperatorAction), 800);
    } catch {
      setMode('idle');
      setError('Je n’ai pas pu terminer cette action. Vérifiez votre connexion puis réessayez.');
    }
  }, [onAction, persistConversation, session?.access_token, speak]);
  askOperatorRef.current = askOperator;

  const startListening = useCallback(() => {
    if (modeRef.current === 'speaking' || modeRef.current === 'thinking') { stopSession(); return; }
    conversationActiveRef.current = true;
    const SpeechRecognition = (window as Window & { webkitSpeechRecognition?: new () => SpeechRecognitionInstance }).webkitSpeechRecognition;
    if (!SpeechRecognition) { setError('La commande vocale n’est pas disponible dans ce navigateur. Utilisez Chrome ou Edge.'); conversationActiveRef.current = false; return; }
    recognitionRef.current?.stop();
    const recognition = new SpeechRecognition();
    recognition.lang = 'fr-FR';
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = (event) => { setMode('thinking'); void askOperatorRef.current(event.results[0][0].transcript); };
    recognition.onerror = () => { if (conversationActiveRef.current) window.setTimeout(() => startListeningRef.current(), 500); else setMode('idle'); };
    recognition.onend = () => { if (modeRef.current === 'listening' && conversationActiveRef.current) window.setTimeout(() => startListeningRef.current(), 250); };
    recognitionRef.current = recognition;
    setError(null);
    setMode('listening');
    recognition.start();
  }, [stopSession]);
  startListeningRef.current = startListening;

  const confirmPendingDoc = async () => {
    if (!pendingDoc || !supabase || !session?.user) return;
    const { error: insertError } = await supabase.from('operator_items').insert({ kind: 'document', title: pendingDoc.title, payload: pendingDoc });
    if (insertError) { setError('Le document n’a pas pu être enregistré.'); return; }
    setMessages((previous) => [...previous, { role: 'assistant', text: `${pendingDoc.kind} ${pendingDoc.id} enregistré pour ${pendingDoc.client}.`, timestamp: Date.now() }]);
    onAction({ type: 'document_created', label: 'Voir le document', data: { document: pendingDoc } });
    setPendingDoc(null);
    speak(`${pendingDoc.kind} enregistré pour ${pendingDoc.client}.`);
  };

  const statusText = mode === 'listening' ? 'Je vous écoute…' : mode === 'thinking' ? 'Je prépare votre action…' : mode === 'speaking' ? 'Je vous réponds…' : conversationActiveRef.current ? 'Conversation active' : 'Appuyez pour parler';
  const hasPresentation = Boolean(presentation || pendingDoc || liveSteps.length || transcript);

  return (
    <div className="voice-operator anim-fade-in">
      <div className="voice-topbar">
        <div className="voice-brand"><div className="operator-logo"><Sparkles size={17} /></div><div><strong>IA Operator</strong><span><i className="status-dot" /> Prêt à agir</span></div></div>
        <div className="voice-topbar-right"><span className="voice-privacy"><Sparkles size={12} /> Mémoire active</span>{conversationActiveRef.current && <button className="stop-voice" onClick={stopSession}><Square size={12} /> Arrêter</button>}</div>
      </div>
      <div className="voice-stage voice-stage-orb-only">
        <div className="voice-welcome"><span className="eyebrow">VOTRE OPÉRATEUR IA</span><h1>Bonjour {firstName}, que puis-je faire pour vous ?</h1><p>Parlez naturellement. Je vous écoute, j’exécute et je vous montre chaque étape.</p></div>
        <button className={`voice-orb orb-${mode}`} onClick={startListening} aria-label={statusText}><span className="orb-halo halo-one" /><span className="orb-halo halo-two" /><span className="orb-core">{mode === 'speaking' ? <Square size={27} /> : mode === 'thinking' ? <Sparkles size={34} className="orb-spin-icon" /> : <Mic size={34} />}</span></button>
        <div className={`voice-status status-${mode}`}><span className="voice-status-dot" /> {statusText}</div>
        {hasPresentation && <div className="operator-activity-panel">
          {transcript && <div className="operator-last-request"><span>Dernière demande</span><strong>« {transcript} »</strong></div>}
          {liveSteps.length > 0 && <div className="voice-live-steps">{liveSteps.map((step) => <div key={step.id} className={`live-step live-step-${step.status}`}><span className="live-step-icon">{step.status === 'done' ? <Check size={12} /> : step.status === 'active' ? <span className="live-step-spinner" /> : <span className="live-step-dot" />}</span><span>{step.label}</span></div>)}</div>}
          {presentation && <PresentationCard presentation={presentation} />}
          {pendingDoc && <PendingDocumentCard document={pendingDoc} onConfirm={() => void confirmPendingDoc()} onCancel={() => setPendingDoc(null)} />}
          {error && <div className="voice-error"><X size={14} /> {error}</div>}
        </div>}
      </div>
      <div className="voice-controls"><button className={`voice-mic-btn mic-${mode}`} onClick={startListening} aria-label={statusText}>{mode === 'speaking' || mode === 'thinking' ? <Square size={18} /> : <Mic size={18} />}</button><div className="voice-hint"><Mic size={14} /> La conversation continue automatiquement après chaque réponse.</div></div>
    </div>
  );
}
