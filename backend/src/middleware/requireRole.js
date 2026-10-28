export function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: { code: "UNAUTHENTICATED", message: "Authentication is required." },
      });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: { code: "FORBIDDEN", message: "You do not have permission to perform this action." },
      });
    }
    return next();
  };
}