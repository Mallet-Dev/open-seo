import { mapsPointTask, prepareMapsSpec } from "@/shared/maps-collection";
import { fetchBacklinksSummary, postMapsTask } from "./sections";
import { MapsTaskSubmissionError } from "./client";
/* eslint-disable max-lines */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AUTUMN_SEO_DATA_BALANCE_FEATURE_ID,
  AUTUMN_SEO_DATA_CREDITS_PER_USD,
  AUTUMN_SEO_DATA_TOPUP_BALANCE_FEATURE_ID,
  SEO_DATA_COST_MARKUP,
} from "@/shared/billing";

interface TrackCallArg {
  customerId: string;
  featureId: string;
  value: number;
  properties?: { balanceFeatureId: string };
}

const { checkMock, trackMock, getOrCreateMock, isHostedServerAuthModeMock } =
  vi.hoisted(() => ({
    checkMock: vi.fn(),
    trackMock: vi.fn<(arg: TrackCallArg) => void>(),
    getOrCreateMock: vi.fn(),
    isHostedServerAuthModeMock: vi.fn(),
  }));

vi.mock("cloudflare:workers", () => ({
  waitUntil: vi.fn(),
}));

vi.mock("@/server/billing/autumn", () => ({
  autumn: {
    check: checkMock,
    track: trackMock,
  },
  AUTUMN_TRACK_RETRY_OPTIONS: {},
}));

// Keep the real subscription module (its assertUsageCreditsAvailable calls the
// mocked autumn.check) and only stub the customer lookup, so the balance-assert
// logic stays exercised through these tests after it moved out of client.ts.
vi.mock("@/server/billing/subscription", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    getOrCreateOrganizationCustomer: getOrCreateMock,
  };
});

vi.mock("@/server/lib/runtime-env", () => ({
  isHostedServerAuthMode: isHostedServerAuthModeMock,
}));

vi.mock("@/server/lib/posthog", () => ({
  captureServerEvent: vi.fn(),
}));

// These billing tests exercise two operations. Mock the section boundary so
// importing another provider cannot start its SDK during a balance check.
vi.mock("@/server/lib/dataforseo/sections", () => ({
  fetchBacklinksSummary: vi.fn(),
  postMapsTask: vi.fn(),
}));

import {
  createDataforseoClient,
  mapDataforseoPathToCreditFeature,
} from "@/server/lib/dataforseo/client";
import { DataforseoChargedTaskError } from "@/server/lib/dataforseo/envelope";

const billingCustomer = {
  organizationId: "org_123",
  userId: "user_123",
  userEmail: "alice@example.com",
};

const backlinksInput = {
  target: "example.com",
};

function setupHostedMode() {
  isHostedServerAuthModeMock.mockResolvedValue(true);
  getOrCreateMock.mockResolvedValue({ id: "org_123" });
}

function mockBalances(monthly: number, topup: number) {
  checkMock.mockImplementation(async (args: { featureId: string }) => {
    if (args.featureId === AUTUMN_SEO_DATA_BALANCE_FEATURE_ID) {
      return { allowed: true, balance: { remaining: monthly } };
    }
    if (args.featureId === AUTUMN_SEO_DATA_TOPUP_BALANCE_FEATURE_ID) {
      return { allowed: true, balance: { remaining: topup } };
    }
    return { allowed: false, balance: null };
  });
}

function mockDataforseoResult(costUsd: number) {
  vi.mocked(fetchBacklinksSummary).mockResolvedValue({
    data: { rank: 42 },
    billing: { costUsd, path: ["backlinks", "summary"] },
  });
}

