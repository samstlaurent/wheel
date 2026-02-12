import { initializeApp } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js";
import { getFirestore, collection, doc, setDoc, serverTimestamp, query, orderBy, limit, onSnapshot, getDocs } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";

const firebaseConfig = {
	apiKey: "AIzaSyATilkEHEFHVUzED0ErnUcM4DoqFMxlWnQ",
	authDomain: "wheel-d9e0e.firebaseapp.com",
	projectId: "wheel-d9e0e",
	storageBucket: "wheel-d9e0e.firebasestorage.app",
	messagingSenderId: "66259585614",
	appId: "1:66259585614:web:5f86cb61233129f3a0511f",
	measurementId: "G-N7348SL49Z"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

signInAnonymously(auth).catch(err => console.error("Auth error:", err));

let currentUserId = null;
onAuthStateChanged(auth, (user) => {
	if (user) currentUserId = user.uid;
});

// Local user ID management
let localUserId = localStorage.getItem("localUserId");
let isFirstVisit = false;

if (!localUserId) {
	localUserId = crypto.randomUUID();
	localStorage.setItem("localUserId", localUserId);
	isFirstVisit = true;
}

// Add a spin result to Firestore
async function addSpin(spinResult, activeNames, selectedName) {
	try {
		const now = new Date();
		const docId = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`;

		await setDoc(doc(db, "wheelSpins", docId), {
			winner: spinResult,
			activeNames: activeNames || [],
			userId: localUserId || "unknown",
			userName: selectedName || "unknown",
			timestamp: serverTimestamp()
		});
	} catch (err) {
		console.error("Firebase log error:", err);
	}
}

// Fetch winner frequency statistics from Firestore
async function getWinnerStats(limitCount = 1000) {
	try {
		const spinsRef = collection(db, "wheelSpins");
		const q = query(
			spinsRef,
			orderBy("timestamp", "desc"),
			limit(limitCount)
		);

		const snapshot = await getDocs(q);

		return snapshot;
	} catch (err) {
		console.error("Failed to fetch winner stats:", err);
		return null;
	}
}

// Subscribe to recent spins in real-time
function subscribeToRecentSpins(callback) {
	const spinsRef = collection(db, "wheelSpins");

	const q = query(
		spinsRef,
		orderBy("timestamp", "desc"),
		limit(100)
	);

	return onSnapshot(q, callback);
}

export {
	isFirstVisit,
	addSpin,
	subscribeToRecentSpins,
	getWinnerStats
};