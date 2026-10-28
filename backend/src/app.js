import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import { rateLimit } from "express-rate-limit";
import helmet from "helmet";
import { z } from "zod";
import { createAuthenticate, hashSessionToken, requireAuthenticated } from "./middleware/authenticate.js";
import { requireRole } from "./middleware/requireRole.js";
import { issueLoan, returnLoan } from "./services/loanService.js";
import {
  cancelReservation,
  createReservation,
  expireReservations,
} from "./services/reservationService.js";
import { errorHandler, HttpError } from "./utils/errors.js";

const loginSchema = z.object({
  email: z.string().email().max(254).transform((email) => email.toLowerCase()),
  password: z.string().min(1).max(128),
});

const issueLoanSchema = z.object({
  memberId: z.string().min(1).max(64),
  copyId: z.string().min(1).max(64),
});

const copyQuerySchema = z.object({
  status: z.enum(["AVAILABLE", "ON_LOAN", "RESERVED", "LOST", "DAMAGED"]).optional(),
});

const loanQuerySchema = z.object({
  status: z.enum(["ACTIVE", "RETURNED", "OVERDUE"]).optional(),
});
const reservationQuerySchema = z.object({
  status: z.enum(["WAITING", "AVAILABLE", "FULFILLED", "CANCELLED", "EXPIRED"]).optional(),
});

const resourceTypes = ["BOOK", "JOURNAL", "THESIS", "MEDIA", "DIGITAL_RESOURCE"];
const httpsUrl = z.string().url().refine((value) => new URL(value).protocol === "https:", {
  message: "URL must use HTTPS.",
});
const resourceInputSchema = z.object({
  title: z.string().trim().min(1).max(250),
  description: z.string().trim().max(5000).optional(),
  isbn: z.string().trim().max(17).optional(),
  publicationYear: z.coerce.number().int().min(1400).max(2100).optional(),
  resourceType: z.enum(resourceTypes).default("BOOK"),
  categoryId: z.string().min(1).max(64).nullable().optional(),
  publisherId: z.string().min(1).max(64).nullable().optional(),
  coverImageUrl: httpsUrl.optional(),
  digitalFileUrl: httpsUrl.optional(),
  authorIds: z.array(z.string().min(1).max(64)).max(30).optional(),
});
const resourceUpdateSchema = resourceInputSchema.extend({
  resourceType: z.enum(resourceTypes).optional(),
}).partial().refine(
  (value) => Object.keys(value).length > 0,
  { message: "Provide at least one resource field to update." },
);
const resourceListQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  categoryId: z.string().max(64).optional(),
  authorId: z.string().max(64).optional(),
  resourceType: z.enum(resourceTypes).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(24),
});
const copyInputSchema = z.object({
  accessionNumber: z.string().trim().min(1).max(64),
  barcode: z.string().trim().min(1).max(64).optional(),
});

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

