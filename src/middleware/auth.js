const jwt = require("jsonwebtoken");
const { query } = require("../config/database");

async function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or invalid authorization header" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    // Confirm user still exists and is active
    const { rows } = await query(
      "SELECT id, name, email, role, status FROM users WHERE id = $1",
      [payload.userId]
    );

    const user = rows[0];

    if (!user) {
      return res.status(401).json({ error: "User no longer exists" });
    }

    if (user.status === "inactive") {
      return res.status(403).json({ error: "Your account has been deactivated" });
    }

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Token is invalid or has expired" });
  }
}

module.exports = { authenticate };
