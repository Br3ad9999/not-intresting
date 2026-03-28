# Gym Management System Backend Setup

This project now uses a Node/Express backend with PostgreSQL for:

- member signup and login
- session-based authentication
- admin-only display/update/delete operations
- `GROUP BY` + `ORDER BY` reporting for the DBMS submission

## 1. Create the database

If you already have a PostgreSQL role/database, skip to step 2 and update `.env`.

```sql
-- Run as postgres superuser
\i sql/setup_database.sql
```

## 2. Configure environment variables

Copy `.env.example` to `.env` and update the PostgreSQL credentials.

## 3. Create tables and seed demo data

```bash
psql -U gym_app -d gym_management_db -f sql/schema.sql
psql -U gym_app -d gym_management_db -f sql/seed.sql
psql -U gym_app -d gym_management_db -f sql/session_store.sql
```

## 4. Start the server

```bash
npm install
npm start
```

Open `http://localhost:3000`.

The frontend files now live in `public/`, which is the only directory served as static content.

## Deploying To Vercel

1. Create a hosted PostgreSQL database. Vercel cannot connect to a database running only on your local machine.
2. In Vercel, add `SESSION_SECRET` and either `DATABASE_URL` or the individual `PGHOST`/`PGPORT`/`PGUSER`/`PGPASSWORD`/`PGDATABASE` values.
3. Set `PGSSL=true` in Vercel if your hosted database requires SSL.
4. Run `sql/session_store.sql` against the hosted database so the session table exists before deploy.
5. Redeploy after saving the environment variables so the new deployment can pick them up.

This app now stores sessions in PostgreSQL instead of the default in-memory store, which makes login sessions much safer for production deployments.

## Demo credentials

- Admin: `admin` or `admin@ironforge.in` / `Admin@123`
- Member: `arjun` or `arjun@ironforge.in` / `Member@123`

## SQL files

- `sql/schema.sql`: `CREATE TABLE` queries
- `sql/seed.sql`: sample data
- `sql/project_queries.sql`: display/update/delete/report queries for screenshots
