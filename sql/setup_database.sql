-- Run this file as a PostgreSQL superuser if you need a fresh DB user/database.
CREATE ROLE gym_app LOGIN PASSWORD 'change_this_password';
CREATE DATABASE gym_management_db OWNER gym_app;
GRANT ALL PRIVILEGES ON DATABASE gym_management_db TO gym_app;
