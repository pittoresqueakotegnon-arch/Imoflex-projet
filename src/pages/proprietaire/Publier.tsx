import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, X, Plus, RotateCcw, CheckCircle2 } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { useAuth } from '../../hooks/useAuth';
import { supabase, PropertyType } from '../../lib/supabase';
import { propertyTypeLabel, getOptimizedUrl } from '../../lib/utils';
import { logAction } from '../../lib/audit';
import { useToast } from '../../components/Toast';
import { diagnoseAndShowError } from '../../utils/errorDiagnostics';
import { processImage } from '../../lib/imageOptimization';

const PROPERTY_TYPES: PropertyType[] = ['chambre', 'studio', 'appartement', 'maison', 'bureau', 'parcelle'];
const AMENITIES = ['Électricité', 'Eau courante', 'Parking', 'Climatisation', 'WiFi', 'Sécurité', 'Balcon', 'Meublé'];

const DRAFT_KEY_PREFIX = 'imoflex_listing_draft_';
const getDraftKey = (userId?: string) => `${DRAFT_KEY_PREFIX}${userId || 'current'}`;

interface UploadedPhoto {
  id: string;
  thumbUrl: string;
  publicBaseUrl: string;
}

interface ListingDraft {
  listingId: string;
  step: number;
  uploadedPhotos: UploadedPhoto[];
  title: string;
  propertyType: PropertyType;
  monthlyRent: string;
  city: string;
  neighborhood: string;
  address: string;
  depositAmount: string;
  advanceAmount: string;
  bedrooms: string;
  selectedAmenities: string[];
  description: string;
  houseRules: string;
  acceptsProgressive: boolean;
  savedAt: string;
}

const getStoredDraft = (userId?: string): ListingDraft | null => {
  try {
    const raw = localStorage.getItem(getDraftKey(userId)) || localStorage.getItem(getDraftKey('current'));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed;
  } catch (err) {
    console.error('Erreur lecture brouillon:', err);
    return null;
  }
};

