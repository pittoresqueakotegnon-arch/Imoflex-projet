import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { ArrowLeft, X, Plus, Zap, AlertCircle } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { useAuth } from '../../../hooks/useAuth';
import { supabase, PropertyType } from '../../../lib/supabase';
import { propertyTypeLabel, formatMontant, getOptimizedUrl } from '../../../lib/utils';
import { useToast } from '../../../components/Toast';
import { processImage } from '../../../lib/imageOptimization';

const PROPERTY_TYPES: PropertyType[] = ['chambre', 'studio', 'appartement', 'maison', 'bureau', 'parcelle'];
const AMENITIES = ['Électricité', 'Eau courante', 'Parking', 'Climatisation', 'WiFi', 'Sécurité', 'Balcon', 'Meublé'];

interface UploadedPhoto {
  id: string;
  thumbUrl: string;
  publicBaseUrl: string;
}

export default function WebProprietairePublier({ isAgency = false }: { isAgency?: boolean }) {
  const navigate = useNavigate();
  const { listingEditId } = useParams<{ listingEditId?: string }>();
  const isEditMode = Boolean(listingEditId);
  const backPath = isAgency ? '/web/agence/annonces' : '/web/pro/annonces';

  const { user } = useAuth();
  const { showToast } = useToast();

  const [step, setStep] = useState<number>(1);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(isEditMode);
  const [error, setError] = useState<string | null>(null);

  // Listing ID
  const [listingId] = useState<string>(() => listingEditId || uuidv4());

  // Step 1: Basic info & photos
  const [uploadedPhotos, setUploadedPhotos] = useState<UploadedPhoto[]>([]);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const [title, setTitle] = useState('');
  const [propertyType, setPropertyType] = useState<PropertyType>('appartement');
  const [monthlyRent, setMonthlyRent] = useState('');
  const [city, setCity] = useState('Cotonou');
  const [neighborhood, setNeighborhood] = useState('');
  const [address, setAddress] = useState('');

  // Step 2: Financial & details
  const [depositAmount, setDepositAmount] = useState('');
  const [advanceAmount, setAdvanceAmount] = useState('');
  const [bedrooms, setBedrooms] = useState('');
  const [selectedAmenities, setSelectedAmenities] = useState<string[]>([]);
  const [description, setDescription] = useState('');
  const [houseRules, setHouseRules] = useState('');
  const [acceptsProgressive, setAcceptsProgressive] = useState(false);

  // Load existing listing if edit mode
  useEffect(() => {
    if (!listingEditId) return;

    const loadListing = async () => {
      try {
        const { data, error: fetchErr } = await supabase
          .from('listings')
          .select(`
            *,
            listing_photos (
              id,
              photo_url,
              is_cover,
              display_order
            )
          `)
          .eq('id', listingEditId)
          .single();

        if (fetchErr) throw fetchErr;
        if (data) {
          setTitle(data.title || '');
          setPropertyType(data.property_type || 'appartement');
          setMonthlyRent(String(data.monthly_rent || ''));
          setCity(data.city || 'Cotonou');
          setNeighborhood(data.neighborhood || '');
          setAddress(data.address || '');
          setDepositAmount(String(data.deposit_amount || ''));
          setAdvanceAmount(String(data.advance_amount || ''));
          setBedrooms(String(data.bedrooms || ''));
          setSelectedAmenities(data.amenities || []);
          setDescription(data.description || '');
          setHouseRules(data.house_rules || '');
          setAcceptsProgressive(Boolean(data.accepts_progressive_payment));

          if (data.listing_photos && data.listing_photos.length > 0) {
            const sorted = [...data.listing_photos]
              .sort((a: any, b: any) => (a.display_order ?? 0) - (b.display_order ?? 0))
              .map((p: any) => {
                const raw = p.photo_url || '';
                const thumb = getOptimizedUrl(raw, 'thumb') || raw;
                return {
                  id: p.id,
                  thumbUrl: thumb,
                  publicBaseUrl: raw,
                };
              });
            setUploadedPhotos(sorted);
          }
        }
      } catch (_err: unknown) {
        showToast('Impossible de charger l\'annonce à modifier', 'error');
        navigate(backPath);
      } finally {
        setInitialLoading(false);
      }
    };

    loadListing();
  }, [listingEditId, navigate, showToast, backPath]);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !user) return;

    setUploadingImage(true);
    setUploadProgress(10);

    try {
      const bucket = supabase.storage.from('listing-photos');
      const storageParams = { contentType: 'image/webp', upsert: true, cacheControl: '31536000' };
      const targetListingId = listingEditId || listingId;

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setUploadProgress(Math.round(((i + 1) / files.length) * 80));

        const processed = await processImage(file);
        const photoId = uuidv4();
        const basePath = `${targetListingId}/photo_${photoId}`;

        // Upload des 3 formats selon l'architecture standard Imoflex (HD, Medium, Thumb)
        await bucket.upload(`${basePath}_hd.webp`, processed.hd, storageParams);
        await bucket.upload(`${basePath}_medium.webp`, processed.medium, storageParams);
        await bucket.upload(`${basePath}_thumb.webp`, processed.thumb, storageParams);

        const publicBaseUrl = bucket.getPublicUrl(basePath).data.publicUrl;
        const thumbUrl = bucket.getPublicUrl(`${basePath}_thumb.webp`).data.publicUrl;

        setUploadedPhotos((prev) => [
          ...prev,
          {
            id: photoId,
            thumbUrl,
            publicBaseUrl,
          },
        ]);
      }
      showToast('Photos importées avec succès', 'success');
    } catch (err: unknown) {
      console.error('[handlePhotoUpload] Error:', err);
      showToast('Erreur lors du téléchargement de l\'image', 'error');
    } finally {
      setUploadingImage(false);
      setUploadProgress(0);
      e.target.value = '';
    }
  };

  const removePhoto = (photoId: string) => {
    setUploadedPhotos((prev) => prev.filter((p) => p.id !== photoId));
  };

  const setAsCover = (index: number) => {
    if (index === 0) return;
    setUploadedPhotos((prev) => {
      const next = [...prev];
      const [selected] = next.splice(index, 1);
      next.unshift(selected);
      return next;
    });
    showToast('Photo de couverture définie', 'info');
  };

  const toggleAmenity = (item: string) => {
    setSelectedAmenities((prev) =>
      prev.includes(item) ? prev.filter((a) => a !== item) : [...prev, item]
    );
  };

  const validateStep1 = () => {
    if (!title.trim()) { setError('Veuillez saisir un titre d\'annonce.'); return false; }
    if (!monthlyRent || Number(monthlyRent) <= 0) { setError('Veuillez indiquer un loyer mensuel valide.'); return false; }
    if (!city.trim()) { setError('Veuillez spécifier la ville.'); return false; }
    if (!address.trim()) { setError('Veuillez spécifier l\'adresse.'); return false; }
    if (uploadedPhotos.length === 0) { setError('Veuillez ajouter au moins une photo du logement.'); return false; }
    setError(null);
    return true;
  };

  const handleSubmit = async () => {
    if (!user) return;
    setLoading(true);
    setError(null);

    try {
      const payload = {
        title: title.trim(),
        property_type: propertyType,
        monthly_rent: Number(monthlyRent),
        deposit_amount: depositAmount ? Number(depositAmount) : 0,
        advance_amount: advanceAmount ? Number(advanceAmount) : 0,
        city: city.trim(),
        neighborhood: neighborhood.trim() || null,
        address: address.trim(),
        bedrooms: bedrooms ? Number(bedrooms) : 0,
        amenities: selectedAmenities,
        description: description.trim() || null,
        house_rules: houseRules.trim() || null,
        accepts_progressive_payment: acceptsProgressive,
      };

      const targetId = isEditMode && listingEditId ? listingEditId : listingId;

      if (isEditMode && listingEditId) {
        // Mode modification : update des champs modifiés
        const { error: updateErr } = await supabase
          .from('listings')
          .update(payload)
          .eq('id', listingEditId);

        if (updateErr) throw updateErr;
      } else {
        // Mode création : insert
        const { error: insertErr } = await supabase
          .from('listings')
          .insert({
            ...payload,
            id: targetId,
            owner_id: user.id,
            is_published: true,
            status: 'publiee',
            availability_status: 'disponible',
          });

        if (insertErr) throw insertErr;
      }

      // Synchronisation des photos : supprimer les anciennes puis insérer les nouvelles avec display_order
      await supabase.from('listing_photos').delete().eq('listing_id', targetId);

      const photosPayload = uploadedPhotos
        .filter(p => p.publicBaseUrl || p.thumbUrl)
        .map((p, idx) => ({
          listing_id: targetId,
          photo_url: p.publicBaseUrl || p.thumbUrl,
          is_cover: idx === 0,
          display_order: idx,
        }));

      if (photosPayload.length > 0) {
        const { error: photoErr } = await supabase.from('listing_photos').insert(photosPayload);
        if (photoErr) throw photoErr;
      }

      showToast(isEditMode ? 'Annonce mise à jour avec succès !' : 'Annonce publiée avec succès !', 'success');
      navigate(backPath);
    } catch (err: unknown) {
      console.error('[WebProprietairePublier] Submit error:', err);
      const msg = (err as any)?.message || (err instanceof Error ? err.message : 'Erreur lors de l\'enregistrement de l\'annonce.');
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  if (initialLoading) {
    return (
      <div className="py-20 flex justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: 'var(--imx-accent)', borderTopColor: 'transparent' }} />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Top back & title */}
      <div className="flex items-center gap-3 mb-6">
        <Link
          to={backPath}
          className="p-2 rounded-xl border bg-white text-gray-600 hover:bg-gray-50 transition-colors"
          style={{ borderColor: 'var(--imx-border)' }}
        >
          <ArrowLeft size={16} />
        </Link>
        <div>
          <h1 className="text-2xl font-black text-[#17132B]" style={{ fontFamily: 'Sora' }}>
            {isEditMode ? 'Modifier l\'annonce' : isAgency ? 'Publier un nouveau mandat de location' : 'Publier un bien immobilier'}
          </h1>
          <p className="text-xs text-gray-400 mt-0.5">
            Étape {step} sur 3 — {step === 1 ? 'Photos & Généralités' : step === 2 ? 'Conditions & Équipements' : 'Récapitulatif'}
          </p>
        </div>
      </div>

      {/* Stepper Header */}
      <div className="grid grid-cols-3 gap-2 mb-8">
        {[
          { num: 1, title: '1. Informations de base' },
          { num: 2, title: '2. Tarifs & Équipements' },
          { num: 3, title: '3. Récapitulatif' },
        ].map((s) => (
          <div
            key={s.num}
            className={`h-2 rounded-full transition-all ${
              s.num <= step ? 'bg-[#7B3FE4]' : 'bg-gray-200'
            }`}
          />
        ))}
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-xl mb-6 text-sm bg-red-50 text-red-600 border border-red-200">
          <AlertCircle size={16} className="flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* ── STEP 1 ── */}
      {step === 1 && (
        <div className="rounded-2xl border bg-white p-6 sm:p-8 shadow-sm space-y-6" style={{ borderColor: 'var(--imx-border)' }}>
          {/* Photos Upload */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-2">
              Photos du bien ({uploadedPhotos.length}/12) *
            </label>
            <p className="text-xs text-gray-500 mb-3">
              Ajoutez des photos lumineuses. La première photo servira de couverture principale.
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {uploadedPhotos.map((photo, index) => (
                <div key={photo.id || index} className="relative aspect-square rounded-xl overflow-hidden border bg-gray-50 group" style={{ borderColor: 'var(--imx-border)' }}>
                  <img
                    src={photo.thumbUrl || photo.publicBaseUrl}
                    alt=""
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      if (photo.publicBaseUrl && e.currentTarget.src !== photo.publicBaseUrl) {
                        e.currentTarget.src = photo.publicBaseUrl;
                      }
                    }}
                  />
                  {index === 0 ? (
                    <span className="absolute bottom-1.5 left-1.5 px-2 py-0.5 rounded-md text-[9px] font-bold bg-[#7B3FE4] text-white">
                      Couverture
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setAsCover(index)}
                      className="absolute bottom-1.5 left-1.5 px-2 py-0.5 rounded-md text-[9px] font-semibold bg-black/70 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-[#7B3FE4]"
                      title="Définir comme photo principale"
                    >
                      Couverture
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => removePhoto(photo.id)}
                    className="absolute top-1.5 right-1.5 p-1 rounded-full bg-red-500 text-white shadow-sm hover:scale-110 transition-transform"
                    title="Supprimer la photo"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}

              {uploadedPhotos.length < 12 && (
                <label className="aspect-square rounded-xl border-2 border-dashed border-purple-300 hover:border-[#7B3FE4] bg-purple-50/40 hover:bg-purple-50 flex flex-col items-center justify-center cursor-pointer transition-all">
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handlePhotoUpload}
                    className="hidden"
                    disabled={uploadingImage}
                  />
                  {uploadingImage ? (
                    <div className="w-6 h-6 border-2 border-[#7B3FE4] border-t-transparent rounded-full animate-spin mb-1" />
                  ) : (
                    <div className="w-9 h-9 rounded-xl bg-white shadow-sm flex items-center justify-center text-[#7B3FE4] mb-1">
                      <Plus size={20} />
                    </div>
                  )}
                  <span className="text-[11px] font-bold text-[#7B3FE4]">
                    {uploadingImage ? `Chargement ${uploadProgress}%` : 'Ajouter'}
                  </span>
                </label>
              )}
            </div>
          </div>

          {/* Title */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1.5">
              Titre de l'annonce *
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Bel appartement 2 pièces meublé avec balcon"
              className="w-full px-4 py-2.5 rounded-xl border text-sm outline-none transition-colors"
              style={{ borderColor: 'var(--imx-border)' }}
            />
          </div>

          {/* Type & Rent */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1.5">
                Type de logement *
              </label>
              <select
                value={propertyType}
                onChange={(e) => setPropertyType(e.target.value as PropertyType)}
                className="w-full px-4 py-2.5 rounded-xl border text-sm outline-none bg-white"
                style={{ borderColor: 'var(--imx-border)' }}
              >
                {PROPERTY_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {propertyTypeLabel(t)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1.5">
                Loyer mensuel (FCFA) *
              </label>
              <input
                type="number"
                min={0}
                value={monthlyRent}
                onChange={(e) => setMonthlyRent(e.target.value)}
                placeholder="Ex: 80000"
                className="w-full px-4 py-2.5 rounded-xl border text-sm outline-none font-bold"
                style={{ borderColor: 'var(--imx-border)' }}
              />
            </div>
          </div>

          {/* City, Neighborhood & Address */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1.5">
                Ville *
              </label>
              <input
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="Cotonou"
                className="w-full px-4 py-2.5 rounded-xl border text-sm outline-none"
                style={{ borderColor: 'var(--imx-border)' }}
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1.5">
                Quartier
              </label>
              <input
                type="text"
                value={neighborhood}
                onChange={(e) => setNeighborhood(e.target.value)}
                placeholder="Ex: Fidjrossè, Haie Vive..."
                className="w-full px-4 py-2.5 rounded-xl border text-sm outline-none"
                style={{ borderColor: 'var(--imx-border)' }}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1.5">
              Adresse précise *
            </label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Ex: Rue 214, à 50m de la pharmacie"
              className="w-full px-4 py-2.5 rounded-xl border text-sm outline-none"
              style={{ borderColor: 'var(--imx-border)' }}
            />
          </div>

          <div className="flex justify-end pt-4 border-t" style={{ borderColor: 'var(--imx-border)' }}>
            <button
              type="button"
              onClick={() => validateStep1() && setStep(2)}
              className="px-6 py-2.5 rounded-xl text-sm font-bold text-white shadow-sm"
              style={{ background: 'var(--imx-accent)' }}
            >
              Étape suivante →
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 2 ── */}
      {step === 2 && (
        <div className="rounded-2xl border bg-white p-6 sm:p-8 shadow-sm space-y-6" style={{ borderColor: 'var(--imx-border)' }}>
          {/* Caution, Avance, Chambres */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1.5">
                Caution (FCFA)
              </label>
              <input
                type="number"
                min={0}
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
                placeholder="Ex: 160000"
                className="w-full px-4 py-2.5 rounded-xl border text-sm outline-none"
                style={{ borderColor: 'var(--imx-border)' }}
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1.5">
                Avance de loyer (FCFA)
              </label>
              <input
                type="number"
                min={0}
                value={advanceAmount}
                onChange={(e) => setAdvanceAmount(e.target.value)}
                placeholder="Ex: 80000"
                className="w-full px-4 py-2.5 rounded-xl border text-sm outline-none"
                style={{ borderColor: 'var(--imx-border)' }}
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1.5">
                Nombre de chambres
              </label>
              <input
                type="number"
                min={0}
                value={bedrooms}
                onChange={(e) => setBedrooms(e.target.value)}
                placeholder="Ex: 2"
                className="w-full px-4 py-2.5 rounded-xl border text-sm outline-none"
                style={{ borderColor: 'var(--imx-border)' }}
              />
            </div>
          </div>

          {/* Progressive Payment */}
          <div className="p-4 rounded-xl border bg-purple-50/50 flex items-start justify-between gap-4" style={{ borderColor: 'var(--imx-border)' }}>
            <div>
              <div className="flex items-center gap-1.5 text-xs font-bold text-[#7B3FE4] uppercase tracking-wider mb-1">
                <Zap size={14} />
                Paiement progressif Mobile Money
              </div>
              <p className="text-xs text-gray-600">
                Permettre au locataire de régler ce loyer en plusieurs fractions dans le mois. Vous recevez chaque fraction sécurisée sur votre portefeuille.
              </p>
            </div>
            <input
              type="checkbox"
              checked={acceptsProgressive}
              onChange={(e) => setAcceptsProgressive(e.target.checked)}
              className="w-5 h-5 rounded text-[#7B3FE4] cursor-pointer mt-1"
            />
          </div>

          {/* Amenities */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-2">
              Équipements & commodités
            </label>
            <div className="flex flex-wrap gap-2">
              {AMENITIES.map((am) => {
                const checked = selectedAmenities.includes(am);
                return (
                  <button
                    key={am}
                    type="button"
                    onClick={() => toggleAmenity(am)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                      checked
                        ? 'border-[#7B3FE4] bg-[#F1EBFF] text-[#7B3FE4]'
                        : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    {checked && '✓ '} {am}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1.5">
              Description du logement
            </label>
            <textarea
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Décrivez les atouts de votre bien (luminosité, proximité des transports, commodités)..."
              className="w-full px-4 py-2.5 rounded-xl border text-sm outline-none resize-none"
              style={{ borderColor: 'var(--imx-border)' }}
            />
          </div>

          {/* House Rules */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1.5">
              Règles et conditions particulières
            </label>
            <textarea
              rows={2}
              value={houseRules}
              onChange={(e) => setHouseRules(e.target.value)}
              placeholder="Ex: Animaux non autorisés, calme requis après 22h..."
              className="w-full px-4 py-2.5 rounded-xl border text-sm outline-none resize-none"
              style={{ borderColor: 'var(--imx-border)' }}
            />
          </div>

          <div className="flex items-center justify-between pt-4 border-t" style={{ borderColor: 'var(--imx-border)' }}>
            <button
              type="button"
              onClick={() => setStep(1)}
              className="px-4 py-2 rounded-xl text-sm font-semibold border text-gray-600 hover:bg-gray-50"
              style={{ borderColor: 'var(--imx-border)' }}
            >
              ← Retour
            </button>
            <button
              type="button"
              onClick={() => setStep(3)}
              className="px-6 py-2.5 rounded-xl text-sm font-bold text-white shadow-sm"
              style={{ background: 'var(--imx-accent)' }}
            >
              Étape suivante →
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 3: RECAP & CONFIRM ── */}
      {step === 3 && (
        <div className="rounded-2xl border bg-white p-6 sm:p-8 shadow-sm space-y-6" style={{ borderColor: 'var(--imx-border)' }}>
          <h2 className="text-lg font-bold text-[#17132B]" style={{ fontFamily: 'Sora' }}>
            Vérification avant publication
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 rounded-xl bg-gray-50 text-xs">
            <div>
              <span className="text-gray-400 block">Titre</span>
              <strong className="text-gray-900">{title}</strong>
            </div>
            <div>
              <span className="text-gray-400 block">Loyer</span>
              <strong className="text-[#7B3FE4]">{formatMontant(Number(monthlyRent))} / mois</strong>
            </div>
            <div>
              <span className="text-gray-400 block">Emplacement</span>
              <strong className="text-gray-900">{neighborhood ? `${neighborhood}, ` : ''}{city}</strong>
            </div>
          </div>

          <div className="text-xs text-gray-500 space-y-1">
            <p>• {uploadedPhotos.length} photo(s) prête(s) pour la diffusion.</p>
            <p>• Paiement progressif : {acceptsProgressive ? 'Activé' : 'Désactivé'}.</p>
            <p>• {selectedAmenities.length} équipement(s) sélectionné(s).</p>
          </div>

          {/* Miniatures des photos dans le récapitulatif */}
          {uploadedPhotos.length > 0 && (
            <div>
              <span className="text-xs font-semibold text-gray-700 block mb-2">
                Aperçu des photos ({uploadedPhotos.length}) :
              </span>
              <div className="flex items-center gap-2 overflow-x-auto pb-1">
                {uploadedPhotos.map((p, i) => (
                  <div key={p.id || i} className="relative w-16 h-16 rounded-lg overflow-hidden border border-gray-200 flex-shrink-0">
                    <img
                      src={p.thumbUrl || p.publicBaseUrl}
                      alt=""
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        if (p.publicBaseUrl && e.currentTarget.src !== p.publicBaseUrl) {
                          e.currentTarget.src = p.publicBaseUrl;
                        }
                      }}
                    />
                    {i === 0 && (
                      <span className="absolute bottom-0 inset-x-0 bg-[#7B3FE4] text-white text-[8px] text-center font-bold">
                        Principale
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between pt-4 border-t" style={{ borderColor: 'var(--imx-border)' }}>
            <button
              type="button"
              onClick={() => setStep(2)}
              className="px-4 py-2 rounded-xl text-sm font-semibold border text-gray-600 hover:bg-gray-50"
              style={{ borderColor: 'var(--imx-border)' }}
            >
              ← Modifier
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={handleSubmit}
              className="px-6 py-3 rounded-xl text-sm font-bold text-white shadow-md hover:opacity-95 disabled:opacity-50"
              style={{ background: 'var(--imx-accent)' }}
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mx-auto" />
              ) : isEditMode ? (
                'Enregistrer les modifications'
              ) : (
                'Publier l\'annonce'
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
