// app/api/generate-email/route.ts
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

const METIER_ANGLE: Record<
  string,
  { service: string; angle: string; exemple: string }
> = {
  boulanger: {
    service: "Automatisation & Marketing",
    angle: "Gestion des commandes en ligne et visibilité locale",
    exemple: "commandes click & collect, avis Google automatisés",
  },
  boulangerie: {
    service: "Automatisation & Marketing",
    angle: "Gestion des commandes en ligne et visibilité locale",
    exemple: "commandes click & collect, avis Google automatisés",
  },
  fleuriste: {
    service: "Marketing & SEO local",
    angle: "Visibilité digitale pour les occasions spéciales",
    exemple: "référencement 'fleuriste + ville', catalogue en ligne",
  },
  restaurant: {
    service: "Automatisation & Marketing",
    angle: "Réservations en ligne et gestion des avis",
    exemple: "module de réservation, réponse automatique aux avis",
  },
  coiffeur: {
    service: "Automatisation & Marketing",
    angle: "Prise de rendez-vous en ligne et fidélisation",
    exemple: "booking en ligne, rappels SMS automatiques",
  },
  coiffure: {
    service: "Automatisation & Marketing",
    angle: "Prise de rendez-vous en ligne et fidélisation",
    exemple: "booking en ligne, rappels SMS automatiques",
  },
  électricien: {
    service: "Agents IA & Marketing",
    angle: "Qualification des leads entrants et devis rapides",
    exemple: "chatbot qui qualifie les demandes d'urgence 24/7",
  },
  electricien: {
    service: "Agents IA & Marketing",
    angle: "Qualification des leads entrants et devis rapides",
    exemple: "chatbot qui qualifie les demandes d'urgence 24/7",
  },
  plombier: {
    service: "Agents IA & Marketing",
    angle: "Gestion des appels d'urgence et qualification",
    exemple: "agent IA qui filtre les vraies urgences des simples demandes",
  },
  maçon: {
    service: "Audit & Conseil",
    angle: "Digitalisation d'un métier encore très artisanal",
    exemple: "devis en ligne, portfolio de réalisations",
  },
  macon: {
    service: "Audit & Conseil",
    angle: "Digitalisation d'un métier encore très artisanal",
    exemple: "devis en ligne, portfolio de réalisations",
  },
  menuisier: {
    service: "Marketing & SEO local",
    angle: "Visibilité sur les recherches de rénovation",
    exemple: "positionnement sur 'menuisier + ville', photos avant/après",
  },
  tapissier: {
    service: "Marketing & SEO local",
    angle: "Mise en valeur d'un savoir-faire rare",
    exemple: "galerie en ligne, référencement de niche",
  },
  sellerie_automobile: {
    service: "Marketing & SEO local",
    angle: "Atteindre les passionnés et garages locaux",
    exemple: "partenariats digitaux avec garages de la région",
  },
  boucher: {
    service: "Automatisation & Marketing",
    angle: "Commandes à distance et fidélisation",
    exemple: "commandes de Noël/Pâques en ligne, programme de fidélité",
  },
  boucherie: {
    service: "Automatisation & Marketing",
    angle: "Commandes à distance et fidélisation",
    exemple: "commandes de Noël/Pâques en ligne, programme de fidélité",
  },
};

