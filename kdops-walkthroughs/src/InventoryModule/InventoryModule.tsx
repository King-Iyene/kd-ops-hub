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
  icon: "📦",
  title: "Inventory Management",
  subtitle: "Track stock levels, manage purchase orders, and monitor inventory movements",
  tag: "Module 81 · Inventory",
});

const CardsSceneComp = makeCardsScene({
  label: "OVERVIEW",
  labelColor: COLORS.green,
  title: "Inventory Dashboard",
  cards: [
    { title: "Total SKUs", desc: "Items in catalogue", icon: "🏷️", value: "384" },
    { title: "Low Stock Alerts", desc: "Below reorder point", icon: "⚠️", value: "12" },
    { title: "Purchase Orders", desc: "Open this month", icon: "📋", value: "8" },
    { title: "Stock Value", desc: "Total inventory worth", icon: "💰", value: "₦18.7M" },
    { title: "Items Received", desc: "This week", icon: "📥", value: "45" },
    { title: "Items Issued", desc: "This week", icon: "📤", value: "62" },
  ],
});

const StepsScene = makeStepsScene({
  label: "PURCHASE ORDER",
  labelColor: COLORS.accent,
  title: "Creating a Purchase Order",
  steps: [
    { num: "1", title: "Select Items", desc: "Choose items from the catalogue or add new ones" },
    { num: "2", title: "Choose Vendor", desc: "Select a registered vendor and confirm pricing" },
    { num: "3", title: "Set Quantities", desc: "Enter order quantities and expected delivery date" },
    { num: "4", title: "Submit for Approval", desc: "Route the PO to the procurement manager" },
  ],
  formTitle: "New Purchase Order",
  formFields: [
    { label: "PO Number", value: "PO-2026-0089" },
    { label: "Vendor", value: "Dangote Supplies Ltd" },
    { label: "Items", value: "6 line items" },
    { label: "Total Amount", value: "₦2,450,000" },
    { label: "Delivery Date", value: "20 Sep 2026" },
    { label: "Warehouse", value: "Lagos Main Store" },
  ],
});

const TroubleshootScene = makeTroubleshootScene("Inventory Troubleshooting", [
  { problem: "Stock count mismatch", solution: "Run a stock reconciliation from the Inventory menu", fallback: "Conduct a physical count and update quantities manually", icon: "🔢" },
  { problem: "PO stuck in approval", solution: "Check if the approver has the procurement role", fallback: "Reassign the PO to an available approver", icon: "⏳" },
  { problem: "Item not in catalogue", solution: "Add the item via Inventory > Item Catalogue > New Item", fallback: "Import items in bulk using the CSV upload template", icon: "🏷️" },
  { problem: "Duplicate stock entries", solution: "Merge duplicate SKUs from the Item Management page", fallback: "Archive the duplicate and transfer its stock balance", icon: "📋" },
]);

const OutroScene = makeOutroScene({
  icon: "📦",
  title: "Inventory Management",
  subtitle: "Full visibility into stock levels and procurement",
  upNext: ["Procurement Module"],
});

export const InventoryModule: React.FC = () => {
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
        <TransitionSeries.Sequence durationInFrames={15 * fps} name="PurchaseOrder">
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
