import { z } from "zod";
import { jsonCodec } from "@/shared/json";
import { mapsPostReceiptSchema } from "@/shared/maps-collection";
export const mapsRecoverySchema = z
  .object({
    scanId: z.uuid(),
    ordinal: z.number().int().nonnegative(),
    claimId: z.uuid(),
    requestHash: z.string().regex(/^[a-f0-9]{64}$/),
    billingState: z.enum(["confirmed", "uncertain"]),
    receipt: mapsPostReceiptSchema.nullable(),
  })
  .strict();
export type MapsRecovery = z.infer<typeof mapsRecoverySchema>;
export const mapsRecoveryCodec = jsonCodec(mapsRecoverySchema);
