/*
# Add emails and tasks tables for full AI operator functionality

1. New Tables
- `emails` stores simulated inbox messages for users who connected their Gmail.
  - `id` (uuid, primary key)
  - `user_id` (uuid, NOT NULL, DEFAULT auth.uid(), references auth.users ON DELETE CASCADE)
  - `sender` (text, email sender name)
  - `sender_email` (text, sender email address)
  - `subject` (text, email subject)
  - `body` (text, email body)
  - `is_read` (boolean, default false)
  - `is_urgent` (boolean, default false)
  - `category` (text: 'client', 'invoice', 'personal', 'other')
  - `received_at` (timestamptz)

- `tasks` stores tasks created by the AI operator or user.
  - `id` (uuid, primary key)
  - `user_id` (uuid, NOT NULL, DEFAULT auth.uid(), references auth.users ON DELETE CASCADE)
  - `title` (text, task title)
  - `description` (text, optional details)
  - `priority` (text: 'low', 'medium', 'high')
  - `status` (text: 'pending', 'in_progress', 'done')
  - `due_date` (date, optional)
  - `created_at` (timestamptz)

2. Security
- RLS enabled on both tables, owner-scoped CRUD policies for authenticated users.

3. Important Notes
- Emails are simulated — when a user connects Gmail, sample emails are generated.
- Tasks can be created by the AI operator via the edge function.
*/

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

ALTER TABLE emails ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own emails" ON emails;
CREATE POLICY "Users can read own emails" ON emails FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own emails" ON emails;
CREATE POLICY "Users can insert own emails" ON emails FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own emails" ON emails;
CREATE POLICY "Users can update own emails" ON emails FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own emails" ON emails;
CREATE POLICY "Users can delete own emails" ON emails FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS emails_user_received_idx ON emails (user_id, received_at DESC);

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

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own tasks" ON tasks;
CREATE POLICY "Users can read own tasks" ON tasks FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own tasks" ON tasks;
CREATE POLICY "Users can insert own tasks" ON tasks FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own tasks" ON tasks;
CREATE POLICY "Users can update own tasks" ON tasks FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own tasks" ON tasks;
CREATE POLICY "Users can delete own tasks" ON tasks FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS tasks_user_created_idx ON tasks (user_id, created_at DESC);

-- Function to generate sample emails when a user connects Gmail
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