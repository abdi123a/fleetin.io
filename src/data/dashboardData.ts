/** Month labels for the 12-point KPI sparklines (oldest → current). */
export const trendMonths = [
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
];

export const kpis = [
  {
    label: 'Active Bookings',
    icon: 'bookings' as const,
    value: 1284,
    format: { decimals: 0, suffix: '' },
    delta: '+8.2%',
    deltaDirection: 'up' as const,
    sub: 'MoM',
    trend: [864, 902, 935, 918, 980, 1020, 1065, 1040, 1110, 1163, 1187, 1284],
  },
  {
    label: 'Revenue Received',
    icon: 'revenue' as const,
    value: 184.6,
    format: { decimals: 1, suffix: 'M DJF' },
    delta: '+12.4%',
    deltaDirection: 'up' as const,
    sub: 'MoM',
    trend: [104.2, 111.8, 118.3, 115.1, 128.4, 141.2, 136.9, 148.5, 158.7, 165.2, 172.3, 184.6],
  },
  {
    label: 'Commission Earned',
    icon: 'commission' as const,
    value: 9.8,
    format: { decimals: 1, suffix: 'M DJF' },
    delta: '+3.1%',
    deltaDirection: 'up' as const,
    sub: 'MoM',
    trend: [5.4, 5.9, 6.2, 6.0, 6.8, 7.3, 7.1, 7.6, 8.2, 9.0, 9.5, 9.8],
  },
  {
    label: 'Outstanding Cheques',
    icon: 'cheques' as const,
    value: 37,
    format: { decimals: 0, suffix: '' },
    delta: '6.2M DJF',
    deltaDirection: 'neutral' as const,
    sub: 'pending',
    trend: [48, 44, 46, 41, 45, 39, 43, 38, 42, 36, 39, 37],
  },
  {
    label: 'Documents Expiring',
    icon: 'documents' as const,
    value: 14,
    format: { decimals: 0, suffix: '' },
    delta: 'attention',
    deltaDirection: 'warning' as const,
    sub: '≤30 days',
    trend: [3, 4, 4, 6, 5, 7, 9, 8, 10, 11, 12, 14],
  },
  {
    label: 'Pending Approvals',
    icon: 'approvals' as const,
    value: 9,
    format: { decimals: 0, suffix: '' },
    delta: '2.1M DJF',
    deltaDirection: 'warning' as const,
    sub: 'to review',
    trend: [2, 3, 4, 3, 5, 5, 6, 5, 7, 6, 8, 9],
  },
];

export const liveOps = {
  inTransit: 86,
  atPort: 34,
  awaitingReturn: 154,
  onTimeRate: 94.2,
  updatedAt: '2 min ago',
  weeklyVolume: [
    { week: 'W22', count: 188 },
    { week: 'W23', count: 204 },
    { week: 'W24', count: 196 },
    { week: 'W25', count: 231 },
    { week: 'W26', count: 218 },
    { week: 'W27', count: 247 },
    { week: 'W28', count: 262 },
    { week: 'W29', count: 279 },
  ],
};

export const pipelineStages = [
  { stage: 'Dispatched', count: 312, avgHours: 6, tone: 'teal' as const },
  { stage: 'Port Entry', count: 248, avgHours: 19, tone: 'teal' as const },
  { stage: 'Free Zone Delivered', count: 196, avgHours: 31, tone: 'teal' as const },
  { stage: 'Pending Empty Return', count: 154, avgHours: 47, tone: 'amber' as const },
  { stage: 'Empty Returned', count: 221, avgHours: 12, tone: 'teal' as const },
  { stage: 'Payment Released', count: 153, avgHours: 28, tone: 'dark' as const },
];

export const revenueTrend = [
  { month: 'Feb', revenue: 128.4, commission: 6.8, expenses: 41.2 },
  { month: 'Mar', revenue: 141.2, commission: 7.3, expenses: 44.8 },
  { month: 'Apr', revenue: 136.9, commission: 7.1, expenses: 43.1 },
  { month: 'May', revenue: 158.7, commission: 8.2, expenses: 47.6 },
  { month: 'Jun', revenue: 172.3, commission: 9.0, expenses: 49.9 },
  { month: 'Jul', revenue: 184.6, commission: 9.8, expenses: 52.4 },
];

export const expenseBreakdown = [
  { category: 'Fuel', value: 42, amount: '2.06M', color: 'var(--primary, #60969d)' },
  { category: 'Maintenance', value: 21, amount: '1.03M', color: 'var(--foreground, #1b2a2d)' },
  { category: 'Driver Wages', value: 18, amount: '0.88M', color: 'var(--accent, #f9ac17)' },
  { category: 'Tolls & Fees', value: 10, amount: '0.49M', color: 'var(--warning, #db9a00)' },
  { category: 'Other', value: 9, amount: '0.44M', color: 'var(--muted-foreground, #717b87)' },
];

