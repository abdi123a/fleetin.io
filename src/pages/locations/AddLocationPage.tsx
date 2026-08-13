import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from '@/design-system/icons';
import { PageHeader } from '@/components';
import { Button } from '@/design-system';
import { ROUTES } from '@/config/routes';
import { AddLocationForm, type LocationFormData } from './AddLocationForm';

export function AddLocationPage() {
  const navigate = useNavigate();

  const handleSuccess = (_data: LocationFormData) => {
    navigate(ROUTES.locations);
  };

  const handleCancel = () => {
    navigate(ROUTES.locations);
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6 pb-12">
      <PageHeader
        title="Add Location"
        description="Enter street address, city, and select location coordinates on the interactive map."
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate(ROUTES.locations)}
            leadingIcon={<ArrowLeft className="h-4 w-4" />}
          >
            Back to Locations
          </Button>
        }
      />

      <AddLocationForm onSuccess={handleSuccess} onCancel={handleCancel} />
    </div>
  );
}

export default AddLocationPage;
