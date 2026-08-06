import { assertEquals } from "https://deno.land/std@0.192.0/testing/asserts.ts";
import { z } from "npm:zod";

const paymentSchema = z.object({
  amount: z.number().int().min(100, "Montant minimum: 100 FCFA").max(300000, "Le plafond maximal par transaction est de 300 000 FCFA."),
  operator: z.enum(["mtn", "moov", "celtiis"]),
  rent_period_id: z.string().uuid("ID de période de loyer invalide"),
  phone_number: z.string().length(10, "Le numéro de téléphone doit contenir 10 chiffres"),
  idempotency_key: z.string().uuid("Clé d'idempotence invalide").optional(),
});

const withdrawalSchema = z.object({
  wallet_id: z.string().uuid("ID de wallet invalide"),
  amount: z.number().int().positive("Le montant doit être supérieur à 0"),
  operator: z.enum(["mtn", "moov", "celtiis"], { errorMap: () => ({ message: "Opérateur non supporté" }) }),
  destination_phone: z.string().length(10, "Le numéro doit comporter 10 chiffres"),
});

Deno.test("Payment Schema - Valid Input", () => {
  const input = {
    amount: 15000,
    operator: "mtn",
    rent_period_id: "123e4567-e89b-12d3-a456-426614174000",
    phone_number: "0123456789",
  };
  const result = paymentSchema.safeParse(input);
  assertEquals(result.success, true);
});

Deno.test("Payment Schema - Invalid Amount (Too high)", () => {
  const input = {
    amount: 500000,
    operator: "moov",
    rent_period_id: "123e4567-e89b-12d3-a456-426614174000",
    phone_number: "0123456789",
  };
  const result = paymentSchema.safeParse(input);
  assertEquals(result.success, false);
  if (!result.success) {
    assertEquals(result.error.errors[0].message, "Le plafond maximal par transaction est de 300 000 FCFA.");
  }
});

Deno.test("Withdrawal Schema - Invalid Operator", () => {
  const input = {
    wallet_id: "123e4567-e89b-12d3-a456-426614174000",
    amount: 1000,
    operator: "orange",
    destination_phone: "0123456789",
  };
  const result = withdrawalSchema.safeParse(input);
  assertEquals(result.success, false);
});
