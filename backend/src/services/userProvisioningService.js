import bcrypt from "bcryptjs";

export class UserProvisioningError extends Error {
  constructor(code, message, status) {
    super(message);
    this.name = "UserProvisioningError";
    this.code = code;
    this.status = status;
  }
}

export async function createManagedUser(prisma, {
  fullName,
  email,
  password,
  role,
}) {
  const normalizedName = typeof fullName === "string" ? fullName.trim() : "";
  const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";

  if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    throw new UserProvisioningError("INVALID_EMAIL", "A valid email address is required.", 400);
  }
  if (!normalizedName || normalizedName.length > 120) {
    throw new UserProvisioningError("INVALID_NAME", "Name must be between 1 and 120 characters.", 400);
  }
  if (
    typeof password !== "string"
    || password.length < 8
    || password.length > 128
    || Buffer.byteLength(password, "utf8") > 72
  ) {
    throw new UserProvisioningError(
      "WEAK_PASSWORD",
      "Use a unique password with at least 8 characters and no more than 72 UTF-8 bytes.",
      400,
    );
  }
  if (!["LIBRARIAN", "MEMBER"].includes(role)) {
    throw new UserProvisioningError("INVALID_ROLE", "Only librarian and member accounts can be created here.", 400);
  }

  const existingUser = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    select: { id: true },
  });
  if (existingUser) {
    throw new UserProvisioningError(
      "ACCOUNT_EXISTS",
      "An account with this email already exists.",
      409,
    );
  }

  const passwordHash = await bcrypt.hash(password, 12);
  return prisma.user.create({
    data: {
      fullName: normalizedName,
      email: normalizedEmail,
      passwordHash,
      role,
      accountStatus: "ACTIVE",
      mustChangePassword: role === "MEMBER",
    },
    select: {
      id: true,
      fullName: true,
      email: true,
      role: true,
      accountStatus: true,
      mustChangePassword: true,
    },
  });
}
