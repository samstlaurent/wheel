import {
	isFirstVisit,
	addSpin,
	subscribeToRecentSpins,
	getWinnerStats
} from './firebase.js';

import {
	initRecorder,
	startRecording,
	stopRecording,
	playSound,
	initWheelTick,
	playTick,
	resumeAudio,
	hasSoundsPlaying
} from './recorder.js';

import { initStatsModule } from './stats.js';
import { initNamesUI } from './namesUI.js';

// Main canvas on which the rotated wheel and animations will be drawn
const mainCanvas = document.getElementById("mainCanvas"), ctx = mainCanvas.getContext("2d");
const canvasCenterX = mainCanvas.width / 2, canvasCenterY = mainCanvas.height / 2;
const wheelRadius = Math.min(canvasCenterX, canvasCenterY) - 50;
const spinButtonRadius = 60;
const TWO_PI = Math.PI * 2;

const today = new Date();
const year = today.getFullYear();
const month = today.getMonth() + 1;
const day = today.getDate();

const isJapaneseMode = (year == 2026) && ((month == 2 && day >= 24) || (month == 3 && day <= 11));

const canonicalNames = ["Aaron D", "Aaron E", "Andrea", "Jasmine", "Jayden", "Jessica", "Josey", "Lauren", "Michelle", "Quintin", "Sam", "Victoria"];

const japaneseNameMap = {
    "Aaron D": "アーロン・ドリミー",
    "Aaron E": "アーロン・エッケル",
    "Andrea": "アンドレア",
    "Jasmine": "ジャスミン",
    "Jayden": "ジェイデン",
    "Jessica": "ジェシカ",
    "Josey": "ジョセイ",
    "Lauren": "ローラン",
    "Michelle": "ミッシェル",
    "Quintin": "クインティン",
    "Sam": "サム",
    "Victoria": "ビクトリア"
};

const displayNames = isJapaneseMode ? canonicalNames.map(n => japaneseNameMap[n]) : [...canonicalNames];

let names = [...displayNames];
let includedNames = [...displayNames];
let shuffledNames = [...includedNames];

let wheelAngle = 0, wheelSpeed = 0, wheelFriction = 0;
let busy = false, lastFrameTime = 0, lastTickTime = 0;
let winningSegment = 0, previousWinningSegment = 0, arrowDeflection = 0;
let segmentAngles = [], segmentBoundaries = [];
let practiceMode = false;

const wheelTick = document.getElementById("wheelTick");
const wheelStopNeutral = document.getElementById("wheelStopNeutral");
const wheelStopParty = document.getElementById("wheelStopParty");
const wheelStopSpectacle = document.getElementById("wheelStopSpectacle");
const buttonPress = document.getElementById("buttonPress");
const practiceModeToggle = document.getElementById("practiceModeToggle");

// Unseen canvas for drawing the wheel (which then gets copied to the main canvas and rotated)
const wheelCanvas = document.createElement("canvas"), wheelCtx = wheelCanvas.getContext("2d");
wheelCanvas.width = mainCanvas.width; wheelCanvas.height = mainCanvas.height;

// Color mode settings
let colorMode = localStorage.getItem("colorMode") || "hue";
let baseHue = Number(localStorage.getItem("baseHue")) || 200;

// Create a color map for the graph to use
let nameColorMap = {};

