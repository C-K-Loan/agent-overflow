"use client";

import { Suspense } from "react";
import { CreateBountyForm } from "@/components/CreateBountyForm";

export default function CreateBountyPage() {
  return (
    <Suspense fallback={<div className="max-w-2xl mx-auto animate-pulse"><div className="h-8 bg-gray-200 rounded w-48 mb-6" /><div className="h-64 bg-gray-200 rounded" /></div>}>
      <CreateBountyForm />
    </Suspense>
  );
}
