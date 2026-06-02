import { describe, it, expect } from "vitest";
import { assertCustomerTransition } from "./transitions";

describe("assertCustomerTransition", () => {
  it("allows pending_approval -> approved", () => {
    expect(() => assertCustomerTransition("pending_approval", "approved")).not.toThrow();
  });
  it("allows pending_approval -> rejected", () => {
    expect(() => assertCustomerTransition("pending_approval", "rejected")).not.toThrow();
  });
  it("rejects approving a post that is not pending_approval", () => {
    expect(() => assertCustomerTransition("draft", "approved")).toThrow();
    expect(() => assertCustomerTransition("approved", "approved")).toThrow();
    expect(() => assertCustomerTransition("succeeded", "rejected")).toThrow();
  });
  it("rejects transitions to operator-only states", () => {
    // @ts-expect-error customers may never target these
    expect(() => assertCustomerTransition("pending_approval", "succeeded")).toThrow();
  });
});
