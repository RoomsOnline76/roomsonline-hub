import { Mic, MicOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import { useEffect } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface VoiceInputButtonProps {
  onTranscript: (transcript: string) => void;
  className?: string;
  size?: "sm" | "default" | "lg";
}

export function VoiceInputButton({ 
  onTranscript, 
  className,
  size = "default" 
}: VoiceInputButtonProps) {
  const {
    isListening,
    transcript,
    interimTranscript,
    isSupported,
    startListening,
    stopListening,
  } = useSpeechRecognition();

  // When we get a final transcript, send it up
  useEffect(() => {
    if (transcript && !isListening) {
      onTranscript(transcript);
    }
  }, [transcript, isListening, onTranscript]);

  if (!isSupported) {
    return null; // Don't show button if not supported
  }

  const handleClick = () => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  };

  const iconSize = size === "sm" ? "h-3.5 w-3.5" : size === "lg" ? "h-5 w-5" : "h-4 w-4";
  const buttonSize = size === "sm" ? "h-8 w-8" : size === "lg" ? "h-11 w-11" : "h-9 w-9";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant={isListening ? "default" : "outline"}
          size="icon"
          onClick={handleClick}
          className={cn(
            buttonSize,
            "rounded-full shrink-0 transition-all duration-300",
            isListening && "bg-red-500 hover:bg-red-600 animate-pulse",
            className
          )}
        >
          {isListening ? (
            <MicOff className={iconSize} />
          ) : (
            <Mic className={iconSize} />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top">
        {isListening ? "Stop listening" : "Speak your booking request"}
      </TooltipContent>
    </Tooltip>
  );
}
