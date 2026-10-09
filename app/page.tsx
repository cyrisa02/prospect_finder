"use client";
import { useState } from "react";

interface Prospect {
  siren: string;
  nom: string;
  adresse: string;
  code_postal: string;
  ville: string;
  code_naf: string;
  date_creation?: string;
}
interface QueryInfo {
  ville: string;
  metier: string;
  codesNaf: string;
  communes_scanned: number;
}
interface SequenceItem {
  day: string;
  subject: string;
  body: string;
}

const DIGITAL_FRIENDLY_NAF = [
  "47.76Z",
  "56.10A",
  "96.02A",
  "47.24Z",
  "10.71C",
  "43.21A",
];

function getLeadScore(prospect: Prospect, targetVille: string): number {
  let score = 0;
  if (prospect.date_creation) {
    const age =
      new Date().getFullYear() - new Date(prospect.date_creation).getFullYear();
    if (age <= 2) score += 40;
    else if (age <= 5) score += 25;
    else score += 10;
  }
  if (prospect.ville === targetVille) score += 30;
  else score += 10;
  if (DIGITAL_FRIENDLY_NAF.includes(prospect.code_naf)) score += 30;
  return score;
}

function getScoreBadge(score: number) {
  if (score >= 70)
    return {
      color: "bg-green-100 text-green-800 border-green-200",
      label: " Chaud",
    };
  if (score >= 40)
    return {
      color: "bg-yellow-100 text-yellow-800 border-yellow-200",
      label: "⚠️ Tiède",
    };
  return { color: "bg-red-100 text-red-800 border-red-200", label: "❄️ Froid" };
}

