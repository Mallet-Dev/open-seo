import { z } from "zod";

export function functionName(url: string) {
  try {
    const segment =
      new URL(url, "http://fixture").pathname.split("/").pop() ?? "";
    return z
      .object({ export: z.string() })
      .parse(JSON.parse(Buffer.from(segment, "base64url").toString())).export;
  } catch {
    return null;
  }
}