export const recentBookings = [
  {
    id: 'BKG-10441',
    shipper: 'Horn Trading Co.',
    route: 'Doraleh Port → Free Zone A',
    container: 'MSCU-448192',
    truck: 'DJ-4471',
    driver: 'Ahmed Robleh',
    status: 'In Transit' as const,
    value: '4.2M DJF',
    eta: 'Today, 16:40',
  },
  {
    id: 'BKG-10440',
    shipper: 'Red Sea Logistics',
    route: 'Doraleh Port → Dire Dawa',
    container: 'TGHU-771034',
    truck: 'DJ-2290',
    driver: 'Fatouma Waiss',
    status: 'At Port' as const,
    value: '7.8M DJF',
    eta: 'Today, 19:15',
  },
  {
    id: 'BKG-10438',
    shipper: 'Awash Import Group',
    route: 'Free Zone B → Addis Corridor',
    container: 'CSNU-330871',
    truck: 'DJ-1188',
    driver: 'Ismail Bourhan',
    status: 'Unloaded' as const,
    value: '5.1M DJF',
    eta: 'Completed',
  },
  {
    id: 'BKG-10436',
    shipper: 'Gulf Freight Partners',
    route: 'Doraleh Port → Free Zone A',
    container: 'MAEU-902114',
    truck: 'DJ-7702',
    driver: 'Said Mahamoud',
    status: 'Pending Return' as const,
    value: '3.6M DJF',
    eta: 'Overdue 2d',
  },
  {
    id: 'BKG-10432',
    shipper: 'Horn Trading Co.',
    route: 'Doraleh Port → Free Zone C',
    container: 'HLXU-556230',
    truck: 'DJ-3345',
    driver: 'Kadra Elmi',
    status: 'Paid' as const,
    value: '6.4M DJF',
    eta: 'Completed',
  },
  {
    id: 'BKG-10429',
    shipper: 'Berbera Cargo Ltd.',
    route: 'Doraleh Port → Ali Sabieh',
    container: 'OOLU-118477',
    truck: 'DJ-5590',
    driver: 'Moussa Hared',
    status: 'In Transit' as const,
    value: '2.9M DJF',
    eta: 'Tomorrow, 09:00',
  },
];

export const topShippers = [
  { name: 'Horn Trading Co.', bookings: 284, revenue: 42.8, share: 100 },
  { name: 'Red Sea Logistics', bookings: 231, revenue: 36.1, share: 84 },
  { name: 'Awash Import Group', bookings: 198, revenue: 29.4, share: 69 },
  { name: 'Gulf Freight Partners', bookings: 164, revenue: 24.7, share: 58 },
  { name: 'Berbera Cargo Ltd.', bookings: 127, revenue: 18.2, share: 43 },
];

export const receivablesAging = [
  { bucket: '0–30 days', amount: 68.4, count: 142, tone: 'ok' as const },
  { bucket: '31–60 days', amount: 31.2, count: 67, tone: 'ok' as const },
  { bucket: '61–90 days', amount: 14.8, count: 29, tone: 'warn' as const },
  { bucket: '90+ days', amount: 6.9, count: 11, tone: 'bad' as const },
];

export const fleetUtilization = {
  total: 128,
  segments: [
    { label: 'On route', count: 86, color: 'var(--primary, #60969d)' },
    { label: 'Idle at yard', count: 27, color: 'var(--muted-foreground, #717b87)' },
    { label: 'In maintenance', count: 11, color: 'var(--accent, #f9ac17)' },
    { label: 'Out of service', count: 4, color: 'var(--warning-active, #a87600)' },
  ],
  utilization: 67.2,
  avgTripsPerTruck: 3.4,
  avgIdleHours: 11.6,
};

export const expiringDocuments = [
  {
    name: 'Vehicle Insurance — Truck DJ-4471',
    entity: 'Truck Fleet',
    expiresIn: '3 days',
    urgency: 'critical' as const,
  },
  {
    name: 'Driver License — Ahmed Robleh',
    entity: 'Drivers',
    expiresIn: '5 days',
    urgency: 'critical' as const,
  },
  {
    name: 'Customs Bond — Free Zone Partner',
    entity: 'Partners',
    expiresIn: '9 days',
    urgency: 'warning' as const,
  },
  {
    name: 'Roadworthiness Cert — Truck DJ-2290',
    entity: 'Truck Fleet',
    expiresIn: '12 days',
    urgency: 'warning' as const,
  },
  {
    name: 'Freight Handling Permit — Port Authority',
    entity: 'Shippers',
    expiresIn: '21 days',
    urgency: 'notice' as const,
  },
  {
    name: 'Driver License — Fatouma Waiss',
    entity: 'Drivers',
    expiresIn: '27 days',
    urgency: 'notice' as const,
  },
];

export const recentActivity = [
  {
    id: 'act-01',
    actor: 'Hassan Idriss',
    action: 'released payment for booking',
    target: '#BK-10432',
    time: '12 min ago',
  },
  {
    id: 'act-02',
    actor: 'System',
    action: 'flagged expiring document for',
    target: 'Truck DJ-4471',
    time: '48 min ago',
  },
  {
    id: 'act-03',
    actor: 'Amina Youssouf',
    action: 'approved expense claim',
    target: '#EX-2281 (2.4M DJF)',
    time: '1 hr ago',
  },
  {
    id: 'act-04',
    actor: 'Omar Farah',
    action: 'registered new booking',
    target: '#BK-10441',
    time: '2 hr ago',
  },
  {
    id: 'act-05',
    actor: 'Hassan Idriss',
    action: 'updated cheque status to cleared for',
    target: '#CHQ-0093',
    time: '3 hr ago',
  },
  {
    id: 'act-06',
    actor: 'System',
    action: 'marked empty container returned for',
    target: '#BK-10399',
    time: '5 hr ago',
  },
];
