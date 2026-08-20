export const queryKeys = {
  employees: {
    all: ['employees'] as const,
    list: () => [...queryKeys.employees.all, 'list'] as const,
    detail: (id: string) => [...queryKeys.employees.all, 'detail', id] as const,
    directory: () => [...queryKeys.employees.all, 'directory'] as const,
  },
  contractors: {
    all: ['contractors'] as const,
    list: () => [...queryKeys.contractors.all, 'list'] as const,
    detail: (id: string) => [...queryKeys.contractors.all, 'detail', id] as const,
  },
  departments: {
    all: ['departments'] as const,
    list: () => [...queryKeys.departments.all, 'list'] as const,
  },
  companySettings: {
    all: ['company-settings'] as const,
    current: () => [...queryKeys.companySettings.all, 'current'] as const,
  },
  payroll: {
    all: ['payroll'] as const,
    runs: () => [...queryKeys.payroll.all, 'runs'] as const,
    run: (id: string) => [...queryKeys.payroll.all, 'run', id] as const,
    segments: () => [...queryKeys.payroll.all, 'segments'] as const,
  },
  expenses: {
    all: ['expenses'] as const,
    list: (filters?: Record<string, unknown>) => [...queryKeys.expenses.all, 'list', filters] as const,
    detail: (id: string) => [...queryKeys.expenses.all, 'detail', id] as const,
  },
  tasks: {
    all: ['tasks'] as const,
    list: (spaceId?: string) => [...queryKeys.tasks.all, 'list', spaceId] as const,
    detail: (id: string) => [...queryKeys.tasks.all, 'detail', id] as const,
    spaces: () => [...queryKeys.tasks.all, 'spaces'] as const,
  },
  fleet: {
    all: ['fleet'] as const,
    vehicles: () => [...queryKeys.fleet.all, 'vehicles'] as const,
    vehicle: (id: string) => [...queryKeys.fleet.all, 'vehicle', id] as const,
    fuel: () => [...queryKeys.fleet.all, 'fuel'] as const,
    trips: () => [...queryKeys.fleet.all, 'trips'] as const,
  },
  payments: {
    all: ['payments'] as const,
    batches: () => [...queryKeys.payments.all, 'batches'] as const,
    batch: (id: string) => [...queryKeys.payments.all, 'batch', id] as const,
    items: (batchId: string) => [...queryKeys.payments.all, 'items', batchId] as const,
  },
  documents: {
    all: ['documents'] as const,
    list: () => [...queryKeys.documents.all, 'list'] as const,
  },
  contacts: {
    all: ['contacts'] as const,
    list: () => [...queryKeys.contacts.all, 'list'] as const,
    detail: (id: string) => [...queryKeys.contacts.all, 'detail', id] as const,
  },
  leave: {
    all: ['leave'] as const,
    requests: () => [...queryKeys.leave.all, 'requests'] as const,
  },
  notifications: {
    all: ['notifications'] as const,
    unread: () => [...queryKeys.notifications.all, 'unread'] as const,
  },
  assets: {
    all: ['assets'] as const,
    list: () => [...queryKeys.assets.all, 'list'] as const,
    detail: (id: string) => [...queryKeys.assets.all, 'detail', id] as const,
  },
  dashboard: {
    all: ['dashboard'] as const,
    stats: () => [...queryKeys.dashboard.all, 'stats'] as const,
    recentActivity: () => [...queryKeys.dashboard.all, 'recent-activity'] as const,
  },
} as const;
