import { NextRequest, NextResponse } from "next/server";

interface Prospect {
  siren: string;
  nom: string;
  adresse: string;
  code_postal: string;
  ville: string;
  code_naf: string;
  date_creation?: string;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// 1. Dictionnaire d'appoint pour les codes NAF les plus courants
const NAF_DICTIONARY: Record<string, string[]> = {
  plombier: ["43.22A"],
  boucher: ["10.13A", "47.22Z"],
  boucherie: ["10.13A", "47.22Z"],
  boulanger: ["10.71C", "47.24Z"],
  boulangerie: ["10.71C", "47.24Z"],
  électricien: ["43.21A"],
  electricien: ["43.21A"],
  maçon: ["43.99GY", "43.99G"],
  macon: ["43.99GY", "43.99G"],
  coiffeur: ["96.02A"],
  coiffure: ["96.02A"],
  restaurant: ["56.10A"],
  fleuriste: ["47.76Z"],
  menuisier: ["43.32A"],
  tapissier: ["31.09B"],
  sellerie_automobile: ["29.32Z"],
};

// 2. Récupérer la commune principale et son département
async function getCommuneInfo(cityName: string) {
  try {
    const res = await fetch(
      `https://geo.api.gouv.fr/communes?nom=${encodeURIComponent(
        cityName,
      )}&fields=code,nom,codeDepartement,centre&zone=metro&boost=population&limit=1`,
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (!data || data.length === 0) return null;
    return {
      codeInsee: data[0].code,
      nom: data[0].nom,
      dept: data[0].codeDepartement,
      centre: data[0].centre,
    };
  } catch (err) {
    console.error("Erreur résolution commune :", err);
    return null;
  }
}

// 3. Récupérer les communes dans un rayon de 10 km (si pas assez de résultats)
async function getNearbyCommunes(codeInsee: string) {
  try {
    const res = await fetch(
      `https://geo.api.gouv.fr/communes/${codeInsee}/voisines`,
    );
    if (!res.ok) return [];
    const data = await res.json();
    return data.map((c: any) => ({ code: c.code, nom: c.nom }));
  } catch (err) {
    console.error("Erreur récupération communes voisines :", err);
    return [];
  }
}

// 4. Parser la requête utilisateur
function parseQuery(prompt: string) {
  const matchVille = prompt.match(
    /(?:à|sur|vers|dans)\s+([A-Za-zÀ-ÖØ-öø-ÿ\s-]+)/i,
  );
  const ville = matchVille ? matchVille[1].trim() : prompt.trim();

  const lower = prompt.toLowerCase();
  let metier = "artisan";
  let codesNaf: string[] = [];

  for (const [key, nafs] of Object.entries(NAF_DICTIONARY)) {
    if (lower.includes(key)) {
      metier = key;
      codesNaf = nafs;
      break;
    }
  }

  // Si le métier n'est pas dans le dictionnaire, extraction du terme nettoyé
  if (codesNaf.length === 0) {
    metier = prompt
      .replace(/(?:je cherche|je recherche|des|du|de la|les|un|une)\s+/gi, "")
      .replace(/(?:à|sur|vers|dans)\s+[A-Za-zÀ-ÖØ-öø-ÿ\s-]+/gi, "")
      .trim();
  }

  return { ville, metier, codesNaf };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const prompt = body?.prompt;

    if (!prompt) {
      return NextResponse.json(
        { error: "Le champ 'prompt' est requis." },
        { status: 400 },
      );
    }

    const { ville: rawVille, metier, codesNaf } = parseQuery(prompt);
    const communeInfo = await getCommuneInfo(rawVille);

    if (!communeInfo) {
      return NextResponse.json({
        queryInfo: {
          ville: `${rawVille} (Introuvable)`,
          metier,
          codesNaf:
            codesNaf.length > 0 ? codesNaf.join(", ") : "Recherche texte",
          communes_scanned: 0,
        },
        total: 0,
        prospects: [],
        message: "Commune introuvable.",
      });
    }

    console.log(
      `🔎 Recherche pour : ${communeInfo.nom} (INSEE: ${communeInfo.codeInsee}, Dept: ${communeInfo.dept}) - Métier: ${metier}`,
    );

    let prospectsMap = new Map<string, Prospect>();

    // Helper pour interroger l'API Sirene et appliquer le FILTRE STRICT DE DÉPARTEMENT
    const fetchCompanies = async (params: string) => {
      const url = `https://recherche-entreprises.api.gouv.fr/search?${params}&per_page=25`;
      const res = await fetch(url);

      if (res.status === 429) {
        await sleep(500);
        return;
      }

      if (res.ok) {
        const data = await res.json();
        const results = data.results || [];

        results.forEach((item: any) => {
          const siege = item.siege || {};
          const codePostal = siege.code_postal || "";

          // 🛑 FILTRE DE SÉCURITÉ : On rejette toute entreprise n'appartenant pas au département recherché !
          if (
            codePostal &&
            !codePostal.startsWith(communeInfo.dept) &&
            communeInfo.dept.length === 2
          ) {
            return;
          }

          const siren = item.siren;
          if (siren && !prospectsMap.has(siren)) {
            const nomEntreprise =
              item.nom_complet ||
              item.nom_raison_sociale ||
              item.sigle ||
              "Entreprise sans nom";

            const adresseFormatee =
              siege.adresse ||
              `${siege.numero_voie || ""} ${siege.type_voie || ""} ${
                siege.libelle_voie || ""
              }`.trim() ||
              "Adresse non renseignée";

            prospectsMap.set(siren, {
              siren,
              nom: nomEntreprise,
              adresse: adresseFormatee,
              code_postal: codePostal,
              ville: siege.libelle_commune || communeInfo.nom,
              code_naf: item.activite_principale || codesNaf[0] || "N/A",
              date_creation: item.date_creation || "",
            });
          }
        });
      }
    };

    // ETAPE 1 : Recherche exacte sur la commune cible
    if (codesNaf.length > 0) {
      for (const naf of codesNaf) {
        await fetchCompanies(
          `code_commune=${communeInfo.codeInsee}&activite_principale=${naf}`,
        );
      }
    } else {
      await fetchCompanies(
        `code_commune=${communeInfo.codeInsee}&q=${encodeURIComponent(metier)}`,
      );
    }

    let communesScannedCount = 1;

    // ETAPE 2 : Si moins de 5 résultats, scan des communes voisines (10 km)
    if (prospectsMap.size < 5) {
      const nearby = await getNearbyCommunes(communeInfo.codeInsee);
      communesScannedCount += nearby.length;

      for (const neighbor of nearby) {
        if (prospectsMap.size >= 20) break; // Limite raisonnable

        if (codesNaf.length > 0) {
          for (const naf of codesNaf) {
            await fetchCompanies(
              `code_commune=${neighbor.code}&activite_principale=${naf}`,
            );
          }
        } else {
          await fetchCompanies(
            `code_commune=${neighbor.code}&q=${encodeURIComponent(metier)}`,
          );
        }
      }
    }

    const prospectsList = Array.from(prospectsMap.values());

    return NextResponse.json({
      queryInfo: {
        ville: `${communeInfo.nom} (INSEE : ${communeInfo.codeInsee})`,
        metier,
        codesNaf: codesNaf.length > 0 ? codesNaf.join(", ") : "Recherche texte",
        communes_scanned: communesScannedCount,
      },
      total: prospectsList.length,
      prospects: prospectsList,
    });
  } catch (error: any) {
    console.error("❌ Erreur serveur route.ts :", error);
    return NextResponse.json(
      { error: "Une erreur est survenue lors de la recherche." },
      { status: 500 },
    );
  }
}
