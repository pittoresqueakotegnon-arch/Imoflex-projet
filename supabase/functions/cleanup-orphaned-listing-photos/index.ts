import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const dryRun = url.searchParams.get("dry_run") === "true";

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const bucketName = "listing-photos";
    const bucket = supabase.storage.from(bucketName);

    // 1. Lister les dossiers racine (qui correspondent aux listing_id)
    const { data: rootItems, error: listError } = await bucket.list("", { limit: 1000 });
    if (listError) {
      throw listError;
    }

    const folders = rootItems?.filter((item) => !item.id && item.name) || [];

    // 2. Récupérer tous les IDs des listings existants
    const { data: listings, error: listingsError } = await supabase
      .from("listings")
      .select("id");

    if (listingsError) {
      throw listingsError;
    }

    const existingListingIds = new Set(listings?.map((l) => l.id) || []);

    const now = new Date().getTime();
    const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;

    const cleanedFolders: string[] = [];
    let totalFilesDeleted = 0;

    // 3. Examiner chaque dossier
    for (const folder of folders) {
      const folderName = folder.name;

      // Si le dossier n'a pas de correspondance dans la table `listings`
      if (!existingListingIds.has(folderName)) {
        // Lister le contenu du dossier
        const { data: files, error: filesError } = await bucket.list(folderName, { limit: 100 });
        if (filesError || !files) continue;

        // Vérifier si le contenu a plus de 24h
        const isOrphanedAndOld = files.some((file) => {
          const createdAt = file.created_at ? new Date(file.created_at).getTime() : now;
          return now - createdAt > TWENTY_FOUR_HOURS;
        });

        if (isOrphanedAndOld && files.length > 0) {
          const filePaths = files.map((f) => `${folderName}/${f.name}`);
          
          if (!dryRun) {
            const { error: removeError } = await bucket.remove(filePaths);
            if (!removeError) {
              cleanedFolders.push(folderName);
              totalFilesDeleted += filePaths.length;
            }
          } else {
            cleanedFolders.push(folderName);
            totalFilesDeleted += filePaths.length;
          }
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        dry_run: dryRun,
        cleaned_folders_count: cleanedFolders.length,
        deleted_files_count: totalFilesDeleted,
        cleaned_folders: cleanedFolders,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
