import { zodResolver } from "@hookform/resolvers/zod";
import { Moon, Sun } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { PageHeader, PageWrapper } from "@/components/layout/common";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldError, Input, Label } from "@/components/ui/form";
import { useAuth, useTheme } from "@/hooks/useAuth";
import { authService } from "@/services/authService";
import { errorMessage, formatDate } from "@/lib/utils";

const profileSchema = z.object({ full_name: z.string().max(120) });
const passwordSchema = z
  .object({
    current_password: z.string().optional(),
    new_password: z.string().min(8, "At least 8 characters"),
    confirm: z.string(),
  })
  .refine((d) => d.new_password === d.confirm, { message: "Passwords do not match", path: ["confirm"] });

type ProfileForm = z.infer<typeof profileSchema>;
type PasswordForm = z.infer<typeof passwordSchema>;

export function ProfilePage() {
  const { user, setUser } = useAuth();
  const profile = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
    defaultValues: { full_name: user?.full_name ?? "" },
  });
  const password = useForm<PasswordForm>({ resolver: zodResolver(passwordSchema) });

  if (!user) return null;

  const saveProfile = async (data: ProfileForm) => {
    try {
      setUser(await authService.updateMe(data));
      toast.success("Profile updated");
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const savePassword = async ({ current_password, new_password }: PasswordForm) => {
    try {
      setUser(await authService.updateMe({ current_password, new_password }));
      password.reset();
      toast.success("Password updated");
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  return (
    <PageWrapper className="max-w-2xl">
      <PageHeader title="Profile" description="Manage your account details." />
      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
          <CardDescription>
            {user.email} · joined {formatDate(user.created_at)}{" "}
            {user.oauth_provider && <Badge variant="secondary">Google</Badge>}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={profile.handleSubmit(saveProfile)} className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-2">
              <Label htmlFor="full_name">Full name</Label>
              <Input id="full_name" {...profile.register("full_name")} />
            </div>
            <Button type="submit" loading={profile.formState.isSubmitting}>
              Save
            </Button>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{user.has_password ? "Change password" : "Set a password"}</CardTitle>
          <CardDescription>
            {user.has_password ? "Use at least 8 characters." : "Add a password to log in without Google."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={password.handleSubmit(savePassword)} className="space-y-4" noValidate>
            {user.has_password && (
              <div className="space-y-2">
                <Label htmlFor="current_password">Current password</Label>
                <Input id="current_password" type="password" {...password.register("current_password")} />
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="new_password">New password</Label>
                <Input id="new_password" type="password" {...password.register("new_password")} />
                <FieldError message={password.formState.errors.new_password?.message} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm_pw">Confirm</Label>
                <Input id="confirm_pw" type="password" {...password.register("confirm")} />
                <FieldError message={password.formState.errors.confirm?.message} />
              </div>
            </div>
            <Button type="submit" variant="outline" loading={password.formState.isSubmitting}>
              Update password
            </Button>
          </form>
        </CardContent>
      </Card>
    </PageWrapper>
  );
}

export function SettingsPage() {
  const { theme, toggle } = useTheme();
  return (
    <PageWrapper className="max-w-2xl">
      <PageHeader title="Settings" description="Personalise ReviewLens." />
      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
          <CardDescription>Switch between light and dark mode.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={toggle}>
            {theme === "dark" ? <Sun /> : <Moon />}
            {theme === "dark" ? "Use light mode" : "Use dark mode"}
          </Button>
        </CardContent>
      </Card>
    </PageWrapper>
  );
}
