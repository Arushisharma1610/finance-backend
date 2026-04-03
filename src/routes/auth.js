const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { body } = require("express-validator");
const { query } = require("../config/database");
const { handleValidation } = require("../middleware/validate");

const router = express.Router();

// POST /api/auth/register
router.post(
  "/register",
  [
    body("name").trim().notEmpty().withMessage("Name is required"),
    body("email").isEmail().withMessage("Valid email is required").normalizeEmail(),
    body("password").isLength({ min: 6 }).withMessage("Password must be at least 6 characters"),
    body("role")
      .optional()
      .isIn(["viewer", "analyst", "admin"])
      .withMessage("Role must be viewer, analyst, or admin"),
  ],
  handleValidation,
  async (req, res) => {
    try {
      const { name, email, password, role = "viewer" } = req.body;

      // Check if email already taken
      const existing = await query("SELECT id FROM users WHERE email = $1", [email]);
      if (existing.rows.length > 0) {
        return res.status(409).json({ error: "An account with this email already exists" });
      }

      const hashed = await bcrypt.hash(password, 10);

      const result = await query(
        "INSERT INTO users (name, email, password, role) VALUES ($1, $2, $3, $4) RETURNING id",
        [name, email, hashed, role]
      );

      const userId = result.rows[0].id;
      const token = signToken(userId);

      res.status(201).json({
        message: "Account created successfully",
        token,
        user: { id: userId, name, email, role },
      });
    } catch (err) {
      console.error("Register error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// POST /api/auth/login
router.post(
  "/login",
  [
    body("email").isEmail().withMessage("Valid email is required").normalizeEmail(),
    body("password").notEmpty().withMessage("Password is required"),
  ],
  handleValidation,
  async (req, res) => {
    try {
      const { email, password } = req.body;

      const result = await query("SELECT * FROM users WHERE email = $1", [email]);
      const user = result.rows[0];

      if (!user || !(await bcrypt.compare(password, user.password))) {
        return res.status(401).json({ error: "Invalid email or password" });
      }

      if (user.status === "inactive") {
        return res.status(403).json({ error: "Your account has been deactivated" });
      }

      const token = signToken(user.id);

      res.json({
        message: "Login successful",
        token,
        user: { id: user.id, name: user.name, email: user.email, role: user.role },
      });
    } catch (err) {
      console.error("Login error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

function signToken(userId) {
  return jwt.sign({ userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  });
}

module.exports = router;
