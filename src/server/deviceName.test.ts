import { describe, expect, it } from "vitest";
import { normalizeReportedDeviceLabel, shouldAdoptReportedDeviceLabel } from "./deviceName";

describe("device naming", () => {
  it("accepts only privacy-preserving Apple device classes", () => {
    expect(normalizeReportedDeviceLabel("iPhone")).toBe("iPhone");
    expect(normalizeReportedDeviceLabel(" iPad ")).toBe("iPad");
    expect(normalizeReportedDeviceLabel("张博宇的 iPhone")).toBeNull();
    expect(normalizeReportedDeviceLabel(null)).toBeNull();
  });

  it("corrects generated labels without overwriting a personal name", () => {
    expect(shouldAdoptReportedDeviceLabel("新设备", "iPhone")).toBe(true);
    expect(shouldAdoptReportedDeviceLabel("iPad", "iPhone")).toBe(true);
    expect(shouldAdoptReportedDeviceLabel("我的阅读手机", "iPhone")).toBe(false);
    expect(shouldAdoptReportedDeviceLabel("iPhone", "iPhone")).toBe(false);
  });
});
