"use client";

import {
  useState,
  useEffect,
  useImperativeHandle,
  forwardRef,
  useMemo,
} from "react";
import { Alert } from "@mantine/core";
import PendingUsersTable from "./PendingUsersTable";
import PendingUsersTableSkeleton from "./PendingUsersTableSkeleton";
import { fetchPendingUsers, type PendingUser } from "../_lib";

export interface PendingUsersTableWrapperRef {
  refresh: () => void;
}

interface PendingUsersTableWrapperProps {
  search?: string;
  onCountChange?: (count: number) => void;
}

export default forwardRef<
  PendingUsersTableWrapperRef,
  PendingUsersTableWrapperProps
>(function PendingUsersTableWrapper({ search = "", onCountChange }, ref) {
  const [users, setUsers] = useState<PendingUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useImperativeHandle(ref, () => ({ refresh: loadUsers }));

  useEffect(() => {
    loadUsers();
  }, []);

  async function loadUsers() {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchPendingUsers();
      setUsers(data);
      onCountChange?.(data.length);
    } catch (err) {
      setError("Failed to load pending users. Please try again later.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  const filteredUsers = useMemo(() => {
    if (!search.trim()) return users;
    const query = search.toLowerCase().trim();
    return users.filter((user) => {
      const fullName =
        `${user.first_name} ${user.last_name}`.toLowerCase();
      return (
        fullName.includes(query) ||
        user.first_name.toLowerCase().includes(query) ||
        user.last_name.toLowerCase().includes(query) ||
        user.email.toLowerCase().includes(query)
      );
    });
  }, [users, search]);

  const handleUpdate = () => {
    loadUsers();
  };

  if (loading) {
    return <PendingUsersTableSkeleton />;
  }

  if (error) {
    return (
      <Alert color="red" title="Error">
        {error}
      </Alert>
    );
  }

  return <PendingUsersTable users={filteredUsers} onUpdate={handleUpdate} />;
});
