const $ = (id) => document.getElementById(id);
const landing = $("landing"), call = $("call"), roomInput = $("room-input");
const localVideo = $("local-video"), remoteVideo = $("remote-video"), waitingState = $("waiting-state");
let socket, peer, localStream, room, initiator = false, audioEnabled = true, videoEnabled = true;
const iceServers = [{ urls: "stun:stun.l.google.com:19302" }];

function toast(message) {
  const element = $("toast"); element.textContent = message; element.classList.add("show");
  setTimeout(() => element.classList.remove("show"), 2600);
}
function makeCode() {
  const words = ["NORTH", "MOSS", "EMBER", "RIVER", "LARK", "CEDAR", "DAWN", "ORBIT"];
  return `${words[Math.floor(Math.random() * words.length)]}${Math.floor(100 + Math.random() * 900)}`;
}
async function enterRoom(code) {
  room = code.trim().toUpperCase();
  if (!/^[A-Z0-9]{6,12}$/.test(room)) return toast("Use a valid room code.");
  $("room-label").textContent = room;
  landing.classList.add("hidden"); call.classList.remove("hidden");
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localVideo.srcObject = localStream;
  } catch {
    toast("Camera or microphone permission is required.");
    return leaveCall();
  }
  socket = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}`);
  socket.onopen = () => socket.send(JSON.stringify({ type: "join", room }));
  socket.onmessage = async ({ data }) => {
    const message = JSON.parse(data);
    if (message.type === "joined") {
      initiator = message.initiator;
      $("connection-label").textContent = initiator ? "Waiting for guest" : "Connecting…";
    } else if (message.type === "ready") {
      if (!peer) createPeer();
      if (initiator) await peer.createOffer().then((offer) => peer.setLocalDescription(offer)).then(() => send("offer", peer.localDescription));
    } else if (message.type === "offer") {
      if (!peer) createPeer();
      await peer.setRemoteDescription(message.data);
      const answer = await peer.createAnswer(); await peer.setLocalDescription(answer); send("answer", peer.localDescription);
    } else if (message.type === "answer") await peer.setRemoteDescription(message.data);
    else if (message.type === "ice" && peer) await peer.addIceCandidate(message.data);
    else if (message.type === "peer-left") { waitingState.classList.remove("hidden"); $("connection-label").textContent = "Waiting for guest"; toast("Your guest left the room."); }
    else if (message.type === "error") toast(message.message);
  };
  socket.onerror = () => toast("Could not connect to the signaling server.");
}
function send(type, data) { if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type, data })); }
function createPeer() {
  peer = new RTCPeerConnection({ iceServers });
  localStream.getTracks().forEach((track) => peer.addTrack(track, localStream));
  peer.ontrack = ({ streams: [stream] }) => { remoteVideo.srcObject = stream; waitingState.classList.add("hidden"); $("connection-label").textContent = "Connected securely"; };
  peer.onicecandidate = ({ candidate }) => candidate && send("ice", candidate);
  peer.onconnectionstatechange = () => { if (peer.connectionState === "connected") $("connection-label").textContent = "Connected securely"; };
}
function leaveCall() {
  peer?.close(); socket?.close(); localStream?.getTracks().forEach((track) => track.stop());
  peer = socket = localStream = null; call.classList.add("hidden"); landing.classList.remove("hidden");
}
$("create-button").onclick = () => { roomInput.value = makeCode(); enterRoom(roomInput.value); };
$("join-button").onclick = () => enterRoom(roomInput.value);
roomInput.onkeydown = (event) => { if (event.key === "Enter") enterRoom(roomInput.value); };
$("copy-button").onclick = async () => { await navigator.clipboard.writeText(`${location.origin}/?room=${room}`); toast("Invite link copied."); };
$("leave-button").onclick = leaveCall;
$("mic-button").onclick = () => { audioEnabled = !audioEnabled; localStream?.getAudioTracks().forEach((track) => track.enabled = audioEnabled); $("mic-button").classList.toggle("active", !audioEnabled); $("mic-button").lastElementChild.textContent = audioEnabled ? "Mute" : "Unmute"; };
$("camera-button").onclick = () => { videoEnabled = !videoEnabled; localStream?.getVideoTracks().forEach((track) => track.enabled = videoEnabled); $("camera-button").classList.toggle("active", !videoEnabled); $("camera-button").lastElementChild.textContent = videoEnabled ? "Camera" : "Show camera"; };
$("share-button").onclick = async () => {
  try {
    const display = await navigator.mediaDevices.getDisplayMedia({ video: true });
    const sender = peer?.getSenders().find((item) => item.track?.kind === "video");
    if (sender) sender.replaceTrack(display.getVideoTracks()[0]);
    localVideo.srcObject = display;
    display.getVideoTracks()[0].onended = () => { const camera = localStream?.getVideoTracks()[0]; if (sender && camera) sender.replaceTrack(camera); localVideo.srcObject = localStream; };
  } catch { toast("Screen sharing was cancelled."); }
};
const params = new URLSearchParams(location.search);
if (params.get("room")) roomInput.value = params.get("room").toUpperCase();
