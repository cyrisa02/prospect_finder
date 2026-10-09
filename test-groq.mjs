import "dotenv/config";
import { createOpenAI } from "@ai-sdk/openai";
import { generateText } from "ai";

// Debug : on affiche la variable pour voir si elle est bien chargée
console.log(
  "🔍 GROQ_API_KEY chargée :",
  process.env.GROQ_API_KEY ? "✅ OUI (masquée)" : "❌ NON (undefined)",
);
console.log(" Valeur brute :", process.env.GROQ_API_KEY);

if (!process.env.GROQ_API_KEY) {
  console.error(
    "\n❌ La clé API n'est pas chargée. Vérifie ton fichier .env.local",
  );
  process.exit(1);
}

const groq = createOpenAI({
  baseURL: "https://api.groq.com/openai/v1",
  apiKey: process.env.GROQ_API_KEY,
});

async function test() {
  console.log("\n🚀 Test de connexion à Groq avec qwen/qwen3.8-27b...\n");

  const { text } = await generateText({
    model: groq("qwen/qwen3.8-27b"),
    prompt: "En une phrase, explique-moi ce qu'est un plombier.",
  });

  console.log("✅ Réponse de Qwen :", text);
}

test().catch(console.error);