// Fix 1 + 2 : extractJson amélioré avec gestion <think> ouvert et fermé
function extractJson(raw: string, expected: "array" | "object"): any {
  const clean = raw
    .replace(/<think>[\s\S]*?<\/think>/gi, "") // <think> fermé
    .replace(/<think>[\s\S]*$/i, "") // <think> jamais fermé (consomme tout le reste)
    .replace(/```json\n?/gi, "")
    .replace(/```/gi, "")
    .trim();

  const [open, close] = expected === "array" ? ["[", "]"] : ["{", "}"];
  const start = clean.indexOf(open);
  const end = clean.lastIndexOf(close);
  if (start === -1 || end <= start) return null;

  try {
    return JSON.parse(clean.slice(start, end + 1));
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      prospect,
      metier,
      tone = "direct",
      mode = "unique",
    } = body as {
      prospect: Prospect;
      metier: string;
      tone?: string;
      mode?: "unique" | "sequence" | "subjects" | "call_script" | "sms";
    };

    if (!prospect || !metier) {
      return NextResponse.json(
        { error: "Données manquantes" },
        { status: 400 },
      );
    }

    const GROQ_API_KEY = process.env.GROQ_API_KEY;
    const AI_MODEL = process.env.AI_MODEL || "qwen/qwen3.8-27b";

    if (!GROQ_API_KEY) {
      return NextResponse.json(
        { error: "Clé API Groq non configurée" },
        { status: 500 },
      );
    }

    let anciennete = "";
    if (prospect.date_creation) {
      const age =
        new Date().getFullYear() -
        new Date(prospect.date_creation).getFullYear();
      anciennete =
        age <= 2
          ? `Entreprise récente (${age} an(s))`
          : `Entreprise établie (${age} ans)`;
    }

    const angleInfo = METIER_ANGLE[metier] || {
      service: "Solutions IA sur-mesure",
      angle: "Gain de temps et acquisition de clients locaux",
      exemple: "automatisation de tâches répétitives, visibilité en ligne",
    };

    const toneInstructions = {
      direct: "Ton direct, percutant, qui va droit au but.",
      chaleureux: "Ton chaleureux, empathique, axé sur la relation humaine.",
      formel: "Ton très professionnel, respectueux, vouvoiement strict.",
    };

    let systemPrompt = `Tu es AlicIA-GPT, consultant spécialisé en Intelligence Artificielle pour artisans et commerçants indépendants en France.

IDENTITÉ :
- Tu aides les professionnels de terrain à intégrer l'IA dans leur activité quotidienne.
- Ton approche : Audit → Stratégie → Intégration → Autonomie.
- Tu ne vends pas du rêve, tu proposes des solutions concrètes qui font gagner du temps et des clients.

CONTEXTE DU PROSPECT :
- Entreprise : ${prospect.nom}
- Métier : ${metier}
- Service AlicIA-GPT le plus pertinent : ${angleInfo.service}
- Angle d'attaque : ${angleInfo.angle}
- Exemple concret à citer : ${angleInfo.exemple}
- Localisation : ${prospect.code_postal} ${prospect.ville}
${anciennete ? `- Ancienneté : ${anciennete}` : ""}

STYLE DEMANDÉ : ${toneInstructions[tone as keyof typeof toneInstructions] || toneInstructions.direct}

RÈGLES STRICTES :
1. Email court (120-150 mots max), sans jargon technique ni buzzwords ("IA", "machine learning", "deep learning" sont interdits).
2. Parle bénéfices concrets : temps gagné, clients supplémentaires, moins de paperasse.
3. Personnalise avec la ville ET l'ancienneté.
4. Interdit : "J'espère que vous allez bien", "Je me permets", "Dans le cadre de", "N'hésitez pas", "Je vous contacte aujourd'hui".
5. Termine par un CTA léger et sans engagement (ex: "Un audit gratuit de 15 min ?").
6. Ne signe jamais avec un nom fictif. Termine simplement par "AlicIA-GPT".`;

    if (mode === "sms") {
      systemPrompt += `

MODE SMS : Génère un SMS ULTRA-COURT (max 160 caractères espaces inclus).
Pas de "Bonjour" formel, pas de signature, pas d'objet. Va droit au but : contexte local + bénéfice immédiat + CTA simple.
Réponds UNIQUEMENT avec le texte brut du SMS, sans guillemets, sans markdown.`;
    } else if (mode === "call_script") {
      systemPrompt += `

MODE SCRIPT D'APPEL : Génère un script JSON pour un appel à froid.
Réponds UNIQUEMENT avec ce JSON, sans aucun texte avant ou après, sans balises markdown :
{"intro":"Accroche percutante (max 15 mots)","pitch":"Argumentaire en 3 phrases courtes axé sur ${angleInfo.exemple}","objections":[{"objection":"Pas le temps","response":"Je comprends, je serai bref : 2 minutes suffisent."},{"objection":"Pas de budget","response":"Notre solution se rentabilise dès le premier client acquis."},{"objection":"Déjà équipé","response":"Parfait, on peut alors optimiser ce que vous avez déjà."}],"closing":"Quand seriez-vous disponible pour un audit gratuit de 15 min ?"}`;
    } else if (mode === "sequence") {
      systemPrompt += `

MODE SÉQUENCE : Génère 3 emails de relance.
- J+3 : Simple rappel bienveillant.
- J+7 : Apport d'un conseil utile lié à ${angleInfo.service}.
- J+15 : Email de rupture ("closing the loop"), très court.
Réponds UNIQUEMENT avec ce tableau JSON, sans aucun texte avant ou après, sans balises markdown :
[{"day":"J+3","subject":"Objet email 1","body":"Corps email 1"},{"day":"J+7","subject":"Objet email 2","body":"Corps email 2"},{"day":"J+15","subject":"Objet email 3","body":"Corps email 3"}]`;
    } else if (mode === "subjects") {
      systemPrompt += `

MODE EMAIL + OBJETS : Réponds UNIQUEMENT avec ce JSON, sans aucun texte avant ou après, sans balises markdown :
{"body":"Corps de l'email complet ici (120-150 mots, personnalisé avec ${prospect.ville} et ${anciennete || "l'ancienneté"})","subjects":["Objet curiosité court et intrigant","Objet avec ${prospect.ville} ou ${metier}","Objet bénéfice direct lié à ${angleInfo.exemple}"]}`;
    } else {
      systemPrompt += `

MODE EMAIL UNIQUE : Réponds UNIQUEMENT avec le corps de l'email. Pas d'objet, pas de signature, pas de guillemets, pas de markdown.`;
    }

    // Fix 3 : /no_think pour désactiver le raisonnement de Qwen
    const isJsonMode =
      mode === "sequence" || mode === "subjects" || mode === "call_script";

    const userPrompt = isJsonMode
      ? `Prospect : ${prospect.nom} (${prospect.ville}, NAF ${prospect.code_naf}). Réponds UNIQUEMENT avec le JSON demandé. Ignore les règles de signature et de format email. Aucun texte autour.`
      : `/no_think Rédige le message pour ${prospect.nom} (${prospect.ville}, NAF ${prospect.code_naf}).`;

    // Tokens augmentés
    const maxTokens =
      mode === "sequence"
        ? 2500
        : mode === "subjects" || mode === "call_script"
          ? 1800
          : mode === "sms"
            ? 300
            : 800;

    const response = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${GROQ_API_KEY}`,
        },
        body: JSON.stringify({
          model: AI_MODEL,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          temperature: 0.7,
          max_tokens: maxTokens,
        }),
      },
    );

    if (!response.ok) {
      const errText = await response.text();
      console.error("Erreur Groq :", errText);
      throw new Error(`Groq API error ${response.status}`);
    }

    const data = await response.json();
    const rawContent = data.choices?.[0]?.message?.content || "";

    if (mode === "sequence" || mode === "subjects" || mode === "call_script") {
      const expectedType = mode === "sequence" ? "array" : "object";
      const parsed = extractJson(rawContent, expectedType);
      if (!parsed) {
        console.error("❌ Échec parsing JSON. Réponse brute :", rawContent);
        return NextResponse.json(
          { error: "Erreur de format JSON de l'IA", debug: rawContent },
          { status: 500 },
        );
      }
      if (mode === "sequence") return NextResponse.json({ sequence: parsed });
      if (mode === "call_script") return NextResponse.json({ script: parsed });
      return NextResponse.json({
        email: parsed.body || "",
        subjects: parsed.subjects || [],
      });
    }

    // Nettoyage pour modes texte
    const cleanText = rawContent
      .replace(/<think>[\s\S]*?<\/think>/gi, "")
      .replace(/<think>[\s\S]*$/i, "")
      .trim();
    return NextResponse.json({ email: cleanText });
  } catch (error: any) {
    console.error("❌ Erreur génération :", error);
    return NextResponse.json({ error: "Erreur IA." }, { status: 500 });
  }
}
