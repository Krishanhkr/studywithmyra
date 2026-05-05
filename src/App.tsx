/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Mic, MicOff, MessageSquare, RotateCcw, Volume2, VolumeX, Info, Send, FileText, BookOpen, History, PlayCircle, StopCircle, Waves, Trash2 } from 'lucide-react';
import { VoiceWaveform } from './components/VoiceWaveform';
import { chatWithMyra, processStudyMaterial, generateSpeech, ChatMessage } from './services/geminiService';
import { VoiceService } from './services/voiceService';

interface HistoryItem {
  id: string;
  topic: string;
  explanation: string;
  timestamp: number;
  audioData?: string;
}

const AtomLoader = ({ text }: { text: string }) => (
  <motion.div 
    initial={{ opacity: 0, scale: 0.9 }}
    animate={{ opacity: 1, scale: 1 }}
    className="flex flex-col items-center justify-center gap-12"
  >
    <div className="relative w-32 h-32 flex items-center justify-center">
      <div className="absolute inset-0 bg-orange-500/5 blur-[40px] rounded-full animate-pulse" />
      
      {/* Nucleus */}
      <motion.div 
        animate={{ scale: [1, 1.2, 1] }}
        transition={{ duration: 2, repeat: Infinity }}
        className="w-5 h-5 bg-orange-500 rounded-full shadow-[0_0_30px_rgba(249,115,22,0.8)] z-10"
      />
      
      {/* Orbits */}
      {[0, 60, 120].map((rotation, i) => (
        <motion.div
          key={i}
          className="absolute w-full h-[40%] border border-orange-500/20 rounded-[100%]"
          style={{ rotate: rotation }}
          animate={{ rotate: rotation + 360 }}
          transition={{ duration: 3 + i, repeat: Infinity, ease: "linear" }}
        >
          {/* Electron */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2.5 h-2.5 bg-orange-500 rounded-full shadow-[0_0_15px_#f97316]">
            <div className="absolute inset-0 bg-white/40 rounded-full blur-[1px]" />
          </div>
        </motion.div>
      ))}
    </div>
    <div className="flex flex-col items-center gap-3">
      <div className="text-orange-500 font-black tracking-[0.3em] uppercase text-[10px] animate-pulse bg-orange-500/10 px-6 py-2.5 rounded-full border border-orange-500/20 shadow-2xl">
        {text}
      </div>
      <div className="text-white/10 text-[8px] font-mono tracking-widest uppercase">
        Analyzing Quantum Bits...
      </div>
    </div>
  </motion.div>
);

export default function App() {
  const [topicContent, setTopicContent] = useState("");
  const [hasStarted, setHasStarted] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingTime, setProcessingTime] = useState(0);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [lastTranscript, setLastTranscript] = useState("");
  const [userInput, setUserInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [lastMyraResponse, setLastMyraResponse] = useState("");

  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    // Load history from localStorage if possible
    const saved = localStorage.getItem('myra_history');
    if (saved) {
      try {
        setHistory(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to load history", e);
      }
    }

    // Initialize Speech Recognition
    recognitionRef.current = VoiceService.initRecognition(
      (text) => {
        setLastTranscript(text);
        handleUserMessage(text);
      },
      () => {
        setIsListening(false);
      }
    );

    return () => {
      VoiceService.cancel();
    };
  }, []);

  useEffect(() => {
    localStorage.setItem('myra_history', JSON.stringify(history.map(item => ({ ...item, audioData: undefined }))));
  }, [history]);

  const [processingStatus, setProcessingStatus] = useState<string>("");

  useEffect(() => {
    let interval: any;
    if (isProcessing) {
      // Determine if content is small or large to adjust feedback speed
      const isShort = topicContent.length < 500;
      const speedFactor = isShort ? 2 : 1; // Faster updates for small content

      interval = setInterval(() => {
        setProcessingTime(prev => {
          const next = prev + 1;
          const adjustedTime = next * speedFactor;

          if (adjustedTime < 10) setProcessingStatus("Reading unit content...");
          else if (adjustedTime < 25) setProcessingStatus("Organizing topics...");
          else if (adjustedTime < 45) setProcessingStatus("Simplifying complex parts...");
          else if (adjustedTime < 70) setProcessingStatus("Preparing Myra's style... 😏");
          else if (next < 120) setProcessingStatus("Deep analysis in progress... 😏");
          else setProcessingStatus("Almost there... hanging tight! 😏");
          
          return next;
        });
      }, 1000);
    } else {
      setProcessingTime(0);
      setProcessingStatus("");
      if (interval) clearInterval(interval);
    }
    return () => clearInterval(interval);
  }, [isProcessing, topicContent.length]);

  const handleMyraSpeech = async (text: string, saveToHistoryId?: string) => {
    if (!text) return;
    try {
      setIsSpeaking(true);
      
      // Split into chunks for reliable TTS
      const chunks = text.match(/[^.!?]+[.!?]+/g) || [text];
      const mergedChunks: string[] = [];
      let currentChunk = "";
      
      for (const segment of chunks) {
        if ((currentChunk.length + segment.length) < 500) {
          currentChunk += segment;
        } else {
          mergedChunks.push(currentChunk);
          currentChunk = segment;
        }
      }
      if (currentChunk) mergedChunks.push(currentChunk);

      // Start pre-fetching all chunks in parallel but play in order
      const audioPromises = mergedChunks.map(chunk => generateSpeech(chunk));
      
      for (let i = 0; i < audioPromises.length; i++) {
        try {
          console.log(`Myra: Playing chunk ${i + 1}/${mergedChunks.length}`);
          let audioBase64;
          try {
            audioBase64 = await audioPromises[i];
          } catch (firstErr) {
            console.warn(`Chunk ${i} first attempt failed, retrying once...`, firstErr);
            // Single retry for the chunk
            audioBase64 = await generateSpeech(mergedChunks[i]);
          }
          
          if (saveToHistoryId && i === 0) {
             setHistory(prev => prev.map(item => 
               item.id === saveToHistoryId ? { ...item, audioData: audioBase64 } : item
             ));
          }
          
          // Play current chunk
          await VoiceService.playAudio(audioBase64);
        } catch (err) {
          console.error(`Chunk ${i} failed, skipping to next or fallback:`, err);
          // Fallback to browser TTS for this specific chunk if API fails
          await new Promise<void>((resolve) => {
            VoiceService.speak(mergedChunks[i], resolve);
          });
        }
        
        // Stop if user cancelled via the UI stop button
        if (!VoiceService.getSpeakingStatus() && i > 0) break;
      }
      
      setIsSpeaking(false);
    } catch (err) {
      console.error("Speech generation failed:", err);
      VoiceService.speak(text, () => setIsSpeaking(false));
    }
  };

  const playFromHistory = (item: HistoryItem) => {
    if (item.audioData) {
      VoiceService.playAudio(item.audioData, () => setIsSpeaking(false));
      setIsSpeaking(true);
      setLastMyraResponse(item.explanation);
      setHasStarted(true);
    } else {
      handleMyraSpeech(item.explanation, item.id);
      setHasStarted(true);
      setLastMyraResponse(item.explanation);
    }
  };

  const handleTopicSubmit = async () => {
    if (!topicContent.trim()) {
      setError("Topic toh likho yrr! 😏 Unit ya topic paste karo yaha.");
      return;
    }

    try {
      setIsProcessing(true);
      setError(null);
      setLastMyraResponse("");
      
      // Add a 3-minute timeout for the entire sequence to handle slow network/large units
      const globalTimeout = new Promise((_, reject) => 
        setTimeout(() => reject(new Error("Analysis took too long. Try smaller text or check your connection? 😏")), 180000)
      );

      const runAnalysis = async () => {
        // Step 1: Identify sub-topics (Fast)
        setProcessingStatus("Identifying sub-topics in your unit... 🔍");
        const discoveryPrompt = `Maine ye unit content diya hai. Ismein se saare main topics aur sub-topics ki list nikalo heading format mein. Explain mat karna abhi, bas list chahiye.
        
        UNIT CONTENT:
        ${topicContent}`;
        
        const topicList = await chatWithMyra([], discoveryPrompt);
        
        // Step 2: Detailed Explanation for ALL topics
        setProcessingStatus("Topics mil gaye! Ab in sabko detail mein samjhati hu... 📖");
        
        const explanationPrompt = `Awesome! Maine ye topics identify kiye hain: 
        ${topicList}
        
        Ab in saare topics ko ek-ek karke DETAIL mein samjhao properly (Hinglish mein). 
        - Har ek topic ke liye kam se kam 4-5 lines honi chahiye.
        - "Hadoop", "Medicine", "Trading" - jo bhi text mein hai sab explain karo.
        - Playful aur friendly tutor (Myra) ki tarah baat karo.
        - Start with a cool intro like "Chalo, let's dive into these topics! 😏"`;

        const responseText = await processStudyMaterial(topicContent, explanationPrompt);
        return { topicList, responseText, explanationPrompt };
      };

      const { responseText, explanationPrompt } = await Promise.race([runAnalysis(), globalTimeout]) as { responseText: string, explanationPrompt: string };
      
      const itemId = Date.now().toString();
      const newHistoryItem: HistoryItem = {
        id: itemId,
        topic: topicContent.slice(0, 50) + (topicContent.length > 50 ? "..." : ""),
        explanation: responseText,
        timestamp: Date.now()
      };

      setHistory(prev => [newHistoryItem, ...prev]);

      const newHistory: ChatMessage[] = [
        {
          role: 'user',
          parts: [
            { text: `Topic/Content to study: ${topicContent}` },
            { text: explanationPrompt }
          ]
        },
        {
          role: 'model',
          parts: [{ text: responseText }]
        }
      ];

      setChatHistory(newHistory);
      setLastMyraResponse(responseText);
      setHasStarted(true);
      handleMyraSpeech(responseText, itemId);
    } catch (err: any) {
      console.error("Processing error:", err);
      setError(err.message || "Learning mein error aa gaya. Retry karein? 😏");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleUserMessage = async (text: string) => {
    if (!text.trim()) return;
    
    try {
      setIsProcessing(true);
      setError(null);
      setLastMyraResponse("");
      setLastTranscript(text);

      const updatedHistory: ChatMessage[] = [...chatHistory, { 
        role: 'user', 
        parts: [{ text }] 
      }];
      setChatHistory(updatedHistory);

      // Add a 1-minute timeout for chat questions
      const timeoutMillis = 60000;
      const responsePromise = chatWithMyra(updatedHistory, text);
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error("Myra stuck ho gayi! Reload karein? 😏")), timeoutMillis)
      );

      const responseText = await Promise.race([responsePromise, timeoutPromise]) as string;
      
      if (responseText) {
        setChatHistory(prev => [...prev, { 
          role: 'model', 
          parts: [{ text: responseText }] 
        }]);
        
        setLastMyraResponse(responseText);
        handleMyraSpeech(responseText);
      }
    } catch (err) {
      console.error(err);
      setError("Myra lost her train of thought. Try again? 😏");
    } finally {
      setIsProcessing(false);
    }
  };

  const toggleListening = () => {
    if (isListening) {
      VoiceService.stopListening();
      setIsListening(false);
    } else {
      stopSpeaking();
      VoiceService.startListening();
      setIsListening(true);
    }
  };

  const stopSpeaking = () => {
    VoiceService.cancel();
    setIsSpeaking(false);
  };

  const resetAll = () => {
    VoiceService.cancel();
    setTopicContent("");
    setHasStarted(false);
    setChatHistory([]);
    setLastTranscript("");
    setIsSpeaking(false);
    setIsListening(false);
    setIsProcessing(false);
    setError(null);
    setLastMyraResponse("");
  };

  return (
    <div className="min-h-screen bg-[#030303] text-white font-sans selection:bg-orange-500/30 overflow-hidden relative">
      {/* Dynamic Background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] bg-orange-600/10 blur-[160px] rounded-full animate-pulse" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] bg-blue-600/5 blur-[160px] rounded-full" />
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 mix-blend-overlay" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-[size:40px_40px]" />
      </div>

      {/* Navigation */}
      <nav className="relative z-10 px-6 md:px-10 py-4 md:py-8 flex items-center justify-between max-w-7xl mx-auto">
        <motion.div 
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="flex items-center gap-2 md:gap-3 cursor-default"
        >
          <div className="w-8 h-8 md:w-10 md:h-10 rounded-lg md:xl bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center font-black text-black italic text-lg md:xl shadow-lg shadow-orange-500/20">M</div>
          <div className="flex flex-col">
            <span className="font-bold tracking-tight text-xl md:text-2xl leading-none">Myra</span>
            <span className="text-[9px] md:text-[10px] text-orange-500/60 font-mono tracking-widest uppercase">AI Study Buddy</span>
          </div>
        </motion.div>
        <motion.div 
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="flex items-center gap-6"
        >
          <div className="flex bg-white/5 border border-white/10 rounded-full p-1 backdrop-blur-md">
            <button 
              onClick={() => {
                setShowHistory(!showHistory);
                setShowTranscript(false);
              }}
              className={`p-2.5 rounded-full transition-all ${showHistory ? 'bg-orange-500 text-black shadow-lg shadow-orange-500/40 scale-110' : 'text-white/40 hover:text-white hover:bg-white/10'}`}
              title="History"
            >
              <History size={18} />
            </button>
            <button 
              onClick={() => {
                setShowTranscript(!showTranscript);
                setShowHistory(false);
              }}
              className={`p-2.5 rounded-full transition-all ${showTranscript ? 'bg-white text-black scale-110' : 'text-white/40 hover:text-white hover:bg-white/10'}`}
              id="toggle-transcript"
              title="Transcript"
            >
              <MessageSquare size={18} />
            </button>
            <button 
              onClick={() => {
                setShowInfo(!showInfo);
                setShowHistory(false);
                setShowTranscript(false);
              }}
              className={`p-2.5 rounded-full transition-all ${showInfo ? 'bg-orange-500 text-black scale-110 shadow-lg shadow-orange-500/40' : 'text-white/40 hover:text-white hover:bg-white/10'}`}
              id="info-button"
              title="Developer Info"
            >
              <Info size={18} />
            </button>
            <div className="w-[1px] bg-white/10 mx-1 self-stretch" />
            <button 
              onClick={resetAll}
              className="p-2.5 rounded-full text-white/40 hover:text-white hover:bg-white/10 transition-all hover:rotate-180 duration-500"
              id="reset-session"
              title="Reset"
            >
              <RotateCcw size={18} />
            </button>
          </div>
        </motion.div>
      </nav>

      <main className="relative z-10 max-w-4xl mx-auto px-4 md:px-6 min-h-[calc(100vh-80px)] flex flex-col items-center justify-center py-10">
        <AnimatePresence mode="wait">
          {!hasStarted ? (
            <motion.div 
              key="uploader"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.05 }}
              className="w-full"
            >
              <div className="text-center mb-8 md:mb-12">
                <motion.h1 
                  initial={{ opacity: 0, y: -20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-4xl md:text-8xl font-black tracking-tighter mb-4 md:mb-6 leading-[0.9]"
                >
                  Unit difficult hai? <br />
                  <span className="text-orange-500 italic">Yaha dalo. 😏</span>
                </motion.h1>
                <motion.p 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                  className="text-white/40 text-lg md:text-xl max-w-xl mx-auto font-medium px-4"
                >
                  Paste your full unit or chapter. Myra will identify 
                  all topics and explain them with style.
                </motion.p>
              </div>
              
              <motion.div 
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.2 }}
                className="relative group px-2 md:px-0"
              >
                <textarea
                  value={topicContent}
                  onChange={(e) => setTopicContent(e.target.value)}
                  placeholder="Paste your unit topics or notes here... Myra will handle everything! 😏"
                  className="w-full h-64 md:h-80 bg-white/[0.02] border border-white/10 rounded-[32px] md:rounded-[48px] p-6 md:p-10 pb-20 md:pb-24 outline-none focus:border-orange-500/50 transition-all text-lg md:text-xl font-medium resize-none relative z-10 shadow-2xl backdrop-blur-3xl placeholder:text-white/10"
                  disabled={isProcessing}
                />
                <div className="absolute inset-x-0 -bottom-16 md:-bottom-20 flex justify-center z-30">
                    <motion.button
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                      animate={topicContent.trim() && !isProcessing ? {
                        y: [0, -4, 0],
                        transition: { repeat: Infinity, duration: 2 }
                      } : {}}
                      onClick={handleTopicSubmit}
                      disabled={isProcessing || !topicContent.trim()}
                      className="bg-orange-500 text-black font-black px-8 md:px-10 py-3.5 md:py-4 rounded-full flex items-center gap-3 shadow-2xl shadow-orange-500/40 hover:bg-orange-400 transition-all disabled:opacity-50 disabled:grayscale text-base md:text-lg uppercase tracking-widest relative group overflow-hidden"
                    >
                      {/* Shine effect */}
                      <motion.div 
                        className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent -translate-x-full group-hover:animate-[shimmer_1.5s_infinite]"
                      />
                      
                      <span className="relative z-10">{isProcessing ? 'Analyzing...' : 'Send'}</span>
                      <motion.div
                        animate={isProcessing ? { rotate: 360 } : { x: [0, 5, 0] }}
                        transition={isProcessing ? { repeat: Infinity, duration: 1, ease: "linear" } : { repeat: Infinity, duration: 1.5 }}
                        className="relative z-10"
                      >
                        {isProcessing ? <Waves size={22} /> : <Send size={22} fill="currentColor" />}
                      </motion.div>
                    </motion.button>
                </div>
              </motion.div>

              {isProcessing && (
                <div className="mt-20 flex flex-col items-center gap-6">
                  <AtomLoader text={`${processingStatus} (${processingTime}s)`} />
                  <motion.button
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => {
                      setIsProcessing(false);
                      setError("Analysis was cancelled by you. Try again with a smaller section? 😏");
                    }}
                    className="text-[10px] bg-white/5 hover:bg-red-500/10 text-white/30 hover:text-red-400 border border-white/10 hover:border-red-500/20 px-4 py-2 rounded-full uppercase tracking-widest transition-all"
                  >
                    Cancel Analysis
                  </motion.button>
                </div>
              )}
              
              {!isProcessing && (
                <div className="mt-20 flex flex-wrap items-center justify-center gap-8 text-white/30 text-sm">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-orange-500" />
                    Topic-wise Breakdown
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-blue-500" />
                    Audio History Saved
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-green-500" />
                    Detailed Explanations
                  </div>
                </div>
              )}
            </motion.div>
          ) : (
            <motion.div 
              key="assistant"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="w-full flex flex-col items-center gap-8 py-8"
            >
              {/* Myra Status Indicator */}
              <div className="relative group perspective-1000">
                <motion.div 
                  initial={{ opacity: 0, scale: 0.5 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className={`
                    absolute inset-0 rounded-full blur-[80px] transition-all duration-1000
                    ${isSpeaking ? 'bg-orange-500/30' : isListening ? 'bg-blue-500/30' : 'bg-white/5'}
                  `} 
                />
                <motion.div 
                   whileHover={{ scale: 1.05 }}
                   className={`
                    w-40 h-40 md:w-48 md:h-48 rounded-full border border-white/10 flex items-center justify-center relative bg-black/40 backdrop-blur-3xl shadow-2xl
                    ${isSpeaking ? 'border-orange-500/50 shadow-orange-500/20' : isListening ? 'border-blue-500/50 shadow-blue-500/20' : ''}
                  `}
                >
                  <VoiceWaveform isSpeaking={isSpeaking} isListening={isListening} />
                  
                  <motion.div 
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    className={`
                      absolute -bottom-4 bg-orange-500 text-black text-[11px] font-bold px-4 py-1.5 rounded-full italic shadow-xl tracking-tight
                      ${isListening ? 'bg-blue-500' : ''}
                    `}
                  >
                    {isSpeaking ? 'MYRA IS SPEAKING' : isListening ? 'MYRA IS LISTENING' : 'MYRA IS READY'}
                  </motion.div>
                </motion.div>
                
                {isSpeaking && (
                  <motion.button
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    onClick={stopSpeaking}
                    className="absolute -right-16 top-1/2 -translate-y-1/2 bg-white/10 hover:bg-white/20 border border-white/20 p-4 rounded-full text-white transition-all group"
                    title="Stop Voice"
                  >
                    <StopCircle size={24} className="group-hover:scale-110 transition-transform" />
                    <span className="absolute -top-8 left-1/2 -translate-x-1/2 text-[10px] bg-black border border-white/10 px-2 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity">STOP</span>
                  </motion.button>
                )}
              </div>

              {/* Myra's Text Bubble */}
              <AnimatePresence mode="wait">
                {lastMyraResponse && !isProcessing && (
                  <motion.div
                    key="response"
                    initial={{ opacity: 0, scale: 0.95, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    className="max-w-xl w-full bg-orange-500/[0.03] border border-orange-500/20 p-6 md:p-8 rounded-3xl md:rounded-[40px] relative backdrop-blur-xl shadow-2xl"
                  >
                    <div className="absolute -top-3 left-6 md:left-10 bg-orange-500 text-black px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-tighter">
                      Myra Insight
                    </div>
                    <div className="max-h-56 overflow-y-auto custom-scrollbar pr-4">
                      <p className="text-orange-100/90 text-lg md:text-xl leading-relaxed font-medium italic">
                        "{lastMyraResponse}"
                      </p>
                    </div>
                    <div className="absolute -bottom-3 right-10 flex gap-2">
                       <div className="w-6 h-6 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white/40 text-[8px] font-bold">HD</div>
                       <div className="w-6 h-6 rounded-full bg-orange-500/20 border border-orange-500/20 flex items-center justify-center text-orange-400 text-[8px] font-bold">AI</div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Interaction Bar */}
              {/* ... existing interaction bar code remains largely same ... */}
              {/* Note: I'll include the error logic here too if needed, but keeping it brief */}
              
              {error && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex flex-col items-center gap-4"
                >
                  <div className="text-red-400 bg-red-400/10 px-4 py-2 rounded-xl text-sm border border-red-400/20 max-w-xs text-center font-mono uppercase text-[10px]">
                    ERROR: {error}
                  </div>
                  <button 
                    onClick={handleTopicSubmit}
                    className="flex items-center gap-2 text-xs font-bold text-orange-500 hover:text-orange-400 transition-colors uppercase tracking-wider"
                  >
                    <RotateCcw size={14} />
                    Retry Analysis
                  </button>
                </motion.div>
              )}

              {/* Interaction Bar */}
              <div className="flex flex-col items-center gap-8 w-full max-w-2xl mt-4">
                <div className="h-10 flex items-center justify-center">
                  {isProcessing ? (
                    <motion.div 
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-orange-500/10 border border-orange-500/20 px-4 py-2 rounded-full flex items-center gap-4"
                    >
                      <div className="relative w-5 h-5 flex items-center justify-center">
                        <div className="absolute inset-0 border border-orange-500/30 rounded-full animate-[spin_3s_linear_infinite]" />
                        <div className="absolute inset-0 border border-orange-500/50 rounded-full animate-[spin_2s_linear_infinite] rotate-45" />
                        <div className="w-1.5 h-1.5 bg-orange-500 rounded-full shadow-[0_0_8px_#f97316]" />
                      </div>
                      <span className="text-orange-100 text-[11px] font-bold uppercase tracking-widest leading-none">{processingStatus}</span>
                      <span className="text-orange-500/40 text-[10px] font-mono border-l border-white/10 pl-3 leading-none">{processingTime}S</span>
                    </motion.div>
                  ) : (
                    <motion.p 
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="text-white/30 text-center italic text-sm font-medium tracking-tight"
                    >
                       {isListening ? 'Myra is waiting for your words...' : lastTranscript ? `"${lastTranscript}"` : 'Ask Myra anything about the unit materials'}
                    </motion.p>
                  )}
                </div>

                <div className="flex items-center gap-4 w-full bg-white/[0.03] border border-white/10 p-2 rounded-full backdrop-blur-2xl shadow-xl">
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={toggleListening}
                    disabled={isProcessing && !isListening}
                    className={`
                      w-14 h-14 rounded-full flex items-center justify-center transition-all shrink-0
                      ${isListening 
                        ? 'bg-red-500 text-white shadow-lg shadow-red-500/40 ring-4 ring-red-500/20' 
                        : 'bg-white text-black hover:bg-orange-500 hover:text-white'}
                    `}
                    id="mic-button"
                  >
                    {isListening ? <MicOff size={24} /> : <Mic size={24} />}
                  </motion.button>

                  <div className="relative flex-1">
                    <input
                      type="text"
                      value={userInput}
                      onChange={(e) => setUserInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && (handleUserMessage(userInput), setUserInput(""))}
                      placeholder="Ask for more clarity..."
                      disabled={isProcessing}
                      className="w-full bg-transparent border-none rounded-full px-4 py-4 outline-none transition-colors pr-14 text-white placeholder:text-white/10 font-medium"
                    />
                    <button
                      onClick={() => {
                        handleUserMessage(userInput);
                        setUserInput("");
                      }}
                      disabled={isProcessing || !userInput.trim()}
                      className="absolute right-1 top-1 w-12 h-12 rounded-full bg-orange-500 text-black flex items-center justify-center disabled:opacity-50 disabled:grayscale transition-all shadow-lg hover:shadow-orange-500/20"
                    >
                      <Send size={20} />
                    </button>
                  </div>
                </div>
              </div>
              
              <div className="flex items-center gap-4 text-[10px] font-mono text-white/10 uppercase tracking-[0.2em] mt-4">
                <FileText size={12} />
                <span>UNIT ACTIVE</span>
                <div className="w-1 h-1 rounded-full bg-white/10" />
                <span>HISTORY ENABLED</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* History Sidebar */}
      <AnimatePresence>
        {showHistory && (
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            className="fixed top-0 right-0 h-full w-full md:w-96 bg-[#0a0a0a]/95 backdrop-blur-2xl border-l border-white/10 z-[60] p-8 flex flex-col"
          >
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-3">
                <History className="text-orange-500" size={24} />
                <h2 className="text-xl font-medium">Topic History</h2>
              </div>
              <button 
                onClick={() => setShowHistory(false)}
                className="text-white/40 hover:text-white"
              >
                Close
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto space-y-4 pr-4 custom-scrollbar">
              {history.length === 0 && (
                <div className="text-white/20 text-center mt-20 italic">
                  No topics saved yet.
                </div>
              )}
              {history.map((item) => (
                <div key={item.id} className="group bg-white/5 border border-white/10 p-5 rounded-2xl hover:border-orange-500/30 transition-all relative">
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-[10px] text-white/30 font-mono">
                      {new Date(item.timestamp).toLocaleDateString()}
                    </span>
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => playFromHistory(item)}
                        className="text-orange-500 hover:scale-110 transition-transform"
                        title="Replay Audio"
                      >
                        <PlayCircle size={24} />
                      </button>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          setHistory(prev => prev.filter(h => h.id !== item.id));
                        }}
                        className="text-white/10 hover:text-red-500 transition-colors p-1"
                        title="Delete History"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>
                  <h3 className="text-sm font-medium text-white/80 line-clamp-2 mb-3">
                    {item.topic}
                  </h3>
                  <div className="flex items-center gap-2">
                     <div className="w-1 h-1 rounded-full bg-orange-500" />
                     <span className="text-[10px] text-orange-500 font-bold uppercase italic">Ready to replay</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-8 pt-4 border-t border-white/10 text-[10px] text-white/20 text-center uppercase">
               Audio is re-generated if cache is cleared
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Transcript Sidebar */}
      <AnimatePresence>
        {showTranscript && (
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            className="fixed top-0 right-0 h-full w-full md:w-96 bg-[#0a0a0a]/95 backdrop-blur-xl border-l border-white/10 z-[60] p-8 flex flex-col"
          >
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-xl font-medium">Full Transcript</h2>
              <button 
                onClick={() => setShowTranscript(false)}
                className="text-white/40 hover:text-white"
              >
                Close
              </button>
            </div>
            <div className="flex-1 overflow-y-auto space-y-6 pr-4 custom-scrollbar">
              {chatHistory.map((msg, i) => (
                <div key={i} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                  <span className="text-[10px] text-white/20 uppercase tracking-widest mb-1">
                    {msg.role === 'user' ? 'You' : 'Myra'}
                  </span>
                  <div className={`
                    p-4 rounded-2xl text-sm leading-relaxed
                    ${msg.role === 'user' ? 'bg-white/10 text-white rounded-tr-none' : 'bg-orange-500/10 text-orange-100 border border-orange-500/20 rounded-tl-none italic'}
                  `}>
                    {msg.parts[0].text}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Developer Info Modal */}
      <AnimatePresence>
        {showInfo && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/80 backdrop-blur-sm"
            onClick={() => setShowInfo(false)}
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-[#0f0f0f] border border-white/10 p-8 rounded-[32px] max-w-sm w-full text-center shadow-2xl relative overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-right from-transparent via-orange-500 to-transparent" />
              <div className="w-16 h-16 bg-orange-500/10 rounded-full flex items-center justify-center mx-auto mb-6 border border-orange-500/20">
                <Info size={28} className="text-orange-500" />
              </div>
              <h3 className="text-xl font-bold tracking-tight mb-6">Developed By Krishan Hkr</h3>
              <button
                onClick={() => setShowInfo(false)}
                className="w-full bg-white text-black font-bold py-3 rounded-xl hover:bg-orange-500 hover:text-white transition-colors"
              >
                Close
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <style dangerouslySetInnerHTML={{ __html: `
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 10px;
        }
      `}} />
    </div>
  );
}

