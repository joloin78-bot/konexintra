import { useState, useEffect, useRef } from 'react';
import { Sparkles, Mail, Lock, User as UserIcon, ArrowRight, Eye, EyeOff, Check, Zap, Building2, Phone, MapPin, FileText, ShieldCheck, RefreshCw } from 'lucide-react';
import { useAuth } from '@/lib/auth';

type CaptchaType = 'math' | 'pattern' | 'slider';

function Captcha({ onVerified }: { onVerified: (verified: boolean) => void }) {
  const [captchaType, setCaptchaType] = useState<CaptchaType>('math');
  const [mathAnswer, setMathAnswer] = useState('');
  const [mathProblem, setMathProblem] = useState({ a: 0, b: 0 });
  const [patternTarget, setPatternTarget] = useState<number[]>([]);
  const [patternSelected, setPatternSelected] = useState<number[]>([]);
  const [sliderPos, setSliderPos] = useState(0);
  const [sliderDragging, setSliderDragging] = useState(false);
  const [verified, setVerified] = useState(false);
  const [error, setError] = useState('');
  const sliderRef = useRef<HTMLDivElement>(null);

  const generateMath = () => {
    const a = Math.floor(Math.random() * 8) + 2;
    const b = Math.floor(Math.random() * 8) + 2;
    setMathProblem({ a, b });
    setMathAnswer('');
    setVerified(false);
    onVerified(false);
    setError('');
  };

  const generatePattern = () => {
    const all = [0, 1, 2, 3, 4, 5, 6, 7, 8];
    const target: number[] = [];
    while (target.length < 3) {
      const idx = Math.floor(Math.random() * 9);
      if (!target.includes(idx)) target.push(idx);
    }
    setPatternTarget(target);
    setPatternSelected([]);
    setVerified(false);
    onVerified(false);
    setError('');
  };

  const generateSlider = () => {
    setSliderPos(0);
    setVerified(false);
    onVerified(false);
    setError('');
  };

  const switchType = () => {
    const types: CaptchaType[] = ['math', 'pattern', 'slider'];
    const next = types[(types.indexOf(captchaType) + 1) % types.length];
    setCaptchaType(next);
    setVerified(false);
    onVerified(false);
    setError('');
    if (next === 'math') generateMath();
    if (next === 'pattern') generatePattern();
    if (next === 'slider') generateSlider();
  };

  useEffect(() => {
    generateMath();
  }, []);

  const checkMath = () => {
    if (parseInt(mathAnswer) === mathProblem.a + mathProblem.b) {
      setVerified(true);
      onVerified(true);
      setError('');
    } else {
      setError('Réponse incorrecte, réessayez');
      generateMath();
    }
  };

  const togglePattern = (idx: number) => {
    if (verified) return;
    const newSel = patternSelected.includes(idx)
      ? patternSelected.filter((i) => i !== idx)
      : [...patternSelected, idx];
    setPatternSelected(newSel);
    if (newSel.length === 3) {
      const match = newSel.every((i) => patternTarget.includes(i)) && patternTarget.every((i) => newSel.includes(i));
      if (match) {
        setVerified(true);
        onVerified(true);
        setError('');
      } else {
        setError('Sélection incorrecte, réessayez');
        setTimeout(() => generatePattern(), 600);
      }
    }
  };

  useEffect(() => {
    if (captchaType === 'slider' && sliderPos >= 88) {
      setVerified(true);
      onVerified(true);
      setError('');
    }
  }, [sliderPos]);

  const handleSliderMove = (clientX: number) => {
    if (!sliderRef.current || verified) return;
    const rect = sliderRef.current.getBoundingClientRect();
    const pos = Math.max(0, Math.min(88, ((clientX - rect.left) / rect.width) * 100));
    setSliderPos(pos);
  };

  useEffect(() => {
    if (!sliderDragging) return;
    const onMove = (e: MouseEvent) => handleSliderMove(e.clientX);
    const onTouchMove = (e: TouchEvent) => handleSliderMove(e.touches[0].clientX);
    const onUp = () => {
      setSliderDragging(false);
      if (sliderPos < 88 && captchaType === 'slider') {
        setTimeout(() => setSliderPos(0), 200);
      }
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('touchmove', onTouchMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchend', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchend', onUp);
    };
  }, [sliderDragging]);

  return (
    <div className="captcha-container">
      <div className="captcha-header">
        <ShieldCheck size={14} />
        <span>Vérification de sécurité</span>
        <button type="button" className="captcha-switch" onClick={switchType} title="Changer de type">
          <RefreshCw size={11} />
        </button>
      </div>
      <div className="captcha-body">
        {captchaType === 'math' && (
          <div className="captcha-math">
            <div className="captcha-math-problem">
              <span>{mathProblem.a}</span>
              <span className="captcha-op">+</span>
              <span>{mathProblem.b}</span>
              <span className="captcha-op">=</span>
              <span className="captcha-question">?</span>
            </div>
            <input
              type="number"
              value={mathAnswer}
              onChange={(e) => setMathAnswer(e.target.value)}
              onBlur={checkMath}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); checkMath(); } }}
              placeholder="Votre réponse"
              className="captcha-input"
              disabled={verified}
            />
          </div>
        )}
        {captchaType === 'pattern' && (
          <div className="captcha-pattern">
            <p className="captcha-pattern-hint">Sélectionnez les 3 cases qui clignotent</p>
            <div className="captcha-pattern-grid">
              {Array.from({ length: 9 }).map((_, i) => (
                <button
                  key={i}
                  type="button"
                  className={`captcha-cell ${patternSelected.includes(i) ? 'captcha-cell-selected' : ''} ${!verified && patternTarget.includes(i) ? 'captcha-cell-target' : ''}`}
                  onClick={() => togglePattern(i)}
                  disabled={verified}
                />
              ))}
            </div>
          </div>
        )}
        {captchaType === 'slider' && (
          <div className="captcha-slider-wrap">
            <p className="captcha-pattern-hint">Faites glisser jusqu'au bout</p>
            <div className="captcha-slider" ref={sliderRef}>
              <div className="captcha-slider-track" style={{ width: `${sliderPos}%` }} />
              <div
                className={`captcha-slider-handle ${verified ? 'captcha-slider-verified' : ''}`}
                style={{ left: `${sliderPos}%` }}
                onMouseDown={() => !verified && setSliderDragging(true)}
                onTouchStart={(e) => { if (!verified) { e.preventDefault(); setSliderDragging(true); } }}
              >
                {verified ? <Check size={14} /> : <ArrowRight size={14} />}
              </div>
              <span className="captcha-slider-text">{verified ? 'Vérifié' : 'Glisser →'}</span>
            </div>
          </div>
        )}
        {verified && (
          <div className="captcha-verified anim-pop">
            <Check size={13} /> Vérifié
          </div>
        )}
        {error && <p className="captcha-error anim-shake">{error}</p>}
      </div>
    </div>
  );
}

