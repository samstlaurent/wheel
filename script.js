// Main canvas on which the rotated wheel and animations will be drawn
const mainCanvas = document.getElementById("mainCanvas"), ctx = mainCanvas.getContext("2d");
const canvasCenterX = mainCanvas.width / 2, canvasCenterY = mainCanvas.height / 2;
const wheelRadius = Math.min(canvasCenterX, canvasCenterY) - 50;
const spinButtonRadius = 60;
const TWO_PI = Math.PI * 2;

const today = new Date();
const month = today.getMonth() + 1;
const day = today.getDate();

let names = [];
if (month == 4 && day == 1) {
	names = ["Sam", "Sam", "Sam", "Sam", "Sam", "Sam", "Sam", "Sam", "Sam", "Sam", "Sam", "Sam", "Sam"];
} else {
	names = ["Aaron D", "Aaron E", "Andrea", "Jasmine", "Jayden", "Jessica", "Jonathan", "Josey", "Lauren", "Michelle", "Quintin", "Sam", "Victoria"];
}

let includedNames = [...names];
let shuffledNames = [...includedNames];

let wheelAngle = 0, wheelSpeed = 0, wheelFriction = 0;
let busy = false, lastFrameTime = 0, lastTickTime = 0;
let winningSegment = 0, previousWinningSegment = 0, arrowDeflection = 0;
let segmentAngles = [], segmentBoundaries = [];;

const wheelTick = document.getElementById("wheelTick");
const wheelStopNeutral = document.getElementById("wheelStopNeutral");
const wheelStopParty = document.getElementById("wheelStopParty");
const wheelStopSpectacle = document.getElementById("wheelStopSpectacle");
const buttonPress = document.getElementById("buttonPress");

// Unseen canvas for drawing the wheel (which then gets copied to the main canvas and rotated)
const wheelCanvas = document.createElement("canvas"), wheelCtx = wheelCanvas.getContext("2d");
wheelCanvas.width = mainCanvas.width; wheelCanvas.height = mainCanvas.height;
function drawWheelBase() {
    wheelCtx.clearRect(0, 0, wheelCanvas.width, wheelCanvas.height);

    // Shuffle the includedNames array
    shuffledNames = [...includedNames];
    for (let i = shuffledNames.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffledNames[i], shuffledNames[j]] = [shuffledNames[j], shuffledNames[i]];
    }

    // Determine weights: selected name is half weight, others full weight
    const weights = shuffledNames.map(n => (n === selectedName ? 0.5 : 1));
    const totalWeight = weights.reduce((a, b) => a + b, 0);

    // Compute angles for each segment and store in segmentAngles
    segmentAngles = weights.map(w => TWO_PI * (w / totalWeight));

    // Draw each segment
    let startAngle = 0;
    shuffledNames.forEach((n, i) => {
        const segArc = segmentAngles[i];

        // Draw segment
        let fillStyle;

		if (colorMode === "hue") {
			const hue = Math.round((360 * i / shuffledNames.length) % 360);
			fillStyle = `hsl(${hue}, 80%, 60%)`;
		} else if (colorMode === "lightness") {
			const light = 25 + 75 * (i / shuffledNames.length);  
			fillStyle = `hsl(${baseHue}, 80%, ${light}%)`;
		}

		wheelCtx.fillStyle = fillStyle;
        wheelCtx.beginPath();
        wheelCtx.moveTo(canvasCenterX, canvasCenterY);
        wheelCtx.arc(canvasCenterX, canvasCenterY, wheelRadius, startAngle, startAngle + segArc, false);
        wheelCtx.lineTo(canvasCenterX, canvasCenterY);
        wheelCtx.fill();

        // Draw text
        wheelCtx.save();
        wheelCtx.translate(canvasCenterX, canvasCenterY);
        wheelCtx.rotate(startAngle + segArc / 2);
        wheelCtx.textAlign = "right";
        wheelCtx.textBaseline = "middle";
        wheelCtx.fillStyle = "black";
        wheelCtx.font = "16px Arial";
        wheelCtx.fillText(n, wheelRadius - 10, 0);
        wheelCtx.restore();

        startAngle += segArc;
    });
	
	// Pre-compute segment boundaries to avoid expensive loop each frame
	segmentBoundaries = [];
	let total = 0;
	for (let seg of segmentAngles) {
		total += seg;
		segmentBoundaries.push(total);
	}

    drawCanvas();
}

