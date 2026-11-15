import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/auth";

// Better Auth's HTTP endpoints (session, sign-out, email verification, 2FA codes).
// Sign-in, sign-up and password changes are server actions; see src/lib/auth.ts.
export const { GET, POST } = toNextJsHandler(auth);