export function createApp({
  prisma,
  env = {
    NODE_ENV: "development",
    FRONTEND_ORIGIN: "http://localhost:5173",
    SESSION_COOKIE_NAME: "digital_library_session",
    SESSION_TTL_DAYS: 7,
  },
}) {
  const app = express();
  const allowedOrigins = new Set(env.FRONTEND_ORIGIN.split(",").map((origin) => origin.trim()));

  app.disable("x-powered-by");
  if (env.NODE_ENV === "production") {
    app.set("trust proxy", 1);
  }
  app.use(helmet());
  app.use(cors({
    credentials: true,
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin)) {
        return callback(null, true);
      }
      return callback(new HttpError(403, "ORIGIN_NOT_ALLOWED", "This origin is not allowed."));
    },
  }));
  app.use(express.json({ limit: "32kb" }));
  app.use(cookieParser());
  app.use((req, _res, next) => {
    const origin = req.get("origin");
    if (origin && !allowedOrigins.has(origin)) {
      return next(new HttpError(403, "ORIGIN_NOT_ALLOWED", "This origin is not allowed."));
    }
    return next();
  });
  app.use(createAuthenticate(prisma, env.SESSION_COOKIE_NAME));

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: "draft-8",
    legacyHeaders: false,
  });

  app.get("/api/v1/health", (_req, res) => {
    res.json({ data: { status: "ok" } });
  });

  app.get("/api/v1/resources", asyncRoute(async (req, res) => {
    const query = resourceListQuerySchema.parse(req.query);
    const searchConditions = query.search
      ? [
        { title: { contains: query.search, mode: "insensitive" } },
        { description: { contains: query.search, mode: "insensitive" } },
        {
          authors: {
            some: {
              author: { name: { contains: query.search, mode: "insensitive" } },
            },
          },
        },
      ]
      : undefined;
    const where = {
      status: "ACTIVE",
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.authorId ? { authors: { some: { authorId: query.authorId } } } : {}),
      ...(query.resourceType ? { resourceType: query.resourceType } : {}),
      ...(searchConditions ? { OR: searchConditions } : {}),
    };
    const [resources, total] = await Promise.all([
      prisma.resource.findMany({
        where,
        select: {
          id: true,
          title: true,
          description: true,
          isbn: true,
          publicationYear: true,
          resourceType: true,
          status: true,
          coverImageUrl: true,
          category: true,
          publisher: true,
          authors: { include: { author: true } },
          _count: { select: { copies: true } },
        },
        orderBy: { title: "asc" },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      prisma.resource.count({ where }),
    ]);
    res.json({
      data: resources,
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    });
  }));

  app.get("/api/v1/categories", asyncRoute(async (_req, res) => {
    const categories = await prisma.category.findMany({ orderBy: { name: "asc" } });
    res.json({ data: categories });
  }));

  app.get("/api/v1/authors", asyncRoute(async (_req, res) => {
    const authors = await prisma.author.findMany({ orderBy: { name: "asc" }, take: 200 });
    res.json({ data: authors });
  }));

  app.get("/api/v1/publishers", asyncRoute(async (_req, res) => {
    const publishers = await prisma.publisher.findMany({ orderBy: { name: "asc" }, take: 200 });
    res.json({ data: publishers });
  }));

  app.post("/api/v1/auth/login", authLimiter, asyncRoute(async (req, res) => {
    const { email, password } = loginSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email } });
    const validPassword = user && await bcrypt.compare(password, user.passwordHash);

    if (!user || !validPassword || user.accountStatus !== "ACTIVE") {
      throw new HttpError(401, "INVALID_CREDENTIALS", "Email or password is incorrect.");
    }

    const rawToken = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + env.SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
    await prisma.session.create({
      data: { tokenHash: hashSessionToken(rawToken), userId: user.id, expiresAt },
    });

    res.cookie(env.SESSION_COOKIE_NAME, rawToken, {
      httpOnly: true,
      secure: env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      expires: expiresAt,
    });
    res.json({
      data: {
        user: { id: user.id, fullName: user.fullName, email: user.email, role: user.role },
      },
    });
  }));

  app.post("/api/v1/auth/logout", asyncRoute(async (req, res) => {
    if (req.sessionId) {
      await prisma.session.deleteMany({ where: { id: req.sessionId } });
    }
    res.clearCookie(env.SESSION_COOKIE_NAME, {
      httpOnly: true,
      secure: env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    });
    res.json({ data: { loggedOut: true } });
  }));

  app.get("/api/v1/auth/me", requireAuthenticated, (req, res) => {
    res.json({ data: { user: req.user } });
  });

  app.get(
    "/api/v1/users",
    requireAuthenticated,
    requireRole("ADMIN", "LIBRARIAN"),
    asyncRoute(async (req, res) => {
      const users = await prisma.user.findMany({
        where: { role: "MEMBER", accountStatus: "ACTIVE" },
        select: { id: true, fullName: true, email: true },
        orderBy: { fullName: "asc" },
        take: 100,
      });
      res.json({ data: users });
    }),
  );

  app.get(
    "/api/v1/resources/copies",
    requireAuthenticated,
    requireRole("ADMIN", "LIBRARIAN"),
    asyncRoute(async (req, res) => {
      const { status } = copyQuerySchema.parse(req.query);
      const copies = await prisma.physicalCopy.findMany({
        where: {
          ...(status ? { copyStatus: status } : {}),
          resource: { status: "ACTIVE" },
        },
        include: {
          resource: { select: { id: true, title: true, isbn: true } },
        },
        orderBy: { accessionNumber: "asc" },
        take: 100,
      });
      res.json({ data: copies });
    }),
  );

  app.get("/api/v1/resources/:id", asyncRoute(async (req, res) => {
    const id = z.string().min(1).max(64).parse(req.params.id);
    const resource = await prisma.resource.findFirst({
      where: { id, status: "ACTIVE" },
      select: {
        id: true,
        title: true,
        description: true,
        isbn: true,
        publicationYear: true,
        resourceType: true,
        status: true,
        coverImageUrl: true,
        category: true,
        publisher: true,
        authors: { include: { author: true } },
        _count: { select: { copies: true } },
      },
    });
    if (!resource) {
      throw new HttpError(404, "RESOURCE_NOT_FOUND", "The requested resource was not found.");
    }
    const availableCopies = await prisma.physicalCopy.count({
      where: { resourceId: id, copyStatus: "AVAILABLE" },
    });
    res.json({ data: { resource, availableCopies } });
  }));

  app.post(
    "/api/v1/resources",
    requireAuthenticated,
    requireRole("ADMIN", "LIBRARIAN"),
    asyncRoute(async (req, res) => {
      const input = resourceInputSchema.parse(req.body);
      const { authorIds = [], categoryId, publisherId, ...fields } = input;
      const resource = await prisma.$transaction(async (tx) => {
        const created = await tx.resource.create({
          data: {
            ...fields,
            ...(categoryId ? { category: { connect: { id: categoryId } } } : {}),
            ...(publisherId ? { publisher: { connect: { id: publisherId } } } : {}),
            authors: {
              create: authorIds.map((authorId) => ({ author: { connect: { id: authorId } } })),
            },
          },
        });
        await tx.auditLog.create({
          data: {
            actorUserId: req.user.id,
            action: "RESOURCE_CREATED",
            entityType: "Resource",
            entityId: created.id,
          },
        });
        return created;
      });
      res.status(201).json({ data: { resource } });
    }),
  );

  app.patch(
    "/api/v1/resources/:id",
    requireAuthenticated,
    requireRole("ADMIN", "LIBRARIAN"),
    asyncRoute(async (req, res) => {
      const id = z.string().min(1).max(64).parse(req.params.id);
      const input = resourceUpdateSchema.parse(req.body);
      const { authorIds, categoryId, publisherId, ...fields } = input;
      const resource = await prisma.$transaction(async (tx) => {
        const existing = await tx.resource.findFirst({
          where: { id, status: "ACTIVE" },
          select: { id: true },
        });
        if (!existing) {
          throw new HttpError(404, "RESOURCE_NOT_FOUND", "The requested resource was not found.");
        }
        const updated = await tx.resource.update({
          where: { id },
          data: {
            ...fields,
            ...(categoryId !== undefined
              ? { category: categoryId ? { connect: { id: categoryId } } : { disconnect: true } }
              : {}),
            ...(publisherId !== undefined
              ? { publisher: publisherId ? { connect: { id: publisherId } } : { disconnect: true } }
              : {}),
            ...(authorIds !== undefined
              ? {
                authors: {
                  deleteMany: {},
                  create: authorIds.map((authorId) => ({ author: { connect: { id: authorId } } })),
                },
              }
              : {}),
          },
        });
        await tx.auditLog.create({
          data: {
            actorUserId: req.user.id,
            action: "RESOURCE_UPDATED",
            entityType: "Resource",
            entityId: id,
            metadata: { changedFields: Object.keys(input) },
          },
        });
        return updated;
      });
      res.json({ data: { resource } });
    }),
  );

  app.delete(
    "/api/v1/resources/:id",
    requireAuthenticated,
    requireRole("ADMIN", "LIBRARIAN"),
    asyncRoute(async (req, res) => {
      const id = z.string().min(1).max(64).parse(req.params.id);
      try {
        await prisma.$transaction(async (tx) => {
          const activeReservations = await tx.reservation.count({
            where: { resourceId: id, status: { in: ["WAITING", "AVAILABLE"] } },
          });
          if (activeReservations > 0) {
            throw new HttpError(
              409,
              "RESOURCE_HAS_RESERVATIONS",
              "Cancel or fulfill active reservations before archiving this resource.",
            );
          }
          const archived = await tx.resource.updateMany({
            where: { id, status: "ACTIVE" },
            data: { status: "ARCHIVED", archivedAt: new Date() },
          });
          if (archived.count !== 1) {
            throw new HttpError(404, "RESOURCE_NOT_FOUND", "The requested resource was not found.");
          }
          await tx.auditLog.create({
            data: {
              actorUserId: req.user.id,
              action: "RESOURCE_ARCHIVED",
              entityType: "Resource",
              entityId: id,
            },
          });
        }, { isolationLevel: "Serializable" });
      } catch (error) {
        if (error?.code === "P2034") {
          throw new HttpError(
            409,
            "RESOURCE_CHANGED",
            "The resource or its reservation queue changed. Refresh and try again.",
          );
        }
        throw error;
      }
      res.status(204).end();
    }),
  );

  app.post(
    "/api/v1/resources/:id/copies",
    requireAuthenticated,
    requireRole("ADMIN", "LIBRARIAN"),
    asyncRoute(async (req, res) => {
      const resourceId = z.string().min(1).max(64).parse(req.params.id);
      const input = copyInputSchema.parse(req.body);
      const copy = await prisma.$transaction(async (tx) => {
        const resource = await tx.resource.findFirst({
          where: { id: resourceId, status: "ACTIVE" },
          select: { id: true },
        });
        if (!resource) {
          throw new HttpError(404, "RESOURCE_NOT_FOUND", "The requested resource was not found.");
        }
        const created = await tx.physicalCopy.create({
          data: { ...input, resourceId },
        });
        await tx.auditLog.create({
          data: {
            actorUserId: req.user.id,
            action: "PHYSICAL_COPY_CREATED",
            entityType: "PhysicalCopy",
            entityId: created.id,
            metadata: { resourceId },
          },
        });
        return created;
      });
      res.status(201).json({ data: { copy } });
    }),
  );

  app.post(
    "/api/v1/loans",
    requireAuthenticated,
    requireRole("ADMIN", "LIBRARIAN"),
    asyncRoute(async (req, res) => {
      const input = issueLoanSchema.parse(req.body);
      const loan = await issueLoan(prisma, { ...input, issuedBy: req.user.id });
      res.status(201).json({ data: { loan } });
    }),
  );

  app.post(
    "/api/v1/reservations",
    requireAuthenticated,
    requireRole("MEMBER"),
    asyncRoute(async (req, res) => {
      const input = z.object({ resourceId: z.string().min(1).max(64) }).parse(req.body);
      const reservation = await createReservation(prisma, {
        memberId: req.user.id,
        resourceId: input.resourceId,
      });
      res.status(201).json({ data: { reservation } });
    }),
  );

  app.get(
    "/api/v1/reservations/me",
    requireAuthenticated,
    requireRole("MEMBER"),
    asyncRoute(async (req, res) => {
      await expireReservations(prisma);
      const reservations = await prisma.reservation.findMany({
        where: { userId: req.user.id },
        include: {
          resource: { select: { id: true, title: true, resourceType: true } },
          physicalCopy: { select: { id: true, accessionNumber: true } },
        },
        orderBy: { reservedAt: "desc" },
        take: 100,
      });
      res.json({ data: reservations });
    }),
  );

  app.get(
    "/api/v1/reservations",
    requireAuthenticated,
    requireRole("ADMIN", "LIBRARIAN"),
    asyncRoute(async (req, res) => {
      const { status } = reservationQuerySchema.parse(req.query);
      await expireReservations(prisma);
      const reservations = await prisma.reservation.findMany({
        where: status ? { status } : {},
        include: {
          user: { select: { id: true, fullName: true, email: true } },
          resource: { select: { id: true, title: true } },
          physicalCopy: { select: { id: true, accessionNumber: true } },
        },
        orderBy: [{ resourceId: "asc" }, { queuePosition: "asc" }],
        take: 200,
      });
      res.json({ data: reservations });
    }),
  );

  app.delete(
    "/api/v1/reservations/:id",
    requireAuthenticated,
    asyncRoute(async (req, res) => {
      const reservationId = z.string().min(1).max(64).parse(req.params.id);
      const reservation = await cancelReservation(prisma, {
        reservationId,
        actorId: req.user.id,
        actorRole: req.user.role,
      });
      res.json({ data: { reservation } });
    }),
  );

  app.get(
    "/api/v1/loans/me",
    requireAuthenticated,
    asyncRoute(async (req, res) => {
      const loans = await prisma.loan.findMany({
        where: { userId: req.user.id },
        include: {
          physicalCopy: { include: { resource: { select: { id: true, title: true } } } },
        },
        orderBy: { borrowedAt: "desc" },
        take: 100,
      });
      res.json({ data: loans });
    }),
  );

  app.get(
    "/api/v1/loans",
    requireAuthenticated,
    requireRole("ADMIN", "LIBRARIAN"),
    asyncRoute(async (req, res) => {
      const { status } = loanQuerySchema.parse(req.query);
      const loans = await prisma.loan.findMany({
        where: status ? { loanStatus: status } : {},
        include: {
          user: { select: { id: true, fullName: true, email: true } },
          physicalCopy: { include: { resource: { select: { id: true, title: true } } } },
        },
        orderBy: { borrowedAt: "desc" },
        take: 100,
      });
      res.json({ data: loans });
    }),
  );

  app.post(
    "/api/v1/loans/:id/return",
    requireAuthenticated,
    requireRole("ADMIN", "LIBRARIAN"),
    asyncRoute(async (req, res) => {
      const loanId = z.string().min(1).max(64).parse(req.params.id);
      const loan = await returnLoan(prisma, { loanId, returnedBy: req.user.id });
      res.json({ data: { loan } });
    }),
  );

  app.use((_req, _res, next) => {
    next(new HttpError(404, "NOT_FOUND", "The requested endpoint was not found."));
  });
  app.use(errorHandler);
  return app;
}