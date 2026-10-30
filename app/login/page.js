import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/server/dal";
import { AuthShell } from "@/components/auth-shell";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/");
  return (
    <AuthShell title="Welcome back" subtitle="Sign in to manage test cases and runs">
      <LoginForm />
      <p className="text-center text-sm text-muted-foreground">
        <Link href="/signup" className="font-medium text-primary hover:underline">Create a new account</Link>
      </p>
    </AuthShell>
  );
}
