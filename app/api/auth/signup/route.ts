import { createClient } from "@supabase/supabase-js";
import { promises as dns } from "dns";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

const PASSWORD_REQUIREMENTS = [
  (p: string) => p.length >= 6,
  (p: string) => /[0-9]/.test(p),
  (p: string) => /[a-z]/.test(p),
  (p: string) => /[A-Z]/.test(p),
  (p: string) => /[$&+,:;=?@#|'<>.^*()%!-]/.test(p),
];

export async function POST(request: Request) {
  // --- PARSE & VALIDATE ---
  const body = await request.json();
  const { first_name, middle_name, last_name, email, password } = body;

  if (!first_name?.trim() || !last_name?.trim() || !email?.trim() || !password) {
    return Response.json({ error: "Missing required fields." }, { status: 400 });
  }

  if (!EMAIL_REGEX.test(email.trim())) {
    return Response.json({ error: "Invalid email format." }, { status: 400 });
  }

  if (
    first_name.trim().length > 100 ||
    last_name.trim().length > 100 ||
    (middle_name && middle_name.trim().length > 100)
  ) {
    return Response.json({ error: "Name field is too long." }, { status: 400 });
  }

  // Re-validate password server-side — never trust the client
  const allRequirementsMet = PASSWORD_REQUIREMENTS.every((test) => test(password));
  if (!allRequirementsMet) {
    return Response.json(
      { error: "Password does not meet the required strength criteria." },
      { status: 400 },
    );
  }

  // --- ADMIN CLIENT ---
  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  // --- CHECK EMAIL STATUS ---
  const { data: emailStatus, error: emailCheckError } = await adminClient.rpc(
    "check_email_status",
    { p_email: email.trim(), p_exclude_uid: null },
  );

  if (emailCheckError) {
    return Response.json(
      { error: "Failed to verify email availability. Please try again." },
      { status: 500 },
    );
  }

  if (emailStatus?.status === "active") {
    return Response.json(
      { error: "This email is already registered." },
      { status: 409 },
    );
  }

  // --- DNS MX CHECK: verify the domain actually accepts mail ---
  const domainValid = await domainHasMxRecords(email.trim());
  if (!domainValid) {
    return Response.json(
      {
        error: `The domain for "${email.trim()}" does not appear to accept mail. Double-check the address.`,
      },
      { status: 422 },
    );
  }

  // --- TOMBSTONE PATH: email belongs to a soft-deleted account ---
  // Free the email by renaming the old auth record, then fall through to
  // normal registration. The old users row (and UID) stays intact for reports.
  let tombstonedUid: string | null = null;
  if (emailStatus?.status === "deleted") {
    tombstonedUid = emailStatus.uid as string;
    const tombstoneEmail = `deleted_${tombstonedUid}@void.invalid`;

    const { error: tombstoneError } = await adminClient.auth.admin.updateUserById(
      tombstonedUid,
      { email: tombstoneEmail },
    );

    if (tombstoneError) {
      return Response.json(
        { error: "Failed to process registration. Please try again." },
        { status: 500 },
      );
    }
    // Email is now free — fall through to registration below.
  }

  // --- REGISTRATION ---
  let newAuthUserUuid: string | null = null;

  try {
    // Create auth user
    const { data: authData, error: authError } =
      await adminClient.auth.admin.createUser({
        email: email.trim(),
        password,
        email_confirm: true,
        user_metadata: {
          full_name: `${first_name.trim()} ${last_name.trim()}`,
        },
      });

    if (authError) throw authError;
    newAuthUserUuid = authData.user.id;

    // Insert pending profile atomically via RPC
    const { data: rpcResult, error: rpcError } = await adminClient.rpc(
      "register_user_atomic",
      {
        p_uid: newAuthUserUuid,
        p_first_name: first_name.trim(),
        p_middle_name: middle_name?.trim() || "",
        p_last_name: last_name.trim(),
      },
    );

    if (rpcError) throw new Error(`Database Error: ${rpcError.message}`);
    if (rpcResult?.success === false)
      throw new Error(rpcResult.message || "Registration failed.");

    return Response.json({ success: true }, { status: 201 });
  } catch (error: any) {
    console.error("Sign-up failed:", error.message);

    // Rollback: delete the new auth user if it was created
    if (newAuthUserUuid) {
      await adminClient.auth.admin.deleteUser(newAuthUserUuid).catch((err) =>
        console.error("CRITICAL: Auth rollback failed!", err),
      );
    }

    // Rollback: restore the tombstoned email so the old record isn't broken
    if (tombstonedUid) {
      await adminClient.auth.admin
        .updateUserById(tombstonedUid, { email: email.trim() })
        .catch((err) =>
          console.error(
            "CRITICAL: Failed to rollback tombstone for",
            tombstonedUid,
            err,
          ),
        );
    }

    return Response.json(
      { error: error.message || "Registration failed. Please try again." },
      { status: 500 },
    );
  }
}
