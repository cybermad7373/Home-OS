"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/infra/supabase/client";

export function SignOutButton() {
  const router = useRouter();

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={async () => {
        await createClient().auth.signOut();
        router.push("/signin");
        router.refresh();
      }}
    >
      Sign out
    </Button>
  );
}