export function AuthScreen() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [company, setCompany] = useState('');
  const [siret, setSiret] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [vatNumber, setVatNumber] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [captchaVerified, setCaptchaVerified] = useState(false);
  const [showCompanyFields, setShowCompanyFields] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      const orbs = document.querySelectorAll('.auth-orb');
      orbs.forEach((orb) => {
        orb.classList.toggle('auth-orb-shift');
      });
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === 'signup' && !captchaVerified) {
      setError('Veuillez compléter la vérification de sécurité.');
      return;
    }
    setError(null);
    setLoading(true);
    const result = mode === 'signin'
      ? await signIn(email, password)
      : await signUp(email, password, fullName, { company, siret, address, phone, vat_number: vatNumber });
    setLoading(false);
    if (result.error) setError(result.error);
  };

  const switchMode = (newMode: 'signin' | 'signup') => {
    setMode(newMode);
    setError(null);
    setShowCompanyFields(false);
  };

  return (
    <div className="auth-screen">
      <div className="auth-bg-grid" />
      <div className="auth-orb auth-orb-1" />
      <div className="auth-orb auth-orb-2" />
      <div className="auth-orb auth-orb-3" />
      <div className="auth-left-panel">
        <div className="auth-left-content anim-fade-in-up">
          <div className="auth-left-brand">
            <div className="brand-mark large"><Sparkles size={24} /></div>
            <h1>Konekt</h1>
          </div>
          <h2 className="auth-left-title">Votre opérateur IA<br />pour piloter votre activité</h2>
          <p className="auth-left-subtitle">Gérez vos devis, factures, emails et rendez-vous avec l'aide d'une IA conversationnelle qui agit pour vous.</p>
          <div className="auth-features">
            <div className="auth-feature anim-fade-in-up" style={{ animationDelay: '100ms' }}>
              <div className="auth-feature-icon"><Zap size={16} /></div>
              <div><strong>Création instantanée</strong><span>Devis et factures par la voix ou le texte</span></div>
            </div>
            <div className="auth-feature anim-fade-in-up" style={{ animationDelay: '200ms' }}>
              <div className="auth-feature-icon"><Mail size={16} /></div>
              <div><strong>Email connecté</strong><span>L'IA lit, trie et prépare vos réponses</span></div>
            </div>
            <div className="auth-feature anim-fade-in-up" style={{ animationDelay: '300ms' }}>
              <div className="auth-feature-icon"><Sparkles size={16} /></div>
              <div><strong>Assistant vocal</strong><span>Parlez naturellement, l'IA s'occupe du reste</span></div>
            </div>
          </div>
        </div>
      </div>
      <div className="auth-right-panel">
        <div className="auth-card anim-pop">
          <div className="auth-card-brand">
            <div className="brand-mark"><Sparkles size={18} /></div>
            <span>Konekt</span>
          </div>
          <div className="auth-tabs">
            <button className={`auth-tab ${mode === 'signin' ? 'selected' : ''}`} onClick={() => switchMode('signin')}>
              Connexion
              {mode === 'signin' && <span className="auth-tab-indicator" />}
            </button>
            <button className={`auth-tab ${mode === 'signup' ? 'selected' : ''}`} onClick={() => switchMode('signup')}>
              Inscription
              {mode === 'signup' && <span className="auth-tab-indicator" />}
            </button>
          </div>
          <form onSubmit={handleSubmit} className="auth-form">
            <div className="auth-field-group">
              {mode === 'signup' && (
                <label className="auth-field anim-field-in">
                  <UserIcon size={16} />
                  <input type="text" placeholder="Nom complet" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
                </label>
              )}
              <label className="auth-field anim-field-in" style={{ animationDelay: mode === 'signup' ? '60ms' : '0ms' }}>
                <Mail size={16} />
                <input type="email" placeholder="Adresse email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </label>
              <label className="auth-field anim-field-in" style={{ animationDelay: mode === 'signup' ? '120ms' : '60ms' }}>
                <Lock size={16} />
                <input type={showPassword ? 'text' : 'password'} placeholder="Mot de passe" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
                <button type="button" className="auth-password-toggle" onClick={() => setShowPassword((v) => !v)} tabIndex={-1}>
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </label>
              {mode === 'signup' && (
                <>
                  <button type="button" className="auth-expand-btn anim-field-in" style={{ animationDelay: '180ms' }} onClick={() => setShowCompanyFields((v) => !v)}>
                    <Building2 size={14} />
                    <span>{showCompanyFields ? 'Masquer les informations entreprise' : 'Ajouter les informations entreprise'}</span>
                    <span className={`auth-expand-arrow ${showCompanyFields ? 'auth-expand-open' : ''}`}>▾</span>
                  </button>
                  {showCompanyFields && (
                    <div className="auth-company-fields anim-fade-in">
                      <label className="auth-field">
                        <Building2 size={16} />
                        <input type="text" placeholder="Nom de l'entreprise" value={company} onChange={(e) => setCompany(e.target.value)} />
                      </label>
                      <label className="auth-field">
                        <FileText size={16} />
                        <input type="text" placeholder="SIRET" value={siret} onChange={(e) => setSiret(e.target.value)} />
                      </label>
                      <label className="auth-field">
                        <MapPin size={16} />
                        <input type="text" placeholder="Adresse" value={address} onChange={(e) => setAddress(e.target.value)} />
                      </label>
                      <label className="auth-field">
                        <Phone size={16} />
                        <input type="tel" placeholder="Téléphone" value={phone} onChange={(e) => setPhone(e.target.value)} />
                      </label>
                      <label className="auth-field">
                        <FileText size={16} />
                        <input type="text" placeholder="Numéro de TVA" value={vatNumber} onChange={(e) => setVatNumber(e.target.value)} />
                      </label>
                    </div>
                  )}
                  <div className="anim-field-in" style={{ animationDelay: '240ms' }}>
                    <Captcha onVerified={setCaptchaVerified} />
                  </div>
                </>
              )}
            </div>
            {error && <p className="auth-error anim-shake">{error}</p>}
            <button type="submit" className="auth-submit" disabled={loading || (mode === 'signup' && !captchaVerified)}>
              {loading ? (
                <><span className="auth-spinner" /> Chargement...</>
              ) : (
                <>{mode === 'signin' ? 'Se connecter' : 'Créer mon compte'} <ArrowRight size={16} /></>
              )}
            </button>
          </form>
          <p className="auth-hint">
            {mode === 'signin' ? 'Pas encore de compte ? ' : 'Déjà inscrit ? '}
            <button onClick={() => switchMode(mode === 'signin' ? 'signup' : 'signin')}>
              {mode === 'signin' ? 'Créer un compte' : 'Se connecter'}
            </button>
          </p>
          <div className="auth-footer">
            <Check size={11} /> Données chiffrées &middot; Session privée
          </div>
        </div>
      </div>
    </div>
  );
}