export default function Home() {
  const [prompt, setPrompt] = useState("");
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [queryInfo, setQueryInfo] = useState<QueryInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [emailLoading, setEmailLoading] = useState<string | null>(null);
  const [generatedEmail, setGeneratedEmail] = useState("");
  const [generatedSubjects, setGeneratedSubjects] = useState<string[]>([]);
  const [generatedSequence, setGeneratedSequence] = useState<SequenceItem[]>(
    [],
  );
  const [generatedScript, setGeneratedScript] = useState<any>(null);
  const [error, setError] = useState("");
  const [tone, setTone] = useState("direct");
  const [mode, setMode] = useState<
    "unique" | "sequence" | "subjects" | "call_script"
  >("subjects");
  const [batchLoading, setBatchLoading] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0 });
  const [batchEmails, setBatchEmails] = useState<Record<string, string>>({});
  const [saveLoading, setSaveLoading] = useState<string | null>(null);
  const [batchSaveLoading, setBatchSaveLoading] = useState(false);
  const [savedSirens, setSavedSirens] = useState<Set<string>>(new Set());

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!prompt.trim()) return;
    setLoading(true);
    setGeneratedEmail("");
    setGeneratedSubjects([]);
    setGeneratedSequence([]);
    setGeneratedScript(null);
    setProspects([]);
    setQueryInfo(null);
    setError("");
    setBatchEmails({});
    setSavedSirens(new Set());
    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const data = await res.json();
      if (res.ok && data.prospects) {
        setProspects(data.prospects);
        setQueryInfo(data.queryInfo);
      } else setError(data.error || "Erreur recherche");
    } catch (err) {
      setError("Impossible de contacter le serveur.");
    } finally {
      setLoading(false);
    }
  }

  async function handleGenerateEmail(prospect: Prospect) {
    setEmailLoading(prospect.siren);
    setGeneratedEmail("");
    setGeneratedSubjects([]);
    setGeneratedSequence([]);
    setGeneratedScript(null);
    try {
      const res = await fetch("/api/generate-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prospect,
          metier: queryInfo?.metier,
          tone,
          mode,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        if (mode === "sequence" && data.sequence)
          setGeneratedSequence(data.sequence);
        else if (mode === "call_script" && data.script)
          setGeneratedScript(data.script);
        else if (mode === "subjects" && data.email) {
          setGeneratedEmail(data.email);
          setGeneratedSubjects(data.subjects || []);
        } else if (data.email) setGeneratedEmail(data.email);
      } else setError(data.error || "Erreur génération");
    } catch (err) {
      setError("Erreur communication IA.");
    } finally {
      setEmailLoading(null);
    }
  }

  async function handleBatchGenerate() {
    setBatchLoading(true);
    setBatchProgress({ current: 0, total: prospects.length });
    setBatchEmails({});
    const newEmails: Record<string, string> = {};
    for (let i = 0; i < prospects.length; i++) {
      const prospect = prospects[i];
      try {
        const res = await fetch("/api/generate-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prospect,
            metier: queryInfo?.metier,
            tone,
            mode: "unique",
          }),
        });
        const data = await res.json();
        if (res.ok && data.email) newEmails[prospect.siren] = data.email;
      } catch (err) {
        console.error(`Erreur batch ${prospect.nom}`, err);
      }
      setBatchProgress({ current: i + 1, total: prospects.length });
      setBatchEmails({ ...newEmails });
      if (i < prospects.length - 1)
        await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    setBatchLoading(false);
  }

  const handleExportCSV = () => {
    if (prospects.length === 0) return;
    const headers = [
      "SIREN",
      "Nom",
      "Adresse",
      "CP",
      "Ville",
      "NAF",
      "Création",
      "Email",
    ];
    const rows = prospects.map((p) =>
      [
        p.siren,
        p.nom,
        p.adresse,
        p.code_postal,
        p.ville,
        p.code_naf,
        p.date_creation,
        batchEmails[p.siren] || generatedEmail,
      ]
        .map((v) => `"${String(v || "").replace(/"/g, '""')}"`)
        .join(","),
    );
    const csvContent =
      "data:text/csv;charset=utf-8," + [headers.join(","), ...rows].join("\n");
    const link = document.createElement("a");
    link.setAttribute("href", encodeURI(csvContent));
    link.setAttribute(
      "download",
      `prospects_${queryInfo?.metier || "search"}_${new Date().toISOString().slice(0, 10)}.csv`,
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  async function handleSaveSingle(prospect: Prospect) {
    setSaveLoading(prospect.siren);
    try {
      const res = await fetch("/api/save-to-sheet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prospect,
          metier: queryInfo?.metier,
          email: batchEmails[prospect.siren] || generatedEmail,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success)
        setSavedSirens((prev) => new Set(prev).add(prospect.siren));
      else alert(" Erreur : " + (data.error || "Inconnue"));
    } catch (err) {
      alert("Erreur communication serveur.");
    } finally {
      setSaveLoading(null);
    }
  }

  async function handleBatchSave() {
    setBatchSaveLoading(true);
    let savedCount = 0;
    for (let i = 0; i < prospects.length; i++) {
      const prospect = prospects[i];
      try {
        const res = await fetch("/api/save-to-sheet", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prospect,
            metier: queryInfo?.metier,
            email: batchEmails[prospect.siren] || "",
          }),
        });
        const data = await res.json();
        if (res.ok && data.success) {
          savedCount++;
          setSavedSirens((prev) => new Set(prev).add(prospect.siren));
        }
      } catch (err) {
        console.error(`Erreur save ${prospect.nom}`, err);
      }
      if (i < prospects.length - 1)
        await new Promise((resolve) => setTimeout(resolve, 500));
    }
    setBatchSaveLoading(false);
    alert(`✅ ${savedCount} prospect(s) sauvegardé(s)`);
  }

  return (
    <main className="p-8 max-w-6xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">Prospect Finder</h1>
      <form onSubmit={handleSearch} className="mb-8">
        <input
          type="text"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Ex: Je cherche des boulangers à Soissons"
          className="w-full p-3 border rounded-lg text-lg text-black"
          required
        />
        <div className="mt-4 flex flex-wrap gap-4 items-center">
          <button
            type="submit"
            disabled={loading}
            className="bg-black text-white px-6 py-3 rounded-lg disabled:opacity-50 hover:bg-gray-800"
          >
            {loading ? "Recherche..." : "Rechercher"}
          </button>
          <select
            value={tone}
            onChange={(e) => setTone(e.target.value)}
            className="p-3 border rounded-lg text-black bg-white"
          >
            <option value="direct">Ton direct</option>
            <option value="chaleureux">Ton chaleureux</option>
            <option value="formel">Ton formel</option>
          </select>
          <div className="flex items-center gap-2 ml-4">
            <span className="text-sm text-gray-600">Mode :</span>
            {(["unique", "subjects", "sequence", "call_script"] as const).map(
              (m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={`px-3 py-1 rounded text-sm ${mode === m ? "bg-black text-white" : "bg-gray-200 text-gray-700"}`}
                >
                  {m === "unique"
                    ? "Email"
                    : m === "subjects"
                      ? "Email + Objets"
                      : m === "sequence"
                        ? "Séquence"
                        : "Script"}
                </button>
              ),
            )}
          </div>
        </div>
      </form>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-800">
          {error}
        </div>
      )}
      {queryInfo && (
        <div className="mb-6 p-4 bg-blue-50 rounded-lg text-blue-900">
          <h2 className="font-semibold mb-2">Requête analysée :</h2>
          <p>
            <strong>Ville :</strong> {queryInfo.ville}
          </p>
          <p>
            <strong>Métier :</strong> {queryInfo.metier}
          </p>
          <p>
            <strong>Codes NAF :</strong> {queryInfo.codesNaf}
          </p>
          <p className="text-sm mt-2 text-gray-600">
            {queryInfo.communes_scanned} communes scannées
          </p>
        </div>
      )}

      {prospects.length > 0 && (
        <div>
          <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
            <h2 className="text-2xl font-semibold text-gray-800">
              {prospects.length} prospect(s)
            </h2>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={handleBatchGenerate}
                disabled={batchLoading}
                className="bg-purple-600 text-white px-4 py-2 rounded disabled:opacity-50 hover:bg-purple-700"
              >
                {batchLoading
                  ? `Génération... (${batchProgress.current}/${batchProgress.total})`
                  : " Batch Emails"}
              </button>
              <button
                onClick={handleBatchSave}
                disabled={batchSaveLoading}
                className="bg-orange-600 text-white px-4 py-2 rounded disabled:opacity-50 hover:bg-orange-700"
              >
                {batchSaveLoading ? "Sauvegarde..." : "💾 Batch Sheets"}
              </button>
              <button
                onClick={handleExportCSV}
                className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
              >
                📥 CSV
              </button>
            </div>
          </div>
          {batchLoading && (
            <div className="mb-4 w-full bg-gray-200 rounded-full h-2.5">
              <div
                className="bg-purple-600 h-2.5 rounded-full transition-all"
                style={{
                  width: `${(batchProgress.current / batchProgress.total) * 100}%`,
                }}
              ></div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {prospects.map((prospect, idx) => {
              const targetVille = queryInfo?.ville.split(" ")[0] || "";
              const score = getLeadScore(prospect, targetVille);
              const badge = getScoreBadge(score);
              return (
                <div
                  key={prospect.siren || idx}
                  className="border rounded-lg p-4 bg-white shadow-sm hover:shadow-md transition-shadow relative"
                >
                  <div className="absolute top-3 right-3">
                    <span
                      className={`text-xs px-2 py-1 rounded-full border font-medium ${badge.color}`}
                    >
                      {badge.label} ({score})
                    </span>
                  </div>
                  <h3 className="font-bold text-lg mb-2 text-gray-900 pr-20">
                    {prospect.nom}
                  </h3>
                  <p className="text-sm text-gray-600 mb-1">
                    {prospect.adresse}
                  </p>
                  <p className="text-sm text-gray-600 mb-1">
                    {prospect.code_postal} {prospect.ville}
                  </p>
                  <p className="text-xs text-gray-500 mb-1">
                    NAF : {prospect.code_naf}
                  </p>
                  {prospect.date_creation && (
                    <p className="text-xs text-gray-400 mb-3">
                      Créée le : {prospect.date_creation}
                    </p>
                  )}
                  {batchEmails[prospect.siren] && (
                    <div className="mt-2 p-2 bg-green-50 rounded text-xs text-green-800 max-h-24 overflow-y-auto">
                      {batchEmails[prospect.siren]}
                    </div>
                  )}
                  {savedSirens.has(prospect.siren) && (
                    <div className="mt-2 text-xs text-green-600 font-medium">
                      ✅ Sauvegardé
                    </div>
                  )}
                  <div className="flex flex-col gap-2 mt-2">
                    <button
                      onClick={() => handleGenerateEmail(prospect)}
                      disabled={emailLoading === prospect.siren}
                      className="w-full bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-50 hover:bg-blue-700"
                    >
                      {emailLoading === prospect.siren
                        ? "Génération..."
                        : "Générer"}
                    </button>
                    <button
                      onClick={() => handleSaveSingle(prospect)}
                      disabled={saveLoading === prospect.siren}
                      className="w-full bg-orange-600 text-white px-4 py-2 rounded disabled:opacity-50 hover:bg-orange-700"
                    >
                      {saveLoading === prospect.siren
                        ? "Envoi..."
                        : "💾 Sauvegarder"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {generatedSubjects.length > 0 && (
        <div className="mt-8 p-6 bg-yellow-50 border border-yellow-200 rounded-lg">
          <h2 className="text-xl font-semibold mb-4 text-yellow-800">
            3 objets suggérés :
          </h2>
          <div className="space-y-2">
            {generatedSubjects.map((s, i) => (
              <button
                key={i}
                onClick={() => navigator.clipboard.writeText(s)}
                className="w-full text-left p-3 bg-white border rounded hover:bg-yellow-100 flex justify-between"
              >
                <span className="text-sm text-gray-800">{s}</span>
                <span className="text-xs text-gray-400">Copier</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {generatedEmail && (
        <div className="mt-8 p-6 bg-gray-50 border rounded-lg">
          <h2 className="text-xl font-semibold mb-4">Email :</h2>
          <pre className="whitespace-pre-wrap text-sm text-gray-800">
            {generatedEmail}
          </pre>
          <button
            onClick={() => navigator.clipboard.writeText(generatedEmail)}
            className="mt-4 bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
          >
            Copier
          </button>
        </div>
      )}
      {generatedSequence.length > 0 && (
        <div className="mt-8 space-y-4">
          <h2 className="text-xl font-semibold mb-4">Séquence :</h2>
          {generatedSequence.map((item, i) => (
            <div key={i} className="p-4 bg-gray-50 border rounded-lg">
              <h3 className="font-bold text-purple-700">
                {item.day} - {item.subject}
              </h3>
              <pre className="whitespace-pre-wrap text-sm text-gray-800 mt-2">
                {item.body}
              </pre>
            </div>
          ))}
        </div>
      )}
      {generatedScript && (
        <div className="mt-8 p-6 bg-indigo-50 border border-indigo-200 rounded-lg">
          <h2 className="text-xl font-semibold mb-4 text-indigo-900">
            Script d'appel :
          </h2>
          <div className="mb-4">
            <h3 className="font-bold text-indigo-700">1. Accroche</h3>
            <p className="text-sm bg-white p-3 rounded border mt-1">
              {generatedScript.intro}
            </p>
          </div>
          <div className="mb-4">
            <h3 className="font-bold text-indigo-700">2. Pitch</h3>
            <p className="text-sm bg-white p-3 rounded border mt-1">
              {generatedScript.pitch}
            </p>
          </div>
          <div className="mb-4">
            <h3 className="font-bold text-indigo-700">3. Objections</h3>
            <div className="space-y-2 mt-1">
              {generatedScript.objections?.map((o: any, i: number) => (
                <div key={i} className="bg-white p-3 rounded border">
                  <p className="text-sm font-semibold text-red-600">
                    ❌ {o.objection}
                  </p>
                  <p className="text-sm text-green-700 mt-1">✅ {o.response}</p>
                </div>
              ))}
            </div>
          </div>
          <div>
            <h3 className="font-bold text-indigo-700">4. Closing</h3>
            <p className="text-sm bg-white p-3 rounded border mt-1">
              {generatedScript.closing}
            </p>
          </div>
        </div>
      )}
    </main>
  );
}
