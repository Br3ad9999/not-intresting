const path = require('path');
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
require('dotenv').config();

const { query, withTransaction } = require('./db');

const app = express();
const PORT = Number(process.env.PORT || 3000);

app.use(express.static(__dirname));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'ironforge-dev-session-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 1000 * 60 * 60 * 24,
    },
  })
);

function asyncHandler(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

function requireAuth(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Please log in to continue.' });
  }
  return next();
}

function requireAdmin(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Please log in to continue.' });
  }

  if (req.session.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin privileges are required for this action.' });
  }

  return next();
}

function normalizeName(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ');
}

function buildBaseUsername(fullName, email) {
  const emailPart = String(email || '').split('@')[0];
  const source = emailPart || fullName || 'member';

  return source
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '')
    .slice(0, 24) || 'member';
}

async function generateUniqueUsername(client, fullName, email) {
  const base = buildBaseUsername(fullName, email);
  let candidate = base;
  let counter = 2;

  // Keep generating until the username is unique.
  while (true) {
    const existing = await client.query('SELECT 1 FROM users WHERE username = $1', [candidate]);
    if (!existing.rowCount) {
      return candidate;
    }

    const suffix = String(counter);
    candidate = `${base.slice(0, Math.max(1, 24 - suffix.length))}${suffix}`;
    counter += 1;
  }
}

async function fetchCurrentUserProfile(userId, runner = { query }) {
  const { rows } = await runner.query(
    `
      SELECT
        u.user_id,
        u.username,
        u.email,
        u.role,
        COALESCE(m.full_name, u.username) AS display_name,
        m.member_id,
        m.phone,
        m.join_date,
        m.is_active AS member_active,
        b.branch_name,
        b.city,
        active_membership.membership_id,
        active_membership.status AS membership_status,
        active_membership.start_date AS membership_start_date,
        active_membership.end_date AS membership_end_date,
        active_plan.plan_id,
        active_plan.plan_name,
        active_plan.monthly_fee
      FROM users u
      LEFT JOIN members m ON m.user_id = u.user_id
      LEFT JOIN branches b ON b.branch_id = m.branch_id
      LEFT JOIN LATERAL (
        SELECT membership_id, plan_id, status, start_date, end_date
        FROM memberships
        WHERE member_id = m.member_id
        ORDER BY (status = 'active') DESC, end_date DESC NULLS LAST, membership_id DESC
        LIMIT 1
      ) AS active_membership ON true
      LEFT JOIN membership_plans active_plan ON active_plan.plan_id = active_membership.plan_id
      WHERE u.user_id = $1
    `,
    [userId]
  );

  return rows[0] || null;
}

function serializeUser(profile) {
  return {
    userId: profile.user_id,
    memberId: profile.member_id || null,
    username: profile.username,
    email: profile.email,
    role: profile.role,
    name: profile.display_name,
    phone: profile.phone || '',
    joinDate: profile.join_date || null,
    branchName: profile.branch_name || '',
    city: profile.city || '',
    memberActive: profile.member_active,
    membership: profile.plan_id
      ? {
          membershipId: profile.membership_id,
          planId: profile.plan_id,
          planName: profile.plan_name,
          monthlyFee: Number(profile.monthly_fee || 0),
          status: profile.membership_status,
          startDate: profile.membership_start_date,
          endDate: profile.membership_end_date,
        }
      : null,
  };
}

app.get('/api/health', asyncHandler(async (req, res) => {
  const result = await query('SELECT NOW() AS server_time');
  res.json({
    ok: true,
    serverTime: result.rows[0].server_time,
  });
}));

app.get('/api/plans', asyncHandler(async (req, res) => {
  const { rows } = await query(
    `
      SELECT plan_id, plan_name, monthly_fee, duration_months, description
      FROM membership_plans
      WHERE is_active = TRUE
      ORDER BY monthly_fee ASC, plan_name ASC
    `
  );

  res.json({ plans: rows });
}));

