"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { MailCheck } from "lucide-react";
import { resendVerificationAction, signupAction } from "@/app/auth-actions";
import { Checkbox, ErrorSummary, Field, PasswordInput, StatusMessage, StrengthMeter, passwordHint } from "@/components/forms";
import { GENDERS, GENDER_LABEL, STUDENT_YEARS, STUDENT_YEAR_LABEL } from "@/lib/domain";
import { OFF_CAMPUS, fieldErrors, signupSchema, type SignupInput } from "@/lib/auth-schemas";
import type { HallOption } from "@/lib/residences";

const EMPTY: SignupInput = {
  firstName: "",
  lastName: "",
  preferredName: "",
  email: "",
  gtId: "",
  password: "",
  confirmPassword: "",
  gender: undefined,
  genderSelfDescribe: "",
  studentYear: "" as never,
  residenceBuildingId: "",
  roomNumber: "",
  phone: "",
  acceptTerms: false as never,
};

const RESEND_COOLDOWN_S = 60;

export function SignupForm({ halls, devMail }: { halls: HallOption[]; devMail: { link: boolean } | null }) {
  const [v, setV] = useState<SignupInput>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<React.ReactNode>(null);
  const [version, setVersion] = useState(0);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [gtIdFocused, setGtIdFocused] = useState(false);
  const [pending, start] = useTransition();
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_S);
  const [resent, setResent] = useState(false);

  useEffect(() => {
    if (!sentTo || cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [sentTo, cooldown]);

  function resend() {
    setResent(false);
    setCooldown(RESEND_COOLDOWN_S);
    start(async () => {
      await resendVerificationAction(sentTo ?? v.email.trim().toLowerCase());
      setResent(true);
    });
  }

  const set = <K extends keyof SignupInput>(k: K, val: SignupInput[K]) => setV((p) => ({ ...p, [k]: val }));
  const hall = halls.find((h) => h.id === v.residenceBuildingId);
  const groups = useMemo(() => [...new Set(halls.map((h) => h.group))], [halls]);
  const maskedGtId = v.gtId && !gtIdFocused ? v.gtId.replace(/\d(?=\d{3})/g, "•") : v.gtId;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const local = signupSchema.safeParse(v);
    if (!local.success) {
      setErrors(fieldErrors(local.error));
      setFormError(null);
      setVersion((n) => n + 1);
      return;
    }
    start(async () => {
      const res = await signupAction(v);
      if (res.ok) {
        setSentTo(res.data.email);
        window.scrollTo({ top: 0 });
        return;
      }
      setErrors(res.code === "DUPLICATE" ? {} : (res.fieldErrors ?? {}));
      setFormError(
        res.code === "DUPLICATE" ? (
          <p>
            {res.error}{" "}
            <Link href="/login" className="font-bold text-navy underline underline-offset-2">
              Sign in
            </Link>{" "}
            or{" "}
            <Link href="/forgot-password" className="font-bold text-navy underline underline-offset-2">
              reset your password
            </Link>
            .
          </p>
        ) : res.fieldErrors ? null : (
          res.error
        ),
      );
      setVersion((n) => n + 1);
    });
  }

  if (sentTo) {
    return (
      <div role="status" className="card mt-6 p-6">
        <MailCheck aria-hidden className="size-8 text-resolved" />
        <h2 className="h-section mt-3 text-xl">Check your email</h2>
        <p className="mt-2 text-ink-2">
          We sent a confirmation link to <span className="font-bold text-ink">{sentTo}</span>. It expires in 24 hours.
        </p>
        <p className="mt-2 text-ink-2">Housing will also confirm your room. Until then you can report issues in public buildings.</p>
        {devMail && (
          <p className="mt-3 rounded-[10px] bg-[#fffbeb] px-3 py-2.5 text-sm font-bold text-ink ring-1 ring-inset ring-[#f59e0b]/30">
            Email isn&apos;t configured on this machine.{" "}
            {devMail.link ? (
              <>
                Open the confirmation link from the{" "}
                <Link href="/dev/mail" className="text-navy underline underline-offset-2">
                  dev mailbox
                </Link>
                .
              </>
            ) : (
              "Find the confirmation link in the server console or .mail/outbox.jsonl."
            )}
          </p>
        )}
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Link href="/login" className="btn btn-secondary">
            Go to sign in
          </Link>
          <span className="text-sm text-ink-2">Didn&apos;t get it?</span>
          <button type="button" onClick={resend} disabled={pending || cooldown > 0} className="min-h-6 text-sm font-bold text-navy underline underline-offset-2 disabled:text-ink-2 disabled:no-underline">
            {cooldown > 0 ? `Resend the email in ${cooldown}s` : "Resend the email"}
          </button>
        </div>
        <StatusMessage>{resent ? "If that account is still waiting for confirmation, we sent a new link." : null}</StatusMessage>
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="card mt-6 space-y-6 p-5 md:p-6">
      <ErrorSummary errors={errors} message={formError} version={version} />

      <fieldset className="space-y-4">
        <legend className="h-section text-lg">About you</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="firstName" label="First name" error={errors.firstName}>
            {(a) => <input {...a} className="field" autoComplete="given-name" value={v.firstName} onChange={(e) => set("firstName", e.target.value)} />}
          </Field>
          <Field id="lastName" label="Last name" error={errors.lastName}>
            {(a) => <input {...a} className="field" autoComplete="family-name" value={v.lastName} onChange={(e) => set("lastName", e.target.value)} />}
          </Field>
        </div>
        <Field id="preferredName" label="Preferred name" optional hint="What staff and the app call you." error={errors.preferredName}>
          {(a) => <input {...a} className="field" autoComplete="nickname" value={v.preferredName ?? ""} onChange={(e) => set("preferredName", e.target.value)} />}
        </Field>
        <Field id="studentYear" label="Year" error={errors.studentYear}>
          {(a) => (
            <select {...a} className="field" value={v.studentYear ?? ""} onChange={(e) => set("studentYear", e.target.value as never)}>
              <option value="">Choose your year</option>
              {STUDENT_YEARS.map((y) => (
                <option key={y} value={y}>
                  {STUDENT_YEAR_LABEL[y]}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field id="gender" label="Gender" optional hint="Optional. Never shown to other students or contractors." error={errors.gender}>
          {(a) => (
            <select {...a} className="field" value={v.gender ?? ""} onChange={(e) => set("gender", (e.target.value || undefined) as never)}>
              <option value="">Choose an option</option>
              {GENDERS.map((g) => (
                <option key={g} value={g}>
                  {GENDER_LABEL[g]}
                </option>
              ))}
            </select>
          )}
        </Field>
        {v.gender === "SELF_DESCRIBE" && (
          <Field id="genderSelfDescribe" label="Describe your gender" error={errors.genderSelfDescribe}>
            {(a) => <input {...a} className="field" value={v.genderSelfDescribe ?? ""} onChange={(e) => set("genderSelfDescribe", e.target.value)} />}
          </Field>
        )}
        <Field id="email" label="Email" hint="We'll send a confirmation link here." error={errors.email}>
          {(a) => <input {...a} className="field" type="email" autoComplete="email" autoCapitalize="none" spellCheck={false} value={v.email} onChange={(e) => set("email", e.target.value)} />}
        </Field>
        <Field id="phone" label="Phone" optional hint="US number, for staff to reach you about a repair." error={errors.phone}>
          {(a) => <input {...a} className="field" type="tel" autoComplete="tel" inputMode="tel" value={v.phone ?? ""} onChange={(e) => set("phone", e.target.value)} />}
        </Field>
      </fieldset>

      <fieldset className="space-y-4 border-t border-line pt-6">
        <legend className="h-section text-lg">Georgia Tech</legend>
        <Field id="gtId" label="GT ID" hint="The 9-digit number on your BuzzCard, starting with 90." error={errors.gtId}>
          {(a) => (
            <input
              {...a}
              className="field num"
              inputMode="numeric"
              autoComplete="off"
              maxLength={11}
              value={maskedGtId}
              onFocus={() => setGtIdFocused(true)}
              onBlur={() => setGtIdFocused(false)}
              onChange={(e) => set("gtId", e.target.value.replace(/[^\d]/g, ""))}
            />
          )}
        </Field>
      </fieldset>

      <fieldset className="space-y-4 border-t border-line pt-6">
        <legend className="h-section text-lg">Where you live</legend>
        <Field id="residenceBuildingId" label="Residence hall" error={errors.residenceBuildingId}>
          {(a) => (
            <select
              {...a}
              className="field"
              value={v.residenceBuildingId}
              onChange={(e) => setV((p) => ({ ...p, residenceBuildingId: e.target.value }))}
            >
              <option value="">Choose your hall</option>
              <option value={OFF_CAMPUS}>Off campus</option>
              {groups.map((g) => (
                <optgroup key={g} label={g}>
                  {halls
                    .filter((h) => h.group === g)
                    .map((h) => (
                      <option key={h.id} value={h.id}>
                        {h.name}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
          )}
        </Field>
        {v.residenceBuildingId && v.residenceBuildingId !== OFF_CAMPUS && (
          <Field
            id="roomNumber"
            label="Room number"
            hint={`Your room or apartment number${hall ? ` in ${hall.name}` : ""}, like 214. Housing confirms it before you can see or report issues inside it.`}
            error={errors.roomNumber}
          >
            {(a) => (
              <input
                {...a}
                className="field max-w-48"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                maxLength={20}
                value={v.roomNumber ?? ""}
                onChange={(e) => set("roomNumber", e.target.value)}
              />
            )}
          </Field>
        )}
      </fieldset>

      <fieldset className="space-y-4 border-t border-line pt-6">
        <legend className="h-section text-lg">Password</legend>
        <Field id="password" label="Password" hint={passwordHint("it can't contain the first part of your email")} error={errors.password}>
          {(a) => (
            <>
              <PasswordInput {...a} autoComplete="new-password" value={v.password} onChange={(e) => set("password", e.target.value)} />
              <StrengthMeter password={v.password} />
            </>
          )}
        </Field>
        <Field id="confirmPassword" label="Retype password" error={errors.confirmPassword}>
          {(a) => <PasswordInput {...a} autoComplete="new-password" value={v.confirmPassword} onChange={(e) => set("confirmPassword", e.target.value)} />}
        </Field>
      </fieldset>

      <div className="border-t border-line pt-6">
        <div id="acceptTerms">
          <Checkbox
            id="acceptTerms-input"
            checked={v.acceptTerms === true}
            onChange={(c) => set("acceptTerms", c as never)}
            describedBy={errors.acceptTerms ? "acceptTerms-error" : undefined}
            invalid={!!errors.acceptTerms}
          >
            I agree to the Ramblin&apos; Repairs terms of use and privacy notice. My GT ID and gender are visible only to me and administrators.
          </Checkbox>
        </div>
        {errors.acceptTerms && (
          <p id="acceptTerms-error" className="mt-1.5 text-sm font-bold text-emergency">
            {errors.acceptTerms}
          </p>
        )}
      </div>

      <button type="submit" className="btn btn-primary w-full" disabled={pending}>
        {pending ? "Creating your account…" : "Create account"}
      </button>
      <p className="text-center text-sm text-ink-2">
        Already have an account?{" "}
        <Link href="/login" className="font-bold text-navy underline underline-offset-2">
          Sign in
        </Link>
      </p>
    </form>
  );
}
