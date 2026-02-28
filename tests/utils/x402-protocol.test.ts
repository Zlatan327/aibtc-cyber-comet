import { describe, it, expect } from "vitest";
import {
  generatePaymentId,
  buildPaymentIdentifierExtension,
  encodePaymentPayload,
  decodePaymentPayload,
  type PaymentIdentifierExtension,
  type PaymentRequirementsV2,
  type PaymentPayloadV2,
} from "../../src/utils/x402-protocol.js";

/** Minimal PaymentRequirementsV2 for constructing test payloads */
function makeAccepted(): PaymentRequirementsV2 {
  return {
    scheme: "exact",
    network: "stacks:1",
    amount: "1000000",
    asset: "STX",
    payTo: "SP2PABAF9FTAJYNFZH93XENAJ8FVY99RRM50D2JG9",
    maxTimeoutSeconds: 60,
  };
}

describe("generatePaymentId", function () {
  it("should return a string starting with pay_", function () {
    const id = generatePaymentId();
    expect(id.startsWith("pay_")).toBe(true);
  });

  it("should have the correct total length (36 chars: 4 prefix + 32 hex)", function () {
    const id = generatePaymentId();
    expect(id.length).toBe(36);
  });

  it("should only contain valid characters [a-zA-Z0-9_-]", function () {
    const id = generatePaymentId();
    expect(/^[a-zA-Z0-9_-]+$/.test(id)).toBe(true);
  });

  it("should return unique ids on successive calls", function () {
    const id1 = generatePaymentId();
    const id2 = generatePaymentId();
    expect(id1).not.toBe(id2);
  });

  it("should pass relay validation rules (16-128 chars)", function () {
    const id = generatePaymentId();
    expect(id.length).toBeGreaterThanOrEqual(16);
    expect(id.length).toBeLessThanOrEqual(128);
  });
});

describe("buildPaymentIdentifierExtension", function () {
  it("should return an object with payment-identifier key", function () {
    const id = generatePaymentId();
    const ext = buildPaymentIdentifierExtension(id);
    expect(ext).toHaveProperty("payment-identifier");
  });

  it("should nest the id under info", function () {
    const id = generatePaymentId();
    const ext = buildPaymentIdentifierExtension(id);
    expect(ext["payment-identifier"]).toHaveProperty("info");
    expect(ext["payment-identifier"].info).toHaveProperty("id");
  });

  it("should preserve the provided id exactly", function () {
    const id = generatePaymentId();
    const ext = buildPaymentIdentifierExtension(id);
    expect(ext["payment-identifier"].info.id).toBe(id);
  });
});

describe("round-trip encoding with PaymentPayloadV2", function () {
  it("should encode and decode a payload with payment-identifier extension", function () {
    const id = generatePaymentId();
    const ext = buildPaymentIdentifierExtension(id);

    const payload: PaymentPayloadV2 = {
      x402Version: 2,
      accepted: makeAccepted(),
      payload: { transaction: "0xdeadbeef" },
      extensions: ext,
    };

    const encoded = encodePaymentPayload(payload);
    const decoded = decodePaymentPayload(encoded);

    expect(decoded).not.toBeNull();
    expect(decoded?.extensions).toHaveProperty("payment-identifier");

    const decodedExt = decoded?.extensions?.[
      "payment-identifier"
    ] as PaymentIdentifierExtension["payment-identifier"];
    expect(decodedExt?.info?.id).toBe(id);
    expect(decodedExt?.info?.id.startsWith("pay_")).toBe(true);
  });
});
