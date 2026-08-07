import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, X, Plus } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { useAuth } from '../../hooks/useAuth';
import { supabase, PropertyType } from '../../lib/supabase';
import { propertyTypeLabel } from '../../lib/utils';
import { logAction } from '../../lib/audit';
import { useToast } from '../../components/Toast';
import { diagnoseAndShowError } from '../../utils/errorDiagnostics';
import { processImage } from '../../lib/imageOptimization';

const PROPERTY_TYPES: PropertyType[] = ['chambre', 'studio', 'appartement', 'maison', 'bureau', 'parcelle'];
const AMENITIES = ['Électricité', 'Eau courante', 'Parking', 'Climatisation', 'WiFi', 'Sécurité', 'Balcon', 'Meublé'];

const Publier: React.FC = () => {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { showToast } = useToast();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Image Upload State
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadStatus, setUploadStatus] = useState('');
  const [uploadProgress, setUploadProgress] = useState(0);

  // Generate listing ID upfront for storage naming convention
  const [listingId] = useState(() => uuidv4());

  // Step 1: Photos & basic info
  // We store the photoId and the thumbUrl for preview, plus the publicBaseUrl to save in DB
  const [uploadedPhotos, setUploadedPhotos] = useState<{ id: string, thumbUrl: string, publicBaseUrl: string }[]>([]);
  const [title, setTitle] = useState('');
  const [propertyType, setPropertyType] = useState<PropertyType>('appartement');
  const [monthlyRent, setMonthlyRent] = useState('');
  const [city, setCity] = useState('Cotonou');
  const [neighborhood, setNeighborhood] = useState('');
  const [address, setAddress] = useState('');

  // Step 2: Details & equipment
  const [depositAmount, setDepositAmount] = useState('');
  const [advanceAmount, setAdvanceAmount] = useState('');
  const [bedrooms, setBedrooms] = useState('');
  const [selectedAmenities, setSelectedAmenities] = useState<string[]>([]);
  const [description, setDescription] = useState('');
  const [houseRules, setHouseRules] = useState('');
  const [acceptsProgressive, setAcceptsProgressive] = useState(false);

  const handlePhotoUpload = async (file: File, index: number) => {
    if (!profile?.id) return;

    setUploadingImage(true);
    setUploadStatus('Optimisation...');
    setUploadProgress(10);
    try {
      const photoId = uuidv4();
      
      // 1. Process & Compress Images
      const { hd, medium, thumb } = await processImage(file);
      setUploadProgress(30);

      const storageParams = { upsert: false, cacheControl: '31536000' };
      const bucket = supabase.storage.from('listing-photos');

      // 2. Upload versions
      setUploadStatus('Envoi HD...');
      const { error: hdError } = await bucket.upload(`${listingId}/photo_${photoId}_hd.webp`, hd, storageParams);
      if (hdError) throw hdError;
      setUploadProgress(50);

      setUploadStatus('Envoi Medium...');
      const { error: medError } = await bucket.upload(`${listingId}/photo_${photoId}_medium.webp`, medium, storageParams);
      if (medError) throw medError;
      setUploadProgress(70);

      setUploadStatus('Envoi Thumbnail...');
      const { error: thumbError } = await bucket.upload(`${listingId}/photo_${photoId}_thumb.webp`, thumb, storageParams);
      if (thumbError) throw thumbError;
      setUploadProgress(90);

      // 3. URLs
      const basePath = `${listingId}/photo_${photoId}`;
      const publicBaseUrl = bucket.getPublicUrl(basePath).data.publicUrl;
      const thumbUrl = bucket.getPublicUrl(`${basePath}_thumb.webp`).data.publicUrl;

      const newPhotos = [...uploadedPhotos];
      newPhotos[index] = { id: photoId, thumbUrl, publicBaseUrl };
      setUploadedPhotos(newPhotos);

      setUploadStatus('Image optimisée avec succès !');
      setUploadProgress(100);
      setTimeout(() => { setUploadStatus(''); setUploadProgress(0); }, 1500);
    } catch (err) {
      diagnoseAndShowError(err, 'Gestion Logement/Contrat');
      setUploadStatus('');
      setUploadProgress(0);
    } finally {
      setUploadingImage(false);
    }
  };

  const handlePhotoInputChange = (e: React.ChangeEvent<HTMLInputElement>, index: number) => {
    const file = e.target.files?.[0];
    if (file) {
      handlePhotoUpload(file, index);
    }
  };

  const removePhoto = (index: number) => {
    const newPhotos = [...uploadedPhotos];
    newPhotos.splice(index, 1);
    setUploadedPhotos(newPhotos);
  };

  const validateStep1 = (): boolean => {
    if (!title.trim()) {
      setError('Le titre est requis');
      return false;
    }
    if (!monthlyRent || parseInt(monthlyRent) <= 0) {
      setError('Le loyer mensuel doit être supérieur à 0');
      return false;
    }
    if (!address.trim()) {
      setError('L\'adresse est requise');
      return false;
    }
    setError(null);
    return true;
  };

  const handleSubmit = async () => {
    if (!profile?.id) return;

    setLoading(true);
    try {
      // Create listing
      const { data: listingData, error: listingError } = await supabase
        .from('listings')
        .insert({
          id: listingId,
          owner_id: profile.id,
          title,
          city,
          neighborhood: neighborhood || null,
          address,
          property_type: propertyType,
          monthly_rent: parseInt(monthlyRent),
          deposit_amount: depositAmount ? parseInt(depositAmount) : null,
          advance_amount: advanceAmount ? parseInt(advanceAmount) : null,
          bedrooms: bedrooms ? parseInt(bedrooms) : null,
          description: description || null,
          amenities: selectedAmenities,
          house_rules: houseRules || null,
          accepts_progressive_payment: acceptsProgressive,
          is_published: true, // Publication instantanée — modération a posteriori
          status: 'publiee',
          availability_status: 'disponible',
        })
        .select('id')
        .single();

      if (listingError) throw listingError;

      // Create listing photos
      for (let i = 0; i < uploadedPhotos.length; i++) {
        const { error: photoError } = await supabase
          .from('listing_photos')
          .insert({
            listing_id: listingData.id,
            photo_url: uploadedPhotos[i].publicBaseUrl, // Contains base url, consumers will append _thumb.webp, etc.
            display_order: i,
            is_cover: i === 0,
          });

        if (photoError) throw photoError;
      }

      // Log action
      await logAction({
        userId: profile.id,
        action: 'publication_annonce',
        entityType: 'listings',
        entityId: listingData.id,
        details: { title, city, propertyType, monthlyRent: parseInt(monthlyRent) }
      });

      showToast('Annonce publiée avec succès !', 'success');
      navigate('/pro/annonces');
    } catch (err) {
      diagnoseAndShowError(err, 'Gestion Logement/Contrat');
    } finally {
      setLoading(false);
    }
  };

  if (step === 1) {
    return (
      <div className="page-container">
        <div className="px-4 pt-6 pb-4">
          <div className="flex items-center gap-3 mb-6">
            <button
              onClick={() => navigate('/pro/annonces')}
              className="p-2 hover:bg-[#261C55] rounded-lg transition"
            >
              <ArrowLeft size={24} />
            </button>
            <h1 className="text-2xl font-nunito font-900">Nouvelle annonce</h1>
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500 rounded-lg p-3 mb-4">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          {/* Photo Gallery */}
          <div className="mb-6">
            <h2 className="section-title mb-4">GALERIE PHOTO</h2>
            <div className="grid grid-cols-4 gap-3">
              {uploadedPhotos.map((photo, index) => (
                <div key={index} className="relative aspect-square">
                  <div className="w-full h-full rounded-2xl border border-[rgba(255,255,255,0.1)] overflow-hidden bg-[#261C55]">
                    <img
                      src={photo.thumbUrl}
                      alt={`Photo ${index + 1}`}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <button
                    onClick={e => {
                      e.preventDefault();
                      removePhoto(index);
                    }}
                    className="absolute -top-2 -right-2 p-1 bg-red-500 rounded-full text-white shadow-lg hover:bg-red-600 z-10"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
              
              {uploadedPhotos.length < 12 && (
                <div className="aspect-square">
                  <input
                    type="file"
                    accept="image/jpeg, image/png, image/webp, .jpg, .jpeg, .png, .webp"
                    onChange={e => handlePhotoInputChange(e, uploadedPhotos.length)}
                    className="hidden"
                    id="photo-upload-new"
                    disabled={uploadingImage}
                  />
                  <label
                    htmlFor="photo-upload-new"
                    className={`w-full h-full rounded-2xl border-2 border-dashed transition flex items-center justify-center bg-[#261C55] ${
                      uploadingImage 
                        ? 'border-[#A855F7]/10 opacity-70 cursor-not-allowed' 
                        : 'border-[#A855F7]/30 hover:border-[#A855F7]/60 cursor-pointer'
                    }`}
                  >
                    {uploadingImage ? (
                      <div className="w-5 h-5 border-2 border-[#A855F7] border-t-transparent rounded-full animate-spin"></div>
                    ) : (
                      <Plus size={20} className="text-[#8B7BB5]" />
                    )}
                  </label>
                </div>
              )}
            </div>

            {/* Upload Progress Bar */}
            {uploadingImage && uploadStatus && (
              <div className="mt-4">
                <div className="flex justify-between text-xs text-[#8B7BB5] font-grotesk mb-1.5">
                  <span>{uploadStatus}</span>
                  <span>{uploadProgress}%</span>
                </div>
                <div className="w-full h-1.5 bg-[#1A1240] rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-purple-500 to-[#A855F7] transition-all duration-300 ease-out"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              </div>
            )}

            <div className="flex justify-between items-center mt-2">
              <span className="text-[10px] text-[#8B7BB5]" style={{ fontFamily: 'Space Grotesk' }}>
                * La 1ère photo sera la couverture
              </span>
              <span className="text-[10px] text-[#8B7BB5]" style={{ fontFamily: 'Space Grotesk' }}>
                {uploadedPhotos.length}/12 photos
              </span>
            </div>
          </div>

          {/* Title */}
          <div className="mb-4">
            <label className="label block mb-2">TITRE DE L'ANNONCE</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="input-field"
              placeholder="Ex: Bel appartement 2 chambres"
            />
          </div>

          {/* Property Type */}
          <div className="mb-4">
            <label className="label block mb-2">TYPE DE BIEN</label>
            <select value={propertyType} onChange={e => setPropertyType(e.target.value as PropertyType)} className="input-field">
              {PROPERTY_TYPES.map(type => (
                <option key={type} value={type}>
                  {propertyTypeLabel(type)}
                </option>
              ))}
            </select>
          </div>

          {/* Monthly Rent */}
          <div className="mb-4">
            <label className="label block mb-2">LOYER MENSUEL</label>
            <div className="relative">
              <input
                type="number"
                value={monthlyRent}
                onChange={e => setMonthlyRent(e.target.value)}
                className="input-field"
                placeholder="0"
              />
              <span className="absolute right-4 top-1/2 transform -translate-y-1/2 text-text-dim text-sm">FCFA</span>
            </div>
          </div>

          {/* City */}
          <div className="mb-4">
            <label className="label block mb-2">VILLE</label>
            <input
              type="text"
              value={city}
              onChange={e => setCity(e.target.value)}
              className="input-field"
            />
          </div>

          {/* Neighborhood */}
          <div className="mb-4">
            <label className="label block mb-2">QUARTIER (OPTIONNEL)</label>
            <input
              type="text"
              value={neighborhood}
              onChange={e => setNeighborhood(e.target.value)}
              className="input-field"
              placeholder="Ex: Plateu"
            />
          </div>

          {/* Address */}
          <div className="mb-6">
            <label className="label block mb-2">ADRESSE</label>
            <textarea
              value={address}
              onChange={e => setAddress(e.target.value)}
              className="input-field resize-none h-20"
              placeholder="Adresse complète du bien"
            />
          </div>

          <button
            onClick={() => validateStep1() && setStep(2)}
            className="btn-primary w-full mb-4"
          >
            Continuer →
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container">
      <div className="px-4 pt-6 pb-4">
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => setStep(1)}
            className="p-2 hover:bg-[#261C55] rounded-lg transition"
          >
            <ArrowLeft size={24} />
          </button>
          <h1 className="text-2xl font-nunito font-900">Détails du bien</h1>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500 rounded-lg p-3 mb-4">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        {/* Deposit Amount */}
        <div className="mb-4">
          <label className="label block mb-2">CAUTION DEMANDÉE (OPTIONNEL)</label>
          <div className="relative">
            <input
              type="number"
              value={depositAmount}
              onChange={e => setDepositAmount(e.target.value)}
              className="input-field"
              placeholder="0"
            />
            <span className="absolute right-4 top-1/2 transform -translate-y-1/2 text-text-dim text-sm">FCFA</span>
          </div>
        </div>

        {/* Advance Amount */}
        <div className="mb-4">
          <label className="label block mb-2">AVANCE DEMANDÉE (OPTIONNEL)</label>
          <div className="relative">
            <input
              type="number"
              value={advanceAmount}
              onChange={e => setAdvanceAmount(e.target.value)}
              className="input-field"
              placeholder="0"
            />
            <span className="absolute right-4 top-1/2 transform -translate-y-1/2 text-text-dim text-sm">FCFA</span>
          </div>
        </div>

        {/* Bedrooms */}
        <div className="mb-6">
          <label className="label block mb-2">NOMBRE DE CHAMBRES (OPTIONNEL)</label>
          <input
            type="number"
            value={bedrooms}
            onChange={e => setBedrooms(e.target.value)}
            className="input-field"
            placeholder="0"
          />
        </div>

        {/* Amenities */}
        <div className="mb-6">
          <label className="label block mb-3">ÉQUIPEMENTS DISPONIBLES</label>
          <div className="grid grid-cols-2 gap-2">
            {AMENITIES.map(amenity => (
              <label key={amenity} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedAmenities.includes(amenity)}
                  onChange={e => {
                    if (e.target.checked) {
                      setSelectedAmenities([...selectedAmenities, amenity]);
                    } else {
                      setSelectedAmenities(selectedAmenities.filter(a => a !== amenity));
                    }
                  }}
                  className="w-4 h-4 rounded accent-violet"
                />
                <span className="text-sm">{amenity}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Description */}
        <div className="mb-4">
          <label className="label block mb-2">DESCRIPTION (OPTIONNEL)</label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            className="input-field resize-none h-20"
            placeholder="Décrivez votre bien..."
          />
        </div>

        {/* House Rules */}
        <div className="mb-6">
          <label className="label block mb-2">RÈGLES DE LA MAISON (OPTIONNEL)</label>
          <textarea
            value={houseRules}
            onChange={e => setHouseRules(e.target.value)}
            className="input-field resize-none h-20"
            placeholder="Ex: Pas d'animaux, visite sur rendez-vous..."
          />
        </div>

        {/* Progressive Payment Toggle */}
        <div className="mb-6 flex items-center justify-between card p-4">
          <label className="label">ACCEPTER PAIEMENT PROGRESSIF IMOFLEX</label>
          <button
            onClick={() => setAcceptsProgressive(!acceptsProgressive)}
            className={`relative w-12 h-6 rounded-full transition ${
              acceptsProgressive ? 'bg-violet' : 'bg-[#261C55]'
            }`}
          >
            <div
              className={`absolute top-1 w-4 h-4 rounded-full bg-white transition transform ${
                acceptsProgressive ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        <button
          onClick={handleSubmit}
          disabled={loading}
          className="btn-primary w-full disabled:opacity-50"
        >
          {loading ? 'Publication...' : 'Publier l\'annonce'}
        </button>
      </div>
    </div>
  );
};

export default Publier;
