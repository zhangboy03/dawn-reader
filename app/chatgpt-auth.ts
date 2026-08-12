import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "../db";
import { readerDevices } from "../db/schema";
import { bearerDeviceToken, hashDeviceToken } from "../src/server/deviceAuth";

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
  if (!user) redirect(`/signin-with-chatgpt?return_to=${encodeURIComponent(returnTo)}`);
  return user;
}

export async function isAuthorizedReaderRequest() {
  if (process.env.NODE_ENV === "development") return true;
  return Boolean(await getChatGPTUser());
}

export type ReaderIdentity = {
  userId: string;
  kind: "chatgpt" | "device";
};

export async function getReaderIdentity(request: Request): Promise<ReaderIdentity | null> {
  const chatGPTUser = await getChatGPTUser();
  if (chatGPTUser) return { userId: chatGPTUser.userId, kind: "chatgpt" };

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
  return { userId: device.userId, kind: "device" };
}

function safeDecodeURIComponent(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}
