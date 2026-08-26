/**
 * One definition of "verified" for a driver or a vehicle, shared by every
 * page that renders a `VerificationBadge` beside one — a driver whose licence
 * has lapsed, or a vehicle whose registration or insurance has, is not
 * verified, regardless of which page is asking. Before this, Drivers and
 * Vehicles showed the mark unconditionally on every record; only the booking
 * cards under a shipment actually checked the expiry dates.
 */
export function isDriverVerified(driver: { licenseExpiry?: string | null }): boolean {
  if (!driver.licenseExpiry) return false;
  return new Date(driver.licenseExpiry).getTime() > Date.now();
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
