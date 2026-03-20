import { useRef, useState } from 'react';
import { Device } from 'mediasoup-client';
import { getSocket } from './useSocket';

function emitWithAck(socket, event, data) {
  return new Promise((resolve) => socket.emit(event, data, resolve));
}

export function useVoice() {
  const deviceRef        = useRef(null);
  const sendTransportRef = useRef(null);
  const recvTransportRef = useRef(null);
  const producerRef      = useRef(null);

  const [connected, setConnected] = useState(false);
  const [muted,     setMuted]     = useState(false);

  async function start() {
    const socket = getSocket();
    if (!socket) return;

    // 1. RTP capabilities
    const { rtpCapabilities } = await emitWithAck(socket, 'ms:get_rtp_capabilities', {});

    // 2. mediasoup Device 초기화
    const device = new Device();
    await device.load({ routerRtpCapabilities: rtpCapabilities });
    deviceRef.current = device;

    // 3. send transport (마이크 → 서버)
    const sendParams = await emitWithAck(socket, 'ms:create_transport', { direction: 'send' });
    const sendTransport = device.createSendTransport(sendParams);
    sendTransportRef.current = sendTransport;

    sendTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
      try {
        await emitWithAck(socket, 'ms:connect_transport', { direction: 'send', dtlsParameters });
        callback();
      } catch (e) { errback(e); }
    });

    sendTransport.on('produce', async ({ kind, rtpParameters }, callback, errback) => {
      try {
        const { producerId } = await emitWithAck(socket, 'ms:produce', { kind, rtpParameters });
        callback({ id: producerId });
      } catch (e) { errback(e); }
    });

    // 4. recv transport (서버 → 스피커)
    const recvParams = await emitWithAck(socket, 'ms:create_transport', { direction: 'recv' });
    const recvTransport = device.createRecvTransport(recvParams);
    recvTransportRef.current = recvTransport;

    recvTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
      try {
        await emitWithAck(socket, 'ms:connect_transport', { direction: 'recv', dtlsParameters });
        callback();
      } catch (e) { errback(e); }
    });

    // 5. 마이크 캡처 → produce
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const track  = stream.getAudioTracks()[0];
    producerRef.current = await sendTransport.produce({ track });

    // 6. 상대방 audio 구독
    socket.on('ms:new_producer', async ({ producerId }) => {
      const consumerParams = await emitWithAck(socket, 'ms:consume', {
        producerId,
        rtpCapabilities: device.rtpCapabilities,
      });
      const consumer = await recvTransport.consume(consumerParams);
      const audio    = new Audio();
      audio.srcObject = new MediaStream([consumer.track]);
      audio.autoplay  = true;
      audio.play().catch(() => {});
    });

    setConnected(true);
  }

  function toggleMute() {
    const producer = producerRef.current;
    if (!producer) return;
    if (muted) { producer.resume(); } else { producer.pause(); }
    setMuted((m) => !m);
  }

  function stop() {
    producerRef.current?.close();
    sendTransportRef.current?.close();
    recvTransportRef.current?.close();
    deviceRef.current = null;
    setConnected(false);
  }

  return { start, stop, toggleMute, connected, muted };
}
