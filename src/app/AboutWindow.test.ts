import { describe, expect, it } from "vitest";
import { compareVersions } from "./AboutWindow";

describe("versions", () => {
  it("orders releases and pre-releases", () => {
    expect(compareVersions("v0.2.0", "0.1.0-alpha.1")).toBeGreaterThan(0);
    expect(compareVersions("0.1.0", "0.1.0-alpha.1")).toBeGreaterThan(0);
    expect(compareVersions("0.1.0-alpha.2", "0.1.0-alpha.10")).toBeLessThan(0);
    expect(compareVersions("v0.1.0-alpha.1", "0.1.0-alpha.1")).toBe(0);
    expect(compareVersions("0.1.0", "0.10.0")).toBeLessThan(0);
  });
});
