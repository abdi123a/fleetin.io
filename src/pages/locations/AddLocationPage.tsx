import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from '@/design-system/icons';
import { PageHeader } from '@/components';
import { Button } from '@/design-system';
import { ROUTES } from '@/config/routes';
import { AddLocationForm } from './AddLocationForm';

export function AddLocationPage() {
  const navigate = useNavigate();
  const back = () => navigate(ROUTES.locations);

  return (
    <div className="mx-auto w-full min-w-0 max-w-4xl space-y-6 pb-12">
      <PageHeader
        title="Add Location"
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={back}
            leadingIcon={<ArrowLeft className="h-4 w-4" />}
          >
            Back to Locations
          </Button>
        }
      />
      <AddLocationForm onSuccess={back} onCancel={back} />
    </div>
  );
}

export default AddLocationPage;
