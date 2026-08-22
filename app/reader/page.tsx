import App from "../../src/App";
import { requireReaderAccount } from "../chatgpt-auth";

export const dynamic = "force-dynamic";

export default async function ReaderPage() {
  const account = await requireReaderAccount("/reader");
  return <App accountContext={account} />;
}
