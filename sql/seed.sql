TRUNCATE TABLE
  contact_messages,
  payments,
  memberships,
  trainers,
  members,
  membership_plans,
  users,
  branches
RESTART IDENTITY CASCADE;

INSERT INTO branches (branch_name, city, address_line, phone, email, open_time, close_time) VALUES
  ('IronForge Kakkanad', 'Kochi', '12 Fitness Avenue, Kakkanad, Kochi - 682030', '+91 98470 12345', 'hello@ironforge.in', '06:00', '23:00'),
  ('IronForge Kaloor', 'Kochi', '21 Stadium Road, Kaloor, Kochi - 682017', '+91 94470 67890', 'kaloor@ironforge.in', '06:00', '22:00');

INSERT INTO membership_plans (plan_name, monthly_fee, duration_months, description, is_active) VALUES
  ('Basic', 999.00, 1, 'Gym floor access, lockers, and 2 group classes every month.', TRUE),
  ('Pro', 1799.00, 1, 'Unlimited classes, pool access, and 4 PT sessions every month.', TRUE),
  ('Elite', 2999.00, 1, 'Everything in Pro plus unlimited PT sessions and nutrition support.', TRUE);

INSERT INTO users (username, email, password_hash, role) VALUES
  ('admin', 'admin@ironforge.in', '$2b$10$akEkHu9CBfOhalkZo7leN.xo0IvIbb797xFNA.XDh1q7Mhy5VU1yK', 'admin'),
  ('arjun', 'arjun@ironforge.in', '$2b$10$TWlQt3/iIgeAGqNfJ.9dZ./YkXCTJjRZUWWaCTqETdNByv5vo8hz.', 'member'),
  ('meera', 'meera@ironforge.in', '$2b$10$apilSfeG.f67g9hmX4sBhOW3zpwVA7orC.oVSvPmLFyMB7RbY1Fia', 'member'),
  ('farhan', 'farhan@ironforge.in', '$2b$10$/81RldAFrC8c9j2ml6V3IuxQ76p0unyxUtol8lGFCl9srm3lW5HYq', 'member');

INSERT INTO members (user_id, branch_id, full_name, phone, join_date, is_active) VALUES
  (2, 1, 'Arjun Nair', '+91 98470 11111', CURRENT_DATE - INTERVAL '54 days', TRUE),
  (3, 1, 'Meera Thomas', '+91 98470 22222', CURRENT_DATE - INTERVAL '31 days', TRUE),
  (4, 2, 'Farhan Ali', '+91 98470 33333', CURRENT_DATE - INTERVAL '12 days', TRUE);

INSERT INTO memberships (member_id, plan_id, start_date, end_date, status, auto_renew) VALUES
  (1, 2, CURRENT_DATE - INTERVAL '24 days', CURRENT_DATE + INTERVAL '6 days', 'active', TRUE),
  (2, 1, CURRENT_DATE - INTERVAL '14 days', CURRENT_DATE + INTERVAL '16 days', 'active', FALSE),
  (3, 3, CURRENT_DATE - INTERVAL '2 days', CURRENT_DATE + INTERVAL '28 days', 'active', TRUE);

INSERT INTO payments (membership_id, amount, payment_method, payment_status, paid_on) VALUES
  (1, 1799.00, 'UPI', 'paid', CURRENT_TIMESTAMP - INTERVAL '24 days'),
  (2, 999.00, 'Card', 'paid', CURRENT_TIMESTAMP - INTERVAL '14 days'),
  (3, 2999.00, 'Cash', 'paid', CURRENT_TIMESTAMP - INTERVAL '2 days');

INSERT INTO trainers (branch_id, full_name, specialty, phone, years_experience, bio, is_active) VALUES
  (1, 'Koresh A Paulose', 'Strength and Powerlifting', '+91 98470 41001', 10, 'Specialises in progressive overload and competition prep.', TRUE),
  (1, 'Gautham RA', 'Yoga and Functional Fitness', '+91 98470 41002', 5, 'Focuses on mobility, flexibility, and recovery programmes.', TRUE),
  (2, 'Jabin James Jophy', 'Boxing and MMA Conditioning', '+91 98470 41003', 7, 'Builds explosive power, cardio, and combat conditioning.', TRUE),
  (2, 'Madhav V Menon', 'Swimming and Aqua Fitness', '+91 98470 41004', 6, 'Coaches beginners through advanced swimmers.', TRUE);

INSERT INTO contact_messages (member_id, sender_name, contact_info, message, status, submitted_at) VALUES
  (1, 'Arjun Nair', 'arjun@ironforge.in', 'Can I shift my workout slot to the 6 AM batch next week?', 'new', CURRENT_TIMESTAMP - INTERVAL '1 day'),
  (2, 'Meera Thomas', '+91 98470 22222', 'Please confirm whether the steam room will be open this Sunday.', 'new', CURRENT_TIMESTAMP - INTERVAL '5 hours');
