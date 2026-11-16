import { z } from "zod";
export const analysisContextSchema = z
  .object({
    page: z
      .url()
      .refine((value) => ["http:", "https:"].includes(new URL(value).protocol))
      .optional(),
    startDate: z.iso.date().optional(),
    endDate: z.iso.date().optional(),
  })
  .superRefine((input, context) => {
    if (
      Boolean(input.startDate) !== Boolean(input.endDate) ||
      (input.startDate && input.endDate && input.startDate > input.endDate)
    )
      context.addIssue({
        code: "custom",
        message: "Choose a valid start and end date together",
      });
  });
