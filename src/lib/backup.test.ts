import { describe, expect, it } from "vitest";
import { BACKUP_REMINDER_DAYS, backupStatus } from "./backup";

const now = new Date("2026-11-20T12:00:00.000Z");

describe("backupStatus", () => {
  it("is due when there is data and no backup yet", () => {
    expect(backupStatus(undefined, true, now)).toEqual({ daysSince: undefined, due: true });
  });

  it("isn't due with nothing to protect", () => {
    expect(backupStatus(undefined, false, now).due).toBe(false);
  });

  it(`becomes due after ${BACKUP_REMINDER_DAYS} whole days`, () => {
    expect(backupStatus("2026-11-07T12:00:01.000Z", true, now)).toEqual({ daysSince: 12, due: false });
    expect(backupStatus("2026-11-06T13:00:00.000Z", true, now)).toEqual({ daysSince: 13, due: false });
    expect(backupStatus("2026-11-06T12:00:00.000Z", true, now)).toEqual({ daysSince: 14, due: true });
  });

  it("never reports negative days for a clock that went backwards", () => {
    expect(backupStatus("2026-11-21T00:00:00.000Z", true, now).daysSince).toBe(0);
  });
});
