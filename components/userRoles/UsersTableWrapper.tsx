"use client";

import { useState, useEffect } from "react";
import { Alert } from "@mantine/core";
import UsersTable from "./UsersTable";
import UsersTableSkeleton from "./UsersTableSkeleton";
import {
  fetchActiveUsersWithRoles,
  type UserWithRoles,
} from "@/lib/userRolesService";

export default function UsersTableWrapper() {
  const [users, setUsers] = useState<UserWithRoles[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadUsers();
  }, []);

  async function loadUsers() {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchActiveUsersWithRoles();
      setUsers(data);
    } catch (err) {
      setError("Failed to load users. Please try again later.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  const handleUpdate = () => {
    loadUsers();
  };

  if (loading) {
    return <UsersTableSkeleton />;
  }

  if (error) {
    return (
      <Alert color="red" title="Error">
        {error}
      </Alert>
    );
  }

  return <UsersTable users={users} onUpdate={handleUpdate} />;
}
