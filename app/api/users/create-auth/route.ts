import { createClient } from "@supabase/supabase-js";
import { promises as dns } from "dns";
import {
  createServerSupabaseClient,
  getUserPermissions,
} from "@/lib/supabase/server";
import { sendWelcomeEmail } from "@/lib/email/templates";

async function domainHasMxRecords(email: string): Promise<boolean> {
  const domain = email.split("@")[1];
  if (!domain) return false;
  try {
    const records = await dns.resolveMx(domain);
    return records.length > 0;
  } catch {
    return false;
  }
}

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
  if (!permissions.includes("users.full_access")) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  // 3. PAYLOAD: Parse ALL data needed for both Auth and DB
  const body = await request.json();
  const { email, password, first_name, middle_name, last_name, role_ids } = body;

  if (!email || !password || !first_name || !last_name || !role_ids) {
    return Response.json({ error: "Missing required fields" }, { status: 400 });
  }

  // 4. ADMIN CLIENT: Initialize with Service Role Key (Bypasses RLS)
  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // --- STEP 0: Check email status in DB ---
  const { data: emailStatus, error: emailCheckError } = await adminClient.rpc(
    "check_email_status",
    { p_email: email, p_exclude_uid: null },
  );

  if (!emailCheckError && emailStatus?.status === "active") {
    return Response.json({ error: "Email already in use" }, { status: 409 });
  }

  // --- STEP 1: DNS MX check — verify the domain accepts mail before doing anything ---
  const domainValid = await domainHasMxRecords(email);
  if (!domainValid) {
    return Response.json(
      {
        error: `The domain for "${email}" does not appear to accept mail. Double-check the address — no account was created.`,
        code: "EMAIL_DELIVERY_FAILED",
      },
      { status: 422 }
    );
  }

  // --- TOMBSTONE PATH: email belongs to a soft-deleted account ---
  // Rename the old auth user's email to free it up, then create a brand-new account.
  // The old users row (and its UID) remains intact so report references are preserved.
  let tombstonedUid: string | null = null;
  if (!emailCheckError && emailStatus?.status === "deleted") {
    tombstonedUid = emailStatus.uid;
    const tombstoneEmail = `deleted_${tombstonedUid}@void.invalid`;

    const { error: tombstoneError } = await adminClient.auth.admin.updateUserById(
      tombstonedUid,
      { email: tombstoneEmail },
    );

    if (tombstoneError) {
      return Response.json(
        { error: "Failed to free up the email address. Please try again." },
        { status: 500 },
      );
    }
    // Email is now free — fall through to the new user path below.
  }

  // --- NEW USER PATH ---
  // Send email first — if it fails, nothing has been created so rollback is just the tombstone.
  try {
    await sendWelcomeEmail({ to: email, firstName: first_name, lastName: last_name, password });
  } catch {
    // Rollback tombstone if we renamed an old auth user's email
    if (tombstonedUid) {
      await adminClient.auth.admin.updateUserById(tombstonedUid, { email }).catch((err) =>
        console.error("CRITICAL: Failed to rollback tombstone for", tombstonedUid, err),
      );
    }
    return Response.json(
      {
        error: `The welcome email could not be delivered to "${email}". Double-check the address — no account was created.`,
        code: "EMAIL_DELIVERY_FAILED",
      },
      { status: 422 },
    );
  }

  let newAuthUserUuid: string | null = null;

  try {
    // Create auth user
    const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: `${first_name} ${last_name}` },
    });

    if (authError) throw authError;
    newAuthUserUuid = authData.user.id;

    // Atomic DB insert (profile + roles via RPC)
    const { data: rpcResult, error: rpcError } = await adminClient.rpc("create_user_atomic", {
      p_uid: newAuthUserUuid,
      p_first_name: first_name,
      p_middle_name: middle_name || "",
      p_last_name: last_name,
      p_role_ids: role_ids,
    });

    if (rpcError) throw new Error(`Database Error: ${rpcError.message}`);
    if (rpcResult?.success === false) throw new Error(rpcResult.message || "Database insert failed");

    return Response.json({ success: true, uuid: newAuthUserUuid }, { status: 201 });

  } catch (error: any) {
    // Email was already sent — log clearly so this can be investigated
    console.error("CRITICAL: Welcome email sent but user creation failed:", error.message);

    // Rollback new auth user if it was created
    if (newAuthUserUuid) {
      try {
        await adminClient.auth.admin.deleteUser(newAuthUserUuid);
        console.log(`Rollback successful: Deleted orphaned auth user ${newAuthUserUuid}`);
      } catch (rollbackError) {
        console.error("CRITICAL: Auth rollback failed!", rollbackError);
      }
    }

    // Rollback tombstone so the old deleted account isn't left with a garbage email
    if (tombstonedUid) {
      await adminClient.auth.admin.updateUserById(tombstonedUid, { email }).catch((err) =>
        console.error("CRITICAL: Failed to rollback tombstone for", tombstonedUid, err),
      );
    }

    return Response.json(
      { error: error.message || "Internal Server Error" },
      { status: 500 },
    );
  }
}
