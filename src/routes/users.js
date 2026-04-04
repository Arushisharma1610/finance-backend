/**
 * @swagger
 * tags:
 *   name: Users
 *   description: User management endpoints
 */

const express = require("express");
const bcrypt = require("bcryptjs");
const { body, param } = require("express-validator");
const { query } = require("../config/database");
const { authenticate } = require("../middleware/auth");
const { requireRole } = require("../middleware/rbac");
const { handleValidation } = require("../middleware/validate");

const router = express.Router();
router.use(authenticate);

/**
 * @swagger
 * /api/users:
 *   get:
 *     summary: Get all users (admin only)
 *     tags: [Users]
 *     responses:
 *       200:
 *         description: List of users
 *       403:
 *         description: Forbidden
 */
router.get("/", requireRole("admin"), async (req, res) => {
  try {
    const result = await query(
      "SELECT id, name, email, role, status, created_at FROM users ORDER BY created_at DESC"
    );
    res.json({ users: result.rows, total: result.rowCount });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * @swagger
 * /api/users/me:
 *   get:
 *     summary: Get own profile
 *     tags: [Users]
 *     responses:
 *       200:
 *         description: Current user profile
 */
router.get("/me", (req, res) => {
  res.json({ user: req.user });
});

/**
 * @swagger
 * /api/users:
 *   post:
 *     summary: Create a new user (admin only)
 *     tags: [Users]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 example: Jane Doe
 *               email:
 *                 type: string
 *                 example: jane@example.com
 *               password:
 *                 type: string
 *                 example: password123
 *               role:
 *                 type: string
 *                 enum: [viewer, analyst, admin]
 *                 example: analyst
 *     responses:
 *       201:
 *         description: User created successfully
 *       409:
 *         description: Email already in use
 */
router.post(
  "/",
  requireRole("admin"),
  [
    body("name").trim().notEmpty().withMessage("Name is required"),
    body("email").isEmail().normalizeEmail(),
    body("password").isLength({ min: 6 }).withMessage("Password must be at least 6 characters"),
    body("role").isIn(["viewer", "analyst", "admin"]).withMessage("Invalid role"),
  ],
  handleValidation,
  async (req, res) => {
    try {
      const { name, email, password, role } = req.body;

      const exists = await query("SELECT id FROM users WHERE email = $1", [email]);
      if (exists.rows.length > 0) {
        return res.status(409).json({ error: "Email already in use" });
      }

      const hashed = await bcrypt.hash(password, 10);
      const result = await query(
        "INSERT INTO users (name, email, password, role) VALUES ($1, $2, $3, $4) RETURNING id",
        [name, email, hashed, role]
      );

      res.status(201).json({
        message: "User created",
        user: { id: result.rows[0].id, name, email, role, status: "active" },
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

/**
 * @swagger
 * /api/users/{id}:
 *   patch:
 *     summary: Update user role or status (admin only)
 *     tags: [Users]
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
 *               role:
 *                 type: string
 *                 enum: [viewer, analyst, admin]
 *                 example: analyst
 *               status:
 *                 type: string
 *                 enum: [active, inactive]
 *                 example: inactive
 *     responses:
 *       200:
 *         description: User updated successfully
 *       400:
 *         description: Invalid input or self-deactivation attempt
 *       404:
 *         description: User not found
 */
router.patch(
  "/:id",
  requireRole("admin"),
  [
    param("id").isInt().withMessage("Invalid user ID"),
    body("role").optional().isIn(["viewer", "analyst", "admin"]).withMessage("Invalid role"),
    body("status").optional().isIn(["active", "inactive"]).withMessage("Invalid status"),
  ],
  handleValidation,
  async (req, res) => {
    try {
      const userId = parseInt(req.params.id);

      if (userId === req.user.id && req.body.status === "inactive") {
        return res.status(400).json({ error: "You cannot deactivate your own account" });
      }

      const found = await query("SELECT id FROM users WHERE id = $1", [userId]);
      if (found.rows.length === 0) {
        return res.status(404).json({ error: "User not found" });
      }

      const { role, status } = req.body;
      const fields = [];
      const values = [];
      let idx = 1;

      if (role)   { fields.push(`role = $${idx++}`);   values.push(role); }
      if (status) { fields.push(`status = $${idx++}`); values.push(status); }

      if (fields.length === 0) {
        return res.status(400).json({ error: "Provide role or status to update" });
      }

      values.push(userId);
      await query(
        `UPDATE users SET ${fields.join(", ")} WHERE id = $${idx}`,
        values
      );

      const updated = await query(
        "SELECT id, name, email, role, status FROM users WHERE id = $1",
        [userId]
      );

      res.json({ message: "User updated", user: updated.rows[0] });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

module.exports = router;
