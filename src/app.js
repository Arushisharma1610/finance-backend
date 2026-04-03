require("dotenv").config();

const express = require("express");
const { connectDB } = require("./config/database");
const { runSchema } = require("./config/schema");

const app = express();

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(express.json());

app.use((req, _res, next) => {
  console.log(`${new Date().toISOString()}  ${req.method}  ${req.path}`);
  next();
});

// ── Routes ────────────────────────────────────────────────────────────────────
app.use("/api/auth",         require("./routes/auth"));
app.use("/api/users",        require("./routes/users"));
app.use("/api/transactions", require("./routes/transactions"));
app.use("/api/dashboard",    require("./routes/dashboard"));

app.get("/health", (_req, res) =>
  res.json({ status: "ok", timestamp: new Date().toISOString() })
);

// ── 404 ───────────────────────────────────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ error: "Route not found" }));

// ── Global error handler ──────────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
});

// ── Startup ───────────────────────────────────────────────────────────────────
async function start() {
  await connectDB();   // verify PostgreSQL is reachable
  await runSchema();   // create tables if they don't exist

  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`🚀 Finance backend running on http://localhost:${PORT}`);
  });
}

start();
