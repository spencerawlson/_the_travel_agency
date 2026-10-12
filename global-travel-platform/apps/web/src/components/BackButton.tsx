"use client";

import { Button } from "@gtp/ui";
import { useRouter } from "next/navigation";

export function BackButton({ label }: { label: string }) {
  const router = useRouter();
  return <Button onClick={() => router.back()}>{label}</Button>;
}
