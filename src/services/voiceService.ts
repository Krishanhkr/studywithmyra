
export class VoiceService {
  private static synthesis = window.speechSynthesis;
  private static recognition: any = null;
  private static isSpeaking = false;
  private static audioContext: AudioContext | null = null;
  private static currentSource: AudioBufferSourceNode | null = null;
 
  static getSpeakingStatus() {
    return this.isSpeaking;
  }

  static initRecognition(onResult: (text: string) => void, onEnd: () => void) {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.error("Speech Recognition not supported in this browser.");
      return null;
    }

    this.recognition = new SpeechRecognition();
    this.recognition.continuous = false;
    this.recognition.interimResults = false;
    this.recognition.lang = 'hi-IN'; // Default to Hindi-India to catch those Hinglish vibes, but it handles English well too.

    this.recognition.onresult = (event: any) => {
      const text = event.results[0][0].transcript;
      onResult(text);
    };

    this.recognition.onend = () => {
      onEnd();
    };

    return this.recognition;
  }

  static startListening() {
    if (this.recognition) {
       this.recognition.start();
    }
  }

  static stopListening() {
    if (this.recognition) {
       this.recognition.stop();
    }
  }

  static async playAudio(base64Data: string, onEnd?: () => void): Promise<void> {
    return new Promise(async (resolve) => {
      if (!base64Data) {
        console.error("Myra: Received empty audio data.");
        if (onEnd) onEnd();
        resolve();
        return;
      }
      
      console.log("Myra: Attempting to play audio (length:", base64Data.length, ")...");
      try {
        if (!this.audioContext) {
          this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
        }
        
        if (this.audioContext.state === 'suspended') {
          await this.audioContext.resume();
          console.log("Myra: AudioContext resumed.");
        }

        const oldResolve = (VoiceService as any)._currentResolve;
        VoiceService.cancel();
        if (oldResolve) {
          try { oldResolve(); } catch(e) {}
        }

        (VoiceService as any)._currentResolve = resolve;

        // Convert base64 to ArrayBuffer
        const binaryString = atob(base64Data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }

        // Gemini produces 16-bit Linear PCM (Little Endian), 24kHz
        const numSamples = Math.floor(bytes.length / 2);
        const floatData = new Float32Array(numSamples);
        const dataView = new DataView(bytes.buffer);

        for (let i = 0; i < numSamples; i++) {
          // Read 16-bit signed integer, Little Endian
          const sample = dataView.getInt16(i * 2, true);
          floatData[i] = sample / 32768.0;
        }

        const buffer = this.audioContext.createBuffer(1, floatData.length, 24000);
        buffer.getChannelData(0).set(floatData);

        const source = this.audioContext.createBufferSource();
        source.buffer = buffer;
        source.connect(this.audioContext.destination);
        
        source.onended = () => {
          if (VoiceService.currentSource === source) {
            console.log("Myra: Audio playback finished.");
            VoiceService.isSpeaking = false;
            (VoiceService as any)._currentResolve = null;
            if (onEnd) onEnd();
            resolve();
          }
        };

        this.isSpeaking = true;
        source.start();
        this.currentSource = source;
        console.log("Myra: Speaking now...");
      } catch (error) {
        console.error("Myra Error (Web Audio):", error);
        if (onEnd) onEnd();
        resolve();
      }
    });
  }

  static speak(text: string, onEnd?: () => void) {
    // Fallback for legacy text-to-speech if needed, but we prefer playAudio
    this.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    const voices = this.synthesis.getVoices();
    
    // Improved voice selection for Hindi/English-India female voices
    const preferredVoice = voices.find(v => 
      (v.lang.includes('hi-IN') || v.lang.includes('en-IN')) && 
      (v.name.toLowerCase().includes('female') || v.name.toLowerCase().includes('lady') || v.name.toLowerCase().includes('google'))
    ) || voices.find(v => v.lang.includes('hi')) || voices.find(v => v.lang.includes('en')) || voices[0];
    
    if (preferredVoice) {
      console.log("Myra Fallback Voice:", preferredVoice.name);
      utterance.voice = preferredVoice;
    }

    utterance.pitch = 1.1;
    utterance.rate = 1.0; 

    utterance.onstart = () => {
      this.isSpeaking = true;
    };

    utterance.onend = () => {
      this.isSpeaking = false;
      if (onEnd) onEnd();
    };

    this.synthesis.speak(utterance);
  }

  static cancel() {
    this.synthesis.cancel();
    if (this.currentSource) {
      try {
        this.currentSource.stop();
      } catch (e) {
        // Source might already be stopped
      }
      this.currentSource = null;
    }
    this.isSpeaking = false;
  }
}