app.post('/api/auth/signup', asyncHandler(async (req, res) => {
  const fullName = normalizeName(req.body.fullName);
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const requestedPlanId = Number(req.body.planId);

  if (!fullName || !email || !password || !requestedPlanId) {
    return res.status(400).json({ error: 'Full name, email, password, and plan are required.' });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  }

  const newUser = await withTransaction(async (client) => {
    const emailCheck = await client.query('SELECT 1 FROM users WHERE email = $1', [email]);
    if (emailCheck.rowCount) {
      return { error: 'An account with this email already exists.', status: 409 };
    }

    const planCheck = await client.query(
      'SELECT plan_id FROM membership_plans WHERE plan_id = $1 AND is_active = TRUE',
      [requestedPlanId]
    );
    if (!planCheck.rowCount) {
      return { error: 'Please choose a valid membership plan.', status: 400 };
    }

    const username = await generateUniqueUsername(client, fullName, email);
    const passwordHash = await bcrypt.hash(password, 10);
    const branchResult = await client.query(
      'SELECT branch_id FROM branches ORDER BY branch_id ASC LIMIT 1'
    );
    const defaultBranchId = branchResult.rows[0]?.branch_id || null;

    const userInsert = await client.query(
      `
        INSERT INTO users (username, email, password_hash, role)
        VALUES ($1, $2, $3, 'member')
        RETURNING user_id
      `,
      [username, email, passwordHash]
    );

    const memberInsert = await client.query(
      `
        INSERT INTO members (user_id, branch_id, full_name, phone)
        VALUES ($1, $2, $3, '')
        RETURNING member_id
      `,
      [userInsert.rows[0].user_id, defaultBranchId, fullName]
    );

    await client.query(
      `
        INSERT INTO memberships (member_id, plan_id, start_date, end_date, status, auto_renew)
        VALUES ($1, $2, CURRENT_DATE, CURRENT_DATE + INTERVAL '30 days', 'active', TRUE)
      `,
      [memberInsert.rows[0].member_id, requestedPlanId]
    );

    const profile = await fetchCurrentUserProfile(userInsert.rows[0].user_id, client);
    return { profile };
  });

  if (newUser.error) {
    return res.status(newUser.status).json({ error: newUser.error });
  }

  req.session.user = {
    userId: newUser.profile.user_id,
    role: newUser.profile.role,
  };

  return res.status(201).json({
    message: 'Account created successfully.',
    user: serializeUser(newUser.profile),
  });
}));

app.post('/api/auth/login', asyncHandler(async (req, res) => {
  const identifier = String(req.body.identifier || '').trim().toLowerCase();
  const password = String(req.body.password || '');

  if (!identifier || !password) {
    return res.status(400).json({ error: 'Username/email and password are required.' });
  }

  const { rows } = await query(
    `
      SELECT user_id, username, email, password_hash, role
      FROM users
      WHERE LOWER(username) = $1 OR LOWER(email) = $1
      LIMIT 1
    `,
    [identifier]
  );

  if (!rows.length) {
    return res.status(401).json({ error: 'Incorrect username/email or password.' });
  }

  const user = rows[0];
  const passwordMatches = await bcrypt.compare(password, user.password_hash);

  if (!passwordMatches) {
    return res.status(401).json({ error: 'Incorrect username/email or password.' });
  }

  req.session.user = {
    userId: user.user_id,
    role: user.role,
  };

  const profile = await fetchCurrentUserProfile(user.user_id);

  return res.json({
    message: 'Login successful.',
    user: serializeUser(profile),
  });
}));

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    res.json({ message: 'Logged out successfully.' });
  });
});

app.get('/api/auth/me', requireAuth, asyncHandler(async (req, res) => {
  const profile = await fetchCurrentUserProfile(req.session.user.userId);

  if (!profile) {
    req.session.destroy(() => {});
    return res.status(401).json({ error: 'Your session is no longer valid.' });
  }

  return res.json({ user: serializeUser(profile) });
}));

app.post('/api/contact', requireAuth, asyncHandler(async (req, res) => {
  const senderName = normalizeName(req.body.senderName);
  const contactInfo = String(req.body.contactInfo || '').trim();
  const message = String(req.body.message || '').trim();

  if (!senderName || !message) {
    return res.status(400).json({ error: 'Name and message are required.' });
  }

  const profile = await fetchCurrentUserProfile(req.session.user.userId);

  await query(
    `
      INSERT INTO contact_messages (member_id, sender_name, contact_info, message, status)
      VALUES ($1, $2, $3, $4, 'new')
    `,
    [profile?.member_id || null, senderName, contactInfo, message]
  );

  res.status(201).json({ message: 'Message saved successfully.' });
}));

app.get('/api/admin/overview', requireAdmin, asyncHandler(async (req, res) => {
  const [summaryResult, membersResult, messagesResult, plansResult, reportResult] = await Promise.all([
    query(
      `
        SELECT
          (SELECT COUNT(*) FROM members WHERE is_active = TRUE) AS active_members,
          (SELECT COUNT(*) FROM trainers WHERE is_active = TRUE) AS active_trainers,
          (SELECT COUNT(*) FROM contact_messages WHERE status = 'new') AS new_messages,
          (SELECT COALESCE(SUM(amount), 0) FROM payments WHERE payment_status = 'paid') AS revenue_total
      `
    ),
    query(
      `
        SELECT
          m.member_id,
          m.full_name,
          u.username,
          u.email,
          b.branch_name,
          m.join_date,
          m.is_active,
          current_membership.membership_id,
          current_membership.status AS membership_status,
          current_membership.plan_id,
          mp.plan_name
        FROM members m
        JOIN users u ON u.user_id = m.user_id
        LEFT JOIN branches b ON b.branch_id = m.branch_id
        LEFT JOIN LATERAL (
          SELECT membership_id, plan_id, status
          FROM memberships
          WHERE member_id = m.member_id
          ORDER BY (status = 'active') DESC, end_date DESC NULLS LAST, membership_id DESC
          LIMIT 1
        ) AS current_membership ON true
        LEFT JOIN membership_plans mp ON mp.plan_id = current_membership.plan_id
        ORDER BY m.join_date DESC, m.member_id DESC
      `
    ),
    query(
      `
        SELECT
          message_id,
          sender_name,
          contact_info,
          message,
          status,
          submitted_at
        FROM contact_messages
        ORDER BY submitted_at DESC, message_id DESC
      `
    ),
    query(
      `
        SELECT plan_id, plan_name, monthly_fee
        FROM membership_plans
        WHERE is_active = TRUE
        ORDER BY monthly_fee ASC, plan_name ASC
      `
    ),
    query(
      `
        SELECT
          mp.plan_name,
          COUNT(DISTINCT ms.membership_id) FILTER (WHERE ms.status = 'active') AS active_members,
          COALESCE(SUM(p.amount) FILTER (WHERE p.payment_status = 'paid'), 0) AS collected_amount
        FROM membership_plans mp
        LEFT JOIN memberships ms ON ms.plan_id = mp.plan_id
        LEFT JOIN payments p ON p.membership_id = ms.membership_id
        GROUP BY mp.plan_id, mp.plan_name, mp.monthly_fee
        ORDER BY active_members DESC, mp.monthly_fee ASC
      `
    ),
  ]);

  res.json({
    summary: {
      activeMembers: Number(summaryResult.rows[0].active_members || 0),
      activeTrainers: Number(summaryResult.rows[0].active_trainers || 0),
      newMessages: Number(summaryResult.rows[0].new_messages || 0),
      revenueTotal: Number(summaryResult.rows[0].revenue_total || 0),
    },
    members: membersResult.rows,
    messages: messagesResult.rows,
    plans: plansResult.rows,
    planReport: reportResult.rows,
  });
}));

