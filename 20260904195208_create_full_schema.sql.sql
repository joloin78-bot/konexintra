/*
# Create complete database schema for Konekt AI Operator

1. New Tables
- `profiles` — per-user display info and company details for invoices/quotes
  - id (uuid PK, references auth.users ON DELETE CASCADE)
  - full_name (text)
  - company (text)
  - email_connected (boolean, default false)
  - siret (text, company registration number)
  - address (text, company address)
  - phone (text, contact phone)
  - vat_number (text, VAT/tax number)
  - created_at (timestamptz)

- `operator_items` — JSON-based storage for documents (devis/factures)
  - id (uuid PK)
  - user_id (uuid NOT NULL DEFAULT auth.uid(), FK auth.users ON DELETE CASCADE)
  - kind (text: 'conversation', 'document', 'activity')
  - title (text)
  - payload (jsonb)
  - created_at, updated_at (timestamptz)

- `revenue_series` — monthly revenue data
  - id (uuid PK)
  - user_id (uuid NOT NULL DEFAULT auth.uid(), FK auth.users ON DELETE CASCADE)
  - month (text)
  - amount (numeric)
  - created_at (timestamptz)

- `emails` — simulated inbox
  - id (uuid PK)
  - user_id (uuid NOT NULL DEFAULT auth.uid(), FK auth.users ON DELETE CASCADE)
  - sender, sender_email, subject, body (text)
  - is_read, is_urgent (boolean)
  - category (text: client/invoice/personal/other)
  - received_at (timestamptz)

- `tasks` — task list items
  - id (uuid PK)
  - user_id (uuid NOT NULL DEFAULT auth.uid(), FK auth.users ON DELETE CASCADE)
  - title, description (text)
  - priority (text: low/medium/high)
  - status (text: pending/in_progress/done)
  - due_date (date, optional)
  - created_at (timestamptz)

- `contacts` — client/partner contacts
  - id (uuid PK)
  - user_id (uuid NOT NULL DEFAULT auth.uid(), FK auth.users ON DELETE CASCADE)
  - name, email, phone, company, notes (text)
  - created_at (timestamptz)

- `calendar_events` — calendar appointments
  - id (uuid PK)
  - user_id (uuid NOT NULL DEFAULT auth.uid(), FK auth.users ON DELETE CASCADE)
  - title, description, location (text)
  - start_time, end_time (timestamptz)
  - color (text: violet/blue/green/orange/red)
  - created_at (timestamptz)

- `notifications` — user notification feed
  - id (uuid PK)
  - user_id (uuid NOT NULL DEFAULT auth.uid(), FK auth.users ON DELETE CASCADE)
  - type (text: email/document/task/revenue/system)
  - title, message (text)
  - is_read (boolean)
  - created_at (timestamptz)

2. Security
- RLS enabled on ALL tables.
- Owner-scoped CRUD policies (4 per table) for authenticated users.
- Trigger auto-creates a profile row on signup.

3. Important Notes
- All user_id columns DEFAULT auth.uid() so frontend inserts work without passing user_id.
- The profiles trigger uses SECURITY DEFINER.
- generate_sample_emails function populates inbox when Gmail is connected.
*/

-- profiles
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL DEFAULT '',
  company text NOT NULL DEFAULT '',
  email_connected boolean NOT NULL DEFAULT false,
  siret text NOT NULL DEFAULT '',
  address text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  vat_number text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own profile" ON profiles;
CREATE POLICY "Users can read own profile" ON profiles FOR SELECT TO authenticated USING (auth.uid() = id);
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
CREATE POLICY "Users can insert own profile" ON profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

-- operator_items
CREATE TABLE IF NOT EXISTS operator_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('conversation', 'document', 'activity')),
  title text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS operator_items_user_idx ON operator_items (user_id, kind, updated_at DESC);
