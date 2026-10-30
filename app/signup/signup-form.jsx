"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { signupSchema } from "@/lib/validation/auth";
import { signupAction } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/form-field";

export function SignupForm() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [formError, setFormError] = useState("");
  const { register, handleSubmit, setError, formState: { errors } } = useForm({ resolver: zodResolver(signupSchema) });

  const onSubmit = (values) =>
    start(async () => {
      setFormError("");
      const res = await signupAction(values);
      if (!res.ok) {
        if (res.fieldErrors?.email) setError("email", { message: res.fieldErrors.email });
        else setFormError(res.error);
        return;
      }
      toast.success("Account created");
      router.replace("/");
      router.refresh();
    });

  return (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <Field label="Company name" htmlFor="companyName" error={errors.companyName?.message}>
            <Input id="companyName" autoComplete="organization" autoFocus {...register("companyName")} />
          </Field>
          <Field label="Your name" htmlFor="name" error={errors.name?.message}>
            <Input id="name" autoComplete="name" {...register("name")} />
          </Field>
          <Field label="Work email" htmlFor="email" error={errors.email?.message}>
            <Input id="email" type="email" autoComplete="username" {...register("email")} />
          </Field>
          <Field label="Password" htmlFor="password" error={errors.password?.message}>
            <Input id="password" type="password" autoComplete="new-password" {...register("password")} />
          </Field>
          <Field label="Confirm password" htmlFor="confirmPassword" error={errors.confirmPassword?.message}>
            <Input id="confirmPassword" type="password" autoComplete="new-password" {...register("confirmPassword")} />
          </Field>
          {formError && <p role="alert" className="text-sm text-destructive">{formError}</p>}
          <Button type="submit" size="lg" className="w-full" disabled={pending}>
            {pending ? "Creating account…" : "Create account"}
          </Button>
        </form>
  );
}
