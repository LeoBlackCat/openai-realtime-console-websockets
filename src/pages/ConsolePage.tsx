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
import * as SpeechSDK from 'microsoft-cognitiveservices-speech-sdk';

import { RealtimeClient } from '@openai/realtime-api-beta';
import { ItemType } from '@openai/realtime-api-beta/dist/lib/client.js';
import { WavRecorder, WavStreamPlayer } from '../lib/wavtools/index.js';
import { instructions } from '../utils/conversation_config.js';
import { WavRenderer } from '../utils/wav_renderer';

import { X, Edit, Zap, ArrowUp, ArrowDown } from 'react-feather';
import { Button } from '../components/button/Button';
import { Toggle } from '../components/toggle/Toggle';

import './ConsolePage.scss';

/**
 * Type for all event logs
 */
interface RealtimeEvent {
  time: string;
  source: 'client' | 'server';
  count?: number;
  event: { [key: string]: any };
}

interface PronunciationScores {
  accuracyScore: number | null;
  fluencyScore: number | null;
  completenessScore: number | null;
  pronunciationScore: number | null;
}

export function ConsolePage() {
  /**
   * Ask user for API Keys
   * If we're using the local relay server, we don't need OpenAI key
   */
  const openAIKey = LOCAL_RELAY_SERVER_URL
    ? ''
    : localStorage.getItem('tmp::openai_api_key') ||
      prompt('OpenAI API Key') ||
      '';
  if (openAIKey !== '') {
    localStorage.setItem('tmp::openai_api_key', openAIKey);
  }

  const azureSpeechKey = localStorage.getItem('tmp::azure_speech_key') || '';

  /**
   * Instantiate:
   * - WavRecorder (speech input)
   * - WavStreamPlayer (speech output)
   * - RealtimeClient (API client)
   */
  const wavRecorderRef = useRef<WavRecorder>(
    new WavRecorder({ sampleRate: 24000, debug: true })
  );
  const wavStreamPlayerRef = useRef<WavStreamPlayer>(
    new WavStreamPlayer({ sampleRate: 24000 })
  );
  const clientRef = useRef<RealtimeClient>(
    new RealtimeClient(
      LOCAL_RELAY_SERVER_URL
        ? { url: LOCAL_RELAY_SERVER_URL }
        : {
            apiKey: openAIKey,
            dangerouslyAllowAPIKeyInBrowser: true,
          }
    )
  );

  /**
   * References for
   * - Rendering audio visualization (canvas)
   * - Autoscrolling event logs
   * - Timing delta for event log displays
   */
  const clientCanvasRef = useRef<HTMLCanvasElement>(null);
  const serverCanvasRef = useRef<HTMLCanvasElement>(null);
  const eventsScrollHeightRef = useRef(0);
  const eventsScrollRef = useRef<HTMLDivElement>(null);
  const startTimeRef = useRef<string>(new Date().toISOString());

  /**
   * All of our variables for displaying application state
   * - items are all conversation items (dialog)
   * - realtimeEvents are event logs, which can be expanded
   */
  const [items, setItems] = useState<ItemType[]>([]);
  const [realtimeEvents, setRealtimeEvents] = useState<RealtimeEvent[]>([]);
  const [expandedEvents, setExpandedEvents] = useState<{
    [key: string]: boolean;
  }>({});
  const [isConnected, setIsConnected] = useState(false);
  const [canPushToTalk, setCanPushToTalk] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [showAudio, setShowAudio] = useState(false);
  const [showConsole, setShowConsole] = useState(false);
  const [pronunciationScores, setPronunciationScores] = useState<{[key: string]: PronunciationScores}>({});
  const recognizerRef = useRef<SpeechSDK.SpeechRecognizer | null>(null);

  /**
   * Utility for formatting the timing of logs
   */
  const formatTime = useCallback((timestamp: string) => {
    const startTime = startTimeRef.current;
    const t0 = new Date(startTime).valueOf();
    const t1 = new Date(timestamp).valueOf();
    const delta = t1 - t0;
    const hs = Math.floor(delta / 10) % 100;
    const s = Math.floor(delta / 1000) % 60;
    const m = Math.floor(delta / 60_000) % 60;
    const pad = (n: number) => {
      let s = n + '';
      while (s.length < 2) {
        s = '0' + s;
      }
      return s;
    };
    return `${pad(m)}:${pad(s)}.${pad(hs)}`;
  }, []);

  /**
   * When you click the API keys
   */
  const resetOpenAIKey = useCallback(() => {
    const key = prompt('OpenAI API Key');
    if (key !== null) {
      localStorage.setItem('tmp::openai_api_key', key);
      window.location.reload();
    }
  }, []);

  const resetAzureSpeechKey = useCallback(() => {
    const key = prompt('Azure Speech API Key');
    if (key !== null) {
      localStorage.setItem('tmp::azure_speech_key', key);
      window.location.reload();
    }
  }, []);

  const connectAzureSpeech = useCallback(() => {
    const subscriptionKey = localStorage.getItem('tmp::azure_speech_key') || '';
    const serviceRegion = 'eastus'; // or your preferred region

    const speechConfig = SpeechSDK.SpeechConfig.fromSubscription(subscriptionKey, serviceRegion);
    speechConfig.speechRecognitionLanguage = "en-US";
    
    // Enable pronunciation assessment
    speechConfig.setProperty(SpeechSDK.PropertyId.SpeechServiceConnection_InitialSilenceTimeoutMs, "5000");
    speechConfig.setProperty(SpeechSDK.PropertyId.SpeechServiceConnection_EndSilenceTimeoutMs, "1000");
    
    const audioConfig = SpeechSDK.AudioConfig.fromDefaultMicrophoneInput();
    recognizerRef.current = new SpeechSDK.SpeechRecognizer(speechConfig, audioConfig);

    // Create pronunciation assessment config
    const pronunciationAssessmentConfig = new SpeechSDK.PronunciationAssessmentConfig(
      "", // Empty reference text for free-form speech
      SpeechSDK.PronunciationAssessmentGradingSystem.HundredMark,
      SpeechSDK.PronunciationAssessmentGranularity.Word
    );
    pronunciationAssessmentConfig.applyTo(recognizerRef.current);

    recognizerRef.current.recognizeOnceAsync(
      (result) => {
        if (result.reason === SpeechSDK.ResultReason.RecognizedSpeech) {
          // Get pronunciation assessment results
          const pronunciationAssessmentResult = SpeechSDK.PronunciationAssessmentResult.fromResult(result);
          
          try {
            const scores = pronunciationAssessmentResult.detailResult.PronunciationAssessment;
            const newScores: PronunciationScores = {
              accuracyScore: scores?.AccuracyScore || null,
              fluencyScore: scores?.FluencyScore || null,
              completenessScore: scores?.CompletenessScore || null,
              pronunciationScore: scores?.PronScore || null
            };
            setPronunciationScores(prev => ({
              ...prev,
              [Date.now().toString()]: newScores
            }));
          } catch (error) {
            console.error('Error getting pronunciation scores:', error);
          }
        }
        
        recognizerRef.current?.close();
        recognizerRef.current = null;
      },
      (err) => {
        console.error('Error:', err);
        recognizerRef.current?.close();
        recognizerRef.current = null;
      }
    );
  }, []);

  /**
   * Connect to conversation:
   * WavRecorder taks speech input, WavStreamPlayer output, client is API client
   */
  const connectConversation = useCallback(async () => {
    const client = clientRef.current;
    const wavRecorder = wavRecorderRef.current;
    const wavStreamPlayer = wavStreamPlayerRef.current;

    // Set state variables
    startTimeRef.current = new Date().toISOString();
    setIsConnected(true);
    setRealtimeEvents([]);
    setItems(client.conversation.getItems());

    // Connect to microphone
    await wavRecorder.begin();

    // Connect to audio output
    await wavStreamPlayer.connect();

    // Connect to realtime API
    await client.connect();
    client.sendUserMessageContent([
      {
        type: `input_text`,
        text: `Hello!`,
        // text: `For testing purposes, I want you to list ten car brands. Number each item, e.g. "one (or whatever number you are one): the item name".`
      },
    ]);

    if (client.getTurnDetectionType() === 'server_vad') {
      await wavRecorder.record((data) => client.appendInputAudio(data.mono));
    }
  }, []);

  /**
   * Disconnect and reset conversation state
   */
  const disconnectConversation = useCallback(async () => {
    setIsConnected(false);
    setRealtimeEvents([]);
    setItems([]);

    const client = clientRef.current;
    client.disconnect();

    const wavRecorder = wavRecorderRef.current;
    await wavRecorder.end();

    const wavStreamPlayer = wavStreamPlayerRef.current;
    await wavStreamPlayer.interrupt();
  }, []);

  const deleteConversationItem = useCallback(async (id: string) => {
    const client = clientRef.current;
    client.deleteItem(id);
  }, []);

  /**
   * In push-to-talk mode, start recording
   * .appendInputAudio() for each sample
   */
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
    await wavRecorder.record((data) => {
      return client.appendInputAudio(data.mono);
    });
  };

  /**
   * In push-to-talk mode, stop recording
   */
  const stopRecording = async () => {
    setIsRecording(false);
    const client = clientRef.current;
    const wavRecorder = wavRecorderRef.current;
    await wavRecorder.pause();
    client.createResponse();
  };

  /**
   * Switch between Manual <> VAD mode for communication
   */
  const changeTurnEndType = async (value: string) => {
    const client = clientRef.current;
    const wavRecorder = wavRecorderRef.current;
    if (value === 'none' && wavRecorder.getStatus() === 'recording') {
      await wavRecorder.pause();
    }
    client.updateSession({
      turn_detection: value === 'none' ? null : { type: 'server_vad' },
    });
    if (value === 'server_vad' && client.isConnected()) {
      await wavRecorder.record((data) => client.appendInputAudio(data.mono));
    }
    setCanPushToTalk(value === 'none');
  };

  /**
   * Auto-scroll the event logs
   */
  useEffect(() => {
    if (eventsScrollRef.current) {
      const eventsEl = eventsScrollRef.current;
      const scrollHeight = eventsEl.scrollHeight;
      // Only scroll if height has just changed
      if (scrollHeight !== eventsScrollHeightRef.current) {
        eventsEl.scrollTop = scrollHeight;
        eventsScrollHeightRef.current = scrollHeight;
      }
    }
  }, [realtimeEvents]);

  /**
   * Auto-scroll the conversation logs
   */
  useEffect(() => {
    const conversationEls = document.querySelectorAll('[data-conversation-content]');
    conversationEls.forEach((el) => {
      const conversationEl = el as HTMLDivElement;
      // Use requestAnimationFrame to ensure DOM has updated
      requestAnimationFrame(() => {
        conversationEl.scrollTop = conversationEl.scrollHeight;
      });
    });
  }, [items, pronunciationScores]);

  /**
   * Set up render loops for the visualization canvas
   */
  useEffect(() => {
    let isLoaded = true;

    const wavRecorder = wavRecorderRef.current;
    const clientCanvas = clientCanvasRef.current;
    let clientCtx: CanvasRenderingContext2D | null = null;

    const wavStreamPlayer = wavStreamPlayerRef.current;
    const serverCanvas = serverCanvasRef.current;
    let serverCtx: CanvasRenderingContext2D | null = null;

    const render = () => {
      if (isLoaded) {
        if (clientCanvas) {
          if (!clientCanvas.width || !clientCanvas.height) {
            clientCanvas.width = clientCanvas.offsetWidth;
            clientCanvas.height = clientCanvas.offsetHeight;
          }
          clientCtx = clientCtx || clientCanvas.getContext('2d');
          if (clientCtx) {
            clientCtx.clearRect(0, 0, clientCanvas.width, clientCanvas.height);
            const result = wavRecorder.recording
              ? wavRecorder.getFrequencies('voice')
              : { values: new Float32Array([0]) };
            WavRenderer.drawBars(
              clientCanvas,
              clientCtx,
              result.values,
              '#0099ff',
              10,
              0,
              8
            );
          }
        }
        if (serverCanvas) {
          if (!serverCanvas.width || !serverCanvas.height) {
            serverCanvas.width = serverCanvas.offsetWidth;
            serverCanvas.height = serverCanvas.offsetHeight;
          }
          serverCtx = serverCtx || serverCanvas.getContext('2d');
          if (serverCtx) {
            serverCtx.clearRect(0, 0, serverCanvas.width, serverCanvas.height);
            const result = wavStreamPlayer.analyser
              ? wavStreamPlayer.getFrequencies('voice')
              : { values: new Float32Array([0]) };
            WavRenderer.drawBars(
              serverCanvas,
              serverCtx,
              result.values,
              '#009900',
              10,
              0,
              8
            );
          }
        }
        window.requestAnimationFrame(render);
      }
    };
    render();

    return () => {
      isLoaded = false;
    };
  }, []);

  /**
   * Core RealtimeClient and audio capture setup
   * Set all of our instructions, tools, events and more
   */
  useEffect(() => {
    // Get refs
    const wavStreamPlayer = wavStreamPlayerRef.current;
    const client = clientRef.current;

    // Set instructions
    client.updateSession({ instructions: instructions });
    // Set transcription, otherwise we don't get user transcriptions back
    //client.updateSession({ input_audio_transcription: { model: 'whisper-1' } });
    // Set turn detection to server VAD by default
    client.updateSession({ turn_detection: { type: 'server_vad' } });

    // handle realtime events from client + server for event logging
    client.on('realtime.event', (realtimeEvent: RealtimeEvent) => {
      setRealtimeEvents((realtimeEvents) => {
        const lastEvent = realtimeEvents[realtimeEvents.length - 1];
        if (lastEvent?.event.type === realtimeEvent.event.type) {
          // if we receive multiple events in a row, aggregate them for display purposes
          lastEvent.count = (lastEvent.count || 0) + 1;
          return realtimeEvents.slice(0, -1).concat(lastEvent);
        } else {
          return realtimeEvents.concat(realtimeEvent);
        }
      });
    });
    client.on('error', (event: any) => console.error(event));
    client.on('conversation.interrupted', async () => {
      const trackSampleOffset = await wavStreamPlayer.interrupt();
      if (trackSampleOffset?.trackId) {
        const { trackId, offset } = trackSampleOffset;
        await client.cancelResponse(trackId, offset);
      }
    });
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
        
        if (item.role === 'user' && item.formatted.audio?.length) {
          // upload to azure speech
          const azureSpeechKey = localStorage.getItem('tmp::azure_speech_key') || '';
          const azureSpeechRegion = 'eastus';
          const speechConfig = SpeechSDK.SpeechConfig.fromSubscription(azureSpeechKey, azureSpeechRegion);
          speechConfig.speechRecognitionLanguage = "en-US";
          const audioFile = new File([wavFile.blob], 'audio.wav', { type: 'audio/wav' });
          const audioConfig = SpeechSDK.AudioConfig.fromWavFileInput(audioFile);
          recognizerRef.current = new SpeechSDK.SpeechRecognizer(speechConfig, audioConfig);
          const pronunciationAssessmentConfig = new SpeechSDK.PronunciationAssessmentConfig(
            "", // Empty reference text for free-form speech
            SpeechSDK.PronunciationAssessmentGradingSystem.HundredMark,
            SpeechSDK.PronunciationAssessmentGranularity.Phoneme
          );
          pronunciationAssessmentConfig.phonemeAlphabet = "IPA";
          pronunciationAssessmentConfig.nbestPhonemeCount = 3;
          pronunciationAssessmentConfig.applyTo(recognizerRef.current);
      
          recognizerRef.current.recognizeOnceAsync(
            (result) => {
              if (result.reason === SpeechSDK.ResultReason.RecognizedSpeech) {
                // Get pronunciation assessment results
                const pronunciationAssessmentResult = SpeechSDK.PronunciationAssessmentResult.fromResult(result);
                //item.formatted.transcript = (pronunciationAssessmentResult as any).privPronJson.Display;
                item.formatted.transcript = '';
                for (const word of pronunciationAssessmentResult.detailResult.Words) {
                  const accuracyScore = word.PronunciationAssessment!.AccuracyScore;
                  let accuracyClass = 'needs-improvement';
                  if (accuracyScore > 80) {
                    accuracyClass = 'excellent';
                  } else if (accuracyScore > 50) {
                    accuracyClass = 'good';
                  }
                  item.formatted.transcript += ` <span class="pronunciation-word ${accuracyClass}">${word.Word}</span>`;
                }
                item.formatted.transcript += ' (';
                for (const word of pronunciationAssessmentResult.detailResult.Words) {
                  for (const phoneme of word.Phonemes) {
                    const accuracyScore = (phoneme.PronunciationAssessment as any).AccuracyScore;
                    let accuracyClass = 'needs-improvement';
                    if (accuracyScore > 80) {
                      accuracyClass = 'excellent';
                    } else if (accuracyScore > 50) {
                      accuracyClass = 'good';
                    }
                    item.formatted.transcript += `<span class="pronunciation-word ${accuracyClass}">${phoneme.Phoneme}</span>`;
                  }
                  item.formatted.transcript += ' ';
                }
                item.formatted.transcript += ')';
                try {
                  const scores = pronunciationAssessmentResult.detailResult.PronunciationAssessment;
                  const newScores: PronunciationScores = {
                    accuracyScore: scores?.AccuracyScore || null,
                    fluencyScore: scores?.FluencyScore || null,
                    completenessScore: scores?.CompletenessScore || null,
                    pronunciationScore: scores?.PronScore || null
                  };
                  setPronunciationScores(prev => ({
                    ...prev,
                    [item.id]: newScores
                  }));
                } catch (error) {
                  console.error('Error getting pronunciation scores:', error);
                }
                setItems(items);
              }
              
              recognizerRef.current?.close();
              recognizerRef.current = null;
            },
            (err) => {
              console.error('Error:', err);
              recognizerRef.current?.close();
              recognizerRef.current = null;
            }
          );
        }
        setItems(items);
      }
    });

    setItems(client.conversation.getItems());

    return () => {
      // cleanup; resets to defaults
      client.reset();
    };
  }, []);

  /**
   * Render the application
   */
  return (
    <div data-component="ConsolePage">
      <div className="content-top">
        <div className="content-title">
          <img src="/openai-logomark.svg" alt="OpenAI" />
          <img src="https://upload.wikimedia.org/wikipedia/commons/f/fa/Microsoft_Azure.svg" alt="Azure" style={{ width: '24px', height: '24px' }} />
          <span>realtime && speech</span>
          <div className="visualization">
            <div className="visualization-entry client">
              <canvas ref={clientCanvasRef} />
            </div>
            <div className="visualization-entry server">
              <canvas ref={serverCanvasRef} />
            </div>
          </div>
        </div>
        <div className="content-api-key">
          {!LOCAL_RELAY_SERVER_URL && (
            <Button
              icon={Edit}
              iconPosition="end"
              buttonStyle="flush"
              label={`OpenAI key: ${openAIKey.slice(0, 3)}...`}
              onClick={() => resetOpenAIKey()}
            />
          )}
          <Button
            icon={Edit}
            iconPosition="end"
            buttonStyle="flush"
            label={`Azure Speech key: ${azureSpeechKey ? azureSpeechKey.slice(0, 3) + '...' : 'not set'}`}
            onClick={() => resetAzureSpeechKey()}
          />
        </div>
      </div>
      <div className="content-main">
        <div className="content-logs">
          {showConsole && (
            <div className="content-block events">
              <div className="visualization">
                <div className="visualization-entry client">
                  <canvas ref={clientCanvasRef} />
                </div>
                <div className="visualization-entry server">
                  <canvas ref={serverCanvasRef} />
                </div>
              </div>
              <div className="content-block-title">events</div>
              <div className="content-block-body" ref={eventsScrollRef}>
                {!realtimeEvents.length && `awaiting connection...`}
                {realtimeEvents.map((realtimeEvent, i) => {
                  const count = realtimeEvent.count;
                  const event = { ...realtimeEvent.event };
                  if (event.type === 'input_audio_buffer.append') {
                    event.audio = `[trimmed: ${event.audio.length} bytes]`;
                  } else if (event.type === 'response.audio.delta') {
                    event.delta = `[trimmed: ${event.delta.length} bytes]`;
                  }
                  return (
                    <div className="event" key={event.event_id}>
                      <div className="event-timestamp">
                        {formatTime(realtimeEvent.time)}
                      </div>
                      <div className="event-details">
                        <div
                          className="event-summary"
                          onClick={() => {
                            const id = event.event_id;
                            const expanded = { ...expandedEvents };
                            if (expanded[id]) {
                              delete expanded[id];
                            } else {
                              expanded[id] = true;
                            }
                            setExpandedEvents(expanded);
                          }}
                        >
                          <div
                            className={`event-source ${
                              event.type === 'error'
                                ? 'error'
                                : realtimeEvent.source
                            }`}
                          >
                            {realtimeEvent.source === 'client' ? (
                              <ArrowUp />
                            ) : (
                              <ArrowDown />
                            )}
                            <span>
                              {event.type === 'error'
                                ? 'error!'
                                : realtimeEvent.source}
                            </span>
                          </div>
                          <div className="event-type">
                            {event.type}
                            {count && ` (${count})`}
                          </div>
                        </div>
                        {!!expandedEvents[event.event_id] && (
                          <div className="event-payload">
                            {JSON.stringify(event, null, 2)}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          <div className="content-block conversation">
            <div className="content-block-title">conversation</div>
            <div className="content-block-body" data-conversation-content>
              {!items.length && `awaiting connection...`}
              {items.map((conversationItem, i) => {
                const scores = pronunciationScores[conversationItem.id];
                return (
                  <div className="conversation-item" key={conversationItem.id}>
                    <div className={`speaker ${conversationItem.role || ''}`}>
                      <div>
                        {(
                          conversationItem.role || conversationItem.type
                        ).replaceAll('_', ' ')}
                      </div>
                      <div
                        className="close"
                        onClick={() =>
                          deleteConversationItem(conversationItem.id)
                        }
                      >
                        <X />
                      </div>
                    </div>
                    <div className={`speaker-content`}>
                      {/* tool response */}
                      {conversationItem.type === 'function_call_output' && (
                        <div>{conversationItem.formatted.output}</div>
                      )}
                      {/* tool call */}
                      {!!conversationItem.formatted.tool && (
                        <div>
                          {conversationItem.formatted.tool.name}(
                          {conversationItem.formatted.tool.arguments})
                        </div>
                      )}
                      {!conversationItem.formatted.tool &&
                        conversationItem.role === 'user' && (
                          <div dangerouslySetInnerHTML={{ __html: conversationItem.formatted.transcript || 
                            (conversationItem.formatted.audio?.length
                              ? '(awaiting transcript)'
                              : conversationItem.formatted.text ||
                                '(item sent)') }} />
                        )}
                      {!conversationItem.formatted.tool &&
                        conversationItem.role === 'assistant' && (
                          <div>
                            {conversationItem.formatted.transcript ||
                              conversationItem.formatted.text ||
                              '(truncated)'}
                          </div>
                        )}
                      {conversationItem.formatted.file && showAudio && (
                        <audio
                          src={conversationItem.formatted.file.url}
                          controls
                        />
                      )}
                      {scores && (
                        <div className="pronunciation-scores">
                          <div>Accuracy: {scores.accuracyScore?.toFixed(1) || 'N/A'}</div>
                          <div>Fluency: {scores.fluencyScore?.toFixed(1) || 'N/A'}</div>
                          <div>Completeness: {scores.completenessScore?.toFixed(1) || 'N/A'}</div>
                          <div>Pronunciation: {scores.pronunciationScore?.toFixed(1) || 'N/A'}</div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="content-actions">
            <Toggle
              defaultValue={true}
              labels={['manual', 'vad']}
              values={['none', 'server_vad']}
              onChange={(_, value) => changeTurnEndType(value)}
            />
            <div className="spacer" />
            {isConnected && canPushToTalk && (
              <Button
                label={isRecording ? 'release to send' : 'push to talk'}
                buttonStyle={isRecording ? 'alert' : 'regular'}
                disabled={!isConnected || !canPushToTalk}
                onMouseDown={startRecording}
                onMouseUp={stopRecording}
              />
            )}
            <div className="spacer" />
            <Button
              label={isConnected ? 'disconnect' : 'connect'}
              iconPosition={isConnected ? 'end' : 'start'}
              icon={isConnected ? X : Zap}
              buttonStyle={isConnected ? 'regular' : 'action'}
              onClick={
                isConnected ? disconnectConversation : connectConversation
              }
            />
          </div>
        </div>
      </div>
    </div>
  );
}
