"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { profileSchema, changePasswordSchema } from "@/lib/validation/auth";
import { updateProfileAction, changePasswordAction } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/form-field";

function NameForm({ name }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const { register, handleSubmit, formState: { errors, isDirty } } = useForm({ resolver: zodResolver(profileSchema), defaultValues: { name } });
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Display name</CardTitle></CardHeader>
      <CardContent>
        <form
          noValidate
          className="space-y-4"
          onSubmit={handleSubmit((v) =>
            start(async () => {
              const res = await updateProfileAction(v);
              if (!res.ok) return toast.error(res.error);
              toast.success("Profile updated");
              router.refresh();
            }),
          )}
        >
          <Field label="Name" htmlFor="p-name" error={errors.name?.message}><Input id="p-name" {...register("name")} /></Field>
          <Button type="submit" disabled={pending || !isDirty}>Save</Button>
        </form>
      </CardContent>
    </Card>
  );
}

function PasswordForm() {
  const [pending, start] = useTransition();
  const { register, handleSubmit, reset, setError, formState: { errors } } = useForm({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  });
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Change password</CardTitle></CardHeader>
      <CardContent>
        <form
          noValidate
          className="space-y-4"
          onSubmit={handleSubmit((v) =>
            start(async () => {
              const res = await changePasswordAction(v);
              if (!res.ok) {
                for (const [k, m] of Object.entries(res.fieldErrors ?? {})) setError(k, { message: m });
                return toast.error(res.error);
              }
              toast.success("Password changed");
              reset();
            }),
          )}
        >
          <Field label="Current password" htmlFor="cp" error={errors.currentPassword?.message}><Input id="cp" type="password" autoComplete="current-password" {...register("currentPassword")} /></Field>
          <Field label="New password" htmlFor="np" error={errors.newPassword?.message}><Input id="np" type="password" autoComplete="new-password" {...register("newPassword")} /></Field>
          <Field label="Confirm new password" htmlFor="cnp" error={errors.confirmPassword?.message}><Input id="cnp" type="password" autoComplete="new-password" {...register("confirmPassword")} /></Field>
          <Button type="submit" disabled={pending}>Change password</Button>
        </form>
      </CardContent>
    </Card>
  );
}

export function ProfileForms({ name }) {
  return (
    <div className="grid max-w-3xl gap-6 md:grid-cols-2">
      <NameForm name={name} />
      <PasswordForm />
    </div>
  );
}