describe("meterDataforseoCall with split balances", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("skips billing in non-hosted mode", async () => {
    isHostedServerAuthModeMock.mockResolvedValue(false);
    mockDataforseoResult(0.05);

    const client = createDataforseoClient(billingCustomer);
    const result = await client.backlinks.summary(backlinksInput);

    expect(result).toEqual({ rank: 42 });
    expect(checkMock).not.toHaveBeenCalled();
    expect(trackMock).not.toHaveBeenCalled();
  });

  it("checks both monthly and topup balances in parallel", async () => {
    setupHostedMode();
    mockBalances(5000, 3000);
    mockDataforseoResult(0.05);

    const client = createDataforseoClient(billingCustomer);
    await client.backlinks.summary(backlinksInput);

    expect(checkMock).toHaveBeenCalledTimes(2);
    expect(checkMock).toHaveBeenCalledWith({
      customerId: "org_123",
      featureId: AUTUMN_SEO_DATA_BALANCE_FEATURE_ID,
    });
    expect(checkMock).toHaveBeenCalledWith({
      customerId: "org_123",
      featureId: AUTUMN_SEO_DATA_TOPUP_BALANCE_FEATURE_ID,
    });
  });

  const RAW_COST = 0.05;
  const EXPECTED_CREDITS = Math.ceil(
    RAW_COST * SEO_DATA_COST_MARKUP * AUTUMN_SEO_DATA_CREDITS_PER_USD,
  );

  it("refuses a priced call when combined positive balances are below its estimate", async () => {
    setupHostedMode();
    mockBalances(10, 20);
    await expect(
      createDataforseoClient(billingCustomer).backlinks.summary({
        ...backlinksInput,
        minimumCredits: 31,
      }),
    ).rejects.toMatchObject({ code: "INSUFFICIENT_CREDITS" });
    expect(fetchBacklinksSummary).not.toHaveBeenCalled();
  });

  it("deducts entirely from monthly when monthly has enough", async () => {
    setupHostedMode();
    mockBalances(5000, 3000);
    mockDataforseoResult(RAW_COST);

    const client = createDataforseoClient(billingCustomer);
    await client.backlinks.summary(backlinksInput);

    expect(trackMock).toHaveBeenCalledTimes(1);
    expect(trackMock).toHaveBeenCalledWith(
      expect.objectContaining({
        customerId: "org_123",
        featureId: AUTUMN_SEO_DATA_BALANCE_FEATURE_ID,
        value: EXPECTED_CREDITS,
      }),
      expect.anything(),
    );
  });

  it("deducts entirely from topup when monthly is empty", async () => {
    setupHostedMode();
    mockBalances(0, 5000);
    mockDataforseoResult(RAW_COST);

    const client = createDataforseoClient(billingCustomer);
    await client.backlinks.summary(backlinksInput);

    expect(trackMock).toHaveBeenCalledTimes(1);
    expect(trackMock).toHaveBeenCalledWith(
      expect.objectContaining({
        customerId: "org_123",
        featureId: AUTUMN_SEO_DATA_TOPUP_BALANCE_FEATURE_ID,
        value: EXPECTED_CREDITS,
      }),
      expect.anything(),
    );
  });

  it("splits deduction across monthly and topup when monthly is partially sufficient", async () => {
    setupHostedMode();
    const monthlyAvailable = 30;
    mockBalances(monthlyAvailable, 5000);
    mockDataforseoResult(RAW_COST);

    const client = createDataforseoClient(billingCustomer);
    await client.backlinks.summary(backlinksInput);

    expect(trackMock).toHaveBeenCalledTimes(2);
    expect(trackMock).toHaveBeenCalledWith(
      expect.objectContaining({
        customerId: "org_123",
        featureId: AUTUMN_SEO_DATA_BALANCE_FEATURE_ID,
        value: monthlyAvailable,
      }),
      expect.anything(),
    );
    expect(trackMock).toHaveBeenCalledWith(
      expect.objectContaining({
        customerId: "org_123",
        featureId: AUTUMN_SEO_DATA_TOPUP_BALANCE_FEATURE_ID,
        value: EXPECTED_CREDITS - monthlyAvailable,
      }),
      expect.anything(),
    );
  });

  it("throws INSUFFICIENT_CREDITS when both balances are exactly zero", async () => {
    setupHostedMode();
    mockBalances(0, 0);
    mockDataforseoResult(0.05);

    const client = createDataforseoClient(billingCustomer);
    await expect(
      client.backlinks.summary(backlinksInput),
    ).rejects.toMatchObject({ code: "INSUFFICIENT_CREDITS" });

    expect(trackMock).not.toHaveBeenCalled();
  });

  it("meters charged DataForSEO task errors before rethrowing", async () => {
    setupHostedMode();
    mockBalances(5000, 3000);
    vi.mocked(fetchBacklinksSummary).mockRejectedValue(
      new DataforseoChargedTaskError("DataForSEO task failed", {
        costUsd: RAW_COST,
        path: ["v3", "backlinks", "summary", "live"],
      }),
    );

    const client = createDataforseoClient(billingCustomer);
    await expect(client.backlinks.summary(backlinksInput)).rejects.toThrow(
      "DataForSEO task failed",
    );

    expect(trackMock).toHaveBeenCalledTimes(1);
    expect(trackMock).toHaveBeenCalledWith(
      expect.objectContaining({
        customerId: "org_123",
        featureId: AUTUMN_SEO_DATA_BALANCE_FEATURE_ID,
        value: EXPECTED_CREDITS,
      }),
      expect.anything(),
    );
  });

  it("skips the charge for an unbilled invalid-field failure and rethrows VALIDATION_ERROR", async () => {
    setupHostedMode();
    mockBalances(5000, 3000);
    vi.mocked(fetchBacklinksSummary).mockRejectedValue(
      new DataforseoChargedTaskError(
        "Invalid Field: 'target'.",
        { costUsd: 0, path: ["v3", "backlinks", "summary", "live"] },
        true,
      ),
    );

    const client = createDataforseoClient(billingCustomer);
    await expect(
      client.backlinks.summary(backlinksInput),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    expect(trackMock).not.toHaveBeenCalled();
  });

  it("still meters an invalid-field failure that DataForSEO actually billed", async () => {
    setupHostedMode();
    mockBalances(5000, 3000);
    vi.mocked(fetchBacklinksSummary).mockRejectedValue(
      new DataforseoChargedTaskError(
        "Invalid Field: 'target'.",
        { costUsd: RAW_COST, path: ["v3", "backlinks", "summary", "live"] },
        true,
      ),
    );

    const client = createDataforseoClient(billingCustomer);
    await expect(client.backlinks.summary(backlinksInput)).rejects.toThrow(
      "Invalid Field: 'target'.",
    );

    expect(trackMock).toHaveBeenCalledTimes(1);
    expect(trackMock).toHaveBeenCalledWith(
      expect.objectContaining({
        customerId: "org_123",
        featureId: AUTUMN_SEO_DATA_BALANCE_FEATURE_ID,
        value: EXPECTED_CREDITS,
      }),
      expect.anything(),
    );
  });

  it("includes balanceFeatureId in track properties", async () => {
    setupHostedMode();
    mockBalances(30, 5000);
    mockDataforseoResult(0.05);

    const client = createDataforseoClient(billingCustomer);
    await client.backlinks.summary(backlinksInput);

    const monthlyCall = trackMock.mock.calls.find(
      ([arg]) => arg.featureId === AUTUMN_SEO_DATA_BALANCE_FEATURE_ID,
    );
    const topupCall = trackMock.mock.calls.find(
      ([arg]) => arg.featureId === AUTUMN_SEO_DATA_TOPUP_BALANCE_FEATURE_ID,
    );

    expect(monthlyCall![0].properties?.balanceFeatureId).toBe(
      AUTUMN_SEO_DATA_BALANCE_FEATURE_ID,
    );
    expect(topupCall![0].properties?.balanceFeatureId).toBe(
      AUTUMN_SEO_DATA_TOPUP_BALANCE_FEATURE_ID,
    );
  });
});

