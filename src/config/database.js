const { Pool } = require("pg");

// Build connection from individual .env fields
// This makes it easy to change just the password or host without touching the full URL
const pool = new Pool({
  host:     process.env.DB_HOST     || "localhost",
  port:     parseInt(process.env.DB_PORT || "5432"),
  database: process.env.DB_NAME     || "finance_db",
  user:     process.env.DB_USER     || "postgres",
  password: process.env.DB_PASSWORD,

  // For cloud-hosted DBs (Render, Supabase, Railway) SSL is required
  // For localhost it is skipped automatically
  ssl: process.env.DB_HOST === "localhost" || process.env.DB_HOST === "127.0.0.1"
    ? false
    : { rejectUnauthorized: false },
});

// Called once at startup — crashes early if credentials are wrong
async function connectDB() {
  try {
    const client = await pool.connect();
    console.log("✅ PostgreSQL connected");
    client.release();
  } catch (err) {
    console.error("❌ PostgreSQL connection failed:", err.message);
    console.error("👉 Check DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD in your .env");
    process.exit(1);
  }
}

// Shorthand used in every route — query("SELECT ...", [params])
async function query(text, params) {
  const result = await pool.query(text, params);
  return result;
}

module.exports = { pool, query, connectDB };
