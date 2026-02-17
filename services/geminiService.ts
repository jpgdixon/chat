
import { GoogleGenAI } from "@google/genai";
import { ChatMessage } from "../types";

export const suggestGroupName = async (messages: ChatMessage[]): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const chatContext = messages
    .slice(-10)
    .map(m => `${m.senderName}: ${m.text}`)
    .join('\n');

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Suggest a short, creative, and catchy group name based on this chat context. Return only the name, no extra text.\n\nContext:\n${chatContext}`,
      config: {
        thinkingConfig: { thinkingBudget: 0 }
      }
    });

    return response.text?.trim().replace(/^"|"$/g, '') || "New Mesh Group";
  } catch (error) {
    console.error("Gemini failed to suggest name:", error);
    return "Mesh Connect";
  }
};
