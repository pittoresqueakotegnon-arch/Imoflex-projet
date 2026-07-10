import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { X, Check } from 'lucide-react';
import { PropertyType } from '../../lib/supabase';
import { formatMontant } from '../../lib/utils';

const PROPERTY_TYPE_OPTIONS: { value: PropertyType; label: string }[] = [
  { value: 'appartement', label: 'Appartement' },
  { value: 'studio', label: 'Studio' },
  { value: 'chambre', label: 'Chambre' },
  { value: 'maison', label: 'Maison' },
  { value: 'bureau', label: 'Bureau' },
  { value: 'parcelle', label: 'Parcelle' },
];

const BEDROOM_OPTIONS = [
  { label: '1+', value: 1 },
  { label: '2+', value: 2 },
  { label: '3+', value: 3 },
  { label: '4+', value: 4 },
];

const BUDGET_MIN = 10000;
const BUDGET_MAX = 150000;
const BUDGET_STEP = 5000;

// Petite case à cocher réutilisable, dans le style "checkbox-row-mini" de la maquette
const FilterCheckbox: React.FC<{ checked: boolean; label: string; onToggle: () => void }> = ({
  checked,
  label,
  onToggle,
}) => (
  <button
    type="button"
    onClick={onToggle}
    className="flex items-center gap-3 py-2 w-full text-left"
  >
    <div
      className={`w-5 h-5 rounded-md flex items-center justify-center border transition-colors flex-shrink-0 ${
        checked ? 'bg-[#7B3FE4] border-[#7B3FE4]' : 'border-[rgba(255,255,255,0.2)] bg-transparent'
      }`}
    >
      {checked && <Check size={14} className="text-white" />}
    </div>
    <span className="text-sm font-grotesk text-[#E8E0FF]">{label}</span>
  </button>
);

