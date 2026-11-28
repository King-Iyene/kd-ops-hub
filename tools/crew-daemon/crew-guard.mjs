// Safety gate for the Zoho WorkDrive connector. Claude Code runs this before EVERY WorkDrive tool call in an executive's session.
// The connector has one generic "executeTool" that can reach 150+ operations (including deleting and sharing). This gate lets through only:
//   - read operations (when CREW_ZOHO_READ=1), and
//   - the exact operations listed in CREW_ZOHO_ALLOW (set only for an executor that runs one approved action).
// Everything else is refused before it reaches Zoho. Fails closed: if the gate cannot understand the call, it refuses.

const READ = /^ZohoWorkdrive_(Get_|Fetch_|Search_Records$|File_Property$|File_Query$|Recent_Files$|My_Folder_Files$|Sub_Folders$|Shared_With_Me_|Breadcrumbs_Of_File$|Favorite_Files$|Labeled_Files$|Suggested_Files$|List_Team_Groups$|Download_Server_File$)/;
const META = /ZohoMCP_(listProducts|getFeatures|listTools|getSchema)$/;
// Zoho Mail: reading and searching mail only. Never send, reply, forward, delete, move, label, flag or change any setting.
const MAIL_READ = /^ZohoMail_(list_accounts|list_folders|list_mails|list_labels|list_mail_attachments|get_account|get_folder|get_label|get_mail|get_mail_thread|get_mail_headers|get_mail_html|search_mail_advanced|list_sharedmailbox_messages|get_sharedmailbox_message|get_sharedmailbox_counts|build_(address|attachment|content|meta)_search_query)$/;

let s = '';
process.stdin.on('data', (d) => { s += d; }).on('end', () => {
  let j = null;
  try { j = JSON.parse(s); } catch { /* fail closed below */ }
  const deny = (why) => {
    process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: why } }));
    process.exit(0);
  };
  if (!j || typeof j.tool_name !== 'string') return deny('The safety gate could not read this call.');
  if (META.test(j.tool_name)) process.exit(0);
  if (!/ZohoMCP_executeTool$/.test(j.tool_name)) return deny('Only the approved WorkDrive tools may be used.');
  const inner = j.tool_input?.body?.tool_name ?? j.tool_input?.tool_name;
  if (typeof inner !== 'string') return deny('The safety gate could not tell which WorkDrive operation this is.');
  const allow = String(process.env.CREW_ZOHO_ALLOW || '').split(',').map((x) => x.trim()).filter(Boolean);
  if (allow.includes(inner)) process.exit(0);
  if (/Zoho_Mail__/.test(j.tool_name)) {
    if (process.env.CREW_MAIL_READ === '1' && MAIL_READ.test(inner)) process.exit(0);
    return deny(`${inner} is not allowed. You may only read and search the owner's mail; you never send, reply, delete, move, label or change anything. If something should be done with an email, tell the owner.`);
  }
  if (process.env.CREW_ZOHO_READ === '1' && READ.test(inner)) process.exit(0);
  return deny(`${inner} is not allowed here. Reading is allowed; creating, changing, sharing or deleting needs the owner's approval first (send a proposal).`);
});