let spinLogged = false;
function drawCanvas() {

	const now = performance.now();
	const delta = now - lastFrameTime;
	const frameMultiplier = delta / 1000 * 60;
	lastFrameTime = now;
	
	// Compute changes to wheel
	if (wheelSpeed > 0) {
		wheelSpeed *= Math.pow(wheelFriction, frameMultiplier);
		wheelAngle = (wheelAngle + wheelSpeed * frameMultiplier) % TWO_PI;
		const relativeAngle = (TWO_PI - wheelAngle) % TWO_PI;
		let low = 0, high = segmentBoundaries.length - 1;
		while (low <= high) {
			const mid = (low + high) >> 1;
			if (relativeAngle <= segmentBoundaries[mid]) {
				winningSegment = mid;
				high = mid - 1;
			} else {
				low = mid + 1;
			}
		}
		if (wheelSpeed < 0.001) {
			wheelSpeed = 0;
			
			if (!spinLogged && window.firebaseAddSpin) {
				spinLogged = true;
				const winner = shuffledNames[winningSegment];
				window.firebaseAddSpin(winner);
			}
			
			const randomNumber = Math.random();
			if (randomNumber < 0.31) wheelStopEffectNeutral();
            else if (randomNumber < 0.62) wheelStopEffectParty();
            else wheelStopEffectSpectacle();
		}
		
		// Check if the arrow has crossed a segment boundary
		if (winningSegment != previousWinningSegment) {
			arrowDeflection = Math.max(-1.2, -2.5*wheelSpeed - 0.7);
			if (now - lastTickTime >= 80) {
				playTick(Math.min(1, 1.5*wheelSpeed + 0.7));
				lastTickTime = now;
			}
			previousWinningSegment = winningSegment;
		}
	}
	
	// Compute changes to arrow
	if (arrowDeflection != 0) {
		arrowDeflection *= Math.pow(0.7, frameMultiplier);
		if (Math.abs(arrowDeflection) < 0.01) {	arrowDeflection = 0; }	
	}
	
	// Compute changes to balloons
	if (balloonSpawnTime > 0) {
		const spawnCount = Math.floor(Math.random() + 0.2);
		for (let i = 0; i < spawnCount; i++) {
			balloons.push({
				x: Math.random() * mainCanvas.width,
				y: mainCanvas.height + 40,
				dx: (Math.random() - 0.5) * 0.5,
				dy: -(Math.random() * 1.5 + 3),
				sway: Math.random() * Math.PI * 2,
				swaySpeed: (Math.random() * 0.02) + 0.01,
				color: balloonColors[Math.floor(Math.random() * balloonColors.length)],
				size: Math.random() * 20 + 30
			});
		}
		balloonSpawnTime = Math.max(0, balloonSpawnTime - delta);
	}
	if (balloons.length > 0) {
		balloons.forEach(b => {
			b.y += b.dy * frameMultiplier;
			b.sway += b.swaySpeed * frameMultiplier;
			b.x += Math.sin(b.sway) * 0.5 * frameMultiplier;
		});
		balloons = balloons.filter(b => b.y + b.size > -50); // remove if off top
	}

	// Compute changes to confetti
	if (confettiSpawnTime > 0) {
		const spawnCount = Math.floor(Math.random() * 5) + 3;
		for (let i = 0; i < spawnCount; i++) {
			confetti.push({
				x: Math.random() * mainCanvas.width,
				y: -29,
				dx: (Math.random() - 0.5) * 4,
				dy: Math.random() * 2 + 3,
				color: confettiColors[Math.floor(Math.random() * confettiColors.length)],
				size: Math.random() * 12 + 8,
				rotation: Math.random() * 360,
				rotationSpeed: (Math.random() - 0.5) * 10
			});
		}
		confettiSpawnTime = Math.max(0, confettiSpawnTime - delta);
	}
	if (confetti.length > 0) {
		confetti.forEach(p => {
			p.x += p.dx * frameMultiplier;
			p.y += p.dy * frameMultiplier;
			p.dy += 0.05 * frameMultiplier;
			p.rotation += p.rotationSpeed * frameMultiplier;
		});
		confetti = confetti.filter(p => p.y - p.size/2 < mainCanvas.height); // Remove confetti that has fallen off screen
	}
	
	// Prepare the canvas for drawing
	ctx.clearRect(0, 0, mainCanvas.width, mainCanvas.height);
	ctx.fillStyle = "white";
	ctx.fillRect(0, 0, mainCanvas.width, mainCanvas.height);

	// Draw wheel
	ctx.save();
    ctx.translate(canvasCenterX, canvasCenterY);
    ctx.rotate(wheelAngle);
    ctx.drawImage(wheelCanvas, -canvasCenterX, -canvasCenterY);
	
    // Draw highlight over the current winning segment
	let highlightStart = 0;
    for (let i = 0; i < winningSegment; i++) highlightStart += segmentAngles[i];
    const highlightArc = segmentAngles[winningSegment];
	ctx.fillStyle = '#f2f2f2';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, wheelRadius + 1, highlightStart, highlightStart + highlightArc, false);
    ctx.lineTo(0, 0);
    ctx.fill();
    ctx.strokeStyle = '#f2f2f2';
    ctx.lineWidth = 2;
    ctx.stroke();
	ctx.save();
    ctx.rotate(highlightStart + highlightArc / 2);
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "black";
    ctx.font = "16px Arial";
    ctx.fillText(shuffledNames[winningSegment], wheelRadius - 10, 0);
    ctx.restore();
    ctx.restore();
	
	// Draw spin button
	ctx.save();
	ctx.beginPath();
	ctx.arc(canvasCenterX, canvasCenterY, spinButtonRadius, 0, TWO_PI);
	ctx.fillStyle = busy ? "#ccc" : "white";
	ctx.fill();
	ctx.fillStyle = busy ? "white" : "black";
	ctx.font = "14px Arial";
	ctx.textAlign = "center";
	ctx.textBaseline = "middle";
	ctx.fillText(busy ? "Spinning..." : "SPIN", canvasCenterX, canvasCenterY);

	// Draw arrow at 3 o'clock
	ctx.translate(canvasCenterX + wheelRadius + 15, canvasCenterY);
	ctx.rotate(arrowDeflection);
	ctx.translate(-15, 0);
	ctx.fillStyle = "black";
	ctx.beginPath();
	ctx.moveTo(15, -5);
	ctx.lineTo(15, 5);
	ctx.lineTo(-15, 0);
	ctx.closePath();
	ctx.fill();
	ctx.stroke();
	ctx.restore();
	
	// Draw balloons
	balloons.forEach(b => {
		ctx.fillStyle = b.color;
		ctx.beginPath();
		ctx.ellipse(b.x, b.y, b.size * 0.8, b.size, 0, 0, TWO_PI);
		ctx.fill();
		const mouthWidth = b.size * 0.2;
		const mouthHeight = b.size * 0.15;
		ctx.fillStyle = b.color;
		ctx.beginPath();
		ctx.moveTo(b.x - mouthWidth / 2, b.y + b.size); // left corner
		ctx.lineTo(b.x + mouthWidth / 2, b.y + b.size); // right corner
		ctx.lineTo(b.x, b.y + b.size + mouthHeight);    // bottom tip
		ctx.closePath();
		ctx.fill();
		ctx.fillStyle = "rgba(255,255,255,0.6)";
		ctx.beginPath();
		ctx.arc(b.x - b.size * 0.2, b.y - b.size * 0.3, b.size * 0.15, 0, TWO_PI);
		ctx.fill();
	});
	
	// Draw confetti
	confetti.forEach(piece => {
		ctx.save();
		ctx.translate(piece.x, piece.y);
		ctx.rotate(piece.rotation * Math.PI / 180);
		ctx.fillStyle = piece.color;
		ctx.fillRect(-piece.size/2, -piece.size/2, piece.size, piece.size);
		ctx.restore();
	});
	
	// Draw stagelights
	if (stagelightTime > 0) {
		for (let side = 0; side < 2; side++) { // 0 = left, 1 = right
			const baseX = side === 0 ? 0 : mainCanvas.width;
			const direction = side === 0 ? 1 : -1;
			const topTarget = Math.sin(now/500) * 300 + canvasCenterX;
			ctx.save();
			ctx.beginPath();
			ctx.moveTo(baseX, mainCanvas.height);
			ctx.lineTo(baseX + direction * (topTarget - 250), 0);
			ctx.lineTo(baseX + direction * (topTarget + 250), 0);
			ctx.lineTo(baseX + direction * 60, mainCanvas.height);
			ctx.closePath();
			const gradient = ctx.createLinearGradient(0, mainCanvas.height, 0, 0);
			gradient.addColorStop(0, 'rgba(255,255,200,0.5)');
			gradient.addColorStop(1, 'rgba(255,255,200,0)');
			ctx.fillStyle = gradient;
			ctx.fill();
			ctx.restore();
		}
		stagelightTime = Math.max(0, stagelightTime - delta);
	}
	
	if (busy) {
		requestAnimationFrame(drawCanvas);
	} else {
		mediaRecorder.stop();
		updateCursor(lastMouseEvent);
		document.getElementById("instructionsButton").disabled = false;
		document.querySelectorAll("#nameList .nameItem").forEach(item => item.classList.remove("disabled"));
		document.querySelectorAll("#nameList .nameWrapper").forEach(wrapper => {
			const iconContainer = wrapper.querySelector(".iconContainer");
			const icon = wrapper.querySelector(".selectorIcon");
			const nameItem = wrapper.querySelector(".nameItem");
			if (iconContainer) iconContainer.style.cursor = "pointer";
			if (icon) {
				if (nameItem && nameItem.textContent === selectedName) {
					icon.src = "images/selectorIconEnabled.png";
				} else {
					icon.src = "images/selectorIconDisabled.png";
				}
			}
		});
	}
	if (wheelSpeed == 0 && arrowDeflection == 0 && activeSounds.size === 0 && confetti.length == 0 && balloons.length == 0 && stagelightTime == 0) { busy = false }
}

