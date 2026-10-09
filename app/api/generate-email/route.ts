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
    } = body as {
      prospect: Prospect;
      metier: string;
      tone?: string;
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

    // Définition du ton
    const toneInstructions = {
      direct: "Ton direct, percutant, qui va droit au but.",
      chaleureux: "Ton chaleureux, empathique, axé sur la relation humaine.",
      formel:
        "Ton très professionnel, respectueux, vouvoiement strict et structure classique.",
    };

    const systemPrompt = `Tu es un expert en prospection B2B pour artisans et commerçants indépendants.
Style demandé : ${toneInstructions[tone as keyof typeof toneInstructions] || toneInstructions.direct}
Règles strictes :
1. Email court (120-150 mots max), sans jargon marketing.
2. Analyse le code NAF pour identifier UN problème concret de ce métier.
3. Personnalise avec la ville ET l'ancienneté si disponible.
4. Interdit : "J'espère que vous allez bien", "Je me permets", "Dans le cadre de", "N'hésitez pas".
5. Termine par une question simple (CTA léger, max 10 mots).
6. Réponds UNIQUEMENT avec le corps de l'email. Pas d'objet, pas de signature, pas de guillemets, pas de markdown.`;

    const userPrompt = `Prospect :
- Entreprise : ${prospect.nom}
- Métier : ${metier}
- Code NAF : ${prospect.code_naf}
- Localisation : ${prospect.code_postal} ${prospect.ville}
- Adresse : ${prospect.adresse}
${anciennete ? `- Ancienneté : ${anciennete}` : ""}

Rédige l'email de prospection.`;

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
          max_tokens: 400,
        }),
      },
    );

    if (!response.ok) {
      const errText = await response.text();
      console.error("Erreur Groq :", errText);
      throw new Error(`Groq API error ${response.status}`);
    }

    const data = await response.json();
    const generatedEmail = data.choices[0].message.content.trim();

    return NextResponse.json({ email: generatedEmail });
  } catch (error: any) {
    console.error("❌ Erreur génération email :", error);
    return NextResponse.json(
      { error: "Erreur lors de la génération par l'IA." },
      { status: 500 },
    );
  }
}
