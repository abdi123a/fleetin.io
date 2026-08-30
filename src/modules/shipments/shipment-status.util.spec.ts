import {
  allowedNextShipmentStatuses,
  deriveShipmentStatus,
  isValidShipmentStatusTransition,
  statusFromAssignments,
  timelineKeyForStatus,
} from './shipment-status.util';

describe('deriveShipmentStatus', () => {
  it('takes the least advanced booking — one slow container holds the job back', () => {
    expect(deriveShipmentStatus(['Completed', 'Completed', 'Completed', 'Pending'])).toBe('Pending');
    expect(deriveShipmentStatus(['Assigned', 'Completed', 'Unloading'])).toBe('Assigned');
  });

  it('completes only when every booking is done', () => {
    expect(deriveShipmentStatus(['Completed'])).toBe('Completed');
    expect(deriveShipmentStatus(['Completed', 'Completed'])).toBe('Completed');
    expect(deriveShipmentStatus(['Completed', 'POD Submitted'])).toBe('POD Submitted');
  });

  it('ignores cancelled and failed bookings — they are not progress', () => {
    expect(deriveShipmentStatus(['Cancelled', 'Completed'])).toBe('Completed');
    expect(deriveShipmentStatus(['Failed', 'En Route'])).toBe('En Route');
  });

  it('closes the shipment when every booking is cancelled or failed', () => {
    expect(deriveShipmentStatus(['Cancelled', 'Cancelled'])).toBe('Cancelled');
    expect(deriveShipmentStatus(['Failed'])).toBe('Failed');
    expect(deriveShipmentStatus(['Cancelled', 'Failed'])).toBe('Cancelled');
  });

  it('has no opinion without bookings, or with only off-ladder statuses', () => {
    expect(deriveShipmentStatus([])).toBeNull();
    expect(deriveShipmentStatus(['Payment Pending'])).toBeNull();
  });

  it('reproduces the real drift cases this was written for', () => {
    // MSN-08816: read "Pending" while its only container was delivered.
    expect(deriveShipmentStatus(['Completed'])).toBe('Completed');
    // MSN-08814: read "Pending" while its container was moving.
    expect(deriveShipmentStatus(['En Route'])).toBe('En Route');
  });
});

