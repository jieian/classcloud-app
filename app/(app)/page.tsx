"use client";

import ProtectedRoute from "@/components/ProtectedRoute";
import { useAuth } from "@/context/AuthContext";
import { Divider } from "@mantine/core";

export default function Home() {
  const { firstName, lastName } = useAuth();

  return (
    <ProtectedRoute requiredPermissions={[]}>
      <h1 className="text-3xl font-bold mb-6 text-[#597D37]">Home</h1>
      <Divider my="sm" />
      <p className="mt-4 text-lg text-[#808898]">
        Welcome, {firstName} {lastName}!
      </p>
    </ProtectedRoute>
  );
}