let balloons = [], balloonSpawnTime = 0;
const balloonColors = ['#ff6b6b', '#6c5ce7', '#f9ca24', '#55efc4', '#fab1a0'];
function wheelStopEffectNeutral() {
	playSound(wheelStopNeutral);
    balloonSpawnTime = 500;
}

const confettiColors = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#f9ca24', '#6c5ce7', '#a0e7e5', '#ffeaa7', '#fd79a8', '#00b894', '#e17055', '#74b9ff', '#55a3ff', '#fd9644', '#d63031', '#00cec9'];
let confetti = [], confettiSpawnTime = 0;
function wheelStopEffectParty() {
	playSound(wheelStopParty, 0.4);
	confettiSpawnTime = 1000;
}

let stagelightTime = 0;
function wheelStopEffectSpectacle() {
	playSound(wheelStopSpectacle, 1);
	stagelightTime = 3000;
}

const audioCtx = new AudioContext(), audioDestination = audioCtx.createMediaStreamDestination();
let activeSounds = new Set(), audioSources = new WeakMap();
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

let wheelTickBuffer = null;
async function initWheelTick() {
    const response = await fetch(wheelTick.src, { mode: "cors" });
    const arrayBuffer = await response.arrayBuffer();
    wheelTickBuffer = await audioCtx.decodeAudioData(arrayBuffer);
}
initWheelTick();

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

