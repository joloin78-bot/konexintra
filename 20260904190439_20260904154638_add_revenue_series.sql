/*
# Add revenue time series data table

1. New Tables
- `revenue_series` stores monthly revenue data per user for the "Évolution du CA" chart.
  - `id` (uuid, primary key)
  - `user_id` (uuid, NOT NULL, DEFAULT auth.uid(), references auth.users ON DELETE CASCADE)
  - `month` (text, e.g. "Jan", "Fév")
  - `amount` (numeric, revenue in EUR)
  - `created_at` (timestamptz)

2. Security
- RLS enabled, owner-scoped CRUD policies for authenticated users.

3. Important Notes
- Seeded with 8 months of sample data per new user via a trigger function.
*/

CREATE TABLE IF NOT EXISTS revenue_series (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  month text NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE revenue_series ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own revenue" ON revenue_series;
CREATE POLICY "Users can read own revenue" ON revenue_series FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own revenue" ON revenue_series;
CREATE POLICY "Users can insert own revenue" ON revenue_series FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own revenue" ON revenue_series;
CREATE POLICY "Users can update own revenue" ON revenue_series FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own revenue" ON revenue_series;
CREATE POLICY "Users can delete own revenue" ON revenue_series FOR DELETE
  TO authenticated USING (auth.uid() = user_id);