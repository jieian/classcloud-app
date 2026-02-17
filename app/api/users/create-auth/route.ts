import { createClient } from "@supabase/supabase-js";
import {
  createServerSupabaseClient,
  getUserPermissions,
} from "@/lib/supabase/server";
import { sendWelcomeEmail } from "@/lib/email/templates";

export async function POST(request: Request) {
  // 1. SECURITY: Verify the CALLER (the admin user clicking the button)
  const supabase = await createServerSupabaseClient();
  const {
    data: { user: caller },
  } = await supabase.auth.getUser();

  if (!caller) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. PERMISSIONS: Verify caller has the right to create users
  const permissions = await getUserPermissions(caller.id);
  if (!permissions.includes("access_user_management")) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  // 3. PAYLOAD: Parse ALL data needed for both Auth and DB
  const body = await request.json();
  const { 
    email, 
    password, 
    first_name, 
    middle_name, 
    last_name, 
    role_ids 
  } = body;

  // Basic validation to prevent wasted API calls
  if (!email || !password || !first_name || !last_name || !role_ids) {
    return Response.json({ error: "Missing required fields" }, { status: 400 });
  }

  // 4. ADMIN CLIENT: Initialize with Service Role Key (Bypasses RLS)
  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );

  let newAuthUserUuid: string | null = null;

  try {
    // --- STEP A: Create Auth User (Supabase Auth) ---
    const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        // Optional: Store basic name in metadata as a backup
        full_name: `${first_name} ${last_name}`, 
      },
    });

    if (authError) throw authError;
    
    // Store UUID for potential rollback
    newAuthUserUuid = authData.user.id; 

    // --- STEP B: Atomic DB Insert (Profile + Roles via RPC) ---
    // We call the RPC *from the server* using the Service Role key.
    // This is fast and ignores RLS policies.
    const { data: rpcResult, error: rpcError } = await adminClient.rpc("create_user_atomic", {
      p_uid: newAuthUserUuid,
      p_first_name: first_name,
      p_middle_name: middle_name || "", // Handle nulls gracefully
      p_last_name: last_name,
      p_role_ids: role_ids,
    });

    if (rpcError) {
      throw new Error(`Database Error: ${rpcError.message}`);
    }

    // Check logical success from your SQL function
    // (Your function returns json like { success: true, ... })
    // If rpcResult is null/undefined or success is false, treat as error
    if (rpcResult && rpcResult.success === false) {
        throw new Error(rpcResult.message || "Database insert failed logic check");
    }

    // --- STEP C: Send Welcome Email (non-blocking) ---
    // Don't let email failure roll back a successful user creation
    try {
      await sendWelcomeEmail({
        to: email,
        firstName: first_name,
        lastName: last_name,
        password,
      });
    } catch (emailError) {
      console.error("Welcome email failed (user was still created):", emailError);
    }

    // --- SUCCESS ---
    return Response.json({
      success: true,
      uuid: newAuthUserUuid
    }, { status: 201 });

  } catch (error: any) {
    console.error("User Creation Failed:", error.message);

    // --- ROLLBACK LOGIC ---
    // If Step A succeeded but Step B failed, we must delete the Auth User
    // to prevent "Orphaned" accounts that exist in Auth but not in your Tables.
    if (newAuthUserUuid) {
      try {
        await adminClient.auth.admin.deleteUser(newAuthUserUuid);
        console.log(`Rollback successful: Deleted orphaned user ${newAuthUserUuid}`);
      } catch (rollbackError) {
        console.error("CRITICAL: Rollback failed!", rollbackError);
      }
    }

    return Response.json(
      { error: error.message || "Internal Server Error" }, 
      { status: 500 }
    );
  }
}