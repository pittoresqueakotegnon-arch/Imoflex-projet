import { z } from "npm:zod";

export const paymentSchema = z.object({
  amount: z.number().int().min(100, "Montant minimum: 100 FCFA").max(300000, "Le plafond maximal par transaction est de 300 000 FCFA."),
  operator: z.enum(["mtn", "moov", "celtiis"]),
  rent_period_id: z.string().uuid("ID de période de loyer invalide"),
  phone_number: z.string().length(10, "Le numéro de téléphone doit contenir 10 chiffres"),
  idempotency_key: z.string().uuid("Clé d'idempotence invalide").optional(),
});

export const withdrawalSchema = z.object({
  wallet_id: z.string().uuid("ID de wallet invalide"),
  authorization_id: z.string().uuid("ID d'autorisation invalide"),
  pin: z.string().length(4, "Le PIN doit contenir 4 chiffres").regex(/^[0-9]{4}$/, "Le PIN ne doit contenir que des chiffres"),
  idempotency_key: z.string().uuid("Clé d'idempotence invalide"),
});
