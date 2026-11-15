import type { Metadata } from "next";
import { LoginScreen } from "../LoginScreen";

export const metadata: Metadata = { title: "Contractor sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  return <LoginScreen tab="contractor" searchParams={await searchParams} />;
}
