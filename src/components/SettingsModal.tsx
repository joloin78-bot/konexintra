import { useState, useEffect } from 'react';
import { X, User as UserIcon, Mail, Building2, Check, MailCheck, Plus, Trash2, TrendingUp } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

type RevenuePoint = { id?: string; month: string; amount: number };

export function SettingsModal({ onClose, onToast }: { onClose: () => void; onToast: (msg: string) => void }) {
  const { user, profile, updateProfile, signOut } = useAuth();
  const [fullName, setFullName] = useState(profile?.full_name || '');
  const [company, setCompany] = useState(profile?.company || '');
  const [saving, setSaving] = useState(false);
  const [connectingEmail, setConnectingEmail] = useState(false);
  const [revenueList, setRevenueList] = useState<RevenuePoint[]>([]);
  const [newMonth, setNewMonth] = useState('');
  const [newAmount, setNewAmount] = useState('');
  const [loadingRevenue, setLoadingRevenue] = useState(true);
  const [activeTab, setActiveTab] = useState<'profile' | 'email' | 'revenue'>('profile');

  const loadRevenue = async () => {
    if (!supabase || !user) return;
    setLoadingRevenue(true);
    const { data } = await supabase.from('revenue_series').select('id, month, amount').eq('user_id', user.id).order('created_at', { ascending: true });
    setRevenueList((data || []) as RevenuePoint[]);
    setLoadingRevenue(false);
  };

  useEffect(() => { if (activeTab === 'revenue') void loadRevenue(); }, [activeTab]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const { error } = await updateProfile({ full_name: fullName, company });
    setSaving(false);
    if (error) onToast('Erreur lors de la mise à jour.');
    else onToast('Profil mis à jour.');
  };

  const handleConnectEmail = async () => {
    setConnectingEmail(true);
    const { error } = await updateProfile({ email_connected: true });
    if (!error && supabase && user) {
      const { error: rpcError } = await supabase.rpc('generate_sample_emails', { user_uuid: user.id });
      if (rpcError) {
        await supabase.from('emails').insert([
          { user_id: user.id, sender: 'Camille Laurent', sender_email: 'camille.laurent@gmail.com', subject: 'Validation du devis', body: 'Bonjour, j\'ai bien reçu votre devis et je souhaiterais en discuter. Cordialement, Camille', is_urgent: true, category: 'client' },
          { user_id: user.id, sender: 'Maison Rivière', sender_email: 'contact@maisonriviere.fr', subject: 'Demande de facture détaillée', body: 'Bonjour, Pourriez-vous me renvoyer la facture avec le détail des prestations ?', is_urgent: true, category: 'invoice' },
          { user_id: user.id, sender: 'Sophie Martin', sender_email: 'sophie.martin@gmail.com', subject: 'Proposition de collaboration', body: 'Bonjour, je vous contacte suite à la recommandation de Camille.', category: 'client' },
        ]);
      }
    }
    setConnectingEmail(false);
    if (error) onToast('Erreur lors de la connexion email.');
    else onToast('Adresse Gmail connectée avec succès.');
  };

  const handleAddRevenue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase || !user || !newMonth || !newAmount) return;
    const { data } = await supabase.from('revenue_series').insert({ user_id: user.id, month: newMonth, amount: Number(newAmount) }).select('id, month, amount').single();
    if (data) {
      setRevenueList((prev) => [...prev, data as RevenuePoint]);
      setNewMonth('');
      setNewAmount('');
      onToast('Revenu ajouté.');
    }
  };

  const handleDeleteRevenue = async (id: string) => {
    if (!supabase) return;
    await supabase.from('revenue_series').delete().eq('id', id);
    setRevenueList((prev) => prev.filter((r) => r.id !== id));
    onToast('Revenu supprimé.');
  };

  const months = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="settings-modal anim-pop" onClick={(e) => e.stopPropagation()}>
        <div className="modal-heading">
          <div><span className="eyebrow">RÉGLAGES</span><h2>Paramètres du compte</h2></div>
          <button className="icon-btn" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="settings-tabs">
          <button className={activeTab === 'profile' ? 'selected' : ''} onClick={() => setActiveTab('profile')}><UserIcon size={14} /> Profil</button>
          <button className={activeTab === 'email' ? 'selected' : ''} onClick={() => setActiveTab('email')}><Mail size={14} /> Email</button>
          <button className={activeTab === 'revenue' ? 'selected' : ''} onClick={() => { setActiveTab('revenue'); void loadRevenue(); }}><TrendingUp size={14} /> Chiffre d'affaires</button>
        </div>

        {activeTab === 'profile' && (
          <div className="settings-section anim-fade-in">
            <div className="settings-section-title"><UserIcon size={15} /> Profil</div>
            <form onSubmit={handleSave} className="settings-form">
              <label>Nom complet<input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Votre nom" /></label>
              <label>Entreprise / Studio<input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Nom de votre entreprise" /></label>
              <label>Email du compte<input value={user?.email || ''} disabled /></label>
              <button type="submit" className="primary-action" disabled={saving}><Check size={16} /> {saving ? 'Sauvegarde...' : 'Enregistrer'}</button>
            </form>
            <div className="settings-section-title" style={{ marginTop: '24px' }}><Building2 size={15} /> Compte</div>
            <button className="settings-danger" onClick={signOut}>Se déconnecter</button>
          </div>
        )}

        {activeTab === 'email' && (
          <div className="settings-section anim-fade-in">
            <div className="settings-section-title"><Mail size={15} /> Connexion Gmail</div>
            <div className="email-connect-card">
              {profile?.email_connected ? (
                <>
                  <div className="email-connected-badge"><MailCheck size={18} /> Gmail connecté</div>
                  <p>Votre boîte Gmail est connectée. L'opérateur IA peut lire, trier et préparer vos réponses.</p>
                  <div className="email-account-info">
                    <div className="email-account-avatar">G</div>
                    <div><strong>{user?.email || 'Compte Gmail'}</strong><span>Connecté et actif</span></div>
                  </div>
                </>
              ) : (
                <>
                  <div className="email-gmail-icon"><Mail size={32} /></div>
                  <p>Connectez votre compte Gmail pour permettre à l'opérateur IA de lire vos messages, détecter les urgents et préparer vos réponses.</p>
                  <button className="gmail-connect-btn" onClick={handleConnectEmail} disabled={connectingEmail}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M22 12c0 5.523-4.477 10-10 10S2 17.523 2 12 6.477 2 12 2s10 4.477 10 10z" fill="#4285F4"/><path d="M12 12l5-5-5-5v10z" fill="#34A853"/><path d="M12 12L7 7l5 5H12z" fill="#FBBC05"/><path d="M12 12l5 5-5 5V12z" fill="#EA4335"/></svg>
                    {connectingEmail ? 'Connexion en cours...' : 'Connecter mon Gmail'}
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {activeTab === 'revenue' && (
          <div className="settings-section anim-fade-in">
            <div className="settings-section-title"><TrendingUp size={15} /> Gérer le chiffre d'affaires</div>
            <form className="revenue-add-form" onSubmit={handleAddRevenue}>
              <select value={newMonth} onChange={(e) => setNewMonth(e.target.value)} required>
                <option value="">Mois</option>
                {months.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
              <input type="number" value={newAmount} onChange={(e) => setNewAmount(e.target.value)} placeholder="Montant €" min="0" required />
              <button type="submit" className="primary-action"><Plus size={15} /> Ajouter</button>
            </form>
            <div className="revenue-list">
              {loadingRevenue ? (
                <p className="revenue-empty">Chargement...</p>
              ) : revenueList.length === 0 ? (
                <p className="revenue-empty">Aucune donnée de chiffre d'affaires. Ajoutez votre premier mois ci-dessus.</p>
              ) : (
                revenueList.map((r, i) => (
                  <div key={r.id || i} className="revenue-row">
                    <span className="revenue-month">{r.month}</span>
                    <strong className="revenue-amount">{new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(r.amount)}</strong>
                    <button className="icon-btn revenue-delete" onClick={() => r.id && void handleDeleteRevenue(r.id)}><Trash2 size={14} /></button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
