import type { Metadata } from "next";
import { LoginScreen } from "./LoginScreen";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  return <LoginScreen tab="student" searchParams={await searchParams} />;
}