// Add controls for each name
let selectedIcon = null, selectedName = null;

// Load saved selectedName from localStorage
const savedSelectedName = localStorage.getItem("selectedName");
if (savedSelectedName) {
	selectedName = savedSelectedName;
	window.userName = selectedName;
}

document.getElementById("nameList").innerHTML = ""; // Clear existing items
[...names].sort((a, b) => a.localeCompare(b)).forEach((n, index) => {

	// The icon itself
	const icon = document.createElement("img");
	if (n === selectedName) {
		icon.src = "images/selectorIconEnabled.png";
		selectedIcon = icon;
	} else {
		icon.src = "images/selectorIconDisabled.png";
	}
	icon.alt = "";
    icon.className = "selectorIcon";
	icon.style.height = "24px";

	// The hitbox container for the icon
	const iconContainer = document.createElement("div");
    iconContainer.className = "iconContainer";
	iconContainer.style.width = "100%";
	iconContainer.style.display = "flex";
	iconContainer.style.justifyContent = "center";
	iconContainer.style.cursor = "pointer";
	iconContainer.style.marginBottom = "4px";
	iconContainer.appendChild(icon);
	iconContainer.onclick = () => {
		if (!busy) {
			audioCtx.resume();
			playSound(buttonPress, 0.5);
			if (selectedName == n) {
				icon.src = "images/selectorIconDisabled.png";
				selectedIcon = null;
				selectedName = null;
				localStorage.removeItem("selectedName");
			} else {
				if (selectedIcon) selectedIcon.src = "images/selectorIconDisabled.png";
				icon.src = "images/selectorIconEnabled.png";
				selectedIcon = icon;
				selectedName = n;
				localStorage.setItem("selectedName", selectedName);
			}
			window.userName = selectedName;
			drawWheelBase();
		}
	};

	// The button itself
	const item = document.createElement("span");
	item.className = "nameItem";
	item.textContent = n;
	item.onclick = () => {
		if (!busy) {
			audioCtx.resume();
			playSound(buttonPress, 0.5);
			const idx = includedNames.indexOf(n);
			if (idx !== -1) {
				if (includedNames.length > 1) {
					includedNames.splice(idx, 1);
					item.classList.add("excluded");
				}
			} else {
				includedNames.push(n);
				item.classList.remove("excluded");
			}

			wheelAngle = 0;
			winningSegment = 0;
			drawWheelBase();
		}
	};

	// Wrapper that holds icon + button
	const wrapper = document.createElement("div");
    wrapper.className = "nameWrapper";
	wrapper.style.display = "inline-flex";
	wrapper.style.flexDirection = "column";
	wrapper.style.alignItems = "center";
	wrapper.style.margin = "4px";
	wrapper.appendChild(iconContainer);
	wrapper.appendChild(item);
	document.getElementById("nameList").appendChild(wrapper);
});

