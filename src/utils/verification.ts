/**
 * One definition of "verified" for a driver or a vehicle, shared by every
 * page that renders a `VerificationBadge` beside one — a driver whose licence
 * has lapsed, or a vehicle whose registration or insurance has, is not
 * verified, regardless of which page is asking. Before this, Drivers and
 * Vehicles showed the mark unconditionally on every record; only the booking
 * cards under a shipment actually checked the expiry dates.
 */
/**
 * A driver is verified once their licence number is on record.
 *
 * It used to be a date comparison against `licenseExpiry`. A Djibouti driving
 * licence has no expiry, so that column was a deadline the system invented —
 * and every driver whose invented date had passed lost their tick for a reason
 * that does not exist on the paper. Dropped 2026-09-02; whether the licence
 * *document* has been filed is a separate question, answered by the compliance
 * tally on the Drivers list.
 */
export function isDriverVerified(driver: { drivingLicenseNumber?: string | null }): boolean {
  return Boolean(driver.drivingLicenseNumber?.trim());
}

export function isVehicleVerified(vehicle: {
  registrationExpiry?: string | null;
  insuranceExpiry?: string | null;
}): boolean {
  if (!vehicle.registrationExpiry || !vehicle.insuranceExpiry) return false;
  return (
    new Date(vehicle.registrationExpiry).getTime() > Date.now() &&
    new Date(vehicle.insuranceExpiry).getTime() > Date.now()
  );
}
