import React, { useState } from 'react';
import {
  Compass,
  Maximize,
  Minimize,
  MapPin as MapPinIcon,
} from '@/design-system/icons';
import { Button, Card, Input, Select } from '@/design-system';

export interface LocationFormData {
  city: string;
  addressType1: string;
  addressType2: string;
  addressType3: string;
  postalCode: string;
  latitude: string;
  longitude: string;
}

const CITY_OPTIONS = [
  { value: 'Mogadishu', label: 'Mogadishu' },
  { value: 'Nairobi', label: 'Nairobi' },
  { value: 'Djibouti', label: 'Djibouti' },
  { value: 'Addis Ababa', label: 'Addis Ababa' },
  { value: 'Hargeisa', label: 'Hargeisa' },
  { value: 'Kismayo', label: 'Kismayo' },
  { value: 'Bossaso', label: 'Bossaso' },
  { value: 'Garowe', label: 'Garowe' },
  { value: 'Berbera', label: 'Berbera' },
  { value: 'Mombasa', label: 'Mombasa' },
  { value: 'Dar es Salaam', label: 'Dar es Salaam' },
  { value: 'Kampala', label: 'Kampala' },
  { value: 'Kigali', label: 'Kigali' },
];

export interface AddLocationFormProps {
  onSuccess?: (data: LocationFormData) => void;
  onCancel?: () => void;
  isCompact?: boolean;
}

