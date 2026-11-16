import { Link } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CopyButton } from "@/client/features/ai-mcp/SetupControls";
import { CardShell } from "@/client/features/dashboard/cardParts";
import { captureClientEvent } from "@/client/lib/posthog";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import type { DashboardActivation } from "@/server/features/dashboard/services/DashboardService";
import { dismissDashboardMcpCard } from "@/serverFunctions/dashboard";

export function McpConnectCard({
  projectId,
  activation,
}: {
  projectId: string;
  activation: DashboardActivation;
}) {
  const client = useQueryClient();
  const dismiss = useMutation({
    mutationFn: () => dismissDashboardMcpCard({ data: { projectId } }),
    onSuccess: () =>
      client.invalidateQueries({
        queryKey: ["dashboardActivation", projectId],
      }),
  });
  if (activation.mcp.firstToolCallAt || activation.mcp.cardDismissedAt)
    return null;
  const connected = Boolean(activation.mcp.authorizedAt);
  const prompt = `Use OpenSEO to review the saved keyword research for ${activation.domain ?? "my site"}.`;
  return (
    <CardShell
      title="AI agent"
      action={
        <button
          type="button"
          className="btn btn-ghost btn-xs"
          aria-label="Hide AI agent suggestion"
          disabled={dismiss.isPending}
          onClick={() => {
            captureClientEvent("dashboard:mcp_already_connected");
            dismiss.mutate();
          }}
        >
          Hide
        </button>
      }
    >
      {connected ? (
        <>
          <p className="text-sm">Authorised. Try this prompt in your agent:</p>
          <div className="mt-2 flex items-center justify-between gap-2 rounded-md bg-base-200 px-3 py-2">
            <span className="text-sm">{prompt}</span>
            <CopyButton
              value={prompt}
              successMessage="Prompt copied"
              iconOnly
              onCopy={() => captureClientEvent("dashboard:mcp_prompt_copy")}
            />
          </div>
        </>
      ) : (
        <>
          <p className="text-sm text-base-content/75">
            Use OpenSEO tools from an agent that supports MCP.
          </p>
          <Link
            to="/ai"
            className="btn btn-sm mt-3"
            onClick={() => captureClientEvent("dashboard:mcp_setup_open")}
          >
            Connect an agent
          </Link>
        </>
      )}
      {dismiss.isError && (
        <p className="mt-2 text-sm" role="alert">
          {getStandardErrorMessage(
            dismiss.error,
            "Could not hide this suggestion.",
          )}
        </p>
      )}
    </CardShell>
  );
}
