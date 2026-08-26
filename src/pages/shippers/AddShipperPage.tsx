import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from '@/design-system/icons';
import { PageHeader } from '@/components';
import { Button } from '@/design-system';
import { ROUTES } from '@/config/routes';
import { AddShipperForm, type ShipperFormData } from './AddShipperForm';

export function AddShipperPage() {
  const navigate = useNavigate();

  const handleSuccess = (_data: ShipperFormData) => {
    navigate(ROUTES.shippers);
  };

  const handleCancel = () => {
    navigate(ROUTES.shippers);
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6 pb-12">
      <PageHeader
        title="New Shipper"
        description="Legal name, address and identification."
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate(ROUTES.shippers)}
            leadingIcon={<ArrowLeft className="h-4 w-4" />}
          >
            Back to shippers
          </Button>
        }
      />

      <AddShipperForm onSuccess={handleSuccess} onCancel={handleCancel} />
    </div>
  );
}

export default AddShipperPage;
