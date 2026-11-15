import type { Metadata } from "next";
import { LoginScreen } from "../LoginScreen";

export const metadata: Metadata = { title: "Staff sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  return <LoginScreen tab="staff" searchParams={await searchParams} />;
}
