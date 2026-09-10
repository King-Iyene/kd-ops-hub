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
  icon: "📇",
  title: "Contacts Directory",
  subtitle: "Manage external contacts — clients, vendors, partners, and more",
  tag: "Module 53 · Contacts",
});

const CardsSceneComp = makeCardsScene({
  label: "OVERVIEW",
  labelColor: COLORS.green,
  title: "Contact Management",
  cards: [
    { title: "Total Contacts", desc: "In your directory", icon: "👤", value: "1,847" },
    { title: "Clients", desc: "Active client records", icon: "🤝", value: "312" },
    { title: "Vendors", desc: "Registered suppliers", icon: "🏭", value: "158" },
    { title: "Partners", desc: "Strategic alliances", icon: "🔗", value: "43" },
    { title: "Recently Added", desc: "This month", icon: "🆕", value: "29" },
    { title: "Duplicates Found", desc: "Pending merge", icon: "⚠️", value: "7" },
  ],
});

const StepsScene = makeStepsScene({
  label: "ADD CONTACT",
  labelColor: COLORS.accent,
  title: "Adding a Contact",
  steps: [
    { num: "1", title: "Enter Details", desc: "Name, company, phone, email, and address" },
    { num: "2", title: "Set Category", desc: "Classify as client, vendor, partner, or other" },
    { num: "3", title: "Link to Projects", desc: "Associate with existing projects or invoices" },
    { num: "4", title: "Save & Share", desc: "Save the record and share with your team" },
  ],
  formTitle: "New Contact",
  formFields: [
    { label: "Full Name", value: "Adaeze Obi" },
    { label: "Company", value: "Zenith Logistics Ltd" },
    { label: "Phone", value: "+234 803 456 7890" },
    { label: "Email", value: "adaeze@zenithlog.ng" },
    { label: "Category", value: "Client" },
    { label: "Location", value: "Lagos, Nigeria" },
  ],
});

const TroubleshootScene = makeTroubleshootScene("Contacts Troubleshooting", [
  { problem: "Duplicate contacts appearing", solution: "Use the Merge tool to combine duplicate records", fallback: "Export contacts, de-duplicate in Excel, and re-import", icon: "👥" },
  { problem: "Cannot edit a shared contact", solution: "Only the contact owner or an admin can edit", fallback: "Request edit access from the record owner", icon: "🔒" },
  { problem: "Import failing for CSV", solution: "Ensure columns match the template headers exactly", fallback: "Download the sample CSV and re-format your data", icon: "📄" },
  { problem: "Contact not linked to project", solution: "Open the contact and use Link to Project", fallback: "Link from the project side under External Contacts", icon: "🔗" },
]);

const OutroScene = makeOutroScene({
  icon: "📇",
  title: "Contacts Directory",
  subtitle: "Your single source of truth for every external relationship",
  upNext: ["Messaging Module"],
});

export const ContactsDirectory: React.FC = () => {
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
        <TransitionSeries.Sequence durationInFrames={15 * fps} name="AddContact">
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
