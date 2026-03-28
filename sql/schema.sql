CREATE TABLE IF NOT EXISTS branches (
  branch_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  branch_name VARCHAR(100) NOT NULL UNIQUE,
  city VARCHAR(100) NOT NULL,
  address_line TEXT NOT NULL,
  phone VARCHAR(20) NOT NULL,
  email VARCHAR(120) UNIQUE,
  open_time TIME NOT NULL DEFAULT TIME '06:00',
  close_time TIME NOT NULL DEFAULT TIME '23:00'
);

CREATE TABLE IF NOT EXISTS users (
  user_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  username VARCHAR(30) NOT NULL UNIQUE,
  email VARCHAR(120) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'member')),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS membership_plans (
  plan_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  plan_name VARCHAR(50) NOT NULL UNIQUE,
  monthly_fee NUMERIC(10, 2) NOT NULL CHECK (monthly_fee >= 0),
  duration_months INT NOT NULL DEFAULT 1 CHECK (duration_months > 0),
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS members (
  member_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id INT NOT NULL UNIQUE REFERENCES users(user_id) ON DELETE CASCADE,
  branch_id INT REFERENCES branches(branch_id) ON DELETE SET NULL,
  full_name VARCHAR(120) NOT NULL,
  phone VARCHAR(20),
  join_date DATE NOT NULL DEFAULT CURRENT_DATE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS memberships (
  membership_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  member_id INT NOT NULL REFERENCES members(member_id) ON DELETE CASCADE,
  plan_id INT NOT NULL REFERENCES membership_plans(plan_id) ON DELETE RESTRICT,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status VARCHAR(20) NOT NULL CHECK (status IN ('active', 'expired', 'cancelled', 'pending')),
  auto_renew BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS payments (
  payment_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  membership_id INT NOT NULL REFERENCES memberships(membership_id) ON DELETE CASCADE,
  amount NUMERIC(10, 2) NOT NULL CHECK (amount >= 0),
  payment_method VARCHAR(30) NOT NULL,
  payment_status VARCHAR(20) NOT NULL CHECK (payment_status IN ('paid', 'pending', 'failed')),
  paid_on TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS trainers (
  trainer_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  branch_id INT REFERENCES branches(branch_id) ON DELETE SET NULL,
  full_name VARCHAR(120) NOT NULL,
  specialty VARCHAR(120) NOT NULL,
  phone VARCHAR(20),
  years_experience INT NOT NULL DEFAULT 0 CHECK (years_experience >= 0),
  bio TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS contact_messages (
  message_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  member_id INT REFERENCES members(member_id) ON DELETE SET NULL,
  sender_name VARCHAR(120) NOT NULL,
  contact_info VARCHAR(150),
  message TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'in_progress', 'closed')),
  submitted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_members_branch_id ON members(branch_id);
CREATE INDEX IF NOT EXISTS idx_memberships_member_id ON memberships(member_id);
CREATE INDEX IF NOT EXISTS idx_memberships_plan_id ON memberships(plan_id);
CREATE INDEX IF NOT EXISTS idx_payments_membership_id ON payments(membership_id);
CREATE INDEX IF NOT EXISTS idx_contact_messages_member_id ON contact_messages(member_id);
CREATE INDEX IF NOT EXISTS idx_trainers_branch_id ON trainers(branch_id);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_active_membership_per_member
ON memberships (member_id)
WHERE status = 'active';