describe("mapDataforseoPathToCreditFeature", () => {
  it("maps real keyword research paths", () => {
    expect(
      mapDataforseoPathToCreditFeature([
        "v3",
        "dataforseo_labs",
        "google",
        "related_keywords",
        "live",
      ]),
    ).toBe("keyword_research");
    expect(
      mapDataforseoPathToCreditFeature([
        "v3",
        "dataforseo_labs",
        "google",
        "keyword_suggestions",
        "live",
      ]),
    ).toBe("keyword_research");
  });

  it("maps real serp paths", () => {
    expect(
      mapDataforseoPathToCreditFeature([
        "v3",
        "serp",
        "google",
        "organic",
        "live",
        "regular",
      ]),
    ).toBe("keyword_research");
  });

  it("maps real domain paths", () => {
    expect(
      mapDataforseoPathToCreditFeature([
        "v3",
        "dataforseo_labs",
        "google",
        "domain_rank_overview",
        "live",
      ]),
    ).toBe("domain_overview");
    expect(
      mapDataforseoPathToCreditFeature([
        "v3",
        "dataforseo_labs",
        "google",
        "ranked_keywords",
        "live",
      ]),
    ).toBe("domain_overview");
    expect(
      mapDataforseoPathToCreditFeature([
        "v3",
        "dataforseo_labs",
        "google",
        "relevant_pages",
        "live",
      ]),
    ).toBe("domain_overview");
  });

  it("maps real backlinks paths", () => {
    expect(
      mapDataforseoPathToCreditFeature(["v3", "backlinks", "summary", "live"]),
    ).toBe("backlinks");
    expect(mapDataforseoPathToCreditFeature(["backlinks", "summary"])).toBe(
      "backlinks",
    );
    expect(
      mapDataforseoPathToCreditFeature([
        "v3",
        "backlinks",
        "referring_domains",
        "live",
      ]),
    ).toBe("backlinks");
  });

  it("maps real lighthouse/on_page paths to site_audit", () => {
    expect(
      mapDataforseoPathToCreditFeature([
        "v3",
        "on_page",
        "lighthouse",
        "live",
        "json",
      ]),
    ).toBe("site_audit");
  });

  it("maps ai_optimization llm_mentions paths to ai_citations", () => {
    expect(
      mapDataforseoPathToCreditFeature([
        "v3",
        "ai_optimization",
        "llm_mentions",
        "search",
        "live",
      ]),
    ).toBe("ai_citations");
    expect(
      mapDataforseoPathToCreditFeature([
        "v3",
        "ai_optimization",
        "llm_mentions",
        "aggregated_metrics",
        "live",
      ]),
    ).toBe("ai_citations");
    expect(
      mapDataforseoPathToCreditFeature([
        "v3",
        "ai_optimization",
        "llm_mentions",
        "top_pages",
        "live",
      ]),
    ).toBe("ai_citations");
  });

  it("maps ai_optimization provider llm_responses paths to ai_prompt_responses", () => {
    for (const provider of ["chat_gpt", "claude", "gemini", "perplexity"]) {
      expect(
        mapDataforseoPathToCreditFeature([
          "v3",
          "ai_optimization",
          provider,
          "llm_responses",
          "live",
        ]),
      ).toBe("ai_prompt_responses");
    }
  });

  it("maps local and supporting paths to the intended credit features", () => {
    expect(
      mapDataforseoPathToCreditFeature([
        "v3",
        "business_data",
        "business_listings",
        "search",
        "live",
      ]),
    ).toBe("local_seo");
    expect(
      mapDataforseoPathToCreditFeature([
        "v3",
        "serp",
        "google",
        "local_finder",
        "live",
        "advanced",
      ]),
    ).toBe("local_seo");
    expect(
      mapDataforseoPathToCreditFeature([
        "v3",
        "serp",
        "google",
        "maps",
        "live",
        "advanced",
      ]),
    ).toBe("local_seo");
    expect(
      mapDataforseoPathToCreditFeature([
        "v3",
        "keywords_data",
        "google_ads",
        "search_volume",
        "live",
      ]),
    ).toBe("keyword_research");
  });
});