// Check if user is hovering over the spin button
let lastMouseEvent = null;
function updateCursor(e) {
	if (e == null) { return };
	const rect = mainCanvas.getBoundingClientRect();
	const x = e.clientX - rect.left - canvasCenterX;
	const y = e.clientY - rect.top - canvasCenterY;
	const isOverButton = Math.sqrt(x*x + y*y) <= spinButtonRadius;
	mainCanvas.style.cursor = (isOverButton && !busy) ? "pointer" : "default";
}
mainCanvas.addEventListener("mousemove", e => {
	lastMouseEvent = e;
	updateCursor(e);
});

// Check if spin button was clicked
mainCanvas.addEventListener("click", e => {
	const rect = mainCanvas.getBoundingClientRect();
	const x = e.clientX - rect.left-canvasCenterX;
	const y = e.clientY - rect.top-canvasCenterY;
	if (Math.sqrt(x*x + y*y) <= spinButtonRadius) {
		if (busy || includedNames.length < 2) return;
		audioCtx.resume();
		busy = true;
		spinLogged = false;
		updateCursor(e);
		wheelSpeed = Math.random()*4.5 + 0.5;
		wheelFriction = Math.random()*0.02 + 0.97; // prev 0.982 - 0.992 new 0.97 - 0.99
		lastFrameTime = performance.now();
		document.getElementById("downloadButton").disabled = true;
		document.getElementById("screenshotButton").disabled = true;
		document.getElementById("instructionsButton").disabled = true;
		document.querySelectorAll("#nameList .nameItem").forEach(item => item.classList.add("disabled"));
		document.querySelectorAll("#nameList .nameWrapper").forEach(wrapper => { // Disable icon pointers
			const iconContainer = wrapper.querySelector(".iconContainer");
			const icon = wrapper.querySelector(".selectorIcon");
			if (iconContainer) iconContainer.style.cursor = "default";
			if (icon) icon.src = "images/selectorIconDisabled.png";
		});
		recordedChunks = [];
		mediaRecorder.start();
		drawCanvas();
	};
});

