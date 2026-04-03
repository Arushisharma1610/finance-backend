const express = require("express");
const { query: qv } = require("express-validator");
const { query } = require("../config/database");
const { authenticate } = require("../middleware/auth");
const { handleValidation } = require("../middleware/validate");

const router = express.Router();
router.use(authenticate);

// GET /api/dashboard/summary
// Returns total income, total expenses, net balance
router.get(
  "/summary",
  [
    qv("startDate").optional().isISO8601(),
    qv("endDate").optional().isISO8601(),
  ],
  handleValidation,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;
      const { clause, params } = dateFilter(startDate, endDate, 1);

      const result = await query(
        `SELECT
          COALESCE(SUM(CASE WHEN type = 'income'  THEN amount ELSE 0 END), 0) AS total_income,
          COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) AS total_expenses,
          COUNT(*) AS transaction_count
        FROM transactions
        WHERE deleted_at IS NULL ${clause}`,
        params
      );

      const row = result.rows[0];

      res.json({
        total_income:       parseFloat(row.total_income),
        total_expenses:     parseFloat(row.total_expenses),
        net_balance:        parseFloat(row.total_income) - parseFloat(row.total_expenses),
        transaction_count:  parseInt(row.transaction_count),
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// GET /api/dashboard/by-category
// Totals per category, optionally filtered by type and date
router.get(
  "/by-category",
  [
    qv("type").optional().isIn(["income", "expense"]),
    qv("startDate").optional().isISO8601(),
    qv("endDate").optional().isISO8601(),
  ],
  handleValidation,
  async (req, res) => {
    try {
      const { type, startDate, endDate } = req.query;
      const conditions = ["deleted_at IS NULL"];
      const params = [];
      let idx = 1;

      if (type) { conditions.push(`type = $${idx++}`); params.push(type); }

      const { clause, params: dateParams } = dateFilter(startDate, endDate, idx);
      params.push(...dateParams);

      const result = await query(
        `SELECT
          category,
          type,
          ROUND(SUM(amount)::numeric, 2) AS total,
          COUNT(*) AS count
        FROM transactions
        WHERE ${conditions.join(" AND ")} ${clause}
        GROUP BY category, type
        ORDER BY total DESC`,
        params
      );

      res.json({ categories: result.rows });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// GET /api/dashboard/monthly?year=2024
// Monthly income vs expense breakdown — always returns all 12 months
router.get(
  "/monthly",
  [qv("year").optional().isInt({ min: 2000, max: 2100 })],
  handleValidation,
  async (req, res) => {
    try {
      const year = parseInt(req.query.year || new Date().getFullYear());

      const result = await query(
        `SELECT
          TO_CHAR(date, 'YYYY-MM') AS month,
          ROUND(SUM(CASE WHEN type = 'income'  THEN amount ELSE 0 END)::numeric, 2) AS income,
          ROUND(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END)::numeric, 2) AS expenses
        FROM transactions
        WHERE deleted_at IS NULL
          AND EXTRACT(YEAR FROM date) = $1
        GROUP BY month
        ORDER BY month ASC`,
        [year]
      );

      // Fill missing months with zero so frontend always gets 12 data points
      const monthly = fillMissingMonths(year, result.rows);

      res.json({ year, monthly });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// GET /api/dashboard/recent?limit=10
// Last N transactions across all categories
router.get("/recent", async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || 10), 50);

    const result = await query(
      `SELECT t.id, t.amount, t.type, t.category, t.date, t.notes, u.name AS created_by_name
       FROM transactions t
       JOIN users u ON t.created_by = u.id
       WHERE t.deleted_at IS NULL
       ORDER BY t.date DESC, t.created_at DESC
       LIMIT $1`,
      [limit]
    );

    res.json({ records: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Helpers ───────────────────────────────────────────────────────────────────

// Builds the date part of a WHERE clause starting at param index $startIdx
function dateFilter(startDate, endDate, startIdx) {
  let clause = "";
  const params = [];
  let idx = startIdx;

  if (startDate) { clause += ` AND date >= $${idx++}`; params.push(startDate); }
  if (endDate)   { clause += ` AND date <= $${idx++}`; params.push(endDate); }

  return { clause, params };
}

// Ensures all 12 months appear in the response even if there's no data
function fillMissingMonths(year, dbRows) {
  const map = {};
  for (const row of dbRows) map[row.month] = row;

  return Array.from({ length: 12 }, (_, i) => {
    const month = `${year}-${String(i + 1).padStart(2, "0")}`;
    return map[month] || { month, income: 0, expenses: 0 };
  });
}

module.exports = router;