app.put('/api/admin/members/:memberId', requireAdmin, asyncHandler(async (req, res) => {
  const memberId = Number(req.params.memberId);
  const planId = Number(req.body.planId);
  const membershipStatus = String(req.body.membershipStatus || '').trim().toLowerCase();
  const isActive = Boolean(req.body.isActive);

  if (!memberId || !planId || !membershipStatus) {
    return res.status(400).json({ error: 'Member, plan, and membership status are required.' });
  }

  if (!['active', 'expired', 'cancelled', 'pending'].includes(membershipStatus)) {
    return res.status(400).json({ error: 'Invalid membership status supplied.' });
  }

  await withTransaction(async (client) => {
    const memberCheck = await client.query('SELECT member_id FROM members WHERE member_id = $1', [memberId]);
    if (!memberCheck.rowCount) {
      const error = new Error('Member not found.');
      error.status = 404;
      throw error;
    }

    const planCheck = await client.query(
      'SELECT plan_id FROM membership_plans WHERE plan_id = $1 AND is_active = TRUE',
      [planId]
    );
    if (!planCheck.rowCount) {
      const error = new Error('Selected plan does not exist.');
      error.status = 400;
      throw error;
    }

    await client.query('UPDATE members SET is_active = $1 WHERE member_id = $2', [isActive, memberId]);

    const latestMembership = await client.query(
      `
        SELECT membership_id
        FROM memberships
        WHERE member_id = $1
        ORDER BY (status = 'active') DESC, end_date DESC NULLS LAST, membership_id DESC
        LIMIT 1
      `,
      [memberId]
    );

    const safeStatus = isActive ? membershipStatus : 'cancelled';

    if (latestMembership.rowCount) {
      await client.query(
        `
          UPDATE memberships
          SET
            plan_id = $1,
            status = $2::VARCHAR(20),
            end_date = CASE
              WHEN $2::VARCHAR(20) = 'active' THEN (CURRENT_DATE + INTERVAL '30 days')::DATE
              ELSE CURRENT_DATE
            END
          WHERE membership_id = $3
        `,
        [planId, safeStatus, latestMembership.rows[0].membership_id]
      );
    } else {
      await client.query(
        `
          INSERT INTO memberships (member_id, plan_id, start_date, end_date, status, auto_renew)
          VALUES (
            $1,
            $2,
            CURRENT_DATE,
            CASE
              WHEN $3::VARCHAR(20) = 'active' THEN (CURRENT_DATE + INTERVAL '30 days')::DATE
              ELSE CURRENT_DATE
            END,
            $3::VARCHAR(20),
            FALSE
          )
        `,
        [memberId, planId, safeStatus]
      );
    }
  });

  res.json({ message: 'Member record updated successfully.' });
}));

app.delete('/api/admin/messages/:messageId', requireAdmin, asyncHandler(async (req, res) => {
  const messageId = Number(req.params.messageId);

  if (!messageId) {
    return res.status(400).json({ error: 'A valid message id is required.' });
  }

  const result = await query('DELETE FROM contact_messages WHERE message_id = $1', [messageId]);

  if (!result.rowCount) {
    return res.status(404).json({ error: 'Message not found.' });
  }

  res.json({ message: 'Message deleted successfully.' });
}));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/index.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/dashboard.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'dashboard.html'));
});

app.use((error, req, res, next) => {
  if (res.headersSent) {
    return next(error);
  }

  console.error(error);
  res.status(error.status || 500).json({
    error: error.message || 'Something went wrong while processing the request.',
  });
});

app.listen(PORT, () => {
  console.log(`Gym management server running on http://localhost:${PORT}`);
});