export function AddLocationForm({ onSuccess, onCancel, isCompact = false }: AddLocationFormProps) {
  const [formData, setFormData] = useState<LocationFormData>({
    city: '',
    addressType1: '',
    addressType2: '',
    addressType3: '',
    postalCode: '',
    latitude: '0',
    longitude: '0',
  });

  const [mapMode, setMapMode] = useState<'map' | 'satellite'>('map');
  const [isMaximized, setIsMaximized] = useState(false);
  const [pinPos, setPinPos] = useState<{ x: number; y: number } | null>(null);
  const [errors, setErrors] = useState<{ city?: string; addressType1?: string }>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleInputChange = (field: keyof LocationFormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field as keyof typeof errors]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  };

  const handleMapClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const relX = clickX / rect.width;
    const relY = clickY / rect.height;

    const latVal = (15 - relY * 20).toFixed(6);
    const lonVal = (32 + relX * 20).toFixed(6);

    setPinPos({ x: (clickX / rect.width) * 100, y: (clickY / rect.height) * 100 });
    setFormData((prev) => ({
      ...prev,
      latitude: latVal,
      longitude: lonVal,
    }));
  };

  const handleRecenter = () => {
    setPinPos({ x: 58, y: 48 });
    setFormData((prev) => ({
      ...prev,
      latitude: '11.8251',
      longitude: '42.5903',
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const newErrors: { city?: string; addressType1?: string } = {};
    if (!formData.city) newErrors.city = 'City is required';
    if (!formData.addressType1) newErrors.addressType1 = 'Address Type 1 is required';

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setIsSubmitting(true);
    setTimeout(() => {
      setIsSubmitting(false);
      onSuccess?.(formData);
    }, 600);
  };

  return (
    <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-5 sm:px-8">
      <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1">
          <div className="relative">
            <Select
              id="form-city-select"
              value={formData.city}
              placeholder="City *"
              options={CITY_OPTIONS}
              onChange={(e) => handleInputChange('city', e.target.value)}
              hasError={Boolean(errors.city)}
            />
            {formData.city && (
              <label
                htmlFor="form-city-select"
                className="absolute -top-2.5 left-3 z-20 bg-background px-1 text-[11px] font-medium text-muted-foreground"
              >
                City *
              </label>
            )}
          </div>
          {errors.city && <p className="text-xs text-destructive">{errors.city}</p>}
        </div>

        <div className="space-y-1">
          <div className="relative">
            <Input
              id="form-addressType1"
              type="text"
              value={formData.addressType1}
              placeholder={formData.addressType1 ? '' : 'Address Type 1 *'}
              onChange={(e) => handleInputChange('addressType1', e.target.value)}
              hasError={Boolean(errors.addressType1)}
            />
            {formData.addressType1 && (
              <label
                htmlFor="form-addressType1"
                className="absolute -top-2.5 left-3 z-20 bg-background px-1 text-[11px] font-medium text-muted-foreground"
              >
                Address Type 1 *
              </label>
            )}
          </div>
          {errors.addressType1 && (
            <p className="text-xs text-destructive">{errors.addressType1}</p>
          )}
        </div>

        <div className="relative">
          <Input
            id="form-addressType2"
            type="text"
            value={formData.addressType2}
            placeholder={formData.addressType2 ? '' : 'Address Type 2'}
            onChange={(e) => handleInputChange('addressType2', e.target.value)}
          />
          {formData.addressType2 && (
            <label
              htmlFor="form-addressType2"
              className="absolute -top-2.5 left-3 z-20 bg-background px-1 text-[11px] font-medium text-muted-foreground"
            >
              Address Type 2
            </label>
          )}
        </div>

        <div className="relative">
          <Input
            id="form-addressType3"
            type="text"
            value={formData.addressType3}
            placeholder={formData.addressType3 ? '' : 'Address Type 3'}
            onChange={(e) => handleInputChange('addressType3', e.target.value)}
          />
          {formData.addressType3 && (
            <label
              htmlFor="form-addressType3"
              className="absolute -top-2.5 left-3 z-20 bg-background px-1 text-[11px] font-medium text-muted-foreground"
            >
              Address Type 3
            </label>
          )}
        </div>

        <div className="relative sm:col-span-1">
          <Input
            id="form-postalCode"
            type="text"
            value={formData.postalCode}
            placeholder={formData.postalCode ? '' : 'Postal Code'}
            onChange={(e) => handleInputChange('postalCode', e.target.value)}
          />
          {formData.postalCode && (
            <label
              htmlFor="form-postalCode"
              className="absolute -top-2.5 left-3 z-20 bg-background px-1 text-[11px] font-medium text-muted-foreground"
            >
              Postal Code
            </label>
          )}
        </div>
      </div>

      <Card
        className={`relative w-full border border-border bg-muted dark:bg-card overflow-hidden transition-all shadow-xs p-0 ${isMaximized ? 'h-[500px]' : isCompact ? 'h-[280px]' : 'h-[360px]'
          }`}
      >
        <div className="absolute top-2.5 left-2.5 z-20 flex items-center bg-background/95 backdrop-blur border border-border rounded-md shadow-2xs p-0.5 text-xs font-medium">
          <button
            type="button"
            onClick={() => setMapMode('map')}
            className={`px-2.5 py-1 rounded-sm transition-all ${mapMode === 'map'
              ? 'bg-primary/10 text-primary font-semibold'
              : 'text-foreground hover:bg-muted'
              }`}
          >
            Map
          </button>
          <button
            type="button"
            onClick={() => setMapMode('satellite')}
            className={`px-2.5 py-1 rounded-sm transition-all ${mapMode === 'satellite'
              ? 'bg-primary/10 text-primary font-semibold'
              : 'text-foreground hover:bg-muted'
              }`}
          >
            Satellite
          </button>
        </div>

        <div className="absolute top-2.5 right-2.5 z-20">
          <button
            type="button"
            onClick={() => setIsMaximized((prev) => !prev)}
            aria-label="Toggle Fullscreen Map"
            className="flex items-center justify-center h-8 w-8 bg-background/95 backdrop-blur border border-border rounded-md shadow-2xs text-foreground hover:bg-muted transition-colors"
          >
            {isMaximized ? <Minimize className="h-3.5 w-3.5" /> : <Maximize className="h-3.5 w-3.5" />}
          </button>
        </div>

        <div
          onClick={handleMapClick}
          className="relative h-full w-full cursor-crosshair select-none overflow-hidden"
        >
          <svg className="h-full w-full" viewBox="0 0 1000 600" preserveAspectRatio="none">
            <defs>
              <linearGradient id="oceanGradFormDS" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor={mapMode === 'satellite' ? '#11293a' : '#77c3e5'} />
                <stop offset="100%" stopColor={mapMode === 'satellite' ? '#0a1d2c' : '#5db3dc'} />
              </linearGradient>

              <linearGradient id="landGradFormDS" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor={mapMode === 'satellite' ? '#2d3b2a' : '#e6f3e6'} />
                <stop offset="100%" stopColor={mapMode === 'satellite' ? '#243222' : '#d8ebd8'} />
              </linearGradient>
            </defs>

            <rect width="1000" height="600" fill="url(#oceanGradFormDS)" />

            <path
              d="M0,0 L400,0 L350,150 L250,220 L180,300 L120,400 L0,500 Z"
              fill="url(#landGradFormDS)"
              stroke={mapMode === 'satellite' ? '#334433' : '#a8cca8'}
              strokeWidth="1.5"
            />
            <path
              d="M250,220 L480,180 L620,240 L800,280 L750,380 L650,450 L450,550 L350,600 L120,600 L180,300 Z"
              fill="url(#landGradFormDS)"
              stroke={mapMode === 'satellite' ? '#334433' : '#a8cca8'}
              strokeWidth="1.5"
            />
            <path
              d="M500,0 L1000,0 L1000,220 L750,230 L600,160 L500,100 Z"
              fill="url(#landGradFormDS)"
              stroke={mapMode === 'satellite' ? '#334433' : '#a8cca8'}
              strokeWidth="1.5"
            />

            <path
              d="M300,100 L350,150 M250,220 L350,250 L420,240 M420,240 L520,320 L580,380 M580,380 L680,480"
              stroke="#666666"
              strokeWidth="1.2"
              strokeDasharray="4 3"
            />

            <g
              className={`text-[12px] font-sans font-semibold ${mapMode === 'satellite' ? 'fill-muted' : 'fill-foreground'
                }`}
            >
              <text x="90" y="160">Khartoum</text>
              <text x="270" y="140">Eritrea</text>
              <text x="630" y="150" className="text-[13px] font-bold">Yemen</text>
              <text x="600" y="170">Sanaa</text>
              <text x="450" y="240" className="text-[13px] font-bold">Djibouti</text>
              <text x="320" y="320" className="text-[14px] font-bold">Ethiopia</text>
              <text x="450" y="340">Dire Dawa</text>
              <text x="60" y="420">Juba</text>
              <text x="640" y="280" className="text-[12px] font-medium fill-info">
                Gulf of Aden
              </text>
            </g>
          </svg>

          {pinPos ? (
            <div
              className="absolute z-30 -translate-x-1/2 -translate-y-full transition-all duration-300 pointer-events-none"
              style={{ left: `${pinPos.x}%`, top: `${pinPos.y}%` }}
            >
              <div className="relative flex flex-col items-center">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-destructive text-white shadow-lg border-2 border-white animate-bounce">
                  <MapPinIcon className="h-4 w-4 fill-white text-destructive-subtle-foreground" />
                </div>
                <div className="h-1.5 w-3 rounded-full bg-black/30 blur-xs mt-0.5" />
              </div>
            </div>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="rounded-full bg-background/95 backdrop-blur px-3 py-1.5 text-xs font-medium text-muted-foreground shadow-md border border-border">
                Click map to select coordinates pin
              </div>
            </div>
          )}
        </div>

        <div className="absolute bottom-2 left-2.5 z-20 flex items-center gap-2 text-[10px] text-foreground dark:text-muted-foreground font-sans pointer-events-none">
          <span className="font-bold text-xs tracking-tighter text-foreground dark:text-white">
            Google
          </span>
          <span className="hidden sm:inline">Map data ©2026 Google</span>
        </div>

        <div className="absolute bottom-2.5 right-2.5 z-20">
          <button
            type="button"
            onClick={handleRecenter}
            title="Recenter location pin"
            className="flex items-center justify-center h-8 w-8 rounded-full bg-background/95 backdrop-blur border border-border text-foreground hover:bg-muted shadow-2xs transition-colors"
          >
            <Compass className="h-4 w-4 text-primary" />
          </button>
        </div>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="relative">
          <Input
            id="form-latitude"
            type="text"
            value={formData.latitude}
            onChange={(e) => handleInputChange('latitude', e.target.value)}
          />
          <label
            htmlFor="form-latitude"
            className="absolute -top-2.5 left-3 z-20 bg-background px-1 text-[11px] font-medium text-muted-foreground"
          >
            Latitude
          </label>
        </div>

        <div className="relative">
          <Input
            id="form-longitude"
            type="text"
            value={formData.longitude}
            onChange={(e) => handleInputChange('longitude', e.target.value)}
          />
          <label
            htmlFor="form-longitude"
            className="absolute -top-2.5 left-3 z-20 bg-background px-1 text-[11px] font-medium text-muted-foreground"
          >
            Longitude
          </label>
        </div>
      </div>

      </div>
      </div>

      <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border/40 bg-background px-6 py-4 sm:px-8">
        {onCancel && (
          <Button
            type="button"
            onClick={onCancel}
            variant="outline"
            size="sm"
            className="rounded-lg"
          >
            Cancel
          </Button>
        )}

        <Button
          type="submit"
          isLoading={isSubmitting}
          size="sm"
          className="rounded-lg bg-primary px-5 font-semibold text-primary-foreground"
        >
          Save
        </Button>
      </div>
    </form>
  );
}