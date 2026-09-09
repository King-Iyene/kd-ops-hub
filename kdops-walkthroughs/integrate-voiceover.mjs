import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

const FPS = 30;
const TRANS = 15; // 0.5s transition overlap in frames

// Each video: [folder, mainFile, voiceoverFolder, scenes as [id, durationSeconds]]
const VIDEOS = [
  ["WelcomeToKDOps", "WelcomeToKDOps.tsx", "01-WelcomeToKDOps", [
    ["intro", 4], ["login", 7], ["dashboard", 8], ["sidebar", 8], ["troubleshoot", 6], ["outro", 4],
  ]],
  ["DashboardDeepDive", "DashboardDeepDive.tsx", "02-DashboardDeepDive", [
    ["intro", 4], ["stat-cards", 8], ["finance", 8], ["quick-actions", 8], ["compliance", 8], ["troubleshoot", 6], ["outro", 4],
  ]],
  ["ManagingEmployees", "ManagingEmployees.tsx", "03-ManagingEmployees", [
    ["intro", 4], ["directory", 8], ["add-employee", 8], ["modules", 8], ["troubleshoot", 6], ["outro", 4],
  ]],
  ["ContractorDirectory", "ContractorDirectory.tsx", "04-ContractorDirectory", [
    ["intro", 4], ["list", 8], ["add", 8], ["troubleshoot", 6], ["outro", 4],
  ]],
  ["LeaveRequests", "LeaveRequests.tsx", "05-LeaveRequests", [
    ["intro", 4], ["balances", 7], ["request", 8], ["approve", 7], ["troubleshoot", 6], ["outro", 4],
  ]],
  ["TasksAccountability", "TasksAccountability.tsx", "06-TasksAccountability", [
    ["intro", 4], ["taskboard", 8], ["create", 8], ["troubleshoot", 6], ["outro", 4],
  ]],
  ["PaymentBatches", "PaymentBatches.tsx", "07-PaymentBatches", [
    ["intro", 4], ["overview", 8], ["create", 8], ["approval", 8], ["troubleshoot", 6], ["outro", 4],
  ]],
  ["ExpensesApprovals", "ExpensesApprovals.tsx", "08-ExpensesApprovals", [
    ["intro", 4], ["list", 8], ["submit", 8], ["approval", 8], ["troubleshoot", 6], ["outro", 4],
  ]],
  ["PayrollIntelligence", "PayrollIntelligence.tsx", "09-PayrollIntelligence", [
    ["intro", 4], ["overview", 8], ["run", 8], ["breakdown", 8], ["history", 8], ["troubleshoot", 6], ["outro", 4],
  ]],
  ["BudgetsSubscriptions", "BudgetsSubscriptions.tsx", "10-BudgetsSubscriptions", [
    ["intro", 4], ["overview", 8], ["create", 8], ["subscriptions", 8], ["troubleshoot", 6], ["outro", 4],
  ]],
  ["ComplianceCentre", "ComplianceCentre.tsx", "11-ComplianceCentre", [
    ["intro", 4], ["overview", 8], ["filing", 8], ["upload", 8], ["troubleshoot", 6], ["outro", 4],
  ]],
  ["FleetFuel", "FleetFuel.tsx", "12-FleetFuel", [
    ["intro", 4], ["fleet", 8], ["fuel", 8], ["vendor", 8], ["troubleshoot", 6], ["outro", 4],
  ]],
  ["DocsReportsAdmin", "DocsReportsAdmin.tsx", "13-DocsReportsAdmin", [
    ["intro", 4], ["documents", 8], ["reports", 8], ["admin", 8], ["troubleshoot", 6], ["outro", 4],
  ]],
];

for (const [folder, file, voFolder, scenes] of VIDEOS) {
  const filePath = join("src", folder, file);
  let content = readFileSync(filePath, "utf-8");

  // Calculate start frames for each scene (accounting for transition overlaps)
  const segments = [];
  let cumFrame = 0;
  for (let i = 0; i < scenes.length; i++) {
    const [sceneId, dur] = scenes[i];
    const durationFrames = dur * FPS;
    segments.push({
      startFrame: cumFrame,
      durationFrames,
      file: `voiceover/${voFolder}/${sceneId}.mp3`,
    });
    // Next scene starts at current + duration - transition overlap (except after last)
    if (i < scenes.length - 1) {
      cumFrame += durationFrames - TRANS;
    }
  }

  // Add import for VoiceoverTrack and AbsoluteFill if not already there
  if (!content.includes("VoiceoverTrack")) {
    // Add AbsoluteFill import from remotion if not present
    if (!content.includes("AbsoluteFill")) {
      content = content.replace(
        /from "remotion";/,
        `AbsoluteFill } from "remotion";`
      );
      // Fix: ensure it's { ..., AbsoluteFill }
      content = content.replace(
        /import \{([^}]+)\} from "remotion";/,
        (match, imports) => {
          if (!imports.includes("AbsoluteFill")) {
            return `import {${imports}, AbsoluteFill } from "remotion";`;
          }
          return match;
        }
      );
    }

    // Add VoiceoverTrack import
    const voImport = `import { VoiceoverTrack } from "../shared/VoiceoverTrack";\n`;
    // Add after last import
    const lastImportIdx = content.lastIndexOf("import ");
    const nextNewline = content.indexOf("\n", lastImportIdx);
    content = content.slice(0, nextNewline + 1) + voImport + content.slice(nextNewline + 1);

    // Generate segments array as string
    const segStr = JSON.stringify(segments, null, 4)
      .replace(/"startFrame"/g, "startFrame")
      .replace(/"durationFrames"/g, "durationFrames")
      .replace(/"file"/g, "file");

    // Add voiceover segments constant before the component
    const exportIdx = content.indexOf("export const");
    const voConst = `const voSegments = ${segStr};\n\n`;
    content = content.slice(0, exportIdx) + voConst + content.slice(exportIdx);

    // Wrap TransitionSeries with AbsoluteFill and add VoiceoverTrack
    // Replace the return ( <TransitionSeries> ... </TransitionSeries> ) pattern
    content = content.replace(
      /return \(\s*\n(\s*)<TransitionSeries>/,
      `return (\n$1<AbsoluteFill>\n$1<TransitionSeries>`
    );
    content = content.replace(
      /<\/TransitionSeries>\s*\n(\s*)\);/,
      `</TransitionSeries>\n$1<VoiceoverTrack segments={voSegments} />\n$1</AbsoluteFill>\n$1);`
    );
  }

  writeFileSync(filePath, content);
  console.log(`✓ ${filePath} — ${segments.length} voiceover segments`);
}

console.log("\n✅ All 13 compositions updated with voiceover tracks.");
