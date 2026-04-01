import { z } from "zod";

// ── Helper ────────────────────────────────────────────────────────────────────
// Parses and validates a request body against a zod schema.
// Returns { success: true, data } or { success: false, response } where
// response is a ready-to-return 400 JSON Response with the first error message.
export function parseBody<T>(
  schema: z.ZodSchema<T>,
  data: unknown,
): { success: true; data: T } | { success: false; response: Response } {
  const result = schema.safeParse(data);
  if (!result.success) {
    const message = result.error.issues[0]?.message ?? "Invalid request body.";
    return {
      success: false,
      response: Response.json({ error: message }, { status: 400 }),
    };
  }
  return { success: true, data: result.data };
}

// ── Transfer requests ─────────────────────────────────────────────────────────
export const CreateTransferRequestSchema = z
  .object({
    lrn: z.string().trim().regex(/^\d{12}$/, "Invalid LRN."),
    from_section_id: z.number().int().positive("Missing section IDs."),
    to_section_id: z.number().int().positive("Missing section IDs."),
  })
  .refine((d) => d.from_section_id !== d.to_section_id, {
    message: "Cannot transfer to the same section.",
  });

export const RejectTransferRequestSchema = z.object({
  notes: z.string().optional(),
});

// ── Notifications ─────────────────────────────────────────────────────────────
export const MarkNotificationsReadSchema = z.object({
  notification_ids: z.array(z.string()).optional().default([]),
});

// ── Students ──────────────────────────────────────────────────────────────────
export const DeleteStudentSchema = z.object({
  section_id: z.number().int().positive("Invalid section ID or LRN."),
  lrn: z.string().trim().regex(/^\d{12}$/, "Invalid section ID or LRN."),
});

export const UpdateStudentSchema = z.object({
  lrn: z.string().trim().regex(/^\d{12}$/, "LRN must be exactly 12 numeric digits."),
  last_name: z.string().trim().min(2, "Last name is required (min 2 chars)."),
  first_name: z.string().trim().min(2, "First name is required (min 2 chars)."),
  middle_name: z.string().trim().default(""),
  sex: z.enum(["M", "F"], { message: "Sex must be M or F." }),
});

// action + lrn are always required; name fields are conditionally required
// depending on the action — that conditional check stays in the route handler.
export const AddStudentSchema = z.object({
  action: z.enum(
    ["new", "enroll", "update_enroll", "restore_enroll", "restore_update_enroll", "move", "update_move"],
    { message: "Invalid action." },
  ),
  lrn: z.string().trim().regex(/^\d{12}$/, "LRN must be exactly 12 numeric digits."),
  last_name: z.string().trim().optional(),
  first_name: z.string().trim().optional(),
  middle_name: z.string().trim().optional(),
  sex: z.string().optional(),
});

// ── Sections ──────────────────────────────────────────────────────────────────
export const RenameSectionSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Section name cannot be empty.")
    .regex(/^[a-zA-Z0-9\s]+$/, "No symbols allowed."),
});

export const AssignSubjectTeachersSchema = z.object({
  assignments: z.array(
    z.object({
      curriculum_subject_id: z.number().int().positive(),
      teacher_id: z.string().nullable(),
    }),
  ),
});

// ── Settings ──────────────────────────────────────────────────────────────────
export const UpdateProfileSchema = z.object({
  first_name: z.string().trim().optional(),
  middle_name: z.string().trim().optional(),
  last_name: z.string().trim().optional(),
});
