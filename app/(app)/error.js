"use client";
import { Button } from "@/components/ui/button";

export default function Error({ error, reset }) {
  return (
    <div className="mx-auto max-w-md rounded-lg border p-8 text-center">
      <h2 className="text-lg font-semibold">Something went wrong</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {error?.digest ? `Reference: ${error.digest}` : "An unexpected error occurred."}
      </p>
      <Button className="mt-4" onClick={reset}>Try again</Button>
    </div>
  );
}
