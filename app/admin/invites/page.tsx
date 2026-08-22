import { redirect } from "next/navigation";
import { requireReaderAccount } from "../../chatgpt-auth";
import { ownerInviteOverview } from "../../../src/server/dawnAuth";
import { InviteManager } from "../../../src/components/InviteManager";

export const dynamic = "force-dynamic";

export default async function InviteAdminPage() {
  const owner = await requireReaderAccount("/admin/invites");
  if (owner.role !== "owner" || owner.kind !== "chatgpt") redirect("/reader");
  const overview = await ownerInviteOverview();
  return <InviteManager initialOverview={overview} />;
}
