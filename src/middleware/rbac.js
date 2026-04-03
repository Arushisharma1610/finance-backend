// Role hierarchy: viewer < analyst < admin
const ROLE_LEVELS = {
  viewer: 1,
  analyst: 2,
  admin: 3,
};

// Usage: requireRole('analyst')  or  requireRole('admin')
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const userLevel = ROLE_LEVELS[req.user.role] || 0;
    const hasPermission = allowedRoles.some(
      (role) => userLevel >= ROLE_LEVELS[role]
    );

    if (!hasPermission) {
      return res.status(403).json({
        error: `Access denied. Required role: ${allowedRoles.join(" or ")}`,
      });
    }

    next();
  };
}

module.exports = { requireRole };
