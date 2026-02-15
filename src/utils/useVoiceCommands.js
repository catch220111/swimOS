import { useState, useEffect, useRef } from 'react';

export default function useVoiceCommands(commands = {}) {
    const [isListening, setIsListening] = useState(false);
    const [error, setError] = useState(null);
    const [transcript, setTranscript] = useState('');
    const recognitionRef = useRef(null);

    useEffect(() => {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

        if (!SpeechRecognition) {
            setError('Browser does not support Voice Control.');
            return;
        }

        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = false;
        recognition.lang = 'en-US';

        recognition.onstart = () => {
            setIsListening(true);
            setError(null);
        };

        recognition.onresult = (event) => {
            const last = event.results.length - 1;
            const text = event.results[last][0].transcript.trim().toLowerCase();
            setTranscript(text);
            console.log('Voice Command:', text);

            // Check against commands
            // We do a "contains" check or exact match
            for (const [command, action] of Object.entries(commands)) {
                if (text.includes(command)) {
                    action();
                    break; // Execute only first match
                }
            }
        };

        recognition.onerror = (event) => {
            console.error('Speech recognition error', event.error);
            if (event.error === 'not-allowed') {
                setError('Mic Access Denied');
                setIsListening(false);
            }
        };

        recognition.onend = () => {
            // Verify if we should still be listening (auto-restart)
            if (isListening && !error) {
                try {
                    recognition.start();
                } catch (e) {
                    setIsListening(false);
                }
            } else {
                setIsListening(false);
            }
        };

        recognitionRef.current = recognition;

        return () => {
            if (recognitionRef.current) {
                recognitionRef.current.stop();
            }
        };
    }, [commands, isListening, error]);

    const toggleListening = () => {
        if (!recognitionRef.current) return;

        if (isListening) {
            recognitionRef.current.stop();
            setIsListening(false); // Force state update
        } else {
            try {
                recognitionRef.current.start();
                setError(null);
            } catch (e) {
                console.error(e);
            }
        }
    };

    return { isListening, toggleListening, error, transcript };
}
