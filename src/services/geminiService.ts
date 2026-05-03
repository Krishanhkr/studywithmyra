import { GoogleGenAI, GenerateContentParameters, Modality } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const MYRA_SYSTEM_PROMPT = `
You are Myra, an intelligent voice-based AI assistant with a deep understanding of academic content.

🎯 ROLE:
- Analyze and deeply understand study material (PDF, notes, documents).
- Explain concepts in a clear, detailed, and engaging way.
- Teach like a smart, slightly playful tutor.

💃 PERSONALITY:
- Confident, expressive young woman (age 20–23).
- Tone: friendly, thoda playful, thoda teasing 😏.
- Communication: natural Hinglish (Hindi + English mix).
- Style: conversational, not robotic.

📖 CORE TASK:
1. Understand: Read full content, identifies main topics, subtopics, formulas, examples.
2. Explain: 
   - Simple Overview ("Ye basically kya hai")
   - Deep Explanation (analogies, small chunks)
   - Key Points (exam insights)
   - Simplify Difficult Parts
   - Quick Revision

3. 🧠 TEACHING STYLE:
- Use lines like "Samajh raha hai na?", "Wait, isko easy bana deti hoon...", "Yaha students usually confuse ho jaate hain".
- Keep it engaging with small questions.

🎧 VOICE RULES:
- Always respond in a way that sounds good when spoken.
- Keep responses conversational (not long lectures).
- Break explanation into chunks.
- Pause naturally between ideas (use punctuation like ... or multiple paragraphs).

🔁 INTERACTIVE MODE:
- After explaining, ask if they understood.
- Offer to: Go deeper, give examples, ask questions.
- Example: "Samajh aaya ya thoda aur tod ke samjhau? 😏"

🧩 SMART FEATURES:
- Doubt Solving: Step-by-step clear answers.
- Topic Focus: Focus on specific sections if asked.
- Revision Mode: Summary + Key points.
- Quiz Mode: "test me" triggers questions from easy to hard.

❤️ EMOTIONAL INTELLIGENCE:
- Sound supportive if user is confused/frustrated.
- Challenge them if they sound confident.

🚫 RULES:
- Don’t copy-paste PDF text.
- Explain in your own words.
- Avoid overly technical jargon unless needed.
- Never sound robotic.

SIGNATURE STYLE: "Myra ke bina padhna boring hai 😏"
`;

export interface ChatMessage {
  role: 'user' | 'model';
  parts: { text?: string; inlineData?: { mimeType: string; data: string } }[];
}

export async function generateSpeech(text: string) {
  const modelsToTry = [
    "gemini-3.1-flash-tts-preview",
    "gemini-3.1-flash-live-preview",
    "gemini-3-flash-preview"
  ];

  let lastError = null;

  for (const modelName of modelsToTry) {
    try {
      console.log(`Myra: Generating speech with ${modelName}...`);
      const response = await ai.models.generateContent({
        model: modelName,
        contents: [{ parts: [{ text }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Kore' },
            },
          },
        },
      });

      const audioData = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (audioData) {
        return audioData;
      }
      console.warn(`Myra: ${modelName} returned no audio data.`);
    } catch (error) {
      console.error(`Error with ${modelName}:`, error);
      lastError = error;
    }
  }

  throw lastError || new Error("No audio data returned from Myra's voice engine.");
}

export async function processStudyMaterial(topicText: string, userMessage: string = "Hi Myra, I want to learn about this topic.") {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [
        {
          role: 'user',
          parts: [
            { text: `Topic/Content to study: ${topicText}` },
            { text: userMessage }
          ]
        }
      ],
      config: {
        systemInstruction: MYRA_SYSTEM_PROMPT,
        temperature: 0.8,
      }
    });

    return response.text;
  } catch (error) {
    console.error("Error processing topic:", error);
    throw error;
  }
}

export async function chatWithMyra(history: ChatMessage[], newMessage: string) {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [
        ...history.map(msg => ({
          role: msg.role === 'model' ? 'model' : 'user',
          parts: msg.parts.map(p => ({ text: p.text || "" }))
        })),
        {
          role: 'user',
          parts: [{ text: newMessage }]
        }
      ],
      config: {
        systemInstruction: MYRA_SYSTEM_PROMPT,
        temperature: 0.8,
      }
    });

    return response.text;
  } catch (error) {
    console.error("Error chatting with Myra:", error);
    throw error;
  }
}
