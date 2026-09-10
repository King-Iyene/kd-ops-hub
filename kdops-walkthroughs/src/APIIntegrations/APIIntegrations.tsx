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
  icon: "🔗",
  title: "API Integrations",
  subtitle: "Connect third-party tools, automate with Zapier, and manage webhooks seamlessly",
  tag: "Module 97 · API Integrations",
});

const CardsSceneComp = makeCardsScene({
  label: "INTEGRATIONS",
  labelColor: COLORS.green,
  title: "Integration Overview",
  cards: [
    { title: "Active Integrations", desc: "Connected services running now", icon: "🔌", value: "18" },
    { title: "Webhook Endpoints", desc: "Registered inbound/outbound hooks", icon: "🪝", value: "42" },
    { title: "API Calls (Month)", desc: "Requests processed in September", icon: "📡", value: "284K" },
    { title: "Failed Requests", desc: "Errors requiring attention", icon: "❌", value: "37" },
    { title: "Zapier Zaps", desc: "Active Zapier automations", icon: "⚡", value: "14" },
    { title: "Uptime", desc: "API availability this quarter", icon: "✅", value: "99.8%" },
  ],
});

const StepsScene = makeStepsScene({
  label: "CONNECT",
  labelColor: COLORS.accent,
  title: "Connecting an Integration",
  steps: [
    { num: "1", title: "Open Integrations Hub", desc: "Go to Settings → API & Integrations from the sidebar" },
    { num: "2", title: "Choose a Service", desc: "Browse available connectors or paste your webhook URL" },
    { num: "3", title: "Authenticate", desc: "Enter API keys or complete OAuth — credentials are encrypted" },
    { num: "4", title: "Test & Activate", desc: "Send a test payload and enable the integration" },
  ],
  formTitle: "New Integration",
  formFields: [
    { label: "Service Name", value: "Paystack Payment Gateway" },
    { label: "Type", value: "REST API — Webhook" },
    { label: "Endpoint URL", value: "https://api.paystack.co/transaction" },
    { label: "Auth Method", value: "Bearer Token (encrypted)" },
    { label: "Trigger Event", value: "Payment Completed" },
    { label: "Status", value: "Active — last sync 2 min ago" },
  ],
});

const TroubleshootScene = makeTroubleshootScene("Integration Troubleshooting", [
  { problem: "Webhook not firing", solution: "Verify the endpoint URL is correct and the event trigger is enabled", fallback: "Check the webhook logs for error codes and retry manually", icon: "🪝" },
  { problem: "Authentication failing", solution: "Regenerate your API key and update it in KDOps settings", fallback: "Ensure the third-party service has not revoked access", icon: "🔐" },
  { problem: "Data not syncing", solution: "Check field mappings — mismatched types cause silent failures", fallback: "Enable debug mode in the integration settings to see raw payloads", icon: "🔄" },
  { problem: "Rate limit exceeded", solution: "Reduce polling frequency or batch your API calls", fallback: "Contact the service provider to request a higher rate limit", icon: "🚦" },
]);

const OutroScene = makeOutroScene({
  icon: "🔗",
  title: "API Integrations",
  subtitle: "Connect everything — automate anything",
  upNext: ["Mobile App Guide"],
});

export const APIIntegrations: React.FC = () => {
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
        <TransitionSeries.Sequence durationInFrames={15 * fps} name="Steps">
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
