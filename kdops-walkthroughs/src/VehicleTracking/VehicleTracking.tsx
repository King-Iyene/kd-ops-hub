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
  icon: "🚗",
  title: "Vehicle Tracking",
  subtitle: "Module 92 · GPS tracking, maintenance logs & driver assignments",
  tag: "Operations · Fleet",
});

const CardsSceneComp = makeCardsScene({
  label: "Fleet at a Glance",
  labelColor: COLORS.green,
  title: "Key Metrics",
  cards: [
    { title: "Total Vehicles", desc: "Registered vehicles in the company fleet", icon: "🚐", value: "48 Vehicles" },
    { title: "Active Trips", desc: "Vehicles currently on assigned trips", icon: "📍", value: "12 Active" },
    { title: "Maintenance Due", desc: "Vehicles with upcoming scheduled servicing", icon: "🔧", value: "7 Due" },
    { title: "Fuel Spend", desc: "Total fleet fuel expenditure this month", icon: "⛽", value: "₦3.6M/mo" },
    { title: "Assigned Drivers", desc: "Drivers with current vehicle assignments", icon: "👤", value: "39 Drivers" },
    { title: "Avg Mileage", desc: "Average monthly kilometres per vehicle", icon: "📏", value: "2,840 km" },
  ],
});

const StepsScene = makeStepsScene({
  label: "Step-by-Step",
  labelColor: COLORS.accent,
  title: "Assigning a Vehicle to a Driver",
  steps: [
    { num: 1, title: "Select Vehicle", desc: "Search the fleet register by plate number or asset tag" },
    { num: 2, title: "Choose Driver", desc: "Pick the driver from the approved drivers list and verify their licence" },
    { num: 3, title: "Set Trip Details", desc: "Enter the destination, expected return date and purpose of trip" },
    { num: 4, title: "Activate Tracking", desc: "Enable GPS tracking and confirm the vehicle condition checklist" },
  ],
  formTitle: "Vehicle Assignment",
  formFields: [
    { label: "Vehicle", value: "Toyota Hilux — LAG-482-KD" },
    { label: "Driver", value: "Ibrahim Musa" },
    { label: "Licence No.", value: "FG-DL-2024-09831" },
    { label: "Destination", value: "Port Harcourt Depot" },
    { label: "Return Date", value: "14 Oct 2026" },
    { label: "GPS Status", value: "Active" },
  ],
});

const TroubleshootScene = makeTroubleshootScene("Vehicle Tracking Troubleshooting", [
  { problem: "GPS location not updating", solution: "Check the tracker hardware status — the device may need a SIM data top-up", fallback: "Contact the fleet vendor to run remote diagnostics on the tracking unit", icon: "📡" },
  { problem: "Driver assignment conflict", solution: "Verify the driver is not already assigned to another active trip in the system", fallback: "Release the previous assignment or contact Admin to reassign", icon: "👥" },
  { problem: "Maintenance alert not triggering", solution: "Check the service interval settings in Fleet → Maintenance Schedules", fallback: "Manually create a maintenance request and attach the vehicle's service history", icon: "🔧" },
  { problem: "Fuel log discrepancy", solution: "Compare the fuel card transactions against the driver's submitted fuel receipts", fallback: "Flag the variance in Fleet → Fuel Reconciliation for Finance review", icon: "⛽" },
]);

const OutroScene = makeOutroScene({
  icon: "🚗",
  title: "Vehicle Tracking Complete",
  subtitle: "GPS tracking, maintenance logs and driver assignments — all in one place",
  upNext: ["Visitor Management"],
});

export const VehicleTracking: React.FC = () => {
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
