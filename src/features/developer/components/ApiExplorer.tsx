import { useState, useCallback } from "react";
import {
  Users,
  UserCheck,
  CheckSquare,
  CalendarDays,
  Receipt,
  Banknote,
  Truck,
  FileText,
  Building2,
  UserPlus,
  Database,
  Send,
  Eye,
  EyeOff,
  Plus,
  Minus,
  Loader2,
  ChevronDown,
  ChevronRight,
  Copy,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { LucideIcon } from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Operation {
  id: string;
  name: string;
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  body: string | null;
}

interface ApiModule {
  id: string;
  name: string;
  icon: LucideIcon;
  operations: Operation[];
}

interface QueryParam {
  key: string;
  value: string;
}

interface ApiResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  time: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BASE_URL =
  "https://mseeurrvdcfxdmvqjjki.supabase.co/functions/v1/platform-api/v1";

const API_MODULES: ApiModule[] = [
  {
    id: "employees",
    name: "Employees",
    icon: Users,
    operations: [
      { id: "list", name: "List Employees", method: "GET", path: "/employees", body: null },
      { id: "get", name: "Get Employee", method: "GET", path: "/employees/:id", body: null },
      {
        id: "create",
        name: "Create Employee",
        method: "POST",
        path: "/employees",
        body: '{\n  "first_name": "John",\n  "last_name": "Doe",\n  "email": "john@example.com",\n  "department": "Engineering",\n  "role": "field_staff",\n  "employment_type": "full_time"\n}',
      },
      {
        id: "update",
        name: "Update Employee",
        method: "PATCH",
        path: "/employees/:id",
        body: '{\n  "department": "Operations"\n}',
      },
    ],
  },
  {
    id: "contractors",
    name: "Contractors",
    icon: UserCheck,
    operations: [
      { id: "list", name: "List Contractors", method: "GET", path: "/contractors", body: null },
      {
        id: "create",
        name: "Create Contractor",
        method: "POST",
        path: "/contractors",
        body: '{\n  "first_name": "Jane",\n  "last_name": "Smith",\n  "email": "jane@contractor.com",\n  "company": "Smith Consulting"\n}',
      },
    ],
  },
  {
    id: "tasks",
    name: "Tasks",
    icon: CheckSquare,
    operations: [
      { id: "list", name: "List Tasks", method: "GET", path: "/tasks", body: null },
      {
        id: "create",
        name: "Create Task",
        method: "POST",
        path: "/tasks",
        body: '{\n  "title": "Review Q3 reports",\n  "description": "Review and approve quarterly reports",\n  "priority": "high",\n  "due_date": "2026-10-01"\n}',
      },
      {
        id: "update",
        name: "Update Task",
        method: "PATCH",
        path: "/tasks/:id",
        body: '{\n  "status": "completed"\n}',
      },
    ],
  },
  {
    id: "leaves",
    name: "Leave Requests",
    icon: CalendarDays,
    operations: [
      { id: "list", name: "List Leave Requests", method: "GET", path: "/leaves", body: null },
      {
        id: "create",
        name: "Create Leave Request",
        method: "POST",
        path: "/leaves",
        body: '{\n  "employee_id": "uuid",\n  "leave_type": "annual",\n  "start_date": "2026-10-15",\n  "end_date": "2026-10-20",\n  "reason": "Family vacation"\n}',
      },
    ],
  },
  {
    id: "expenses",
    name: "Expenses",
    icon: Receipt,
    operations: [
      { id: "list", name: "List Expenses", method: "GET", path: "/expenses", body: null },
      {
        id: "create",
        name: "Submit Expense",
        method: "POST",
        path: "/expenses",
        body: '{\n  "title": "Office supplies",\n  "amount": 15000,\n  "currency": "NGN",\n  "category": "supplies"\n}',
      },
    ],
  },
  {
    id: "payroll",
    name: "Payroll",
    icon: Banknote,
    operations: [
      { id: "runs", name: "List Payroll Runs", method: "GET", path: "/payroll/runs", body: null },
      { id: "slips", name: "Get Payslips", method: "GET", path: "/payroll/runs/:id/slips", body: null },
    ],
  },
  {
    id: "fleet",
    name: "Fleet & Fuel",
    icon: Truck,
    operations: [
      { id: "vehicles", name: "List Vehicles", method: "GET", path: "/fleet/vehicles", body: null },
      { id: "fuel", name: "List Fuel Requests", method: "GET", path: "/fleet/fuel-requests", body: null },
      { id: "trips", name: "List Trips", method: "GET", path: "/fleet/trips", body: null },
    ],
  },
  {
    id: "invoices",
    name: "Invoices",
    icon: FileText,
    operations: [
      { id: "list", name: "List Invoices", method: "GET", path: "/invoices", body: null },
      {
        id: "create",
        name: "Create Invoice",
        method: "POST",
        path: "/invoices",
        body: '{\n  "client_id": "uuid",\n  "items": [{"description": "Consulting", "amount": 500000}],\n  "due_date": "2026-11-01"\n}',
      },
    ],
  },
  {
    id: "clients",
    name: "Clients",
    icon: Building2,
    operations: [
      { id: "list", name: "List Clients", method: "GET", path: "/clients", body: null },
      {
        id: "create",
        name: "Create Client",
        method: "POST",
        path: "/clients",
        body: '{\n  "name": "Acme Corp",\n  "industry": "Technology",\n  "contact_email": "billing@acme.com"\n}',
      },
    ],
  },
  {
    id: "recruitment",
    name: "Recruitment",
    icon: UserPlus,
    operations: [
      { id: "openings", name: "List Openings", method: "GET", path: "/recruitment/openings", body: null },
      { id: "applicants", name: "List Applicants", method: "GET", path: "/recruitment/applicants", body: null },
    ],
  },
  {
    id: "database",
    name: "Database",
    icon: Database,
    operations: [
      { id: "bases", name: "List Bases", method: "GET", path: "/data/bases", body: null },
      { id: "tables", name: "List Tables", method: "GET", path: "/data/bases/:baseId/tables", body: null },
      {
        id: "records",
        name: "List Records",
        method: "GET",
        path: "/data/bases/:baseId/tables/:tableId/records",
        body: null,
      },
      {
        id: "create-record",
        name: "Create Records",
        method: "POST",
        path: "/data/bases/:baseId/tables/:tableId/records",
        body: '{\n  "records": [\n    { "fields": { "Name": "Example", "Status": "Active" } }\n  ]\n}',
      },
    ],
  },
];

const METHOD_COLORS: Record<string, string> = {
  GET: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  POST: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  PATCH: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  DELETE: "bg-red-500/15 text-red-400 border-red-500/30",
};

// ---------------------------------------------------------------------------
// JSON syntax highlighter
// ---------------------------------------------------------------------------

function highlightJson(json: string): string {
  return json
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(
      /("(?:\\.|[^"\\])*")\s*:/g,
      '<span class="text-slate-200">$1</span>:',
    )
    .replace(
      /:\s*("(?:\\.|[^"\\])*")/g,
      ': <span class="text-emerald-400">$1</span>',
    )
    .replace(
      /:\s*(\d+(?:\.\d+)?)/g,
      ': <span class="text-blue-400">$1</span>',
    )
    .replace(
      /:\s*(true|false)/g,
      ': <span class="text-orange-400">$1</span>',
    )
    .replace(
      /:\s*(null)/g,
      ': <span class="text-slate-500">$1</span>',
    );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function MethodBadge({ method }: { method: string }) {
  return (
    <span
      className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-bold tracking-wide ${METHOD_COLORS[method] ?? ""}`}
    >
      {method}
    </span>
  );
}

function StatusBadge({ status }: { status: number }) {
  let color = "text-emerald-400";
  if (status >= 400 && status < 500) color = "text-amber-400";
  if (status >= 500) color = "text-red-400";
  return <span className={`font-mono font-bold ${color}`}>{status}</span>;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function ApiExplorer() {
  // --- request state ---
  const [moduleId, setModuleId] = useState<string>(API_MODULES[0].id);
  const [operationId, setOperationId] = useState<string>(
    API_MODULES[0].operations[0].id,
  );
  const [url, setUrl] = useState<string>(
    `${BASE_URL}${API_MODULES[0].operations[0].path}`,
  );
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [headersOpen, setHeadersOpen] = useState(false);
  const [headers, setHeaders] = useState<QueryParam[]>([
    { key: "Content-Type", value: "application/json" },
  ]);
  const [queryParams, setQueryParams] = useState<QueryParam[]>([]);
  const [body, setBody] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  // --- response state ---
  const [response, setResponse] = useState<ApiResponse | null>(null);
  const [responseHeadersOpen, setResponseHeadersOpen] = useState(false);

  // --- derived ---
  const currentModule = API_MODULES.find((m) => m.id === moduleId)!;
  const currentOperation = currentModule.operations.find(
    (o) => o.id === operationId,
  )!;
  const hasBody = currentOperation.method === "POST" || currentOperation.method === "PATCH";

  // --- handlers ---
  const selectModule = useCallback(
    (id: string) => {
      const mod = API_MODULES.find((m) => m.id === id)!;
      const op = mod.operations[0];
      setModuleId(id);
      setOperationId(op.id);
      setUrl(`${BASE_URL}${op.path}`);
      setBody(op.body ?? "");
      setQueryParams([]);
    },
    [],
  );

  const selectOperation = useCallback(
    (id: string) => {
      const op = currentModule.operations.find((o) => o.id === id)!;
      setOperationId(id);
      setUrl(`${BASE_URL}${op.path}`);
      setBody(op.body ?? "");
      setQueryParams([]);
    },
    [currentModule],
  );

  const updateParam = (
    list: QueryParam[],
    setter: React.Dispatch<React.SetStateAction<QueryParam[]>>,
    idx: number,
    field: "key" | "value",
    val: string,
  ) => {
    const next = [...list];
    next[idx] = { ...next[idx], [field]: val };
    setter(next);
  };

  const addParam = (
    setter: React.Dispatch<React.SetStateAction<QueryParam[]>>,
  ) => setter((p) => [...p, { key: "", value: "" }]);

  const removeParam = (
    list: QueryParam[],
    setter: React.Dispatch<React.SetStateAction<QueryParam[]>>,
    idx: number,
  ) => setter(list.filter((_, i) => i !== idx));

  const sendRequest = useCallback(async () => {
    setLoading(true);
    setResponse(null);

    let finalUrl = url;
    const validParams = queryParams.filter((p) => p.key);
    if (validParams.length) {
      const qs = new URLSearchParams(
        validParams.map((p) => [p.key, p.value]),
      ).toString();
      finalUrl += `?${qs}`;
    }

    const reqHeaders: Record<string, string> = {};
    for (const h of headers) {
      if (h.key) reqHeaders[h.key] = h.value;
    }
    if (apiKey) {
      reqHeaders["Authorization"] = `Bearer ${apiKey}`;
    }

    const t0 = performance.now();

    try {
      const res = await fetch(finalUrl, {
        method: currentOperation.method,
        headers: reqHeaders,
        body: hasBody && body ? body : undefined,
      });
      const elapsed = performance.now() - t0;

      const resHeaders: Record<string, string> = {};
      res.headers.forEach((v, k) => {
        resHeaders[k] = v;
      });

      let resBody: string;
      const ct = res.headers.get("content-type") ?? "";
      if (ct.includes("json")) {
        const json = await res.json();
        resBody = JSON.stringify(json, null, 2);
      } else {
        resBody = await res.text();
      }

      setResponse({
        status: res.status,
        statusText: res.statusText,
        headers: resHeaders,
        body: resBody,
        time: elapsed,
      });
    } catch (err: unknown) {
      const elapsed = performance.now() - t0;
      setResponse({
        status: 0,
        statusText: "Network Error",
        headers: {},
        body:
          err instanceof Error
            ? `Error: ${err.message}`
            : "An unknown error occurred",
        time: elapsed,
      });
    } finally {
      setLoading(false);
    }
  }, [url, queryParams, headers, apiKey, currentOperation.method, hasBody, body]);

  const copyResponse = useCallback(() => {
    if (!response) return;
    navigator.clipboard.writeText(response.body);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [response]);

  // --- render helpers ---
  const ModuleIcon = currentModule.icon;

  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      {/* ============================================================= */}
      {/* LEFT PANEL - REQUEST BUILDER                                   */}
      {/* ============================================================= */}
      <Card className="flex-1 border-slate-700/60 bg-slate-900/60 p-5">
        <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-slate-400">
          <Send className="h-4 w-4" /> Request
        </h3>

        {/* Module selector */}
        <label className="mb-1.5 block text-xs font-medium text-slate-400">
          Module
        </label>
        <Select value={moduleId} onValueChange={selectModule}>
          <SelectTrigger className="mb-4 border-slate-700 bg-slate-800 text-slate-200">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="border-slate-700 bg-slate-800">
            {API_MODULES.map((m) => {
              const Icon = m.icon;
              return (
                <SelectItem key={m.id} value={m.id}>
                  <span className="flex items-center gap-2">
                    <Icon className="h-4 w-4 text-slate-400" />
                    {m.name}
                  </span>
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>

        {/* Operation selector */}
        <label className="mb-1.5 block text-xs font-medium text-slate-400">
          Operation
        </label>
        <Select value={operationId} onValueChange={selectOperation}>
          <SelectTrigger className="mb-4 border-slate-700 bg-slate-800 text-slate-200">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="border-slate-700 bg-slate-800">
            {currentModule.operations.map((op) => (
              <SelectItem key={op.id} value={op.id}>
                <span className="flex items-center gap-2">
                  <MethodBadge method={op.method} />
                  {op.name}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Method + URL */}
        <label className="mb-1.5 block text-xs font-medium text-slate-400">
          Endpoint
        </label>
        <div className="mb-4 flex items-center gap-2">
          <MethodBadge method={currentOperation.method} />
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="flex-1 border-slate-700 bg-slate-800 font-mono text-xs text-slate-200"
          />
        </div>

        {/* API Key */}
        <label className="mb-1.5 block text-xs font-medium text-slate-400">
          API Key (Bearer token)
        </label>
        <div className="relative mb-4">
          <Input
            type={showKey ? "text" : "password"}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="Enter your API key..."
            className="border-slate-700 bg-slate-800 pr-10 font-mono text-xs text-slate-200"
          />
          <button
            type="button"
            onClick={() => setShowKey((v) => !v)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
          >
            {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>

        {/* Headers (collapsible) */}
        <button
          type="button"
          onClick={() => setHeadersOpen((v) => !v)}
          className="mb-2 flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-slate-200"
        >
          {headersOpen ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
          Headers
        </button>
        {headersOpen && (
          <div className="mb-4 space-y-2 rounded-md border border-slate-700/60 bg-slate-800/50 p-3">
            {headers.map((h, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input
                  value={h.key}
                  onChange={(e) =>
                    updateParam(headers, setHeaders, i, "key", e.target.value)
                  }
                  placeholder="Header"
                  className="flex-1 border-slate-700 bg-slate-800 text-xs text-slate-200"
                />
                <Input
                  value={h.value}
                  onChange={(e) =>
                    updateParam(headers, setHeaders, i, "value", e.target.value)
                  }
                  placeholder="Value"
                  className="flex-1 border-slate-700 bg-slate-800 text-xs text-slate-200"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Remove header"
                  className="h-8 w-8 shrink-0 text-slate-500 hover:text-red-400"
                  onClick={() => removeParam(headers, setHeaders, i)}
                >
                  <Minus className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-slate-400 hover:text-slate-200"
              onClick={() => addParam(setHeaders)}
            >
              <Plus className="mr-1 h-3.5 w-3.5" /> Add Header
            </Button>
          </div>
        )}

        {/* Query Params (for GET) */}
        {currentOperation.method === "GET" && (
          <>
            <label className="mb-1.5 block text-xs font-medium text-slate-400">
              Query Parameters
            </label>
            <div className="mb-4 space-y-2 rounded-md border border-slate-700/60 bg-slate-800/50 p-3">
              {queryParams.map((p, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    value={p.key}
                    onChange={(e) =>
                      updateParam(
                        queryParams,
                        setQueryParams,
                        i,
                        "key",
                        e.target.value,
                      )
                    }
                    placeholder="Key (e.g. page)"
                    className="flex-1 border-slate-700 bg-slate-800 text-xs text-slate-200"
                  />
                  <Input
                    value={p.value}
                    onChange={(e) =>
                      updateParam(
                        queryParams,
                        setQueryParams,
                        i,
                        "value",
                        e.target.value,
                      )
                    }
                    placeholder="Value"
                    className="flex-1 border-slate-700 bg-slate-800 text-xs text-slate-200"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Remove query parameter"
                    className="h-8 w-8 shrink-0 text-slate-500 hover:text-red-400"
                    onClick={() =>
                      removeParam(queryParams, setQueryParams, i)
                    }
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-slate-400 hover:text-slate-200"
                onClick={() => addParam(setQueryParams)}
              >
                <Plus className="mr-1 h-3.5 w-3.5" /> Add Parameter
              </Button>
            </div>
          </>
        )}

        {/* Request Body (for POST/PATCH) */}
        {hasBody && (
          <>
            <label className="mb-1.5 block text-xs font-medium text-slate-400">
              Request Body (JSON)
            </label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={10}
              spellCheck={false}
              className="mb-4 w-full rounded-md border border-slate-700 bg-slate-800 p-3 font-mono text-xs text-slate-200 placeholder:text-slate-600 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </>
        )}

        {/* Send button */}
        <Button
          onClick={sendRequest}
          disabled={loading}
          className="w-full bg-primary text-white hover:bg-primary/90 disabled:opacity-50"
        >
          {loading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Send className="mr-2 h-4 w-4" />
          )}
          {loading ? "Sending..." : "Send Request"}
        </Button>
      </Card>

      {/* ============================================================= */}
      {/* RIGHT PANEL - RESPONSE                                         */}
      {/* ============================================================= */}
      <Card className="flex-1 border-slate-700/60 bg-slate-900/60 p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-slate-400">
            <ModuleIcon className="h-4 w-4" /> Response
          </h3>
          {response && (
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-slate-400 hover:text-slate-200"
              onClick={copyResponse}
            >
              {copied ? (
                <Check className="mr-1 h-3.5 w-3.5 text-success" />
              ) : (
                <Copy className="mr-1 h-3.5 w-3.5" />
              )}
              {copied ? "Copied" : "Copy"}
            </Button>
          )}
        </div>

        {!response && !loading && (
          <div className="flex h-64 items-center justify-center text-sm text-slate-500">
            No response yet. Send a request to see results.
          </div>
        )}

        {loading && (
          <div className="flex h-64 items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        )}

        {response && !loading && (
          <>
            {/* Status line */}
            <div className="mb-4 flex items-center gap-3 rounded-md border border-slate-700/60 bg-slate-800/50 px-4 py-2.5">
              <StatusBadge status={response.status} />
              <span className="text-sm text-slate-400">
                {response.statusText}
              </span>
              <span className="ml-auto text-xs text-slate-500">
                {response.time.toFixed(0)}ms
              </span>
            </div>

            {/* Response body */}
            <label className="mb-1.5 block text-xs font-medium text-slate-400">
              Body
            </label>
            <div className="mb-4 max-h-[28rem] overflow-auto rounded-md border border-slate-700/60 bg-slate-950 p-4">
              <pre
                className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-slate-300"
                dangerouslySetInnerHTML={{
                  __html: highlightJson(response.body),
                }}
              />
            </div>

            {/* Response headers (collapsible) */}
            <button
              type="button"
              onClick={() => setResponseHeadersOpen((v) => !v)}
              className="flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-slate-200"
            >
              {responseHeadersOpen ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" />
              )}
              Response Headers
            </button>
            {responseHeadersOpen && (
              <div className="mt-2 rounded-md border border-slate-700/60 bg-slate-800/50 p-3">
                {Object.entries(response.headers).map(([k, v]) => (
                  <div key={k} className="flex gap-2 text-xs">
                    <span className="font-medium text-slate-300">{k}:</span>
                    <span className="text-slate-500">{v}</span>
                  </div>
                ))}
                {Object.keys(response.headers).length === 0 && (
                  <span className="text-xs text-slate-500">
                    No headers available
                  </span>
                )}
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
