-- 1. Display all members with their current plan and branch.
SELECT
  m.member_id,
  m.full_name,
  u.username,
  u.email,
  b.branch_name,
  current_membership.plan_name,
  current_membership.status,
  m.join_date
FROM members m
JOIN users u ON u.user_id = m.user_id
LEFT JOIN branches b ON b.branch_id = m.branch_id
LEFT JOIN LATERAL (
  SELECT mp.plan_name, ms.status
  FROM memberships ms
  JOIN membership_plans mp ON mp.plan_id = ms.plan_id
  WHERE ms.member_id = m.member_id
  ORDER BY (ms.status = 'active') DESC, ms.end_date DESC NULLS LAST, ms.membership_id DESC
  LIMIT 1
) AS current_membership ON true
ORDER BY m.join_date DESC, m.member_id DESC;

-- 2. GROUP BY + ORDER BY report for screenshots and viva.
SELECT
  mp.plan_name,
  COUNT(DISTINCT ms.membership_id) FILTER (WHERE ms.status = 'active') AS active_members,
  COALESCE(SUM(p.amount) FILTER (WHERE p.payment_status = 'paid'), 0) AS collected_amount
FROM membership_plans mp
LEFT JOIN memberships ms ON ms.plan_id = mp.plan_id
LEFT JOIN payments p ON p.membership_id = ms.membership_id
GROUP BY mp.plan_id, mp.plan_name, mp.monthly_fee
ORDER BY active_members DESC, mp.monthly_fee ASC;

-- 3. Update a member plan or membership status.
UPDATE memberships
SET plan_id = 3, status = 'active', end_date = CURRENT_DATE + INTERVAL '30 days'
WHERE member_id = 2 AND membership_id = (
  SELECT membership_id
  FROM memberships
  WHERE member_id = 2
  ORDER BY membership_id DESC
  LIMIT 1
);

-- 4. Delete a specific message.
DELETE FROM contact_messages
WHERE message_id = 2;
