import { withErrorHandler } from "@/lib/api-error";
import { adminClient } from "@/lib/supabase/admin";
import { hashToken } from "@/lib/crypto";

// ─── POST /api/users/validate-invite ─────────────────────────────────────────
// Validates an invitation token and returns the details needed to render the
// activation screen. It performs NO mutation: the account is NOT activated, the
// token is NOT consumed, and the temporary password is NOT disclosed here.
// Activation + Privacy Notice consent happen only when the user clicks "Log In"
// (POST /api/users/activate-invite), so consent is a precondition of activation.
const _POST = async function (request: Request) {
  const body = await request.json();
  const { token } = body;

  if (!token || typeof token !== "string") {
    return Response.json({ error: "Missing token." }, { status: 400 });
  }

  const tokenHash = hashToken(token);

  // A present invitation row means the account has not been activated yet (the
  // row is hard-deleted on activation). A missing row = invalid or already used.
  const { data: invitation, error: lookupError } = await adminClient
    .from("user_invitations")
    .select("uid")
    .eq("token_hash", tokenHash)
    .single();

  if (lookupError || !invitation) {
    return Response.json(
      {
        error: "invalid",
        message: "This invitation link is invalid or has already been used.",
      },
      { status: 404 },
    );
  }

  const uid = invitation.uid as string;

  const [profileResult, rolesResult, authResult] = await Promise.all([
    adminClient
      .from("users")
      .select("first_name, middle_name, last_name")
      .eq("uid", uid)
      .single(),
    adminClient.from("user_roles").select("roles(name)").eq("uid", uid),
    adminClient.auth.admin.getUserById(uid),
  ]);

  const userProfile = profileResult.data;
  // PostgREST returns the to-one `roles` embed as an object at runtime, though the
  // untyped client infers an array — handle both shapes safely.
  const roleNames = ((rolesResult.data ?? []) as unknown as Array<{
    roles: { name: string } | { name: string }[] | null;
  }>)
    .map((r) => (Array.isArray(r.roles) ? r.roles[0] : r.roles)?.name)
    .filter((n): n is string => Boolean(n));
  const email = authResult.data?.user?.email ?? "";

  return Response.json({
    success: true,
    first_name: userProfile?.first_name ?? "",
    full_name: [
      userProfile?.first_name,
      userProfile?.middle_name,
      userProfile?.last_name,
    ]
      .filter(Boolean)
      .join(" "),
    email,
    role_names: roleNames,
  });
};

export const POST = withErrorHandler(_POST);
