import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/server/dal";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/");
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-semibold tracking-tight">TestTrack</h1>
          <p className="mt-1 text-sm text-muted-foreground">Sign in to manage test cases and runs</p>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
