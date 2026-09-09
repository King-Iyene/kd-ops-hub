import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { useVideoConfig, AbsoluteFill } from "remotion";
import { makeIntroScene } from "../shared/makeIntroScene";
import { makeTableScene, makeStepsScene } from "../shared/makeContentScene";
import { makeTroubleshootScene } from "../shared/makeTroubleshootScene";
import { makeOutroScene } from "../shared/makeOutroScene";
import { COLORS } from "../WelcomeToKDOps/theme";

const IntroScene = makeIntroScene({
  icon: "🏪",
  title: "Vendor Management",
  subtitle:
    "Track all your vendors, contracts, and purchase orders in one place",
  tag: "Module 42 · Vendors",
});

const TableSceneComp = makeTableScene({
  label: "DIRECTORY",
  labelColor: COLORS.accent,
  title: "Vendor Directory",
  headers: ["Vendor", "Category", "Contract Value", "Status", "Rating"],
  rows: [
    ["Dangote Industries", "Raw Materials", "₦15.2M", "Active", "★★★★★"],
    ["GTBank Plc", "Banking Services", "₦2.4M", "Active", "★★★★☆"],
    ["MainOne Cable", "Internet/Telecom", "₦1.8M", "Active", "★★★★☆"],
    ["Jumia Nigeria", "Office Supplies", "₦890K", "Active", "★★★☆☆"],
    ["Andela Nigeria", "IT Staffing", "₦6.5M", "Under Review", "★★★★★"],
  ],
});

const StepsScene = makeStepsScene({
  label: "ADD VENDOR",
  labelColor: COLORS.green,
  title: "Adding a Vendor",
  steps: [
    { num: "1", title: "Company Details", desc: "Enter vendor name, category, and registration number" },
    { num: "2", title: "Contact Info", desc: "Add contact person, email, and phone number" },
    { num: "3", title: "Contract Terms", desc: "Set contract start/end dates and value in NGN" },
    { num: "4", title: "Submit for Approval", desc: "Route to procurement for review and approval" },
  ],
  formTitle: "New Vendor",
  formFields: [
    { label: "Company Name", value: "Stallion Group Nigeria" },
    { label: "Category", value: "Logistics" },
    { label: "Contact Person", value: "Chidi Okonkwo" },
    { label: "Email", value: "chidi@stalliongroup.ng" },
    { label: "Phone", value: "+234 812 345 6789" },
    { label: "Contract Value", value: "₦4,200,000" },
  ],
});

const TroubleshootScene = makeTroubleshootScene("Vendor Troubleshooting", [
  { problem: "Duplicate vendor in directory", solution: "Use Merge Vendors to combine duplicate entries", fallback: "Deactivate the duplicate and update references", icon: "📋" },
  { problem: "Missing contract document", solution: "Upload the contract in the vendor's Documents tab", fallback: "Request the document from procurement team", icon: "📄" },
  { problem: "Payment issues with vendor", solution: "Check the vendor's bank details and payment terms", fallback: "Contact accounts payable to verify the payment batch", icon: "💳" },
  { problem: "Vendor rating not updating", solution: "Ensure performance reviews are submitted for the period", fallback: "Manually update the rating in the vendor profile", icon: "⭐" },
]);

const OutroScene = makeOutroScene({
  icon: "🏪",
  title: "Vendor Management",
  subtitle: "All your vendor relationships managed in one place",
  upNext: ["Asset Management"],
});

export const VendorManagement: React.FC = () => {
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill>
      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={16 * fps} name="Intro">
          <IntroScene />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })} />
        <TransitionSeries.Sequence durationInFrames={15 * fps} name="Directory">
          <TableSceneComp />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={slide({ direction: "from-right" })} timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })} />
        <TransitionSeries.Sequence durationInFrames={15 * fps} name="AddVendor">
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
