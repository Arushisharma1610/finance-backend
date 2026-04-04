/**
 * @swagger
 * tags:
 *   name: Transactions
 *   description: Transaction management endpoints
 */

const express = require("express");
const { body, param, query: qv } = require("express-validator");
const { query } = require("../config/database");
const { authenticate } = require("../middleware/auth");
const { requireRole } = require("../middleware/rbac");
const { handleValidation } = require("../middleware/validate");

const router = express.Router();
router.use(authenticate);

/**
 * @swagger
 * /api/transactions:
 *   get:
 *     summary: Get all transactions with filters and pagination
 *     tags: [Transactions]
 *     parameters:
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [income, expense]
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Paginated list of transactions
 */
router.get(
  "/",
  [
    qv("type").optional().isIn(["income", "expense"]),
    qv("startDate").optional().isISO8601(),
    qv("endDate").optional().isISO8601(),
    qv("page").optional().isInt({ min: 1 }),
    qv("limit").optional().isInt({ min: 1, max: 100 }),
  ],
  handleValidation,
  async (req, res) => {
    try {
      const { type, category, startDate, endDate } = req.query;
      const page  = parseInt(req.query.page  || 1);
      const limit = parseInt(req.query.limit || 20);
      const offset = (page - 1) * limit;

      const conditions = ["t.deleted_at IS NULL"];
      const params = [];
      let idx = 1;

      if (type)      { conditions.push(`t.type = $${idx++}`);          params.push(type); }
      if (category)  { conditions.push(`t.category ILIKE $${idx++}`);  params.push(`%${category}%`); }
      if (startDate) { conditions.push(`t.date >= $${idx++}`);         params.push(startDate); }
      if (endDate)   { conditions.push(`t.date <= $${idx++}`);         params.push(endDate); }

      const where = conditions.join(" AND ");

      const countResult = await query(
        `SELECT COUNT(*) FROM transactions t WHERE ${where}`,
        params
      );
      const total = parseInt(countResult.rows[0].count);

      const records = await query(
        `SELECT t.*, u.name AS created_by_name
         FROM transactions t
         JOIN users u ON t.created_by = u.id
         WHERE ${where}
         ORDER BY t.date DESC, t.created_at DESC
         LIMIT $${idx++} OFFSET $${idx++}`,
        [...params, limit, offset]
      );

      res.json({
        records: records.rows,
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

/**
 * @swagger
 * /api/transactions/{id}:
 *   get:
 *     summary: Get a transaction by ID
 *     tags: [Transactions]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Transaction details
 *       404:
 *         description: Transaction not found
 */
router.get(
  "/:id",
  param("id").isInt(),
  handleValidation,
  async (req, res) => {
    try {
      const result = await query(
        `SELECT t.*, u.name AS created_by_name
         FROM transactions t
         JOIN users u ON t.created_by = u.id
         WHERE t.id = $1 AND t.deleted_at IS NULL`,
        [parseInt(req.params.id)]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: "Transaction not found" });
      }

      res.json({ record: result.rows[0] });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

/**
 * @swagger
 * /api/transactions:
 *   post:
 *     summary: Create a new transaction (analyst or admin)
 *     tags: [Transactions]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               amount:
 *                 type: number
 *                 example: 500
 *               type:
 *                 type: string
 *                 enum: [income, expense]
 *                 example: income
 *               category:
 *                 type: string
 *                 example: Salary
 *               date:
 *                 type: string
 *                 format: date
 *                 example: 2024-05-01
 *               notes:
 *                 type: string
 *                 example: Monthly salary
 *     responses:
 *       201:
 *         description: Transaction created successfully
 */
router.post(
  "/",
  requireRole("analyst"),
  [
    body("amount").isFloat({ gt: 0 }),
    body("type").isIn(["income", "expense"]),
    body("category").trim().notEmpty(),
    body("date").isISO8601(),
    body("notes").optional().trim(),
  ],
  handleValidation,
  async (req, res) => {
    try {
      const { amount, type, category, date, notes } = req.body;

      const result = await query(
        `INSERT INTO transactions (amount, type, category, date, notes, created_by)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [amount, type, category, date, notes || null, req.user.id]
      );

      res.status(201).json({ message: "Transaction created", record: result.rows[0] });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

/**
 * @swagger
 * /api/transactions/{id}:
 *   patch:
 *     summary: Update a transaction (analyst or admin)
 *     tags: [Transactions]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               amount:
 *                 type: number
 *               type:
 *                 type: string
 *                 enum: [income, expense]
 *               category:
 *                 type: string
 *               date:
 *                 type: string
 *                 format: date
 *               notes:
 *                 type: string
 *     responses:
 *       200:
 *         description: Transaction updated successfully
 *       404:
 *         description: Transaction not found
 */
// PATCH /api/transactions/:id — analyst + admin
router.patch(
  "/:id",
  requireRole("analyst"),
  [
    param("id").isInt(),
    body("amount").optional().isFloat({ gt: 0 }),
    body("type").optional().isIn(["income", "expense"]),
    body("category").optional().trim().notEmpty(),
    body("date").optional().isISO8601(),
    body("notes").optional().trim(),
  ],
  handleValidation,
  async (req, res) => {
    try {
      const id = parseInt(req.params.id);

      const found = await query(
        "SELECT id FROM transactions WHERE id = $1 AND deleted_at IS NULL",
        [id]
      );
      if (found.rows.length === 0) {
        return res.status(404).json({ error: "Transaction not found" });
      }

      const { amount, type, category, date, notes } = req.body;
      const fields = [];
      const values = [];
      let idx = 1;

      if (amount !== undefined) { fields.push(`amount = $${idx++}`); values.push(amount); }
      if (type) { fields.push(`type = $${idx++}`); values.push(type); }
      if (category) { fields.push(`category = $${idx++}`); values.push(category); }
      if (date) { fields.push(`date = $${idx++}`); values.push(date); }
      if (notes !== undefined) { fields.push(`notes = $${idx++}`); values.push(notes); }

      if (fields.length === 0) {
        return res.status(400).json({ error: "No fields provided to update" });
      }

      fields.push(`updated_at = NOW()`);
      values.push(id);

      const result = await query(
        `UPDATE transactions SET ${fields.join(", ")} WHERE id = $${idx} RETURNING *`,
        values
      );

      res.json({ message: "Transaction updated", record: result.rows[0] });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);



/**
 * @swagger
 * /api/transactions/{id}:
 *   patch:
 *     summary: Update a transaction (analyst or admin)
 *     tags: [Transactions]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               amount:
 *                 type: number
 *                 example: 250
 *               type:
 *                 type: string
 *                 enum: [income, expense]
 *                 example: expense
 *               category:
 *                 type: string
 *                 example: Food
 *               date:
 *                 type: string
 *                 format: date
 *                 example: 2026-04-04
 *               notes:
 *                 type: string
 *                 example: Dinner with friends
 *     responses:
 *       200:
 *         description: Transaction updated successfully
 *       400:
 *         description: No fields provided to update
 *       404:
 *         description: Transaction not found
 */

/**
 * @swagger
 * /api/transactions/{id}:
 *   delete:
 *     summary: Delete a transaction (admin only, soft delete)
 *     tags: [Transactions]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Transaction deleted successfully
 *       404:
 *         description: Transaction not found
 */

// DELETE /api/transactions/:id — admin only (soft delete)
router.delete(
  "/:id",
  requireRole("admin"),
  param("id").isInt(),
  handleValidation,
  async (req, res) => {
    try {
      const id = parseInt(req.params.id);

      const found = await query(
        "SELECT id FROM transactions WHERE id = $1 AND deleted_at IS NULL",
        [id]
      );
      if (found.rows.length === 0) {
        return res.status(404).json({ error: "Transaction not found" });
      }

      await query(
        "UPDATE transactions SET deleted_at = NOW() WHERE id = $1",
        [id]
      );

      res.json({ message: "Transaction deleted" });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

module.exports = router;
