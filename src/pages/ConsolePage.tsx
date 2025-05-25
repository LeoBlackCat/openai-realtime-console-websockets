/**
 * Running a local relay server will allow you to hide your API key
 * and run custom logic on the server
 *
 * Set the local relay server address to:
 * REACT_APP_LOCAL_RELAY_SERVER_URL=http://localhost:8081
 *
 * This will also require you to set OPENAI_API_KEY= in a `.env` file
 * You can run it with `npm run relay`, in parallel with `npm start`
 */
const LOCAL_RELAY_SERVER_URL: string =
  process.env.REACT_APP_LOCAL_RELAY_SERVER_URL || '';

import { useEffect, useRef, useCallback, useState } from 'react';

import { RealtimeClient } from '@openai/realtime-api-beta';
import { ItemType } from '@openai/realtime-api-beta/dist/lib/client.js';
import { WavRecorder, WavStreamPlayer } from '../lib/wavtools/index.js';
import { instructions } from '../utils/conversation_config.js';
import { WavRenderer } from '../utils/wav_renderer';

import { X, Edit, Zap, ArrowUp, ArrowDown } from 'react-feather';
import { Button } from '../components/button/Button';
import { Toggle } from '../components/toggle/Toggle';
import { Map } from '../components/Map';

import './ConsolePage.scss';
import { isJsxOpeningLikeElement } from 'typescript';

/**
 * Type for result from get_weather() function call
 */
interface Coordinates {
  lat: number;
  lng: number;
  location?: string;
  temperature?: {
    value: number;
    units: string;
  };
  wind_speed?: {
    value: number;
    units: string;
  };
}

/**
 * Type for all event logs
 */
interface RealtimeEvent {
  time: string;
  source: 'client' | 'server';
  count?: number;
  event: { [key: string]: any };
}

export function ConsolePage() {
  // API Key handling
  const apiKey = localStorage.getItem('tmp::voice_api_key') || prompt('OpenAI API Key') || '';
  if (apiKey !== '') {
    localStorage.setItem('tmp::voice_api_key', apiKey);
  }

  // Core refs
  const wavRecorderRef = useRef<WavRecorder>(new WavRecorder({ sampleRate: 24000 }));
  const wavStreamPlayerRef = useRef<WavStreamPlayer>(new WavStreamPlayer({ sampleRate: 24000 }));
  const clientRef = useRef<RealtimeClient>(
    new RealtimeClient({
      apiKey: apiKey,
      dangerouslyAllowAPIKeyInBrowser: true,
    })
  );

  // State
  const [items, setItems] = useState<ItemType[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isVADMode, setIsVADMode] = useState(false);

  // Connect to conversation
  const connectConversation = useCallback(async () => {
    const client = clientRef.current;
    const wavRecorder = wavRecorderRef.current;
    const wavStreamPlayer = wavStreamPlayerRef.current;

    setIsConnected(true);
    setItems(client.conversation.getItems());

    await wavRecorder.begin();
    await wavStreamPlayer.connect();
    await client.connect();
    
    // Set initial mode
    client.updateSession({
      turn_detection: isVADMode ? { type: 'server_vad' } : null
    });

    if (isVADMode) {
      await wavRecorder.record((data) => client.appendInputAudio(data.mono));
    }
    
    client.sendUserMessageContent([
      {
        type: 'input_text',
        text: 'Hello!',
      },
    ]);
  }, [isVADMode]);

  // Disconnect conversation
  const disconnectConversation = useCallback(async () => {
    setIsConnected(false);
    setItems([]);

    const client = clientRef.current;
    client.disconnect();

    const wavRecorder = wavRecorderRef.current;
    await wavRecorder.end();

    const wavStreamPlayer = wavStreamPlayerRef.current;
    await wavStreamPlayer.interrupt();
  }, []);

  // Start recording (push-to-talk mode)
  const startRecording = async () => {
    setIsRecording(true);
    const client = clientRef.current;
    const wavRecorder = wavRecorderRef.current;
    const wavStreamPlayer = wavStreamPlayerRef.current;
    
    const trackSampleOffset = await wavStreamPlayer.interrupt();
    if (trackSampleOffset?.trackId) {
      const { trackId, offset } = trackSampleOffset;
      await client.cancelResponse(trackId, offset);
    }
    await wavRecorder.record((data) => client.appendInputAudio(data.mono));
  };

  // Stop recording (push-to-talk mode)
  const stopRecording = async () => {
    setIsRecording(false);
    const client = clientRef.current;
    const wavRecorder = wavRecorderRef.current;
    await wavRecorder.pause();
    client.createResponse();
  };

  // Toggle between VAD and push-to-talk modes
  const toggleVADMode = useCallback(async (value: boolean) => {
    setIsVADMode(value);
    const client = clientRef.current;
    const wavRecorder = wavRecorderRef.current;

    if (value) {
      // Switch to VAD mode
      if (wavRecorder.getStatus() === 'recording') {
        await wavRecorder.pause();
      }
      client.updateSession({
        turn_detection: { type: 'server_vad' }
      });
      if (client.isConnected()) {
        await wavRecorder.record((data) => client.appendInputAudio(data.mono));
      }
    } else {
      // Switch to push-to-talk mode
      if (wavRecorder.getStatus() === 'recording') {
        await wavRecorder.pause();
      }
      client.updateSession({
        turn_detection: null
      });
    }
  }, []);

  // Setup client events
  useEffect(() => {
    const client = clientRef.current;
    const wavStreamPlayer = wavStreamPlayerRef.current;

    client.on('conversation.updated', async ({ item, delta }: any) => {
      const items = client.conversation.getItems();
      if (delta?.audio) {
        wavStreamPlayer.add16BitPCM(delta.audio, item.id);
      }
      if (item.status === 'completed' && item.formatted.audio?.length) {
        const wavFile = await WavRecorder.decode(
          item.formatted.audio,
          24000,
          24000
        );
        item.formatted.file = wavFile;
      }
      setItems(items);
    });

    setItems(client.conversation.getItems());

    return () => {
      client.reset();
    };
  }, []);

  return (
    <div className="console-page">
      <div className="chat-container">
        <div className="messages">
          {items.map((item) => (
            <div key={item.id} className={`message ${item.role || ''}`}>
              <div className="role">{item.role || item.type}</div>
              <div className="content">
                {item.formatted.transcript || item.formatted.text || '(truncated)'}
                {item.formatted.file && (
                  <audio src={item.formatted.file.url} controls />
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
      
      <div className="controls">
        <button
          onClick={isConnected ? disconnectConversation : connectConversation}
        >
          {isConnected ? 'Disconnect' : 'Connect'}
        </button>
        
        {isConnected && (
          <>
            <button
              className={`mode-toggle ${isVADMode ? 'active' : ''}`}
              onClick={() => toggleVADMode(!isVADMode)}
            >
              {isVADMode ? 'VAD Mode' : 'Push-to-Talk Mode'}
            </button>

            {!isVADMode && (
              <button
                onMouseDown={startRecording}
                onMouseUp={stopRecording}
                disabled={!isConnected}
              >
                {isRecording ? 'Release to send' : 'Push to talk'}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
