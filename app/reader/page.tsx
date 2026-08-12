import App from "../../src/App";
import { requireChatGPTUser } from "../chatgpt-auth";

export const dynamic = "force-dynamic";

export default async function ReaderPage() {
  await requireChatGPTUser("/reader");
  return <App />;
}
