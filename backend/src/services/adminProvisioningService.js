import bcrypt from "bcryptjs";

export class AdminProvisioningError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "AdminProvisioningError";
    this.code = code;
  }
}

export async function createAdminUser(prisma, {
  email,
  password,
  fullName = "Library Administrator",
}) {
  const normalizedEmail = email?.trim().toLowerCase();
  if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    throw new AdminProvisioningError("INVALID_EMAIL", "A valid admin email address is required.");
  }
  if (typeof password !== "string" || password.length < 16) {
    throw new AdminProvisioningError("WEAK_PASSWORD", "Use a unique admin password with at least 16 characters.");
  }
  if (typeof fullName !== "string" || !fullName.trim() || fullName.trim().length > 120) {
    throw new AdminProvisioningError("INVALID_NAME", "Admin name must be between 1 and 120 characters.");
  }

  const existingUser = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    select: { id: true },
  });
  if (existingUser) {
    throw new AdminProvisioningError(
      "ACCOUNT_EXISTS",
      "An account with this email already exists. No account was changed.",
    );
  }

  const passwordHash = await bcrypt.hash(password, 12);
  return prisma.user.create({
    data: {
      fullName: fullName.trim(),
      email: normalizedEmail,
      passwordHash,
      role: "ADMIN",
      accountStatus: "ACTIVE",
    },
    select: { id: true, fullName: true, email: true, role: true, accountStatus: true },
  });
}
