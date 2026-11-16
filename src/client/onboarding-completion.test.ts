import { QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";
import { queryClient } from "@/client/tanstack-db";
import { Route } from "@/routes/_authenticated.onboarding.index";

const calls = vi.hoisted(() => ({
  save: vi.fn(),
  navigate: vi.fn(),
  event: vi.fn(),
  message: vi.fn(),
  form: vi.fn(
    (_props: {
      step: number;
      answers: { selectedInterests: string[] };
      onFinish: () => Promise<void>;
    }) => null,
  ),
}));

vi.mock(import("@tanstack/react-router"), async (actual) => ({
  ...(await actual()),
  useNavigate: () => calls.navigate,
}));
vi.mock("@/client/tanstack-db", async () => {
  const { QueryClient } = await import("@tanstack/react-query");
  return { queryClient: new QueryClient() };
});
vi.mock("@/client/features/onboarding/PostSignupOnboarding", () => ({
  PostSignupOnboarding: calls.form,
}));
vi.mock("@/client/features/onboarding/OnboardingAccountMenu", () => ({
  OnboardingAccountMenu: () => null,
}));
vi.mock("@/lib/auth-client", () => ({ useSession: () => ({ data: null }) }));
vi.mock("@/client/lib/posthog", () => ({ captureClientEvent: calls.event }));
vi.mock("@/serverFunctions/onboarding", () => ({
  getOnboardingAnswers: vi.fn(),
  saveOnboardingAnswers: calls.save,
}));
vi.mock("sonner", () => ({ toast: { error: calls.message } }));

test("a failed onboarding finish keeps the answers available for one successful retry", async () => {
  const Page = Route.options.component;
  if (!Page) throw new Error("Onboarding page is missing");
  vi.spyOn(Route, "useSearch").mockReturnValue({ step: 3 });
  vi.spyOn(console, "error").mockImplementation(() => {});
  queryClient.setQueryData(["onboardingAnswers"], {
    completedAt: null,
    userCreatedAt: null,
    answers: { interestedFeatures: ["Keyword research"] },
  });
  const refresh = vi.spyOn(queryClient, "invalidateQueries");
  try {
    renderToStaticMarkup(
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(Page),
      ),
    );
    const [form] = calls.form.mock.lastCall ?? [];
    if (!form) throw new Error("Onboarding form did not render");
    expect(form.step).toBe(3);
    calls.save
      .mockRejectedValueOnce(new Error("Save unavailable"))
      .mockResolvedValueOnce({ ok: true });

    await form.onFinish();
    expect(calls.navigate).not.toHaveBeenCalled();
    expect(calls.event).not.toHaveBeenCalled();
    expect(calls.message).toHaveBeenCalledWith(
      expect.stringMatching(/could not be saved/i),
    );
    expect(form.answers.selectedInterests).toEqual(["Keyword research"]);
    expect(refresh).not.toHaveBeenCalled();

    await form.onFinish();
    expect(calls.save.mock.calls).toHaveLength(2);
    expect(calls.save.mock.calls[0]).toEqual(calls.save.mock.calls[1]);
    expect(calls.save.mock.calls[1]).toMatchObject([
      { data: { completed: true, interestedFeatures: ["Keyword research"] } },
    ]);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(calls.event).toHaveBeenCalledExactlyOnceWith(
      "onboarding:completed",
      expect.any(Object),
    );
    expect(calls.navigate).toHaveBeenCalledExactlyOnceWith({
      to: "/",
      replace: true,
    });
  } finally {
    queryClient.clear();
  }
});
