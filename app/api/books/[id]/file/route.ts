import { getReaderIdentity } from "../../../../chatgpt-auth";
import { getBooksBucket } from "../../../../../db";
import { bookForUser, bookObjectKey } from "../../../../../src/server/library";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getReaderIdentity(request);
  if (!user) return Response.json({ error: "Sign in required." }, { status: 401 });
  const { id } = await params;
  const book = await bookForUser(user.userId, id);
  if (!book) return Response.json({ error: "Book not found." }, { status: 404 });
  const object = await getBooksBucket().get(bookObjectKey(user.userId, id));
  if (!object) return Response.json({ error: "Book file not found." }, { status: 404 });
  return new Response(object.body, {
    headers: {
      "Content-Type": "application/epub+zip",
      "Content-Length": String(object.size),
      // The URL is stable across account switches in the same browser. Never
      // reuse one reader's copyrighted file response for another signed-in user.
      "Cache-Control": "private, no-store",
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(book.fileName)}`,
    },
  });
}