describe("queued Maps submission recovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupHostedMode();
    mockBalances(100, 0);
    trackMock.mockResolvedValue(undefined);
    vi.mocked(postMapsTask).mockReset();
  });
  const input = mapsPointTask(
    "11000000-0000-4000-8000-000000000001",
    prepareMapsSpec({
      query: "tile",
      languageCode: "en",
      center: { latitude: 43.7, longitude: -79.4 },
    }),
    0,
  );
  const posted = {
    taskId: "00000000-0000-0000-0000-000000000001",
    tag: input.tag,
    providerCostUsd: 0.0006,
  };
  const receipt = {
    taskId: posted.taskId,
    requestTag: input.tag,
    providerTag: input.tag,
    providerStatus: 20100,
    providerCostUsd: 0.0006,
    identityVerified: true,
    returnedTaskCount: 1,
    returnedTaskIds: [posted.taskId],
  };
  function provider() {
    vi.mocked(postMapsTask).mockImplementation(async (_input, capture) => {
      capture.current = receipt;
      return {
        data: posted,
        billing: {
          path: ["v3", "serp", "google", "maps", "task_post"],
          costUsd: 0.0006,
        },
      };
    });
  }
  it("meters each point once and returns its handle", async () => {
    provider();
    expect(
      await createDataforseoClient(billingCustomer).serp.mapsTaskPost(input),
    ).toEqual(posted);
    expect(postMapsTask).toHaveBeenCalledTimes(1);
    expect(trackMock).toHaveBeenCalledTimes(1);
    expect(trackMock.mock.calls[0][0].value).toBe(1);
  });
  it("preserves the known handle when post-success billing fails without reposting", async () => {
    provider();
    trackMock.mockRejectedValueOnce(new Error("billing unavailable"));
    const error: unknown = await createDataforseoClient(billingCustomer)
      .serp.mapsTaskPost(input)
      .catch((caught: unknown) => caught);
    if (!(error instanceof MapsTaskSubmissionError))
      throw new Error("Expected Maps receipt recovery");
    expect(error).toBeInstanceOf(MapsTaskSubmissionError);
    expect(error.receipt).toEqual(receipt);
    expect(postMapsTask).toHaveBeenCalledTimes(1);
    expect(trackMock).toHaveBeenCalledTimes(1);
  });
  it("preserves an unverified receipt and still meters a charged validation failure", async () => {
    vi.mocked(postMapsTask).mockImplementation(async (_input, capture) => {
      capture.current = {
        ...receipt,
        identityVerified: false,
        providerTag: "wrong",
      };
      throw new DataforseoChargedTaskError(
        "Maps submission response could not be verified",
        {
          path: ["v3", "serp", "google", "maps", "task_post"],
          costUsd: 0.0006,
        },
      );
    });
    const error: unknown = await createDataforseoClient(billingCustomer)
      .serp.mapsTaskPost(input)
      .catch((caught: unknown) => caught);
    if (!(error instanceof MapsTaskSubmissionError))
      throw new Error("Expected Maps receipt recovery");
    expect(error).toBeInstanceOf(MapsTaskSubmissionError);
    expect(error.receipt.identityVerified).toBe(false);
    expect(trackMock).toHaveBeenCalledTimes(1);
    expect(postMapsTask).toHaveBeenCalledTimes(1);
  });
});
