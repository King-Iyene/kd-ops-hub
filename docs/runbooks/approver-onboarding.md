# Approver Onboarding — Step-Up Authentication

Every approval action (batch approve/reject, expense approve/reject, QuickPay) now requires step-up re-authentication: your account password **and** a 6-digit TOTP code from an authenticator app. This is checked fresh each time, so there is no way to pre-approve a session.

---

## 1. Set Up TOTP (Authenticator App)

TOTP setup is required before you can approve or reject anything. Without it the system blocks the action and shows a "Set up TOTP in Security Settings" message.

1. Open the app, navigate to **Settings → Security**.
2. Click **Add authenticator app**.
3. Scan the QR code with Google Authenticator, Authy, 1Password, or any TOTP-compatible app.
4. Enter the 6-digit code shown in the app to confirm setup.
5. Store your backup codes somewhere safe.

From this point on, every approval action will ask for a code from your app.

---

## 2. The Step-Up Flow (What Approvers See)

When you click **Approve** or **Reject** on a batch or expense, a modal appears:

- **Your password** — the same password you use to log in.
- **Authenticator code** — the current 6-digit code from your app (rotates every 30 s).
- **Reason** (reject only) — at least 10 characters explaining why.

Click **Confirm** (or **Reject**). The system verifies both factors server-side; on success the action executes immediately.

The token is single-use and expires in 5 minutes. You must complete the flow before the code cycles.

---

## 3. Lost Authenticator

If you lose access to your authenticator device:

1. Contact your **Super Admin** or the IT desk.
2. The Super Admin navigates to **Settings → Team → [your name] → Security**.
3. They click **Remove TOTP factor**. This de-registers the lost device.
4. You re-enrol using the steps in §1 above.

Until re-enrolled your account cannot approve or reject items. The queue continues to show the items — another approver can act on them.

---

## 4. Lockout Policy

Three failed step-up attempts within 60 minutes triggers a temporary lockout. You cannot perform further step-up actions until the oldest of the three failures ages out of the 60-minute window. A clear error message with the expected unlock time is shown.

Lockouts are logged in the `step_up_failures` table and visible in the audit log.

---

## 5. Bulk Approval

Bulk approval via the checkbox-select-all flow is available for **fuel requests, budgets, and leave requests** only. Payment batches and expenses require individual step-up because each token is cryptographically bound to a specific resource ID — a single shared token cannot cover multiple resources.

To approve multiple batches or expenses quickly, open them one at a time from the Approvals queue. The step-up dialog caches nothing client-side between items, so each action is independently verified.

---

## 6. QuickPay

QuickPay also requires step-up. The flow:

1. Fill in account details and amount.
2. Click **Pay now** → authenticator modal opens.
3. Enter password + TOTP → click **Continue to Confirm**.
4. Review the payment summary → click **Send**.

The token is consumed at the moment the payment executes. If the modal is left open past 5 minutes the token expires and you restart from step 2.

---

## 7. Troubleshooting

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| "Authenticator code invalid" | Code entered after it rotated | Wait for the next 30 s code and re-enter |
| "Wrong password" | Typo or changed password | Enter current password; use password manager |
| "Locked out" | 3+ failures in 60 min | Wait for lockout window to clear; contact Super Admin if urgent |
| "Set up TOTP" shown instead of form | No verified TOTP factor on account | Follow §1 |
| "Token expired" on confirm | Took longer than 5 min after authenticating | Re-authenticate |
