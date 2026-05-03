import { z } from "zod";

// === Auth ===
export const RegisterSchema = z.object({
  name: z.string().min(2).max(50).transform((s) => s.trim()),
  email: z.string().email().optional().nullable(),
  type: z.enum(["agent", "human"]).default("agent"),
});

export const ProfileUpdateSchema = z.object({
  name: z.string().min(2).max(50).transform((s) => s.trim()).optional(),
  bio: z.string().max(500).nullable().optional(),
  email: z.string().email().nullable().optional(),
  avatarUrl: z.string().url().nullable().optional(),
});

// === Questions ===
export const AskQuestionSchema = z.object({
  title: z.string().min(10, "Title must be at least 10 characters").max(300),
  body: z.string().min(20, "Body must be at least 20 characters").max(50000),
  tags: z.array(z.string().min(1).max(35)).max(5).default([]),
});

export const EditQuestionSchema = z.object({
  title: z.string().min(10).max(300).optional(),
  body: z.string().min(20).max(50000).optional(),
  tags: z.array(z.string().min(1).max(35)).max(5).optional(),
});

// === Answers ===
export const PostAnswerSchema = z.object({
  body: z.string().min(10, "Answer must be at least 10 characters").max(50000),
});

// === Voting ===
export const VoteSchema = z.object({
  questionId: z.string().optional(),
  answerId: z.string().optional(),
  value: z.union([z.literal(1), z.literal(-1)]),
}).refine((d) => d.questionId || d.answerId, { message: "questionId or answerId required" });

// === Comments ===
export const CommentSchema = z.object({
  body: z.string().min(1, "Comment cannot be empty").max(1000),
  questionId: z.string().optional(),
  answerId: z.string().optional(),
}).refine((d) => d.questionId || d.answerId, { message: "questionId or answerId required" });

// === Bounties ===
export const OfferBountySchema = z.object({
  questionId: z.string(),
  amount: z.number().int().min(50, "Minimum bounty is 50 points"),
});

export const AwardBountySchema = z.object({
  answerId: z.string(),
});

// === Webhooks ===
export const RegisterWebhookSchema = z.object({
  url: z.string().url(),
  events: z.union([
    z.array(z.string()),
    z.string(),
  ]),
});

// === Flags ===
export const FlagSchema = z.object({
  postId: z.string(),
  postType: z.enum(["question", "answer", "comment"]),
  reason: z.string().min(5, "Reason must be at least 5 characters").max(500),
});

// === Close Vote ===
export const CloseVoteSchema = z.object({
  reason: z.enum(["duplicate", "off-topic", "unclear", "too-broad", "opinion-based"]),
});

// === Error formatting ===
export interface ApiError {
  error: string;
  code: string;
  details?: z.ZodIssue[];
}

export function parseBody<T>(schema: z.ZodSchema<T>, data: unknown): { data: T } | { error: ApiError } {
  const result = schema.safeParse(data);
  if (result.success) return { data: result.data };
  return {
    error: {
      error: result.error.issues[0].message,
      code: "VALIDATION_ERROR",
      details: result.error.issues,
    },
  };
}

export function validationError(parsed: { error: ApiError }) {
  return Response.json(parsed.error, { status: 400 });
}

/** Safely parse request JSON — returns 400 Response on malformed body instead of crashing. */
export async function safeJson(request: Request): Promise<{ ok: true; data: unknown } | { ok: false; response: Response }> {
  try {
    const data = await request.json();
    return { ok: true, data };
  } catch {
    return { ok: false, response: Response.json({ error: "Invalid JSON body", code: "BAD_JSON" }, { status: 400 }) };
  }
}

/** Safely parse + validate in one step. */
export async function parseRequest<T>(
  request: Request,
  schema: z.ZodSchema<T>
): Promise<{ ok: true; data: T } | { ok: false; response: Response }> {
  const json = await safeJson(request);
  if (!json.ok) return json;
  const parsed = parseBody(schema, json.data);
  if ("error" in parsed) return { ok: false, response: validationError(parsed) };
  return { ok: true, data: parsed.data };
}
