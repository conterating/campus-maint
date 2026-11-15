// Prints the current 6-digit code for the seeded administrator (Elena Vasquez),
// so you can sign in on a fresh demo database without an authenticator app.
// Demo data only: on anything real, enroll your own authenticator in
// /account/security and reset the seed.
import { createOTP } from "@better-auth/utils/otp";
import { DEMO_ADMIN_TOTP_SECRET } from "../src/lib/seed";

const otp = createOTP(DEMO_ADMIN_TOTP_SECRET);
const left = 30 - (Math.floor(Date.now() / 1000) % 30);
otp.totp().then((code) => {
  console.log(`Admin (evasquez1) code: ${code}  (valid for ${left}s more)`);
  console.log(`Or add this key to an authenticator app: ${otp.url("Ramblin' Repairs", "evasquez1@gatech.edu")}`);
});
