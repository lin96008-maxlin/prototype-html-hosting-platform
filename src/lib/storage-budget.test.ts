import { describe, expect, it } from "vitest";
import { calculatePlatformStorageBudget } from "@/lib/storage-budget";

describe("calculatePlatformStorageBudget", () => {
  it("按实际磁盘容量预留 20% 并计算平台可用空间", () => {
    const gib = 1024 ** 3;
    const result = calculatePlatformStorageBudget(2 * gib, 40 * gib, 30 * gib);
    expect(result.reserveBytes).toBe(8 * gib);
    expect(result.reserveRatio).toBe(0.2);
    expect(result.diskUsedBytes).toBe(10 * gib);
    expect(result.uploadAvailableBytes).toBe(22 * gib);
    expect(result.safeCapacityBytes).toBe(24 * gib);
    expect(result.systemAndOtherUsedBytes).toBe(8 * gib);
  });

  it("拆分原型、备份及系统其他占用，同时保持整盘总量一致", () => {
    const gib = 1024 ** 3;
    const result = calculatePlatformStorageBudget(2 * gib, 40 * gib, 28 * gib, 0.2, 3 * gib, 2 * gib);
    expect(result.diskUsedBytes).toBe(12 * gib);
    expect(result.backupRepositoryBytes).toBe(3 * gib);
    expect(result.prototypeDiskBytes).toBe(2 * gib);
    expect(result.systemAndOtherUsedBytes).toBe(7 * gib);
    expect(result.prototypeUsedBytes + result.backupRepositoryBytes + result.systemAndOtherUsedBytes)
      .toBe(result.diskUsedBytes);
  });

  it("原型解压后的实际磁盘占用高于数据库记录时采用较大值", () => {
    const gib = 1024 ** 3;
    const result = calculatePlatformStorageBudget(2 * gib, 40 * gib, 28 * gib, 0.2, 3 * gib, 4 * gib);
    expect(result.prototypeUsedBytes).toBe(2 * gib);
    expect(result.prototypeDiskBytes).toBe(4 * gib);
    expect(result.systemAndOtherUsedBytes).toBe(5 * gib);
  });

  it("磁盘剩余空间低于安全预留时停止新增上传", () => {
    const gib = 1024 ** 3;
    const result = calculatePlatformStorageBudget(5 * gib, 40 * gib, 6 * gib);
    expect(result.uploadAvailableBytes).toBe(0);
    expect(result.safeCapacityBytes).toBe(5 * gib);
  });

  it("支持为隔离测试环境配置独立的安全预留比例", () => {
    const gib = 1024 ** 3;
    const result = calculatePlatformStorageBudget(0, 10 * gib, 2 * gib, 0.01);
    expect(result.reserveBytes).toBe(Math.floor(0.1 * gib));
    expect(result.uploadAvailableBytes).toBeGreaterThan(1.8 * gib);
  });
});