const Publier: React.FC = () => {
  const navigate = useNavigate();
  const { listingEditId } = useParams<{ listingEditId?: string }>();
  const [searchParams] = useSearchParams();
  const editId = listingEditId || searchParams.get('edit') || undefined;
  const isEditMode = Boolean(editId);

  const { profile } = useAuth();
  const { showToast } = useToast();

  // Chargement du brouillon existant au montage (seulement en mode création)
  const initialDraftRef = useRef<ListingDraft | null>(isEditMode ? null : getStoredDraft(profile?.id));
  const initialDraft = initialDraftRef.current;

  const [step, setStep] = useState<number>(() => initialDraft?.step || 1);
  const [loading, setLoading] = useState(false);
  const [loadingExisting, setLoadingExisting] = useState(isEditMode);
  const [error, setError] = useState<string | null>(null);
  
  // Image Upload State
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadStatus, setUploadStatus] = useState('');
  const [uploadProgress, setUploadProgress] = useState(0);

  // Generate or restore listing ID upfront for storage naming convention
  const [listingId, setListingId] = useState<string>(() => editId || initialDraft?.listingId || uuidv4());

  // Step 1: Photos & basic info
  const [uploadedPhotos, setUploadedPhotos] = useState<UploadedPhoto[]>(() => initialDraft?.uploadedPhotos || []);
  const [title, setTitle] = useState(() => initialDraft?.title || '');
  const [propertyType, setPropertyType] = useState<PropertyType>(() => initialDraft?.propertyType || 'appartement');
  const [monthlyRent, setMonthlyRent] = useState(() => initialDraft?.monthlyRent || '');
  const [city, setCity] = useState(() => initialDraft?.city || 'Cotonou');
  const [neighborhood, setNeighborhood] = useState(() => initialDraft?.neighborhood || '');
  const [address, setAddress] = useState(() => initialDraft?.address || '');

  // Step 2: Details & equipment
  const [depositAmount, setDepositAmount] = useState(() => initialDraft?.depositAmount || '');
  const [advanceAmount, setAdvanceAmount] = useState(() => initialDraft?.advanceAmount || '');
  const [bedrooms, setBedrooms] = useState(() => initialDraft?.bedrooms || '');
  const [selectedAmenities, setSelectedAmenities] = useState<string[]>(() => initialDraft?.selectedAmenities || []);
  const [description, setDescription] = useState(() => initialDraft?.description || '');
  const [houseRules, setHouseRules] = useState(() => initialDraft?.houseRules || '');
  const [acceptsProgressive, setAcceptsProgressive] = useState(() => initialDraft?.acceptsProgressive || false);

  // Draft banner indicator
  const [hasRestoredDraft, setHasRestoredDraft] = useState<boolean>(() => {
    return Boolean(
      !isEditMode &&
      initialDraft &&
      ((initialDraft.uploadedPhotos && initialDraft.uploadedPhotos.length > 0) ||
        (initialDraft.title && initialDraft.title.trim() !== '') ||
        (initialDraft.address && initialDraft.address.trim() !== ''))
    );
  });
  const [lastSavedTime, setLastSavedTime] = useState<string | null>(() => {
    if (!isEditMode && initialDraft?.savedAt) {
      try {
        return new Date(initialDraft.savedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      } catch {
        return null;
      }
    }
    return null;
  });

  // ── Chargement annonce existante en mode édition ───────────────────────────
  useEffect(() => {
    if (!isEditMode || !editId || !profile?.id) return;
    let active = true;
    const fetchExisting = async () => {
      setLoadingExisting(true);
      try {
        const { data, error: fetchErr } = await supabase
          .from('listings')
          .select('*, listing_photos(id, photo_url, is_cover, display_order)')
          .eq('id', editId)
          .single();

        if (fetchErr) throw fetchErr;
        if (!data || !active) return;

        // Contrôle d'accès propriétaire ou agence
        if (data.owner_id !== profile.id && profile.role !== 'admin') {
          showToast("Vous n'êtes pas autorisé à modifier cette annonce", 'error');
          navigate(profile.role === 'agence' ? '/agence/annonces' : '/pro/annonces');
          return;
        }

        setListingId(data.id);
        setTitle(data.title || '');
        setPropertyType((data.property_type as PropertyType) || 'appartement');
        setMonthlyRent(data.monthly_rent ? String(data.monthly_rent) : '');
        setCity(data.city || 'Cotonou');
        setNeighborhood(data.neighborhood || '');
        setAddress(data.address || '');
        setDepositAmount(data.deposit_amount ? String(data.deposit_amount) : '');
        setAdvanceAmount(data.advance_amount ? String(data.advance_amount) : '');
        setBedrooms(data.bedrooms ? String(data.bedrooms) : '');
        setSelectedAmenities(Array.isArray(data.amenities) ? data.amenities : []);
        setDescription(data.description || '');
        setHouseRules(data.house_rules || '');
        setAcceptsProgressive(data.accepts_progressive_payment || false);

        // Charger les photos existantes triées
        const sortedPhotos = ((data.listing_photos as any[]) || [])
          .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0))
          .map((p) => {
            const raw = p.photo_url || '';
            const thumb = getOptimizedUrl(raw, 'thumb') || raw;
            return {
              id: p.id,
              thumbUrl: thumb,
              publicBaseUrl: raw,
            };
          });
        setUploadedPhotos(sortedPhotos);
      } catch (err) {
        showToast("Impossible de charger l'annonce", 'error');
        navigate(profile.role === 'agence' ? '/agence/annonces' : '/pro/annonces');
      } finally {
        if (active) setLoadingExisting(false);
      }
    };
    fetchExisting();
    return () => { active = false; };
  }, [isEditMode, editId, profile?.id, profile?.role, navigate, showToast]);

  // Sauvegarde automatique dès qu'une information ou une image change (création uniquement)
  useEffect(() => {
    const hasContent =
      uploadedPhotos.length > 0 ||
      title.trim() !== '' ||
      monthlyRent.trim() !== '' ||
      neighborhood.trim() !== '' ||
      address.trim() !== '' ||
      depositAmount.trim() !== '' ||
      advanceAmount.trim() !== '' ||
      bedrooms.trim() !== '' ||
      selectedAmenities.length > 0 ||
      description.trim() !== '' ||
      houseRules.trim() !== '';

    if (!hasContent || isEditMode) return; // Pas de brouillon en mode édition

    const draftData: ListingDraft = {
      listingId,
      step,
      uploadedPhotos,
      title,
      propertyType,
      monthlyRent,
      city,
      neighborhood,
      address,
      depositAmount,
      advanceAmount,
      bedrooms,
      selectedAmenities,
      description,
      houseRules,
      acceptsProgressive,
      savedAt: new Date().toISOString(),
    };

    try {
      const serialized = JSON.stringify(draftData);
      localStorage.setItem(getDraftKey(profile?.id), serialized);
      localStorage.setItem(getDraftKey('current'), serialized);
      setLastSavedTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    } catch (e) {
      console.error('Erreur sauvegarde automatique du brouillon:', e);
    }
  }, [
    profile?.id,
    listingId,
    step,
    uploadedPhotos,
    title,
    propertyType,
    monthlyRent,
    city,
    neighborhood,
    address,
    depositAmount,
    advanceAmount,
    bedrooms,
    selectedAmenities,
    description,
    houseRules,
    acceptsProgressive,
  ]);

  // Avertir si fermeture accidentelle de la fenêtre
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      const hasContent = uploadedPhotos.length > 0 || title.trim() !== '' || address.trim() !== '';
      if (hasContent) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [uploadedPhotos.length, title, address]);

  // Réinitialiser / effacer le brouillon pour recommencer à zéro
  const handleClearDraft = () => {
    if (window.confirm('Voulez-vous vraiment effacer ce brouillon et repartir de zéro ?')) {
      try {
        localStorage.removeItem(getDraftKey(profile?.id));
        localStorage.removeItem(getDraftKey('current'));
      } catch (e) {
        console.error(e);
      }
      setListingId(uuidv4());
      setUploadedPhotos([]);
      setTitle('');
      setPropertyType('appartement');
      setMonthlyRent('');
      setCity('Cotonou');
      setNeighborhood('');
      setAddress('');
      setDepositAmount('');
      setAdvanceAmount('');
      setBedrooms('');
      setSelectedAmenities([]);
      setDescription('');
      setHouseRules('');
      setAcceptsProgressive(false);
      setStep(1);
      setHasRestoredDraft(false);
      setLastSavedTime(null);
      setError(null);
      showToast('Brouillon effacé. Vous repartez de zéro.', 'info');
    }
  };

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
      const payload = {
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
      };

      let savedListingId = listingId;

      if (isEditMode && editId) {
        // ── MODE ÉDITION : UPDATE ──────────────────────────────────────────────
        const { error: updateError } = await supabase
          .from('listings')
          .update(payload)
          .eq('id', editId);

        if (updateError) throw updateError;
        savedListingId = editId;

        // Mettre à jour les photos : supprimer les anciennes puis réinsérer
        await supabase.from('listing_photos').delete().eq('listing_id', editId);
        for (let i = 0; i < uploadedPhotos.length; i++) {
          const { error: photoError } = await supabase
            .from('listing_photos')
            .insert({
              listing_id: editId,
              photo_url: uploadedPhotos[i].publicBaseUrl,
              display_order: i,
              is_cover: i === 0,
            });
          if (photoError) throw photoError;
        }

        await logAction({
          userId: profile.id,
          action: 'modification_annonce',
          entityType: 'listings',
          entityId: editId,
          details: { title, city, propertyType, monthlyRent: parseInt(monthlyRent) }
        });

        showToast('Annonce mise à jour avec succès !', 'success');
        navigate(profile.role === 'agence' ? '/agence/annonces' : '/pro/annonces');
      } else {
        // ── MODE CRÉATION : INSERT ──────────────────────────────────────────────
        const { data: listingData, error: listingError } = await supabase
          .from('listings')
          .insert({
            ...payload,
            id: listingId,
            owner_id: profile.id,
            is_published: true,
            status: 'publiee',
            availability_status: 'disponible',
          })
          .select('id')
          .single();

        if (listingError) throw listingError;
        savedListingId = listingData.id;

        for (let i = 0; i < uploadedPhotos.length; i++) {
          const { error: photoError } = await supabase
            .from('listing_photos')
            .insert({
              listing_id: listingData.id,
              photo_url: uploadedPhotos[i].publicBaseUrl,
              display_order: i,
              is_cover: i === 0,
            });
          if (photoError) throw photoError;
        }

        await logAction({
          userId: profile.id,
          action: 'publication_annonce',
          entityType: 'listings',
          entityId: listingData.id,
          details: { title, city, propertyType, monthlyRent: parseInt(monthlyRent) }
        });

        // Nettoyage brouillon
        try {
          localStorage.removeItem(getDraftKey(profile.id));
          localStorage.removeItem(getDraftKey('current'));
        } catch (cleanErr) {
          console.error('Erreur nettoyage brouillon:', cleanErr);
        }

        showToast('Annonce publiée avec succès !', 'success');
        navigate(profile.role === 'agence' ? '/agence/annonces' : '/pro/annonces');
      }

      // Satisfaire le compilateur TS
      void savedListingId;
    } catch (err) {
      diagnoseAndShowError(err, 'Gestion Logement/Contrat');
    } finally {
      setLoading(false);
    }
  };

  if (loadingExisting) {
    return (
      <div className="page-container min-h-screen flex flex-col items-center justify-center p-6 text-center">
        <div className="w-10 h-10 border-3 border-[var(--imx-accent)] border-t-transparent rounded-full animate-spin mb-4" />
        <h2 className="font-nunito font-black text-lg text-[var(--imx-text-primary)]">
          Chargement de l'annonce...
        </h2>
        <p className="font-space-grotesk text-xs text-[var(--imx-text-secondary)] mt-1">
          Récupération des photos et détails de votre bien
        </p>
      </div>
    );
  }

  if (step === 1) {
    return (
      <div className="page-container">
        <div className="px-4 pt-6 pb-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate(profile?.role === 'agence' ? '/agence/annonces' : '/pro/annonces')}
                className="p-2 hover:bg-[var(--imx-surface-2)] rounded-lg transition"
                title="Retour aux annonces"
              >
                <ArrowLeft size={24} />
              </button>
              <div>
                <h1 className="text-2xl font-nunito font-900">
                  {isEditMode ? 'Modifier l\'annonce' : 'Nouvelle annonce'}
                </h1>
                <p className="text-[11px] text-[var(--imx-text-secondary)] font-space-grotesk">
                  Étape 1/2 : Photos & informations de base
                </p>
              </div>
            </div>

            {!isEditMode && (uploadedPhotos.length > 0 || title.trim() !== '' || address.trim() !== '') && (
              <button
                type="button"
                onClick={handleClearDraft}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition"
                title="Effacer le formulaire et recommencer à zéro"
              >
                <RotateCcw size={13} />
                <span className="hidden sm:inline">Recommencer</span>
              </button>
            )}
          </div>

          {/* Bannière de brouillon restauré */}
          {hasRestoredDraft && (
            <div className="mb-4 p-3 rounded-2xl bg-[var(--imx-surface-2)] border border-[var(--imx-accent)]/30 flex items-center justify-between gap-3 animate-fade-in">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="flex-shrink-0 w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                <div className="min-w-0">
                  <p className="text-xs font-bold text-[var(--imx-text-primary)]">
                    Brouillon conservé
                  </p>
                  <p className="text-[11px] text-[var(--imx-text-secondary)] truncate font-space-grotesk">
                    {uploadedPhotos.length > 0 ? `${uploadedPhotos.length} photo(s) déjà chargée(s) • ` : ''}
                    Vos saisies ont été automatiquement reprises.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleClearDraft}
                className="flex-shrink-0 text-[11px] text-red-400 hover:text-red-300 font-semibold underline"
              >
                Tout effacer
              </button>
            </div>
          )}

          {/* Indicateur de sauvegarde automatique discrète */}
          {lastSavedTime && !hasRestoredDraft && (
            <div className="mb-4 flex items-center justify-end gap-1.5 text-[10px] text-[var(--imx-text-muted)] font-space-grotesk">
              <CheckCircle2 size={12} className="text-emerald-400" />
              <span>Sauvegardé automatiquement à {lastSavedTime}</span>
            </div>
          )}

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
                  <div className="w-full h-full rounded-2xl border border-[rgba(255,255,255,0.1)] overflow-hidden bg-[var(--imx-surface-2)]">
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
                    className={`w-full h-full rounded-2xl border-2 border-dashed transition flex flex-col items-center justify-center bg-[var(--imx-accent)]/5 ${
                      uploadingImage 
                        ? 'border-[var(--imx-accent)]/20 opacity-70 cursor-not-allowed' 
                        : 'border-[var(--imx-accent)]/40 hover:border-[var(--imx-accent)] hover:bg-[var(--imx-accent)]/10 cursor-pointer'
                    }`}
                  >
                    {uploadingImage ? (
                      <div className="w-6 h-6 border-2 border-[var(--imx-accent)] border-t-transparent rounded-full animate-spin mb-1"></div>
                    ) : (
                      <div className="bg-white shadow-sm p-2 rounded-full mb-2">
                        <Plus size={18} className="text-[var(--imx-accent)]" />
                      </div>
                    )}
                    <span className="text-[9px] font-bold text-[var(--imx-accent)] uppercase tracking-wider font-space-grotesk text-center px-1">
                      {uploadingImage ? 'Envoi...' : 'Ajouter'}
                    </span>
                  </label>
                </div>
              )}
            </div>

            {/* Upload Progress Bar */}
            {uploadingImage && uploadStatus && (
              <div className="mt-4">
                <div className="flex justify-between text-xs text-[var(--imx-text-secondary)] font-grotesk mb-1.5">
                  <span>{uploadStatus}</span>
                  <span>{uploadProgress}%</span>
                </div>
                <div className="w-full h-1.5 bg-[var(--imx-surface)] rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-purple-500 to-[var(--imx-accent-light)] transition-all duration-300 ease-out"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              </div>
            )}

            <div className="flex justify-between items-center mt-2">
              <span className="text-[10px] text-[var(--imx-text-secondary)]" style={{ fontFamily: 'Space Grotesk' }}>
                * La 1ère photo sera la couverture
              </span>
              <span className="text-[10px] text-[var(--imx-text-secondary)]" style={{ fontFamily: 'Space Grotesk' }}>
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
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setStep(1)}
              className="p-2 hover:bg-[var(--imx-surface-2)] rounded-lg transition"
              title="Retour à l'étape 1"
            >
              <ArrowLeft size={24} />
            </button>
            <div>
              <h1 className="text-2xl font-nunito font-900">Détails du bien</h1>
              <p className="text-[11px] text-[var(--imx-text-secondary)] font-space-grotesk">
                Étape 2/2 : Conditions & équipements
              </p>
            </div>
          </div>

          {!isEditMode && (
            <button
              type="button"
              onClick={handleClearDraft}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition"
              title="Effacer le formulaire et recommencer à zéro"
            >
              <RotateCcw size={13} />
              <span className="hidden sm:inline">Recommencer</span>
            </button>
          )}
        </div>

        {lastSavedTime && (
          <div className="mb-4 flex items-center justify-end gap-1.5 text-[10px] text-[var(--imx-text-muted)] font-space-grotesk">
            <CheckCircle2 size={12} className="text-emerald-400" />
            <span>Sauvegardé automatiquement à {lastSavedTime}</span>
          </div>
        )}

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
              acceptsProgressive ? 'bg-violet' : 'bg-[var(--imx-surface-2)]'
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
          {loading
            ? (isEditMode ? 'Enregistrement...' : 'Publication...')
            : (isEditMode ? 'Enregistrer les modifications' : 'Publier l\'annonce')}
        </button>
      </div>
    </div>
  );
};

export default Publier;
