import { useState } from 'react';
import { CheckCircle2, Plus, X } from '@/design-system/icons';
import { PageHeader, TablePager, usePagedRows } from '@/components';
import {
  Button,
  LocationCard,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from '@/design-system';
import { AddLocationForm, type LocationFormData } from './AddLocationForm';

export interface LocationRecord {
  id: string;
  city: string;
  cityLabel?: string;
  address: string;
  addressLabel?: string;
}

const INITIAL_LOCATIONS: LocationRecord[] = [
  {
    id: 'LOC-00001',
    city: 'Djibouti',
    cityLabel: 'City',
    address: 'TCDORALE - Terminal Conteneur Doraleh',
    addressLabel: 'Address Type 1',
  },
  {
    id: 'LOC-00002',
    city: 'Djibouti',
    cityLabel: 'City',
    address: 'DFZ - Djibouti Free Zone',
    addressLabel: 'Address Type 1',
  },
  {
    id: 'LOC-00003',
    city: 'Djibouti',
    cityLabel: 'City',
    address: 'DMP - Djibouti Multipurpose Port',
    addressLabel: 'Address Type 1',
  },
  {
    id: 'LOC-00004',
    city: 'Djibouti',
    cityLabel: 'City',
    address: 'DIFTZ - Djibouti International Free Zone',
    addressLabel: 'Address Type 1',
  },
  {
    id: 'LOC-00005',
    city: 'Djibouti',
    cityLabel: 'City',
    address: 'TCPAID - Terminal Conteneur Paid',
    addressLabel: 'Address Type 1',
  },
  {
    id: 'LOC-00006',
    city: 'Djibouti',
    cityLabel: 'City',
    address: 'TPD - Terminal Petrolier Doraleh / Horizon Oil Terminal',
    addressLabel: 'Address Type 1',
  },
];

export function LocationsPage() {
  const [locations, setLocations] = useState<LocationRecord[]>(INITIAL_LOCATIONS);
  const [isAddLocationOpen, setIsAddLocationOpen] = useState(false);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  const [pageSize, setPageSize] = useState(12);
  const pagedLocations = usePagedRows(locations, { pageSize });

  const handleCreateLocationSuccess = (formData: LocationFormData) => {
    const newRecord: LocationRecord = {
      id: `LOC-${Math.floor(10 + Math.random() * 90)}`,
      city: formData.city,
      cityLabel: 'City',
      address: formData.addressType1,
      addressLabel: 'Address Type 1',
    };

    setLocations((prev) => [newRecord, ...prev]);
    setIsAddLocationOpen(false);
    setSuccessNotice(`New location in ${formData.city} (${formData.addressType1}) added successfully!`);
    setTimeout(() => setSuccessNotice(null), 5000);
  };

  const handleDeleteLocation = (id: string) => {
    setLocations((prev) => prev.filter((item) => item.id !== id));
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Toast Notification Alert */}
      {successNotice && (
        <div className="flex items-center justify-between p-4 rounded-lg bg-success-subtle border border-success text-success-subtle-foreground text-sm animate-in fade-in slide-in-from-top-2 shadow-xs">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-success-subtle-foreground shrink-0" />
            <span className="font-medium">{successNotice}</span>
          </div>
          <button
            type="button"
            onClick={() => setSuccessNotice(null)}
            className="p-1 rounded-md hover:bg-success-subtle dark:hover:bg-success-subtle transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Page Header with Top Right "+ New Location" Pill Button */}
      <PageHeader
        title="Locations"
        actions={
          <Button
            variant="primary"
            shape="pill"
            size="sm"
            onClick={() => setIsAddLocationOpen(true)}
            leadingIcon={<Plus className="h-4 w-4" />}
          >
            New Location
          </Button>
        }
      />

      {/* Side Sheet Drawer: Add Location Form coming from the right */}
      <Sheet open={isAddLocationOpen} onOpenChange={setIsAddLocationOpen}>
        <SheetContent
          side="right"
          className="flex h-full w-full flex-col gap-0 overflow-hidden border-l border-border bg-background p-0 sm:max-w-md"
        >
          <div className="shrink-0 space-y-1 border-b border-border/40 px-6 pb-4 pt-6 sm:px-8 sm:pt-8">
            <SheetTitle className="text-xl font-extrabold tracking-tight text-foreground">
              Add Location
            </SheetTitle>
            <SheetDescription className="text-xs text-muted-foreground">
              Fill in city and street address details, then set geographic coordinates on the interactive map.
            </SheetDescription>
          </div>

          <AddLocationForm
            onSuccess={handleCreateLocationSuccess}
            onCancel={() => setIsAddLocationOpen(false)}
            isCompact={true}
          />
        </SheetContent>
      </Sheet>

      {/* Locations Card List matching the screenshot design */}
      <div className="space-y-4 pt-2">
        {pagedLocations.rows.map((location) => (
          <LocationCard
            key={location.id}
            city={location.city}
            cityLabel={location.cityLabel || 'City'}
            address={location.address}
            addressLabel={location.addressLabel || 'Address Type 1'}
            onEdit={() => setIsAddLocationOpen(true)}
            onDelete={() => handleDeleteLocation(location.id)}
            onViewMap={() => alert(`Location: ${location.address}\nCity: ${location.city}`)}
          />
        ))}
      </div>

      {locations.length > 0 ? (
        <TablePager
          paged={pagedLocations}
          noun="locations"
          pageSize={pageSize}
          onPageSizeChange={setPageSize}
          pageSizeOptions={[12, 24, 48, 96]}
        />
      ) : null}
    </div>
  );
}

export default LocationsPage;
