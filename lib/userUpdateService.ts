import { supabase } from "./supabase-client";

export interface UpdateUserData {
  user_id: number;
  first_name: string;
  middle_name?: string;
  last_name: string;
  email: string;
  password?: string;
  role_ids: number[];
}

export async function updateUser(data: UpdateUserData): Promise<void> {
  try {
    // Start a transaction-like operation
    // 1. Update user basic info
    const userUpdate: any = {
      first_name: data.first_name,
      middle_name: data.middle_name || null,
      last_name: data.last_name,
      email: data.email,
      active_status: 1, // Ensure active_status remains 1
    };

    // Add password if provided
    if (data.password) {
      userUpdate.password_hash = data.password; // Note: You should hash this on the backend/trigger
    }

    const { error: userError } = await supabase
      .from("users")
      .update(userUpdate)
      .eq("user_id", data.user_id);

    if (userError) {
      console.error("Error updating user:", userError);
      throw new Error("Failed to update user information");
    }

    // 2. Update roles - Delete existing and insert new ones
    // Delete existing role associations
    const { error: deleteError } = await supabase
      .from("user_roles")
      .delete()
      .eq("user_id", data.user_id);

    if (deleteError) {
      console.error("Error deleting existing roles:", deleteError);
      throw new Error("Failed to update user roles");
    }

    // Insert new role associations if any roles are selected
    if (data.role_ids.length > 0) {
      const roleInserts = data.role_ids.map((role_id) => ({
        user_id: data.user_id,
        role_id: role_id,
      }));

      const { error: insertError } = await supabase
        .from("user_roles")
        .insert(roleInserts);

      if (insertError) {
        console.error("Error inserting new roles:", insertError);
        throw new Error("Failed to assign user roles");
      }
    }
  } catch (error) {
    console.error("Failed to update user:", error);
    throw error;
  }
}

export async function fetchAllRoles(): Promise<
  Array<{ role_id: number; name: string }>
> {
  try {
    const { data, error } = await supabase
      .from("roles")
      .select("role_id, name")
      .order("name");

    if (error) {
      console.error("Error fetching roles:", error);
      throw error;
    }

    return data || [];
  } catch (error) {
    console.error("Failed to fetch roles:", error);
    throw error;
  }
}
