import { GoogleGenAI, Type } from "@google/genai";
import { GroupData, ScheduleEntry, DayOfWeek, TimeSlot } from "./types";
import { TIME_SLOTS, normalizeCohortID } from "./constants";

// Get the key from Vercel environment variables
const apiKey = import.meta.env.VITE_GEMINI_API_KEY;

if (!apiKey) {
  console.error("API Key missing! Make sure VITE_GEMINI_API_KEY is set in Vercel.");
}

// Initialize the AI
const ai = new GoogleGenAI({ apiKey: apiKey || "12345" });

export const parseSchedulePDF = async (file: File, filename: string): Promise<GroupData> => {
  const base64Data = await fileToBase64(file);
  
  const prompt = `
    Extract schedule data.
    Group Name: Extract from filename "${filename}" or content. Simplify to format like DEV101.
    Entries: Map to days (Lundi-Samedi) and slots (${TIME_SLOTS.join(", ")}).
    Return JSON.
  `;

  const response = await ai.models.generateContent({
    model: "gemini-1.5-flash", 
    contents: [
      {
        parts: [
          { text: prompt },
          { inlineData: { mimeType: "application/pdf", data: base64Data } }
        ]
      }
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          groupName: { type: Type.STRING },
          entries: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                day: { type: Type.STRING },
                timeSlot: { type: Type.STRING },
                room: { type: Type.STRING },
                professor: { type: Type.STRING }
              }
            }
          }
        }
      }
    }
  });

  const rawJson = JSON.parse(response.text() || "{}");
  const normalizedGroupName = normalizeCohortID(rawJson.groupName || "");

  const dayMap: Record<string, DayOfWeek> = {
    'Lundi': DayOfWeek.Monday, 'Mardi': DayOfWeek.Tuesday, 'Mercredi': DayOfWeek.Wednesday,
    'Jeudi': DayOfWeek.Thursday, 'Vendredi': DayOfWeek.Friday, 'Samedi': DayOfWeek.Saturday
  };

  const formattedEntries: ScheduleEntry[] = (rawJson.entries || []).map((e: any) => ({
    groupName: normalizedGroupName,
    day: dayMap[e.day] || e.day,
    timeSlot: e.timeSlot as TimeSlot,
    room: e.room,
    professor: e.professor
  }));

  return {
    name: normalizedGroupName,
    lastUpdated: Date.now(),
    entries: formattedEntries,
    status: 'OK',
    mondaySummary: []
  };
};

const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = error => reject(error);
  });
};
