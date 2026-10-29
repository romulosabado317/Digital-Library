import { createHash } from "node:crypto";
import { HttpError } from "../utils/errors.js";

export function hashSessionToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

export function createAuthenticate(prisma, cookieName) {
  return async (req, _res, next) => {
    try {
      const token = req.cookies?.[cookieName];
      if (!token) {
        return next();
      }

      const session = await prisma.session.findUnique({
        where: { tokenHash: hashSessionToken(token) },
        include: { user: true },
      });

      if (!session) {
        return next();
      }
      if (session.expiresAt <= new Date() || session.user.accountStatus !== "ACTIVE") {
        await prisma.session.deleteMany({ where: { id: session.id } });
        return next();
      }

      req.user = {
        id: session.user.id,
        fullName: session.user.fullName,
        email: session.user.email,
        role: session.user.role,
        mustChangePassword: session.user.mustChangePassword === true,
      };
      req.sessionId = session.id;
      return next();
    } catch (error) {
      return next(error);
    }
  };
}

export function requireAuthenticated(req, _res, next) {
  if (!req.user) {
    return next(new HttpError(401, "UNAUTHENTICATED", "Authentication is required."));
  }
  const allowedDuringPasswordChange = (
    req.method === "GET" && req.path === "/api/v1/auth/me"
  ) || (
    req.method === "POST" && req.path === "/api/v1/auth/password"
  );
  if (req.user.mustChangePassword && !allowedDuringPasswordChange) {
    return next(new HttpError(
      403,
      "PASSWORD_CHANGE_REQUIRED",
      "Change your temporary password before continuing.",
    ));
  }
  return next();
}