// Show instructions when button clicked
const modal = document.getElementById("instructionsModal");
document.getElementById("instructionsButton").addEventListener("click", () => {
	modal.style.display = "flex";
});
modal.addEventListener("click", (e) => {
	modal.style.display = "none";
});

// Auto-open instructions modal on first visit
window.addEventListener("load", () => {
	if (window.isFirstVisit) {
		const modal = document.getElementById("instructionsModal");
		if (modal) {
			modal.style.display = "flex";
		}
	}
});

document.getElementById("optionsButton").onclick = () => {
    document.getElementById("optionsModal").style.display = "flex";
};

document.getElementById("optionsModal").onclick = (e) => {
    if (e.target === e.currentTarget) {
        e.currentTarget.style.display = "none";
    }
};

let colorMode = localStorage.getItem("colorMode") || "hue";
let baseHue = Number(localStorage.getItem("baseHue")) || 200;
document.getElementById("hueSlider").value = baseHue;
document.querySelector(`input[name="colorMode"][value="${colorMode}"]`).checked = true;
document.querySelectorAll('input[name="colorMode"]').forEach(radio => {
    radio.onchange = () => {
        colorMode = radio.value;
        localStorage.setItem("colorMode", colorMode);
		updateOptionsUI();
        drawWheelBase();
    };
});
document.getElementById("hueSlider").oninput = (e) => {
    baseHue = Number(e.target.value);
    localStorage.setItem("baseHue", baseHue);
    drawWheelBase();
};

function updateOptionsUI() {
    const hueSlider = document.getElementById("hueSlider");

    hueSlider.style.display = (colorMode === "lightness")
        ? "block"
        : "none";
}

updateOptionsUI();

// Setup recording
const videoStream = mainCanvas.captureStream(60);
const audioStream = audioDestination.stream;
const combinedStream = new MediaStream([...videoStream.getTracks(), ...audioStream.getTracks()]);
mediaRecorder = new MediaRecorder(combinedStream, {mimeType: 'video/webm'});
mediaRecorder.ondataavailable = (event) => { if (event.data.size > 0) { recordedChunks.push(event.data); } };
mediaRecorder.onstop = () => {
	const blob = new Blob(recordedChunks, { type: 'video/webm' });
	const url = URL.createObjectURL(blob);
	const today = new Date();
	const year = today.getFullYear();
	const month = String(today.getMonth() + 1).padStart(2, '0');
	const day = String(today.getDate()).padStart(2, '0');
	const filename = `Sporcle of the Day Selector ${year}-${month}-${day}.webm`;

	document.getElementById("downloadButton").onclick = () => {
		const a = document.createElement('a');
		a.href = url;
		a.download = filename;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
	};
	document.getElementById("downloadButton").disabled = false;
	document.getElementById("screenshotButton").disabled = false;
};

document.getElementById("screenshotButton").addEventListener("click", () => {
    const canvas = document.getElementById("mainCanvas");
    canvas.toBlob(function(blob) {
        const url = URL.createObjectURL(blob);
        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const day = String(today.getDate()).padStart(2, '0');
        const filename = `Sporcle of the Day Selector ${year}-${month}-${day}.png`;

        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    });
});

drawWheelBase();