describe('shipment status transitions', () => {
  it('allows each step of the linear ladder', () => {
    expect(isValidShipmentStatusTransition('Pending', 'Assigned')).toBe(true);
    expect(isValidShipmentStatusTransition('Assigned', 'Driver Assigned')).toBe(true);
    expect(isValidShipmentStatusTransition('Driver Assigned', 'Heading to Pickup')).toBe(true);
    expect(isValidShipmentStatusTransition('Heading to Pickup', 'At Pickup')).toBe(true);
    expect(isValidShipmentStatusTransition('At Pickup', 'Loading')).toBe(true);
    expect(isValidShipmentStatusTransition('Loading', 'Loaded')).toBe(true);
    expect(isValidShipmentStatusTransition('Loaded', 'En Route')).toBe(true);
    expect(isValidShipmentStatusTransition('En Route', 'Arrived')).toBe(true);
    expect(isValidShipmentStatusTransition('Arrived', 'Unloading')).toBe(true);
    expect(isValidShipmentStatusTransition('Unloading', 'POD Submitted')).toBe(true);
    expect(isValidShipmentStatusTransition('POD Submitted', 'Completed')).toBe(true);
  });

  it('rejects skipping ahead on the ladder', () => {
    expect(isValidShipmentStatusTransition('Pending', 'En Route')).toBe(false);
    expect(isValidShipmentStatusTransition('Driver Assigned', 'En Route')).toBe(false);
  });

  it('allows stepping back down the ladder — a mis-click has to be undoable', () => {
    expect(isValidShipmentStatusTransition('En Route', 'Driver Assigned')).toBe(true);
    expect(isValidShipmentStatusTransition('At Pickup', 'Heading to Pickup')).toBe(true);
    expect(isValidShipmentStatusTransition('POD Submitted', 'Pending')).toBe(true);
  });

  it('refuses to reopen a job that is already closed', () => {
    // Undoing a cancellation or reopening a completed mission is a decision
    // with money attached, not a correction.
    expect(isValidShipmentStatusTransition('Cancelled', 'En Route')).toBe(false);
    expect(isValidShipmentStatusTransition('Failed', 'Pending')).toBe(false);
    expect(isValidShipmentStatusTransition('Completed', 'Unloading')).toBe(false);
  });

  it('rejects a no-op transition', () => {
    expect(isValidShipmentStatusTransition('Pending', 'Pending')).toBe(false);
  });

  it('always allows the forced -> Assigned edge (Empty Returns matching)', () => {
    expect(isValidShipmentStatusTransition('Pending', 'Assigned')).toBe(true);
    expect(isValidShipmentStatusTransition('En Route', 'Assigned')).toBe(true);
    expect(isValidShipmentStatusTransition('Completed', 'Assigned')).toBe(true);
  });

  it('always allows the forced -> Completed edge (Empty Returns cycle completion)', () => {
    expect(isValidShipmentStatusTransition('Pending', 'Completed')).toBe(true);
    expect(isValidShipmentStatusTransition('Arrived', 'Completed')).toBe(true);
  });

  it('allows cancellation from any non-terminal state', () => {
    expect(isValidShipmentStatusTransition('Pending', 'Cancelled')).toBe(true);
    expect(isValidShipmentStatusTransition('En Route', 'Failed')).toBe(true);
  });

  it('rejects cancellation from a terminal state', () => {
    expect(isValidShipmentStatusTransition('Completed', 'Cancelled')).toBe(false);
    expect(isValidShipmentStatusTransition('Cancelled', 'Failed')).toBe(false);
  });

  it('rejects an unrelated status jump', () => {
    expect(isValidShipmentStatusTransition('Pending', 'POD Submitted')).toBe(false);
  });

  describe('allowedNextShipmentStatuses', () => {
    it('lists the ladder step plus the two forced edges for a mid-ladder status', () => {
      const next = allowedNextShipmentStatuses('Assigned');
      expect(next).toEqual(expect.arrayContaining(['Driver Assigned', 'Completed', 'Cancelled', 'Failed']));
      expect(next).not.toContain('Assigned');
    });

    it('lists only the forced edges for a terminal status', () => {
      const next = allowedNextShipmentStatuses('Completed');
      expect(next).toEqual(expect.arrayContaining(['Assigned']));
      expect(next).not.toContain('Cancelled');
      expect(next).not.toContain('Failed');
    });
  });

  describe('statusFromAssignments', () => {
    it('raises a pending booking to the rung its assignments prove', () => {
      expect(statusFromAssignments('Pending', { hasVehicle: true, hasDriver: false })).toBe('Assigned');
      expect(statusFromAssignments('Pending', { hasVehicle: true, hasDriver: true })).toBe('Driver Assigned');
      expect(statusFromAssignments('Assigned', { hasVehicle: true, hasDriver: true })).toBe('Driver Assigned');
    });

    it('says nothing when the status already reflects the assignments', () => {
      expect(statusFromAssignments('Driver Assigned', { hasVehicle: true, hasDriver: true })).toBeNull();
      expect(statusFromAssignments('Pending', { hasVehicle: false, hasDriver: false })).toBeNull();
      // A driver with no truck proves nothing — "Assigned" is about the vehicle.
      expect(statusFromAssignments('Pending', { hasVehicle: false, hasDriver: true })).toBeNull();
    });

    it('never drags a rolling booking backwards, and never touches a terminal one', () => {
      expect(statusFromAssignments('En Route', { hasVehicle: true, hasDriver: true })).toBeNull();
      expect(statusFromAssignments('Completed', { hasVehicle: true, hasDriver: true })).toBeNull();
      expect(statusFromAssignments('Cancelled', { hasVehicle: true, hasDriver: true })).toBeNull();
      expect(statusFromAssignments('Payment Pending', { hasVehicle: true, hasDriver: true })).toBeNull();
    });
  });

  describe('timelineKeyForStatus', () => {
    it('maps every ladder status to a valid MissionTimelineStep key', () => {
      expect(timelineKeyForStatus('Assigned')).toBe('vehicle_assignment');
      expect(timelineKeyForStatus('Driver Assigned')).toBe('driver_assignment');
      expect(timelineKeyForStatus('Heading to Pickup')).toBe('left_for_pickup');
      expect(timelineKeyForStatus('At Pickup')).toBe('gate_in');
      expect(timelineKeyForStatus('Loading')).toBe('loading_start');
      expect(timelineKeyForStatus('Loaded')).toBe('pickup');
      expect(timelineKeyForStatus('En Route')).toBe('departure');
      expect(timelineKeyForStatus('Arrived')).toBe('arrival');
      expect(timelineKeyForStatus('Unloading')).toBe('unloading_start');
      expect(timelineKeyForStatus('POD Submitted')).toBe('pod_upload');
      expect(timelineKeyForStatus('Empty Ready')).toBe('empty_ready');
      expect(timelineKeyForStatus('Completed')).toBe('completion');
    });

    it('falls back to "completion" for a status with no clean mapping', () => {
      expect(timelineKeyForStatus('Cancelled')).toBe('completion');
    });
  });
});
