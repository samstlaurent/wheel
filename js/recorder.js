// Audio context and destination for recording
const audioCtx = new AudioContext();
const audioDestination = audioCtx.createMediaStreamDestination();

// Track active sounds for the busy state
let activeSounds = new Set();
let audioSources = new WeakMap();

// Recording state
let recordedChunks = [];
let mediaRecorder = null;

// Initialize the media recorder with canvas and audio streams
function initRecorder(canvas) {
	const videoStream = canvas.captureStream(60);
	const audioStream = audioDestination.stream;
	const combinedStream = new MediaStream([...videoStream.getTracks(), ...audioStream.getTracks()]);

	mediaRecorder = new MediaRecorder(combinedStream, {mimeType: 'video/webm'});

	mediaRecorder.ondataavailable = (event) => {
		if (event.data.size > 0) {
			recordedChunks.push(event.data);
		}
	};

	return mediaRecorder;
}

// Start recording
function startRecording() {
	recordedChunks = [];
	if (mediaRecorder) {
		mediaRecorder.start();
	}
}

// Stop recording and return the blob
function stopRecording() {
	return new Promise((resolve) => {
		if (!mediaRecorder) {
			resolve(null);
			return;
		}

		mediaRecorder.onstop = () => {
			const blob = new Blob(recordedChunks, { type: 'video/webm' });
			resolve(blob);
		};

		mediaRecorder.stop();
	});
}

// Play a sound through the audio context
function playSound(audio, volume = 1.0) {
	// Reuse or create the MediaElementSource
	let source = audioSources.get(audio);
	if (!source) {
		source = audioCtx.createMediaElementSource(audio);
		source.connect(audioCtx.destination);
		source.connect(audioDestination);
		audioSources.set(audio, source);
	}
	audio.currentTime = 0;
	audio.volume = volume;
	activeSounds.add(audio);
	audio.onended = () => { activeSounds.delete(audio); };
	audio.play();
}

// Load and prepare a tick sound buffer for low-latency playback
let wheelTickBuffer = null;
async function initWheelTick(audioElement) {
	try {
		const response = await fetch(audioElement.src, { mode: "cors" });
		const arrayBuffer = await response.arrayBuffer();
		wheelTickBuffer = await audioCtx.decodeAudioData(arrayBuffer);
	} catch (err) {
		console.error("Failed to load wheel tick audio:", err);
	}
}

// Play tick sound with low latency
function playTick(volume = 1.0) {
	if (!wheelTickBuffer) return;

	const source = audioCtx.createBufferSource();
	source.buffer = wheelTickBuffer;

	const gainNode = audioCtx.createGain();
	gainNode.gain.value = volume;

	source.connect(gainNode).connect(audioCtx.destination);
	source.connect(gainNode).connect(audioDestination);

	source.start(audioCtx.currentTime + 0.05);
}

// Resume audio context (needed for user interaction requirement)
function resumeAudio() {
	audioCtx.resume();
}

// Check if any sounds are currently playing
function hasSoundsPlaying() {
	return activeSounds.size > 0;
}

export {
	audioCtx,
	audioDestination,
	initRecorder,
	startRecording,
	stopRecording,
	playSound,
	initWheelTick,
	playTick,
	resumeAudio,
	hasSoundsPlaying
};