const Filtres: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [minBudget, setMinBudget] = useState(BUDGET_MIN);
  const [maxBudget, setMaxBudget] = useState(BUDGET_MAX);
  const [selectedTypes, setSelectedTypes] = useState<PropertyType[]>([]);
  const [minBedrooms, setMinBedrooms] = useState<number | null>(null);
  const [availableOnly, setAvailableOnly] = useState(false);
  const [progressiveOnly, setProgressiveOnly] = useState(false);

  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<'min' | 'max' | null>(null);

  // Charger les valeurs depuis l'URL
  useEffect(() => {
    const minRent = searchParams.get('minRent');
    const maxRent = searchParams.get('maxRent');
    const types = searchParams.get('types');
    const bedrooms = searchParams.get('bedrooms');
    const available = searchParams.get('available');
    const progressive = searchParams.get('progressive');

    if (minRent) setMinBudget(parseInt(minRent));
    if (maxRent) setMaxBudget(parseInt(maxRent));
    if (types) setSelectedTypes(types.split(',') as PropertyType[]);
    if (bedrooms) setMinBedrooms(parseInt(bedrooms));
    if (available === 'true') setAvailableOnly(true);
    if (progressive === 'true') setProgressiveOnly(true);
  }, [searchParams]);

  // Slider double curseur (budget min/max) — pas de librairie, deux poignées sur une même piste
  const percentFor = (value: number) => ((value - BUDGET_MIN) / (BUDGET_MAX - BUDGET_MIN)) * 100;

  const valueFromClientX = (clientX: number): number => {
    if (!trackRef.current) return BUDGET_MIN;
    const rect = trackRef.current.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const raw = BUDGET_MIN + ratio * (BUDGET_MAX - BUDGET_MIN);
    return Math.round(raw / BUDGET_STEP) * BUDGET_STEP;
  };

  useEffect(() => {
    if (!dragging) return;

    const handleMove = (e: MouseEvent | TouchEvent) => {
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const value = valueFromClientX(clientX);
      if (dragging === 'min') {
        setMinBudget(Math.min(value, maxBudget - BUDGET_STEP));
      } else {
        setMaxBudget(Math.max(value, minBudget + BUDGET_STEP));
      }
    };
    const handleUp = () => setDragging(null);

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    window.addEventListener('touchmove', handleMove);
    window.addEventListener('touchend', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
      window.removeEventListener('touchmove', handleMove);
      window.removeEventListener('touchend', handleUp);
    };
  }, [dragging, minBudget, maxBudget]);

  const handleTypeToggle = (type: PropertyType) => {
    setSelectedTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  };

  const handleApplyFilters = () => {
    const params = new URLSearchParams();

    if (minBudget !== BUDGET_MIN) params.set('minRent', minBudget.toString());
    if (maxBudget !== BUDGET_MAX) params.set('maxRent', maxBudget.toString());
    if (selectedTypes.length > 0) params.set('types', selectedTypes.join(','));
    if (minBedrooms !== null) params.set('bedrooms', minBedrooms.toString());
    if (availableOnly) params.set('available', 'true');
    if (progressiveOnly) params.set('progressive', 'true');

    navigate(`/?${params.toString()}`);
  };

  const handleReset = () => {
    setMinBudget(BUDGET_MIN);
    setMaxBudget(BUDGET_MAX);
    setSelectedTypes([]);
    setMinBedrooms(null);
    setAvailableOnly(false);
    setProgressiveOnly(false);
    navigate('/');
  };

  return (
    <div className="page-container pb-24">
      {/* Header — X à gauche, titre centré, comme la maquette */}
      <header className="bg-[#0D0720] sticky top-0 z-40 border-b border-[rgba(123,63,228,0.1)] px-4 py-4 flex items-center">
        <button onClick={() => navigate(-1)} className="text-[#E8E0FF] hover:text-[#A855F7] transition-colors">
          <X size={22} />
        </button>
        <h1 className="section-title text-lg flex-1 text-center pr-6">Filtres</h1>
      </header>

      {/* Content */}
      <div className="px-4 py-6 space-y-7">
        {/* Budget mensuel — slider double curseur */}
        <div>
          <label className="label block mb-4">Budget mensuel</label>
          <div ref={trackRef} className="relative h-1.5 bg-[#261C55] rounded-full mx-1 mb-3">
            <div
              className="absolute h-1.5 bg-[#7B3FE4] rounded-full"
              style={{
                left: `${percentFor(minBudget)}%`,
                right: `${100 - percentFor(maxBudget)}%`,
              }}
            />
            <div
              onMouseDown={() => setDragging('min')}
              onTouchStart={() => setDragging('min')}
              className="absolute top-1/2 w-5 h-5 bg-white border-2 border-[#7B3FE4] rounded-full -translate-y-1/2 -translate-x-1/2 cursor-pointer touch-none"
              style={{ left: `${percentFor(minBudget)}%` }}
            />
            <div
              onMouseDown={() => setDragging('max')}
              onTouchStart={() => setDragging('max')}
              className="absolute top-1/2 w-5 h-5 bg-white border-2 border-[#7B3FE4] rounded-full -translate-y-1/2 -translate-x-1/2 cursor-pointer touch-none"
              style={{ left: `${percentFor(maxBudget)}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-[#8B7BB5]">
            <span>{formatMontant(minBudget)}</span>
            <span>{formatMontant(maxBudget)}</span>
          </div>
        </div>

        {/* Type de bien — cases à cocher, comme la maquette */}
        <div>
          <label className="label block mb-2">Type de bien</label>
          <div>
            {PROPERTY_TYPE_OPTIONS.map((opt) => (
              <FilterCheckbox
                key={opt.value}
                checked={selectedTypes.includes(opt.value)}
                label={opt.label}
                onToggle={() => handleTypeToggle(opt.value)}
              />
            ))}
          </div>
        </div>

        {/* Chambres */}
        <div>
          <label className="label block mb-3">Chambres</label>
          <div className="flex gap-2 flex-wrap">
            {BEDROOM_OPTIONS.map((option) => (
              <button
                key={option.value}
                onClick={() => setMinBedrooms(minBedrooms === option.value ? null : option.value)}
                className={`px-4 py-2 rounded-full text-sm font-grotesk transition-all ${
                  minBedrooms === option.value
                    ? 'bg-[#7B3FE4] text-white'
                    : 'bg-[#261C55] text-[#8B7BB5] border border-[rgba(255,255,255,0.1)] hover:border-[#7B3FE4]'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {/* Disponible uniquement + Paiement progressif — cases à cocher, pas des toggles */}
        <div>
          <FilterCheckbox
            checked={availableOnly}
            label="Disponible uniquement"
            onToggle={() => setAvailableOnly(!availableOnly)}
          />
          <FilterCheckbox
            checked={progressiveOnly}
            label="Paiement progressif ImoFlex"
            onToggle={() => setProgressiveOnly(!progressiveOnly)}
          />
        </div>
      </div>

      {/* Footer — un seul CTA, comme la maquette */}
      <div className="fixed bottom-0 left-0 right-0 bg-[#120D2A] border-t border-[rgba(123,63,228,0.1)] p-4">
        <button onClick={handleApplyFilters} className="w-full btn-primary font-grotesk">
          Appliquer les filtres
        </button>
      </div>
    </div>
  );
};

export default Filtres;
