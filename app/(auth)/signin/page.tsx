import { Suspense } from "react";
import type { Metadata } from "next";
import { AuthForm } from "@/components/forms/auth-form";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = { title: "Sign in" };

export default function SignInPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <AuthForm mode="signin" />
    </Suspense>
  );
}
