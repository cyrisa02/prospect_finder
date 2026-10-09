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
      mode?: "unique" | "sequence" | "subjects" | "call_script" | "sms";
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
      const age =
        new Date().getFullYear() -
        new Date(prospect.date_creation).getFullYear();
      anciennete =
        age <= 2
          ? `Entreprise récente (${age} an(s))`
          : `Entreprise établie (${age} ans)`;
    }

    const toneInstructions = {
      direct: "Ton direct, percutant.",
      chaleureux: "Ton chaleureux, empathique.",
      formel: "Ton très professionnel, respectueux.",
    };

    let systemPrompt = `Tu es un expert en prospection B2B. Style : ${toneInstructions[tone as keyof typeof toneInstructions] || toneInstructions.direct}.
Règles : 1. Court. 2. Analyse le code NAF. 3. Personnalise avec ville/ancienneté. 4. Interdit : "J'espère que vous allez bien", "Je me permets".`;

    if (mode === "sms") {
      systemPrompt += ` 5. Génère un SMS professionnel ULTRA-COURT (max 300 caractères espaces inclus). 
      Pas de "Bonjour" formel, pas de signature. Va droit au but : contexte local + bénéfice immédiat + CTA simple (ex: "Répondez OUI"). 
      Réponds UNIQUEMENT avec le texte brut du SMS, sans guillemets.`;
    } else if (mode === "call_script") {
      systemPrompt += ` 5. Génère un script d'appel JSON : {"intro":"...", "pitch":"...", "objections":[{"objection":"...","response":"..."}], "closing":"..."}`;
    } else if (mode === "sequence") {
      systemPrompt += ` 5. Génère 3 emails JSON : [{"day":"J+3","subject":"...","body":"..."}, {"day":"J+7"...}, {"day":"J+15"...}]`;
    } else if (mode === "subjects") {
      systemPrompt += ` 5. Réponds JSON : {"body":"...", "subjects":["Objet curiosité","Objet personnalisation","Objet bénéfice"]}`;
    } else {
      systemPrompt += ` 5. Réponds UNIQUEMENT avec le corps de l'email.`;
    }

    const userPrompt = `Prospect : ${prospect.nom}, ${metier}, NAF ${prospect.code_naf}, ${prospect.ville}. ${anciennete ? `Ancienneté : ${anciennete}.` : ""} ${mode === "sequence" ? "Séquence." : mode === "subjects" ? "Email + objets." : mode === "call_script" ? "Script." : mode === "sms" ? "SMS." : "Email."}`;

    const maxTokens =
      mode === "sequence"
        ? 1200
        : mode === "subjects" || mode === "call_script"
          ? 800
          : mode === "sms"
            ? 150
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

    if (!response.ok) throw new Error(`Groq API error ${response.status}`);

    const data = await response.json();
    const rawContent = data.choices[0].message.content
      .trim()
      .replace(/```json\n?/g, "")
      .replace(/```/g, "")
      .trim();

    if (mode === "sequence" || mode === "subjects" || mode === "call_script") {
      try {
        const parsed = JSON.parse(rawContent);
        if (mode === "sequence") return NextResponse.json({ sequence: parsed });
        if (mode === "call_script")
          return NextResponse.json({ script: parsed });
        return NextResponse.json({
          email: parsed.body,
          subjects: parsed.subjects,
        });
      } catch (e) {
        return NextResponse.json(
          { error: "Erreur parsing JSON IA" },
          { status: 500 },
        );
      }
    }

    // Pour "sms" et "unique", on retourne le texte brut
    return NextResponse.json({ email: rawContent });
  } catch (error: any) {
    console.error("❌ Erreur génération :", error);
    return NextResponse.json({ error: "Erreur IA." }, { status: 500 });
  }
}
