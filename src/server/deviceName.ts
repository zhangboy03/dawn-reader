const REPORTED_DEVICE_LABELS = new Set(["iPhone", "iPad"]);
const AUTOMATIC_DEVICE_LABELS = new Set(["iPad", "新设备", "Dawn Reader 设备"]);

export function normalizeReportedDeviceLabel(value: string | null) {
  const label = value?.trim() ?? "";
  return REPORTED_DEVICE_LABELS.has(label) ? label : null;
}

export function shouldAdoptReportedDeviceLabel(current: string, reported: string) {
  return current !== reported && AUTOMATIC_DEVICE_LABELS.has(current);
}
