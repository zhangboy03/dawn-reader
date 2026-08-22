import { eq } from "drizzle-orm";
import { getReaderIdentity } from "../../chatgpt-auth";
import { getDb } from "../../../db";
import { readerState } from "../../../db/schema";

export const dynamic = "force-dynamic";

function parseJson(value: string | null) {
  if (!value) return null;
  try { return JSON.parse(value); } catch { return null; }
}

export async function GET(request: Request) {
  const user = await getReaderIdentity(request);
  if (!user) return Response.json({ error: "Sign in required." }, { status: 401 });
  const [state] = await getDb().select().from(readerState)
    .where(eq(readerState.userId, user.accountId)).limit(1);
  return Response.json({
    profile: parseJson(state?.profileJson ?? null),
    settings: parseJson(state?.settingsJson ?? null),
    updatedAt: state?.updatedAt ?? null,
  });
}

export async function PUT(request: Request) {
  const user = await getReaderIdentity(request);
  if (!user) return Response.json({ error: "Sign in required." }, { status: 401 });
  const input = await request.json() as { profile?: unknown; settings?: unknown };
  const now = new Date().toISOString();
  const [existing] = await getDb().select().from(readerState)
    .where(eq(readerState.userId, user.accountId)).limit(1);
  const profileJson = input.profile === undefined
    ? existing?.profileJson ?? null
    : JSON.stringify(input.profile);
  const existingSettings = parseJson(existing?.settingsJson ?? null);
  const settingsJson = input.settings === undefined
    ? existing?.settingsJson ?? null
    : JSON.stringify(
      existingSettings && typeof existingSettings === "object" && input.settings && typeof input.settings === "object"
        ? { ...existingSettings, ...input.settings }
        : input.settings,
    );

  await getDb().insert(readerState).values({
    userId: user.accountId,
    profileJson,
    settingsJson,
    updatedAt: now,
  }).onConflictDoUpdate({
    target: readerState.userId,
    set: { profileJson, settingsJson, updatedAt: now },
  });

  return Response.json({ updatedAt: now });
}
