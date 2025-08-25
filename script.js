// Main canvas on which the rotated wheel and animations will be drawn
const mainCanvas = document.getElementById("mainCanvas"), ctx = mainCanvas.getContext("2d");
const canvasCenterX = mainCanvas.width / 2, canvasCenterY = mainCanvas.height / 2;
const wheelRadius = Math.min(canvasCenterX, canvasCenterY) - 50;
const spinButtonRadius = 60;
const TWO_PI = Math.PI * 2;

let names = ["Aaron D", "Aaron E", "Andrea", "Jasmine", "Jayden", "Jonathan", "Josey", "Lauren", "Michelle", "Quintin", "Sam", "Victoria"];
let includedNames = [...names];
let shuffledNames = [...includedNames];

let wheelAngle = 0, wheelSpeed = 0, wheelFriction = 0;
let busy = false, lastFrameTime = 0, lastTickTime = 0;
let winningSegment = 0, previousWinningSegment = 0, arrowDeflection = 0;
let segmentAngles = [];

const wheelTick = document.getElementById("wheelTick");
const wheelStopNeutral = document.getElementById("wheelStopNeutral");
const wheelStopParty = document.getElementById("wheelStopParty");
const wheelStopOminous = document.getElementById("wheelStopOminous");

const selectorDropdown = document.getElementById("selectorDropdown");

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

    let startAngle = 0;

    // Draw each segment
    shuffledNames.forEach((n, i) => {
        const segArc = segmentAngles[i];
        const hue = Math.round((360 * i / shuffledNames.length) % 360);

        // Draw segment
        wheelCtx.fillStyle = `hsl(${hue}, 80%, 60%)`;
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

    drawCanvas();
}

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
		let angle = relativeAngle;
        for (let i = 0; i < segmentAngles.length; i++) {
            if (angle <= segmentAngles[i]) {
                winningSegment = i;
                break;
            }
            angle -= segmentAngles[i];
        }
		if (wheelSpeed < 0.001) {
			wheelSpeed = 0;
			const randomNumber = Math.random();
			if (randomNumber < 0.8) wheelStopEffectNeutral();
            else if (randomNumber < 0.95) wheelStopEffectParty();
            else wheelStopEffectOminous();
		}
		
		// Check if the arrow has crossed a segment boundary
		if (winningSegment != previousWinningSegment) {
			arrowDeflection = Math.max(-1.2, -2.5*wheelSpeed - 0.7);
			if (now - lastTickTime >= 80) {
				const wheelTickClone = wheelTick.cloneNode();
				setTimeout(() => playSound(wheelTickClone, Math.min(1, 1.5*wheelSpeed + 0.7)), 50);
				wheelTickClone.addEventListener("ended", () => wheelTickClone.remove());
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
	
	// Compute changes to smoke
	if (smokeSpawnTime > 0) {
		const spawnCount = Math.floor(Math.random() * 1) + 1;
		for (let i = 0; i < spawnCount; i++) {
			const side = Math.random() < 0.5 ? 0 : 1; // 0 = left, 1 = right
			smoke.push({
                x: Math.random() * mainCanvas.width,
                y: Math.random() * mainCanvas.height,
                dx: (Math.random() - 0.5) * 0.2,
                dy: (Math.random() - 0.5) * 0.2,
                size: 40 + Math.random() * 60,
                alpha: 0,
                maxAlpha: 0.08 + Math.random() * 0.04,
                fadeInDuration: 1000 + Math.random() * 1000,
                fadeOutDuration: 1000 + Math.random() * 2000,
                lifetime: 0,
                age: 0,
                puffs: 3 + Math.floor(Math.random() * 3) // 3-5 puffs per particle
            });
            smoke[smoke.length - 1].lifetime = smoke[smoke.length - 1].fadeInDuration + smoke[smoke.length - 1].fadeOutDuration;
		}
		smokeSpawnTime = Math.max(0, smokeSpawnTime - delta);
	}
	if (smoke.length > 0) {
        smoke.forEach(p => {
            p.age += delta;
            p.x += p.dx * frameMultiplier;
            p.y += p.dy * frameMultiplier;
            p.dx += (Math.random() - 0.5) * 0.05 * frameMultiplier;
            p.dy += (Math.random() - 0.5) * 0.05 * frameMultiplier;
            if (p.age < p.fadeInDuration) {
                p.alpha = (p.age / p.fadeInDuration) * p.maxAlpha;
            } else if (p.age < p.lifetime) {
                const fadeOutProgress = (p.age - p.fadeInDuration) / p.fadeOutDuration;
                p.alpha = p.maxAlpha * (1 - fadeOutProgress);
            }
            p.size += 0.3 * frameMultiplier;
        });
        smoke = smoke.filter(p => p.age < p.lifetime);
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
	
	// Draw spotlights
	if (confetti.length > 0) {
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
	}
	
	// Draw confetti
	confetti.forEach(piece => {
		ctx.save();
		ctx.translate(piece.x, piece.y);
		ctx.rotate(piece.rotation * Math.PI / 180);
		ctx.fillStyle = piece.color;
		ctx.fillRect(-piece.size/2, -piece.size/2, piece.size, piece.size);
		ctx.restore();
	});
	
	// Draw smoke
	smoke.forEach(p => {
        for (let i = 0; i < p.puffs; i++) {
            const puffOffset = (i / p.puffs) * 30;
            const puffSize = p.size * (1 - i * 0.1);
            const puffAlpha = p.alpha * (1 - i * 0.2);
            const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, puffSize);
            gradient.addColorStop(0, `rgba(70, 70, 70, ${puffAlpha})`);
            gradient.addColorStop(0.7, `rgba(50, 50, 50, ${puffAlpha * 0.7})`);
            gradient.addColorStop(1, 'rgba(30, 30, 30, 0)');
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(p.x, p.y, puffSize, 0, TWO_PI);
            ctx.fill();
        }
    });

	if (busy) {
		requestAnimationFrame(drawCanvas);
	} else {
		mediaRecorder.stop();
		updateCursor(lastMouseEvent);
		document.querySelectorAll("#nameList .nameItem").forEach(item => item.classList.remove("disabled"));
		document.querySelectorAll("#nameList .nameWrapper").forEach(wrapper => { // Disable icon pointers
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
	if (wheelSpeed == 0 && arrowDeflection == 0 && activeSounds.size === 0 && confetti.length == 0 && smoke.length == 0) { busy = false }
}

function wheelStopEffectNeutral() {
	playSound(wheelStopNeutral);
}

const confettiColors = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#f9ca24', '#6c5ce7', '#a0e7e5', '#ffeaa7', '#fd79a8', '#00b894', '#e17055', '#74b9ff', '#55a3ff', '#fd9644', '#d63031', '#00cec9'];
let confetti = [], confettiSpawnTime = 0;
function wheelStopEffectParty() {
	playSound(wheelStopParty, 0.4);
	confettiSpawnTime = 2000;
}

let smoke = [], smokeSpawnTime = 0;
function wheelStopEffectOminous() {
	playSound(wheelStopOminous, 1);
	smokeSpawnTime = 5000;
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

// Add controls for each name
let selectedIcon = null, selectedName = null;
document.getElementById("nameList").innerHTML = ""; // Clear existing items
[...names].sort((a, b) => a.localeCompare(b)).forEach((n, index) => {

	// The icon itself
	const icon = document.createElement("img");
	icon.src = "images/selectorIconDisabled.png";
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
			if (selectedIcon) selectedIcon.src = "images/selectorIconDisabled.png";
			icon.src = "images/selectorIconEnabled.png";
			selectedIcon = icon;
			selectedName = n;
			drawWheelBase();
		}
	};

	// The button itself
	const item = document.createElement("span");
	item.className = "nameItem";
	item.textContent = n;
	item.onclick = () => {
		if (!busy) {
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
	
	if (index === 0) {
        icon.src = "images/selectorIconEnabled.png";
        selectedIcon = icon;
        selectedName = n;
    }
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
		updateCursor(e);
		wheelSpeed = Math.random()*0.8 + 0.4;
		wheelFriction = Math.random()*0.01 + 0.982;
		lastFrameTime = performance.now();
		document.getElementById("downloadButton").disabled = true;
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

// Setup recording
const videoStream = mainCanvas.captureStream(60);
const audioStream = audioDestination.stream;
const combinedStream = new MediaStream([...videoStream.getTracks(), ...audioStream.getTracks()]);
mediaRecorder = new MediaRecorder(combinedStream, {mimeType: 'video/webm;codecs=vp9,opus'});
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
};

drawWheelBase();
