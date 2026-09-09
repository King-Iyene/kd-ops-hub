#!/bin/bash
# Upload all rendered videos to Supabase Storage (overwrite existing)
BUCKET_URL="https://mseeurrvdcfxdmvqjjki.supabase.co/storage/v1/object/guide-videos"
SERVICE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1zZWV1cnJ2ZGNmeGRtdnFqamtpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjIwMjkyMywiZXhwIjoyMDkxNzc4OTIzfQ.PtafAgk5cqzQTIrcl38lH2PleS0ns6lkEk_R1Rek71A"

MAPPING=(
  "WelcomeToKDOps:01-WelcomeToKDOps"
  "DashboardDeepDive:02-DashboardDeepDive"
  "ManagingEmployees:03-ManagingEmployees"
  "ContractorDirectory:04-ContractorDirectory"
  "LeaveRequests:05-LeaveRequests"
  "TasksAccountability:06-TasksAccountability"
  "PaymentBatches:07-PaymentBatches"
  "ExpensesApprovals:08-ExpensesApprovals"
  "PayrollIntelligence:09-PayrollIntelligence"
  "BudgetsSubscriptions:10-BudgetsSubscriptions"
  "ComplianceCentre:11-ComplianceCentre"
  "FleetFuel:12-FleetFuel"
  "DocsReportsAdmin:13-DocsReportsAdmin"
)

for entry in "${MAPPING[@]}"; do
  LOCAL="${entry%%:*}"
  REMOTE="${entry##*:}"
  FILE="out/${LOCAL}.mp4"
  if [ -f "$FILE" ]; then
    SIZE=$(stat -c%s "$FILE" 2>/dev/null || stat -f%z "$FILE" 2>/dev/null)
    echo "Uploading ${REMOTE}.mp4 ($(( SIZE / 1024 ))KB)..."
    curl -s -X PUT "${BUCKET_URL}/${REMOTE}.mp4" \
      -H "Authorization: Bearer ${SERVICE_KEY}" \
      -H "Content-Type: video/mp4" \
      -H "x-upsert: true" \
      --data-binary @"$FILE" \
      -o /dev/null -w "  HTTP %{http_code}\n"
  else
    echo "SKIP: $FILE not found"
  fi
done

echo "✅ All uploads complete."
