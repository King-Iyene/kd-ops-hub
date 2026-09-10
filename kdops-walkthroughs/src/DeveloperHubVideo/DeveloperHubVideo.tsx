import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { useVideoConfig, AbsoluteFill } from "remotion";
import { makeIntroScene } from "../shared/makeIntroScene";
import { makeCardsScene, makeStepsScene } from "../shared/makeContentScene";
import { makeTroubleshootScene } from "../shared/makeTroubleshootScene";
import { makeOutroScene } from "../shared/makeOutroScene";
import { COLORS } from "../WelcomeToKDOps/theme";

const IntroScene = makeIntroScene({
  icon: "🛠️",
  title: "Developer Hub",
  subtitle: "API keys, webhooks, integrations, and developer documentation",
  tag: "Module 56 · Developer Hub",
});

const CardsSceneComp = makeCardsScene({
  label: "OVERVIEW",
  labelColor: COLORS.green,
  title: "Developer Resources",
  cards: [
    { title: "API Keys", desc: "Active keys issued", icon: "🔑", value: "6" },
    { title: "Webhooks", desc: "Configured endpoints", icon: "🔔", value: "9" },
    { title: "Integrations", desc: "Connected services", icon: "🔗", value: "4" },
    { title: "API Calls", desc: "This month", icon: "📡", value: "23,410" },
    { title: "Error Rate", desc: "Last 30 days", icon: "⚠️", value: "0.3%" },
    { title: "Docs Pages", desc: "Available references", icon: "📚", value: "48" },
  ],
});

const StepsScene = makeStepsScene({
  label: "CREATE API KEY",
  labelColor: COLORS.accent,
  title: "Generating an API Key",
  steps: [
    { num: "1", title: "Name Your Key", desc: "Give it a descriptive label like 'Payroll Sync'" },
    { num: "2", title: "Set Permissions", desc: "Choose read, write, or full access scopes" },
    { num: "3", title: "Set Expiry", desc: "Pick an expiration date or set to never expire" },
    { num: "4", title: "Copy & Store", desc: "Copy the key — it will not be shown again" },
  ],
  formTitle: "New API Key",
  formFields: [
    { label: "Key Name", value: "Payroll Integration" },
    { label: "Scopes", value: "read:employees, write:payroll" },
    { label: "Expiry", value: "31 Dec 2026" },
    { label: "Rate Limit", value: "1,000 req/min" },
    { label: "IP Whitelist", value: "41.190.2.0/24" },
    { label: "Created By", value: "Chukwuma Eze" },
  ],
});

const TroubleshootScene = makeTroubleshootScene("Developer Hub Troubleshooting", [
  { problem: "API returning 401 Unauthorized", solution: "Regenerate your API key and update the header", fallback: "Check that the key has the required scopes", icon: "🔑" },
  { problem: "Webhook not firing", solution: "Verify the endpoint URL is reachable and returns 200", fallback: "Check the webhook logs for delivery failures", icon: "🔔" },
  { problem: "Rate limit exceeded", solution: "Implement exponential backoff in your client", fallback: "Request a rate limit increase from your admin", icon: "🚦" },
  { problem: "Integration sync failing", solution: "Re-authenticate the connected service", fallback: "Remove and re-add the integration from scratch", icon: "🔗" },
]);

const OutroScene = makeOutroScene({
  icon: "🛠️",
  title: "Developer Hub",
  subtitle: "Build powerful integrations with the KDOps API",
  upNext: ["Platform Settings"],
});

export const DeveloperHubVideo: React.FC = () => {
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill>
      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={16 * fps} name="Intro">
          <IntroScene />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })} />
        <TransitionSeries.Sequence durationInFrames={15 * fps} name="Overview">
          <CardsSceneComp />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={slide({ direction: "from-right" })} timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })} />
        <TransitionSeries.Sequence durationInFrames={15 * fps} name="CreateAPIKey">
          <StepsScene />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })} />
        <TransitionSeries.Sequence durationInFrames={15 * fps} name="Troubleshooting">
          <TroubleshootScene />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={slide({ direction: "from-right" })} timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })} />
        <TransitionSeries.Sequence durationInFrames={14 * fps} name="Outro">
          <OutroScene />
        </TransitionSeries.Sequence>
      </TransitionSeries>
    </AbsoluteFill>
  );
};
