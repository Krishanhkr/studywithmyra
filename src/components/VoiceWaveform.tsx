import { motion } from 'motion/react';

interface VoiceWaveformProps {
  isSpeaking: boolean;
  isListening: boolean;
}

export const VoiceWaveform = ({ isSpeaking, isListening }: VoiceWaveformProps) => {
  const bars = Array.from({ length: 8 });

  return (
    <div className="flex items-center justify-center gap-2 h-24">
      {bars.map((_, i) => (
        <motion.div
          key={i}
          id={`bar-${i}`}
          className={`w-2 rounded-full ${
            isSpeaking ? 'bg-orange-500' : isListening ? 'bg-blue-500' : 'bg-gray-700'
          }`}
          animate={{
            height: isSpeaking 
              ? [24, 64, 32, 80, 24][(i % 5)] 
              : isListening 
                ? [16, 32, 16] 
                : 12,
          }}
          transition={{
            repeat: Infinity,
            duration: isSpeaking ? 0.6 : 1.2,
            delay: i * 0.1,
            ease: "easeInOut"
          }}
        />
      ))}
    </div>
  );
};
