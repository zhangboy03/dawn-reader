import { getReaderIdentity } from "../../../chatgpt-auth";
import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { readerDevices } from "../../../../db/schema";
import { normalizeReportedDeviceLabel, shouldAdoptReportedDeviceLabel } from "../../../../src/server/deviceName";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const identity = await getReaderIdentity(request);
  if (!identity || identity.kind !== "device") {
    return Response.json({ error: "Valid device pairing required." }, { status: 401 });
  }
  const reportedLabel = normalizeReportedDeviceLabel(request.headers.get("x-dawn-device-class"));
  let deviceLabel: string | null = null;
  if (reportedLabel) {
    const [device] = await getDb().select({ label: readerDevices.label })
      .from(readerDevices)
      .where(eq(readerDevices.id, identity.deviceId))
      .limit(1);
    deviceLabel = device?.label ?? null;
    if (device && shouldAdoptReportedDeviceLabel(device.label, reportedLabel)) {
      await getDb().update(readerDevices).set({ label: reportedLabel }).where(eq(readerDevices.id, identity.deviceId));
      deviceLabel = reportedLabel;
    }
  }
  return Response.json({ connected: true, deviceLabel });
}