ALTER TABLE operator_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own operator items" ON operator_items;
CREATE POLICY "Users can read own operator items" ON operator_items FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert own operator items" ON operator_items;
CREATE POLICY "Users can insert own operator items" ON operator_items FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update own operator items" ON operator_items;
CREATE POLICY "Users can update own operator items" ON operator_items FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete own operator items" ON operator_items;
CREATE POLICY "Users can delete own operator items" ON operator_items FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- revenue_series
CREATE TABLE IF NOT EXISTS revenue_series (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  month text NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE revenue_series ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own revenue" ON revenue_series;
CREATE POLICY "Users can read own revenue" ON revenue_series FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert own revenue" ON revenue_series;
CREATE POLICY "Users can insert own revenue" ON revenue_series FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update own revenue" ON revenue_series;
CREATE POLICY "Users can update own revenue" ON revenue_series FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete own revenue" ON revenue_series;
CREATE POLICY "Users can delete own revenue" ON revenue_series FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- emails
CREATE TABLE IF NOT EXISTS emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  sender text NOT NULL,
  sender_email text NOT NULL,
  subject text NOT NULL,
  body text NOT NULL DEFAULT '',
  is_read boolean NOT NULL DEFAULT false,
  is_urgent boolean NOT NULL DEFAULT false,
  category text NOT NULL DEFAULT 'other' CHECK (category IN ('client', 'invoice', 'personal', 'other')),
  received_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS emails_user_received_idx ON emails (user_id, received_at DESC);
ALTER TABLE emails ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own emails" ON emails;
CREATE POLICY "Users can read own emails" ON emails FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert own emails" ON emails;
CREATE POLICY "Users can insert own emails" ON emails FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update own emails" ON emails;
CREATE POLICY "Users can update own emails" ON emails FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete own emails" ON emails;
CREATE POLICY "Users can delete own emails" ON emails FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- tasks
CREATE TABLE IF NOT EXISTS tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'done')),
  due_date date,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tasks_user_created_idx ON tasks (user_id, created_at DESC);
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own tasks" ON tasks;
CREATE POLICY "Users can read own tasks" ON tasks FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert own tasks" ON tasks;
CREATE POLICY "Users can insert own tasks" ON tasks FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update own tasks" ON tasks;
CREATE POLICY "Users can update own tasks" ON tasks FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete own tasks" ON tasks;
CREATE POLICY "Users can delete own tasks" ON tasks FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- contacts
CREATE TABLE IF NOT EXISTS contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  company text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS contacts_user_idx ON contacts (user_id, created_at DESC);
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own contacts" ON contacts;
CREATE POLICY "Users can read own contacts" ON contacts FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert own contacts" ON contacts;
CREATE POLICY "Users can insert own contacts" ON contacts FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update own contacts" ON contacts;
CREATE POLICY "Users can update own contacts" ON contacts FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete own contacts" ON contacts;
CREATE POLICY "Users can delete own contacts" ON contacts FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- calendar_events
CREATE TABLE IF NOT EXISTS calendar_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  location text NOT NULL DEFAULT '',
  start_time timestamptz NOT NULL,
  end_time timestamptz NOT NULL,
  color text NOT NULL DEFAULT 'violet' CHECK (color IN ('violet', 'blue', 'green', 'orange', 'red')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS events_user_start_idx ON calendar_events (user_id, start_time ASC);
ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own events" ON calendar_events;
CREATE POLICY "Users can read own events" ON calendar_events FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert own events" ON calendar_events;
CREATE POLICY "Users can insert own events" ON calendar_events FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update own events" ON calendar_events;
CREATE POLICY "Users can update own events" ON calendar_events FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete own events" ON calendar_events;
CREATE POLICY "Users can delete own events" ON calendar_events FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- notifications
CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL DEFAULT 'system' CHECK (type IN ('email', 'document', 'task', 'revenue', 'system')),
  title text NOT NULL,
  message text NOT NULL DEFAULT '',
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notifications_user_created_idx ON notifications (user_id, created_at DESC);
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own notifications" ON notifications;
CREATE POLICY "Users can read own notifications" ON notifications FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert own notifications" ON notifications;
CREATE POLICY "Users can insert own notifications" ON notifications FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update own notifications" ON notifications;
CREATE POLICY "Users can update own notifications" ON notifications FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete own notifications" ON notifications;
CREATE POLICY "Users can delete own notifications" ON notifications FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Trigger: auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, company, siret, address, phone, vat_number)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'company', ''),
    COALESCE(NEW.raw_user_meta_data->>'siret', ''),
    COALESCE(NEW.raw_user_meta_data->>'address', ''),
    COALESCE(NEW.raw_user_meta_data->>'phone', ''),
    COALESCE(NEW.raw_user_meta_data->>'vat_number', '')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_profile();

-- Function: generate sample emails when Gmail is connected
CREATE OR REPLACE FUNCTION public.generate_sample_emails(user_uuid uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.emails (user_id, sender, sender_email, subject, body, is_read, is_urgent, category, received_at)
  VALUES
    (user_uuid, 'Camille Laurent', 'camille.laurent@gmail.com', 'Validation du devis', 'Bonjour, j''ai bien reçu votre devis et je souhaiterais en discuter lors de notre rendez-vous de 13h. Tout me semble correct, mais j''aimerais quelques précisions sur le poste "Accompagnement mensuel". Cordialement, Camille', false, true, 'client', now() - interval '2 hours'),
    (user_uuid, 'Maison Rivière', 'contact@maisonriviere.fr', 'Demande de facture détaillée', 'Bonjour, Pourriez-vous me renvoyer la facture avec le détail des prestations ? Je n''ai pas reçu le document complet. Merci, Maison Rivière', false, true, 'invoice', now() - interval '5 hours'),
    (user_uuid, 'Thomas Petit', 'thomas.petit@outlook.com', 'Merci pour votre travail', 'Bonjour Nathan, Je voulais vous remercier pour l''excellent travail sur le dernier projet. C''était parfait ! À bientôt pour la suite, Thomas', true, false, 'client', now() - interval '1 day'),
    (user_uuid, 'Service Bancaire', 'noreply@banque.fr', 'Relevé de compte disponible', 'Votre relevé de compte du mois dernier est disponible sur votre espace client. Cordialement, Votre banque', true, false, 'other', now() - interval '2 days'),
    (user_uuid, 'Sophie Martin', 'sophie.martin@gmail.com', 'Proposition de collaboration', 'Bonjour, Je vous contacte suite à la recommandation de Camille. J''aurais besoin d''un accompagnement similaire pour mon studio. Pouvons-nous en discuter ? Sophie', false, false, 'client', now() - interval '3 days'),
    (user_uuid, 'Newsletter', 'hello@newsletter.com', 'Les tendances du design 2025', 'Découvrez les dernières tendances du design pour 2025. Cette semaine : le retour du minimalisme et l''importance des micro-interactions.', true, false, 'other', now() - interval '4 days');
END;
$$;
