import { zodResolver } from "@hookform/resolvers/zod";
import { motion } from "framer-motion";
import { Languages, ShieldAlert, Sparkles } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { z } from "zod";

import { Logo } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/card";
import { Spinner } from "@/components/ui/feedback";
import { FieldError, Input, Label } from "@/components/ui/form";
import { useAuth } from "@/hooks/useAuth";
import { authService } from "@/services/authService";
import { errorMessage } from "@/lib/utils";

function AuthLayout({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden overflow-hidden bg-gradient-to-br from-primary via-violet-600 to-fuchsia-600 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="bg-grid absolute inset-0 opacity-10" />
        <div className="relative text-2xl font-bold">ReviewLens</div>
        <div className="relative space-y-6">
          <h2 className="text-4xl font-bold leading-tight">
            Turn hundreds of reviews into a 5-minute action plan.
          </h2>
          <ul className="space-y-3 text-white/90">
            <li className="flex items-center gap-3">
              <Sparkles className="h-5 w-5" /> AI tags sentiment, category & urgency
            </li>
            <li className="flex items-center gap-3">
              <Languages className="h-5 w-5" /> Understands English, Tamil & Tanglish
            </li>
            <li className="flex items-center gap-3">
              <ShieldAlert className="h-5 w-5" /> Never miss an urgent complaint again
            </li>
          </ul>
        </div>
        <p className="relative text-sm text-white/70">Google · Zomato · Swiggy · Amazon</p>
      </div>
      <div className="bg-grid flex items-center justify-center p-6">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="w-full max-w-md"
        >
          <GlassCard>
            <div className="mb-6 space-y-2">
              <Logo />
              <h1 className="pt-4 text-2xl font-bold">{title}</h1>
              <p className="text-sm text-muted-foreground">{subtitle}</p>
            </div>
            {children}
          </GlassCard>
        </motion.div>
      </div>
    </div>
  );
}

function GoogleButton() {
  return (
    <Button variant="outline" className="w-full" asChild>
      <a href={authService.googleLoginUrl()}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.3-1.6 3.9-5.5 3.9-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.3 14.6 2.3 12 2.3 6.6 2.3 2.3 6.7 2.3 12s4.3 9.7 9.7 9.7c5.6 0 9.3-3.9 9.3-9.5 0-.6-.1-1.1-.2-1.6H12z" />
        </svg>
        Continue with Google
      </a>
    </Button>
  );
}

function Divider() {
  return (
    <div className="relative my-5 text-center text-xs uppercase text-muted-foreground">
      <span className="relative z-10 bg-card px-2">or</span>
      <div className="absolute inset-x-0 top-1/2 border-t" />
    </div>
  );
}

const loginSchema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});
type LoginForm = z.infer<typeof loginSchema>;

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const from = (location.state as { from?: string } | null)?.from ?? "/dashboard";
  const { register, handleSubmit, formState } = useForm<LoginForm>({ resolver: zodResolver(loginSchema) });

  useEffect(() => {
    if (params.get("error") === "google") toast.error("Google sign-in failed. Please try again.");
  }, [params]);

  const onSubmit = async (data: LoginForm) => {
    try {
      await login(data);
      navigate(from, { replace: true });
    } catch (error) {
      toast.error(errorMessage(error, "Login failed"));
    }
  };

  return (
    <AuthLayout title="Welcome back" subtitle="Log in to see what your customers are saying.">
      <GoogleButton />
      <Divider />
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" autoComplete="email" {...register("email")} />
          <FieldError message={formState.errors.email?.message} />
        </div>
        <div className="space-y-2">
          <div className="flex justify-between">
            <Label htmlFor="password">Password</Label>
            <Link to="/forgot-password" className="text-xs text-primary hover:underline">
              Forgot password?
            </Link>
          </div>
          <Input id="password" type="password" autoComplete="current-password" {...register("password")} />
          <FieldError message={formState.errors.password?.message} />
        </div>
        <Button type="submit" variant="gradient" className="w-full" loading={formState.isSubmitting}>
          Log in
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        New to ReviewLens?{" "}
        <Link to="/register" className="font-medium text-primary hover:underline">
          Create an account
        </Link>
      </p>
    </AuthLayout>
  );
}

const registerSchema = z
  .object({
    full_name: z.string().max(120).optional(),
    email: z.string().email("Enter a valid email"),
    password: z.string().min(8, "At least 8 characters"),
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, { message: "Passwords do not match", path: ["confirm"] });
type RegisterForm = z.infer<typeof registerSchema>;

export function RegisterPage() {
  const { register: registerUser } = useAuth();
  const navigate = useNavigate();
  const { register, handleSubmit, formState } = useForm<RegisterForm>({ resolver: zodResolver(registerSchema) });

  const onSubmit = async ({ full_name, email, password }: RegisterForm) => {
    try {
      await registerUser({ email, password, full_name: full_name || undefined });
      toast.success("Welcome to ReviewLens!");
      navigate("/businesses", { replace: true });
    } catch (error) {
      toast.error(errorMessage(error, "Registration failed"));
    }
  };

  return (
    <AuthLayout title="Create your account" subtitle="Start analysing your reviews in minutes.">
      <GoogleButton />
      <Divider />
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <div className="space-y-2">
          <Label htmlFor="full_name">Full name</Label>
          <Input id="full_name" autoComplete="name" {...register("full_name")} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" autoComplete="email" {...register("email")} />
          <FieldError message={formState.errors.email?.message} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" autoComplete="new-password" {...register("password")} />
            <FieldError message={formState.errors.password?.message} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm">Confirm</Label>
            <Input id="confirm" type="password" autoComplete="new-password" {...register("confirm")} />
            <FieldError message={formState.errors.confirm?.message} />
          </div>
        </div>
        <Button type="submit" variant="gradient" className="w-full" loading={formState.isSubmitting}>
          Create account
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link to="/login" className="font-medium text-primary hover:underline">
          Log in
        </Link>
      </p>
    </AuthLayout>
  );
}

export function ForgotPasswordPage() {
  return (
    <AuthLayout title="Forgot your password?" subtitle="Password reset by email is coming soon.">
      <p className="text-sm text-muted-foreground">
        For now, sign in with Google if your account uses the same email, or ask your administrator to help reset
        your password.
      </p>
      <Button asChild variant="outline" className="mt-6 w-full">
        <Link to="/login">Back to login</Link>
      </Button>
    </AuthLayout>
  );
}

export function OAuthCallbackPage() {
  const { completeOAuth } = useAuth();
  const navigate = useNavigate();
  const [failed, setFailed] = useState(false);
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;
    const params = new URLSearchParams(window.location.hash.slice(1));
    const access = params.get("access_token");
    const refresh = params.get("refresh_token");
    window.history.replaceState(null, "", window.location.pathname);
    if (!access || !refresh) {
      setFailed(true);
      return;
    }
    completeOAuth({ access_token: access, refresh_token: refresh, token_type: "bearer" })
      .then(() => navigate("/dashboard", { replace: true }))
      .catch(() => setFailed(true));
  }, [completeOAuth, navigate]);

  if (failed) {
    return (
      <AuthLayout title="Sign-in failed" subtitle="We couldn't complete Google sign-in.">
        <Button asChild className="w-full">
          <Link to="/login">Back to login</Link>
        </Button>
      </AuthLayout>
    );
  }
  return <Spinner label="Signing you in..." />;
}
