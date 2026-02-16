"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Container, Stepper, Button, Group, Text, rem } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { useForm } from "@mantine/form";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import StepRoleInfo from "./StepRoleInfo";
import StepAssignPerms from "./StepAssignPerms";
import StepReview from "./StepReview";

export default function CreateRoleWizard() {
  const router = useRouter();

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 rounded-md border border-[#E0E4EB] bg-white p-6">
      <h2 className="text-lg font-semibold">Create Role</h2>
      <p className="text-center text-sm text-[#808898]">
        This is a placeholder for the Create Role Wizard. The actual form and
        functionality will be implemented in the future.
      </p>
    </div>
  );
}
