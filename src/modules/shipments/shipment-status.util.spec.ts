import {
  allowedNextShipmentStatuses,
  isValidShipmentStatusTransition,
  timelineKeyForStatus,
} from './shipment-status.util';

describe('shipment status transitions', () => {
  it('allows each step of the linear ladder', () => {
    expect(isValidShipmentStatusTransition('Pending', 'Assigned')).toBe(true);
    expect(isValidShipmentStatusTransition('Assigned', 'Driver Assigned')).toBe(true);
    expect(isValidShipmentStatusTransition('Driver Assigned', 'En Route')).toBe(true);
    expect(isValidShipmentStatusTransition('En Route', 'Arrived')).toBe(true);
    expect(isValidShipmentStatusTransition('Arrived', 'Unloading')).toBe(true);
    expect(isValidShipmentStatusTransition('Unloading', 'POD Submitted')).toBe(true);
    expect(isValidShipmentStatusTransition('POD Submitted', 'Completed')).toBe(true);
  });

  it('rejects skipping ahead on the ladder', () => {
    expect(isValidShipmentStatusTransition('Pending', 'En Route')).toBe(false);
  });

  it('rejects moving backwards', () => {
    // 'Assigned' is excluded deliberately — it's the forced BR-2.3 edge and
    // must stay reachable from any state, so it isn't a "backwards" example.
    expect(isValidShipmentStatusTransition('En Route', 'Driver Assigned')).toBe(false);
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

  describe('timelineKeyForStatus', () => {
    it('maps every ladder status to a valid MissionTimelineStep key', () => {
      expect(timelineKeyForStatus('Assigned')).toBe('vehicle_assignment');
      expect(timelineKeyForStatus('Driver Assigned')).toBe('driver_assignment');
      expect(timelineKeyForStatus('En Route')).toBe('departure');
      expect(timelineKeyForStatus('Arrived')).toBe('arrival');
      expect(timelineKeyForStatus('POD Submitted')).toBe('pod_upload');
      expect(timelineKeyForStatus('Completed')).toBe('completion');
    });

    it('falls back to "completion" for a status with no clean mapping', () => {
      expect(timelineKeyForStatus('Cancelled')).toBe('completion');
      expect(timelineKeyForStatus('Unloading')).toBe('gate_in');
    });
  });
});
