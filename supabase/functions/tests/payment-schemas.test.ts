import { assertEquals } from "https://deno.land/std@0.192.0/testing/asserts.ts";
import { paymentSchema, withdrawalSchema } from "../_shared/payment_schemas.ts";

const UUID = "123e4567-e89b-12d3-a456-426614174000";

Deno.test("Payment schema accepts a valid request", () => {
  const result = paymentSchema.safeParse({
    amount: 15000,
    operator: "mtn",
    rent_period_id: UUID,
    phone_number: "0123456789",
    idempotency_key: UUID,
  });
  assertEquals(result.success, true);
});

Deno.test("Payment schema rejects amounts above the transaction cap", () => {
  const result = paymentSchema.safeParse({
    amount: 500000,
    operator: "moov",
    rent_period_id: UUID,
    phone_number: "0123456789",
  });
  assertEquals(result.success, false);
  if (!result.success) {
    assertEquals(result.error.errors[0].message, "Le plafond maximal par transaction est de 300 000 FCFA.");
  }
});

Deno.test("Payment schema rejects malformed phone numbers and unsupported operators", () => {
  const malformedPhone = paymentSchema.safeParse({
    amount: 15000,
    operator: "mtn",
    rent_period_id: UUID,
    phone_number: "123",
  });
  const unsupportedOperator = paymentSchema.safeParse({
    amount: 15000,
    operator: "orange",
    rent_period_id: UUID,
    phone_number: "0123456789",
  });
  assertEquals(malformedPhone.success, false);
  assertEquals(unsupportedOperator.success, false);
});

Deno.test("Withdrawal schema accepts the production authorization payload", () => {
  const result = withdrawalSchema.safeParse({
    wallet_id: UUID,
    authorization_id: "223e4567-e89b-12d3-a456-426614174000",
    pin: "1234",
    idempotency_key: "323e4567-e89b-12d3-a456-426614174000",
  });
  assertEquals(result.success, true);
});

Deno.test("Withdrawal schema requires an authorization, a numeric PIN and an idempotency key", () => {
  const missingAuthorization = withdrawalSchema.safeParse({
    wallet_id: UUID,
    pin: "1234",
    idempotency_key: "323e4567-e89b-12d3-a456-426614174000",
  });
  const invalidPin = withdrawalSchema.safeParse({
    wallet_id: UUID,
    authorization_id: "223e4567-e89b-12d3-a456-426614174000",
    pin: "12a4",
    idempotency_key: "323e4567-e89b-12d3-a456-426614174000",
  });
  const missingIdempotency = withdrawalSchema.safeParse({
    wallet_id: UUID,
    authorization_id: "223e4567-e89b-12d3-a456-426614174000",
    pin: "1234",
  });
  assertEquals(missingAuthorization.success, false);
  assertEquals(invalidPin.success, false);
  assertEquals(missingIdempotency.success, false);
});
