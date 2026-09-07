const GEMINI_MODEL = "gemini-3.6-flash";
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const TRANSCRIBE_PROMPT = `Transcribe all readable body text from this photo of a book or document page, exactly as printed, preserving paragraph breaks. Ignore page headers, footers, and running heads unless they are the only text visible. Output only the transcribed text -- no commentary, no markdown, no quotation marks around it.`;

function splitDataUrl(image: string): { mimeType: string; data: string } {
  const match = /^data:([^;]+);base64,(.*)$/s.exec(image);
  if (match) {
    return { mimeType: match[1], data: match[2] };
  }
  return { mimeType: "image/jpeg", data: image };
}

/**
 * Transcribes the visible body text from a photo (already preprocessed via
 * preprocessShelfImage) using Gemini. Shares the same API key and REST-call
 * approach as geminiShelfService -- see that file for why a raw fetch is
 * used instead of the @google/genai SDK.
 */
export async function transcribePageImage(base64Image: string, apiKey: string): Promise<string> {
  if (!apiKey || !apiKey.trim()) {
    throw new Error("A Gemini API key is required. Add one in Shelf Scanner settings.");
  }
  if (!base64Image) {
    throw new Error("No image was provided to transcribe.");
  }

  const { mimeType, data } = splitDataUrl(base64Image);

  let response: Response;
  try {
    response = await fetch(`${GEMINI_ENDPOINT}?key=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: TRANSCRIBE_PROMPT }, { inlineData: { mimeType, data } }],
          },
        ],
        generationConfig: { temperature: 0.1 },
      }),
    });
  } catch {
    throw new Error("Could not reach the Gemini API. Check your internet connection and try again.");
  }

  if (!response.ok) {
    if (response.status === 429) {
      throw new Error("Gemini API rate limit reached. Wait a moment and try again.");
    }
    if (response.status === 401 || response.status === 403) {
      throw new Error("Gemini API key was rejected. Check that it's valid and has Generative Language API access enabled.");
    }
    throw new Error(`Gemini API request failed (${response.status}).`);
  }

  const payload = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = payload?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text || !text.trim()) {
    throw new Error("Gemini couldn't read any text from that photo. Try a closer, well-lit shot of the page.");
  }

  return text.trim();
}
