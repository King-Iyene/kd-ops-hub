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
  icon: "📖",
  title: "Knowledge Base",
  subtitle: "Build your company wiki with articles, categories, and powerful search",
  tag: "Module 51 · Knowledge Base",
});

const CardsSceneComp = makeCardsScene({
  label: "OVERVIEW",
  labelColor: COLORS.green,
  title: "Knowledge Library",
  cards: [
    { title: "Published Articles", desc: "Live in the wiki", icon: "📝", value: "142" },
    { title: "Categories", desc: "Organised topics", icon: "📂", value: "18" },
    { title: "Monthly Readers", desc: "Unique staff views", icon: "👁️", value: "1,240" },
    { title: "Avg. Read Time", desc: "Per article", icon: "⏱️", value: "3.2 min" },
    { title: "Contributors", desc: "Active authors", icon: "✍️", value: "27" },
    { title: "Search Queries", desc: "This month", icon: "🔍", value: "860" },
  ],
});

const StepsScene = makeStepsScene({
  label: "CREATE ARTICLE",
  labelColor: COLORS.accent,
  title: "Publishing an Article",
  steps: [
    { num: "1", title: "Choose Category", desc: "Select or create a category for your article" },
    { num: "2", title: "Write Content", desc: "Use the rich editor with images, tables, and code blocks" },
    { num: "3", title: "Set Permissions", desc: "Control who can view — by department or role" },
    { num: "4", title: "Publish & Notify", desc: "Go live and alert relevant teams" },
  ],
  formTitle: "New Article",
  formFields: [
    { label: "Title", value: "Expense Policy Update 2026" },
    { label: "Category", value: "Finance & Admin" },
    { label: "Author", value: "Ngozi Okafor" },
    { label: "Visibility", value: "All Staff" },
    { label: "Tags", value: "policy, expenses, travel" },
    { label: "Status", value: "Draft" },
  ],
});

const TroubleshootScene = makeTroubleshootScene("Knowledge Base Troubleshooting", [
  { problem: "Article not appearing in search", solution: "Re-index the article from the admin panel", fallback: "Check if the article status is set to Published", icon: "🔍" },
  { problem: "Cannot edit someone else's article", solution: "Request editor access from the article owner", fallback: "Ask an admin to grant you contributor rights", icon: "🔒" },
  { problem: "Images not loading", solution: "Re-upload images — max file size is 5 MB", fallback: "Use compressed formats like WebP or JPEG", icon: "🖼️" },
  { problem: "Category is missing", solution: "Only admins can create top-level categories", fallback: "Request a new category via the Settings page", icon: "📂" },
]);

const OutroScene = makeOutroScene({
  icon: "📖",
  title: "Knowledge Base",
  subtitle: "Empower your team with a centralised source of truth",
  upNext: ["Communications Hub"],
});

export const KnowledgeBase: React.FC = () => {
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
        <TransitionSeries.Sequence durationInFrames={15 * fps} name="CreateArticle">
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
