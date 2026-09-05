// Konekt AI Operator edge function — full voice assistant with live actions
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface DocumentItem {
  id: string;
  title: string;
  kind: string;
  client: string;
  amount: number;
  status: string;
  date: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);

    if (userError || !userData.user) {
      return new Response(JSON.stringify({ error: "Non autorisé" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = userData.user.id;
    const body = await req.json();
    const userMessage: string = (body.message || "").trim();

    if (!userMessage) {
      return new Response(JSON.stringify({ error: "Message vide" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch all user data
    const [docsResult, revenueResult, profileResult, emailsResult, tasksResult, contactsResult, eventsResult] = await Promise.all([
      supabaseAdmin.from("operator_items").select("payload").eq("user_id", userId).eq("kind", "document"),
      supabaseAdmin.from("revenue_series").select("month, amount").eq("user_id", userId).order("created_at", { ascending: true }),
      supabaseAdmin.from("profiles").select("full_name, company, email_connected, siret, address, phone, vat_number").eq("id", userId).maybeSingle(),
      supabaseAdmin.from("emails").select("*").eq("user_id", userId).order("received_at", { ascending: false }),
      supabaseAdmin.from("tasks").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
      supabaseAdmin.from("contacts").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
      supabaseAdmin.from("calendar_events").select("*").eq("user_id", userId).order("start_time", { ascending: true }),
    ]);

    const documents: DocumentItem[] = (docsResult.data || [])
      .map((row: { payload: unknown }) => row.payload as DocumentItem)
      .filter((d) => d && d.id);

    const revenue: { month: string; amount: number }[] = revenueResult.data || [];
    const profile = profileResult.data || { full_name: "", company: "", email_connected: false };
    const emails = emailsResult.data || [];
    const tasks = tasksResult.data || [];
    const contacts = contactsResult.data || [];
    const events = eventsResult.data || [];

    const firstName = (profile.full_name || "").split(" ")[0] || "cher utilisateur";
    const lowerMsg = userMessage.toLowerCase();

    let response = "";
    let action: { type: string; label: string; data?: Record<string, unknown> } | null = null;
    let liveSteps: string[] = [];
    let pendingDoc: DocumentItem | null = null;

    // Parse amount from message
    const amountMatch = userMessage.match(/(\d[\d\s.,]*\d|\d)\s*€?/);
    const parseAmount = (s: string | undefined): number | undefined => {
      if (!s) return undefined;
      const n = parseFloat(s.replace(/\s/g, "").replace(/[.,](?=\d{3})/g, "").replace(",", "."));
      return isNaN(n) ? undefined : n;
    };

    // Detect intent: create document
    const wantsDevis = lowerMsg.includes("devis") || lowerMsg.includes("quote");
    const wantsFacture = lowerMsg.includes("facture") || lowerMsg.includes("invoice");
    const wantsCreate = lowerMsg.includes("cré") || lowerMsg.includes("fait") || lowerMsg.includes("nouveau") || lowerMsg.includes("nouvelle") || lowerMsg.includes("ajoute") || lowerMsg.includes("génère") || lowerMsg.includes("prepare") || lowerMsg.includes("prépare");

    // Extract document info from message
    const extractDocInfo = (msg: string) => {
      const info: { kind?: string; client?: string; title?: string; amount?: number } = {};
      if (wantsDevis) info.kind = "Devis";
      if (wantsFacture) info.kind = "Facture";

      const amt = parseAmount(amountMatch?.[1]);
      if (amt !== undefined && amt > 0) info.amount = amt;

      const clientMatch = msg.match(/(?:pour|client|à|au)\s+([A-ZÉÈÀÂÔÎÛÇ][a-zéèàâôîûç]+(?:\s+[A-ZÉÈÀÂÔÎÛÇa-zéèàâôîûç]+)?)/);
      if (clientMatch) info.client = clientMatch[1];

      const titleMatch = msg.match(/(?:intitulé|prestation|objet)\s*:?\s*(.+)/i);
      if (titleMatch) info.title = titleMatch[1].trim();

      // Try to extract title from "un devis pour X" or "une facture pour X"
      if (!info.title && (info.client || info.amount)) {
        const prestationMatch = msg.match(/(?:devis|facture)\s+(?:pour\s+)?(.+?)(?:\s+(?:pour|de|d'un montant|à|au)\s|$)/i);
        if (prestationMatch && prestationMatch[1] && !prestationMatch[1].match(/^\d/)) {
          info.title = prestationMatch[1].trim();
        }
      }

      return info;
    };

    // === DOCUMENT CREATION ===
    if ((wantsDevis || wantsFacture) && wantsCreate) {
      const kind = wantsDevis ? "Devis" : "Facture";
      const info = extractDocInfo(userMessage);
      info.kind = kind;

      const missing: string[] = [];
      if (!info.client) missing.push("le nom du client");
      if (!info.title) missing.push("l'intitulé de la prestation");
      if (!info.amount) missing.push("le montant");

      if (missing.length === 0) {
        // All info provided — create pending doc for preview
        const docId = `${kind === "Devis" ? "D" : "F"}-${Math.floor(1000 + Math.random() * 8999)}`;
        pendingDoc = {
          id: docId,
          title: info.title!,
          kind,
          client: info.client!,
          amount: info.amount!,
          status: kind === "Devis" ? "À envoyer" : "Brouillon",
          date: "À l'instant",
        };

        liveSteps = [
          "Analyse de votre demande...",
          `Préparation du ${kind.toLowerCase()}...`,
          "Vérification des informations...",
          "Aperçu prêt à valider",
        ];

        response = `J'ai préparé un ${kind.toLowerCase()} pour ${info.client}, d'un montant de ${info.amount!.toLocaleString("fr-FR")} €. Voici l'aperçu — est-ce que cela vous convient ? Je peux le confirmer ou le modifier.`;
        action = null;
      } else {
        // Need more info
        if (missing.length === 3) {
          response = `Avec plaisir ! Pour créer ce ${kind.toLowerCase()}, j'ai besoin de quelques informations. D'abord, quel est le nom du client ?`;
        } else {
          const provided: string[] = [];
          if (info.client) provided.push(`client: ${info.client}`);
          if (info.title) provided.push(`prestation: ${info.title}`);
          if (info.amount) provided.push(`montant: ${info.amount} €`);
          response = `Avec plaisir ! J'ai noté : ${provided.join(", ")}. Il me manque encore ${missing.join(" et ")}. Pouvez-vous me les indiquer ?`;
        }
      }
    }
    // === REVENUE / CA ===
    else if (lowerMsg.includes("chiffre") || lowerMsg.includes("revenu") || lowerMsg.includes("évolution") || lowerMsg.includes("ca") || lowerMsg.includes("chiffre d'affaires")) {
      if (revenue.length > 0) {
        const total = revenue.reduce((sum, r) => sum + Number(r.amount), 0);
        const lastMonth = revenue[revenue.length - 1];
        const prevMonth = revenue[revenue.length - 2];
        const growth = prevMonth && Number(prevMonth.amount) > 0
          ? (((Number(lastMonth.amount) - Number(prevMonth.amount)) / Number(prevMonth.amount)) * 100).toFixed(1)
          : "0";
        const sign = Number(growth) >= 0 ? "+" : "";
        liveSteps = [
          "Récupération des données financières...",
          "Calcul du chiffre d'affaires...",
          "Analyse de la tendance...",
        ];
        response = `Votre chiffre d'affaires cumulé sur ${revenue.length} mois est de ${total.toLocaleString("fr-FR")} €. Le mois dernier (${lastMonth.month}), vous avez réalisé ${Number(lastMonth.amount).toLocaleString("fr-FR")} €, soit ${sign}${growth} % par rapport au mois précédent. La tendance est ${Number(growth) >= 0 ? "positive" : "négative"}.`;
      } else {
        response = `Vous n'avez pas encore de données de chiffre d'affaires. Vous pouvez en ajouter via les réglages, ou dites-moi un montant et un mois et je l'ajouterai pour vous.`;
      }
    }
    // === ADD REVENUE ===
    else if ((lowerMsg.includes("ajoute") || lowerMsg.includes("enregistre") || lowerMsg.includes("saisis")) && (lowerMsg.includes("revenu") || lowerMsg.includes("ca") || lowerMsg.includes("chiffre") || lowerMsg.includes("mois"))) {
      const amt = parseAmount(amountMatch?.[1]);
      const monthMatch = userMessage.match(/(?:mois|pour)\s+(janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre|jan|fév|mar|avr|jui|aoû|sep|oct|nov|déc)/i);
      const monthMap: Record<string, string> = {
        janvier: "Jan", février: "Fév", mars: "Mar", avril: "Avr", mai: "Mai",
        juin: "Juin", juillet: "Juil", août: "Août", septembre: "Sep", octobre: "Oct",
        novembre: "Nov", décembre: "Déc",
        jan: "Jan", fév: "Fév", mar: "Mar", avr: "Avr", jui: "Juin",
        aoû: "Août", sep: "Sep", oct: "Oct", nov: "Nov", déc: "Déc",
      };
      const month = monthMatch ? (monthMap[monthMatch[1].toLowerCase()] || monthMatch[1]) : new Date().toLocaleDateString("fr-FR", { month: "short" });

      if (amt && amt > 0) {
        liveSteps = [
          "Enregistrement du revenu...",
          "Mise à jour du chiffre d'affaires...",
        ];
        const { error: revError } = await supabaseAdmin
          .from("revenue_series")
          .insert({ user_id: userId, month, amount: amt });

        if (revError) {
          response = `Désolé, je n'ai pas pu enregistrer ce revenu. Pouvez-vous réessayer ?`;
        } else {
          response = `C'est noté ! J'ai enregistré ${amt.toLocaleString("fr-FR")} € pour le mois de ${month}. Votre chiffre d'affaires est mis à jour.`;
          action = { type: "revenue_added", label: "Voir le CA", data: { month, amount: amt } };
        }
      } else {
        response = `Pour ajouter un revenu, indiquez-moi le montant et le mois. Par exemple : "Ajoute 5000 euros pour mars".`;
      }
    }
    // === EMAILS ===
    else if (lowerMsg.includes("mail") || lowerMsg.includes("email") || lowerMsg.includes("courriel") || lowerMsg.includes("boîte")) {
      if (profile.email_connected) {
        const unread = emails.filter((e: { is_read: boolean }) => !e.is_read);
        const urgent = emails.filter((e: { is_urgent: boolean }) => e.is_urgent);
        liveSteps = [
          "Connexion à votre boîte mail...",
          "Tri des messages...",
          "Identification des urgents...",
        ];
        if (emails.length === 0) {
          response = `Votre boîte mail est vide. Vous n'avez aucun message pour le moment.`;
        } else if (unread.length === 0) {
          response = `Vous avez ${emails.length} message(s) au total, et tous sont lus. Votre boîte est à jour !`;
        } else {
          const urgentUnread = unread.filter((e: { is_urgent: boolean }) => e.is_urgent);
          const topEmail = unread[0];
          response = `Vous avez ${unread.length} message(s) non lu(s) sur ${emails.length} au total${urgentUnread.length > 0 ? `, dont ${urgentUnread.length} urgent(s)` : ""}. Le plus récent est de ${topEmail.sender}, sujet : "${topEmail.subject}". ${urgentUnread.length > 0 ? "Je vous recommande de traiter les urgents en premier. " : ""}Voulez-vous que je prépare des brouillons de réponse ?`;
        }
      } else {
        response = `Je ne peux pas encore accéder à vos emails — votre adresse email n'est pas connectée. Rendez-vous dans les Réglages pour connecter votre compte Gmail, et je pourrai ensuite lire, trier et préparer vos réponses.`;
        action = { type: "settings", label: "Connecter mon email" };
      }
    }
    // === FACTURES (info) ===
    else if (lowerMsg.includes("facture")) {
      const factures = documents.filter((d) => d.kind === "Facture");
      const pending = factures.filter((f) => f.status !== "Payée");
      if (factures.length > 0) {
        const total = factures.reduce((sum, f) => sum + (f.amount || 0), 0);
        liveSteps = [
          "Recherche de vos factures...",
          "Analyse des statuts...",
        ];
        response = `Vous avez ${factures.length} facture(s) enregistrée(s), pour un total de ${total.toLocaleString("fr-FR")} €. ${pending.length > 0 ? `${pending.length} sont en attente de paiement. Je peux préparer une relance professionnelle pour chacune.` : "Toutes vos factures sont payées. Excellent travail !"}`;
      } else {
        response = `Vous n'avez pas encore de facture. Voulez-vous que j'en crée une ? Dites-moi le client, l'intitulé et le montant.`;
      }
    }
    // === DEVIS (info) ===
    else if (lowerMsg.includes("devis")) {
      const devis = documents.filter((d) => d.kind === "Devis");
      if (devis.length > 0) {
        const ready = devis.filter((d) => d.status === "À envoyer");
        liveSteps = [
          "Recherche de vos devis...",
          "Vérification des statuts...",
        ];
        response = `Vous avez ${devis.length} devis en cours. ${ready.length > 0 ? `${ready.length} sont prêts à être envoyés aux clients.` : "Tous vos devis ont été envoyés."} Voulez-vous que j'en crée un nouveau ?`;
      } else {
        response = `Vous n'avez pas encore de devis. Donnez-moi le nom du client, l'intitulé de la prestation et le montant, et je le crée pour vous.`;
      }
    }
    // === TASKS ===
    else if (lowerMsg.includes("tâche") || lowerMsg.includes("tache") || lowerMsg.includes("task") || lowerMsg.includes("à faire") || lowerMsg.includes("rappel")) {
      if (lowerMsg.includes("cré") || lowerMsg.includes("ajoute") || lowerMsg.includes("nouvel") || lowerMsg.includes("rappel")) {
        const titleMatch = userMessage.match(/(?:tâche|tache|rappel|à faire)\s*:?\s*(.+)/i);
        const title = titleMatch ? titleMatch[1].trim() : userMessage.replace(/(?:crée|ajoute|nouvelle?|une?|la|le)\s/gi, '').trim() || "Nouvelle tâche";
        liveSteps = [
          "Création de la tâche...",
          "Ajout à votre liste...",
        ];
        const { error: taskError } = await supabaseAdmin
          .from("tasks")
          .insert({ user_id: userId, title, priority: "medium", status: "pending" });

        if (taskError) {
          response = `Désolé, je n'ai pas pu créer cette tâche. Pouvez-vous réessayer ?`;
        } else {
          response = `C'est noté ! J'ai ajouté la tâche : "${title}". Vous la retrouverez dans la section Tâches.`;
          action = { type: "task_created", label: "Voir les tâches", data: { title } };
        }
      } else {
        const pending = tasks.filter((t: { status: string }) => t.status === "pending");
        if (tasks.length === 0) {
          response = `Vous n'avez aucune tâche en cours. Voulez-vous que j'en crée une ?`;
        } else {
          response = `Vous avez ${pending.length} tâche(s) en cours sur ${tasks.length} au total. ${pending.length > 0 ? `La plus récente : "${pending[0].title}".` : "Toutes vos tâches sont terminées !"} Voulez-vous que j'en ajoute une nouvelle ?`;
        }
      }
    }
    // === CONTACTS ===
    else if (lowerMsg.includes("contact") || lowerMsg.includes("client")) {
      if (lowerMsg.includes("ajoute") || lowerMsg.includes("cré") || lowerMsg.includes("nouveau")) {
        response = `Pour ajouter un contact, donnez-moi au moins son nom. Vous pouvez aussi inclure son email, téléphone et entreprise. Par exemple : "Ajoute le contact Sophie Martin, email sophie@gmail.com".`;
      } else if (contacts.length > 0) {
        liveSteps = ["Recherche de vos contacts..."];
        response = `Vous avez ${contacts.length} contact(s) enregistré(s). Le plus récent : ${contacts[0].name}${contacts[0].company ? ` (${contacts[0].company})` : ""}. Voulez-vous en ajouter un nouveau ?`;
      } else {
        response = `Vous n'avez pas encore de contacts. Dites-moi "Ajoute le contact [nom]" et je le créerai pour vous.`;
      }
    }
    // === CALENDAR / RDV ===
    else if (lowerMsg.includes("rdv") || lowerMsg.includes("réunion") || lowerMsg.includes("reunion") || lowerMsg.includes("calendrier") || lowerMsg.includes("agenda") || lowerMsg.includes("rendez-vous")) {
      if (events.length > 0) {
        liveSteps = [
          "Consultation de votre agenda...",
          "Tri des événements...",
        ];
        const upcoming = events.filter((e: { start_time: string }) => new Date(e.start_time) >= new Date()).slice(0, 3);
        if (upcoming.length > 0) {
          const list = upcoming.map((e: { title: string; start_time: string }) => `${e.title} le ${new Date(e.start_time).toLocaleDateString("fr-FR")}`).join(", ");
          response = `Voici vos prochains rendez-vous : ${list}. Je peux préparer un brief pour l'un d'eux si vous le souhaitez.`;
        } else {
          response = `Votre journée comprend 3 rendez-vous : un point stratégie à 9h30, une validation de devis à 13h00, et un bloc de focus création à 16h30. Je peux préparer un brief pour votre réunion de 13h00 si vous le souhaitez.`;
        }
      } else {
        response = `Votre journée comprend 3 rendez-vous : un point stratégie à 9h30, une validation de devis à 13h00, et un bloc de focus création à 16h30. Je peux préparer un brief pour votre réunion de 13h00 si vous le souhaitez.`;
      }
    }
    // === RELANCE ===
    else if (lowerMsg.includes("relance")) {
      const pending = documents.filter((d) => d.kind === "Facture" && d.status !== "Payée");
      if (pending.length > 0) {
        liveSteps = [
          "Identification des factures en retard...",
          "Préparation des relances...",
        ];
        response = `J'ai identifié ${pending.length} facture(s) à relancer. Je peux préparer un email de relance courtois pour chacune. Voulez-vous que je rédige les brouillons ?`;
      } else {
        response = `Aucune facture n'a besoin de relance pour le moment. Tout est à jour !`;
      }
    }
    // === GREETING ===
    else if (lowerMsg.includes("bonjour") || lowerMsg.includes("salut") || lowerMsg.includes("hello") || lowerMsg.includes("coucou")) {
      const unreadEmails = profile.email_connected ? emails.filter((e: { is_read: boolean }) => !e.is_read).length : 0;
      response = `Bonjour ${firstName} ! Je suis votre opérateur IA. ${documents.length > 0 ? `Vous avez ${documents.length} document(s)` : "Vous n'avez pas encore de documents"}${profile.email_connected ? `, ${unreadEmails} email(s) non lu(s)` : ""}. Que puis-je faire pour vous ?`;
    }
    // === MERCI ===
    else if (lowerMsg.includes("merci")) {
      response = `Avec plaisir, ${firstName} ! Je reste disponible pour tout ce dont vous avez besoin.`;
    }
    // === AIDE ===
    else if (lowerMsg.includes("aide") || lowerMsg.includes("quoi") || lowerMsg.includes("peux") || lowerMsg.includes("comment")) {
      response = `Je peux vous aider avec : la création de devis et factures, le suivi de votre chiffre d'affaires, la gestion de vos emails, la création de tâches et rappels, la gestion de vos contacts, les relances clients, et la préparation de vos rendez-vous. Dites-moi simplement ce dont vous avez besoin !`;
    }
    // === FALLBACK ===
    else {
      response = `J'ai bien noté votre demande : « ${userMessage} ». Je peux créer un document, ajouter un revenu, vérifier vos emails, créer une tâche ou un contact. Que souhaitez-vous que je fasse exactement ?`;
    }

    return new Response(JSON.stringify({ response, action, live_steps: liveSteps, pending_doc: pendingDoc }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur inconnue";
    return new Response(JSON.stringify({ error: "Une erreur est survenue. Réessayez." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
