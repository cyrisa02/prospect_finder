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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      prospect,
      metier,
      tone = "direct",
      mode = "subjects",
    } = body as {
      prospect: Prospect;
      metier: string;
      tone?: string;
      mode?: "unique" | "sequence" | "subjects" | "call_script";
    };

    if (!prospect || !metier) {
      return NextResponse.json(
        { error: "Données manquantes" },
        { status: 400 },
      );
    }

    const GROQ_API_KEY = process.env.GROQ_API_KEY;
    const AI_MODEL = process.env.AI_MODEL || "qwen/qwen3-8b";

    if (!GROQ_API_KEY) {
      return NextResponse.json(
        { error: "Clé API Groq non configurée" },
        { status: 500 },
      );
    }

    let anciennete = "";
    if (prospect.date_creation) {
      const anneeCreation = new Date(prospect.date_creation).getFullYear();
      const age = new Date().getFullYear() - anneeCreation;
      anciennete =
        age <= 2
          ? `Entreprise récente (créée en ${anneeCreation}, ${age} an(s))`
          : `Entreprise établie (créée en ${anneeCreation}, ${age} ans d'activité)`;
    }

    const toneInstructions = {
      direct: "Ton direct, percutant, qui va droit au but.",
      chaleureux: "Ton chaleureux, empathique, axé sur la relation humaine.",
      formel: "Ton très professionnel, respectueux, vouvoiement strict.",
    };

    let systemPrompt = `Tu es un expert en prospection B2B pour artisans et commerçants indépendants.
Style demandé : ${toneInstructions[tone as keyof typeof toneInstructions] || toneInstructions.direct}
Règles strictes :
1. Email court (120-150 mots max), sans jargon marketing.
2. Analyse le code NAF pour identifier UN problème concret de ce métier.
3. Personnalise avec la ville ET l'ancienneté si disponible.
4. Interdit : "J'espère que vous allez bien", "Je me permets", "Dans le cadre de", "N'hésitez pas".
5. Termine par une question simple (CTA léger, max 10 mots).`;

    if (mode === "call_script") {
      systemPrompt += `
6. Tu es un expert en vente téléphonique B2B. Génère un script d'appel à froid pour ce métier.
7. Réponds UNIQUEMENT avec un objet JSON valide, sans markdown. Format exact :
{
  "intro": "Phrase d'accroche percutante (max 15 mots) pour ne pas se faire raccrocher au nez.",
  "pitch": "Argumentaire principal en 3 phrases courtes, axé sur un problème concret du code NAF.",
  "objections": [
    { "objection": "Objection classique 1 (ex: pas le temps)", "response": "Réponse courte et empathique" },
    { "objection": "Objection classique 2 (ex: pas de budget)", "response": "Réponse courte" },
    { "objection": "Objection classique 3 (ex: déjà équipé)", "response": "Réponse courte" }
  ],
  "closing": "Phrase de closing pour obtenir un rendez-vous ou un envoi d'information."
}`;
    } else if (mode === "sequence") {
      systemPrompt += `
6. Tu dois générer UNE SÉQUENCE DE 3 EMAILS (J+3, J+7, J+15).
   - Email 1 (J+3) : Simple rappel bienveillant.
   - Email 2 (J+7) : Apport d'une information ou d'un conseil utile lié à leur métier.
   - Email 3 (J+15) : Email de rupture ("closing the loop"), très court.
7. Réponds UNIQUEMENT avec un tableau JSON valide, sans markdown, sans guillemets autour du JSON. Format exact : [{"day": "J+3", "subject": "...", "body": "..."}, {"day": "J+7", "subject": "...", "body": "..."}, {"day": "J+15", "subject": "...", "body": "..."}]`;
    } else if (mode === "subjects") {
      systemPrompt += `
6. Réponds UNIQUEMENT avec un objet JSON valide, sans markdown, sans guillemets autour du JSON. Format exact :
{
  "body": "Le corps de l'email ici...",
  "subjects": [
    "Objet 1 : Levier de curiosité (court, intrigue)",
    "Objet 2 : Levier de personnalisation (cite la ville ou le métier)",
    "Objet 3 : Levier de bénéfice direct (résultat concret)"
  ]
}`;
    } else {
      systemPrompt += `
6. Réponds UNIQUEMENT avec le corps de l'email. Pas d'objet, pas de signature, pas de guillemets, pas de markdown.`;
    }

    const userPrompt = `Prospect :
- Entreprise : ${prospect.nom}
- Métier : ${metier}
- Code NAF : ${prospect.code_naf}
- Localisation : ${prospect.code_postal} ${prospect.ville}
- Adresse : ${prospect.adresse}
${anciennete ? `- Ancienneté : ${anciennete}` : ""}

${mode === "sequence" ? "Génère la séquence de relance en JSON." : mode === "subjects" ? "Génère l'email avec 3 variantes d'objets en JSON." : mode === "call_script" ? "Génère le script d'appel en JSON." : "Rédige l'email de prospection."}`;

    const maxTokens =
      mode === "sequence"
        ? 1200
        : mode === "subjects" || mode === "call_script"
          ? 800
          : 400;

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
    const rawContent = data.choices[0].message.content.trim();

    if (mode === "sequence" || mode === "subjects" || mode === "call_script") {
      const jsonStr = rawContent
        .replace(/```json\n?/g, "")
        .replace(/```/g, "")
        .trim();
      try {
        const parsed = JSON.parse(jsonStr);
        if (mode === "sequence") {
          return NextResponse.json({ sequence: parsed });
        } else if (mode === "call_script") {
          return NextResponse.json({ script: parsed });
        } else {
          return NextResponse.json({
            email: parsed.body,
            subjects: parsed.subjects,
          });
        }
      } catch (e) {
        console.error("Erreur parsing JSON :", jsonStr);
        return NextResponse.json(
          { error: "Erreur de format JSON de l'IA" },
          { status: 500 },
        );
      }
    }

    return NextResponse.json({ email: rawContent });
  } catch (error: any) {
    console.error("❌ Erreur génération email :", error);
    return NextResponse.json(
      { error: "Erreur lors de la génération par l'IA." },
      { status: 500 },
    );
  }
}
