export class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
  }
}

export function errorHandler(error, _req, res, _next) {
  if (error instanceof SyntaxError && error.status === 400 && "body" in error) {
    return res.status(400).json({
      error: { code: "MALFORMED_JSON", message: "The request body must be valid JSON." },
    });
  }
  if (error?.type === "entity.too.large") {
    return res.status(413).json({
      error: { code: "PAYLOAD_TOO_LARGE", message: "The request body exceeds the allowed size." },
    });
  }
  if (error?.name === "ZodError") {
    return res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "The request contains invalid values.",
        details: error.issues.map(({ path, message }) => ({ path: path.join("."), message })),
      },
    });
  }
  if (error?.name === "HttpError" || error?.name === "LoanError" || error?.name === "ReservationError") {
    return res.status(error.status).json({
      error: { code: error.code, message: error.message },
    });
  }
  if (error?.code === "P2002") {
    return res.status(409).json({
      error: { code: "DUPLICATE_RECORD", message: "A record with the same unique value already exists." },
    });
  }
  if (error?.code === "P2003") {
    return res.status(400).json({
      error: { code: "INVALID_REFERENCE", message: "One or more referenced records do not exist." },
    });
  }
  if (error?.code === "P2025") {
    return res.status(404).json({
      error: { code: "RECORD_NOT_FOUND", message: "The requested record was not found." },
    });
  }

  console.error("Unhandled API error", error);
  return res.status(500).json({
    error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred." },
  });
}