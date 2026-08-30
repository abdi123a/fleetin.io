import { cycleStatusForBookingStatus, DELIVERED_STATUSES } from './empty-return-status.util';

describe('cycleStatusForBookingStatus', () => {
  it('maps the post-match ladder onto the four cycle statuses', () => {
    expect(cycleStatusForBookingStatus('Assigned')).toBe('preparing');
    expect(cycleStatusForBookingStatus('Driver Assigned')).toBe('ready');
    expect(cycleStatusForBookingStatus('En Route')).toBe('in_progress');
  });

  it('maps every delivered status to "completed"', () => {
    for (const status of DELIVERED_STATUSES) {
      expect(cycleStatusForBookingStatus(status)).toBe('completed');
    }
  });

  it('reads the whole pickup leg as the cycle being under way', () => {
    // These became real rungs when the ladder gained the pickup leg. Before
    // that, a matched cycle sat on "ready" through four status changes and
    // looked stalled while the truck was in fact working.
    for (const status of ['Heading to Pickup', 'At Pickup', 'Loading', 'Loaded', 'En Route']) {
      expect(cycleStatusForBookingStatus(status)).toBe('in_progress');
    }
  });

  it('has no opinion on a status outside the reachable ladder', () => {
    expect(cycleStatusForBookingStatus('Pending')).toBeNull();
    expect(cycleStatusForBookingStatus('Payment Pending')).toBeNull();
    expect(cycleStatusForBookingStatus('Cancelled')).toBeNull();
    expect(cycleStatusForBookingStatus('Failed')).toBeNull();
  });
});
