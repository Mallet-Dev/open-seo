import { MapsCollectionRepository as original } from "../../src/server/features/local-maps/repositories/MapsCollectionRepository.ts";
import { faults } from "./provider.ts";
export const MapsCollectionRepository = {
  ...original,
  saveReceipt: async (input: Parameters<typeof original.saveReceipt>[0]) => {
    if (faults.receiptWrite)
      throw Error("Injected receipt storage failure after accepted task");
    return original.saveReceipt(input);
  },
};