const wreathImage = new Image();
wreathImage.src = "images/wreath.png";
const wreathSize = spinButtonRadius * 2 + 40;

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

	// Reset color map
	Object.keys(nameColorMap).forEach(key => delete nameColorMap[key]);

    // Draw each segment
    let startAngle = 0;
    shuffledNames.forEach((n, i) => {
        const segArc = segmentAngles[i];

        // Draw segment
        let fillStyle;
		let light;

		if (isJapaneseMode) {
			fillStyle = "#BC002D";
		} else if (colorMode === "hue") {
			const hue = Math.round((360 * i / shuffledNames.length) % 360);
			light = 60;
			fillStyle = `hsl(${hue}, 80%, ${light}%)`;
		} else if (colorMode === "lightness") {
			light = 25 + 75 * (i / shuffledNames.length);
			fillStyle = `hsl(${baseHue}, 80%, ${light}%)`;
		}

		// Store the color for this name
		nameColorMap[n] = fillStyle;

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
        wheelCtx.fillStyle = light < 40 ? "white" : "black";
        wheelCtx.font = "14px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif";
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

	document.getElementById("downloadButton").disabled = true;
	document.getElementById("screenshotButton").disabled = true;
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

			if (!spinLogged) {
				spinLogged = true;
				if (!practiceMode) {
					const displayWinner = shuffledNames[winningSegment];

					const winner = isJapaneseMode
						? canonicalNames.find(n => japaneseNameMap[n] === displayWinner)
						: displayWinner;

					const activeCanonicalNames = isJapaneseMode
						? includedNames.map(d =>
							canonicalNames.find(n => japaneseNameMap[n] === d)
						)
						: [...includedNames];

					const selectedCanonical = isJapaneseMode && selectedName
						? canonicalNames.find(n => japaneseNameMap[n] === selectedName)
						: selectedName;

					addSpin(winner, activeCanonicalNames, selectedCanonical);
					getHistoricalColdStreaks();
				}
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
	if (!isJapaneseMode) {
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
		ctx.font = "14px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif";
		ctx.fillText(shuffledNames[winningSegment], wheelRadius - 10, 0);
		ctx.restore();
	}
	ctx.restore();

	// Draw spin button
	ctx.save();
	ctx.beginPath();
	ctx.arc(canvasCenterX, canvasCenterY, spinButtonRadius, 0, TWO_PI);
	ctx.fillStyle = isJapaneseMode ? "#BC002D" : busy ? "#ccc" : "white";
	ctx.fill();
	ctx.fillStyle = busy ? "white" : "black";
	ctx.font = "14px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif";
    ctx.textAlign = "center";
	ctx.textBaseline = "middle";
	ctx.fillText(busy ? isJapaneseMode ? "紡糸..." : "Spinning..." : isJapaneseMode ? "スピン" : "SPIN", canvasCenterX, canvasCenterY);

	// Draw seasonal wreath
	if (month == 12) {
		ctx.drawImage(wreathImage, canvasCenterX - wreathSize / 2, canvasCenterY - wreathSize / 2, wreathSize, wreathSize);
	}

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

	// Draw practice mode
	if (practiceMode) {
		ctx.save();
		ctx.fillStyle = "rgba(0, 0, 0, 0.65)";
		ctx.fillRect(0, canvasCenterY - 30, mainCanvas.width, 60);
		ctx.fillStyle = "#ffcc00";
		ctx.font = "bold 20px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif";
        ctx.textAlign = "center";
		ctx.textBaseline = "middle";
		ctx.fillText("PRACTICE MODE", canvasCenterX, canvasCenterY);
		ctx.restore();
	};

	if (busy) {
		requestAnimationFrame(drawCanvas);
	} else {
		stopRecording().then(blob => {
			if (blob) {
				const filename = `Sporcle of the Day Selector ${getFormattedDate()}.webm`;
				document.getElementById("downloadButton").onclick = () => {
					downloadFile(blob, filename);
				};
				document.getElementById("downloadButton").disabled = false;
				document.getElementById("screenshotButton").disabled = false;
			}
		});
		updateCursor(lastMouseEvent);
		document.getElementById("instructionsButton").disabled = false;
		document.getElementById("optionsButton").disabled = false;
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
	if (wheelSpeed == 0 && arrowDeflection == 0 && !hasSoundsPlaying() && confetti.length == 0 && balloons.length == 0 && stagelightTime == 0) { busy = false }
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

// Show streak badges on name buttons
const displayToCanonical = {};
canonicalNames.forEach(c => {
    const display = isJapaneseMode ? japaneseNameMap[c] : c;
    displayToCanonical[display] = c;
});

let updateStreakIndicators = function (streaks, winStreaks = {}) {
    let maxColdStreak = 0;
    for (const count of Object.values(streaks)) {
        if (count > maxColdStreak) maxColdStreak = count;
    }

    let hotStreakName = null;
    let hotStreakValue = 0;

    for (const [name, count] of Object.entries(winStreaks)) {
        hotStreakName = name;
        hotStreakValue = count;
    }

    document.querySelectorAll("#nameList .nameWrapper").forEach(wrapper => {
        const badge = wrapper.querySelector(".streakBadge");
        if (!badge) return;

        const displayName = wrapper.dataset.name;
        const canonicalName = displayToCanonical[displayName] || displayName;
        const coldStreak = streaks[canonicalName] || 0;

        if (hotStreakName === canonicalName) {
            badge.textContent = `🔥${hotStreakValue}`;
            badge.style.display = "block";
            badge.style.color = "#ff4500";
        } else if (coldStreak === maxColdStreak && coldStreak > 0) {
            badge.textContent = `❄️${coldStreak}`;
            badge.style.display = "block";
            badge.style.color = "#4BCCFA";
        } else {
            badge.style.display = "none";
        }
    });
};

// Fetch full spin history and collect every cold streak instance per person.
// The podium shows the top 3 instances across all history — the same person
// can appear multiple times if they've had two separate long streaks.
// getWinnerStats returns docs newest-first, so we reverse before walking.
async function getHistoricalColdStreaks() {
    const snapshot = await getWinnerStats(1000);
    if (!snapshot) return;

    const spinDocs = [];
    snapshot.forEach(doc => spinDocs.push(doc.data()));
    spinDocs.reverse(); // oldest → newest

    // Build the universe of names from the spin history itself,
    // not from the current `names` array — so removed names still count.
    const allNamesEverSeen = new Set();
    for (const spin of spinDocs) {
        (spin.activeNames || []).forEach(n => allNamesEverSeen.add(n));
        if (spin.winner) allNamesEverSeen.add(spin.winner);
    }

    const currentStreak = {};
    allNamesEverSeen.forEach(name => { currentStreak[name] = 0; });

    const allInstances = [];

    for (const spin of spinDocs) {
        const active = spin.activeNames || [];
        const winner = spin.winner;

        for (const name of allNamesEverSeen) {
            if (!active.includes(name)) continue;

            if (winner === name) {
                if (currentStreak[name] > 0) {
                    allInstances.push({ name, count: currentStreak[name] });
                }
                currentStreak[name] = 0;
            } else {
                currentStreak[name]++;
            }
        }
    }

    // Flush open streaks
    for (const name of allNamesEverSeen) {
        if (currentStreak[name] > 0) {
            allInstances.push({ name, count: currentStreak[name] });
        }
    }

    allInstances.sort((a, b) => b.count - a.count);
    renderColdStreakPodium(allInstances.slice(0, 3));
}

// Render the top 3 cold streak instances on the podium.
// Accepts a pre-sorted array of up to 3 { name, count } objects.
// Podium slot order in the DOM: rank 2 (left), rank 1 (center), rank 3 (right).
function renderColdStreakPodium(top3) {
    [1, 2, 3].forEach(rank => {
        const column = document.querySelector(`#podiumStage .podiumColumn[data-rank="${rank}"]`);
        if (!column) return;

        const entry = top3[rank - 1];
        const nameEl = column.querySelector(".podiumName");
        const streakEl = column.querySelector(".podiumStreak");

        if (entry) {
            nameEl.textContent = entry.name;
            streakEl.textContent = entry.count;
            column.classList.remove("podiumEmpty");
        } else {
            nameEl.textContent = "—";
            streakEl.textContent = "0";
            column.classList.add("podiumEmpty");
        }
    });
}

// Check if user is hovering over the spin button
let lastMouseEvent = null;
function updateCursor(e) {
	if (e === null) return;
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
		resumeAudio();
		busy = true;
		spinLogged = false;
		updateCursor(e);
		wheelSpeed = Math.random()*4.5 + 0.5;
		wheelFriction = Math.random()*0.02 + 0.97; // prev 0.982 - 0.992 new 0.97 - 0.99
		lastFrameTime = performance.now();
		document.getElementById("downloadButton").disabled = true;
		document.getElementById("screenshotButton").disabled = true;
		document.getElementById("instructionsButton").disabled = true;
		document.getElementById("optionsButton").disabled = true;
		document.querySelectorAll("#nameList .nameItem").forEach(item => item.classList.add("disabled"));
		document.querySelectorAll("#nameList .nameWrapper").forEach(wrapper => { // Disable icon pointers
			const iconContainer = wrapper.querySelector(".iconContainer");
			const icon = wrapper.querySelector(".selectorIcon");
			if (iconContainer) iconContainer.style.cursor = "default";
			if (icon) icon.src = "images/selectorIconDisabled.png";
		});
		startRecording();
		drawCanvas();
	};
});

// Show instructions when button clicked
const instructionsModal = document.getElementById("instructionsModal");
document.getElementById("instructionsButton").addEventListener("click", () => {
	instructionsModal.style.display = "flex";
});
instructionsModal.addEventListener("click", (e) => {
	instructionsModal.style.display = "none";
});

// Auto-open instructions modal on first visit
window.addEventListener("load", () => {
	if (isFirstVisit) { instructionsModal.style.display = "flex" };
});

function formatDateTime(date) {
    const year = date.getFullYear();
    const mo = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');

    return `${year}-${mo}-${d} ${hours}:${minutes}`;
}

function getFormattedDate() {
    const now = new Date();
    const year = now.getFullYear();
    const mo = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${year}-${mo}-${d}`;
}

function downloadFile(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

document.getElementById("screenshotButton").onclick = () => {
	mainCanvas.toBlob(blob => {
		const filename = `Sporcle of the Day Selector ${getFormattedDate()}.png`;
		downloadFile(blob, filename);
	});
};

subscribeToRecentSpins(snapshot => {
    const tbody = document.getElementById("recentSpinsBody");
    tbody.innerHTML = "";

    const headerRow = document.createElement("tr");
    headerRow.classList.add("fake-header");
    headerRow.innerHTML = `
        <td>Name</td>
        <td>Time</td>
    `;
    tbody.appendChild(headerRow);

    // Build spinDocs once and reuse for both the table and streak calculations
    const spinDocs = [];
    snapshot.forEach(doc => {
        const data = doc.data();
        spinDocs.push(data);

        const name = data.winner || "Unknown";
        const ts = data.timestamp?.toDate ? data.timestamp.toDate() : null;
        const timeStr = ts ? formatDateTime(ts) : "--";

        const row = document.createElement("tr");
        const tdName = document.createElement("td");
        const tdTime = document.createElement("td");
        tdName.textContent = name;
        tdTime.textContent = timeStr;
        row.appendChild(tdName);
        row.appendChild(tdTime);
        tbody.appendChild(row);
    });

    const streaks = {};
    const winStreaks = {};

    names.forEach(name => {
        let count = 0;

        for (const spin of spinDocs) {
            const active = spin.activeNames || [];
            const winner = spin.winner;

            if (!active.includes(name)) continue;

            if (winner === name) break;

            count++;
        }

        streaks[name] = count;
    });

    if (spinDocs.length > 0) {
        const lastWinner = spinDocs[0].winner;

        let count = 0;
        for (const spin of spinDocs) {
            if (spin.winner === lastWinner) {
                count++;
            } else {
                break;
            }
        }

        winStreaks[lastWinner] = count;
    }

    updateStreakIndicators(streaks, winStreaks);
    getHistoricalColdStreaks();
});

initRecorder(mainCanvas);

// Initialize wheel tick audio
initWheelTick(wheelTick);

// Initialize stats and graphs
initStatsModule(names, nameColorMap);

// Initialize names UI
let selectedName = null;
initNamesUI({
    names,
    includedNames,
    buttonPressSound: buttonPress,
    onNamesChanged: () => {
        wheelAngle = 0;
        winningSegment = 0;
        drawWheelBase();
    },
    onSelectedNameChanged: (name) => {
        selectedName = name;
        drawWheelBase();
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
    hueSlider.style.display = (colorMode === "lightness") ? "block" : "none";
}

document.getElementById("practiceModeToggle").addEventListener("change", () => {
	practiceMode = practiceModeToggle.checked;
    drawCanvas();
});

updateOptionsUI();

wreathImage.onload = () => drawWheelBase();
