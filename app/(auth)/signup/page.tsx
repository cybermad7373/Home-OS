import { Suspense } from "react";
import type { Metadata } from "next";
import { AuthForm } from "@/components/forms/auth-form";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = {
  title: "Create your account",
  description: "Create a HouseOS account and join or start a home.",
};

export default function SignUpPage() {
  return (
    <Suspense fallback={<Skeleton className="h-[28rem] w-full" />}>
      <AuthForm mode="signup" />
    </Suspense>
  );
}
