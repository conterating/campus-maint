"use client";
import { createAuthClient } from "better-auth/react";
import { twoFactorClient, usernameClient } from "better-auth/client/plugins";

// Browser client for Better Auth's HTTP endpoints (session and sign-out).
// Sign-in and sign-up go through server actions so they share the Zod schemas
// and the login lockout; see src/lib/auth.ts.
export const authClient = createAuthClient({
  plugins: [usernameClient(), twoFactorClient()],
});
