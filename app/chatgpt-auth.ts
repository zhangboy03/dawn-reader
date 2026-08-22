import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "../db";
import { readerDevices } from "../db/schema";
import { bearerDeviceToken, hashDeviceToken } from "../src/server/deviceAuth";
import {
  resolveDeviceReaderAccount,
  resolveReaderAccount,
  type ResolvedReaderAccount,
} from "../src/server/readerAccount";
import {
  isSameOriginMutation,
  resolveDawnSession,
  type DawnSessionIdentity,
} from "../src/server/dawnAuth";

export type ChatGPTUser = {
  userId: string;
  displayName: string;
  email: string;
  fullName: string | null;
};

const USER_ID_HEADER = "oai-authenticated-user-id";
const USER_EMAIL_HEADER = "oai-authenticated-user-email";
const USER_FULL_NAME_HEADER = "oai-authenticated-user-full-name";
const USER_FULL_NAME_ENCODING_HEADER = "oai-authenticated-user-full-name-encoding";

export async function getChatGPTUser(): Promise<ChatGPTUser | null> {
  const requestHeaders = await headers();
  const userId = requestHeaders.get(USER_ID_HEADER);
  const email = requestHeaders.get(USER_EMAIL_HEADER);
  if (!userId || !email) return null;

  const encodedFullName = requestHeaders.get(USER_FULL_NAME_HEADER);
  const fullName = encodedFullName &&
    requestHeaders.get(USER_FULL_NAME_ENCODING_HEADER) === "percent-encoded-utf-8"
      ? safeDecodeURIComponent(encodedFullName)
      : null;

  return { userId, email, fullName, displayName: fullName ?? email };
}

export async function requireChatGPTUser(returnTo = "/") {
  const user = await getChatGPTUser();
  if (!user && process.env.NODE_ENV === "development") {
    return { userId: "local-development", email: "local@dawn-reader.test", fullName: "Local Reader", displayName: "Local Reader" };
  }
  if (!user) redirect(`/signin-with-chatgpt?return_to=${encodeURIComponent(returnTo)}`);
  return user;
}

export type ReaderIdentity =
  | DawnSessionIdentity
  | (ResolvedReaderAccount & { kind: "chatgpt" })
  | (ResolvedReaderAccount & { kind: "device"; deviceId: string });

export async function requireReaderAccount(returnTo = "/reader") {
  const requestHeaders = await headers();
  const session = await resolveDawnSession(requestHeaders.get("cookie"));
  if (session) return session;
  const user = await getChatGPTUser();
  if (user) {
    const account = await resolveReaderAccount({
      issuer: "openai_sites",
      subject: user.userId,
      email: user.email,
    });
    if (account) return { ...account, kind: "chatgpt" } as const;
  }
  if (process.env.NODE_ENV === "development") {
    const account = await resolveReaderAccount({
      issuer: "openai_sites",
      subject: "local-development",
      email: "local@dawn-reader.test",
    });
    if (account) return { ...account, kind: "chatgpt" } as const;
  }
  redirect(`/join?return_to=${encodeURIComponent(returnTo)}`);
}

export async function getReaderIdentity(request: Request): Promise<ReaderIdentity | null> {
  const session = await resolveDawnSession(request.headers.get("cookie"));
  if (session) return isSameOriginMutation(request) ? session : null;
  const chatGPTUser = await getChatGPTUser();
  if (chatGPTUser) {
    const account = await resolveReaderAccount({
      issuer: "openai_sites",
      subject: chatGPTUser.userId,
      email: chatGPTUser.email,
    });
    if (!account || !isSameOriginMutation(request)) return null;
    return { ...account, kind: "chatgpt" };
  }
  if (process.env.NODE_ENV === "development") {
    const account = await resolveReaderAccount({
      issuer: "openai_sites",
      subject: "local-development",
      email: "local@dawn-reader.test",
    });
    return account ? { ...account, kind: "chatgpt" } : null;
  }

  const token = bearerDeviceToken(request);
  if (!token) return null;
  const tokenHash = await hashDeviceToken(token);
  const [device] = await getDb().select({ id: readerDevices.id, userId: readerDevices.userId })
    .from(readerDevices)
    .where(and(eq(readerDevices.tokenHash, tokenHash), isNull(readerDevices.revokedAt)))
    .limit(1);
  if (!device) return null;

  void getDb().update(readerDevices)
    .set({ lastUsedAt: new Date().toISOString() })
    .where(eq(readerDevices.id, device.id))
    .catch(() => undefined);
  const account = await resolveDeviceReaderAccount(device.userId);
  return account ? { ...account, kind: "device", deviceId: device.id } : null;
}

function safeDecodeURIComponent(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}
